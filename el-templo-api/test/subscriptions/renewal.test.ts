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

  // Precio personalizado en la renovación: el admin puede negociar un precio
  // distinto al heredado para ESTE período. Tiene prioridad sobre el precio
  // arrastrado y queda registrado con su razón.
  it("renewal con precio personalizado usa el override y lo persiste", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Renew Custom Price Plan",
      classesPerWeek: 2,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 0,
    });
    const member = await createMember(app);

    await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });

    const renewRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        paymentMethod: "cash",
        amountReceived: 6000,
        priceOverrideAmount: 6000,
        priceOverrideReason: "Promo renovación",
      },
    });
    expect(renewRes.statusCode).toBe(201);
    const newSub = JSON.parse(renewRes.body);

    // El override (6000) pisa el precio heredado (10000 = priceRegular).
    expect(newSub.pricePaid).toBe(6000);

    // Override persistido en la nueva suscripción.
    const newSubRows = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, newSub.id as number));
    expect(newSubRows[0].priceOverrideAmount).toBe(6000);
    expect(newSubRows[0].priceOverrideReason).toBe("Promo renovación");

    // El cobro registrado usa el monto del override.
    const txnRows = await app.db
      .select({
        amount: financialTransactions.amount,
        targetId: transactionLinks.targetId,
      })
      .from(financialTransactions)
      .leftJoin(
        transactionLinks,
        eq(transactionLinks.transactionId, financialTransactions.id),
      )
      .where(eq(financialTransactions.memberId, member.id));
    const renewalTxn = txnRows.find((t) => t.targetId === newSub.id);
    expect(renewalTxn!.amount).toBe(6000);
  });

  it("renewal con priceOverrideAmount sin razón devuelve 400", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Renew Override No Reason Plan",
      classesPerWeek: 2,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 0,
    });
    const member = await createMember(app);

    await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });

    const renewRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", priceOverrideAmount: 6000 },
    });
    expect(renewRes.statusCode).toBe(400);
  });

  // Regresión del bug de la importación legacy (jun 2026): el import masivo
  // del 2026-04-01 creó subs históricas 'expired' con created_at POSTERIOR al
  // de la sub realmente vigente del miembro. El renew ordenaba solo por
  // createdAt desc y elegía la expirada importada → trataba la renovación
  // como "plan vencido" y creaba una SEGUNDA sub activa desde hoy, en vez de
  // programarla desde el fin de la vigente (casos Lorenzino/Pandolfo/
  // Lecatsas). Una sub activa debe ganar siempre sobre una expirada.
  it("renew prefiere la sub activa sobre una expirada con createdAt más nuevo", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Legacy Import Renewal Plan",
      classesPerWeek: undefined,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app);

    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    const activeSubId = assignResult.body.id as number;

    // Simula la sub histórica importada: expirada, período pasado, pero con
    // created_at más nuevo que el de la activa (artefacto del import).
    await app.db.insert(subscriptions).values({
      userId: member.id,
      planId: plan.id,
      branchId: 1,
      status: "expired",
      startDate: dateOffsetStr(-90),
      endDate: dateOffsetStr(-60),
      pricePaid: 0,
      priceTypeApplied: "regular",
      currency: "ARS",
      createdAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });

    expect(res.statusCode).toBe(201);
    const newSub = JSON.parse(res.body);

    // Renovación anticipada de la vigente: queda programada desde su fin,
    // no activa desde hoy.
    expect(newSub.status).toBe("scheduled");
    expect(newSub.previousSubscriptionId).toBe(activeSubId);
    expect(newSub.startDate).toBe(dateOffsetStr(30));
    expect(newSub.endDate).toBe(dateOffsetStr(60));

    // El miembro no debe quedar con más de una sub activa.
    const allSubs = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, member.id));
    const actives = allSubs.filter((s) => s.status === "active");
    expect(actives).toHaveLength(1);
    expect(actives[0].id).toBe(activeSubId);
  });

  // ── Fecha de inicio personalizada (hotfix 2026-07-06) ─────────────────────

  it("renew con startDate custom futuro programa la renovación en esa fecha (gap)", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Renew Custom Start Gap",
      classesPerWeek: undefined,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app);
    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    const oldSubId = assignResult.body.id as number;

    // Vencimiento actual = +30; el admin pide arrancar en +45 (gap de 15 días).
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", startDate: dateOffsetStr(45) },
    });

    expect(res.statusCode).toBe(201);
    const newSub = JSON.parse(res.body);
    expect(newSub.status).toBe("scheduled");
    expect(newSub.startDate).toBe(dateOffsetStr(45));
    expect(newSub.endDate).toBe(dateOffsetStr(75));
    expect(newSub.previousSubscriptionId).toBe(oldSubId);
  });

  it("renew con startDate anterior al vencimiento actual devuelve 400 (sub vigente)", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Renew Custom Start Overlap",
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

    // Vencimiento actual = +30; pedir +10 solaparía con la sub vigente.
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", startDate: dateOffsetStr(10) },
    });

    expect(res.statusCode).toBe(400);
  });

  it("renew de sub vencida con startDate custom futuro queda programada", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Renew Expired Custom Future",
      classesPerWeek: undefined,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app);
    // Período pasado (inicio -40, fin -10): al leer, la sub auto-expira.
    await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: dateOffsetStr(-40),
    });
    await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", startDate: dateOffsetStr(20) },
    });

    expect(res.statusCode).toBe(201);
    const newSub = JSON.parse(res.body);
    expect(newSub.status).toBe("scheduled");
    expect(newSub.startDate).toBe(dateOffsetStr(20));
    expect(newSub.endDate).toBe(dateOffsetStr(50));
  });

  it("renew de sub vencida con startDate custom = hoy queda activa", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Renew Expired Custom Today",
      classesPerWeek: undefined,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app);
    await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: dateOffsetStr(-40),
    });
    await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", startDate: todayStr() },
    });

    expect(res.statusCode).toBe(201);
    const newSub = JSON.parse(res.body);
    expect(newSub.status).toBe("active");
    expect(newSub.startDate).toBe(todayStr());
    expect(newSub.endDate).toBe(dateOffsetStr(30));
  });

  it("successor con startDate futuro NO se activa al vencer la anterior (respeta el gap)", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Gap Deferral Plan",
      classesPerWeek: undefined,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app);
    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    const oldSubId = assignResult.body.id as number;

    const renewRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", startDate: dateOffsetStr(45) },
    });
    const successorId = JSON.parse(renewRes.body).id as number;

    // Simula que la anterior venció (endDate en el pasado) mientras el successor
    // conserva su startDate futuro (+45).
    await app.db
      .update(subscriptions)
      .set({ endDate: dateOffsetStr(-1) })
      .where(eq(subscriptions.id, oldSubId));

    // Un read dispara autoExpireSubscriptions.
    await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/history`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const rows = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, member.id));
    const oldRow = rows.find((r) => r.id === oldSubId);
    const succRow = rows.find((r) => r.id === successorId);
    // Sin successor elegible (startDate futuro), la anterior expira (no se
    // "completa") y el successor sigue encolado hasta que llegue su fecha.
    expect(oldRow!.status).toBe("expired");
    expect(succRow!.status).toBe("scheduled");
  });

  it("successor sin gap se activa al vencer la anterior (no regresión del guard)", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "No Gap Activation Plan",
      classesPerWeek: undefined,
      durationDays: 30,
      priceRegular: 10000,
      priceZero: 5000,
    });
    const member = await createMember(app);
    const assignResult = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    const oldSubId = assignResult.body.id as number;

    // Renovación normal (sin fecha custom): successor programado desde +30.
    const renewRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });
    const successorId = JSON.parse(renewRes.body).id as number;

    // Simula el paso del tiempo: la anterior venció y el successor ya alcanzó su
    // fecha de inicio (ambos en el pasado).
    await app.db
      .update(subscriptions)
      .set({ endDate: dateOffsetStr(-1) })
      .where(eq(subscriptions.id, oldSubId));
    await app.db
      .update(subscriptions)
      .set({ startDate: dateOffsetStr(-1) })
      .where(eq(subscriptions.id, successorId));

    await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/history`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    const rows = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, member.id));
    const oldRow = rows.find((r) => r.id === oldSubId);
    const succRow = rows.find((r) => r.id === successorId);
    expect(oldRow!.status).toBe("completed");
    expect(succRow!.status).toBe("active");
  });
});
