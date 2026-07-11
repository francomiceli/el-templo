/**
 * Fase 158 Plan 01 — Task 3: endpoint member GET /api/members/referrals.
 *
 * Superficie de LECTURA (VIS-01): el socio autenticado obtiene su código (lazy),
 * su descuento vigente con desglose y sus vínculos con estado DERIVADO
 * (deriveCoveredUntil de la contraparte, D-28 — nunca users.status). El userId
 * es server-derived del token (IDOR, T-158-01). El % del desglose es EXACTAMENTE
 * el del cobro (paridad con computeReferralDiscountPercent, red de seguridad D-30).
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
import { createPlan, createMember } from "../subscriptions/_helpers";
import { ReferralService } from "../../src/modules/referrals/service";

const URL = "/api/members/referrals";
const MEMBER_PASSWORD = "pass123456";

interface LinkView {
  userId: number;
  fullName: string;
  state: "pending" | "active" | "suspended";
}
interface OverviewBody {
  referralCode: string;
  discount: {
    percent: number;
    activeCount: number;
    perLinkPercent: number;
    capPercent: number;
  };
  referred: LinkView[];
  referredBy: LinkView | null;
}

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
  // Fijar config 10/40 explícito (la siembra local puede traer default_amount stale).
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

async function link(
  referrerId: number,
  referredId: number,
  status: "pending" | "qualified" | "revoked",
): Promise<void> {
  await app.db.execute(
    sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel, qualified_at)
        VALUES (${referrerId}, ${referredId}, ${status}, 'assisted', NOW())`,
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

async function getOverview(token: string): Promise<{
  statusCode: number;
  body: OverviewBody;
}> {
  const res = await app.inject({
    method: "GET",
    url: URL,
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    statusCode: res.statusCode,
    body: JSON.parse(res.body) as OverviewBody,
  };
}

describe("GET /api/members/referrals — member overview", () => {
  it("requiere autenticación (401 sin token)", async () => {
    const res = await app.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(401);
  });

  it("genera y devuelve el referralCode lazy si el socio no tiene", async () => {
    await createMember(app, { email: "m-lazy@test.com" });
    const token = await getAuthToken(app, "m-lazy@test.com", MEMBER_PASSWORD);

    const { statusCode, body } = await getOverview(token);
    expect(statusCode).toBe(200);
    expect(body.referralCode).toBeTruthy();
    expect(body.referralCode.length).toBeGreaterThan(0);

    // Idempotente: una 2da lectura devuelve el MISMO código persistido.
    const again = await getOverview(token);
    expect(again.body.referralCode).toBe(body.referralCode);
  });

  it("deriva estados pending/active/suspended y excluye revoked", async () => {
    const plan = await createPlan(app, adminToken);
    const r = await createMember(app, { email: "m-r@test.com" });
    const pPending = await createMember(app, { email: "m-pending@test.com" });
    const pActive = await createMember(app, { email: "m-active@test.com" });
    const pSuspended = await createMember(app, { email: "m-susp@test.com" });
    const pRevoked = await createMember(app, { email: "m-revoked@test.com" });

    await link(r.id, pPending.id, "pending");
    await link(r.id, pActive.id, "qualified");
    await giveCoverage(pActive.id, plan.id, dateOffsetStr(30));
    await link(r.id, pSuspended.id, "qualified");
    await giveCoverage(pSuspended.id, plan.id, dateOffsetStr(-5)); // vencida
    await link(r.id, pRevoked.id, "revoked");

    const token = await getAuthToken(app, "m-r@test.com", MEMBER_PASSWORD);
    const { statusCode, body } = await getOverview(token);
    expect(statusCode).toBe(200);

    // revoked no aparece → 3 vínculos, no 4.
    expect(body.referred).toHaveLength(3);
    const byId = new Map(body.referred.map((l) => [l.userId, l.state]));
    expect(byId.get(pPending.id)).toBe("pending");
    expect(byId.get(pActive.id)).toBe("active");
    expect(byId.get(pSuspended.id)).toBe("suspended");
    expect(byId.has(pRevoked.id)).toBe(false);
    expect(body.referredBy).toBeNull();
  });

  it("expone el lado 'te trajo' (referredBy) con nombre de la contraparte", async () => {
    const plan = await createPlan(app, adminToken);
    const bringer = await createMember(app, {
      email: "m-bringer@test.com",
      firstName: "Ana",
      lastName: "Gómez",
    });
    const me = await createMember(app, { email: "m-me@test.com" });
    await link(bringer.id, me.id, "qualified");
    await giveCoverage(bringer.id, plan.id, dateOffsetStr(30));

    const token = await getAuthToken(app, "m-me@test.com", MEMBER_PASSWORD);
    const { body } = await getOverview(token);
    expect(body.referred).toHaveLength(0);
    expect(body.referredBy).not.toBeNull();
    expect(body.referredBy?.userId).toBe(bringer.id);
    expect(body.referredBy?.fullName).toBe("Ana Gómez");
    expect(body.referredBy?.state).toBe("active");
  });

  it("desglose desde config y percent === computeReferralDiscountPercent (paridad D-30)", async () => {
    const plan = await createPlan(app, adminToken);
    const r = await createMember(app, { email: "m-cfg@test.com" });
    // 2 vínculos activos → 20% con config 10/40.
    for (let i = 0; i < 2; i++) {
      const p = await createMember(app, { email: `m-cfg-p${i}@test.com` });
      await link(r.id, p.id, "qualified");
      await giveCoverage(p.id, plan.id, dateOffsetStr(30));
    }

    const token = await getAuthToken(app, "m-cfg@test.com", MEMBER_PASSWORD);
    const { body } = await getOverview(token);

    expect(body.discount.perLinkPercent).toBe(10);
    expect(body.discount.capPercent).toBe(40);
    expect(body.discount.activeCount).toBe(2);

    // Paridad: el % del overview es EXACTAMENTE el del cobro (mismo método).
    const service = new ReferralService(app.db, app.log);
    const canonical = await service.computeReferralDiscountPercent(r.id);
    expect(body.discount.percent).toBe(canonical);
    expect(body.discount.percent).toBe(20);
  });

  it("IDOR: el socio A solo ve lo suyo, nunca los vínculos de B", async () => {
    const plan = await createPlan(app, adminToken);
    const b = await createMember(app, { email: "m-b@test.com" });
    const bReferred = await createMember(app, { email: "m-b-ref@test.com" });
    await link(b.id, bReferred.id, "qualified");
    await giveCoverage(bReferred.id, plan.id, dateOffsetStr(30));

    await createMember(app, { email: "m-a@test.com" });
    const tokenA = await getAuthToken(app, "m-a@test.com", MEMBER_PASSWORD);
    const { statusCode, body } = await getOverview(tokenA);

    // El overview de A es el de A: sin vínculos, descuento 0 — jamás los de B.
    expect(statusCode).toBe(200);
    expect(body.referred).toHaveLength(0);
    expect(body.referredBy).toBeNull();
    expect(body.discount.percent).toBe(0);
    expect(body.discount.activeCount).toBe(0);
  });
});
