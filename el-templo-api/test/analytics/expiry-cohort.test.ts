import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import {
  expiryCohortConditions,
  lastExpiryPerPersonExpr,
  retainedExpr,
  maturedExpr,
  RENOVATION_WINDOW_DEFAULT_DAYS,
  CHURN_COMPARISON_WINDOWS,
} from "../../src/modules/analytics/expiry-cohort";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";

/**
 * Phase 121 Plan 01 — expiry-cohort engine primitives (CHURN-01/04, RENOV-01).
 *
 * Real-MySQL integration. These are pure SQL-fragment builders, so they are
 * exercised through small inline test queries against subscriptions /
 * subscription_plans. Covers:
 *   1. Cohort membership half-open boundary: endDate inside [from,to) is counted;
 *      endDate exactly on `to` is EXCLUDED (D-01).
 *   2. D-03: a status='paused' sub whose endDate is in range is excluded; the same
 *      person's non-paused expired sub in range is included.
 *   3. D-04: a person with two in-range expiries collapses to ONE row via
 *      lastExpiryPerPersonExpr, and it is the LATER endDate.
 *   4. D-05/D-06: retainedExpr TRUE for a later sub (different plan / different
 *      duration) starting by endDate+window, TRUE for an early renewal, FALSE when
 *      the only later sub starts after the window.
 *   5. D-08: maturedExpr TRUE for an expiry windowDays+ days before today, FALSE for
 *      one inside the grace window.
 *
 * TZ note (MEMORY analytics seed flake): all endDate/startDate seeds are derived in
 * SQL from CURDATE() so the test stays aligned with maturedExpr's CURDATE() and does
 * NOT drift after ~21:00 AR time (UTC-vs-local skew).
 *
 * Do NOT run this suite locally (tests hit real MySQL — CI runs it on staging push).
 */
describe("expiry-cohort engine primitives (Phase 121 Plan 01)", () => {
  let app: FastifyInstance;
  let branchA: number;
  let monthlyPlanId: number;
  let longTermPlanId: number;

  beforeAll(async () => {
    app = await createTestApp();

    const [a] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, "TEST"));
    branchA = a.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    monthlyPlanId = await insertPlan("EC Monthly", 30);
    longTermPlanId = await insertPlan("EC LongTerm", 120);
  });

  async function insertPlan(
    name: string,
    durationDays: number,
  ): Promise<number> {
    const [p] = await app.db.insert(subscriptionPlans).values({
      name,
      country: "AR",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays,
      classesPerWeek: 3,
    });
    return (p as { insertId: number }).insertId;
  }

  async function insertMember(email: string): Promise<number> {
    const [u] = await app.db.insert(users).values({
      email,
      passwordHash: "x",
      firstName: "EC",
      lastName: "Tester",
      branchId: branchA,
      role: "member",
    });
    return (u as { insertId: number }).insertId;
  }

  /**
   * Insert a subscription. `startDate` / `endDate` are passed as literal
   * `YYYY-MM-DD` strings; callers compute them from a fixed reference window (for
   * cohort-boundary cases) or from `daysFromToday` helpers (for maturity cases).
   */
  async function insertSub(opts: {
    userId: number;
    planId?: number;
    status?:
      | "active"
      | "paused"
      | "cancelled"
      | "expired"
      | "completed"
      | "changed"
      | "scheduled";
    startDate: string;
    endDate: string;
  }): Promise<number> {
    const [s] = await app.db.insert(subscriptions).values({
      userId: opts.userId,
      planId: opts.planId ?? monthlyPlanId,
      branchId: branchA,
      status: opts.status ?? "expired",
      startDate: opts.startDate,
      endDate: opts.endDate,
      pricePaid: 15000,
      currency: "ARS",
      priceTypeApplied: "regular",
    });
    return (s as { insertId: number }).insertId;
  }

  /** Resolve `DATE_ADD/SUB(CURDATE(), INTERVAL n DAY)` to a literal YYYY-MM-DD. */
  async function dateOffset(days: number): Promise<string> {
    const interval = sql.raw(String(Math.abs(days)));
    const dateExpr =
      days >= 0
        ? sql`DATE_ADD(CURDATE(), INTERVAL ${interval} DAY)`
        : sql`DATE_SUB(CURDATE(), INTERVAL ${interval} DAY)`;
    const result = await app.db.execute(
      sql`SELECT DATE_FORMAT(${dateExpr}, '%Y-%m-%d') AS d`,
    );
    // mysql2 .execute returns [rows, fields]; the first row carries column `d`.
    const rows = (Array.isArray(result) ? result[0] : result) as Array<{
      d: string;
    }>;
    return String(rows[0].d);
  }

  it("exports the window constants (D-07)", () => {
    expect(RENOVATION_WINDOW_DEFAULT_DAYS).toBe(15);
    expect(CHURN_COMPARISON_WINDOWS).toEqual([5, 10, 15]);
  });

  it("cohort is half-open: endDate inside [from,to) counted, endDate on `to` EXCLUDED (D-01)", async () => {
    const inRange = await insertMember("ec-inrange@test.com");
    const onTo = await insertMember("ec-onto@test.com");

    const from = "2026-06-01";
    const to = "2026-06-30";

    await insertSub({
      userId: inRange,
      startDate: "2026-05-01",
      endDate: "2026-06-15",
    });
    await insertSub({ userId: onTo, startDate: "2026-05-01", endDate: to }); // exactly on `to`

    const rows = await app.db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(and(...expiryCohortConditions(from, to)));

    const ids = rows.map((r) => r.userId);
    expect(ids).toContain(inRange);
    expect(ids).not.toContain(onTo);
    expect(ids).toHaveLength(1);
  });

  it("excludes a paused sub in range but includes the same person's non-paused expired sub (D-03)", async () => {
    const pausedOnly = await insertMember("ec-paused@test.com");
    const both = await insertMember("ec-both@test.com");

    const from = "2026-06-01";
    const to = "2026-06-30";

    // A person whose ONLY in-range sub is paused → excluded.
    await insertSub({
      userId: pausedOnly,
      status: "paused",
      startDate: "2026-05-01",
      endDate: "2026-06-10",
    });
    // A person with a paused in-range sub AND a non-paused expired in-range sub → included.
    await insertSub({
      userId: both,
      status: "paused",
      startDate: "2026-05-01",
      endDate: "2026-06-12",
    });
    await insertSub({
      userId: both,
      status: "expired",
      startDate: "2026-05-01",
      endDate: "2026-06-18",
    });

    const rows = await app.db
      .select({ userId: subscriptions.userId })
      .from(subscriptions)
      .where(and(...expiryCohortConditions(from, to)));

    const ids = rows.map((r) => r.userId);
    expect(ids).not.toContain(pausedOnly);
    expect(ids).toContain(both);
    // Only the non-paused row of `both` survives.
    expect(ids).toHaveLength(1);
  });

  it("collapses a person with two in-range expiries to ONE row at the LATER endDate (D-04)", async () => {
    const member = await insertMember("ec-multi@test.com");
    const from = "2026-06-01";
    const to = "2026-07-01";

    const earlier = await insertSub({
      userId: member,
      startDate: "2026-05-01",
      endDate: "2026-06-10",
    });
    const later = await insertSub({
      userId: member,
      startDate: "2026-06-10",
      endDate: "2026-06-25",
    });

    const rows = await app.db
      .select({ id: subscriptions.id, endDate: subscriptions.endDate })
      .from(subscriptions)
      .where(
        and(
          ...expiryCohortConditions(from, to),
          lastExpiryPerPersonExpr(from, to),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(later);
    expect(rows[0].id).not.toBe(earlier);
    expect(String(rows[0].endDate)).toBe("2026-06-25");
  });

  it("retainedExpr: TRUE for later sub (plan change) by endDate+window, TRUE for early renewal, FALSE past window (D-05/D-06)", async () => {
    const window = RENOVATION_WINDOW_DEFAULT_DAYS;

    // Person A: expired, renewed with a DIFFERENT plan + duration within the window.
    const retainedPlanChange = await insertMember("ec-ret-plan@test.com");
    const aExpired = await insertSub({
      userId: retainedPlanChange,
      planId: monthlyPlanId,
      startDate: "2026-05-01",
      endDate: "2026-06-01",
    });
    await insertSub({
      userId: retainedPlanChange,
      planId: longTermPlanId, // plan + duration change still counts
      status: "active",
      startDate: "2026-06-10", // within E+15
      endDate: "2026-10-08",
    });

    // Person B: early renewal — next sub starts well BEFORE expiry (no floor).
    const earlyRenewal = await insertMember("ec-ret-early@test.com");
    const bExpired = await insertSub({
      userId: earlyRenewal,
      startDate: "2026-05-01",
      endDate: "2026-06-01",
    });
    await insertSub({
      userId: earlyRenewal,
      status: "active",
      startDate: "2026-05-20", // starts before E — early renewal, counts
      endDate: "2026-06-20",
    });

    // Person C: churned — only later sub starts AFTER the window.
    const churned = await insertMember("ec-churned@test.com");
    const cExpired = await insertSub({
      userId: churned,
      startDate: "2026-05-01",
      endDate: "2026-06-01",
    });
    await insertSub({
      userId: churned,
      status: "active",
      startDate: "2026-06-20", // E+19 > window → past the window
      endDate: "2026-07-20",
    });

    const rows = await app.db
      .select({
        id: subscriptions.id,
        retained: sql<number>`CASE WHEN ${retainedExpr(window)} THEN 1 ELSE 0 END`,
      })
      .from(subscriptions)
      .where(
        sql`${subscriptions.id} IN (${aExpired}, ${bExpired}, ${cExpired})`,
      );

    const byId = new Map(rows.map((r) => [r.id, Number(r.retained)]));
    expect(byId.get(aExpired)).toBe(1); // plan + duration change within window
    expect(byId.get(bExpired)).toBe(1); // early renewal, no floor
    expect(byId.get(cExpired)).toBe(0); // later sub past the window → churned
  });

  it("maturedExpr: TRUE when endDate >= window days ago, FALSE inside the grace window (D-08)", async () => {
    const window = RENOVATION_WINDOW_DEFAULT_DAYS;
    const member = await insertMember("ec-mature@test.com");

    // Matured: expired window+5 days ago.
    const maturedEnd = await dateOffset(-(window + 5));
    const maturedStart = await dateOffset(-(window + 35));
    const maturedSub = await insertSub({
      userId: member,
      startDate: maturedStart,
      endDate: maturedEnd,
    });

    // In grace: expired only window-5 days ago (not yet matured).
    const graceEnd = await dateOffset(-(window - 5));
    const graceStart = await dateOffset(-(window + 25));
    const graceSub = await insertSub({
      userId: member,
      startDate: graceStart,
      endDate: graceEnd,
    });

    const rows = await app.db
      .select({
        id: subscriptions.id,
        matured: sql<number>`CASE WHEN ${maturedExpr(window)} THEN 1 ELSE 0 END`,
      })
      .from(subscriptions)
      .where(sql`${subscriptions.id} IN (${maturedSub}, ${graceSub})`);

    const byId = new Map(rows.map((r) => [r.id, Number(r.matured)]));
    expect(byId.get(maturedSub)).toBe(1); // window+5 days old → matured
    expect(byId.get(graceSub)).toBe(0); // window-5 days old → still in grace
  });
});
