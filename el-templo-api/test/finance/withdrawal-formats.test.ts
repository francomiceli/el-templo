/**
 * Fase 208 Plan 05 (DI-05, DI-09): lectores y anulaciones de retiros con los
 * DOS formatos mezclados.
 *
 *   - FORMATO VIEJO (los 48 de prod): un `expense` con centro "Retiros" y
 *     responsable, links a los cobros y ajuste -> expense.
 *   - FORMATO NUEVO (lo produce 208-06): un par `cash_transfer` con
 *     responsable (salida en la sede = el retiro, entrada en la Central).
 *
 * Los fixtures siembran ambos tal cual (`test/fixtures/withdrawal-fixtures.ts`)
 * y los lectores (historial, detalle, resumen del cajón, "retirado" de los
 * cobros, responsables, historial de movimientos y su Excel) tienen que verlos
 * sin duplicar ni perder ninguno. Las anulaciones (POST /expenses/:id/void,
 * POST /movements/:id/void, POST /transactions/:id/void) no pueden arrastrar
 * cobros ni dejar vivos ajustes.
 *
 * Números LITERALES (escritos a mano, no recalculados): la sede arranca en 0,
 * 4 cobros en efectivo (1000, 2000, 3000, 4000), retiro viejo de 3000 con
 * faltante 10, retiro nuevo de 6000 con sobrante 5:
 *   sede   = 10000 - 3000 - 10 - 6000 + 5 = 995
 *   Central = 6000
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, eq, and, inArray, isNull } from "drizzle-orm";
import { Workbook } from "exceljs";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  ensureEfectivoCaja,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";
import {
  seedLegacyWithdrawal,
  seedTransferWithdrawal,
  type SeededLegacyWithdrawal,
  type SeededTransferWithdrawal,
} from "../fixtures/withdrawal-fixtures";

const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
const BASE = "/api/admin/finance";

let app: FastifyInstance;
let adminId: number;
let branchId: number;
let memberId: number;
let adminToken: string;
const extraCajas: number[] = [];

function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface World {
  sedeId: number;
  sedeName: string;
  centralId: number;
  centralName: string;
  /** Cobros 1-4 (1000, 2000, 3000, 4000). */
  cobros: number[];
  legacy: SeededLegacyWithdrawal;
  nuevo: SeededTransferWithdrawal;
}

async function newCaja(opts: {
  branchId: number | null;
  label: string;
}): Promise<{ id: number; name: string }> {
  const name = `Formats-${opts.label} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const [res] = await app.db
    .insert(schema.cashRegisters)
    .values(
      tenantValues(TEMPLO_CTX, {
        name,
        type: "efectivo" as const,
        branchId: opts.branchId,
        currency: "ARS",
        openingBalance: 0,
        cutoffDate: "2020-01-01",
      }),
    )
    .$returningId();
  extraCajas.push(res.id);
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

/** Sede + Central propias, 4 cobros, un retiro viejo y uno nuevo. */
async function makeWorld(): Promise<World> {
  const sede = await newCaja({ branchId, label: "sede" });
  const central = await newCaja({ branchId: null, label: "central" });
  const cobros = [
    await seedCobro(sede.id, 1000),
    await seedCobro(sede.id, 2000),
    await seedCobro(sede.id, 3000),
    await seedCobro(sede.id, 4000),
  ];
  const legacy = await seedLegacyWithdrawal(app, TEMPLO_CTX, {
    cashRegisterId: sede.id,
    branchId,
    amount: 3000,
    responsibleName: "Gaby",
    recordedBy: adminId,
    transactionDate: daysAgo(2),
    notes: "retiro-viejo",
    payments: [
      { id: cobros[0], amount: 1000 },
      { id: cobros[1], amount: 2000 },
    ],
    adjustment: { direction: "outflow", amount: 10 },
  });
  const nuevo = await seedTransferWithdrawal(app, TEMPLO_CTX, {
    cashRegisterId: sede.id,
    destinationCashRegisterId: central.id,
    branchId,
    amount: 6000,
    responsibleName: "Martín",
    recordedBy: adminId,
    transactionDate: daysAgo(1),
    notes: "retiro-nuevo",
    payments: [
      { id: cobros[2], amount: 3000 },
      { id: cobros[3], amount: 4000 },
    ],
    adjustment: { direction: "inflow", amount: 5 },
  });
  return {
    sedeId: sede.id,
    sedeName: sede.name,
    centralId: central.id,
    centralName: central.name,
    cobros,
    legacy,
    nuevo,
  };
}

async function firmeBalance(id: number): Promise<number> {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}/cash-registers/balances`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  const rows = JSON.parse(res.body) as Array<{
    cashRegisterId: number;
    firmeBalance: number;
  }>;
  return rows.find((r) => r.cashRegisterId === id)?.firmeBalance ?? NaN;
}

async function get<T>(url: string): Promise<{ statusCode: number; body: T }> {
  const res = await app.inject({
    method: "GET",
    url: `${BASE}${url}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) as T };
}

async function postVoid(
  id: number,
  url: "transactions" | "expenses" | "movements",
): Promise<{ statusCode: number; body: { message?: string } }> {
  const res = await app.inject({
    method: "POST",
    url: `${BASE}/${url}/${id}/void`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { reason: "test formatos" },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function voidedAtOf(ids: number[]): Promise<Map<number, Date | null>> {
  const rows = await app.db
    .select({
      id: schema.financialTransactions.id,
      voidedAt: schema.financialTransactions.voidedAt,
    })
    .from(schema.financialTransactions)
    .where(
      and(
        tenantWhere(schema.financialTransactions, TEMPLO_CTX),
        inArray(schema.financialTransactions.id, ids),
      ),
    );
  return new Map(rows.map((r) => [r.id, r.voidedAt]));
}

interface ListBody {
  rows: Array<{
    id: number;
    format: "legacy_expense" | "transfer";
    amount: number;
    paymentCount: number;
    responsibleName: string;
    destinationCashRegisterId: number | null;
    destinationName: string | null;
    cashRegisterId: number;
  }>;
  total: number;
}

interface PendingBody {
  rows: Array<{ id: number }>;
  total: number;
  summary: {
    lastWithdrawal: { id: number; amount: number } | null;
    previousBalance: number;
    inflows: Array<{ id: number; description: string; amount: number }>;
    inflowTotal: number;
    outflows: Array<{ id: number; description: string; amount: number }>;
    outflowTotal: number;
    firmeBalance: number;
  };
}

beforeAll(async () => {
  app = await createTestApp();
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
  adminId = admin.id;
  branchId = admin.branchId ?? 1;
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  await ensureEfectivoCaja(app, branchId);
  const member = await registerUser(app, {
    email: `formats-member-${Date.now()}@test.local`,
    password: "TestPass123!",
    firstName: "Lula",
    lastName: "Quiroga",
    branchId,
  });
  memberId = (member.user as { id: number }).id;
});

afterAll(async () => {
  await app.db.execute(
    sql`DELETE FROM transaction_links WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  await app.db.execute(
    sql`DELETE FROM financial_transactions WHERE tenant_id = ${TENANT_TEMPLO}`,
  );
  if (extraCajas.length > 0) {
    await app.db
      .delete(schema.cashRegisters)
      .where(
        and(
          tenantWhere(schema.cashRegisters, TEMPLO_CTX),
          inArray(schema.cashRegisters.id, extraCajas),
        ),
      );
  }
  await app.close();
});

// ─────────────────────────────────────────────────────────────────────────
// Lectores (mundo compartido de solo lectura)
// ─────────────────────────────────────────────────────────────────────────

describe("lectores con retiros viejos y nuevos mezclados", () => {
  let w: World;
  beforeAll(async () => {
    w = await makeWorld();
  });

  it("el saldo de partida es el literal esperado (sede 995, Central 6000)", async () => {
    expect(await firmeBalance(w.sedeId)).toBe(995);
    expect(await firmeBalance(w.centralId)).toBe(6000);
  });

  it("GET /withdrawals de la sede: 2 retiros (salida del nuevo + expense viejo), ninguna pata de entrada, sin duplicar", async () => {
    const { statusCode, body } = await get<ListBody>(
      `/withdrawals?cashRegisterId=${w.sedeId}`,
    );
    expect(statusCode).toBe(200);
    expect(body.total).toBe(2);
    expect(body.rows.map((r) => r.id)).toEqual([
      w.nuevo.withdrawalId,
      w.legacy.withdrawalId,
    ]);
    expect(body.rows.map((r) => r.id)).not.toContain(w.nuevo.inflowId);

    const [nuevo, viejo] = body.rows;
    expect(viejo.format).toBe("legacy_expense");
    expect(viejo.destinationName).toBeNull();
    expect(viejo.destinationCashRegisterId).toBeNull();
    expect(viejo.paymentCount).toBe(2);
    expect(viejo.amount).toBe(3000);
    expect(viejo.responsibleName).toBe("Gaby");

    expect(nuevo.format).toBe("transfer");
    expect(nuevo.destinationName).toBe(w.centralName);
    expect(nuevo.destinationCashRegisterId).toBe(w.centralId);
    // 2 cobros: la pata hermana del traslado NO cuenta.
    expect(nuevo.paymentCount).toBe(2);
    expect(nuevo.amount).toBe(6000);
    expect(nuevo.responsibleName).toBe("Martín");
  });

  it("GET /withdrawals de la Central: la pata de entrada no figura como retiro", async () => {
    const { body } = await get<ListBody>(
      `/withdrawals?cashRegisterId=${w.centralId}`,
    );
    expect(body.total).toBe(0);
    expect(body.rows).toEqual([]);
  });

  it("GET /withdrawals/:id: del nuevo trae solo sus cobros, del viejo los suyos, de la pata de entrada 404", async () => {
    const nuevo = await get<{
      format: string;
      paymentCount: number;
      payments: Array<{ id: number }>;
    }>(`/withdrawals/${w.nuevo.withdrawalId}`);
    expect(nuevo.statusCode).toBe(200);
    expect(nuevo.body.format).toBe("transfer");
    expect(nuevo.body.paymentCount).toBe(2);
    expect(nuevo.body.payments.map((p) => p.id).sort((a, b) => a - b)).toEqual(
      [w.cobros[2], w.cobros[3]],
    );

    const viejo = await get<{
      format: string;
      payments: Array<{ id: number }>;
    }>(`/withdrawals/${w.legacy.withdrawalId}`);
    expect(viejo.statusCode).toBe(200);
    expect(viejo.body.format).toBe("legacy_expense");
    expect(viejo.body.payments.map((p) => p.id).sort((a, b) => a - b)).toEqual(
      [w.cobros[0], w.cobros[1]],
    );

    const entrada = await get<{ message?: string }>(
      `/withdrawals/${w.nuevo.inflowId}`,
    );
    expect(entrada.statusCode).toBe(404);
  });

  it("GET /withdrawals/pending: ningún cobro queda pendiente y el último retiro es la salida del nuevo", async () => {
    const { statusCode, body } = await get<PendingBody>(
      `/withdrawals/pending?cashRegisterId=${w.sedeId}`,
    );
    expect(statusCode).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.summary.lastWithdrawal?.id).toBe(w.nuevo.withdrawalId);
    expect(body.summary.lastWithdrawal?.amount).toBe(6000);
    expect(body.summary.firmeBalance).toBe(995);
    // Nada posterior al último retiro: el ajuste del nuevo nace ANTES que él y
    // la salida del nuevo NO es un "egreso desde entonces".
    expect(body.summary.inflows).toEqual([]);
    expect(body.summary.outflows).toEqual([]);
    expect(body.summary.previousBalance).toBe(995);
  });

  it("resumen de la Central: la pata de entrada es 'Retiro desde <sede>' y no es un retiro propio", async () => {
    const { statusCode, body } = await get<PendingBody>(
      `/withdrawals/pending?cashRegisterId=${w.centralId}`,
    );
    expect(statusCode).toBe(200);
    expect(body.summary.lastWithdrawal).toBeNull();
    expect(body.summary.inflows.map((f) => f.id)).toEqual([w.nuevo.inflowId]);
    expect(body.summary.inflows[0].description).toBe(
      `Retiro desde ${w.sedeName}`,
    );
    expect(body.summary.inflowTotal).toBe(6000);
    expect(body.summary.previousBalance).toBe(0);
  });

  it("GET /transactions: cada cobro lleva el retiro que se lo llevó (viejo 1-2, nuevo 3-4)", async () => {
    const { body } = await get<{
      rows: Array<{ id: number; withdrawalId: number | null }>;
    }>(
      `/transactions?paymentMethod=cash&memberId=${memberId}&dateFrom=${daysAgo(30)}&dateTo=${daysAgo(0)}&limit=200`,
    );
    const byId = new Map(body.rows.map((r) => [r.id, r.withdrawalId]));
    expect(byId.get(w.cobros[0])).toBe(w.legacy.withdrawalId);
    expect(byId.get(w.cobros[1])).toBe(w.legacy.withdrawalId);
    expect(byId.get(w.cobros[2])).toBe(w.nuevo.withdrawalId);
    expect(byId.get(w.cobros[3])).toBe(w.nuevo.withdrawalId);
  });

  it("GET /withdrawals/responsibles incluye al responsable del retiro nuevo y del viejo", async () => {
    const { body } = await get<string[]>("/withdrawals/responsibles");
    expect(body).toContain("Martín");
    expect(body).toContain("Gaby");
  });

  it("GET /movements-history de la sede: el nuevo trae responsibleName, el viejo centro 'Retiros'", async () => {
    const { statusCode, body } = await get<{
      rows: Array<{
        id: number;
        kind: string;
        responsibleName: string | null;
        costCenterName: string | null;
      }>;
    }>(`/movements-history?cashRegisterId=${w.sedeId}&limit=200`);
    expect(statusCode).toBe(200);
    const salida = body.rows.find((r) => r.id === w.nuevo.withdrawalId);
    expect(salida?.kind).toBe("cash_transfer");
    expect(salida?.responsibleName).toBe("Martín");
    expect(salida?.costCenterName).toBeNull();
    const viejo = body.rows.find((r) => r.id === w.legacy.withdrawalId);
    expect(viejo?.kind).toBe("expense");
    expect(viejo?.costCenterName).toBe("Retiros");
    expect(viejo?.responsibleName).toBe("Gaby");
  });

  it("Excel de movimientos: 'Retiro' para las patas del nuevo, 'Egreso' para el viejo", async () => {
    async function rowsOf(cajaId: number): Promise<
      Array<{ tipo: string; direccion: string; concepto: string }>
    > {
      const res = await app.inject({
        method: "GET",
        url: `${BASE}/movements-history/export?cashRegisterId=${cajaId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode, res.body.slice(0, 200)).toBe(200);
      const wb = new Workbook();
      await wb.xlsx.load(
        res.rawPayload as unknown as Parameters<Workbook["xlsx"]["load"]>[0],
      );
      const sheet = wb.getWorksheet("Mov-Egresos");
      expect(sheet).toBeDefined();
      const out: Array<{ tipo: string; direccion: string; concepto: string }> =
        [];
      sheet?.eachRow((row, i) => {
        if (i === 1) return;
        out.push({
          tipo: String(row.getCell(2).value ?? ""),
          direccion: String(row.getCell(3).value ?? ""),
          concepto: String(row.getCell(4).value ?? ""),
        });
      });
      return out;
    }

    const sede = await rowsOf(w.sedeId);
    expect(
      sede.find((r) => r.concepto === "retiro-nuevo" && r.direccion === "Salida")
        ?.tipo,
    ).toBe("Retiro");
    expect(sede.find((r) => r.concepto === "retiro-viejo")?.tipo).toBe(
      "Egreso",
    );
    const central = await rowsOf(w.centralId);
    expect(
      central.find(
        (r) => r.concepto === "retiro-nuevo" && r.direccion === "Entrada",
      )?.tipo,
    ).toBe("Retiro");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// DI-09: con solo datos viejos nada cambia
// ─────────────────────────────────────────────────────────────────────────

describe("solo retiros viejos (DI-09)", () => {
  it("historial, detalle y resumen dan los números de siempre", async () => {
    const sede = await newCaja({ branchId, label: "solo-viejos" });
    const c1 = await seedCobro(sede.id, 1000);
    const c2 = await seedCobro(sede.id, 2000);
    const c3 = await seedCobro(sede.id, 3000);
    const legacy = await seedLegacyWithdrawal(app, TEMPLO_CTX, {
      cashRegisterId: sede.id,
      branchId,
      amount: 3000,
      responsibleName: "Gaby",
      recordedBy: adminId,
      transactionDate: daysAgo(2),
      payments: [
        { id: c1, amount: 1000 },
        { id: c2, amount: 2000 },
      ],
    });

    const list = await get<ListBody>(`/withdrawals?cashRegisterId=${sede.id}`);
    expect(list.body.total).toBe(1);
    expect(list.body.rows[0]).toMatchObject({
      id: legacy.withdrawalId,
      format: "legacy_expense",
      amount: 3000,
      paymentCount: 2,
      destinationCashRegisterId: null,
      destinationName: null,
    });

    const pending = await get<PendingBody>(
      `/withdrawals/pending?cashRegisterId=${sede.id}`,
    );
    // El cobro 3 (3000) no se llevó: es lo único pendiente.
    expect(pending.body.rows.map((r) => r.id)).toEqual([c3]);
    expect(pending.body.total).toBe(3000);
    expect(pending.body.summary.lastWithdrawal?.id).toBe(legacy.withdrawalId);
    expect(pending.body.summary.firmeBalance).toBe(3000);
    expect(pending.body.summary.inflowTotal).toBe(3000);
    expect(pending.body.summary.outflowTotal).toBe(0);
    expect(pending.body.summary.previousBalance).toBe(0);
    expect(await firmeBalance(sede.id)).toBe(3000);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Anulaciones
// ─────────────────────────────────────────────────────────────────────────

describe("anular cobros retirados", () => {
  it("un cobro del retiro NUEVO da 409 con el id de la salida; uno del VIEJO también (regresión)", async () => {
    const w = await makeWorld();
    const nuevo = await postVoid(w.cobros[2], "transactions");
    expect(nuevo.statusCode).toBe(409);
    expect(nuevo.body.message).toContain(
      `incluido en el retiro #${w.nuevo.withdrawalId}`,
    );
    const viejo = await postVoid(w.cobros[0], "transactions");
    expect(viejo.statusCode).toBe(409);
    expect(viejo.body.message).toContain(
      `incluido en el retiro #${w.legacy.withdrawalId}`,
    );
  });
});

describe("anular retiros", () => {
  it("POST /expenses/<salida del nuevo>/void: anula salida, entrada y ajuste; los cobros NO se tocan y quedan pendientes; saldos exactos", async () => {
    const w = await makeWorld();
    expect(await firmeBalance(w.sedeId)).toBe(995);
    const res = await postVoid(w.nuevo.withdrawalId, "expenses");
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);

    const voided = await voidedAtOf([
      w.nuevo.withdrawalId,
      w.nuevo.inflowId,
      w.nuevo.adjustmentId as number,
      ...w.cobros,
      w.legacy.withdrawalId,
    ]);
    expect(voided.get(w.nuevo.withdrawalId)).not.toBeNull();
    expect(voided.get(w.nuevo.inflowId)).not.toBeNull();
    expect(voided.get(w.nuevo.adjustmentId as number)).not.toBeNull();
    // Ningún cobro se anuló y el retiro viejo sigue vivo.
    for (const c of w.cobros) expect(voided.get(c)).toBeNull();
    expect(voided.get(w.legacy.withdrawalId)).toBeNull();

    // 995 + 6000 (vuelve la salida) - 5 (cae el sobrante) = 6990. Central: 0.
    expect(await firmeBalance(w.sedeId)).toBe(6990);
    expect(await firmeBalance(w.centralId)).toBe(0);

    // Los cobros 3-4 se liberaron: vuelven a pendientes; 1-2 siguen retirados.
    const pending = await get<PendingBody>(
      `/withdrawals/pending?cashRegisterId=${w.sedeId}`,
    );
    expect(pending.body.rows.map((r) => r.id).sort((a, b) => a - b)).toEqual([
      w.cobros[2],
      w.cobros[3],
    ]);
    expect(pending.body.summary.lastWithdrawal?.id).toBe(
      w.legacy.withdrawalId,
    );
  });

  it("POST /movements/<pata de entrada del nuevo>/void: mismo resultado, cobros intactos", async () => {
    const w = await makeWorld();
    const res = await postVoid(w.nuevo.inflowId, "movements");
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);

    const voided = await voidedAtOf([
      w.nuevo.withdrawalId,
      w.nuevo.inflowId,
      w.nuevo.adjustmentId as number,
      ...w.cobros,
    ]);
    expect(voided.get(w.nuevo.withdrawalId)).not.toBeNull();
    expect(voided.get(w.nuevo.inflowId)).not.toBeNull();
    expect(voided.get(w.nuevo.adjustmentId as number)).not.toBeNull();
    for (const c of w.cobros) expect(voided.get(c)).toBeNull();
    expect(await firmeBalance(w.sedeId)).toBe(6990);
    expect(await firmeBalance(w.centralId)).toBe(0);
  });

  it("POST /expenses/<viejo>/void: anula expense y ajuste, libera los cobros 1-2 y no toca al nuevo", async () => {
    const w = await makeWorld();
    const res = await postVoid(w.legacy.withdrawalId, "expenses");
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);

    const voided = await voidedAtOf([
      w.legacy.withdrawalId,
      w.legacy.adjustmentId as number,
      w.nuevo.withdrawalId,
      w.nuevo.inflowId,
      ...w.cobros,
    ]);
    expect(voided.get(w.legacy.withdrawalId)).not.toBeNull();
    expect(voided.get(w.legacy.adjustmentId as number)).not.toBeNull();
    expect(voided.get(w.nuevo.withdrawalId)).toBeNull();
    expect(voided.get(w.nuevo.inflowId)).toBeNull();
    for (const c of w.cobros) expect(voided.get(c)).toBeNull();

    // 995 + 3000 (vuelve el expense) + 10 (cae el faltante) = 4005.
    expect(await firmeBalance(w.sedeId)).toBe(4005);
    expect(await firmeBalance(w.centralId)).toBe(6000);

    const pending = await get<PendingBody>(
      `/withdrawals/pending?cashRegisterId=${w.sedeId}`,
    );
    expect(pending.body.rows.map((r) => r.id).sort((a, b) => a - b)).toEqual([
      w.cobros[0],
      w.cobros[1],
    ]);
  });

  it("POST /transactions/<pata de entrada del nuevo>/void: el guard de 'cobro retirado' no aplica (la pata no es un cobro) y no toca a los cobros", async () => {
    // Igual que una pata de un traslado común: esta ruta anula SOLO la fila
    // pedida. Lo que se afirma es que la pata de entrada, vinculada desde el
    // retiro activo, NO se confunde con un cobro retirado (sin el filtro por
    // kind daba 409 "incluido en el retiro"). El camino normal para anular un
    // retiro son POST /expenses/:id/void o POST /movements/:id/void.
    const w = await makeWorld();
    const res = await postVoid(w.nuevo.inflowId, "transactions");
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const voided = await voidedAtOf([w.nuevo.inflowId, ...w.cobros]);
    expect(voided.get(w.nuevo.inflowId)).not.toBeNull();
    for (const c of w.cobros) expect(voided.get(c)).toBeNull();
  });

  it("anular un retiro nuevo ya anulado devuelve error y no cambia saldos", async () => {
    const w = await makeWorld();
    expect((await postVoid(w.nuevo.withdrawalId, "expenses")).statusCode).toBe(
      200,
    );
    const again = await postVoid(w.nuevo.withdrawalId, "expenses");
    expect(again.statusCode).toBe(400);
    expect(await firmeBalance(w.sedeId)).toBe(6990);
  });
});

describe("anular traslados comunes", () => {
  async function trasladoConConteo(): Promise<{
    sedeId: number;
    centralId: number;
    outflowId: number;
    inflowId: number;
    adjustmentId: number;
  }> {
    const sede = await newCaja({ branchId, label: "tc-sede" });
    const central = await newCaja({ branchId: null, label: "tc-central" });
    await seedCobro(sede.id, 1000);
    const res = await app.inject({
      method: "POST",
      url: `${BASE}/movements`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        origenCajaId: sede.id,
        destinoCajaId: central.id,
        amount: 100,
        countedAmount: 990,
        notes: "traslado con conteo",
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const m = (
      JSON.parse(res.body) as {
        movement: {
          outflowTxId: number;
          inflowTxId: number;
          adjustmentTxId: number | null;
        };
      }
    ).movement;
    expect(m.adjustmentTxId).not.toBeNull();
    return {
      sedeId: sede.id,
      centralId: central.id,
      outflowId: m.outflowTxId,
      inflowId: m.inflowTxId,
      adjustmentId: m.adjustmentTxId as number,
    };
  }

  it("anular por la PATA DE ENTRADA también anula el ajuste de conciliación (antes quedaba vivo)", async () => {
    const t = await trasladoConConteo();
    // 1000 - 10 (faltante) - 100 (salida) = 890.
    expect(await firmeBalance(t.sedeId)).toBe(890);
    expect(await firmeBalance(t.centralId)).toBe(100);

    const res = await postVoid(t.inflowId, "movements");
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const voided = await voidedAtOf([t.outflowId, t.inflowId, t.adjustmentId]);
    expect(voided.get(t.outflowId)).not.toBeNull();
    expect(voided.get(t.inflowId)).not.toBeNull();
    expect(voided.get(t.adjustmentId)).not.toBeNull();
    // El ajuste cae con el par: la sede vuelve a 1000 y la Central a 0.
    expect(await firmeBalance(t.sedeId)).toBe(1000);
    expect(await firmeBalance(t.centralId)).toBe(0);
  });

  it("anular por la pata de salida sigue anulando las tres filas", async () => {
    const t = await trasladoConConteo();
    const res = await postVoid(t.outflowId, "movements");
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const voided = await voidedAtOf([t.outflowId, t.inflowId, t.adjustmentId]);
    expect([...voided.values()].every((v) => v !== null)).toBe(true);
  });

  it("POST /expenses con una pata de un traslado común → 400 (se anula como traslado); con un cobro → 400", async () => {
    const t = await trasladoConConteo();
    const pata = await postVoid(t.outflowId, "expenses");
    expect(pata.statusCode).toBe(400);
    expect(pata.body.message).toContain("traslado");
    const patasVivas = await voidedAtOf([t.outflowId, t.inflowId]);
    expect([...patasVivas.values()].every((v) => v === null)).toBe(true);

    const [cobro] = await app.db
      .select({ id: schema.financialTransactions.id })
      .from(schema.financialTransactions)
      .where(
        and(
          tenantWhere(schema.financialTransactions, TEMPLO_CTX),
          eq(schema.financialTransactions.cashRegisterId, t.sedeId),
          eq(schema.financialTransactions.kind, "plan_charge"),
          isNull(schema.financialTransactions.voidedAt),
        ),
      )
      .limit(1);
    const res = await postVoid(cobro.id, "expenses");
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("No es un egreso ni un retiro");
    expect((await voidedAtOf([cobro.id])).get(cobro.id)).toBeNull();
  });

  it("POST /movements/<cobro>/void → 400 (no es un traslado) y no anula nada", async () => {
    const w = await makeWorld();
    const res = await postVoid(w.cobros[0], "movements");
    expect(res.statusCode).toBe(400);
    expect((await voidedAtOf([w.cobros[0]])).get(w.cobros[0])).toBeNull();
  });
});
