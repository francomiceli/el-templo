/**
 * Fase 208-02 — Cuentas en USD, Tesoro y caja de efectivo del cobro por moneda.
 *
 * Cubre (DI-01, DI-02, DI-09):
 *   - altas de cuenta banco y de caja de efectivo en USD (y rechazo de una
 *     moneda fuera de ARS/EUR/USD)
 *   - el cobro en efectivo ARS cae en la caja ARS aunque la sede tenga también
 *     una caja USD, sin depender del orden de id
 *   - Saldos informa la moneda y `isTreasury` por fila; USD no toca a ARS
 *   - alta del Tesoro (owner-only): saldo de apertura exacto, uno activo por
 *     moneda, validaciones de body
 *   - scope: gestión no ve ni la Central ni el Tesoro; el owner sí
 *   - Excel de Saldos: Tesoro dice "Tesoro", Central sigue diciendo "Efectivo"
 *
 * Corre contra la DB de test por worker. `cash_registers` no está en
 * TABLES_TO_CLEAN: el archivo desactiva los Tesoros previos del gimnasio 1 antes
 * de empezar y limpia lo que crea al terminar.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { Workbook } from "exceljs";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  registerUser,
  todayStr,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const BASE = "/api/admin/finance";
const TODAY = "2026-04-28";

interface CajaSaldoRow {
  cashRegisterId: number;
  name: string;
  type: "efectivo" | "banco";
  branchId: number | null;
  currency: string;
  isTreasury: boolean;
  firmeBalance: number;
  pendienteAmount: number;
}

let app: FastifyInstance;
let ownerToken: string;
let gestionToken: string;
let adminToken: string;
let adminSedeToken: string;
let memberId: number;

/** Sede propia del archivo: sin cajas previas, así no choca con otros suites. */
let branchA: number;
let branchB: number;

const suf = Date.now().toString(36).slice(-6);
const createdCajaIds: number[] = [];
let centralId: number;
let centralName: string;

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(
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

/** Alta de caja efectivo; registra el id para la limpieza. */
async function crearEfectivo(
  branchId: number,
  currency: string,
  openingBalance?: number,
) {
  const res = await post(ownerToken, "/cash-registers/efectivo", {
    branchId,
    currency,
    ...(openingBalance === undefined ? {} : { openingBalance }),
  });
  if (res.statusCode === 201) {
    createdCajaIds.push(JSON.parse(res.body).caja.cashRegisterId as number);
  }
  return res;
}

async function crearTesoro(payload: Record<string, unknown>, token?: string) {
  const res = await post(
    token ?? ownerToken,
    "/cash-registers/treasury",
    payload,
  );
  if (res.statusCode === 201) {
    createdCajaIds.push(JSON.parse(res.body).caja.cashRegisterId as number);
  }
  return res;
}

async function fetchBalances(token: string): Promise<CajaSaldoRow[]> {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/cash-registers/balances`,
    headers: authed(token),
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  return JSON.parse(res.body) as CajaSaldoRow[];
}

/** Cobro en efectivo (ajuste de entrada sin links) en la sede y moneda dadas. */
async function cobrarEnEfectivo(
  branchId: number,
  currency: string,
  amount: number,
) {
  return post(ownerToken, "/transactions", {
    memberId,
    kind: "adjustment",
    direction: "inflow",
    amount,
    currency,
    paymentMethod: "cash",
    transactionDate: TODAY,
    effectiveDate: TODAY,
    branchId,
    notes: null,
    links: [],
  });
}

async function cajaDeLaTransaccion(txId: number): Promise<number | null> {
  const [fila] = await app.db
    .select({ cashRegisterId: schema.financialTransactions.cashRegisterId })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.id, txId),
      ),
    )
    .limit(1);
  return fila?.cashRegisterId ?? null;
}

async function desactivarTesorosDelTemplo(): Promise<void> {
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

async function crearSede(code: string, name: string): Promise<number> {
  const [b] = await app.db
    .insert(schema.branches)
    .values({
      name,
      code,
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  return b.id;
}

beforeAll(async () => {
  app = await createTestApp();

  // Los Tesoros activos que dejó otro archivo del worker harían 409 el alta.
  await desactivarTesorosDelTemplo();

  // admin@test.com es OWNER (test/setup.ts).
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  branchA = await crearSede(`UA${suf}`, `Sede USD A ${suf}`);
  branchB = await crearSede(`UB${suf}`, `Sede USD B ${suf}`);

  for (const [role, email] of [
    ["gestion", `gestion-usd-${suf}@test.local`],
    ["admin", `admin-usd-${suf}@test.local`],
    ["admin_sede", `adminsede-usd-${suf}@test.local`],
  ] as const) {
    await createStaffUser(app, {
      email,
      password: "pass123456",
      firstName: role,
      lastName: "USD",
      role,
      branchId: branchA,
      country: "AR",
    });
  }
  gestionToken = await getAuthToken(
    app,
    `gestion-usd-${suf}@test.local`,
    "pass123456",
  );
  adminToken = await getAuthToken(
    app,
    `admin-usd-${suf}@test.local`,
    "pass123456",
  );
  adminSedeToken = await getAuthToken(
    app,
    `adminsede-usd-${suf}@test.local`,
    "pass123456",
  );

  const member = await registerUser(app, {
    email: `usd-member-${suf}@test.local`,
    password: "TestPass123!",
    firstName: "Usd",
    lastName: "Member",
    branchId: branchA,
  });
  memberId = (member.user as { id: number }).id;

  // Caja central propia (efectivo sin sede, NO tesoro) con nombre único, en vez
  // de depender de la "Efectivo Central" sembrada por la migración 0154.
  centralName = `Central USD ${suf}`;
  const [central] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: centralName,
        type: "efectivo",
        branchId: null,
        currency: "ARS",
        // Con saldo: registerMovement rechaza dejar una caja en negativo.
        openingBalance: 1000,
        cutoffDate: "2020-01-01",
      }),
    )
    .$returningId();
  centralId = central.id;
  createdCajaIds.push(centralId);
});

afterAll(async () => {
  // Los movimientos y cobros del archivo cuelgan de las cajas: primero las
  // transacciones (con sus links, hijos del FK) y recién después las cajas.
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
    // Las cajas se desactivan (no se borran): otras tablas pueden referenciarlas
    // y a los demás suites les alcanza con que no aparezcan como activas.
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
  await desactivarTesorosDelTemplo();
  await app.close();
});

describe("208-02: cuenta banco en USD", () => {
  it("crea una cuenta banco USD → 201 y account.currency USD", async () => {
    const res = await post(ownerToken, "/cash-registers", {
      bankName: "Banco Galicia",
      accountHolder: "El Templo SA",
      currency: "USD",
      accountAlias: `templo.usd.${suf}`,
    });
    expect(res.statusCode, res.body).toBe(201);
    const account = JSON.parse(res.body).account as {
      id: number;
      currency: string;
    };
    createdCajaIds.push(account.id);
    expect(account.currency).toBe("USD");
  });

  it("una moneda fuera de ARS/EUR/USD → 400", async () => {
    const res = await post(ownerToken, "/cash-registers", {
      bankName: "Banco Galicia",
      accountHolder: "El Templo SA",
      currency: "XYZ",
      accountAlias: `templo.xyz.${suf}`,
    });
    expect(res.statusCode, res.body).toBe(400);
  });
});

describe("208-02: caja de efectivo de sede en USD", () => {
  it("una sede con caja ARS puede abrir también una USD → 201; repetir USD → 409", async () => {
    const ars = await crearEfectivo(branchA, "ARS", 250.75);
    expect(ars.statusCode, ars.body).toBe(201);

    const usd = await crearEfectivo(branchA, "USD");
    expect(usd.statusCode, usd.body).toBe(201);
    const caja = JSON.parse(usd.body).caja as CajaSaldoRow;
    expect(caja.currency).toBe("USD");
    expect(caja.isTreasury).toBe(false);

    const repetida = await crearEfectivo(branchA, "USD");
    expect(repetida.statusCode, repetida.body).toBe(409);
  });

  it("una moneda inválida de 3 letras (antes aceptada) → 400", async () => {
    const res = await crearEfectivo(branchB, "XYZ");
    expect(res.statusCode, res.body).toBe(400);
  });
});

describe("208-02: el cobro en efectivo cae en la caja de su moneda", () => {
  it("sede con cajas ARS y USD (ARS primero): el cobro ARS va a la caja ARS", async () => {
    const [arsCaja] = await app.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          eq(schema.cashRegisters.branchId, branchA),
          eq(schema.cashRegisters.currency, "ARS"),
          eq(schema.cashRegisters.isActive, true),
        ),
      )
      .limit(1);

    const res = await cobrarEnEfectivo(branchA, "ARS", 500);
    expect(res.statusCode, res.body).toBe(201);
    const txId = JSON.parse(res.body).transaction.id as number;
    expect(await cajaDeLaTransaccion(txId)).toBe(arsCaja.id);
  });

  it("sede con la caja USD creada ANTES que la ARS (id invertido): el cobro ARS sigue yendo a la ARS", async () => {
    const usd = await crearEfectivo(branchB, "USD");
    expect(usd.statusCode, usd.body).toBe(201);
    const ars = await crearEfectivo(branchB, "ARS");
    expect(ars.statusCode, ars.body).toBe(201);
    const arsId = JSON.parse(ars.body).caja.cashRegisterId as number;
    const usdId = JSON.parse(usd.body).caja.cashRegisterId as number;
    expect(usdId).toBeLessThan(arsId);

    const res = await cobrarEnEfectivo(branchB, "ARS", 700);
    expect(res.statusCode, res.body).toBe(201);
    const txId = JSON.parse(res.body).transaction.id as number;
    expect(await cajaDeLaTransaccion(txId)).toBe(arsId);
  });

  it("un cobro EUR en una sede que solo tiene cajas ARS y USD → 400 'Moneda inconsistente'", async () => {
    const res = await cobrarEnEfectivo(branchA, "EUR", 100);
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).toContain("Moneda inconsistente");
  });
});

describe("208-02: Saldos por caja con USD", () => {
  it("el owner ve la caja USD con currency USD e isTreasury false; el saldo ARS no cambia", async () => {
    const filas = await fetchBalances(ownerToken);
    const usd = filas.find(
      (f) => f.branchId === branchA && f.currency === "USD",
    );
    const ars = filas.find(
      (f) => f.branchId === branchA && f.currency === "ARS",
    );
    expect(usd, "falta la caja USD en Saldos").toBeDefined();
    expect(ars, "falta la caja ARS en Saldos").toBeDefined();
    expect(usd?.isTreasury).toBe(false);
    expect(usd?.firmeBalance).toBe(0);
    // Apertura 250,75 + (cobro de 500 si ya está validado): lo que importa es
    // que NO incluya nada de la caja USD ni se mezcle con ella.
    expect(ars?.currency).toBe("ARS");
    expect(ars?.isTreasury).toBe(false);
    expect(ars?.cashRegisterId).not.toBe(usd?.cashRegisterId);
    expect([250.75, 750.75]).toContain(ars?.firmeBalance);
  });
});

describe("208-02: alta de Tesoro", () => {
  it("el owner crea un Tesoro ARS con saldo de apertura exacto → 201", async () => {
    const res = await crearTesoro({
      name: "Tesoro ARS",
      currency: "ARS",
      openingBalance: 1500.75,
    });
    expect(res.statusCode, res.body).toBe(201);
    const caja = JSON.parse(res.body).caja as CajaSaldoRow;
    expect(caja.type).toBe("efectivo");
    expect(caja.branchId).toBeNull();
    expect(caja.isTreasury).toBe(true);
    expect(caja.currency).toBe("ARS");
    expect(caja.firmeBalance).toBe(1500.75);

    const [fila] = await app.db
      .select({
        isTreasury: schema.cashRegisters.isTreasury,
        cutoffDate: schema.cashRegisters.cutoffDate,
        branchId: schema.cashRegisters.branchId,
      })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          eq(schema.cashRegisters.id, caja.cashRegisterId),
        ),
      )
      .limit(1);
    expect(Boolean(fila.isTreasury)).toBe(true);
    expect(fila.branchId).toBeNull();
    expect(String(fila.cutoffDate).slice(0, 10)).toBe(todayStr());
  });

  it("un segundo Tesoro ARS activo → 409; uno USD (otra moneda) → 201", async () => {
    const dup = await crearTesoro({ name: "Otro ARS", currency: "ARS" });
    expect(dup.statusCode, dup.body).toBe(409);

    const usd = await crearTesoro({
      name: "Tesoro USD",
      currency: "USD",
      openingBalance: 300,
    });
    expect(usd.statusCode, usd.body).toBe(201);
    expect((JSON.parse(usd.body).caja as CajaSaldoRow).currency).toBe("USD");
  });

  it("un Tesoro cerrado no bloquea el alta de uno nuevo de la misma moneda", async () => {
    const [activo] = await app.db
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          eq(schema.cashRegisters.isTreasury, true),
          eq(schema.cashRegisters.currency, "USD"),
          eq(schema.cashRegisters.isActive, true),
        ),
      )
      .limit(1);
    await app.db
      .update(schema.cashRegisters)
      .set({ isActive: false })
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          eq(schema.cashRegisters.id, activo.id),
        ),
      );
    const res = await crearTesoro({
      name: "Tesoro USD nuevo",
      currency: "USD",
    });
    expect(res.statusCode, res.body).toBe(201);
  });

  it("valida el body: nombre en blanco, moneda inválida y centavos de más → 400", async () => {
    const enBlanco = await crearTesoro({ name: "   ", currency: "EUR" });
    expect(enBlanco.statusCode, enBlanco.body).toBe(400);

    const moneda = await crearTesoro({ name: "X", currency: "XYZ" });
    expect(moneda.statusCode, moneda.body).toBe(400);

    const centavos = await crearTesoro({
      name: "X",
      currency: "EUR",
      openingBalance: 1.005,
    });
    expect(centavos.statusCode, centavos.body).toBe(400);
  });

  it("un campo extra (branchId) se descarta: el Tesoro nace SIN sede igual", async () => {
    // Fastify usa Ajv con removeAdditional: additionalProperties:false recorta
    // en vez de rechazar. Lo que importa es que la sede del body no llega al INSERT.
    const res = await crearTesoro({
      name: "Con sede espuria",
      currency: "EUR",
      branchId: branchA,
    });
    expect(res.statusCode, res.body).toBe(201);
    const caja = JSON.parse(res.body).caja as CajaSaldoRow;
    expect(caja.branchId).toBeNull();
    expect(caja.isTreasury).toBe(true);

    const [fila] = await app.db
      .select({ branchId: schema.cashRegisters.branchId })
      .from(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          eq(schema.cashRegisters.id, caja.cashRegisterId),
        ),
      )
      .limit(1);
    expect(fila.branchId).toBeNull();
  });

  it("admin, gestión y admin_sede no pueden crear un Tesoro → 403", async () => {
    for (const token of [adminToken, gestionToken, adminSedeToken]) {
      const res = await crearTesoro(
        { name: "No debería", currency: "EUR" },
        token,
      );
      expect(res.statusCode, res.body).toBe(403);
    }
  });
});

describe("208-02: scope owner-only de Central y Tesoro", () => {
  it("gestión NO ve la Central ni el Tesoro en Saldos; el owner sí (Central con isTreasury false)", async () => {
    const delOwner = await fetchBalances(ownerToken);
    const tesoroOwner = delOwner.filter((f) => f.isTreasury);
    expect(tesoroOwner.length).toBeGreaterThanOrEqual(1);
    const central = delOwner.find((f) => f.cashRegisterId === centralId);
    expect(central, "la Central debe verla el owner").toBeDefined();
    expect(central?.isTreasury).toBe(false);

    const delGestion = await fetchBalances(gestionToken);
    expect(delGestion.some((f) => f.isTreasury)).toBe(false);
    expect(delGestion.some((f) => f.cashRegisterId === centralId)).toBe(false);
    // Ninguna cuenta sin sede (banco / Central / Tesoro) para un no-owner.
    expect(delGestion.every((f) => f.branchId !== null)).toBe(true);
  });

  it("Central → Tesoro (owner, 100,50): el Tesoro sube exacto; gestión recibe 404", async () => {
    const tesoro = (await fetchBalances(ownerToken)).find(
      (f) => f.isTreasury && f.currency === "ARS",
    );
    expect(tesoro).toBeDefined();
    const antes = tesoro?.firmeBalance ?? 0;

    const denegado = await post(gestionToken, "/movements", {
      origenCajaId: centralId,
      destinoCajaId: tesoro?.cashRegisterId ?? 0,
      amount: 100.5,
    });
    expect(denegado.statusCode, denegado.body).toBe(404);

    const res = await post(ownerToken, "/movements", {
      origenCajaId: centralId,
      destinoCajaId: tesoro?.cashRegisterId ?? 0,
      amount: 100.5,
    });
    expect(res.statusCode, res.body).toBe(201);

    const despues = (await fetchBalances(ownerToken)).find(
      (f) => f.cashRegisterId === tesoro?.cashRegisterId,
    );
    expect(despues?.firmeBalance).toBe(antes + 100.5);
  });
});

describe("208-02: Excel de Saldos", () => {
  it("la fila del Tesoro dice 'Tesoro' y la de la Central sigue diciendo 'Efectivo'", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${BASE}/cash-registers/balances/export`,
      headers: authed(ownerToken),
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
    expect(tipos.get(centralName)).toBe("Efectivo");
    expect(tipos.get("Tesoro ARS")).toBe("Tesoro");
    // Una caja de sede común también sigue diciendo "Efectivo".
    expect(tipos.get(`Sede USD A ${suf}`)).toBe("Efectivo");
  });
});
