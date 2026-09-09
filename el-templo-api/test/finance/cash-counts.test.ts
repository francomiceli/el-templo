/**
 * Arqueos / cierre de caja (feedback caja/cobros 2026-09-08, opción A).
 *
 * esperado = fondo de cambio + saldo firme + cobros pendientes de validación.
 * El arqueo no toca el ledger: la diferencia queda registrada con nota.
 *
 * Cubre:
 *   - GET /coach-load/caja-expected (coach): esperado, cobros desde el último
 *     arqueo (validados Y pendientes, no anulados), lastCount null → luego con
 *     datos; el pendiente entra al esperado; un retiro lo baja.
 *   - POST /coach-load/cash-count (coach): 201 con diferencia; diferencia sin
 *     nota → 400; negativo → 400; staffShiftId de otro user → 404; el
 *     siguiente esperado solo muestra los cobros nuevos.
 *   - Fondo de cambio: PATCH /cash-registers/:id/change-fund (admin) entra al
 *     esperado; coach → 403; banco → 400.
 *   - GET /cash-counts (gestión): historial con el snapshot.
 *   - Después del cierre (2026-09-09): validar un pendiente no mueve el
 *     esperado; anular un cobro ya contado lo baja y el siguiente esperado lo
 *     lista en `voidedSinceLastCount` (nunca un cobro anulado antes del
 *     cierre ni uno nacido y anulado después).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq, and } from "drizzle-orm";
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
const COACH = "/api/admin/finance/coach-load";
const FIN = "/api/admin/finance";

let app: FastifyInstance;
let adminId: number;
let coachId: number;
let branchId: number;
let memberId: number;
let cajaId: number;
let bankCajaId: number;
let adminToken: string;
let coachToken: string;

interface Expected {
  cashRegisterId: number;
  changeFund: number;
  firmeAmount: number;
  pendienteAmount: number;
  expectedAmount: number;
  lastCount: { id: number; difference: number; counterName: string } | null;
  paymentsSinceLastCount: Array<{ id: number; validationStatus: string }>;
  paymentsSinceLastCountTotal: number;
  voidedSinceLastCount: Array<{
    id: number;
    amount: number;
    voidedAt: string;
    voidReason: string | null;
  }>;
  voidedSinceLastCountTotal: number;
}

async function seedCobro(opts: {
  amount: number;
  validationStatus?: "pendiente" | "validado";
  voided?: boolean;
}): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        kind: "plan_charge",
        direction: "inflow",
        amount: opts.amount,
        currency: "ARS",
        paymentMethod: "cash",
        transactionDate: today,
        effectiveDate: today,
        branchId,
        cashRegisterId: cajaId,
        recordedBy: coachId,
        validationStatus: opts.validationStatus ?? "validado",
        voidedAt: opts.voided ? new Date() : null,
        voidedBy: opts.voided ? adminId : null,
      }),
    )
    .$returningId();
  return res.id;
}

async function voidCobro(id: number, reason: string) {
  await app.db
    .update(schema.financialTransactions)
    .set({ voidedAt: new Date(), voidedBy: adminId, voidReason: reason })
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.id, id),
      ),
    );
}

async function validateCobro(id: number) {
  await app.db
    .update(schema.financialTransactions)
    .set({ validationStatus: "validado", validatedBy: adminId, validatedAt: new Date() })
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.id, id),
      ),
    );
}

/** Los timestamps son de resolución 1 s: separar "antes del cierre" de "después". */
const tick = () => new Promise((r) => setTimeout(r, 1100));

async function expected(): Promise<Expected> {
  const res = await app.inject({
    method: "GET",
    url: `${COACH}/caja-expected?branchId=${branchId}`,
    headers: { authorization: `Bearer ${coachToken}` },
  });
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as Expected;
}

async function count(
  payload: Record<string, unknown>,
  token = coachToken,
): Promise<{ statusCode: number; body: { cashCount?: { id: number; difference: number; expectedAmount: number; countedAmount: number }; message?: string } }> {
  const res = await app.inject({
    method: "POST",
    url: `${COACH}/cash-count`,
    headers: { authorization: `Bearer ${token}` },
    payload: { branchId, ...payload },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function setChangeFund(id: number, amount: number, token = adminToken) {
  return app.inject({
    method: "PATCH",
    url: `${FIN}/cash-registers/${id}/change-fund`,
    headers: { authorization: `Bearer ${token}` },
    payload: { amount },
  });
}

beforeAll(async () => {
  app = await createTestApp();
  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(
      and(tenantWhere(schema.users, TEMPLO_CTX), eq(schema.users.email, "admin@test.com")),
    )
    .limit(1);
  adminId = admin.id;
  branchId = admin.branchId ?? 1;
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  coachId = await createStaffUser(app, {
    email: "coach-arqueo@test.local",
    password: "pass123456",
    firstName: "Pilar",
    lastName: "Arqueo",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, "coach-arqueo@test.local", "pass123456");

  const member = await registerUser(app, {
    email: `arqueo-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Socio",
    lastName: "Arqueo",
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
  const [bank] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `Arqueo-Bank ${Date.now()}`,
        type: "banco" as const,
        branchId: null,
        currency: "ARS",
        openingBalance: 0,
        cutoffDate: "2020-01-01",
      }),
    )
    .$returningId();
  bankCajaId = bank.id;
});

afterAll(async () => {
  await app.db.execute(sql`DELETE FROM cash_counts WHERE tenant_id = ${TENANT_TEMPLO}`);
  await app.db.execute(sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`);
  await app.db.execute(sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`);
  await app.db
    .update(schema.cashRegisters)
    .set({ changeFund: 0 })
    .where(and(tenantWhere(schema.cashRegisters, TEMPLO_CTX), eq(schema.cashRegisters.id, cajaId)));
  await app.db
    .delete(schema.cashRegisters)
    .where(and(tenantWhere(schema.cashRegisters, TEMPLO_CTX), eq(schema.cashRegisters.id, bankCajaId)));
  await app.close();
});

beforeEach(async () => {
  await app.db.execute(sql`DELETE FROM cash_counts WHERE tenant_id = ${TENANT_TEMPLO}`);
  await app.db.execute(sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`);
  await app.db.execute(sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`);
  await app.db
    .update(schema.cashRegisters)
    .set({ changeFund: 0 })
    .where(and(tenantWhere(schema.cashRegisters, TEMPLO_CTX), eq(schema.cashRegisters.id, cajaId)));
});

describe("GET /coach-load/caja-expected", () => {
  it("esperado = fondo + firme + pendiente; lista validados y pendientes, no anulados", async () => {
    const a = await seedCobro({ amount: 65000 });
    const b = await seedCobro({ amount: 80000, validationStatus: "pendiente" });
    await seedCobro({ amount: 999, voided: true });
    await setChangeFund(cajaId, 20000);

    const e = await expected();
    expect(e.cashRegisterId).toBe(cajaId);
    expect(e.changeFund).toBe(20000);
    expect(e.firmeAmount).toBe(65000);
    expect(e.pendienteAmount).toBe(80000);
    expect(e.expectedAmount).toBe(165000);
    expect(e.lastCount).toBeNull();
    expect(e.paymentsSinceLastCount.map((p) => p.id)).toEqual([a, b]);
    expect(e.paymentsSinceLastCountTotal).toBe(145000);
  });

  it("un retiro baja el esperado (la plata salió del cajón)", async () => {
    const a = await seedCobro({ amount: 65000 });
    await seedCobro({ amount: 65000 });
    const w = await app.inject({
      method: "POST",
      url: `${FIN}/withdrawals`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cajaId, responsibleName: "Martín", transactionIds: [a] },
    });
    expect(w.statusCode).toBe(201);
    const e = await expected();
    expect(e.expectedAmount).toBe(65000);
  });

  it("sede fuera del alcance del coach → 403", async () => {
    const [other] = await app.db.insert(schema.branches).values({
      tenantId: TENANT_TEMPLO,
      name: `Arqueo-Otra-${Date.now() % 100000}`,
      code: `ARQ${Date.now() % 1000000}`,
      country: "AR",
    });
    const res = await app.inject({
      method: "GET",
      url: `${COACH}/caja-expected?branchId=${Number(other.insertId)}`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
    await app.db.delete(schema.branches).where(eq(schema.branches.id, Number(other.insertId)));
  });
});

describe("POST /coach-load/cash-count", () => {
  it("registra el conteo con diferencia y nota; el siguiente esperado solo muestra lo nuevo", async () => {
    await seedCobro({ amount: 65000 });
    await setChangeFund(cajaId, 20000);
    await tick();
    const first = await count({ countedAmount: 84000, notes: "faltan 1000, lo cargo mañana" });
    await tick();
    expect(first.statusCode).toBe(201);
    expect(first.body.cashCount?.expectedAmount).toBe(85000);
    expect(first.body.cashCount?.countedAmount).toBe(84000);
    expect(first.body.cashCount?.difference).toBe(-1000);

    // El ledger no se tocó: el esperado sigue siendo 85000.
    const c = await seedCobro({ amount: 5000 });
    const e = await expected();
    expect(e.expectedAmount).toBe(90000);
    expect(e.lastCount?.id).toBe(first.body.cashCount?.id);
    expect(e.lastCount?.difference).toBe(-1000);
    expect(e.lastCount?.counterName).toBe("Pilar Arqueo");
    expect(e.paymentsSinceLastCount.map((p) => p.id)).toEqual([c]);
  });

  it("diferencia sin nota → 400; sin diferencia no exige nota", async () => {
    await seedCobro({ amount: 65000 });
    const bad = await count({ countedAmount: 60000 });
    expect(bad.statusCode).toBe(400);
    expect(bad.body.message).toContain("motivo");
    const ok = await count({ countedAmount: 65000 });
    expect(ok.statusCode).toBe(201);
    expect(ok.body.cashCount?.difference).toBe(0);
  });

  it("monto negativo → 400 (schema)", async () => {
    const res = await count({ countedAmount: -1 });
    expect(res.statusCode).toBe(400);
  });

  it("staffShiftId de otro usuario → 404", async () => {
    const [shift] = await app.db
      .insert(schema.staffShifts)
      .values(
        tenantValues(TEMPLO_CTX, {
          userId: adminId,
          branchId,
          shiftDate: new Date().toISOString().slice(0, 10),
          checkedInAt: new Date(),
        }),
      )
      .$returningId();
    const res = await count({ countedAmount: 0, staffShiftId: shift.id });
    expect(res.statusCode).toBe(404);
    await app.db
      .delete(schema.staffShifts)
      .where(and(tenantWhere(schema.staffShifts, TEMPLO_CTX), eq(schema.staffShifts.id, shift.id)));
  });

  it("staffShiftId propio queda vinculado", async () => {
    const [shift] = await app.db
      .insert(schema.staffShifts)
      .values(
        tenantValues(TEMPLO_CTX, {
          userId: coachId,
          branchId,
          shiftDate: new Date().toISOString().slice(0, 10),
          checkedInAt: new Date(),
        }),
      )
      .$returningId();
    const res = await count({ countedAmount: 0, staffShiftId: shift.id });
    expect(res.statusCode).toBe(201);
    const list = await app.inject({
      method: "GET",
      url: `${FIN}/cash-counts?cashRegisterId=${cajaId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const rows = (JSON.parse(list.body) as { rows: Array<{ staffShiftId: number | null }> }).rows;
    expect(rows[0]?.staffShiftId).toBe(shift.id);
    await app.db.execute(sql`DELETE FROM cash_counts WHERE tenant_id = ${TENANT_TEMPLO}`);
    await app.db
      .delete(schema.staffShifts)
      .where(and(tenantWhere(schema.staffShifts, TEMPLO_CTX), eq(schema.staffShifts.id, shift.id)));
  });
});

describe("gestión actúa después del cierre", () => {
  it("validar un pendiente ya contado no mueve el esperado: pasa de pendiente a firme", async () => {
    const b = await seedCobro({ amount: 80000, validationStatus: "pendiente" });
    await setChangeFund(cajaId, 20000);
    await tick();
    const first = await count({ countedAmount: 100000 });
    expect(first.statusCode).toBe(201);
    await tick();

    await validateCobro(b);
    const e = await expected();
    expect(e.firmeAmount).toBe(80000);
    expect(e.pendienteAmount).toBe(0);
    expect(e.expectedAmount).toBe(100000);
    expect(e.paymentsSinceLastCount).toEqual([]);
    expect(e.voidedSinceLastCount).toEqual([]);
  });

  it("anular un cobro ya contado baja el esperado y el siguiente cierre lo lista como anulado", async () => {
    const a = await seedCobro({ amount: 65000 });
    const b = await seedCobro({ amount: 80000, validationStatus: "pendiente" });
    await seedCobro({ amount: 999, voided: true }); // anulado ANTES del cierre: nunca contó
    await setChangeFund(cajaId, 20000);
    await tick();
    const first = await count({ countedAmount: 165000 });
    expect(first.statusCode).toBe(201);
    expect(first.body.cashCount?.expectedAmount).toBe(165000);
    await tick();

    // Gestión anula el pendiente que el profe ya contó, entra un cobro nuevo y
    // otro nace y se anula después del cierre (ese no explica nada: no contó).
    await voidCobro(b, "cargado dos veces");
    const c = await seedCobro({ amount: 5000 });
    await seedCobro({ amount: 777, voided: true });

    const e = await expected();
    expect(e.expectedAmount).toBe(20000 + 65000 + 5000);
    expect(e.paymentsSinceLastCount.map((p) => p.id)).toEqual([c]);
    expect(e.voidedSinceLastCount.map((p) => p.id)).toEqual([b]);
    expect(e.voidedSinceLastCount[0].amount).toBe(80000);
    expect(e.voidedSinceLastCount[0].voidReason).toBe("cargado dos veces");
    expect(e.voidedSinceLastCountTotal).toBe(80000);
    void a;

    // El arqueo guardado no se reescribe: sigue diciendo 165000.
    const hist = await app.inject({
      method: "GET",
      url: `${FIN}/cash-counts?cashRegisterId=${cajaId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(hist.statusCode).toBe(200);
    const rows = (JSON.parse(hist.body) as { rows: Array<{ id: number; expectedAmount: number }> }).rows;
    expect(rows.find((r) => r.id === first.body.cashCount?.id)?.expectedAmount).toBe(165000);
  });

  it("sin cierre previo no hay anulados que explicar", async () => {
    await seedCobro({ amount: 999, voided: true });
    const e = await expected();
    expect(e.lastCount).toBeNull();
    expect(e.voidedSinceLastCount).toEqual([]);
    expect(e.voidedSinceLastCountTotal).toBe(0);
  });
});

describe("fondo de cambio y historial", () => {
  it("coach no puede fijar el fondo (403); banco no tiene fondo (400)", async () => {
    expect((await setChangeFund(cajaId, 100, coachToken)).statusCode).toBe(403);
    expect((await setChangeFund(bankCajaId, 100)).statusCode).toBe(400);
  });

  it("GET /cash-counts devuelve el snapshot del arqueo", async () => {
    await seedCobro({ amount: 65000 });
    await setChangeFund(cajaId, 20000);
    await count({ countedAmount: 85000 });
    await setChangeFund(cajaId, 0); // cambia después: el snapshot no se mueve
    const list = await app.inject({
      method: "GET",
      url: `${FIN}/cash-counts?cashRegisterId=${cajaId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(list.statusCode).toBe(200);
    const { rows, total } = JSON.parse(list.body) as {
      rows: Array<{ changeFund: number; expectedAmount: number; paymentsCount: number; counterName: string; cashRegisterId: number }>;
      total: number;
    };
    expect(total).toBe(1);
    expect(rows[0].changeFund).toBe(20000);
    expect(rows[0].expectedAmount).toBe(85000);
    expect(rows[0].paymentsCount).toBe(1);
    expect(rows[0].counterName).toBe("Pilar Arqueo");
    expect(rows[0].cashRegisterId).toBe(cajaId);
  });

  it("coach → 403 en el historial de gestión", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${FIN}/cash-counts`,
      headers: { authorization: `Bearer ${coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
