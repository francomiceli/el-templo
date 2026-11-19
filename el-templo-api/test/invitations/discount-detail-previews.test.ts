/**
 * Detalle del descuento por invitación en los previews de cobro del ADMIN
 * (`invitationDiscountDetail`): de quién depende, hasta cuándo, y POR QUÉ no se aplicó.
 *
 * Cubre los tres previews (pricing-preview del alta, change-plan-preview y
 * renewal-preview), cada `reason`, que el detalle NO cambia ningún monto, y la
 * PRIVACIDAD: el detalle trae nombre y vencimiento de otra persona, así que solo
 * puede viajar por la API de staff (`/api/admin/subscriptions/...`), nunca por la
 * del socio.
 *
 * Fechas relativas a hoy; nunca ids de `users` hardcodeados.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  todayStr,
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
} from "./_helpers";
import {
  insertPartner,
  insertPartnerLink,
} from "../referral-partners/_helpers";
import { addDays, todayInTz } from "../../src/modules/shared/date-utils";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

const TZ_AR = "America/Argentina/Buenos_Aires";
const MEMBER_PASSWORD = "pass123456";
const PLAN_PRICE = 15000;
const FLAGGED = { priceRegular: PLAN_PRICE, allowsInvitationDiscount: true };
const UNFLAGGED = { priceRegular: PLAN_PRICE, allowsInvitationDiscount: false };

interface DetailLink {
  userId: number;
  name: string;
  side: "invitador" | "invitado";
  percent: number;
  coveredUntil: string | null;
  active: boolean;
  daysLeft: number | null;
  expiresSoon: boolean;
}
interface Detail {
  applied: boolean;
  reason: string | null;
  links: DetailLink[];
}
interface PreviewBody {
  invitationDiscountPercent: number;
  invitationDiscountAmount: number;
  winningDiscount: string;
  invitationDiscountDetail: Detail | null;
  finalPrice?: number;
  netAmount?: number;
  allowed?: boolean;
}

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function linkQualified(
  referrerId: number,
  referredId: number,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (${TENANT_TEMPLO}, ${referrerId}, ${referredId}, 'qualified', 'assisted', NOW())`,
  );
}

/** Membresía hasta `endDate` (sub activa directa, sin pasar por el cobro). */
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

async function getJson(
  url: string,
  token: string = adminToken,
): Promise<{ statusCode: number; raw: string; body: PreviewBody }> {
  const res = await app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    statusCode: res.statusCode,
    raw: res.body,
    body: JSON.parse(res.body) as PreviewBody,
  };
}

function pricingUrl(memberId: number, planId: number, auraSpend = 0): string {
  const aura = auraSpend > 0 ? `&auraSpend=${auraSpend}` : "";
  return `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/pricing-preview?planId=${planId}&priceType=regular${aura}`;
}

function changeUrl(memberId: number, targetPlanId: number): string {
  return `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/change-plan-preview?targetPlanId=${targetPlanId}`;
}

function renewalUrl(memberId: number, query = ""): string {
  return `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/renewal-preview${query}`;
}

/** Socio (físico, AR) con una sub paga vigente asignada ANTES de los vínculos. */
async function renewablePayer(flag: boolean): Promise<{
  id: number;
  planId: number;
  endDate: string;
}> {
  const member = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
  const plan = await createPlan(app, adminToken, {
    name: `Detalle renew ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    priceRegular: 100000,
    classesPerWeek: undefined,
    durationDays: 30,
    allowsInvitationDiscount: flag,
  });
  const res = await assignPlan(app, adminToken, member.id, {
    planId: plan.id,
    branchId: member.branchId,
    startDate: todayInTz(TZ_AR),
  });
  expect(res.statusCode).toBe(201);
  return {
    id: member.id,
    planId: plan.id,
    endDate: res.body.endDate as string,
  };
}

/** Invitador (registrado) con membresía hasta `+offset` días y vínculo qualified con `payerId`. */
async function inviterLinkedTo(
  payerId: number,
  tag: string,
  coverageOffset: number | null,
  names: { firstName: string; lastName: string } = {
    firstName: "Ines",
    lastName: "Invitadora",
  },
): Promise<{ id: number }> {
  // Nombre único: (tenant, nombre, país) es UNIQUE en los planes.
  const plan = await createPlan(app, adminToken, {
    ...UNFLAGGED,
    name: `Cobertura invitador ${tag}`,
  });
  const inviter = await createMember(app, {
    email: `${tag}-inviter@test.com`,
    ...names,
  });
  await linkQualified(inviter.id, payerId);
  if (coverageOffset !== null) {
    await giveCoverage(
      inviter.id,
      plan.id,
      addDays(todayStr(), coverageOffset),
    );
  }
  return { id: inviter.id };
}

// ─── pricing-preview (alta / asignación de plan) ─────────────────────────────

describe("pricing-preview: invitationDiscountDetail", () => {
  it("aplicado: explica de quién depende y hasta cuándo, sin cambiar los montos", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED);
    const payer = await createMember(app, { email: "dd-pp-a-p@test.com" });
    const inviter = await inviterLinkedTo(payer.id, "dd-pp-a", 5);

    const { statusCode, body } = await getJson(pricingUrl(payer.id, plan.id));
    expect(statusCode).toBe(200);
    // Los montos son los de siempre (el detalle solo explica).
    expect(body.invitationDiscountPercent).toBe(10);
    expect(body.invitationDiscountAmount).toBe(1500);
    expect(body.finalPrice).toBe(13500);
    expect(body.winningDiscount).toBe("invitation");

    expect(body.invitationDiscountDetail).toMatchObject({
      applied: true,
      reason: null,
    });
    expect(body.invitationDiscountDetail?.links).toEqual([
      {
        userId: inviter.id,
        name: "Ines Invitadora",
        side: "invitador",
        percent: 10,
        coveredUntil: addDays(todayStr(), 5),
        active: true,
        daysLeft: 5,
        expiresSoon: true,
      },
    ]);
  });

  it("sin ningún vínculo: invitationDiscountDetail es null", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED);
    const payer = await createMember(app, { email: "dd-pp-null-p@test.com" });

    const { statusCode, body } = await getJson(pricingUrl(payer.id, plan.id));
    expect(statusCode).toBe(200);
    expect(body.invitationDiscountDetail).toBeNull();
  });

  it("counterparty_not_covered: hay vínculo pero la contraparte no tiene plan vigente", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED);
    const payer = await createMember(app, { email: "dd-pp-nc-p@test.com" });
    const inviter = await inviterLinkedTo(payer.id, "dd-pp-nc", -4);

    const { body } = await getJson(pricingUrl(payer.id, plan.id));
    expect(body.invitationDiscountPercent).toBe(0);
    expect(body.finalPrice).toBe(PLAN_PRICE);
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: false,
      reason: "counterparty_not_covered",
    });
    expect(body.invitationDiscountDetail?.links[0]).toMatchObject({
      userId: inviter.id,
      active: false,
      coveredUntil: addDays(todayStr(), -4),
      daysLeft: null,
      percent: 0,
    });
  });

  it("counterparty_not_covered: contraparte que nunca tuvo membresía -> coveredUntil null", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED);
    const payer = await createMember(app, { email: "dd-pp-nn-p@test.com" });
    await inviterLinkedTo(payer.id, "dd-pp-nn", null);

    const { body } = await getJson(pricingUrl(payer.id, plan.id));
    expect(body.invitationDiscountDetail?.reason).toBe(
      "counterparty_not_covered",
    );
    expect(body.invitationDiscountDetail?.links[0].coveredUntil).toBeNull();
  });

  it("plan_not_eligible: el plan no admite descuento por invitación, y los vínculos viajan igual", async () => {
    const plan = await createPlan(app, adminToken, UNFLAGGED);
    const payer = await createMember(app, { email: "dd-pp-ne-p@test.com" });
    const inviter = await inviterLinkedTo(payer.id, "dd-pp-ne", 20);

    const { body } = await getJson(pricingUrl(payer.id, plan.id));
    expect(body.invitationDiscountPercent).toBe(0);
    expect(body.finalPrice).toBe(PLAN_PRICE);
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: false,
      reason: "plan_not_eligible",
    });
    expect(body.invitationDiscountDetail?.links[0]).toMatchObject({
      userId: inviter.id,
      active: true,
    });
  });

  it("other_discount_won: AURA 30% le gana a la invitación 10%", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED);
    const payer = await createMember(app, { email: "dd-pp-ow-p@test.com" });
    await inviterLinkedTo(payer.id, "dd-pp-ow", 30);
    await seedAuraBalance(app, payer.id, 5000);

    const { body } = await getJson(pricingUrl(payer.id, plan.id, 5000));
    expect(body.winningDiscount).toBe("aura");
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: false,
      reason: "other_discount_won",
    });
  });

  it("invitación vigente todavía sin vínculo: el invitador simulado figura como contraparte y el preview no crea la fila", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED);
    const inviter = await createInviterWithCode(ctx);
    const payer = await createMemberInPhysicalBranch(ctx, { status: "prueba" });
    await createInvitationRow(ctx, {
      inviterId: inviter.id,
      invitedUserId: payer.id,
      branchId: payer.branchId,
      channel: "assisted",
    });

    const { statusCode, body } = await getJson(pricingUrl(payer.id, plan.id));
    expect(statusCode).toBe(200);
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: true,
      reason: null,
    });
    expect(body.invitationDiscountDetail?.links).toHaveLength(1);
    expect(body.invitationDiscountDetail?.links[0]).toMatchObject({
      userId: inviter.id,
      side: "invitador",
      active: true,
    });
    const rows = await app.db.execute(
      sql`SELECT id FROM referrals WHERE referred_id = ${payer.id} AND tenant_id = ${TENANT_TEMPLO}`,
    );
    expect((rows[0] as unknown as unknown[]).length).toBe(0);
  });

  it("el cobro real (assign) no lleva el detalle", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED);
    const payer = await createMember(app, { email: "dd-pp-ch-p@test.com" });
    await inviterLinkedTo(payer.id, "dd-pp-ch", 20);

    const charge = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    expect(charge.statusCode).toBe(201);
    expect(charge.body.pricePaid).toBe(13500);
    expect(charge.body.invitationDiscountDetail).toBeUndefined();
  });
});

// ─── change-plan-preview ─────────────────────────────────────────────────────

describe("change-plan-preview: invitationDiscountDetail", () => {
  async function memberWithSub(email: string): Promise<{ id: number }> {
    const planA = await createPlan(app, adminToken, {
      name: `Detalle A ${email}`,
      priceRegular: 10000,
    });
    const member = await createMember(app, { email });
    const res = await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: addDays(todayInTz(TZ_AR), -10),
    });
    expect(res.statusCode).toBe(201);
    return { id: member.id };
  }

  async function target(flag: boolean): Promise<number> {
    const plan = await createPlan(app, adminToken, {
      name: `Detalle B ${flag ? "flag" : "sin-flag"} ${Date.now()}`,
      priceRegular: 20000,
      allowsInvitationDiscount: flag,
    });
    return plan.id;
  }

  it("aplicado: trae el detalle del vínculo activo", async () => {
    const m = await memberWithSub("dd-cp-a-p@test.com");
    const inviter = await inviterLinkedTo(m.id, "dd-cp-a", 3);
    const targetId = await target(true);

    const { statusCode, body } = await getJson(changeUrl(m.id, targetId));
    expect(statusCode).toBe(200);
    expect(body.allowed).toBe(true);
    expect(body.winningDiscount).toBe("invitation");
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: true,
      reason: null,
    });
    expect(body.invitationDiscountDetail?.links[0]).toMatchObject({
      userId: inviter.id,
      active: true,
      daysLeft: 3,
      expiresSoon: true,
    });
  });

  it("plan destino sin flag: plan_not_eligible", async () => {
    const m = await memberWithSub("dd-cp-ne-p@test.com");
    await inviterLinkedTo(m.id, "dd-cp-ne", 30);
    const targetId = await target(false);

    const { body } = await getJson(changeUrl(m.id, targetId));
    expect(body.invitationDiscountPercent).toBe(0);
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: false,
      reason: "plan_not_eligible",
    });
  });

  it("contraparte sin plan vigente: counterparty_not_covered", async () => {
    const m = await memberWithSub("dd-cp-nc-p@test.com");
    await inviterLinkedTo(m.id, "dd-cp-nc", -1);
    const targetId = await target(true);

    const { body } = await getJson(changeUrl(m.id, targetId));
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: false,
      reason: "counterparty_not_covered",
    });
  });

  it("partner mayor: other_discount_won", async () => {
    const m = await memberWithSub("dd-cp-ow-p@test.com");
    await inviterLinkedTo(m.id, "dd-cp-ow", 30);
    const partner = await insertPartner(app, { benefitValue: 20 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: m.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });
    const targetId = await target(true);

    const { body } = await getJson(changeUrl(m.id, targetId));
    expect(body.winningDiscount).toBe("partner");
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: false,
      reason: "other_discount_won",
    });
  });

  it("downgrade bloqueado: sin detalle (null)", async () => {
    const m = await memberWithSub("dd-cp-dg-p@test.com");
    await inviterLinkedTo(m.id, "dd-cp-dg", 30);
    const cheap = await createPlan(app, adminToken, {
      name: `Detalle barato ${Date.now()}`,
      priceRegular: 5000,
      allowsInvitationDiscount: true,
    });

    const { body } = await getJson(changeUrl(m.id, cheap.id));
    expect(body.allowed).toBe(false);
    expect(body.invitationDiscountDetail).toBeNull();
  });

  it("sin ningún vínculo: null", async () => {
    const m = await memberWithSub("dd-cp-null-p@test.com");
    const targetId = await target(true);

    const { body } = await getJson(changeUrl(m.id, targetId));
    expect(body.invitationDiscountDetail).toBeNull();
  });
});

// ─── renewal-preview ─────────────────────────────────────────────────────────

describe("renewal-preview: invitationDiscountDetail", () => {
  it("aplicado: trae el detalle y los montos no cambian", async () => {
    const payer = await renewablePayer(true);
    const inviter = await inviterLinkedTo(payer.id, "dd-rn-a", 6);

    const { statusCode, body } = await getJson(renewalUrl(payer.id));
    expect(statusCode).toBe(200);
    expect(body.invitationDiscountAmount).toBe(10000);
    expect(body.finalPrice).toBe(90000);
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: true,
      reason: null,
    });
    expect(body.invitationDiscountDetail?.links[0]).toMatchObject({
      userId: inviter.id,
      name: "Ines Invitadora",
      daysLeft: 6,
      expiresSoon: true,
      coveredUntil: addDays(todayStr(), 6),
    });
  });

  it("vence hoy: daysLeft 0 y expiresSoon (el caso que disparó el pedido)", async () => {
    const payer = await renewablePayer(true);
    await inviterLinkedTo(payer.id, "dd-rn-h", 0);

    const { body } = await getJson(renewalUrl(payer.id));
    expect(body.invitationDiscountDetail?.applied).toBe(true);
    expect(body.invitationDiscountDetail?.links[0]).toMatchObject({
      daysLeft: 0,
      expiresSoon: true,
    });
  });

  it("vence en 8 días: no avisa", async () => {
    const payer = await renewablePayer(true);
    await inviterLinkedTo(payer.id, "dd-rn-8", 8);

    const { body } = await getJson(renewalUrl(payer.id));
    expect(body.invitationDiscountDetail?.links[0]).toMatchObject({
      daysLeft: 8,
      expiresSoon: false,
    });
  });

  it("counterparty_not_covered", async () => {
    const payer = await renewablePayer(true);
    await inviterLinkedTo(payer.id, "dd-rn-nc", -2);

    const { body } = await getJson(renewalUrl(payer.id));
    expect(body.invitationDiscountPercent).toBe(0);
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: false,
      reason: "counterparty_not_covered",
    });
  });

  it("plan_not_eligible: el plan de la renovación no admite el descuento", async () => {
    const payer = await renewablePayer(false);
    await inviterLinkedTo(payer.id, "dd-rn-ne", 30);

    const { body } = await getJson(renewalUrl(payer.id));
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: false,
      reason: "plan_not_eligible",
    });
  });

  it("prorated: el cobro proporcional de fin de mes no lleva descuento", async () => {
    const payer = await renewablePayer(true);
    await inviterLinkedTo(payer.id, "dd-rn-pr", 30);

    const { statusCode, body } = await getJson(
      renewalUrl(
        payer.id,
        `?prorateToMonthEnd=true&startDate=${payer.endDate}`,
      ),
    );
    expect(statusCode).toBe(200);
    expect(body.invitationDiscountAmount).toBe(0);
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: false,
      reason: "prorated",
    });
    expect(body.invitationDiscountDetail?.links).toHaveLength(1);
  });

  it("price_override: con precio personalizado no se aplica", async () => {
    const payer = await renewablePayer(true);
    await inviterLinkedTo(payer.id, "dd-rn-po", 30);

    const { body } = await getJson(
      renewalUrl(payer.id, "?priceOverrideAmount=60000"),
    );
    expect(body.finalPrice).toBe(60000);
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: false,
      reason: "price_override",
    });
  });

  it("other_discount_won: partner 20% gana a la invitación 10%", async () => {
    const payer = await renewablePayer(true);
    await inviterLinkedTo(payer.id, "dd-rn-ow", 30);
    const partner = await insertPartner(app, { benefitValue: 20 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: payer.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });

    const { body } = await getJson(renewalUrl(payer.id));
    expect(body.winningDiscount).toBe("partner");
    expect(body.invitationDiscountDetail).toMatchObject({
      applied: false,
      reason: "other_discount_won",
    });
  });

  it("sin ningún vínculo: null", async () => {
    const payer = await renewablePayer(true);

    const { body } = await getJson(renewalUrl(payer.id));
    expect(body.invitationDiscountDetail).toBeNull();
  });
});

// ─── Privacidad ──────────────────────────────────────────────────────────────

describe("privacidad: el detalle (nombre y vencimiento de otra persona) solo viaja por la API de staff", () => {
  it("un socio NO puede leer los previews de cobro (403) ni ve el detalle", async () => {
    const plan = await createPlan(app, adminToken, FLAGGED);
    const target = await createPlan(app, adminToken, {
      name: `Detalle privacidad ${Date.now()}`,
      priceRegular: 20000,
      allowsInvitationDiscount: true,
    });
    const payer = await createMember(app, { email: "dd-pv-p@test.com" });
    await inviterLinkedTo(payer.id, "dd-pv", 20, {
      firstName: "Nombre",
      lastName: "Secreto",
    });
    const memberToken = await getAuthToken(
      app,
      "dd-pv-p@test.com",
      MEMBER_PASSWORD,
    );

    const urls = [
      pricingUrl(payer.id, plan.id),
      changeUrl(payer.id, target.id),
      renewalUrl(payer.id),
    ];
    for (const url of urls) {
      const res = await getJson(url, memberToken);
      expect(res.statusCode).toBe(403);
      expect(res.raw).not.toContain("invitationDiscountDetail");
      expect(res.raw).not.toContain("Secreto");
    }
  });

  it("la vista del socio de sus referidos (/api/members/referrals) no trae el detalle ni los vencimientos", async () => {
    const plan = await createPlan(app, adminToken, UNFLAGGED);
    const payer = await createMember(app, { email: "dd-pv2-p@test.com" });
    const inviter = await createMember(app, {
      email: "dd-pv2-i@test.com",
      firstName: "Ines",
      lastName: "Visible",
    });
    await linkQualified(inviter.id, payer.id);
    await giveCoverage(inviter.id, plan.id, addDays(todayStr(), 3));
    const memberToken = await getAuthToken(
      app,
      "dd-pv2-p@test.com",
      MEMBER_PASSWORD,
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/members/referrals",
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(res.statusCode).toBe(200);
    for (const forbidden of [
      "invitationDiscountDetail",
      "expiresSoon",
      "daysLeft",
      "coveredUntil",
    ]) {
      expect(res.body).not.toContain(forbidden);
    }
  });
});
