/**
 * Paridad preview ↔ cobro del descuento de referido (fix 2026-07-16).
 *
 * (1) El pricing-preview simula la cualificación del vínculo `pending` del
 *     payer-referido (el cobro real lo flippea ANTES de computar, D-21), así el
 *     stepper del admin muestra y precarga el precio que efectivamente se cobra.
 * (2) El preview respeta el guard de categoría: los pases especiales quedan
 *     FUERA de referidos (D-09/T-161-05) — antes el preview descontaba y el
 *     cobro no.
 * (3) El change-plan-preview refleja el descuento sobre el neto post-prorrateo,
 *     igual que changePlanNow.
 * (4) La renovación NO compone el descuento: hereda la base PRE-descuento
 *     (add-back de referralDiscountAmount) y re-aplica el % vigente del ciclo.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import {
  createPlan,
  createMember,
  assignPlan,
  SUBSCRIPTIONS_URL,
} from "../subscriptions/_helpers";
import * as schema from "../../src/db/schema";

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
  await app.db.execute(
    sql`INSERT INTO aura_config (aura_config_source_type, default_amount)
        VALUES ('referral', 10)
        ON DUPLICATE KEY UPDATE default_amount = 10`,
  );
  await app.db.execute(
    sql`INSERT INTO system_settings (setting_key, setting_value)
        VALUES ('referral.max_percent_cap', '40')
        ON DUPLICATE KEY UPDATE setting_value = '40'`,
  );
});

async function linkPending(
  referrerId: number,
  referredId: number,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel)
        VALUES (${referrerId}, ${referredId}, 'pending', 'assisted')`,
  );
}

async function linkQualified(
  referrerId: number,
  referredId: number,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (${referrerId}, ${referredId}, 'qualified', 'assisted', NOW())`,
  );
}

async function giveCoverage(
  userId: number,
  planId: number,
  endDate: string,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO subscriptions (user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
        VALUES (${userId}, ${planId}, 1, 'active', ${todayStr()}, ${endDate}, 10000, 'ARS', 'regular')`,
  );
}

async function getPricingPreview(
  memberId: number,
  planId: number,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "GET",
    url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/pricing-preview?planId=${planId}&priceType=regular`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function createEspecialPlan(priceRegular: number): Promise<number> {
  const res = await app.db.insert(schema.subscriptionPlans).values({
    name: "Pase Especial Preview",
    planTier: "other",
    bookingMode: "flexible",
    planCategory: "especial",
    priceRegular,
    priceZero: priceRegular,
    durationDays: 30,
    classesPerWeek: null,
    monthlyClassBudget: 2,
    requiresPresencial: false,
    country: "AR",
    currency: "ARS",
  });
  return Number(res[0].insertId);
}

describe("Referral discount preview parity", () => {
  it("(1) pricing-preview simula el vínculo pending del payer-referido (primer pago)", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const referrer = await createMember(app, { email: "pp-1-r@test.com" });
    const referred = await createMember(app, { email: "pp-1-d@test.com" });
    await linkPending(referrer.id, referred.id);
    await giveCoverage(referrer.id, plan.id, dateOffsetStr(30));

    const res = await getPricingPreview(referred.id, plan.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.referralDiscountPercent).toBe(10);
    expect(res.body.referralDiscountAmount).toBe(1500);
    expect(res.body.finalPrice).toBe(13500); // el precio que el cobro real aplica

    // Y el cobro real coincide con el preview (paridad end-to-end).
    const charge = await assignPlan(app, adminToken, referred.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(13500);
  });

  it("(1b) pending con referidor SIN cobertura → preview sin descuento", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const referrer = await createMember(app, { email: "pp-1b-r@test.com" });
    const referred = await createMember(app, { email: "pp-1b-d@test.com" });
    await linkPending(referrer.id, referred.id);
    // referrer sin sub activa

    const res = await getPricingPreview(referred.id, plan.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.referralDiscountPercent).toBe(0);
    expect(res.body.finalPrice).toBe(15000);
  });

  it("(1c) el pending ajeno (payer como referidor) NO se simula", async () => {
    // qualifyFirstPayment solo flippea vínculos donde el payer es el REFERIDO;
    // que el payer tenga un referido pendiente no descuenta su propio cobro.
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const referrer = await createMember(app, { email: "pp-1c-r@test.com" });
    const referred = await createMember(app, { email: "pp-1c-d@test.com" });
    await linkPending(referrer.id, referred.id);
    await giveCoverage(referred.id, plan.id, dateOffsetStr(30));

    const res = await getPricingPreview(referrer.id, plan.id);
    expect(res.statusCode).toBe(200);
    expect(res.body.referralDiscountPercent).toBe(0);
    expect(res.body.finalPrice).toBe(15000);
  });

  it("(2) plan especial: preview sin descuento aunque haya vínculo qualified activo", async () => {
    const especialId = await createEspecialPlan(20000);
    const payer = await createMember(app, { email: "pp-2-p@test.com" });
    const referred = await createMember(app, { email: "pp-2-d@test.com" });
    await linkQualified(payer.id, referred.id);
    const regularPlan = await createPlan(app, adminToken, {
      priceRegular: 10000,
    });
    await giveCoverage(referred.id, regularPlan.id, dateOffsetStr(30));

    const res = await getPricingPreview(payer.id, especialId);
    expect(res.statusCode).toBe(200);
    expect(res.body.referralDiscountPercent).toBe(0);
    expect(res.body.referralDiscountAmount).toBe(0);
    expect(res.body.finalPrice).toBe(20000);
  });

  it("(3) change-plan-preview descuenta referido sobre el neto post-prorrateo", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
    const target = await createPlan(app, adminToken, {
      name: "Plan Caro",
      priceRegular: 20000,
    });
    const payer = await createMember(app, { email: "pp-3-p@test.com" });
    const referred = await createMember(app, { email: "pp-3-d@test.com" });
    await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    await linkQualified(payer.id, referred.id);
    await giveCoverage(referred.id, plan.id, dateOffsetStr(30));

    const res = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${payer.id}/subscription/change-plan-preview?targetPlanId=${target.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      allowed: boolean;
      proration: { remainingValue: number };
      netAmount: number;
      referralDiscountPercent: number;
      referralDiscountAmount: number;
    };
    expect(body.allowed).toBe(true);
    expect(body.referralDiscountPercent).toBe(10);
    // Consistencia interna: netAmount = neto post-prorrateo - descuento.
    const preDiscount = Math.max(0, 20000 - body.proration.remainingValue);
    const expectedDiscount = Math.floor(preDiscount * 0.1);
    expect(body.referralDiscountAmount).toBe(expectedDiscount);
    expect(body.netAmount).toBe(preDiscount - expectedDiscount);
  });

  it("(4) la renovación NO compone el descuento (add-back de la base)", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const payer = await createMember(app, { email: "pp-4-p@test.com" });
    const referred = await createMember(app, { email: "pp-4-d@test.com" });
    await linkQualified(payer.id, referred.id);
    await giveCoverage(referred.id, plan.id, dateOffsetStr(60));

    // Primer cobro: 15000 - 10% = 13500 (referralDiscountAmount = 1500).
    const first = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    expect(first.statusCode).toBe(201);
    expect(first.body.pricePaid).toBe(13500);

    // Renovación: hereda la base PRE-descuento (13500 + 1500 = 15000) y
    // re-aplica el 10% vigente → 13500 otra vez, NO 12150.
    const renew = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${payer.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });
    expect(renew.statusCode).toBe(201);
    const renewBody = JSON.parse(renew.body) as {
      pricePaid: number;
      referralDiscountAmount: number | null;
    };
    expect(renewBody.pricePaid).toBe(13500);
    expect(renewBody.referralDiscountAmount).toBe(1500);
  });

  it("(4b) si el vínculo se suspende, la renovación vuelve al precio pleno", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const payer = await createMember(app, { email: "pp-4b-p@test.com" });
    const referred = await createMember(app, { email: "pp-4b-d@test.com" });
    await linkQualified(payer.id, referred.id);
    // Cobertura corta: activa hoy, vencida para el ciclo siguiente no hace
    // falta — la borramos después del primer cobro.
    await giveCoverage(referred.id, plan.id, dateOffsetStr(60));

    const first = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    expect(first.statusCode).toBe(201);
    expect(first.body.pricePaid).toBe(13500);

    // La contraparte pierde cobertura → el descuento del ciclo nuevo es 0 y la
    // base heredada vuelve a ser la pre-descuento (15000), no la descontada.
    await app.db.execute(
      sql`UPDATE subscriptions SET subscription_status = 'cancelled' WHERE user_id = ${referred.id}`,
    );

    const renew = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${payer.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash" },
    });
    expect(renew.statusCode).toBe(201);
    expect(JSON.parse(renew.body).pricePaid).toBe(15000);
  });
});
