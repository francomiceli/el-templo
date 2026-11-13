/**
 * Fase 209 Plan 08 (DI-05, DI-07, DI-13, DI-14, DI-16): rutas HTTP de los pagos
 * de un gasto de Egresos.
 *
 * Cubre `POST /expense-records/:id/payments` y
 * `POST /expense-records/:id/payments/:paymentId/void`:
 *   - schemas Ajv: importe entero (un decimal da 400), medio del enum, tipo de
 *     cambio positivo, fecha `AAAA-MM-DD`, cuenta obligatoria
 *   - idempotencia (`idempotencyKey` repetida → 200 con el mismo pago)
 *   - roles: gestion carga pagos pero no los anula; admin y owner anulan;
 *     `admin_sede`, `recepcion` y `coach` reciben el rechazo por rol y no
 *     escriben nada
 *   - gestion paga desde un banco sin sede aunque NO lo vea en Saldos por caja
 *   - alcance por país: gestion de Argentina no toca un gasto de España
 *   - el pago se lee en Caja → Movimientos como un egreso con su rubro y no
 *     aparece en Retiros
 *   - `direct_debit` sirve desde un banco y no desde una caja de efectivo
 *
 * El aislamiento entre gimnasios está en `test/tenancy/iso-03-finance-egresos`.
 *
 * Corre contra la DB de test por worker. Todo lo que crea el archivo (gastos,
 * pagos, ledger, rubros, sedes, cuentas, staff) se borra en `afterAll`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, count, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, createStaffUser, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { countryToday } from "../../src/modules/finance/expense-branches";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const BASE = "/api/admin/finance/expense-records";
const suf = `${Date.now() % 1_000_000}`;

/** Apertura conocida de los bancos propios: los saldos se afirman como literales. */
const APERTURA = 500000;

let app: FastifyInstance;
let ownerToken: string;
let gestionToken: string;
let adminToken: string;
let adminSedeToken: string;
let recepcionToken: string;
let coachToken: string;
let hoy = "";

let sedeAr = 0;
let sedeEs = 0;
let rubroAr = 0;
let rubroEs = 0;
let rubroArNombre = "";
let bancoId = 0;
let bancoRolesId = 0;
let bancoSaldosId = 0;
let bancoLectoresId = 0;
let efectivoId = 0;
const staffIds: number[] = [];
const cuentaIds: number[] = [];

interface PaymentBody {
  record: {
    id: number;
    paid: number;
    pending: number;
    status: string;
    payments: Array<{ id: number; voidedAt: string | null }>;
  };
  payment: {
    id: number;
    transactionId: number;
    amount: number;
    appliedAmount: number;
    cashRegisterId: number;
    paymentMethod: string;
  };
}

interface RecordBody {
  record: PaymentBody["record"];
}

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function api(
  token: string,
  method: "GET" | "POST",
  url: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url: `${BASE}${url}`,
    headers: authed(token),
    ...(payload === undefined ? {} : { payload }),
  });
}

/** Alta de un gasto AR (ARS, confirmado, directo a la sede propia) y devuelve el id. */
async function crearGasto(
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const res = await api(ownerToken, "POST", "?country=AR", {
    concept: `EGR-08 gasto ${suf}`,
    costCenterId: rubroAr,
    imputationMonth: "2026-11",
    amount: 12000,
    currency: "ARS",
    amountStatus: "confirmado",
    allocations: [{ branchId: sedeAr, amount: 12000 }],
    ...overrides,
  });
  expect(res.statusCode, res.body).toBe(201);
  return (JSON.parse(res.body) as RecordBody).record.id;
}

/** Cuerpo válido de un pago por transferencia desde la cuenta indicada. */
function cuerpoPago(
  cashRegisterId: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    paidOn: hoy,
    cashRegisterId,
    paymentMethod: "transfer",
    amount: 3000,
    ...overrides,
  };
}

async function pagar(
  token: string,
  recordId: number,
  body: Record<string, unknown>,
) {
  return api(token, "POST", `/${recordId}/payments`, body);
}

async function anular(
  token: string,
  recordId: number,
  paymentId: number,
  body: Record<string, unknown> = { reason: "pago cargado de más" },
) {
  return api(token, "POST", `/${recordId}/payments/${paymentId}/void`, body);
}

/** Alta de un pago como owner; devuelve el cuerpo ya parseado. */
async function pagoDelOwner(
  recordId: number,
  cashRegisterId: number,
  overrides: Record<string, unknown> = {},
): Promise<PaymentBody> {
  const res = await pagar(
    ownerToken,
    recordId,
    cuerpoPago(cashRegisterId, overrides),
  );
  expect(res.statusCode, res.body).toBe(201);
  return JSON.parse(res.body) as PaymentBody;
}

/** Cantidad de pagos (vigentes o anulados) de un gasto, leída de la DB. */
async function contarPagos(recordId: number): Promise<number> {
  const [fila] = await app.db
    .select({ n: count() })
    .from(schema.expensePayments)
    .where(
      and(
        tenantWhere(schema.expensePayments, CTX),
        eq(schema.expensePayments.expenseRecordId, recordId),
      ),
    );
  return Number(fila?.n ?? 0);
}

/** Cantidad de pagos VIGENTES de un gasto, leída de la DB. */
async function contarPagosVigentes(recordId: number): Promise<number> {
  const filas = await app.db
    .select({ voidedAt: schema.expensePayments.voidedAt })
    .from(schema.expensePayments)
    .where(
      and(
        tenantWhere(schema.expensePayments, CTX),
        eq(schema.expensePayments.expenseRecordId, recordId),
      ),
    );
  return filas.filter((f) => f.voidedAt === null).length;
}

/** Cantidad de filas del ledger de una cuenta, leída de la DB. */
async function contarLedger(cashRegisterId: number): Promise<number> {
  const [fila] = await app.db
    .select({ n: count() })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, CTX),
        eq(schema.financialTransactions.cashRegisterId, cashRegisterId),
      ),
    );
  return Number(fila?.n ?? 0);
}

interface SaldoRow {
  cashRegisterId: number;
  firmeBalance: number;
}

/** Saldos por caja tal como los ve el token indicado. */
async function saldosPara(token: string): Promise<SaldoRow[]> {
  const res = await app.inject({
    method: "GET",
    url: "/api/admin/finance/cash-registers/balances",
    headers: authed(token),
  });
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as SaldoRow[];
}

async function saldoDeLaCuenta(cuentaId: number): Promise<number | null> {
  const fila = (await saldosPara(ownerToken)).find(
    (s) => s.cashRegisterId === cuentaId,
  );
  return fila === undefined ? null : fila.firmeBalance;
}

async function crearStaff(
  rol: "gestion" | "admin" | "admin_sede" | "recepcion" | "coach",
): Promise<string> {
  const email = `egr08-${rol}-${suf}@test.local`;
  const userId = await createStaffUser(app, {
    email,
    password: "pass123456",
    firstName: "Egr08",
    lastName: rol,
    role: rol,
    branchId: sedeAr,
    country: "AR",
  });
  staffIds.push(userId);
  return getAuthToken(app, email, "pass123456");
}

/** Cuenta banco sin sede, en pesos, con apertura conocida y corte lejano. */
async function crearBanco(nombre: string): Promise<number> {
  const [banco] = await app.db.insert(schema.cashRegisters).values(
    tenantValues(CTX, {
      name: nombre,
      type: "banco" as const,
      branchId: null,
      currency: "ARS",
      bankName: "Banco Test",
      accountHolder: "Test",
      accountAlias: `egr08.${cuentaIds.length}.${suf}`,
      openingBalance: APERTURA,
      cutoffDate: "2020-01-01",
    }),
  );
  const id = Number(banco.insertId);
  cuentaIds.push(id);
  return id;
}

beforeAll(async () => {
  app = await createTestApp();

  // admin@test.com es OWNER (test/setup.ts).
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  const [sAr] = await app.db.insert(schema.branches).values(
    tenantValues(CTX, {
      name: `ZZZ-EGR-08 ${suf}-AR`,
      code: `E8AR${suf}`.slice(0, 20),
      country: "AR",
    }),
  );
  sedeAr = Number(sAr.insertId);
  const [sEs] = await app.db.insert(schema.branches).values(
    tenantValues(CTX, {
      name: `ZZZ-EGR-08 ${suf}-ES`,
      code: `E8ES${suf}`.slice(0, 20),
      country: "ES",
      timezone: "Europe/Madrid",
    }),
  );
  sedeEs = Number(sEs.insertId);

  rubroArNombre = `EGR-08 AR ${suf}`;
  const [rAr] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(CTX, { name: rubroArNombre, country: "AR" }));
  rubroAr = Number(rAr.insertId);
  const [rEs] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(CTX, { name: `EGR-08 ES ${suf}`, country: "ES" }));
  rubroEs = Number(rEs.insertId);

  // Cuentas SIN sede: un banco por grupo de pruebas (así los saldos no se pisan)
  // y una caja de efectivo.
  bancoId = await crearBanco(`EGR-08 banco ${suf}`);
  bancoRolesId = await crearBanco(`EGR-08 banco roles ${suf}`);
  bancoSaldosId = await crearBanco(`EGR-08 banco saldos ${suf}`);
  bancoLectoresId = await crearBanco(`EGR-08 banco lectores ${suf}`);
  const [efectivo] = await app.db.insert(schema.cashRegisters).values(
    tenantValues(CTX, {
      name: `EGR-08 efectivo ${suf}`,
      type: "efectivo" as const,
      branchId: null,
      currency: "ARS",
      openingBalance: APERTURA,
      cutoffDate: "2020-01-01",
    }),
  );
  efectivoId = Number(efectivo.insertId);
  cuentaIds.push(efectivoId);

  hoy = await countryToday(app.db, CTX, "AR");

  gestionToken = await crearStaff("gestion");
  adminToken = await crearStaff("admin");
  adminSedeToken = await crearStaff("admin_sede");
  recepcionToken = await crearStaff("recepcion");
  coachToken = await crearStaff("coach");
});

afterAll(async () => {
  // Orden: pagos → ledger por cuenta → audit del ledger → reparto → gastos →
  // audit propio → cuentas → rubros → staff → sedes.
  const propios = await app.db
    .select({ id: schema.expenseRecords.id })
    .from(schema.expenseRecords)
    .where(
      and(
        tenantWhere(schema.expenseRecords, CTX),
        inArray(schema.expenseRecords.costCenterId, [rubroAr, rubroEs]),
      ),
    );
  const recordIds = propios.map((r) => r.id);
  if (recordIds.length > 0) {
    await app.db
      .delete(schema.expensePayments)
      .where(
        and(
          tenantWhere(schema.expensePayments, CTX),
          inArray(schema.expensePayments.expenseRecordId, recordIds),
        ),
      );
  }
  const ledger = await app.db
    .select({ id: schema.financialTransactions.id })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, CTX),
        inArray(schema.financialTransactions.cashRegisterId, cuentaIds),
      ),
    );
  const ledgerIds = ledger.map((l) => l.id);
  if (ledgerIds.length > 0) {
    await app.db
      .delete(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, CTX),
          inArray(schema.financialTransactions.id, ledgerIds),
        ),
      );
    await app.db
      .delete(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, CTX),
          eq(schema.auditLog.targetKind, "transaction"),
          inArray(schema.auditLog.targetId, ledgerIds),
        ),
      );
  }
  if (recordIds.length > 0) {
    await app.db
      .delete(schema.expenseAllocations)
      .where(
        and(
          tenantWhere(schema.expenseAllocations, CTX),
          inArray(schema.expenseAllocations.expenseRecordId, recordIds),
        ),
      );
    await app.db
      .delete(schema.expenseRecords)
      .where(
        and(
          tenantWhere(schema.expenseRecords, CTX),
          inArray(schema.expenseRecords.id, recordIds),
        ),
      );
    await app.db
      .delete(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, CTX),
          eq(schema.auditLog.targetKind, "expense_record"),
          inArray(schema.auditLog.targetId, recordIds),
        ),
      );
  }
  await app.db
    .delete(schema.cashRegisters)
    .where(
      and(
        tenantWhere(schema.cashRegisters, CTX),
        inArray(schema.cashRegisters.id, cuentaIds),
      ),
    );
  await app.db
    .delete(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, CTX),
        inArray(schema.costCenters.id, [rubroAr, rubroEs]),
      ),
    );
  // El staff de prueba cuelga de la sede propia (FK): sale antes que ella.
  await app.db
    .delete(schema.userBranches)
    .where(
      and(
        tenantWhere(schema.userBranches, CTX),
        inArray(schema.userBranches.userId, staffIds),
      ),
    );
  await app.db
    .delete(schema.users)
    .where(
      and(tenantWhere(schema.users, CTX), inArray(schema.users.id, staffIds)),
    );
  await app.db
    .delete(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, CTX),
        inArray(schema.branches.id, [sedeAr, sedeEs]),
      ),
    );
  await app.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// Registrar pago: owner, idempotencia
// ═══════════════════════════════════════════════════════════════════════════

describe("registrar pago (owner)", () => {
  it("responde 201 con el gasto y el pago, y deja UNA fila de egreso en el ledger", async () => {
    const gastoId = await crearGasto();
    const ledgerAntes = await contarLedger(bancoId);

    const res = await pagar(ownerToken, gastoId, cuerpoPago(bancoId));
    expect(res.statusCode, res.body).toBe(201);
    const { record, payment } = JSON.parse(res.body) as PaymentBody;

    expect(payment.amount).toBe(3000);
    expect(payment.appliedAmount).toBe(3000);
    expect(payment.cashRegisterId).toBe(bancoId);
    expect(record.id).toBe(gastoId);
    expect(record.paid).toBe(3000);
    expect(record.pending).toBe(9000);
    expect(record.status).toBe("parcial");
    expect(record.payments.map((p) => p.id)).toEqual([payment.id]);

    // El ledger: una fila `expense`/`outflow` por el mismo importe, sin
    // `responsible_name` (con él, Caja la leería como un retiro).
    expect(await contarLedger(bancoId)).toBe(ledgerAntes + 1);
    const [fila] = await app.db
      .select({
        kind: schema.financialTransactions.kind,
        direction: schema.financialTransactions.direction,
        amount: schema.financialTransactions.amount,
        cashRegisterId: schema.financialTransactions.cashRegisterId,
        responsibleName: schema.financialTransactions.responsibleName,
        voidedAt: schema.financialTransactions.voidedAt,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, CTX),
          eq(schema.financialTransactions.id, payment.transactionId),
        ),
      );
    expect(fila).toEqual({
      kind: "expense",
      direction: "outflow",
      amount: 3000,
      cashRegisterId: bancoId,
      responsibleName: null,
      voidedAt: null,
    });
  });

  it("repetir la misma idempotencyKey responde 200 con el mismo pago y no escribe otro", async () => {
    const gastoId = await crearGasto();
    const body = cuerpoPago(bancoId, {
      idempotencyKey: `egr08-clave-${suf}`,
    });
    const primero = await pagar(ownerToken, gastoId, body);
    expect(primero.statusCode, primero.body).toBe(201);
    const idPrimero = (JSON.parse(primero.body) as PaymentBody).payment.id;
    const ledgerAntes = await contarLedger(bancoId);

    const segundo = await pagar(ownerToken, gastoId, body);
    expect(segundo.statusCode, segundo.body).toBe(200);
    const repetido = JSON.parse(segundo.body) as PaymentBody;
    expect(repetido.payment.id).toBe(idPrimero);
    expect(repetido.record.paid).toBe(3000);

    expect(await contarPagos(gastoId)).toBe(1);
    expect(await contarLedger(bancoId)).toBe(ledgerAntes);
  });

  it("la misma idempotencyKey sobre OTRO gasto responde 409 y no escribe nada", async () => {
    const gastoA = await crearGasto();
    const gastoB = await crearGasto();
    const body = cuerpoPago(bancoId, { idempotencyKey: `egr08-cruce-${suf}` });
    expect((await pagar(ownerToken, gastoA, body)).statusCode).toBe(201);

    const res = await pagar(ownerToken, gastoB, body);
    expect(res.statusCode, res.body).toBe(409);
    expect(await contarPagos(gastoB)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Schemas Ajv
// ═══════════════════════════════════════════════════════════════════════════

describe("schemas del pago", () => {
  it("un importe decimal da 400 y no escribe nada", async () => {
    const gastoId = await crearGasto();
    const ledgerAntes = await contarLedger(bancoId);
    const res = await pagar(
      ownerToken,
      gastoId,
      cuerpoPago(bancoId, { amount: 10.5 }),
    );
    expect(res.statusCode, res.body).toBe(400);
    expect(await contarPagos(gastoId)).toBe(0);
    expect(await contarLedger(bancoId)).toBe(ledgerAntes);
  });

  it("un importe en cero o sobre el tope da 400", async () => {
    const gastoId = await crearGasto();
    const enCero = await pagar(
      ownerToken,
      gastoId,
      cuerpoPago(bancoId, { amount: 0 }),
    );
    const sobreElTope = await pagar(
      ownerToken,
      gastoId,
      cuerpoPago(bancoId, { amount: 2_000_000_000_000 }),
    );
    expect(enCero.statusCode, enCero.body).toBe(400);
    expect(sobreElTope.statusCode, sobreElTope.body).toBe(400);
    expect(await contarPagos(gastoId)).toBe(0);
  });

  it('un medio fuera del enum ("internal") da 400', async () => {
    const gastoId = await crearGasto();
    const res = await pagar(
      ownerToken,
      gastoId,
      cuerpoPago(bancoId, { paymentMethod: "internal" }),
    );
    expect(res.statusCode, res.body).toBe(400);
    expect(await contarPagos(gastoId)).toBe(0);
  });

  it("un tipo de cambio negativo da 400", async () => {
    const gastoId = await crearGasto();
    const res = await pagar(
      ownerToken,
      gastoId,
      cuerpoPago(bancoId, { fxRate: -1 }),
    );
    expect(res.statusCode, res.body).toBe(400);
    expect(await contarPagos(gastoId)).toBe(0);
  });

  it("una fecha con formato distinto de AAAA-MM-DD da 400", async () => {
    const gastoId = await crearGasto();
    const res = await pagar(
      ownerToken,
      gastoId,
      cuerpoPago(bancoId, { paidOn: "11/11/2026" }),
    );
    expect(res.statusCode, res.body).toBe(400);
    expect(await contarPagos(gastoId)).toBe(0);
  });

  it("sin cashRegisterId da 400", async () => {
    const gastoId = await crearGasto();
    const cuerpo = cuerpoPago(bancoId);
    delete cuerpo.cashRegisterId;
    const res = await pagar(ownerToken, gastoId, cuerpo);
    expect(res.statusCode, res.body).toBe(400);
    expect(await contarPagos(gastoId)).toBe(0);
  });

  it("anular sin motivo da 400 y el pago sigue vigente", async () => {
    const gastoId = await crearGasto();
    const { payment } = await pagoDelOwner(gastoId, bancoId);
    const sinMotivo = await anular(ownerToken, gastoId, payment.id, {});
    const motivoVacio = await anular(ownerToken, gastoId, payment.id, {
      reason: "",
    });
    expect(sinMotivo.statusCode, sinMotivo.body).toBe(400);
    expect(motivoVacio.statusCode, motivoVacio.body).toBe(400);
    expect(await contarPagosVigentes(gastoId)).toBe(1);
  });

  it("sin token responde 401 en las dos rutas", async () => {
    const pago = await app.inject({
      method: "POST",
      url: `${BASE}/1/payments`,
      payload: cuerpoPago(bancoId),
    });
    const anulacion = await app.inject({
      method: "POST",
      url: `${BASE}/1/payments/1/void`,
      payload: { reason: "x" },
    });
    expect(pago.statusCode).toBe(401);
    expect(anulacion.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Roles (DI-14) y cuentas sin saldos (DI-07)
// ═══════════════════════════════════════════════════════════════════════════

describe("gestion paga desde un banco sin ver saldos", () => {
  it("el banco NO está en Saldos por caja de gestion, y aun así paga y el saldo baja exacto", async () => {
    // Saldos por caja: el banco sin sede es del owner.
    const saldosGestion = await saldosPara(gestionToken);
    expect(saldosGestion.map((s) => s.cashRegisterId)).not.toContain(
      bancoSaldosId,
    );
    expect(await saldoDeLaCuenta(bancoSaldosId)).toBe(APERTURA);

    // Las opciones del formulario sí la ofrecen, sin ningún dato de saldo.
    const opciones = await api(gestionToken, "GET", "/form-options");
    expect(opciones.statusCode, opciones.body).toBe(200);
    const { accounts } = JSON.parse(opciones.body) as {
      accounts: Array<Record<string, unknown>>;
    };
    const cuenta = accounts.find((a) => a.id === bancoSaldosId);
    expect(cuenta).toBeDefined();
    expect(Object.keys(cuenta ?? {}).join(",")).not.toMatch(/balance|saldo/i);

    // Paga por transferencia desde ese banco.
    const gastoId = await crearGasto();
    const res = await pagar(
      gestionToken,
      gastoId,
      cuerpoPago(bancoSaldosId, { amount: 4000 }),
    );
    expect(res.statusCode, res.body).toBe(201);
    expect((JSON.parse(res.body) as PaymentBody).record.paid).toBe(4000);

    // La respuesta no devuelve saldos de la cuenta.
    expect(res.body).not.toMatch(/firmeBalance/);
    // Leído como owner, el saldo bajó exactamente lo pagado.
    expect(await saldoDeLaCuenta(bancoSaldosId)).toBe(APERTURA - 4000);
  });
});

describe("anular un pago: owner y admin sí, gestion no", () => {
  it("gestion recibe el rechazo por rol y el pago sigue vigente", async () => {
    const gastoId = await crearGasto();
    const { payment } = await pagoDelOwner(gastoId, bancoRolesId);

    const res = await anular(gestionToken, gastoId, payment.id);
    expect(res.statusCode, res.body).toBe(403);
    expect(await contarPagosVigentes(gastoId)).toBe(1);
  });

  it("admin anula: 200, el pago queda anulado y el gasto vuelve a pendiente", async () => {
    const gastoId = await crearGasto();
    const { payment } = await pagoDelOwner(gastoId, bancoRolesId);

    const res = await anular(adminToken, gastoId, payment.id);
    expect(res.statusCode, res.body).toBe(200);
    const { record } = JSON.parse(res.body) as RecordBody;
    expect(record.paid).toBe(0);
    expect(record.pending).toBe(12000);
    expect(record.status).toBe("pendiente");
    expect(record.payments.find((p) => p.id === payment.id)?.voidedAt).not.toBe(
      null,
    );
    expect(await contarPagosVigentes(gastoId)).toBe(0);
  });

  it("owner también anula, y anular dos veces el mismo pago da 400", async () => {
    const gastoId = await crearGasto();
    const { payment } = await pagoDelOwner(gastoId, bancoRolesId);

    const primera = await anular(ownerToken, gastoId, payment.id);
    expect(primera.statusCode, primera.body).toBe(200);
    const segunda = await anular(ownerToken, gastoId, payment.id);
    expect(segunda.statusCode, segunda.body).toBe(400);
  });

  it("el saldo del banco vuelve a lo que era al anular el pago", async () => {
    const antes = await saldoDeLaCuenta(bancoRolesId);
    const gastoId = await crearGasto();
    const { payment } = await pagoDelOwner(gastoId, bancoRolesId, {
      amount: 2500,
    });
    expect(await saldoDeLaCuenta(bancoRolesId)).toBe((antes ?? 0) - 2500);

    expect((await anular(adminToken, gastoId, payment.id)).statusCode).toBe(
      200,
    );
    expect(await saldoDeLaCuenta(bancoRolesId)).toBe(antes);
  });
});

describe("roles sin permiso en las dos rutas de pagos", () => {
  async function sinPermiso(token: string): Promise<void> {
    const gastoId = await crearGasto();
    const { payment } = await pagoDelOwner(gastoId, bancoRolesId);
    const pagosAntes = await contarPagos(gastoId);
    const ledgerAntes = await contarLedger(bancoRolesId);

    const alPagar = await pagar(token, gastoId, cuerpoPago(bancoRolesId));
    const alAnular = await anular(token, gastoId, payment.id);

    expect(alPagar.statusCode, alPagar.body).toBe(403);
    expect(alAnular.statusCode, alAnular.body).toBe(403);
    // Nada cambió: el mismo pago vigente y ninguna fila nueva.
    expect(await contarPagos(gastoId)).toBe(pagosAntes);
    expect(await contarPagosVigentes(gastoId)).toBe(1);
    expect(await contarLedger(bancoRolesId)).toBe(ledgerAntes);
  }

  it("admin_sede recibe el rechazo por rol", async () => {
    await sinPermiso(adminSedeToken);
  });

  it("recepcion recibe el rechazo por rol", async () => {
    await sinPermiso(recepcionToken);
  });

  it("coach recibe el rechazo por rol", async () => {
    await sinPermiso(coachToken);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Alcance por país
// ═══════════════════════════════════════════════════════════════════════════

describe("alcance por país", () => {
  it("gestion de Argentina no puede pagar un gasto de España del owner: 404 y nada escrito", async () => {
    const res = await api(ownerToken, "POST", "?country=ES", {
      concept: `EGR-08 gasto ES ${suf}`,
      costCenterId: rubroEs,
      imputationMonth: "2026-11",
      amount: 800,
      currency: "EUR",
      amountStatus: "confirmado",
      allocations: [{ branchId: sedeEs, amount: 800 }],
    });
    expect(res.statusCode, res.body).toBe(201);
    const gastoEsId = (JSON.parse(res.body) as RecordBody).record.id;
    const ledgerAntes = await contarLedger(bancoId);

    const intento = await pagar(gestionToken, gastoEsId, cuerpoPago(bancoId));
    expect(intento.statusCode, intento.body).toBe(404);
    expect(await contarPagos(gastoEsId)).toBe(0);
    expect(await contarLedger(bancoId)).toBe(ledgerAntes);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// El pago se lee en Caja como cualquier egreso
// ═══════════════════════════════════════════════════════════════════════════

describe("el pago en los lectores de Caja", () => {
  it("aparece en Movimientos como egreso con su rubro y NO aparece en Retiros", async () => {
    const gastoId = await crearGasto();
    const { payment } = await pagoDelOwner(gastoId, bancoLectoresId, {
      amount: 1800,
    });

    const movimientos = await app.inject({
      method: "GET",
      url: `/api/admin/finance/movements-history?cashRegisterId=${bancoLectoresId}`,
      headers: authed(ownerToken),
    });
    expect(movimientos.statusCode, movimientos.body).toBe(200);
    const { rows } = JSON.parse(movimientos.body) as {
      rows: Array<{
        id: number;
        kind: string;
        direction: string;
        amount: number;
        costCenterName: string | null;
        responsibleName: string | null;
        voidedAt: string | null;
      }>;
    };
    const fila = rows.find((r) => r.id === payment.transactionId);
    expect(fila).toMatchObject({
      kind: "expense",
      direction: "outflow",
      amount: 1800,
      costCenterName: rubroArNombre,
      responsibleName: null,
      voidedAt: null,
    });

    const retiros = await app.inject({
      method: "GET",
      url: `/api/admin/finance/withdrawals?cashRegisterId=${bancoLectoresId}`,
      headers: authed(ownerToken),
    });
    expect(retiros.statusCode, retiros.body).toBe(200);
    const { rows: filasRetiros } = JSON.parse(retiros.body) as {
      rows: Array<{ id: number }>;
    };
    expect(filasRetiros.map((r) => r.id)).not.toContain(payment.transactionId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Débito automático
// ═══════════════════════════════════════════════════════════════════════════

describe("débito automático (direct_debit)", () => {
  it("desde un banco responde 201", async () => {
    const gastoId = await crearGasto();
    const res = await pagar(
      ownerToken,
      gastoId,
      cuerpoPago(bancoId, { paymentMethod: "direct_debit" }),
    );
    expect(res.statusCode, res.body).toBe(201);
    expect((JSON.parse(res.body) as PaymentBody).payment.paymentMethod).toBe(
      "direct_debit",
    );
  });

  it("desde una caja de efectivo responde 400 y no escribe nada", async () => {
    const gastoId = await crearGasto();
    const ledgerAntes = await contarLedger(efectivoId);
    const res = await pagar(
      ownerToken,
      gastoId,
      cuerpoPago(efectivoId, { paymentMethod: "direct_debit" }),
    );
    expect(res.statusCode, res.body).toBe(400);
    expect(await contarPagos(gastoId)).toBe(0);
    expect(await contarLedger(efectivoId)).toBe(ledgerAntes);
  });
});
