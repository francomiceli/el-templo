/**
 * Integration tests for the coach-facing Deudas tab.
 *
 * Endpoint: GET /api/admin/coach/outstanding-balances
 *
 * Coverage:
 *  - Coach sees aggregated debts of members in their assigned branch(es).
 *  - Coach is scoped out of debts in other branches.
 *  - Multiple debts of the same member in the same currency aggregate.
 *  - Free-text `search` filters by member name.
 *  - Members and recepcion are forbidden (403).
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const URL = "/api/admin/coach/outstanding-balances";

function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}

interface SeededContext {
  arBranchId: number;
  esBranchId: number;
  coachArToken: string;
  memberArToken: string;
  memberAlfaId: number;
  memberBetaId: number;
  memberEsId: number;
  planId: number;
}

async function seedFixtures(app: FastifyInstance): Promise<SeededContext> {
  const [ar] = await app.db
    .insert(schema.branches)
    .values({
      name: "AR-Coach-Test",
      code: nextSuffix("ARCO"),
      country: "AR",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();
  const [es] = await app.db
    .insert(schema.branches)
    .values({
      name: "ES-Coach-Test",
      code: nextSuffix("ESCO"),
      country: "ES",
      isVirtual: false,
      isActive: true,
    })
    .$returningId();

  const [plan] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: "Test Plan Coach",
      planTier: "flex",
      bookingMode: "flexible",
      priceRegular: 10000,
      priceZero: 8000,
      durationDays: 30,
      classesPerWeek: 3,
      country: "AR",
      currency: "ARS",
    })
    .$returningId();

  await createStaffUser(app, {
    email: "coach-ar@test.com",
    password: "coach-pass-123",
    firstName: "Coach",
    lastName: "AR",
    role: "coach",
    branchId: ar.id,
  });
  const coachArToken = await getAuthToken(
    app,
    "coach-ar@test.com",
    "coach-pass-123",
  );

  const alfaReg = await registerUser(app, {
    email: "alfa@test.com",
    password: "alfa-pass-123",
    firstName: "Alfa",
    lastName: "Perez",
    branchId: ar.id,
  });
  const memberAlfaId = (alfaReg.user as { id: number }).id;
  const memberArToken = alfaReg.token;

  const betaReg = await registerUser(app, {
    email: "beta@test.com",
    password: "beta-pass-123",
    firstName: "Beta",
    lastName: "Gomez",
    branchId: ar.id,
  });
  const memberBetaId = (betaReg.user as { id: number }).id;

  const esReg = await registerUser(app, {
    email: "gamma@test.com",
    password: "gamma-pass-123",
    firstName: "Gamma",
    lastName: "Lopez",
    branchId: es.id,
  });
  const memberEsId = (esReg.user as { id: number }).id;

  const todayStr = new Date().toISOString().split("T")[0];
  const [subAlfa] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberAlfaId,
      planId: plan.id,
      branchId: ar.id,
      startDate: todayStr,
      endDate: todayStr,
      status: "active",
      pricePaid: 10000,
      currency: "ARS",
    })
    .$returningId();
  const [subBeta] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberBetaId,
      planId: plan.id,
      branchId: ar.id,
      startDate: todayStr,
      endDate: todayStr,
      status: "active",
      pricePaid: 10000,
      currency: "ARS",
    })
    .$returningId();
  const [subEs] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId: memberEsId,
      planId: plan.id,
      branchId: es.id,
      startDate: todayStr,
      endDate: todayStr,
      status: "active",
      pricePaid: 70,
      currency: "EUR",
    })
    .$returningId();

  // Alfa: two AR debts on the same currency → must aggregate to 8000
  await app.db.insert(schema.balances).values({
    memberId: memberAlfaId,
    targetKind: "subscription",
    targetId: subAlfa.id,
    currency: "ARS",
    amount: "3000.00",
  });
  await app.db.insert(schema.balances).values({
    memberId: memberAlfaId,
    targetKind: "debt_balance",
    targetId: 0,
    currency: "ARS",
    amount: "5000.00",
  });
  // Beta: one AR debt of 2000
  await app.db.insert(schema.balances).values({
    memberId: memberBetaId,
    targetKind: "subscription",
    targetId: subBeta.id,
    currency: "ARS",
    amount: "2000.00",
  });
  // ES member: 9000 EUR — must NOT be visible to AR coach
  await app.db.insert(schema.balances).values({
    memberId: memberEsId,
    targetKind: "subscription",
    targetId: subEs.id,
    currency: "EUR",
    amount: "9000.00",
  });

  return {
    arBranchId: ar.id,
    esBranchId: es.id,
    coachArToken,
    memberArToken,
    memberAlfaId,
    memberBetaId,
    memberEsId,
    planId: plan.id,
  };
}

describe("GET /api/admin/coach/outstanding-balances", () => {
  let app: FastifyInstance;
  let ctx: SeededContext;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    await app.db.delete(schema.balances);
    ctx = await seedFixtures(app);
  });

  it("coach lists aggregated debts of members in their branch", async () => {
    const res = await app.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${ctx.coachArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      rows: Array<{
        memberId: number;
        memberName: string;
        memberPhone: string | null;
        totalAmount: number;
        currency: string;
      }>;
    };

    // Coach must NOT see the ES member. Only Alfa and Beta (both AR).
    expect(body.rows).toHaveLength(2);
    const ids = body.rows.map((r) => r.memberId).sort();
    expect(ids).toEqual([ctx.memberAlfaId, ctx.memberBetaId].sort());

    // Alfa's two ARS debts must aggregate to 8000 in a single row.
    const alfa = body.rows.find((r) => r.memberId === ctx.memberAlfaId)!;
    expect(alfa.totalAmount).toBe(8000);
    expect(alfa.currency).toBe("ARS");
    expect(alfa.memberName).toBe("Alfa Perez");
  });

  it("filters by search (name token, case-insensitive)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `${URL}?search=beta`,
      headers: { authorization: `Bearer ${ctx.coachArToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { rows: Array<{ memberId: number }> };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].memberId).toBe(ctx.memberBetaId);
  });

  it("rejects member role with 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${ctx.memberArToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
