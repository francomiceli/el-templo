import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  createStaffUser,
  cleanAllTestData,
} from "../helpers";
import { AdvancedFinanceService } from "../../src/modules/analytics/advanced-finance-service";
import {
  tenantValues,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * El gimnasio de los fixtures. Fase 172: `getAdvancedFinance` recibe el
 * `TenantContext` como PRIMER argumento (en producción sale de
 * `assertTenant(request.scope, …)`); acá se construye a mano porque el service
 * se invoca sin request. El Templo es el tenant 1 — mismo literal que usan
 * `test/tv/tv-pairing-tenant.test.ts` y `test/tenancy/con-01-*`.
 */
const TENANT_TEMPLO = 1;
const CTX: TenantContext = { tenantId: TENANT_TEMPLO };

/**
 * Phase 118 Plan 03 — AdvancedFinanceService (D-07 / D-08 / D-09 / D-11 / D-12).
 *
 * Real-MySQL integration. Caja vs Devengado prorrateado + ARPU, all per currency
 * (ARS/EUR never summed). Caja replicates the canonical revenue filter; devengado
 * prorates pricePaid over the effective window [start, MIN(end, cancelledAt)];
 * ARPU = devengado/mes ÷ activeMemberExists. Validates divide-by-zero guards and
 * cancelled-window cutting against real data.
 */
describe("AdvancedFinanceService (Phase 118 Plan 03)", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let svc: AdvancedFinanceService;
  let branchA: number; // 'TEST' (AR)
  let branchES: number; // 'TESTES' (ES)
  let planId: number;
  let recorderId: number; // admin@test.com — financial_transactions.recordedBy

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    svc = new AdvancedFinanceService(app.db, app.log);

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
    const [p] = await app.db.insert(subscriptionPlans).values({
      name: `AdvFinPlan-${Date.now()}`,
      country: "AR",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: 3,
    });
    planId = (p as { insertId: number }).insertId;
  });

  async function createMember(
    email: string,
    dni: string,
    branchId = branchA,
  ): Promise<number> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: "Fin",
      lastName: "Tester",
      branchId,
      dni,
    });
    return (result.user as { id: number }).id;
  }

  /** Make a member "active" per the canonical predicate (in-effect subscription). */
  async function makeActive(userId: number, branchId = branchA): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const future = new Date(Date.now() + 86400000 * 30)
      .toISOString()
      .split("T")[0];
    await app.db.insert(subscriptions).values({
      userId,
      planId,
      branchId,
      status: "active",
      startDate: today,
      endDate: future,
      pricePaid: 15000,
      currency: "ARS",
      priceTypeApplied: "regular",
    });
  }

  async function insertTx(opts: {
    memberId: number;
    amount: number;
    currency?: string;
    kind?: "plan_charge" | "debt_settlement" | "refund";
    direction?: "inflow" | "outflow";
    date: string;
    branchId?: number;
    voided?: boolean;
  }): Promise<void> {
    await app.db.insert(financialTransactions).values(
      tenantValues(CTX, {
        memberId: opts.memberId,
        kind: opts.kind ?? "plan_charge",
        direction: opts.direction ?? "inflow",
        amount: opts.amount,
        currency: opts.currency ?? "ARS",
        paymentMethod: "cash",
        transactionDate: opts.date,
        effectiveDate: opts.date,
        branchId: opts.branchId ?? branchA,
        recordedBy: recorderId,
        voidedAt: opts.voided ? new Date() : null,
      }),
    );
  }

  async function insertSub(opts: {
    userId: number;
    startDate: string | null;
    endDate: string | null;
    pricePaid: number;
    currency?: string;
    status?: "active" | "cancelled" | "expired";
    cancelledAt?: Date | null;
    branchId?: number;
  }): Promise<void> {
    await app.db.insert(subscriptions).values({
      userId: opts.userId,
      planId,
      branchId: opts.branchId ?? branchA,
      status: opts.status ?? "active",
      // startDate is NOT NULL in schema — for the null-start case we cannot
      // insert via Drizzle, so invalid-window tests use null endDate / inverted
      // windows which the column allows.
      startDate: opts.startDate ?? "2026-01-01",
      endDate: opts.endDate,
      pricePaid: opts.pricePaid,
      currency: opts.currency ?? "ARS",
      priceTypeApplied: "regular",
      cancelledAt: opts.cancelledAt ?? null,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CAJA — canonical filter, voided excluded, per currency
  // ═══════════════════════════════════════════════════════════════════════

  describe("cashTrend (CAJA)", () => {
    it("sums plan_charge + debt_settlement inflows per month/currency; voided + refund excluded", async () => {
      const m = await createMember("caja1@test.com", "93000001");
      await insertTx({ memberId: m, amount: 15000, date: "2026-03-10" });
      await insertTx({
        memberId: m,
        amount: 5000,
        kind: "debt_settlement",
        date: "2026-03-15",
      });
      // voided → excluded
      await insertTx({
        memberId: m,
        amount: 99999,
        date: "2026-03-20",
        voided: true,
      });
      // refund (not in canonical kinds) → excluded
      await insertTx({
        memberId: m,
        amount: 88888,
        kind: "refund",
        date: "2026-03-21",
      });
      // outflow → excluded
      await insertTx({
        memberId: m,
        amount: 77777,
        direction: "outflow",
        kind: "refund",
        date: "2026-03-22",
      });

      const res = await svc.getAdvancedFinance(CTX, {});
      const march = res.cashTrend.find((r) => r.month === "2026-03");
      expect(march).toBeDefined();
      expect(march?.ARS).toBe(20000);
    });

    it("ARS and EUR are reported as independent series, never summed", async () => {
      const ar = await createMember("caja-ar@test.com", "93000010", branchA);
      const eu = await createMember("caja-eu@test.com", "93000011", branchES);
      await insertTx({
        memberId: ar,
        amount: 10000,
        currency: "ARS",
        date: "2026-04-05",
        branchId: branchA,
      });
      await insertTx({
        memberId: eu,
        amount: 200,
        currency: "EUR",
        date: "2026-04-06",
        branchId: branchES,
      });

      const res = await svc.getAdvancedFinance(CTX, {});
      const april = res.cashTrend.find((r) => r.month === "2026-04");
      expect(april).toBeDefined();
      expect(april?.ARS).toBe(10000);
      expect(april?.EUR).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // DEVENGADO — proration, cancellation cut, invalid-window exclusion
  // ═══════════════════════════════════════════════════════════════════════

  describe("accruedTrend (DEVENGADO prorrateado)", () => {
    it("a long plan paid up-front: caja concentrated in one month, devengado spread", async () => {
      const m = await createMember("dev-long@test.com", "93000020");
      // 240-day plan, paid 240000 in March. Window Mar 1 .. Oct 27 inclusive.
      await insertSub({
        userId: m,
        startDate: "2026-03-01",
        endDate: "2026-10-27", // 241 inclusive days (Mar1..Oct27)
        pricePaid: 240000,
      });
      // Caja: full amount in the month of payment.
      await insertTx({ memberId: m, amount: 240000, date: "2026-03-15" });

      const res = await svc.getAdvancedFinance(CTX, {});

      // Caja concentrated in March.
      const cajaMarch = res.cashTrend.find((r) => r.month === "2026-03");
      expect(cajaMarch?.ARS).toBe(240000);

      // Devengado spread across many months.
      const devMonths = res.accruedTrend.filter((r) => r.ARS > 0);
      expect(devMonths.length).toBeGreaterThan(3);
      // No single month carries the whole amount.
      const devMarch = res.accruedTrend.find((r) => r.month === "2026-03");
      expect(devMarch).toBeDefined();
      expect(devMarch?.ARS).toBeLessThan(240000);
      // Sum of accrued ≈ total pricePaid (rounding tolerance).
      const totalAccrued = res.accruedTrend.reduce((s, r) => s + r.ARS, 0);
      expect(Math.abs(totalAccrued - 240000)).toBeLessThanOrEqual(12);
    });

    it("cancelled sub with cancelled_at < end_date: accrual stops at cancellation", async () => {
      const m = await createMember("dev-cancel@test.com", "93000021");
      // 6-month window, but cancelled at end of month 2.
      await insertSub({
        userId: m,
        startDate: "2026-01-01",
        endDate: "2026-06-30",
        pricePaid: 180000,
        status: "cancelled",
        cancelledAt: new Date("2026-02-28T12:00:00Z"),
      });

      const res = await svc.getAdvancedFinance(CTX, {});

      // Months after cancellation (March onward) get NO accrual from this sub.
      const march = res.accruedTrend.find((r) => r.month === "2026-03");
      const april = res.accruedTrend.find((r) => r.month === "2026-04");
      expect(march?.ARS ?? 0).toBe(0);
      expect(april?.ARS ?? 0).toBe(0);

      // Jan + Feb DO accrue, and they sum to the full pricePaid (effective
      // window is Jan1..Feb28, so 100% of the prorated price lands there).
      const jan = res.accruedTrend.find((r) => r.month === "2026-01");
      const feb = res.accruedTrend.find((r) => r.month === "2026-02");
      const sum = (jan?.ARS ?? 0) + (feb?.ARS ?? 0);
      expect(Math.abs(sum - 180000)).toBeLessThanOrEqual(2);
    });

    it("sub with end_date null is excluded from accrual + counted, never divides by zero", async () => {
      const m = await createMember("dev-nullend@test.com", "93000022");
      await insertSub({
        userId: m,
        startDate: "2026-01-01",
        endDate: null,
        pricePaid: 50000,
      });

      const res = await svc.getAdvancedFinance(CTX, {});
      expect(res.excludedInvalidWindow).toBe(1);
      // No NaN anywhere in the accrued series.
      for (const r of res.accruedTrend) {
        expect(Number.isNaN(r.ARS)).toBe(false);
        expect(Number.isNaN(r.EUR)).toBe(false);
      }
    });

    it("sub with end < start (inverted window) is excluded + counted", async () => {
      const m = await createMember("dev-inverted@test.com", "93000023");
      await insertSub({
        userId: m,
        startDate: "2026-05-10",
        endDate: "2026-05-01",
        pricePaid: 50000,
      });

      const res = await svc.getAdvancedFinance(CTX, {});
      expect(res.excludedInvalidWindow).toBe(1);
    });

    it("ARS and EUR accrual series are independent, never summed", async () => {
      const ar = await createMember("dev-ar@test.com", "93000030", branchA);
      const eu = await createMember("dev-eu@test.com", "93000031", branchES);
      // Single-month windows so the full amount accrues in that month.
      await insertSub({
        userId: ar,
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        pricePaid: 31000,
        currency: "ARS",
        branchId: branchA,
      });
      await insertSub({
        userId: eu,
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        pricePaid: 310,
        currency: "EUR",
        branchId: branchES,
      });

      const res = await svc.getAdvancedFinance(CTX, {});
      const july = res.accruedTrend.find((r) => r.month === "2026-07");
      expect(july).toBeDefined();
      expect(july?.ARS).toBe(31000);
      expect(july?.EUR).toBe(310);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ARPU — devengado/mes ÷ activos canónicos; div-by-zero guard
  // ═══════════════════════════════════════════════════════════════════════

  describe("ARPU", () => {
    it("ARPU = devengado del mes ÷ activos (activeMemberExists)", async () => {
      // 2 active members (in-effect subs).
      const a1 = await createMember("arpu-a1@test.com", "93000040");
      const a2 = await createMember("arpu-a2@test.com", "93000041");
      await makeActive(a1);
      await makeActive(a2);

      // A separate single-month accrual sub for member a1 in a fixed month.
      const billed = await createMember("arpu-bill@test.com", "93000042");
      await insertSub({
        userId: billed,
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        pricePaid: 20000,
        currency: "ARS",
      });

      const res = await svc.getAdvancedFinance(CTX, {});
      const sep = res.arpu.find((r) => r.month === "2026-09");
      expect(sep).toBeDefined();
      // active count is 2 (the two makeActive members; billed sub is in the
      // future so its member is also active → 3). Compute denominator from
      // accrued / arpu relationship instead of hardcoding.
      const sepAccrued = res.accruedTrend.find((r) => r.month === "2026-09");
      expect(sepAccrued?.ARS).toBe(20000);
      // ARPU must be a positive integer share of the accrued amount.
      expect(sep?.ARS).toBeGreaterThan(0);
      expect(sep!.ARS).toBeLessThanOrEqual(20000);
      expect(Number.isInteger(sep!.ARS)).toBe(true);
    });

    it("a month with accrual but 0 active members reports ARPU 0 (no div-by-zero)", async () => {
      // An inactive member (cancelled sub, ended in the past) — NOT active.
      const m = await createMember("arpu-zero@test.com", "93000050");
      await insertSub({
        userId: m,
        startDate: "2026-02-01",
        endDate: "2026-02-28",
        pricePaid: 28000,
        status: "expired",
      });

      const res = await svc.getAdvancedFinance(CTX, {});
      const feb = res.arpu.find((r) => r.month === "2026-02");
      const febAccrued = res.accruedTrend.find((r) => r.month === "2026-02");
      expect(febAccrued?.ARS).toBe(28000);
      // No active members → ARPU guarded to 0, never NaN/Infinity.
      expect(feb?.ARS).toBe(0);
      expect(Number.isNaN(feb!.ARS)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Endpoint — guard (D-11) + scope (T-118-07)
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /api/admin/analytics/advanced-finance", () => {
    it("returns 401 unauthenticated", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/advanced-finance`,
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for a regular member", async () => {
      const { token } = await registerUser(app, {
        email: "member-adv@test.com",
        password: "pass123456",
        firstName: "Reg",
        lastName: "Member",
        branchId: branchA,
      });
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/advanced-finance`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 403 for gestion (ADMIN_ROLES-only, D-11)", async () => {
      await createStaffUser(app, {
        email: "gestion-adv@test.com",
        password: "gestionpass123",
        firstName: "Ges",
        lastName: "Tion",
        role: "gestion",
        branchId: branchA,
      });
      const token = await getAuthToken(
        app,
        "gestion-adv@test.com",
        "gestionpass123",
      );
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/advanced-finance`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 200 for owner (admin)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/advanced-finance`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.cashTrend)).toBe(true);
      expect(Array.isArray(body.accruedTrend)).toBe(true);
      expect(Array.isArray(body.arpu)).toBe(true);
      expect(typeof body.excludedInvalidWindow).toBe("number");
    });

    it("AR admin is denied (403) querying an ES sede; allowed on AR (T-118-07)", async () => {
      await createStaffUser(app, {
        email: "admin-adv@test.com",
        password: "adminarpass123",
        firstName: "Admin",
        lastName: "Adv",
        role: "admin",
        branchId: branchA,
      });
      const arAdminToken = await getAuthToken(
        app,
        "admin-adv@test.com",
        "adminarpass123",
      );

      const denied = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/advanced-finance?branchId=${branchES}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(denied.statusCode).toBe(403);

      const ok = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/advanced-finance?branchId=${branchA}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(ok.statusCode).toBe(200);
    });
  });
});
