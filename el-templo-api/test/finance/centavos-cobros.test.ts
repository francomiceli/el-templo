/**
 * Fase 207 (plan 05) — centavos en la PoS del profe y en la ficha del admin.
 *
 * El monto RECIBIDO es plata del ledger (hasta 2 decimales); el PRECIO es de
 * catálogo y sigue entero (DI-03). Cubre:
 *   - PoS pay-plan (renovación y cobro de deuda), misc y alta de alumno.
 *   - Ficha: assign / renew / cancel (error estructurado con totalAmount).
 *   - Deuda exacta al centavo (sin residuos de float) y 3 decimales rechazados.
 *
 * Armado calcado de test/finance/coach-load.test.ts y
 * test/subscriptions/charge-on-assign.test.ts.
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
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const COACH_LOAD_URL = "/api/admin/finance/coach-load";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";
const PLAN_PRICE = 30000;

let app: FastifyInstance;
let adminToken: string;
let coachToken: string;
let branchId: number;
let memberId: number;
let planId: number;
let dniSeq = 0;

function uniqueDni(): string {
  dniSeq = (dniSeq + 1) % 100000;
  return `C${Date.now().toString(36)}${String(dniSeq).padStart(5, "0")}`;
}

/** Saldo (deuda) de una suscripción, o null si no hay fila. */
async function readSubBalance(subscriptionId: number): Promise<number | null> {
  const [row] = await app.db
    .select({ amount: schema.balances.amount })
    .from(schema.balances)
    .where(
      and(
        eq(schema.balances.targetKind, "subscription"),
        eq(schema.balances.targetId, subscriptionId),
        tenantWhere(schema.balances, TEMPLO_CTX),
      ),
    )
    .limit(1);
  return row ? row.amount : null;
}

/** Importe del cobro no anulado más reciente del socio, filtrado por kind. */
async function readTxAmounts(kind: string): Promise<number[]> {
  const rows = await app.db
    .select({ amount: schema.financialTransactions.amount })
    .from(schema.financialTransactions)
    .where(
      and(
        eq(schema.financialTransactions.memberId, memberId),
        eq(schema.financialTransactions.kind, kind as "plan_charge"),
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
      ),
    );
  return rows.map((r) => r.amount);
}

/** Sub vencida ayer con precio = PLAN_PRICE: renovar crea un período activo. */
async function seedRenewableSubscription(): Promise<number> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const start = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values({
      tenantId: TENANT_TEMPLO,
      userId: memberId,
      planId,
      branchId,
      status: "active",
      startDate: start,
      endDate: yesterday,
      pricePaid: PLAN_PRICE,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  return res.id;
}

/** Sub vigente (endDate futuro) para sembrar deuda a mano. */
async function seedCurrentSubscription(): Promise<number> {
  const start = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const [res] = await app.db
    .insert(schema.subscriptions)
    .values({
      tenantId: TENANT_TEMPLO,
      userId: memberId,
      planId,
      branchId,
      status: "active",
      startDate: start,
      endDate: future,
      pricePaid: PLAN_PRICE,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  return res.id;
}

async function seedSubscriptionDebt(
  subscriptionId: number,
  amount: number,
): Promise<void> {
  await app.db.insert(schema.balances).values(
    tenantValues(TEMPLO_CTX, {
      memberId,
      targetKind: "subscription",
      targetId: subscriptionId,
      currency: "ARS",
      amount,
    }),
  );
}

async function payPlan(
  payload: Record<string, unknown>,
  token = coachToken,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `${COACH_LOAD_URL}/pay-plan`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      userId: memberId,
      paymentMethod: "cash",
      idempotencyKey: `cent-pay-${Date.now()}-${Math.random()}`,
      ...payload,
    },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function assign(
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/assign`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      planId,
      branchId,
      startDate: new Date().toISOString().split("T")[0],
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      ...payload,
    },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

beforeAll(async () => {
  app = await createTestApp();

  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  branchId = admin.branchId ?? 1;
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  await ensureEfectivoCaja(app, branchId, "ARS");

  await createStaffUser(app, {
    email: "coach-centavos@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Centavos",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(
    app,
    "coach-centavos@test.local",
    "pass123456",
  );

  const [planRes] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      tenantId: TENANT_TEMPLO,
      name: "Centavos Plan",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: PLAN_PRICE,
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
  // Misma limpieza que coach-load.test.ts: una sola conexión con FK checks off
  // y DELETE acotados al gimnasio (el sentinel de tenancy intercepta el pool).
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query("DELETE FROM `transaction_links` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query(
      "DELETE FROM `financial_transactions` WHERE tenant_id = ?",
      [TENANT_TEMPLO],
    );
    await conn.query("DELETE FROM `balances` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query("DELETE FROM `audit_log` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query("DELETE FROM `bookings` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query("DELETE FROM `program_enrollments`");
    await conn.query("DELETE FROM `subscriptions` WHERE tenant_id = ?", [
      TENANT_TEMPLO,
    ]);
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }

  const member = await registerUser(app, {
    email: `centavos-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Centavos",
    lastName: "Member",
    branchId,
  });
  memberId = (member.user as { id: number }).id;
});

describe("centavos: PoS del profe (pay-plan)", () => {
  it("renovación con recibido 15000.50 sobre plan de 30000 → cobro 15000.5 y deuda 14999.5", async () => {
    await seedRenewableSubscription();
    const { statusCode, body } = await payPlan({ amountReceived: 15000.5 });
    expect(statusCode).toBe(201);
    const subId = (body.subscription as { id: number }).id;

    expect(await readTxAmounts("plan_charge")).toEqual([15000.5]);
    expect(await readSubBalance(subId)).toBe(14999.5);
  });

  it("saldar esa deuda: 14999.51 → 400 (excede), 14999.50 → deuda 0 exacta", async () => {
    await seedRenewableSubscription();
    const renew = await payPlan({ amountReceived: 15000.5 });
    expect(renew.statusCode).toBe(201);
    const subId = (renew.body.subscription as { id: number }).id;

    const over = await payPlan({ amountReceived: 14999.51 });
    expect(over.statusCode).toBe(400);
    expect(JSON.stringify(over.body)).toContain("no puede exceder la deuda");
    expect(await readSubBalance(subId)).toBe(14999.5);

    const exact = await payPlan({ amountReceived: 14999.5 });
    expect(exact.statusCode).toBe(201);
    expect(await readSubBalance(subId)).toBe(0);
  });

  it("3 × 33.33 + 0.01 sobre una deuda de 100 la deja en 0 exacto (sin residuo de float)", async () => {
    const subId = await seedCurrentSubscription();
    await seedSubscriptionDebt(subId, 100);

    for (const amountReceived of [33.33, 33.33, 33.33]) {
      const res = await payPlan({ amountReceived });
      expect(res.statusCode).toBe(201);
    }
    expect(await readSubBalance(subId)).toBe(0.01);

    const last = await payPlan({ amountReceived: 0.01 });
    expect(last.statusCode).toBe(201);
    expect(await readSubBalance(subId)).toBe(0);
  });

  it("3 decimales en amountReceived → 400", async () => {
    await seedRenewableSubscription();
    const res = await payPlan({ amountReceived: 100.001 });
    expect(res.statusCode).toBe(400);
  });

  it("priceOverrideAmount con decimales → 400 (el precio sigue entero)", async () => {
    await seedRenewableSubscription();
    const res = await payPlan({
      priceOverrideAmount: 15000.5,
      priceOverrideReason: "PROMO",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("centavos: PoS del profe (cobro suelto y alta)", () => {
  async function postMisc(amount: number) {
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/misc`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        memberId,
        amount,
        concepto: "Suplemento",
        paymentMethod: "cash",
        currency: "ARS",
        idempotencyKey: `cent-misc-${Date.now()}-${Math.random()}`,
        miscReason: "otro",
      },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  it("misc con 1234.56 → 201 y el cobro vale 1234.56", async () => {
    const { statusCode } = await postMisc(1234.56);
    expect(statusCode).toBe(201);
    expect(await readTxAmounts("advance_payment")).toEqual([1234.56]);
  });

  it("misc con 1234.567 → 400", async () => {
    const { statusCode } = await postMisc(1234.567);
    expect(statusCode).toBe(400);
    expect(await readTxAmounts("advance_payment")).toEqual([]);
  });

  it("alta de alumno nuevo con recibido 9999.99 → cobro 9999.99 y deuda exacta", async () => {
    const key = `cent-alta-${Date.now()}`;
    const res = await app.inject({
      method: "POST",
      url: `${COACH_LOAD_URL}/alta`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: {
        firstName: "Alta",
        lastName: "Centavos",
        dni: uniqueDni(),
        branchId,
        planId,
        paymentMethod: "cash",
        amountReceived: 9999.99,
        idempotencyKey: key,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      subscription: { id: number };
    };

    const [charge] = await app.db
      .select({ amount: schema.financialTransactions.amount })
      .from(schema.financialTransactions)
      .where(
        and(
          eq(schema.financialTransactions.idempotencyKey, key),
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        ),
      )
      .limit(1);
    expect(charge.amount).toBe(9999.99);
    // 30000 - 9999.99 = 20000.01 exacto
    expect(await readSubBalance(body.subscription.id)).toBe(20000.01);
  });
});

describe("centavos: ficha del admin (assign / renew / cancel)", () => {
  it("assign con recibido 20000.25 sobre plan de 30000 → deuda 9999.75", async () => {
    const res = await assign({ amountReceived: 20000.25 });
    expect(res.statusCode).toBe(201);
    expect(await readSubBalance(res.body.id as number)).toBe(9999.75);
    expect(await readTxAmounts("plan_charge")).toEqual([20000.25]);
  });

  it("assign con 100.001 → 400", async () => {
    const res = await assign({ amountReceived: 100.001 });
    expect(res.statusCode).toBe(400);
  });

  it("renew con recibido 0.01 → 201 y deuda = precio - 0.01", async () => {
    const first = await assign({});
    expect(first.statusCode).toBe(201);

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", amountReceived: 0.01 },
    });
    expect(res.statusCode).toBe(201);
    const renewed = JSON.parse(res.body) as { id: number };
    expect(await readSubBalance(renewed.id)).toBe(29999.99);
  });

  it("cancelar con un cobro vivo de 15000.50 → 400 con details.totalAmount 15000.5", async () => {
    const assigned = await assign({ amountReceived: 15000.5 });
    expect(assigned.statusCode).toBe(201);

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { notes: "debe fallar" },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as {
      code: string;
      details: { totalAmount: number };
    };
    expect(body.code).toBe("SUB_HAS_ACTIVE_TRANSACTIONS");
    expect(body.details.totalAmount).toBe(15000.5);
  });
});
