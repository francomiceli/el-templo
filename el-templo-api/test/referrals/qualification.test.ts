/**
 * Fase 157 Plan 04 — Task 1: cualificación del vínculo en el primer pago.
 *
 * El primer pago del referido con pricePaid>0 flippea su vínculo
 * pending→qualified ANTES de computar el descuento (D-20/D-21). Como el flip
 * precede al cómputo, ese MISMO cargo ya lleva descuento cuando el referidor
 * (contraparte) tiene cobertura vigente. Un pago con pricePaid===0 NO cualifica.
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
  // Local siembra default_amount=50 (stale): fijamos 10/40 explícito.
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

/** Crea el vínculo referrer→referred con el status dado. */
async function link(
  referrerId: number,
  referredId: number,
  status: "qualified" | "pending" = "pending",
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel)
        VALUES (${referrerId}, ${referredId}, ${status}, 'assisted')`,
  );
}

/** Da cobertura vigente insertando una subscripción activa directa. */
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

async function readLink(
  referredId: number,
): Promise<{ status: string; qualified_at: string | null } | undefined> {
  const rows = await app.db.execute(
    sql`SELECT status, qualified_at FROM referrals WHERE referred_id = ${referredId} LIMIT 1`,
  );
  return (rows[0] as Array<{ status: string; qualified_at: string | null }>)[0];
}

/** Última subscripción creada para el usuario (la del cargo bajo prueba). */
async function readSubscription(
  userId: number,
): Promise<{ price_paid: number; referral_discount_amount: number | null }> {
  const rows = await app.db.execute(
    sql`SELECT price_paid, referral_discount_amount FROM subscriptions
        WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1`,
  );
  return (
    rows[0] as Array<{
      price_paid: number;
      referral_discount_amount: number | null;
    }>
  )[0];
}

describe("Referral qualification on first payment (assignPlan)", () => {
  it("(a) 1er pago con precio>0 flippea el vínculo pending→qualified", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "qa-r@test.com" });
    const referred = await createMember(app, { email: "qa-d@test.com" });
    await link(referrer.id, referred.id, "pending");

    const res = await assignPlan(app, adminToken, referred.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);

    const l = await readLink(referred.id);
    expect(l?.status).toBe("qualified");
    expect(l?.qualified_at).not.toBeNull();
  });

  it("(b) pago con pricePaid===0 (mes gratis) NO cualifica (D-20)", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "qb-r@test.com" });
    const referred = await createMember(app, { email: "qb-d@test.com" });
    await link(referrer.id, referred.id, "pending");

    const res = await assignPlan(app, adminToken, referred.id, {
      planId: plan.id,
      priceOverrideAmount: 0,
      priceOverrideReason: "beca 100%",
    });
    expect(res.statusCode).toBe(201);

    const l = await readLink(referred.id);
    expect(l?.status).toBe("pending");
    expect(l?.qualified_at).toBeNull();
  });

  it("(c) 2do pago no re-flippea ni rompe (idempotente)", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "qc-r@test.com" });
    const referred = await createMember(app, { email: "qc-d@test.com" });
    await link(referrer.id, referred.id, "qualified");
    await app.db.execute(
      sql`UPDATE referrals SET qualified_at = '2020-01-01 00:00:00' WHERE referred_id = ${referred.id}`,
    );

    const res = await assignPlan(app, adminToken, referred.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);

    const l = await readLink(referred.id);
    expect(l?.status).toBe("qualified");
    // qualifiedAt no se pisa: sigue siendo el original (guardado WHERE pending).
    expect(l?.qualified_at).toContain("2020-01-01");
  });

  it("(d) D-21: 1er pago con referidor CON cobertura cualifica Y descuenta el mismo cargo", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "qd-r@test.com" });
    const referred = await createMember(app, { email: "qd-d@test.com" });
    await link(referrer.id, referred.id, "pending");
    // El referidor está cubierto → su contraparte (el referido) descuenta ya.
    await giveCoverage(referrer.id, plan.id, dateOffsetStr(30));

    const res = await assignPlan(app, adminToken, referred.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);

    const l = await readLink(referred.id);
    expect(l?.status).toBe("qualified");

    const sub = await readSubscription(referred.id);
    // basePrice 15000 - 10% = 13500 (el flip precede al cómputo).
    expect(sub.price_paid).toBe(13500);
    expect(sub.referral_discount_amount).toBe(1500);
  });

  it("(e) contraste D-21: 1er pago con referidor SIN cobertura cualifica pero sin descuento", async () => {
    const plan = await createPlan(app, adminToken);
    const referrer = await createMember(app, { email: "qe-r@test.com" });
    const referred = await createMember(app, { email: "qe-d@test.com" });
    await link(referrer.id, referred.id, "pending");
    // Sin cobertura del referidor → cualifica igual pero ese cargo no descuenta.

    const res = await assignPlan(app, adminToken, referred.id, {
      planId: plan.id,
    });
    expect(res.statusCode).toBe(201);

    const l = await readLink(referred.id);
    expect(l?.status).toBe("qualified");

    const sub = await readSubscription(referred.id);
    expect(sub.price_paid).toBe(15000);
    expect(sub.referral_discount_amount).toBeNull();
  });
});
