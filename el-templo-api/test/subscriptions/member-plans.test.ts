import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";

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
   * Helper: create a plan via admin API.
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
    await createPlan({
      name: "Goal Plan Tren Superior",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
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
    await createPlan({
      name: "Goal Plan Empuje",
      planCategory: "online_goal",
      goalPlanType: "empuje",
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
