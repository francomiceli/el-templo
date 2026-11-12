/**
 * Fase 209 Plan 09: Resumen de Egresos (ExpenseSummaryService), sin rutas.
 *
 * Cubre las tres medidas de DI-12 (pagado en el mes, costo del mes con su
 * subtotal de estimados y pendiente), la conversión de gastos en USD, el
 * prorrateo con tope, que anulados no cuentan, las sedes inactivas con reparto,
 * los incompletos, el detalle por rubro y concepto y las identidades exactas
 * (suma por destinos = total, costo = pagado de ese costo + pendiente).
 *
 * El Resumen suma TODO el gimnasio, el país y el mes: los números de cada caso
 * se afirman como DIFERENCIA entre una foto tomada antes de sembrar y otra
 * después (los literales de cada `it` están comentados). Las sedes propias del
 * test son nuevas, así que sus columnas solo tienen datos de este archivo. Las
 * identidades se afirman sobre el total absoluto contra consultas directas.
 *
 * Corre contra la MySQL de test, en foreground y de a un archivo.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_DOS, TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import {
  BadRequestError,
  NotFoundError,
} from "../../src/modules/shared/errors";
import { shiftMonth } from "../../src/modules/shared/date-utils";
import { BalanceService } from "../../src/modules/finance/balance-service";
import { CashRegisterService } from "../../src/modules/finance/cash-register-service";
import { TransactionService } from "../../src/modules/finance/transaction-service";
import { ExpenseRecordService } from "../../src/modules/finance/expense-record-service";
import { ExpensePaymentService } from "../../src/modules/finance/expense-payment-service";
import { ExpenseSummaryService } from "../../src/modules/finance/expense-summary-service";
import {
  countryToday,
  listOperationalBranches,
} from "../../src/modules/finance/expense-branches";
import { expenseCostInCountryCurrency } from "../../src/modules/finance/expense-math";
import type {
  ExpenseCountry,
  ExpenseCurrency,
  ExpenseRecordDetail,
  ExpenseSummary,
  ExpenseSummaryColumn,
  ExpenseSummaryDetail,
} from "../../src/modules/finance/expense-types";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const CTX_DOS: TenantContext = { tenantId: TENANT_DOS };
const sufijo = `${Date.now() % 1_000_000}`;
const PREFIJO = `EGR-09 ${sufijo}`;

let app: FastifyInstance;
let records: ExpenseRecordService;
let payments: ExpensePaymentService;
let summary: ExpenseSummaryService;
let adminId: number;

/** "Hoy" y mes actual de Argentina y de España (pueden diferir en el borde del mes). */
let hoy = "";
let MES = "";
let PREV = "";
let hoyEs = "";
let MES_ES = "";

const sedes = { A: 0, B: 0, C: 0, es: 0 };
const sedesExtra: number[] = [];
const rubros = { ar: 0, x: 0, y: 0, es: 0 };
const cajaIds: number[] = [];
let bancoArs = 0;
let bancoEur = 0;
let bancoUsd = 0;

const LINK = [{ label: "Factura", url: "https://example.com/factura" }];

type Medida = "paidInMonth" | "cost" | "costEstimated" | "costPaid" | "pending";
const MEDIDAS: Medida[] = [
  "paidInMonth",
  "cost",
  "costEstimated",
  "costPaid",
  "pending",
];
type Fila = Record<Medida, number>;

// ---------------------------------------------------------------------------
// Armado
// ---------------------------------------------------------------------------

async function crearSede(
  clave: string,
  valores: { country: string; isActive?: boolean; timezone?: string },
): Promise<number> {
  const [res] = await app.db.insert(schema.branches).values(
    tenantValues(CTX, {
      ...valores,
      name: `ZZZ-EGR-09 ${sufijo}-${clave}`,
      code: `E9${clave}${sufijo}`.slice(0, 20),
    }),
  );
  return Number(res.insertId);
}

async function crearRubro(name: string, country: string): Promise<number> {
  const [res] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(CTX, { name, country }));
  return Number(res.insertId);
}

async function crearBanco(currency: string): Promise<number> {
  const [row] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(CTX, {
        name: `${PREFIJO} banco ${currency}`,
        type: "banco" as const,
        branchId: null,
        currency,
        openingBalance: 10_000_000,
        cutoffDate: "2020-01-01",
      }),
    )
    .$returningId();
  cajaIds.push(row.id);
  return row.id;
}

/** Gasto por la API del service. `alloc`: [sede o null (Casa Matriz), importe]. */
async function gasto(o: {
  concept: string;
  rubro?: number;
  month?: string;
  amount: number;
  currency?: ExpenseCurrency;
  status?: "estimado" | "confirmado";
  fx?: number | null;
  links?: Array<{ label: string; url: string }>;
  alloc: Array<[number | null, number]>;
  country?: ExpenseCountry;
}): Promise<ExpenseRecordDetail> {
  const country = o.country ?? "AR";
  const { record } = await records.create(
    CTX,
    country,
    {
      concept: `${PREFIJO} ${o.concept}`,
      costCenterId: o.rubro ?? (country === "AR" ? rubros.ar : rubros.es),
      imputationMonth: o.month ?? (country === "AR" ? MES : MES_ES),
      amount: o.amount,
      currency: o.currency ?? (country === "AR" ? "ARS" : "EUR"),
      amountStatus: o.status ?? "confirmado",
      fxRate: o.fx ?? null,
      receiptLinks: o.links ?? LINK,
      allocations: o.alloc.map(([branchId, amount]) => ({ branchId, amount })),
    },
    adminId,
  );
  return record;
}

/** Pago desde el banco ARS (o el indicado), de hoy salvo `paidOn`. */
function pagar(
  recordId: number,
  amount: number,
  o: {
    caja?: number;
    fx?: number;
    paidOn?: string;
    country?: ExpenseCountry;
  } = {},
) {
  const country = o.country ?? "AR";
  return payments.registerPayment(
    CTX,
    recordId,
    {
      paidOn: o.paidOn ?? (country === "AR" ? hoy : hoyEs),
      cashRegisterId: o.caja ?? (country === "AR" ? bancoArs : bancoEur),
      paymentMethod: "transfer",
      amount,
      fxRate: o.fx ?? null,
    },
    adminId,
    { country },
  );
}

function porClave(s: ExpenseSummary): Map<string, ExpenseSummaryColumn> {
  return new Map(s.columns.map((c) => [c.key, c]));
}

function filaDe(c: ExpenseSummaryColumn | undefined): Fila {
  return {
    paidInMonth: c?.paidInMonth ?? 0,
    cost: c?.cost ?? 0,
    costEstimated: c?.costEstimated ?? 0,
    costPaid: c?.costPaid ?? 0,
    pending: c?.pending ?? 0,
  };
}

/** Diferencia de una columna entre dos fotos (columna ausente antes = ceros). */
function dif(before: ExpenseSummary, after: ExpenseSummary, key: string): Fila {
  const a = filaDe(porClave(before).get(key));
  const b = filaDe(porClave(after).get(key));
  const out = { ...a };
  for (const m of MEDIDAS) out[m] = b[m] - a[m];
  return out;
}

/** Foto antes, corre `fn`, foto después. */
async function medir(
  country: ExpenseCountry,
  month: string,
  fn: () => Promise<void>,
): Promise<{ before: ExpenseSummary; after: ExpenseSummary }> {
  const before = await summary.getSummary(CTX, country, month);
  await fn();
  const after = await summary.getSummary(CTX, country, month);
  return { before, after };
}

function fila(
  paidInMonth: number,
  cost: number,
  costEstimated: number,
  costPaid: number,
  pending: number,
): Fila {
  return { paidInMonth, cost, costEstimated, costPaid, pending };
}

/** En cada columna: costo = pagado de ese costo + pendiente, sin partes negativas. */
function expectColumnasCoherentes(s: ExpenseSummary): void {
  for (const c of s.columns) {
    expect(c.cost, `costo de ${c.name}`).toBe(c.costPaid + c.pending);
    expect(c.pending, `pendiente de ${c.name}`).toBeGreaterThanOrEqual(0);
    expect(
      c.costPaid,
      `pagado de ese costo de ${c.name}`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      c.paidInMonth,
      `pagado en el mes de ${c.name}`,
    ).toBeGreaterThanOrEqual(0);
    expect(c.costEstimated, `estimado de ${c.name}`).toBeLessThanOrEqual(
      c.cost,
    );
  }
}

/** La suma de las columnas (sin el Total) es el Total en cada medida. */
function expectSumaDeColumnasEsTotal(s: ExpenseSummary): void {
  const total = s.columns[s.columns.length - 1];
  expect(total.key).toBe("total");
  const resto = s.columns.slice(0, -1);
  for (const m of MEDIDAS) {
    expect(
      resto.reduce((acc, c) => acc + c[m], 0),
      `suma de columnas de ${m}`,
    ).toBe(total[m]);
  }
}

/** Valores de un grupo/concepto del detalle de un destino. */
function sumasDelDetalle(d: ExpenseSummaryDetail): {
  cost: number;
  pending: number;
  paidInMonth: number;
} {
  let cost = 0;
  let pending = 0;
  let paidInMonth = 0;
  for (const g of d.groups) {
    cost += g.cost;
    pending += g.pending;
    paidInMonth += g.paidInMonth;
    // El grupo es la suma de sus conceptos.
    expect(g.concepts.reduce((a, c) => a + c.cost, 0)).toBe(g.cost);
    expect(g.concepts.reduce((a, c) => a + c.pending, 0)).toBe(g.pending);
    expect(g.concepts.reduce((a, c) => a + c.paidInMonth, 0)).toBe(
      g.paidInMonth,
    );
  }
  return { cost, pending, paidInMonth };
}

/** Ejecuta algo que DEBE fallar con `clase` y devuelve el mensaje. */
async function falla(
  clase: typeof BadRequestError | typeof NotFoundError,
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
  const cashRegisterService = new CashRegisterService(app.db, app.log);
  const txnService = new TransactionService(
    app.db,
    app.log,
    new BalanceService(app.db, app.log),
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
  summary = new ExpenseSummaryService(app.db, app.log, records);

  const [admin] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  adminId = admin.id;

  sedes.A = await crearSede("A", { country: "AR" });
  sedes.B = await crearSede("B", { country: "AR" });
  sedes.C = await crearSede("C", { country: "AR" });
  sedes.es = await crearSede("ES", {
    country: "ES",
    timezone: "Europe/Madrid",
  });

  rubros.ar = await crearRubro(`${PREFIJO} AR`, "AR");
  rubros.x = await crearRubro(`${PREFIJO} X`, "AR");
  rubros.y = await crearRubro(`${PREFIJO} Y`, "AR");
  rubros.es = await crearRubro(`${PREFIJO} ES`, "ES");

  bancoArs = await crearBanco("ARS");
  bancoEur = await crearBanco("EUR");
  bancoUsd = await crearBanco("USD");

  hoy = await countryToday(app.db, CTX, "AR");
  hoyEs = await countryToday(app.db, CTX, "ES");
  MES = hoy.slice(0, 7);
  PREV = shiftMonth(MES, -1);
  MES_ES = hoyEs.slice(0, 7);
});

afterAll(async () => {
  // Orden: pagos → ledger por cuenta → audit del ledger → reparto → gastos →
  // audit propio → cajas → rubros → sedes.
  const rubroIds = Object.values(rubros).filter((id) => id > 0);
  const propios =
    rubroIds.length === 0
      ? []
      : await app.db
          .select({ id: schema.expenseRecords.id })
          .from(schema.expenseRecords)
          .where(
            and(
              tenantWhere(schema.expenseRecords, CTX),
              inArray(schema.expenseRecords.costCenterId, rubroIds),
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
  if (cajaIds.length > 0) {
    const ledger = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, CTX),
          inArray(schema.financialTransactions.cashRegisterId, cajaIds),
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
  if (cajaIds.length > 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, CTX),
          inArray(schema.cashRegisters.id, cajaIds),
        ),
      );
  }
  if (rubroIds.length > 0) {
    await app.db
      .delete(schema.costCenters)
      .where(
        and(
          tenantWhere(schema.costCenters, CTX),
          inArray(schema.costCenters.id, rubroIds),
        ),
      );
  }
  const sedeIds = [...Object.values(sedes), ...sedesExtra].filter(
    (id) => id > 0,
  );
  if (sedeIds.length > 0) {
    await app.db
      .delete(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          inArray(schema.branches.id, sedeIds),
        ),
      );
  }
  await app.close();
});

// ---------------------------------------------------------------------------
// Columnas
// ---------------------------------------------------------------------------

describe("Resumen: columnas", () => {
  it("AR: sedes operativas leídas de la DB en su orden, Casa Matriz y al final Total, en pesos", async () => {
    const s = await summary.getSummary(CTX, "AR", MES);
    const operativas = await listOperationalBranches(app.db, CTX, "AR");
    const claves = s.columns.map((c) => c.key);

    expect(s.currency).toBe("ARS");
    expect(s.country).toBe("AR");
    expect(s.month).toBe(MES);
    // Las operativas van primero y en el orden de `listOperationalBranches`.
    expect(claves.slice(0, operativas.length)).toEqual(
      operativas.map((b) => String(b.id)),
    );
    expect(s.columns.slice(0, operativas.length).map((c) => c.name)).toEqual(
      operativas.map((b) => b.name),
    );
    expect(s.columns.slice(0, operativas.length).every((c) => c.isActive)).toBe(
      true,
    );
    // Después, solo sedes no operativas con reparto, y luego Casa Matriz y Total.
    expect(claves.slice(-2)).toEqual(["casa_matriz", "total"]);
    const matriz = s.columns[s.columns.length - 2];
    expect(matriz.name).toBe("Casa Matriz");
    expect(matriz.branchId).toBeNull();
    expect(s.columns[s.columns.length - 1].name).toBe("Total");
    // Las sedes propias del test son operativas y salen por nombre (A, B, C).
    const iA = claves.indexOf(String(sedes.A));
    expect(iA).toBeGreaterThanOrEqual(0);
    expect(claves[iA + 1]).toBe(String(sedes.B));
    expect(claves[iA + 2]).toBe(String(sedes.C));
    // La sede de España no aparece en el Resumen de Argentina.
    expect(claves).not.toContain(String(sedes.es));
    expectColumnasCoherentes(s);
    expectSumaDeColumnasEsTotal(s);
  });

  it("ES: sus sedes en su orden y Total, sin Casa Matriz, en euros", async () => {
    const s = await summary.getSummary(CTX, "ES", MES_ES);
    const operativas = await listOperationalBranches(app.db, CTX, "ES");
    const claves = s.columns.map((c) => c.key);

    expect(s.currency).toBe("EUR");
    expect(s.country).toBe("ES");
    expect(claves.slice(0, operativas.length)).toEqual(
      operativas.map((b) => String(b.id)),
    );
    expect(claves).toContain(String(sedes.es));
    expect(claves).not.toContain("casa_matriz");
    expect(claves[claves.length - 1]).toBe("total");
    // Ninguna sede de Argentina.
    expect(claves).not.toContain(String(sedes.A));
    expectColumnasCoherentes(s);
    expectSumaDeColumnasEsTotal(s);
  });

  it("mes mal formado: 400 en el resumen y en el detalle", async () => {
    for (const malo of ["2026-13", "2026-1", "26-10", "", "2026/10"]) {
      expect(
        await falla(BadRequestError, () => summary.getSummary(CTX, "AR", malo)),
      ).toBe("El mes tiene que tener el formato AAAA-MM");
    }
    await falla(BadRequestError, () =>
      summary.getDetail(CTX, "AR", "octubre", "total"),
    );
  });
});

// ---------------------------------------------------------------------------
// Costo del mes y pagado en el mes
// ---------------------------------------------------------------------------

describe("Resumen: costo del mes y pagado en el mes", () => {
  it("factura del mes anterior pagada este mes: su costo es del anterior y su pago, del actual", async () => {
    const mesAntes = await summary.getSummary(CTX, "AR", MES);
    const prev = await summary.getSummary(CTX, "AR", PREV);

    const g = await gasto({
      concept: "factura del mes anterior",
      month: PREV,
      amount: 90000,
      alloc: [
        [sedes.A, 30000],
        [sedes.B, 30000],
        [sedes.C, 30000],
      ],
    });
    await pagar(g.id, 90000);

    const mes = await summary.getSummary(CTX, "AR", MES);
    const prevDespues = await summary.getSummary(CTX, "AR", PREV);

    for (const sede of [sedes.A, sedes.B, sedes.C]) {
      const k = String(sede);
      // Mes anterior: 30000 de costo, ya pagado (pendiente 0) y NADA pagado en ese mes.
      expect(dif(prev, prevDespues, k)).toEqual(fila(0, 30000, 0, 30000, 0));
      // Mes actual: 30000 pagados y ningún costo.
      expect(dif(mesAntes, mes, k)).toEqual(fila(30000, 0, 0, 0, 0));
    }
    // Total: 90000 de costo en el anterior y 90000 pagados en el actual.
    expect(dif(prev, prevDespues, "total")).toEqual(
      fila(0, 90000, 0, 90000, 0),
    );
    expect(dif(mesAntes, mes, "total")).toEqual(fila(90000, 0, 0, 0, 0));
    expectColumnasCoherentes(mes);
    expectColumnasCoherentes(prevDespues);
  });

  it("USD 300 a 1560 entre 3 sedes y un pago desde banco ARS de 234000 (aplica USD 150)", async () => {
    const { before, after } = await medir("AR", MES, async () => {
      const g = await gasto({
        concept: "alquiler en dólares",
        amount: 300,
        currency: "USD",
        fx: 1560,
        alloc: [
          [sedes.A, 100],
          [sedes.B, 100],
          [sedes.C, 100],
        ],
      });
      const pago = await pagar(g.id, 234000, { fx: 1560 });
      expect(pago.payment.appliedAmount).toBe(150);
      expect(pago.payment.amountArs).toBe(234000);
    });

    for (const sede of [sedes.A, sedes.B, sedes.C]) {
      // 100 USD × 1560 = 156000 de costo. El pago de 234000 se reparte 78000 por
      // sede. Queda USD 150 por pagar = 234000, o sea 78000 pendientes por sede
      // y 78000 pagados de ese costo.
      expect(dif(before, after, String(sede))).toEqual(
        fila(78000, 156000, 0, 78000, 78000),
      );
    }
    // 3 × 156000 = 468000 de costo y 234000 pagados.
    expect(dif(before, after, "total")).toEqual(
      fila(234000, 468000, 0, 234000, 234000),
    );
  });

  it("pago desde una cuenta en USD con otro tipo de cambio: lo pagado en el mes usa amount_ars y el costo sigue con el tipo de referencia del gasto", async () => {
    const { before, after } = await medir("AR", MES, async () => {
      const g = await gasto({
        concept: "dólares pagados con otro tipo de cambio",
        amount: 100,
        currency: "USD",
        fx: 1560,
        alloc: [[sedes.A, 100]],
      });
      const res = await pagar(g.id, 100, { caja: bancoUsd, fx: 1600 });
      expect(res.payment.appliedAmount).toBe(100);
      expect(res.payment.amountArs).toBe(160000);
      expect(res.record.status).toBe("pagado");
    });
    // Costo: 100 USD × 1560 = 156000, sin pendiente (pagado entero). Lo que salió
    // fue 100 USD × 1600 = 160000 y eso es lo "pagado en el mes".
    expect(dif(before, after, String(sedes.A))).toEqual(
      fila(160000, 156000, 0, 156000, 0),
    );
    expect(dif(before, after, "total")).toEqual(
      fila(160000, 156000, 0, 156000, 0),
    );
  });

  it("gasto estimado: su parte suma en el subtotal de estimados de cada destino y del total", async () => {
    const { before, after } = await medir("AR", MES, async () => {
      await gasto({
        concept: "servicio estimado",
        amount: 60000,
        status: "estimado",
        alloc: [
          [sedes.A, 20000],
          [sedes.B, 20000],
          [sedes.C, 20000],
        ],
      });
    });
    for (const sede of [sedes.A, sedes.B, sedes.C]) {
      // Sin pagos: 20000 de costo, todo estimado y todo pendiente.
      expect(dif(before, after, String(sede))).toEqual(
        fila(0, 20000, 20000, 0, 20000),
      );
    }
    expect(dif(before, after, "total")).toEqual(
      fila(0, 60000, 60000, 0, 60000),
    );
  });

  it("prorrateo con tope: 3 entre 3 sedes con 1 pagado no deja pendientes mayores al costo ni pagados negativos", async () => {
    const { before, after } = await medir("AR", MES, async () => {
      const g = await gasto({
        concept: "gasto de 3",
        amount: 3,
        alloc: [
          [sedes.A, 1],
          [sedes.B, 1],
          [sedes.C, 1],
        ],
      });
      await pagar(g.id, 1);
    });
    const filas = [sedes.A, sedes.B, sedes.C].map((s) =>
      dif(before, after, String(s)),
    );
    for (const f of filas) {
      expect(f.cost).toBe(1);
      expect(f.pending).toBeLessThanOrEqual(f.cost);
      expect(f.costPaid).toBeGreaterThanOrEqual(0);
      expect(f.cost).toBe(f.costPaid + f.pending);
    }
    // Quedan 2 por pagar: el prorrateo con tope los deja en [0, 1, 1].
    expect(filas.map((f) => f.pending)).toEqual([0, 1, 1]);
    expect(filas.reduce((a, f) => a + f.pending, 0)).toBe(2);
    // El peso entero del pago de 1 va al último destino.
    expect(filas.map((f) => f.paidInMonth)).toEqual([0, 0, 1]);
    expect(dif(before, after, "total")).toEqual(fila(1, 3, 0, 1, 2));
  });

  it("100 entre 3 destinos que no dividen parejo (33, 33 y 34) con un pago parcial de 50: todo cierra exacto", async () => {
    const { before, after } = await medir("AR", MES, async () => {
      const g = await gasto({
        concept: "gasto desparejo",
        amount: 100,
        alloc: [
          [sedes.A, 33],
          [sedes.B, 33],
          [sedes.C, 34],
        ],
      });
      await pagar(g.id, 50);
    });
    // Pendiente 50 prorrateado con tope sobre [33, 33, 34] = [16, 16, 18].
    // Pagado de ese costo = costo − pendiente = [17, 17, 16]. El pago de 50
    // prorrateado por el reparto = [16, 16, 18].
    expect(dif(before, after, String(sedes.A))).toEqual(
      fila(16, 33, 0, 17, 16),
    );
    expect(dif(before, after, String(sedes.B))).toEqual(
      fila(16, 33, 0, 17, 16),
    );
    expect(dif(before, after, String(sedes.C))).toEqual(
      fila(18, 34, 0, 16, 18),
    );
    // Total: 100 de costo = 50 pagados de ese costo + 50 pendientes.
    expect(dif(before, after, "total")).toEqual(fila(50, 100, 0, 50, 50));
    expectColumnasCoherentes(after);
    expectSumaDeColumnasEsTotal(after);
  });

  it("anulados: un pago anulado deja el gasto entero pendiente y un gasto anulado no cuenta", async () => {
    const { before, after } = await medir("AR", MES, async () => {
      // Gasto vigente con un pago que se anula.
      const a = await gasto({
        concept: "anulado: pago",
        amount: 50000,
        alloc: [[sedes.A, 50000]],
      });
      const res = await pagar(a.id, 20000);
      await payments.voidPayment(
        CTX,
        a.id,
        res.payment.id,
        "Pago mal cargado",
        adminId,
        { country: "AR" },
      );
      // Gasto anulado (sin pagos).
      const b = await gasto({
        concept: "anulado: gasto",
        amount: 30000,
        alloc: [[sedes.B, 30000]],
      });
      await records.void(CTX, b.id, "Gasto duplicado", adminId, {
        country: "AR",
      });
      // Gasto del mes anterior pagado hoy y con ese pago anulado: no mueve el pagado.
      const c = await gasto({
        concept: "anulado: pago de otro mes",
        month: PREV,
        amount: 10000,
        alloc: [[sedes.C, 10000]],
      });
      const resC = await pagar(c.id, 10000);
      await payments.voidPayment(CTX, c.id, resC.payment.id, "Error", adminId, {
        country: "AR",
      });
    });
    // A: el gasto cuenta entero y sin pagar (el pago anulado no existe).
    expect(dif(before, after, String(sedes.A))).toEqual(
      fila(0, 50000, 0, 0, 50000),
    );
    // B: el gasto anulado no mueve nada. C: el pago anulado, tampoco.
    expect(dif(before, after, String(sedes.B))).toEqual(fila(0, 0, 0, 0, 0));
    expect(dif(before, after, String(sedes.C))).toEqual(fila(0, 0, 0, 0, 0));
    expect(dif(before, after, "total")).toEqual(fila(0, 50000, 0, 0, 50000));
  });

  it("España: costo y pagado en euros, sin tipo de cambio y sin Casa Matriz", async () => {
    const { before, after } = await medir("ES", MES_ES, async () => {
      const g = await gasto({
        country: "ES",
        concept: "alquiler España",
        amount: 1000,
        alloc: [[sedes.es, 1000]],
      });
      const res = await pagar(g.id, 400, { country: "ES" });
      expect(res.payment.amountArs).toBeNull();
    });
    // 1000 EUR de costo, 400 pagados ese mes y 600 pendientes.
    expect(dif(before, after, String(sedes.es))).toEqual(
      fila(400, 1000, 0, 400, 600),
    );
    expect(dif(before, after, "total")).toEqual(fila(400, 1000, 0, 400, 600));
    expect(after.columns.map((c) => c.key)).not.toContain("casa_matriz");
  });
});

// ---------------------------------------------------------------------------
// Sedes inactivas e incompletos
// ---------------------------------------------------------------------------

describe("Resumen: sede inactiva con reparto e incompletos", () => {
  it("una sede inactiva con reparto ese mes aparece (inactiva, por nombre, antes de Casa Matriz) y en un mes sin repartos suyos no", async () => {
    const inactiva = await crearSede("I", { country: "AR" });
    sedesExtra.push(inactiva);
    await gasto({
      concept: "reparto a sede que después se cierra",
      amount: 40000,
      alloc: [[inactiva, 40000]],
    });
    await app.db
      .update(schema.branches)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          eq(schema.branches.id, inactiva),
        ),
      );

    const s = await summary.getSummary(CTX, "AR", MES);
    const operativas = await listOperationalBranches(app.db, CTX, "AR");
    const claves = s.columns.map((c) => c.key);
    const col = porClave(s).get(String(inactiva));
    expect(col).toBeDefined();
    expect(col?.isActive).toBe(false);
    expect(col?.name).toBe(`ZZZ-EGR-09 ${sufijo}-I`);
    // 40000 de costo, sin pagos: todo pendiente.
    expect(filaDe(col)).toEqual(fila(0, 40000, 0, 0, 40000));
    // Después de las operativas y antes de Casa Matriz.
    expect(claves.slice(0, operativas.length)).toEqual(
      operativas.map((b) => String(b.id)),
    );
    expect(claves.indexOf(String(inactiva))).toBeGreaterThanOrEqual(
      operativas.length,
    );
    expect(claves.indexOf(String(inactiva))).toBeLessThan(
      claves.indexOf("casa_matriz"),
    );
    expectSumaDeColumnasEsTotal(s);

    // El mes anterior no tiene repartos suyos: no aparece.
    const prev = await summary.getSummary(CTX, "AR", PREV);
    expect(prev.columns.map((c) => c.key)).not.toContain(String(inactiva));
  });

  it("incompletos: un estimado, uno sin links y un USD sin tipo de cambio se cuentan por separado y el último no aporta costo", async () => {
    const { before, after } = await medir("AR", MES, async () => {
      await gasto({
        concept: "incompleto estimado",
        amount: 1000,
        status: "estimado",
        alloc: [[sedes.A, 1000]],
      });
      await gasto({
        concept: "incompleto sin comprobante",
        amount: 2000,
        links: [],
        alloc: [[sedes.A, 2000]],
      });
      await gasto({
        concept: "completo",
        amount: 4000,
        alloc: [[sedes.A, 4000]],
      });
      // La API no permite un USD sin tipo de cambio: se inserta directo.
      const [res] = await app.db.insert(schema.expenseRecords).values(
        tenantValues(CTX, {
          country: "AR",
          concept: `${PREFIJO} incompleto USD sin tipo de cambio`,
          costCenterId: rubros.ar,
          imputationMonth: MES,
          amount: 100,
          currency: "USD",
          amountStatus: "confirmado" as const,
          fxRate: null,
          receiptLinks: LINK,
          createdBy: adminId,
        }),
      );
      const id = Number(res.insertId);
      await app.db.insert(schema.expenseAllocations).values(
        tenantValues(CTX, {
          expenseRecordId: id,
          branchId: sedes.A,
          amount: 100,
        }),
      );
    });
    const d = (k: keyof ExpenseSummary["incomplete"]) =>
      after.incomplete[k] - before.incomplete[k];
    expect(d("estimated")).toBe(1);
    expect(d("missingReceipts")).toBe(1);
    expect(d("missingFxRate")).toBe(1);
    expect(d("total")).toBe(3);
    // Costo de la sede A: 1000 + 2000 + 4000. El USD sin tipo de cambio no aporta.
    expect(dif(before, after, String(sedes.A))).toEqual(
      fila(0, 7000, 1000, 0, 7000),
    );
  });
});

// ---------------------------------------------------------------------------
// Identidades
// ---------------------------------------------------------------------------

describe("Resumen: identidades contra consultas directas", () => {
  async function pagadoDelMes(
    country: ExpenseCountry,
    month: string,
  ): Promise<number> {
    const rows = await app.db
      .select({
        amount: schema.expensePayments.amount,
        amountArs: schema.expensePayments.amountArs,
      })
      .from(schema.expensePayments)
      .innerJoin(
        schema.expenseRecords,
        and(
          eq(schema.expenseRecords.id, schema.expensePayments.expenseRecordId),
          tenantWhere(schema.expenseRecords, CTX),
        ),
      )
      .where(
        and(
          tenantWhere(schema.expensePayments, CTX),
          isNull(schema.expensePayments.voidedAt),
          gte(schema.expensePayments.paidOn, `${month}-01`),
          lt(schema.expensePayments.paidOn, `${shiftMonth(month, 1)}-01`),
          eq(schema.expenseRecords.country, country),
          isNull(schema.expenseRecords.voidedAt),
        ),
      );
    return rows.reduce(
      (acc, p) => acc + (country === "AR" ? (p.amountArs ?? 0) : p.amount),
      0,
    );
  }

  async function costoImputado(
    country: ExpenseCountry,
    month: string,
  ): Promise<number> {
    const rows = await app.db
      .select({
        amount: schema.expenseRecords.amount,
        currency: schema.expenseRecords.currency,
        fxRate: schema.expenseRecords.fxRate,
      })
      .from(schema.expenseRecords)
      .where(
        and(
          tenantWhere(schema.expenseRecords, CTX),
          eq(schema.expenseRecords.country, country),
          eq(schema.expenseRecords.imputationMonth, month),
          isNull(schema.expenseRecords.voidedAt),
        ),
      );
    return rows.reduce(
      (acc, r) =>
        acc +
        (expenseCostInCountryCurrency({
          country,
          currency: r.currency as ExpenseCurrency,
          amount: r.amount,
          fxRate: r.fxRate,
        }) ?? 0),
      0,
    );
  }

  it("AR, mes actual y anterior: Σ columnas = Total, Total.pagado = Σ amount_ars de los pagos vigentes y Total.costo = Σ costos imputados", async () => {
    for (const mes of [MES, PREV]) {
      const s = await summary.getSummary(CTX, "AR", mes);
      const total = porClave(s).get("total");
      expectSumaDeColumnasEsTotal(s);
      expectColumnasCoherentes(s);
      expect(total?.paidInMonth, `pagado de ${mes}`).toBe(
        await pagadoDelMes("AR", mes),
      );
      expect(total?.cost, `costo de ${mes}`).toBe(
        await costoImputado("AR", mes),
      );
    }
    // Con lo sembrado por este archivo, el mes actual tiene movimiento real.
    const s = await summary.getSummary(CTX, "AR", MES);
    expect(porClave(s).get("total")?.cost).toBeGreaterThan(0);
    expect(porClave(s).get("total")?.paidInMonth).toBeGreaterThan(0);
  });

  it("ES: Σ columnas = Total y los totales coinciden con las consultas directas", async () => {
    const s = await summary.getSummary(CTX, "ES", MES_ES);
    const total = porClave(s).get("total");
    expectSumaDeColumnasEsTotal(s);
    expectColumnasCoherentes(s);
    expect(total?.paidInMonth).toBe(await pagadoDelMes("ES", MES_ES));
    expect(total?.cost).toBe(await costoImputado("ES", MES_ES));
    expect(total?.cost).toBeGreaterThanOrEqual(1000);
  });
});

// ---------------------------------------------------------------------------
// Detalle por rubro y concepto
// ---------------------------------------------------------------------------

describe("Detalle por rubro y concepto", () => {
  let nombreX = "";
  let nombreY = "";

  beforeAll(async () => {
    nombreX = `${PREFIJO} X`;
    nombreY = `${PREFIJO} Y`;
    // D1: rubro X, 90000 entre 3 sedes y un pago de 30000.
    const d1 = await gasto({
      concept: "Alquiler",
      rubro: rubros.x,
      amount: 90000,
      alloc: [
        [sedes.A, 30000],
        [sedes.B, 30000],
        [sedes.C, 30000],
      ],
    });
    await pagar(d1.id, 30000);
    // D2: rubro X, 10000 a la sede A, sin pagos.
    await gasto({
      concept: "Luz",
      rubro: rubros.x,
      amount: 10000,
      alloc: [[sedes.A, 10000]],
    });
    // D3: rubro Y del mes anterior, a la sede A, pagado hoy.
    const d3 = await gasto({
      concept: "Seguro",
      rubro: rubros.y,
      month: PREV,
      amount: 5000,
      alloc: [[sedes.A, 5000]],
    });
    await pagar(d3.id, 5000);
    // D4: rubro Y a Casa Matriz, sin pagos.
    await gasto({
      concept: "Matriz",
      rubro: rubros.y,
      amount: 7000,
      alloc: [[null, 7000]],
    });
  });

  /** Solo los grupos de los rubros de este `describe`. */
  function propios(d: ExpenseSummaryDetail) {
    return d.groups.filter(
      (g) => g.costCenterId === rubros.x || g.costCenterId === rubros.y,
    );
  }

  it("sede: agrupa por rubro (por nombre) y concepto, con los pagos de otro mes y los mismos números que su columna", async () => {
    const d = await summary.getDetail(CTX, "AR", MES, sedes.A);
    expect(d.destination).toBe(String(sedes.A));
    expect(d.destinationName).toBe(`ZZZ-EGR-09 ${sufijo}-A`);
    expect(d.currency).toBe("ARS");
    expect(d.month).toBe(MES);

    const [gx, gy] = propios(d);
    expect(gx.costCenterName).toBe(nombreX);
    expect(gy.costCenterName).toBe(nombreY);
    // Rubro X en A: Alquiler (30000, pendiente 20000, pagado 10000) y Luz (10000, pendiente 10000).
    expect(gx.concepts.map((c) => c.concept)).toEqual([
      `${PREFIJO} Alquiler`,
      `${PREFIJO} Luz`,
    ]);
    expect(gx.concepts[0]).toMatchObject({
      cost: 30000,
      pending: 20000,
      paidInMonth: 10000,
      estimated: false,
      imputationMonth: MES,
    });
    expect(gx.concepts[1]).toMatchObject({
      cost: 10000,
      pending: 10000,
      paidInMonth: 0,
    });
    expect(gx).toMatchObject({
      cost: 40000,
      pending: 30000,
      paidInMonth: 10000,
    });
    // Rubro Y en A: el Seguro es del mes anterior, pagado este mes (solo pagado).
    expect(gy.concepts).toHaveLength(1);
    expect(gy.concepts[0]).toMatchObject({
      concept: `${PREFIJO} Seguro`,
      imputationMonth: PREV,
      cost: 0,
      pending: 0,
      paidInMonth: 5000,
    });
    expect(gy).toMatchObject({ cost: 0, pending: 0, paidInMonth: 5000 });

    // Los números del detalle completo coinciden con la columna del resumen.
    const s = await summary.getSummary(CTX, "AR", MES);
    const col = porClave(s).get(String(sedes.A));
    expect(sumasDelDetalle(d)).toEqual({
      cost: col?.cost,
      pending: col?.pending,
      paidInMonth: col?.paidInMonth,
    });
  });

  it("sede sin parte en un rubro: ese rubro no aparece", async () => {
    const d = await summary.getDetail(CTX, "AR", MES, sedes.B);
    const grupos = propios(d);
    expect(grupos.map((g) => g.costCenterName)).toEqual([nombreX]);
    // B solo tiene su tercio del Alquiler.
    expect(grupos[0].concepts).toHaveLength(1);
    expect(grupos[0].concepts[0]).toMatchObject({
      cost: 30000,
      pending: 20000,
      paidInMonth: 10000,
    });
  });

  it("Casa Matriz: solo sus filas y los mismos números que su columna", async () => {
    const d = await summary.getDetail(CTX, "AR", MES, "casa_matriz");
    expect(d.destination).toBe("casa_matriz");
    expect(d.destinationName).toBe("Casa Matriz");
    const grupos = propios(d);
    expect(grupos.map((g) => g.costCenterName)).toEqual([nombreY]);
    expect(grupos[0].concepts).toHaveLength(1);
    expect(grupos[0].concepts[0]).toMatchObject({
      concept: `${PREFIJO} Matriz`,
      cost: 7000,
      pending: 7000,
      paidInMonth: 0,
    });

    const s = await summary.getSummary(CTX, "AR", MES);
    const col = porClave(s).get("casa_matriz");
    expect(sumasDelDetalle(d)).toEqual({
      cost: col?.cost,
      pending: col?.pending,
      paidInMonth: col?.paidInMonth,
    });
  });

  it("total: suma todos los destinos de cada gasto y coincide con la columna Total", async () => {
    const d = await summary.getDetail(CTX, "AR", MES, "total");
    expect(d.destination).toBe("total");
    expect(d.destinationName).toBe("Total");
    const [gx, gy] = propios(d);
    // X: Alquiler 90000 (pendiente 60000, pagado 30000) + Luz 10000 (pendiente 10000).
    expect(gx.concepts[0]).toMatchObject({
      concept: `${PREFIJO} Alquiler`,
      cost: 90000,
      pending: 60000,
      paidInMonth: 30000,
    });
    expect(gx).toMatchObject({
      cost: 100000,
      pending: 70000,
      paidInMonth: 30000,
    });
    // Y: Seguro (solo pagado 5000) y Matriz (7000 pendientes).
    expect(gy.concepts.map((c) => c.concept)).toEqual([
      `${PREFIJO} Matriz`,
      `${PREFIJO} Seguro`,
    ]);
    expect(gy).toMatchObject({ cost: 7000, pending: 7000, paidInMonth: 5000 });

    const s = await summary.getSummary(CTX, "AR", MES);
    const col = porClave(s).get("total");
    expect(sumasDelDetalle(d)).toEqual({
      cost: col?.cost,
      pending: col?.pending,
      paidInMonth: col?.paidInMonth,
    });
  });

  it("sede de España en Argentina, Casa Matriz en España y sede de otro gimnasio dan 404; un destino sin movimiento da vacío", async () => {
    expect(
      await falla(NotFoundError, () =>
        summary.getDetail(CTX, "AR", MES, sedes.es),
      ),
    ).toBe("Destino no encontrado");
    expect(
      await falla(NotFoundError, () =>
        summary.getDetail(CTX, "ES", MES_ES, "casa_matriz"),
      ),
    ).toBe("Destino no encontrado");
    expect(
      await falla(NotFoundError, () =>
        summary.getDetail(CTX, "AR", MES, 987654321),
      ),
    ).toBe("Destino no encontrado");
    // Otro gimnasio: ni la sede de El Templo ni su contenido existen para él.
    await falla(NotFoundError, () =>
      summary.getDetail(CTX_DOS, "AR", MES, sedes.A),
    );
    // Una sede de El Templo sin repartos en un mes lejano: detalle vacío, no 404.
    const vacio = await summary.getDetail(CTX, "AR", "2020-02", sedes.A);
    expect(vacio.groups).toEqual([]);
    expect(vacio.destination).toBe(String(sedes.A));
  });

  it("España: el detalle de su sede agrupa por su rubro y trae el gasto de España", async () => {
    const d = await summary.getDetail(CTX, "ES", MES_ES, sedes.es);
    expect(d.currency).toBe("EUR");
    const grupo = d.groups.find((g) => g.costCenterId === rubros.es);
    expect(grupo).toBeDefined();
    expect(grupo?.concepts[0]).toMatchObject({
      concept: `${PREFIJO} alquiler España`,
      cost: 1000,
      pending: 600,
      paidInMonth: 400,
    });
  });
});

// ---------------------------------------------------------------------------
// Tenancy y datos corruptos
// ---------------------------------------------------------------------------

describe("Resumen: aislamiento y errores visibles", () => {
  it("otro gimnasio no ve las sedes ni los importes de El Templo", async () => {
    const s = await summary.getSummary(CTX_DOS, "AR", MES);
    const claves = s.columns.map((c) => c.key);
    for (const sede of [sedes.A, sedes.B, sedes.C]) {
      expect(claves).not.toContain(String(sede));
    }
    const mio = await summary.getSummary(CTX, "AR", MES);
    const totalDos = porClave(s).get("total");
    const totalMio = porClave(mio).get("total");
    expect(totalDos?.cost).toBeLessThan(totalMio?.cost ?? 0);
    expectSumaDeColumnasEsTotal(s);
  });

  it("un gasto sin reparto es un error visible y no un número mal", async () => {
    const [res] = await app.db.insert(schema.expenseRecords).values(
      tenantValues(CTX, {
        country: "AR",
        concept: `${PREFIJO} gasto corrupto sin reparto`,
        costCenterId: rubros.ar,
        imputationMonth: MES,
        amount: 500,
        currency: "ARS",
        amountStatus: "confirmado" as const,
        receiptLinks: LINK,
        createdBy: adminId,
      }),
    );
    const id = Number(res.insertId);
    let mensaje = "";
    try {
      await summary.getSummary(CTX, "AR", MES);
    } catch (err: unknown) {
      mensaje = err instanceof Error ? err.message : String(err);
    } finally {
      // Se borra enseguida para no envenenar el resto del mes.
      await app.db
        .delete(schema.expenseRecords)
        .where(
          and(
            tenantWhere(schema.expenseRecords, CTX),
            eq(schema.expenseRecords.id, id),
          ),
        );
    }
    expect(mensaje).toBe(`El gasto ${id} no tiene reparto`);
  });
});
