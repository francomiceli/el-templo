import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import {
  breakdownKeyExpr,
  breakdownSegmentKey,
  durationTierFromDays,
  emptyCurrencyEntry,
  type BreakdownAxis,
  type CurrencyMap,
} from "../../src/modules/analytics/breakdowns";
import {
  rangeConditions,
  bucketExpr,
} from "../../src/modules/analytics/cohorts";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";

/**
 * Phase 120 Plan 03 — breakdowns + cohorts primitives (FUND-03 / FUND-04 / FUND-05).
 *
 * Real-MySQL integration. These are query primitives, so they are exercised
 * through small inline test queries against subscription_plans / subscriptions /
 * financial_transactions. Covers:
 *   1. duration axis buckets 30d → monthly and 120d → long_term via the breakdowns
 *      mapping (delegating to deriveDurationTier).
 *   2. the plan axis yields TWO distinct (name, country) segments for two "Flex"
 *      plans in AR and ES (never summed into one).
 *   3. the CurrencyMap keeps ARS and EUR as independent totals (never summed).
 *   4. rangeConditions is half-open: a row whose date == `to` is EXCLUDED and a
 *      row whose date == `from` is INCLUDED.
 *   5. weekly vs monthly bucketExpr produce distinct keys.
 *
 * Do NOT run this suite locally (tests hit real MySQL — CI runs it on staging push).
 */
describe("breakdowns + cohorts primitives (Phase 120 Plan 03)", () => {
  let app: FastifyInstance;
  let branchA: number; // 'TEST' (AR)
  let branchES: number; // 'TESTES' (ES)
  let recorderId: number;

  beforeAll(async () => {
    app = await createTestApp();

    const [a] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TEST"));
    branchA = a.id;

    await app.db
      .insert(branches)
      .values({ name: "Sede ES Test", code: "TESTES", country: "ES" })
      .onDuplicateKeyUpdate({ set: { name: "Sede ES Test" } });
    const [es] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TESTES"));
    branchES = es.id;

    const [admin] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@test.com"));
    recorderId = admin.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  async function insertPlan(opts: {
    name: string;
    country: "AR" | "ES";
    durationDays: number;
  }): Promise<number> {
    const [p] = await app.db.insert(subscriptionPlans).values({
      name: opts.name,
      country: opts.country,
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: opts.durationDays,
      classesPerWeek: 3,
    });
    return (p as { insertId: number }).insertId;
  }

  async function insertMember(
    email: string,
    branchId: number,
  ): Promise<number> {
    const [u] = await app.db.insert(users).values({
      email,
      password: "x",
      firstName: "BC",
      lastName: "Tester",
      branchId,
      role: "member",
    });
    return (u as { insertId: number }).insertId;
  }

  async function insertTx(opts: {
    memberId: number;
    amount: number;
    currency: "ARS" | "EUR";
    date: string;
    branchId: number;
  }): Promise<void> {
    await app.db.insert(financialTransactions).values({
      memberId: opts.memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount: opts.amount,
      currency: opts.currency,
      paymentMethod: "cash",
      transactionDate: opts.date,
      effectiveDate: opts.date,
      branchId: opts.branchId,
      recordedBy: recorderId,
    });
  }

  it("buckets durationDays 30 → monthly and 120 → long_term via the breakdowns mapping", async () => {
    await insertPlan({ name: "Monthly", country: "AR", durationDays: 30 });
    await insertPlan({ name: "LongTerm", country: "AR", durationDays: 120 });

    const rows = await app.db
      .select({
        name: subscriptionPlans.name,
        durationDays: subscriptionPlans.durationDays,
      })
      .from(subscriptionPlans);

    const tiers = new Map<string, string | null>();
    for (const r of rows) {
      tiers.set(r.name, durationTierFromDays(r.durationDays));
    }

    expect(tiers.get("Monthly")).toBe("monthly");
    expect(tiers.get("LongTerm")).toBe("long_term");
  });

  it("plan axis yields TWO distinct (name, country) segments for Flex AR and Flex ES", async () => {
    await insertPlan({ name: "Flex", country: "AR", durationDays: 30 });
    await insertPlan({ name: "Flex", country: "ES", durationDays: 30 });

    // The grouping key SQL is composite (name, country) — group through MySQL.
    const groupKeys: SQL[] = breakdownKeyExpr("plan", {
      planName: subscriptionPlans.name,
      country: subscriptionPlans.country,
    });
    expect(groupKeys).toHaveLength(2);

    const rows = await app.db
      .select({
        name: subscriptionPlans.name,
        country: subscriptionPlans.country,
        count: sql<number>`COUNT(*)`,
      })
      .from(subscriptionPlans)
      .groupBy(...groupKeys);

    // Build the per-segment keys the way a real block would.
    const segments = new Set<string>();
    for (const r of rows) {
      segments.add(
        breakdownSegmentKey("plan", { planName: r.name, country: r.country }),
      );
    }

    // Two "Flex" plans → two distinct segments, never collapsed into one.
    const flexSegments = [...segments].filter((s) => s.startsWith("Flex"));
    expect(flexSegments).toHaveLength(2);
    expect(new Set(flexSegments).size).toBe(2);
  });

  it("CurrencyMap keeps ARS and EUR as independent totals (never summed)", async () => {
    const planAr = await insertPlan({
      name: "CurAR",
      country: "AR",
      durationDays: 30,
    });
    const planEs = await insertPlan({
      name: "CurES",
      country: "ES",
      durationDays: 30,
    });
    void planAr;
    void planEs;

    const memberAr = await insertMember("bc-ar@test.com", branchA);
    const memberEs = await insertMember("bc-es@test.com", branchES);

    await insertTx({
      memberId: memberAr,
      amount: 15000,
      currency: "ARS",
      date: "2026-06-10",
      branchId: branchA,
    });
    await insertTx({
      memberId: memberEs,
      amount: 200,
      currency: "EUR",
      date: "2026-06-10",
      branchId: branchES,
    });

    // Aggregate by (country, currency) the way the breakdowns engine prescribes.
    const rows = await app.db
      .select({
        country: branches.country,
        currency: financialTransactions.currency,
        total: sql<number>`COALESCE(SUM(${financialTransactions.amount}), 0)`,
      })
      .from(financialTransactions)
      .innerJoin(branches, eq(branches.id, financialTransactions.branchId))
      .groupBy(branches.country, financialTransactions.currency);

    const map: CurrencyMap = new Map();
    for (const r of rows) {
      const axis: BreakdownAxis = "country";
      const key = breakdownSegmentKey(axis, { country: r.country });
      const entry = map.get(key) ?? emptyCurrencyEntry();
      if (r.currency === "ARS" || r.currency === "EUR") {
        entry[r.currency] = Number(r.total);
      }
      map.set(key, entry);
    }

    const ar = map.get("AR") ?? emptyCurrencyEntry();
    const es = map.get("ES") ?? emptyCurrencyEntry();

    // ARS lives only on the AR segment, EUR only on ES — never summed together.
    expect(ar.ARS).toBe(15000);
    expect(ar.EUR).toBe(0);
    expect(es.EUR).toBe(200);
    expect(es.ARS).toBe(0);
  });

  it("rangeConditions is half-open: row on `to` EXCLUDED, row on `from` INCLUDED", async () => {
    const member = await insertMember("bc-range@test.com", branchA);

    const from = "2026-06-01";
    const to = "2026-06-30";

    // Row exactly on `from` (must be INCLUDED), row exactly on `to` (must be EXCLUDED).
    await insertTx({
      memberId: member,
      amount: 100,
      currency: "ARS",
      date: from,
      branchId: branchA,
    });
    await insertTx({
      memberId: member,
      amount: 200,
      currency: "ARS",
      date: to,
      branchId: branchA,
    });

    const conditions = rangeConditions(
      financialTransactions.transactionDate,
      from,
      to,
    );
    expect(conditions).toHaveLength(2);

    const rows = await app.db
      .select({ date: financialTransactions.transactionDate })
      .from(financialTransactions)
      .where(and(...conditions));

    const matchedDates = rows.map((r) => String(r.date));
    expect(matchedDates).toContain(from); // lower bound inclusive
    expect(matchedDates).not.toContain(to); // upper bound EXCLUSIVE (half-open)
    expect(matchedDates).toHaveLength(1);
  });

  it("weekly vs monthly bucketExpr produce distinct keys", async () => {
    const member = await insertMember("bc-bucket@test.com", branchA);
    await insertTx({
      memberId: member,
      amount: 100,
      currency: "ARS",
      date: "2026-06-10",
      branchId: branchA,
    });

    const [monthly] = await app.db
      .select({
        key: bucketExpr(financialTransactions.transactionDate, "monthly"),
      })
      .from(financialTransactions);
    const [weekly] = await app.db
      .select({
        key: bucketExpr(financialTransactions.transactionDate, "weekly"),
      })
      .from(financialTransactions);

    expect(monthly.key).toBe("2026-06");
    expect(weekly.key).toMatch(/^2026-W\d{2}$/);
    expect(weekly.key).not.toBe(monthly.key);
  });
});
