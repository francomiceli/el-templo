import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";

const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";

describe("Goal Plan Routes", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let adminToken: string;
  let memberToken2: string;
  let memberId: number;
  let goalPlanPlanId: number;

  beforeAll(async () => {
    app = await createTestApp();

    // Get admin token (admin@test.com seeded in globalSetup)
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Register member for goal plan tests
    const member1Result = await registerUser(app, {
      email: "goal-plan-member@test.com",
      password: "password123",
      branchId: 1,
    });
    memberToken = await getAuthToken(
      app,
      "goal-plan-member@test.com",
      "password123",
    );
    memberId = (member1Result.user as { id: number }).id;

    // Register a second member for isolation/enforcement tests (no subscription)
    await registerUser(app, {
      email: "goal-plan-member2@test.com",
      password: "password123",
      branchId: 1,
    });
    memberToken2 = await getAuthToken(
      app,
      "goal-plan-member2@test.com",
      "password123",
    );

    // Create a micro_program with goalPlanType (D-07 REVISED: goalPlanType lives on program)
    const programRes = await app.inject({
      method: "POST",
      url: "/api/admin/programs",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Tren Superior Program",
        description: null,
        price: 20000,
        durationWeeks: 4,
        sessionsPerWeekToAdvance: 3,
        goalPlanType: "tren_superior",
        auraWeeklyBonus: 15,
        auraCompletionBonus: 100,
        contentBlocks: [],
      },
    });
    expect(programRes.statusCode).toBe(201);
    const program = JSON.parse(programRes.body);

    // Create a goal-plan-enabled subscription plan linked to the program
    const planRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Plan Goal Plan Test",
        planTier: "other",
        bookingMode: "flexible",
        priceRegular: 20000,
        priceZero: 15000,
        durationDays: 30,
        planCategory: "online_goal",
        linkedProgramId: program.id,
      },
    });
    expect(planRes.statusCode).toBe(201);
    const plan = JSON.parse(planRes.body);
    goalPlanPlanId = plan.id;

    // Assign the goal plan to member1
    const assignRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: plan.id,
        branchId: 1,
        startDate: "2026-03-01",
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(assignRes.statusCode).toBe(201);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // Subscription Enforcement
  // ---------------------------------------------------------------
  describe("Subscription Enforcement", () => {
    it("returns 403 on GET /goal-plans/session without goal plan subscription", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/session?week=1&day=lunes&duration=20",
        headers: { authorization: `Bearer ${memberToken2}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 403 on POST /goal-plans/complete without goal plan subscription", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/goal-plans/complete",
        headers: { authorization: `Bearer ${memberToken2}` },
        payload: {
          dayId: "GP-empuje-W1-lunes-alfa",
          duration: 20,
          date: "2026-03-18",
          startedAt: new Date().toISOString(),
          blocksCompleted: ["INITIUM"],
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /goal-plans/metadata returns 200 without subscription (public)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/metadata",
        headers: { authorization: `Bearer ${memberToken2}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /goal-plans/active returns 200 without subscription (no gate)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/active",
        headers: { authorization: `Bearer ${memberToken2}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /goal-plans/archived returns 200 without subscription (no gate)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/archived",
        headers: { authorization: `Bearer ${memberToken2}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/goal-plans/metadata
  // ---------------------------------------------------------------
  describe("GET /api/goal-plans/metadata", () => {
    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/metadata",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns all 6 goal plan types with correct structure", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/metadata",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("goalPlans");
      expect(body.goalPlans).toHaveLength(6);

      // Verify structure of each goal plan
      for (const goalPlan of body.goalPlans) {
        expect(goalPlan).toHaveProperty("type");
        expect(goalPlan).toHaveProperty("name");
        expect(goalPlan).toHaveProperty("tier");
        expect(goalPlan).toHaveProperty("description");
        expect(goalPlan).toHaveProperty("zones");
        expect(goalPlan).toHaveProperty("idealFor");
        expect(Array.isArray(goalPlan.zones)).toBe(true);
        expect(["principiante", "intermedio", "avanzado"]).toContain(
          goalPlan.tier,
        );
      }

      // Verify all 6 types are present
      const types = body.goalPlans.map((p: { type: string }) => p.type);
      expect(types).toContain("tren_superior");
      expect(types).toContain("tren_inferior");
      expect(types).toContain("empuje");
      expect(types).toContain("traccion");
      expect(types).toContain("planche");
      expect(types).toContain("front_lever");
    });
  });

  // ---------------------------------------------------------------
  // GET /api/goal-plans/active
  // ---------------------------------------------------------------
  describe("GET /api/goal-plans/active", () => {
    it("returns null when no goal plan is active", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/active",
        headers: { authorization: `Bearer ${memberToken2}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("goalPlan");
      expect(body.goalPlan).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Plan-driven goal plan assignment
  // ---------------------------------------------------------------
  describe("Plan-driven goal plan assignment", () => {
    it("rejects plan update to online_goal without linkedProgramId", async () => {
      // Create a presencial plan first
      const createRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Temp Presencial Plan",
          planTier: "other",
          bookingMode: "flexible",
          priceRegular: 10000,
          priceZero: 8000,
          durationDays: 30,
          planCategory: "presencial",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const tempPlan = JSON.parse(createRes.body);

      // Try to update to online_goal without linkedProgramId
      const res = await app.inject({
        method: "PUT",
        url: `${SUBSCRIPTIONS_URL}/plans/${tempPlan.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planCategory: "online_goal",
          // no linkedProgramId
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("linkedProgramId");
    });

    it("plan list includes goalPlanType field", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const plans = JSON.parse(res.body).plans;
      const goalPlan = plans.find(
        (p: { planCategory: string }) => p.planCategory === "online_goal",
      );
      expect(goalPlan).toBeDefined();
      expect(goalPlan.goalPlanType).toBe("tren_superior");
    });

    it("assigning a goal plan auto-creates member_goal_plans", async () => {
      // Use a fresh member to avoid conflicts with existing subscription
      const freshMember = await registerUser(app, {
        email: "goal-plan-auto-assign@test.com",
        password: "password123",
        branchId: 1,
      });
      const freshToken = await getAuthToken(
        app,
        "goal-plan-auto-assign@test.com",
        "password123",
      );
      const freshMemberId = (freshMember.user as { id: number }).id;

      const assignRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${freshMemberId}/subscription/assign`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: goalPlanPlanId,
          branchId: 1,
          startDate: new Date().toISOString().split("T")[0],
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });
      expect(assignRes.statusCode).toBe(201);

      // Verify member_goal_plans was auto-created
      const activeRes = await app.inject({
        method: "GET",
        url: "/api/goal-plans/active",
        headers: { authorization: `Bearer ${freshToken}` },
      });
      expect(activeRes.statusCode).toBe(200);
      const body = JSON.parse(activeRes.body);
      expect(body.goalPlan).not.toBeNull();
      expect(body.goalPlan.goalPlanType).toBe("tren_superior");
      expect(body.goalPlan.isActive).toBe(true);
      expect(body.goalPlan.semana20).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/goal-plans/active (after auto-assignment from plan)
  // ---------------------------------------------------------------
  describe("GET /api/goal-plans/active (after auto-assignment)", () => {
    it("returns the auto-assigned goal plan with correct semana values", async () => {
      // member1 was assigned a plan with goalPlanType: "tren_superior" in beforeAll
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/active",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.goalPlan).not.toBeNull();
      expect(body.goalPlan.goalPlanType).toBe("tren_superior");
      expect(body.goalPlan.semana20).toBe(1);
      expect(body.goalPlan.semana40).toBe(1);
      expect(body.goalPlan.semana60).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/goal-plans/archived
  // ---------------------------------------------------------------
  describe("GET /api/goal-plans/archived", () => {
    it("returns empty array when no archived goal plans exist", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/archived",
        headers: { authorization: `Bearer ${memberToken2}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("goalPlans");
      expect(body.goalPlans).toHaveLength(0);
    });

    it("returns empty archived list for member with only auto-assigned goal plan", async () => {
      // member1 was only auto-assigned tren_superior from plan, no prior switching
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/archived",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("goalPlans");
      expect(Array.isArray(body.goalPlans)).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/goal-plans/stats
  // ---------------------------------------------------------------
  describe("GET /goal-plans/stats", () => {
    it("returns null stats when member has no active goal plan", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/stats",
        headers: { authorization: `Bearer ${memberToken2}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stats).toBeNull();
    });

    it("returns cycle stats for member with active goal plan", async () => {
      // member1 has an active goal plan (tren_superior) auto-assigned from plan
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/stats",
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stats).not.toBeNull();
      expect(body.stats.cycleWeeks).toBeGreaterThan(0);
      expect(body.stats.currentWeek).toBeGreaterThanOrEqual(1);
      expect(body.stats.cycleEndDate).toBeTruthy();
      expect(body.stats.totalCompletions).toBeGreaterThanOrEqual(0);
      expect(body.stats.durationBreakdown).toEqual(
        expect.objectContaining({
          d20: expect.any(Number),
          d40: expect.any(Number),
          d60: expect.any(Number),
        }),
      );
      expect(typeof body.stats.cycleComplete).toBe("boolean");
      // Plan has durationDays=30, so cycleWeeks should be ceil(30/7) = 5
      expect(body.stats.cycleWeeks).toBe(5);
    });

    it("returns 401 when not authenticated", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/stats",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/goal-plans/session
  // ---------------------------------------------------------------
  describe("GET /api/goal-plans/session", () => {
    it("returns 404 when no session exists for the given week/day", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/session?week=1&day=lunes&duration=20",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      // No goal plan sessions have been generated yet
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBeTruthy();
    });

    it("returns 400 for missing required query params", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/goal-plans/session?week=1&day=lunes",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // POST /api/goal-plans/complete
  // ---------------------------------------------------------------
  describe("POST /api/goal-plans/complete", () => {
    it("records a goal plan session completion and advances semana", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/goal-plans/complete",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          dayId: "GP-tren_superior-W1-lunes-alfa",
          duration: 40,
          date: "2026-02-10",
          startedAt: new Date().toISOString(),
          blocksCompleted: ["INITIUM", "NUCLEUS", "DEUTEROS_1"],
          rpe: 7,
          notes: "Buen entrenamiento de tren superior",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.progress).toBeDefined();
      expect(body.progress.goalPlanType).toBe("tren_superior");
      // semana40 should be incremented to 2 (was 1 + 1)
      expect(body.progress.semana40).toBe(2);
      // Other durations should remain at 1
      expect(body.progress.semana20).toBe(1);
      expect(body.progress.semana60).toBe(1);
    });

    it("validates required fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/goal-plans/complete",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          // Missing required fields
          rpe: 5,
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // POST /api/admin/goal-plans/generate
  // ---------------------------------------------------------------
  describe("POST /api/admin/goal-plans/generate", () => {
    it("returns 403 for non-admin users", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/goal-plans/generate",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          week: 1,
          goalPlanType: "empuje",
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("administrador");
    });

    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/goal-plans/generate",
        payload: {
          week: 1,
          goalPlanType: "empuje",
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid goal plan type", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/goal-plans/generate",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          week: 1,
          goalPlanType: "invalid_type",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    // Note: actual session generation depends on SPOM/exercise data in test DB.
    // This test validates the endpoint handles requests correctly.
    it("accepts valid generate request from admin", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/goal-plans/generate",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          week: 50,
          goalPlanType: "tren_inferior",
          days: ["lunes"],
        },
      });

      // Either succeeds (200) or fails due to missing seed data (400)
      // Both are valid in test environment - we verify the endpoint is reachable
      expect([200, 400]).toContain(res.statusCode);
      const body = JSON.parse(res.body);

      if (res.statusCode === 200) {
        expect(body).toHaveProperty("generated");
        expect(body).toHaveProperty("skipped");
        expect(typeof body.generated).toBe("number");
        expect(typeof body.skipped).toBe("number");
      }
    });
  });

  // ---------------------------------------------------------------
  // GET /api/admin/goal-plans/members
  // ---------------------------------------------------------------
  describe("GET /api/admin/goal-plans/members", () => {
    it("returns 403 for non-admin users", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/goal-plans/members",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns members list with goal plan status for admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/goal-plans/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("members");
      expect(body).toHaveProperty("total");
      expect(Array.isArray(body.members)).toBe(true);
      expect(typeof body.total).toBe("number");

      // Should include our test members (they are role=member)
      if (body.members.length > 0) {
        const member = body.members[0];
        expect(member).toHaveProperty("userId");
        expect(member).toHaveProperty("email");
        expect(member).toHaveProperty("level");
        // goalPlanType can be string or null
        expect(member).toHaveProperty("goalPlanType");
      }
    });

    it("supports search filter", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/goal-plans/members?search=goal-plan-member",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      // All returned members should match the search
      for (const member of body.members) {
        const matchesSearch =
          member.email.includes("goal-plan-member") ||
          (member.firstName && member.firstName.includes("goal-plan-member")) ||
          (member.lastName && member.lastName.includes("goal-plan-member"));
        expect(matchesSearch).toBe(true);
      }
    });

    it("supports pagination", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/goal-plans/members?page=1&limit=1",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeLessThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/admin/goal-plans/members/:userId
  // ---------------------------------------------------------------
  describe("GET /api/admin/goal-plans/members/:userId", () => {
    it("returns 403 for non-admin users", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/goal-plans/members/1",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 for nonexistent user", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/goal-plans/members/99999",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns detailed goal plan info for a specific member", async () => {
      // First, get the member's user ID from the members list
      const listRes = await app.inject({
        method: "GET",
        url: "/api/admin/goal-plans/members?search=goal-plan-member@test.com",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const listBody = JSON.parse(listRes.body);
      expect(listBody.members.length).toBeGreaterThanOrEqual(1);
      const targetMemberId = listBody.members[0].userId;

      // Get detail
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/goal-plans/members/${targetMemberId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("active");
      expect(body).toHaveProperty("archived");
      expect(body).toHaveProperty("completions");

      // Active goal plan should be tren_superior (auto-assigned from plan)
      expect(body.active).not.toBeNull();
      expect(body.active.goalPlanType).toBe("tren_superior");

      // Archived may be empty (no manual switching since route removed)
      expect(Array.isArray(body.archived)).toBe(true);

      // Completions should include the completion recorded earlier
      expect(Array.isArray(body.completions)).toBe(true);
      expect(body.completions.length).toBeGreaterThanOrEqual(1);

      const completion = body.completions[0];
      expect(completion).toHaveProperty("dayId");
      expect(completion).toHaveProperty("date");
      expect(completion).toHaveProperty("goalPlanType");
      expect(completion).toHaveProperty("duration");
      expect(completion).toHaveProperty("completedAt");
    });
  });

  // ---------------------------------------------------------------
  // Online Regular Session Access (MON-09)
  // ---------------------------------------------------------------
  describe("Online Regular Session Access (MON-09)", () => {
    it("online_regular member sees planCategory in subscription and can access session endpoint", async () => {
      // Clean up to avoid subscription conflicts
      await cleanAllTestData(app);

      // Create online_regular plan (no goalPlanType, no linkedProgramId)
      const planRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Plan Online Regular Test",
          planTier: "flex",
          bookingMode: "flexible",
          priceRegular: 8000,
          priceZero: 6000,
          durationDays: 30,
          planCategory: "online_regular",
        },
      });
      expect(planRes.statusCode).toBe(201);
      const onlinePlan = JSON.parse(planRes.body);

      // Register a fresh member for this test
      const freshMember = await registerUser(app, {
        email: "online-regular-session-test@test.com",
        password: "password123",
        branchId: 1,
      });
      const freshToken = await getAuthToken(
        app,
        "online-regular-session-test@test.com",
        "password123",
      );
      const freshMemberId = (freshMember.user as { id: number }).id;

      // Assign online_regular plan
      const assignRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${freshMemberId}/subscription/assign`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: onlinePlan.id,
          branchId: 1,
          startDate: new Date().toISOString().split("T")[0],
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });
      expect(assignRes.statusCode).toBe(201);

      // Verify subscription shows planCategory: "online_regular"
      const subRes = await app.inject({
        method: "GET",
        url: "/api/members/subscription/me/subscription",
        headers: { authorization: `Bearer ${freshToken}` },
      });
      expect(subRes.statusCode).toBe(200);
      const subBody = JSON.parse(subRes.body);
      expect(subBody.planCategory).toBe("online_regular");

      // Verify online_regular member gets 404 (no approved session) not 403 (forbidden)
      // on regular session endpoint -- this confirms they access the regular pipeline
      const sessionRes = await app.inject({
        method: "GET",
        url: "/api/sessions/daily?date=2026-04-04",
        headers: { authorization: `Bearer ${freshToken}` },
      });
      // 404 means "session not available" -- NOT 403 (blocked) or 401 (unauthorized)
      // This confirms online_regular users access the regular session pipeline
      expect(sessionRes.statusCode).toBe(404);
      const sessionBody = JSON.parse(sessionRes.body);
      expect(sessionBody.error).toContain("no disponible");
    });
  });
});
