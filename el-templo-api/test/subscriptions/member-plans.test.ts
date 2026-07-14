import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  todayStr,
  dateOffsetStr,
} from "../helpers";
import { createPlan, createMember, assignPlan } from "./_helpers";

const ADMIN_BASE_URL = "/api/admin/subscriptions";
const MEMBER_URL = "/api/members/subscription/plans";

describe("Member Plan Listing API", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;

  const basePlan = {
    name: "Plan Flex Mensual",
    planTier: "flex",
    bookingMode: "flexible",
    priceRegular: 15000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: 3,
  };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // Register a fresh member for each test
    const result = await registerUser(app, {
      email: "plans-member@test.com",
      password: "pass123456",
      branchId: 1,
    });
    memberToken = result.token;
  });

  /**
   * Helper: create a program via admin API.
   */
  async function createProgram(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/programs",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Test Program",
        description: null,
        price: 10000,
        durationWeeks: 4,
        sessionsPerWeekToAdvance: 3,
        auraWeeklyBonus: 15,
        auraCompletionBonus: 100,
        contentBlocks: [],
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  /**
   * Helper: create a plan via admin API.
   * For online plans, pass linkedProgramId instead of goalPlanType.
   */
  async function createPlan(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: `${ADMIN_BASE_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  it("returns 401 without auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: MEMBER_URL,
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns active non-archived plans with correct shape", async () => {
    await createPlan({ name: "Plan A" });
    await createPlan({ name: "Plan B" });

    const res = await app.inject({
      method: "GET",
      url: MEMBER_URL,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.plans).toHaveLength(2);

    // Verify response shape — has required fields
    for (const plan of body.plans) {
      expect(plan).toHaveProperty("id");
      expect(plan).toHaveProperty("name");
      expect(plan).toHaveProperty("description");
      expect(plan).toHaveProperty("planTier");
      expect(plan).toHaveProperty("planCategory");
      expect(plan).toHaveProperty("goalPlanType");
      expect(plan).toHaveProperty("goalPlanZones");
    }
  });

  it("does not include price fields in response", async () => {
    await createPlan({ name: "Plan With Price" });

    const res = await app.inject({
      method: "GET",
      url: MEMBER_URL,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.plans.length).toBeGreaterThan(0);

    for (const plan of body.plans) {
      expect(plan).not.toHaveProperty("priceRegular");
      expect(plan).not.toHaveProperty("priceZero");
      expect(plan).not.toHaveProperty("priceCreditCard");
    }
  });

  it("excludes trial plans", async () => {
    await createPlan({ name: "Regular Plan" });
    await createPlan({ name: "Trial Plan", isTrial: true });

    const res = await app.inject({
      method: "GET",
      url: MEMBER_URL,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0].name).toBe("Regular Plan");
  });

  it("includes goalPlanZones for goal plans", async () => {
    const program = await createProgram({
      name: "Tren Superior",
      goalPlanType: "tren_superior",
    });
    await createPlan({
      name: "Goal Plan Tren Superior",
      planCategory: "online_goal",
      linkedProgramId: program.id,
    });

    const res = await app.inject({
      method: "GET",
      url: MEMBER_URL,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const goalPlan = body.plans.find(
      (p: Record<string, unknown>) => p.planCategory === "online_goal",
    );
    expect(goalPlan).toBeDefined();
    expect(goalPlan.goalPlanType).toBe("tren_superior");
    expect(goalPlan.goalPlanZones).toBeInstanceOf(Array);
    expect(goalPlan.goalPlanZones.length).toBeGreaterThan(0);
    expect(goalPlan.goalPlanZones).toContain("Hombros");
  });

  it("sorts presencial plans before online plans", async () => {
    // Create online goal plan first, presencial second — should still sort presencial first
    const empujeProgram = await createProgram({
      name: "Empuje",
      goalPlanType: "empuje",
    });
    await createPlan({
      name: "Goal Plan Empuje",
      planCategory: "online_goal",
      linkedProgramId: empujeProgram.id,
    });
    await createPlan({ name: "Gym Plan" });

    const res = await app.inject({
      method: "GET",
      url: MEMBER_URL,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.plans).toHaveLength(2);
    expect(body.plans[0].planCategory).toBe("presencial");
    expect(body.plans[1].planCategory).toBe("online_goal");
  });

  it("returns goalPlanZones as null for presencial plans", async () => {
    await createPlan({ name: "Gym Plan" });

    const res = await app.inject({
      method: "GET",
      url: MEMBER_URL,
      headers: { authorization: `Bearer ${memberToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.plans[0].goalPlanZones).toBeNull();
  });
});

// ── Fase 157 Plan 04 — Task 3: preview parity del descuento de referido ──
// getPricingPreview debe devolver el mismo finalPrice que el pricePaid que la
// charge-path cobraría (Pitfall 4). Es read-only: NO cualifica ni escribe credits.
describe("Pricing preview — referral discount parity", () => {
  const PLANS_URL = "/api/admin/subscriptions";
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

  async function preview(
    userId: number,
    planId: number,
  ): Promise<Record<string, unknown>> {
    const res = await app.inject({
      method: "GET",
      url: `${PLANS_URL}/members/${userId}/subscription/pricing-preview?planId=${planId}&priceType=regular`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body);
  }

  it("finalPrice del preview === pricePaid del cobro real (socio con vínculo activo)", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
    const referrer = await createMember(app, { email: "pv-r@test.com" });
    const referred = await createMember(app, { email: "pv-d@test.com" });
    await app.db.execute(
      sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel, qualified_at)
          VALUES (${referrer.id}, ${referred.id}, 'qualified', 'assisted', NOW())`,
    );
    await app.db.execute(
      sql`INSERT INTO subscriptions (user_id, plan_id, branch_id, subscription_status, start_date, end_date, price_paid, currency, price_type_applied)
          VALUES (${referred.id}, ${plan.id}, 1, 'active', ${todayStr()}, ${dateOffsetStr(30)}, 10000, 'ARS', 'regular')`,
    );

    const pv = await preview(referrer.id, plan.id as number);
    expect(pv.referralDiscountPercent).toBe(10);
    expect(pv.referralDiscountAmount).toBe(1000);
    expect(pv.finalPrice).toBe(9000);

    // El cobro real al mismo socio/vínculo debe coincidir con el preview.
    const assigned = await assignPlan(app, adminToken, referrer.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    expect(assigned.statusCode).toBe(201);
    expect(assigned.body.pricePaid).toBe(pv.finalPrice);
  });

  it("sin vínculos activos el preview devuelve el precio de lista", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
    const member = await createMember(app, { email: "pv-none@test.com" });

    const pv = await preview(member.id, plan.id as number);
    expect(pv.referralDiscountPercent).toBe(0);
    expect(pv.referralDiscountAmount).toBe(0);
    expect(pv.finalPrice).toBe(10000);
  });

  it("el preview es read-only: no cualifica el vínculo pending del socio", async () => {
    const plan = await createPlan(app, adminToken, { priceRegular: 10000 });
    const referrer = await createMember(app, { email: "pv-ro-r@test.com" });
    const referred = await createMember(app, { email: "pv-ro-d@test.com" });
    await app.db.execute(
      sql`INSERT INTO referrals (referrer_id, referred_id, status, attribution_channel)
          VALUES (${referrer.id}, ${referred.id}, 'pending', 'assisted')`,
    );

    await preview(referred.id, plan.id as number);

    const rows = await app.db.execute(
      sql`SELECT status FROM referrals WHERE referred_id = ${referred.id}`,
    );
    const statuses = (rows[0] as Array<{ status: string }>).map(
      (r) => r.status,
    );
    expect(statuses).toEqual(["pending"]); // el preview NO flippeó
  });
});
