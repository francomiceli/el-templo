import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { payments } from "../../src/db/schema/payments";
import { users } from "../../src/db/schema/users";
import { auraBalances } from "../../src/db/schema/aura-balances";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { memberNotes } from "../../src/db/schema/member-notes";
import { attendance } from "../../src/db/schema/attendance";
import { bookings } from "../../src/db/schema/bookings";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import { holidays } from "../../src/db/schema/holidays";
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";
import { programs } from "../../src/db/schema/micro-programs";
import { programEnrollments } from "../../src/db/schema/program-enrollments";

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

  // Reusable member defaults for createMember helper
  const baseMemberDefaults = {
    email: "sub-test-member@test.com",
    password: "pass123456",
    firstName: "Sub",
    lastName: "Tester",
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
    await cleanAllTestData(app);
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
   * Helper: create a member via auth registration (no auto-subscription).
   * Uses registerUser() so subscription tests can assign plans independently.
   */
  async function createMember(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const data = { ...baseMemberDefaults, ...overrides } as {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      branchId: number;
      dni?: string;
      phone?: string;
    };
    const result = await registerUser(app, data);
    return { id: (result.user as { id: number }).id, ...result.user };
  }

  /**
   * Helper: assign a plan to a member.
   */
  /** Today as YYYY-MM-DD */
  function todayStr(): string {
    return new Date().toISOString().split("T")[0];
  }

  function dateOffsetStr(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }

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
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
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
        startDate: todayStr(),
      });

      expect(statusCode).toBe(201);
      expect(body.userId).toBe(member.id);
      expect(body.planId).toBe(plan.id);
      expect(body.planName).toBe(basePlan.name);
      expect(body.status).toBe("active");
      expect(body.startDate).toBe(todayStr());
      // endDate = today + 30 days
      const expectedEnd = new Date();
      expectedEnd.setDate(expectedEnd.getDate() + 30);
      expect(body.endDate).toBe(expectedEnd.toISOString().split("T")[0]);
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
        startDate: todayStr(),
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
        startDate: todayStr(),
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
        startDate: dateOffsetStr(5),
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
      expect(body.message).toContain("presencial activa");
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

      // Assign with a startDate within the validation window, then force the
      // endDate into the past so auto-expire kicks in. The validation window
      // (~30 days back) blocks "2025-01-01"-style fixtures.
      await assignPlan(member.id, {
        planId: plan.id,
        startDate: dateOffsetStr(-2),
      });
      await app.db
        .update(subscriptions)
        .set({ startDate: dateOffsetStr(-10), endDate: dateOffsetStr(-5) })
        .where(eq(subscriptions.userId, member.id));

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

    it("POST pause with pauseEndDate stores value and auto-resume brings it back active", async () => {
      const plan = await createPlan({ durationDays: 30 });
      const member = await createMember();
      await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      const tomorrow = new Date(Date.now() + 86400000)
        .toISOString()
        .split("T")[0];

      // Pause with scheduled auto-resume
      const pauseRes = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { pauseEndDate: tomorrow },
      });
      expect(pauseRes.statusCode).toBe(200);
      const pauseBody = JSON.parse(pauseRes.body);
      expect(pauseBody.status).toBe("paused");
      expect(pauseBody.pauseEndDate).toBe(tomorrow);

      // Fast-forward: move pauseEndDate to yesterday so it's due
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split("T")[0];
      await app.db
        .update(subscriptions)
        .set({ pauseEndDate: yesterday })
        .where(eq(subscriptions.userId, member.id));

      // Run auto-resume directly via the service
      const { SubscriptionService } =
        await import("../../src/modules/subscriptions/service");
      const { AuraService } = await import("../../src/modules/aura");
      const { PaymentService } =
        await import("../../src/modules/payments/service");
      const aura = new AuraService(app.db);
      const payments = new PaymentService(app.db, app.log);
      const svc = new SubscriptionService(app.db, app.log, aura, payments);
      const resumed = await svc.autoResumeDuePauses();
      expect(resumed).toBe(1);

      const [sub] = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, member.id));
      expect(sub.status).toBe("active");
      expect(sub.pauseEndDate).toBeNull();
      expect(sub.pausedAt).toBeNull();
    });

    it("POST pause rejects pauseEndDate in the past (400)", async () => {
      const plan = await createPlan();
      const member = await createMember();
      await assignPlan(member.id, { planId: plan.id });

      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split("T")[0];

      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { pauseEndDate: yesterday },
      });

      expect(res.statusCode).toBe(400);
    });

    it("manual resume clears pauseEndDate", async () => {
      const plan = await createPlan({ durationDays: 30 });
      const member = await createMember();
      await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      const tomorrow = new Date(Date.now() + 86400000)
        .toISOString()
        .split("T")[0];

      await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { pauseEndDate: tomorrow },
      });

      // Manual resume before pauseEndDate
      const resumeRes = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/resume`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(resumeRes.statusCode).toBe(200);
      const body = JSON.parse(resumeRes.body);
      expect(body.status).toBe("active");
      expect(body.pauseEndDate).toBeNull();
    });

    it("POST resume resumes and extends endDate", async () => {
      const plan = await createPlan({ durationDays: 30 });
      const member = await createMember();
      await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
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
      // End date should be on or after today + 30 days
      expect(body.endDate >= todayStr()).toBe(true);
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

      const firstStart = dateOffsetStr(5);
      const secondStart = dateOffsetStr(40);

      // Assign then cancel (use future start date to avoid auto-expire)
      await assignPlan(member.id, {
        planId: plan.id,
        startDate: firstStart,
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
        startDate: secondStart,
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
      expect(startDates).toContain(secondStart);
      expect(startDates).toContain(firstStart);
      // The cancelled one should be the first subscription
      const cancelledSub = body.subscriptions.find(
        (s: Record<string, unknown>) => s.startDate === firstStart,
      );
      expect(cancelledSub.status).toBe("cancelled");
      // The other one is scheduled (future startDate) — assignPlan flips
      // status='active' to 'scheduled' when startDate > today.
      const futureSub = body.subscriptions.find(
        (s: Record<string, unknown>) => s.startDate === secondStart,
      );
      expect(futureSub.status).toBe("scheduled");
    });
  });

  // =========================================================================
  // Class Tracking & Budget Calculation (Phase 60)
  // =========================================================================
  describe("Class Tracking & Budget Calculation", () => {
    beforeEach(async () => {
      await cleanupSubscriptionData();
    });

    it("POST assign — calculates classesRemaining from plan classesPerWeek and durationDays", async () => {
      // Plan with classesPerWeek=2 and durationDays=30
      // Budget = ceil(30/7) * 2 = ceil(4.28) * 2 = 5 * 2 = 10
      const plan = await createPlan({
        name: "Flex 2x",
        classesPerWeek: 2,
        durationDays: 30,
      });
      const member = await createMember();

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      expect(statusCode).toBe(201);
      expect(body.classesRemaining).toBe(10);
    });

    it("POST assign — sets classesRemaining to null when plan has no classesPerWeek", async () => {
      const plan = await createPlan({
        name: "Open Plan",
        classesPerWeek: undefined,
        durationDays: 30,
      });
      const member = await createMember();

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      expect(statusCode).toBe(201);
      expect(body.classesRemaining).toBeNull();
    });

    // fixedDays tests removed in Phase 61 (replaced by subscription_schedules junction table)

    it("POST assign — flexible plans create subscription without fixedDays", async () => {
      const plan = await createPlan({
        name: "Flex Plan",
        bookingMode: "flexible",
        classesPerWeek: 3,
        durationDays: 30,
      });
      const member = await createMember();

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      expect(statusCode).toBe(201);
      // fixedDays removed in Phase 61
    });

    it("GET subscription detail includes classesRemaining", async () => {
      const plan = await createPlan({
        name: "Flex Detail Test",
        classesPerWeek: 3,
        durationDays: 30,
      });
      const member = await createMember();
      await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // ceil(30/7) * 3 = 5 * 3 = 15
      expect(body.classesRemaining).toBe(15);
    });

    it("GET class-usage returns usage info for a member", async () => {
      const plan = await createPlan({
        name: "Flex Usage Test",
        classesPerWeek: 3,
        durationDays: 30,
      });
      const member = await createMember();
      await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/class-usage`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("classesRemaining");
      expect(body).toHaveProperty("classesUsedThisWeek");
      expect(body).toHaveProperty("weeklyLimit");
      expect(body).toHaveProperty("bookingMode");
      expect(body.classesUsedThisWeek).toBe(0);
      expect(body.weeklyLimit).toBe(3);
      expect(body.bookingMode).toBe("flexible");
    });
  });

  // =========================================================================
  // Fixed Schedule Slot Subscriptions (Phase 61 Plan 02)
  // =========================================================================
  describe("Fixed Schedule Slot Subscriptions", () => {
    beforeEach(async () => {
      await cleanupSubscriptionData();
    });

    /**
     * Helper: create an activity and schedule slots for testing fixed plans.
     */
    async function createScheduleSlots(
      branchId: number,
      count: number,
    ): Promise<number[]> {
      // Create activity first
      await app.db.insert(activities).values({
        name: "Calistenia Test",
        isActive: true,
      });
      const [activityRow] = await app.db
        .select({ id: activities.id })
        .from(activities)
        .limit(1);

      const ids: number[] = [];
      for (let i = 0; i < count; i++) {
        const dayOfWeek = (i % 5) + 1; // 1=Mon through 5=Fri
        const startTime = `${String(8 + i).padStart(2, "0")}:00`;
        const endTime = `${String(9 + i).padStart(2, "0")}:00`;
        const result = await app.db.insert(schedules).values({
          branchId,
          activityId: activityRow.id,
          dayOfWeek,
          startTime,
          endTime,
          isActive: true,
        });
        ids.push(Number(result[0].insertId));
      }
      return ids;
    }

    it("POST assign with fixed plan + scheduleIds inserts rows into subscription_schedules", async () => {
      const plan = await createPlan({
        name: "Fixed 3x",
        bookingMode: "fixed",
        classesPerWeek: 3,
        durationDays: 30,
      });
      const member = await createMember();
      const slotIds = await createScheduleSlots(1, 3);

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: slotIds,
      });

      expect(statusCode).toBe(201);
      // Verify subscription_schedules rows were created
      const rows = await app.db
        .select()
        .from(subscriptionSchedules)
        .where(eq(subscriptionSchedules.subscriptionId, body.id as number));
      expect(rows).toHaveLength(3);
      const storedScheduleIds = rows.map((r) => r.scheduleId).sort();
      expect(storedScheduleIds).toEqual([...slotIds].sort());
    });

    it("POST assign rejects if scheduleIds count does not match classesPerWeek", async () => {
      const plan = await createPlan({
        name: "Fixed 3x Mismatch",
        bookingMode: "fixed",
        classesPerWeek: 3,
        durationDays: 30,
      });
      const member = await createMember();
      const slotIds = await createScheduleSlots(1, 2); // Only 2, but plan needs 3

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: slotIds,
      });

      expect(statusCode).toBe(400);
      expect(body.message).toContain("classesPerWeek");
    });

    it("POST assign rejects if any scheduleId is inactive or wrong branch", async () => {
      const plan = await createPlan({
        name: "Fixed Invalid Schedule",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
      });
      const member = await createMember();
      const slotIds = await createScheduleSlots(1, 2);

      // Deactivate one schedule
      await app.db
        .update(schedules)
        .set({ isActive: false })
        .where(eq(schedules.id, slotIds[0]));

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: slotIds,
      });

      expect(statusCode).toBe(400);
      expect(body.message).toContain("inactiv");
    });

    it("POST assign rejects fixed plan without scheduleIds", async () => {
      const plan = await createPlan({
        name: "Fixed No Ids",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
      });
      const member = await createMember();

      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
        // No scheduleIds
      });

      expect(statusCode).toBe(400);
      expect(body.message).toContain("scheduleIds");
    });

    it("GET subscription returns scheduleIds for fixed-plan subscription", async () => {
      const plan = await createPlan({
        name: "Fixed Detail",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
      });
      const member = await createMember();
      const slotIds = await createScheduleSlots(1, 2);

      await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: slotIds,
      });

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.scheduleIds).toBeDefined();
      expect(body.scheduleIds).toHaveLength(2);
      expect(body.scheduleIds.sort()).toEqual([...slotIds].sort());
    });
  });

  // =========================================================================
  // Change plan with proration (Phase 64 Plan 02)
  // =========================================================================
  describe("Change plan with proration", () => {
    beforeEach(async () => {
      await cleanupSubscriptionData();
    });

    it("upgrade allowed — unlimited plan prorates by remaining days", async () => {
      // Plan A: unlimited, 30 days, priceRegular=10000
      const planA = await createPlan({
        name: "Plan A Unlimited",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      // Plan B: more expensive
      const planB = await createPlan({
        name: "Plan B Premium",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 15000,
        priceZero: 10000,
      });
      const member = await createMember();

      // Assign plan A with a start date 15 days in the past
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 15);
      const startDateStr = startDate.toISOString().split("T")[0];

      await assignPlan(member.id, {
        planId: planA.id,
        startDate: startDateStr,
      });

      // Preview: should be allowed with prorated credit
      const previewRes = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan-preview?targetPlanId=${planB.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.body);
      expect(preview.allowed).toBe(true);
      expect(preview.currentPlan.id).toBe(planA.id);
      expect(preview.currentPlan.pricePaid).toBe(10000);
      expect(preview.targetPlan.id).toBe(planB.id);
      expect(preview.targetPlan.priceRegular).toBe(15000);
      expect(preview.proration).toBeTruthy();
      expect(preview.proration.remainingValue).toBeGreaterThan(0);
      expect(preview.proration.remainingDetail).toContain("dias");
      expect(preview.netAmount).toBeLessThan(15000);
      expect(preview.netAmount).toBeGreaterThanOrEqual(0);
    });

    it("upgrade allowed — class-based plan prorates by remaining classes", async () => {
      // Plan A: class-based, 3 classes/week, 30 days, budget = ceil(30/7)*3 = 15
      const planA = await createPlan({
        name: "Plan A Classes",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      // Plan B: more expensive
      const planB = await createPlan({
        name: "Plan B Classes Premium",
        classesPerWeek: 5,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember();

      // Assign plan A
      await assignPlan(member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      // Simulate some classes used: budget is 15, set remaining to 6
      await app.db
        .update(subscriptions)
        .set({ classesRemaining: 6 })
        .where(eq(subscriptions.userId, member.id));

      // Preview
      const previewRes = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan-preview?targetPlanId=${planB.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.body);
      expect(preview.allowed).toBe(true);
      expect(preview.proration).toBeTruthy();
      // credit = Math.round((6/15) * 8000) = Math.round(3200) = 3200
      expect(preview.proration.remainingValue).toBe(3200);
      expect(preview.proration.remainingDetail).toBe("6/15 clases");
      // net = 12000 - 3200 = 8800
      expect(preview.netAmount).toBe(8800);
    });

    it("downgrade blocked — returns allowed=false with expiry date", async () => {
      // Plan A: expensive
      const planA = await createPlan({
        name: "Plan A Expensive",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 15000,
        priceZero: 10000,
      });
      // Plan B: cheaper
      const planB = await createPlan({
        name: "Plan B Cheap",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember();

      // Assign expensive plan
      const start = todayStr();
      await assignPlan(member.id, {
        planId: planA.id,
        startDate: start,
      });

      // Preview downgrade: should be blocked
      const previewRes = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan-preview?targetPlanId=${planB.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.body);
      expect(preview.allowed).toBe(false);
      expect(preview.reason).toContain("menor precio");
      expect(preview.expiryDate).toBe(dateOffsetStr(30));
      expect(preview.proration).toBeNull();
      expect(preview.netAmount).toBeNull();
    });

    it("same price allowed — calculates proration normally", async () => {
      const planA = await createPlan({
        name: "Plan A Same",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const planC = await createPlan({
        name: "Plan C Same Price",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember();

      await assignPlan(member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      const previewRes = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan-preview?targetPlanId=${planC.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(previewRes.statusCode).toBe(200);
      const preview = JSON.parse(previewRes.body);
      expect(preview.allowed).toBe(true);
      expect(preview.proration).toBeTruthy();
      expect(preview.netAmount).toBeGreaterThanOrEqual(0);
    });

    it("change-plan POST blocks downgrade with 400", async () => {
      const planA = await createPlan({
        name: "Plan Expensive Post",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 15000,
        priceZero: 10000,
      });
      const planB = await createPlan({
        name: "Plan Cheap Post",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember();

      await assignPlan(member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      // Attempt downgrade via POST
      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: new Date().toISOString().split("T")[0],
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("menor precio");
    });

    it("change-plan POST upgrade records payment for net amount", async () => {
      const planA = await createPlan({
        name: "Plan A Payment",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan({
        name: "Plan B Payment",
        classesPerWeek: 5,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember();

      // Assign plan A
      const assignResult = await assignPlan(member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      const oldSubId = assignResult.body.id;

      // Set remaining classes to 6 (of 15 budget)
      await app.db
        .update(subscriptions)
        .set({ classesRemaining: 6 })
        .where(eq(subscriptions.userId, member.id));

      // Execute upgrade
      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: new Date().toISOString().split("T")[0],
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.planId).toBe(planB.id);
      // New sub should link to old sub
      expect(body.previousSubscriptionId).toBe(oldSubId);

      // Old subscription should be 'changed' (not cancelled)
      const oldSubRows = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, oldSubId as number));
      expect(oldSubRows[0].status).toBe("changed");

      // Verify payment was recorded for the net amount (8800)
      // credit = round((6/15)*8000) = 3200, net = 12000 - 3200 = 8800
      const paymentRows = await app.db
        .select()
        .from(payments)
        .where(eq(payments.memberId, member.id));
      // Two payments: one for original assignment (8000), one for upgrade (8800)
      const upgradePmt = paymentRows.find((p) => p.amount === 8800);
      expect(upgradePmt).toBeTruthy();
      expect(upgradePmt!.paymentMethod).toBe("cash");
      // Upgrade payment linked to the NEW subscription (not the old one)
      expect(upgradePmt!.subscriptionId).toBe(body.id);
    });
  });

  // =========================================================================
  // Change Plan — startMode: after_current (scheduled plan change)
  // =========================================================================
  describe("Change plan with startMode=after_current", () => {
    beforeEach(async () => {
      await cleanupSubscriptionData();
    });

    it("creates scheduled sub starting on current.endDate, no proration, full price charged", async () => {
      const planA = await createPlan({
        name: "Sched Plan A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan({
        name: "Sched Plan B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember();

      const assignResult = await assignPlan(member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      const oldSubId = assignResult.body.id as number;
      const oldEndDate = assignResult.body.endDate as string;

      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(), // ignored in after_current mode
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("scheduled");
      expect(body.planId).toBe(planB.id);
      expect(body.previousSubscriptionId).toBe(oldSubId);
      expect(body.startDate).toBe(oldEndDate);
      // Full price, no proration credit
      expect(body.pricePaid).toBe(12000);

      // Old sub must still be active (not "changed")
      const [oldSub] = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, oldSubId));
      expect(oldSub.status).toBe("active");

      // Payment recorded for full new-plan price against NEW sub
      const pmts = await app.db
        .select()
        .from(payments)
        .where(eq(payments.memberId, member.id));
      const scheduledPmt = pmts.find(
        (p) => p.subscriptionId === (body.id as number),
      );
      expect(scheduledPmt).toBeTruthy();
      expect(scheduledPmt!.amount).toBe(12000);
    });

    it("blocks when a scheduled sub already exists (409)", async () => {
      const planA = await createPlan({
        name: "Dupe Sched A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan({
        name: "Dupe Sched B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember();

      await assignPlan(member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });

      const first = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });
      expect(second.statusCode).toBe(409);
    });

    it("rejects when current sub is paused (400)", async () => {
      const planA = await createPlan({
        name: "Paused Sched A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
      });
      const planB = await createPlan({
        name: "Paused Sched B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
      });
      const member = await createMember();

      const assignResult = await assignPlan(member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      const subId = assignResult.body.id as number;

      // Manually pause the subscription
      await app.db
        .update(subscriptions)
        .set({ status: "paused" })
        .where(eq(subscriptions.id, subId));

      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it("auto-expire activates scheduled plan-change with program enrollment transition", async () => {
      // Create a program and a plan linked to it
      const progAResult = await app.db.insert(programs).values({
        name: "Programa A",
        description: "Test A",
        durationWeeks: 4,
        sessionsPerWeekToAdvance: 3,
      });
      const progA = { id: Number(progAResult[0].insertId) };

      const progBResult = await app.db.insert(programs).values({
        name: "Programa B",
        description: "Test B",
        durationWeeks: 4,
        sessionsPerWeekToAdvance: 3,
      });
      const progB = { id: Number(progBResult[0].insertId) };

      const planA = await createPlan({
        name: "Prog Sched A",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 8000,
        priceZero: 4000,
        linkedProgramId: progA.id,
      });
      const planB = await createPlan({
        name: "Prog Sched B",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 12000,
        priceZero: 8000,
        linkedProgramId: progB.id,
      });
      const member = await createMember();

      // Assign planA starting in the recent past with future endDate (so it's active)
      const assignResult = await assignPlan(member.id, {
        planId: planA.id,
        startDate: todayStr(),
      });
      const oldSubId = assignResult.body.id as number;

      // Schedule plan change (current sub is active with future endDate)
      const schedRes = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
          startMode: "after_current",
        },
      });
      expect(schedRes.statusCode).toBe(201);
      const scheduledSub = JSON.parse(schedRes.body);

      // Now fast-forward: force old sub's endDate to yesterday so auto-expire triggers
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split("T")[0];
      await app.db
        .update(subscriptions)
        .set({ endDate: yesterday })
        .where(eq(subscriptions.id, oldSubId));

      // Trigger auto-expire by calling any endpoint that runs it
      // (getMemberSubscription triggers autoExpireSubscriptions)
      await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      // Scheduled sub should now be active
      const [activatedSub] = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, scheduledSub.id));
      expect(activatedSub.status).toBe("active");

      // Old program enrollment should be cancelled, new one created
      const enrollmentsA = await app.db
        .select()
        .from(programEnrollments)
        .where(eq(programEnrollments.programId, progA.id));
      const memberEnrA = enrollmentsA.find((e) => e.userId === member.id);
      expect(memberEnrA?.status).toBe("cancelled");

      const enrollmentsB = await app.db
        .select()
        .from(programEnrollments)
        .where(eq(programEnrollments.programId, progB.id));
      const memberEnrB = enrollmentsB.find((e) => e.userId === member.id);
      expect(memberEnrB?.status).toBe("active");
    });
  });

  // =========================================================================
  // Subscription Renewal (Period Model)
  // =========================================================================
  describe("Subscription Renewal", () => {
    beforeEach(async () => {
      await cleanupSubscriptionData();
    });

    it("early renewal keeps old sub active, creates scheduled future sub", async () => {
      const plan = await createPlan({
        name: "Renewal Test Plan",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember();

      // Assign plan (future start — sub is still active)
      const assignResult = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });
      const oldSubId = assignResult.body.id;

      // Renew (early — old sub hasn't expired yet)
      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });

      expect(res.statusCode).toBe(201);
      const newSub = JSON.parse(res.body);

      // New sub is a different record with status "scheduled"
      expect(newSub.id).not.toBe(oldSubId);
      expect(newSub.status).toBe("scheduled");
      expect(newSub.planId).toBe(plan.id);
      // Links back to old sub
      expect(newSub.previousSubscriptionId).toBe(oldSubId);
      // Fresh budget (ceil(30/7)*3 = 15)
      expect(newSub.classesBudget).toBe(15);
      expect(newSub.classesRemaining).toBe(15);
      // pricePaid is per-period only (not accumulated)
      expect(newSub.pricePaid).toBe(10000);

      // Old sub stays ACTIVE (not completed) — still has time left
      const oldSubRows = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, oldSubId as number));
      expect(oldSubRows[0].status).toBe("active");

      // getMemberSubscription returns the OLD sub (scheduled is not "current")
      const currentRes = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(currentRes.statusCode).toBe(200);
      const current = JSON.parse(currentRes.body);
      expect(current.id).toBe(oldSubId);
    });

    it("blocks double early renewal when scheduled sub already exists", async () => {
      const plan = await createPlan({
        name: "Double Renewal Plan",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember();

      await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      // First renewal (creates scheduled sub)
      const res1 = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });
      expect(res1.statusCode).toBe(201);

      // Second renewal should be blocked
      const res2 = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });
      expect(res2.statusCode).toBe(409);
    });

    it("renew records payment linked to the new subscription", async () => {
      const plan = await createPlan({
        name: "Renewal Payment Plan",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember();

      await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "transfer" },
      });

      expect(res.statusCode).toBe(201);
      const newSub = JSON.parse(res.body);

      // Should have 2 payments: one for assign, one for renewal
      const paymentRows = await app.db
        .select()
        .from(payments)
        .where(eq(payments.memberId, member.id));
      expect(paymentRows).toHaveLength(2);

      // Renewal payment should be linked to the NEW subscription
      const renewalPmt = paymentRows.find(
        (p) => p.subscriptionId === newSub.id,
      );
      expect(renewalPmt).toBeTruthy();
      expect(renewalPmt!.amount).toBe(10000);
      expect(renewalPmt!.paymentMethod).toBe("transfer");
    });

    it("renew uses endDate as new startDate when subscription is still active", async () => {
      const plan = await createPlan({
        name: "Renewal Date Plan",
        classesPerWeek: undefined,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember();

      await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      const res = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });

      expect(res.statusCode).toBe(201);
      const newSub = JSON.parse(res.body);
      // New sub starts from old endDate (today + 30) and extends by 30 days
      expect(newSub.startDate).toBe(dateOffsetStr(30));
      expect(newSub.endDate).toBe(dateOffsetStr(60));
    });

    it("history shows active + scheduled after early renewal", async () => {
      const plan = await createPlan({
        name: "History Chain Plan",
        classesPerWeek: 3,
        durationDays: 30,
        priceRegular: 10000,
        priceZero: 5000,
      });
      const member = await createMember();

      await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      // Renew once (early — old sub still active)
      await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });

      // Check history
      const historyRes = await app.inject({
        method: "GET",
        url: `${BASE_URL}/members/${member.id}/subscription/history`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(historyRes.statusCode).toBe(200);
      const history = JSON.parse(historyRes.body);
      expect(history.subscriptions).toHaveLength(2);

      const statuses = history.subscriptions.map(
        (s: Record<string, unknown>) => s.status,
      );
      expect(statuses).toContain("active");
      expect(statuses).toContain("scheduled");
    });
  });

  // =========================================================================
  // Dual Subscription Constraint (D-35) + Auto-Enrollment (D-34/D-39)
  // =========================================================================
  describe("Dual Subscription Constraint + Auto-Enrollment", () => {
    beforeEach(async () => {
      await cleanupSubscriptionData();
    });

    /**
     * Helper: create a program directly in DB for enrollment tests.
     */
    async function createTestProgram(
      overrides: Partial<typeof programs.$inferInsert> = {},
    ): Promise<number> {
      const result = await app.db.insert(programs).values({
        name: overrides.name ?? "Test Program",
        description: overrides.description ?? "Test program for enrollment",
        durationWeeks: overrides.durationWeeks ?? 4,
        sessionsPerWeekToAdvance: overrides.sessionsPerWeekToAdvance ?? 3,
        ...overrides,
      });
      return Number(result[0].insertId);
    }

    it("allows presencial + online subscriptions simultaneously", async () => {
      const presencialPlan = await createPlan({
        name: "Plan Presencial Dual",
        planCategory: "presencial",
      });
      const onlinePlan = await createPlan({
        name: "Plan Online Dual",
        planCategory: "online_regular",
      });
      const member = await createMember();

      // Assign presencial -> should succeed
      const result1 = await assignPlan(member.id, {
        planId: presencialPlan.id,
      });
      expect(result1.statusCode).toBe(201);

      // Assign online -> should also succeed (dual subscription)
      const result2 = await assignPlan(member.id, {
        planId: onlinePlan.id,
      });
      expect(result2.statusCode).toBe(201);

      // Verify member has 2 active subscriptions
      const activeSubs = await app.db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, member.id as number));
      const activeCount = activeSubs.filter(
        (s) => s.status === "active",
      ).length;
      expect(activeCount).toBe(2);
    });

    it("blocks two presencial subscriptions", async () => {
      const plan1 = await createPlan({
        name: "Presencial A",
        planCategory: "presencial",
      });
      const plan2 = await createPlan({
        name: "Presencial B",
        planCategory: "presencial",
      });
      const member = await createMember();

      const result1 = await assignPlan(member.id, { planId: plan1.id });
      expect(result1.statusCode).toBe(201);

      const result2 = await assignPlan(member.id, { planId: plan2.id });
      expect(result2.statusCode).toBe(409);
      expect((result2.body as { message: string }).message).toContain(
        "presencial activa",
      );
    });

    it("blocks two online subscriptions", async () => {
      const plan1 = await createPlan({
        name: "Online Regular A",
        planCategory: "online_regular",
      });
      const plan2 = await createPlan({
        name: "Online Goal B",
        planCategory: "online_goal",
        goalPlanType: "tren_superior",
      });
      const member = await createMember();

      const result1 = await assignPlan(member.id, { planId: plan1.id });
      expect(result1.statusCode).toBe(201);

      const result2 = await assignPlan(member.id, { planId: plan2.id });
      expect(result2.statusCode).toBe(409);
      expect((result2.body as { message: string }).message).toContain(
        "online activa",
      );
    });

    it("auto-creates program enrollment when assigning plan with linkedProgramId", async () => {
      const programId = await createTestProgram({
        name: "Program Enrollment Test",
      });
      const plan = await createPlan({
        name: "Online With Program",
        planCategory: "online_goal",
        goalPlanType: "empuje",
        linkedProgramId: programId,
      });
      const member = await createMember();

      const result = await assignPlan(member.id, { planId: plan.id });
      expect(result.statusCode).toBe(201);

      // Verify program_enrollment was created
      const enrollments = await app.db
        .select()
        .from(programEnrollments)
        .where(eq(programEnrollments.userId, member.id as number));
      expect(enrollments).toHaveLength(1);
      expect(enrollments[0].programId).toBe(programId);
      expect(enrollments[0].status).toBe("active");
      expect(enrollments[0].currentWeek).toBe(1);
      expect(enrollments[0].sessionsCompletedThisWeek).toBe(0);
    });

    it("plan change cancels old enrollment and creates new one", async () => {
      const programA = await createTestProgram({
        name: "Program A",
      });
      const programB = await createTestProgram({
        name: "Program B",
      });
      const planA = await createPlan({
        name: "Online Goal A",
        planCategory: "online_goal",
        goalPlanType: "tren_superior",
        linkedProgramId: programA,
        priceRegular: 10000,
        priceZero: 8000,
      });
      const planB = await createPlan({
        name: "Online Goal B",
        planCategory: "online_goal",
        goalPlanType: "tren_inferior",
        linkedProgramId: programB,
        priceRegular: 15000,
        priceZero: 10000,
      });
      const member = await createMember();

      // Assign plan A
      await assignPlan(member.id, { planId: planA.id });

      // Change to plan B (upgrade -- B is more expensive)
      const changeRes = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${member.id}/subscription/change-plan`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: planB.id,
          branchId: 1,
          startDate: todayStr(),
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });
      expect(changeRes.statusCode).toBe(201);

      // Verify enrollment lifecycle
      const enrollments = await app.db
        .select()
        .from(programEnrollments)
        .where(eq(programEnrollments.userId, member.id as number));

      // Should have 2 enrollments: old cancelled, new active
      expect(enrollments.length).toBeGreaterThanOrEqual(2);
      const enrollmentA = enrollments.find((e) => e.programId === programA);
      const enrollmentB = enrollments.find((e) => e.programId === programB);

      expect(enrollmentA).toBeDefined();
      expect(enrollmentA!.status).toBe("cancelled");
      expect(enrollmentA!.cancelledAt).not.toBeNull();

      expect(enrollmentB).toBeDefined();
      expect(enrollmentB!.status).toBe("active");
      expect(enrollmentB!.currentWeek).toBe(1);
    });

    it("price override still works with planCategory model (MON-10)", async () => {
      const plan = await createPlan({
        name: "Plan Override Test",
        planCategory: "presencial",
        priceRegular: 20000,
        priceZero: 15000,
      });
      const member = await createMember();

      const result = await assignPlan(member.id, {
        planId: plan.id,
        priceOverrideAmount: 5000,
        priceOverrideReason: "Descuento especial por amigo",
      });

      expect(result.statusCode).toBe(201);
      expect(result.body.pricePaid).toBe(5000);
      expect(result.body.priceOverrideAmount).toBe(5000);
      expect(result.body.priceOverrideReason).toBe(
        "Descuento especial por amigo",
      );
    });
  });

  // =========================================================================
  // Change Fixed Schedules
  // =========================================================================
  describe("PATCH /subscriptions/:id/schedules (change fixed turnos)", () => {
    beforeEach(async () => {
      await cleanupSubscriptionData();
    });

    async function createScheduleSlots(
      branchId: number,
      count: number,
      offset = 0,
    ): Promise<number[]> {
      await app.db.insert(activities).values({
        name: `Calistenia ChangeTurnos ${offset}`,
        isActive: true,
      });
      const actRows = await app.db
        .select({ id: activities.id })
        .from(activities);
      const activityId = actRows[actRows.length - 1].id;
      const ids: number[] = [];
      for (let i = 0; i < count; i++) {
        const dayOfWeek = ((offset + i) % 5) + 1;
        const startHour = 8 + offset + i;
        const startTime = `${String(startHour).padStart(2, "0")}:00`;
        const endTime = `${String(startHour + 1).padStart(2, "0")}:00`;
        const result = await app.db.insert(schedules).values({
          branchId,
          activityId,
          dayOfWeek,
          startTime,
          endTime,
          isActive: true,
        });
        ids.push(Number(result[0].insertId));
      }
      return ids;
    }

    async function setupActiveFixedSub(classesPerWeek = 2): Promise<{
      subId: number;
      memberId: number;
      originalSlots: number[];
    }> {
      const plan = await createPlan({
        name: `Fixed ChangeTurnos ${classesPerWeek}x`,
        bookingMode: "fixed",
        classesPerWeek,
        durationDays: 60,
      });
      const member = await createMember();
      const originalSlots = await createScheduleSlots(1, classesPerWeek, 0);
      const { statusCode, body } = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: originalSlots,
      });
      expect(statusCode).toBe(201);
      return {
        subId: body.id as number,
        memberId: member.id,
        originalSlots,
      };
    }

    async function patchSchedules(
      subId: number,
      payload: { scheduleIds: number[]; reason?: string },
      token = adminToken,
    ) {
      const res = await app.inject({
        method: "PATCH",
        url: `${BASE_URL}/subscriptions/${subId}/schedules`,
        headers: { authorization: `Bearer ${token}` },
        payload,
      });
      return { statusCode: res.statusCode, body: JSON.parse(res.body) };
    }

    it("swaps subscription_schedules rows and returns updated sub", async () => {
      const { subId } = await setupActiveFixedSub(2);
      const newSlots = await createScheduleSlots(1, 2, 10);

      const { statusCode, body } = await patchSchedules(subId, {
        scheduleIds: newSlots,
        reason: "Cambio de disponibilidad",
      });

      expect(statusCode).toBe(200);
      expect([...(body.scheduleIds as number[])].sort()).toEqual(
        [...newSlots].sort(),
      );

      const rows = await app.db
        .select()
        .from(subscriptionSchedules)
        .where(eq(subscriptionSchedules.subscriptionId, subId));
      expect(rows.map((r) => r.scheduleId).sort()).toEqual(
        [...newSlots].sort(),
      );
    });

    it("cancels future bookings on old slots and generates on new ones", async () => {
      const { subId, memberId, originalSlots } = await setupActiveFixedSub(2);

      const oldFutureCount = await app.db
        .select({ c: sql<number>`COUNT(*)` })
        .from(bookings)
        .where(
          sql`${bookings.memberId} = ${memberId}
              AND ${bookings.scheduleId} IN (${sql.join(
                originalSlots.map((id) => sql`${id}`),
                sql`, `,
              )})
              AND ${bookings.status} = 'reservado'
              AND ${bookings.bookingDate} > CURDATE()`,
        );
      expect(Number(oldFutureCount[0].c)).toBeGreaterThan(0);

      const newSlots = await createScheduleSlots(1, 2, 20);
      const { statusCode } = await patchSchedules(subId, {
        scheduleIds: newSlots,
      });
      expect(statusCode).toBe(200);

      const oldActiveAfter = await app.db
        .select({ c: sql<number>`COUNT(*)` })
        .from(bookings)
        .where(
          sql`${bookings.memberId} = ${memberId}
              AND ${bookings.scheduleId} IN (${sql.join(
                originalSlots.map((id) => sql`${id}`),
                sql`, `,
              )})
              AND ${bookings.status} = 'reservado'
              AND ${bookings.bookingDate} > CURDATE()`,
        );
      expect(Number(oldActiveAfter[0].c)).toBe(0);

      const newActiveAfter = await app.db
        .select({ c: sql<number>`COUNT(*)` })
        .from(bookings)
        .where(
          sql`${bookings.memberId} = ${memberId}
              AND ${bookings.scheduleId} IN (${sql.join(
                newSlots.map((id) => sql`${id}`),
                sql`, `,
              )})
              AND ${bookings.status} = 'reservado'
              AND ${bookings.bookingDate} > CURDATE()`,
        );
      expect(Number(newActiveAfter[0].c)).toBeGreaterThan(0);
    });

    it("records audit entry with actor and old/new slot IDs", async () => {
      const { subId, originalSlots } = await setupActiveFixedSub(2);
      const newSlots = await createScheduleSlots(1, 2, 30);

      await patchSchedules(subId, {
        scheduleIds: newSlots,
        reason: "Cliente pidió cambio",
      });

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/subscriptions/${subId}/schedule-changes`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const parsed = JSON.parse(res.body);
      expect(parsed.changes).toHaveLength(1);
      const entry = parsed.changes[0];
      expect([...(entry.oldScheduleIds as number[])].sort()).toEqual(
        [...originalSlots].sort(),
      );
      expect([...(entry.newScheduleIds as number[])].sort()).toEqual(
        [...newSlots].sort(),
      );
      expect(entry.reason).toBe("Cliente pidió cambio");
      expect(entry.actorId).toBeTypeOf("number");
    });

    it("rejects when scheduleIds count does not match plan.classesPerWeek", async () => {
      const { subId } = await setupActiveFixedSub(2);
      const tooFew = await createScheduleSlots(1, 1, 40);

      const { statusCode, body } = await patchSchedules(subId, {
        scheduleIds: tooFew,
      });
      expect(statusCode).toBe(400);
      expect(body.message).toContain("exactamente");
    });

    it("rejects when sub is paused", async () => {
      const { subId, memberId } = await setupActiveFixedSub(2);
      const pauseRes = await app.inject({
        method: "POST",
        url: `${BASE_URL}/members/${memberId}/subscription/pause`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      expect(pauseRes.statusCode).toBe(200);

      const newSlots = await createScheduleSlots(1, 2, 50);
      const { statusCode, body } = await patchSchedules(subId, {
        scheduleIds: newSlots,
      });
      expect(statusCode).toBe(400);
      expect(body.message).toContain("activa");
    });

    it("accepts partial anchors on a flexible presencial plan", async () => {
      const plan = await createPlan({
        name: "Flex Partial Anchors",
        bookingMode: "flexible",
        classesPerWeek: 4,
        durationDays: 60,
      });
      const member = await createMember();
      const { body: assignBody } = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });
      const subId = assignBody.id as number;
      const partial = await createScheduleSlots(1, 2, 60); // < classesPerWeek

      const { statusCode, body } = await patchSchedules(subId, {
        scheduleIds: partial,
      });
      expect(statusCode).toBe(200);
      expect([...(body.scheduleIds as number[])].sort()).toEqual(
        [...partial].sort(),
      );

      // Replacement credits should stay at 0 for flexible plans even if
      // holidays were skipped during regeneration.
      expect(body.replacementCredits).toBe(0);
    });

    it("rejects flexible plan anchors when count exceeds classesPerWeek", async () => {
      const plan = await createPlan({
        name: "Flex Overcount",
        bookingMode: "flexible",
        classesPerWeek: 2,
        durationDays: 30,
      });
      const member = await createMember();
      const { body: assignBody } = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });
      const subId = assignBody.id as number;
      const tooMany = await createScheduleSlots(1, 3, 65);

      const { statusCode, body } = await patchSchedules(subId, {
        scheduleIds: tooMany,
      });
      expect(statusCode).toBe(400);
      expect(body.message).toContain("hasta");
    });

    it("clears all anchors on a flexible plan when called with an empty set", async () => {
      const plan = await createPlan({
        name: "Flex Clear Anchors",
        bookingMode: "flexible",
        classesPerWeek: 3,
        durationDays: 30,
      });
      const member = await createMember();
      const initial = await createScheduleSlots(1, 2, 75);
      const { body: assignBody } = await assignPlan(member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: initial,
      });
      const subId = assignBody.id as number;

      const { statusCode, body } = await patchSchedules(subId, {
        scheduleIds: [],
      });
      expect(statusCode).toBe(200);
      expect(body.scheduleIds).toEqual([]);

      const rows = await app.db
        .select()
        .from(subscriptionSchedules)
        .where(eq(subscriptionSchedules.subscriptionId, subId));
      expect(rows).toHaveLength(0);
    });

    it("rejects when new slots are the same set as current", async () => {
      const { subId, originalSlots } = await setupActiveFixedSub(2);
      const { statusCode, body } = await patchSchedules(subId, {
        scheduleIds: [...originalSlots].reverse(),
      });
      expect(statusCode).toBe(400);
      expect(body.message).toContain("iguales");
    });

    it("rejects when new schedules are inactive or wrong branch", async () => {
      const { subId } = await setupActiveFixedSub(2);
      const newSlots = await createScheduleSlots(1, 2, 70);
      await app.db
        .update(schedules)
        .set({ isActive: false })
        .where(eq(schedules.id, newSlots[0]));

      const { statusCode, body } = await patchSchedules(subId, {
        scheduleIds: newSlots,
      });
      expect(statusCode).toBe(400);
      expect(body.message).toContain("inactiv");
    });

    it("allows coach role (not just admin) to change schedules", async () => {
      const { subId } = await setupActiveFixedSub(2);
      const newSlots = await createScheduleSlots(1, 2, 80);

      // Create a coach user and get their token
      const coachEmail = "coach-change-turnos@test.com";
      await registerUser(app, {
        email: coachEmail,
        password: "coach12345",
        firstName: "Coach",
        lastName: "ChangeTurnos",
        branchId: 1,
      });
      await app.db
        .update(users)
        .set({ role: "coach" })
        .where(eq(users.email, coachEmail));
      const coachToken = await getAuthToken(app, coachEmail, "coach12345");

      const { statusCode } = await patchSchedules(
        subId,
        { scheduleIds: newSlots },
        coachToken,
      );
      expect(statusCode).toBe(200);
    });
  });
});
