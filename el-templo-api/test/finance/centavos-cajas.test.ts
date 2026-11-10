/**
 * Fase 207 (plan 03) — centavos en cajas y arqueos.
 *
 * Cubre:
 *   - POST /cash-registers/efectivo: saldo inicial con centavos (201) y 3
 *     decimales (400); el saldo firme sale exacto en /cash-registers/balances.
 *   - Saldo firme exacto: 100,10 + 200,20 - 0,30 = 300,00 (con floats daría
 *     299.99999999999994).
 *   - PATCH /cash-registers/:id/change-fund con centavos; 3 decimales → 400.
 *   - GET /cash-counts/expected: fondo + firme + pendiente exactos.
 *   - POST /cash-counts: diferencia 0,00 no exige nota; ±0,01 sí; la foto del
 *     arqueo guarda los centavos.
 *   - POST /coach-load/cash-count (cierre de jornada del profe): 99,99 → 201,
 *     99,999 → 400.
 *   - assertEfectivoCoversOutflow compara en centavos.
 *
 * Los escenarios con enteros (65000/80000/165000) siguen cubiertos por
 * cash-counts.test.ts (regresión).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq, and, inArray } from "drizzle-orm";
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
import { assertEfectivoCoversOutflow } from "../../src/modules/finance/efectivo-guard";
import { BadRequestError } from "../../src/modules/shared/errors";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const FIN = "/api/admin/finance";
const COACH = `${FIN}/coach-load`;

let app: FastifyInstance;
let coachId: number;
let branchId: number;
let memberId: number;
let cajaId: number;
let adminToken: string;
let coachToken: string;
/** Cajas y sedes creadas por los tests de apertura (se borran al final). */
const extraCajaIds: number[] = [];
const extraBranchIds: number[] = [];

interface Expected {
  changeFund: number;
  firmeAmount: number;
  pendienteAmount: number;
  expectedAmount: number;
  paymentsSinceLastCountTotal: number;
}

interface CashCountBody {
  cashCount?: {
    id: number;
    expectedAmount: number;
    countedAmount: number;
    difference: number;
  };
  message?: string;
}

async function seedTx(opts: {
  amount: number;
  direction?: "inflow" | "outflow";
  validationStatus?: "pendiente" | "validado";
}): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const outflow = opts.direction === "outflow";
  await app.db.insert(schema.financialTransactions).values(
    tenantValues(TEMPLO_CTX, {
      memberId: outflow ? null : memberId,
      kind: outflow ? ("expense" as const) : ("plan_charge" as const),
      direction: opts.direction ?? "inflow",
      amount: opts.amount,
      currency: "ARS",
      paymentMethod: "cash" as const,
      transactionDate: today,
      effectiveDate: today,
      branchId,
      cashRegisterId: cajaId,
      recordedBy: coachId,
      validationStatus: opts.validationStatus ?? "validado",
    }),
  );
}

async function nuevaSucursal(label: string): Promise<number> {
  const [b] = await app.db
    .insert(schema.branches)
    .values({
      name: `CC-${label}`,
      code: `${label}${Date.now() % 1000000}`,
      country: "AR",
    })
    .$returningId();
  extraBranchIds.push(b.id);
  return b.id;
}

async function abrirCaja(payload: Record<string, unknown>) {
  const res = await app.inject({
    method: "POST",
    url: `${FIN}/cash-registers/efectivo`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload,
  });
  if (res.statusCode === 201) {
    const { caja } = JSON.parse(res.body) as {
      caja: { cashRegisterId: number };
    };
    extraCajaIds.push(caja.cashRegisterId);
  }
  return res;
}

interface BalanceRow {
  cashRegisterId: number;
  firmeBalance: number;
  pendienteAmount: number;
  changeFund: number;
}

async function balanceOf(id: number): Promise<BalanceRow> {
  const res = await app.inject({
    method: "GET",
    url: `${FIN}/cash-registers/balances`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode, res.body).toBe(200);
  const row = (JSON.parse(res.body) as BalanceRow[]).find(
    (r) => r.cashRegisterId === id,
  );
  expect(row).toBeDefined();
  return row as BalanceRow;
}

async function setChangeFund(amount: number) {
  return app.inject({
    method: "PATCH",
    url: `${FIN}/cash-registers/${cajaId}/change-fund`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { amount },
  });
}

async function getExpected(): Promise<Expected> {
  const res = await app.inject({
    method: "GET",
    url: `${FIN}/cash-counts/expected?cashRegisterId=${cajaId}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as Expected;
}

async function postCount(payload: Record<string, unknown>) {
  const res = await app.inject({
    method: "POST",
    url: `${FIN}/cash-counts`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { cajaId, ...payload },
  });
  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.body) as CashCountBody,
  };
}

async function limpiar() {
  await app.db.execute(
    sql`DELETE FROM cash_counts WHERE tenant_id = ${TENANT_TEMPLO} AND cash_register_id = ${cajaId}`,
  );
  await app.db.execute(
    sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO} AND cash_register_id = ${cajaId}`,
  );
  await app.db
    .update(schema.cashRegisters)
    .set({ changeFund: 0, openingBalance: 0 })
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.id, cajaId),
      ),
    );
}

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  // Sede propia: la caja de efectivo de este archivo no se cruza con las demás.
  branchId = await nuevaSucursal("Cent");

  const coachEmail = `coach-centavos-${Date.now()}@test.local`;
  coachId = await createStaffUser(app, {
    email: coachEmail,
    password: "pass123456",
    firstName: "Pilar",
    lastName: "Centavos",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, coachEmail, "pass123456");

  const member = await registerUser(app, {
    email: `centavos-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Socio",
    lastName: "Centavos",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  await ensureEfectivoCaja(app, branchId);
  const [caja] = await app.db
    .select({ id: schema.cashRegisters.id })
    .from(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.type, "efectivo"),
        eq(schema.cashRegisters.branchId, branchId),
      ),
    )
    .limit(1);
  cajaId = caja.id;
});

afterAll(async () => {
  await limpiar();
  if (extraCajaIds.length > 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, extraCajaIds),
        ),
      );
  }
  await app.close();
});

beforeEach(async () => {
  await limpiar();
});

describe("Fase 207 — apertura de caja de efectivo con centavos", () => {
  it("openingBalance 1234.56 → 201 y el saldo firme sale 1234.56", async () => {
    const sucursal = await nuevaSucursal("Ap1");
    const res = await abrirCaja({
      branchId: sucursal,
      currency: "ARS",
      openingBalance: 1234.56,
    });
    expect(res.statusCode, res.body).toBe(201);
    const { caja } = JSON.parse(res.body) as {
      caja: { cashRegisterId: number; firmeBalance: number };
    };
    expect(caja.firmeBalance).toBe(1234.56);
    const row = await balanceOf(caja.cashRegisterId);
    expect(row.firmeBalance).toBe(1234.56);
  });

  it("openingBalance con 3 decimales → 400", async () => {
    const sucursal = await nuevaSucursal("Ap2");
    const res = await abrirCaja({
      branchId: sucursal,
      currency: "ARS",
      openingBalance: 1234.567,
    });
    expect(res.statusCode).toBe(400);
  });

  it("openingBalance entero sigue funcionando", async () => {
    const sucursal = await nuevaSucursal("Ap3");
    const res = await abrirCaja({
      branchId: sucursal,
      currency: "ARS",
      openingBalance: 25000,
    });
    expect(res.statusCode, res.body).toBe(201);
    const { caja } = JSON.parse(res.body) as { caja: { firmeBalance: number } };
    expect(caja.firmeBalance).toBe(25000);
  });
});

describe("Fase 207 — saldo firme exacto al centavo", () => {
  it("100,10 + 200,20 − 0,30 = 300,00 (con floats daría 299.99999999999994)", async () => {
    await seedTx({ amount: 100.1 });
    await seedTx({ amount: 200.2 });
    await seedTx({ amount: 0.3, direction: "outflow" });
    const row = await balanceOf(cajaId);
    expect(row.firmeBalance).toBe(300);
    expect(row.pendienteAmount).toBe(0);
  });

  it("apertura con centavos + cobros: se suma exacto y el pendiente va aparte", async () => {
    await app.db
      .update(schema.cashRegisters)
      .set({ openingBalance: 10.07 })
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          eq(schema.cashRegisters.id, cajaId),
        ),
      );
    await seedTx({ amount: 20.14 });
    await seedTx({ amount: 0.07, validationStatus: "pendiente" });
    const row = await balanceOf(cajaId);
    expect(row.firmeBalance).toBe(30.21);
    expect(row.pendienteAmount).toBe(0.07);
  });
});

describe("Fase 207 — fondo de cambio y esperado con centavos", () => {
  it("fondo 500.50 → 200 y esperado = fondo + firme + pendiente exacto", async () => {
    await seedTx({ amount: 100.1 });
    await seedTx({ amount: 200.2 });
    await seedTx({ amount: 50.05, validationStatus: "pendiente" });
    const res = await setChangeFund(500.5);
    expect(res.statusCode, res.body).toBe(200);
    expect((JSON.parse(res.body) as { changeFund: number }).changeFund).toBe(
      500.5,
    );

    const e = await getExpected();
    expect(e.changeFund).toBe(500.5);
    expect(e.firmeAmount).toBe(300.3);
    expect(e.pendienteAmount).toBe(50.05);
    expect(e.expectedAmount).toBe(850.85);
    expect(e.paymentsSinceLastCountTotal).toBe(350.35);
  });

  it("fondo con 3 decimales → 400; entero y 0 siguen aceptándose", async () => {
    expect((await setChangeFund(10.001)).statusCode).toBe(400);
    expect((await setChangeFund(20000)).statusCode).toBe(200);
    expect((await setChangeFund(0)).statusCode).toBe(200);
  });
});

describe("Fase 207 — arqueo de gestión con centavos", () => {
  it("contado = esperado (con centavos) sin notas → 201 y diferencia 0", async () => {
    await seedTx({ amount: 100.1 });
    await seedTx({ amount: 200.2 });
    await setChangeFund(500.5);
    const e = await getExpected();
    expect(e.expectedAmount).toBe(800.8);

    const res = await postCount({ countedAmount: e.expectedAmount });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(res.body.cashCount?.difference).toBe(0);
    expect(res.body.cashCount?.expectedAmount).toBe(800.8);
    expect(res.body.cashCount?.countedAmount).toBe(800.8);
  });

  it("contado = esperado − 0,01: sin notas → 400, con notas → 201 y diferencia −0,01", async () => {
    await seedTx({ amount: 100.1 });
    await seedTx({ amount: 200.2 });
    await setChangeFund(500.5);

    const sinNota = await postCount({ countedAmount: 800.79 });
    expect(sinNota.statusCode).toBe(400);
    // El mensaje interpola el valor redondeado, nunca un residuo de float.
    expect(sinNota.body.message).toContain("-0.01");

    const conNota = await postCount({
      countedAmount: 800.79,
      notes: "faltó un centavo",
    });
    expect(conNota.statusCode, JSON.stringify(conNota.body)).toBe(201);
    expect(conNota.body.cashCount?.difference).toBe(-0.01);
    expect(conNota.body.cashCount?.countedAmount).toBe(800.79);

    // La foto del historial conserva los centavos.
    const list = await app.inject({
      method: "GET",
      url: `${FIN}/cash-counts?cashRegisterId=${cajaId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const rows = (
      JSON.parse(list.body) as {
        rows: Array<{
          difference: number;
          expectedAmount: number;
          changeFund: number;
          firmeAmount: number;
        }>;
      }
    ).rows;
    expect(rows[0].difference).toBe(-0.01);
    expect(rows[0].expectedAmount).toBe(800.8);
    expect(rows[0].changeFund).toBe(500.5);
    expect(rows[0].firmeAmount).toBe(300.3);
  });

  it("contado con 3 decimales → 400", async () => {
    const res = await postCount({ countedAmount: 99.999, notes: "x" });
    expect(res.statusCode).toBe(400);
  });

  it("contado entero sobre caja vacía: diferencia 0 y sin notas → 201", async () => {
    const res = await postCount({ countedAmount: 0 });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(res.body.cashCount?.difference).toBe(0);
  });
});

describe("Fase 207 — arqueo del profe al cerrar la jornada con centavos", () => {
  async function coachCount(countedAmount: number, notes?: string) {
    const res = await app.inject({
      method: "POST",
      url: `${COACH}/cash-count`,
      headers: { authorization: `Bearer ${coachToken}` },
      payload: { branchId, countedAmount, ...(notes ? { notes } : {}) },
    });
    return {
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as CashCountBody,
    };
  }

  it("countedAmount 99.99 → 201 con diferencia 99.99", async () => {
    const res = await coachCount(99.99, "sobrante");
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(res.body.cashCount?.countedAmount).toBe(99.99);
    expect(res.body.cashCount?.difference).toBe(99.99);
  });

  it("countedAmount 99.999 → 400", async () => {
    const res = await coachCount(99.999, "x");
    expect(res.statusCode).toBe(400);
  });

  it("el profe cuenta exactamente lo esperado con centavos → 201 sin notas", async () => {
    await seedTx({ amount: 100.1 });
    await seedTx({ amount: 200.2 });
    const res = await coachCount(300.3);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(res.body.cashCount?.difference).toBe(0);
  });
});

describe("Fase 207 — guard de saldo de efectivo en centavos", () => {
  const efectivo = { type: "efectivo" as const };

  it("una salida igual al saldo no se rechaza aunque el saldo traiga un residuo de float", () => {
    // Saldo calculado con un residuo de float por debajo de 100,10.
    const available = 100.1 - 1e-9;
    expect(100.1 > available).toBe(true);
    expect(() =>
      assertEfectivoCoversOutflow(efectivo, 100.1, available, "El retiro"),
    ).not.toThrow();
  });

  it("una salida un centavo mayor al saldo sí se rechaza, con importes redondeados", () => {
    try {
      assertEfectivoCoversOutflow(efectivo, 100.11, 100.1, "El gasto");
      expect.unreachable("debió lanzar");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(BadRequestError);
      expect((err as Error).message).toContain("100.11");
      expect((err as Error).message).toContain("(100.1)");
    }
  });

  it("una cuenta banco no pasa por el guard", () => {
    expect(() =>
      assertEfectivoCoversOutflow({ type: "banco" }, 1e9, 0, "El gasto"),
    ).not.toThrow();
  });
});
