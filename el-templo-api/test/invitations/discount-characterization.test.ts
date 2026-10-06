/**
 * Fase 194 Plan 02 — CARACTERIZACIÓN pre-árbitro de los descuentos en cobros.
 *
 * Este archivo es una FOTO del comportamiento ACTUAL (antes de "gana el mayor",
 * D-08/D-20/D-21): fija el precio cobrado y los montos guardados (`price_paid`,
 * `referral_discount_amount`, `aura_discount`, `partner_discount_amount`) en
 * las 4 charge-paths (assignPlan, changePlanNow, changePlanAfterCurrent,
 * renewSubscription) y en los 3 previews (getPricingPreview,
 * getChangePlanPreview, getRenewalPreview).
 *
 * NO es una especificación de lo deseado: varios casos afirman composiciones
 * que la fase va a CAMBIAR a propósito (AURA→referido, partner→referido,
 * override→referido, boarding pass→referido, add-back de renovación). Cada `it`
 * lleva una anotación:
 *   - `// 194: cambia en 194-NN por D-XX` → el plan NN cambia esta expectativa
 *     a propósito (y la reemplaza por `// 194-NN D-XX: <qué cambió>`).
 *   - `// 194: se conserva` → el comportamiento NO debe cambiar.
 * Así cada cambio de plata posterior aparece como cambio de EXPECTATIVA
 * revisable en el diff de este archivo (T-194-05 / T-194-06), nunca como efecto
 * colateral.
 *
 * Moldes: test/referrals/discount-charge.test.ts, test/referrals/preview-parity,
 * test/referral-partners/preview-parity, test/subscriptions/pricing-golden.
 * Números redondos: plan base 100000 ARS, descuento 10% por vínculo.
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
import { insertPartner, insertPartnerLink } from "../referral-partners/_helpers";
import * as schema from "../../src/db/schema";
import { PRICING_SETTINGS_KEYS } from "../../src/modules/settings/keys";
import { ReferralService } from "../../src/modules/referrals/service";
import { tenantWhere } from "../../src/modules/shared/tenant";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";

/** Gimnasio de las lecturas directas de este archivo (El Templo). */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

const BASE = 100000; // precio de lista del plan "mes" de los casos
const TARGET = 200000; // precio de lista del plan destino de los cambios de plan
const PRICE_ZERO = 70000; // precio Zero (boarding pass) del plan base

let app: FastifyInstance;
let adminToken: string;
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
  // cleanAllTestData vacía aura_config/system_settings: se re-siembran.
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

// ─── Fixtures ────────────────────────────────────────────────────────────────

function email(prefix: string): string {
  return `dchar-${prefix}-${seq}-${Date.now()}@test.com`;
}

async function monthPlan(
  name: string,
  priceRegular: number = BASE,
  priceZero: number = PRICE_ZERO,
): Promise<{ id: number }> {
  return createPlan(app, adminToken, {
    name,
    priceRegular,
    priceZero,
    classesPerWeek: undefined,
    durationDays: 30,
  });
}

async function member(prefix: string): Promise<{ id: number }> {
  return createMember(app, { email: email(prefix) });
}

/** Cobertura activa de la contraparte (la usa `deriveCoveredUntil`). */
async function giveCoverage(userId: number, planId: number): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO subscriptions (tenant_id, user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
        VALUES (${TENANT_TEMPLO}, ${userId}, ${planId}, 1, 'active', ${todayStr()}, ${dateOffsetStr(30)}, 10000, 'ARS', 'regular')`,
  );
}

/**
 * Deja al `payerId` con UN vínculo de referido `qualified` cuya contraparte
 * tiene cobertura hoy → descuento vigente 10% (computeReferralDiscountPercent).
 */
async function linkQualified(payerId: number, planId: number): Promise<number> {
  const other = await member("counterpart");
  await app.db.execute(
    sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (${TENANT_TEMPLO}, ${payerId}, ${other.id}, 'qualified', 'assisted', NOW())`,
  );
  await giveCoverage(other.id, planId);
  return other.id;
}

/** Vínculo de partner `pending` del payer (descuento 20% por defecto). */
async function linkPartner(payerId: number, percent = 20): Promise<void> {
  const partner = await insertPartner(app, { benefitValue: percent });
  await insertPartnerLink(app, {
    partnerId: partner.id,
    referredId: payerId,
    benefitType: "discount_percent",
    benefitValue: percent,
    benefitStatus: "pending",
  });
}

async function setZeroPriceRule(enabled: boolean): Promise<void> {
  const value = enabled ? "on" : "off";
  await app.db
    .insert(schema.systemSettings)
    .values({
      settingKey: PRICING_SETTINGS_KEYS.zeroPrice,
      settingValue: value,
    })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

interface SubRow {
  pricePaid: number;
  status: string;
  priceOverrideAmount: number | null;
  auraDiscount: number | null;
  auraDiscountPercent: number | null;
  referralDiscountPercent: number | null;
  referralDiscountAmount: number | null;
  partnerDiscountPercent: number | null;
  partnerDiscountAmount: number | null;
  boardingPassUsed: boolean;
}

/** Fila persistida de la sub: se afirma sobre la base, no sobre el DTO. */
async function readSub(subscriptionId: number): Promise<SubRow> {
  const [row] = await app.db
    .select({
      pricePaid: schema.subscriptions.pricePaid,
      status: schema.subscriptions.status,
      priceOverrideAmount: schema.subscriptions.priceOverrideAmount,
      auraDiscount: schema.subscriptions.auraDiscount,
      auraDiscountPercent: schema.subscriptions.auraDiscountPercent,
      referralDiscountPercent: schema.subscriptions.referralDiscountPercent,
      referralDiscountAmount: schema.subscriptions.referralDiscountAmount,
      partnerDiscountPercent: schema.subscriptions.partnerDiscountPercent,
      partnerDiscountAmount: schema.subscriptions.partnerDiscountAmount,
      boardingPassUsed: schema.subscriptions.boardingPassUsed,
    })
    .from(schema.subscriptions)
    .where(
      and(
        tenantWhere(schema.subscriptions, TEMPLO_CTX),
        eq(schema.subscriptions.id, subscriptionId),
      ),
    );
  if (!row) throw new Error(`sub ${subscriptionId} no existe`);
  return row;
}

async function auraBalanceOf(userId: number): Promise<number> {
  const rows = await app.db.execute(
    sql`SELECT balance FROM aura_balances WHERE user_id = ${userId}`,
  );
  const list = rows[0] as unknown as Array<{ balance: number }>;
  return list[0]?.balance ?? 0;
}

type Json = Record<string, unknown>;

async function get(url: string): Promise<Json> {
  const res = await app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body) as Json;
}

async function pricingPreview(
  userId: number,
  planId: number,
  auraSpend?: number,
): Promise<Json> {
  const qs = auraSpend ? `&auraSpend=${auraSpend}` : "";
  return get(
    `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/pricing-preview?planId=${planId}&priceType=regular${qs}`,
  );
}

async function changePlanPreview(
  userId: number,
  targetPlanId: number,
): Promise<Json> {
  return get(
    `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/change-plan-preview?targetPlanId=${targetPlanId}`,
  );
}

async function renewalPreview(userId: number): Promise<Json> {
  return get(
    `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/renewal-preview`,
  );
}

async function changePlan(
  userId: number,
  overrides: Json,
): Promise<{ statusCode: number; body: Json }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/change-plan`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      branchId: 1,
      startDate: todayStr(),
      priceTypeApplied: "regular",
      paymentMethod: "cash",
      ...overrides,
    },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) as Json };
}

async function renew(
  userId: number,
): Promise<{ statusCode: number; body: Json }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/renew`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { paymentMethod: "cash" },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) as Json };
}

/**
 * Socio con la sub del plan A (BASE) arrancada hace 15 días: el prorrateo de un
 * cambio de plan "ahora" devuelve la mitad (remainingValue = 50000). Se asigna
 * ANTES de crear vínculos/partner para que el alta no lleve descuento.
 */
async function memberWithHalfUsedSub(
  prefix: string,
): Promise<{ id: number; planA: { id: number }; planB: { id: number } }> {
  const planA = await monthPlan(`CP A ${prefix}`);
  const planB = await monthPlan(`CP B ${prefix}`, TARGET, 150000);
  const m = await member(prefix);
  const res = await assignPlan(app, adminToken, m.id, {
    planId: planA.id,
    startDate: dateOffsetStr(-15),
  });
  expect(res.statusCode).toBe(201);
  return { id: m.id, planA, planB };
}

// ─── assignPlan + getPricingPreview ──────────────────────────────────────────

describe("caracterización pre-194: assignPlan y getPricingPreview", () => {
  it("(a) solo referido 10% → 90000; el preview coincide con el cobro", async () => {
    // 194: se conserva (referido solo, sin otra promo: no cambia el número).
    const plan = await monthPlan("Char A");
    const payer = await member("a");
    await linkQualified(payer.id, plan.id);

    const preview = await pricingPreview(payer.id, plan.id);
    expect(preview.basePrice).toBe(BASE);
    expect(preview.referralDiscountPercent).toBe(10);
    expect(preview.referralDiscountAmount).toBe(10000);
    expect(preview.partnerDiscountPercent).toBeNull();
    expect(preview.discountType).toBe("none");
    expect(preview.finalPrice).toBe(90000);

    const res = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(90000);
    expect(row.pricePaid).toBe(preview.finalPrice);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(10000);
    expect(row.auraDiscount).toBeNull();
    expect(row.partnerDiscountAmount).toBeNull();
  });

  it("(b) AURA 10% + referido 10% COMPONEN → 81000 (referido sobre el neto de AURA)", async () => {
    // 194: cambia en 194-15 por D-08/D-21 (gana el mayor: un solo descuento).
    const plan = await monthPlan("Char B");
    const payer = await member("b");
    await linkQualified(payer.id, plan.id);
    await seedAuraBalance(app, payer.id, 1000);

    const preview = await pricingPreview(payer.id, plan.id, 1000);
    expect(preview.discountType).toBe("aura");
    expect(preview.discountAmount).toBe(10000);
    expect(preview.auraToSpend).toBe(1000);
    expect(preview.referralDiscountPercent).toBe(10);
    // Referido sobre 90000 (neto de AURA), no sobre 100000.
    expect(preview.referralDiscountAmount).toBe(9000);
    expect(preview.finalPrice).toBe(81000);

    const res = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      auraSpend: 1000,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(81000);
    expect(row.pricePaid).toBe(preview.finalPrice);
    expect(row.auraDiscount).toBe(1000);
    expect(row.auraDiscountPercent).toBe(10);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(9000);
    expect(row.partnerDiscountAmount).toBeNull();
    // AURA se gastó de verdad (los 1000 puntos).
    expect(await auraBalanceOf(payer.id)).toBe(0);
  });

  it("(b2) AURA 30% (tier 5000) vs partner 10% + referido 10%: gana AURA y el referido igual compone → 63000", async () => {
    // 194: cambia en 194-15 por D-21 (hoy AURA gana al partner pero el referido compone encima).
    const plan = await monthPlan("Char B2");
    const payer = await member("b2");
    await linkQualified(payer.id, plan.id);
    await linkPartner(payer.id, 10);
    await seedAuraBalance(app, payer.id, 5000);

    const preview = await pricingPreview(payer.id, plan.id, 5000);
    expect(preview.discountType).toBe("aura");
    expect(preview.partnerDiscountPercent).toBeNull();
    expect(preview.referralDiscountAmount).toBe(7000); // 10% de 70000
    expect(preview.finalPrice).toBe(63000);

    const res = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      auraSpend: 5000,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(63000);
    expect(row.auraDiscount).toBe(5000);
    expect(row.auraDiscountPercent).toBe(30);
    expect(row.partnerDiscountAmount).toBeNull(); // perdió vs AURA
    expect(row.referralDiscountAmount).toBe(7000);
  });

  it("(c) partner 20% + referido 10% COMPONEN → 72000 (referido sobre el neto del partner)", async () => {
    // 194: cambia en 194-15 por D-21 (partner vs invitación = gana el mayor monto).
    const plan = await monthPlan("Char C");
    const payer = await member("c");
    await linkQualified(payer.id, plan.id);
    await linkPartner(payer.id, 20);

    const preview = await pricingPreview(payer.id, plan.id);
    expect(preview.partnerDiscountPercent).toBe(20);
    expect(preview.partnerDiscountAmount).toBe(20000);
    expect(preview.referralDiscountPercent).toBe(10);
    expect(preview.referralDiscountAmount).toBe(8000); // 10% de 80000
    expect(preview.finalPrice).toBe(72000);

    const res = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(72000);
    expect(row.pricePaid).toBe(preview.finalPrice);
    expect(row.partnerDiscountPercent).toBe(20);
    expect(row.partnerDiscountAmount).toBe(20000);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(8000);
    expect(row.auraDiscount).toBeNull();
  });

  it("(c2) partner vs AURA sin referido: gana el mayor, el perdedor no compone → partner 20% gana a AURA 10%", async () => {
    // 194: se conserva (partner vs AURA ya es "gana el mayor", fase 179 D-10/D-20).
    const plan = await monthPlan("Char C2");
    const payer = await member("c2");
    await linkPartner(payer.id, 20);
    await seedAuraBalance(app, payer.id, 1000);

    const res = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      auraSpend: 1000,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(80000);
    expect(row.partnerDiscountAmount).toBe(20000);
    expect(row.auraDiscount).toBeNull();
    // AURA NO se gastó: el socio conserva sus puntos.
    expect(await auraBalanceOf(payer.id)).toBe(1000);
  });

  it("(d) override con motivo + referido COMPONEN → 45000 (el referido se aplica sobre el precio personalizado)", async () => {
    // 194: cambia en 194-15 por D-20 (override = precio final, sin descuento por invitación encima).
    const plan = await monthPlan("Char D");
    const payer = await member("d");
    await linkQualified(payer.id, plan.id);

    const res = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      priceOverrideAmount: 50000,
      priceOverrideReason: "Caracterización 194",
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.priceOverrideAmount).toBe(50000);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(5000);
    expect(row.pricePaid).toBe(45000);
  });

  it("(e) boarding pass (precio Zero) + referido → 63000 (referido sobre el precio Zero)", async () => {
    // 194: cambia en 194-15 por D-08 (el boarding pass es otra promo: no se acumula con la invitación).
    await setZeroPriceRule(true);
    try {
      const plan = await monthPlan("Char E");
      const payer = await member("e");
      await linkQualified(payer.id, plan.id);

      const res = await assignPlan(app, adminToken, payer.id, {
        planId: plan.id,
        boardingPass: true,
      });
      expect(res.statusCode).toBe(201);
      const row = await readSub(res.body.id as number);
      expect(row.boardingPassUsed).toBe(true);
      expect(row.referralDiscountPercent).toBe(10);
      expect(row.referralDiscountAmount).toBe(7000); // 10% de PRICE_ZERO
      expect(row.pricePaid).toBe(63000);
    } finally {
      await setZeroPriceRule(false);
    }
  });
});

// ─── changePlanNow + getChangePlanPreview ────────────────────────────────────

describe("caracterización pre-194: changePlanNow y getChangePlanPreview", () => {
  it("(f1) cambio ahora con referido: neto post-prorrateo 150000 → 135000; preview.netAmount === cobro", async () => {
    // 194: cambia en 194-17 por D-21 (el referido deja de ser un descuento aparte: compite con partner).
    const m = await memberWithHalfUsedSub("f1");
    await linkQualified(m.id, m.planA.id);

    const preview = await changePlanPreview(m.id, m.planB.id);
    expect(preview.allowed).toBe(true);
    // Mitad del mes usada: crédito remanente = 50000. Neto = 200000 - 50000.
    expect((preview.proration as Json).remainingValue).toBe(50000);
    expect(preview.referralDiscountPercent).toBe(10);
    expect(preview.referralDiscountAmount).toBe(15000);
    expect(preview.partnerDiscountAmount).toBe(0);
    expect(preview.netAmount).toBe(135000);

    const res = await changePlan(m.id, { planId: m.planB.id });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(135000);
    expect(row.pricePaid).toBe(preview.netAmount);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(15000);
    expect(row.auraDiscount).toBeNull();
    expect(row.partnerDiscountAmount).toBeNull();
  });

  it("(f2) cambio ahora con partner 20% + referido 10% COMPONEN → 108000; preview.netAmount === cobro", async () => {
    // 194: cambia en 194-17 por D-21 (partner vs invitación = gana el mayor monto).
    const m = await memberWithHalfUsedSub("f2");
    await linkQualified(m.id, m.planA.id);
    await linkPartner(m.id, 20);

    const preview = await changePlanPreview(m.id, m.planB.id);
    expect(preview.partnerDiscountPercent).toBe(20);
    expect(preview.partnerDiscountAmount).toBe(30000); // 20% de 150000
    expect(preview.referralDiscountAmount).toBe(12000); // 10% de 120000
    expect(preview.netAmount).toBe(108000);

    const res = await changePlan(m.id, { planId: m.planB.id });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(108000);
    expect(row.pricePaid).toBe(preview.netAmount);
    expect(row.partnerDiscountPercent).toBe(20);
    expect(row.partnerDiscountAmount).toBe(30000);
    expect(row.referralDiscountAmount).toBe(12000);
  });

  it("(f3) cambio ahora IGNORA auraSpend (supports.discounts=false): no hay descuento AURA ni se gastan puntos", async () => {
    // 194: se conserva (AURA nunca aplicó en "cambiar ahora"; 194-17 no la suma).
    const m = await memberWithHalfUsedSub("f3");
    await seedAuraBalance(app, m.id, 1000);

    const res = await changePlan(m.id, {
      planId: m.planB.id,
      auraSpend: 1000,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.auraDiscount).toBeNull();
    expect(row.auraDiscountPercent).toBeNull();
    expect(row.pricePaid).toBe(150000); // 200000 - 50000, sin referido ni AURA
    expect(await auraBalanceOf(m.id)).toBe(1000);
  });
});

// ─── changePlanAfterCurrent ──────────────────────────────────────────────────

describe("caracterización pre-194: changePlanAfterCurrent", () => {
  it("(g) después del actual con AURA 10% + referido 10% COMPONEN → 162000 (sin prorrateo, precio lleno del plan destino)", async () => {
    // 194: cambia en 194-16 por D-08/D-21 (gana el mayor: un solo descuento).
    const m = await memberWithHalfUsedSub("g");
    await linkQualified(m.id, m.planA.id);
    await seedAuraBalance(app, m.id, 1000);

    const res = await changePlan(m.id, {
      planId: m.planB.id,
      startMode: "after_current",
      auraSpend: 1000,
    });
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.status).toBe("scheduled");
    // 200000 - 10% AURA = 180000 → referido 10% de 180000 = 18000 → 162000.
    expect(row.auraDiscount).toBe(1000);
    expect(row.auraDiscountPercent).toBe(10);
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(18000);
    expect(row.pricePaid).toBe(162000);
    expect(await auraBalanceOf(m.id)).toBe(0);
  });
});

// ─── renewSubscription + getRenewalPreview ───────────────────────────────────

describe("caracterización pre-194: renewSubscription y getRenewalPreview", () => {
  it("(h) renovar con referido NO compone: la base hereda el precio pre-referido → 90000; getRenewalPreview.base === base usada", async () => {
    // 194: se conserva (el add-back del referido es lo que evita componer renovación tras renovación).
    const plan = await monthPlan("Char H");
    const payer = await member("h");
    await linkQualified(payer.id, plan.id);
    const first = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
    });
    expect(first.statusCode).toBe(201);
    const firstRow = await readSub(first.body.id as number);
    expect(firstRow.pricePaid).toBe(90000);
    expect(firstRow.referralDiscountAmount).toBe(10000);

    // Hoy el preview devuelve SOLO la base del mes completo (el admin
    // multiplica el % en el cliente — Pitfall 6): sin campos de descuento.
    const preview = await renewalPreview(payer.id);
    expect(preview).toEqual({
      subscriptionId: first.body.id,
      base: 100000, // 90000 pagado + 10000 de add-back del referido
      source: "inherited",
    });

    const res = await renew(payer.id);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.pricePaid).toBe(90000); // 100000 - 10% (NO 81000)
    expect(row.referralDiscountPercent).toBe(10);
    expect(row.referralDiscountAmount).toBe(10000);
    expect(row.auraDiscount).toBeNull();
    expect(row.partnerDiscountAmount).toBeNull();
  });

  it("(i) D-22: alta con AURA 10% → renovar HEREDA la base rebajada (el add-back solo devuelve el referido)", async () => {
    // 194: cambia en 194-18 por D-22 (la base de renovación debe ser la PRE-descuento: add-back de AURA).
    const plan = await monthPlan("Char I");
    const payer = await member("i");
    await seedAuraBalance(app, payer.id, 1000);
    const first = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      auraSpend: 1000,
    });
    expect(first.statusCode).toBe(201);
    const firstRow = await readSub(first.body.id as number);
    expect(firstRow.pricePaid).toBe(90000);
    expect(firstRow.auraDiscount).toBe(1000);
    expect(firstRow.referralDiscountAmount).toBeNull();

    const preview = await renewalPreview(payer.id);
    expect(preview.base).toBe(90000); // D-22 CONFIRMADO: debería ser 100000
    expect(preview.source).toBe("inherited");

    const res = await renew(payer.id);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    // El descuento AURA de UNA vez queda perpetuado en los ciclos siguientes.
    expect(row.pricePaid).toBe(90000);
    expect(row.auraDiscount).toBeNull(); // la renovación no gasta ni registra AURA
    expect(row.auraDiscountPercent).toBeNull();
  });

  it("(i2) D-22: alta con AURA 10% + referido 10% → renovar re-aplica el referido sobre la base ya rebajada → 81000", async () => {
    // 194: cambia en 194-18 por D-22 (base 100000 → un solo descuento, no 81000).
    const plan = await monthPlan("Char I2");
    const payer = await member("i2");
    await linkQualified(payer.id, plan.id);
    await seedAuraBalance(app, payer.id, 1000);
    const first = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      auraSpend: 1000,
    });
    expect(first.statusCode).toBe(201);
    expect((await readSub(first.body.id as number)).pricePaid).toBe(81000);

    // add-back de 9000 (solo el referido) → base 90000, ya sin el AURA.
    const preview = await renewalPreview(payer.id);
    expect(preview.base).toBe(90000);

    const res = await renew(payer.id);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    expect(row.referralDiscountAmount).toBe(9000);
    expect(row.pricePaid).toBe(81000);
  });

  it("(j) D-22: alta con partner 20% → renovar HEREDA la base rebajada (80000), el partner no se devuelve", async () => {
    // 194: cambia en 194-18 por D-22 (add-back del descuento de partner en la base de renovación).
    const plan = await monthPlan("Char J");
    const payer = await member("j");
    await linkPartner(payer.id, 20);
    const first = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
    });
    expect(first.statusCode).toBe(201);
    const firstRow = await readSub(first.body.id as number);
    expect(firstRow.pricePaid).toBe(80000);
    expect(firstRow.partnerDiscountAmount).toBe(20000);

    const preview = await renewalPreview(payer.id);
    expect(preview.base).toBe(80000); // D-22 CONFIRMADO: debería ser 100000
    expect(preview.source).toBe("inherited");

    const res = await renew(payer.id);
    expect(res.statusCode).toBe(201);
    const row = await readSub(res.body.id as number);
    // El beneficio de partner ya está consumido (primera cuota): no se re-aplica,
    // pero el precio rebajado se hereda para siempre.
    expect(row.pricePaid).toBe(80000);
    expect(row.partnerDiscountAmount).toBeNull();
  });
});

// ─── D-10e: simetría del referido ────────────────────────────────────────────

describe("caracterización pre-194: D-10e simetría del descuento de referido", () => {
  it("(l1) con aura_config.referral=10 invitado e invitador obtienen el MISMO 10% (simétrico)", async () => {
    // 194: se conserva (D-10e: el núcleo de la 157 ya es simétrico, no se reescribe).
    const plan = await monthPlan("Char L1");
    const referrer = await member("l1-referrer");
    const referred = await member("l1-referred");
    await app.db.execute(
      sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
          VALUES (${TENANT_TEMPLO}, ${referrer.id}, ${referred.id}, 'qualified', 'assisted', NOW())`,
    );
    await giveCoverage(referrer.id, plan.id);
    await giveCoverage(referred.id, plan.id);

    const referralService = new ReferralService(app.db, app.log);
    const forReferrer = await referralService.computeReferralDiscountPercent(
      TEMPLO_CTX,
      referrer.id,
    );
    const forReferred = await referralService.computeReferralDiscountPercent(
      TEMPLO_CTX,
      referred.id,
    );
    expect(forReferred).toBe(10);
    expect(forReferrer).toBe(10);
    expect(forReferrer).toBe(forReferred);
  });

  it("(l2) invitador con 5 vínculos activos topea en 40; cada invitado sigue en 10", async () => {
    // 194: se conserva (D-10e: 10% por invitado activo hasta el tope de 40).
    const plan = await monthPlan("Char L2");
    const referrer = await member("l2-referrer");
    await giveCoverage(referrer.id, plan.id);
    const referredIds: number[] = [];
    for (let i = 0; i < 5; i++) {
      const referred = await member(`l2-referred${i}`);
      await app.db.execute(
        sql`INSERT INTO referrals (tenant_id, referrer_id, referred_id, status, attribution_channel, qualified_at)
            VALUES (${TENANT_TEMPLO}, ${referrer.id}, ${referred.id}, 'qualified', 'assisted', NOW())`,
      );
      await giveCoverage(referred.id, plan.id);
      referredIds.push(referred.id);
    }

    const referralService = new ReferralService(app.db, app.log);
    expect(
      await referralService.computeReferralDiscountPercent(
        TEMPLO_CTX,
        referrer.id,
      ),
    ).toBe(40); // 5 x 10 = 50 → tope 40
    for (const referredId of referredIds) {
      expect(
        await referralService.computeReferralDiscountPercent(
          TEMPLO_CTX,
          referredId,
        ),
      ).toBe(10);
    }
  });

  it("(l3) la baja de la contraparte quita el descuento de ese lado (aplica en el próximo cobro)", async () => {
    // 194: se conserva (D-10e: se recalcula en cada cobro; la baja aplica desde la próxima renovación).
    const plan = await monthPlan("Char L3");
    const payer = await member("l3");
    const counterpartId = await linkQualified(payer.id, plan.id);
    const referralService = new ReferralService(app.db, app.log);
    expect(
      await referralService.computeReferralDiscountPercent(
        TEMPLO_CTX,
        payer.id,
      ),
    ).toBe(10);

    await app.db.execute(
      sql`UPDATE subscriptions SET subscription_status = 'cancelled' WHERE user_id = ${counterpartId} AND tenant_id = ${TENANT_TEMPLO}`,
    );
    expect(
      await referralService.computeReferralDiscountPercent(
        TEMPLO_CTX,
        payer.id,
      ),
    ).toBe(0);
  });
});
