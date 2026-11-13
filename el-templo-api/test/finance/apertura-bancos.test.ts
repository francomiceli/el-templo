/**
 * Fase 209.1-01 — Saldo de apertura de las cuentas bancarias.
 *
 * `POST /cash-registers/:id/opening-count` (arqueo de apertura de la 208) ahora
 * también acepta cuentas banco sin sede. Cubre:
 *   - saldo exacto: firme + pendiente = lo que dice el banco (mayor, menor, igual)
 *   - el ajuste es UN `adjustment` interno sin sede ni socio, con notas del banco
 *   - audit 'reconciliation' con `source = 'bank_opening_balance'`, siempre
 *   - fecha del ajuste = "hoy" del país de la cuenta (AR para ARS/USD, ES para EUR)
 *   - DI-04: Resumen de cobros, Ingresos por sede y Tablero no cambian con el ajuste
 *   - cuenta de baja, caja de sede, importe inválido → 400; admin/gestión/admin_sede → 403
 *   - aislamiento entre gimnasios y rama vieja de Central intacta
 *
 * Los `it` comparten estado (el banco de los primeros se va moviendo): van en
 * orden, dentro de `describe.sequential`.
 *
 * `cash_registers` no está en TABLES_TO_CLEAN: el archivo desactiva lo que crea.
 * Los `audit_log` de las cuentas del archivo se dejan (mismo criterio que
 * arqueo-apertura.test.ts): nadie más lee esas cuentas.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, createStaffUser, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  TENANT_TEMPLO,
  TENANT_DOS,
  seedSecondTenant,
  limpiarSegundoGimnasio,
  type SegundoGimnasio,
} from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { countryToday } from "../../src/modules/finance/expense-branches";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../../src/modules/finance";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const BASE = "/api/admin/finance";

interface OpeningCount {
  cashRegisterId: number;
  expectedAmount: number;
  countedAmount: number;
  difference: number;
  adjustmentTxId: number | null;
  firmeBalance: number;
}

interface CajaSaldoRow {
  cashRegisterId: number;
  firmeBalance: number;
  pendienteAmount: number;
}

interface MovItem {
  id: number;
  kind: string;
  direction: string;
  amount: number;
  notes: string | null;
}

let app: FastifyInstance;
let transactions: TransactionService;
let ownerToken: string;
let gestionToken: string;
let adminToken: string;
let adminSedeToken: string;
let ownerId: number;
let branchId: number;
let gym2: SegundoGimnasio;

const suf = Date.now().toString(36).slice(-6);
const createdCajaIds: number[] = [];

// Estado compartido del escenario principal (Banco ARS).
let bancoArs: number;
let pendienteTxId: number;
let hoyAR: string;
let desdeMes: string;
let fotoAntes: Foto;

interface Foto {
  summary: unknown;
  incomeByBranch: unknown;
  tablero: Record<string, Record<string, number>>;
}

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

function arquear(
  token: string,
  cajaId: number,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: `${BASE}/cash-registers/${cajaId}/opening-count`,
    headers: authed(token),
    payload,
  });
}

/** Cuenta propia del test: sin sede, corte viejo, saldo de apertura dado. */
async function nuevaCuenta(
  type: "banco" | "efectivo",
  currency: "ARS" | "USD" | "EUR",
  opening: number,
  extra: { isActive?: boolean; branchId?: number | null } = {},
): Promise<number> {
  const [row] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `Apertura ${type} ${currency} ${suf} ${createdCajaIds.length}`,
        type,
        branchId: extra.branchId ?? null,
        currency,
        openingBalance: opening,
        cutoffDate: "2020-01-01",
        isActive: extra.isActive ?? true,
      }),
    )
    .$returningId();
  createdCajaIds.push(row.id);
  return row.id;
}

/** Cobro por transferencia al banco, con sede propia del test. */
async function sembrarCobro(
  cajaId: number,
  amount: number,
  validationStatus: "validado" | "pendiente",
): Promise<number> {
  const [row] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(TEMPLO_CTX, {
        memberId: null,
        kind: "plan_charge",
        direction: "inflow",
        amount,
        currency: "ARS",
        paymentMethod: "transfer",
        transactionDate: hoyAR,
        effectiveDate: hoyAR,
        branchId,
        cashRegisterId: cajaId,
        recordedBy: ownerId,
        validationStatus,
      }),
    )
    .$returningId();
  return row.id;
}

async function ajustesDe(cajaId: number) {
  return app.db
    .select({
      id: schema.financialTransactions.id,
      kind: schema.financialTransactions.kind,
      direction: schema.financialTransactions.direction,
      amount: schema.financialTransactions.amount,
      currency: schema.financialTransactions.currency,
      paymentMethod: schema.financialTransactions.paymentMethod,
      branchId: schema.financialTransactions.branchId,
      memberId: schema.financialTransactions.memberId,
      recordedBy: schema.financialTransactions.recordedBy,
      notes: schema.financialTransactions.notes,
      transactionDate: schema.financialTransactions.transactionDate,
    })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.cashRegisterId, cajaId),
        eq(schema.financialTransactions.kind, "adjustment"),
      ),
    )
    .orderBy(schema.financialTransactions.id);
}

async function totalFilasDe(cajaId: number): Promise<number> {
  const filas = await app.db
    .select({ id: schema.financialTransactions.id })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.cashRegisterId, cajaId),
      ),
    );
  return filas.length;
}

async function auditsDe(cajaId: number) {
  return app.db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      targetKind: schema.auditLog.targetKind,
      targetId: schema.auditLog.targetId,
      actorId: schema.auditLog.actorId,
      payloadJson: schema.auditLog.payloadJson,
    })
    .from(schema.auditLog)
    .where(
      and(
        tenantWhere(schema.auditLog, TEMPLO_CTX),
        eq(schema.auditLog.action, "reconciliation"),
        eq(schema.auditLog.targetKind, "cash_register"),
        eq(schema.auditLog.targetId, cajaId),
      ),
    )
    .orderBy(schema.auditLog.id);
}

async function saldoDe(cajaId: number): Promise<CajaSaldoRow> {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/cash-registers/balances`,
    headers: authed(ownerToken),
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  const fila = (JSON.parse(res.body) as CajaSaldoRow[]).find(
    (r) => r.cashRegisterId === cajaId,
  );
  expect(fila, `la cuenta ${cajaId} no aparece en Saldos`).toBeDefined();
  return fila as CajaSaldoRow;
}

async function getJson(url: string): Promise<unknown> {
  const res = await app.inject({
    method: "GET",
    url,
    headers: authed(ownerToken),
  });
  expect(res.statusCode, `${url}: ${res.body.slice(0, 300)}`).toBe(200);
  return JSON.parse(res.body);
}

/** Las tres lecturas de ingresos que el ajuste de un banco no puede mover. */
async function sacarFoto(): Promise<Foto> {
  const rango = `dateFrom=${desdeMes}&dateTo=${hoyAR}`;
  const summary = await getJson(`${BASE}/transactions/summary?${rango}`);
  const incomeByBranch = await getJson(
    `${BASE}/transactions/income-by-branch?${rango}`,
  );
  const porSede = await transactions.getIncomeByMemberBranch(TEMPLO_CTX, {
    dateFrom: desdeMes,
    dateTo: hoyAR,
  });
  // Map<sede, Map<moneda, monto>> → objeto plano comparable con toEqual.
  const tablero: Record<string, Record<string, number>> = {};
  for (const [sede, monedas] of porSede) {
    tablero[String(sede)] = Object.fromEntries(monedas);
  }
  return { summary, incomeByBranch, tablero };
}

beforeAll(async () => {
  app = await createTestApp();
  transactions = new TransactionService(
    app.db,
    app.log,
    new BalanceService(app.db, app.log),
    new CashRegisterService(app.db, app.log),
  );

  // admin@test.com es OWNER (test/setup.ts).
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
  if (!owner) throw new Error("No está el owner admin@test.com sembrado");
  ownerId = owner.id;

  const [b] = await app.db
    .insert(schema.branches)
    .values({
      name: `Sede Apertura Banco ${suf}`,
      code: `AB${suf}`,
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  branchId = b.id;

  for (const [role, email] of [
    ["gestion", `gestion-ab-${suf}@test.local`],
    ["admin", `admin-ab-${suf}@test.local`],
    ["admin_sede", `admin-sede-ab-${suf}@test.local`],
  ] as const) {
    await createStaffUser(app, {
      email,
      password: "pass123456",
      firstName: role,
      lastName: "Apertura",
      role,
      branchId,
      country: "AR",
    });
  }
  gestionToken = await getAuthToken(
    app,
    `gestion-ab-${suf}@test.local`,
    "pass123456",
  );
  adminToken = await getAuthToken(
    app,
    `admin-ab-${suf}@test.local`,
    "pass123456",
  );
  adminSedeToken = await getAuthToken(
    app,
    `admin-sede-ab-${suf}@test.local`,
    "pass123456",
  );

  hoyAR = await countryToday(app.db, TEMPLO_CTX, "AR");
  desdeMes = `${hoyAR.slice(0, 8)}01`;

  // Banco ARS del escenario: 1000 + 500 validados y 300 pendiente (sin apertura).
  bancoArs = await nuevaCuenta("banco", "ARS", 0);
  await sembrarCobro(bancoArs, 1000, "validado");
  await sembrarCobro(bancoArs, 500, "validado");
  pendienteTxId = await sembrarCobro(bancoArs, 300, "pendiente");

  // Gimnasio 2 (solo para el test de aislamiento).
  gym2 = await seedSecondTenant(app);

  fotoAntes = await sacarFoto();
});

afterAll(async () => {
  if (createdCajaIds.length > 0) {
    const txIds = (
      await app.db
        .select({ id: schema.financialTransactions.id })
        .from(schema.financialTransactions)
        .where(
          and(
            tenantWhere(schema.financialTransactions, TEMPLO_CTX),
            inArray(
              schema.financialTransactions.cashRegisterId,
              createdCajaIds,
            ),
          ),
        )
    ).map((r) => r.id);
    if (txIds.length > 0) {
      await app.db
        .delete(schema.transactionLinks)
        .where(
          and(
            tenantWhere(schema.transactionLinks, TEMPLO_CTX),
            inArray(schema.transactionLinks.transactionId, txIds),
          ),
        );
      await app.db
        .delete(schema.financialTransactions)
        .where(
          and(
            tenantWhere(schema.financialTransactions, TEMPLO_CTX),
            inArray(schema.financialTransactions.id, txIds),
          ),
        );
    }
    await app.db
      .update(schema.cashRegisters)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, createdCajaIds),
        ),
      );
  }
  await limpiarSegundoGimnasio(app);
  await app.close();
});

describe.sequential("209.1-01: saldo de apertura de bancos", () => {
  it("el escenario arranca con firme 1500 y pendiente 300", async () => {
    const s = await saldoDe(bancoArs);
    expect(s.firmeBalance).toBe(1500);
    expect(s.pendienteAmount).toBe(300);
  });

  it("banco con 1200 (menor): ajuste de salida de 600, firme 900 y firme + pendiente = 1200", async () => {
    const res = await arquear(ownerToken, bancoArs, { countedAmount: 1200 });
    expect(res.statusCode, res.body).toBe(201);
    const oc = JSON.parse(res.body).openingCount as OpeningCount;
    expect(oc.cashRegisterId).toBe(bancoArs);
    expect(oc.expectedAmount).toBe(1800); // 1500 + 300
    expect(oc.countedAmount).toBe(1200);
    expect(oc.difference).toBe(-600); // 1200 − 1800
    expect(oc.firmeBalance).toBe(900); // 1500 − 600

    const ajustes = await ajustesDe(bancoArs);
    expect(ajustes).toHaveLength(1);
    expect(oc.adjustmentTxId).toBe(ajustes[0].id);
    expect(ajustes[0].direction).toBe("outflow");
    expect(ajustes[0].amount).toBe(600);

    const s = await saldoDe(bancoArs);
    expect(s.firmeBalance).toBe(900);
    expect(s.firmeBalance + s.pendienteAmount).toBe(1200); // 900 + 300
  });

  it("la fila del ajuste: sin sede ni socio, medio interno, recorded_by el owner, notas del banco y fecha del país", async () => {
    const [aj] = await ajustesDe(bancoArs);
    expect(aj.kind).toBe("adjustment");
    expect(aj.paymentMethod).toBe("internal");
    expect(aj.branchId).toBeNull();
    expect(aj.memberId).toBeNull();
    expect(aj.recordedBy).toBe(ownerId);
    expect(aj.notes).toBe(
      "Saldo de apertura del banco: la app tenía 1800, el banco 1200",
    );
    // El "hoy" de AR se calcula antes y después del request por si cruza la medianoche.
    const hoyDespues = await countryToday(app.db, TEMPLO_CTX, "AR");
    expect([hoyAR, hoyDespues]).toContain(String(aj.transactionDate));
  });

  it("la fila aparece en Movimientos de la cuenta con las notas del banco", async () => {
    const body = (await getJson(
      `${BASE}/movements-history?cashRegisterId=${bancoArs}`,
    )) as { rows: MovItem[] };
    const aj = body.rows.find((i) => i.kind === "adjustment");
    expect(aj, "el ajuste no está en Movimientos").toBeDefined();
    expect(aj?.direction).toBe("outflow");
    expect(aj?.amount).toBe(600);
    expect(aj?.notes).toBe(
      "Saldo de apertura del banco: la app tenía 1800, el banco 1200",
    );
  });

  it("audit_log: reconciliation con source bank_opening_balance, esperado, contado, diferencia y ajuste", async () => {
    const audits = await auditsDe(bancoArs);
    expect(audits).toHaveLength(1);
    const [aj] = await ajustesDe(bancoArs);
    expect(audits[0].actorId).toBe(ownerId);
    const p = audits[0].payloadJson as Record<string, unknown>;
    expect(p.source).toBe("bank_opening_balance");
    expect(p.cashRegisterId).toBe(bancoArs);
    expect(p.expected).toBe(1800);
    expect(p.counted).toBe(1200);
    expect(p.difference).toBe(-600);
    expect(p.adjustmentId).toBe(aj.id);
  });

  it("cargarlo de nuevo con 2000 (mayor): ajusta contra el saldo de ese momento, entrada de 800", async () => {
    const res = await arquear(ownerToken, bancoArs, { countedAmount: 2000 });
    expect(res.statusCode, res.body).toBe(201);
    const oc = JSON.parse(res.body).openingCount as OpeningCount;
    expect(oc.expectedAmount).toBe(1200); // 900 + 300
    expect(oc.difference).toBe(800); // 2000 − 1200
    expect(oc.firmeBalance).toBe(1700); // 900 + 800

    const ajustes = await ajustesDe(bancoArs);
    expect(ajustes).toHaveLength(2);
    expect(ajustes[1].direction).toBe("inflow");
    expect(ajustes[1].amount).toBe(800);
    const s = await saldoDe(bancoArs);
    expect(s.firmeBalance + s.pendienteAmount).toBe(2000); // 1700 + 300
  });

  it("con notas del usuario: las notas del ajuste terminan en '. Extracto del 13/11'", async () => {
    // Deja el banco en 2000 + 50 para que haya ajuste, y lo vuelve a 2000 abajo.
    const res = await arquear(ownerToken, bancoArs, {
      countedAmount: 2050,
      notes: "Extracto del 13/11",
    });
    expect(res.statusCode, res.body).toBe(201);
    const ajustes = await ajustesDe(bancoArs);
    expect(ajustes).toHaveLength(3);
    expect(ajustes[2].notes).toBe(
      "Saldo de apertura del banco: la app tenía 2000, el banco 2050. Extracto del 13/11",
    );
    expect(ajustes[2].amount).toBe(50);

    const vuelta = await arquear(ownerToken, bancoArs, { countedAmount: 2000 });
    expect(vuelta.statusCode, vuelta.body).toBe(201);
    expect(await ajustesDe(bancoArs)).toHaveLength(4); // salida de 50
  });

  it("igual (2000 otra vez): 201, sin ajuste nuevo pero con un audit más de diferencia 0", async () => {
    const filasAntes = await totalFilasDe(bancoArs);
    const auditsAntes = (await auditsDe(bancoArs)).length;
    const res = await arquear(ownerToken, bancoArs, { countedAmount: 2000 });
    expect(res.statusCode, res.body).toBe(201);
    const oc = JSON.parse(res.body).openingCount as OpeningCount;
    expect(oc.adjustmentTxId).toBeNull();
    expect(oc.difference).toBe(0);
    expect(await totalFilasDe(bancoArs)).toBe(filasAntes);
    const audits = await auditsDe(bancoArs);
    expect(audits).toHaveLength(auditsAntes + 1);
    const ultimo = audits[audits.length - 1].payloadJson as Record<
      string,
      unknown
    >;
    expect(ultimo.difference).toBe(0);
    expect(ultimo.source).toBe("bank_opening_balance");
  });

  it("DI-04: Resumen de cobros, Ingresos por sede y Tablero idénticos tras los ajustes del banco", async () => {
    const despues = await sacarFoto();
    expect(despues.summary).toEqual(fotoAntes.summary);
    expect(despues.incomeByBranch).toEqual(fotoAntes.incomeByBranch);
    expect(despues.tablero).toEqual(fotoAntes.tablero);
  });

  it("al validar el pendiente de 300, el firme queda en 2000 = lo que dice el banco", async () => {
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/transactions/${pendienteTxId}/validate`,
      headers: authed(ownerToken),
      payload: {},
    });
    expect(res.statusCode, res.body).toBe(200);
    const s = await saldoDe(bancoArs);
    expect(s.firmeBalance).toBe(2000); // 1700 + 300
    expect(s.pendienteAmount).toBe(0);
  });

  it("opening_balance y cutoff_date del banco no cambiaron", async () => {
    const [c] = await app.db
      .select({
        openingBalance: schema.cashRegisters.openingBalance,
        cutoffDate: schema.cashRegisters.cutoffDate,
      })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          eq(schema.cashRegisters.id, bancoArs),
        ),
      )
      .limit(1);
    expect(c.openingBalance).toBe(0);
    expect(String(c.cutoffDate)).toBe("2020-01-01");
  });

  it("banco EUR: entrada de 700 fechada con el hoy de España", async () => {
    const eur = await nuevaCuenta("banco", "EUR", 0);
    const res = await arquear(ownerToken, eur, { countedAmount: 700 });
    expect(res.statusCode, res.body).toBe(201);
    const [aj] = await ajustesDe(eur);
    expect(aj.direction).toBe("inflow");
    expect(aj.amount).toBe(700);
    expect(aj.currency).toBe("EUR");
    const hoyES = await countryToday(app.db, TEMPLO_CTX, "ES");
    expect(String(aj.transactionDate)).toBe(hoyES);
  });

  it("banco USD: el ajuste queda en USD", async () => {
    const usd = await nuevaCuenta("banco", "USD", 0);
    const res = await arquear(ownerToken, usd, { countedAmount: 50 });
    expect(res.statusCode, res.body).toBe(201);
    const [aj] = await ajustesDe(usd);
    expect(aj.currency).toBe("USD");
    expect(aj.amount).toBe(50);
    expect(aj.direction).toBe("inflow");
  });

  it("banco de baja → 400, sin ajuste ni audit", async () => {
    const baja = await nuevaCuenta("banco", "ARS", 100, { isActive: false });
    const res = await arquear(ownerToken, baja, { countedAmount: 50 });
    expect(res.statusCode, res.body).toBe(400);
    expect(await ajustesDe(baja)).toHaveLength(0);
    expect(await auditsDe(baja)).toHaveLength(0);
  });

  it("caja de efectivo de sede → 400, sin ajuste", async () => {
    const sede = await nuevaCuenta("efectivo", "ARS", 100, { branchId });
    const res = await arquear(ownerToken, sede, { countedAmount: 50 });
    expect(res.statusCode, res.body).toBe(400);
    expect(await ajustesDe(sede)).toHaveLength(0);
    expect(await auditsDe(sede)).toHaveLength(0);
  });

  it("importe -1, 10.5 o ausente → 400, sin ajuste ni audit", async () => {
    const banco = await nuevaCuenta("banco", "ARS", 100);
    for (const payload of [
      { countedAmount: -1 },
      { countedAmount: 10.5 },
      {},
    ]) {
      const res = await arquear(ownerToken, banco, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await ajustesDe(banco)).toHaveLength(0);
    expect(await auditsDe(banco)).toHaveLength(0);
  });

  it("admin, gestión y admin_sede → 403 y el firme del banco no cambia", async () => {
    const banco = await nuevaCuenta("banco", "ARS", 100);
    for (const token of [adminToken, gestionToken, adminSedeToken]) {
      const res = await arquear(token, banco, { countedAmount: 500 });
      expect(res.statusCode, res.body).toBe(403);
    }
    expect(await ajustesDe(banco)).toHaveLength(0);
    expect(await auditsDe(banco)).toHaveLength(0);
    expect((await saldoDe(banco)).firmeBalance).toBe(100);
  });

  it("aislamiento: el dueño del gimnasio 2 no puede cargar el saldo de un banco de El Templo", async () => {
    const banco = await nuevaCuenta("banco", "ARS", 100);
    const email = `owner-g2-ab-${suf}@test.com`;
    await createStaffUser(app, {
      email,
      password: "gym2-owner-123",
      firstName: "Owner",
      lastName: "Gimnasio Dos",
      role: "owner",
      branchId: gym2.branchId,
      tenantId: TENANT_DOS,
    });
    const token = await getAuthToken(app, email, "gym2-owner-123");
    const filasAntes = await totalFilasDe(banco);
    const res = await arquear(token, banco, { countedAmount: 5000 });
    expect([400, 404], res.body).toContain(res.statusCode);
    expect(await totalFilasDe(banco)).toBe(filasAntes);
    expect(await auditsDe(banco)).toHaveLength(0);
    expect((await saldoDe(banco)).firmeBalance).toBe(100);
  });

  it("Central de efectivo sin sede: la rama de siempre (notas y source opening_count)", async () => {
    const central = await nuevaCuenta("efectivo", "ARS", 300);
    const res = await arquear(ownerToken, central, { countedAmount: 350 });
    expect(res.statusCode, res.body).toBe(201);
    const [aj] = await ajustesDe(central);
    expect(aj.notes).toBe("Arqueo de apertura: esperado 300, contado 350");
    const audits = await auditsDe(central);
    expect(audits).toHaveLength(1);
    expect((audits[0].payloadJson as Record<string, unknown>).source).toBe(
      "opening_count",
    );
  });
});
