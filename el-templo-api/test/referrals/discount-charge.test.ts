/**
 * Fase 157 Plan 04 — Task 2: descuento de referido cableado en las charge-paths.
 *
 * Al cobrar (renew/assign) a un socio con vínculo qualified cuya contraparte
 * está activa, el pricePaid se reduce el % simétrico topeado (DESC-02/03/04) y
 * se escribe una fila auditable en referral_credits + anotación aura amount=0
 * (AURA-01). El descuento compone sobre auraSpend sin pisarlo (Pitfall 4).
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

async function renew(
  memberId: number,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/renew`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { paymentMethod: "cash" },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function readReferralCredit(
  userId: number,
): Promise<{ percent: number; amount: number } | undefined> {
  const rows = await app.db.execute(
    sql`SELECT percent, amount FROM referral_credits WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1`,
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

describe("Referral discount on charge-paths", () => {
  it("(a) renew con 1 vínculo qualified + contraparte activa reduce 10% + credit + aura amount=0", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
    const referrer = await createMember(app, { email: "dc-a-r@test.com" });
    const referred = await createMember(app, { email: "dc-a-d@test.com" });
    // Sub inicial del referrer SIN descuento (el vínculo se crea después).
    await assignPlan(app, adminToken, referrer.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    await linkQualified(referrer.id, referred.id);
    await giveCoverage(referred.id, plan.id, dateOffsetStr(30));

    const res = await renew(referrer.id);
    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(9000); // 10000 - 10%

    const credit = await readReferralCredit(referrer.id);
    expect(credit).toEqual({ percent: 10, amount: 1000 });
    expect(await readReferralAuraAmount(referrer.id)).toBe(0);
  });

  it("(b) contraparte inactiva → sin descuento ese ciclo (DESC-03)", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
    const referrer = await createMember(app, { email: "dc-b-r@test.com" });
    const referred = await createMember(app, { email: "dc-b-d@test.com" });
    await assignPlan(app, adminToken, referrer.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    await linkQualified(referrer.id, referred.id);
    await giveCoverage(referred.id, plan.id, dateOffsetStr(-5)); // vencido

    const res = await renew(referrer.id);
    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(10000); // sin descuento
    expect(await readReferralCredit(referrer.id)).toBeUndefined();
  });

  it("(c) 4 vínculos activos topean a 40%", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
    const referrer = await createMember(app, { email: "dc-c-r@test.com" });
    await assignPlan(app, adminToken, referrer.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    for (let i = 0; i < 4; i++) {
      const referred = await createMember(app, {
        email: `dc-c-d${i}@test.com`,
      });
      await linkQualified(referrer.id, referred.id);
      await giveCoverage(referred.id, plan.id, dateOffsetStr(30));
    }

    const res = await renew(referrer.id);
    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(6000); // 10000 - 40%
    expect(await readReferralCredit(referrer.id)).toEqual({
      percent: 40,
      amount: 4000,
    });
  });

  it("(d) simetría: el descuento aplica también al referido", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
    const referrer = await createMember(app, { email: "dc-d-r@test.com" });
    const referred = await createMember(app, { email: "dc-d-d@test.com" });
    await assignPlan(app, adminToken, referred.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    await linkQualified(referrer.id, referred.id);
    await giveCoverage(referrer.id, plan.id, dateOffsetStr(30));

    const res = await renew(referred.id);
    expect(res.statusCode).toBe(201);
    expect(res.body.pricePaid).toBe(9000); // el referido también descuenta
    expect(await readReferralCredit(referred.id)).toEqual({
      percent: 10,
      amount: 1000,
    });
  });

  it("(e) composición con auraSpend en assignPlan (ambos descuentos reflejados)", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 15000 });
    const payer = await createMember(app, { email: "dc-e-p@test.com" });
    const referred = await createMember(app, { email: "dc-e-d@test.com" });
    await linkQualified(payer.id, referred.id);
    await giveCoverage(referred.id, plan.id, dateOffsetStr(30));
    await seedAuraBalance(app, payer.id, 1000);

    const res = await assignPlan(app, adminToken, payer.id, {
      planId: plan.id,
      startDate: todayStr(),
      auraSpend: 1000, // 10% aura → 15000-1500=13500
    });
    expect(res.statusCode).toBe(201);
    // referral 10% sobre 13500 → 13500-1350=12150 (compone, no pisa).
    expect(res.body.pricePaid).toBe(12150);
    expect(res.body.auraDiscountPercent).toBe(10);
    expect(await readReferralCredit(payer.id)).toEqual({
      percent: 10,
      amount: 1350,
    });
  });
});
