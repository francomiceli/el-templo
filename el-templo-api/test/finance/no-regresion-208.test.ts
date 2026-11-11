/**
 * Fase 208 Plan 11 (DI-09, SC-1..SC-5, T-208-31) — no-regresión con datos
 * "como prod hoy" y convivencia con lo nuevo (Tesoro, cuenta USD, retiro con
 * destino).
 *
 * Parte 1 ("como prod hoy"): sede A con caja de efectivo propia, una Caja
 * central ARS y un banco ARS. Cobros firmes de 1500 y 2500 en efectivo en A y
 * de 3000 por transferencia (al banco). Un retiro VIEJO (expense con centro
 * "Retiros", sembrado con `seedLegacyWithdrawal`) de 3000 desde A que se lleva
 * los dos cobros en efectivo, un egreso común de 700 desde A (POST /expenses,
 * centro "Varios") y un traslado de 200 de A a la Central (POST /movements).
 * Cada lector (Saldos, resumen del cajón, historial de retiros, Mov./Egresos,
 * Resumen del mes, ingresos por sede, Excel de Saldos) tiene que dar EXACTAMENTE
 * el total escrito a mano acá, sin que ningún código de la fase 208 lo mueva.
 *
 * Parte 2 ("convivencia"): se suma un Tesoro ARS (por API, apertura 0), una
 * cuenta banco USD (por API) y un retiro NUEVO de 100 de A a la Central. Los
 * ingresos no se mueven ni un centavo, los saldos se mueven lo justo, los dos
 * formatos de retiro conviven en el historial sin duplicar y los dos se anulan.
 *
 * Cada total es un LITERAL con su cuenta al lado: nunca se recalcula con el
 * código bajo prueba. Todas las fechas son el lunes de la semana en curso
 * (`boardWeeks().current`, nunca futuro), como `no-regresion-enteros.test.ts`
 * (207-12): el egreso y el traslado por API quedan fechados "hoy" por el
 * service, pero ningún total que se compara por fecha depende de ellos.
 *
 * Los Tesoros activos sobreviven entre archivos del worker: se desactivan en
 * `beforeAll` y se borran los propios al terminar.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { Workbook } from "exceljs";
import type { FastifyInstance } from "fastify";
import { createTestApp, cleanAllTestData, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  TENANT_TEMPLO,
  limpiarSegundoGimnasio,
} from "../fixtures/second-tenant";
import {
  boardWeeks,
  seedBoardBranches,
  cleanupBoardBranches,
  seedBoardMember,
  type BoardBranches,
} from "../fixtures/weekly-board";
import { seedLegacyWithdrawal } from "../fixtures/withdrawal-fixtures";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const FIN = "/api/admin/finance";
const CUTOFF = "2020-01-01";
const suf = Date.now().toString(36).slice(-6);

// ─── tipos de las respuestas ─────────────────────────────────────────────

interface BalanceRow {
  cashRegisterId: number;
  name: string;
  currency: string;
  firmeBalance: number;
  isTreasury: boolean;
}

interface SummaryBody {
  monthlyRevenue: number;
  revenueByMethod: Record<string, number>;
  revenueByBranch: Array<{ branchId: number; revenue: number }>;
}

interface IncomeRow {
  branchId: number;
  currency: string;
  total: number;
}

interface WithdrawalListBody {
  rows: Array<{
    id: number;
    format: "legacy_expense" | "transfer";
    amount: number;
    paymentCount: number;
    destinationName: string | null;
    responsibleName: string;
    voidedAt: string | null;
  }>;
  total: number;
}

interface PendingBody {
  rows: Array<{ id: number }>;
  total: number;
  summary: {
    lastWithdrawal: { id: number; amount: number } | null;
    previousBalance: number;
    inflowTotal: number;
    outflowTotal: number;
    firmeBalance: number;
  };
}

interface MovRow {
  id: number;
  kind: string;
  direction: string;
  amount: number;
  costCenterName: string | null;
  responsibleName: string | null;
}

interface MovHistoryBody {
  rows: MovRow[];
  total: number;
}

// ─── estado del escenario ────────────────────────────────────────────────

let app: FastifyInstance;
let branches: BoardBranches;
let day: string;
let adminId: number;
let ownerToken: string;
let memberId: number;
let variosCostCenterId: number;
let cajaA: { id: number; name: string };
let central: { id: number; name: string };
let banco: { id: number; name: string };
let cobroEfectivo1500: number;
let cobroEfectivo2500: number;
let retiroViejoId: number;
let tesoro: { id: number; name: string };
let bancoUsdId: number;
let retiroNuevoId: number;
const createdCajaIds: number[] = [];

function authed() {
  return { authorization: `Bearer ${ownerToken}` };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await app.inject({
    method: "GET",
    url: `${FIN}${url}`,
    headers: authed(),
  });
  expect(res.statusCode, res.body.slice(0, 400)).toBe(200);
  return res.json<T>();
}

async function postJson(
  url: string,
  payload: Record<string, unknown>,
  expected: number,
): Promise<Record<string, unknown>> {
  const res = await app.inject({
    method: "POST",
    url: `${FIN}${url}`,
    headers: authed(),
    payload,
  });
  expect(res.statusCode, res.body.slice(0, 400)).toBe(expected);
  return res.json<Record<string, unknown>>();
}

async function balances(): Promise<Map<number, BalanceRow>> {
  const rows = await getJson<BalanceRow[]>("/cash-registers/balances");
  return new Map(rows.map((r) => [r.cashRegisterId, r]));
}

async function firme(cashRegisterId: number): Promise<number> {
  const row = (await balances()).get(cashRegisterId);
  expect(row, `la caja ${cashRegisterId} no aparece en Saldos`).toBeDefined();
  return (row as BalanceRow).firmeBalance;
}

async function summary(): Promise<SummaryBody> {
  return getJson<SummaryBody>(
    `/transactions/summary?dateFrom=${day}&dateTo=${day}`,
  );
}

async function incomeByBranch(): Promise<IncomeRow[]> {
  return getJson<IncomeRow[]>(
    `/transactions/income-by-branch?dateFrom=${day}&dateTo=${day}`,
  );
}

/** Los totales de ingresos del mes: tienen que ser los mismos en toda la parte 2. */
async function expectIngresosIntactos(): Promise<void> {
  const s = await summary();
  // 1500 + 2500 + 3000 (el egreso, el traslado y los retiros NO son ingreso)
  expect(s.monthlyRevenue).toBe(7000);
  // 1500 + 2500
  expect(s.revenueByMethod.cash).toBe(4000);
  expect(s.revenueByMethod.transfer).toBe(3000);
  expect(s.revenueByMethod.cheque).toBe(0);
  const ingresosA = (await incomeByBranch())
    .filter((r) => r.branchId === branches.arA.id && r.currency === "ARS")
    .reduce((acc, r) => acc + r.total, 0);
  // 1500 + 2500 + 3000 cobrados en la sede A
  expect(ingresosA).toBe(7000);
}

async function readSaldosExcel(): Promise<Map<string, string>> {
  const res = await app.inject({
    method: "GET",
    url: `${FIN}/cash-registers/balances/export`,
    headers: authed(),
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  const wb = new Workbook();
  await wb.xlsx.load(
    res.rawPayload as unknown as Parameters<Workbook["xlsx"]["load"]>[0],
  );
  const sheet = wb.getWorksheet("Saldos");
  expect(sheet).toBeDefined();
  const tipos = new Map<string, string>();
  sheet?.eachRow((row, i) => {
    if (i === 1) return;
    tipos.set(String(row.getCell(1).value), String(row.getCell(2).value));
  });
  return tipos;
}

async function newCaja(opts: {
  label: string;
  type: "efectivo" | "banco";
  branchId: number | null;
}): Promise<{ id: number; name: string }> {
  const name = `NR208-${opts.label} ${suf}`;
  const [row] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name,
        type: opts.type,
        branchId: opts.branchId,
        currency: "ARS",
        openingBalance: 0,
        cutoffDate: CUTOFF,
        ...(opts.type === "banco"
          ? {
              bankName: "Banco NR208",
              accountHolder: "El Templo",
              accountAlias: `nr208.${suf}`,
            }
          : {}),
      }),
    )
    .$returningId();
  createdCajaIds.push(row.id);
  return { id: row.id, name };
}

async function seedCobro(opts: {
  amount: number;
  method: "cash" | "transfer";
  cashRegisterId: number;
}): Promise<number> {
  const [row] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        memberBranchId: branches.arA.id,
        kind: "plan_charge" as const,
        direction: "inflow" as const,
        amount: opts.amount,
        currency: "ARS",
        paymentMethod: opts.method,
        transactionDate: day,
        effectiveDate: day,
        branchId: branches.arA.id,
        cashRegisterId: opts.cashRegisterId,
        recordedBy: adminId,
        validationStatus: "validado" as const,
      }),
    )
    .$returningId();
  return row.id;
}

async function desactivarTesoros(): Promise<void> {
  await app.db
    .update(schema.cashRegisters)
    .set({ isActive: false })
    .where(
      and(
        tenantWhere(schema.cashRegisters, TEMPLO_CTX),
        eq(schema.cashRegisters.isTreasury, true),
      ),
    );
}

beforeAll(async () => {
  app = await createTestApp();
  day = boardWeeks().current;
  await cleanAllTestData(app);
  branches = await seedBoardBranches(app);
  // `cleanAllTestData` repone el owner admin@test.com.
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
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
  memberId = await seedBoardMember(app, { branchId: branches.arA.id });
  await desactivarTesoros();

  // Centro de costo "Varios" (semilla de la migración 0161). Si no está, se crea.
  const [varios] = await app.db
    .select({ id: schema.costCenters.id })
    .from(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, TEMPLO_CTX),
        eq(schema.costCenters.name, "Varios"),
        eq(schema.costCenters.country, "AR"),
      ),
    )
    .limit(1);
  if (varios) {
    variosCostCenterId = varios.id;
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
    variosCostCenterId = ins.id;
  }

  // Cajas propias: la de efectivo de la sede A, la Central y el banco ARS.
  cajaA = await newCaja({
    label: "SedeA",
    type: "efectivo",
    branchId: branches.arA.id,
  });
  central = await newCaja({
    label: "Central",
    type: "efectivo",
    branchId: null,
  });
  banco = await newCaja({ label: "Banco", type: "banco", branchId: null });

  // Cobros firmes: 1500 y 2500 en efectivo en A, 3000 por transferencia al banco.
  cobroEfectivo1500 = await seedCobro({
    amount: 1500,
    method: "cash",
    cashRegisterId: cajaA.id,
  });
  cobroEfectivo2500 = await seedCobro({
    amount: 2500,
    method: "cash",
    cashRegisterId: cajaA.id,
  });
  await seedCobro({
    amount: 3000,
    method: "transfer",
    cashRegisterId: banco.id,
  });

  // Retiro VIEJO de 3000 desde A que se lleva los dos cobros en efectivo.
  const legacy = await seedLegacyWithdrawal(app, TEMPLO_CTX, {
    cashRegisterId: cajaA.id,
    branchId: branches.arA.id,
    amount: 3000,
    responsibleName: "Gaby",
    recordedBy: adminId,
    transactionDate: day,
    notes: "retiro-viejo-208-11",
    payments: [
      { id: cobroEfectivo1500, amount: 1500 },
      { id: cobroEfectivo2500, amount: 2500 },
    ],
  });
  retiroViejoId = legacy.withdrawalId;

  // Egreso común de 700 desde A y traslado de 200 de A a la Central, por API.
  await postJson(
    "/expenses",
    { cajaId: cajaA.id, amount: 700, costCenterId: variosCostCenterId },
    201,
  );
  await postJson(
    "/movements",
    { origenCajaId: cajaA.id, destinoCajaId: central.id, amount: 200 },
    201,
  );
});

afterAll(async () => {
  await cleanAllTestData(app);
  if (createdCajaIds.length > 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, createdCajaIds),
        ),
      );
  }
  await cleanupBoardBranches(
    app,
    Object.values(branches).map((b) => b.id),
  );
  await limpiarSegundoGimnasio(app);
  await app.close();
});

// ─── Parte 1: como prod hoy ──────────────────────────────────────────────

describe("208-11 parte 1: con datos como los de hoy nada cambia (DI-09)", () => {
  it("Saldos: A 100, Central 200, banco 3000", async () => {
    const b = await balances();
    // 1500 + 2500 − 3000 (retiro viejo) − 700 (egreso) − 200 (traslado)
    expect(b.get(cajaA.id)?.firmeBalance).toBe(100);
    // 0 + 200 (entrada del traslado)
    expect(b.get(central.id)?.firmeBalance).toBe(200);
    // 3000 (la transferencia cae al banco)
    expect(b.get(banco.id)?.firmeBalance).toBe(3000);
  });

  it("Resumen del cajón de A: último retiro = el viejo, salió 900, entró 0, anterior 1000", async () => {
    const {
      rows,
      total,
      summary: s,
    } = await getJson<PendingBody>(
      `/withdrawals/pending?cashRegisterId=${cajaA.id}`,
    );
    // Los dos cobros en efectivo ya están retirados por el retiro viejo
    expect(total).toBe(0);
    expect(rows).toEqual([]);
    expect(s.lastWithdrawal?.id).toBe(retiroViejoId);
    expect(s.lastWithdrawal?.amount).toBe(3000);
    // 700 (egreso) + 200 (traslado) salieron DESPUÉS del retiro
    expect(s.outflowTotal).toBe(900);
    expect(s.inflowTotal).toBe(0);
    // 100 (firme) − 0 (entró) + 900 (salió)
    expect(s.previousBalance).toBe(1000);
    expect(s.firmeBalance).toBe(100);
  });

  it("Historial de retiros de A: 1 solo, formato viejo, 2 cobros, sin destino", async () => {
    const { rows, total } = await getJson<WithdrawalListBody>(
      `/withdrawals?cashRegisterId=${cajaA.id}`,
    );
    expect(total).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(retiroViejoId);
    expect(rows[0].format).toBe("legacy_expense");
    expect(rows[0].amount).toBe(3000);
    expect(rows[0].paymentCount).toBe(2);
    expect(rows[0].destinationName).toBeNull();
    expect(rows[0].responsibleName).toBe("Gaby");
  });

  it("Mov./Egresos de A: 5 filas (2 cobros, retiro viejo 'Retiros', egreso 700 'Varios', salida del traslado)", async () => {
    const { rows, total } = await getJson<MovHistoryBody>(
      `/movements-history?cashRegisterId=${cajaA.id}&limit=100`,
    );
    // 2 cobros + retiro viejo + egreso + salida del traslado = 5
    expect(total).toBe(5);
    expect(rows).toHaveLength(5);

    const porKind = (k: string) => rows.filter((r) => r.kind === k);
    expect(
      porKind("plan_charge")
        .map((r) => r.amount)
        .sort(),
    ).toEqual([1500, 2500]);
    const expenses = porKind("expense");
    expect(expenses).toHaveLength(2);
    const retiro = expenses.find((r) => r.id === retiroViejoId);
    expect(retiro?.amount).toBe(3000);
    expect(retiro?.costCenterName).toBe("Retiros");
    const egreso = expenses.find((r) => r.id !== retiroViejoId);
    expect(egreso?.amount).toBe(700);
    expect(egreso?.costCenterName).toBe("Varios");
    const traslados = porKind("cash_transfer");
    expect(traslados).toHaveLength(1);
    expect(traslados[0].direction).toBe("outflow");
    expect(traslados[0].amount).toBe(200);
    expect(traslados[0].responsibleName).toBeNull();
  });

  it("Resumen del mes e ingresos por sede: 7000 / 4000 / 3000 / cheque 0", async () => {
    await expectIngresosIntactos();
  });

  it("Excel de Saldos: la Central dice 'Efectivo' y ninguna fila de este test dice 'Tesoro'", async () => {
    const tipos = await readSaldosExcel();
    expect(tipos.get(central.name)).toBe("Efectivo");
    expect(tipos.get(cajaA.name)).toBe("Efectivo");
    expect(tipos.get(banco.name)).toBe("Banco");
    for (const name of [central.name, cajaA.name, banco.name]) {
      expect(tipos.get(name)).not.toBe("Tesoro");
    }
  });
});

// ─── Parte 2: convivencia con lo nuevo ───────────────────────────────────

describe("208-11 parte 2: Tesoro, cuenta USD y retiro nuevo conviven sin mover ingresos", () => {
  it("alta de Tesoro ARS (apertura 0) y de cuenta banco USD: ningún total ARS ni de ingresos se mueve", async () => {
    const t = (await postJson(
      "/cash-registers/treasury",
      { name: `Tesoro NR208 ${suf}`, currency: "ARS", openingBalance: 0 },
      201,
    )) as { caja: { cashRegisterId: number; name: string } };
    tesoro = { id: t.caja.cashRegisterId, name: t.caja.name };
    createdCajaIds.push(tesoro.id);

    const u = (await postJson(
      "/cash-registers",
      {
        bankName: "Banco NR208 USD",
        accountHolder: "El Templo",
        currency: "USD",
        accountAlias: `nr208.usd.${suf}`,
      },
      201,
    )) as { account: { id: number } };
    bancoUsdId = u.account.id;
    createdCajaIds.push(bancoUsdId);

    const b = await balances();
    // Los ARS quedan EXACTAMENTE como en la parte 1
    expect(b.get(cajaA.id)?.firmeBalance).toBe(100);
    expect(b.get(central.id)?.firmeBalance).toBe(200);
    expect(b.get(banco.id)?.firmeBalance).toBe(3000);
    // El Tesoro arranca en 0 y la cuenta USD aparece aparte, en su moneda
    expect(b.get(tesoro.id)?.firmeBalance).toBe(0);
    expect(b.get(tesoro.id)?.isTreasury).toBe(true);
    expect(b.get(bancoUsdId)?.currency).toBe("USD");
    expect(b.get(bancoUsdId)?.firmeBalance).toBe(0);
    await expectIngresosIntactos();
  });

  it("retiro NUEVO de 100 de A a la Central: A 0, Central 300, Tesoro 0, ingresos intactos", async () => {
    const res = (await postJson(
      "/withdrawals",
      {
        cajaId: cajaA.id,
        destinationCashRegisterId: central.id,
        responsibleName: "Martín",
        transactionDate: day,
        amount: 100,
        notes: "retiro-nuevo-208-11",
      },
      201,
    )) as { withdrawal: { id: number; format: string } };
    retiroNuevoId = res.withdrawal.id;
    expect(res.withdrawal.format).toBe("transfer");

    // 100 − 100 (retiro nuevo)
    expect(await firme(cajaA.id)).toBe(0);
    // 200 + 100 (pata de entrada)
    expect(await firme(central.id)).toBe(300);
    expect(await firme(tesoro.id)).toBe(0);
    expect(await firme(banco.id)).toBe(3000);
    await expectIngresosIntactos();
  });

  it("Historial de retiros de A: 2 (el nuevo primero), sin la pata de entrada y sin duplicar", async () => {
    const { rows, total } = await getJson<WithdrawalListBody>(
      `/withdrawals?cashRegisterId=${cajaA.id}`,
    );
    expect(total).toBe(2);
    expect(rows.map((r) => r.id)).toEqual([retiroNuevoId, retiroViejoId]);
    expect(rows[0].format).toBe("transfer");
    expect(rows[0].amount).toBe(100);
    expect(rows[0].destinationName).toBe(central.name);
    expect(rows[0].paymentCount).toBe(0);
    expect(rows[1].format).toBe("legacy_expense");
    expect(rows[1].destinationName).toBeNull();
    expect(rows[1].paymentCount).toBe(2);

    // La Central no lista la pata de entrada como retiro propio
    const enCentral = await getJson<WithdrawalListBody>(
      `/withdrawals?cashRegisterId=${central.id}`,
    );
    expect(enCentral.total).toBe(0);

    // El resumen del cajón de A reconoce al nuevo como último retiro
    const pend = await getJson<PendingBody>(
      `/withdrawals/pending?cashRegisterId=${cajaA.id}`,
    );
    expect(pend.summary.lastWithdrawal?.id).toBe(retiroNuevoId);
    expect(pend.summary.lastWithdrawal?.amount).toBe(100);
    expect(pend.summary.firmeBalance).toBe(0);
  });

  it("el retiro nuevo no usa el centro 'Retiros' ni es egreso: Mov./Egresos de A lo ve como traslado con responsable", async () => {
    const { rows, total } = await getJson<MovHistoryBody>(
      `/movements-history?cashRegisterId=${cajaA.id}&limit=100`,
    );
    // las 5 de la parte 1 + la salida del retiro nuevo
    expect(total).toBe(6);
    const salida = rows.find((r) => r.id === retiroNuevoId);
    expect(salida?.kind).toBe("cash_transfer");
    expect(salida?.direction).toBe("outflow");
    expect(salida?.amount).toBe(100);
    expect(salida?.responsibleName).toBe("Martín");
    expect(salida?.costCenterName).toBeNull();
    // Siguen siendo 2 egresos (el viejo y el de 700): el nuevo no suma como egreso
    expect(rows.filter((r) => r.kind === "expense")).toHaveLength(2);
  });

  it("arqueo de apertura de la Central: con 300 no hay ajuste, con 350 hay +50 y queda en 350", async () => {
    const igual = (await postJson(
      `/cash-registers/${central.id}/opening-count`,
      { countedAmount: 300 },
      201,
    )) as {
      openingCount: {
        difference: number;
        adjustmentTxId: number | null;
        firmeBalance: number;
      };
    };
    expect(igual.openingCount.difference).toBe(0);
    expect(igual.openingCount.adjustmentTxId).toBeNull();
    expect(await firme(central.id)).toBe(300);

    const sobrante = (await postJson(
      `/cash-registers/${central.id}/opening-count`,
      { countedAmount: 350 },
      201,
    )) as {
      openingCount: {
        difference: number;
        adjustmentTxId: number | null;
        firmeBalance: number;
      };
    };
    // 350 contado − 300 esperado
    expect(sobrante.openingCount.difference).toBe(50);
    expect(sobrante.openingCount.adjustmentTxId).not.toBeNull();
    expect(sobrante.openingCount.firmeBalance).toBe(350);
    expect(await firme(central.id)).toBe(350);
    // El ajuste de apertura no es un ingreso
    await expectIngresosIntactos();
  });

  it("anular el retiro VIEJO (POST /expenses/:id/void): A vuelve a 3000 y sus dos cobros quedan pendientes de retiro", async () => {
    await postJson(
      `/expenses/${retiroViejoId}/void`,
      { reason: "208-11" },
      200,
    );
    // 0 + 3000 (el retiro viejo deja de restar)
    expect(await firme(cajaA.id)).toBe(3000);
    // La Central no se toca: el retiro viejo no entraba a ninguna cuenta
    expect(await firme(central.id)).toBe(350);

    const pend = await getJson<PendingBody>(
      `/withdrawals/pending?cashRegisterId=${cajaA.id}`,
    );
    expect(pend.rows.map((r) => r.id).sort((a, b) => a - b)).toEqual(
      [cobroEfectivo1500, cobroEfectivo2500].sort((a, b) => a - b),
    );
    // El historial sigue mostrando los dos (el anulado con su marca): el viejo
    // anulado, el nuevo vivo, y el resumen del cajón ya solo ve al nuevo.
    const lista = await getJson<WithdrawalListBody>(
      `/withdrawals?cashRegisterId=${cajaA.id}`,
    );
    expect(lista.rows.map((r) => r.id)).toEqual([retiroNuevoId, retiroViejoId]);
    expect(lista.rows[0].voidedAt).toBeNull();
    expect(lista.rows[1].voidedAt).not.toBeNull();
    expect(pend.summary.lastWithdrawal?.id).toBe(retiroNuevoId);
    await expectIngresosIntactos();
  });

  it("anular el retiro NUEVO: A 3100 y la Central 250 (350 − 100), ingresos intactos", async () => {
    await postJson(
      `/expenses/${retiroNuevoId}/void`,
      { reason: "208-11" },
      200,
    );
    // 3000 + 100 (vuelve a la sede)
    expect(await firme(cajaA.id)).toBe(3100);
    // 350 − 100 (sale del destino)
    expect(await firme(central.id)).toBe(250);
    expect(await firme(tesoro.id)).toBe(0);
    expect(await firme(banco.id)).toBe(3000);
    await expectIngresosIntactos();
  });

  it("Excel de Saldos con Tesoro: el Tesoro dice 'Tesoro', la Central sigue 'Efectivo'", async () => {
    const tipos = await readSaldosExcel();
    expect(tipos.get(tesoro.name)).toBe("Tesoro");
    expect(tipos.get(central.name)).toBe("Efectivo");
  });
});
