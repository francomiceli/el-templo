/**
 * Fase 207 (plan 04) — centavos en traslados, egresos y retiros.
 *
 * Cubre:
 *   - POST /movements: 1000,50 exacto en origen y destino; 0,50 → 201;
 *     10,555 → 400; 0 → 400.
 *   - Ajuste por conteo de origen: contado = esperado − 0,10 → ajuste outflow
 *     de 0,10 exacto (con floats daría 0.09999999999999432); contado =
 *     esperado → sin ajuste; contado = esperado + 0,07 → ajuste inflow.
 *   - POST /expenses: 77570,82 baja la caja exacto; un egreso que iguala el
 *     saldo de efectivo con centavos → 201; un centavo de más → 400.
 *   - GET /withdrawals/pending: cobros 100,10 + 200,20 → total 300,3 y
 *     resumen exacto.
 *   - POST /withdrawals: 300,30 con conteo = esperado + 0,20 y nota → ajuste
 *     inflow de 0,20 y foto del arqueo con difference 0,2; sin nota → 400;
 *     1,005 → 400.
 *
 * Los escenarios con enteros siguen cubiertos por movement-service.test.ts y
 * withdrawals.test.ts (regresión).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, eq, and, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, registerUser } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const FIN = "/api/admin/finance";
const CUTOFF = "2020-01-01";

let app: FastifyInstance;
let adminToken: string;
let adminId: number;
let branchId: number;
let memberId: number;
let costCenterId: number;
const cajaIds: number[] = [];

interface BalanceRow {
  cashRegisterId: number;
  firmeBalance: number;
}

interface PendingBody {
  total: number;
  rows: Array<{ amount: number }>;
  summary: {
    inflowTotal: number;
    outflowTotal: number;
    previousBalance: number;
    firmeBalance: number;
    expectedInDrawer: number;
  };
}

async function newCaja(
  opening: number,
  type: "efectivo" | "banco" = "efectivo",
): Promise<number> {
  const [caja] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `CTR-Test ${Date.now()}-${Math.random()}`,
        type,
        branchId: type === "efectivo" ? branchId : null,
        currency: "ARS",
        openingBalance: opening,
        cutoffDate: CUTOFF,
      }),
    )
    .$returningId();
  cajaIds.push(caja.id);
  return caja.id;
}

async function firmeOf(id: number): Promise<number> {
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
  return (row as BalanceRow).firmeBalance;
}

async function postMovement(payload: Record<string, unknown>) {
  const res = await app.inject({
    method: "POST",
    url: `${FIN}/movements`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload,
  });
  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.body) as {
      message?: string;
      movement?: { adjustmentTxId: number | null; expectedAmount: number };
    },
  };
}

async function postExpense(payload: Record<string, unknown>) {
  const res = await app.inject({
    method: "POST",
    url: `${FIN}/expenses`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { costCenterId, ...payload },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function postWithdrawal(payload: Record<string, unknown>) {
  const res = await app.inject({
    method: "POST",
    url: `${FIN}/withdrawals`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { responsibleName: "Responsable Centavos", ...payload },
  });
  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.body) as {
      message?: string;
      withdrawal?: { id: number; amount: number };
    },
  };
}

async function getPending(cajaId: number) {
  const res = await app.inject({
    method: "GET",
    url: `${FIN}/withdrawals/pending?cashRegisterId=${cajaId}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as PendingBody;
}

async function seedCobro(cajaId: number, amount: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await app.db.insert(schema.financialTransactions).values(
    tenantValues(TEMPLO_CTX, {
      memberId,
      kind: "plan_charge" as const,
      direction: "inflow" as const,
      amount,
      currency: "ARS",
      paymentMethod: "cash" as const,
      transactionDate: today,
      effectiveDate: today,
      branchId,
      cashRegisterId: cajaId,
      recordedBy: adminId,
      validationStatus: "validado" as const,
    }),
  );
}

async function adjustmentsOf(cajaId: number) {
  return app.db
    .select({
      direction: schema.financialTransactions.direction,
      amount: schema.financialTransactions.amount,
    })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.cashRegisterId, cajaId),
        eq(schema.financialTransactions.kind, "adjustment"),
      ),
    );
}

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  const [admin] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  adminId = admin.id;

  const [branch] = await app.db
    .insert(schema.branches)
    .values({
      name: "CTR-Test",
      code: `CTR${Date.now() % 1000000}`,
      country: "AR",
    })
    .$returningId();
  branchId = branch.id;

  const member = await registerUser(app, {
    email: `ctr-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Socio",
    lastName: "Traslados",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  const [existing] = await app.db
    .select({ id: schema.costCenters.id })
    .from(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, TEMPLO_CTX),
        eq(schema.costCenters.name, "Varios"),
        eq(schema.costCenters.country, "AR"),
        eq(schema.costCenters.isActive, true),
      ),
    )
    .limit(1);
  if (existing) {
    costCenterId = existing.id;
  } else {
    const [ins] = await app.db
      .insert(schema.costCenters)
      .values(
        tenantValues(TEMPLO_CTX, {
          name: "Varios",
          country: "AR",
          isActive: true,
        }),
      )
      .$returningId();
    costCenterId = ins.id;
  }
});

afterAll(async () => {
  if (cajaIds.length > 0) {
    const ids = cajaIds.join(",");
    await app.db.execute(
      sql.raw(
        `DELETE FROM cash_counts WHERE tenant_id = ${TENANT_TEMPLO} AND cash_register_id IN (${ids})`,
      ),
    );
    await app.db.execute(
      sql.raw(
        `DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO} AND transaction_id IN (SELECT id FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO} AND cash_register_id IN (${ids}))`,
      ),
    );
    await app.db.execute(
      sql.raw(
        `DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO} AND cash_register_id IN (${ids})`,
      ),
    );
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, cajaIds),
        ),
      );
  }
  await app.close();
});

describe("Fase 207 — traslados entre cajas con centavos", () => {
  it("1000.50 entre dos cajas: origen y destino cambian exacto", async () => {
    const origen = await newCaja(5000);
    const destino = await newCaja(0.1);
    const res = await postMovement({
      origenCajaId: origen,
      destinoCajaId: destino,
      amount: 1000.5,
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(await firmeOf(origen)).toBe(3999.5);
    expect(await firmeOf(destino)).toBe(1000.6);
  });

  it("0.5 → 201, 10.555 → 400 y 0 → 400", async () => {
    const origen = await newCaja(100);
    const destino = await newCaja(0);
    const ok = await postMovement({
      origenCajaId: origen,
      destinoCajaId: destino,
      amount: 0.5,
    });
    expect(ok.statusCode).toBe(201);
    expect(await firmeOf(origen)).toBe(99.5);
    expect(await firmeOf(destino)).toBe(0.5);

    const tresDecimales = await postMovement({
      origenCajaId: origen,
      destinoCajaId: destino,
      amount: 10.555,
    });
    expect(tresDecimales.statusCode).toBe(400);
    const cero = await postMovement({
      origenCajaId: origen,
      destinoCajaId: destino,
      amount: 0,
    });
    expect(cero.statusCode).toBe(400);
    expect(await firmeOf(origen)).toBe(99.5);
  });

  it("conteo = esperado − 0.10 → ajuste outflow de 0.10 exacto", async () => {
    // 1000.50 − 1000.40 en floats da 0.10000000000000009: sin redondear, el
    // importe del ajuste no pasaría la validación de 2 decimales de create().
    const origen = await newCaja(1000.5);
    const destino = await newCaja(0);
    const res = await postMovement({
      origenCajaId: origen,
      destinoCajaId: destino,
      amount: 100,
      countedAmount: 1000.4,
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(res.body.movement?.adjustmentTxId).not.toBeNull();
    expect(res.body.movement?.expectedAmount).toBe(1000.5);
    const adjustments = await adjustmentsOf(origen);
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].direction).toBe("outflow");
    expect(adjustments[0].amount).toBe(0.1);
    // 1000.50 − 100 − 0.10
    expect(await firmeOf(origen)).toBe(900.4);
  });

  it("conteo = esperado + 0.07 → ajuste inflow exacto", async () => {
    const origen = await newCaja(500.01);
    const destino = await newCaja(0);
    const res = await postMovement({
      origenCajaId: origen,
      destinoCajaId: destino,
      amount: 50,
      countedAmount: 500.08,
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const adjustments = await adjustmentsOf(origen);
    expect(adjustments).toEqual([{ direction: "inflow", amount: 0.07 }]);
    expect(await firmeOf(origen)).toBe(450.08);
  });

  it("conteo igual al esperado con centavos → sin ajuste", async () => {
    const origen = await newCaja(300.3);
    const destino = await newCaja(0);
    const res = await postMovement({
      origenCajaId: origen,
      destinoCajaId: destino,
      amount: 100.1,
      countedAmount: 300.3,
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(res.body.movement?.adjustmentTxId).toBeNull();
    expect(await adjustmentsOf(origen)).toHaveLength(0);
    expect(await firmeOf(origen)).toBe(200.2);
  });

  it("conteo con 3 decimales → 400", async () => {
    const origen = await newCaja(100);
    const destino = await newCaja(0);
    const res = await postMovement({
      origenCajaId: origen,
      destinoCajaId: destino,
      amount: 10,
      countedAmount: 99.999,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Fase 207 — egresos con centavos", () => {
  it("egreso de 77570.82 baja la caja exacto", async () => {
    const caja = await newCaja(100000);
    const res = await postExpense({ cajaId: caja, amount: 77570.82 });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(await firmeOf(caja)).toBe(22429.18);
  });

  it("un egreso que iguala el saldo de efectivo con centavos → 201; un centavo más → 400", async () => {
    const caja = await newCaja(77570.82);
    const demasiado = await postExpense({ cajaId: caja, amount: 77570.83 });
    expect(demasiado.statusCode).toBe(400);
    const exacto = await postExpense({ cajaId: caja, amount: 77570.82 });
    expect(exacto.statusCode, JSON.stringify(exacto.body)).toBe(201);
    expect(await firmeOf(caja)).toBe(0);
  });

  it("egreso con 3 decimales o 0 → 400", async () => {
    const caja = await newCaja(1000);
    expect(
      (await postExpense({ cajaId: caja, amount: 10.005 })).statusCode,
    ).toBe(400);
    expect((await postExpense({ cajaId: caja, amount: 0 })).statusCode).toBe(
      400,
    );
  });
});

describe("Fase 207 — retiros con centavos", () => {
  it("GET /withdrawals/pending: 100.10 + 200.20 → total 300.3 y resumen exacto", async () => {
    const caja = await newCaja(0);
    await seedCobro(caja, 100.1);
    await seedCobro(caja, 200.2);
    const pending = await getPending(caja);
    expect(pending.rows).toHaveLength(2);
    expect(pending.total).toBe(300.3);
    expect(pending.summary.inflowTotal).toBe(300.3);
    expect(pending.summary.outflowTotal).toBe(0);
    expect(pending.summary.firmeBalance).toBe(300.3);
    expect(pending.summary.previousBalance).toBe(0);
    expect(pending.summary.expectedInDrawer).toBe(300.3);
  });

  it("retiro de 300.30 con conteo = esperado + 0.20: ajuste inflow de 0.20 y arqueo con difference 0.2", async () => {
    const caja = await newCaja(0);
    await seedCobro(caja, 100.1);
    await seedCobro(caja, 200.2);

    const sinNota = await postWithdrawal({
      cajaId: caja,
      amount: 300.3,
      countedAmount: 300.5,
    });
    expect(sinNota.statusCode).toBe(400);
    expect(await adjustmentsOf(caja)).toHaveLength(0);

    const res = await postWithdrawal({
      cajaId: caja,
      amount: 300.3,
      countedAmount: 300.5,
      notes: "Sobraron 20 centavos",
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(res.body.withdrawal?.amount).toBe(300.3);

    expect(await adjustmentsOf(caja)).toEqual([
      { direction: "inflow", amount: 0.2 },
    ]);
    const counts = await app.db
      .select({
        expectedAmount: schema.cashCounts.expectedAmount,
        countedAmount: schema.cashCounts.countedAmount,
        difference: schema.cashCounts.difference,
      })
      .from(schema.cashCounts)
      .where(
        and(
          tenantWhere(schema.cashCounts, TEMPLO_CTX),
          eq(schema.cashCounts.cashRegisterId, caja),
        ),
      );
    expect(counts).toEqual([
      { expectedAmount: 300.3, countedAmount: 300.5, difference: 0.2 },
    ]);
    // 300.30 cobrado + 0.20 sobrante − 300.30 retirado
    expect(await firmeOf(caja)).toBe(0.2);
  });

  it("faltante de 0.10: ajuste outflow exacto y el tope baja a lo contado", async () => {
    const caja = await newCaja(0);
    await seedCobro(caja, 100.1);
    const tope = await postWithdrawal({
      cajaId: caja,
      amount: 100.1,
      countedAmount: 100,
      notes: "Faltaron 10 centavos",
    });
    // Disponible tras el faltante = 100.00: retirar 100.10 no entra.
    expect(tope.statusCode).toBe(400);
    expect(await adjustmentsOf(caja)).toHaveLength(0);

    const ok = await postWithdrawal({
      cajaId: caja,
      amount: 100,
      countedAmount: 100,
      notes: "Faltaron 10 centavos",
    });
    expect(ok.statusCode, JSON.stringify(ok.body)).toBe(201);
    expect(await adjustmentsOf(caja)).toEqual([
      { direction: "outflow", amount: 0.1 },
    ]);
    expect(await firmeOf(caja)).toBe(0);
  });

  it("conteo igual al esperado con centavos: sin ajuste y sin nota", async () => {
    const caja = await newCaja(0);
    await seedCobro(caja, 100.1);
    await seedCobro(caja, 200.2);
    const res = await postWithdrawal({
      cajaId: caja,
      amount: 100.05,
      countedAmount: 300.3,
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect(await adjustmentsOf(caja)).toHaveLength(0);
    expect(await firmeOf(caja)).toBe(200.25);
  });

  it("monto de 1.005 → 400 y 0 → 400; 0.5 → 201", async () => {
    const caja = await newCaja(10);
    expect(
      (await postWithdrawal({ cajaId: caja, amount: 1.005 })).statusCode,
    ).toBe(400);
    expect((await postWithdrawal({ cajaId: caja, amount: 0 })).statusCode).toBe(
      400,
    );
    const ok = await postWithdrawal({ cajaId: caja, amount: 0.5 });
    expect(ok.statusCode, JSON.stringify(ok.body)).toBe(201);
    expect(await firmeOf(caja)).toBe(9.5);
  });
});
