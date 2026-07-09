/**
 * Phase 109-02 — integration tests for GET /api/admin/reports/outstanding-balances.
 *
 * Coverage matrix:
 *   - RBAC: coach 403, recepcion 403, gestion/admin/owner 200.
 *   - Empty result: empty rows + zeroed BucketTotals.
 *   - Bucket boundaries (D-05): days 5/6/10/11/15/16 each land in the
 *     correct bucket.
 *   - Future effective_date clamps to ageInDays=0 (bucket '0-5').
 *   - Default sort = ageInDays DESC (oldest first).
 *   - Filter: branchId, currency, search.
 *   - Pagination: 75 rows → page 1 returns 50, page 2 returns 25.
 *   - Multi-currency owner returns per-currency keyed bucketTotals.
 *   - Non-owner returns flat bucketTotals.
 *   - debt_balance row is preserved through LEFT JOIN (branchId/branchName
 *     null, conceptLabel='Saldo a regularizar').
 *   - amount=0 row is excluded by WHERE amount > 0.
 *   - Cross-country: non-owner from AR with only ES seeds → empty result
 *     (semantically correct — NOT 403, NOT 404).
 *   - branchId filter excludes debt_balance rows (no branch).
 *
 * Runs against the per-worker test MySQL database (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { Workbook } from "exceljs";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const REPORTS_URL = "/api/admin/reports";

interface SeededContext {
  arBranchId: number;
  arBranchBId: number;
  esBranchId: number;
  ownerToken: string;
  ownerId: number;
  adminArId: number;
  adminArToken: string;
  gestionArId: number;
  gestionArToken: string;
  coachId: number;
  coachToken: string;
  recepcionArId: number;
  recepcionArToken: string;
  planArId: number;
  planEsId: number;
  // Member buckets — populated per-test as needed.
}

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  // Three real branches (2× AR, 1× ES) so we can exercise branchId and
  // country filters without colliding with seeded branches.
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-MDP-OB1",
      code: nextSuffix("OB"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [arB] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-CABA-OB2",
      code: nextSuffix("OB"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-BCN-OB3",
      code: nextSuffix("OB"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  return {
    arBranchId: ar.id,
    arBranchBId: arB.id,
    esBranchId: es.id,
    ownerToken: "",
    ownerId: 0,
    adminArId: 0,
    adminArToken: "",
    gestionArId: 0,
    gestionArToken: "",
    coachId: 0,
    coachToken: "",
    recepcionArId: 0,
    recepcionArToken: "",
    planArId: 0,
    planEsId: 0,
  };
}

async function seedRolesAndPlans(
  app: FastifyInstance,
  ctx: SeededContext,
): Promise<void> {
  // admin@test.com is seeded as role='owner'.
  ctx.ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [ownerRow] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  ctx.ownerId = ownerRow.id;

  ctx.adminArId = await createStaffUser(app, {
    email: "admin-ob@test.local",
    password: "pass123456",
    firstName: "Admin",
    lastName: "AR",
    role: "admin",
    branchId: ctx.arBranchId,
  });
  ctx.adminArToken = await getAuthToken(
    app,
    "admin-ob@test.local",
    "pass123456",
  );

  ctx.gestionArId = await createStaffUser(app, {
    email: "gestion-ob@test.local",
    password: "pass123456",
    firstName: "Gestion",
    lastName: "AR",
    role: "gestion",
    branchId: ctx.arBranchId,
  });
  ctx.gestionArToken = await getAuthToken(
    app,
    "gestion-ob@test.local",
    "pass123456",
  );

  ctx.coachId = await createStaffUser(app, {
    email: "coach-ob@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "AR",
    role: "coach",
    branchId: ctx.arBranchId,
  });
  ctx.coachToken = await getAuthToken(app, "coach-ob@test.local", "pass123456");

  ctx.recepcionArId = await createStaffUser(app, {
    email: "recepcion-ob@test.local",
    password: "pass123456",
    firstName: "Recepcion",
    lastName: "AR",
    role: "recepcion",
    branchId: ctx.arBranchId,
  });
  ctx.recepcionArToken = await getAuthToken(
    app,
    "recepcion-ob@test.local",
    "pass123456",
  );

  // Two plans — AR (ARS) and ES (EUR).
  const [planAr] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Plan AR Mensual",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 50000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();
  ctx.planArId = planAr.id;

  const [planEs] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Plan ES Mensual",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 30000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "EUR",
    })
    .$returningId();
  ctx.planEsId = planEs.id;
}

interface SeedSubscriptionWithBalanceOpts {
  app: FastifyInstance;
  branchId: number;
  planId: number;
  planCurrency: "ARS" | "EUR";
  startDateOffsetDays: number; // negative = past, positive = future
  amount: number; // balances.amount (>0 = member owes)
  memberFirstName?: string;
  memberLastName?: string;
  // Phase 153 (DEUDA-03): optional cycle end date so tests can assert the
  // periodEnd. When omitted the subscription end_date stays null.
  endDateOffsetDays?: number;
  subscriptionStatus?: "active" | "scheduled";
  // balances.createdAt offset. La antigüedad (ageInDays) se mide desde la
  // creación de la deuda, no desde el devengo (start_date). Default = mismo
  // offset que el start_date, para preservar los asserts de antigüedad de los
  // tests que seedean deuda "coetánea" al inicio del plan.
  balanceCreatedOffsetDays?: number;
}

async function seedSubscriptionWithBalance(
  opts: SeedSubscriptionWithBalanceOpts,
): Promise<{
  memberId: number;
  subscriptionId: number;
  startDate: string;
  endDate: string | null;
}> {
  const memberRes = await registerUser(opts.app, {
    email: `member-ob-${nextSuffix("M")}@test.local`,
    password: "pass123456",
    firstName: opts.memberFirstName ?? "Test",
    lastName: opts.memberLastName ?? "Member",
    branchId: opts.branchId,
  });
  const memberId = (memberRes.user as { id: number }).id;

  const startDate = dateOffset(opts.startDateOffsetDays);
  const endDate =
    opts.endDateOffsetDays !== undefined
      ? dateOffset(opts.endDateOffsetDays)
      : null;
  const [sub] = await opts.app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberId,
      planId: opts.planId,
      branchId: opts.branchId,
      status: opts.subscriptionStatus ?? "active",
      startDate,
      endDate,
      pricePaid: opts.amount,
      currency: opts.planCurrency,
      priceTypeApplied: "regular",
    })
    .$returningId();
  const subscriptionId = sub.id;

  const createdOffset =
    opts.balanceCreatedOffsetDays ?? opts.startDateOffsetDays;
  await opts.app.db.insert(schema.balances).values({
    memberId,
    targetKind: "subscription",
    targetId: subscriptionId,
    currency: opts.planCurrency,
    amount: opts.amount,
    createdAt: new Date(dateOffset(createdOffset) + "T00:00:00Z"),
  });

  return { memberId, subscriptionId, startDate, endDate };
}

/**
 * Phase 153 (DEUDA-02/D-11) — seed a debt_balance (cobro suelto) together with
 * the advance_payment origin transaction that carries the miscReason + notes,
 * linked via transaction_links (target_kind='debt_balance'). Mirrors the real
 * cobro-suelto chain used to derive the motivo.
 */
async function seedDebtBalanceWithOrigin(opts: {
  app: FastifyInstance;
  branchId: number;
  recordedBy: number;
  amount: number;
  miscReason: "sin_plan" | "otro";
  notes: string | null;
  currency?: "ARS" | "EUR";
  memberFirstName?: string;
  memberLastName?: string;
  // WR-04: when true the origin advance_payment is inserted already voided
  // (voided_at set), simulating the "anulada" leg of a void+recreate.
  voided?: boolean;
}): Promise<{
  memberId: number;
  balanceId: number;
  targetId: number;
  txId: number;
}> {
  const memberRes = await registerUser(opts.app, {
    email: `member-suelto-${nextSuffix("S")}@test.local`,
    password: "pass123456",
    firstName: opts.memberFirstName ?? "Suelto",
    lastName: opts.memberLastName ?? "Member",
    branchId: opts.branchId,
  });
  const memberId = (memberRes.user as { id: number }).id;
  const currency = opts.currency ?? "ARS";
  const targetId = Math.floor(Math.random() * 1_000_000) + 1;

  const [tx] = await opts.app.db
    .insert(schema.financialTransactions)
    .values({
      memberId,
      kind: "advance_payment",
      direction: "inflow",
      amount: opts.amount,
      currency,
      paymentMethod: "cash",
      transactionDate: dateOffset(-3),
      effectiveDate: dateOffset(-3),
      branchId: opts.branchId,
      recordedBy: opts.recordedBy,
      miscReason: opts.miscReason,
      notes: opts.notes,
      voidedAt: opts.voided ? new Date() : null,
    })
    .$returningId();

  const [balance] = await opts.app.db
    .insert(schema.balances)
    .values({
      memberId,
      targetKind: "debt_balance",
      targetId,
      currency,
      amount: opts.amount,
    })
    .$returningId();

  await opts.app.db.insert(schema.transactionLinks).values({
    transactionId: tx.id,
    targetKind: "debt_balance",
    targetId,
    allocatedAmount: opts.amount,
  });

  return { memberId, balanceId: balance.id, targetId, txId: tx.id };
}

/**
 * Link an ADDITIONAL advance_payment transaction to an existing debt_balance
 * targetId (same member). Used to build the multiple-origin / void+recreate
 * scenarios: the recreated (higher-id) leg links to the same debt_balance.
 */
async function addAdvancePaymentToDebt(opts: {
  app: FastifyInstance;
  memberId: number;
  branchId: number;
  recordedBy: number;
  targetId: number;
  amount: number;
  miscReason: "sin_plan" | "otro";
  notes: string | null;
  currency?: "ARS" | "EUR";
  voided?: boolean;
}): Promise<number> {
  const currency = opts.currency ?? "ARS";
  const [tx] = await opts.app.db
    .insert(schema.financialTransactions)
    .values({
      memberId: opts.memberId,
      kind: "advance_payment",
      direction: "inflow",
      amount: opts.amount,
      currency,
      paymentMethod: "cash",
      transactionDate: dateOffset(-2),
      effectiveDate: dateOffset(-2),
      branchId: opts.branchId,
      recordedBy: opts.recordedBy,
      miscReason: opts.miscReason,
      notes: opts.notes,
      voidedAt: opts.voided ? new Date() : null,
    })
    .$returningId();

  await opts.app.db.insert(schema.transactionLinks).values({
    transactionId: tx.id,
    targetKind: "debt_balance",
    targetId: opts.targetId,
    allocatedAmount: opts.amount,
  });

  return tx.id;
}

async function seedDebtBalance(opts: {
  app: FastifyInstance;
  branchId: number;
  amount: number;
  currency?: "ARS" | "EUR";
  memberFirstName?: string;
  memberLastName?: string;
}): Promise<{ memberId: number; balanceId: number }> {
  const memberRes = await registerUser(opts.app, {
    email: `member-debt-${nextSuffix("D")}@test.local`,
    password: "pass123456",
    firstName: opts.memberFirstName ?? "Debt",
    lastName: opts.memberLastName ?? "Member",
    branchId: opts.branchId,
  });
  const memberId = (memberRes.user as { id: number }).id;

  // target_id for debt_balance has no FK; use a synthetic id (not 0,
  // because some MySQL configurations reject 0 in NOT NULL int columns).
  const syntheticTargetId = Math.floor(Math.random() * 1_000_000) + 1;
  const [inserted] = await opts.app.db
    .insert(schema.balances)
    .values({
      memberId,
      targetKind: "debt_balance",
      targetId: syntheticTargetId,
      currency: opts.currency ?? "ARS",
      amount: opts.amount,
    })
    .$returningId();
  return { memberId, balanceId: inserted.id };
}

async function clearLedger(app: FastifyInstance): Promise<void> {
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query("DELETE FROM `transaction_links`");
    await conn.query("DELETE FROM `financial_transactions`");
    await conn.query("DELETE FROM `balances`");
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
}

describe("Reports API — GET /outstanding-balances (Phase 109-02)", () => {
  let app: FastifyInstance;
  const ctx = {} as SeededContext;

  beforeAll(async () => {
    app = await createTestApp();
    const seeded = await seedFixtures(app);
    Object.assign(ctx, seeded);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await clearLedger(app);
    // re-seed branches (cleanAllTestData wipes them per layer-3 ordering)
    const seeded = await seedFixtures(app);
    Object.assign(ctx, seeded);
    await seedRolesAndPlans(app, ctx);
  });

  // ─── RBAC matrix ─────────────────────────────────────────────────────────

  it("RBAC1: coach receives 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("RBAC2: recepcion receives 403 (CAJA_ROLES excludes recepcion)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.recepcionArToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("RBAC3: gestion receives 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("RBAC4: admin receives 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.adminArToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("RBAC5: owner receives 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  // ─── Empty / shape ───────────────────────────────────────────────────────

  it("EMPTY: empty result returns zeroed BucketTotals (non-owner flat shape)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.bucketTotals).toEqual({
      "0-5": 0,
      "6-10": 0,
      "11-15": 0,
      "15+": 0,
    });
  });

  // ─── Bucket boundaries (D-05) ───────────────────────────────────────────

  it("BUCKETS: bucket math matches D-05 boundaries (5/6/10/11/15/16)", async () => {
    // Seed 6 subscription-backed balances at the canonical boundary days.
    const boundaries: Array<{ offset: number; bucket: string }> = [
      { offset: -5, bucket: "0-5" },
      { offset: -6, bucket: "6-10" },
      { offset: -10, bucket: "6-10" },
      { offset: -11, bucket: "11-15" },
      { offset: -15, bucket: "11-15" },
      { offset: -16, bucket: "15+" },
    ];
    for (const b of boundaries) {
      await seedSubscriptionWithBalance({
        app,
        branchId: ctx.arBranchId,
        planId: ctx.planArId,
        planCurrency: "ARS",
        startDateOffsetDays: b.offset,
        amount: 1000,
      });
    }

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances?limit=200`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(6);

    // Map by ageInDays for stable lookup.
    const byAge = new Map<number, { bucket: string; ageInDays: number }>();
    for (const r of body.rows) byAge.set(r.ageInDays, r);
    expect(byAge.get(5)?.bucket).toBe("0-5");
    expect(byAge.get(6)?.bucket).toBe("6-10");
    expect(byAge.get(10)?.bucket).toBe("6-10");
    expect(byAge.get(11)?.bucket).toBe("11-15");
    expect(byAge.get(15)?.bucket).toBe("11-15");
    expect(byAge.get(16)?.bucket).toBe("15+");
  });

  // ─── Plan programado a futuro = deuda cobrable HOY ──────────────────────
  // Un plan programado a futuro (`scheduled`) se carga con la condición de
  // pagar AHORA (membresía futura a precio menor atada al pago inmediato). Su
  // saldo ES deuda cobrable hoy → DEBE aparecer en Deudas, con antigüedad
  // contada desde que se creó la deuda (no desde el devengo/start_date).

  it("FUTURE-PLAN-INCLUDED: un plan programado a futuro con saldo aparece como deuda hoy", async () => {
    // Plan scheduled que arranca en +30d; la deuda se creó hace 7 días.
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: 30,
      subscriptionStatus: "scheduled",
      balanceCreatedOffsetDays: -7,
      amount: 560000,
      memberFirstName: "Zurita",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].amount).toBe(560000);
    // Antigüedad desde la creación (7d), no clampeada a 0 por el devengo futuro.
    expect(body.rows[0].ageInDays).toBe(7);
    expect(body.rows[0].bucket).toBe("6-10");
    // El devengo (start_date futuro) se conserva en effectiveDate.
    expect(body.rows[0].effectiveDate).toBe(dateOffset(30));
    expect(body.bucketTotals).toEqual({
      "0-5": 0,
      "6-10": 560000,
      "11-15": 0,
      "15+": 0,
    });
  });

  it("FUTURE-PLAN-MIXED: planes futuros y ya iniciados conviven en Deudas", async () => {
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -10,
      amount: 1000,
      memberFirstName: "YaIniciado",
    });
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: 20,
      subscriptionStatus: "scheduled",
      balanceCreatedOffsetDays: -3,
      amount: 500000,
      memberFirstName: "PlanFuturo",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(2);
    // Ambos suman en sus buckets (por antigüedad de creación): 10d y 3d.
    expect(body.bucketTotals).toEqual({
      "0-5": 500000,
      "6-10": 1000,
      "11-15": 0,
      "15+": 0,
    });
  });

  // ─── Bug 2: antigüedad desde la creación de la deuda, no el devengo ──────

  it("AGE-FROM-CREATION: ageInDays se mide desde balances.createdAt, no desde start_date (devengo)", async () => {
    // Devengo 60 días atrás, pero la deuda se creó hace 3 días (carga tardía /
    // back-dated). La antigüedad debe ser ~3, no ~60; el devengo se conserva
    // en effectiveDate.
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -60,
      balanceCreatedOffsetDays: -3,
      amount: 1000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].ageInDays).toBe(3);
    expect(body.rows[0].bucket).toBe("0-5");
    // El devengo (columna "fecha de devengo") sigue siendo el start_date.
    expect(body.rows[0].effectiveDate).toBe(dateOffset(-60));
  });

  // ─── Sorting ─────────────────────────────────────────────────────────────

  it("SORT: default sort is ageInDays DESC (oldest first)", async () => {
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -10,
      amount: 1000,
    });
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -100,
      amount: 1000,
    });
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -50,
      amount: 1000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(3);
    for (let i = 1; i < body.rows.length; i++) {
      expect(body.rows[i - 1].ageInDays).toBeGreaterThanOrEqual(
        body.rows[i].ageInDays,
      );
    }
    expect(body.rows[0].ageInDays).toBe(100);
  });

  // ─── Filters ─────────────────────────────────────────────────────────────

  it("FILTER-BRANCH: branchId filter restricts to that branch only", async () => {
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -10,
      amount: 1000,
      memberFirstName: "BranchA",
    });
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchBId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -10,
      amount: 2000,
      memberFirstName: "BranchB",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances?branchId=${ctx.arBranchId}`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].branchId).toBe(ctx.arBranchId);
    expect(body.rows[0].memberName).toContain("BranchA");
  });

  it("FILTER-BRANCH-EXCLUDES-DEBT: branchId filter excludes debt_balance rows (no branch)", async () => {
    // One debt_balance (no branch) + one subscription on AR branch.
    await seedDebtBalance({
      app,
      branchId: ctx.arBranchId,
      amount: 5000,
    });
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -5,
      amount: 1000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances?branchId=${ctx.arBranchId}`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].targetKind).toBe("subscription");
  });

  it("FILTER-CURRENCY: currency filter restricts rows (owner)", async () => {
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -10,
      amount: 1000,
    });
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.esBranchId,
      planId: ctx.planEsId,
      planCurrency: "EUR",
      startDateOffsetDays: -10,
      amount: 200,
    });

    // Owner without ?country sees both, then filters by currency.
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances?currency=ARS`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].currency).toBe("ARS");
  });

  it("FILTER-SEARCH: search by member name (partial match)", async () => {
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -10,
      amount: 1000,
      memberFirstName: "Juan",
      memberLastName: "Perez",
    });
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -10,
      amount: 1000,
      memberFirstName: "Maria",
      memberLastName: "Garcia",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances?search=Juan`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].memberName).toContain("Juan");
  });

  // ─── Pagination ──────────────────────────────────────────────────────────

  it("PAGINATION: 75 rows → page 1 returns 50, page 2 returns 25", async () => {
    // Seed 75 sub-backed balances (different ages so sort is well-defined).
    for (let i = 0; i < 75; i++) {
      await seedSubscriptionWithBalance({
        app,
        branchId: ctx.arBranchId,
        planId: ctx.planArId,
        planCurrency: "ARS",
        startDateOffsetDays: -1 - i, // ages 1..75
        amount: 1000,
      });
    }

    const res1 = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();
    expect(body1.total).toBe(75);
    expect(body1.rows).toHaveLength(50);
    expect(body1.page).toBe(1);
    expect(body1.limit).toBe(50);

    const res2 = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances?page=2`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json();
    expect(body2.total).toBe(75);
    expect(body2.rows).toHaveLength(25);
    expect(body2.page).toBe(2);
  }, 60_000);

  // ─── Multi-currency (D-06) ───────────────────────────────────────────────

  it("OWNER-MULTI-CURRENCY: bucketTotals keyed by currency for owner across ARS+EUR", async () => {
    // ARS in '6-10' bucket
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -8,
      amount: 1500,
    });
    // EUR in '11-15' bucket
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.esBranchId,
      planId: ctx.planEsId,
      planCurrency: "EUR",
      startDateOffsetDays: -13,
      amount: 800,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bucketTotals).toEqual({
      ARS: { "0-5": 0, "6-10": 1500, "11-15": 0, "15+": 0 },
      EUR: { "0-5": 0, "6-10": 0, "11-15": 800, "15+": 0 },
    });
  });

  it("NON-OWNER-FLAT: bucketTotals flat for gestion in own country only", async () => {
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -8,
      amount: 1500,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bucketTotals).toEqual({
      "0-5": 0,
      "6-10": 1500,
      "11-15": 0,
      "15+": 0,
    });
  });

  // ─── debt_balance via LEFT JOIN ──────────────────────────────────────────

  it("DEBT-BALANCE: target_kind='debt_balance' row preserved through LEFT JOIN (owner sees all)", async () => {
    // debt_balance rows have no branch, so they're excluded whenever a
    // country filter is active (non-owner is locked to own country, which
    // applies the filter through branches.country). Owner without ?country
    // skips the country filter entirely (per route handler), so the LEFT
    // JOIN preservation is observable.
    await seedDebtBalance({
      app,
      branchId: ctx.arBranchId,
      amount: 7777,
      currency: "ARS",
      memberFirstName: "Saldo",
      memberLastName: "Libre",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    const r = body.rows[0];
    expect(r.targetKind).toBe("debt_balance");
    expect(r.branchId).toBeNull();
    expect(r.branchName).toBeNull();
    expect(r.conceptLabel).toBe("Saldo a regularizar");
    expect(r.amount).toBe(7777);
  });

  // ─── Cross-country / scope ───────────────────────────────────────────────

  it("CROSS-COUNTRY: non-owner from AR with only ES seeds → empty result (no 403)", async () => {
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.esBranchId,
      planId: ctx.planEsId,
      planCurrency: "EUR",
      startDateOffsetDays: -10,
      amount: 1000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    // Semantically correct empty filter — gestion in AR sees no ES rows.
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
  });

  // ─── Hard guards ─────────────────────────────────────────────────────────

  it("AMOUNT-ZERO-EXCLUDED: balance with amount=0 is not in rows (WHERE amount > 0)", async () => {
    // Seed one positive + one zero balance.
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -10,
      amount: 1000,
    });
    // Zero-amount via direct insert (not via seedSubscriptionWithBalance,
    // which sets amount=opts.amount on both subscription and balance).
    const memberZero = await registerUser(app, {
      email: `member-zero-${nextSuffix("Z")}@test.local`,
      password: "pass123456",
      firstName: "Zero",
      lastName: "Balance",
      branchId: ctx.arBranchId,
    });
    const memberZeroId = (memberZero.user as { id: number }).id;
    const [zeroSub] = await app.db
      .insert(schema.subscriptions)
      .values({
        userId: memberZeroId,
        planId: ctx.planArId,
        branchId: ctx.arBranchId,
        status: "active",
        startDate: dateOffset(-5),
        pricePaid: 0,
        currency: "ARS",
        priceTypeApplied: "regular",
      })
      .$returningId();
    await app.db.insert(schema.balances).values({
      memberId: memberZeroId,
      targetKind: "subscription",
      targetId: zeroSub.id,
      currency: "ARS",
      amount: 0,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].amount).toBe(1000);
  });

  // ─── Phase 153 — motivo / período / fecha de registro (DEUDA-01/02/03) ────

  it("REASON-CUOTA: subscription debt exposes reasonLabel 'Cuota <plan>' + period + registeredAt", async () => {
    const seeded = await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -10,
      endDateOffsetDays: 20,
      amount: 1000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    const r = body.rows[0];
    // DEUDA-02: motivo starts with "Cuota " and carries the plan name.
    expect(r.reasonLabel).toMatch(/^Cuota /);
    expect(r.reasonLabel).toBe("Cuota Plan AR Mensual");
    // DEUDA-03: period = subscription start/end range.
    expect(r.periodStart).toBe(seeded.startDate);
    expect(r.periodEnd).toBe(seeded.endDate);
    // DEUDA-01: registeredAt present in ISO YYYY-MM-DD.
    expect(r.registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // notes is only populated for cobros sueltos.
    expect(r.notes).toBeNull();
  });

  it("REASON-SIN-PLAN: cobro suelto origin 'sin_plan' → reasonLabel 'Sin plan' + notes, null period", async () => {
    const noteText = "Cobró un día suelto en la puerta";
    await seedDebtBalanceWithOrigin({
      app,
      branchId: ctx.arBranchId,
      recordedBy: ctx.ownerId,
      amount: 3000,
      miscReason: "sin_plan",
      notes: noteText,
      currency: "ARS",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    const r = body.rows[0];
    expect(r.targetKind).toBe("debt_balance");
    expect(r.reasonLabel).toBe("Sin plan");
    expect(r.notes).toBe(noteText);
    expect(r.periodStart).toBeNull();
    expect(r.periodEnd).toBeNull();
    expect(r.registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("REASON-OTRO: cobro suelto origin 'otro' → reasonLabel 'Otro'", async () => {
    await seedDebtBalanceWithOrigin({
      app,
      branchId: ctx.arBranchId,
      recordedBy: ctx.ownerId,
      amount: 4200,
      miscReason: "otro",
      notes: "Venta de indumentaria",
      currency: "ARS",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    const r = body.rows[0];
    expect(r.reasonLabel).toBe("Otro");
    expect(r.notes).toBe("Venta de indumentaria");
    expect(r.periodStart).toBeNull();
  });

  it("REASON-ORPHAN: debt_balance without origin transaction falls back to 'Saldo a regularizar'", async () => {
    await seedDebtBalance({
      app,
      branchId: ctx.arBranchId,
      amount: 999,
      currency: "ARS",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    const r = body.rows[0];
    expect(r.reasonLabel).toBe("Saldo a regularizar");
    expect(r.notes).toBeNull();
    expect(r.periodStart).toBeNull();
  });

  it("REGISTERED-AT: registeredAt = balance creation date, not the cycle effectiveDate", async () => {
    // Subscription cycle started 40 days ago (old effectiveDate) but the
    // balance row is created now (registeredAt ≈ today).
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -40,
      amount: 1000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    const r = body.rows[0];
    expect(r.registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // registeredAt is the balance createdAt (≈ today), distinct from the cycle
    // effectiveDate 40 days ago. Range check (not strict === today) so the
    // assertion is robust across the UTC/local day boundary.
    expect(r.registeredAt).not.toBe(r.effectiveDate);
    expect(r.registeredAt >= dateOffset(-1)).toBe(true);
    expect(r.registeredAt <= dateOffset(1)).toBe(true);
  });

  // ─── WR-04 / multiple origins — MIN(id) determinism over LIVE txs ─────────

  it("MULTI-ORIGIN: debt_balance with two LIVE linked advance_payments yields one row from the earliest (MIN id)", async () => {
    const { memberId, targetId } = await seedDebtBalanceWithOrigin({
      app,
      branchId: ctx.arBranchId,
      recordedBy: ctx.ownerId,
      amount: 3000,
      miscReason: "sin_plan",
      notes: "primera (id menor)",
      currency: "ARS",
    });
    // A second live advance_payment linked to the SAME debt_balance (higher id).
    await addAdvancePaymentToDebt({
      app,
      memberId,
      branchId: ctx.arBranchId,
      recordedBy: ctx.ownerId,
      targetId,
      amount: 3000,
      miscReason: "otro",
      notes: "segunda (id mayor)",
      currency: "ARS",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // GROUP BY guarantees a single row (no multiplication) …
    expect(body.rows).toHaveLength(1);
    // … and MIN(id) selects the earliest LIVE tx (the 'sin_plan' one).
    expect(body.rows[0].reasonLabel).toBe("Sin plan");
    expect(body.rows[0].notes).toBe("primera (id menor)");
  });

  it("VOIDED-ORIGIN: the anulada (lower id) is skipped; motivo/nota come from the recreated LIVE tx (WR-04)", async () => {
    // Void+recreate: the anulada leg has the LOWER id, the recreated the higher.
    const { memberId, targetId } = await seedDebtBalanceWithOrigin({
      app,
      branchId: ctx.arBranchId,
      recordedBy: ctx.ownerId,
      amount: 3000,
      miscReason: "sin_plan",
      notes: "ANULADA vieja",
      currency: "ARS",
      voided: true,
    });
    await addAdvancePaymentToDebt({
      app,
      memberId,
      branchId: ctx.arBranchId,
      recordedBy: ctx.ownerId,
      targetId,
      amount: 3000,
      miscReason: "otro",
      notes: "VIGENTE recreada",
      currency: "ARS",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    // Without the voided_at filter MIN(id) would pick the anulada ('Sin plan');
    // WR-04 makes it resolve to the live recreated tx instead.
    expect(body.rows[0].reasonLabel).toBe("Otro");
    expect(body.rows[0].notes).toBe("VIGENTE recreada");
  });

  // ─── Export columns (Phase 153 DEUDA-01/02/03) ───────────────────────────

  it("EXPORT-COLUMNS: xlsx export includes Motivo / Período / Fecha de registro with values", async () => {
    await seedSubscriptionWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      planCurrency: "ARS",
      startDateOffsetDays: -10,
      endDateOffsetDays: 20,
      amount: 1000,
      memberFirstName: "Export",
      memberLastName: "Cuota",
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/outstanding-balances/export`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);

    const wb = new Workbook();
    // res.rawPayload is a Node Buffer; exceljs's bundled Buffer type is the
    // non-generic one, so bridge through unknown (no `any`, per CLAUDE.md).
    await wb.xlsx.load(
      res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0],
    );
    const sheet = wb.getWorksheet("Deudas");
    expect(sheet).toBeDefined();

    // exceljs row.values is 1-indexed with a leading hole at index 0.
    const headerValues = sheet!.getRow(1).values as unknown[];
    expect(headerValues).toContain("Motivo");
    expect(headerValues).toContain("Período");
    expect(headerValues).toContain("Fecha de registro");

    // The first data row carries the derived motivo for the subscription debt.
    const dataRow = sheet!.getRow(2).values as unknown[];
    expect(dataRow).toContain("Cuota Plan AR Mensual");
  });
});
