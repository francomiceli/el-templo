/**
 * Fase 161 Plan 02 — venta y renovación del pase "Actividades con Aura".
 *
 * Cubre las reglas de negocio del pase especial en assignPlan/renewSubscription:
 *  - PASE-02: el pase Socio (requires_presencial=1) convive en paralelo con el
 *    presencial (grupos de categoría distintos) y valida "socio activo" (D-01).
 *  - PASE-03: el pase Externo (requires_presencial=0) es sub única sin exigir
 *    presencial.
 *  - PASE-04: renovación por subscriptionId explícito (discrimina qué sub renovar
 *    cuando hay presencial + pase activos) con budget explícito de 2.
 *  - D-09: ni pagar (assign) ni RENOVAR el pase cualifica vínculos de referido ni
 *    aplica el descuento simétrico (los pases quedan fuera de referidos).
 *
 * Los planes especiales reales entran a prod por la migración 0179 (INSERT
 * directo). Acá se seedean vía Drizzle (mismo INSERT que la migración) en vez de
 * la ruta admin create-plan: esa ruta todavía no persiste monthly_class_budget /
 * requires_presencial (ese ABM es de una ola posterior) y además trata `especial`
 * como online en assertPlanInvariants (callsite de isOnlinePlan diferido). El seed
 * directo mirror-ea cómo prod obtiene estos planes.
 *
 * Análogo estructural: test/subscriptions/dual-subscription.test.ts +
 * test/referrals/discount-charge.test.ts (helpers de referidos).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../../src/db/schema";
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
} from "./_helpers";

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
  // Config de referidos: sin esto computeReferralDiscountPercent devuelve 0 y las
  // aserciones "no aplica descuento" no probarían nada (un vínculo qualified +
  // contraparte activa daría 10% en un plan normal, 0 en el pase por el guard D-09).
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

/**
 * Seed de un plan especial vía Drizzle (mismo shape que la migración 0179):
 * classes_per_week NULL + monthly_class_budget explícito + requires_presencial
 * según Socio/Externo. Bypassa la ruta admin create-plan (ver docstring del file).
 */
async function seedEspecialPlan(
  name: string,
  requiresPresencial: boolean,
  priceRegular = requiresPresencial ? 10000 : 20000,
): Promise<number> {
  const res = await app.db.insert(schema.subscriptionPlans).values({
    name,
    planTier: "other",
    bookingMode: "flexible",
    planCategory: "especial",
    priceRegular,
    priceZero: priceRegular,
    durationDays: 30,
    classesPerWeek: null,
    monthlyClassBudget: 2,
    requiresPresencial,
    country: "AR",
    currency: "ARS",
  });
  return Number(res[0].insertId);
}

async function renew(
  memberId: number,
  body: Record<string, unknown> = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/renew`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { paymentMethod: "cash", ...body },
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}

async function countActiveSubs(userId: number): Promise<number> {
  const rows = await app.db.execute(
    sql`SELECT COUNT(*) AS c FROM subscriptions
        WHERE user_id = ${userId} AND subscription_status = 'active'`,
  );
  return Number((rows[0] as Array<{ c: number }>)[0].c);
}

// ── Helpers de referidos (copiados de discount-charge.test.ts) ──
async function linkQualified(
  referrerId: number,
  referredId: number,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (${referrerId}, ${referredId}, 'qualified', 'assisted', NOW())`,
  );
}

async function linkPending(
  referrerId: number,
  referredId: number,
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel)
        VALUES (${referrerId}, ${referredId}, 'pending', 'assisted')`,
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

async function readReferralStatus(referredId: number): Promise<string | null> {
  const rows = await app.db.execute(
    sql`SELECT status FROM referrals WHERE referred_id = ${referredId} LIMIT 1`,
  );
  const row = (rows[0] as Array<{ status: string }>)[0];
  return row?.status ?? null;
}

async function readReferralCredit(
  userId: number,
): Promise<{ percent: number; amount: number } | undefined> {
  const rows = await app.db.execute(
    sql`SELECT percent, amount FROM referral_credits WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1`,
  );
  return (rows[0] as Array<{ percent: number; amount: number }>)[0];
}

describe("Pase especial — assign/renew (fase 161-02)", () => {
  it("(1) PASE-02: socio con presencial activo suma el pase Socio en paralelo (2 subs, budget=2)", async () => {
    const presencial = await createPlan(app, adminToken, {
      name: "Presencial 02",
      planCategory: "presencial",
    });
    const socioPassId = await seedEspecialPlan("Pase Socio 02", true);
    const member = await createMember(app, { email: "ep-02p@test.com" });

    const r1 = await assignPlan(app, adminToken, member.id, {
      planId: presencial.id,
    });
    expect(r1.statusCode).toBe(201);

    const r2 = await assignPlan(app, adminToken, member.id, {
      planId: socioPassId,
    });
    expect(r2.statusCode).toBe(201);
    expect(r2.body.planCategory).toBe("especial");
    expect(r2.body.classesRemaining).toBe(2);
    expect(r2.body.classesBudget).toBe(2);

    // presencial + especial activos en paralelo (grupos de categoría distintos)
    expect(await countActiveSubs(member.id as number)).toBe(2);
  });

  it("(2) PASE-02 negativo (D-01): asignar el pase Socio sin presencial activo → 400 'presencial activo'", async () => {
    const socioPassId = await seedEspecialPlan("Pase Socio 02n", true);
    const member = await createMember(app, { email: "ep-02n@test.com" });

    const r = await assignPlan(app, adminToken, member.id, {
      planId: socioPassId,
    });
    expect(r.statusCode).toBe(400);
    expect(String(r.body.message)).toContain("presencial activo");
  });

  it("(3) PASE-03: el pase Externo no exige presencial — sub única creada OK con budget=2", async () => {
    const externoPassId = await seedEspecialPlan("Pase Externo 03", false);
    const member = await createMember(app, { email: "ep-03@test.com" });

    const r = await assignPlan(app, adminToken, member.id, {
      planId: externoPassId,
    });
    expect(r.statusCode).toBe(201);
    expect(r.body.planCategory).toBe("especial");
    expect(r.body.classesRemaining).toBe(2);
    expect(await countActiveSubs(member.id as number)).toBe(1);
  });

  it("(4) PASE-04: renovar por subscriptionId extiende la sub especial (no la presencial) y resetea a 2", async () => {
    const presencial = await createPlan(app, adminToken, {
      name: "Presencial 04",
      planCategory: "presencial",
    });
    const socioPassId = await seedEspecialPlan("Pase Socio 04", true);
    const member = await createMember(app, { email: "ep-04@test.com" });

    const rp = await assignPlan(app, adminToken, member.id, {
      planId: presencial.id,
    });
    expect(rp.statusCode).toBe(201);
    const presencialSubId = rp.body.id as number;

    const re = await assignPlan(app, adminToken, member.id, {
      planId: socioPassId,
    });
    expect(re.statusCode).toBe(201);
    const especialSubId = re.body.id as number;

    const rn = await renew(member.id as number, {
      subscriptionId: especialSubId,
    });
    expect(rn.statusCode).toBe(201);
    expect(rn.body.planCategory).toBe("especial");
    expect(rn.body.classesRemaining).toBe(2);
    // extiende la sub especial (encadenada), nunca la presencial
    expect(rn.body.previousSubscriptionId).toBe(especialSubId);
    expect(rn.body.id).not.toBe(presencialSubId);
  });

  it("(5) D-09 assign: pagar el pase NO flippea un vínculo pending ni aplica descuento de referido", async () => {
    const coveragePlan = await createPlan(app, adminToken, {
      name: "Cobertura D9a",
      planCategory: "presencial",
    });
    const externoPassId = await seedEspecialPlan("Pase Externo D9a", false);
    const payer = await createMember(app, { email: "ep-d9a-p@test.com" });
    const referredByPayer = await createMember(app, {
      email: "ep-d9a-rd@test.com",
    });
    const referrerOfPayer = await createMember(app, {
      email: "ep-d9a-rr@test.com",
    });

    // payer ES REFERIDOR de referredByPayer (qualified + contraparte activa): en un
    // plan normal esto le daría 10% de descuento simétrico.
    await linkQualified(payer.id as number, referredByPayer.id as number);
    await giveCoverage(
      referredByPayer.id as number,
      coveragePlan.id as number,
      dateOffsetStr(30),
    );
    // payer ES REFERIDO por referrerOfPayer (pending): un cargo normal lo flippearía.
    await linkPending(referrerOfPayer.id as number, payer.id as number);

    const r = await assignPlan(app, adminToken, payer.id, {
      planId: externoPassId,
    });
    expect(r.statusCode).toBe(201);
    // 20000 sin descuento (el guard D-09 saltea el descuento del pase)
    expect(r.body.pricePaid).toBe(20000);
    // el vínculo pending del payer sigue pending (no lo cualificó el pago del pase)
    expect(await readReferralStatus(payer.id as number)).toBe("pending");
    // no se escribió crédito de referido
    expect(await readReferralCredit(payer.id as number)).toBeUndefined();
  });

  it("(6) D-09 renew: renovar el pase especial NO cualifica el vínculo pending ni descuenta", async () => {
    const coveragePlan = await createPlan(app, adminToken, {
      name: "Cobertura D9r",
      planCategory: "presencial",
    });
    const externoPassId = await seedEspecialPlan("Pase Externo D9r", false);
    const payer = await createMember(app, { email: "ep-d9r-p@test.com" });
    const referredByPayer = await createMember(app, {
      email: "ep-d9r-rd@test.com",
    });
    const referrerOfPayer = await createMember(app, {
      email: "ep-d9r-rr@test.com",
    });

    // El pase se paga ANTES de que existan los vínculos (assign limpio).
    const rAssign = await assignPlan(app, adminToken, payer.id, {
      planId: externoPassId,
    });
    expect(rAssign.statusCode).toBe(201);
    const especialSubId = rAssign.body.id as number;

    await linkQualified(payer.id as number, referredByPayer.id as number);
    await giveCoverage(
      referredByPayer.id as number,
      coveragePlan.id as number,
      dateOffsetStr(30),
    );
    await linkPending(referrerOfPayer.id as number, payer.id as number);

    const rn = await renew(payer.id as number, {
      subscriptionId: especialSubId,
    });
    expect(rn.statusCode).toBe(201);
    // hereda el precio del pase sin descuento de referido
    expect(rn.body.pricePaid).toBe(20000);
    // el vínculo pending sigue pending y no hay crédito
    expect(await readReferralStatus(payer.id as number)).toBe("pending");
    expect(await readReferralCredit(payer.id as number)).toBeUndefined();
  });
});
