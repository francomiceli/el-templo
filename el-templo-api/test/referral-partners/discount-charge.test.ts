/**
 * Fase 179 Plan 06 (D-09/D-10/D-17/D-20) — descuento de partner one-shot en
 * `assignPlan`, resolviendo "gana el mayor" contra AURA ANTES de gastar
 * puntos.
 *
 * Lo que estos tests defienden, en orden de importancia:
 *  1. El descuento reduce el precio del cargo que cualifica el vínculo y se
 *     materializa en `subscriptions.partner_discount_percent/amount`, con el
 *     vínculo marcado `consumed`/`applied_reason='aplicado'` (D-09).
 *  2. One-shot: un segundo cobro del mismo socio NUNCA repite el descuento
 *     (D-09) — el vínculo ya está `consumed`.
 *  3. Gana el mayor (D-10): con el partner ganando, `auraService.spend()`
 *     NUNCA se llama — el saldo AURA del socio queda BIT A BIT intacto. El
 *     empate lo gana el partner (D-20).
 *  4. Cuando gana AURA, el beneficio de partner se consume IGUAL
 *     (`applied_percent=0`, `applied_reason='perdio_vs_aura'`) — la primera
 *     cuota ya pasó (D-09/D-20).
 *  5. Las exclusiones del descuento de referidos se heredan (D-17): paquete
 *     y especial NO reciben descuento de partner (pero SÍ generan comisión,
 *     contraste explícito con 179-05).
 *  6. El alta prorrateada y un beneficio vencido nunca aplican el descuento,
 *     y en ninguno de los dos casos se consume el vínculo.
 *  7. Un vínculo `free_pass` nunca produce un descuento porcentual.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  seedAuraBalance,
} from "../helpers";
import {
  createPlan,
  createMember,
  assignPlan,
} from "../subscriptions/_helpers";
import {
  insertPartner,
  insertPartnerLink,
  partnerCommissionRows,
} from "./_helpers";

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
  return `dc-${prefix}-${seq}-${Date.now()}@test.com`;
}

/**
 * Fila cruda del vínculo, con los campos `applied_*`/`benefit_*` que
 * `partnerLinkRow` (`_helpers.ts`) no expone — los tests afirman sobre el
 * SQL, no sobre el DTO, mismo estilo que el resto del módulo.
 */
interface FullLinkRow {
  status: string;
  benefit_status: string;
  benefit_consumed_at: Date | null;
  applied_percent: number | null;
  applied_amount: number | null;
  applied_subscription_id: number | null;
  applied_reason: string | null;
}

async function fullLinkRow(referredId: number): Promise<FullLinkRow | null> {
  const rows = await app.db.execute(
    sql`SELECT status, benefit_status, benefit_consumed_at, applied_percent,
               applied_amount, applied_subscription_id, applied_reason
        FROM partner_referrals WHERE referred_id = ${referredId}`,
  );
  const list = rows[0] as unknown as FullLinkRow[];
  return list.length > 0 ? list[0] : null;
}

/** Descuento de partner materializado en la fila cruda de `subscriptions`. */
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

async function readAuraBalance(userId: number): Promise<number> {
  const rows = await app.db.execute(
    sql`SELECT balance FROM aura_balances WHERE user_id = ${userId}`,
  );
  const list = rows[0] as unknown as Array<{ balance: number }>;
  return list[0]?.balance ?? 0;
}

/**
 * INSERT crudo de un plan con `planCategory` fuera del enum de
 * `createPlanSchema` (paquete/especial) — mismo patrón que
 * `createPlanWithCategory` de `test/referral-partners/qualification-commission.test.ts`.
 */
async function createPlanWithCategory(
  category: "paquete" | "especial",
  priceRegular: number,
): Promise<number> {
  const res = await app.db.insert(schema.subscriptionPlans).values({
    name: `Plan D-17 ${category} ${seq}`,
    planTier: "other",
    bookingMode: "flexible",
    planCategory: category,
    priceRegular,
    priceZero: priceRegular,
    durationDays: category === "paquete" ? 7 : 30,
    classesPerWeek: category === "paquete" ? 3 : null,
    monthlyClassBudget: category === "especial" ? 2 : null,
    requiresPresencial: false,
    country: "AR",
    currency: "ARS",
    isActive: true,
    isArchived: false,
  });
  return Number(res[0].insertId);
}

describe("Descuento de partner one-shot en assignPlan (D-09/D-10/D-17/D-20)", () => {
  it("(1) vínculo pending 20% → cobra base - 20%, materializa partner_discount_* y consume el vínculo (aplicado)", async () => {
    const partner = await insertPartner(app, { benefitValue: 20 });
    const member = await createMember(app, {
      email: email("apply-a"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    expect(res.body.pricePaid).toBe(15000 - Math.floor(15000 * 0.2));

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBe(20);
    expect(subRow.partner_discount_amount).toBe(3000);
    expect(subRow.price_paid).toBe(12000);

    const link = await fullLinkRow(member.id);
    expect(link?.benefit_status).toBe("consumed");
    expect(link?.benefit_consumed_at).not.toBeNull();
    expect(link?.applied_percent).toBe(20);
    expect(link?.applied_amount).toBe(3000);
    expect(link?.applied_subscription_id).toBe(subscriptionId);
    expect(link?.applied_reason).toBe("aplicado");
  });

  it("(2) one-shot (D-09): un segundo cobro del mismo socio NO repite el descuento ni vuelve a tocar el vínculo", async () => {
    const partner = await insertPartner(app, { benefitValue: 20 });
    const member = await createMember(app, {
      email: email("oneshot-b"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const first = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(first.statusCode).toBe(201);
    const linkAfterFirst = await fullLinkRow(member.id);
    expect(linkAfterFirst?.benefit_status).toBe("consumed");
    expect(linkAfterFirst?.applied_subscription_id).toBe(
      first.body.id as number,
    );

    // Segundo cargo REAL (no un re-cobro): plan online_regular, grupo de
    // categoría distinto del presencial de arriba (D-35), así que convive
    // sin cancelar la primera sub — y sigue sin excludedFromReferrals (D-17),
    // así que si el one-shot NO estuviera implementado, este segundo cargo
    // SÍ aplicaría el descuento otra vez.
    const secondPlan = await createPlan(app, adminToken, {
      name: `Plan Online D-09 ${seq}`,
      priceRegular: 20000,
      planCategory: "online_regular",
      grantsAllPrograms: true,
    });
    const second = await assignPlan(app, adminToken, member.id, {
      planId: secondPlan.id,
    });
    expect(second.statusCode).toBe(201);
    const secondSubscriptionId = second.body.id as number;
    expect(second.body.pricePaid).toBe(20000); // sin descuento

    const subRow = await subscriptionPartnerDiscount(secondSubscriptionId);
    expect(subRow.partner_discount_percent).toBeNull();
    expect(subRow.partner_discount_amount).toBeNull();

    // El vínculo sigue exactamente como quedó tras el primer cobro — el
    // applied_subscription_id NO se pisa con el segundo cargo.
    const linkAfterSecond = await fullLinkRow(member.id);
    expect(linkAfterSecond?.applied_subscription_id).toBe(
      first.body.id as number,
    );
    expect(linkAfterSecond?.applied_percent).toBe(20);
  });

  it("(3) gana el partner (D-10/D-20): 30% partner vs tier AURA 10% → cobra 30%, aura_discount null, saldo AURA intacto", async () => {
    const partner = await insertPartner(app, { benefitValue: 30 });
    const member = await createMember(app, {
      email: email("wins-c"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 30,
      benefitStatus: "pending",
    });
    await seedAuraBalance(app, member.id, 5000);
    const balanceBefore = await readAuraBalance(member.id);
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      auraSpend: 1000, // tier 10%
    });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    expect(res.body.pricePaid).toBe(15000 - Math.floor(15000 * 0.3));
    expect(res.body.auraDiscount).toBeNull();
    expect(res.body.auraDiscountPercent).toBeNull();

    const balanceAfter = await readAuraBalance(member.id);
    expect(balanceAfter).toBe(balanceBefore); // ni un punto gastado

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBe(30);
    expect(subRow.partner_discount_amount).toBe(4500);

    const link = await fullLinkRow(member.id);
    expect(link?.benefit_status).toBe("consumed");
    expect(link?.applied_reason).toBe("aplicado");
    expect(link?.applied_percent).toBe(30);
  });

  it("(4) gana AURA: 10% partner vs tier AURA 30% → cobra 30% AURA, puntos gastados, vínculo consumido (perdio_vs_aura, applied_percent=0)", async () => {
    const partner = await insertPartner(app, { benefitValue: 10 });
    const member = await createMember(app, {
      email: email("loses-d"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 10,
      benefitStatus: "pending",
    });
    await seedAuraBalance(app, member.id, 5000);
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      auraSpend: 5000, // tier 30%
    });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    expect(res.body.pricePaid).toBe(15000 - Math.floor(15000 * 0.3));
    expect(res.body.auraDiscount).toBe(5000);
    expect(res.body.auraDiscountPercent).toBe(30);

    const balanceAfter = await readAuraBalance(member.id);
    expect(balanceAfter).toBe(0); // los 5000 puntos SÍ se gastaron

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBeNull();
    expect(subRow.partner_discount_amount).toBeNull();

    const link = await fullLinkRow(member.id);
    expect(link?.benefit_status).toBe("consumed");
    expect(link?.applied_reason).toBe("perdio_vs_aura");
    expect(link?.applied_percent).toBe(0);
    expect(link?.applied_amount).toBe(0);
    expect(link?.applied_subscription_id).toBe(subscriptionId);
  });

  it("(5) empate (D-10/D-20): 20% partner vs tier AURA 20% → gana el partner, saldo AURA intacto", async () => {
    const partner = await insertPartner(app, { benefitValue: 20 });
    const member = await createMember(app, {
      email: email("tie-e"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });
    await seedAuraBalance(app, member.id, 5000);
    const balanceBefore = await readAuraBalance(member.id);
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      auraSpend: 2000, // tier 20%
    });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    expect(res.body.pricePaid).toBe(15000 - Math.floor(15000 * 0.2));
    expect(res.body.auraDiscount).toBeNull();

    const balanceAfter = await readAuraBalance(member.id);
    expect(balanceAfter).toBe(balanceBefore);

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBe(20);

    const link = await fullLinkRow(member.id);
    expect(link?.applied_reason).toBe("aplicado");
  });

  it("(6a) D-17: plan 'paquete' con vínculo vigente → SIN descuento de partner, pero SÍ genera comisión", async () => {
    const partner = await insertPartner(app, {
      benefitValue: 20,
      commissionValue: 5000,
    });
    const member = await createMember(app, {
      email: email("paquete-f"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
    });
    const planId = await createPlanWithCategory("paquete", 15000);

    const res = await assignPlan(app, adminToken, member.id, { planId });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    expect(res.body.pricePaid).toBe(15000); // sin descuento

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBeNull();

    const link = await fullLinkRow(member.id);
    expect(link?.status).toBe("qualified"); // la comisión SÍ cualifica (D-17)
    expect(link?.benefit_status).toBe("pending"); // el descuento NO se consume

    const commissions = await partnerCommissionRows(app, subscriptionId);
    expect(commissions).toHaveLength(1);
  });

  it("(6b) D-17: plan 'especial' con vínculo vigente → SIN descuento de partner, pero SÍ genera comisión", async () => {
    const partner = await insertPartner(app, {
      benefitValue: 15,
      commissionValue: 3000,
    });
    const member = await createMember(app, {
      email: email("especial-g"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 15,
      benefitStatus: "pending",
    });
    const planId = await createPlanWithCategory("especial", 10000);

    const res = await assignPlan(app, adminToken, member.id, { planId });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    expect(res.body.pricePaid).toBe(10000);

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBeNull();

    const link = await fullLinkRow(member.id);
    expect(link?.status).toBe("qualified");
    expect(link?.benefit_status).toBe("pending");

    const commissions = await partnerCommissionRows(app, subscriptionId);
    expect(commissions).toHaveLength(1);
  });

  it("(7) alta prorrateada (prorateToMonthEnd=true) → sin descuento de partner, beneficio sigue pending", async () => {
    const partner = await insertPartner(app, { benefitValue: 25 });
    const member = await createMember(app, {
      email: email("proration-h"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 25,
      benefitStatus: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      prorateToMonthEnd: true,
    });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBeNull();
    expect(subRow.partner_discount_amount).toBeNull();

    const link = await fullLinkRow(member.id);
    expect(link?.benefit_status).toBe("pending");
    expect(link?.applied_subscription_id).toBeNull();
  });

  it("(8) beneficio vencido (benefit_expires_at en el pasado) → sin descuento, benefit_status sigue pending (D-07)", async () => {
    const partner = await insertPartner(app, { benefitValue: 20 });
    const member = await createMember(app, {
      email: email("expired-i"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "discount_percent",
      benefitValue: 20,
      benefitStatus: "pending",
      benefitExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // ayer
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    expect(res.body.pricePaid).toBe(15000);

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBeNull();

    const link = await fullLinkRow(member.id);
    expect(link?.benefit_status).toBe("pending");
    expect(link?.applied_subscription_id).toBeNull();
  });

  it("(9) vínculo free_pass nunca produce un descuento porcentual", async () => {
    const partner = await insertPartner(app, {
      benefitType: "free_pass",
      benefitValue: 0,
    });
    const member = await createMember(app, {
      email: email("freepass-j"),
      branchId: AR_BRANCH_ID,
    });
    await insertPartnerLink(app, {
      partnerId: partner.id,
      referredId: member.id,
      benefitType: "free_pass",
      benefitValue: 0,
      benefitStatus: "pending",
    });
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });

    const res = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);
    const subscriptionId = res.body.id as number;
    expect(res.body.pricePaid).toBe(15000);

    const subRow = await subscriptionPartnerDiscount(subscriptionId);
    expect(subRow.partner_discount_percent).toBeNull();
    expect(subRow.partner_discount_amount).toBeNull();

    // El benefit_status del free_pass tampoco se toca acá — el consumo de la
    // semana gratis vive en otro plan (activación al reservar, D-06).
    const link = await fullLinkRow(member.id);
    expect(link?.benefit_status).toBe("pending");
  });
});
