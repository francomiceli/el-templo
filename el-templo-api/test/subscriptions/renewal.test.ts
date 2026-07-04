import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { systemSettings } from "../../src/db/schema/system-settings";
import { PRICING_SETTINGS_KEYS } from "../../src/modules/settings/keys";
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

  // WR-04 (ALUM-03/D-03): la regla de recargo OFF debe alcanzar las
  // renovaciones. Un socio con una sub 'credit_card' heredada (dada de alta
  // cuando la regla estaba ON) NO debe seguir renovando con el precio con
  // recargo indefinidamente: al renovar con la regla OFF, la nueva sub nace
  // 'regular' al precio regular vigente del plan.
  it("renewal con la regla OFF normaliza credit_card heredado a regular", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Renew Card OFF Plan",
      classesPerWeek: 2,
      durationDays: 30,
      priceRegular: 10000,
      priceCreditCard: 12000,
      priceZero: 0,
    });
    const member = await createMember(app);

    // Sub previa 'active' con tarjeta (estado heredado de cuando la regla
    // estaba ON). cleanAllTestData dejó system_settings vacío ⇒ regla OFF.
    await app.db.insert(subscriptions).values({
      userId: member.id,
      planId: plan.id,
      branchId: 1,
      status: "active",
      startDate: todayStr(),
      endDate: dateOffsetStr(30),
      pricePaid: 12000,
      priceTypeApplied: "credit_card",
      currency: "ARS",
    });

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });
    expect(res.statusCode).toBe(201);
    const newSub = JSON.parse(res.body);

    // Normalizado: NO perpetúa 12000 (priceCreditCard); cobra 10000 (regular).
    expect(newSub.pricePaid).toBe(10000);
    const rows = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, newSub.id as number));
    expect(rows[0].priceTypeApplied).toBe("regular");
  });

  // El Templo intacto: con la regla ON, la herencia de credit_card + su precio
  // se conserva tal cual (el gate es identidad).
  it("renewal con la regla ON conserva credit_card y su precio", async () => {
    await app.db.insert(systemSettings).values({
      settingKey: PRICING_SETTINGS_KEYS.cardSurcharge,
      settingValue: "on",
    });

    const plan = await createPlan(app, adminToken, {
      name: "Renew Card ON Plan",
      classesPerWeek: 2,
      durationDays: 30,
      priceRegular: 10000,
      priceCreditCard: 12000,
      priceZero: 0,
    });
    const member = await createMember(app);

    await app.db.insert(subscriptions).values({
      userId: member.id,
      planId: plan.id,
      branchId: 1,
      status: "active",
      startDate: todayStr(),
      endDate: dateOffsetStr(30),
      pricePaid: 12000,
      priceTypeApplied: "credit_card",
      currency: "ARS",
    });

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "card" },
    });
    expect(res.statusCode).toBe(201);
    const newSub = JSON.parse(res.body);

    // Sin cambios: hereda 12000 y el tipo credit_card.
    expect(newSub.pricePaid).toBe(12000);
    const rows = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, newSub.id as number));
    expect(rows[0].priceTypeApplied).toBe("credit_card");
  });
});
