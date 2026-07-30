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
import { TicketService } from "../../src/modules/analytics/ticket-service";
import type { TenantContext } from "../../src/modules/shared/tenant";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { branches } from "../../src/db/schema/branches";
import { users } from "../../src/db/schema/users";

/**
 * El gimnasio de los fixtures (El Templo = tenant 1). Fase 172: el service
 * recibe el `TenantContext` como PRIMER argumento; en producción sale de
 * `assertTenant(request.scope, …)`, acá se construye a mano porque el service se
 * invoca sin request.
 */
const CTX: TenantContext = { tenantId: 1 };

const ANALYTICS_URL = "/api/admin/analytics";

/**
 * Phase 120 Plan 04 — TicketService (Block 6, TICKET-01..04).
 *
 * Real-MySQL integration. The ticket VALUE + discount numerator come from the
 * LINKED `subscriptions.price_paid` (NOT `financial_transactions.amount`, which is
 * cash received and can be a partial payment). The charge universe is the
 * canonical revenue filter restricted to `kind='plan_charge'` only, joined through
 * `transaction_links` (`target_kind='subscription'`). Covers: weighted avg from
 * price_paid, $0 exclusion, discount mean+median with snapshot/fallback, list-price
 * vs discounted cohort split, excludedNoLink (enrollment-only charge), currency
 * isolation, duration breakdown, scope, and the ADMIN_ROLES 403.
 *
 * Do NOT run locally (tests run in CI on staging push).
 */
describe("TicketService (Phase 120 Plan 04)", () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let svc: TicketService;
  let branchA: number; // 'TEST' (AR)
  let branchES: number; // 'TESTES' (ES)
  let planArId: number; // AR, 30d, priceRegular 15000
  let planLongId: number; // AR, 120d, priceRegular 40000
  let planEsId: number; // ES, 30d, EUR, priceRegular 100
  let recorderId: number; // admin@test.com — financial_transactions.recordedBy

  beforeAll(async () => {
    app = await createTestApp();
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
    svc = new TicketService(app.db, app.log);

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

    const [pAr] = await app.db.insert(subscriptionPlans).values({
      name: "Ticket AR Mensual",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      country: "AR",
      currency: "ARS",
      priceRegular: 15000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
    });
    planArId = (pAr as { insertId: number }).insertId;

    const [pLong] = await app.db.insert(subscriptionPlans).values({
      name: "Ticket AR Largo",
      planTier: "foundation",
      bookingMode: "flexible",
      planCategory: "presencial",
      country: "AR",
      currency: "ARS",
      priceRegular: 40000,
      priceZero: 0,
      durationDays: 120,
      classesPerWeek: 3,
    });
    planLongId = (pLong as { insertId: number }).insertId;

    const [pEs] = await app.db.insert(subscriptionPlans).values({
      name: "Ticket ES Mensual",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      country: "ES",
      currency: "EUR",
      priceRegular: 100,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
    });
    planEsId = (pEs as { insertId: number }).insertId;
  });

  async function createMember(
    email: string,
    dni: string,
    branchId = branchA,
  ): Promise<number> {
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      firstName: "Tic",
      lastName: "Ket",
      branchId,
      dni,
    });
    return (result.user as { id: number }).id;
  }

  /**
   * Seed a full membership charge: a subscription (carrying the ticket VALUE
   * price_paid + snapshot + override), a financial_transaction (kind='plan_charge'
   * universe), and the transaction_links subscription link joining them. `ftAmount`
   * defaults to `pricePaid` but can DIFFER (a partial cash payment) to prove the
   * ticket reads price_paid, not ft.amount.
   */
  async function seedMembershipCharge(opts: {
    userId: number;
    planId: number;
    pricePaid: number;
    priceRegularSnapshot?: number | null;
    priceOverrideAmount?: number | null;
    currency?: string;
    branchId?: number;
    date?: string;
    ftAmount?: number;
  }): Promise<void> {
    const branchId = opts.branchId ?? branchA;
    const currency = opts.currency ?? "ARS";
    const [sub] = await app.db.insert(subscriptions).values({
      userId: opts.userId,
      planId: opts.planId,
      branchId,
      status: "active",
      startDate: opts.date ?? "2026-03-01",
      endDate: "2026-03-31",
      pricePaid: opts.pricePaid,
      currency,
      priceTypeApplied: "regular",
      priceRegularSnapshot:
        opts.priceRegularSnapshot === undefined
          ? null
          : opts.priceRegularSnapshot,
      priceOverrideAmount: opts.priceOverrideAmount ?? null,
    });
    const subId = (sub as { insertId: number }).insertId;

    const [ft] = await app.db.insert(financialTransactions).values({
      memberId: opts.userId,
      kind: "plan_charge",
      direction: "inflow",
      amount: opts.ftAmount ?? opts.pricePaid,
      currency,
      paymentMethod: "cash",
      transactionDate: opts.date ?? "2026-03-10",
      effectiveDate: opts.date ?? "2026-03-10",
      branchId,
      recordedBy: recorderId,
    });
    const ftId = (ft as { insertId: number }).insertId;

    await app.db.insert(transactionLinks).values({
      transactionId: ftId,
      targetKind: "subscription",
      targetId: subId,
      allocatedAmount: opts.ftAmount ?? opts.pricePaid,
    });
  }

  /**
   * Seed an ENROLLMENT-ONLY plan_charge: a financial_transaction (kind='plan_charge'
   * universe) linked via transaction_links with target_kind='enrollment' (NO
   * subscription link). The service's INNER join on target_kind='subscription'
   * excludes it; it must be counted in excludedNoLink. target_id has no FK so any
   * id is acceptable.
   */
  async function seedEnrollmentCharge(opts: {
    userId: number;
    amount: number;
    currency?: string;
    branchId?: number;
    date?: string;
  }): Promise<void> {
    const branchId = opts.branchId ?? branchA;
    const [ft] = await app.db.insert(financialTransactions).values({
      memberId: opts.userId,
      kind: "plan_charge",
      direction: "inflow",
      amount: opts.amount,
      currency: opts.currency ?? "ARS",
      paymentMethod: "cash",
      transactionDate: opts.date ?? "2026-03-10",
      effectiveDate: opts.date ?? "2026-03-10",
      branchId,
      recordedBy: recorderId,
    });
    const ftId = (ft as { insertId: number }).insertId;
    await app.db.insert(transactionLinks).values({
      transactionId: ftId,
      targetKind: "enrollment",
      targetId: 999999,
      allocatedAmount: opts.amount,
    });
  }

  const RANGE = { dateFrom: "2026-03-01", dateTo: "2026-04-01" }; // half-open

  // ═══════════════════════════════════════════════════════════════════════
  // TICKET VALUE comes from subscriptions.price_paid (NOT ft.amount)
  // ═══════════════════════════════════════════════════════════════════════

  it("ticket value uses subscriptions.price_paid, NOT ft.amount (partial payment)", async () => {
    const m1 = await createMember("tk-pp1@test.com", "94000001");
    const m2 = await createMember("tk-pp2@test.com", "94000002");
    const m3 = await createMember("tk-pp3@test.com", "94000003");
    // price_paid 100/200/300; the 300 charge only RECEIVED 150 in cash (partial).
    await seedMembershipCharge({
      userId: m1,
      planId: planArId,
      pricePaid: 100,
      priceRegularSnapshot: 100,
    });
    await seedMembershipCharge({
      userId: m2,
      planId: planArId,
      pricePaid: 200,
      priceRegularSnapshot: 200,
    });
    await seedMembershipCharge({
      userId: m3,
      planId: planArId,
      pricePaid: 300,
      priceRegularSnapshot: 300,
      ftAmount: 150, // partial cash — must be IGNORED
    });

    const res = await svc.getTicket(CTX, RANGE);
    // global = (100+200+300)/3 = 200, NOT (100+200+150)/3 = 150.
    expect(res.byCurrency.ARS.global.nominal).toBe(200);
    expect(res.byCurrency.ARS.global.n).toBe(3);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Global ticket = volume-weighted SUM/COUNT, NOT mean-of-plan-means
  // ═══════════════════════════════════════════════════════════════════════

  it("global ticket is SUM(price_paid)/COUNT (weighted), not the avg of plan means", async () => {
    // Plan AR: 3 charges of 100 each (mean 100). Plan Long: 1 charge of 1000.
    for (let i = 0; i < 3; i++) {
      const m = await createMember(`tk-w-a${i}@test.com`, `94001${i}00`);
      await seedMembershipCharge({
        userId: m,
        planId: planArId,
        pricePaid: 100,
        priceRegularSnapshot: 100,
      });
    }
    const mL = await createMember("tk-w-long@test.com", "94001999");
    await seedMembershipCharge({
      userId: mL,
      planId: planLongId,
      pricePaid: 1000,
      priceRegularSnapshot: 1000,
    });

    const res = await svc.getTicket(CTX, RANGE);
    // weighted = (100*3 + 1000)/4 = 1300/4 = 325.
    // mean-of-means = (100 + 1000)/2 = 550 (WRONG — must NOT equal this).
    expect(res.byCurrency.ARS.global.nominal).toBe(325);
    expect(res.byCurrency.ARS.global.nominal).not.toBe(550);
    expect(res.byCurrency.ARS.global.n).toBe(4);

    const arPlan = res.byCurrency.ARS.perPlan.find(
      (p) => p.planName === "Ticket AR Mensual",
    );
    expect(arPlan?.ticket.nominal).toBe(100);
    const longPlan = res.byCurrency.ARS.perPlan.find(
      (p) => p.planName === "Ticket AR Largo",
    );
    expect(longPlan?.ticket.nominal).toBe(1000);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // $0 charge excluded from the average, reported as zeroCount/zeroPct
  // ═══════════════════════════════════════════════════════════════════════

  it("$0 charge is excluded from the average and reported as zeroCount/zeroPct", async () => {
    const m1 = await createMember("tk-z1@test.com", "94002001");
    const m2 = await createMember("tk-z2@test.com", "94002002");
    await seedMembershipCharge({
      userId: m1,
      planId: planArId,
      pricePaid: 10000,
      priceRegularSnapshot: 10000,
    });
    await seedMembershipCharge({
      userId: m2,
      planId: planArId,
      pricePaid: 0, // beca/promo — excluded from avg
      priceRegularSnapshot: 15000,
    });

    const res = await svc.getTicket(CTX, RANGE);
    // average over priced charges only = 10000 (the $0 excluded).
    expect(res.byCurrency.ARS.global.nominal).toBe(10000);
    expect(res.byCurrency.ARS.global.n).toBe(1);
    expect(res.byCurrency.ARS.zeroCount).toBe(1);
    // zeroPct = 1 of 2 charges = 50%.
    expect(res.byCurrency.ARS.zeroPct).toBe(50);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Currency isolation — ARS and EUR never summed
  // ═══════════════════════════════════════════════════════════════════════

  it("ARS and EUR are independent — never summed", async () => {
    const ar = await createMember("tk-cur-ar@test.com", "94003001", branchA);
    const eu = await createMember("tk-cur-eu@test.com", "94003002", branchES);
    await seedMembershipCharge({
      userId: ar,
      planId: planArId,
      pricePaid: 15000,
      priceRegularSnapshot: 15000,
      currency: "ARS",
      branchId: branchA,
    });
    await seedMembershipCharge({
      userId: eu,
      planId: planEsId,
      pricePaid: 100,
      priceRegularSnapshot: 100,
      currency: "EUR",
      branchId: branchES,
    });

    const res = await svc.getTicket(CTX, RANGE);
    expect(res.byCurrency.ARS.global.nominal).toBe(15000);
    expect(res.byCurrency.ARS.global.n).toBe(1);
    expect(res.byCurrency.EUR.global.nominal).toBe(100);
    expect(res.byCurrency.EUR.global.n).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Discount: snapshot (faithful) vs NULL snapshot (fallback + caveat) + median
  // ═══════════════════════════════════════════════════════════════════════

  it("discount uses snapshot, falls back to current priceRegular (historicalFallbackCount), reports median", async () => {
    const m1 = await createMember("tk-d1@test.com", "94004001");
    const m2 = await createMember("tk-d2@test.com", "94004002");
    // Snapshot present: price_paid 80 vs snapshot 100 → discount 0.20.
    await seedMembershipCharge({
      userId: m1,
      planId: planArId,
      pricePaid: 80,
      priceRegularSnapshot: 100,
    });
    // Snapshot NULL → fallback to plan.priceRegular (15000); paid 12000 → 0.20.
    await seedMembershipCharge({
      userId: m2,
      planId: planArId,
      pricePaid: 12000,
      priceRegularSnapshot: null,
    });

    const res = await svc.getTicket(CTX, RANGE);
    expect(res.historicalFallbackCount).toBe(1);
    // both discounts are 0.20 → mean and median both 0.20.
    expect(res.byCurrency.ARS.discountMean).toBeCloseTo(0.2, 5);
    expect(res.byCurrency.ARS.discountMedian).toBeCloseTo(0.2, 5);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Cohort split: list-price vs discounted/customized
  // ═══════════════════════════════════════════════════════════════════════

  it("splits charges into list-price vs discounted cohorts (per plan + global)", async () => {
    const m1 = await createMember("tk-c1@test.com", "94005001");
    const m2 = await createMember("tk-c2@test.com", "94005002");
    const m3 = await createMember("tk-c3@test.com", "94005003");
    // List-price: paid == snapshot, no override.
    await seedMembershipCharge({
      userId: m1,
      planId: planArId,
      pricePaid: 15000,
      priceRegularSnapshot: 15000,
    });
    // Discounted (below list): paid 12000 < snapshot 15000.
    await seedMembershipCharge({
      userId: m2,
      planId: planArId,
      pricePaid: 12000,
      priceRegularSnapshot: 15000,
    });
    // Customized (override applied) even though paid == snapshot.
    await seedMembershipCharge({
      userId: m3,
      planId: planArId,
      pricePaid: 15000,
      priceRegularSnapshot: 15000,
      priceOverrideAmount: 15000,
    });

    const res = await svc.getTicket(CTX, RANGE);
    const ars = res.byCurrency.ARS;
    // Global cohorts: 1 list-price (15000), 2 discounted/customized (12000, 15000).
    expect(ars.globalCohorts.listPrice.n).toBe(1);
    expect(ars.globalCohorts.listPrice.average).toBe(15000);
    expect(ars.globalCohorts.discounted.n).toBe(2);
    expect(ars.globalCohorts.discounted.average).toBe(13500);

    const plan = ars.perPlan.find((p) => p.planName === "Ticket AR Mensual");
    expect(plan?.cohorts.listPrice.n).toBe(1);
    expect(plan?.cohorts.discounted.n).toBe(2);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // excludedNoLink — enrollment-only plan_charge excluded + counted
  // ═══════════════════════════════════════════════════════════════════════

  it("excludes enrollment-only plan_charge from the ticket and counts it in excludedNoLink", async () => {
    const m1 = await createMember("tk-x1@test.com", "94006001");
    const m2 = await createMember("tk-x2@test.com", "94006002");
    // One real membership charge.
    await seedMembershipCharge({
      userId: m1,
      planId: planArId,
      pricePaid: 15000,
      priceRegularSnapshot: 15000,
    });
    // One enrollment-only plan_charge (no subscription link) in the same period.
    await seedEnrollmentCharge({ userId: m2, amount: 9999 });

    const res = await svc.getTicket(CTX, RANGE);
    // The membership ticket reflects ONLY the linked charge (15000), not 9999.
    expect(res.byCurrency.ARS.global.nominal).toBe(15000);
    expect(res.byCurrency.ARS.global.n).toBe(1);
    // The enrollment-only charge is surfaced, not silently dropped.
    expect(res.excludedNoLink).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Duration breakdown — monthly (30d) vs long_term (120d)
  // ═══════════════════════════════════════════════════════════════════════

  it("buckets the ticket by duration tier (monthly vs long_term)", async () => {
    const mM = await createMember("tk-dur-m@test.com", "94007001");
    const mL = await createMember("tk-dur-l@test.com", "94007002");
    await seedMembershipCharge({
      userId: mM,
      planId: planArId, // 30d
      pricePaid: 15000,
      priceRegularSnapshot: 15000,
    });
    await seedMembershipCharge({
      userId: mL,
      planId: planLongId, // 120d
      pricePaid: 40000,
      priceRegularSnapshot: 40000,
    });

    const res = await svc.getTicket(CTX, RANGE);
    const monthly = res.byCurrency.ARS.byDuration.find(
      (d) => d.durationTier === "monthly",
    );
    const longTerm = res.byCurrency.ARS.byDuration.find(
      (d) => d.durationTier === "long_term",
    );
    expect(monthly?.ticket.nominal).toBe(15000);
    expect(longTerm?.ticket.nominal).toBe(40000);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Scope isolation — branch filter restricts the ticket
  // ═══════════════════════════════════════════════════════════════════════

  it("scopes the ticket by branch", async () => {
    const ar = await createMember("tk-sc-ar@test.com", "94008001", branchA);
    const eu = await createMember("tk-sc-eu@test.com", "94008002", branchES);
    await seedMembershipCharge({
      userId: ar,
      planId: planArId,
      pricePaid: 15000,
      priceRegularSnapshot: 15000,
      currency: "ARS",
      branchId: branchA,
    });
    await seedMembershipCharge({
      userId: eu,
      planId: planEsId,
      pricePaid: 100,
      priceRegularSnapshot: 100,
      currency: "EUR",
      branchId: branchES,
    });

    const res = await svc.getTicket(CTX, { ...RANGE, branchId: branchA });
    expect(res.byCurrency.ARS.global.n).toBe(1);
    // The ES branch charge is out of scope → EUR has no charges.
    expect(res.byCurrency.EUR.global.n).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // half-open [from, to) — `to` itself is excluded
  // ═══════════════════════════════════════════════════════════════════════

  it("applies a half-open [from, to) range (the `to` boundary is excluded)", async () => {
    const m1 = await createMember("tk-r1@test.com", "94009001");
    const m2 = await createMember("tk-r2@test.com", "94009002");
    // In range (2026-03-10), and exactly on `to` (2026-04-01, excluded).
    await seedMembershipCharge({
      userId: m1,
      planId: planArId,
      pricePaid: 15000,
      priceRegularSnapshot: 15000,
      date: "2026-03-10",
    });
    await seedMembershipCharge({
      userId: m2,
      planId: planArId,
      pricePaid: 99999,
      priceRegularSnapshot: 99999,
      date: "2026-04-01", // == dateTo → must be EXCLUDED
    });

    const res = await svc.getTicket(CTX, RANGE);
    expect(res.byCurrency.ARS.global.n).toBe(1);
    expect(res.byCurrency.ARS.global.nominal).toBe(15000);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // planId INPUT filter (Phase 132 D-10) — restricts the ticket to ONE plan
  // ═══════════════════════════════════════════════════════════════════════

  it("planId filter restricts the ticket to charges of that plan only", async () => {
    const mA = await createMember("tk-plan-a@test.com", "94011001");
    const mB = await createMember("tk-plan-b@test.com", "94011002");
    // Plan AR charge of 15000, plan Long charge of 40000 — both in scope.
    await seedMembershipCharge({
      userId: mA,
      planId: planArId,
      pricePaid: 15000,
      priceRegularSnapshot: 15000,
    });
    await seedMembershipCharge({
      userId: mB,
      planId: planLongId,
      pricePaid: 40000,
      priceRegularSnapshot: 40000,
    });

    const res = await svc.getTicket(CTX, { ...RANGE, planId: planArId });
    // Only the plan-AR charge is counted: global reflects 15000 over n=1.
    expect(res.byCurrency.ARS.global.n).toBe(1);
    expect(res.byCurrency.ARS.global.nominal).toBe(15000);
    // perPlan has ONLY plan AR (plan Long is filtered out entirely).
    expect(res.byCurrency.ARS.perPlan.length).toBe(1);
    expect(res.byCurrency.ARS.perPlan[0].planName).toBe("Ticket AR Mensual");
  });

  it("planId is AND-ed with branch scope — no cross-branch leak (T-132-01)", async () => {
    // A plan-AR charge lives in branch A; the caller is scoped to the ES branch.
    const m = await createMember("tk-plan-cross@test.com", "94012001", branchA);
    await seedMembershipCharge({
      userId: m,
      planId: planArId,
      pricePaid: 15000,
      priceRegularSnapshot: 15000,
      currency: "ARS",
      branchId: branchA,
    });

    // planId=AR (a real plan) but scoped to a DIFFERENT branch → no data: the
    // plan filter must AND with scope, never bypass it.
    const res = await svc.getTicket(CTX, {
      ...RANGE,
      planId: planArId,
      branchId: branchES,
    });
    expect(res.byCurrency.ARS.global.n).toBe(0);
    expect(res.byCurrency.ARS.perPlan.length).toBe(0);
  });

  it("rejects a non-integer planId with 400 (schema, T-132-02)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${ANALYTICS_URL}/ticket?dateFrom=2026-03-01&dateTo=2026-04-01&planId=notAnInteger`,
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Route auth — ADMIN_ROLES-only (gestion 403, admin 200), wire shape
  // ═══════════════════════════════════════════════════════════════════════

  describe("GET /ticket auth + wire shape", () => {
    it("returns 403 for gestion (ADMIN_ROLES-only)", async () => {
      await createStaffUser(app, {
        email: "gestion-tk@test.com",
        password: "gestionpass123",
        firstName: "Ges",
        lastName: "Tion",
        role: "gestion",
        branchId: branchA,
      });
      const token = await getAuthToken(
        app,
        "gestion-tk@test.com",
        "gestionpass123",
      );
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/ticket`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 200 for admin and carries cohorts + excludedNoLink on the wire", async () => {
      const m = await createMember("tk-wire@test.com", "94010001");
      await seedMembershipCharge({
        userId: m,
        planId: planArId,
        pricePaid: 15000,
        priceRegularSnapshot: 15000,
      });

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/ticket?dateFrom=2026-03-01&dateTo=2026-04-01`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // fast-json-stringify would strip undeclared fields — assert they survive.
      expect(body.byCurrency.ARS).toBeDefined();
      expect(body.byCurrency.EUR).toBeDefined();
      expect(body.byCurrency.ARS.global.nominal).toBe(15000);
      expect(body.byCurrency.ARS.globalCohorts.listPrice).toBeDefined();
      expect(body.byCurrency.ARS.globalCohorts.discounted).toBeDefined();
      expect(typeof body.excludedNoLink).toBe("number");
      expect(typeof body.historicalFallbackCount).toBe("number");
    });
  });
});
