/**
 * Retiros de caja (feedback caja/cobros 2026-09-07, rediseño 2026-09-23).
 *
 * Un retiro es un `expense` con centro de costo "Retiros" + `responsible_name`
 * obligatorio. Desde 2026-09-23 el retiro en EFECTIVO es "una masa de plata":
 * monto libre con tope en el saldo firme (que ya resta las salidas), conteo
 * opcional con ajuste por faltante/sobrante, y auto-vínculo a los cobros
 * firmes sin retiro (procedencia). En una cuenta BANCO lleva monto explícito.
 *
 * Cubre:
 *   - GET /withdrawals/pending: listado de cobros sin retiro (filtros, orden,
 *     concepto, dateTo, corte, sin validar aparte, banco 400) y el `summary`
 *     del cajón: quedó al último retiro + ingresos − salidas = disponible;
 *     fondo de cambio y esperado en el cajón.
 *   - POST /withdrawals (efectivo): monto libre; el caso de Martín (un gasto
 *     pagado desde la caja baja el tope); retiro parcial y lo que queda;
 *     auto-vínculo (solo firmes, de la caja, hasta la fecha, desde el corte,
 *     nunca dos veces); conteo (igual, faltante sin/con nota, sobrante) con
 *     ajuste + arqueo; fechas; validaciones de forma; RBAC coach 403.
 *   - Anulación: cobro retirado → 409; anular el retiro libera cobros y anula
 *     su ajuste.
 *   - Banco: monto explícito, sin vínculos ni conteo.
 *   - POST /expenses con centro "Retiros" → 400 (los retiros van por acá).
 *   - GET /withdrawals, /withdrawals/:id, /withdrawals/responsibles.
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql, eq, and, inArray, isNull } from "drizzle-orm";
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
const BASE = "/api/admin/finance";

let app: FastifyInstance;
let adminId: number;
let branchId: number;
let memberId: number;
let planId: number;
let subscriptionId: number;
let cajaId: number;
let otherCajaId: number;
let bankCajaId: number;
let retirosCostCenterId: number;
let variosCostCenterId: number;

let adminToken: string;
let coachToken: string;

function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface PaymentRow {
  id: number;
  transactionDate: string;
  memberName: string;
  amount: number;
  concept: string | null;
}
interface FlowRow {
  id: number;
  kind: string;
  direction: "inflow" | "outflow";
  amount: number;
  description: string;
  detail: string | null;
}
interface SummaryBody {
  lastWithdrawal: { id: number; amount: number; responsibleName: string } | null;
  previousBalance: number;
  inflows: FlowRow[];
  inflowTotal: number;
  outflows: FlowRow[];
  outflowTotal: number;
  firmeBalance: number;
  changeFund: number;
  expectedInDrawer: number;
}
interface PendingBody {
  cashRegisterId: number;
  cashRegisterName: string;
  currency: string;
  rows: PaymentRow[];
  total: number;
  awaitingValidation: { rows: PaymentRow[]; total: number };
  summary: SummaryBody;
}
interface WithdrawalBody {
  id: number;
  amount: number;
  responsibleName: string;
  paymentCount: number;
  transactionDate: string;
  cashRegisterType: string;
  voidedAt: string | null;
  payments: PaymentRow[];
}

async function seedCobro(opts: {
  amount: number;
  transactionDate?: string;
  cashRegisterId?: number;
  paymentMethod?: "cash" | "transfer";
  validationStatus?: "pendiente" | "validado";
  kind?: "plan_charge" | "debt_settlement" | "advance_payment";
  notes?: string | null;
  linkSubscription?: boolean;
}): Promise<number> {
  const date = opts.transactionDate ?? daysAgo(1);
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        kind: opts.kind ?? "plan_charge",
        direction: "inflow",
        amount: opts.amount,
        currency: "ARS",
        paymentMethod: opts.paymentMethod ?? "cash",
        transactionDate: date,
        effectiveDate: date,
        branchId,
        cashRegisterId: opts.cashRegisterId ?? cajaId,
        recordedBy: adminId,
        validationStatus: opts.validationStatus ?? "validado",
        notes: opts.notes ?? null,
      }),
    )
    .$returningId();
  if (opts.linkSubscription) {
    await app.db.insert(schema.transactionLinks).values(
      tenantValues(TEMPLO_CTX, {
        transactionId: res.id,
        targetKind: "subscription",
        targetId: subscriptionId,
        allocatedAmount: opts.amount,
      }),
    );
  }
  return res.id;
}

async function getPending(
  token: string,
  query: string,
): Promise<{ statusCode: number; body: PendingBody }> {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/withdrawals/pending${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function postWithdrawal(
  token: string,
  payload: Record<string, unknown>,
): Promise<{
  statusCode: number;
  body: { withdrawal?: WithdrawalBody; message?: string };
}> {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/withdrawals`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function voidTx(
  id: number,
  url: "transactions" | "expenses",
): Promise<{ statusCode: number; body: { message?: string } }> {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/${url}/${id}/void`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { reason: "test" },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function firmeBalance(id: number): Promise<number> {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/cash-registers/balances`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const rows = JSON.parse(res.body) as Array<{
    cashRegisterId: number;
    firmeBalance: number;
  }>;
  return rows.find((r) => r.cashRegisterId === id)?.firmeBalance ?? NaN;
}

/** Gasto pagado desde una caja (la yerba de la administrativa). */
async function postExpense(
  amount: number,
  notes: string,
  cashRegisterId = cajaId,
): Promise<number> {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/expenses`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { cajaId: cashRegisterId, amount, costCenterId: variosCostCenterId, notes },
  });
  expect(res.statusCode, res.body).toBe(201);
  return (JSON.parse(res.body) as { expense: { expenseTxId: number } }).expense
    .expenseTxId;
}

async function postMovement(
  origenCajaId: number,
  destinoCajaId: number,
  amount: number,
): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/movements`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { origenCajaId, destinoCajaId, amount },
  });
  expect(res.statusCode, res.body).toBe(201);
}

async function setChangeFund(amount: number): Promise<void> {
  await app.db
    .update(schema.cashRegisters)
    .set({ changeFund: amount })
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.id, cajaId),
      ),
    );
}

/** Filas no anuladas de un kind en la caja (ajustes, gastos…). */
async function liveRowsOfKind(
  kind: "adjustment" | "expense",
): Promise<Array<{ id: number; direction: string; amount: number; notes: string | null }>> {
  return app.db
    .select({
      id: schema.financialTransactions.id,
      direction: schema.financialTransactions.direction,
      amount: schema.financialTransactions.amount,
      notes: schema.financialTransactions.notes,
    })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.cashRegisterId, cajaId),
        eq(schema.financialTransactions.kind, kind),
        isNull(schema.financialTransactions.voidedAt),
      ),
    );
}

async function cashCountsOfCaja(): Promise<
  Array<{ expectedAmount: number; countedAmount: number; difference: number; notes: string | null }>
> {
  return app.db
    .select({
      expectedAmount: schema.cashCounts.expectedAmount,
      countedAmount: schema.cashCounts.countedAmount,
      difference: schema.cashCounts.difference,
      notes: schema.cashCounts.notes,
    })
    .from(schema.cashCounts)
    .where(
      and(
        tenantWhere(schema.cashCounts, TEMPLO_CTX),
        eq(schema.cashCounts.cashRegisterId, cajaId),
      ),
    );
}

async function linkedPaymentIds(withdrawalId: number): Promise<number[]> {
  const rows = await app.db
    .select({ targetId: schema.transactionLinks.targetId })
    .from(schema.transactionLinks)
    .where(
      and(
        tenantWhere(schema.transactionLinks, TEMPLO_CTX),
        eq(schema.transactionLinks.transactionId, withdrawalId),
        eq(schema.transactionLinks.targetKind, "transaction"),
      ),
    );
  return rows.map((r) => r.targetId).sort((a, b) => a - b);
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
  adminId = admin.id;
  branchId = admin.branchId ?? 1;
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await createStaffUser(app, {
    email: "coach-retiros@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "Retiros",
    role: "coach",
    branchId,
  });
  coachToken = await getAuthToken(app, "coach-retiros@test.local", "pass123456");

  const member = await registerUser(app, {
    email: `retiros-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Suyai",
    lastName: "Torres",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      tenantId: TENANT_TEMPLO,
      name: "FLEX ZERO Retiros",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 65000,
      priceZero: 65000,
      priceCreditCard: 65000,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
      isActive: true,
    })
    .$returningId();
  planId = plan.id;
  const [sub] = await app.db
    .insert(schema.subscriptions)
    .values({
      tenantId: TENANT_TEMPLO,
      userId: memberId,
      planId,
      branchId,
      status: "active",
      startDate: daysAgo(10),
      endDate: daysAgo(-20),
      pricePaid: 65000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();
  subscriptionId = sub.id;

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

  const [other] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `Retiros-Other ${Date.now()}`,
        type: "efectivo" as const,
        branchId,
        currency: "ARS",
        openingBalance: 0,
        cutoffDate: "2020-01-01",
      }),
    )
    .$returningId();
  otherCajaId = other.id;

  const [bank] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `Retiros-Bank ${Date.now()}`,
        type: "banco" as const,
        branchId: null,
        currency: "ARS",
        openingBalance: 0,
        cutoffDate: "2020-01-01",
      }),
    )
    .$returningId();
  bankCajaId = bank.id;

  // Centros de costo: "Retiros" (sembrado por la mig 0163 para AR; si el
  // orden de la suite lo borró, el service lo recrea) y "Varios" para el
  // egreso de control.
  for (const name of ["Retiros", "Varios"]) {
    const [existing] = await app.db
      .select({ id: schema.costCenters.id })
      .from(schema.costCenters)
      .where(
        and(
          tenantWhere(schema.costCenters, TEMPLO_CTX),
          eq(schema.costCenters.name, name),
          eq(schema.costCenters.country, "AR"),
        ),
      )
      .limit(1);
    let id = existing?.id;
    if (!id) {
      const [ins] = await app.db
        .insert(schema.costCenters)
        .values(tenantValues(TEMPLO_CTX, { name, country: "AR", isActive: true }))
        .$returningId();
      id = ins.id;
    }
    if (name === "Retiros") retirosCostCenterId = id;
    else variosCostCenterId = id;
  }
});

afterAll(async () => {
  await app.db.execute(sql`DELETE FROM cash_counts WHERE tenant_id = ${TENANT_TEMPLO}`);
  await setChangeFund(0);
  await app.db.execute(
    sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  const extraCajas = [otherCajaId, bankCajaId].filter(
    (id): id is number => typeof id === "number",
  );
  if (extraCajas.length > 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, extraCajas),
        ),
      );
  }
  await app.close();
});

beforeEach(async () => {
  // Los retiros con conteo dejan arqueos; el fondo de cambio entra en el
  // esperado. Cada caso arranca con los dos en cero.
  await app.db.execute(sql`DELETE FROM cash_counts WHERE tenant_id = ${TENANT_TEMPLO}`);
  await setChangeFund(0);
  await app.db.execute(
    sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
});

// ─────────────────────────────────────────────────────────────────────────

describe("GET /withdrawals/pending", () => {
  it("lista solo cobros de socio en efectivo, firmes, de la caja, sin retiro; en orden; con total y concepto", async () => {
    const a = await seedCobro({
      amount: 65000,
      transactionDate: daysAgo(13),
      linkSubscription: true,
    });
    const b = await seedCobro({ amount: 65000, transactionDate: daysAgo(11) });
    const c = await seedCobro({
      amount: 5000,
      transactionDate: daysAgo(7),
      kind: "advance_payment",
      notes: "Salda deuda",
    });
    // Ruido que NO debe aparecer en rows (el sin validar va aparte):
    const awaiting = await seedCobro({ amount: 1, validationStatus: "pendiente" });
    await seedCobro({ amount: 2, paymentMethod: "transfer", cashRegisterId: bankCajaId }); // transferencia
    await seedCobro({ amount: 3, cashRegisterId: otherCajaId }); // otra caja
    const voided = await seedCobro({ amount: 4 });
    await app.db
      .update(schema.financialTransactions)
      .set({ voidedAt: new Date(), voidedBy: adminId, voidReason: "x" })
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.id, voided),
        ),
      );

    const { statusCode, body } = await getPending(
      adminToken,
      `?cashRegisterId=${cajaId}`,
    );
    expect(statusCode).toBe(200);
    expect(body.cashRegisterId).toBe(cajaId);
    expect(body.currency).toBe("ARS");
    expect(body.rows.map((r) => r.id)).toEqual([a, b, c]);
    expect(body.total).toBe(135000);
    expect(body.rows[0].concept).toBe("FLEX ZERO Retiros");
    expect(body.rows[1].concept).toBeNull();
    expect(body.rows[2].concept).toBe("Salda deuda");
    expect(body.rows[0].memberName).toBe("Suyai Torres");
    // 2026-09-09: lo que está en el cajón pero gestión no validó todavía. No
    // se puede retirar, pero quien retira tiene que saber que existe.
    expect(body.awaitingValidation.rows.map((r) => r.id)).toEqual([awaiting]);
    expect(body.awaitingValidation.total).toBe(1);
  });

  it("awaitingValidation respeta dateTo y no incluye anulados ni validados", async () => {
    const old = await seedCobro({
      amount: 100,
      validationStatus: "pendiente",
      transactionDate: daysAgo(20),
    });
    await seedCobro({ amount: 200, validationStatus: "pendiente", transactionDate: daysAgo(2) });
    await seedCobro({ amount: 300, transactionDate: daysAgo(20) }); // validado: va en rows
    const voidedPending = await seedCobro({
      amount: 400,
      validationStatus: "pendiente",
      transactionDate: daysAgo(20),
    });
    await app.db
      .update(schema.financialTransactions)
      .set({ voidedAt: new Date(), voidedBy: adminId, voidReason: "x" })
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.id, voidedPending),
        ),
      );
    const { body } = await getPending(adminToken, `?cashRegisterId=${cajaId}&dateTo=${daysAgo(10)}`);
    expect(body.rows.map((r) => r.amount)).toEqual([300]);
    expect(body.awaitingValidation.rows.map((r) => r.id)).toEqual([old]);
    expect(body.awaitingValidation.total).toBe(100);
  });

  it("dateTo acota a lo cobrado hasta esa fecha (carga de retiros históricos)", async () => {
    const old = await seedCobro({ amount: 100, transactionDate: daysAgo(20) });
    await seedCobro({ amount: 200, transactionDate: daysAgo(2) });
    const { body } = await getPending(
      adminToken,
      `?cashRegisterId=${cajaId}&dateTo=${daysAgo(10)}`,
    );
    expect(body.rows.map((r) => r.id)).toEqual([old]);
    expect(body.total).toBe(100);
  });

  it("excluye cobros anteriores al corte de la caja: no forman parte del saldo (fix 2026-09-18)", async () => {
    // ensureEfectivoCaja siembra la caja con cutoff_date 2020-01-01. Un cobro
    // firme anterior al corte no esta en el saldo derivado (D-08), asi que
    // ofrecerlo como "pendiente de retiro" deja la caja en negativo (fue el
    // origen del Balanceo a cero del 09/09 en prod, migracion 0234).
    await seedCobro({ amount: 100, transactionDate: "2019-12-31" });
    await seedCobro({
      amount: 40,
      transactionDate: "2019-12-30",
      validationStatus: "pendiente",
    });
    const post = await seedCobro({ amount: 200, transactionDate: daysAgo(2) });
    const { body } = await getPending(adminToken, `?cashRegisterId=${cajaId}`);
    expect(body.rows.map((r) => r.id)).toEqual([post]);
    expect(body.total).toBe(200);
    expect(body.awaitingValidation.rows).toHaveLength(0);
    expect(body.awaitingValidation.total).toBe(0);
  });

  it("cuenta banco → 400", async () => {
    const { statusCode } = await getPending(
      adminToken,
      `?cashRegisterId=${bankCajaId}`,
    );
    expect(statusCode).toBe(400);
  });

  it("sin cashRegisterId → 400 (schema)", async () => {
    const { statusCode } = await getPending(adminToken, "");
    expect(statusCode).toBe(400);
  });
});

describe("GET /withdrawals/pending — summary del cajón (2026-09-23)", () => {
  it("sin retiro previo: ingresos (cobros + movimiento entrante) − salidas (gasto + movimiento saliente) = disponible; fondo y sin validar aparte", async () => {
    await setChangeFund(20000);
    const a = await seedCobro({ amount: 65000, transactionDate: daysAgo(13) });
    const b = await seedCobro({ amount: 30000, transactionDate: daysAgo(7) });
    await seedCobro({ amount: 10000, validationStatus: "pendiente" });
    await seedCobro({ amount: 5000, cashRegisterId: otherCajaId });
    await postMovement(otherCajaId, cajaId, 5000);
    const yerba = await postExpense(12000, "Yerba");
    await postMovement(cajaId, bankCajaId, 8000);

    const { statusCode, body } = await getPending(adminToken, `?cashRegisterId=${cajaId}`);
    expect(statusCode).toBe(200);
    const sm = body.summary;
    expect(sm.lastWithdrawal).toBeNull();
    expect(sm.inflows.slice(0, 2).map((f) => f.id)).toEqual([a, b]);
    expect(sm.inflows[0].description).toBe("Suyai Torres");
    expect(sm.inflows[2].kind).toBe("cash_transfer");
    expect(sm.inflows[2].description).toMatch(/^Movimiento desde Retiros-Other/);
    expect(sm.inflowTotal).toBe(100000);
    expect(sm.outflows).toHaveLength(2);
    expect(sm.outflows[0]).toMatchObject({
      id: yerba,
      kind: "expense",
      amount: 12000,
      description: "Varios",
      detail: "Yerba",
    });
    expect(sm.outflows[1].description).toMatch(/^Movimiento a Retiros-Bank/);
    expect(sm.outflowTotal).toBe(20000);
    expect(sm.previousBalance).toBe(0);
    expect(sm.firmeBalance).toBe(80000);
    expect(sm.firmeBalance).toBe(await firmeBalance(cajaId));
    expect(sm.changeFund).toBe(20000);
    // Fondo + firme + sin validar: lo que debería haber físicamente.
    expect(sm.expectedInDrawer).toBe(110000);
  });

  it("después de un retiro: 'quedó' = lo que no se llevó; solo cuenta lo posterior; un cobro validado después del retiro entra como ingreso", async () => {
    await seedCobro({ amount: 100000, transactionDate: daysAgo(5) });
    await postExpense(10000, "Remís");
    const late = await seedCobro({
      amount: 7000,
      transactionDate: daysAgo(3),
      validationStatus: "pendiente",
    });
    const w = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "Martín Figueras",
      amount: 60000,
    });
    expect(w.statusCode).toBe(201);

    await app.db
      .update(schema.financialTransactions)
      .set({ validationStatus: "validado" })
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.id, late),
        ),
      );
    const c = await seedCobro({ amount: 20000, transactionDate: daysAgo(0) });
    await postExpense(5000, "Viático");

    const sm = (await getPending(adminToken, `?cashRegisterId=${cajaId}`)).body.summary;
    expect(sm.lastWithdrawal).toMatchObject({
      id: w.body.withdrawal!.id,
      amount: 60000,
      responsibleName: "Martín Figueras",
    });
    expect(sm.inflows.map((f) => f.id)).toEqual([late, c]);
    expect(sm.inflowTotal).toBe(27000);
    expect(sm.outflows.map((f) => f.detail)).toEqual(["Viático"]);
    expect(sm.outflowTotal).toBe(5000);
    expect(sm.previousBalance).toBe(30000);
    expect(sm.firmeBalance).toBe(52000);
  });
});

describe("POST /withdrawals — caja efectivo", () => {
  it("caso Martín: un gasto pagado desde la caja baja el tope del retiro", async () => {
    await seedCobro({ amount: 50000, transactionDate: daysAgo(3) });
    await seedCobro({ amount: 30000, transactionDate: daysAgo(2) });
    await seedCobro({ amount: 20000, transactionDate: daysAgo(1) });
    await postExpense(12000, "Yerba");

    const tooMuch = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "Martín Figueras",
      amount: 100000,
    });
    expect(tooMuch.statusCode).toBe(400);
    expect(tooMuch.body.message).toContain("supera el saldo de la caja de efectivo (88000)");
    expect(await liveRowsOfKind("expense")).toHaveLength(1); // solo la yerba

    const ok = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "Martín Figueras",
      amount: 88000,
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.body.withdrawal!.paymentCount).toBe(3);
    expect(await firmeBalance(cajaId)).toBe(0);
  });

  it("registra por monto: centro Retiros, responsable, notas; auto-vincula solo cobros firmes de la caja desde el corte; el saldo baja por el monto", async () => {
    const a = await seedCobro({ amount: 65000, transactionDate: daysAgo(13) });
    const b = await seedCobro({ amount: 65000, transactionDate: daysAgo(11) });
    // Ruido que NO se vincula:
    await seedCobro({ amount: 1, validationStatus: "pendiente" });
    await seedCobro({ amount: 2, paymentMethod: "transfer", cashRegisterId: bankCajaId });
    await seedCobro({ amount: 3, cashRegisterId: otherCajaId });
    const voided = await seedCobro({ amount: 4 });
    await voidTx(voided, "transactions");
    await seedCobro({ amount: 5, transactionDate: "2019-12-31" }); // antes del corte
    expect(await firmeBalance(cajaId)).toBe(130000);

    const { statusCode, body } = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "  Matías Mamana ",
      amount: 100000,
      notes: "Retiro semanal",
    });
    expect(statusCode).toBe(201);
    const w = body.withdrawal!;
    expect(w.amount).toBe(100000);
    expect(w.paymentCount).toBe(2);
    expect(w.responsibleName).toBe("Matías Mamana");
    expect(w.cashRegisterType).toBe("efectivo");
    expect(w.transactionDate).toBe(daysAgo(0));
    expect(w.payments.map((p) => p.id).sort((x, y) => x - y)).toEqual([a, b].sort((x, y) => x - y));

    const [row] = await app.db
      .select({
        kind: schema.financialTransactions.kind,
        direction: schema.financialTransactions.direction,
        amount: schema.financialTransactions.amount,
        costCenterId: schema.financialTransactions.costCenterId,
        responsibleName: schema.financialTransactions.responsibleName,
        cashRegisterId: schema.financialTransactions.cashRegisterId,
        validationStatus: schema.financialTransactions.validationStatus,
        notes: schema.financialTransactions.notes,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.id, w.id),
        ),
      );
    expect(row).toMatchObject({
      kind: "expense",
      direction: "outflow",
      amount: 100000,
      costCenterId: retirosCostCenterId,
      responsibleName: "Matías Mamana",
      cashRegisterId: cajaId,
      validationStatus: "validado",
      notes: "Retiro semanal",
    });
    expect(await linkedPaymentIds(w.id)).toEqual([a, b].sort((x, y) => x - y));

    // Todo vinculado: no quedan cobros sin retiro; queda el remanente.
    const pending = await getPending(adminToken, `?cashRegisterId=${cajaId}`);
    expect(pending.body.rows).toHaveLength(0);
    expect(pending.body.summary.previousBalance).toBe(30000);
    expect(pending.body.summary.inflows).toHaveLength(0);
    expect(await firmeBalance(cajaId)).toBe(30000);
    // Sin conteo no hay arqueo ni ajuste.
    expect(await cashCountsOfCaja()).toHaveLength(0);
    expect(await liveRowsOfKind("adjustment")).toHaveLength(0);

    // Historial de cobros: a y b marcados como retirados.
    const list = await app.inject({
      method: "GET",
      url: `${BASE}/transactions?paymentMethod=cash&dateFrom=${daysAgo(30)}&dateTo=${daysAgo(0)}&limit=200`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const rows = (
      JSON.parse(list.body) as {
        rows: Array<{ id: number; withdrawalId: number | null; withdrawnAt: string | null }>;
      }
    ).rows;
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(a)?.withdrawalId).toBe(w.id);
    expect(byId.get(a)?.withdrawnAt).toBe(daysAgo(0));
    expect(byId.get(b)?.withdrawalId).toBe(w.id);
  });

  it("retiro parcial: el remanente queda en la caja y un cobro nunca se vincula dos veces", async () => {
    const a = await seedCobro({ amount: 100 });
    const w1 = await postWithdrawal(adminToken, { cajaId, responsibleName: "A", amount: 40 });
    expect(w1.statusCode).toBe(201);
    expect(await firmeBalance(cajaId)).toBe(60);

    const b = await seedCobro({ amount: 50 });
    const w2 = await postWithdrawal(adminToken, { cajaId, responsibleName: "B", amount: 110 });
    expect(w2.statusCode).toBe(201);
    expect(await linkedPaymentIds(w1.body.withdrawal!.id)).toEqual([a]);
    expect(await linkedPaymentIds(w2.body.withdrawal!.id)).toEqual([b]);
    expect(await firmeBalance(cajaId)).toBe(0);
  });

  it("fecha pasada vincula solo lo cobrado hasta esa fecha; rechaza fecha futura y anterior al corte", async () => {
    const a = await seedCobro({ amount: 100, transactionDate: daysAgo(10) });
    await seedCobro({ amount: 100, transactionDate: daysAgo(3) });
    const past = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "Martín Figueras",
      amount: 100,
      transactionDate: daysAgo(5),
    });
    expect(past.statusCode).toBe(201);
    expect(past.body.withdrawal!.transactionDate).toBe(daysAgo(5));
    expect(await linkedPaymentIds(past.body.withdrawal!.id)).toEqual([a]);

    const future = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "Martín Figueras",
      amount: 10,
      transactionDate: daysAgo(-1),
    });
    expect(future.statusCode).toBe(400);
    expect(future.body.message).toContain("futura");

    const preCutoff = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "Martín Figueras",
      amount: 10,
      transactionDate: "2019-12-31",
    });
    expect(preCutoff.statusCode).toBe(400);
    expect(preCutoff.body.message).toContain("anterior al corte");
  });

  it("conteo igual al esperado (fondo + firme + sin validar): sin ajuste, queda el arqueo", async () => {
    await setChangeFund(20000);
    await seedCobro({ amount: 50000 });
    await seedCobro({ amount: 5000, validationStatus: "pendiente" });
    const res = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "A",
      amount: 50000,
      countedAmount: 75000,
    });
    expect(res.statusCode).toBe(201);
    expect(await liveRowsOfKind("adjustment")).toHaveLength(0);
    const counts = await cashCountsOfCaja();
    expect(counts).toHaveLength(1);
    expect(counts[0]).toMatchObject({ expectedAmount: 75000, countedAmount: 75000, difference: 0 });
    expect(counts[0].notes).toContain(`retiro #${res.body.withdrawal!.id}`);
    expect(await firmeBalance(cajaId)).toBe(0);
  });

  it("faltante: sin nota → 400; con nota → ajuste de salida linkeado al retiro, el tope baja a lo contado, queda el arqueo", async () => {
    await seedCobro({ amount: 50000 });

    const noNote = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "A",
      amount: 45000,
      countedAmount: 45000,
    });
    expect(noNote.statusCode).toBe(400);
    expect(noNote.body.message).toContain("difiere de lo esperado en -5000");

    // Con nota pero llevándose más de lo contado: rollback total (ni ajuste
    // ni arqueo ni retiro).
    const overCounted = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "A",
      amount: 50000,
      countedAmount: 45000,
      notes: "Faltó cambio",
    });
    expect(overCounted.statusCode).toBe(400);
    expect(overCounted.body.message).toContain("supera el saldo");
    expect(await liveRowsOfKind("adjustment")).toHaveLength(0);
    expect(await cashCountsOfCaja()).toHaveLength(0);

    const ok = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "A",
      amount: 45000,
      countedAmount: 45000,
      notes: "Faltó cambio",
    });
    expect(ok.statusCode).toBe(201);
    const w = ok.body.withdrawal!;
    const adjustments = await liveRowsOfKind("adjustment");
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({ direction: "outflow", amount: 5000 });
    expect(adjustments[0].notes).toContain("Faltante al retirar");
    expect(adjustments[0].notes).toContain("Faltó cambio");
    // El ajuste nace antes que el retiro y cuelga de él.
    expect(adjustments[0].id).toBeLessThan(w.id);
    const [link] = await app.db
      .select({ targetId: schema.transactionLinks.targetId })
      .from(schema.transactionLinks)
      .where(
        and(
          tenantWhere(schema.transactionLinks, TEMPLO_CTX),
          eq(schema.transactionLinks.transactionId, adjustments[0].id),
        ),
      );
    expect(link.targetId).toBe(w.id);
    // El ajuste no es un "cobro vinculado".
    expect(w.paymentCount).toBe(1);
    expect(await firmeBalance(cajaId)).toBe(0);
    const counts = await cashCountsOfCaja();
    expect(counts).toHaveLength(1);
    expect(counts[0]).toMatchObject({ expectedAmount: 50000, countedAmount: 45000, difference: -5000 });

    // El próximo resumen arranca de cero: el ajuste es de este retiro.
    const sm = (await getPending(adminToken, `?cashRegisterId=${cajaId}`)).body.summary;
    expect(sm.outflows).toHaveLength(0);
    expect(sm.previousBalance).toBe(0);
  });

  it("sobrante: ajuste de entrada y se puede retirar lo contado", async () => {
    await seedCobro({ amount: 50000 });
    const res = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "A",
      amount: 52000,
      countedAmount: 52000,
      notes: "Propina que dejaron",
    });
    expect(res.statusCode).toBe(201);
    const adjustments = await liveRowsOfKind("adjustment");
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({ direction: "inflow", amount: 2000 });
    expect(adjustments[0].notes).toContain("Sobrante al retirar");
    expect(await firmeBalance(cajaId)).toBe(0);
  });

  it("el conteo solo va en un retiro de hoy", async () => {
    await seedCobro({ amount: 100, transactionDate: daysAgo(5) });
    const res = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "A",
      amount: 100,
      countedAmount: 100,
      transactionDate: daysAgo(2),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("retiro de hoy");
  });

  it("validaciones de forma: sin monto, monto 0, responsable vacío o ausente", async () => {
    await seedCobro({ amount: 100 });
    const cases: Array<Record<string, unknown>> = [
      { cajaId, responsibleName: "A" },
      { cajaId, responsibleName: "A", amount: 0 },
      { cajaId, responsibleName: "   ", amount: 10 },
      { cajaId, amount: 10 },
      { cajaId, responsibleName: "A", amount: 10, countedAmount: -1 },
    ];
    for (const payload of cases) {
      const res = await postWithdrawal(adminToken, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await firmeBalance(cajaId)).toBe(100);
  });

  it("coach → 403", async () => {
    await seedCobro({ amount: 100 });
    const res = await postWithdrawal(coachToken, {
      cajaId,
      responsibleName: "A",
      amount: 100,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("anulación y retiros", () => {
  it("anular un cobro retirado → 409; anular el retiro libera el cobro y entonces se anula", async () => {
    const a = await seedCobro({ amount: 100 });
    const b = await seedCobro({ amount: 200 });
    const w = (
      await postWithdrawal(adminToken, { cajaId, responsibleName: "A", amount: 300 })
    ).body.withdrawal!;

    const blocked = await voidTx(a, "transactions");
    expect(blocked.statusCode).toBe(409);
    expect(blocked.body.message).toContain(`retiro #${w.id}`);

    const voidW = await voidTx(w.id, "expenses");
    expect(voidW.statusCode).toBe(200);

    const pending = await getPending(adminToken, `?cashRegisterId=${cajaId}`);
    expect(pending.body.rows.map((r) => r.id).sort((x, y) => x - y)).toEqual(
      [a, b].sort((x, y) => x - y),
    );
    expect(await firmeBalance(cajaId)).toBe(300);

    const nowOk = await voidTx(a, "transactions");
    expect(nowOk.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals?cashRegisterId=${cajaId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const rows = (JSON.parse(list.body) as { rows: WithdrawalBody[] }).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(w.id);
    expect(rows[0].voidedAt).not.toBeNull();
    expect(rows[0].paymentCount).toBe(2);
  });

  it("anular un retiro con faltante anula también su ajuste (recargarlo no duplica la diferencia)", async () => {
    await seedCobro({ amount: 1000 });
    const w = (
      await postWithdrawal(adminToken, {
        cajaId,
        responsibleName: "A",
        amount: 900,
        countedAmount: 900,
        notes: "Faltan 100",
      })
    ).body.withdrawal!;
    expect(await liveRowsOfKind("adjustment")).toHaveLength(1);

    expect((await voidTx(w.id, "expenses")).statusCode).toBe(200);
    expect(await liveRowsOfKind("adjustment")).toHaveLength(0);
    expect(await firmeBalance(cajaId)).toBe(1000);

    // Recargado: la misma diferencia, una sola vez.
    const again = await postWithdrawal(adminToken, {
      cajaId,
      responsibleName: "A",
      amount: 900,
      countedAmount: 900,
      notes: "Faltan 100",
    });
    expect(again.statusCode).toBe(201);
    expect(await liveRowsOfKind("adjustment")).toHaveLength(1);
    expect(await firmeBalance(cajaId)).toBe(0);
  });

  it("los cobros de un retiro anulado se vuelven a vincular en el siguiente", async () => {
    const a = await seedCobro({ amount: 100 });
    const w1 = (
      await postWithdrawal(adminToken, { cajaId, responsibleName: "A", amount: 100 })
    ).body.withdrawal!;
    await voidTx(w1.id, "expenses");
    const w2 = await postWithdrawal(adminToken, { cajaId, responsibleName: "B", amount: 100 });
    expect(w2.statusCode).toBe(201);
    expect(await linkedPaymentIds(w2.body.withdrawal!.id)).toEqual([a]);
  });
});

describe("POST /withdrawals — cuenta banco", () => {
  it("monto explícito, sin cobros; paymentCount 0; resta del saldo de la cuenta", async () => {
    await seedCobro({
      amount: 500,
      paymentMethod: "transfer",
      cashRegisterId: bankCajaId,
    });
    expect(await firmeBalance(bankCajaId)).toBe(500);
    const res = await postWithdrawal(adminToken, {
      cajaId: bankCajaId,
      responsibleName: "Martín Figueras",
      amount: 300,
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.withdrawal!.amount).toBe(300);
    expect(res.body.withdrawal!.paymentCount).toBe(0);
    expect(res.body.withdrawal!.cashRegisterType).toBe("banco");
    expect(await firmeBalance(bankCajaId)).toBe(200);
  });

  it("sin amount → 400; con conteo → 400", async () => {
    const noAmount = await postWithdrawal(adminToken, {
      cajaId: bankCajaId,
      responsibleName: "A",
    });
    expect(noAmount.statusCode).toBe(400);
    const counted = await postWithdrawal(adminToken, {
      cajaId: bankCajaId,
      responsibleName: "A",
      amount: 100,
      countedAmount: 100,
    });
    expect(counted.statusCode).toBe(400);
    expect(counted.body.message).toContain("no se cuenta");
  });
});

describe("egresos manuales con centro Retiros", () => {
  it("POST /expenses con el centro 'Retiros' → 400 (usar Registrar retiro)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/expenses`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cajaId, amount: 100, costCenterId: retirosCostCenterId },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain("Retiros");
  });

  it("un egreso con otro centro sigue funcionando y NO aparece como retiro", async () => {
    // Guard 2026-09-18: un egreso de efectivo necesita saldo firme que lo cubra.
    await seedCobro({ amount: 100 });
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/expenses`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { cajaId, amount: 100, costCenterId: variosCostCenterId },
    });
    expect(res.statusCode).toBe(201);
    const expenseId = (JSON.parse(res.body) as { expense: { expenseTxId: number } })
      .expense.expenseTxId;

    const list = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect((JSON.parse(list.body) as { rows: unknown[] }).rows).toHaveLength(0);

    const detail = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals/${expenseId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detail.statusCode).toBe(404);
  });
});

describe("GET /withdrawals, /withdrawals/:id, /withdrawals/responsibles", () => {
  it("lista filtrada por caja, detalle con cobros, y responsables sugeridos", async () => {
    const a = await seedCobro({ amount: 100 });
    const w = (
      await postWithdrawal(adminToken, {
        cajaId,
        responsibleName: "Candela Daibes",
        amount: 100,
      })
    ).body.withdrawal!;
    await postWithdrawal(adminToken, {
      cajaId: bankCajaId,
      responsibleName: "Martín Figueras",
      amount: 50,
    });

    const all = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect((JSON.parse(all.body) as { total: number }).total).toBe(2);

    const onlyCaja = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals?cashRegisterId=${cajaId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const rows = (JSON.parse(onlyCaja.body) as { rows: WithdrawalBody[] }).rows;
    expect(rows.map((r) => r.id)).toEqual([w.id]);
    expect(rows[0].responsibleName).toBe("Candela Daibes");

    const detail = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals/${w.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detail.statusCode).toBe(200);
    const d = JSON.parse(detail.body) as WithdrawalBody;
    expect(d.payments.map((p) => p.id)).toEqual([a]);
    expect(d.payments[0].amount).toBe(100);

    const resp = await app.inject({
      method: "GET",
      url: `${BASE}/withdrawals/responsibles`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    const names = JSON.parse(resp.body) as string[];
    expect(names).toContain("Candela Daibes");
    expect(names).toContain("Martín Figueras");
    expect(names).toContain("Coach Retiros"); // staff activo
    expect(new Set(names).size).toBe(names.length);
  });
});
