import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { createTestApp, getAuthToken, registerUser } from "../helpers";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { payments } from "../../src/db/schema/payments";
import { users } from "../../src/db/schema/users";
import { auraBalances } from "../../src/db/schema/aura-balances";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { memberNotes } from "../../src/db/schema/member-notes";

const BASE_URL = "/api/admin/subscriptions";

describe("Subscriptions API", () => {
  let app: FastifyInstance;
  let adminToken: string;

  // Reusable plan payload
  const basePlan = {
    name: "Plan Flex Mensual",
    planTier: "flex",
    bookingMode: "flexible",
    priceRegular: 15000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: 3,
  };

  // Reusable member payload
  const baseMember = {
    email: "sub-test-member@test.com",
    password: "pass123456",
    firstName: "Sub",
    lastName: "Tester",
    phone: "+5491100001111",
    dni: "70000001",
    branchId: 1,
  };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Helper: clean up all subscription-related test data.
   */
  async function cleanupSubscriptionData(): Promise<void> {
    // Delete in FK order: payments first, then subscriptions, then plans, then extra users
    await app.db.delete(payments);
    await app.db.delete(subscriptions);
    await app.db.delete(subscriptionPlans);
    await app.db.delete(auraTransactions);
    await app.db.delete(auraBalances);
    await app.db.delete(memberNotes);
    // Reset boarding_pass_used on all users
    await app.db.update(users).set({ boardingPassUsed: false });
    // Delete non-admin test users
    const testUsers = await app.db
      .select({ id: users.id, email: users.email })
      .from(users);
    for (const u of testUsers) {
      if (u.email !== "admin@test.com") {
        await app.db.delete(users).where(eq(users.id, u.id));
      }
    }
  }

  /**
   * Helper: create a plan via API.
   */
  async function createPlan(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  /**
   * Helper: create a member via the members API.
   */
  async function createMember(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/members",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...baseMember, ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  /**
   * Helper: assign a plan to a member.
   */
  async function assignPlan(
    userId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: `${BASE_URL}/members/${userId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: 1, // will be overridden
        branchId: 1,
        startDate: "2026-03-01",
        priceTypeApplied: "regular",
        ...overrides,
      },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  /**
   * Helper: seed AURA balance for a user directly via DB.
   */
  async function seedAuraBalance(
    userId: number,
    amount: number,
  ): Promise<void> {
    await app.db.execute(
      sql`INSERT INTO aura_balances (user_id, balance) VALUES (${userId}, ${amount})
          ON DUPLICATE KEY UPDATE balance = ${amount}`,
    );
  }

  // =========================================================================
  // Plans CRUD
  // =========================================================================
  describe("Plans CRUD", () => {
    beforeEach(async () => {
      await cleanupSubscriptionData();
    });

    it("POST /plans creates a plan and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: basePlan,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("id");
      expect(body.name).toBe(basePlan.name);
      expect(body.planTier).toBe(basePlan.planTier);
      expect(body.bookingMode).toBe(basePlan.bookingMode);
      expect(body.priceRegular).toBe(basePlan.priceRegular);
      expect(body.priceZero).toBe(basePlan.priceZero);
      expect(body.durationDays).toBe(basePlan.durationDays);
      expect(body.classesPerWeek).toBe(basePlan.classesPerWeek);
      expect(body.isActive).toBe(true);
      expect(body.multiBranch).toBe(false);
      expect(body.isTrial).toBe(false);
    });

    it("POST /plans validates required fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Missing fields" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("GET /plans returns list of plans", async () => {
      await createPlan({ name: "Plan A" });
      await createPlan({ name: "Plan B" });

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.plans).toHaveLength(2);
    });

    it("GET /plans?isActive=true filters by active status", async () => {
      const plan = await createPlan({ name: "Active Plan" });
      await createPlan({ name: "To Deactivate" });

      // Deactivate second plan
      await app.inject({
        method: "PATCH",
        url: `${BASE_URL}/plans/${(plan as Record<string, unknown>).id === 1 ? 2 : 1}/deactivate`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // The above logic is fragile. Let's just deactivate the second plan by getting the list first.
      const listRes = await app.inject({
        method: "GET",
        url: `${BASE_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const allPlans = JSON.parse(listRes.body).plans;
      const toDeactivate = allPlans.find(
        (p: Record<string, unknown>) => p.name === "To Deactivate",
      );
      if (toDeactivate) {
        await app.inject({
          method: "PATCH",
          url: `${BASE_URL}/plans/${toDeactivate.id}/deactivate`,
          headers: { authorization: `Bearer ${adminToken}` },
        });
      }

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/plans?isActive=true`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.plans).toHaveLength(1);
      expect(body.plans[0].name).toBe("Active Plan");
    });

    it("GET /plans/:planId returns plan detail", async () => {
      const plan = await createPlan();

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/plans/${plan.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(plan.id);
      expect(body.name).toBe(basePlan.name);
    });

    it("GET /plans/:planId returns 404 for non-existent plan", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/plans/99999`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("PUT /plans/:planId updates plan fields", async () => {
      const plan = await createPlan();

      const res = await app.inject({
        method: "PUT",
        url: `${BASE_URL}/plans/${plan.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Updated Plan", priceRegular: 20000 },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe("Updated Plan");
      expect(body.priceRegular).toBe(20000);
      // Unchanged fields preserved
      expect(body.priceZero).toBe(basePlan.priceZero);
    });

    it("PATCH /plans/:planId/deactivate sets isActive=false", async () => {
      const plan = await createPlan();

      const res = await app.inject({
        method: "PATCH",
        url: `${BASE_URL}/plans/${plan.id}/deactivate`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.isActive).toBe(false);
    });
  });

  // =========================================================================
  // Authorization
  // =========================================================================
  describe("Authorization", () => {
    it("non-admin user gets 403 on plan routes", async () => {
      const { token: memberToken } = await registerUser(app, {
        email: "regular-sub-auth@test.com",
        password: "pass123456",
        branchId: 1,
        firstName: "Regular",
        lastName: "Member",
      });

      const endpoints = [
        { method: "GET" as const, url: `${BASE_URL}/plans` },
        {
          method: "POST" as const,
          url: `${BASE_URL}/plans`,
          payload: basePlan,
        },
        {
          method: "GET" as const,
          url: `${BASE_URL}/members/1/subscription`,
        },
      ];

      for (const ep of endpoints) {
        const res = await app.inject({
          method: ep.method,
          url: ep.url,
          headers: { authorization: `Bearer ${memberToken}` },
          payload: "payload" in ep ? ep.payload : undefined,
        });

        expect(
          res.statusCode,
          `Expected 403 for ${ep.method} ${ep.url}, got ${res.statusCode}`,
        ).toBe(403);
      }
    });
  });

  // =========================================================================
  // Subscription Lifecycle
  // =========================================================================
  describe("Subscription Lifecycle", () => {
    beforeEach(async () => {
      await cleanupSubscriptionData();
    });

    it("POST assign — assigns plan to member with correct dates and pricing", async () => {
      const plan = await createPlan();
      const member = await createMember();

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        priceTypeApplied: "regular",
        startDate: "2026-03-01",
      });

      expect(statusCode).toBe(201);
      expect(body.userId).toBe(member.id);
      expect(body.planId).toBe(plan.id);
      expect(body.planName).toBe(basePlan.name);
      expect(body.status).toBe("active");
      expect(body.startDate).toBe("2026-03-01");
      expect(body.endDate).toBe("2026-03-31"); // 30 days from Mar 1
      expect(body.pricePaid).toBe(basePlan.priceRegular);
      expect(body.priceTypeApplied).toBe("regular");
      expect(body.branchName).toBeTruthy();
    });

    it("POST assign with boardingPass=true uses priceZero", async () => {
      const plan = await createPlan();
      const member = await createMember();

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        boardingPass: true,
        startDate: "2026-03-01",
        priceTypeApplied: "regular",
      });

      expect(statusCode).toBe(201);
      expect(body.pricePaid).toBe(basePlan.priceZero);
      expect(body.boardingPassUsed).toBe(true);
      expect(body.priceTypeApplied).toBe("zero");
    });

    it("POST assign with boardingPass when already used returns 409", async () => {
      const plan = await createPlan();
      const member = await createMember();

      // First assign with boarding pass
      const { statusCode: first } = await assignPlan(member.id, {
        planId: plan.id,
        boardingPass: true,
        startDate: "2026-03-01",
        priceTypeApplied: "regular",
      });
      expect(first).toBe(201);

      // Cancel the subscription so we can attempt another assign
      await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      // Second assign with boarding pass should fail
      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        boardingPass: true,
        startDate: "2026-04-01",
        priceTypeApplied: "regular",
      });

      expect(statusCode).toBe(409);
      expect(body.message).toContain("boarding pass");
    });

    it("POST assign when member already has active sub returns 409", async () => {
      const plan = await createPlan();
      const member = await createMember();

      // First assign
      await assignPlan(member.id, { planId: plan.id });

      // Second assign should fail
      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
      });

      expect(statusCode).toBe(409);
      expect(body.message).toContain("suscripcion activa");
    });

    it("POST assign with AURA discount deducts AURA and applies discount", async () => {
      const plan = await createPlan();
      const member = await createMember();

      // Seed AURA balance
      await seedAuraBalance(member.id, 1000);

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        priceTypeApplied: "regular",
        auraSpend: 1000,
      });

      expect(statusCode).toBe(201);
      expect(body.auraDiscount).toBe(1000);
      expect(body.auraDiscountPercent).toBe(10);
      // 15000 - 10% = 13500
      expect(body.pricePaid).toBe(13500);
    });

    it("POST assign with AURA discount and insufficient balance returns 400", async () => {
      const plan = await createPlan();
      const member = await createMember();

      // No AURA balance seeded (balance = 0)
      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        priceTypeApplied: "regular",
        auraSpend: 1000,
      });

      expect(statusCode).toBe(400);
      expect(body.message).toContain("Insufficient");
    });

    it("POST assign with price override uses custom amount", async () => {
      const plan = await createPlan();
      const member = await createMember();

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        priceOverrideAmount: 5000,
        priceOverrideReason: "Descuento familiar",
      });

      expect(statusCode).toBe(201);
      expect(body.pricePaid).toBe(5000);
      expect(body.priceOverrideAmount).toBe(5000);
      expect(body.priceOverrideReason).toBe("Descuento familiar");
    });

    it("POST assign with price override without reason returns 400", async () => {
      const plan = await createPlan();
      const member = await createMember();

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        priceOverrideAmount: 5000,
        // no priceOverrideReason
      });

      expect(statusCode).toBe(400);
      expect(body.message).toContain("razon");
    });

    it("GET /members/:userId/subscription returns active subscription", async () => {
      const plan = await createPlan();
      const member = await createMember();
      await assignPlan(member.id, { planId: plan.id });

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("active");
      expect(body.planName).toBe(basePlan.name);
      expect(body.branchName).toBeTruthy();
    });

    it("GET /members/:userId/subscription auto-expires past endDate", async () => {
      const plan = await createPlan({ durationDays: 1 });
      const member = await createMember();

      // Assign with a past start date so the end date is also in the past
      await assignPlan(member.id, {
        planId: plan.id,
        startDate: "2025-01-01",
      });

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // No active subscription (it was auto-expired)
      expect(res.statusCode).toBe(404);

      // Verify it shows as expired in history
      const historyRes = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription/history`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(historyRes.statusCode).toBe(200);
      const historyBody = JSON.parse(historyRes.body);
      expect(historyBody.subscriptions).toHaveLength(1);
      expect(historyBody.subscriptions[0].status).toBe("expired");
    });

    it("POST pause changes status to paused", async () => {
      const plan = await createPlan();
      const member = await createMember();
      await assignPlan(member.id, { planId: plan.id });

      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("paused");
      expect(body.pausedAt).toBeTruthy();
    });

    it("POST resume resumes and extends endDate", async () => {
      const plan = await createPlan({ durationDays: 30 });
      const member = await createMember();
      await assignPlan(member.id, {
        planId: plan.id,
        startDate: "2026-03-01",
      });

      // Pause
      await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // Resume (paused for ~0 days so endDate should extend by at least 1 day)
      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/resume`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("active");
      expect(body.resumedAt).toBeTruthy();
      // End date should be on or after the original end date
      expect(body.endDate >= "2026-03-31").toBe(true);
    });

    it("POST cancel cancels subscription", async () => {
      const plan = await createPlan();
      const member = await createMember();
      await assignPlan(member.id, { planId: plan.id });

      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { notes: "Solicitud del alumno" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("cancelled");
      expect(body.cancelledAt).toBeTruthy();
      expect(body.notes).toBe("Solicitud del alumno");
    });

    it("POST cancel on paused subscription works", async () => {
      const plan = await createPlan();
      const member = await createMember();
      await assignPlan(member.id, { planId: plan.id });

      // Pause first
      await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // Cancel paused subscription
      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("cancelled");
    });
  });

  // =========================================================================
  // Pricing Preview
  // =========================================================================
  describe("Pricing Preview", () => {
    beforeEach(async () => {
      await cleanupSubscriptionData();
    });

    it("GET pricing-preview returns base price and boarding pass eligibility", async () => {
      const plan = await createPlan();
      const member = await createMember();

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription/pricing-preview?planId=${plan.id}&priceType=regular`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.basePrice).toBe(basePlan.priceRegular);
      expect(body.finalPrice).toBe(basePlan.priceRegular);
      expect(body.boardingPassEligible).toBe(true);
      expect(body.auraBalance).toBe(0);
      expect(body.discountType).toBe("none");
      expect(body.availableTiers).toHaveLength(0); // No AURA balance
    });

    it("GET pricing-preview shows AURA tiers when member has balance", async () => {
      const plan = await createPlan();
      const member = await createMember();
      await seedAuraBalance(member.id, 2500);

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription/pricing-preview?planId=${plan.id}&priceType=regular&auraSpend=2000`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.auraBalance).toBe(2500);
      expect(body.discountType).toBe("aura");
      expect(body.auraToSpend).toBe(2000);
      // 15000 - 20% = 12000
      expect(body.discountAmount).toBe(3000);
      expect(body.finalPrice).toBe(12000);
      // Tiers available: 500, 1000, 2000 (all <= 2500)
      expect(body.availableTiers).toHaveLength(3);
    });
  });

  // =========================================================================
  // Subscription History
  // =========================================================================
  describe("Subscription History", () => {
    beforeEach(async () => {
      await cleanupSubscriptionData();
    });

    it("GET /members/:userId/subscription/history returns all subscriptions", async () => {
      const plan = await createPlan();
      const member = await createMember();

      // Assign then cancel (use future start date to avoid auto-expire)
      await assignPlan(member.id, {
        planId: plan.id,
        startDate: "2026-06-01",
      });
      await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      // Assign again with a later date
      await assignPlan(member.id, {
        planId: plan.id,
        startDate: "2026-07-01",
      });

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription/history`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.subscriptions).toHaveLength(2);
      // Verify both subscriptions are present with correct statuses
      const startDates = body.subscriptions.map(
        (s: Record<string, unknown>) => s.startDate,
      );
      expect(startDates).toContain("2026-07-01");
      expect(startDates).toContain("2026-06-01");
      // The cancelled one should be the June subscription
      const cancelledSub = body.subscriptions.find(
        (s: Record<string, unknown>) => s.startDate === "2026-06-01",
      );
      expect(cancelledSub.status).toBe("cancelled");
      // The active one should be the July subscription
      const activeSub = body.subscriptions.find(
        (s: Record<string, unknown>) => s.startDate === "2026-07-01",
      );
      expect(activeSub.status).toBe("active");
    });
  });
});
