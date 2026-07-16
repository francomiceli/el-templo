/**
 * Gestión de deudas (brief-fran-reporte-deudas) — integration tests.
 *
 * Coverage:
 *   - PATCH /outstanding-balances/:balanceId/management
 *     · RBAC: coach 403, gestion/owner 200.
 *     · Upsert: create with promesa+notas, then partial PATCH (status only)
 *       preserves the other fields; null borra la promesa.
 *     · 404 for a nonexistent balanceId.
 *   - GET /outstanding-balances gestión layer:
 *     · Default listing = activas only; gestión fields defaulted.
 *     · status=incobrable / status=cobrada filters (cobrada relaja amount>0).
 *     · statusTotals: cobrable vs incobrable por moneda.
 *     · promise=con/sin/vencida.
 *     · lastAttendanceAt + minDaysSinceAttendance (nunca asistió = fantasma).
 *     · sortBy=amount DESC.
 *   - Auto-cobrada: BalanceService.applyDelta saldando la deuda flips la
 *     gestión a 'cobrada'; el void que la re-abre la devuelve a 'activa'.
 *
 * Runs against the per-worker test MySQL database (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { BalanceService } from "../../src/modules/finance/balance-service";
import type {
  FinancialTransactionRow,
  TransactionLinkRow,
} from "../../src/modules/finance/types";

const REPORTS_URL = "/api/admin/reports";

interface Ctx {
  arBranchId: number;
  ownerToken: string;
  ownerId: number;
  gestionArToken: string;
  coachToken: string;
  planArId: number;
}

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seedBase(app: FastifyInstance): Promise<Ctx> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-MDP-DM1",
      code: nextSuffix("DM"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  const ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  const [ownerRow] = await app.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, "admin@test.com"))
    .limit(1);

  await createStaffUser(app, {
    email: "gestion-dm@test.local",
    password: "pass123456",
    firstName: "Gestion",
    lastName: "DM",
    role: "gestion",
    branchId: ar.id,
  });
  const gestionArToken = await getAuthToken(
    app,
    "gestion-dm@test.local",
    "pass123456",
  );

  await createStaffUser(app, {
    email: "coach-dm@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "DM",
    role: "coach",
    branchId: ar.id,
  });
  const coachToken = await getAuthToken(
    app,
    "coach-dm@test.local",
    "pass123456",
  );

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Plan DM Mensual",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 50000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "ARS",
    })
    .$returningId();

  return {
    arBranchId: ar.id,
    ownerToken,
    ownerId: ownerRow.id,
    gestionArToken,
    coachToken,
    planArId: plan.id,
  };
}

/** Seed member + active subscription + balances row (deuda). */
async function seedDebt(opts: {
  app: FastifyInstance;
  ctx: Ctx;
  amount: number;
  firstName?: string;
  lastName?: string;
  createdOffsetDays?: number;
}): Promise<{ memberId: number; subscriptionId: number; balanceId: number }> {
  const memberRes = await registerUser(opts.app, {
    email: `member-dm-${nextSuffix("M")}@test.local`,
    password: "pass123456",
    firstName: opts.firstName ?? "Deudor",
    lastName: opts.lastName ?? "Test",
    branchId: opts.ctx.arBranchId,
  });
  const memberId = (memberRes.user as { id: number }).id;

  const [sub] = await opts.app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberId,
      planId: opts.ctx.planArId,
      branchId: opts.ctx.arBranchId,
      status: "active",
      startDate: dateOffset(-10),
      endDate: null,
      pricePaid: opts.amount,
      currency: "ARS",
      priceTypeApplied: "regular",
    })
    .$returningId();

  const [bal] = await opts.app.db
    .insert(schema.balances)
    .values({
      memberId,
      targetKind: "subscription",
      targetId: sub.id,
      currency: "ARS",
      amount: opts.amount,
      createdAt: new Date(
        dateOffset(opts.createdOffsetDays ?? -10) + "T00:00:00Z",
      ),
    })
    .$returningId();

  return { memberId, subscriptionId: sub.id, balanceId: bal.id };
}

async function patchManagement(
  app: FastifyInstance,
  token: string,
  balanceId: number,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; json: () => unknown }> {
  const res = await app.inject({
    method: "PATCH",
    url: `${REPORTS_URL}/outstanding-balances/${balanceId}/management`,
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
  return res;
}

async function listDebts(
  app: FastifyInstance,
  token: string,
  query = "",
): Promise<{
  rows: Array<Record<string, unknown>>;
  total: number;
  statusTotals: {
    cobrable: Record<string, number>;
    incobrable: Record<string, number>;
  };
}> {
  const res = await app.inject({
    method: "GET",
    url: `${REPORTS_URL}/outstanding-balances${query}`,
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

async function clearLedger(app: FastifyInstance): Promise<void> {
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query("DELETE FROM `debt_management`");
    await conn.query("DELETE FROM `transaction_links`");
    await conn.query("DELETE FROM `financial_transactions`");
    await conn.query("DELETE FROM `balances`");
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
}

describe("Gestión de deudas — PATCH management + filtros del listado", () => {
  let app: FastifyInstance;
  const ctx = {} as Ctx;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await clearLedger(app);
    Object.assign(ctx, await seedBase(app));
  });

  // ─── PATCH RBAC + upsert ───────────────────────────────────────────────────

  it("PATCH: coach recibe 403 (guard CAJA_ROLES del plugin)", async () => {
    const { balanceId } = await seedDebt({ app, ctx, amount: 10000 });
    const res = await patchManagement(app, ctx.coachToken, balanceId, {
      status: "incobrable",
    });
    expect(res.statusCode).toBe(403);
  });

  it("PATCH: gestion crea la gestión con promesa + notas", async () => {
    const { balanceId } = await seedDebt({ app, ctx, amount: 10000 });
    const promise = dateOffset(3);
    const res = await patchManagement(app, ctx.gestionArToken, balanceId, {
      promisedPaymentDate: promise,
      notes: "hablé con ella, paga el viernes",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.balanceId).toBe(balanceId);
    expect(body.status).toBe("activa");
    expect(body.promisedPaymentDate).toBe(promise);
    expect(body.notes).toBe("hablé con ella, paga el viernes");
  });

  it("PATCH parcial: cambiar solo status preserva promesa y notas; null borra la promesa", async () => {
    const { balanceId } = await seedDebt({ app, ctx, amount: 10000 });
    const promise = dateOffset(3);
    await patchManagement(app, ctx.ownerToken, balanceId, {
      promisedPaymentDate: promise,
      notes: "nota original",
    });

    const res1 = await patchManagement(app, ctx.ownerToken, balanceId, {
      status: "incobrable",
    });
    const body1 = res1.json() as Record<string, unknown>;
    expect(body1.status).toBe("incobrable");
    expect(body1.promisedPaymentDate).toBe(promise);
    expect(body1.notes).toBe("nota original");

    const res2 = await patchManagement(app, ctx.ownerToken, balanceId, {
      promisedPaymentDate: null,
    });
    const body2 = res2.json() as Record<string, unknown>;
    expect(body2.promisedPaymentDate).toBeNull();
    expect(body2.status).toBe("incobrable");
  });

  it("PATCH: 404 para un balanceId inexistente", async () => {
    const res = await patchManagement(app, ctx.ownerToken, 99999999, {
      status: "incobrable",
    });
    expect(res.statusCode).toBe(404);
  });

  // ─── Listado: estado + statusTotals ────────────────────────────────────────

  it("default: solo activas; campos de gestión defaulteados; incobrable sale del default y entra en su filtro", async () => {
    const a = await seedDebt({ app, ctx, amount: 10000, firstName: "Activa" });
    const b = await seedDebt({
      app,
      ctx,
      amount: 20000,
      firstName: "Fantasma",
    });

    await patchManagement(app, ctx.ownerToken, b.balanceId, {
      status: "incobrable",
    });

    const def = await listDebts(app, ctx.ownerToken);
    expect(def.total).toBe(1);
    const row = def.rows[0];
    expect(row.balanceId).toBe(a.balanceId);
    expect(row.status).toBe("activa");
    expect(row.promisedPaymentDate).toBeNull();
    expect(row.managementNotes).toBeNull();

    const inc = await listDebts(app, ctx.ownerToken, "?status=incobrable");
    expect(inc.total).toBe(1);
    expect(inc.rows[0].balanceId).toBe(b.balanceId);
    expect(inc.rows[0].status).toBe("incobrable");

    // statusTotals: cobrable vs incobrable por moneda, independiente del
    // filtro de estado aplicado.
    expect(def.statusTotals.cobrable.ARS).toBe(10000);
    expect(def.statusTotals.incobrable.ARS).toBe(20000);
    expect(inc.statusTotals.cobrable.ARS).toBe(10000);
    expect(inc.statusTotals.incobrable.ARS).toBe(20000);
  });

  it("status=cobrada: lista deudas saldadas (amount=0) marcadas cobradas", async () => {
    const a = await seedDebt({ app, ctx, amount: 10000 });
    // Saldar manualmente + marcar cobrada (el flujo auto lo cubre el test de
    // applyDelta más abajo).
    await app.db
      .update(schema.balances)
      .set({ amount: 0 })
      .where(eq(schema.balances.id, a.balanceId));
    await patchManagement(app, ctx.ownerToken, a.balanceId, {
      status: "cobrada",
    });

    const def = await listDebts(app, ctx.ownerToken);
    expect(def.total).toBe(0);

    const cob = await listDebts(app, ctx.ownerToken, "?status=cobrada");
    expect(cob.total).toBe(1);
    expect(cob.rows[0].balanceId).toBe(a.balanceId);
    expect(cob.rows[0].amount).toBe(0);
  });

  // ─── Promesa de pago ───────────────────────────────────────────────────────

  it("promise=con/sin/vencida filtran por promesa", async () => {
    const conVigente = await seedDebt({ app, ctx, amount: 1000 });
    const conVencida = await seedDebt({ app, ctx, amount: 2000 });
    const sinPromesa = await seedDebt({ app, ctx, amount: 3000 });

    await patchManagement(app, ctx.ownerToken, conVigente.balanceId, {
      promisedPaymentDate: dateOffset(5),
    });
    await patchManagement(app, ctx.ownerToken, conVencida.balanceId, {
      promisedPaymentDate: dateOffset(-5),
    });

    const con = await listDebts(app, ctx.ownerToken, "?promise=con");
    expect(con.rows.map((r) => r.balanceId).sort()).toEqual(
      [conVigente.balanceId, conVencida.balanceId].sort(),
    );

    const sin = await listDebts(app, ctx.ownerToken, "?promise=sin");
    expect(sin.total).toBe(1);
    expect(sin.rows[0].balanceId).toBe(sinPromesa.balanceId);

    const vencida = await listDebts(app, ctx.ownerToken, "?promise=vencida");
    expect(vencida.total).toBe(1);
    expect(vencida.rows[0].balanceId).toBe(conVencida.balanceId);
  });

  // ─── Última asistencia ─────────────────────────────────────────────────────

  it("lastAttendanceAt + minDaysSinceAttendance separan activos de fantasmas (nunca asistió incluido)", async () => {
    const reciente = await seedDebt({ app, ctx, amount: 1000 });
    const abandonado = await seedDebt({ app, ctx, amount: 2000 });
    const nunca = await seedDebt({ app, ctx, amount: 3000 });

    await app.db.insert(schema.attendance).values([
      {
        memberId: reciente.memberId,
        branchId: ctx.arBranchId,
        sessionDate: dateOffset(-1),
        checkedInAt: new Date(dateOffset(-1) + "T12:00:00Z"),
        status: "confirmado",
        source: "qr",
      },
      {
        memberId: abandonado.memberId,
        branchId: ctx.arBranchId,
        sessionDate: dateOffset(-40),
        checkedInAt: new Date(dateOffset(-40) + "T12:00:00Z"),
        status: "confirmado",
        source: "qr",
      },
    ]);

    const all = await listDebts(app, ctx.ownerToken);
    const byId = new Map(all.rows.map((r) => [r.balanceId, r]));
    expect(byId.get(reciente.balanceId)?.lastAttendanceAt).toBe(dateOffset(-1));
    expect(byId.get(abandonado.balanceId)?.lastAttendanceAt).toBe(
      dateOffset(-40),
    );
    expect(byId.get(nunca.balanceId)?.lastAttendanceAt).toBeNull();

    const fantasmas = await listDebts(
      app,
      ctx.ownerToken,
      "?minDaysSinceAttendance=30",
    );
    expect(fantasmas.rows.map((r) => r.balanceId).sort()).toEqual(
      [abandonado.balanceId, nunca.balanceId].sort(),
    );
  });

  // ─── Orden ─────────────────────────────────────────────────────────────────

  it("sortBy=amount ordena por monto DESC", async () => {
    const chica = await seedDebt({ app, ctx, amount: 1000 });
    const grande = await seedDebt({ app, ctx, amount: 9000 });
    const media = await seedDebt({ app, ctx, amount: 5000 });

    const res = await listDebts(
      app,
      ctx.ownerToken,
      "?sortBy=amount&sortDir=desc",
    );
    expect(res.rows.map((r) => r.balanceId)).toEqual([
      grande.balanceId,
      media.balanceId,
      chica.balanceId,
    ]);
  });

  // ─── Auto-cobrada (BalanceService.applyDelta) ──────────────────────────────

  it("auto-cobrada: saldar el balance flips la gestión a 'cobrada'; el void la devuelve a 'activa'", async () => {
    const debt = await seedDebt({ app, ctx, amount: 10000 });
    await patchManagement(app, ctx.ownerToken, debt.balanceId, {
      notes: "en gestión",
    });

    // Pago completo: inflow de 10000 linkeado a la suscripción.
    const [txIns] = await app.db
      .insert(schema.financialTransactions)
      .values({
        memberId: debt.memberId,
        kind: "debt_settlement",
        direction: "inflow",
        amount: 10000,
        currency: "ARS",
        paymentMethod: "cash",
        transactionDate: dateOffset(0),
        effectiveDate: dateOffset(0),
        branchId: ctx.arBranchId,
        recordedBy: ctx.ownerId,
      })
      .$returningId();
    await app.db.insert(schema.transactionLinks).values({
      transactionId: txIns.id,
      targetKind: "subscription",
      targetId: debt.subscriptionId,
      allocatedAmount: 10000,
    });

    const [txRow] = await app.db
      .select()
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.id, txIns.id))
      .limit(1);
    const linkRows = await app.db
      .select()
      .from(schema.transactionLinks)
      .where(eq(schema.transactionLinks.transactionId, txIns.id));

    const balanceService = new BalanceService(app.db, app.log);
    await app.db.transaction(async (tx) => {
      await balanceService.applyDelta(
        tx,
        txRow as FinancialTransactionRow,
        linkRows as TransactionLinkRow[],
        1,
      );
    });

    const [dmAfterPay] = await app.db
      .select()
      .from(schema.debtManagement)
      .where(eq(schema.debtManagement.balanceId, debt.balanceId))
      .limit(1);
    expect(dmAfterPay.status).toBe("cobrada");
    expect(dmAfterPay.notes).toBe("en gestión");

    // Void del pago: la deuda vuelve a > 0 y la gestión a 'activa'.
    await app.db.transaction(async (tx) => {
      await balanceService.applyDelta(
        tx,
        txRow as FinancialTransactionRow,
        linkRows as TransactionLinkRow[],
        -1,
      );
    });
    const [dmAfterVoid] = await app.db
      .select()
      .from(schema.debtManagement)
      .where(eq(schema.debtManagement.balanceId, debt.balanceId))
      .limit(1);
    expect(dmAfterVoid.status).toBe("activa");
  });
});
