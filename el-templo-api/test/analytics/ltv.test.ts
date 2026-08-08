import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  createStaffUser,
  cleanAllTestData,
} from "../helpers";
import { LtvService } from "../../src/modules/analytics/ltv-service";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { ChurnService } from "../../src/modules/analytics/churn-service";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";
import { financialTransactions } from "../../src/db/schema/financial-transactions";

/**
 * El gimnasio de los fixtures (El Templo = tenant 1). Fase 172: el service
 * recibe el `TenantContext` como PRIMER argumento; en producción sale de
 * `assertTenant(request.scope, …)`, acá se construye a mano porque el service se
 * invoca sin request.
 */
const CTX: TenantContext = { tenantId: 1 };

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Phase 122 Plan 03 — LtvService (Block 5, LTV-01..05).
 *
 * Real-MySQL integration. LTV is CHAINED onto the SAME matured expiry cohort as churn
 * (`expiry-cohort.ts`) and the same real-payment universe as advanced finance
 * (`financial_transactions`, canonical revenue filter), so the headline reconciles
 * with churn by construction. Covers:
 *   - LTV-01 / D-122-03: the `1 ÷ churn_mensual` headline derives from
 *     `ChurnService.getChurn().window.churn.percentage` for IDENTICAL filters — both
 *     services instantiated and the cross-metric consistency asserted.
 *   - LTV-02 / D-122-05: Kaplan-Meier censored-not-dropped — a cohort mixing closed
 *     (matured && !retained) and censored (still-active / renewed) lives keeps the
 *     censored persons in the cohort `n` (they are NOT discarded).
 *   - LTV-04 / D-122-07/08: observed monetary LTV equals the EXACT sum of the closed
 *     customer's REAL payments (seeded BELOW the plan's list price) — list price is
 *     NEVER used.
 *   - LTV-05 / D-122-09: ARS and EUR are reported separately and NEVER summed
 *     (per-currency isolation, seeding AR + ES).
 *   - LTV-05: branch / country / plan breakdown rows carry the per-segment envelope.
 *   - Auth: a gestión token gets 403 from GET /ltv; admin gets 200 with the
 *     LtvAnalytics wire shape (T-122-07).
 *
 * TZ note (MEMORY analytics seed flake): EVERY endDate/startDate/transactionDate is
 * derived in SQL from CURDATE() via `dateOffset(days)` so maturity assertions stay
 * aligned with `maturedExpr`'s CURDATE() and do NOT drift after ~21:00 AR time
 * (UTC-vs-local skew). There is NO JS-clock seeding in this file — every seed date is
 * CURDATE-derived in SQL.
 *
 * Do NOT run this suite locally (tests hit real MySQL — CI runs it on staging push).
 */
describe("LtvService (Phase 122 Plan 03)", () => {
  let app: FastifyInstance;
  let ltvSvc: LtvService;
  let churnSvc: ChurnService;
  let branchA: number; // 'TEST' (AR)
  let branchES: number; // 'TESTES' (ES)
  let recorderId: number; // admin@test.com — financial_transactions.recordedBy
  let monthlyArId: number; // AR, 30d, list price 15000
  let monthlyEsId: number; // ES, 30d, list price 15000 EUR

  beforeAll(async () => {
    app = await createTestApp();
    ltvSvc = new LtvService(app.db, app.log);
    churnSvc = new ChurnService(app.db, app.log);

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
      .where(and(tenantWhere(users, CTX), eq(users.email, "admin@test.com")));
    recorderId = admin.id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // List price 15000 — the monetary tests seed real payments BELOW this to prove
    // observed LTV sources from real payments, never the list price (D-122-08).
    monthlyArId = await insertPlan("LTV AR Mensual", "AR", 30);
    monthlyEsId = await insertPlan("LTV ES Mensual", "ES", 30);
  });

  async function insertPlan(
    name: string,
    country: "AR" | "ES",
    durationDays: number,
  ): Promise<number> {
    const [p] = await app.db.insert(subscriptionPlans).values({
      name,
      country,
      currency: country === "ES" ? "EUR" : "ARS",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays,
      classesPerWeek: 3,
    });
    return (p as { insertId: number }).insertId;
  }

  let __memberSeq = 0;
  async function insertMember(branchId = branchA): Promise<number> {
    __memberSeq += 1;
    const [u] = await app.db.insert(users).values({
      email: `ltv-m${__memberSeq}-${Date.now()}@test.com`,
      passwordHash: "x",
      firstName: "Lt",
      lastName: "V",
      branchId,
      role: "member",
    });
    return (u as { insertId: number }).insertId;
  }

  async function insertSub(opts: {
    userId: number;
    planId?: number;
    branchId?: number;
    status?:
      | "active"
      | "paused"
      | "cancelled"
      | "expired"
      | "completed"
      | "changed"
      | "scheduled";
    currency?: string;
    startDate: string;
    endDate: string;
  }): Promise<number> {
    const [s] = await app.db.insert(subscriptions).values({
      userId: opts.userId,
      planId: opts.planId ?? monthlyArId,
      branchId: opts.branchId ?? branchA,
      status: opts.status ?? "expired",
      startDate: opts.startDate,
      endDate: opts.endDate,
      pricePaid: 15000,
      currency: opts.currency ?? "ARS",
      priceTypeApplied: "regular",
    });
    return (s as { insertId: number }).insertId;
  }

  /**
   * Seed a real payment (financial_transactions) with ALL notNull columns. `amount` is
   * seeded BELOW the plan list price (15000) by callers to prove the real amount — not
   * the list price — drives observed LTV (D-122-08).
   */
  async function insertPayment(opts: {
    memberId: number;
    amount: number;
    currency?: string;
    date: string;
    branchId?: number;
  }): Promise<void> {
    await app.db.insert(financialTransactions).values(
      tenantValues(CTX, {
        memberId: opts.memberId,
        kind: "plan_charge",
        direction: "inflow",
        amount: opts.amount,
        currency: opts.currency ?? "ARS",
        paymentMethod: "cash",
        transactionDate: opts.date,
        effectiveDate: opts.date,
        branchId: opts.branchId ?? branchA,
        recordedBy: recorderId,
        voidedAt: null,
      }),
    );
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
    const rows = (Array.isArray(result) ? result[0] : result) as Array<{
      d: string;
    }>;
    return String(rows[0].d);
  }

  /**
   * Server-clock timestamp (MySQL NOW()) as a Date — for the `voidedAt` marker only.
   * Sourced from the DB (not the JS clock) so the file stays TZ-flake-free: this value
   * never drives a maturity/duration assertion (the canonical filter only checks
   * `voidedAt IS NULL`), but reading it from the server keeps a single time source.
   */
  async function serverNow(): Promise<Date> {
    const result = await app.db.execute(
      sql`SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS t`,
    );
    const rows = (Array.isArray(result) ? result[0] : result) as Array<{
      t: string;
    }>;
    return new Date(`${String(rows[0].t).replace(" ", "T")}Z`);
  }

  /** A wide range that brackets every seeded expiry (90 days ago → tomorrow). */
  async function wideRange(): Promise<{ dateFrom: string; dateTo: string }> {
    return {
      dateFrom: await dateOffset(-90),
      dateTo: await dateOffset(1), // exclusive upper — tomorrow keeps today in range
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LTV-01 — headline = 1 ÷ churn, consistent with ChurnService
  // ═══════════════════════════════════════════════════════════════════════

  it("derives the headline from ChurnService churn % for identical filters (LTV-01/D-122-03)", async () => {
    // 2 churners + 2 censored (renewed) → churn 50% → headline 1 ÷ 0.5 = 2 months.
    for (let i = 0; i < 2; i++) {
      const churner = await insertMember();
      await insertSub({
        userId: churner,
        startDate: await dateOffset(-70),
        endDate: await dateOffset(-40),
      });
    }
    for (let i = 0; i < 2; i++) {
      const renovador = await insertMember();
      await insertSub({
        userId: renovador,
        startDate: await dateOffset(-70),
        endDate: await dateOffset(-40),
      });
      await insertSub({
        userId: renovador,
        status: "active",
        startDate: await dateOffset(-30), // <= -40 + 15 → renovó (censored)
        endDate: await dateOffset(60),
      });
    }

    const filters = await wideRange();
    const ltv = await ltvSvc.getLtv(CTX, filters);
    const churn = await churnSvc.getChurn(filters);

    // The headline is exactly 1 ÷ (churn% / 100) for the SAME filters (D-122-03).
    const pct = churn.window.churn.percentage;
    expect(pct).toBe(50);
    const expectedHeadline = Math.round((1 / (pct / 100)) * 10) / 10;
    expect(ltv.lifetimeHeadlineMonths).toBe(expectedHeadline);
    expect(ltv.lifetimeHeadlineMonths).toBe(2);
  });

  it("returns a null headline when churn is 0 (never NaN/∞, LTV-01)", async () => {
    // Only renovadores → churn 0% → headline null.
    const renovador = await insertMember();
    await insertSub({
      userId: renovador,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    await insertSub({
      userId: renovador,
      status: "active",
      startDate: await dateOffset(-30),
      endDate: await dateOffset(60),
    });

    const filters = await wideRange();
    const ltv = await ltvSvc.getLtv(CTX, filters);
    const churn = await churnSvc.getChurn(filters);

    expect(churn.window.churn.percentage).toBe(0);
    expect(ltv.lifetimeHeadlineMonths).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // LTV-02 — Kaplan-Meier: censored (still-active) lives are NOT dropped
  // ═══════════════════════════════════════════════════════════════════════

  it("keeps censored (still-active) lives in the cohort n (LTV-02/D-122-05)", async () => {
    // 1 closed (churned) + 2 censored (renewed) lives. A "only-closed" average would
    // drop the censored persons; Kaplan-Meier KEEPS them in the cohort.
    const churner = await insertMember();
    await insertSub({
      userId: churner,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    for (let i = 0; i < 2; i++) {
      const renovador = await insertMember();
      await insertSub({
        userId: renovador,
        startDate: await dateOffset(-70),
        endDate: await dateOffset(-40),
      });
      await insertSub({
        userId: renovador,
        status: "active",
        startDate: await dateOffset(-30), // renewed within window → censored, NOT dropped
        endDate: await dateOffset(60),
      });
    }

    const filters = await wideRange();
    const ltv = await ltvSvc.getLtv(CTX, filters);
    const churn = await churnSvc.getChurn(filters);

    // n is the FULL matured cohort (closed + censored), matching churn's denominator —
    // the censored lives were NOT discarded (D-122-05).
    expect(ltv.n).toBe(3);
    expect(ltv.n).toBe(churn.window.churn.n);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // LTV-04 — observed monetary = exact real sum; list price NOT used
  // ═══════════════════════════════════════════════════════════════════════

  it("observed LTV equals the exact real-payment sum, BELOW list price (LTV-04/D-122-08)", async () => {
    // A single closed customer with TWO real payments well below the 15000 list price.
    const closed = await insertMember();
    await insertSub({
      userId: closed,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    // Real payments: 8000 + 5000 = 13000 (BELOW 2 × 15000 list price).
    await insertPayment({
      memberId: closed,
      amount: 8000,
      date: await dateOffset(-65),
    });
    await insertPayment({
      memberId: closed,
      amount: 5000,
      date: await dateOffset(-45),
    });

    const ltv = await ltvSvc.getLtv(CTX, await wideRange());

    // Observed = SUM of the real amounts (13000), NOT the list price (would be 30000).
    expect(ltv.monetary.ARS.observed).toBe(13000);
    expect(ltv.monetary.ARS.observed).not.toBe(30000);
    expect(ltv.monetary.ARS.n).toBe(1);
  });

  it("excludes voided payments and skips closed lives with no real payments (LTV-04)", async () => {
    const closed = await insertMember();
    await insertSub({
      userId: closed,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    await insertPayment({
      memberId: closed,
      amount: 7000,
      date: await dateOffset(-60),
    });
    // A voided payment must NOT be counted.
    await app.db.insert(financialTransactions).values(
      tenantValues(CTX, {
        memberId: closed,
        kind: "plan_charge",
        direction: "inflow",
        amount: 99999,
        currency: "ARS",
        paymentMethod: "cash",
        transactionDate: await dateOffset(-55),
        effectiveDate: await dateOffset(-55),
        branchId: branchA,
        recordedBy: recorderId,
        voidedAt: await serverNow(),
      }),
    );

    const ltv = await ltvSvc.getLtv(CTX, await wideRange());
    expect(ltv.monetary.ARS.observed).toBe(7000);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // LTV-05 — per-currency isolation: ARS and EUR never summed
  // ═══════════════════════════════════════════════════════════════════════

  it("reports ARS and EUR separately and NEVER sums them (LTV-05/D-122-09)", async () => {
    // One closed AR customer (ARS payments) + one closed ES customer (EUR payments).
    const arClosed = await insertMember(branchA);
    await insertSub({
      userId: arClosed,
      planId: monthlyArId,
      branchId: branchA,
      currency: "ARS",
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    await insertPayment({
      memberId: arClosed,
      amount: 10000,
      currency: "ARS",
      date: await dateOffset(-60),
      branchId: branchA,
    });

    const esClosed = await insertMember(branchES);
    await insertSub({
      userId: esClosed,
      planId: monthlyEsId,
      branchId: branchES,
      currency: "EUR",
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    await insertPayment({
      memberId: esClosed,
      amount: 200,
      currency: "EUR",
      date: await dateOffset(-60),
      branchId: branchES,
    });

    const ltv = await ltvSvc.getLtv(CTX, await wideRange());

    // Each currency holds ONLY its own figure — the EUR 200 is never folded into the
    // ARS 10000 (and vice-versa). The blocks are isolated (D-122-09).
    expect(ltv.monetary.ARS.observed).toBe(10000);
    expect(ltv.monetary.EUR.observed).toBe(200);
    expect(ltv.monetary.ARS.observed).not.toBe(10200);
    expect(ltv.monetary.EUR.observed).not.toBe(10200);
    expect(ltv.monetary.ARS.n).toBe(1);
    expect(ltv.monetary.EUR.n).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // LTV-05 — breakdowns by branch / country / plan
  // ═══════════════════════════════════════════════════════════════════════

  it("breakdowns return branch/country/plan with the per-segment envelope (LTV-05)", async () => {
    const closed = await insertMember();
    await insertSub({
      userId: closed,
      planId: monthlyArId,
      startDate: await dateOffset(-70),
      endDate: await dateOffset(-40),
    });
    await insertPayment({
      memberId: closed,
      amount: 9000,
      date: await dateOffset(-60),
    });

    const res = await ltvSvc.getLtv(CTX, await wideRange());
    const axes = new Set(res.breakdowns.map((b) => b.axis));
    expect(axes.has("branch")).toBe(true);
    expect(axes.has("country")).toBe(true);
    expect(axes.has("plan")).toBe(true);

    for (const row of res.breakdowns) {
      expect(row).toHaveProperty("lifetimeHeadlineMonths");
      expect(row).toHaveProperty("survivalMedianMonths");
      expect(row).toHaveProperty("n");
      expect(row.monetary).toHaveProperty("ARS");
      expect(row.monetary).toHaveProperty("EUR");
    }

    // The plan-axis segment for the seeded plan carries the real-payment observed LTV.
    const planRow = res.breakdowns.find(
      (b) => b.axis === "plan" && b.key.startsWith("LTV AR Mensual"),
    );
    expect(planRow?.n).toBe(1);
    expect(planRow?.monetary.ARS.observed).toBe(9000);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Auth — ADMIN_ROLES-only (gestión 403, admin 200) — T-122-07
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /ltv auth", () => {
    it("returns 403 for gestión (ADMIN_ROLES-only, T-122-07)", async () => {
      await createStaffUser(app, {
        email: "gestion-ltv@test.com",
        password: "gestionpass123",
        firstName: "Ges",
        lastName: "Tion",
        role: "gestion",
        branchId: branchA,
      });
      const token = await getAuthToken(
        app,
        "gestion-ltv@test.com",
        "gestionpass123",
      );
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/ltv`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 200 for admin and carries the LtvAnalytics wire shape (T-122-07)", async () => {
      const adminToken = await getAuthToken(
        app,
        "admin@test.com",
        "adminpass123",
      );
      const range = await wideRange();
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/ltv?dateFrom=${range.dateFrom}&dateTo=${range.dateTo}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("lifetimeHeadlineMonths");
      expect(body).toHaveProperty("survivalMedianMonths");
      expect(body).toHaveProperty("monetary");
      expect(body.monetary).toHaveProperty("ARS");
      expect(body.monetary).toHaveProperty("EUR");
      expect(body).toHaveProperty("breakdowns");
      expect(body).toHaveProperty("n");
    });
  });
});
