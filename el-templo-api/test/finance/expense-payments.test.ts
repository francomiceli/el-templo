/**
 * Fase 209 Plan 05: pagos de un gasto (ExpensePaymentService), sin rutas.
 *
 * Cubre: alta del pago con su fila del ledger en la misma transacción (DI-04),
 * baja exacta del saldo de cada cuenta, pagos parciales y desde dos cuentas,
 * que el pago aparece en Caja → Movimientos y NO es un retiro, las guardas de
 * DI-05 (cuenta, país, moneda, fechas, medio, efectivo, pago de más), el tipo de
 * cambio de DI-03, la idempotencia de DI-16 (incluida la carrera), la
 * concurrencia sobre el candado del gasto y de la cuenta, y las opciones del
 * formulario sin saldos (DI-07).
 *
 * No usa `direct_debit`: el débito automático saliente es del plan 209-06.
 * La anulación del pago también (209-06).
 *
 * Cuentas propias por test (apertura conocida) y saldos afirmados con LITERALES
 * comentados. Corre contra la MySQL de test, en foreground y de a un archivo.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, count, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  TENANT_DOS,
  TENANT_TEMPLO,
  limpiarSegundoGimnasio,
  seedSecondTenant,
} from "../fixtures/second-tenant";
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
import {
  RETIROS_COST_CENTER_NAME,
  WithdrawalService,
} from "../../src/modules/finance/withdrawal-service";
import { ExpenseRecordService } from "../../src/modules/finance/expense-record-service";
import { ExpensePaymentService } from "../../src/modules/finance/expense-payment-service";
import { countryToday } from "../../src/modules/finance/expense-branches";
import { MAX_MONEY } from "../../src/modules/finance/expense-math";
import type {
  ExpenseCountry,
  ExpenseRecordDetail,
  RegisterExpensePaymentInput,
} from "../../src/modules/finance/expense-types";

const TEMPLO_CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const sufijo = `${Date.now() % 1_000_000}`;
const PREFIJO = `EGR-05 ${sufijo}`;
const TZ_AR = "America/Argentina/Buenos_Aires";
const HOY = todayInTz(TZ_AR);
const MANANA = addDays(HOY, 1);
const AYER = addDays(HOY, -1);
const HACE_10_DIAS = addDays(HOY, -10);

let app: FastifyInstance;
let records: ExpenseRecordService;
let payments: ExpensePaymentService;
let txnService: TransactionService;
let cashRegisterService: CashRegisterService;
let withdrawalService: WithdrawalService;
let adminId: number;

const branchIds = { A: 0, inactiva: 0, es: 0 };
const costCenterIds = { ar: 0, arInactivo: 0, es: 0 };
let retirosId = 0;
let retirosCreado = false;
const cajaIds: number[] = [];
let cajaOtroGimnasioId = 0;
let cajaSedeEsId = 0;
let contadorGastos = 0;

// ---------------------------------------------------------------------------
// Armado
// ---------------------------------------------------------------------------

async function crearSede(
  clave: keyof typeof branchIds,
  valores: { country: string; isActive?: boolean; timezone?: string },
): Promise<void> {
  const [res] = await app.db.insert(schema.branches).values(
    tenantValues(TEMPLO_CTX, {
      ...valores,
      name: `ZZZ-EGR-05 ${sufijo}-${clave}`,
      code: `E5${clave.slice(0, 3)}${sufijo}`.slice(0, 20),
    }),
  );
  branchIds[clave] = Number(res.insertId);
}

async function crearRubro(
  clave: keyof typeof costCenterIds,
  valores: { name: string; country: string; isActive?: boolean },
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
  cutoffDate?: string;
  isActive?: boolean;
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
        cutoffDate: opts.cutoffDate ?? "2020-01-01",
        isActive: opts.isActive ?? true,
      }),
    )
    .$returningId();
  cajaIds.push(row.id);
  return row.id;
}

/** Gasto AR propio (reparto directo a la sede A). USD lleva tipo de cambio. */
async function crearGasto(
  opts: {
    amount?: number;
    currency?: "ARS" | "USD";
    status?: "estimado" | "confirmado";
    fxRate?: number | null;
    concept?: string;
  } = {},
): Promise<ExpenseRecordDetail> {
  const amount = opts.amount ?? 100000;
  const currency = opts.currency ?? "ARS";
  contadorGastos += 1;
  const { record } = await records.create(
    TEMPLO_CTX,
    "AR",
    {
      concept: opts.concept ?? `${PREFIJO} gasto ${contadorGastos}`,
      costCenterId: costCenterIds.ar,
      imputationMonth: "2026-10",
      amount,
      currency,
      amountStatus: opts.status ?? "confirmado",
      fxRate: currency === "USD" ? (opts.fxRate ?? 1560) : null,
      allocations: [{ branchId: branchIds.A, amount }],
    },
    adminId,
  );
  return record;
}

async function crearGastoEs(amount: number): Promise<ExpenseRecordDetail> {
  contadorGastos += 1;
  const { record } = await records.create(
    TEMPLO_CTX,
    "ES",
    {
      concept: `${PREFIJO} gasto ES ${contadorGastos}`,
      costCenterId: costCenterIds.es,
      imputationMonth: "2026-10",
      amount,
      currency: "EUR",
      amountStatus: "confirmado",
      allocations: [{ branchId: branchIds.es, amount }],
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

async function firme(cajaId: number): Promise<number> {
  return Number(
    (await cashRegisterService.getBalance(TEMPLO_CTX, cajaId)).firmeBalance,
  );
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

async function contarLedger(cajaId: number): Promise<number> {
  const [row] = await app.db
    .select({ n: count() })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.cashRegisterId, cajaId),
      ),
    );
  return row.n;
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
  withdrawalService = new WithdrawalService(
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
  await crearSede("inactiva", { country: "AR", isActive: false });
  await crearSede("es", { country: "ES", timezone: "Europe/Madrid" });

  await crearRubro("ar", { name: `${PREFIJO} AR`, country: "AR" });
  await crearRubro("arInactivo", {
    name: `${PREFIJO} AR inactivo`,
    country: "AR",
    isActive: false,
  });
  await crearRubro("es", { name: `${PREFIJO} ES`, country: "ES" });

  // El rubro "Retiros" tiene que existir para que la aserción de que las
  // opciones no lo ofrecen sea real.
  const [retiros] = await app.db
    .select({ id: schema.costCenters.id })
    .from(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, TEMPLO_CTX),
        eq(schema.costCenters.name, RETIROS_COST_CENTER_NAME),
        eq(schema.costCenters.country, "AR"),
      ),
    )
    .limit(1);
  if (retiros) {
    retirosId = retiros.id;
  } else {
    const [creado] = await app.db
      .insert(schema.costCenters)
      .values(
        tenantValues(TEMPLO_CTX, {
          name: RETIROS_COST_CENTER_NAME,
          country: "AR",
        }),
      )
      .$returningId();
    retirosId = creado.id;
    retirosCreado = true;
  }

  // Cuenta de otro país (efectivo de la sede de España) y de otro gimnasio.
  cajaSedeEsId = await newCaja({
    name: "efectivo sede ES",
    type: "efectivo",
    currency: "EUR",
    opening: 5000,
    branchId: branchIds.es,
  });
  const gimnasio2 = await seedSecondTenant(app);
  const [ajena] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(
        { tenantId: TENANT_DOS },
        {
          name: `${PREFIJO} banco otro gimnasio`,
          type: "banco" as const,
          branchId: null,
          currency: "ARS",
          openingBalance: 1000,
          cutoffDate: "2020-01-01",
        },
      ),
    )
    .$returningId();
  cajaOtroGimnasioId = ajena.id;
  expect(gimnasio2.tenantId).toBe(TENANT_DOS);
});

afterAll(async () => {
  // Orden: pagos → ledger propio → reparto → gastos → audit propio → cajas →
  // rubros → sedes → gimnasio 2.
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
  if (retirosCreado) {
    await app.db
      .delete(schema.costCenters)
      .where(
        and(
          tenantWhere(schema.costCenters, TEMPLO_CTX),
          eq(schema.costCenters.id, retirosId),
        ),
      );
  }
  await limpiarSegundoGimnasio(app);
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
// Alta del pago y su fila del ledger
// ---------------------------------------------------------------------------

describe("registerPayment: pago total", () => {
  it("transferencia ARS desde un banco propio: estado pagado, saldo exacto y fila del ledger completa", async () => {
    const banco = await newCaja({
      name: "banco total",
      type: "banco",
      opening: 500000,
    });
    const gasto = await crearGasto({
      amount: 123457,
      concept: `${PREFIJO} luz`,
    });

    const res = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 123457,
      reference: "  Transf 778  ",
      notes: "  Octubre  ",
    });

    expect(res.created).toBe(true);
    expect(res.record.status).toBe("pagado");
    expect(res.record.pending).toBe(0);
    expect(res.record.paid).toBe(123457);
    expect(res.record.overpaid).toBe(false);
    // 500000 − 123457
    expect(await firme(banco)).toBe(376543);

    const pago = res.payment;
    expect(pago.paidOn).toBe(HOY);
    expect(pago.cashRegisterId).toBe(banco);
    expect(pago.paymentMethod).toBe("transfer");
    expect(pago.amount).toBe(123457);
    expect(pago.currency).toBe("ARS");
    expect(pago.appliedAmount).toBe(123457);
    expect(pago.amountArs).toBe(123457);
    expect(pago.fxRate).toBeNull();
    expect(pago.reference).toBe("Transf 778");
    expect(pago.notes).toBe("Octubre");
    expect(pago.voidedAt).toBeNull();

    const ledger = await leerLedger(pago.transactionId);
    expect(ledger.kind).toBe("expense");
    expect(ledger.direction).toBe("outflow");
    expect(ledger.amount).toBe(123457);
    expect(ledger.currency).toBe("ARS");
    expect(ledger.costCenterId).toBe(costCenterIds.ar);
    expect(ledger.paymentMethod).toBe("transfer");
    expect(ledger.transactionDate).toBe(HOY);
    expect(ledger.effectiveDate).toBe(HOY);
    expect(ledger.branchId).toBeNull();
    expect(ledger.memberId).toBeNull();
    expect(ledger.responsibleName).toBeNull();
    expect(ledger.cashRegisterId).toBe(banco);
    expect(ledger.recordedBy).toBe(adminId);
    expect(ledger.validationStatus).toBe("validado");
    expect(ledger.voidedAt).toBeNull();
    expect(ledger.notes).toBe(`Pago de gasto #${gasto.id}: ${PREFIJO} luz`);
    expect(await contarLedger(banco)).toBe(1);
  });

  it("un pago de una cuenta con sede lleva la sede de la cuenta en el ledger", async () => {
    const efectivoSede = await newCaja({
      name: "efectivo sede A",
      type: "efectivo",
      opening: 20000,
      branchId: branchIds.A,
    });
    const gasto = await crearGasto({ amount: 5000 });
    const res = await pagar(gasto.id, {
      cashRegisterId: efectivoSede,
      paymentMethod: "cash",
      amount: 5000,
    });
    const ledger = await leerLedger(res.payment.transactionId);
    expect(ledger.branchId).toBe(branchIds.A);
    // 20000 − 5000
    expect(await firme(efectivoSede)).toBe(15000);
  });
});

describe("registerPayment: pagos parciales y desde dos cuentas", () => {
  it("caso de la planilla: 90000 del banco (parcial) y 60000 en efectivo de la Central (pagado)", async () => {
    const banco = await newCaja({
      name: "banco planilla",
      type: "banco",
      opening: 500000,
    });
    const central = await newCaja({
      name: "central planilla",
      type: "efectivo",
      opening: 100000,
    });
    const gasto = await crearGasto({ amount: 150000 });

    const p1 = await pagar(gasto.id, { cashRegisterId: banco, amount: 90000 });
    expect(p1.record.status).toBe("parcial");
    expect(p1.record.paid).toBe(90000);
    expect(p1.record.pending).toBe(60000);
    // 500000 − 90000
    expect(await firme(banco)).toBe(410000);

    const p2 = await pagar(gasto.id, {
      cashRegisterId: central,
      paymentMethod: "cash",
      amount: 60000,
    });
    expect(p2.record.status).toBe("pagado");
    expect(p2.record.paid).toBe(150000);
    expect(p2.record.pending).toBe(0);
    expect(p2.record.payments).toHaveLength(2);
    // 500000 − 90000, intacto por el segundo pago
    expect(await firme(banco)).toBe(410000);
    // 100000 − 60000
    expect(await firme(central)).toBe(40000);

    // Cada pago tiene su propia fila del ledger, en su cuenta.
    expect(p1.payment.transactionId).not.toBe(p2.payment.transactionId);
    expect((await leerLedger(p1.payment.transactionId)).cashRegisterId).toBe(
      banco,
    );
    expect((await leerLedger(p2.payment.transactionId)).cashRegisterId).toBe(
      central,
    );
  });
});

describe("registerPayment: Caja → Movimientos y retiros", () => {
  it("el pago aparece en Movimientos de su cuenta como egreso con su rubro y NO en el listado de retiros", async () => {
    const banco = await newCaja({
      name: "banco movimientos",
      type: "banco",
      opening: 100000,
    });
    const gasto = await crearGasto({ amount: 30000 });
    const res = await pagar(gasto.id, { cashRegisterId: banco, amount: 30000 });

    const movimientos = await txnService.listMovEgresos(TEMPLO_CTX, {
      cashRegisterId: banco,
      isOwner: true,
    });
    const fila = movimientos.rows.find(
      (r) => r.id === res.payment.transactionId,
    );
    expect(fila).toBeDefined();
    expect(fila?.kind).toBe("expense");
    expect(fila?.direction).toBe("outflow");
    expect(fila?.amount).toBe(30000);
    expect(fila?.responsibleName).toBeNull();
    expect(fila?.costCenterName).toBe(`${PREFIJO} AR`);

    const retiros = await withdrawalService.list(TEMPLO_CTX, {
      cashRegisterId: banco,
      isOwner: true,
    });
    expect(retiros.rows.map((r) => r.id)).not.toContain(
      res.payment.transactionId,
    );
    expect(retiros.total).toBe(0);
  });

  it("control: un egreso con responsable en la misma cuenta SÍ aparece como retiro", async () => {
    const banco = await newCaja({
      name: "banco control retiro",
      type: "banco",
      opening: 100000,
    });
    const gasto = await crearGasto({ amount: 10000 });
    const pago = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 10000,
    });
    // Egreso viejo con responsable: el marcador del retiro lo reconoce.
    const retiro = await txnService.create(
      TEMPLO_CTX,
      {
        memberId: null,
        kind: "expense",
        direction: "outflow",
        amount: 1000,
        currency: "ARS",
        paymentMethod: "internal",
        transactionDate: HOY,
        effectiveDate: HOY,
        branchId: null,
        cashRegisterId: banco,
        costCenterId: retirosId,
        responsibleName: "Control EGR-05",
        notes: PREFIJO,
        links: [],
      },
      adminId,
    );

    const retiros = await withdrawalService.list(TEMPLO_CTX, {
      cashRegisterId: banco,
      isOwner: true,
    });
    expect(retiros.rows.map((r) => r.id)).toEqual([retiro.id]);
    expect(retiros.rows.map((r) => r.id)).not.toContain(
      pago.payment.transactionId,
    );
  });
});

// ---------------------------------------------------------------------------
// Guardas
// ---------------------------------------------------------------------------

describe("registerPayment: regla medio ↔ cuenta", () => {
  it("efectivo desde un banco y transferencia desde efectivo dan 400 sin escribir nada; cheque desde banco funciona", async () => {
    const banco = await newCaja({
      name: "banco medios",
      type: "banco",
      opening: 100000,
    });
    const central = await newCaja({
      name: "central medios",
      type: "efectivo",
      opening: 100000,
    });
    const gasto = await crearGasto({ amount: 50000 });

    const m1 = await falla(BadRequestError, () =>
      pagar(gasto.id, {
        cashRegisterId: banco,
        paymentMethod: "cash",
        amount: 1000,
      }),
    );
    expect(m1).toContain("no corresponde");
    const m2 = await falla(BadRequestError, () =>
      pagar(gasto.id, {
        cashRegisterId: central,
        paymentMethod: "transfer",
        amount: 1000,
      }),
    );
    expect(m2).toContain("no corresponde");
    expect(await contarPagos(gasto.id)).toBe(0);
    expect(await contarLedger(banco)).toBe(0);
    expect(await contarLedger(central)).toBe(0);

    const ok = await pagar(gasto.id, {
      cashRegisterId: banco,
      paymentMethod: "cheque",
      amount: 20000,
    });
    expect(ok.payment.paymentMethod).toBe("cheque");
    // 100000 − 20000
    expect(await firme(banco)).toBe(80000);
  });

  it("un medio que no sirve para pagar gastos (internal) da 400", async () => {
    const banco = await newCaja({ name: "banco internal", type: "banco" });
    const gasto = await crearGasto();
    const mensaje = await falla(BadRequestError, () =>
      payments.registerPayment(
        TEMPLO_CTX,
        gasto.id,
        {
          paidOn: HOY,
          cashRegisterId: banco,
          // Fuera del tipo a propósito: simula un body que esquivó el schema.
          paymentMethod:
            "internal" as RegisterExpensePaymentInput["paymentMethod"],
          amount: 1000,
        },
        adminId,
        { country: "AR" },
      ),
    );
    expect(mensaje).toBe("Ese medio no sirve para pagar gastos");
  });
});

describe("registerPayment: tope de efectivo", () => {
  it("un pago en efectivo mayor al saldo firme da 400 sin filas nuevas; el exacto pasa y deja 0", async () => {
    const central = await newCaja({
      name: "central tope",
      type: "efectivo",
      opening: 10000,
    });
    const gasto = await crearGasto({ amount: 50000 });

    const mensaje = await falla(BadRequestError, () =>
      pagar(gasto.id, {
        cashRegisterId: central,
        paymentMethod: "cash",
        amount: 10001,
      }),
    );
    expect(mensaje).toContain("supera el saldo de la caja de efectivo (10000)");
    expect(await contarPagos(gasto.id)).toBe(0);
    expect(await contarLedger(central)).toBe(0);
    // Sin cambios.
    expect(await firme(central)).toBe(10000);

    await pagar(gasto.id, {
      cashRegisterId: central,
      paymentMethod: "cash",
      amount: 10000,
    });
    // 10000 − 10000
    expect(await firme(central)).toBe(0);
  });

  it("dos pagos en efectivo simultáneos de gastos distintos que juntos exceden el saldo: gana uno solo", async () => {
    const central = await newCaja({
      name: "central concurrente",
      type: "efectivo",
      opening: 10000,
    });
    const g1 = await crearGasto({ amount: 20000 });
    const g2 = await crearGasto({ amount: 20000 });

    const resultados = await Promise.allSettled([
      pagar(g1.id, {
        cashRegisterId: central,
        paymentMethod: "cash",
        amount: 6000,
      }),
      pagar(g2.id, {
        cashRegisterId: central,
        paymentMethod: "cash",
        amount: 6000,
      }),
    ]);
    const ok = resultados.filter((r) => r.status === "fulfilled");
    const rechazados = resultados.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rechazados).toHaveLength(1);
    expect(rechazados[0].reason).toBeInstanceOf(BadRequestError);
    // 10000 − 6000
    expect(await firme(central)).toBe(4000);
    expect(await contarLedger(central)).toBe(1);
    expect((await contarPagos(g1.id)) + (await contarPagos(g2.id))).toBe(1);
  });
});

describe("registerPayment: cuenta", () => {
  it("cuenta inactiva: 400", async () => {
    const inactiva = await newCaja({
      name: "banco inactivo",
      type: "banco",
      opening: 1000,
      isActive: false,
    });
    const gasto = await crearGasto();
    const mensaje = await falla(BadRequestError, () =>
      pagar(gasto.id, { cashRegisterId: inactiva, amount: 100 }),
    );
    expect(mensaje).toBe(`La cuenta ${PREFIJO} banco inactivo está inactiva`);
    expect(await contarPagos(gasto.id)).toBe(0);
  });

  it("caja de una sede de España para un gasto de Argentina: 400", async () => {
    const gasto = await crearGasto();
    const mensaje = await falla(BadRequestError, () =>
      pagar(gasto.id, {
        cashRegisterId: cajaSedeEsId,
        paymentMethod: "cash",
        amount: 100,
      }),
    );
    expect(mensaje).toContain("es de una sede de otro país");
    expect(await contarPagos(gasto.id)).toBe(0);
  });

  it("banco EUR sin sede para un gasto de Argentina: 400", async () => {
    const bancoEur = await newCaja({
      name: "banco EUR ajeno",
      type: "banco",
      currency: "EUR",
      opening: 1000,
    });
    const gasto = await crearGasto();
    const mensaje = await falla(BadRequestError, () =>
      pagar(gasto.id, { cashRegisterId: bancoEur, amount: 100 }),
    );
    expect(mensaje).toContain("está en EUR");
    expect(await contarPagos(gasto.id)).toBe(0);
    expect(await contarLedger(bancoEur)).toBe(0);
  });

  it("cuenta inexistente y cuenta de otro gimnasio dan el MISMO 400, sin tocar nada", async () => {
    const gasto = await crearGasto();
    const inexistente = await falla(BadRequestError, () =>
      pagar(gasto.id, { cashRegisterId: 2_000_000_000, amount: 100 }),
    );
    const ajena = await falla(BadRequestError, () =>
      pagar(gasto.id, { cashRegisterId: cajaOtroGimnasioId, amount: 100 }),
    );
    expect(inexistente).toBe("Cuenta no encontrada");
    expect(ajena).toBe(inexistente);
    const [filas] = await app.db
      .select({ n: count() })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, { tenantId: TENANT_DOS }),
          eq(schema.financialTransactions.cashRegisterId, cajaOtroGimnasioId),
        ),
      );
    expect(filas.n).toBe(0);
  });
});

describe("registerPayment: fechas", () => {
  it("fecha de mañana (zona del país): 400", async () => {
    const banco = await newCaja({ name: "banco futuro", type: "banco" });
    const gasto = await crearGasto();
    const mensaje = await falla(BadRequestError, () =>
      pagar(gasto.id, { cashRegisterId: banco, amount: 100, paidOn: MANANA }),
    );
    expect(mensaje).toBe("La fecha del pago no puede ser futura");
    expect(await contarLedger(banco)).toBe(0);
  });

  it("fecha anterior al corte de la cuenta: 400 y el saldo no se mueve", async () => {
    const banco = await newCaja({
      name: "banco corte hoy",
      type: "banco",
      opening: 1000,
      cutoffDate: HOY,
    });
    const gasto = await crearGasto();
    const mensaje = await falla(BadRequestError, () =>
      pagar(gasto.id, { cashRegisterId: banco, amount: 100, paidOn: AYER }),
    );
    expect(mensaje).toContain("anterior al corte de la cuenta");
    expect(mensaje).toContain(`(${HOY})`);
    expect(await contarPagos(gasto.id)).toBe(0);
    expect(await contarLedger(banco)).toBe(0);
    expect(await firme(banco)).toBe(1000);
  });

  it("pago el mismo día del corte: OK", async () => {
    const banco = await newCaja({
      name: "banco corte exacto",
      type: "banco",
      opening: 1000,
      cutoffDate: HOY,
    });
    const gasto = await crearGasto();
    await pagar(gasto.id, { cashRegisterId: banco, amount: 100, paidOn: HOY });
    // 1000 − 100
    expect(await firme(banco)).toBe(900);
  });

  it("pago con fecha pasada posterior al corte: OK y el saldo baja", async () => {
    const banco = await newCaja({
      name: "banco fecha pasada",
      type: "banco",
      opening: 80000,
    });
    const gasto = await crearGasto({ amount: 25000 });
    const res = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 25000,
      paidOn: HACE_10_DIAS,
    });
    expect(res.payment.paidOn).toBe(HACE_10_DIAS);
    expect((await leerLedger(res.payment.transactionId)).transactionDate).toBe(
      HACE_10_DIAS,
    );
    // 80000 − 25000
    expect(await firme(banco)).toBe(55000);
  });
});

describe("registerPayment: pago de más", () => {
  it("gasto confirmado: el pago que excede lo que falta da 400 con el mensaje; el justo pasa; después ya está pagado", async () => {
    const banco = await newCaja({
      name: "banco de mas",
      type: "banco",
      opening: 10000,
    });
    const gasto = await crearGasto({ amount: 1000, status: "confirmado" });
    await pagar(gasto.id, { cashRegisterId: banco, amount: 800 });

    const mensaje = await falla(BadRequestError, () =>
      pagar(gasto.id, { cashRegisterId: banco, amount: 300 }),
    );
    expect(mensaje).toBe(
      "El pago cancela 300 y al gasto le quedan 200 por pagar",
    );
    expect(await contarPagos(gasto.id)).toBe(1);

    const justo = await pagar(gasto.id, { cashRegisterId: banco, amount: 200 });
    expect(justo.record.status).toBe("pagado");
    // 10000 − 800 − 200
    expect(await firme(banco)).toBe(9000);

    const yaPagado = await falla(BadRequestError, () =>
      pagar(gasto.id, { cashRegisterId: banco, amount: 1 }),
    );
    expect(yaPagado).toBe("El gasto ya está pagado");
    expect(await contarPagos(gasto.id)).toBe(2);
  });

  it("gasto estimado: se admite pagar de más; el detalle marca overpaid y queda pagado", async () => {
    const banco = await newCaja({
      name: "banco estimado",
      type: "banco",
      opening: 10000,
    });
    const gasto = await crearGasto({ amount: 1000, status: "estimado" });
    const res = await pagar(gasto.id, { cashRegisterId: banco, amount: 1200 });
    expect(res.record.overpaid).toBe(true);
    expect(res.record.pending).toBe(0);
    expect(res.record.status).toBe("pagado");
    expect(res.record.paid).toBe(1200);
    // 10000 − 1200
    expect(await firme(banco)).toBe(8800);
  });

  it("dos pagos simultáneos que juntos pasan de lo que falta en un gasto confirmado: gana uno solo", async () => {
    const banco = await newCaja({
      name: "banco carrera gasto",
      type: "banco",
      opening: 10000,
    });
    const gasto = await crearGasto({ amount: 1000, status: "confirmado" });
    const resultados = await Promise.allSettled([
      pagar(gasto.id, { cashRegisterId: banco, amount: 700 }),
      pagar(gasto.id, { cashRegisterId: banco, amount: 700 }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rechazado = resultados.find((r) => r.status === "rejected");
    expect(rechazado?.status === "rejected" && rechazado.reason).toBeInstanceOf(
      BadRequestError,
    );
    expect(await contarPagos(gasto.id)).toBe(1);
    // 10000 − 700
    expect(await firme(banco)).toBe(9300);
  });
});

describe("registerPayment: gasto", () => {
  it("gasto anulado: 400 y sin filas", async () => {
    const banco = await newCaja({
      name: "banco anulado",
      type: "banco",
      opening: 1000,
    });
    const gasto = await crearGasto();
    await records.void(TEMPLO_CTX, gasto.id, "Carga duplicada", adminId, {
      country: "AR",
    });
    const mensaje = await falla(BadRequestError, () =>
      pagar(gasto.id, { cashRegisterId: banco, amount: 100 }),
    );
    expect(mensaje).toBe("El gasto está anulado: no admite pagos");
    expect(await contarLedger(banco)).toBe(0);
  });

  it("gasto inexistente o de otro país: 404", async () => {
    const banco = await newCaja({ name: "banco 404", type: "banco" });
    const gasto = await crearGasto();
    expect(
      await falla(NotFoundError, () =>
        pagar(2_000_000_000, { cashRegisterId: banco, amount: 100 }),
      ),
    ).toBe("Gasto no encontrado");
    expect(
      await falla(NotFoundError, () =>
        pagar(gasto.id, { cashRegisterId: banco, amount: 100 }, "ES"),
      ),
    ).toBe("Gasto no encontrado");
    expect(await contarLedger(banco)).toBe(0);
  });
});

describe("registerPayment: validaciones sin DB", () => {
  it("importe, fecha, referencia, notas y clave mal formados dan 400 sin escribir", async () => {
    const banco = await newCaja({
      name: "banco validaciones",
      type: "banco",
      opening: 1000,
    });
    const gasto = await crearGasto();
    const base = { cashRegisterId: banco, amount: 100 };

    await falla(BadRequestError, () => pagar(gasto.id, { ...base, amount: 0 }));
    await falla(BadRequestError, () =>
      pagar(gasto.id, { ...base, amount: 10.5 }),
    );
    await falla(BadRequestError, () =>
      pagar(gasto.id, { ...base, amount: MAX_MONEY + 1 }),
    );
    expect(
      await falla(BadRequestError, () =>
        pagar(gasto.id, { ...base, paidOn: "2026-02-30" }),
      ),
    ).toBe("La fecha del pago no es válida");
    await falla(BadRequestError, () =>
      pagar(gasto.id, { ...base, paidOn: "ayer" }),
    );
    expect(
      await falla(BadRequestError, () =>
        pagar(gasto.id, { ...base, reference: "r".repeat(101) }),
      ),
    ).toContain("100 caracteres");
    expect(
      await falla(BadRequestError, () =>
        pagar(gasto.id, { ...base, notes: "n".repeat(2001) }),
      ),
    ).toContain("2000 caracteres");
    expect(
      await falla(BadRequestError, () =>
        pagar(gasto.id, { ...base, idempotencyKey: "k".repeat(65) }),
      ),
    ).toContain("64 caracteres");

    expect(await contarPagos(gasto.id)).toBe(0);
    expect(await contarLedger(banco)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tipo de cambio
// ---------------------------------------------------------------------------

describe("registerPayment: monedas y tipo de cambio", () => {
  it("ejemplo USD 600 con TC 1560: 468000 desde un banco ARS cancelan 300 (parcial) y 300 desde un banco USD con TC 1500 cancelan 300 (pagado)", async () => {
    const bancoArs = await newCaja({
      name: "banco ARS usd",
      type: "banco",
      opening: 1000000,
    });
    const bancoUsd = await newCaja({
      name: "banco USD usd",
      type: "banco",
      currency: "USD",
      opening: 1000,
    });
    const gasto = await crearGasto({
      amount: 600,
      currency: "USD",
      fxRate: 1560,
    });
    expect(gasto.costInCountryCurrency).toBe(936000);

    const p1 = await pagar(gasto.id, {
      cashRegisterId: bancoArs,
      amount: 468000,
      fxRate: 1560,
    });
    expect(p1.payment.amount).toBe(468000);
    expect(p1.payment.currency).toBe("ARS");
    expect(p1.payment.appliedAmount).toBe(300);
    expect(p1.payment.amountArs).toBe(468000);
    expect(p1.payment.fxRate).toBe(1560);
    expect(p1.record.status).toBe("parcial");
    expect(p1.record.paid).toBe(300);
    expect(p1.record.pending).toBe(300);
    // 1000000 − 468000
    expect(await firme(bancoArs)).toBe(532000);

    const p2 = await pagar(gasto.id, {
      cashRegisterId: bancoUsd,
      amount: 300,
      fxRate: 1500,
    });
    expect(p2.payment.amount).toBe(300);
    expect(p2.payment.currency).toBe("USD");
    expect(p2.payment.appliedAmount).toBe(300);
    expect(p2.payment.amountArs).toBe(450000);
    expect(p2.payment.fxRate).toBe(1500);
    expect(p2.record.status).toBe("pagado");
    expect(p2.record.pending).toBe(0);
    // 1000 − 300
    expect(await firme(bancoUsd)).toBe(700);

    // La fila del ledger queda en la moneda de la cuenta.
    const ledger = await leerLedger(p2.payment.transactionId);
    expect(ledger.currency).toBe("USD");
    expect(ledger.amount).toBe(300);
  });

  it("gasto en ARS pagado desde un banco USD: applied y amount_ars salen de importe × TC", async () => {
    const bancoUsd = await newCaja({
      name: "banco USD para ARS",
      type: "banco",
      currency: "USD",
      opening: 1000,
    });
    const gasto = await crearGasto({ amount: 300000 });
    const res = await pagar(gasto.id, {
      cashRegisterId: bancoUsd,
      amount: 200,
      fxRate: 1500,
    });
    expect(res.payment.appliedAmount).toBe(300000);
    expect(res.payment.amountArs).toBe(300000);
    expect(res.record.status).toBe("pagado");
    // 1000 − 200
    expect(await firme(bancoUsd)).toBe(800);
  });

  it("sin tipo de cambio cuando hace falta: 400 y sin escribir; con tipo de cambio en un pago ARS → ARS: 400", async () => {
    const bancoArs = await newCaja({
      name: "banco ARS fx",
      type: "banco",
      opening: 100000,
    });
    const bancoUsd = await newCaja({
      name: "banco USD fx",
      type: "banco",
      currency: "USD",
      opening: 1000,
    });
    const gastoUsd = await crearGasto({ amount: 600, currency: "USD" });
    const gastoArs = await crearGasto({ amount: 50000 });

    expect(
      await falla(BadRequestError, () =>
        pagar(gastoUsd.id, { cashRegisterId: bancoArs, amount: 1000 }),
      ),
    ).toContain("necesita el tipo de cambio");
    expect(
      await falla(BadRequestError, () =>
        pagar(gastoArs.id, { cashRegisterId: bancoUsd, amount: 10 }),
      ),
    ).toContain("necesita el tipo de cambio");
    expect(
      await falla(BadRequestError, () =>
        pagar(gastoArs.id, {
          cashRegisterId: bancoArs,
          amount: 1000,
          fxRate: 1500,
        }),
      ),
    ).toBe("Este pago no lleva tipo de cambio");

    expect(await contarPagos(gastoUsd.id)).toBe(0);
    expect(await contarPagos(gastoArs.id)).toBe(0);
    expect(await contarLedger(bancoArs)).toBe(0);
    expect(await contarLedger(bancoUsd)).toBe(0);
  });

  it("España: gasto EUR pagado desde un banco EUR sin sede: amount_ars null, sin tipo de cambio", async () => {
    const bancoEur = await newCaja({
      name: "banco EUR es",
      type: "banco",
      currency: "EUR",
      opening: 10000,
    });
    const gasto = await crearGastoEs(2500);
    const paidOn = addDays(HOY, -3);
    const res = await pagar(
      gasto.id,
      { cashRegisterId: bancoEur, amount: 2500, paidOn },
      "ES",
    );
    expect(res.payment.currency).toBe("EUR");
    expect(res.payment.appliedAmount).toBe(2500);
    expect(res.payment.amountArs).toBeNull();
    expect(res.payment.fxRate).toBeNull();
    expect(res.record.status).toBe("pagado");
    // 10000 − 2500
    expect(await firme(bancoEur)).toBe(7500);

    // Y un banco ARS no sirve para un gasto de España.
    const bancoArs = await newCaja({ name: "banco ARS es", type: "banco" });
    const otro = await crearGastoEs(100);
    await falla(BadRequestError, () =>
      pagar(otro.id, { cashRegisterId: bancoArs, amount: 100, paidOn }, "ES"),
    );
    expect(await contarPagos(otro.id)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Idempotencia y rastro
// ---------------------------------------------------------------------------

describe("registerPayment: idempotencia", () => {
  it("la misma clave dos veces: un solo pago y una sola fila del ledger; la segunda devuelve created false", async () => {
    const banco = await newCaja({
      name: "banco idem",
      type: "banco",
      opening: 10000,
    });
    const gasto = await crearGasto({ amount: 5000 });
    const clave = `egr05-${sufijo}-a`;

    const primero = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 2000,
      idempotencyKey: clave,
    });
    const segundo = await pagar(gasto.id, {
      cashRegisterId: banco,
      amount: 2000,
      idempotencyKey: clave,
    });
    expect(primero.created).toBe(true);
    expect(segundo.created).toBe(false);
    expect(segundo.payment.id).toBe(primero.payment.id);
    expect(segundo.record.payments).toHaveLength(1);
    expect(await contarPagos(gasto.id)).toBe(1);
    expect(await contarLedger(banco)).toBe(1);
    // 10000 − 2000, una sola vez
    expect(await firme(banco)).toBe(8000);
  });

  it("la misma clave en otro gasto: 409 y no crea nada", async () => {
    const banco = await newCaja({
      name: "banco idem otro",
      type: "banco",
      opening: 10000,
    });
    const g1 = await crearGasto({ amount: 5000 });
    const g2 = await crearGasto({ amount: 5000 });
    const clave = `egr05-${sufijo}-b`;
    await pagar(g1.id, {
      cashRegisterId: banco,
      amount: 1000,
      idempotencyKey: clave,
    });
    const mensaje = await falla(ConflictError, () =>
      pagar(g2.id, {
        cashRegisterId: banco,
        amount: 1000,
        idempotencyKey: clave,
      }),
    );
    expect(mensaje).toBe("Esa clave de pago ya se usó en otro gasto");
    expect(await contarPagos(g2.id)).toBe(0);
    expect(await contarLedger(banco)).toBe(1);
  });

  it("dos pedidos simultáneos con la misma clave: uno crea y el otro devuelve el mismo pago, con una sola fila del ledger", async () => {
    const banco = await newCaja({
      name: "banco idem carrera",
      type: "banco",
      opening: 10000,
    });
    const gasto = await crearGasto({ amount: 5000 });
    const clave = `egr05-${sufijo}-c`;
    const [a, b] = await Promise.all([
      pagar(gasto.id, {
        cashRegisterId: banco,
        amount: 1500,
        idempotencyKey: clave,
      }),
      pagar(gasto.id, {
        cashRegisterId: banco,
        amount: 1500,
        idempotencyKey: clave,
      }),
    ]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.payment.id).toBe(b.payment.id);
    expect(await contarPagos(gasto.id)).toBe(1);
    expect(await contarLedger(banco)).toBe(1);
    // 10000 − 1500, una sola vez
    expect(await firme(banco)).toBe(8500);
  });
});

describe("registerPayment: historial", () => {
  it("deja expense_payment_registered en el historial del gasto con el payload del pago", async () => {
    const banco = await newCaja({
      name: "banco audit",
      type: "banco",
      opening: 10000,
    });
    const gasto = await crearGasto({ amount: 4000 });
    const res = await pagar(gasto.id, { cashRegisterId: banco, amount: 4000 });

    const evento = res.record.history.find(
      (h) => h.action === "expense_payment_registered",
    );
    expect(evento).toBeDefined();
    expect(evento?.payload).toMatchObject({
      paymentId: res.payment.id,
      transactionId: res.payment.transactionId,
      paidOn: HOY,
      cashRegisterId: banco,
      paymentMethod: "transfer",
      amount: 4000,
      currency: "ARS",
      appliedAmount: 4000,
      fxRate: null,
      amountArs: 4000,
    });
  });
});

// ---------------------------------------------------------------------------
// Opciones del formulario (DI-07)
// ---------------------------------------------------------------------------

describe("listPaymentAccounts", () => {
  it("AR: incluye banco ARS, banco USD, Central y efectivo de sede; excluye banco EUR, la inactiva y la caja de España; sin saldos y en orden", async () => {
    const sedeA = await newCaja({
      name: "lista efectivo sede",
      type: "efectivo",
      opening: 100,
      branchId: branchIds.A,
    });
    const central = await newCaja({
      name: "lista central",
      type: "efectivo",
      opening: 100,
    });
    const bancoArs = await newCaja({
      name: "lista banco ARS",
      type: "banco",
      opening: 100,
    });
    const bancoUsd = await newCaja({
      name: "lista banco USD",
      type: "banco",
      currency: "USD",
      opening: 100,
    });
    const bancoEur = await newCaja({
      name: "lista banco EUR",
      type: "banco",
      currency: "EUR",
      opening: 100,
    });
    const inactiva = await newCaja({
      name: "lista inactiva",
      type: "banco",
      isActive: false,
    });

    const cuentas = await payments.listPaymentAccounts(TEMPLO_CTX, "AR");
    const ids = cuentas.map((c) => c.id);
    for (const id of [sedeA, central, bancoArs, bancoUsd]) {
      expect(ids).toContain(id);
    }
    for (const id of [bancoEur, inactiva, cajaSedeEsId, cajaOtroGimnasioId]) {
      expect(ids).not.toContain(id);
    }

    // Ningún objeto trae saldos: las claves son exactamente estas.
    for (const c of cuentas) {
      expect(Object.keys(c).sort()).toEqual(
        [
          "branchId",
          "branchName",
          "cutoffDate",
          "currency",
          "id",
          "isTreasury",
          "name",
          "type",
        ].sort(),
      );
    }

    const propia = cuentas.find((c) => c.id === sedeA);
    expect(propia?.branchId).toBe(branchIds.A);
    expect(propia?.branchName).toBe(`ZZZ-EGR-05 ${sufijo}-A`);
    expect(propia?.type).toBe("efectivo");
    expect(propia?.isTreasury).toBe(false);
    expect(propia?.cutoffDate).toBe("2020-01-01");
    const sinSede = cuentas.find((c) => c.id === bancoUsd);
    expect(sinSede?.branchId).toBeNull();
    expect(sinSede?.branchName).toBeNull();
    expect(sinSede?.currency).toBe("USD");

    // Orden: efectivo de sede → efectivo sin sede → bancos.
    const pos = (id: number) => ids.indexOf(id);
    expect(pos(sedeA)).toBeLessThan(pos(central));
    expect(pos(central)).toBeLessThan(pos(bancoArs));
    expect(pos(central)).toBeLessThan(pos(bancoUsd));
  });

  it("ES: banco EUR y caja de la sede de España sí; ninguna cuenta de Argentina", async () => {
    const bancoEur = await newCaja({
      name: "lista es banco EUR",
      type: "banco",
      currency: "EUR",
    });
    const bancoArs = await newCaja({
      name: "lista es banco ARS",
      type: "banco",
    });
    const cuentas = await payments.listPaymentAccounts(TEMPLO_CTX, "ES");
    const ids = cuentas.map((c) => c.id);
    expect(ids).toContain(bancoEur);
    expect(ids).toContain(cajaSedeEsId);
    expect(ids).not.toContain(bancoArs);
    expect(ids).not.toContain(cajaOtroGimnasioId);
    expect(cuentas.every((c) => c.currency === "EUR")).toBe(true);
    // El efectivo de sede va antes que el banco.
    expect(ids.indexOf(cajaSedeEsId)).toBeLessThan(ids.indexOf(bancoEur));
  });
});

describe("getFormOptions", () => {
  it("AR: destinos = sedes operativas de la DB y Casa Matriz al final, rubros activos sin Retiros, monedas y hoy del país", async () => {
    const opciones = await payments.getFormOptions(TEMPLO_CTX, "AR");

    expect(opciones.country).toBe("AR");
    expect(opciones.countryCurrency).toBe("ARS");
    expect(opciones.expenseCurrencies).toEqual(["ARS", "USD"]);
    expect(opciones.today).toBe(await countryToday(app.db, TEMPLO_CTX, "AR"));

    // Destinos: lectura independiente de la DB.
    const operativas = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, TEMPLO_CTX),
          eq(schema.branches.country, "AR"),
          eq(schema.branches.isActive, true),
          eq(schema.branches.isVirtual, false),
        ),
      );
    const esperadas = operativas.map((b) => b.id).sort((a, b) => a - b);
    const conSede = opciones.destinations.filter((d) => d.branchId !== null);
    expect(
      conSede.map((d) => d.branchId as number).sort((a, b) => a - b),
    ).toEqual(esperadas);
    expect(esperadas).toContain(branchIds.A);
    expect(esperadas).not.toContain(branchIds.inactiva);
    expect(esperadas).not.toContain(branchIds.es);
    const ultimo = opciones.destinations[opciones.destinations.length - 1];
    expect(ultimo).toEqual({ branchId: null, name: "Casa Matriz" });
    expect(
      opciones.destinations.filter((d) => d.branchId === null),
    ).toHaveLength(1);

    // Rubros: el propio activo sí; el inactivo, el de España y Retiros no.
    const nombres = opciones.costCenters.map((c) => c.name);
    const ids = opciones.costCenters.map((c) => c.id);
    expect(ids).toContain(costCenterIds.ar);
    expect(ids).not.toContain(costCenterIds.arInactivo);
    expect(ids).not.toContain(costCenterIds.es);
    expect(ids).not.toContain(retirosId);
    expect(nombres).not.toContain(RETIROS_COST_CENTER_NAME);

    // Cuentas sin saldos.
    for (const c of opciones.accounts) {
      expect(c).not.toHaveProperty("balance");
      expect(c).not.toHaveProperty("firmeBalance");
      expect(c).not.toHaveProperty("openingBalance");
    }
  });

  it("ES: sin Casa Matriz, solo sedes de España y EUR", async () => {
    const opciones = await payments.getFormOptions(TEMPLO_CTX, "ES");
    expect(opciones.country).toBe("ES");
    expect(opciones.countryCurrency).toBe("EUR");
    expect(opciones.expenseCurrencies).toEqual(["EUR"]);
    expect(opciones.today).toBe(await countryToday(app.db, TEMPLO_CTX, "ES"));
    expect(opciones.destinations.every((d) => d.branchId !== null)).toBe(true);
    expect(opciones.destinations.map((d) => d.name)).not.toContain(
      "Casa Matriz",
    );
    expect(opciones.destinations.map((d) => d.branchId)).toContain(
      branchIds.es,
    );
    expect(opciones.destinations.map((d) => d.branchId)).not.toContain(
      branchIds.A,
    );
    const ids = opciones.costCenters.map((c) => c.id);
    expect(ids).toContain(costCenterIds.es);
    expect(ids).not.toContain(costCenterIds.ar);
  });
});
