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
import { eq, and, sql } from "drizzle-orm";
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
  idempotencyKey: string | null;
  amount: number;
}> {
  const [row] = await app.db
    .select({
      validationStatus: schema.financialTransactions.validationStatus,
      voidedAt: schema.financialTransactions.voidedAt,
      kind: schema.financialTransactions.kind,
      notes: schema.financialTransactions.notes,
      idempotencyKey: schema.financialTransactions.idempotencyKey,
      amount: schema.financialTransactions.amount,
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
  // Clean finance + subscription state between tests. FK checks off via the
  // raw connection so order is moot (mirrors cleanAllTestData semantics).
  await app.db.execute(sql`DELETE FROM transaction_links`);
  await app.db.execute(sql`DELETE FROM financial_transactions`);
  await app.db.execute(sql`DELETE FROM balances`);
  await app.db.execute(sql`DELETE FROM audit_log`);
  await app.db.execute(sql`DELETE FROM bookings`);
  await app.db.execute(sql`DELETE FROM subscriptions`);

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
      url: `${COACH_LOAD_URL}/renew`,
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
      url: `${COACH_LOAD_URL}/renew`,
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
      url: `${COACH_LOAD_URL}/renew`,
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
      url: `${COACH_LOAD_URL}/renew`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const firstBody = JSON.parse(first.body);

    const second = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/renew`,
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
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    const row = await readTx(body.transaction.id);

    expect(row.kind).toBe("advance_payment");
    expect(row.validationStatus).toBe("pendiente");
    expect(row.notes).toBe("Suplemento proteína");

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
  });
});
