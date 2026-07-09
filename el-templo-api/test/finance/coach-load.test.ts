/**
 * Phase 140 — coach PoS load endpoints integration tests.
 *
 * Exercises the dedicated coach-load plugin mounted at
 * /api/admin/finance/coach-load (gated by FINANCE_LOAD_ROLES, coach ∈) against
 * the per-worker test MySQL DB. Five tagged groups (run a subset with
 * `npx vitest run test/finance/coach-load.test.ts -t "<tag>"`):
 *
 *   - "auth"        — coach is blocked (403) from the existing finance
 *                     validate/void/list/summary endpoints (CARGA-04 / D-06/D-08).
 *   - "renew"       — coach renew → new sub period active + charge born
 *                     validation_status='pendiente' (CARGA-02 / Pitfall 1).
 *   - "idempotency" — same idempotencyKey twice → exactly ONE charge row,
 *                     second call returns the EXISTING row (200, not 500, not a
 *                     duplicate). Resolves the mysql2 ER_DUP_ENTRY shape
 *                     empirically (A1/Q3).
 *   - "autocompletar" — GET autocompletar returns the member's current plan
 *                     name + amount + currency (CARGA-01).
 *   - "cobro suelto" — POST misc → advance_payment born pendiente, empty links,
 *                     member balance untouched, AND a pendiente advance_payment
 *                     does NOT move getSummary monthlyRevenue (Pitfall 2).
 *
 * Fixtures use the canonical helpers in test/helpers.ts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  registerUser,
  ensureEfectivoCaja,
} from "../helpers";
import * as schema from "../../src/db/schema";

const COACH_LOAD_URL = "/api/admin/finance/coach-load";
const FINANCE_URL = "/api/admin/finance";

let app: FastifyInstance;
let adminToken: string;
let coachToken: string;
let adminId: number;
let branchId: number;
let memberId: number;
let planId: number;

/** Read a transaction row straight from the DB. */
async function readTx(id: number): Promise<{
  validationStatus: string;
  voidedAt: Date | null;
  kind: string;
  notes: string | null;
  miscReason: string | null;
  idempotencyKey: string | null;
  amount: number;
  cashRegisterId: number | null;
  branchId: number | null;
}> {
  const [row] = await app.db
    .select({
      validationStatus: schema.financialTransactions.validationStatus,
      voidedAt: schema.financialTransactions.voidedAt,
      kind: schema.financialTransactions.kind,
      notes: schema.financialTransactions.notes,
      miscReason: schema.financialTransactions.miscReason,
      idempotencyKey: schema.financialTransactions.idempotencyKey,
      amount: schema.financialTransactions.amount,
      cashRegisterId: schema.financialTransactions.cashRegisterId,
      branchId: schema.financialTransactions.branchId,
    })
    .from(schema.financialTransactions)
    .where(eq(schema.financialTransactions.id, id))
    .limit(1);
  return row;
}

/** Count non-voided financial_transactions rows for the seeded member. */
async function countMemberTx(): Promise<number> {
  const [row] = await app.db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.financialTransactions)
    .where(eq(schema.financialTransactions.memberId, memberId));
  return Number(row?.count ?? 0);
}

/** Seed a CURRENTLY-active subscription (future endDate) for autocompletar reads. */
async function seedCurrentSubscription(): Promise<number> {
  const start = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberId,
      planId,
      branchId,
      status: "active",
      startDate: start,
      endDate: future,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  return res.id;
}

/** Seed an outstanding debt balance row against a subscription (simulates an
 *  admin giving the plan de alta con deuda for the profe to collect on-site). */
async function seedSubscriptionDebt(
  subscriptionId: number,
  amount: number,
): Promise<void> {
  await app.db.insert(schema.balances).values({
    memberId,
    targetKind: "subscription",
    targetId: subscriptionId,
    currency: "ARS",
    amount,
  });
}

/** Seed an ACTIVE expired-yesterday subscription so renew creates a new active period. */
async function seedRenewableSubscription(): Promise<number> {
  // endDate in the past → renew births an immediately-active new period (the
  // renewBranchId resolution + a real charge run). pricePaid drives the
  // autocompletar amount + the renewal charge.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const start = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberId,
      planId,
      branchId,
      status: "active",
      startDate: start,
      endDate: yesterday,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  return res.id;
}

beforeAll(async () => {
  app = await createTestApp();

  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);
  adminId = admin.id;
  branchId = admin.branchId ?? 1;
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  await ensureEfectivoCaja(app, branchId, "ARS");

  await createStaffUser(app, {
    email: "coach-load@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Load",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, "coach-load@test.local", "pass123456");

  const [planRes] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Coach Load Plan",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 100000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();
  planId = planRes.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  // Clean finance + subscription state between tests on a SINGLE pooled
  // connection with FK checks disabled. FOREIGN_KEY_CHECKS is a per-connection
  // session variable, so the previous app.db.execute() version could route the
  // DELETEs across different pool connections — one with FK checks still ON —
  // and fail `DELETE FROM subscriptions` with ER_ROW_IS_REFERENCED_2 from
  // program_enrollments left behind by another test file sharing this
  // per-worker DB (isolate=false). Mirrors cleanAllTestData semantics.
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query("DELETE FROM `transaction_links`");
    await conn.query("DELETE FROM `financial_transactions`");
    await conn.query("DELETE FROM `balances`");
    await conn.query("DELETE FROM `audit_log`");
    await conn.query("DELETE FROM `bookings`");
    await conn.query("DELETE FROM `program_enrollments`");
    await conn.query("DELETE FROM `subscriptions`");
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }

  const member = await registerUser(app, {
    email: `coach-load-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Load",
    lastName: "Member",
    branchId,
  });
  memberId = (member.user as { id: number }).id;
});

// ─── auth (CARGA-04 / D-06/D-08): coach blocked from validate/void/list/summary ──
describe("coach-load auth boundary", () => {
  it("auth: coach 403 on POST /transactions/:id/validate", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/1/validate`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it("auth: coach 403 on POST /transactions/:id/observe", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/1/observe`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: { reason: "x" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("auth: coach 403 on POST /transactions/:id/void", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${FINANCE_URL}/transactions/1/void`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: { reason: "x" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("auth: coach 403 on GET /transactions (full list / saldos)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("auth: coach 403 on GET /transactions/summary", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("auth: coach CAN reach the coach-load plugin (not 403)", async () => {
    // A coach hitting the load plugin must pass the guard. With no body it 400s
    // on schema validation — the point is it is NOT 403 (the guard let it in).
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {},
    });
    expect(res.statusCode).not.toBe(403);
  });

  it("auth: member token 403 on the coach-load plugin", async () => {
    const member = await registerUser(app, {
      email: `coach-load-outsider-${Date.now()}@test.local`,
      password: "TestPass123!",
      firstName: "Out",
      lastName: "Sider",
      branchId,
    });
    const res = await app.inject({
      method: "GET",
      url: `${COACH_LOAD_URL}/mis-cargas`,
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── renew (CARGA-02 / Pitfall 1): coach renew → pendiente charge ──
describe("coach-load renew", () => {
  it("renew: coach renew creates a new active sub period + charge born pendiente", async () => {
    await seedRenewableSubscription();

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberId,
        paymentMethod: "cash",
        idempotencyKey: `renew-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(201);

    // A new active period exists.
    const active = await app.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, memberId),
          eq(schema.subscriptions.status, "active"),
        ),
      );
    expect(active.length).toBeGreaterThanOrEqual(1);

    // The renewal charge is born PENDIENTE (server-derived from the coach role).
    const [charge] = await app.db
      .select({
        id: schema.financialTransactions.id,
        validationStatus: schema.financialTransactions.validationStatus,
        kind: schema.financialTransactions.kind,
      })
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.memberId, memberId))
      .limit(1);
    expect(charge).toBeTruthy();
    expect(charge.validationStatus).toBe("pendiente");
    expect(charge.kind).toBe("plan_charge");
  });

  it("renew: 404 when the member has no subscription to renew", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberId,
        paymentMethod: "cash",
        idempotencyKey: `renew-none-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ─── pay-plan settle: outstanding debt → debt_settlement, NO new period ──
describe("coach-load pay-plan settle debt", () => {
  it("settle: outstanding debt → debt_settlement born pendiente, balance cleared, no new period", async () => {
    const subId = await seedCurrentSubscription();
    await seedSubscriptionDebt(subId, 100000);

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberId,
        paymentMethod: "cash",
        idempotencyKey: `settle-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);

    // The charge is a debt_settlement born PENDIENTE (coach), NOT a plan_charge.
    const row = await readTx(body.transaction.id);
    expect(row.kind).toBe("debt_settlement");
    expect(row.validationStatus).toBe("pendiente");
    expect(row.amount).toBe(100000);

    // It is linked to the subscription so applyDelta reduced the debt to zero.
    const links = await app.db
      .select({
        targetKind: schema.transactionLinks.targetKind,
        targetId: schema.transactionLinks.targetId,
      })
      .from(schema.transactionLinks)
      .where(eq(schema.transactionLinks.transactionId, body.transaction.id));
    expect(links).toEqual([{ targetKind: "subscription", targetId: subId }]);

    const [balance] = await app.db
      .select({ amount: schema.balances.amount })
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.memberId, memberId),
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, subId),
        ),
      );
    expect(balance.amount).toBe(0);

    // No new period was created — still exactly the one seeded subscription.
    const subs = await app.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, memberId));
    expect(subs.length).toBe(1);
  });

  it("settle: partial payment leaves the remaining debt", async () => {
    const subId = await seedCurrentSubscription();
    await seedSubscriptionDebt(subId, 100000);

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberId,
        amountReceived: 40000,
        paymentMethod: "cash",
        idempotencyKey: `settle-partial-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(201);

    const [balance] = await app.db
      .select({ amount: schema.balances.amount })
      .from(schema.balances)
      .where(
        and(
          eq(schema.balances.memberId, memberId),
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.balances.targetId, subId),
        ),
      );
    expect(balance.amount).toBe(60000);
  });

  it("settle: 400 when amountReceived exceeds the outstanding debt", async () => {
    const subId = await seedCurrentSubscription();
    await seedSubscriptionDebt(subId, 50000);

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberId,
        amountReceived: 80000,
        paymentMethod: "cash",
        idempotencyKey: `settle-over-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── idempotency (CARGA-02 / D-09): double-tap is a no-op returning the existing row ──
describe("coach-load idempotency", () => {
  it("idempotency: same renew key twice → ONE charge row, second returns existing", async () => {
    await seedRenewableSubscription();
    const key = `idem-renew-${Date.now()}`;
    const payload = {
      userId: memberId,
      paymentMethod: "cash" as const,
      idempotencyKey: key,
    };

    const first = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const firstBody = JSON.parse(first.body);

    const second = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload,
    });
    // No 500: the duplicate is caught and the existing row is returned.
    expect(second.statusCode).toBe(200);
    const secondBody = JSON.parse(second.body);

    // Exactly ONE charge row carries the key.
    const rows = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.idempotencyKey, key));
    expect(rows.length).toBe(1);

    // Both responses point at the same charge.
    expect(secondBody.transaction.id).toBe(firstBody.transaction.id);
  });

  it("idempotency: same misc key twice → ONE advance_payment row, second returns existing", async () => {
    const key = `idem-misc-${Date.now()}`;
    const payload = {
      memberId,
      amount: 5000,
      concepto: "Cobro suelto idempotente",
      paymentMethod: "cash" as const,
      currency: "ARS",
      idempotencyKey: key,
      miscReason: "otro" as const,
    };

    const first = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const firstBody = JSON.parse(first.body);

    const second = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = JSON.parse(second.body);

    const rows = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.idempotencyKey, key));
    expect(rows.length).toBe(1);
    expect(secondBody.transaction.id).toBe(firstBody.transaction.id);
  });
});

// ─── autocompletar (CARGA-01): current plan + amount + currency ──
describe("coach-load autocompletar", () => {
  it("autocompletar: returns current plan name + amount + currency", async () => {
    await seedCurrentSubscription();

    const res = await app.inject({
      method: "GET",
      url: `${COACH_LOAD_URL}/autocompletar/${memberId}`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.hasRenewable).toBe(true);
    expect(body.planName).toBe("Coach Load Plan");
    expect(body.amount).toBe(100000);
    expect(body.currency).toBe("ARS");
    // No debt on the seeded sub → intent renovación, amount = plan price.
    expect(body.intent).toBe("renew");
    expect(body.outstanding).toBe(0);
  });

  it("autocompletar: with outstanding debt → intent 'settle', amount = debt", async () => {
    const subId = await seedCurrentSubscription();
    await seedSubscriptionDebt(subId, 30000);

    const res = await app.inject({
      method: "GET",
      url: `${COACH_LOAD_URL}/autocompletar/${memberId}`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.hasRenewable).toBe(true);
    expect(body.intent).toBe("settle");
    expect(body.outstanding).toBe(30000);
    // Pre-fills the debt, NOT the full plan price.
    expect(body.amount).toBe(30000);
  });

  it("autocompletar: hasRenewable=false when the member has no active sub", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${COACH_LOAD_URL}/autocompletar/${memberId}`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.hasRenewable).toBe(false);
  });
});

// ─── cobro suelto (CARGA-03 / Pitfall 2): advance_payment pendiente, balance untouched, no firm revenue ──
describe("coach-load cobro suelto", () => {
  it("cobro suelto: advance_payment born pendiente, empty links, balance untouched", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 7000,
        concepto: "Suplemento proteína",
        paymentMethod: "cash",
        currency: "ARS",
        idempotencyKey: `misc-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    const row = await readTx(body.transaction.id);

    expect(row.kind).toBe("advance_payment");
    expect(row.validationStatus).toBe("pendiente");
    expect(row.notes).toBe("Suplemento proteína");
    expect(row.miscReason).toBe("otro");

    // No links → member balance untouched (applyDelta no-ops on empty links).
    const balances = await app.db
      .select({ id: schema.balances.id })
      .from(schema.balances)
      .where(eq(schema.balances.memberId, memberId));
    expect(balances.length).toBe(0);

    const linkRows = await app.db
      .select({ id: schema.transactionLinks.id })
      .from(schema.transactionLinks)
      .where(eq(schema.transactionLinks.transactionId, body.transaction.id));
    expect(linkRows.length).toBe(0);
  });

  it("cobro suelto: Pitfall 2 — a pendiente advance_payment does NOT move monthlyRevenue", async () => {
    // Read the admin summary before + after a coach cobro suelto. A pendiente
    // advance_payment is excluded by firmMoneyConditions(), so monthlyRevenue
    // must not change.
    const before = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const beforeRevenue = JSON.parse(before.body).monthlyRevenue;

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 9000,
        concepto: "Suplemento creatina",
        paymentMethod: "cash",
        currency: "ARS",
        idempotencyKey: `misc-revenue-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode).toBe(201);

    const after = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/transactions/summary`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const afterRevenue = JSON.parse(after.body).monthlyRevenue;
    const afterByKind = JSON.parse(after.body).revenueByKind;

    expect(afterRevenue).toBe(beforeRevenue);
    expect(afterByKind.advance_payment).toBe(0);
  });

  it("cobro suelto: miscReason 'sin_plan' persists in misc_reason column, NOT in notes", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 6000,
        concepto: "Clase suelta",
        paymentMethod: "cash",
        currency: "ARS",
        idempotencyKey: `misc-reason-${Date.now()}`,
        miscReason: "sin_plan",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    const row = await readTx(body.transaction.id);

    // Structured column carries the motivo…
    expect(row.miscReason).toBe("sin_plan");
    // …and notes stays the free-text concepto (motivo NOT folded into notes).
    expect(row.notes).toBe("Clase suelta");
  });

  it("cobro suelto: a body WITHOUT miscReason is rejected with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 6000,
        concepto: "Sin motivo",
        paymentMethod: "cash",
        currency: "ARS",
        idempotencyKey: `misc-nomotivo-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("cobro suelto: a miscReason outside the enum is rejected with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 6000,
        concepto: "Motivo inválido",
        paymentMethod: "cash",
        currency: "ARS",
        idempotencyKey: `misc-badmotivo-${Date.now()}`,
        miscReason: "foo",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── caja sugerida (CAJA-01): la caja nace de la sede del PROFE, no del socio ──
describe("coach-load caja sugerida por sede del profe", () => {
  let branchB: number; // sede del SOCIO (distinta a la del profe = branchId/sede A)
  let memberB: number; // socio de sede B
  let efectivoAId: number; // caja efectivo de la sede del profe (A)
  let efectivoBId: number; // caja efectivo de la sede del socio (B)
  let bancoArsId: number; // caja banco ARS (transfer/card)

  /** Read the efectivo caja id of a branch (seeded by ensureEfectivoCaja). */
  async function efectivoCajaId(branch: number): Promise<number> {
    const [row] = await app.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          eq(schema.cashRegisters.type, "efectivo"),
          eq(schema.cashRegisters.branchId, branch),
        ),
      )
      .limit(1);
    return row.id;
  }

  beforeAll(async () => {
    // Sede B (la del socio) — distinta a la del profe (sede A = branchId global).
    const [b] = await app.db
      .insert(schema.branches)
      .values({
        name: "Caja Sugerida B",
        code: `CSB${Date.now().toString(36).slice(-6)}`,
        country: "AR",
        isVirtual: false,
        isActive: true,
      })
      .$returningId();
    branchB = b.id;
    await ensureEfectivoCaja(app, branchB, "ARS");
    efectivoAId = await efectivoCajaId(branchId);
    efectivoBId = await efectivoCajaId(branchB);

    // Caja banco ARS para los métodos transfer/card (banco por moneda).
    const existingBanco = await app.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          eq(schema.cashRegisters.type, "banco"),
          eq(schema.cashRegisters.currency, "ARS"),
        ),
      )
      .limit(1);
    if (existingBanco.length > 0) {
      bancoArsId = existingBanco[0].id;
    } else {
      const [banco] = await app.db
        .insert(schema.cashRegisters)
        .values({
          name: "Banco ARS",
          type: "banco",
          branchId: null,
          currency: "ARS",
          cutoffDate: "2020-01-01",
        })
        .$returningId();
      bancoArsId = banco.id;
    }
  });

  beforeEach(async () => {
    // Socio de sede B (el beforeEach global ya creó un socio de sede A).
    const member = await registerUser(app, {
      email: `caja-sugerida-member-${Date.now()}@test.local`,
      password: "TestPass123!",
      firstName: "Caja",
      lastName: "SocioB",
      branchId: branchB,
    });
    memberB = (member.user as { id: number }).id;
  });

  it("misc cash: profe de sede A cobra a socio de sede B → caja efectivo de A, branch_id de B", async () => {
    expect(efectivoAId).not.toBe(efectivoBId); // sanity: distintas cajas
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId: memberB,
        amount: 8000,
        concepto: "Cobro suelto cross-sede",
        paymentMethod: "cash",
        currency: "ARS",
        idempotencyKey: `caja-misc-cash-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode).toBe(201);
    const row = await readTx(JSON.parse(res.body).transaction.id);
    // La caja sugerida es la EFECTIVO de la sede del PROFE (A), no la del socio (B).
    expect(row.cashRegisterId).toBe(efectivoAId);
    // El branch_id comercial (ledger) sigue siendo el de la sede del SOCIO (B).
    expect(row.branchId).toBe(branchB);
  });

  it("misc transfer: caja banco por moneda (sin regresión, sede del profe es moot)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId: memberB,
        amount: 8000,
        concepto: "Cobro suelto transfer",
        paymentMethod: "transfer",
        currency: "ARS",
        bankAccountId: bancoArsId,
        idempotencyKey: `caja-misc-transfer-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode).toBe(201);
    const row = await readTx(JSON.parse(res.body).transaction.id);
    expect(row.cashRegisterId).toBe(bancoArsId);
    expect(row.branchId).toBe(branchB);
  });

  it("settle cash: deuda saldada por profe de A → caja efectivo de A, branch_id de B", async () => {
    // Sub vigente con deuda para el socio de sede B.
    const start = new Date().toISOString().split("T")[0];
    const future = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const [sub] = await app.db
      .insert(schema.subscriptions)
      .values({
        userId: memberB,
        planId,
        branchId: branchB,
        status: "active",
        startDate: start,
        endDate: future,
        pricePaid: 100000,
        currency: "ARS",
        priceTypeApplied: "regular",
      })
      .$returningId();
    await app.db.insert(schema.balances).values({
      memberId: memberB,
      targetKind: "subscription",
      targetId: sub.id,
      currency: "ARS",
      amount: 50000,
    });

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberB,
        paymentMethod: "cash",
        idempotencyKey: `caja-settle-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(201);
    const row = await readTx(JSON.parse(res.body).transaction.id);
    expect(row.kind).toBe("debt_settlement");
    expect(row.cashRegisterId).toBe(efectivoAId);
    expect(row.branchId).toBe(branchB);
  });

  it("renew cash: renovación de socio de sede B por profe de A → plan_charge en caja efectivo de A", async () => {
    // Sub expirada ayer → renew crea un período activo nuevo + charge real.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const startOld = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    await app.db.insert(schema.subscriptions).values({
      userId: memberB,
      planId,
      branchId: branchB,
      status: "active",
      startDate: startOld,
      endDate: yesterday,
      pricePaid: 100000,
      currency: "ARS",
      priceTypeApplied: "regular",
    });

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberB,
        paymentMethod: "cash",
        idempotencyKey: `caja-renew-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(201);

    const [charge] = await app.db
      .select({
        cashRegisterId: schema.financialTransactions.cashRegisterId,
        branchId: schema.financialTransactions.branchId,
        kind: schema.financialTransactions.kind,
      })
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.memberId, memberB))
      .limit(1);
    expect(charge.kind).toBe("plan_charge");
    // CAJA-01: el plan_charge de la renovación nace en la caja efectivo del PROFE (A).
    expect(charge.cashRegisterId).toBe(efectivoAId);
    // El branch_id sigue siendo el del socio (renew lo deriva de currentSub.branchId = B).
    expect(charge.branchId).toBe(branchB);
  });
});

// ─── mis-cargas (D-07): only the calling coach's own loads ──
describe("coach-load mis-cargas", () => {
  it("mis-cargas: returns only the calling coach's own loads (recordedBy forced to self)", async () => {
    // Coach load.
    await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 3000,
        concepto: "Carga del coach",
        paymentMethod: "cash",
        currency: "ARS",
        idempotencyKey: `mine-${Date.now()}`,
        miscReason: "sin_plan",
      },
    });

    // An admin-recorded charge against the SAME member must NOT show in the
    // coach's mis-cargas (recordedBy forced to the coach).
    await app.db.insert(schema.financialTransactions).values({
      memberId,
      kind: "advance_payment",
      direction: "inflow",
      amount: 4000,
      currency: "ARS",
      paymentMethod: "cash",
      transactionDate: new Date().toISOString().split("T")[0],
      effectiveDate: new Date().toISOString().split("T")[0],
      branchId,
      recordedBy: adminId,
      validationStatus: "validado",
    });

    const res = await app.inject({
      method: "GET",
      url: `${COACH_LOAD_URL}/mis-cargas`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Every returned row is recorded by the coach (never the admin's row).
    for (const row of body.rows) {
      expect(row.recordedBy).not.toBe(adminId);
    }
    expect(body.rows.length).toBe(1);

    // Regression (hora de carga): mis-cargas debe exponer createdAt como
    // timestamp ISO completo. La UI mostraba transactionDate (date-only), que
    // al formatearse como hora caía fijo en "09:00 p.m." (medianoche UTC → AR).
    const row = body.rows[0];
    expect(typeof row.createdAt).toBe("string");
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(row.createdAt).not.toBe(row.transactionDate);
  });
});

// ─── bankAccountId (COBRO-04): la cuenta banco elegida en la PoS se valida ─────
// server-side (banco + activa + moneda-match) y se imputa como cash_register del
// charge en las CUATRO rutas de cobro (settle, renew, misc, alta). El invariante
// v5.3 (additionalProperties:false, sin cashRegisterId en el body) se conserva.
describe("coach-load bankAccountId (COBRO-04)", () => {
  let bankArsId: number; // banco ARS activa (válida para un cobro ARS)
  let bankEurId: number; // banco EUR activa (mismatch de moneda para cobro ARS)
  let bankInactiveId: number; // banco ARS inactiva (rechazada)
  let efectivoId: number; // caja efectivo de la sede (type efectivo → rechazada)

  beforeAll(async () => {
    const stamp = Date.now().toString(36).slice(-6);
    const [ars] = await app.db
      .insert(schema.cashRegisters)
      .values({
        name: `COBRO04 Banco ARS ${stamp}`,
        type: "banco",
        branchId: null,
        currency: "ARS",
        cutoffDate: "2020-01-01",
      })
      .$returningId();
    bankArsId = ars.id;

    const [eur] = await app.db
      .insert(schema.cashRegisters)
      .values({
        name: `COBRO04 Banco EUR ${stamp}`,
        type: "banco",
        branchId: null,
        currency: "EUR",
        cutoffDate: "2020-01-01",
      })
      .$returningId();
    bankEurId = eur.id;

    const [inactive] = await app.db
      .insert(schema.cashRegisters)
      .values({
        name: `COBRO04 Banco ARS inactiva ${stamp}`,
        type: "banco",
        branchId: null,
        currency: "ARS",
        isActive: false,
        cutoffDate: "2020-01-01",
      })
      .$returningId();
    bankInactiveId = inactive.id;

    const [efectivo] = await app.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          eq(schema.cashRegisters.type, "efectivo"),
          eq(schema.cashRegisters.branchId, branchId),
        ),
      )
      .limit(1);
    efectivoId = efectivo.id;
  });

  // ── Matriz de rechazo (400) sobre /misc como representante ───────────────────
  it("reject: transfer WITHOUT a bankAccountId → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 8000,
        concepto: "Transfer sin cuenta",
        paymentMethod: "transfer",
        currency: "ARS",
        idempotencyKey: `bank-no-acct-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("reject: an INACTIVE bank account → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 8000,
        concepto: "Cuenta inactiva",
        paymentMethod: "transfer",
        currency: "ARS",
        bankAccountId: bankInactiveId,
        idempotencyKey: `bank-inactive-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("reject: an EFECTIVO-type account id → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 8000,
        concepto: "Caja efectivo no es banco",
        paymentMethod: "transfer",
        currency: "ARS",
        bankAccountId: efectivoId,
        idempotencyKey: `bank-efectivo-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("reject: an EUR account for an ARS charge (currency mismatch) → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 8000,
        concepto: "Moneda inconsistente",
        paymentMethod: "transfer",
        currency: "ARS",
        bankAccountId: bankEurId,
        idempotencyKey: `bank-eur-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("reject: cash WITH a bankAccountId → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 8000,
        concepto: "Cash no lleva cuenta",
        paymentMethod: "cash",
        currency: "ARS",
        bankAccountId: bankArsId,
        idempotencyKey: `bank-cash-acct-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── Imputación persistida en las CUATRO rutas (una aserción explícita por ruta) ─
  it("persist /misc: a valid account is imputed as the charge cashRegisterId", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount: 8000,
        concepto: "Transfer con cuenta",
        paymentMethod: "transfer",
        currency: "ARS",
        bankAccountId: bankArsId,
        idempotencyKey: `bank-misc-ok-${Date.now()}`,
        miscReason: "otro",
      },
    });
    expect(res.statusCode).toBe(201);
    const row = await readTx(JSON.parse(res.body).transaction.id);
    expect(row.cashRegisterId).toBe(bankArsId);
  });

  it("persist /pay-plan settle: a valid account is imputed as the settlement cashRegisterId", async () => {
    const subId = await seedCurrentSubscription();
    await seedSubscriptionDebt(subId, 100000);

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberId,
        paymentMethod: "transfer",
        bankAccountId: bankArsId,
        idempotencyKey: `bank-settle-ok-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(201);
    const row = await readTx(JSON.parse(res.body).transaction.id);
    expect(row.kind).toBe("debt_settlement");
    expect(row.cashRegisterId).toBe(bankArsId);
  });

  it("persist /pay-plan renew: a valid account is imputed as the renewal charge cashRegisterId", async () => {
    // Sub activa NON-indebted expirada ayer → el handler toma la rama RENEW.
    await seedRenewableSubscription();

    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberId,
        paymentMethod: "transfer",
        bankAccountId: bankArsId,
        idempotencyKey: `bank-renew-ok-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(201);

    const [charge] = await app.db
      .select({
        cashRegisterId: schema.financialTransactions.cashRegisterId,
        kind: schema.financialTransactions.kind,
      })
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.memberId, memberId))
      .limit(1);
    expect(charge.kind).toBe("plan_charge");
    expect(charge.cashRegisterId).toBe(bankArsId);
  });

  it("persist /alta: a valid account is imputed as the plan charge cashRegisterId", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/alta`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberId,
        branchId,
        planId,
        paymentMethod: "transfer",
        amountReceived: 100000,
        bankAccountId: bankArsId,
        idempotencyKey: `bank-alta-ok-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(201);

    const [charge] = await app.db
      .select({
        cashRegisterId: schema.financialTransactions.cashRegisterId,
        kind: schema.financialTransactions.kind,
      })
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.memberId, memberId))
      .limit(1);
    expect(charge.kind).toBe("plan_charge");
    expect(charge.cashRegisterId).toBe(bankArsId);
  });

  // ── El guard cubre también las rutas delegadas (renew + alta) ────────────────
  it("reject /pay-plan renew: transfer WITHOUT a bankAccountId → 400", async () => {
    await seedRenewableSubscription();
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/pay-plan`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberId,
        paymentMethod: "transfer",
        idempotencyKey: `bank-renew-no-acct-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("reject /alta: transfer WITHOUT a bankAccountId → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/alta`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        userId: memberId,
        branchId,
        planId,
        paymentMethod: "transfer",
        amountReceived: 100000,
        idempotencyKey: `bank-alta-no-acct-${Date.now()}`,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // ── GET /bank-accounts coach-reachable + admin /cash-registers 403 ───────────
  it("GET /bank-accounts?currency=ARS (coach) → 200, includes the ARS account, excludes EUR + inactive", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${COACH_LOAD_URL}/bank-accounts?currency=ARS`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      accounts: Array<{ id: number; name: string; currency: string }>;
    };
    const ids = body.accounts.map((a) => a.id);
    expect(ids).toContain(bankArsId);
    expect(ids).not.toContain(bankEurId);
    expect(ids).not.toContain(bankInactiveId);
    // Solo se exponen campos lean (sin saldos) y todas de la moneda pedida.
    for (const a of body.accounts) {
      expect(a.currency).toBe("ARS");
      expect(Object.keys(a).sort()).toEqual(["currency", "id", "name"]);
    }
  });

  it("auth: a coach hitting the admin-only GET /cash-registers → 403 (why the new endpoint exists)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FINANCE_URL}/cash-registers`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
