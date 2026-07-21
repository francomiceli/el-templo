/**
 * Descuento de referido en los caminos de CAMBIO de plan (gaps de cobertura
 * 2026-07-20). El fix 2026-07-16 (preview-parity) probó los PREVIEWS de estos
 * caminos, pero no el COBRO real:
 *
 *   - Camino 3 · changePlanNow (cambio inmediato): el preview descuenta sobre el
 *     neto post-prorrateo, pero ningún test hacía el POST y verificaba que las
 *     columnas referralDiscount* + la fila en referral_credits quedaran escritas.
 *   - Camino 4 · changePlanAfterCurrent (cambio programado / "plan a futuro"):
 *     CERO cobertura, ni preview ni cobro. Es el camino de más riesgo porque el
 *     descuento se CALCULA Y COBRA al AGENDAR, pero la sub se activa después por
 *     cron. Acá se fija ese invariante: la activación NO recomputa ni recarga —
 *     el descuento queda congelado al momento de agendar (D-20/D-21), y compone
 *     sobre el descuento AURA sin pisarlo (Pitfall 4).
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
  seedAuraBalance,
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

async function readReferralStatus(
  referredId: number,
): Promise<{ status: string; qualifiedAt: string | null } | undefined> {
  const rows = await app.db.execute(
    sql`SELECT status, qualified_at AS qualifiedAt FROM referrals WHERE referred_id = ${referredId} LIMIT 1`,
  );
  return (rows[0] as Array<{ status: string; qualifiedAt: string | null }>)[0];
}

async function readReferralCredit(
  userId: number,
): Promise<{ percent: number; amount: number } | undefined> {
  const rows = await app.db.execute(
    sql`SELECT percent, amount FROM referral_credits WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1`,
  );
  return (rows[0] as Array<{ percent: number; amount: number }>)[0];
}

async function countReferralCredits(userId: number): Promise<number> {
  const rows = await app.db.execute(
    sql`SELECT COUNT(*) AS n FROM referral_credits WHERE user_id = ${userId}`,
  );
  return Number((rows[0] as Array<{ n: number }>)[0].n);
}

async function readReferralCreditForSub(
  subscriptionId: number,
): Promise<{ percent: number; amount: number } | undefined> {
  const rows = await app.db.execute(
    sql`SELECT percent, amount FROM referral_credits WHERE subscription_id = ${subscriptionId} LIMIT 1`,
  );
  return (rows[0] as Array<{ percent: number; amount: number }>)[0];
}

async function readReferralAuraAmount(userId: number): Promise<number | null> {
  const rows = await app.db.execute(
    sql`SELECT amount FROM aura_transactions WHERE user_id = ${userId} AND source_type = 'referral' ORDER BY id DESC LIMIT 1`,
  );
  const row = (rows[0] as Array<{ amount: number }>)[0];
  return row?.amount ?? null;
}

async function readSubReferralColumns(
  subscriptionId: number,
): Promise<{ percent: number | null; amount: number | null }> {
  const rows = await app.db.execute(
    sql`SELECT referral_discount_percent AS percent, referral_discount_amount AS amount
        FROM subscriptions WHERE id = ${subscriptionId} LIMIT 1`,
  );
  return (
    rows[0] as Array<{ percent: number | null; amount: number | null }>
  )[0];
}

async function readSubPricePaid(subscriptionId: number): Promise<number> {
  const rows = await app.db.execute(
    sql`SELECT price_paid AS pricePaid FROM subscriptions WHERE id = ${subscriptionId} LIMIT 1`,
  );
  return (rows[0] as Array<{ pricePaid: number }>)[0].pricePaid;
}

async function createEspecialPlan(priceRegular: number): Promise<number> {
  const res = await app.db.insert(schema.subscriptionPlans).values({
    name: "Pase Especial Cambio",
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
    isActive: true,
    isArchived: false,
  });
  return Number(res[0].insertId);
}

function scheduleChange(
  memberId: number,
  planId: number,
  extra: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return app
    .inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        startMode: "after_current",
        ...extra,
      },
    })
    .then((res) => ({
      statusCode: res.statusCode,
      body: JSON.parse(res.body),
    }));
}

// ───────────────────────────────────────────────────────────────────────────
// Camino 4 · cambio programado (changePlanAfterCurrent)
// ───────────────────────────────────────────────────────────────────────────
describe("Referral discount · scheduled plan change (after_current)", () => {
  it("(a) agendar con vínculo qualified + contraparte activa descuenta, persiste columnas, graba credit ligado a la sub programada, aura amount=0", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: "Sched B caro",
      priceRegular: 12000,
    });
    const payer = await createMember(app, { email: "cpc-a-p@test.com" });
    const referred = await createMember(app, { email: "cpc-a-d@test.com" });
    // Sub actual SIN vínculo (el vínculo se crea después → el assign no descuenta).
    await assignPlan(app, adminToken, payer.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    await linkQualified(payer.id, referred.id);
    await giveCoverage(referred.id, planA.id, dateOffsetStr(60));

    const res = await scheduleChange(payer.id, planB.id);
    expect(res.statusCode).toBe(201);
    expect(res.body.status).toBe("scheduled");
    // 12000 (precio pleno, sin prorrateo) - 10% = 10800.
    expect(res.body.pricePaid).toBe(10800);

    const scheduledId = res.body.id as number;
    expect(await readSubReferralColumns(scheduledId)).toEqual({
      percent: 10,
      amount: 1200,
    });
    // El credit queda ligado a la sub PROGRAMADA, no a la actual.
    expect(await readReferralCreditForSub(scheduledId)).toEqual({
      percent: 10,
      amount: 1200,
    });
    expect(await readReferralAuraAmount(payer.id)).toBe(0);
  });

  it("(b) el flip pending→qualified ocurre al AGENDAR y descuenta en el mismo cargo (D-20/D-21)", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: "Sched B flip",
      priceRegular: 12000,
    });
    const referrer = await createMember(app, { email: "cpc-b-r@test.com" });
    const payer = await createMember(app, { email: "cpc-b-d@test.com" });
    await assignPlan(app, adminToken, payer.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    // El payer es el REFERIDO con vínculo pending; el referidor está cubierto.
    await linkPending(referrer.id, payer.id);
    await giveCoverage(referrer.id, planA.id, dateOffsetStr(60));

    const res = await scheduleChange(payer.id, planB.id);
    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(10800); // flip antes de computar → descuenta ya

    const link = await readReferralStatus(payer.id);
    expect(link?.status).toBe("qualified");
    expect(link?.qualifiedAt).not.toBeNull();
    expect(await readReferralCredit(payer.id)).toEqual({
      percent: 10,
      amount: 1200,
    });
  });

  it("(c) el descuento queda CONGELADO al agendar: si la contraparte se cae antes de la activación por cron, la sub se activa al mismo precio ya cobrado y sin credit nuevo", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: "Sched B freeze",
      priceRegular: 12000,
    });
    const payer = await createMember(app, { email: "cpc-c-p@test.com" });
    const referred = await createMember(app, { email: "cpc-c-d@test.com" });
    const assignRes = await assignPlan(app, adminToken, payer.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    const oldSubId = assignRes.body.id as number;
    await linkQualified(payer.id, referred.id);
    await giveCoverage(referred.id, planA.id, dateOffsetStr(60));

    const sched = await scheduleChange(payer.id, planB.id);
    expect(sched.statusCode).toBe(201);
    const scheduledId = sched.body.id as number;
    expect(sched.body.pricePaid).toBe(10800);
    expect(await countReferralCredits(payer.id)).toBe(1);

    // La contraparte pierde cobertura DESPUÉS de agendar pero ANTES de activar.
    await app.db.execute(
      sql`UPDATE subscriptions SET subscription_status = 'cancelled' WHERE user_id = ${referred.id}`,
    );

    // Backdate old + successor y disparar auto-expire (cron) vía GET.
    await app.db.execute(
      sql`UPDATE subscriptions SET end_date = ${dateOffsetStr(-1)} WHERE id = ${oldSubId}`,
    );
    await app.db.execute(
      sql`UPDATE subscriptions SET start_date = ${dateOffsetStr(-1)} WHERE id = ${scheduledId}`,
    );
    await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${payer.id}/subscription`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    // La activación NO recomputa: precio congelado + un único credit (el de agendar).
    const rows = await app.db.execute(
      sql`SELECT subscription_status AS status FROM subscriptions WHERE id = ${scheduledId} LIMIT 1`,
    );
    expect((rows[0] as Array<{ status: string }>)[0].status).toBe("active");
    expect(await readSubPricePaid(scheduledId)).toBe(10800);
    expect(await countReferralCredits(payer.id)).toBe(1);
  });

  it("(d) agendar cambio HACIA un plan especial no flippea ni descuenta (guard D-09)", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const especialId = await createEspecialPlan(20000);
    const referrer = await createMember(app, { email: "cpc-d-r@test.com" });
    const payer = await createMember(app, { email: "cpc-d-d@test.com" });
    await assignPlan(app, adminToken, payer.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    await linkPending(referrer.id, payer.id);
    await giveCoverage(referrer.id, planA.id, dateOffsetStr(60));

    const res = await scheduleChange(payer.id, especialId);
    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(20000); // sin descuento

    expect((await readReferralStatus(payer.id))?.status).toBe("pending");
    expect(await readReferralCredit(payer.id)).toBeUndefined();
  });

  it("(e) composición AURA + referido al agendar (ambos descuentos, sin pisarse)", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 8000 });
    const planB = await createPlan(app, adminToken, {
      name: "Sched B aura",
      priceRegular: 12000,
    });
    const payer = await createMember(app, { email: "cpc-e-p@test.com" });
    const referred = await createMember(app, { email: "cpc-e-d@test.com" });
    await assignPlan(app, adminToken, payer.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    await linkQualified(payer.id, referred.id);
    await giveCoverage(referred.id, planA.id, dateOffsetStr(60));
    await seedAuraBalance(app, payer.id, 1000);

    const res = await scheduleChange(payer.id, planB.id, { auraSpend: 1000 });
    expect(res.statusCode).toBe(201);
    // AURA 10% sobre 12000 → 10800; referral 10% sobre 10800 → 9720 (compone).
    expect(res.body.pricePaid).toBe(9720);
    expect(res.body.auraDiscountPercent).toBe(10);
    expect(await readReferralCredit(payer.id)).toEqual({
      percent: 10,
      amount: 1080,
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Camino 3 · cambio inmediato (changePlanNow) — cobro real, paridad con preview
// ───────────────────────────────────────────────────────────────────────────
describe("Referral discount · immediate plan change (changePlanNow)", () => {
  it("(f) el cobro descuenta sobre el neto post-prorrateo, persiste columnas + credit, y coincide con el preview", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 10000 });
    const planB = await createPlan(app, adminToken, {
      name: "Now B caro",
      priceRegular: 20000,
    });
    const payer = await createMember(app, { email: "cpn-f-p@test.com" });
    const referred = await createMember(app, { email: "cpn-f-d@test.com" });
    await assignPlan(app, adminToken, payer.id, {
      planId: planA.id,
      startDate: todayStr(),
    });
    await linkQualified(payer.id, referred.id);
    await giveCoverage(referred.id, planA.id, dateOffsetStr(60));

    // Preview (vínculo qualified → sin simulación, paridad exacta con el cobro).
    const previewRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${payer.id}/subscription/change-plan-preview?targetPlanId=${planB.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = JSON.parse(previewRes.body) as {
      allowed: boolean;
      netAmount: number;
      referralDiscountPercent: number;
      referralDiscountAmount: number;
    };
    expect(preview.allowed).toBe(true);
    expect(preview.referralDiscountPercent).toBe(10);
    expect(preview.referralDiscountAmount).toBeGreaterThan(0);

    // Cobro inmediato: coincide con el preview.
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${payer.id}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: planB.id,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        startMode: "now",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: number; pricePaid: number };
    expect(body.pricePaid).toBe(preview.netAmount);

    expect(await readSubReferralColumns(body.id)).toEqual({
      percent: preview.referralDiscountPercent,
      amount: preview.referralDiscountAmount,
    });
    expect(await readReferralCredit(payer.id)).toEqual({
      percent: preview.referralDiscountPercent,
      amount: preview.referralDiscountAmount,
    });
  });

  it("(g) cambio inmediato sin vínculo activo NO descuenta ni graba credit", async () => {
    const planA = await createPlan(app, adminToken, { priceRegular: 10000 });
    const planB = await createPlan(app, adminToken, {
      name: "Now B sin referido",
      priceRegular: 20000,
    });
    const payer = await createMember(app, { email: "cpn-g-p@test.com" });
    await assignPlan(app, adminToken, payer.id, {
      planId: planA.id,
      startDate: todayStr(),
    });

    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${payer.id}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: planB.id,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        startMode: "now",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: number };
    expect(await readSubReferralColumns(body.id)).toEqual({
      percent: null,
      amount: null,
    });
    expect(await readReferralCredit(payer.id)).toBeUndefined();
  });
});
