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
import { and, eq, sql } from "drizzle-orm";
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
  seedAuraBalance,
  SUBSCRIPTIONS_URL,
} from "../subscriptions/_helpers";
import {
  createInvitationRow,
  createInviterWithCode,
  createMemberInPhysicalBranch,
  fixtureCtx,
  resetInvitationSettings,
  type InvitationsFixtureCtx,
} from "../invitations/_helpers";
import * as schema from "../../src/db/schema";
import { setInvitationSettings } from "../../src/modules/referrals/invitation-settings";
import { todayInTz } from "../../src/modules/shared/date-utils";
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
