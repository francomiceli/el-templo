/**
 * Fase 208-04 — Arqueo de apertura de Caja central y Tesoro (DI-06).
 *
 * Cubre:
 *   - el saldo firme queda EXACTO en lo contado (mayor, menor, igual, en
 *     pesos enteros) y la diferencia es un `adjustment` interno trazable (notas,
 *     recorded_by, created_at, sin sede)
 *   - audit 'reconciliation' (target_kind 'cash_register') SIEMPRE, con o sin ajuste
 *   - fondo de cambio: el esperado lo incluye
 *   - invariantes: no en caja de sede, caja cerrada ni antes del corte (400)
 *   - validaciones del body (decimales, negativo, faltante)
 *   - owner-only (403 para gestión y admin)
 *   - NO escribe en `cash_counts` (no abre temas en Oficina)
 *
 * Corre contra la DB de test por worker. `cash_registers` no está en
 * TABLES_TO_CLEAN: el archivo desactiva los Tesoros previos del gimnasio 1 antes
 * de empezar y desactiva lo que crea al terminar.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, createStaffUser, getAuthToken } from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

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
}

let app: FastifyInstance;
let ownerToken: string;
let gestionToken: string;
let adminToken: string;
let ownerId: number;
let branchId: number;

const suf = Date.now().toString(36).slice(-6);
const createdCajaIds: number[] = [];

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function arquear(
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

/** Central propia del test: efectivo sin sede, cutoff viejo, saldo de apertura dado. */
async function nuevaCentral(
  opening: number,
  extra: { changeFund?: number; cutoffDate?: string; isActive?: boolean } = {},
): Promise<number> {
  const [row] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name: `Central Arqueo ${suf} ${createdCajaIds.length}`,
        type: "efectivo",
        branchId: null,
        currency: "ARS",
        openingBalance: opening,
        changeFund: extra.changeFund ?? 0,
        cutoffDate: extra.cutoffDate ?? "2020-01-01",
        isActive: extra.isActive ?? true,
      }),
    )
    .$returningId();
  createdCajaIds.push(row.id);
  return row.id;
}

async function ajustesDe(cajaId: number) {
  return app.db
    .select({
      id: schema.financialTransactions.id,
      kind: schema.financialTransactions.kind,
      direction: schema.financialTransactions.direction,
      amount: schema.financialTransactions.amount,
      paymentMethod: schema.financialTransactions.paymentMethod,
      branchId: schema.financialTransactions.branchId,
      recordedBy: schema.financialTransactions.recordedBy,
      notes: schema.financialTransactions.notes,
      createdAt: schema.financialTransactions.createdAt,
    })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.cashRegisterId, cajaId),
        eq(schema.financialTransactions.kind, "adjustment"),
      ),
    );
}

async function auditsDe(cajaId: number) {
  return app.db
    .select({
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
    );
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

async function firmeDe(cajaId: number): Promise<number> {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/cash-registers/balances`,
    headers: authed(ownerToken),
  });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  const fila = (JSON.parse(res.body) as CajaSaldoRow[]).find(
    (r) => r.cashRegisterId === cajaId,
  );
  expect(fila, `la caja ${cajaId} no aparece en Saldos`).toBeDefined();
  return fila?.firmeBalance ?? Number.NaN;
}

beforeAll(async () => {
  app = await createTestApp();
  await desactivarTesorosDelTemplo();

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
      name: `Sede Arqueo ${suf}`,
      code: `AQ${suf}`,
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  branchId = b.id;

  for (const [role, email] of [
    ["gestion", `gestion-aq-${suf}@test.local`],
    ["admin", `admin-aq-${suf}@test.local`],
  ] as const) {
    await createStaffUser(app, {
      email,
      password: "pass123456",
      firstName: role,
      lastName: "Arqueo",
      role,
      branchId,
      country: "AR",
    });
  }
  gestionToken = await getAuthToken(
    app,
    `gestion-aq-${suf}@test.local`,
    "pass123456",
  );
  adminToken = await getAuthToken(
    app,
    `admin-aq-${suf}@test.local`,
    "pass123456",
  );
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
  await desactivarTesorosDelTemplo();
  await app.close();
});

describe("208-04: arqueo de apertura — saldo exacto y trazabilidad", () => {
  it("contado mayor: ajuste inflow exacto, firme = contado, ajuste trazable", async () => {
    const central = await nuevaCentral(1000);
    const res = await arquear(ownerToken, central, { countedAmount: 1234 });
    expect(res.statusCode, res.body).toBe(201);
    const oc = JSON.parse(res.body).openingCount as OpeningCount;
    expect(oc.cashRegisterId).toBe(central);
    expect(oc.expectedAmount).toBe(1000);
    expect(oc.countedAmount).toBe(1234);
    expect(oc.difference).toBe(234);
    expect(oc.firmeBalance).toBe(1234);
    expect(oc.adjustmentTxId).not.toBeNull();

    const ajustes = await ajustesDe(central);
    expect(ajustes).toHaveLength(1);
    const [aj] = ajustes;
    expect(aj.id).toBe(oc.adjustmentTxId);
    expect(aj.kind).toBe("adjustment");
    expect(aj.direction).toBe("inflow");
    expect(Number(aj.amount)).toBe(234);
    expect(aj.paymentMethod).toBe("internal");
    expect(aj.branchId).toBeNull();
    expect(aj.recordedBy).toBe(ownerId);
    expect(aj.createdAt).not.toBeNull();
    expect(
      aj.notes?.startsWith("Arqueo de apertura: esperado 1000, contado 1234"),
    ).toBe(true);

    // Y el saldo que ve Saldos coincide.
    expect(await firmeDe(central)).toBe(1234);
  });

  it("contado menor: ajuste outflow por la diferencia, firme = contado", async () => {
    const central = await nuevaCentral(1234);
    const res = await arquear(ownerToken, central, { countedAmount: 900 });
    expect(res.statusCode, res.body).toBe(201);
    const oc = JSON.parse(res.body).openingCount as OpeningCount;
    expect(oc.difference).toBe(-334);
    expect(oc.firmeBalance).toBe(900);
    const [aj] = await ajustesDe(central);
    expect(aj.direction).toBe("outflow");
    expect(Number(aj.amount)).toBe(334);
    expect(await firmeDe(central)).toBe(900);
  });

  it("contado igual: sin ajuste, pero el audit queda igual", async () => {
    const central = await nuevaCentral(500);
    const res = await arquear(ownerToken, central, { countedAmount: 500 });
    expect(res.statusCode, res.body).toBe(201);
    const oc = JSON.parse(res.body).openingCount as OpeningCount;
    expect(oc.adjustmentTxId).toBeNull();
    expect(oc.difference).toBe(0);
    expect(oc.firmeBalance).toBe(500);
    expect(await ajustesDe(central)).toHaveLength(0);

    const audits = await auditsDe(central);
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(ownerId);
    const payload = audits[0].payloadJson as Record<string, unknown>;
    expect(payload.source).toBe("opening_count");
    expect(payload.adjustmentId).toBeNull();
    expect(payload.expected).toBe(500);
    expect(payload.counted).toBe(500);
  });

  it("con diferencia también hay audit, con el id del ajuste y esperado/contado", async () => {
    const central = await nuevaCentral(100);
    const res = await arquear(ownerToken, central, { countedAmount: 150 });
    expect(res.statusCode, res.body).toBe(201);
    const oc = JSON.parse(res.body).openingCount as OpeningCount;
    const audits = await auditsDe(central);
    expect(audits).toHaveLength(1);
    const payload = audits[0].payloadJson as Record<string, unknown>;
    expect(payload).toMatchObject({
      source: "opening_count",
      cashRegisterId: central,
      expected: 100,
      counted: 150,
      difference: 50,
      adjustmentId: oc.adjustmentTxId,
    });
  });

  it("con notas: las notas del ajuste terminan en '. Caja fuerte'", async () => {
    const central = await nuevaCentral(0);
    const res = await arquear(ownerToken, central, {
      countedAmount: 2000,
      notes: "Caja fuerte",
    });
    expect(res.statusCode, res.body).toBe(201);
    const [aj] = await ajustesDe(central);
    expect(aj.notes).toBe(
      "Arqueo de apertura: esperado 0, contado 2000. Caja fuerte",
    );
  });

  it("el esperado incluye el fondo de cambio: contar fondo + firme no genera ajuste", async () => {
    const central = await nuevaCentral(1000, { changeFund: 100 });
    // Esperado en el cajón = 100 (fondo) + 1000 (firme) = 1100.
    const sinDiferencia = await arquear(ownerToken, central, {
      countedAmount: 1100,
    });
    expect(sinDiferencia.statusCode, sinDiferencia.body).toBe(201);
    const oc = JSON.parse(sinDiferencia.body).openingCount as OpeningCount;
    expect(oc.expectedAmount).toBe(1100);
    expect(oc.adjustmentTxId).toBeNull();
    expect(await firmeDe(central)).toBe(1000);

    // Si cuenta 1150, el firme sube 50 (el fondo de cambio no es del firme).
    const conDiferencia = await arquear(ownerToken, central, {
      countedAmount: 1150,
    });
    expect(conDiferencia.statusCode, conDiferencia.body).toBe(201);
    expect(await firmeDe(central)).toBe(1050);
  });

  it("arquear dos veces: el segundo arqueo parte del saldo ya ajustado", async () => {
    const central = await nuevaCentral(0);
    await arquear(ownerToken, central, { countedAmount: 300 });
    const res = await arquear(ownerToken, central, { countedAmount: 300 });
    expect(res.statusCode, res.body).toBe(201);
    const oc = JSON.parse(res.body).openingCount as OpeningCount;
    expect(oc.expectedAmount).toBe(300);
    expect(oc.adjustmentTxId).toBeNull();
    expect(await ajustesDe(central)).toHaveLength(1);
    expect(await auditsDe(central)).toHaveLength(2);
  });

  it("Tesoro creado por la ruta con apertura 500, arqueo 450: firme 450", async () => {
    const alta = await app.inject({
      method: "POST",
      url: `${BASE}/cash-registers/treasury`,
      headers: authed(ownerToken),
      payload: {
        name: `Tesoro Arqueo ${suf}`,
        currency: "ARS",
        openingBalance: 500,
      },
    });
    expect(alta.statusCode, alta.body).toBe(201);
    const tesoroId = JSON.parse(alta.body).caja.cashRegisterId as number;
    createdCajaIds.push(tesoroId);

    const res = await arquear(ownerToken, tesoroId, { countedAmount: 450 });
    expect(res.statusCode, res.body).toBe(201);
    const oc = JSON.parse(res.body).openingCount as OpeningCount;
    expect(oc.difference).toBe(-50);
    expect(oc.firmeBalance).toBe(450);
    expect(await firmeDe(tesoroId)).toBe(450);
  });

  it("no escribe en cash_counts (no abre temas de arqueo en Oficina)", async () => {
    const central = await nuevaCentral(10);
    await arquear(ownerToken, central, { countedAmount: 99 });
    const conteos = await app.db
      .select({ id: schema.cashCounts.id })
      .from(schema.cashCounts)
      .where(
        and(
          tenantWhere(schema.cashCounts, TEMPLO_CTX),
          eq(schema.cashCounts.cashRegisterId, central),
        ),
      );
    expect(conteos).toHaveLength(0);
  });
});

describe("208-04: arqueo de apertura — invariantes y permisos", () => {
  it("caja de sede → 400, sin ajuste", async () => {
    const [sede] = await app.db
      .insert(schema.cashRegisters)
      .values(
        tenantValues(TEMPLO_CTX, {
          name: `Caja sede arqueo ${suf}`,
          type: "efectivo",
          branchId,
          currency: "ARS",
          openingBalance: 100,
          cutoffDate: "2020-01-01",
        }),
      )
      .$returningId();
    createdCajaIds.push(sede.id);
    const res = await arquear(ownerToken, sede.id, { countedAmount: 50 });
    expect(res.statusCode, res.body).toBe(400);
    expect(await ajustesDe(sede.id)).toHaveLength(0);
  });

  it("cuenta banco: desde la 209.1 se acepta (el detalle está en apertura-bancos.test.ts)", async () => {
    const [banco] = await app.db
      .insert(schema.cashRegisters)
      .values(
        tenantValues(TEMPLO_CTX, {
          name: `Banco arqueo ${suf}`,
          type: "banco",
          branchId: null,
          currency: "ARS",
          openingBalance: 100,
          cutoffDate: "2020-01-01",
        }),
      )
      .$returningId();
    createdCajaIds.push(banco.id);
    const res = await arquear(ownerToken, banco.id, { countedAmount: 50 });
    expect(res.statusCode, res.body).toBe(201);
    const ajustes = await ajustesDe(banco.id);
    expect(ajustes).toHaveLength(1);
    expect(ajustes[0].direction).toBe("outflow");
    expect(ajustes[0].amount).toBe(50);
    expect(ajustes[0].notes).toMatch(
      /^Saldo de apertura del banco: la app tenía 100, el banco 50/,
    );
  });

  it("caja cerrada → 400, sin ajuste ni audit", async () => {
    const cerrada = await nuevaCentral(100, { isActive: false });
    const res = await arquear(ownerToken, cerrada, { countedAmount: 50 });
    expect(res.statusCode, res.body).toBe(400);
    expect(await ajustesDe(cerrada)).toHaveLength(0);
    expect(await auditsDe(cerrada)).toHaveLength(0);
  });

  it("corte en el futuro → 400", async () => {
    const futura = await nuevaCentral(100, { cutoffDate: "2999-01-01" });
    const res = await arquear(ownerToken, futura, { countedAmount: 50 });
    expect(res.statusCode, res.body).toBe(400);
    expect(await ajustesDe(futura)).toHaveLength(0);
  });

  it("caja inexistente → 400", async () => {
    const res = await arquear(ownerToken, 99999999, { countedAmount: 1 });
    expect(res.statusCode, res.body).toBe(400);
  });

  it("validaciones del body: decimales (1.005 y 100.5), -1 y sin countedAmount → 400", async () => {
    const central = await nuevaCentral(100);
    for (const payload of [
      { countedAmount: 1.005 },
      { countedAmount: 100.5 },
      { countedAmount: -1 },
      {},
    ]) {
      const res = await arquear(ownerToken, central, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(await ajustesDe(central)).toHaveLength(0);
    expect(await auditsDe(central)).toHaveLength(0);
  });

  it("contado 0 es válido (la caja está vacía)", async () => {
    const central = await nuevaCentral(250);
    const res = await arquear(ownerToken, central, { countedAmount: 0 });
    expect(res.statusCode, res.body).toBe(201);
    expect(await firmeDe(central)).toBe(0);
  });

  it("gestión y admin → 403 y no se toca la caja", async () => {
    const central = await nuevaCentral(100);
    for (const token of [gestionToken, adminToken]) {
      const res = await arquear(token, central, { countedAmount: 500 });
      expect(res.statusCode, res.body).toBe(403);
    }
    expect(await ajustesDe(central)).toHaveLength(0);
    expect(await auditsDe(central)).toHaveLength(0);
    expect(await firmeDe(central)).toBe(100);
  });
});
