/**
 * Fase 209 Plan 06: anulación de pagos de gastos, guarda de Caja, reglas de
 * 209-04 con pagos reales y débito automático saliente (DI-06), todo sin rutas.
 *
 * Cubre:
 *   - `ExpensePaymentService.voidPayment` (DI-10): motivo obligatorio, ledger
 *     anulado en la misma transacción (saldo exacto), estado del gasto
 *     recalculado, historial, doble anulación, otro gasto / otro país, carrera.
 *   - `assertNotExpensePaymentRow` (T-209-21): la fila del ledger de un pago no se
 *     anula ni corrige desde Caja (`voidExpense`, `TransactionService.void`,
 *     `TransactionService.correct`) y la guarda no cambia el resultado para un
 *     egreso común.
 *   - Reglas de 209-04 que dependían de pagos (armados con el service real).
 *   - `direct_debit` como medio de un pago desde un banco (DI-06).
 *
 * Cuentas propias por test (apertura conocida), saldos afirmados con LITERALES
 * comentados. Corre contra la MySQL de test, en foreground.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, count, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../src/modules/shared/errors";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { BalanceService } from "../../src/modules/finance/balance-service";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { MovementService } from "../../src/modules/finance/movement-service";
import { ExpenseRecordService } from "../../src/modules/finance/expense-record-service";
import { ExpensePaymentService } from "../../src/modules/finance/expense-payment-service";
import type {
  ExpenseCountry,
  ExpenseRecordDetail,
  RegisterExpensePaymentInput,
} from "../../src/modules/finance/expense-types";

const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const sufijo = `${Date.now() % 1_000_000}`;
const PREFIJO = `EGR-06 ${sufijo}`;
const HOY = todayInTz("America/Argentina/Buenos_Aires");
const AYER = addDays(HOY, -1);

const TEXTO_CAJA =
  "Este movimiento es el pago de un gasto: anulalo desde Egresos, en el detalle del gasto";

let app: FastifyInstance;
let records: ExpenseRecordService;
let payments: ExpensePaymentService;
let txnService: TransactionService;
let cashRegisterService: CashRegisterService;
let movementService: MovementService;
let adminId: number;

const branchIds = { A: 0, es: 0 };
const costCenterIds = { ar: 0, lista: 0, es: 0 };
const cajaIds: number[] = [];
let contadorGastos = 0;

// ---------------------------------------------------------------------------
// Armado
// ---------------------------------------------------------------------------

async function crearSede(
  clave: keyof typeof branchIds,
  valores: { country: string; timezone?: string },
): Promise<void> {
  const [res] = await app.db.insert(schema.branches).values(
    tenantValues(TEMPLO_CTX, {
      ...valores,
      name: `ZZZ-EGR-06 ${sufijo}-${clave}`,
      code: `E6${clave.slice(0, 3)}${sufijo}`.slice(0, 20),
    }),
  );
  branchIds[clave] = Number(res.insertId);
}

async function crearRubro(
  clave: keyof typeof costCenterIds,
  valores: { name: string; country: string },
): Promise<void> {
  const [res] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(TEMPLO_CTX, valores));
  costCenterIds[clave] = Number(res.insertId);
}

/** Cuenta propia con apertura conocida. Se borra en `afterAll`. */
async function newCaja(opts: {
  name: string;
  type: "efectivo" | "banco";
  currency?: string;
  opening?: number;
  branchId?: number | null;
}): Promise<number> {
  const [row] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `${PREFIJO} ${opts.name}`,
        type: opts.type,
        branchId: opts.branchId ?? null,
        currency: opts.currency ?? "ARS",
        openingBalance: opts.opening ?? 0,
        cutoffDate: "2020-01-01",
        isActive: true,
      }),
    )
    .$returningId();
  cajaIds.push(row.id);
  return row.id;
}

/** Gasto AR propio (reparto directo a la sede A). */
async function crearGasto(
  opts: {
    amount?: number;
    status?: "estimado" | "confirmado";
    costCenterId?: number;
    imputationMonth?: string;
  } = {},
): Promise<ExpenseRecordDetail> {
  const amount = opts.amount ?? 100000;
  contadorGastos += 1;
  const { record } = await records.create(
    TEMPLO_CTX,
    "AR",
    {
      concept: `${PREFIJO} gasto ${contadorGastos}`,
      costCenterId: opts.costCenterId ?? costCenterIds.ar,
      imputationMonth: opts.imputationMonth ?? "2026-10",
      amount,
      currency: "ARS",
      amountStatus: opts.status ?? "confirmado",
      fxRate: null,
      allocations: [{ branchId: branchIds.A, amount }],
    },
    adminId,
  );
  return record;
}

/** Pago con defaults de AR: hoy, transferencia. */
function pagar(
  recordId: number,
  input: Pick<RegisterExpensePaymentInput, "cashRegisterId" | "amount"> &
    Partial<RegisterExpensePaymentInput>,
  country: ExpenseCountry = "AR",
) {
  return payments.registerPayment(
    TEMPLO_CTX,
    recordId,
    { paidOn: HOY, paymentMethod: "transfer", ...input },
    adminId,
    { country },
  );
}

function anular(
  recordId: number,
  paymentId: number,
  reason = "Se cargó mal",
  country: ExpenseCountry = "AR",
) {
  return payments.voidPayment(
    TEMPLO_CTX,
    recordId,
    paymentId,
    reason,
    adminId,
    {
      country,
    },
  );
}

async function firme(cajaId: number): Promise<number> {
  return Number(
    (await cashRegisterService.getBalance(TEMPLO_CTX, cajaId)).firmeBalance,
  );
}

async function leerLedger(id: number) {
  const [row] = await app.db
    .select()
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.id, id),
      ),
    )
    .limit(1);
  return row;
}

async function leerPago(id: number) {
  const [row] = await app.db
    .select()
    .from(schema.expensePayments)
    .where(
      and(
        tenantWhere(schema.expensePayments, TEMPLO_CTX),
        eq(schema.expensePayments.id, id),
      ),
    )
    .limit(1);
  return row;
}

async function contarPagos(recordId: number): Promise<number> {
  const [row] = await app.db
    .select({ n: count() })
    .from(schema.expensePayments)
    .where(
      and(
        tenantWhere(schema.expensePayments, TEMPLO_CTX),
        eq(schema.expensePayments.expenseRecordId, recordId),
      ),
    );
  return row.n;
}

/** Ejecuta algo que DEBE fallar con `clase` y devuelve el mensaje. */
async function falla(
  clase: typeof BadRequestError | typeof ConflictError | typeof NotFoundError,
  fn: () => Promise<unknown>,
): Promise<string> {
  let error: unknown;
  try {
    await fn();
  } catch (err: unknown) {
    error = err;
  }
  if (!(error instanceof clase)) {
    throw new Error(
      `Se esperaba ${clase.name} y se obtuvo: ${String(error ?? "ningún error")}`,
    );
  }
  return error.message;
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

beforeAll(async () => {
  app = await createTestApp();
  cashRegisterService = new CashRegisterService(app.db, app.log);
  txnService = new TransactionService(
    app.db,
    app.log,
    new BalanceService(app.db, app.log),
    cashRegisterService,
  );
  movementService = new MovementService(
    app.db,
    app.log,
    txnService,
    cashRegisterService,
  );
  records = new ExpenseRecordService(app.db, app.log);
  payments = new ExpensePaymentService(
    app.db,
    app.log,
    txnService,
    cashRegisterService,
    records,
  );

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

  await crearSede("A", { country: "AR" });
  await crearSede("es", { country: "ES", timezone: "Europe/Madrid" });

  await crearRubro("ar", { name: `${PREFIJO} AR`, country: "AR" });
  await crearRubro("lista", { name: `${PREFIJO} lista`, country: "AR" });
  await crearRubro("es", { name: `${PREFIJO} ES`, country: "ES" });
});

afterAll(async () => {
  // Orden: pagos → ledger propio (y su audit) → reparto → gastos → audit propio →
  // cajas → rubros → sedes.
  const cc = Object.values(costCenterIds).filter((id) => id > 0);
  const propios = await app.db
    .select({ id: schema.expenseRecords.id })
    .from(schema.expenseRecords)
    .where(
      and(
        tenantWhere(schema.expenseRecords, TEMPLO_CTX),
        inArray(schema.expenseRecords.costCenterId, cc),
      ),
    );
  const recordIds = propios.map((r) => r.id);
  if (recordIds.length > 0) {
    await app.db
      .delete(schema.expensePayments)
      .where(
        and(
          tenantWhere(schema.expensePayments, TEMPLO_CTX),
          inArray(schema.expensePayments.expenseRecordId, recordIds),
        ),
      );
  }
  if (cajaIds.length > 0) {
    const ledger = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          inArray(schema.financialTransactions.cashRegisterId, cajaIds),
        ),
      );
    const ledgerIds = ledger.map((l) => l.id);
    if (ledgerIds.length > 0) {
      await app.db
        .delete(schema.auditLog)
        .where(
          and(
            tenantWhere(schema.auditLog, TEMPLO_CTX),
            eq(schema.auditLog.targetKind, "transaction"),
            inArray(schema.auditLog.targetId, ledgerIds),
          ),
        );
    }
    await app.db
      .delete(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          inArray(schema.financialTransactions.cashRegisterId, cajaIds),
        ),
      );
  }
  if (recordIds.length > 0) {
    await app.db
      .delete(schema.expenseAllocations)
      .where(
        and(
          tenantWhere(schema.expenseAllocations, TEMPLO_CTX),
          inArray(schema.expenseAllocations.expenseRecordId, recordIds),
        ),
      );
    await app.db
      .delete(schema.expenseRecords)
      .where(
        and(
          tenantWhere(schema.expenseRecords, TEMPLO_CTX),
          inArray(schema.expenseRecords.id, recordIds),
        ),
      );
    await app.db
      .delete(schema.auditLog)
      .where(
        and(
          tenantWhere(schema.auditLog, TEMPLO_CTX),
          eq(schema.auditLog.targetKind, "expense_record"),
          inArray(schema.auditLog.targetId, recordIds),
        ),
      );
  }
  if (cajaIds.length > 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, cajaIds),
        ),
      );
  }
  await app.db
    .delete(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, TEMPLO_CTX),
        inArray(schema.costCenters.id, cc),
      ),
    );
  await app.db
    .delete(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, TEMPLO_CTX),
        inArray(schema.branches.id, Object.values(branchIds)),
      ),
    );
  await app.close();
});

// ---------------------------------------------------------------------------
// voidPayment
// ---------------------------------------------------------------------------

describe("ExpensePaymentService.voidPayment", () => {
  it("sin motivo (vacío o solo espacios): 400 y el pago sigue vigente", async () => {
    const banco = await newCaja({
      name: "banco sin motivo",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto();
    const { payment } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 40000,
    });
    // apertura 500000 - pago 40000 = 460000
    expect(await firme(banco)).toBe(460000);

    for (const motivo of ["", "   "]) {
      const mensaje = await falla(BadRequestError, () =>
        anular(gasto.id, payment.id, motivo),
      );
      expect(mensaje).toBe("El motivo de la anulación es obligatorio");
    }
    expect((await leerPago(payment.id)).voidedAt).toBeNull();
    expect((await leerLedger(payment.transactionId)).voidedAt).toBeNull();
    expect(await firme(banco)).toBe(460000);
  });

  it("anula un pago parcial: pago y ledger anulados, saldo exacto, gasto vuelve a pendiente y el historial lo registra", async () => {
    const banco = await newCaja({
      name: "banco parcial",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto({ amount: 100000 });
    const { payment } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 40000,
    });
    // 500000 - 40000 = 460000
    expect(await firme(banco)).toBe(460000);

    const antes = await records.getDetail(TEMPLO_CTX, gasto.id);
    expect(antes.status).toBe("parcial");
    expect(antes.paid).toBe(40000);
    expect(antes.pending).toBe(60000);

    const detalle = await anular(gasto.id, payment.id, "  Cuenta equivocada  ");

    const fila = await leerPago(payment.id);
    expect(fila.voidedAt).not.toBeNull();
    expect(fila.voidedBy).toBe(adminId);
    expect(fila.voidReason).toBe("Cuenta equivocada");

    const ledger = await leerLedger(payment.transactionId);
    expect(ledger.voidedAt).not.toBeNull();
    expect(ledger.voidedBy).toBe(adminId);
    expect(ledger.voidReason).toBe("Cuenta equivocada");

    // El saldo vuelve a la apertura: 500000
    expect(await firme(banco)).toBe(500000);

    expect(detalle.status).toBe("pendiente");
    expect(detalle.paid).toBe(0);
    expect(detalle.pending).toBe(100000);
    expect(detalle.overpaid).toBe(false);

    // El pago anulado sigue en el detalle, marcado.
    const listado = detalle.payments.find((p) => p.id === payment.id);
    expect(listado).toBeDefined();
    expect(listado?.voidedAt).not.toBeNull();
    expect(listado?.voidReason).toBe("Cuenta equivocada");

    const acciones = detalle.history.map((h) => h.action);
    expect(acciones).toContain("expense_payment_registered");
    expect(acciones).toContain("expense_payment_voided");
    const evento = detalle.history.find(
      (h) => h.action === "expense_payment_voided",
    );
    expect(evento?.reason).toBe("Cuenta equivocada");
    expect(evento?.payload).toMatchObject({
      paymentId: payment.id,
      transactionId: payment.transactionId,
      amount: 40000,
      appliedAmount: 40000,
      currency: "ARS",
    });
  });

  it("con dos pagos, anular el primero deja al gasto parcial con lo del segundo", async () => {
    const banco = await newCaja({
      name: "banco dos pagos",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto({ amount: 100000 });
    const p1 = (await pagar(gasto.id, { cashRegisterId: banco, amount: 40000 }))
      .payment;
    await pagar(gasto.id, { cashRegisterId: banco, amount: 30000 });
    // 500000 - 40000 - 30000 = 430000
    expect(await firme(banco)).toBe(430000);

    const detalle = await anular(gasto.id, p1.id);

    expect(detalle.status).toBe("parcial");
    expect(detalle.paid).toBe(30000);
    expect(detalle.pending).toBe(70000);
    // 500000 - 30000 = 470000
    expect(await firme(banco)).toBe(470000);
  });

  it("anular un pago de un gasto pagado entero lo devuelve a pendiente y permite volver a pagar", async () => {
    const banco = await newCaja({
      name: "banco repago",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto({ amount: 100000 });
    const { payment, record } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 100000,
    });
    expect(record.status).toBe("pagado");
    // 500000 - 100000 = 400000
    expect(await firme(banco)).toBe(400000);

    const detalle = await anular(gasto.id, payment.id);
    expect(detalle.status).toBe("pendiente");
    expect(await firme(banco)).toBe(500000);

    // Lo anulado no cuenta como pagado: se puede pagar el total otra vez.
    const repago = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 100000,
    });
    expect(repago.record.status).toBe("pagado");
    expect(repago.record.paid).toBe(100000);
    expect(await firme(banco)).toBe(400000);
  });

  it("anular un pago en efectivo devuelve la plata a la caja de la sede", async () => {
    const efectivo = await newCaja({
      name: "efectivo sede A",
      type: "efectivo",
      opening: 80000,
      branchId: branchIds.A,
    });
    const gasto = await crearGasto({ amount: 50000 });
    const { payment } = await pagar(gasto.id, {
      cashRegisterId: efectivo,
      amount: 20000,
      paymentMethod: "cash",
    });
    // 80000 - 20000 = 60000
    expect(await firme(efectivo)).toBe(60000);
    await anular(gasto.id, payment.id);
    // vuelve a 80000
    expect(await firme(efectivo)).toBe(80000);
  });

  it("anular dos veces: 400 y el saldo no se mueve de nuevo", async () => {
    const banco = await newCaja({
      name: "banco doble",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto();
    const { payment } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 25000,
    });
    await anular(gasto.id, payment.id);
    // vuelve a 500000
    expect(await firme(banco)).toBe(500000);

    const mensaje = await falla(BadRequestError, () =>
      anular(gasto.id, payment.id),
    );
    expect(mensaje).toBe("El pago ya está anulado");
    expect(await firme(banco)).toBe(500000);
  });

  it("un pago de otro gasto, un gasto inexistente o de otro país: 404", async () => {
    const banco = await newCaja({
      name: "banco 404",
      type: "banco",
      opening: 500000,
    });
    const gastoA = await crearGasto();
    const gastoB = await crearGasto();
    const { payment } = await pagar(gastoA.id, {
      cashRegisterId: banco,
      amount: 10000,
    });
    // 500000 - 10000 = 490000
    expect(await firme(banco)).toBe(490000);

    expect(
      await falla(NotFoundError, () => anular(gastoB.id, payment.id)),
    ).toBe("Pago no encontrado");
    expect(await falla(NotFoundError, () => anular(0, payment.id))).toBe(
      "Gasto no encontrado",
    );
    expect(
      await falla(NotFoundError, () =>
        anular(gastoA.id, payment.id, "x", "ES"),
      ),
    ).toBe("Gasto no encontrado");
    expect(await falla(NotFoundError, () => anular(gastoA.id, 0))).toBe(
      "Pago no encontrado",
    );

    // Nada cambió.
    expect((await leerPago(payment.id)).voidedAt).toBeNull();
    expect(await firme(banco)).toBe(490000);
  });

  it("dos anulaciones simultáneas del mismo pago: una pasa, la otra da 400 y el saldo vuelve una sola vez", async () => {
    const banco = await newCaja({
      name: "banco carrera",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto();
    const { payment } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 60000,
    });
    // 500000 - 60000 = 440000
    expect(await firme(banco)).toBe(440000);

    const resultados = await Promise.allSettled([
      anular(gasto.id, payment.id, "primera"),
      anular(gasto.id, payment.id, "segunda"),
    ]);
    const ok = resultados.filter((r) => r.status === "fulfilled");
    const mal = resultados.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(ok).toHaveLength(1);
    expect(mal).toHaveLength(1);
    expect(mal[0].reason).toBeInstanceOf(BadRequestError);

    // vuelve a 500000, una sola vez
    expect(await firme(banco)).toBe(500000);
    const eventos = (
      await records.getDetail(TEMPLO_CTX, gasto.id)
    ).history.filter((h) => h.action === "expense_payment_voided");
    expect(eventos).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Guarda de Caja
// ---------------------------------------------------------------------------

describe("Guarda de Caja: la fila del ledger de un pago no se toca desde Caja", () => {
  it("MovementService.voidExpense (POST /expenses/:id/void) con la fila de un pago: 400 que manda a Egresos", async () => {
    const banco = await newCaja({
      name: "banco guarda expenses",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto();
    const { payment } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 30000,
    });
    // 500000 - 30000 = 470000
    expect(await firme(banco)).toBe(470000);

    const mensaje = await falla(BadRequestError, () =>
      movementService.voidExpense(
        TEMPLO_CTX,
        payment.transactionId,
        adminId,
        "Lo anulo desde Caja",
      ),
    );
    expect(mensaje).toBe(TEXTO_CAJA);

    // Nada cambió: pago vigente, ledger vigente, saldo igual.
    expect((await leerPago(payment.id)).voidedAt).toBeNull();
    expect((await leerLedger(payment.transactionId)).voidedAt).toBeNull();
    expect(await firme(banco)).toBe(470000);
    expect((await records.getDetail(TEMPLO_CTX, gasto.id)).paid).toBe(30000);
  });

  it("TransactionService.void (POST /transactions/:id/void) con la fila de un pago: 400", async () => {
    const banco = await newCaja({
      name: "banco guarda void",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto();
    const { payment } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 30000,
    });

    const mensaje = await falla(BadRequestError, () =>
      txnService.void(TEMPLO_CTX, payment.transactionId, adminId, {
        reason: "Lo anulo desde Caja",
      }),
    );
    expect(mensaje).toBe(TEXTO_CAJA);
    expect((await leerLedger(payment.transactionId)).voidedAt).toBeNull();
    expect((await leerPago(payment.id)).voidedAt).toBeNull();
    // 500000 - 30000 = 470000
    expect(await firme(banco)).toBe(470000);
  });

  it("TransactionService.correct (POST /transactions/:id/correct) con la fila de un pago: 400 y no se recrea nada", async () => {
    const banco = await newCaja({
      name: "banco guarda correct",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto();
    const { payment } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 30000,
    });

    const mensaje = await falla(BadRequestError, () =>
      txnService.correct(
        TEMPLO_CTX,
        payment.transactionId,
        { amount: 1 },
        adminId,
      ),
    );
    expect(mensaje).toBe(TEXTO_CAJA);
    expect((await leerLedger(payment.transactionId)).voidedAt).toBeNull();
    // Una sola fila en la cuenta (el pago): no se creó una corrección.
    const [fila] = await app.db
      .select({ n: count() })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.cashRegisterId, banco),
        ),
      );
    expect(fila.n).toBe(1);
    // 500000 - 30000 = 470000
    expect(await firme(banco)).toBe(470000);
  });

  it("la guarda no cambia el resultado para un egreso común: se anula igual por voidExpense y por void", async () => {
    const banco = await newCaja({
      name: "banco egreso común",
      type: "banco",
      opening: 500000,
    });
    const e1 = await movementService.registerExpense(
      TEMPLO_CTX,
      {
        cajaId: banco,
        amount: 12000,
        costCenterId: costCenterIds.ar,
        paymentMethod: "transfer",
        notes: PREFIJO,
      },
      adminId,
    );
    const e2 = await movementService.registerExpense(
      TEMPLO_CTX,
      {
        cajaId: banco,
        amount: 8000,
        costCenterId: costCenterIds.ar,
        paymentMethod: "transfer",
        notes: PREFIJO,
      },
      adminId,
    );
    // 500000 - 12000 - 8000 = 480000
    expect(await firme(banco)).toBe(480000);

    await movementService.voidExpense(
      TEMPLO_CTX,
      e1.expenseTxId,
      adminId,
      "Error de carga",
    );
    // 500000 - 8000 = 492000
    expect(await firme(banco)).toBe(492000);

    await txnService.void(TEMPLO_CTX, e2.expenseTxId, adminId, {
      reason: "Error de carga",
    });
    // vuelve a 500000
    expect(await firme(banco)).toBe(500000);
  });

  it("Egresos sí puede anular el pago (la guarda no está en voidInTx) y después la fila ya no se puede tocar desde Caja", async () => {
    const banco = await newCaja({
      name: "banco camino egresos",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto();
    const { payment } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 30000,
    });
    await anular(gasto.id, payment.id);
    // vuelve a 500000
    expect(await firme(banco)).toBe(500000);
    // Sigue siendo la fila de un pago: desde Caja, 400 (no "ya anulada").
    await falla(BadRequestError, () =>
      txnService.void(TEMPLO_CTX, payment.transactionId, adminId, {
        reason: "otra vez",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Reglas de 209-04 con pagos reales
// ---------------------------------------------------------------------------

describe("Reglas de 209-04 con el service real de pagos", () => {
  it("confirmado de 100000 con 60000 pagado: bajar a 50000 da 400 'Primero anulá un pago'; pasarlo a estimado y bajar, OK (queda overpaid)", async () => {
    const banco = await newCaja({
      name: "banco regla 04",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto({ amount: 100000 });
    await pagar(gasto.id, { cashRegisterId: banco, amount: 60000 });

    const mensaje = await falla(BadRequestError, () =>
      records.update(
        TEMPLO_CTX,
        gasto.id,
        {
          amount: 50000,
          allocations: [{ branchId: branchIds.A, amount: 50000 }],
          reason: "Bajó",
        },
        adminId,
      ),
    );
    expect(mensaje).toContain("Ya se pagaron 60000");
    expect(mensaje).toContain("Primero anulá un pago");
    expect((await records.getDetail(TEMPLO_CTX, gasto.id)).amount).toBe(100000);

    const editado = await records.update(
      TEMPLO_CTX,
      gasto.id,
      {
        amount: 50000,
        amountStatus: "estimado",
        allocations: [{ branchId: branchIds.A, amount: 50000 }],
        reason: "Se renegocia",
      },
      adminId,
    );
    expect(editado.amount).toBe(50000);
    expect(editado.paid).toBe(60000);
    expect(editado.overpaid).toBe(true);
  });

  it("anulando el pago sí se puede bajar el importe de un gasto confirmado", async () => {
    const banco = await newCaja({
      name: "banco regla 04 b",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto({ amount: 100000 });
    const { payment } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 60000,
    });
    await anular(gasto.id, payment.id);

    const editado = await records.update(
      TEMPLO_CTX,
      gasto.id,
      {
        amount: 50000,
        allocations: [{ branchId: branchIds.A, amount: 50000 }],
        reason: "Bajó",
      },
      adminId,
    );
    expect(editado.amount).toBe(50000);
    expect(editado.status).toBe("pendiente");
  });

  it("anular un gasto con pagos vigentes da 409; anulando sus pagos, la anulación del gasto pasa", async () => {
    const banco = await newCaja({
      name: "banco regla 04 c",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto();
    const p1 = (await pagar(gasto.id, { cashRegisterId: banco, amount: 10000 }))
      .payment;
    const p2 = (await pagar(gasto.id, { cashRegisterId: banco, amount: 20000 }))
      .payment;

    await falla(ConflictError, () =>
      records.void(TEMPLO_CTX, gasto.id, "Todavía tiene pagos", adminId),
    );
    expect((await records.getDetail(TEMPLO_CTX, gasto.id)).voidedAt).toBeNull();

    await anular(gasto.id, p1.id);
    // Con un pago vigente todavía: 409.
    await falla(ConflictError, () =>
      records.void(TEMPLO_CTX, gasto.id, "Falta uno", adminId),
    );
    await anular(gasto.id, p2.id);

    const detalle = await records.void(
      TEMPLO_CTX,
      gasto.id,
      "Era un duplicado",
      adminId,
    );
    expect(detalle.voidedAt).not.toBeNull();
    // Los dos pagos anulados no cuentan: el saldo vuelve a 500000.
    expect(await firme(banco)).toBe(500000);
    expect(await contarPagos(gasto.id)).toBe(2);
  });

  it("filtros del listado: parcial, pagado y por_pagar; un pago anulado no cuenta", async () => {
    const banco = await newCaja({
      name: "banco listado",
      type: "banco",
      opening: 5000000,
    });
    const mes = "2032-01";
    const base = { costCenterId: costCenterIds.lista, imputationMonth: mes };
    const parcial = await crearGasto({ ...base, amount: 90000 });
    const pagado = await crearGasto({ ...base, amount: 40000 });
    const pendiente = await crearGasto({ ...base, amount: 50000 });
    const pParcial = (
      await pagar(parcial.id, { cashRegisterId: banco, amount: 30000 })
    ).payment;
    await pagar(pagado.id, { cashRegisterId: banco, amount: 40000 });

    const ids = async (
      status: "parcial" | "pagado" | "pendiente" | "por_pagar",
    ) =>
      (
        await records.list(TEMPLO_CTX, {
          country: "AR",
          costCenterId: costCenterIds.lista,
          month: mes,
          status,
          limit: 200,
        })
      ).rows
        .map((r) => r.id)
        .sort((a, b) => a - b);

    expect(await ids("parcial")).toEqual([parcial.id]);
    expect(await ids("pagado")).toEqual([pagado.id]);
    expect(await ids("pendiente")).toEqual([pendiente.id]);
    expect(await ids("por_pagar")).toEqual(
      [parcial.id, pendiente.id].sort((a, b) => a - b),
    );

    // Anular el pago parcial: deja de ser parcial y pasa a pendiente.
    await anular(parcial.id, pParcial.id);
    expect(await ids("parcial")).toEqual([]);
    expect(await ids("pendiente")).toEqual(
      [parcial.id, pendiente.id].sort((a, b) => a - b),
    );
    expect(await ids("pagado")).toEqual([pagado.id]);
  });
});

// ---------------------------------------------------------------------------
// Débito automático (DI-06)
// ---------------------------------------------------------------------------

describe("direct_debit como medio de un pago de gasto (DI-06)", () => {
  it("desde un banco AR sin sede: OK, la fila del ledger lleva direct_debit y el saldo baja", async () => {
    const banco = await newCaja({
      name: "banco débito",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto({ amount: 100000 });
    const { payment, record } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 35000,
      paymentMethod: "direct_debit",
    });

    expect(payment.paymentMethod).toBe("direct_debit");
    expect(record.paid).toBe(35000);
    expect(record.status).toBe("parcial");
    const ledger = await leerLedger(payment.transactionId);
    expect(ledger.paymentMethod).toBe("direct_debit");
    expect(ledger.direction).toBe("outflow");
    expect(ledger.kind).toBe("expense");
    expect(ledger.branchId).toBeNull();
    // 500000 - 35000 = 465000
    expect(await firme(banco)).toBe(465000);
  });

  it("un pago con direct_debit también se anula por Egresos y el saldo vuelve", async () => {
    const banco = await newCaja({
      name: "banco débito anula",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto({ amount: 100000 });
    const { payment } = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 35000,
      paymentMethod: "direct_debit",
    });
    // 465000
    expect(await firme(banco)).toBe(465000);
    const detalle = await anular(gasto.id, payment.id);
    expect(detalle.status).toBe("pendiente");
    expect(await firme(banco)).toBe(500000);
  });

  it("desde una caja de efectivo: 400 por la regla medio↔cuenta y no queda nada escrito", async () => {
    const efectivo = await newCaja({
      name: "efectivo débito",
      type: "efectivo",
      opening: 80000,
      branchId: branchIds.A,
    });
    const gasto = await crearGasto();
    const mensaje = await falla(BadRequestError, () =>
      pagar(gasto.id, {
        cashRegisterId: efectivo,
        amount: 10000,
        paymentMethod: "direct_debit",
      }),
    );
    expect(mensaje).toContain("Domiciliación");
    expect(mensaje).toContain("no corresponde a la caja de efectivo");
    expect(await contarPagos(gasto.id)).toBe(0);
    // 80000, sin tocar
    expect(await firme(efectivo)).toBe(80000);
  });

  it("en un gasto de España también se paga con direct_debit desde un banco en EUR", async () => {
    const bancoEur = await newCaja({
      name: "banco EUR débito",
      type: "banco",
      currency: "EUR",
      opening: 9000,
    });
    contadorGastos += 1;
    const { record } = await records.create(
      TEMPLO_CTX,
      "ES",
      {
        concept: `${PREFIJO} gasto ES ${contadorGastos}`,
        costCenterId: costCenterIds.es,
        imputationMonth: "2026-10",
        amount: 2000,
        currency: "EUR",
        amountStatus: "confirmado",
        allocations: [{ branchId: branchIds.es, amount: 2000 }],
      },
      adminId,
    );
    const res = await pagar(
      record.id,
      {
        cashRegisterId: bancoEur,
        amount: 2000,
        paymentMethod: "direct_debit",
        paidOn: AYER,
      },
      "ES",
    );
    expect(res.record.status).toBe("pagado");
    // 9000 - 2000 = 7000
    expect(await firme(bancoEur)).toBe(7000);
  });
});
