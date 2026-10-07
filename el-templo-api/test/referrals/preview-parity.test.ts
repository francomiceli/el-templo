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
 *     igual que changePlanNow (194-17: mismo helper del árbitro, casos (11)-(17)).
 * (4) La renovación NO compone el descuento: hereda la base PRE-descuento
 *     (add-back de referralDiscountAmount) y re-aplica el % vigente del ciclo.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import {
  createPlan,
  createMember,
  assignPlan,
  seedAuraBalance,
  SUBSCRIPTIONS_URL,
} from "../subscriptions/_helpers";
import {
  createActiveSub,
  createInvitationRow,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  createTrialPlan,
  fixtureCtx,
  resetInvitationSettings,
  type InvitationsFixtureCtx,
} from "../invitations/_helpers";
import {
  insertPartner,
  insertPartnerLink,
} from "../referral-partners/_helpers";
import * as schema from "../../src/db/schema";
import { setInvitationSettings } from "../../src/modules/referrals/invitation-settings";
import { PRICING_SETTINGS_KEYS } from "../../src/modules/settings/keys";
import { computeProratedPrice } from "../../src/modules/subscriptions/month-end";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

// 194-15 D-10b: sin el flag `allowsInvitationDiscount` el plan ni cualifica ni
// descuenta; los planes de estos casos lo llevan (producción lo backfilleó, D-23).
const FLAGGED_15000 = {
  priceRegular: 15000,
  allowsInvitationDiscount: true,
};

let app: FastifyInstance;
let ctx: InvitationsFixtureCtx;
let adminToken: string;

beforeAll(async () => {
  app = await createTestApp();
  ctx = fixtureCtx(app);
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await resetInvitationSettings(ctx);
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
    sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel)
        VALUES (1, ${referrerId}, ${referredId}, 'pending', 'assisted')`,
  );
}

async function linkQualified(
  referrerId: number,
  referredId: number,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (1, ${referrerId}, ${referredId}, 'qualified', 'assisted', NOW())`,
  );
}

async function giveCoverage(
  userId: number,
  planId: number,
  endDate: string,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO subscriptions (tenant_id, user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
        VALUES (${TENANT_TEMPLO}, ${userId}, ${planId}, 1, 'active', ${todayStr()}, ${endDate}, 10000, 'ARS', 'regular')`,
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
    tenantId: TENANT_TEMPLO,
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
    const plan = await createPlan(app, adminToken, FLAGGED_15000);
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
    const plan = await createPlan(app, adminToken, FLAGGED_15000);
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
    const plan = await createPlan(app, adminToken, FLAGGED_15000);
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
      // 194-17 D-10b: el cambio inmediato descuenta solo con el flag del plan destino.
      allowsInvitationDiscount: true,
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
    const plan = await createPlan(app, adminToken, FLAGGED_15000);
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
    const plan = await createPlan(app, adminToken, FLAGGED_15000);
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
      sql`UPDATE subscriptions SET subscription_status = 'cancelled' WHERE user_id = ${referred.id} AND tenant_id = ${TENANT_TEMPLO}`,
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

// ─── 194-15: el preview del alta usa el MISMO árbitro que el cobro ────────────

interface ArbiterPreview {
  finalPrice: number;
  discountType: string;
  auraToSpend: number;
  referralDiscountPercent: number;
  referralDiscountAmount: number;
  invitationDiscountPercent: number;
  invitationDiscountAmount: number;
  invitationDiscountCapped: boolean;
  winningDiscount: string;
}

async function previewOf(
  memberId: number,
  planId: number,
  auraSpend?: number,
): Promise<ArbiterPreview> {
  const qs = auraSpend ? `&auraSpend=${auraSpend}` : "";
  const res = await app.inject({
    method: "GET",
    url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/pricing-preview?planId=${planId}&priceType=regular${qs}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body) as ArbiterPreview;
}

/** Invitado (físico, AR) con una invitación activa de un invitador con membresía vigente. */
async function inviteeWithInvitation(): Promise<{
  id: number;
  branchId: number;
  inviterId: number;
}> {
  const inviter = await createInviterWithCode(ctx);
  const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
  await createInvitationRow(ctx, {
    inviterId: inviter.id,
    invitedUserId: payer.id,
    branchId: payer.branchId,
    channel: "assisted",
  });
  return { id: payer.id, branchId: payer.branchId, inviterId: inviter.id };
}

async function referralRowsOf(userId: number) {
  return app.db
    .select({ id: schema.referrals.id })
    .from(schema.referrals)
    .where(
      and(
        tenantWhere(schema.referrals, ctx.tenant),
        eq(schema.referrals.referredId, userId),
      ),
    );
}

async function auraBalanceOf(userId: number): Promise<number> {
  const rows = await app.db.execute(
    sql`SELECT balance FROM aura_balances WHERE user_id = ${userId}`,
  );
  return (rows[0] as unknown as Array<{ balance: number }>)[0]?.balance ?? 0;
}

async function creditOf(
  userId: number,
): Promise<{ percent: number; amount: number } | undefined> {
  const rows = await app.db.execute(
    sql`SELECT percent, amount FROM referral_credits WHERE user_id = ${userId} AND tenant_id = ${TENANT_TEMPLO} ORDER BY id DESC LIMIT 1`,
  );
  return (rows[0] as unknown as Array<{ percent: number; amount: number }>)[0];
}

describe("194-15: paridad preview ↔ cobro del alta con el árbitro", () => {
  it("(5) AURA 10% vs invitación 10% (empate): el preview muestra que gana la invitación y NO promete gastar AURA; el cobro coincide", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED_15000);
    const referrer = await createMember(app, { email: "pp-5-r@test.com" });
    const payer = await createMember(app, { email: "pp-5-p@test.com" });
    await linkQualified(referrer.id, payer.id);
    await giveCoverage(referrer.id, plan.id, dateOffsetStr(30));
    await seedAuraBalance(app, payer.id, 1000);

    const preview = await previewOf(payer.id, plan.id, 1000);
    expect(preview.winningDiscount).toBe("invitation");
    expect(preview.discountType).toBe("none");
    expect(preview.auraToSpend).toBe(0);
    expect(preview.invitationDiscountAmount).toBe(1500);
    expect(preview.finalPrice).toBe(13500);

    const charge = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      startDate: todayStr(),
      auraSpend: 1000,
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(preview.finalPrice);
    expect(await auraBalanceOf(payer.id)).toBe(1000);
  });

  it("(6) AURA 30% gana a la invitación: el preview lo informa y el cobro paga lo mismo", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED_15000);
    const referrer = await createMember(app, { email: "pp-6-r@test.com" });
    const payer = await createMember(app, { email: "pp-6-p@test.com" });
    await linkQualified(referrer.id, payer.id);
    await giveCoverage(referrer.id, plan.id, dateOffsetStr(30));
    await seedAuraBalance(app, payer.id, 5000);

    const preview = await previewOf(payer.id, plan.id, 5000);
    expect(preview.winningDiscount).toBe("aura");
    expect(preview.invitationDiscountAmount).toBe(0);
    expect(preview.invitationDiscountPercent).toBe(0);
    expect(preview.finalPrice).toBe(10500);

    const charge = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      startDate: todayStr(),
      auraSpend: 5000,
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(preview.finalPrice);
    expect(await creditOf(payer.id)).toBeUndefined();
  });

  it("(7) tope en dinero AR 1000: el preview informa monto recortado y `capped`, y el cobro (y su crédito) coinciden", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 1000 },
    });
    const plan = await createPlan(app, adminToken, FLAGGED_15000);
    const referrer = await createMember(app, { email: "pp-7-r@test.com" });
    const payer = await createMember(app, { email: "pp-7-p@test.com" });
    await linkQualified(referrer.id, payer.id);
    await giveCoverage(referrer.id, plan.id, dateOffsetStr(30));

    const preview = await previewOf(payer.id, plan.id);
    expect(preview.winningDiscount).toBe("invitation");
    expect(preview.invitationDiscountPercent).toBe(10); // nominal
    expect(preview.invitationDiscountAmount).toBe(1000); // recortado (nominal 1500)
    expect(preview.invitationDiscountCapped).toBe(true);
    expect(preview.finalPrice).toBe(14000);

    const charge = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(preview.finalPrice);
    expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 1000 });
  });

  it("(8) vínculo a materializar: el preview ya muestra el 10% (simulado) sin crear la fila; el cobro la crea y paga lo mismo", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED_15000);
    const payer = await inviteeWithInvitation();

    const first = await previewOf(payer.id, plan.id);
    const second = await previewOf(payer.id, plan.id);
    expect(first.invitationDiscountPercent).toBe(10);
    expect(first.invitationDiscountAmount).toBe(1500);
    expect(first.winningDiscount).toBe("invitation");
    expect(first.finalPrice).toBe(13500);
    expect(second).toEqual(first); // idempotente
    // El preview es SOLO LECTURA: no materializó el vínculo.
    expect(await referralRowsOf(payer.id)).toHaveLength(0);

    const charge = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      branchId: payer.branchId,
      startDate: todayInTz("America/Argentina/Buenos_Aires"),
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(first.finalPrice);
    expect(await referralRowsOf(payer.id)).toHaveLength(1);
  });

  it("(9) plan SIN flag: el preview no descuenta (aunque haya invitación) y coincide con el cobro", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const payer = await inviteeWithInvitation();

    const preview = await previewOf(payer.id, plan.id);
    expect(preview.winningDiscount).toBe("none");
    expect(preview.invitationDiscountAmount).toBe(0);
    expect(preview.finalPrice).toBe(15000);

    const charge = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      branchId: payer.branchId,
      startDate: todayInTz("America/Argentina/Buenos_Aires"),
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(preview.finalPrice);
    expect(await referralRowsOf(payer.id)).toHaveLength(0);
  });

  it("(10) compat: `referralDiscountPercent/Amount` (deprecado) vale lo mismo que `invitationDiscountPercent/Amount`", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED_15000);
    const payer = await inviteeWithInvitation();
    const preview = await previewOf(payer.id, plan.id);
    expect(preview.referralDiscountPercent).toBe(
      preview.invitationDiscountPercent,
    );
    expect(preview.referralDiscountAmount).toBe(
      preview.invitationDiscountAmount,
    );
    expect(preview.referralDiscountAmount).toBe(1500);
  });
});

// ─── 194-17: paridad preview ↔ cobro del cambio inmediato (changePlanNow) ────

const TZ_AR = "America/Argentina/Buenos_Aires";
const NOW_A = 10000; // plan vigente
const NOW_B = 20000; // plan destino

interface ChangePreview {
  allowed: boolean;
  proration: { remainingValue: number };
  netAmount: number;
  referralDiscountPercent: number;
  referralDiscountAmount: number;
  invitationDiscountPercent: number;
  invitationDiscountAmount: number;
  invitationDiscountCapped: boolean;
  winningDiscount: string;
  partnerDiscountPercent: number;
  partnerDiscountAmount: number;
}

async function changePreviewOf(
  memberId: number,
  targetPlanId: number,
): Promise<ChangePreview> {
  const res = await app.inject({
    method: "GET",
    url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/change-plan-preview?targetPlanId=${targetPlanId}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body) as ChangePreview;
}

async function changeNowCharge(
  memberId: number,
  planId: number,
  branchId = 1,
): Promise<{ id: number; pricePaid: number }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/change-plan`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      planId,
      branchId,
      startDate: todayInTz(TZ_AR),
      startMode: "now",
      priceTypeApplied: "regular",
      paymentMethod: "cash",
    },
  });
  expect(res.statusCode).toBe(201);
  return JSON.parse(res.body) as { id: number; pricePaid: number };
}

/** Socio con una sub (plan SIN flag) a mitad de camino: el cambio inmediato tiene crédito. */
async function memberWithHalfUsedSub(
  email: string,
): Promise<{ id: number; planA: number }> {
  const planA = await createPlan(app, adminToken, {
    name: `Now A ${email}`,
    priceRegular: NOW_A,
  });
  const member = await createMember(app, { email });
  const res = await assignPlan(app, adminToken, member.id, {
    planId: planA.id,
    startDate: addDays(todayInTz(TZ_AR), -15),
  });
  expect(res.statusCode).toBe(201);
  return { id: member.id, planA: planA.id };
}

async function nowTarget(allowsInvitationDiscount: boolean): Promise<number> {
  const plan = await createPlan(app, adminToken, {
    name: `Now B ${allowsInvitationDiscount ? "flag" : "sin-flag"} ${Date.now()}`,
    priceRegular: NOW_B,
    allowsInvitationDiscount,
  });
  return plan.id;
}

describe("194-17: paridad preview ↔ cobro del cambio inmediato (changePlanNow)", () => {
  it("(11) invitación sola: el preview descuenta 10% del neto post-prorrateo, expone invitationDiscount* + winningDiscount y el cobro coincide", async () => {
    const m = await memberWithHalfUsedSub("pp-11-p@test.com");
    const referrer = await createMember(app, { email: "pp-11-r@test.com" });
    await linkQualified(referrer.id, m.id);
    await giveCoverage(referrer.id, m.planA, dateOffsetStr(60));
    const target = await nowTarget(true);

    const preview = await changePreviewOf(m.id, target);
    const net = NOW_B - preview.proration.remainingValue;
    const discount = Math.floor(net * 0.1);
    expect(preview.proration.remainingValue).toBeGreaterThan(0);
    expect(preview.winningDiscount).toBe("invitation");
    expect(preview.invitationDiscountPercent).toBe(10);
    expect(preview.invitationDiscountAmount).toBe(discount);
    expect(preview.invitationDiscountCapped).toBe(false);
    expect(preview.partnerDiscountAmount).toBe(0);
    expect(preview.netAmount).toBe(net - discount);
    // compat: alias deprecados con el mismo valor
    expect(preview.referralDiscountPercent).toBe(10);
    expect(preview.referralDiscountAmount).toBe(discount);

    const charge = await changeNowCharge(m.id, target);
    expect(charge.pricePaid).toBe(preview.netAmount);
    expect(await creditOf(m.id)).toEqual({ percent: 10, amount: discount });
  });

  it("(12) partner 20% gana a la invitación 10%: el preview informa `partner`, sin invitación, y el cobro paga lo mismo", async () => {
    const m = await memberWithHalfUsedSub("pp-12-p@test.com");
    const referrer = await createMember(app, { email: "pp-12-r@test.com" });
    await linkQualified(referrer.id, m.id);
    await giveCoverage(referrer.id, m.planA, dateOffsetStr(60));
    const partner = await insertPartner(app, { benefitValue: 20 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: m.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });
    const target = await nowTarget(true);

    const preview = await changePreviewOf(m.id, target);
    const net = NOW_B - preview.proration.remainingValue;
    expect(preview.winningDiscount).toBe("partner");
    expect(preview.partnerDiscountPercent).toBe(20);
    expect(preview.partnerDiscountAmount).toBe(Math.floor(net * 0.2));
    expect(preview.invitationDiscountAmount).toBe(0);
    expect(preview.invitationDiscountPercent).toBe(0);
    expect(preview.referralDiscountAmount).toBe(0);
    expect(preview.netAmount).toBe(net - Math.floor(net * 0.2));

    const charge = await changeNowCharge(m.id, target);
    expect(charge.pricePaid).toBe(preview.netAmount);
    expect(await creditOf(m.id)).toBeUndefined();
  });

  it("(12b) partner 5% pierde contra la invitación 10%: el preview informa `invitation` y el partner en 0 (no promete un descuento que el cobro no aplica)", async () => {
    const m = await memberWithHalfUsedSub("pp-12b-p@test.com");
    const referrer = await createMember(app, { email: "pp-12b-r@test.com" });
    await linkQualified(referrer.id, m.id);
    await giveCoverage(referrer.id, m.planA, dateOffsetStr(60));
    const partner = await insertPartner(app, { benefitValue: 5 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: m.id,
      benefitType: "discount_percent",
      benefitValue: 5,
      benefitStatus: "pending",
    });
    const target = await nowTarget(true);

    const preview = await changePreviewOf(m.id, target);
    const net = NOW_B - preview.proration.remainingValue;
    expect(preview.winningDiscount).toBe("invitation");
    expect(preview.partnerDiscountPercent).toBe(0);
    expect(preview.partnerDiscountAmount).toBe(0);
    expect(preview.invitationDiscountAmount).toBe(Math.floor(net * 0.1));
    expect(preview.netAmount).toBe(net - Math.floor(net * 0.1));

    const charge = await changeNowCharge(m.id, target);
    expect(charge.pricePaid).toBe(preview.netAmount);
  });

  it("(13) tope en dinero AR 500: el preview informa monto recortado y `capped` sobre el neto, y el cobro (y su crédito) coinciden", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 500 },
    });
    const m = await memberWithHalfUsedSub("pp-13-p@test.com");
    const referrer = await createMember(app, { email: "pp-13-r@test.com" });
    await linkQualified(referrer.id, m.id);
    await giveCoverage(referrer.id, m.planA, dateOffsetStr(60));
    const target = await nowTarget(true);

    const preview = await changePreviewOf(m.id, target);
    const net = NOW_B - preview.proration.remainingValue;
    expect(Math.floor(net * 0.1)).toBeGreaterThan(500); // el tope recorta
    expect(preview.winningDiscount).toBe("invitation");
    expect(preview.invitationDiscountPercent).toBe(10); // nominal
    expect(preview.invitationDiscountAmount).toBe(500);
    expect(preview.invitationDiscountCapped).toBe(true);
    expect(preview.netAmount).toBe(net - 500);

    const charge = await changeNowCharge(m.id, target);
    expect(charge.pricePaid).toBe(preview.netAmount);
    expect(await creditOf(m.id)).toEqual({ percent: 10, amount: 500 });
  });

  it("(14) plan destino SIN flag: el preview no descuenta (aunque haya vínculo qualified) y coincide con el cobro", async () => {
    const m = await memberWithHalfUsedSub("pp-14-p@test.com");
    const referrer = await createMember(app, { email: "pp-14-r@test.com" });
    await linkQualified(referrer.id, m.id);
    await giveCoverage(referrer.id, m.planA, dateOffsetStr(60));
    const target = await nowTarget(false);

    const preview = await changePreviewOf(m.id, target);
    expect(preview.winningDiscount).toBe("none");
    expect(preview.invitationDiscountAmount).toBe(0);
    expect(preview.referralDiscountAmount).toBe(0);
    expect(preview.netAmount).toBe(NOW_B - preview.proration.remainingValue);

    const charge = await changeNowCharge(m.id, target);
    expect(charge.pricePaid).toBe(preview.netAmount);
    expect(await creditOf(m.id)).toBeUndefined();
  });

  it("(15) vínculo `pending` heredado: el preview lo simula (descuenta sin flipearlo, idempotente) y el cobro lo cualifica y paga lo mismo", async () => {
    const m = await memberWithHalfUsedSub("pp-15-p@test.com");
    const referrer = await createMember(app, { email: "pp-15-r@test.com" });
    await linkPending(referrer.id, m.id);
    await giveCoverage(referrer.id, m.planA, dateOffsetStr(60));
    const target = await nowTarget(true);

    const first = await changePreviewOf(m.id, target);
    const second = await changePreviewOf(m.id, target);
    const net = NOW_B - first.proration.remainingValue;
    expect(first.invitationDiscountAmount).toBe(Math.floor(net * 0.1));
    expect(second).toEqual(first);
    const [stillPending] = await app.db
      .select({ status: schema.referrals.status })
      .from(schema.referrals)
      .where(
        and(
          tenantWhere(schema.referrals, ctx.tenant),
          eq(schema.referrals.referredId, m.id),
        ),
      );
    expect(stillPending.status).toBe("pending");

    const charge = await changeNowCharge(m.id, target);
    expect(charge.pricePaid).toBe(first.netAmount);
  });

  it("(16) vínculo a materializar (invitación en ventana): el preview ya muestra el 10% sin crear la fila; el cobro la crea y paga lo mismo", async () => {
    const payer = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const planA = await createPlan(app, adminToken, {
      name: "Now A pp-16",
      priceRegular: NOW_A,
    });
    const assigned = await assignPlan(app, adminToken, payer.id, {
      planId: planA.id,
      branchId: payer.branchId,
      startDate: addDays(todayInTz(TZ_AR), -15),
    });
    expect(assigned.statusCode).toBe(201);
    const inviter = await createInviterWithCode(ctx);
    const accessExpiresOn = addDays(todayInTz(TZ_AR), 5);
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
      channel: "assisted",
      accessExpiresOn,
      accessStartsOn: addDays(accessExpiresOn, -5),
      subscriptionId: null,
    });
    const target = await nowTarget(true);

    const first = await changePreviewOf(payer.id, target);
    const second = await changePreviewOf(payer.id, target);
    const net = NOW_B - first.proration.remainingValue;
    expect(first.winningDiscount).toBe("invitation");
    expect(first.invitationDiscountAmount).toBe(Math.floor(net * 0.1));
    expect(second).toEqual(first);
    expect(await referralRowsOf(payer.id)).toHaveLength(0);

    const charge = await changeNowCharge(payer.id, target, payer.branchId);
    expect(charge.pricePaid).toBe(first.netAmount);
    expect(await referralRowsOf(payer.id)).toHaveLength(1);
  });

  it("(17) downgrade bloqueado: el preview trae los campos del árbitro en cero y `winningDiscount: none`", async () => {
    const m = await memberWithHalfUsedSub("pp-17-p@test.com");
    const cheap = await createPlan(app, adminToken, {
      name: "Now barato pp-17",
      priceRegular: 5000,
      allowsInvitationDiscount: true,
    });
    const preview = await changePreviewOf(m.id, cheap.id);
    expect(preview.allowed).toBe(false);
    expect(preview.invitationDiscountAmount).toBe(0);
    expect(preview.invitationDiscountCapped).toBe(false);
    expect(preview.winningDiscount).toBe("none");
  });
});

// ─── 194-18: el preview de la renovación usa el MISMO árbitro que el cobro ────

const RENEW_BASE = 100000;

interface RenewalPreviewBody {
  subscriptionId: number;
  base: number;
  source: string;
  basePrice: number;
  invitationDiscountPercent: number;
  invitationDiscountAmount: number;
  invitationDiscountCapped: boolean;
  winningDiscount: string;
  partnerDiscountPercent: number;
  partnerDiscountAmount: number;
  finalPrice: number;
}

async function renewalPreviewOf(
  memberId: number,
  query = "",
): Promise<{ statusCode: number; body: RenewalPreviewBody }> {
  const res = await app.inject({
    method: "GET",
    url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/renewal-preview${query}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function renewalCharge(
  memberId: number,
  extra: Record<string, unknown> = {},
): Promise<{
  statusCode: number;
  body: { id: number; pricePaid: number; startDate: string };
}> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/renew`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { paymentMethod: "cash", ...extra },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

/** Socio (físico, AR) con una sub paga activa de un plan de 100000 (con flag): se asigna ANTES de los vínculos. */
async function renewablePayer(): Promise<{
  id: number;
  branchId: number;
  planId: number;
  endDate: string;
}> {
  const member = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
  const plan = await createPlan(app, adminToken, {
    name: `Renew PP ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    priceRegular: RENEW_BASE,
    priceCreditCard: 120000,
    classesPerWeek: undefined,
    durationDays: 30,
    allowsInvitationDiscount: true,
  });
  const res = await assignPlan(app, adminToken, member.id, {
    planId: plan.id,
    branchId: member.branchId,
    startDate: todayInTz(TZ_AR),
  });
  expect(res.statusCode).toBe(201);
  return {
    id: member.id,
    branchId: member.branchId,
    planId: plan.id,
    endDate: res.body.endDate as string,
  };
}

async function qualifiedInviterOf(payerId: number): Promise<number> {
  const referrer = await createInviterWithCode(ctx);
  await app.db.execute(
    sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (${TENANT_TEMPLO}, ${referrer.id}, ${payerId}, 'qualified', 'assisted', NOW())`,
  );
  return referrer.id;
}

async function pendingPartnerLinkStatus(referredId: number): Promise<string> {
  const rows = await app.db.execute(
    sql`SELECT benefit_status FROM partner_referrals WHERE referred_id = ${referredId} AND tenant_id = ${TENANT_TEMPLO}`,
  );
  return (rows[0] as unknown as Array<{ benefit_status: string }>)[0]
    .benefit_status;
}

describe("194-18: paridad preview ↔ cobro de la renovación (renewSubscription)", () => {
  it("(18) renovación estándar con vínculo: el preview informa los MONTOS y el cobro paga finalPrice", async () => {
    const payer = await renewablePayer();
    await qualifiedInviterOf(payer.id);

    const { statusCode, body } = await renewalPreviewOf(payer.id);
    expect(statusCode).toBe(200);
    expect(body).toMatchObject({
      base: RENEW_BASE,
      source: "inherited",
      basePrice: RENEW_BASE,
      invitationDiscountPercent: 10,
      invitationDiscountAmount: 10000,
      invitationDiscountCapped: false,
      winningDiscount: "invitation",
      partnerDiscountPercent: 0,
      partnerDiscountAmount: 0,
      finalPrice: 90000,
    });

    const charge = await renewalCharge(payer.id);
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(body.finalPrice);
  });

  it("(18b) sin querystring nuevo: base y source son los de siempre (compat) y el preview no escribe nada", async () => {
    const payer = await renewablePayer();
    await qualifiedInviterOf(payer.id);
    const partner = await insertPartner(app, { benefitValue: 20 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: payer.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });

    const first = await renewalPreviewOf(payer.id);
    const second = await renewalPreviewOf(payer.id);
    expect(first.body.base).toBe(RENEW_BASE);
    expect(first.body.source).toBe("inherited");
    expect(second.body).toEqual(first.body);
    // El preview no consume el beneficio de partner ni crea subs ni créditos.
    expect(await pendingPartnerLinkStatus(payer.id)).toBe("pending");
    expect(await creditOf(payer.id)).toBeUndefined();
    const subs = await app.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx.tenant),
          eq(schema.subscriptions.userId, payer.id),
        ),
      );
    expect(subs).toHaveLength(1);
  });

  it("(19) partner 20% gana a la invitación 10%: el preview informa `partner` con su monto y el cobro paga lo mismo", async () => {
    const payer = await renewablePayer();
    await qualifiedInviterOf(payer.id);
    const partner = await insertPartner(app, { benefitValue: 20 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: payer.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });

    const { body } = await renewalPreviewOf(payer.id);
    expect(body.winningDiscount).toBe("partner");
    expect(body.partnerDiscountPercent).toBe(20);
    expect(body.partnerDiscountAmount).toBe(20000);
    expect(body.invitationDiscountAmount).toBe(0);
    expect(body.invitationDiscountPercent).toBe(0);
    expect(body.finalPrice).toBe(80000);

    const charge = await renewalCharge(payer.id);
    expect(charge.body.pricePaid).toBe(80000);
  });

  it("(19b) partner 5% pierde contra la invitación 10%: el preview informa `invitation` y el partner en 0 (no promete un descuento que el cobro no aplica)", async () => {
    const payer = await renewablePayer();
    await qualifiedInviterOf(payer.id);
    const partner = await insertPartner(app, { benefitValue: 5 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: payer.id,
      benefitType: "discount_percent",
      benefitValue: 5,
      benefitStatus: "pending",
    });

    const { body } = await renewalPreviewOf(payer.id);
    expect(body.winningDiscount).toBe("invitation");
    expect(body.partnerDiscountPercent).toBe(0);
    expect(body.partnerDiscountAmount).toBe(0);
    expect(body.finalPrice).toBe(90000);
    expect((await renewalCharge(payer.id)).body.pricePaid).toBe(90000);
  });

  it("(20) tope en dinero AR 5000: el preview informa monto recortado y `capped`, y el cobro (y su crédito) coinciden", async () => {
    await setInvitationSettings(app.db, ctx.tenant, {
      discountCapAmount: { AR: 5000 },
    });
    const payer = await renewablePayer();
    await qualifiedInviterOf(payer.id);

    const { body } = await renewalPreviewOf(payer.id);
    expect(body.invitationDiscountCapped).toBe(true);
    expect(body.invitationDiscountPercent).toBe(10);
    expect(body.invitationDiscountAmount).toBe(5000);
    expect(body.finalPrice).toBe(95000);

    const charge = await renewalCharge(payer.id);
    expect(charge.body.pricePaid).toBe(95000);
    expect(await creditOf(payer.id)).toEqual({ percent: 10, amount: 5000 });
  });

  it("(21) override (D-20): `priceOverrideAmount` en el preview = precio final sin descuentos, tolera la razón vacía, y el cobro con razón paga lo mismo", async () => {
    const payer = await renewablePayer();
    await qualifiedInviterOf(payer.id);

    const { statusCode, body } = await renewalPreviewOf(
      payer.id,
      "?priceOverrideAmount=60000",
    );
    expect(statusCode).toBe(200);
    expect(body.basePrice).toBe(60000);
    expect(body.finalPrice).toBe(60000);
    expect(body.winningDiscount).toBe("none");
    expect(body.invitationDiscountAmount).toBe(0);
    // `base` sigue siendo la base heredada: el override no la pisa.
    expect(body.base).toBe(RENEW_BASE);

    const charge = await renewalCharge(payer.id, {
      priceOverrideAmount: 60000,
      priceOverrideReason: "Convenio 194-18",
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(body.finalPrice);
  });

  it("(22) prorrateo a fin de mes: el preview con startDate + prorateToMonthEnd es el proporcional sin descuento y el cobro paga lo mismo; con el monto editado también", async () => {
    const payer = await renewablePayer();
    await qualifiedInviterOf(payer.id);

    const auto = await renewalPreviewOf(
      payer.id,
      `?prorateToMonthEnd=true&startDate=${payer.endDate}`,
    );
    expect(auto.statusCode).toBe(200);
    expect(auto.body.winningDiscount).toBe("none");
    expect(auto.body.invitationDiscountAmount).toBe(0);
    expect(auto.body.finalPrice).toBe(
      computeProratedPrice(RENEW_BASE, payer.endDate),
    );

    const edited = await renewalPreviewOf(
      payer.id,
      `?prorateToMonthEnd=true&startDate=${payer.endDate}&priceOverrideAmount=5000`,
    );
    expect(edited.body.finalPrice).toBe(5000);

    const charge = await renewalCharge(payer.id, {
      prorateToMonthEnd: true,
      startDate: payer.endDate,
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(auto.body.finalPrice);
  });

  it("(22b) prorrateo editado por encima del mes completo: el preview da 400 igual que el cobro", async () => {
    const payer = await renewablePayer();
    const preview = await renewalPreviewOf(
      payer.id,
      `?prorateToMonthEnd=true&startDate=${payer.endDate}&priceOverrideAmount=${RENEW_BASE + 1}`,
    );
    expect(preview.statusCode).toBe(400);
    const charge = await renewalCharge(payer.id, {
      prorateToMonthEnd: true,
      startDate: payer.endDate,
      priceOverrideAmount: RENEW_BASE + 1,
    });
    expect(charge.statusCode).toBe(400);
  });

  it("(23) recargo de tarjeta OFF (WR-04): sub heredada en credit_card se normaliza a regular en el preview (basePrice 100000, base 120000) y el cobro coincide; ON la conserva", async () => {
    const payer = await renewablePayer();
    await qualifiedInviterOf(payer.id);
    // Estado heredado de cuando la regla estaba ON: la sub vigente quedó en tarjeta.
    await app.db.execute(
      sql`UPDATE subscriptions SET price_type_applied = 'credit_card', price_paid = 120000
          WHERE user_id = ${payer.id} AND tenant_id = ${ctx.tenant.tenantId}`,
    );

    // Regla OFF (cleanAllTestData vació system_settings): se cobra el precio regular vigente.
    const off = await renewalPreviewOf(payer.id);
    expect(off.body.base).toBe(120000);
    expect(off.body.basePrice).toBe(RENEW_BASE);
    expect(off.body.finalPrice).toBe(90000);
    expect((await renewalCharge(payer.id)).body.pricePaid).toBe(90000);
  });

  it("(23b) recargo de tarjeta ON: el preview conserva credit_card (basePrice 120000) y el cobro coincide", async () => {
    await app.db.execute(
      sql`INSERT INTO system_settings (setting_key, setting_value)
          VALUES (${PRICING_SETTINGS_KEYS.cardSurcharge}, 'on')
          ON DUPLICATE KEY UPDATE setting_value = 'on'`,
    );
    const payer = await renewablePayer();
    await qualifiedInviterOf(payer.id);
    await app.db.execute(
      sql`UPDATE subscriptions SET price_type_applied = 'credit_card', price_paid = 120000
          WHERE user_id = ${payer.id} AND tenant_id = ${ctx.tenant.tenantId}`,
    );

    const on = await renewalPreviewOf(payer.id);
    expect(on.body.basePrice).toBe(120000);
    expect(on.body.finalPrice).toBe(108000);
    expect((await renewalCharge(payer.id)).body.pricePaid).toBe(108000);
  });

  it("(24) vínculo a materializar (invitación en ventana): el preview ya muestra el 10% sin crear la fila (idempotente); el cobro la crea y paga lo mismo", async () => {
    const inviter = await createInviterWithCode(ctx);
    const payer = await renewablePayer();
    const accessExpiresOn = addDays(todayInTz(TZ_AR), 5);
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
      channel: "assisted",
      accessExpiresOn,
      accessStartsOn: addDays(accessExpiresOn, -5),
      subscriptionId: null,
    });

    const first = await renewalPreviewOf(payer.id);
    const second = await renewalPreviewOf(payer.id);
    expect(first.body.winningDiscount).toBe("invitation");
    expect(first.body.invitationDiscountAmount).toBe(10000);
    expect(second.body).toEqual(first.body);
    expect(await referralRowsOf(payer.id)).toHaveLength(0);

    const charge = await renewalCharge(payer.id);
    expect(charge.body.pricePaid).toBe(first.body.finalPrice);
    expect(await referralRowsOf(payer.id)).toHaveLength(1);
  });

  it("(25) D-22: sub histórica con AURA 10% (90000): el preview informa base 100000 y el cobro parte de ahí", async () => {
    const payer = await renewablePayer();
    await app.db.execute(
      sql`UPDATE subscriptions SET price_paid = 90000, aura_discount_percent = 10, aura_discount = 1000
          WHERE user_id = ${payer.id} AND tenant_id = ${ctx.tenant.tenantId}`,
    );

    const { body } = await renewalPreviewOf(payer.id);
    expect(body.base).toBe(RENEW_BASE);
    expect(body.finalPrice).toBe(RENEW_BASE);
    expect((await renewalCharge(payer.id)).body.pricePaid).toBe(RENEW_BASE);
  });

  it("(25b) base negociada (caso Pomilio): el preview informa base 75000 y el descuento sobre ESA base; el cobro coincide", async () => {
    const payer = await renewablePayer();
    await app.db.execute(
      sql`UPDATE subscriptions SET price_paid = 75000
          WHERE user_id = ${payer.id} AND tenant_id = ${ctx.tenant.tenantId}`,
    );
    await qualifiedInviterOf(payer.id);

    const { body } = await renewalPreviewOf(payer.id);
    expect(body.base).toBe(75000);
    expect(body.basePrice).toBe(75000);
    expect(body.invitationDiscountAmount).toBe(7500);
    expect(body.finalPrice).toBe(67500);
    expect((await renewalCharge(payer.id)).body.pricePaid).toBe(67500);
  });

  it("(26) plan Invitación: el preview da 400 igual que renovar", async () => {
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const trial = await createTrialPlan(ctx);
    const access = await createActiveSub(ctx, {
      userId: member.id,
      planId: trial.id,
    });

    const preview = await renewalPreviewOf(
      member.id,
      `?subscriptionId=${access.id}`,
    );
    expect(preview.statusCode).toBe(400);
    expect((preview.body as unknown as { message: string }).message).toContain(
      "Los accesos de invitación no se renuevan",
    );
    const charge = await renewalCharge(member.id, {
      subscriptionId: access.id,
    });
    expect(charge.statusCode).toBe(400);
  });
});

describe("194-18: precarga de la PoS del profe (autocompletar)", () => {
  async function coachToken(): Promise<string> {
    const email = `coach-194-18-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
    await createStaffUser(app, {
      email,
      password: "pass123456",
      firstName: "Coach",
      lastName: "Renew",
      role: "coach",
      branchId: 1,
    });
    return getAuthToken(app, email, "pass123456");
  }

  async function autocompletarOf(
    token: string,
    memberId: number,
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/finance/coach-load/autocompletar/${memberId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  it("(27) la precarga es el neto que cobra la renovación (con el descuento ganador), no lo que pagó el período anterior", async () => {
    const payer = await renewablePayer();
    await qualifiedInviterOf(payer.id);

    const { statusCode, body } = await autocompletarOf(
      await coachToken(),
      payer.id,
    );
    expect(statusCode).toBe(200);
    expect(body.intent).toBe("renew");
    // El período anterior pagó 100000 (alta sin vínculo); la renovación cobra 90000.
    expect(body.amount).toBe(90000);
  });

  it("(28) sub Invitación (la renovación da 400): la precarga cae al monto heredado en vez de romper con 400", async () => {
    const member = await createMemberInPhysicalBranch(ctx, {
      status: "prueba",
    });
    const trial = await createTrialPlan(ctx);
    await createActiveSub(ctx, { userId: member.id, planId: trial.id });

    const { statusCode, body } = await autocompletarOf(
      await coachToken(),
      member.id,
    );
    expect(statusCode).toBe(200);
    expect(body.amount).toBe(0);
  });
});
