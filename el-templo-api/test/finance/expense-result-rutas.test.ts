/**
 * Fase 211 Plan 03: rutas HTTP del Resultado por sede y consolidado.
 *
 * Cubre `GET /expense-records/result` (JSON) y `/result/export` (Excel):
 *   - qué cuenta como cobro a alumno y de qué sede (firmes, con alumno, sede
 *     guardada en el cobro, otra moneda en el aviso), costos por rubro y sede,
 *     Casa Matriz solo con costos, margen con un decimal o null, columnas extra
 *     para sedes inactivas o virtuales con cobros
 *   - identidades: costos del Consolidado = Total del Resumen de Egresos; cobros
 *     del Consolidado = suma directa de la DB; Σ columnas = Consolidado
 *   - el Excel sale del mismo cálculo que el JSON
 *   - roles (owner y admin 200; el resto 403; sin token 401), validación del mes
 *     y que `/result` no lo captura `/expense-records/:id`
 *   - un ajuste de saldo de apertura de banco (fase 209.1) no cambia el Resultado
 *
 * ESCENARIO (mes propio y lejano `MES = "2023-05"`; sedes, rubros y socios propios):
 *   Sedes AR: arA, arB, C (operativas), virtualAr e inactiveAr (con cobros); ES: es.
 *   Socios: mA (arA), mB (arB), mMudado (hoy en arB), mSinSnapshot (arA), mV, mI, mE.
 *   Cobros (ARS salvo aclaración):
 *     c1  mA 50000 firme 05-01 caja arA                        -> arA
 *     c2  mB 30000 firme debt_settlement 05-31 caja arB         -> arB
 *     c3  mMudado 20000 firme caja arB, snapshot arA            -> arA (sede guardada)
 *     c4  mSinSnapshot 5000 firme caja arB, sin snapshot        -> arA (sede actual del socio)
 *     c5  mA 7000 pendiente                                     -> no entra
 *     c6  mB 9000 anulado                                       -> no entra
 *     c7  ajuste de arqueo 4000 sin alumno en arA               -> no entra
 *     c8  mA 100 EUR firme                                      -> aviso de otra moneda
 *     c9  mV 3000 firme caja virtualAr                          -> columna extra virtual
 *     c10 mI 1000 firme caja inactiveAr                         -> columna extra inactiva
 *     c11 mE 400 EUR firme caja es                              -> España
 *     c12 mA 11111 firme 2023-06-01                             -> fuera del mes
 *     c13 mA 22222 firme 2023-04-30                             -> fuera del mes
 *     c14 devolución (refund outflow) 2500 de mA                -> no resta
 *   Gastos (owner, por HTTP; imputados a MES salvo G6):
 *     G1 Alquiler 40000 a arA            G2 Software 9000 = arA 4500 + arB 4500
 *     G3 Sueldos 25000 a Casa Matriz (ESTIMADO)   G4 Sueldos 10000 a arB
 *     G5 Alquiler 6000 a la sede C       G6 Viejo 8000 a arA imputado a 2023-04
 *     G7 (España) rubro ES 300 EUR a es
 *
 * El Resultado suma TODO el gimnasio: lo propio se afirma con literales; los
 * totales del Consolidado, como diferencia entre una foto tomada antes de
 * sembrar y otra después. Todo lo que crea el archivo se borra en `afterAll`.
 * El aislamiento entre gimnasios está en `test/tenancy/iso-03-finance-egresos`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
} from "drizzle-orm";
import { Workbook } from "exceljs";
import type { FastifyInstance } from "fastify";
import { createTestApp, createStaffUser, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import {
  cleanupBoardBranches,
  seedBoardBranches,
  seedBoardMember,
  seedIncome,
  type BoardBranches,
} from "../fixtures/weekly-board";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../../src/modules/shared/tenant";
import type {
  ExpenseResult,
  ExpenseResultColumn,
  ExpenseSummary,
} from "../../src/modules/finance/expense-types";
import {
  RESULT_FOOTNOTE,
  resultColumnLabel,
} from "../../src/modules/finance/expense-result-excel";

const CTX: TenantContext = { tenantId: TENANT_TEMPLO };
const BASE = "/api/admin/finance/expense-records";
const suf = `${Date.now() % 1_000_000}`;
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Mes del escenario, y los vecinos donde caen c12/c13/G6. */
const MES = "2023-05";
const MES_ANTERIOR = "2023-04";
const MES_SIGUIENTE = "2023-06";

let app: FastifyInstance;
let ownerToken: string;
let adminToken: string;
let gestionToken: string;
let adminSedeToken: string;
let recepcionToken: string;
let coachToken: string;

let branches: BoardBranches;
let sedeC = 0;
let rubroAlquiler = 0;
let rubroSoftware = 0;
let rubroSueldos = 0;
let rubroViejo = 0;
let rubroEs = 0;
let bancoId = 0;
const memberIds: number[] = [];
const txIds: number[] = [];
const staffIds: number[] = [];

/** Fotos del Resultado y del Resumen ANTES de sembrar (el informe suma todo el gimnasio). */
let fotoAr: ExpenseResult;
let fotoEs: ExpenseResult;

const NOMBRE_C = `ZZZ-RES-${suf} C`;
const NOMBRE_ALQUILER = `ZZZ-RES-${suf} Alquiler`;
const NOMBRE_SOFTWARE = `ZZZ-RES-${suf} Software`;
const NOMBRE_SUELDOS = `ZZZ-RES-${suf} Sueldos`;
const NOMBRE_VIEJO = `ZZZ-RES-${suf} Viejo`;
const NOMBRE_RUBRO_ES = `ZZZ-RES-${suf} ES`;

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

async function resultadoJson(
  token: string,
  query: string,
): Promise<ExpenseResult> {
  const res = await get(token, `/result?${query}`);
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as ExpenseResult;
}

async function resumenJson(
  token: string,
  query: string,
): Promise<ExpenseSummary> {
  const res = await get(token, `/summary?${query}`);
  expect(res.statusCode, res.body).toBe(200);
  return JSON.parse(res.body) as ExpenseSummary;
}

async function excelDe(token: string, query: string) {
  const res = await get(token, `/result/export?${query}`);
  expect(res.statusCode, res.body).toBe(200);
  const wb = new Workbook();
  // `res.rawPayload` es un Buffer de Node; el tipo que exceljs empaqueta no es
  // el mismo nominal (ver expense-summary-rutas).
  await wb.xlsx.load(
    res.rawPayload as unknown as Parameters<typeof wb.xlsx.load>[0],
  );
  return { wb, res };
}

/** Columna con esa clave (falla el test si no está). */
function columnaDe(result: ExpenseResult, key: string): ExpenseResultColumn {
  const columna = result.columns.find((c) => c.key === key);
  if (!columna) throw new Error(`El resultado no trae la columna ${key}`);
  return columna;
}

/** Columna de una sede por su id. */
function columnaDeSede(
  result: ExpenseResult,
  branchId: number,
): ExpenseResultColumn {
  return columnaDe(result, String(branchId));
}

function consolidado(result: ExpenseResult): ExpenseResultColumn {
  const columna = result.columns.at(-1);
  if (columna?.kind !== "consolidado") {
    throw new Error("La última columna no es el Consolidado");
  }
  return columna;
}

async function crearStaff(
  rol: "gestion" | "admin" | "admin_sede" | "recepcion" | "coach",
): Promise<string> {
  const email = `res211-${rol}-${suf}@test.local`;
  const userId = await createStaffUser(app, {
    email,
    password: "pass123456",
    firstName: "Res211",
    lastName: rol,
    role: rol,
    branchId: branches.arA.id,
    country: "AR",
  });
  staffIds.push(userId);
  return getAuthToken(app, email, "pass123456");
}

async function altaGasto(payload: Record<string, unknown>, country: string) {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}?country=${country}`,
    headers: authed(ownerToken),
    payload,
  });
  expect(res.statusCode, res.body).toBe(201);
  return (JSON.parse(res.body) as { record: { id: number } }).record.id;
}

function cuerpoGasto(datos: {
  concept: string;
  costCenterId: number;
  month?: string;
  amount: number;
  currency?: "ARS" | "EUR";
  estimated?: boolean;
  allocations: Array<{ branchId: number | null; amount: number }>;
}): Record<string, unknown> {
  return {
    concept: datos.concept,
    costCenterId: datos.costCenterId,
    imputationMonth: datos.month ?? MES,
    amount: datos.amount,
    currency: datos.currency ?? "ARS",
    amountStatus: datos.estimated ? "estimado" : "confirmado",
    allocations: datos.allocations,
  };
}

/** Inserta directo una fila del ledger sin alumno (ajuste o devolución). */
async function insertarMovimiento(datos: {
  kind: "adjustment" | "refund";
  direction: "inflow" | "outflow";
  amount: number;
  memberId: number | null;
  branchId: number | null;
  cashRegisterId?: number;
  paymentMethod: "cash" | "transfer";
  date: string;
}): Promise<number> {
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
  if (!admin) throw new Error("Falta admin@test.com en la base de test");
  const [fila] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(CTX, {
        memberId: datos.memberId,
        kind: datos.kind,
        direction: datos.direction,
        amount: datos.amount,
        currency: "ARS",
        paymentMethod: datos.paymentMethod,
        transactionDate: datos.date,
        effectiveDate: datos.date,
        branchId: datos.branchId,
        cashRegisterId: datos.cashRegisterId ?? null,
        recordedBy: admin.id,
      }),
    )
    .$returningId();
  txIds.push(fila.id);
  return fila.id;
}

/**
 * Oráculo de los cobros del Consolidado: suma DIRECTA de la DB, sin pasar por el
 * código bajo prueba. Cobros firmes (inflow, no anulados, validados, kind distinto
 * de cash_transfer/expense) con alumno, fecha en el mes, ARS y sede de cobro
 * existente; sede resuelta snapshot -> sede actual del alumno -> sede del cobro,
 * y solo cuenta si esa sede es de Argentina.
 */
async function cobrosFirmesAlumnosAr(
  desde: string,
  hasta: string,
): Promise<number> {
  const sedesAr = await app.db
    .select({ id: schema.branches.id })
    .from(schema.branches)
    .where(
      and(tenantWhere(schema.branches, CTX), eq(schema.branches.country, "AR")),
    );
  const idsAr = new Set(sedesAr.map((s) => s.id));
  const filas = await app.db
    .select({
      amount: schema.financialTransactions.amount,
      snapshot: schema.financialTransactions.memberBranchId,
      sedeActual: schema.users.branchId,
      sedeCobro: schema.financialTransactions.branchId,
    })
    .from(schema.financialTransactions)
    .leftJoin(
      schema.users,
      and(
        tenantWhere(schema.users, CTX),
        eq(schema.users.id, schema.financialTransactions.memberId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.financialTransactions, CTX),
        eq(schema.financialTransactions.direction, "inflow"),
        isNull(schema.financialTransactions.voidedAt),
        eq(schema.financialTransactions.validationStatus, "validado"),
        notInArray(schema.financialTransactions.kind, [
          "cash_transfer",
          "expense",
        ]),
        isNotNull(schema.financialTransactions.memberId),
        gte(schema.financialTransactions.transactionDate, desde),
        lte(schema.financialTransactions.transactionDate, hasta),
        eq(schema.financialTransactions.currency, "ARS"),
        isNotNull(schema.financialTransactions.branchId),
      ),
    );
  let total = 0;
  for (const f of filas) {
    const sede = f.snapshot ?? f.sedeActual ?? f.sedeCobro;
    if (sede !== null && idsAr.has(sede)) total += f.amount;
  }
  return total;
}

beforeAll(async () => {
  app = await createTestApp();
  // admin@test.com es OWNER (test/setup.ts).
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  branches = await seedBoardBranches(app);
  const { arA, arB, es, virtualAr, inactiveAr } = branches;

  const [filaC] = await app.db.insert(schema.branches).values(
    tenantValues(CTX, {
      name: NOMBRE_C,
      code: `ZRES${suf}C`.slice(0, 20),
      country: "AR",
    }),
  );
  sedeC = Number(filaC.insertId);

  const crearRubro = async (
    name: string,
    country: "AR" | "ES",
  ): Promise<number> => {
    const [fila] = await app.db
      .insert(schema.costCenters)
      .values(tenantValues(CTX, { name, country }));
    return Number(fila.insertId);
  };
  rubroAlquiler = await crearRubro(NOMBRE_ALQUILER, "AR");
  rubroSoftware = await crearRubro(NOMBRE_SOFTWARE, "AR");
  rubroSueldos = await crearRubro(NOMBRE_SUELDOS, "AR");
  rubroViejo = await crearRubro(NOMBRE_VIEJO, "AR");
  rubroEs = await crearRubro(NOMBRE_RUBRO_ES, "ES");

  adminToken = await crearStaff("admin");
  gestionToken = await crearStaff("gestion");
  adminSedeToken = await crearStaff("admin_sede");
  recepcionToken = await crearStaff("recepcion");
  coachToken = await crearStaff("coach");

  // FOTO antes de sembrar cobros y gastos.
  fotoAr = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
  fotoEs = await resultadoJson(ownerToken, `month=${MES}&country=ES`);

  const member = async (branchId: number): Promise<number> => {
    const id = await seedBoardMember(app, { branchId });
    memberIds.push(id);
    return id;
  };
  const mA = await member(arA.id);
  const mB = await member(arB.id);
  const mMudado = await member(arB.id); // hoy en arB, pagó cuando estaba en arA
  const mSinSnapshot = await member(arA.id);
  const mV = await member(virtualAr.id);
  const mI = await member(inactiveAr.id);
  const mE = await member(es.id);

  const inc = async (opts: Parameters<typeof seedIncome>[1]) => {
    txIds.push(await seedIncome(app, opts));
  };
  // c1..c4: entran
  await inc({
    memberId: mA,
    cobroBranchId: arA.id,
    amount: 50000,
    currency: "ARS",
    transactionDate: "2023-05-01",
    state: "firme",
  });
  await inc({
    memberId: mB,
    cobroBranchId: arB.id,
    amount: 30000,
    currency: "ARS",
    transactionDate: "2023-05-31",
    state: "firme",
    kind: "debt_settlement",
  });
  await inc({
    memberId: mMudado,
    cobroBranchId: arB.id,
    amount: 20000,
    currency: "ARS",
    transactionDate: "2023-05-10",
    state: "firme",
    memberBranchId: arA.id,
  });
  await inc({
    memberId: mSinSnapshot,
    cobroBranchId: arB.id,
    amount: 5000,
    currency: "ARS",
    transactionDate: "2023-05-12",
    state: "firme",
    memberBranchId: null,
  });
  // c5, c6: pendiente y anulado, no entran
  await inc({
    memberId: mA,
    cobroBranchId: arA.id,
    amount: 7000,
    currency: "ARS",
    transactionDate: "2023-05-05",
    state: "pendiente",
  });
  await inc({
    memberId: mB,
    cobroBranchId: arB.id,
    amount: 9000,
    currency: "ARS",
    transactionDate: "2023-05-05",
    state: "anulado",
  });
  // c7: ajuste de arqueo sin alumno en una caja de sede (no es cobro a alumno)
  await insertarMovimiento({
    kind: "adjustment",
    direction: "inflow",
    amount: 4000,
    memberId: null,
    branchId: arA.id,
    paymentMethod: "cash",
    date: "2023-05-07",
  });
  // c8: otra moneda (EUR) en una sede de Argentina
  await inc({
    memberId: mA,
    cobroBranchId: arA.id,
    amount: 100,
    currency: "EUR",
    transactionDate: "2023-05-15",
    state: "firme",
  });
  // c9, c10: sedes virtual e inactiva con cobros
  await inc({
    memberId: mV,
    cobroBranchId: virtualAr.id,
    amount: 3000,
    currency: "ARS",
    transactionDate: "2023-05-20",
    state: "firme",
  });
  await inc({
    memberId: mI,
    cobroBranchId: inactiveAr.id,
    amount: 1000,
    currency: "ARS",
    transactionDate: "2023-05-20",
    state: "firme",
  });
  // c11: España
  await inc({
    memberId: mE,
    cobroBranchId: es.id,
    amount: 400,
    currency: "EUR",
    transactionDate: "2023-05-20",
    state: "firme",
  });
  // c12, c13: fuera del mes
  await inc({
    memberId: mA,
    cobroBranchId: arA.id,
    amount: 11111,
    currency: "ARS",
    transactionDate: "2023-06-01",
    state: "firme",
  });
  await inc({
    memberId: mA,
    cobroBranchId: arA.id,
    amount: 22222,
    currency: "ARS",
    transactionDate: "2023-04-30",
    state: "firme",
  });
  // c14: devolución (outflow), no resta
  await insertarMovimiento({
    kind: "refund",
    direction: "outflow",
    amount: 2500,
    memberId: mA,
    branchId: arA.id,
    paymentMethod: "cash",
    date: "2023-05-07",
  });

  // Gastos (owner, por HTTP).
  await altaGasto(
    cuerpoGasto({
      concept: `RES211 G1 ${suf}`,
      costCenterId: rubroAlquiler,
      amount: 40000,
      allocations: [{ branchId: arA.id, amount: 40000 }],
    }),
    "AR",
  );
  await altaGasto(
    cuerpoGasto({
      concept: `RES211 G2 ${suf}`,
      costCenterId: rubroSoftware,
      amount: 9000,
      allocations: [
        { branchId: arA.id, amount: 4500 },
        { branchId: arB.id, amount: 4500 },
      ],
    }),
    "AR",
  );
  await altaGasto(
    cuerpoGasto({
      concept: `RES211 G3 ${suf}`,
      costCenterId: rubroSueldos,
      amount: 25000,
      estimated: true,
      allocations: [{ branchId: null, amount: 25000 }],
    }),
    "AR",
  );
  await altaGasto(
    cuerpoGasto({
      concept: `RES211 G4 ${suf}`,
      costCenterId: rubroSueldos,
      amount: 10000,
      allocations: [{ branchId: arB.id, amount: 10000 }],
    }),
    "AR",
  );
  await altaGasto(
    cuerpoGasto({
      concept: `RES211 G5 ${suf}`,
      costCenterId: rubroAlquiler,
      amount: 6000,
      allocations: [{ branchId: sedeC, amount: 6000 }],
    }),
    "AR",
  );
  await altaGasto(
    cuerpoGasto({
      concept: `RES211 G6 ${suf}`,
      costCenterId: rubroViejo,
      month: MES_ANTERIOR,
      amount: 8000,
      allocations: [{ branchId: arA.id, amount: 8000 }],
    }),
    "AR",
  );
  await altaGasto(
    cuerpoGasto({
      concept: `RES211 G7 ${suf}`,
      costCenterId: rubroEs,
      amount: 300,
      currency: "EUR",
      allocations: [{ branchId: es.id, amount: 300 }],
    }),
    "ES",
  );
});

afterAll(async () => {
  // Orden: ledger propio -> banco -> reparto -> gastos -> audit de gastos ->
  // rubros -> socios -> staff -> sedes.
  if (txIds.length > 0) {
    await app.db
      .delete(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, CTX),
          inArray(schema.financialTransactions.id, txIds),
        ),
      );
  }
  if (bancoId !== 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, CTX),
          eq(schema.cashRegisters.id, bancoId),
        ),
      );
  }
  const rubros = [
    rubroAlquiler,
    rubroSoftware,
    rubroSueldos,
    rubroViejo,
    rubroEs,
  ].filter((id) => id !== 0);
  if (rubros.length > 0) {
    const propios = await app.db
      .select({ id: schema.expenseRecords.id })
      .from(schema.expenseRecords)
      .where(
        and(
          tenantWhere(schema.expenseRecords, CTX),
          inArray(schema.expenseRecords.costCenterId, rubros),
        ),
      );
    const recordIds = propios.map((r) => r.id);
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
      .delete(schema.costCenters)
      .where(
        and(
          tenantWhere(schema.costCenters, CTX),
          inArray(schema.costCenters.id, rubros),
        ),
      );
  }
  if (memberIds.length > 0) {
    await app.db
      .delete(schema.users)
      .where(
        and(
          tenantWhere(schema.users, CTX),
          inArray(schema.users.id, memberIds),
        ),
      );
  }
  if (staffIds.length > 0) {
    // El staff cuelga de la sede propia (FK): sale antes que ella.
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
  }
  if (sedeC !== 0) {
    await app.db
      .delete(schema.branches)
      .where(
        and(tenantWhere(schema.branches, CTX), eq(schema.branches.id, sedeC)),
      );
  }
  if (branches) {
    await cleanupBoardBranches(
      app,
      Object.values(branches).map((b) => b.id),
    );
  }
  await app.close();
});

// ═══════════════════════════════════════════════════════════════════════════
// Números por sede
// ═══════════════════════════════════════════════════════════════════════════

describe("Resultado JSON — Argentina", () => {
  it("arA: cobros por la sede del alumno (mudado y sin snapshot incluidos), costos por rubro y margen", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    expect(r.currency).toBe("ARS");
    expect(r.country).toBe("AR");
    expect(r.month).toBe(MES);
    const a = columnaDeSede(r, branches.arA.id);
    expect(a.kind).toBe("branch");
    // 50000 + 20000 + 5000: el mudado cuenta en arA (sede guardada en el cobro)
    // y el que no tiene snapshot cae en la sede actual del socio (arA)
    expect(a.income).toBe(75000);
    // 40000 (G1 Alquiler) + 4500 (mitad de G2 Software)
    expect(a.cost).toBe(44500);
    // 75000 - 44500
    expect(a.result).toBe(30500);
    // 30500 * 1000 / 75000 = 406,67 -> 407 -> 40,7 %
    expect(a.marginPct).toBe(40.7);
    expect(a.costsByCostCenter[String(rubroAlquiler)]).toBe(40000);
    expect(a.costsByCostCenter[String(rubroSoftware)]).toBe(4500);
    expect(a.costEstimated).toBe(0);
  });

  it("arB: no entra el cobro anulado y suma su mitad de Software y los Sueldos", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    const b = columnaDeSede(r, branches.arB.id);
    // 30000 (c2 debt_settlement del último día); sin los 9000 anulados ni los 20000 del mudado
    expect(b.income).toBe(30000);
    // 10000 (G4 Sueldos) + 4500 (mitad de G2 Software)
    expect(b.cost).toBe(14500);
    // 30000 - 14500
    expect(b.result).toBe(15500);
    // 15500 * 1000 / 30000 = 516,67 -> 517 -> 51,7 %
    expect(b.marginPct).toBe(51.7);
    expect(b.costsByCostCenter[String(rubroSueldos)]).toBe(10000);
    expect(b.costsByCostCenter[String(rubroSoftware)]).toBe(4500);
  });

  it("la sede C tiene solo costos: margen null", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    const c = columnaDeSede(r, sedeC);
    expect(c.income).toBe(0);
    expect(c.cost).toBe(6000); // G5 Alquiler
    expect(c.result).toBe(-6000); // 0 - 6000
    expect(c.marginPct).toBeNull();
  });

  it("sedes virtual e inactiva con cobros: columnas extra marcadas, ordenadas antes de Casa Matriz", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    const v = columnaDeSede(r, branches.virtualAr.id);
    expect(v.kind).toBe("branch");
    expect(v.isVirtual).toBe(true);
    expect(v.income).toBe(3000); // c9
    expect(v.cost).toBe(0);
    expect(v.marginPct).toBe(100); // 3000 * 1000 / 3000 = 1000 -> 100,0 %

    const i = columnaDeSede(r, branches.inactiveAr.id);
    expect(i.isActive).toBe(false);
    expect(i.income).toBe(1000); // c10
    expect(i.marginPct).toBe(100);

    // Las operativas (arA, arB, C) vienen de computeMonth; las extras van después
    // y antes de Casa Matriz, la de nombre menor primero ("Inactiva" < "Online").
    const orden = r.columns.map((c) => c.key);
    const idx = (key: string) => orden.indexOf(key);
    for (const operativa of [branches.arA.id, branches.arB.id, sedeC]) {
      expect(idx(String(operativa))).toBeGreaterThanOrEqual(0);
      expect(idx(String(operativa))).toBeLessThan(
        idx(String(branches.inactiveAr.id)),
      );
    }
    expect(idx(String(branches.inactiveAr.id))).toBeLessThan(
      idx(String(branches.virtualAr.id)),
    );
    expect(idx(String(branches.virtualAr.id))).toBeLessThan(idx("casa_matriz"));
    expect(orden.at(-1)).toBe("consolidado");
    expect(idx("casa_matriz")).toBe(orden.length - 2);
  });

  it("Casa Matriz: solo costos (estimado), sin cobros ni margen", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    const cm = columnaDe(r, "casa_matriz");
    expect(cm.kind).toBe("casa_matriz");
    expect(cm.income).toBe(0);
    expect(cm.cost).toBe(25000); // G3 Sueldos
    expect(cm.costEstimated).toBe(25000); // G3 es estimado
    expect(cm.result).toBe(-25000);
    expect(cm.marginPct).toBeNull();
    expect(cm.costsByCostCenter[String(rubroSueldos)]).toBe(25000);
  });

  it("Consolidado: diferencia contra la foto de antes de sembrar", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    const antes = consolidado(fotoAr);
    const despues = consolidado(r);
    // 75000 (arA) + 30000 (arB) + 3000 (virtual) + 1000 (inactiva)
    expect(despues.income - antes.income).toBe(109000);
    // 44500 (arA) + 14500 (arB) + 6000 (C) + 25000 (Casa Matriz)
    expect(despues.cost - antes.cost).toBe(90000);
    expect(despues.costEstimated - antes.costEstimated).toBe(25000); // G3
    // 109000 - 90000
    expect(despues.result - antes.result).toBe(19000);
  });

  it("rubros propios: consolidado por rubro; el rubro de otro mes no es fila de este", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    const cons = consolidado(r);
    // 40000 (G1) + 6000 (G5)
    expect(cons.costsByCostCenter[String(rubroAlquiler)]).toBe(46000);
    expect(cons.costsByCostCenter[String(rubroSoftware)]).toBe(9000); // G2
    // 25000 (G3) + 10000 (G4)
    expect(cons.costsByCostCenter[String(rubroSueldos)]).toBe(35000);

    const propios = r.costCenters
      .filter((cc) => cc.name.startsWith(`ZZZ-RES-${suf} `))
      .map((cc) => cc.name);
    // G6 (Viejo) está imputado a 2023-04: no es fila de MES. Orden por nombre.
    expect(propios).toEqual([NOMBRE_ALQUILER, NOMBRE_SOFTWARE, NOMBRE_SUELDOS]);

    const anterior = await resultadoJson(
      ownerToken,
      `month=${MES_ANTERIOR}&country=AR`,
    );
    const filaViejo = anterior.costCenters.find((cc) => cc.id === rubroViejo);
    expect(filaViejo?.name).toBe(NOMBRE_VIEJO);
    expect(
      columnaDeSede(anterior, branches.arA.id).costsByCostCenter[
        String(rubroViejo)
      ],
    ).toBe(8000); // G6
    expect(consolidado(anterior).costsByCostCenter[String(rubroViejo)]).toBe(
      8000,
    );
  });

  it("no entran pendientes, anulados, ajustes de arqueo, devoluciones ni cobros fuera del mes", async () => {
    // Si entrara c5 (7000), c7 (4000) o la devolución restara (2500), arA no sería 75000.
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    expect(columnaDeSede(r, branches.arA.id).income).toBe(75000);
    expect(columnaDeSede(r, branches.arB.id).income).toBe(30000); // sin c6 (9000)

    // c12 (2023-06-01) cae solo en junio y c13 (2023-04-30) solo en abril.
    const junio = await resultadoJson(
      ownerToken,
      `month=${MES_SIGUIENTE}&country=AR`,
    );
    expect(columnaDeSede(junio, branches.arA.id).income).toBe(11111);
    const abril = await resultadoJson(
      ownerToken,
      `month=${MES_ANTERIOR}&country=AR`,
    );
    expect(columnaDeSede(abril, branches.arA.id).income).toBe(22222);
  });

  it("el cobro en otra moneda no suma y aparece en el aviso", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    const propios = [
      branches.arA.id,
      branches.arB.id,
      branches.virtualAr.id,
      branches.inactiveAr.id,
      branches.es.id,
    ];
    const avisos = r.foreignIncome.filter((f) => propios.includes(f.branchId));
    // c8: un cobro de 100 EUR en arA. El cobro de España (c11) no es de este país.
    expect(avisos).toEqual([
      {
        branchId: branches.arA.id,
        branchName: branches.arA.name,
        currency: "EUR",
        count: 1,
        amount: 100,
      },
    ]);
    // Y no suma: arA sigue en 75000, no 75100.
    expect(columnaDeSede(r, branches.arA.id).income).toBe(75000);
  });
});

describe("Resultado JSON — España", () => {
  it("EUR, sin Casa Matriz, con su sede y sin ninguna sede de Argentina", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=ES`);
    expect(r.currency).toBe("EUR");
    expect(r.country).toBe("ES");
    expect(r.columns.some((c) => c.kind === "casa_matriz")).toBe(false);

    const e = columnaDeSede(r, branches.es.id);
    expect(e.income).toBe(400); // c11
    expect(e.cost).toBe(300); // G7
    expect(e.result).toBe(100); // 400 - 300
    expect(e.marginPct).toBe(25); // 100 * 1000 / 400 = 250 -> 25,0 %

    const antes = consolidado(fotoEs);
    const despues = consolidado(r);
    expect(despues.income - antes.income).toBe(400);
    expect(despues.cost - antes.cost).toBe(300);

    const sedesAr = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, CTX),
          eq(schema.branches.country, "AR"),
        ),
      );
    const idsAr = new Set(sedesAr.map((s) => s.id));
    for (const c of r.columns) {
      expect(c.branchId === null || !idsAr.has(c.branchId)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Identidades
// ═══════════════════════════════════════════════════════════════════════════

describe("identidades del Resultado (Argentina)", () => {
  it("los costos del Consolidado son el Total del Resumen de Egresos del mismo mes", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    const resumen = await resumenJson(ownerToken, `month=${MES}&country=AR`);
    const total = resumen.columns.find((c) => c.key === "total");
    expect(total).toBeDefined();
    const cons = consolidado(r);
    expect(cons.cost).toBe(total?.cost);
    expect(cons.costEstimated).toBe(total?.costEstimated);
  });

  it("los cobros del Consolidado son la suma directa de los cobros firmes a alumnos del país en el mes", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    const directo = await cobrosFirmesAlumnosAr("2023-05-01", "2023-05-31");
    expect(consolidado(r).income).toBe(directo);
    // El oráculo ve al menos lo sembrado: 109000 (el escenario propio).
    expect(directo).toBeGreaterThanOrEqual(109000);
  });

  it("Σ columnas = Consolidado, result = income - cost en cada columna y por rubro", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    const cons = consolidado(r);
    const otras = r.columns.filter((c) => c.kind !== "consolidado");
    expect(otras.reduce((s, c) => s + c.income, 0)).toBe(cons.income);
    expect(otras.reduce((s, c) => s + c.cost, 0)).toBe(cons.cost);
    expect(otras.reduce((s, c) => s + c.costEstimated, 0)).toBe(
      cons.costEstimated,
    );
    for (const c of r.columns) {
      expect(c.result, `columna ${c.key}`).toBe(c.income - c.cost);
      // El costo de la columna es la suma de sus rubros.
      expect(
        Object.values(c.costsByCostCenter).reduce((s, v) => s + v, 0),
        `rubros de ${c.key}`,
      ).toBe(c.cost);
    }
    for (const cc of r.costCenters) {
      const suma = otras.reduce(
        (s, c) => s + (c.costsByCostCenter[String(cc.id)] ?? 0),
        0,
      );
      expect(suma, `rubro ${cc.name}`).toBe(
        cons.costsByCostCenter[String(cc.id)],
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Excel
// ═══════════════════════════════════════════════════════════════════════════

describe("Resultado Excel", () => {
  it("coincide con el JSON: encabezado, filas, margen, título y nota", async () => {
    const r = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    const { wb, res } = await excelDe(ownerToken, `month=${MES}&country=AR`);
    expect(res.headers["content-type"]).toBe(XLSX_MIME);
    expect(String(res.headers["content-disposition"])).toContain(
      "egresos-resultado-AR-2023-05",
    );

    const hoja = wb.getWorksheet("Resultado");
    expect(hoja).toBeDefined();
    if (!hoja) return;

    // Encabezado: Concepto + una etiqueta por columna del JSON, en el mismo orden.
    const encabezado = hoja.getRow(1);
    expect(encabezado.getCell(1).value).toBe("Concepto");
    r.columns.forEach((c, i) => {
      expect(encabezado.getCell(i + 2).value).toBe(resultColumnLabel(c));
    });
    // Marcas literales de las sedes extra.
    const rotulos = r.columns.map((c) => resultColumnLabel(c));
    expect(rotulos).toContain(`${branches.virtualAr.name} (virtual)`);
    expect(rotulos).toContain(`${branches.inactiveAr.name} (inactiva)`);

    const filaDe = (etiqueta: string) => {
      const encontradas = hoja
        .getRows(1, hoja.rowCount)
        ?.filter((row) => row.getCell(1).value === etiqueta);
      const fila = encontradas?.[0];
      if (!fila) throw new Error(`Sin fila "${etiqueta}"`);
      return fila;
    };

    const cobros = filaDe("Cobros a alumnos");
    const totalCostos = filaDe("Total costos");
    const estimado = filaDe("De eso, estimado");
    const resultado = filaDe("Resultado");
    const margen = filaDe("Margen");
    const alquiler = filaDe(NOMBRE_ALQUILER);
    r.columns.forEach((c, i) => {
      const col = i + 2;
      expect(cobros.getCell(col).value, `cobros ${c.key}`).toBe(
        c.kind === "casa_matriz" ? "—" : c.income,
      );
      expect(totalCostos.getCell(col).value, `costos ${c.key}`).toBe(c.cost);
      expect(estimado.getCell(col).value, `estimado ${c.key}`).toBe(
        c.costEstimated,
      );
      expect(resultado.getCell(col).value, `resultado ${c.key}`).toBe(c.result);
      expect(alquiler.getCell(col).value, `alquiler ${c.key}`).toBe(
        c.costsByCostCenter[String(rubroAlquiler)] ?? 0,
      );
    });

    // Margen: arA 40,7 % con formato 0.0%, sede C sin base, Casa Matriz "—".
    const colA = r.columns.findIndex((c) => c.key === String(branches.arA.id));
    const colC = r.columns.findIndex((c) => c.key === String(sedeC));
    const colCm = r.columns.findIndex((c) => c.key === "casa_matriz");
    expect(margen.getCell(colA + 2).value).toBeCloseTo(0.407, 3);
    expect(margen.getCell(colA + 2).numFmt).toBe("0.0%");
    expect(margen.getCell(colC + 2).value).toBe("sin base de cálculo");
    expect(margen.getCell(colCm + 2).value).toBe("—");

    // Importes numéricos con formato #,##0.
    expect(cobros.getCell(colA + 2).value).toBe(75000);
    expect(cobros.getCell(colA + 2).numFmt).toBe("#,##0");
    expect(totalCostos.getCell(colA + 2).numFmt).toBe("#,##0");

    // Título y nota debajo de la tabla (después de la fila Margen).
    const filaTitulo = filaDe("Resultado 2023-05 · Argentina · ARS");
    const filaNota = filaDe(RESULT_FOOTNOTE);
    expect(filaTitulo.number).toBeGreaterThan(margen.number);
    expect(filaNota.number).toBeGreaterThan(filaTitulo.number);
  });

  it("España sale en EUR, sin Casa Matriz", async () => {
    const { wb, res } = await excelDe(ownerToken, `month=${MES}&country=ES`);
    expect(String(res.headers["content-disposition"])).toContain(
      "egresos-resultado-ES-2023-05",
    );
    const hoja = wb.getWorksheet("Resultado");
    const rotulos: string[] = [];
    hoja?.getRow(1).eachCell((cell) => rotulos.push(String(cell.value)));
    expect(rotulos).not.toContain("Casa Matriz");
    expect(rotulos).toContain(branches.es.name);
    let titulo = false;
    hoja?.eachRow((row) => {
      if (row.getCell(1).value === "Resultado 2023-05 · España · EUR") {
        titulo = true;
      }
    });
    expect(titulo).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Roles, validación y ruteo
// ═══════════════════════════════════════════════════════════════════════════

describe("roles del Resultado", () => {
  const consultas = (): string[] => [
    `/result?month=${MES}`,
    `/result/export?month=${MES}`,
  ];

  it("owner y admin leen las dos rutas (200)", async () => {
    for (const token of [ownerToken, adminToken]) {
      for (const url of consultas()) {
        const res = await get(token, url);
        expect(res.statusCode, `${url}: ${res.body}`).toBe(200);
      }
    }
  });

  it("gestion, admin_sede, recepcion y coach reciben el rechazo por rol en las dos rutas", async () => {
    for (const token of [
      gestionToken,
      adminSedeToken,
      recepcionToken,
      coachToken,
    ]) {
      for (const url of consultas()) {
        const res = await get(token, url);
        expect(res.statusCode, `${url}: ${res.body}`).toBe(403);
      }
    }
  });

  it("sin token da 401", async () => {
    for (const url of consultas()) {
      const res = await app.inject({ method: "GET", url: `${BASE}${url}` });
      expect(res.statusCode, url).toBe(401);
    }
  });
});

describe("validación del Resultado", () => {
  it("un mes mal formado, o ausente, da 400", async () => {
    for (const url of [
      "/result?month=2023-13",
      "/result",
      "/result/export?month=23-05",
    ]) {
      const res = await get(ownerToken, url);
      expect(res.statusCode, `${url}: ${res.body}`).toBe(400);
    }
  });
});

describe("ruteo", () => {
  it("/expense-records/result no lo captura /:id (si lo capturara daría 400 por id no numérico)", async () => {
    const json = await get(ownerToken, `/result?month=${MES}`);
    expect(json.statusCode, json.body).toBe(200);
    const body = JSON.parse(json.body) as ExpenseResult;
    expect(Array.isArray(body.columns)).toBe(true);
    expect(body.columns.length).toBeGreaterThan(0);

    const excel = await get(ownerToken, `/result/export?month=${MES}`);
    expect(excel.statusCode, excel.body).toBe(200);
    expect(excel.headers["content-type"]).toBe(XLSX_MIME);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Ajuste de saldo de apertura de banco (fase 209.1)
// ═══════════════════════════════════════════════════════════════════════════

describe("ajuste de saldo de apertura de banco", () => {
  it("un ajuste de saldo de apertura de banco no cambia el Resultado", async () => {
    const antes = await resultadoJson(ownerToken, `month=${MES}&country=AR`);

    // Cuenta banco propia (sin sede) y un ajuste firme de ingreso, sin alumno y
    // sin sede, con fecha dentro del mes: es el ajuste que genera la apertura de
    // un banco. No es un cobro a alumno.
    const [banco] = await app.db.insert(schema.cashRegisters).values(
      tenantValues(CTX, {
        name: `RES211 banco ${suf}`,
        type: "banco" as const,
        branchId: null,
        currency: "ARS",
        bankName: "Banco Test",
        accountHolder: "Test",
        accountAlias: `res211.${suf}`,
        openingBalance: 0,
        cutoffDate: "2020-01-01",
      }),
    );
    bancoId = Number(banco.insertId);
    await insertarMovimiento({
      kind: "adjustment",
      direction: "inflow",
      amount: 80000,
      memberId: null,
      branchId: null,
      cashRegisterId: bancoId,
      paymentMethod: "transfer",
      date: "2023-05-15",
    });

    const despues = await resultadoJson(ownerToken, `month=${MES}&country=AR`);
    // Cobros de todas las columnas y del Consolidado: exactamente iguales (con el
    // ajuste contado como cobro, el Consolidado habría subido 80000).
    expect(despues.columns.map((c) => c.income)).toEqual(
      antes.columns.map((c) => c.income),
    );
    expect(consolidado(despues).income).toBe(consolidado(antes).income);
    // Y nada más cambió en el informe.
    expect(despues).toEqual(antes);
  });
});
