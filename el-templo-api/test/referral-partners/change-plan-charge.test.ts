/**
 * Fase 179 Plan 07 (D-09/D-10/D-17) — el descuento de partner one-shot y
 * "gana el mayor" (179-06, hoy sólo wireado en `assignPlan`) replicado en las
 * otras 3 charge-paths: `changePlanNow`, `changePlanAfterCurrent` y
 * `renewSubscription`.
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. Las 4 charge-paths aplican el descuento de partner con la MISMA regla
 *     (D-09/D-10/D-20): candidato resuelto por lectura pura, "gana el mayor"
 *     contra AURA con empate a favor del partner, columnas
 *     `partner_discount_percent/amount` materializadas, vínculo consumido
 *     con `applied_reason='aplicado'` (ganó) o `'perdio_vs_aura'` (perdió
 *     pero el cargo cobró igual).
 *  2. `changePlanNow` y `renewSubscription` NO tienen bloque de descuento
 *     AURA propio (a diferencia de `assignPlan`/`changePlanAfterCurrent`) —
 *     sin competidor, el candidato se aplica directo (ver 179-07-PLAN.md
 *     Task 1 y el comentario en `service.ts` de cada método).
 *  3. El consumo del beneficio es GLOBAL al socio (`benefit_status` en
 *     `partner_referrals`), no por camino de cobro (T-179-30): un beneficio
 *     ya consumido por un primer cargo no vuelve a descontar en un segundo
 *     cargo por OTRO camino.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import {
  createPlan,
  createMember,
  assignPlan,
  todayStr,
  seedAuraBalance,
  SUBSCRIPTIONS_URL,
} from "../subscriptions/_helpers";
import { insertPartner, insertPartnerLink } from "./_helpers";

let app: FastifyInstance;
let adminToken: string;
const AR_BRANCH_ID = 1; // sede seed de test/setup.ts, tenant 1, country='AR'.
let seq = 0;

beforeAll(async () => {
  app = await createTestApp();
  adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await cleanAllTestData(app);
  seq += 1;
});

/** Email único por test — evita colisiones del UNIQUE de users.email. */
function email(prefix: string): string {
  return `cpc-${prefix}-${seq}-${Date.now()}@test.com`;
}

/** POST /change-plan con startMode configurable (mismo helper que
 * test/referral-partners/qualification-commission.test.ts). */
function changePlan(
  userId: number,
  planId: number,
  startMode: "now" | "after_current",
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return app
    .inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId,
        branchId: AR_BRANCH_ID,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        startMode,
        ...overrides,
      },
    })
    .then((res) => ({
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as Record<string, unknown>,
    }));
}

/** POST /renew. */
function renew(
  userId: number,
  overrides: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return app
    .inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", ...overrides },
    })
    .then((res) => ({
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as Record<string, unknown>,
    }));
}

async function readAuraBalance(userId: number): Promise<number> {
  const rows = await app.db.execute(
    sql`SELECT balance FROM aura_balances WHERE user_id = ${userId}`,
  );
  const list = rows[0] as unknown as Array<{ balance: number }>;
  return list[0]?.balance ?? 0;
}

interface FullLinkRow {
  benefit_status: string;
  applied_percent: number | null;
  applied_amount: number | null;
  applied_subscription_id: number | null;
  applied_reason: string | null;
}

async function fullLinkRow(referredId: number): Promise<FullLinkRow | null> {
  const rows = await app.db.execute(
    sql`SELECT benefit_status, applied_percent, applied_amount,
               applied_subscription_id, applied_reason
        FROM partner_referrals WHERE referred_id = ${referredId}`,
  );
  const list = rows[0] as unknown as FullLinkRow[];
  return list.length > 0 ? list[0] : null;
}

async function subscriptionPartnerDiscount(subscriptionId: number): Promise<{
  partner_discount_percent: number | null;
  partner_discount_amount: number | null;
  price_paid: number;
}> {
  const rows = await app.db.execute(
    sql`SELECT partner_discount_percent, partner_discount_amount, price_paid
        FROM subscriptions WHERE id = ${subscriptionId}`,
  );
  const list = rows[0] as unknown as Array<{
    partner_discount_percent: number | null;
    partner_discount_amount: number | null;
    price_paid: number;
  }>;
  return list[0];
}

describe("changePlanNow — descuento de partner (sin bloque AURA propio)", () => {
  it("(1) vínculo pending 25% se aplica directo sobre el neto post-prorrateo y consume el vínculo", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: `Now-partner B ${seq}`,
      priceRegular: 20000,
    });
    const member = await createMember(app, {
      email: email("now-apply"),
      branchId: AR_BRANCH_ID,
    });
    // Baseline SIN vínculo — evita que el descuento se consuma en el assign
    // de partida (mismo patrón que qualification-commission.test.ts).
    await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    const partner = await insertPartner(app, { benefitValue: 25 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 25,
      benefitStatus: "pending",
    });

    // Plan classesPerWeek-based recién asignado hoy → ratio de prorrateo=1
    // (classesRemaining===classesBudget), así que remainingValue = pricePaid
    // completo de planA. netAmount antes del descuento de partner = 20000 -
    // 8000 = 12000 (mismo cálculo que usa el resto del módulo).
    const netAmountBeforePartner = 20000 - 8000;
    const res = await changePlan(member.id, planB.id, "now");
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    const expectedDiscount = Math.floor(netAmountBeforePartner * 0.25);
    expect(res.body.pricePaid).toBe(netAmountBeforePartner - expectedDiscount);

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBe(25);
    expect(subRow.partner_discount_amount).toBe(expectedDiscount);

    const link = await fullLinkRow(member.id);
    expect(link?.benefit_status).toBe("consumed");
    expect(link?.applied_percent).toBe(25);
    expect(link?.applied_amount).toBe(expectedDiscount);
    expect(link?.applied_subscription_id).toBe(subscriptionId);
    expect(link?.applied_reason).toBe("aplicado");
  });

  it("(2) beneficio ya consumido por el assign de partida → changePlanNow NO vuelve a descontar", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: `Now-consumed B ${seq}`,
      priceRegular: 20000,
    });
    const member = await createMember(app, {
      email: email("now-consumed"),
      branchId: AR_BRANCH_ID,
    });
    const partner = await insertPartner(app, { benefitValue: 25 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 25,
      benefitStatus: "pending",
    });
    // El vínculo se consume ACÁ, en el assign de partida (mismo servicio,
    // ya cubierto por 179-06) — el punto de este test es que el SEGUNDO
    // camino (changePlanNow) ya no encuentra candidato.
    const first = await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    expect(first.statusCode).toBe(201);
    expect((await fullLinkRow(member.id))?.benefit_status).toBe("consumed");

    const res = await changePlan(member.id, planB.id, "now");
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBeNull();
    expect(subRow.partner_discount_amount).toBeNull();

    // El vínculo sigue apuntando al PRIMER cargo — el segundo no lo pisa.
    const link = await fullLinkRow(member.id);
    expect(link?.applied_subscription_id).toBe(first.body.id as number);
  });
});

/**
 * GET /change-plan-preview — paridad con changePlanNow (deviation Rule 2 del
 * plan 179-14). Existe test/referral-partners/preview-parity.test.ts para
 * getPricingPreview (usado por assignPlan) por el mismo motivo: este preview
 * es el que consume el bloque "Cambio ahora, reinicia vencimiento" de
 * AssignPlanDialog.vue — sin partnerDiscount* ahí, el admin veía un neto sin
 * descuento que el cobro real (changePlanNow) sí aplicaba.
 */
function changePlanPreview(
  userId: number,
  targetPlanId: number,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return app
    .inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/change-plan-preview?targetPlanId=${targetPlanId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    })
    .then((res) => ({
      statusCode: res.statusCode,
      body: JSON.parse(res.body) as Record<string, unknown>,
    }));
}

describe("GET change-plan-preview — descuento de partner (paridad con changePlanNow)", () => {
  it("(1) vínculo pending 25%: el preview muestra el mismo neto que el cobro real, y consultarlo no consume el vínculo", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: `Preview-partner B ${seq}`,
      priceRegular: 20000,
    });
    const member = await createMember(app, {
      email: email("preview-apply"),
      branchId: AR_BRANCH_ID,
    });
    await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    const partner = await insertPartner(app, { benefitValue: 25 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 25,
      benefitStatus: "pending",
    });

    // Solo lectura: dos consultas seguidas al preview no consumen el vínculo.
    const preview1 = await changePlanPreview(member.id, planB.id);
    const preview2 = await changePlanPreview(member.id, planB.id);
    expect(preview1.statusCode).toBe(200);
    expect(preview1.body.partnerDiscountPercent).toBe(25);
    expect(preview1.body.netAmount).toBe(preview2.body.netAmount);
    expect((await fullLinkRow(member.id))?.benefit_status).toBe("pending");

    // Paridad EXACTA con el cobro real.
    const res = await changePlan(member.id, planB.id, "now");
    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(preview1.body.netAmount);
  });
});

describe("changePlanAfterCurrent — descuento de partner (con bloque AURA, gana el mayor)", () => {
  it("(1) vínculo pending 20% sin auraSpend → se aplica directo, consume el vínculo", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: `Sched-partner B ${seq}`,
      priceRegular: 15000,
    });
    const member = await createMember(app, {
      email: email("sched-apply"),
      branchId: AR_BRANCH_ID,
    });
    await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    const partner = await insertPartner(app, { benefitValue: 20 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });

    const res = await changePlan(member.id, planB.id, "after_current");
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe("scheduled");
    const subscriptionId = res.body.id as number;
    expect(res.body.pricePaid).toBe(15000 - Math.floor(15000 * 0.2));

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBe(20);
    expect(subRow.partner_discount_amount).toBe(3000);

    const link = await fullLinkRow(member.id);
    expect(link?.benefit_status).toBe("consumed");
    expect(link?.applied_reason).toBe("aplicado");
  });

  it("(2) gana el partner (D-10/D-20): 30% partner vs tier AURA 10% → cobra 30%, sin gastar AURA", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: `Sched-wins B ${seq}`,
      priceRegular: 15000,
    });
    const member = await createMember(app, {
      email: email("sched-wins"),
      branchId: AR_BRANCH_ID,
    });
    await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    const partner = await insertPartner(app, { benefitValue: 30 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 30,
      benefitStatus: "pending",
    });
    await seedAuraBalance(app, member.id, 5000);
    const balanceBefore = await readAuraBalance(member.id);

    const res = await changePlan(member.id, planB.id, "after_current", {
      auraSpend: 1000, // tier 10%
    });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    expect(res.body.pricePaid).toBe(15000 - Math.floor(15000 * 0.3));
    expect(res.body.auraDiscount).toBeNull();

    const balanceAfter = await readAuraBalance(member.id);
    expect(balanceAfter).toBe(balanceBefore); // ni un punto gastado

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBe(30);

    const link = await fullLinkRow(member.id);
    expect(link?.applied_reason).toBe("aplicado");
  });

  it("(3) gana AURA: 10% partner vs tier AURA 30% → cobra 30% AURA, vínculo consumido perdio_vs_aura", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: `Sched-loses B ${seq}`,
      priceRegular: 15000,
    });
    const member = await createMember(app, {
      email: email("sched-loses"),
      branchId: AR_BRANCH_ID,
    });
    await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    const partner = await insertPartner(app, { benefitValue: 10 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 10,
      benefitStatus: "pending",
    });
    await seedAuraBalance(app, member.id, 5000);

    const res = await changePlan(member.id, planB.id, "after_current", {
      auraSpend: 5000, // tier 30%
    });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    expect(res.body.pricePaid).toBe(15000 - Math.floor(15000 * 0.3));
    expect(res.body.auraDiscount).toBe(5000);

    const balanceAfter = await readAuraBalance(member.id);
    expect(balanceAfter).toBe(0); // los 5000 puntos SÍ se gastaron

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBeNull();

    const link = await fullLinkRow(member.id);
    expect(link?.benefit_status).toBe("consumed");
    expect(link?.applied_reason).toBe("perdio_vs_aura");
    expect(link?.applied_percent).toBe(0);
    expect(link?.applied_amount).toBe(0);
    expect(link?.applied_subscription_id).toBe(subscriptionId);
  });

  it("(4) beneficio ya consumido → changePlanAfterCurrent NO vuelve a descontar", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: `Sched-consumed B ${seq}`,
      priceRegular: 15000,
    });
    const member = await createMember(app, {
      email: email("sched-consumed"),
      branchId: AR_BRANCH_ID,
    });
    const partner = await insertPartner(app, { benefitValue: 20 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });
    const first = await assignPlan(app, adminToken, member.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    expect(first.statusCode).toBe(201);
    expect((await fullLinkRow(member.id))?.benefit_status).toBe("consumed");

    const res = await changePlan(member.id, planB.id, "after_current");
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBeNull();
    expect(subRow.partner_discount_amount).toBeNull();
  });
});

describe("renewSubscription — descuento de partner (sin bloque AURA propio)", () => {
  it("(1) vínculo pending 15% se aplica directo sobre el precio heredado y consume el vínculo", async () => {
    const plan = await createPlan(app, adminToken, {
      name: `Renew-partner ${seq}`,
      priceRegular: 10000,
    });
    const member = await createMember(app, {
      email: email("renew-apply"),
      branchId: AR_BRANCH_ID,
    });
    await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    const partner = await insertPartner(app, { benefitValue: 15 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 15,
      benefitStatus: "pending",
    });

    // Precio de renovación heredado = pricePaid del período anterior (sin
    // descuento previo) = plan.priceRegular = 10000.
    const res = await renew(member.id);
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    const expectedDiscount = Math.floor(10000 * 0.15);
    expect(res.body.pricePaid).toBe(10000 - expectedDiscount);

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBe(15);
    expect(subRow.partner_discount_amount).toBe(expectedDiscount);

    const link = await fullLinkRow(member.id);
    expect(link?.benefit_status).toBe("consumed");
    expect(link?.applied_percent).toBe(15);
    expect(link?.applied_amount).toBe(expectedDiscount);
    expect(link?.applied_subscription_id).toBe(subscriptionId);
    expect(link?.applied_reason).toBe("aplicado");
  });

  it("(2) beneficio ya consumido por el assign de partida → renewSubscription NO vuelve a descontar", async () => {
    const plan = await createPlan(app, adminToken, {
      name: `Renew-consumed ${seq}`,
      priceRegular: 10000,
    });
    const member = await createMember(app, {
      email: email("renew-consumed"),
      branchId: AR_BRANCH_ID,
    });
    const partner = await insertPartner(app, { benefitValue: 15 });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 15,
      benefitStatus: "pending",
    });
    const first = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    expect(first.statusCode).toBe(201);
    expect((await fullLinkRow(member.id))?.benefit_status).toBe("consumed");

    const res = await renew(member.id);
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBeNull();
    expect(subRow.partner_discount_amount).toBeNull();

    const link = await fullLinkRow(member.id);
    expect(link?.applied_subscription_id).toBe(first.body.id as number);
  });
});
