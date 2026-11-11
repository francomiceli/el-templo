/**
 * Fase 207 (plan 08) — formato de importe con 2 decimales en las exportaciones
 * Excel del circuito de caja (DI-05).
 *
 * Cubre las 7 hojas con importes:
 *   Caja, Bandeja, Saldos, Mov-Egresos (finance), Cobros y Deudas (reports) y
 *   Domiciliación SEPA (members).
 *
 * Con un cobro de 77570,82, uno pendiente de 100,10, un egreso de 0,30 y una
 * deuda de 1000,50, cada exportación trae la celda NUMÉRICA exacta (no texto,
 * no redondeada) y `numFmt === "#,##0.00"` en la columna de importe. Las
 * columnas que no son importe (Fecha, Moneda) no llevan ese formato.
 *
 * SEPA: `subscriptions.price_paid` es precio de catálogo y sigue entero
 * (DI-03), así que ahí se prueba un importe entero (45 EUR) con el formato.
 *
 * Corre contra la base de test por worker (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { Workbook } from "exceljs";
import type { Row, Worksheet } from "exceljs";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { MONEY_NUM_FMT } from "../../src/modules/shared/excel";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const FIN = "/api/admin/finance";
const REPORTS = "/api/admin/reports";
const CUTOFF = "2020-01-01";

const COBRO = 77570.82;
const PENDIENTE = 100.1;
const EGRESO = 0.3;
const DEUDA = 1000.5;
const APERTURA = 1000.1;
// apertura + cobro validado − egreso, exacto al centavo.
const FIRME_ESPERADO = 78570.62;

let app: FastifyInstance;
let ownerToken: string;
let ownerId: number;
let branchId: number;
let esBranchId: number;
let cajaId: number;
let memberId: number;

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

/** Pide un export y devuelve la hoja ya cargada con exceljs. */
async function loadSheet(url: string, sheetName: string): Promise<Worksheet> {
  const res = await app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${ownerToken}` },
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  const wb = new Workbook();
  await wb.xlsx.load(
    res.rawPayload as unknown as Parameters<Workbook["xlsx"]["load"]>[0],
  );
  const sheet = wb.getWorksheet(sheetName);
  expect(sheet).toBeDefined();
  return sheet as Worksheet;
}

/** Índice (1-based) de la columna por encabezado. */
function colOf(sheet: Worksheet, header: string): number {
  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value ?? "")));
  const idx = headers.indexOf(header);
  expect(idx, `columna "${header}" en ${headers.join(" | ")}`).toBeGreaterThan(
    -1,
  );
  return idx + 1;
}

/** Primera fila de datos cuya celda `header` vale exactamente `value`. */
function findRow(sheet: Worksheet, header: string, value: number): Row {
  const col = colOf(sheet, header);
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    if (row.getCell(col).value === value) return row;
  }
  throw new Error(`no hay fila con ${header} = ${value}`);
}

/** Afirma que la celda es numérica exacta y lleva el formato de importe. */
function expectMoney(
  sheet: Worksheet,
  header: string,
  value: number,
  rowKeyHeader = header,
): void {
  const row = findRow(sheet, rowKeyHeader, value);
  const cell = row.getCell(colOf(sheet, header));
  expect(typeof cell.value).toBe("number");
  expect(cell.value).toBe(value);
  expect(cell.numFmt).toBe(MONEY_NUM_FMT);
}

async function newCaja(): Promise<number> {
  const [caja] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `CXL-Test ${nextSuffix("C")}`,
        type: "efectivo" as const,
        branchId,
        currency: "ARS",
        openingBalance: APERTURA,
        cutoffDate: CUTOFF,
      }),
    )
    .$returningId();
  return caja.id;
}

async function seedCobro(
  amount: number,
  validationStatus: "validado" | "pendiente",
  subId: number | null,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const [tx] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        kind: "plan_charge" as const,
        direction: "inflow" as const,
        amount,
        currency: "ARS",
        paymentMethod: "cash" as const,
        transactionDate: today,
        effectiveDate: today,
        branchId,
        cashRegisterId: cajaId,
        recordedBy: ownerId,
        validationStatus,
      }),
    )
    .$returningId();
  if (subId !== null) {
    await app.db.insert(schema.transactionLinks).values(
      tenantValues(TEMPLO_CTX, {
        transactionId: tx.id,
        targetKind: "subscription" as const,
        targetId: subId,
        allocatedAmount: amount,
      }),
    );
  }
}

beforeAll(async () => {
  app = await createTestApp();
  await cleanAllTestData(app);
  // El ledger y la deuda no están en TABLES_TO_CLEAN: se vacían acotados al
  // gimnasio para que las hojas partan de cero.
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    for (const t of [
      "transaction_links",
      "financial_transactions",
      "debt_management",
      "balances",
    ]) {
      await conn.query(`DELETE FROM \`${t}\` WHERE tenant_id = ?`, [
        TENANT_TEMPLO,
      ]);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }

  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [owner] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  ownerId = owner.id;

  const [branch] = await app.db
    .insert(schema.branches)
    .values({
      name: "CXL-AR",
      code: nextSuffix("CX"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  branchId = branch.id;
  const [esBranch] = await app.db
    .insert(schema.branches)
    .values({
      name: "CXL-ES",
      code: nextSuffix("CY"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  esBranchId = esBranch.id;

  const member = await registerUser(app, {
    email: `cxl-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Excel",
    lastName: "Centavos",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "CXL Plan",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 10000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();
  const [sub] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberId,
      planId: plan.id,
      branchId,
      status: "active",
      startDate: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10),
      pricePaid: 10000,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();

  cajaId = await newCaja();
  await seedCobro(COBRO, "validado", sub.id);
  await seedCobro(PENDIENTE, "pendiente", null);

  // Deuda de 1000,50 sobre la suscripción (alimenta la hoja Deudas).
  await app.db.insert(schema.balances).values(
    tenantValues(TEMPLO_CTX, {
      memberId,
      targetKind: "subscription" as const,
      targetId: sub.id,
      currency: "ARS",
      amount: DEUDA,
    }),
  );

  // Egreso real por la API: 0,30 baja la caja y alimenta Mov-Egresos.
  const [existing] = await app.db
    .select({ id: schema.costCenters.id })
    .from(schema.costCenters)
    .where(
      and(
        tenantWhere(schema.costCenters, TEMPLO_CTX),
        eq(schema.costCenters.name, "Varios"),
        eq(schema.costCenters.country, "AR"),
        eq(schema.costCenters.isActive, true),
      ),
    )
    .limit(1);
  let costCenterId = existing?.id;
  if (costCenterId === undefined) {
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
    costCenterId = ins.id;
  }
  const exp = await app.inject({
    method: "POST",
    url: `${FIN}/expenses`,
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { costCenterId, cajaId, amount: EGRESO },
  });
  expect(exp.statusCode, exp.body).toBe(201);

  // SEPA: socio ES con membresía vigente de 45 EUR (price_paid es entero).
  const [planEs] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "CXL Plan ES",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 45,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      country: "ES",
      currency: "EUR",
    })
    .$returningId();
  const esMember = await registerUser(app, {
    email: `cxl-es-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Elena",
    lastName: "Excel",
    branchId: esBranchId,
  });
  await app.db.insert(schema.subscriptions).values({
    userId: (esMember.user as { id: number }).id,
    planId: planEs.id,
    branchId: esBranchId,
    status: "active",
    startDate: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 25 * 86400000).toISOString().slice(0, 10),
    pricePaid: 45,
    currency: "EUR",
    priceTypeApplied: "regular",
  });
});

afterAll(async () => {
  await app.db.execute(
    sql.raw(
      `DELETE FROM cash_counts WHERE tenant_id = ${TENANT_TEMPLO} AND cash_register_id = ${cajaId}`,
    ),
  );
  await app.close();
});

describe("Fase 207 — Excel con 2 decimales en importes", () => {
  it("Caja: 77570,82 es número exacto con formato de importe", async () => {
    const sheet = await loadSheet(`${FIN}/transactions/export`, "Caja");
    expectMoney(sheet, "Monto total", COBRO);
    expectMoney(sheet, "Monto total", PENDIENTE);
  });

  it("Bandeja: el pendiente de 100,10 es número exacto con formato", async () => {
    const sheet = await loadSheet(`${FIN}/pending-tray/export`, "Bandeja");
    expectMoney(sheet, "Monto", PENDIENTE);
  });

  it("Saldos: firme y pendiente con formato y valor exacto al centavo", async () => {
    const sheet = await loadSheet(
      `${FIN}/cash-registers/balances/export`,
      "Saldos",
    );
    // La fila de la caja de este test se identifica por el saldo firme único.
    expectMoney(sheet, "Saldo firme", FIRME_ESPERADO);
    const row = findRow(sheet, "Saldo firme", FIRME_ESPERADO);
    const pendiente = row.getCell(colOf(sheet, "Pendiente"));
    expect(pendiente.value).toBe(PENDIENTE);
    expect(pendiente.numFmt).toBe(MONEY_NUM_FMT);
  });

  it("Mov-Egresos: el egreso de 0,30 es número exacto con formato", async () => {
    const sheet = await loadSheet(
      `${FIN}/movements-history/export`,
      "Mov-Egresos",
    );
    expectMoney(sheet, "Monto", EGRESO);
  });

  it("Reportes → Cobros: 77570,82 es número exacto con formato", async () => {
    const sheet = await loadSheet(`${REPORTS}/charges/export`, "Cobros");
    expectMoney(sheet, "Monto", COBRO);
  });

  it("Reportes → Deudas: 1000,50 es número exacto con formato", async () => {
    const sheet = await loadSheet(
      `${REPORTS}/outstanding-balances/export`,
      "Deudas",
    );
    expectMoney(sheet, "Monto", DEUDA);
  });

  it("Domiciliación SEPA: el importe del último cobro tiene formato y es número", async () => {
    const sheet = await loadSheet(
      "/api/admin/members/export-sepa",
      "Domiciliación",
    );
    expectMoney(sheet, "Importe último cobro", 45);
  });

  it("las columnas que no son importe no llevan el formato de importe", async () => {
    const caja = await loadSheet(`${FIN}/transactions/export`, "Caja");
    const row = findRow(caja, "Monto total", COBRO);
    for (const header of ["Fecha", "Moneda", "Tipo"]) {
      const cell = row.getCell(colOf(caja, header));
      expect(cell.numFmt, header).not.toBe(MONEY_NUM_FMT);
    }

    const cobros = await loadSheet(`${REPORTS}/charges/export`, "Cobros");
    const cobroRow = findRow(cobros, "Monto", COBRO);
    for (const header of ["Fecha", "Moneda", "Plan"]) {
      const cell = cobroRow.getCell(colOf(cobros, header));
      expect(cell.numFmt, header).not.toBe(MONEY_NUM_FMT);
    }
  });
});
