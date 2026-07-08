/**
 * Integration tests para GET /api/admin/reports/scheduled-income.
 *
 * "Cobros esperados": complemento del Reporte Deudas — saldos de plan
 * (amount > 0) cuya subscription todavía NO arrancó (start_date > CURDATE()).
 *
 * Cobertura:
 *   - RBAC: coach 403, gestion 200 (CAJA_ROLES).
 *   - Un plan a futuro aparece con startDate/startMonth y suma en monthlyTotals.
 *   - Un plan ya iniciado (deuda real) NO aparece acá (va a Deudas).
 *   - Un saldo debt_balance no aparece (no es plan a futuro).
 *   - monthlyTotals: non-owner plano; owner keyed por moneda.
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
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

const REPORTS_URL = "/api/admin/reports";

interface Ctx {
  arBranchId: number;
  esBranchId: number;
  ownerToken: string;
  gestionArToken: string;
  coachToken: string;
  planArId: number;
  planEsId: number;
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

async function seedFixtures(app: FastifyInstance): Promise<Ctx> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-SI-1",
      code: nextSuffix("SI"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-SI-1",
      code: nextSuffix("SI"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  return {
    arBranchId: ar.id,
    esBranchId: es.id,
    ownerToken: "",
    gestionArToken: "",
    coachToken: "",
    planArId: 0,
    planEsId: 0,
  };
}

async function seedRolesAndPlans(
  app: FastifyInstance,
  ctx: Ctx,
): Promise<void> {
  ctx.ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");

  await createStaffUser(app, {
    email: "si-gestion@test.local",
    password: "pass123456",
    firstName: "Gestion",
    lastName: "AR",
    role: "gestion",
    branchId: ctx.arBranchId,
  });
  ctx.gestionArToken = await getAuthToken(
    app,
    "si-gestion@test.local",
    "pass123456",
  );

  await createStaffUser(app, {
    email: "si-coach@test.local",
    password: "pass123456",
    firstName: "Coach",
    lastName: "AR",
    role: "coach",
    branchId: ctx.arBranchId,
  });
  ctx.coachToken = await getAuthToken(app, "si-coach@test.local", "pass123456");

  const [planAr] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Plan AR SI",
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
  ctx.planArId = planAr.id;

  const [planEs] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Plan ES SI",
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 30000,
      priceZero: 0,
      durationDays: 30,
      classesPerWeek: 3,
      currency: "EUR",
    })
    .$returningId();
  ctx.planEsId = planEs.id;
}

async function seedSubWithBalance(opts: {
  app: FastifyInstance;
  branchId: number;
  planId: number;
  currency: "ARS" | "EUR";
  startOffsetDays: number;
  status: "active" | "scheduled";
  amount: number;
}): Promise<void> {
  const member = await registerUser(opts.app, {
    email: `si-m-${nextSuffix("M")}@test.local`,
    password: "pass123456",
    firstName: "Test",
    lastName: "Member",
    branchId: opts.branchId,
  });
  const memberId = (member.user as { id: number }).id;
  const [sub] = await opts.app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberId,
      planId: opts.planId,
      branchId: opts.branchId,
      status: opts.status,
      startDate: dateOffset(opts.startOffsetDays),
      pricePaid: opts.amount,
      currency: opts.currency,
      priceTypeApplied: "regular",
    })
    .$returningId();
  await opts.app.db.insert(schema.balances).values({
    memberId,
    targetKind: "subscription",
    targetId: sub.id,
    currency: opts.currency,
    amount: opts.amount,
  });
}

async function clearLedger(app: FastifyInstance): Promise<void> {
  const conn = await app.dbPool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS=0");
    await conn.query("DELETE FROM `transaction_links`");
    await conn.query("DELETE FROM `financial_transactions`");
    await conn.query("DELETE FROM `balances`");
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  } finally {
    conn.release();
  }
}

describe("Reports API — GET /scheduled-income (cobros esperados)", () => {
  let app: FastifyInstance;
  const ctx = {} as Ctx;

  beforeAll(async () => {
    app = await createTestApp();
    Object.assign(ctx, await seedFixtures(app));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await clearLedger(app);
    Object.assign(ctx, await seedFixtures(app));
    await seedRolesAndPlans(app, ctx);
  });

  it("RBAC: coach 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/scheduled-income`,
      headers: { authorization: `Bearer ${ctx.coachToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("RBAC: gestion 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/scheduled-income`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("lista un plan a futuro con startDate/startMonth y suma en monthlyTotals", async () => {
    await seedSubWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      currency: "ARS",
      startOffsetDays: 30,
      status: "scheduled",
      amount: 560000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/scheduled-income`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.rows[0].amount).toBe(560000);
    expect(body.rows[0].startDate).toBe(dateOffset(30));
    expect(body.rows[0].startMonth).toBe(dateOffset(30).slice(0, 7));
    // monthlyTotals plano (non-owner), un mes con el total.
    expect(Array.isArray(body.monthlyTotals)).toBe(true);
    const sum = body.monthlyTotals.reduce(
      (a: number, t: { amount: number }) => a + t.amount,
      0,
    );
    expect(sum).toBe(560000);
    expect(body.monthlyTotals[0].month).toBe(dateOffset(30).slice(0, 7));
    expect(typeof body.monthlyTotals[0].label).toBe("string");
  });

  it("un plan ya iniciado (deuda real) NO aparece acá", async () => {
    await seedSubWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      currency: "ARS",
      startOffsetDays: -10, // ya arrancó → es deuda, no cobro esperado
      status: "active",
      amount: 1000,
    });
    // control: uno a futuro sí aparece
    await seedSubWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      currency: "ARS",
      startOffsetDays: 15,
      status: "scheduled",
      amount: 2000,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/scheduled-income`,
      headers: { authorization: `Bearer ${ctx.gestionArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].amount).toBe(2000);
  });

  it("owner: monthlyTotals keyed por moneda, ordenado por mes", async () => {
    await seedSubWithBalance({
      app,
      branchId: ctx.arBranchId,
      planId: ctx.planArId,
      currency: "ARS",
      startOffsetDays: 10,
      status: "scheduled",
      amount: 100000,
    });
    await seedSubWithBalance({
      app,
      branchId: ctx.esBranchId,
      planId: ctx.planEsId,
      currency: "EUR",
      startOffsetDays: 40,
      status: "scheduled",
      amount: 500,
    });

    const res = await app.inject({
      method: "GET",
      url: `${REPORTS_URL}/scheduled-income`,
      headers: { authorization: `Bearer ${ctx.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(Array.isArray(body.monthlyTotals)).toBe(false);
    expect(body.monthlyTotals.ARS[0].amount).toBe(100000);
    expect(body.monthlyTotals.EUR[0].amount).toBe(500);
  });
});
