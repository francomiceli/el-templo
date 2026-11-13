/**
 * Fase 209 Plan 17 (DI-02, DI-03, DI-11, DI-12, DI-18, DI-19): identidades del
 * Resumen de Egresos y casos del pedido de administración, de punta a punta por
 * las rutas HTTP reales.
 *
 * Un solo escenario encadenado (los `it` comparten estado y corren en orden):
 *   1. foto inicial del Resumen (mes actual M y anterior M-1) y de cobros
 *   2. factura de M-1 pagada hoy: costo en M-1, pagado en M
 *   3. $150.000 en partes iguales entre las sedes operativas de Argentina,
 *      pagado por débito automático (el esperado se calcula con `splitEvenly`
 *      sobre las sedes que devuelve la API)
 *   4. $150.000 a Casa Matriz pagado desde dos cuentas ($90.000 un banco y
 *      $60.000 la Caja central)
 *   5. factura de USD 600 con TC 1.560 en partes iguales ($936.000 de costo),
 *      pagada en parte desde un banco en pesos, y un pago que no divide parejo
 *   6. identidades en M y en M-1, detalle por rubro y Excel contra la columna Total
 *   7. anular un pago y anular un gasto los saca de todos los totales
 *   8. los cobros (`/transactions/summary`) quedan idénticos a la foto inicial
 *
 * El Resumen suma todo el gimnasio: lo que se afirma son DIFERENCIAS contra la
 * foto previa a cada paso, y las identidades valen siempre. Los importes que
 * dependen de cuántas sedes operativas hay se calculan con `splitEvenly`.
 *
 * Corre contra la DB de test por worker. Todo lo que crea el archivo (sedes,
 * rubro, cuentas, gastos, pagos, ledger y audit) se borra en `afterAll`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { Workbook } from "exceljs";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import { splitEvenly } from "../../src/modules/finance/expense-math";
import type {
  ExpenseFormOptions,
  ExpenseSummary,
  ExpenseSummaryColumn,
  ExpenseSummaryDetail,
} from "../../src/modules/finance/expense-types";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const BASE = "/api/admin/finance/expense-records";
const FINANCE = "/api/admin/finance";
const suf = `${Date.now() % 1_000_000}`;

/** Apertura conocida de las cuentas propias: los saldos se afirman como literales. */
const APERTURA_BANCO = 2000000;
const APERTURA_CENTRAL = 100000;

/**
 * Caso del brief en dólares: USD 600 con partes de USD 100 (el reparto es en
 * partes iguales, así que la cantidad de destinos sale de la división).
 */
const USD_TOTAL = 600;
const USD_POR_PARTE = 100;
const PARTES_USD = USD_TOTAL / USD_POR_PARTE;
const TC = 1560;

const MEDIDAS = [
  "paidInMonth",
  "cost",
  "costEstimated",
  "costPaid",
  "pending",
] as const;
type Medida = (typeof MEDIDAS)[number];

interface RecordBody {
  record: {
    id: number;
    status: string;
    paid: number;
    pending: number;
    payments: Array<{
      id: number;
      appliedAmount: number;
      amountArs: number | null;
      voidedAt: string | null;
    }>;
  };
  payment?: { id: number; appliedAmount: number; amountArs: number | null };
}

interface Foto {
  mes: ExpenseSummary;
  anterior: ExpenseSummary;
}

let app: FastifyInstance;
let ownerToken: string;
let rubroId = 0;
let bancoId = 0;
let centralId = 0;
let hoy = "";
let mesActual = "";
let mesAnterior = "";
const sedesPropias: number[] = [];
/** Sedes operativas de Argentina, tal cual las devuelve `form-options` (orden de la API). */
let destinosSedes: Array<{ branchId: number; name: string }> = [];

/** Estado compartido entre los `it`. */
const estado = {
  fotoInicial: null as Foto | null,
  cobrosInicial: null as unknown,
  gastoDosCuentasId: 0,
  pagoCentralId: 0,
};

function authed() {
  return { authorization: `Bearer ${ownerToken}` };
}

async function get(url: string) {
  return app.inject({ method: "GET", url, headers: authed() });
}

async function post(url: string, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url, headers: authed(), payload });
}

function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

function restarUnMes(mes: string): string {
  const [anio, nro] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(anio, nro - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Primer día del mes siguiente (para rangos de fechas sin inventar el 31). */
function inicioDelMesSiguiente(mes: string): string {
  const [anio, nro] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(anio, nro, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function resumenDe(mes: string): Promise<ExpenseSummary> {
  const res = await get(`${BASE}/summary?month=${mes}&country=AR`);
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as ExpenseSummary;
}

async function detalleDe(
  mes: string,
  destino: string,
): Promise<ExpenseSummaryDetail> {
  const res = await get(
    `${BASE}/summary/detail?month=${mes}&destination=${destino}&country=AR`,
  );
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as ExpenseSummaryDetail;
}

async function excelDe(mes: string): Promise<Workbook> {
  const res = await get(`${BASE}/summary/export?month=${mes}&country=AR`);
  expect(res.statusCode, res.body).toBe(200);
  const wb = new Workbook();
  // `res.rawPayload` es un Buffer de Node; el tipo que exceljs empaqueta no es
  // el mismo nominal (ver expense-summary-rutas).
  await wb.xlsx.load(
    res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0],
  );
  return wb;
}

async function foto(): Promise<Foto> {
  return {
    mes: await resumenDe(mesActual),
    anterior: await resumenDe(mesAnterior),
  };
}

function columnaDe(
  resumen: ExpenseSummary,
  key: string,
): ExpenseSummaryColumn | undefined {
  return resumen.columns.find((c) => c.key === key);
}

/** Valor de una medida de una columna (0 si la columna no existe en esa foto). */
function valor(resumen: ExpenseSummary, key: string, medida: Medida): number {
  return columnaDe(resumen, key)?.[medida] ?? 0;
}

/** Diferencia de una medida de una columna entre dos fotos del mismo mes. */
function delta(
  despues: ExpenseSummary,
  antes: ExpenseSummary,
  key: string,
  medida: Medida,
): number {
  return valor(despues, key, medida) - valor(antes, key, medida);
}

async function altaGasto(
  payload: Record<string, unknown>,
): Promise<RecordBody["record"]> {
  const res = await post(`${BASE}?country=AR`, {
    costCenterId: rubroId,
    currency: "ARS",
    amountStatus: "confirmado",
    ...payload,
  });
  expect(res.statusCode, res.body).toBe(201);
  return (JSON.parse(res.body) as RecordBody).record;
}

async function pagar(
  recordId: number,
  cashRegisterId: number,
  paymentMethod: string,
  amount: number,
  extra: Record<string, unknown> = {},
): Promise<RecordBody> {
  const res = await post(`${BASE}/${recordId}/payments?country=AR`, {
    paidOn: hoy,
    cashRegisterId,
    paymentMethod,
    amount,
    ...extra,
  });
  expect(res.statusCode, res.body).toBe(201);
  return JSON.parse(res.body) as RecordBody;
}

async function saldoDe(cuentaId: number): Promise<number | null> {
  const res = await get(`${FINANCE}/cash-registers/balances`);
  expect(res.statusCode, res.body).toBe(200);
  const filas = JSON.parse(res.body) as Array<{
    cashRegisterId: number;
    firmeBalance: number;
  }>;
  const fila = filas.find((f) => f.cashRegisterId === cuentaId);
  return fila === undefined ? null : fila.firmeBalance;
}

/** Σ del costo en pesos de los gastos no anulados imputados al mes (consulta directa). */
async function costoDirecto(
  mes: string,
): Promise<{ cost: number; estimated: number }> {
  const filas = await app.db
    .select({
      amount: schema.expenseRecords.amount,
      currency: schema.expenseRecords.currency,
      fxRate: schema.expenseRecords.fxRate,
      amountStatus: schema.expenseRecords.amountStatus,
    })
    .from(schema.expenseRecords)
    .where(
      and(
        tenantWhere(schema.expenseRecords, CTX),
        eq(schema.expenseRecords.country, "AR"),
        eq(schema.expenseRecords.imputationMonth, mes),
        isNull(schema.expenseRecords.voidedAt),
      ),
    );
  let cost = 0;
  let estimated = 0;
  for (const f of filas) {
    let enPesos = 0;
    if (f.currency === "USD") {
      // USD × su tipo de cambio, redondeado. Sin tipo de cambio no aporta costo.
      if (f.fxRate === null) continue;
      enPesos = Math.round(f.amount * Number(f.fxRate));
    } else {
      enPesos = f.amount;
    }
    cost += enPesos;
    if (f.amountStatus === "estimado") estimated += enPesos;
  }
  return { cost, estimated };
}

/** Σ amount_ars de los pagos vigentes del mes de gastos vigentes de Argentina (consulta directa). */
async function pagadoDirecto(mes: string): Promise<number> {
  const filas = await app.db
    .select({ amountArs: schema.expensePayments.amountArs })
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
        isNull(schema.expenseRecords.voidedAt),
        eq(schema.expenseRecords.country, "AR"),
        gte(schema.expensePayments.paidOn, `${mes}-01`),
        lt(schema.expensePayments.paidOn, inicioDelMesSiguiente(mes)),
      ),
    );
  return filas.reduce((suma, f) => suma + (f.amountArs ?? 0), 0);
}

/** Las identidades del Resumen de un mes. Devuelve el Resumen leído. */
async function verificarIdentidades(mes: string): Promise<ExpenseSummary> {
  const resumen = await resumenDe(mes);
  const total = columnaDe(resumen, "total");
  expect(total, `${mes}: falta la columna Total`).toBeDefined();
  if (total === undefined) return resumen;
  expect(resumen.columns[resumen.columns.length - 1].key).toBe("total");

  // Σ columnas sin Total = Total, en las 5 medidas.
  const destinos = resumen.columns.filter((c) => c.key !== "total");
  for (const medida of MEDIDAS) {
    const suma = destinos.reduce((s, c) => s + c[medida], 0);
    expect(suma, `${mes}: Σ destinos de ${medida} = Total`).toBe(total[medida]);
  }
  // En cada columna: costo = pagado de ese costo + pendiente; nada negativo.
  for (const c of resumen.columns) {
    expect(c.cost, `${mes} ${c.name}: costo = pagado + pendiente`).toBe(
      c.costPaid + c.pending,
    );
    expect(
      c.costEstimated,
      `${mes} ${c.name}: estimado <= costo`,
    ).toBeLessThanOrEqual(c.cost);
    for (const medida of MEDIDAS) {
      expect(c[medida], `${mes} ${c.name} ${medida}`).toBeGreaterThanOrEqual(0);
    }
  }
  // Contra consultas directas a la DB.
  const directo = await costoDirecto(mes);
  expect(total.cost, `${mes}: Σ gastos imputados`).toBe(directo.cost);
  expect(total.costEstimated, `${mes}: Σ estimados imputados`).toBe(
    directo.estimated,
  );
  expect(total.paidInMonth, `${mes}: Σ pagos vigentes del mes`).toBe(
    await pagadoDirecto(mes),
  );
  return resumen;
}

/** El detalle `total` y el Excel de un mes coinciden con la columna Total del JSON. */
async function verificarDetalleYExcel(mes: string): Promise<void> {
  const resumen = await resumenDe(mes);
  const total = columnaDe(resumen, "total");
  expect(total).toBeDefined();
  if (total === undefined) return;

  const detalle = await detalleDe(mes, "total");
  const costo = detalle.groups.reduce((s, g) => s + g.cost, 0);
  const pendiente = detalle.groups.reduce((s, g) => s + g.pending, 0);
  const pagado = detalle.groups.reduce((s, g) => s + g.paidInMonth, 0);
  expect(costo, `${mes}: Σ grupos del detalle, costo`).toBe(total.cost);
  expect(pendiente, `${mes}: Σ grupos del detalle, pendiente`).toBe(
    total.pending,
  );
  expect(pagado, `${mes}: Σ grupos del detalle, pagado`).toBe(
    total.paidInMonth,
  );
  for (const g of detalle.groups) {
    expect(g.concepts.reduce((s, c) => s + c.cost, 0)).toBe(g.cost);
    expect(g.concepts.reduce((s, c) => s + c.pending, 0)).toBe(g.pending);
    expect(g.concepts.reduce((s, c) => s + c.paidInMonth, 0)).toBe(
      g.paidInMonth,
    );
  }

  const wb = await excelDe(mes);
  const hoja = wb.getWorksheet("Resumen");
  expect(hoja, "el Excel trae la hoja Resumen").toBeDefined();
  // Encabezado en la fila 1 y una fila por columna del JSON (la última es el Total).
  const fila = hoja?.getRow(resumen.columns.length + 1);
  expect(fila?.getCell(1).value).toBe("Total");
  const enExcel = [2, 3, 4, 5, 6].map((i) => fila?.getCell(i).value);
  expect(enExcel).toEqual([
    total.paidInMonth,
    total.cost,
    total.costEstimated,
    total.costPaid,
    total.pending,
  ]);
}

async function crearSede(indice: number): Promise<number> {
  const [fila] = await app.db.insert(schema.branches).values(
    tenantValues(CTX, {
      name: `ZZZ-EGR-17 ${suf}-S${indice}`,
      code: `E17${suf}${indice}`.slice(0, 20),
      country: "AR",
    }),
  );
  const id = Number(fila.insertId);
  sedesPropias.push(id);
  return id;
}

async function opcionesDelFormulario(): Promise<ExpenseFormOptions> {
  const res = await get(`${BASE}/form-options?country=AR`);
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as ExpenseFormOptions;
}

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es OWNER (test/setup.ts).
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  // Dos sedes propias (las usan los casos directos) y, si hacen falta, las que
  // falten para repartir el caso en dólares entre las partes del brief.
  await crearSede(1);
  await crearSede(2);
  let opciones = await opcionesDelFormulario();
  let operativas = opciones.destinations.filter((d) => d.branchId !== null);
  for (let i = 3; operativas.length < PARTES_USD; i += 1) {
    await crearSede(i);
    opciones = await opcionesDelFormulario();
    operativas = opciones.destinations.filter((d) => d.branchId !== null);
  }
  destinosSedes = operativas.map((d) => ({
    branchId: d.branchId as number,
    name: d.name,
  }));
  hoy = opciones.today;
  mesActual = mesDe(hoy);
  mesAnterior = restarUnMes(mesActual);

  const [rubro] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(CTX, { name: `EGR-17 rubro ${suf}`, country: "AR" }));
  rubroId = Number(rubro.insertId);

  const [banco] = await app.db.insert(schema.cashRegisters).values(
    tenantValues(CTX, {
      name: `EGR-17 banco ${suf}`,
      type: "banco" as const,
      branchId: null,
      currency: "ARS",
      bankName: "Banco Test",
      accountHolder: "Test",
      accountAlias: `egr17.${suf}`,
      openingBalance: APERTURA_BANCO,
      cutoffDate: "2020-01-01",
    }),
  );
  bancoId = Number(banco.insertId);
  // Caja central: efectivo sin sede.
  const [central] = await app.db.insert(schema.cashRegisters).values(
    tenantValues(CTX, {
      name: `EGR-17 Caja central ${suf}`,
      type: "efectivo" as const,
      branchId: null,
      currency: "ARS",
      openingBalance: APERTURA_CENTRAL,
      cutoffDate: "2020-01-01",
    }),
  );
  centralId = Number(central.insertId);
});

afterAll(async () => {
  // Orden: pagos → ledger de las cuentas → audit del ledger → reparto → gastos →
  // audit de gastos → cuentas → rubro → sedes.
  const propios = await app.db
    .select({ id: schema.expenseRecords.id })
    .from(schema.expenseRecords)
    .where(
      and(
        tenantWhere(schema.expenseRecords, CTX),
        eq(schema.expenseRecords.costCenterId, rubroId),
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
        inArray(schema.financialTransactions.cashRegisterId, [
          bancoId,
          centralId,
        ]),
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
        inArray(schema.cashRegisters.id, [bancoId, centralId]),
      ),
    );
  await app.db
    .delete(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, CTX),
        eq(schema.costCenters.id, rubroId),
      ),
    );
  if (sedesPropias.length > 0) {
    await app.db
      .delete(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          inArray(schema.branches.id, sedesPropias),
        ),
      );
  }
  await app.close();
});

// ═══════════════════════════════════════════════════════════════════════════

describe("Egresos: identidades del Resumen y casos del pedido (HTTP)", () => {
  it("foto inicial: Resumen del mes actual y del anterior, y cobros del mes", async () => {
    const f = await foto();
    estado.fotoInicial = f;
    for (const resumen of [f.mes, f.anterior]) {
      expect(resumen.country).toBe("AR");
      expect(resumen.currency).toBe("ARS");
      expect(resumen.columns[resumen.columns.length - 1].key).toBe("total");
    }
    expect(f.mes.month).toBe(mesActual);
    expect(f.anterior.month).toBe(mesAnterior);
    // Las sedes propias son destinos operativos y la API las devuelve en el formulario.
    for (const id of sedesPropias) {
      expect(destinosSedes.map((d) => d.branchId)).toContain(id);
    }
    expect(destinosSedes.length).toBeGreaterThanOrEqual(PARTES_USD);

    const cobros = await get(`${FINANCE}/transactions/summary?country=AR`);
    expect(cobros.statusCode, cobros.body).toBe(200);
    estado.cobrosInicial = JSON.parse(cobros.body);

    // Saldos de partida de las cuentas propias.
    expect(await saldoDe(bancoId)).toBe(2000000); // apertura del banco
    expect(await saldoDe(centralId)).toBe(100000); // apertura de la Caja central
  });

  it("(a) factura de M-1 pagada en M: está en el costo de M-1 y en lo pagado de M", async () => {
    const sede = sedesPropias[0];
    const antes = await foto();

    const gasto = await altaGasto({
      concept: `EGR-17 factura del mes anterior ${suf}`,
      imputationMonth: mesAnterior,
      amount: 200000,
      allocations: [{ branchId: sede, amount: 200000 }],
    });
    expect(gasto.status).toBe("pendiente");
    const pago = await pagar(gasto.id, bancoId, "transfer", 200000);
    expect(pago.record.status).toBe("pagado");
    expect(pago.record.pending).toBe(0);

    const despues = await foto();
    const key = String(sede);

    // Resumen de M-1: el costo de la sede sube 200000 y lo pagado EN ESE MES no se mueve.
    expect(delta(despues.anterior, antes.anterior, key, "cost")).toBe(200000);
    expect(delta(despues.anterior, antes.anterior, key, "costPaid")).toBe(
      200000,
    );
    expect(delta(despues.anterior, antes.anterior, key, "pending")).toBe(0);
    expect(delta(despues.anterior, antes.anterior, key, "paidInMonth")).toBe(0);
    expect(delta(despues.anterior, antes.anterior, "total", "cost")).toBe(
      200000,
    );
    expect(
      delta(despues.anterior, antes.anterior, "total", "paidInMonth"),
    ).toBe(0);

    // Resumen de M: lo pagado de la sede sube 200000 y el costo de M no se mueve.
    expect(delta(despues.mes, antes.mes, key, "paidInMonth")).toBe(200000);
    expect(delta(despues.mes, antes.mes, key, "cost")).toBe(0);
    expect(delta(despues.mes, antes.mes, key, "pending")).toBe(0);
    expect(delta(despues.mes, antes.mes, "total", "paidInMonth")).toBe(200000);
    expect(delta(despues.mes, antes.mes, "total", "cost")).toBe(0);

    expect(await saldoDe(bancoId)).toBe(1800000); // 2000000 − 200000
  });

  it("(b) $150.000 en partes iguales entre las sedes de Argentina, pagado por débito automático", async () => {
    const antes = await foto();
    const n = destinosSedes.length; // cuántas sedes operativas hay lo dice la API
    // Partes: floor(150000 / n) para todas y el resto a la última.
    const partes = splitEvenly(150000, n);
    expect(partes.reduce((s, p) => s + p, 0)).toBe(150000);

    const gasto = await altaGasto({
      concept: `EGR-17 Contabilium ${suf}`,
      beneficiary: "Contabilium",
      imputationMonth: mesActual,
      amount: 150000,
      allocations: destinosSedes.map((d, i) => ({
        branchId: d.branchId,
        amount: partes[i],
      })),
    });
    const pago = await pagar(gasto.id, bancoId, "direct_debit", 150000);
    expect(pago.record.status).toBe("pagado");

    const despues = await foto();
    destinosSedes.forEach((d, i) => {
      const key = String(d.branchId);
      expect(delta(despues.mes, antes.mes, key, "cost"), d.name).toBe(
        partes[i],
      );
      expect(delta(despues.mes, antes.mes, key, "paidInMonth"), d.name).toBe(
        partes[i],
      );
      expect(delta(despues.mes, antes.mes, key, "costPaid"), d.name).toBe(
        partes[i],
      );
      expect(delta(despues.mes, antes.mes, key, "pending"), d.name).toBe(0);
    });
    // Casa Matriz no recibe nada y el Total sube exactamente 150000.
    expect(delta(despues.mes, antes.mes, "casa_matriz", "cost")).toBe(0);
    expect(delta(despues.mes, antes.mes, "total", "cost")).toBe(150000);
    expect(delta(despues.mes, antes.mes, "total", "paidInMonth")).toBe(150000);
    expect(delta(despues.mes, antes.mes, "total", "pending")).toBe(0);

    expect(await saldoDe(bancoId)).toBe(1650000); // 1800000 − 150000
  });

  it("(c) $150.000 pagado desde dos cuentas: $90.000 del banco y $60.000 de la Caja central", async () => {
    const antes = await foto();
    const gasto = await altaGasto({
      concept: `EGR-17 gasto de Casa Matriz ${suf}`,
      imputationMonth: mesActual,
      amount: 150000,
      allocations: [{ branchId: null, amount: 150000 }],
    });
    estado.gastoDosCuentasId = gasto.id;

    const primero = await pagar(gasto.id, bancoId, "transfer", 90000);
    expect(primero.record.status).toBe("parcial");
    expect(primero.record.paid).toBe(90000);
    expect(primero.record.pending).toBe(60000); // 150000 − 90000

    const segundo = await pagar(gasto.id, centralId, "cash", 60000);
    expect(segundo.record.status).toBe("pagado");
    expect(segundo.record.paid).toBe(150000); // 90000 + 60000
    expect(segundo.record.pending).toBe(0);
    estado.pagoCentralId = segundo.payment?.id ?? 0;
    expect(estado.pagoCentralId).toBeGreaterThan(0);

    // Saldos exactos de las dos cuentas.
    expect(await saldoDe(bancoId)).toBe(1560000); // 1650000 − 90000
    expect(await saldoDe(centralId)).toBe(40000); // 100000 − 60000

    const despues = await foto();
    expect(delta(despues.mes, antes.mes, "casa_matriz", "cost")).toBe(150000);
    expect(delta(despues.mes, antes.mes, "casa_matriz", "paidInMonth")).toBe(
      150000,
    );
    expect(delta(despues.mes, antes.mes, "casa_matriz", "pending")).toBe(0);
    // Ninguna sede se mueve.
    for (const d of destinosSedes) {
      expect(delta(despues.mes, antes.mes, String(d.branchId), "cost")).toBe(0);
    }
  });

  it("(d) factura de USD 600 con TC 1.560 en partes iguales: $936.000 de costo y $156.000 por sede", async () => {
    const antes = await foto();
    const sedes = destinosSedes.slice(0, PARTES_USD);
    const partes = splitEvenly(USD_TOTAL, PARTES_USD);
    expect(partes).toEqual(new Array<number>(PARTES_USD).fill(USD_POR_PARTE));

    const gasto = await altaGasto({
      concept: `EGR-17 factura en dólares ${suf}`,
      imputationMonth: mesActual,
      amount: USD_TOTAL,
      currency: "USD",
      fxRate: TC,
      allocations: sedes.map((d, i) => ({
        branchId: d.branchId,
        amount: partes[i],
      })),
    });

    const sinPagos = await foto();
    for (const d of sedes) {
      const key = String(d.branchId);
      expect(delta(sinPagos.mes, antes.mes, key, "cost"), d.name).toBe(156000); // 100 × 1560
      expect(delta(sinPagos.mes, antes.mes, key, "pending"), d.name).toBe(
        156000,
      );
      expect(delta(sinPagos.mes, antes.mes, key, "paidInMonth"), d.name).toBe(
        0,
      );
    }
    expect(delta(sinPagos.mes, antes.mes, "total", "cost")).toBe(936000); // 600 × 1560
    expect(delta(sinPagos.mes, antes.mes, "total", "pending")).toBe(936000);

    // Pago desde un banco en pesos: $468.000 a TC 1.560 cancelan USD 300 (la mitad).
    const pago = await pagar(gasto.id, bancoId, "transfer", 468000, {
      fxRate: TC,
    });
    expect(pago.payment?.appliedAmount).toBe(300); // 468000 / 1560
    expect(pago.payment?.amountArs).toBe(468000);
    expect(pago.record.paid).toBe(300);
    expect(pago.record.pending).toBe(300); // 600 − 300
    expect(pago.record.status).toBe("parcial");

    const despues = await foto();
    for (const d of sedes) {
      const key = String(d.branchId);
      // Cada parte lleva la sexta parte del pago de 468000 y de lo que falta.
      expect(delta(despues.mes, antes.mes, key, "paidInMonth"), d.name).toBe(
        78000,
      );
      expect(delta(despues.mes, antes.mes, key, "pending"), d.name).toBe(78000);
      expect(delta(despues.mes, antes.mes, key, "costPaid"), d.name).toBe(
        78000,
      );
      expect(delta(despues.mes, antes.mes, key, "cost"), d.name).toBe(156000);
    }
    expect(delta(despues.mes, antes.mes, "total", "paidInMonth")).toBe(468000);
    expect(delta(despues.mes, antes.mes, "total", "pending")).toBe(468000); // 936000 − 468000
    expect(delta(despues.mes, antes.mes, "total", "cost")).toBe(936000);

    expect(await saldoDe(bancoId)).toBe(1092000); // 1560000 − 468000

    // Segundo pago que no divide parejo: $100.001 a TC 1.560 cancelan USD 64.
    const antesImpar = await foto();
    const impar = await pagar(gasto.id, bancoId, "transfer", 100001, {
      fxRate: TC,
    });
    expect(impar.payment?.appliedAmount).toBe(64); // round(100001 / 1560) = round(64,10)
    expect(impar.record.paid).toBe(364); // 300 + 64
    expect(impar.record.pending).toBe(236); // 600 − 364

    const despuesImpar = await foto();
    expect(
      delta(despuesImpar.mes, antesImpar.mes, "total", "paidInMonth"),
    ).toBe(100001);
    // Lo que falta baja USD 64 × 1560.
    expect(delta(despuesImpar.mes, antesImpar.mes, "total", "pending")).toBe(
      -99840,
    );
    // Las partes suman exacto el pago aunque no dividan parejo.
    const sumaPartes = sedes.reduce(
      (s, d) =>
        s +
        delta(
          despuesImpar.mes,
          antesImpar.mes,
          String(d.branchId),
          "paidInMonth",
        ),
      0,
    );
    expect(sumaPartes).toBe(100001);
    for (const d of sedes) {
      const parte = delta(
        despuesImpar.mes,
        antesImpar.mes,
        String(d.branchId),
        "paidInMonth",
      );
      expect(parte).toBeGreaterThanOrEqual(16666); // floor(100001 / partes)
      expect(parte).toBeLessThanOrEqual(16671); // a lo sumo con todo el resto
    }
    expect(await saldoDe(bancoId)).toBe(991999); // 1092000 − 100001
  });

  it("las identidades valen en el mes actual y en el anterior", async () => {
    await verificarIdentidades(mesActual);
    await verificarIdentidades(mesAnterior);
  });

  it("el detalle total y el Excel coinciden con la columna Total del mes", async () => {
    await verificarDetalleYExcel(mesActual);
  });

  it("anular un pago lo saca de los totales: la Caja central recupera su saldo y el gasto queda parcial", async () => {
    const antes = await foto();
    expect(await saldoDe(centralId)).toBe(40000);

    const res = await post(
      `${BASE}/${estado.gastoDosCuentasId}/payments/${estado.pagoCentralId}/void?country=AR`,
      { reason: "se pagó desde la cuenta equivocada" },
    );
    expect(res.statusCode, res.body).toBe(200);
    const record = (JSON.parse(res.body) as RecordBody).record;
    expect(record.status).toBe("parcial");
    expect(record.paid).toBe(90000); // 150000 − 60000
    expect(record.pending).toBe(60000);
    const anulado = record.payments.find((p) => p.id === estado.pagoCentralId);
    expect(anulado?.voidedAt).not.toBeNull();

    expect(await saldoDe(centralId)).toBe(100000); // vuelve la apertura exacta
    expect(await saldoDe(bancoId)).toBe(991999); // el banco no se movió

    const despues = await foto();
    expect(delta(despues.mes, antes.mes, "casa_matriz", "paidInMonth")).toBe(
      -60000,
    );
    expect(delta(despues.mes, antes.mes, "casa_matriz", "pending")).toBe(60000);
    expect(delta(despues.mes, antes.mes, "casa_matriz", "cost")).toBe(0);
    expect(delta(despues.mes, antes.mes, "total", "paidInMonth")).toBe(-60000);

    await verificarIdentidades(mesActual);
    await verificarIdentidades(mesAnterior);
    await verificarDetalleYExcel(mesActual);
  });

  it("anular un gasto lo saca de los totales y de los estimados", async () => {
    const dos = sedesPropias.slice(0, 2);
    const antes = await foto();
    const partes = splitEvenly(77571, 2); // [38785, 38786]
    expect(partes).toEqual([38785, 38786]);

    const concepto = `EGR-17 estimado ${suf}`;
    const gasto = await altaGasto({
      concept: concepto,
      imputationMonth: mesActual,
      amount: 77571,
      amountStatus: "estimado",
      allocations: dos.map((id, i) => ({ branchId: id, amount: partes[i] })),
    });

    const conGasto = await foto();
    expect(delta(conGasto.mes, antes.mes, "total", "cost")).toBe(77571);
    expect(delta(conGasto.mes, antes.mes, "total", "costEstimated")).toBe(
      77571,
    );
    expect(delta(conGasto.mes, antes.mes, "total", "pending")).toBe(77571);
    expect(delta(conGasto.mes, antes.mes, String(dos[0]), "cost")).toBe(38785);
    expect(delta(conGasto.mes, antes.mes, String(dos[1]), "cost")).toBe(38786);
    await verificarIdentidades(mesActual);

    const anular = await post(`${BASE}/${gasto.id}/void?country=AR`, {
      reason: "gasto cargado por error",
    });
    expect(anular.statusCode, anular.body).toBe(200);

    // Vuelve todo a la foto previa, columna por columna y medida por medida.
    const sinGasto = await foto();
    expect(sinGasto.mes.columns).toEqual(antes.mes.columns);
    expect(sinGasto.anterior.columns).toEqual(antes.anterior.columns);

    // Ya no sale en el listado de vigentes.
    const lista = await get(
      `${BASE}?country=AR&month=${mesActual}&q=${encodeURIComponent(concepto)}`,
    );
    expect(lista.statusCode, lista.body).toBe(200);
    const filas = (JSON.parse(lista.body) as { rows: Array<{ id: number }> })
      .rows;
    expect(filas.map((f) => f.id)).not.toContain(gasto.id);

    await verificarIdentidades(mesActual);
    await verificarDetalleYExcel(mesActual);
  });

  it("los pagos de gastos no mueven los cobros: el Resumen de cobros queda idéntico a la foto inicial", async () => {
    const cobros = await get(`${FINANCE}/transactions/summary?country=AR`);
    expect(cobros.statusCode, cobros.body).toBe(200);
    expect(JSON.parse(cobros.body)).toEqual(estado.cobrosInicial);
  });
});
