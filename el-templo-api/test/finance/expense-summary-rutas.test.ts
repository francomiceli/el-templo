/**
 * Fase 209 Plan 10 (DI-12, DI-13, DI-14, DI-18): rutas HTTP del Resumen de
 * Egresos.
 *
 * Cubre `GET /expense-records/summary`, `/summary/detail` y `/summary/export`:
 *   - roles: owner, admin y gestion leen; `admin_sede`, `recepcion` y `coach`
 *     reciben el rechazo por rol en las tres rutas; sin token da 401
 *   - validación: mes mal formado, mes ausente y destino mal formado dan 400;
 *     una sede inexistente y Casa Matriz en España dan 404; una sede válida sin
 *     movimiento da `groups: []`
 *   - el owner elige el país con `?country=`: España sale en EUR y sin Casa Matriz
 *   - el Excel sale del MISMO cálculo que el JSON: el test lo lee con `exceljs`
 *     y compara fila por fila (hoja "Resumen" contra `columns`, hoja "Detalle"
 *     contra el detalle de cada sede), con importes numéricos enteros y formato
 *     `#,##0`
 *
 * Datos: sedes, rubros, cuentas y staff propios, con meses lejanos propios
 * (`MES_AR` y `MES_ES`) para que ningún otro archivo del worker mezcle gastos en
 * lo que se afirma. El aislamiento entre gimnasios está en
 * `test/tenancy/iso-03-finance-egresos`.
 *
 * Corre contra la DB de test por worker. Todo lo que crea el archivo se borra
 * en `afterAll`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { Workbook } from "exceljs";
import type { FastifyInstance } from "fastify";
import { createTestApp, createStaffUser, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import type {
  ExpenseSummary,
  ExpenseSummaryColumn,
  ExpenseSummaryDetail,
} from "../../src/modules/finance/expense-types";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const BASE = "/api/admin/finance/expense-records";
const suf = `${Date.now() % 1_000_000}`;

/** Meses lejanos y propios de este archivo. */
const MES_AR = "2024-03";
const MES_ES = "2024-04";
/** Fecha del pago (dentro de `MES_AR` y posterior al corte de la cuenta). */
const FECHA_PAGO = "2024-03-10";
const ID_INEXISTENTE = 2_000_000_000;

let app: FastifyInstance;
let ownerToken: string;
let adminToken: string;
let gestionToken: string;
let adminSedeToken: string;
let recepcionToken: string;
let coachToken: string;

let sedeUno = 0;
let sedeDos = 0;
let sedeVacia = 0;
let sedeEs = 0;
let rubroAr = 0;
let rubroEs = 0;
let bancoId = 0;
const staffIds: number[] = [];

const CONCEPTO_ALQUILER = `EGR-10 alquiler ${suf}`;
const CONCEPTO_SUELDO = `EGR-10 sueldo ${suf}`;
const CONCEPTO_ES = `EGR-10 gasto ES ${suf}`;
/** 10000 repartidos 6000 / 4000 entre las dos sedes propias. */
const ALQUILER = { total: 10000, uno: 6000, dos: 4000, pagado: 4000 };
/** 8000 a Casa Matriz, con importe estimado. */
const SUELDO = 8000;
const GASTO_ES = 500;

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function get(token: string, url: string) {
  return app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: authed(token),
  });
}

async function postJson(
  token: string,
  url: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `${BASE}${url}`,
    headers: authed(token),
    payload,
  });
}

async function resumenJson(
  token: string,
  query: string,
): Promise<ExpenseSummary> {
  const res = await get(token, `/summary?${query}`);
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as ExpenseSummary;
}

async function detalleJson(
  token: string,
  query: string,
): Promise<ExpenseSummaryDetail> {
  const res = await get(token, `/summary/detail?${query}`);
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as ExpenseSummaryDetail;
}

async function excelDe(token: string, query: string): Promise<Workbook> {
  const res = await get(token, `/summary/export?${query}`);
  expect(res.statusCode, res.body).toBe(200);
  expect(res.headers["content-type"]).toBe(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  expect(String(res.headers["content-disposition"])).toContain(
    "egresos-resumen-",
  );
  const wb = new Workbook();
  // `res.rawPayload` es un Buffer de Node; el tipo que exceljs empaqueta no es
  // el mismo nominal (ver iso-03-finance-cajas).
  await wb.xlsx.load(
    res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0],
  );
  return wb;
}

/** Cantidad de la columna con esa clave (falla el test si no está). */
function columnaDe(resumen: ExpenseSummary, key: string): ExpenseSummaryColumn {
  const columna = resumen.columns.find((c) => c.key === key);
  if (!columna) throw new Error(`El resumen no trae la columna ${key}`);
  return columna;
}

async function crearStaff(
  rol: "gestion" | "admin" | "admin_sede" | "recepcion" | "coach",
): Promise<string> {
  const email = `egr10-${rol}-${suf}@test.local`;
  const userId = await createStaffUser(app, {
    email,
    password: "pass123456",
    firstName: "Egr10",
    lastName: rol,
    role: rol,
    branchId: sedeUno,
    country: "AR",
  });
  staffIds.push(userId);
  return getAuthToken(app, email, "pass123456");
}

async function altaGasto(payload: Record<string, unknown>, country: string) {
  const res = await postJson(ownerToken, `?country=${country}`, payload);
  expect(res.statusCode, res.body).toBe(201);
  return (JSON.parse(res.body) as { record: { id: number } }).record.id;
}

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es OWNER (test/setup.ts).
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  const crearSede = async (
    nombre: string,
    country: "AR" | "ES",
  ): Promise<number> => {
    const [fila] = await app.db.insert(schema.branches).values(
      tenantValues(CTX, {
        name: nombre,
        code: `E10${nombre.slice(-6)}${country}`.slice(0, 20),
        country,
        ...(country === "ES" ? { timezone: "Europe/Madrid" } : {}),
      }),
    );
    return Number(fila.insertId);
  };
  sedeUno = await crearSede(`ZZZ-EGR-10 ${suf}-A1`, "AR");
  sedeDos = await crearSede(`ZZZ-EGR-10 ${suf}-A2`, "AR");
  sedeVacia = await crearSede(`ZZZ-EGR-10 ${suf}-A3`, "AR");
  sedeEs = await crearSede(`ZZZ-EGR-10 ${suf}-E1`, "ES");

  const [rAr] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(CTX, { name: `EGR-10 AR ${suf}`, country: "AR" }));
  rubroAr = Number(rAr.insertId);
  const [rEs] = await app.db
    .insert(schema.costCenters)
    .values(tenantValues(CTX, { name: `EGR-10 ES ${suf}`, country: "ES" }));
  rubroEs = Number(rEs.insertId);

  const [banco] = await app.db.insert(schema.cashRegisters).values(
    tenantValues(CTX, {
      name: `EGR-10 banco ${suf}`,
      type: "banco" as const,
      branchId: null,
      currency: "ARS",
      bankName: "Banco Test",
      accountHolder: "Test",
      accountAlias: `egr10.${suf}`,
      openingBalance: 500000,
      cutoffDate: "2020-01-01",
    }),
  );
  bancoId = Number(banco.insertId);

  adminToken = await crearStaff("admin");
  gestionToken = await crearStaff("gestion");
  adminSedeToken = await crearStaff("admin_sede");
  recepcionToken = await crearStaff("recepcion");
  coachToken = await crearStaff("coach");

  // Gasto A: 10000 repartidos 6000 / 4000, con un pago de 4000 en el mes.
  const alquilerId = await altaGasto(
    {
      concept: CONCEPTO_ALQUILER,
      beneficiary: "Inmobiliaria Test",
      costCenterId: rubroAr,
      imputationMonth: MES_AR,
      amount: ALQUILER.total,
      currency: "ARS",
      amountStatus: "confirmado",
      allocations: [
        { branchId: sedeUno, amount: ALQUILER.uno },
        { branchId: sedeDos, amount: ALQUILER.dos },
      ],
    },
    "AR",
  );
  const pago = await postJson(
    ownerToken,
    `/${alquilerId}/payments?country=AR`,
    {
      paidOn: FECHA_PAGO,
      cashRegisterId: bancoId,
      paymentMethod: "transfer",
      amount: ALQUILER.pagado,
    },
  );
  expect(pago.statusCode, pago.body).toBe(201);

  // Gasto B: a Casa Matriz, con importe estimado.
  await altaGasto(
    {
      concept: CONCEPTO_SUELDO,
      costCenterId: rubroAr,
      imputationMonth: MES_AR,
      amount: SUELDO,
      currency: "ARS",
      amountStatus: "estimado",
      allocations: [{ branchId: null, amount: SUELDO }],
    },
    "AR",
  );

  // Gasto de España, en EUR.
  await altaGasto(
    {
      concept: CONCEPTO_ES,
      costCenterId: rubroEs,
      imputationMonth: MES_ES,
      amount: GASTO_ES,
      currency: "EUR",
      amountStatus: "confirmado",
      allocations: [{ branchId: sedeEs, amount: GASTO_ES }],
    },
    "ES",
  );
});

afterAll(async () => {
  // Orden: pagos → ledger de la cuenta → audit del ledger → reparto → gastos →
  // audit de gastos → cuenta → rubros → staff → sedes.
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
        eq(schema.financialTransactions.cashRegisterId, bancoId),
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
        eq(schema.cashRegisters.id, bancoId),
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
        inArray(schema.branches.id, [sedeUno, sedeDos, sedeVacia, sedeEs]),
      ),
    );
  await app.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// Roles
// ═══════════════════════════════════════════════════════════════════════════

describe("roles del Resumen", () => {
  const consultas = (): string[] => [
    `/summary?month=${MES_AR}`,
    `/summary/detail?month=${MES_AR}&destination=total`,
    `/summary/export?month=${MES_AR}`,
  ];

  it("owner, admin y gestion leen las tres rutas (200)", async () => {
    for (const token of [ownerToken, adminToken, gestionToken]) {
      for (const url of consultas()) {
        const res = await get(token, url);
        expect(res.statusCode, `${url}: ${res.body}`).toBe(200);
      }
    }
  });

  it("admin_sede, recepcion y coach reciben el rechazo por rol en las tres rutas", async () => {
    for (const token of [adminSedeToken, recepcionToken, coachToken]) {
      for (const url of consultas()) {
        const res = await get(token, url);
        expect(res.statusCode, `${url}: ${res.body}`).toBe(403);
      }
    }
  });

  it("sin token da 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/summary?month=${MES_AR}`,
    });
    expect(res.statusCode).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Validación
// ═══════════════════════════════════════════════════════════════════════════

describe("validación del Resumen", () => {
  it("un mes mal formado, o ausente, da 400 en las tres rutas", async () => {
    for (const url of [
      "/summary?month=2026-13",
      "/summary",
      "/summary/detail?month=2026-13&destination=total",
      "/summary/detail?destination=total",
      "/summary/export?month=2026-13",
      "/summary/export?month=nov-2026",
    ]) {
      const res = await get(
        ownerToken,
        `${url}${url.includes("?") ? "&" : "?"}country=AR`,
      );
      expect(res.statusCode, `${url}: ${res.body}`).toBe(400);
    }
  });

  it("un destino mal formado, o ausente, da 400", async () => {
    for (const destino of ["x", "casa matriz", "-3", "1.5", ""]) {
      const res = await get(
        ownerToken,
        `/summary/detail?month=${MES_AR}&destination=${encodeURIComponent(destino)}`,
      );
      expect(res.statusCode, `destino "${destino}": ${res.body}`).toBe(400);
    }
    const sinDestino = await get(ownerToken, `/summary/detail?month=${MES_AR}`);
    expect(sinDestino.statusCode).toBe(400);
  });

  it("una sede que no existe da 404, y Casa Matriz en España también", async () => {
    const inexistente = await get(
      ownerToken,
      `/summary/detail?month=${MES_AR}&destination=${ID_INEXISTENTE}`,
    );
    expect(inexistente.statusCode, inexistente.body).toBe(404);

    const casaMatrizEs = await get(
      ownerToken,
      `/summary/detail?month=${MES_ES}&destination=casa_matriz&country=ES`,
    );
    expect(casaMatrizEs.statusCode, casaMatrizEs.body).toBe(404);

    // Una sede de España pedida como si fuera de Argentina tampoco es un destino.
    const sedeOtroPais = await get(
      ownerToken,
      `/summary/detail?month=${MES_AR}&destination=${sedeEs}&country=AR`,
    );
    expect(sedeOtroPais.statusCode, sedeOtroPais.body).toBe(404);
  });

  it("una sede válida sin movimiento en el mes da 200 con groups vacío", async () => {
    const detalle = await detalleJson(
      ownerToken,
      `month=${MES_AR}&destination=${sedeVacia}&country=AR`,
    );
    expect(detalle.groups).toEqual([]);
    expect(detalle.destination).toBe(String(sedeVacia));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// JSON
// ═══════════════════════════════════════════════════════════════════════════

describe("Resumen JSON", () => {
  it("Argentina: las sedes propias, Casa Matriz y el Total última, en ARS", async () => {
    const resumen = await resumenJson(ownerToken, `month=${MES_AR}&country=AR`);
    expect(resumen.currency).toBe("ARS");
    expect(resumen.country).toBe("AR");
    expect(resumen.month).toBe(MES_AR);
    expect(resumen.columns.at(-1)?.key).toBe("total");

    const uno = columnaDe(resumen, String(sedeUno));
    const dos = columnaDe(resumen, String(sedeDos));
    expect(uno.cost).toBe(ALQUILER.uno);
    expect(dos.cost).toBe(ALQUILER.dos);
    // El pago de 4000 se reparte entre las dos sedes en proporción a su parte.
    expect(uno.paidInMonth + dos.paidInMonth).toBe(ALQUILER.pagado);
    expect(uno.pending + dos.pending).toBe(ALQUILER.total - ALQUILER.pagado);
    expect(uno.costPaid + uno.pending).toBe(uno.cost);

    const casaMatriz = columnaDe(resumen, "casa_matriz");
    expect(casaMatriz.cost).toBe(SUELDO);
    expect(casaMatriz.costEstimated).toBe(SUELDO);
    expect(casaMatriz.pending).toBe(SUELDO);

    // Identidad: el Total es la suma de las columnas anteriores.
    const total = columnaDe(resumen, "total");
    const sinTotal = resumen.columns.filter((c) => c.key !== "total");
    expect(total.cost).toBe(sinTotal.reduce((a, c) => a + c.cost, 0));
    expect(total.paidInMonth).toBe(
      sinTotal.reduce((a, c) => a + c.paidInMonth, 0),
    );
    expect(total.cost).toBe(ALQUILER.total + SUELDO);
  });

  it("el owner con ?country=ES ve el mes de España en EUR y sin Casa Matriz", async () => {
    const resumen = await resumenJson(ownerToken, `month=${MES_ES}&country=ES`);
    expect(resumen.currency).toBe("EUR");
    expect(resumen.country).toBe("ES");
    expect(resumen.columns.map((c) => c.key)).not.toContain("casa_matriz");
    expect(columnaDe(resumen, String(sedeEs)).cost).toBe(GASTO_ES);
    expect(columnaDe(resumen, "total").cost).toBe(GASTO_ES);
  });

  it("gestion (Argentina) ve su país aunque pida otro por la query", async () => {
    const resumen = await resumenJson(
      gestionToken,
      `month=${MES_AR}&country=ES`,
    );
    expect(resumen.country).toBe("AR");
    expect(resumen.currency).toBe("ARS");
    expect(columnaDe(resumen, String(sedeUno)).cost).toBe(ALQUILER.uno);
  });

  it("el detalle de una sede trae el rubro y el concepto con su parte", async () => {
    const detalle = await detalleJson(
      ownerToken,
      `month=${MES_AR}&destination=${sedeUno}&country=AR`,
    );
    expect(detalle.destination).toBe(String(sedeUno));
    expect(detalle.destinationName).toBe(`ZZZ-EGR-10 ${suf}-A1`);
    expect(detalle.groups).toHaveLength(1);
    const [grupo] = detalle.groups;
    expect(grupo?.costCenterId).toBe(rubroAr);
    expect(grupo?.concepts).toHaveLength(1);
    expect(grupo?.concepts[0]).toMatchObject({
      concept: CONCEPTO_ALQUILER,
      beneficiary: "Inmobiliaria Test",
      imputationMonth: MES_AR,
      estimated: false,
      cost: ALQUILER.uno,
    });
    expect(grupo?.cost).toBe(ALQUILER.uno);
  });

  it("el detalle de Casa Matriz (Argentina) trae el gasto cargado a ella, como estimado", async () => {
    const detalle = await detalleJson(
      ownerToken,
      `month=${MES_AR}&destination=casa_matriz&country=AR`,
    );
    expect(detalle.destination).toBe("casa_matriz");
    expect(detalle.destinationName).toBe("Casa Matriz");
    const conceptos = detalle.groups.flatMap((g) => g.concepts);
    expect(conceptos).toHaveLength(1);
    expect(conceptos[0]).toMatchObject({
      concept: CONCEPTO_SUELDO,
      estimated: true,
      cost: SUELDO,
      pending: SUELDO,
    });
  });

  it("el detalle del Total suma los dos gastos y coincide con la columna Total", async () => {
    const detalle = await detalleJson(
      ownerToken,
      `month=${MES_AR}&destination=total&country=AR`,
    );
    const resumen = await resumenJson(ownerToken, `month=${MES_AR}&country=AR`);
    const total = columnaDe(resumen, "total");
    expect(detalle.groups.reduce((a, g) => a + g.cost, 0)).toBe(total.cost);
    expect(detalle.groups.reduce((a, g) => a + g.pending, 0)).toBe(
      total.pending,
    );
    expect(detalle.groups.reduce((a, g) => a + g.paidInMonth, 0)).toBe(
      total.paidInMonth,
    );
    expect(
      detalle.groups.flatMap((g) => g.concepts.map((c) => c.concept)),
    ).toEqual(expect.arrayContaining([CONCEPTO_ALQUILER, CONCEPTO_SUELDO]));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Excel
// ═══════════════════════════════════════════════════════════════════════════

describe("Excel del Resumen", () => {
  it("tiene las hojas Resumen y Detalle y el nombre del archivo lleva país y mes", async () => {
    const res = await get(
      ownerToken,
      `/summary/export?month=${MES_AR}&country=AR`,
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(String(res.headers["content-disposition"])).toContain(
      `egresos-resumen-AR-${MES_AR}-`,
    );
    const wb = await excelDe(ownerToken, `month=${MES_AR}&country=AR`);
    expect(wb.worksheets.map((h) => h.name)).toEqual(["Resumen", "Detalle"]);
    const encabezado = (hoja: string) =>
      (wb.getWorksheet(hoja)?.getRow(1).values as unknown[]).slice(1);
    expect(encabezado("Resumen")).toEqual([
      "Destino",
      "Pagado en el mes",
      "Costo del mes",
      "De eso, estimado",
      "Pagado de ese costo",
      "Pendiente",
    ]);
    expect(encabezado("Detalle")).toEqual([
      "Destino",
      "Rubro",
      "Concepto",
      "Beneficiario",
      "Mes de imputación",
      "Estimado",
      "Costo del mes",
      "Pendiente",
      "Pagado en el mes",
    ]);
  });

  it("la hoja Resumen tiene los mismos números que el JSON, columna por columna, y el Total en negrita", async () => {
    const resumen = await resumenJson(ownerToken, `month=${MES_AR}&country=AR`);
    const wb = await excelDe(ownerToken, `month=${MES_AR}&country=AR`);
    const hoja = wb.getWorksheet("Resumen");
    expect(hoja).toBeDefined();

    resumen.columns.forEach((columna, i) => {
      const fila = hoja?.getRow(i + 2);
      const etiqueta = columna.isActive
        ? columna.name
        : `${columna.name} (inactiva)`;
      expect(fila?.getCell(1).value, `fila ${i + 2}`).toBe(etiqueta);
      const esperados = [
        columna.paidInMonth,
        columna.cost,
        columna.costEstimated,
        columna.costPaid,
        columna.pending,
      ];
      esperados.forEach((valor, j) => {
        const celda = fila?.getCell(j + 2);
        // Número entero (nunca texto) con formato de miles y sin decimales.
        expect(typeof celda?.value, `${etiqueta} col ${j + 2}`).toBe("number");
        expect(celda?.value, `${etiqueta} col ${j + 2}`).toBe(valor);
        expect(celda?.numFmt).toBe("#,##0");
      });
    });

    const filaTotal = hoja?.getRow(resumen.columns.length + 1);
    expect(filaTotal?.getCell(1).value).toBe("Total");
    expect(filaTotal?.font?.bold).toBe(true);
    const total = columnaDe(resumen, "total");
    expect(filaTotal?.getCell(3).value).toBe(total.cost);
    expect(filaTotal?.getCell(2).value).toBe(total.paidInMonth);
    expect(filaTotal?.getCell(6).value).toBe(total.pending);

    // El título con mes, país y moneda queda debajo de la tabla.
    const textos: string[] = [];
    hoja?.eachRow((row) => textos.push(String(row.getCell(1).value ?? "")));
    expect(textos).toContain(`Egresos ${MES_AR} · Argentina · ARS`);
  });

  it("la hoja Detalle tiene una fila por gasto y destino con su costo, y suma lo mismo que cada columna", async () => {
    const resumen = await resumenJson(ownerToken, `month=${MES_AR}&country=AR`);
    const wb = await excelDe(ownerToken, `month=${MES_AR}&country=AR`);
    const hoja = wb.getWorksheet("Detalle");
    expect(hoja).toBeDefined();

    interface FilaDetalle {
      destino: string;
      rubro: string;
      concepto: string;
      beneficiario: string;
      mes: string;
      estimado: string;
      costo: number;
      pendiente: number;
      pagado: number;
    }
    const filas: FilaDetalle[] = [];
    hoja?.eachRow((row, i) => {
      if (i === 1) return;
      filas.push({
        destino: String(row.getCell(1).value),
        rubro: String(row.getCell(2).value),
        concepto: String(row.getCell(3).value),
        beneficiario: String(row.getCell(4).value ?? ""),
        mes: String(row.getCell(5).value),
        estimado: String(row.getCell(6).value),
        costo: Number(row.getCell(7).value),
        pendiente: Number(row.getCell(8).value),
        pagado: Number(row.getCell(9).value),
      });
    });

    // La fila propia de la primera sede: destino, rubro, concepto y su costo.
    const delAlquiler = filas.filter((f) => f.concepto === CONCEPTO_ALQUILER);
    expect(delAlquiler.map((f) => [f.destino, f.costo])).toEqual([
      [`ZZZ-EGR-10 ${suf}-A1`, ALQUILER.uno],
      [`ZZZ-EGR-10 ${suf}-A2`, ALQUILER.dos],
    ]);
    expect(delAlquiler[0]).toMatchObject({
      rubro: `EGR-10 AR ${suf}`,
      beneficiario: "Inmobiliaria Test",
      mes: MES_AR,
      estimado: "No",
    });
    const delSueldo = filas.filter((f) => f.concepto === CONCEPTO_SUELDO);
    expect(delSueldo).toHaveLength(1);
    expect(delSueldo[0]).toMatchObject({
      destino: "Casa Matriz",
      estimado: "Sí",
      costo: SUELDO,
    });

    // Cada destino: la suma de sus filas es su columna del Resumen.
    for (const columna of resumen.columns) {
      if (columna.key === "total") continue;
      const suyas = filas.filter((f) => f.destino === columna.name);
      expect(
        suyas.reduce((a, f) => a + f.costo, 0),
        `costo de ${columna.name}`,
      ).toBe(columna.cost);
      expect(
        suyas.reduce((a, f) => a + f.pendiente, 0),
        `pendiente de ${columna.name}`,
      ).toBe(columna.pending);
      expect(
        suyas.reduce((a, f) => a + f.pagado, 0),
        `pagado de ${columna.name}`,
      ).toBe(columna.paidInMonth);
    }
  });

  it("España sale en EUR, con su título y sin Casa Matriz", async () => {
    const wb = await excelDe(ownerToken, `month=${MES_ES}&country=ES`);
    const resumen = wb.getWorksheet("Resumen");
    const textos: string[] = [];
    resumen?.eachRow((row) => textos.push(String(row.getCell(1).value ?? "")));
    expect(textos).toContain(`Egresos ${MES_ES} · España · EUR`);
    expect(textos).not.toContain("Casa Matriz");
    expect(textos).toContain(`ZZZ-EGR-10 ${suf}-E1`);

    const detalle = wb.getWorksheet("Detalle");
    const conceptos: string[] = [];
    detalle?.eachRow((row, i) => {
      if (i > 1) conceptos.push(String(row.getCell(3).value));
    });
    expect(conceptos).toContain(CONCEPTO_ES);
  });

  it("un concepto que empieza con '=' queda como texto, no como fórmula", async () => {
    const id = await altaGasto(
      {
        concept: `=1+1 ${suf}`,
        costCenterId: rubroAr,
        imputationMonth: MES_AR,
        amount: 1000,
        currency: "ARS",
        amountStatus: "confirmado",
        allocations: [{ branchId: sedeUno, amount: 1000 }],
      },
      "AR",
    );
    expect(id).toBeGreaterThan(0);
    const wb = await excelDe(ownerToken, `month=${MES_AR}&country=AR`);
    let celda: unknown;
    wb.getWorksheet("Detalle")?.eachRow((row, i) => {
      if (i > 1 && String(row.getCell(3).value).startsWith("=1+1")) {
        celda = row.getCell(3).value;
      }
    });
    expect(celda).toBe(`=1+1 ${suf}`);
  });
});
