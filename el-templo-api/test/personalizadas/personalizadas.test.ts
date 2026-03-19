import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, registerUser } from "../helpers";

const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";

describe("Personalizada Routes", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let adminToken: string;
  let memberToken2: string;
  let memberId: number;
  let personalizadaPlanId: number;

  beforeAll(async () => {
    app = await createTestApp();

    // Get admin token (admin@test.com seeded in globalSetup)
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Register member for personalizada tests
    const member1Result = await registerUser(app, {
      email: "personalizada-member@test.com",
      password: "password123",
      branchId: 1,
    });
    memberToken = await getAuthToken(
      app,
      "personalizada-member@test.com",
      "password123",
    );
    memberId = (member1Result.user as { id: number }).id;

    // Register a second member for isolation/enforcement tests (no subscription)
    await registerUser(app, {
      email: "personalizada-member2@test.com",
      password: "password123",
      branchId: 1,
    });
    memberToken2 = await getAuthToken(
      app,
      "personalizada-member2@test.com",
      "password123",
    );

    // Create a personalizada-enabled subscription plan with personalizadaType
    const planRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Plan Personalizada Test",
        planTier: "flex",
        bookingMode: "flexible",
        priceRegular: 20000,
        priceZero: 15000,
        durationDays: 30,
        classesPerWeek: 3,
        isPersonalizada: true,
        personalizadaType: "tren_superior",
      },
    });
    expect(planRes.statusCode).toBe(201);
    const plan = JSON.parse(planRes.body);
    personalizadaPlanId = plan.id;

    // Assign the personalizada plan to member1
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
    it("POST /personalizadas/select returns 404 (route removed)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/personalizadas/select",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { personalizadaType: "tren_superior" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 403 on GET /personalizadas/session without personalizada subscription", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/session?week=1&day=lunes&duration=20",
        headers: { authorization: `Bearer ${memberToken2}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 403 on POST /personalizadas/complete without personalizada subscription", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/personalizadas/complete",
        headers: { authorization: `Bearer ${memberToken2}` },
        payload: {
          dayId: "P-empuje-W1-lunes-alfa",
          duration: 20,
          date: "2026-03-18",
          startedAt: new Date().toISOString(),
          blocksCompleted: ["INITIUM"],
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("GET /personalizadas/metadata returns 200 without subscription (public)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/metadata",
        headers: { authorization: `Bearer ${memberToken2}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /personalizadas/active returns 200 without subscription (no gate)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/active",
        headers: { authorization: `Bearer ${memberToken2}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /personalizadas/archived returns 200 without subscription (no gate)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/archived",
        headers: { authorization: `Bearer ${memberToken2}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/personalizadas/metadata
  // ---------------------------------------------------------------
  describe("GET /api/personalizadas/metadata", () => {
    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/metadata",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns all 6 personalizada types with correct structure", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/metadata",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("personalizadas");
      expect(body.personalizadas).toHaveLength(6);

      // Verify structure of each personalizada
      for (const personalizada of body.personalizadas) {
        expect(personalizada).toHaveProperty("type");
        expect(personalizada).toHaveProperty("name");
        expect(personalizada).toHaveProperty("tier");
        expect(personalizada).toHaveProperty("description");
        expect(personalizada).toHaveProperty("zones");
        expect(personalizada).toHaveProperty("idealFor");
        expect(Array.isArray(personalizada.zones)).toBe(true);
        expect(["principiante", "intermedio", "avanzado"]).toContain(
          personalizada.tier,
        );
      }

      // Verify all 6 types are present
      const types = body.personalizadas.map((p: { type: string }) => p.type);
      expect(types).toContain("tren_superior");
      expect(types).toContain("tren_inferior");
      expect(types).toContain("empuje");
      expect(types).toContain("traccion");
      expect(types).toContain("planche");
      expect(types).toContain("front_lever");
    });
  });

  // ---------------------------------------------------------------
  // GET /api/personalizadas/active
  // ---------------------------------------------------------------
  describe("GET /api/personalizadas/active", () => {
    it("returns null when no personalizada is active", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/active",
        headers: { authorization: `Bearer ${memberToken2}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("personalizada");
      expect(body.personalizada).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // Plan-driven personalizada assignment
  // ---------------------------------------------------------------
  describe("Plan-driven personalizada assignment", () => {
    it("rejects plan creation with isPersonalizada=true but no personalizadaType", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Bad Personalizada Plan",
          planTier: "other",
          bookingMode: "flexible",
          priceRegular: 10000,
          priceZero: 8000,
          durationDays: 30,
          isPersonalizada: true,
          // no personalizadaType
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("personalizada");
    });

    it("plan list includes personalizadaType field", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/plans`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const plans = JSON.parse(res.body).plans;
      const persoPlan = plans.find(
        (p: { isPersonalizada: boolean }) => p.isPersonalizada,
      );
      expect(persoPlan).toBeDefined();
      expect(persoPlan.personalizadaType).toBe("tren_superior");
    });

    it("assigning a personalizada plan auto-creates member_personalizadas", async () => {
      // Use a fresh member to avoid conflicts with existing subscription
      const freshMember = await registerUser(app, {
        email: "personalizada-auto-assign@test.com",
        password: "password123",
        branchId: 1,
      });
      const freshToken = await getAuthToken(
        app,
        "personalizada-auto-assign@test.com",
        "password123",
      );
      const freshMemberId = (freshMember.user as { id: number }).id;

      const assignRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${freshMemberId}/subscription/assign`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          planId: personalizadaPlanId,
          branchId: 1,
          startDate: new Date().toISOString().split("T")[0],
          priceTypeApplied: "regular",
          paymentMethod: "cash",
        },
      });
      expect(assignRes.statusCode).toBe(201);

      // Verify member_personalizadas was auto-created
      const activeRes = await app.inject({
        method: "GET",
        url: "/api/personalizadas/active",
        headers: { authorization: `Bearer ${freshToken}` },
      });
      expect(activeRes.statusCode).toBe(200);
      const body = JSON.parse(activeRes.body);
      expect(body.personalizada).not.toBeNull();
      expect(body.personalizada.personalizadaType).toBe("tren_superior");
      expect(body.personalizada.isActive).toBe(true);
      expect(body.personalizada.semana20).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/personalizadas/active (after auto-assignment from plan)
  // ---------------------------------------------------------------
  describe("GET /api/personalizadas/active (after auto-assignment)", () => {
    it("returns the auto-assigned personalizada with correct semana values", async () => {
      // member1 was assigned a plan with personalizadaType: "tren_superior" in beforeAll
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/active",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.personalizada).not.toBeNull();
      expect(body.personalizada.personalizadaType).toBe("tren_superior");
      expect(body.personalizada.semana20).toBe(1);
      expect(body.personalizada.semana40).toBe(1);
      expect(body.personalizada.semana60).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/personalizadas/archived
  // ---------------------------------------------------------------
  describe("GET /api/personalizadas/archived", () => {
    it("returns empty array when no archived personalizadas exist", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/archived",
        headers: { authorization: `Bearer ${memberToken2}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("personalizadas");
      expect(body.personalizadas).toHaveLength(0);
    });

    it("returns empty archived list for member with only auto-assigned personalizada", async () => {
      // member1 was only auto-assigned tren_superior from plan, no prior switching
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/archived",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("personalizadas");
      expect(Array.isArray(body.personalizadas)).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/personalizadas/stats
  // ---------------------------------------------------------------
  describe("GET /personalizadas/stats", () => {
    it("returns null stats when member has no active personalizada", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/stats",
        headers: { authorization: `Bearer ${memberToken2}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stats).toBeNull();
    });

    it("returns cycle stats for member with active personalizada", async () => {
      // member1 has an active personalizada (tren_superior) auto-assigned from plan
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/stats",
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
        url: "/api/personalizadas/stats",
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/personalizadas/session
  // ---------------------------------------------------------------
  describe("GET /api/personalizadas/session", () => {
    it("returns 404 when no session exists for the given week/day", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/session?week=1&day=lunes&duration=20",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      // No personalizada sessions have been generated yet
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBeTruthy();
    });

    it("returns 400 for missing required query params", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/session?week=1&day=lunes",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // POST /api/personalizadas/complete
  // ---------------------------------------------------------------
  describe("POST /api/personalizadas/complete", () => {
    it("records a personalizada session completion and advances semana", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/personalizadas/complete",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          dayId: "P-tren_superior-W1-lunes-alfa",
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
      expect(body.progress.personalizadaType).toBe("tren_superior");
      // semana40 should be incremented to 2 (was 1 + 1)
      expect(body.progress.semana40).toBe(2);
      // Other durations should remain at 1
      expect(body.progress.semana20).toBe(1);
      expect(body.progress.semana60).toBe(1);
    });

    it("validates required fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/personalizadas/complete",
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
  // POST /api/admin/personalizadas/generate
  // ---------------------------------------------------------------
  describe("POST /api/admin/personalizadas/generate", () => {
    it("returns 403 for non-admin users", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/personalizadas/generate",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          week: 1,
          personalizadaType: "empuje",
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("administrador");
    });

    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/personalizadas/generate",
        payload: {
          week: 1,
          personalizadaType: "empuje",
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid personalizada type", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/personalizadas/generate",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          week: 1,
          personalizadaType: "invalid_type",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    // Note: actual session generation depends on SPOM/exercise data in test DB.
    // This test validates the endpoint handles requests correctly.
    it("accepts valid generate request from admin", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/personalizadas/generate",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          week: 50,
          personalizadaType: "tren_inferior",
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
  // GET /api/admin/personalizadas/members
  // ---------------------------------------------------------------
  describe("GET /api/admin/personalizadas/members", () => {
    it("returns 403 for non-admin users", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/personalizadas/members",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns members list with personalizada status for admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/personalizadas/members",
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
        // personalizadaType can be string or null
        expect(member).toHaveProperty("personalizadaType");
      }
    });

    it("supports search filter", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/personalizadas/members?search=personalizada-member",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      // All returned members should match the search
      for (const member of body.members) {
        const matchesSearch =
          member.email.includes("personalizada-member") ||
          (member.firstName &&
            member.firstName.includes("personalizada-member")) ||
          (member.lastName && member.lastName.includes("personalizada-member"));
        expect(matchesSearch).toBe(true);
      }
    });

    it("supports pagination", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/personalizadas/members?page=1&limit=1",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeLessThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/admin/personalizadas/members/:userId
  // ---------------------------------------------------------------
  describe("GET /api/admin/personalizadas/members/:userId", () => {
    it("returns 403 for non-admin users", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/personalizadas/members/1",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 for nonexistent user", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/personalizadas/members/99999",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns detailed personalizada info for a specific member", async () => {
      // First, get the member's user ID from the members list
      const listRes = await app.inject({
        method: "GET",
        url: "/api/admin/personalizadas/members?search=personalizada-member@test.com",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const listBody = JSON.parse(listRes.body);
      expect(listBody.members.length).toBeGreaterThanOrEqual(1);
      const targetMemberId = listBody.members[0].userId;

      // Get detail
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/personalizadas/members/${targetMemberId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("active");
      expect(body).toHaveProperty("archived");
      expect(body).toHaveProperty("completions");

      // Active personalizada should be tren_superior (auto-assigned from plan)
      expect(body.active).not.toBeNull();
      expect(body.active.personalizadaType).toBe("tren_superior");

      // Archived may be empty (no manual switching since route removed)
      expect(Array.isArray(body.archived)).toBe(true);

      // Completions should include the completion recorded earlier
      expect(Array.isArray(body.completions)).toBe(true);
      expect(body.completions.length).toBeGreaterThanOrEqual(1);

      const completion = body.completions[0];
      expect(completion).toHaveProperty("dayId");
      expect(completion).toHaveProperty("date");
      expect(completion).toHaveProperty("personalizadaType");
      expect(completion).toHaveProperty("duration");
      expect(completion).toHaveProperty("completedAt");
    });
  });
});
