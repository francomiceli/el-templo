/**
 * Fase 208 Plan 06 (D-19, DI-05): el alta de retiro es un TRASLADO con destino
 * obligatorio (Caja central o Tesoro).
 *
 * Cubre:
 *   - destino obligatorio y validado (schema, caja de sede, banco, moneda,
 *     inactivo, mismo que el origen)
 *   - saldos EXACTOS en pesos enteros: la caja de origen baja y el destino sube
 *   - contrato del formato nuevo: las filas que crea el alta tienen el mismo
 *     shape que `seedTransferWithdrawal` (fixture de 208-05)
 *   - ajuste por conteo (faltante/sobrante), arqueo en `cash_counts`, notas
 *   - destino Tesoro, origen banco, fecha pasada contra el corte del destino
 *   - permisos: gestión (no owner) ve Central/Tesoro como destino, sin saldos
 *   - no es costo: Resumen igual, sin `expense`, sin centro de costo
 *   - anulación del retiro nuevo por POST /expenses/:id/void
 *
 * Números LITERALES escritos a mano (no recalculados con la misma fórmula).
 *
 * Corre contra la DB de test por worker. Los Tesoros activos sobreviven entre
 * archivos del worker: se desactivan en `beforeAll` y se desactivan los propios
 * al terminar.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import { seedTransferWithdrawal } from "../fixtures/withdrawal-fixtures";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const BASE = "/api/admin/finance";
const suf = Date.now().toString(36).slice(-6);

let app: FastifyInstance;
let ownerToken: string;
let gestionToken: string;
let adminId: number;
let branchId: number;
let memberId: number;
let tesoroArsId: number;
let tesoroUsdId: number;
let tesoroArsName: string;
const createdCajaIds: number[] = [];

function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function authed(token: string) {
  return { authorization: `Bearer ${token}` };
}

// ─── Siembra ────────────────────────────────────────────────────────────────

async function newCaja(opts: {
  kind: "sede" | "central" | "banco";
  currency?: string;
  isActive?: boolean;
}): Promise<{ id: number; name: string }> {
  const name = `Destino-${opts.kind} ${suf}-${createdCajaIds.length}`;
  const [res] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name,
        type:
          opts.kind === "banco" ? ("banco" as const) : ("efectivo" as const),
        branchId: opts.kind === "sede" ? branchId : null,
        currency: opts.currency ?? "ARS",
        openingBalance: 0,
        cutoffDate: "2020-01-01",
        isActive: opts.isActive ?? true,
        ...(opts.kind === "banco"
          ? {
              bankName: "Banco Test",
              accountHolder: "Test",
              accountAlias: `dest.${suf}.${createdCajaIds.length}`,
            }
          : {}),
      }),
    )
    .$returningId();
  createdCajaIds.push(res.id);
  return { id: res.id, name };
}

async function seedCobro(cajaId: number, amount: number): Promise<number> {
  const date = daysAgo(3);
  const [res] = await app.db
    .insert(schema.financialTransactions)
    .values(
      tenantValues(TEMPLO_CTX, {
        memberId,
        kind: "plan_charge" as const,
        direction: "inflow" as const,
        amount,
        currency: "ARS",
        paymentMethod: "cash" as const,
        transactionDate: date,
        effectiveDate: date,
        branchId,
        cashRegisterId: cajaId,
        recordedBy: adminId,
        validationStatus: "validado" as const,
      }),
    )
    .$returningId();
  return res.id;
}

interface World {
  sede: { id: number; name: string };
  central: { id: number; name: string };
  cobros: number[];
}

/** Sede propia con cobros firmes en efectivo + una Central propia vacía. */
async function makeWorld(cobroAmounts: number[]): Promise<World> {
  const sede = await newCaja({ kind: "sede" });
  const central = await newCaja({ kind: "central" });
  const cobros: number[] = [];
  for (const a of cobroAmounts) cobros.push(await seedCobro(sede.id, a));
  return { sede, central, cobros };
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

// ─── Llamadas ───────────────────────────────────────────────────────────────

async function retirar(token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: `${BASE}/withdrawals`,
    headers: authed(token),
    payload,
  });
}

async function get(token: string, url: string) {
  return app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: authed(token),
  });
}

async function firmeDe(cajaId: number): Promise<number> {
  const res = await get(ownerToken, "/cash-registers/balances");
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  const fila = (
    JSON.parse(res.body) as Array<{
      cashRegisterId: number;
      firmeBalance: number;
    }>
  ).find((r) => r.cashRegisterId === cajaId);
  expect(fila, `la caja ${cajaId} no aparece en Saldos`).toBeDefined();
  return fila?.firmeBalance ?? Number.NaN;
}

interface WithdrawalBody {
  withdrawal: {
    id: number;
    amount: number;
    format: "legacy_expense" | "transfer";
    destinationCashRegisterId: number | null;
    destinationName: string | null;
    paymentCount: number;
    responsibleName: string;
    voidedAt: string | null;
  };
}

async function countTenantTransactions(): Promise<number> {
  const rows = await app.db
    .select({ id: schema.financialTransactions.id })
    .from(schema.financialTransactions)
    .where(tenantWhere(schema.financialTransactions, TEMPLO_CTX));
  return rows.length;
}

async function countExpenses(): Promise<number> {
  const rows = await app.db
    .select({ id: schema.financialTransactions.id })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        eq(schema.financialTransactions.kind, "expense"),
      ),
    );
  return rows.length;
}

async function txRows(ids: number[]) {
  return app.db
    .select()
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        inArray(schema.financialTransactions.id, ids),
      ),
    );
}

async function linksOf(ids: number[]) {
  return app.db
    .select()
    .from(schema.transactionLinks)
    .where(
      and(
        tenantWhere(schema.transactionLinks, TEMPLO_CTX),
        inArray(schema.transactionLinks.transactionId, ids),
      ),
    );
}

/**
 * Shape comparable de un retiro nuevo: lo que el contrato fija, sin ids ni
 * timestamps. Se arma igual para el retiro del alta real y para el del fixture.
 */
async function shapeOfWithdrawal(
  outflowId: number,
  inflowId: number,
  sedeId: number,
  destinoId: number,
  expectedLinks: Array<{ kind: string; amount: number }>,
) {
  const rows = await txRows([outflowId, inflowId]);
  const out = rows.find((r) => r.id === outflowId);
  const inn = rows.find((r) => r.id === inflowId);
  if (!out || !inn) throw new Error("faltan las patas del retiro");
  const links = await linksOf([outflowId, inflowId]);
  return {
    out: {
      kind: out.kind,
      direction: out.direction,
      paymentMethod: out.paymentMethod,
      onSede: out.cashRegisterId === sedeId,
      branchIsSede: out.branchId === branchId,
      costCenterId: out.costCenterId,
      responsibleName: out.responsibleName,
      effectiveIsTxDate:
        String(out.effectiveDate) === String(out.transactionDate),
      memberId: out.memberId,
    },
    inn: {
      kind: inn.kind,
      direction: inn.direction,
      paymentMethod: inn.paymentMethod,
      onDestino: inn.cashRegisterId === destinoId,
      branchId: inn.branchId,
      costCenterId: inn.costCenterId,
      responsibleName: inn.responsibleName,
      effectiveIsTxDate:
        String(inn.effectiveDate) === String(inn.transactionDate),
      memberId: inn.memberId,
    },
    outAmountsEqualInAmount: Number(out.amount) === Number(inn.amount),
    // Links de salida/entrada: hermana (0) y cobros (monto del cobro).
    pairLinks: links
      .filter((l) => l.targetKind === "transaction")
      .map((l) =>
        l.targetId === inflowId && l.transactionId === outflowId
          ? "salida->entrada:" + Number(l.allocatedAmount)
          : l.targetId === outflowId && l.transactionId === inflowId
            ? "entrada->salida:" + Number(l.allocatedAmount)
            : "salida->cobro:" + Number(l.allocatedAmount),
      )
      .sort(),
    expectedLinks: expectedLinks.map((e) => `${e.kind}:${e.amount}`).sort(),
  };
}

beforeAll(async () => {
  app = await createTestApp();
  await desactivarTesorosDelTemplo();

  // admin@test.com es OWNER (test/setup.ts).
  ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [admin] = await app.db
    .select({ id: schema.users.id, branchId: schema.users.branchId })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, TEMPLO_CTX),
        eq(schema.users.email, "admin@test.com"),
      ),
    )
    .limit(1);
  if (!admin) throw new Error("No está el owner admin@test.com sembrado");
  adminId = admin.id;
  branchId = admin.branchId ?? 1;

  await createStaffUser(app, {
    email: `gestion-dest-${suf}@test.local`,
    password: "pass123456",
    firstName: "Gestion",
    lastName: "Destino",
    role: "gestion",
    branchId,
    country: "AR",
  });
  gestionToken = await getAuthToken(
    app,
    `gestion-dest-${suf}@test.local`,
    "pass123456",
  );

  const member = await registerUser(app, {
    email: `dest-member-${suf}@test.local`,
    password: "TestPass123!",
    firstName: "Lula",
    lastName: "Quiroga",
    branchId,
  });
  memberId = (member.user as { id: number }).id;

  // Tesoros por la API (owner): uno ARS con apertura 500 y uno USD.
  tesoroArsName = `Tesoro ARS Destino ${suf}`;
  const altaArs = await app.inject({
    method: "POST",
    url: `${BASE}/cash-registers/treasury`,
    headers: authed(ownerToken),
    payload: { name: tesoroArsName, currency: "ARS", openingBalance: 500 },
  });
  expect(altaArs.statusCode, altaArs.body).toBe(201);
  tesoroArsId = JSON.parse(altaArs.body).caja.cashRegisterId as number;
  createdCajaIds.push(tesoroArsId);
  const altaUsd = await app.inject({
    method: "POST",
    url: `${BASE}/cash-registers/treasury`,
    headers: authed(ownerToken),
    payload: {
      name: `Tesoro USD Destino ${suf}`,
      currency: "USD",
      openingBalance: 0,
    },
  });
  expect(altaUsd.statusCode, altaUsd.body).toBe(201);
  tesoroUsdId = JSON.parse(altaUsd.body).caja.cashRegisterId as number;
  createdCajaIds.push(tesoroUsdId);
});

afterAll(async () => {
  if (createdCajaIds.length > 0) {
    const txs = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          inArray(schema.financialTransactions.cashRegisterId, createdCajaIds),
        ),
      );
    const txIds = txs.map((t) => t.id);
    if (txIds.length > 0) {
      await app.db
        .delete(schema.transactionLinks)
        .where(
          and(
            tenantWhere(schema.transactionLinks, TEMPLO_CTX),
            or(
              inArray(schema.transactionLinks.transactionId, txIds),
              inArray(schema.transactionLinks.targetId, txIds),
            ),
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
      .delete(schema.cashCounts)
      .where(
        and(
          tenantWhere(schema.cashCounts, TEMPLO_CTX),
          inArray(schema.cashCounts.cashRegisterId, createdCajaIds),
        ),
      );
    // Los Tesoros (y el resto de las cajas propias) se desactivan: otros
    // archivos del worker no tienen que verlos.
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

// ═══════════════════════════════════════════════════════════════════════════
// Validaciones del destino
// ═══════════════════════════════════════════════════════════════════════════

describe("208-06: retiro con destino — validaciones", () => {
  it("sin destinationCashRegisterId → 400 (schema) y no escribe nada", async () => {
    const w = await makeWorld([1000]);
    const antes = await countTenantTransactions();
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      responsibleName: "Gaby",
      amount: 500,
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(await countTenantTransactions()).toBe(antes);
  });

  it("importe decimal (amount o countedAmount) → 400 y no escribe nada: la plata va en pesos enteros", async () => {
    const w = await makeWorld([1000]);
    const antes = await countTenantTransactions();
    for (const extra of [
      { amount: 100.5 },
      { amount: 500, countedAmount: 1000.5 },
    ]) {
      const res = await retirar(ownerToken, {
        cajaId: w.sede.id,
        destinationCashRegisterId: w.central.id,
        responsibleName: "Gaby",
        ...extra,
      });
      expect(res.statusCode, JSON.stringify(extra) + res.body).toBe(400);
    }
    expect(await countTenantTransactions()).toBe(antes);
    expect(await firmeDe(w.sede.id)).toBe(1000);
  });

  it("destino = otra caja de sede → 400", async () => {
    const w = await makeWorld([1000]);
    const otraSede = await newCaja({ kind: "sede" });
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: otraSede.id,
      responsibleName: "Gaby",
      amount: 500,
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      "Caja central o un Tesoro activo",
    );
  });

  it("destino = cuenta banco → 400", async () => {
    const w = await makeWorld([1000]);
    const banco = await newCaja({ kind: "banco" });
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: banco.id,
      responsibleName: "Gaby",
      amount: 500,
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      "Caja central o un Tesoro activo",
    );
  });

  it("Tesoro en USD para una caja en ARS → 400 con el texto de la moneda", async () => {
    const w = await makeWorld([1000]);
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: tesoroUsdId,
      responsibleName: "Gaby",
      amount: 500,
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      `El destino tiene que estar en ARS: la caja ${w.sede.name} es en ARS`,
    );
  });

  it("Caja central inactiva → 400", async () => {
    const w = await makeWorld([1000]);
    const inactiva = await newCaja({ kind: "central", isActive: false });
    const antes = await countTenantTransactions();
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: inactiva.id,
      responsibleName: "Gaby",
      amount: 500,
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(await countTenantTransactions()).toBe(antes);
  });

  it("destino inexistente → 400 con el mismo texto", async () => {
    const w = await makeWorld([1000]);
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: 2147483000,
      responsibleName: "Gaby",
      amount: 500,
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      "Caja central o un Tesoro activo",
    );
  });

  it("retiro desde la Central a la misma Central → 400", async () => {
    const w = await makeWorld([]);
    const res = await retirar(ownerToken, {
      cajaId: w.central.id,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Gaby",
      amount: 10,
    });
    expect(res.statusCode, res.body).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Alta feliz: saldos exactos, respuesta y contrato del formato
// ═══════════════════════════════════════════════════════════════════════════

describe("208-06: retiro con destino — alta, saldos y contrato", () => {
  it("cobros 1000 + 2000, retiro 3000 a la Central con conteo = esperado: sede -3000 y Central +3000 exactos", async () => {
    const w = await makeWorld([1000, 2000]);
    expect(await firmeDe(w.sede.id)).toBe(3000);
    expect(await firmeDe(w.central.id)).toBe(0);

    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Gaby",
      amount: 3000,
      countedAmount: 3000,
    });
    expect(res.statusCode, res.body).toBe(201);
    const { withdrawal } = JSON.parse(res.body) as WithdrawalBody;
    expect(withdrawal.format).toBe("transfer");
    expect(withdrawal.amount).toBe(3000);
    expect(withdrawal.destinationCashRegisterId).toBe(w.central.id);
    expect(withdrawal.destinationName).toBe(w.central.name);
    expect(withdrawal.paymentCount).toBe(2);
    expect(withdrawal.responsibleName).toBe("Gaby");

    expect(await firmeDe(w.sede.id)).toBe(0);
    expect(await firmeDe(w.central.id)).toBe(3000);
  });

  it("contrato: las filas del alta tienen el mismo shape que seedTransferWithdrawal y no hay ningún expense nuevo", async () => {
    const w = await makeWorld([1000, 2000]);
    const expensesAntes = await countExpenses();
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Martín",
      amount: 2500,
      notes: "retiro real",
    });
    expect(res.statusCode, res.body).toBe(201);
    const { withdrawal } = JSON.parse(res.body) as WithdrawalBody;
    const outflowId = withdrawal.id;
    // La entrada es la fila cash_transfer inflow de la Central.
    const [entrada] = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.cashRegisterId, w.central.id),
          eq(schema.financialTransactions.kind, "cash_transfer"),
        ),
      );
    const real = await shapeOfWithdrawal(
      outflowId,
      entrada.id,
      w.sede.id,
      w.central.id,
      [],
    );
    expect(await countExpenses()).toBe(expensesAntes);

    // El mismo retiro sembrado con el fixture (contrato de 208-05).
    const w2 = await makeWorld([1000, 2000]);
    const fx = await seedTransferWithdrawal(app, TEMPLO_CTX, {
      cashRegisterId: w2.sede.id,
      destinationCashRegisterId: w2.central.id,
      branchId,
      amount: 2500,
      responsibleName: "Martín",
      recordedBy: adminId,
      transactionDate: new Date().toISOString().slice(0, 10),
      notes: "retiro real",
      payments: [
        { id: w2.cobros[0], amount: 1000 },
        { id: w2.cobros[1], amount: 2000 },
      ],
    });
    const fixture = await shapeOfWithdrawal(
      fx.withdrawalId,
      fx.inflowId,
      w2.sede.id,
      w2.central.id,
      [],
    );

    expect(real.out).toEqual(fixture.out);
    expect(real.inn).toEqual(fixture.inn);
    expect(real.outAmountsEqualInAmount).toBe(true);
    // Links: salida->entrada 0, entrada->salida 0 y salida->cada cobro con el
    // monto del cobro. Mismos que el fixture.
    expect(real.pairLinks).toEqual(fixture.pairLinks);
    expect(real.pairLinks).toEqual([
      "entrada->salida:0",
      "salida->cobro:1000",
      "salida->cobro:2000",
      "salida->entrada:0",
    ]);
    // Literales del contrato.
    expect(real.out).toMatchObject({
      kind: "cash_transfer",
      direction: "outflow",
      paymentMethod: "internal",
      costCenterId: null,
      responsibleName: "Martín",
      onSede: true,
      branchIsSede: true,
    });
    expect(real.inn).toMatchObject({
      kind: "cash_transfer",
      direction: "inflow",
      paymentMethod: "internal",
      costCenterId: null,
      responsibleName: "Martín",
      branchId: null,
      onDestino: true,
    });
  });

  it("a un Tesoro: el Tesoro sube exacto (apertura 500 + 3000)", async () => {
    const w = await makeWorld([1000, 2000]);
    expect(await firmeDe(tesoroArsId)).toBe(500);
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: tesoroArsId,
      responsibleName: "Gaby",
      amount: 3000,
    });
    expect(res.statusCode, res.body).toBe(201);
    const { withdrawal } = JSON.parse(res.body) as WithdrawalBody;
    expect(withdrawal.destinationName).toBe(tesoroArsName);
    expect(await firmeDe(tesoroArsId)).toBe(3500);
    expect(await firmeDe(w.sede.id)).toBe(0);
    // Dejar el Tesoro como estaba para los casos que siguen.
    const back = await retirar(ownerToken, {
      cajaId: tesoroArsId,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Gaby",
      amount: 3000,
    });
    expect(back.statusCode, back.body).toBe(201);
    expect(await firmeDe(tesoroArsId)).toBe(500);
  });

  it("monto mayor al disponible → 400 y ninguna fila nueva", async () => {
    const w = await makeWorld([1000]);
    const antes = await countTenantTransactions();
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Gaby",
      amount: 1001,
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(await countTenantTransactions()).toBe(antes);
    expect(await firmeDe(w.sede.id)).toBe(1000);
    expect(await firmeDe(w.central.id)).toBe(0);
  });

  it("origen banco → Central de la misma moneda (owner): 201 sin cobros; con countedAmount → 400", async () => {
    const banco = await newCaja({ kind: "banco" });
    const central = await newCaja({ kind: "central" });
    const conConteo = await retirar(ownerToken, {
      cajaId: banco.id,
      destinationCashRegisterId: central.id,
      responsibleName: "Gaby",
      amount: 700,
      countedAmount: 700,
    });
    expect(conConteo.statusCode, conConteo.body).toBe(400);

    const res = await retirar(ownerToken, {
      cajaId: banco.id,
      destinationCashRegisterId: central.id,
      responsibleName: "Gaby",
      amount: 700,
    });
    expect(res.statusCode, res.body).toBe(201);
    const { withdrawal } = JSON.parse(res.body) as WithdrawalBody;
    expect(withdrawal.format).toBe("transfer");
    expect(withdrawal.paymentCount).toBe(0);
    expect(await firmeDe(central.id)).toBe(700);
    expect(await firmeDe(banco.id)).toBe(-700);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Conteo: ajuste, arqueo, notas
// ═══════════════════════════════════════════════════════════════════════════

describe("208-06: retiro con destino — conteo", () => {
  it("faltante con nota: ajuste outflow antes de la salida, link ajuste->salida, notas y arqueo; sin nota → 400", async () => {
    const w = await makeWorld([5000]);

    const sinNota = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Gaby",
      amount: 3000,
      countedAmount: 4999,
    });
    expect(sinNota.statusCode, sinNota.body).toBe(400);
    expect(await firmeDe(w.sede.id)).toBe(5000);

    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Gaby",
      amount: 3000,
      countedAmount: 4999,
      notes: "faltó un vuelto",
    });
    expect(res.statusCode, res.body).toBe(201);
    const { withdrawal } = JSON.parse(res.body) as WithdrawalBody;

    const ajustes = await app.db
      .select()
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.cashRegisterId, w.sede.id),
          eq(schema.financialTransactions.kind, "adjustment"),
        ),
      );
    expect(ajustes).toHaveLength(1);
    const ajuste = ajustes[0];
    expect(ajuste.direction).toBe("outflow");
    expect(Number(ajuste.amount)).toBe(1);
    expect(ajuste.id).toBeLessThan(withdrawal.id);
    expect(ajuste.notes).toBe(
      "Faltante al retirar: esperado 5000, contado 4999. faltó un vuelto",
    );
    const linkAjuste = await linksOf([ajuste.id]);
    expect(linkAjuste).toHaveLength(1);
    expect(linkAjuste[0].targetId).toBe(withdrawal.id);
    expect(Number(linkAjuste[0].allocatedAmount)).toBe(0);

    const conteos = await app.db
      .select()
      .from(schema.cashCounts)
      .where(
        and(
          tenantWhere(schema.cashCounts, TEMPLO_CTX),
          eq(schema.cashCounts.cashRegisterId, w.sede.id),
        ),
      );
    expect(conteos).toHaveLength(1);
    expect(conteos[0].notes).toBe(
      `Conteo al retirar (retiro #${withdrawal.id}). faltó un vuelto`,
    );
    expect(Number(conteos[0].difference)).toBe(-1);
    expect(conteos[0].paymentsCount).toBe(1);

    // 5000 - 1 (faltante) - 3000 = 1999 y la Central 3000.
    expect(await firmeDe(w.sede.id)).toBe(1999);
    expect(await firmeDe(w.central.id)).toBe(3000);
  });

  it("sobrante: ajuste inflow y el tope sube a lo contado", async () => {
    const w = await makeWorld([1000]);
    // Contado 1001 (sobra 1): se puede retirar 1001 completo.
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Gaby",
      amount: 1001,
      countedAmount: 1001,
      notes: "sobró una moneda",
    });
    expect(res.statusCode, res.body).toBe(201);
    const [ajuste] = await app.db
      .select()
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.cashRegisterId, w.sede.id),
          eq(schema.financialTransactions.kind, "adjustment"),
        ),
      );
    expect(ajuste.direction).toBe("inflow");
    expect(Number(ajuste.amount)).toBe(1);
    expect(ajuste.notes).toBe(
      "Sobrante al retirar: esperado 1000, contado 1001. sobró una moneda",
    );
    expect(await firmeDe(w.sede.id)).toBe(0);
    expect(await firmeDe(w.central.id)).toBe(1001);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fechas contra el corte del destino
// ═══════════════════════════════════════════════════════════════════════════

describe("208-06: retiro con destino — fecha y corte", () => {
  it("fecha pasada anterior al corte del destino (Tesoro creado hoy) → 400", async () => {
    const w = await makeWorld([1000]);
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: tesoroArsId,
      responsibleName: "Gaby",
      amount: 500,
      transactionDate: daysAgo(2),
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      `anterior al corte de ${tesoroArsName}`,
    );
  });

  it("fecha pasada posterior al corte de origen y destino → 201 con esa fecha en las dos patas", async () => {
    const w = await makeWorld([1000]);
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Gaby",
      amount: 500,
      transactionDate: daysAgo(2),
    });
    expect(res.statusCode, res.body).toBe(201);
    const { withdrawal } = JSON.parse(res.body) as WithdrawalBody;
    const patas = await app.db
      .select({
        transactionDate: schema.financialTransactions.transactionDate,
        cashRegisterId: schema.financialTransactions.cashRegisterId,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.kind, "cash_transfer"),
          inArray(schema.financialTransactions.cashRegisterId, [
            w.sede.id,
            w.central.id,
          ]),
        ),
      );
    expect(withdrawal.format).toBe("transfer");
    expect(patas).toHaveLength(2);
    for (const p of patas) expect(String(p.transactionDate)).toBe(daysAgo(2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No es costo
// ═══════════════════════════════════════════════════════════════════════════

describe("208-06: retiro con destino — no es costo", () => {
  it("el Resumen no cambia con el retiro y ninguna fila lleva centro de costo", async () => {
    const w = await makeWorld([1000]);
    const antes = await get(ownerToken, "/transactions/summary");
    expect(antes.statusCode, antes.body).toBe(200);
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Gaby",
      amount: 400,
    });
    expect(res.statusCode, res.body).toBe(201);
    const despues = await get(ownerToken, "/transactions/summary");
    expect(despues.statusCode, despues.body).toBe(200);
    expect(JSON.parse(despues.body)).toEqual(JSON.parse(antes.body));

    const filas = await app.db
      .select({
        kind: schema.financialTransactions.kind,
        costCenterId: schema.financialTransactions.costCenterId,
      })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          inArray(schema.financialTransactions.cashRegisterId, [
            w.sede.id,
            w.central.id,
          ]),
          eq(schema.financialTransactions.kind, "cash_transfer"),
        ),
      );
    expect(filas).toHaveLength(2);
    for (const f of filas) expect(f.costCenterId).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Destinos y permisos
// ═══════════════════════════════════════════════════════════════════════════

describe("208-06: GET /withdrawals/destinations y permisos", () => {
  it("gestión (no owner): ve Central y Tesoro del mismo origen solo con id/name/isTreasury/currency y puede retirar a la Central", async () => {
    const w = await makeWorld([1000]);
    const res = await get(
      gestionToken,
      `/withdrawals/destinations?cashRegisterId=${w.sede.id}`,
    );
    expect(res.statusCode, res.body).toBe(200);
    const { destinations } = JSON.parse(res.body) as {
      destinations: Array<Record<string, unknown>>;
    };
    const central = destinations.find((d) => d.id === w.central.id);
    const tesoro = destinations.find((d) => d.id === tesoroArsId);
    expect(central).toEqual({
      id: w.central.id,
      name: w.central.name,
      isTreasury: false,
      currency: "ARS",
    });
    expect(tesoro).toEqual({
      id: tesoroArsId,
      name: tesoroArsName,
      isTreasury: true,
      currency: "ARS",
    });
    for (const d of destinations) {
      expect(Object.keys(d).sort()).toEqual([
        "currency",
        "id",
        "isTreasury",
        "name",
      ]);
    }
    // Centrales antes que Tesoros.
    const primerTesoro = destinations.findIndex((d) => d.isTreasury === true);
    const ultimaCentral = destinations
      .map((d) => d.isTreasury)
      .lastIndexOf(false);
    expect(ultimaCentral).toBeLessThan(primerTesoro);
    // No lista la USD, ni el origen, ni cajas de sede.
    expect(destinations.some((d) => d.id === tesoroUsdId)).toBe(false);
    expect(destinations.some((d) => d.id === w.sede.id)).toBe(false);

    const retiro = await retirar(gestionToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Gestión",
      amount: 300,
    });
    expect(retiro.statusCode, retiro.body).toBe(201);
    expect(await firmeDe(w.central.id)).toBe(300);
  });

  it("origen inexistente → 404 y sin cashRegisterId → 400", async () => {
    const inexistente = await get(
      ownerToken,
      "/withdrawals/destinations?cashRegisterId=2147483000",
    );
    expect([400, 404]).toContain(inexistente.statusCode);
    const sinParam = await get(ownerToken, "/withdrawals/destinations");
    expect(sinParam.statusCode).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Anulación
// ═══════════════════════════════════════════════════════════════════════════

describe("208-06: anular un retiro creado por la API", () => {
  it("POST /expenses/:id/void anula las dos patas y el ajuste, libera los cobros y los saldos vuelven exactos", async () => {
    const w = await makeWorld([1000, 2000]);
    const res = await retirar(ownerToken, {
      cajaId: w.sede.id,
      destinationCashRegisterId: w.central.id,
      responsibleName: "Gaby",
      amount: 3000,
      countedAmount: 3001,
      notes: "sobró un peso",
    });
    expect(res.statusCode, res.body).toBe(201);
    const { withdrawal } = JSON.parse(res.body) as WithdrawalBody;
    // Esperado 3000, contado 3001: sobrante 1 → sede 3001 - 3000 = 1.
    expect(await firmeDe(w.sede.id)).toBe(1);
    expect(await firmeDe(w.central.id)).toBe(3000);

    const antesPendientes = await get(
      ownerToken,
      `/withdrawals/pending?cashRegisterId=${w.sede.id}`,
    );
    expect(JSON.parse(antesPendientes.body).rows).toHaveLength(0);

    const [entrada] = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.cashRegisterId, w.central.id),
          eq(schema.financialTransactions.kind, "cash_transfer"),
        ),
      );
    const ajustes = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.cashRegisterId, w.sede.id),
          eq(schema.financialTransactions.kind, "adjustment"),
        ),
      );
    expect(ajustes).toHaveLength(1);

    const anular = await app.inject({
      method: "POST",
      url: `${BASE}/expenses/${withdrawal.id}/void`,
      headers: authed(ownerToken),
      payload: { reason: "test anulación retiro con destino" },
    });
    expect(anular.statusCode, anular.body).toBe(200);

    const filas = await txRows([
      withdrawal.id,
      entrada.id,
      ajustes[0].id,
      ...w.cobros,
    ]);
    const voided = new Map(filas.map((f) => [f.id, f.voidedAt]));
    expect(voided.get(withdrawal.id)).not.toBeNull();
    expect(voided.get(entrada.id)).not.toBeNull();
    expect(voided.get(ajustes[0].id)).not.toBeNull();
    // Los cobros NO se anulan: quedan vivos y vuelven a estar pendientes.
    for (const c of w.cobros) expect(voided.get(c)).toBeNull();
    const pendientes = await get(
      ownerToken,
      `/withdrawals/pending?cashRegisterId=${w.sede.id}`,
    );
    expect(
      (JSON.parse(pendientes.body).rows as Array<{ id: number }>)
        .map((r) => r.id)
        .sort((a, b) => a - b),
    ).toEqual([...w.cobros].sort((a, b) => a - b));

    expect(await firmeDe(w.sede.id)).toBe(3000);
    expect(await firmeDe(w.central.id)).toBe(0);
  });
});
