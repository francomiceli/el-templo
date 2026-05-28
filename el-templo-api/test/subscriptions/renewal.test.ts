import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
  dateOffsetStr,
} from "./_helpers";

describe("Subscriptions API — Renewal", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  it("early renewal keeps old sub active and creates scheduled future sub", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Renewal Test Plan",
      classesPerWeek: 3,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app);

    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    const oldSubId = assignResult.body.id;

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });

    expect(res.statusCode).toBe(201);
    const newSub = JSON.parse(res.body);

    expect(newSub.id).not.toBe(oldSubId);
    expect(newSub.status).toBe("scheduled");
    expect(newSub.planId).toBe(plan.id);
    expect(newSub.previousSubscriptionId).toBe(oldSubId);
    expect(newSub.classesBudget).toBe(15);
    expect(newSub.classesRemaining).toBe(15);
    expect(newSub.pricePaid).toBe(10000);

    const oldSubRows = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, oldSubId as number));
    expect(oldSubRows[0].status).toBe("active");

    const currentRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(currentRes.statusCode).toBe(200);
    const current = JSON.parse(currentRes.body);
    expect(current.id).toBe(oldSubId);
  });

  it("blocks double early renewal when scheduled sub already exists", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Double Renewal Plan",
      classesPerWeek: 3,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app);

    await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });

    const res1 = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });
    expect(res1.statusCode).toBe(201);

    const res2 = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });
    expect(res2.statusCode).toBe(409);
  });

  it("renew records payment linked to the new subscription", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Renewal Payment Plan",
      classesPerWeek: 3,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app);

    await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "transfer" },
    });

    expect(res.statusCode).toBe(201);
    const newSub = JSON.parse(res.body);

    // Plan 105-06: payments table dropped — verify against financial_transactions
    // joined via transaction_links pivot (target_kind='subscription').
    const txnRows = await app.db
      .select({
        id: financialTransactions.id,
        amount: financialTransactions.amount,
        paymentMethod: financialTransactions.paymentMethod,
        targetId: transactionLinks.targetId,
      })
      .from(financialTransactions)
      .leftJoin(
        transactionLinks,
        eq(transactionLinks.transactionId, financialTransactions.id),
      )
      .where(eq(financialTransactions.memberId, member.id));
    expect(txnRows).toHaveLength(2);

    const renewalTxn = txnRows.find((p) => p.targetId === newSub.id);
    expect(renewalTxn).toBeTruthy();
    expect(renewalTxn!.amount).toBe(10000);
    expect(renewalTxn!.paymentMethod).toBe("transfer");
  });

  it("renew uses endDate as new startDate when current sub is still active", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Renewal Date Plan",
      classesPerWeek: undefined,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app);

    await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });

    expect(res.statusCode).toBe(201);
    const newSub = JSON.parse(res.body);
    expect(newSub.startDate).toBe(dateOffsetStr(30));
    expect(newSub.endDate).toBe(dateOffsetStr(60));
  });

  it("history shows active + scheduled after early renewal", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "History Chain Plan",
      classesPerWeek: 3,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app);

    await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });

    await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });

    const historyRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/history`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(historyRes.statusCode).toBe(200);
    const history = JSON.parse(historyRes.body);
    expect(history.subscriptions).toHaveLength(2);

    const statuses = history.subscriptions.map(
      (s: Record<string, unknown>) => s.status,
    );
    expect(statuses).toContain("active");
    expect(statuses).toContain("scheduled");
  });

  // Prevención del caso Pomilio (mayo 2026): venía pagando 75 EUR por un
  // priceOverride, pero la renovación tomaba plan.priceRegular (100) y dejaba
  // 25 de deuda fantasma. La renovación debe heredar lo que el miembro ya
  // pagaba para que el override se propague.
  it("renewal pricePaid hereda currentSub.pricePaid (carries forward overrides)", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Renewal Override Plan",
      classesPerWeek: 2,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 0,
    });
    const member = await createMember(app);

    // Asignación con precio especial (override 7500, distinto a priceRegular).
    await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      priceOverrideAmount: 7500,
      priceOverrideReason: "Descuento negociado",
    });

    const renewRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", amountReceived: 7500 },
    });
    expect(renewRes.statusCode).toBe(201);
    const newSub = JSON.parse(renewRes.body);

    // Antes del fix esto era 10000 (plan.priceRegular). Ahora debe ser 7500
    // (lo que el miembro venía pagando) — sin esto, el cobro de 7500 contra
    // una deuda sembrada en 10000 dejaba 2500 de deuda fantasma.
    expect(newSub.pricePaid).toBe(7500);
  });
});
