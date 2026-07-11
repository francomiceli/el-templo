/**
 * Fase 158 Plan 01 — Task 3: endpoint admin GET /api/admin/members/:id/referrals.
 *
 * Datos de la sección "Referidos" de la ficha del alumno (VIS-03/D-34). Gestión
 * lee el overview de CUALQUIER alumno; el mismo estado derivado que la app. El
 * guard es ADMIN_ROLES → un token de socio no-admin recibe 403 (T-158-02).
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

const MEMBER_PASSWORD = "pass123456";

interface LinkView {
  userId: number;
  fullName: string;
  state: "pending" | "active" | "suspended";
}
interface OverviewBody {
  referralCode: string;
  discount: { percent: number; activeCount: number };
  referred: LinkView[];
  referredBy: LinkView | null;
}

function url(userId: number): string {
  return `/api/admin/members/${userId}/referrals`;
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
  status: "pending" | "qualified",
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

describe("GET /api/admin/members/:id/referrals — ficha admin", () => {
  it("admin obtiene el overview del alumno objetivo (200 con ambos lados)", async () => {
    const plan = await createPlan(app, adminToken);
    const target = await createMember(app, { email: "a-target@test.com" });
    const bringer = await createMember(app, {
      email: "a-bringer@test.com",
      firstName: "Ana",
      lastName: "Gómez",
    });
    const broughtIn = await createMember(app, { email: "a-brought@test.com" });

    // target fue traído por bringer, y target trajo a broughtIn (activo).
    await link(bringer.id, target.id, "qualified");
    await giveCoverage(bringer.id, plan.id, dateOffsetStr(30));
    await link(target.id, broughtIn.id, "qualified");
    await giveCoverage(broughtIn.id, plan.id, dateOffsetStr(30));

    const res = await app.inject({
      method: "GET",
      url: url(target.id),
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as OverviewBody;

    expect(body.referredBy?.userId).toBe(bringer.id);
    expect(body.referredBy?.fullName).toBe("Ana Gómez");
    expect(body.referred).toHaveLength(1);
    expect(body.referred[0].userId).toBe(broughtIn.id);
    expect(body.referred[0].state).toBe("active");
  });

  it("un socio no-admin recibe 403", async () => {
    const target = await createMember(app, { email: "a-t2@test.com" });
    await createMember(app, { email: "a-socio@test.com" });
    const socioToken = await getAuthToken(
      app,
      "a-socio@test.com",
      MEMBER_PASSWORD,
    );

    const res = await app.inject({
      method: "GET",
      url: url(target.id),
      headers: { authorization: `Bearer ${socioToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("requiere autenticación (401 sin token)", async () => {
    const target = await createMember(app, { email: "a-t3@test.com" });
    const res = await app.inject({ method: "GET", url: url(target.id) });
    expect(res.statusCode).toBe(401);
  });
});
