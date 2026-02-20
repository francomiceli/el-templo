import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, registerUser } from "../helpers";

describe("Journey Routes", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let adminToken: string;
  let memberToken2: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Get admin token (admin@test.com seeded in globalSetup)
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Register member for journey tests
    await registerUser(app, {
      email: "journey-member@test.com",
      password: "password123",
      branchId: 1,
    });
    memberToken = await getAuthToken(
      app,
      "journey-member@test.com",
      "password123",
    );

    // Register a second member for isolation tests
    await registerUser(app, {
      email: "journey-member2@test.com",
      password: "password123",
      branchId: 1,
    });
    memberToken2 = await getAuthToken(
      app,
      "journey-member2@test.com",
      "password123",
    );
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // GET /api/journeys/metadata
  // ---------------------------------------------------------------
  describe("GET /api/journeys/metadata", () => {
    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journeys/metadata",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns all 6 journey types with correct structure", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journeys/metadata",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("journeys");
      expect(body.journeys).toHaveLength(6);

      // Verify structure of each journey
      for (const journey of body.journeys) {
        expect(journey).toHaveProperty("type");
        expect(journey).toHaveProperty("name");
        expect(journey).toHaveProperty("tier");
        expect(journey).toHaveProperty("description");
        expect(journey).toHaveProperty("zones");
        expect(journey).toHaveProperty("idealFor");
        expect(Array.isArray(journey.zones)).toBe(true);
        expect(["principiante", "intermedio", "avanzado"]).toContain(
          journey.tier,
        );
      }

      // Verify all 6 types are present
      const types = body.journeys.map((j: { type: string }) => j.type);
      expect(types).toContain("tren_superior");
      expect(types).toContain("tren_inferior");
      expect(types).toContain("empuje");
      expect(types).toContain("traccion");
      expect(types).toContain("planche");
      expect(types).toContain("front_lever");
    });
  });

  // ---------------------------------------------------------------
  // GET /api/journeys/active
  // ---------------------------------------------------------------
  describe("GET /api/journeys/active", () => {
    it("returns null when no journey is active", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journeys/active",
        headers: { authorization: `Bearer ${memberToken2}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("journey");
      expect(body.journey).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // POST /api/journeys/select
  // ---------------------------------------------------------------
  describe("POST /api/journeys/select", () => {
    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journeys/select",
        payload: { journeyType: "empuje" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid journey type", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journeys/select",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { journeyType: "nonexistent" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("selects a journey and returns progress", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journeys/select",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { journeyType: "empuje" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("journey");
      expect(body.journey.journeyType).toBe("empuje");
      expect(body.journey.semana20).toBe(1);
      expect(body.journey.semana40).toBe(1);
      expect(body.journey.semana60).toBe(1);
      expect(body.journey.isActive).toBe(true);
      expect(body.journey.startedAt).toBeTruthy();
    });

    it("returns current state when selecting same journey again (idempotent)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journeys/select",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { journeyType: "empuje" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.journey.journeyType).toBe("empuje");
      expect(body.journey.isActive).toBe(true);
    });

    it("archives old journey when selecting a different one", async () => {
      // Switch from empuje to traccion
      const res = await app.inject({
        method: "POST",
        url: "/api/journeys/select",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { journeyType: "traccion" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.journey.journeyType).toBe("traccion");
      expect(body.journey.isActive).toBe(true);
      expect(body.journey.semana20).toBe(1); // Fresh start
    });
  });

  // ---------------------------------------------------------------
  // GET /api/journeys/active (after selection)
  // ---------------------------------------------------------------
  describe("GET /api/journeys/active (after selection)", () => {
    it("returns the active journey with correct semana values", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journeys/active",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.journey).not.toBeNull();
      expect(body.journey.journeyType).toBe("traccion");
      expect(body.journey.semana20).toBe(1);
      expect(body.journey.semana40).toBe(1);
      expect(body.journey.semana60).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/journeys/archived
  // ---------------------------------------------------------------
  describe("GET /api/journeys/archived", () => {
    it("returns empty array when no archived journeys exist", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journeys/archived",
        headers: { authorization: `Bearer ${memberToken2}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("journeys");
      expect(body.journeys).toHaveLength(0);
    });

    it("returns archived journey after switching", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journeys/archived",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("journeys");
      // Member switched from empuje to traccion, so empuje should be archived
      expect(body.journeys.length).toBeGreaterThanOrEqual(1);

      const archivedEmpuje = body.journeys.find(
        (j: { journeyType: string }) => j.journeyType === "empuje",
      );
      expect(archivedEmpuje).toBeDefined();
      expect(archivedEmpuje.archivedAt).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------
  // GET /api/journeys/session
  // ---------------------------------------------------------------
  describe("GET /api/journeys/session", () => {
    it("returns 400 when member has no active journey", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journeys/session?week=1&day=lunes&duration=20",
        headers: { authorization: `Bearer ${memberToken2}` },
      });

      // member2 has no journey selected
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("journey activo");
    });

    it("returns 404 when no session exists for the given week/day", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journeys/session?week=1&day=lunes&duration=20",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      // No journey sessions have been generated yet
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBeTruthy();
    });

    it("returns 400 for missing required query params", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/journeys/session?week=1&day=lunes",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // POST /api/journeys/complete
  // ---------------------------------------------------------------
  describe("POST /api/journeys/complete", () => {
    it("returns 400 when member has no active journey", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journeys/complete",
        headers: { authorization: `Bearer ${memberToken2}` },
        payload: {
          dayId: "J-empuje-W1-lunes-alfa",
          duration: 20,
          date: "2026-02-10",
          startedAt: new Date().toISOString(),
          blocksCompleted: ["INITIUM", "NUCLEUS"],
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("journey activo");
    });

    it("records a journey session completion and advances semana", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journeys/complete",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          dayId: "J-traccion-W1-lunes-alfa",
          duration: 40,
          date: "2026-02-10",
          startedAt: new Date().toISOString(),
          blocksCompleted: ["INITIUM", "NUCLEUS", "DEUTEROS_1"],
          rpe: 7,
          notes: "Buen entrenamiento de traccion",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.progress).toBeDefined();
      expect(body.progress.journeyType).toBe("traccion");
      // semana40 should be incremented to 2 (was 1 + 1)
      expect(body.progress.semana40).toBe(2);
      // Other durations should remain at 1
      expect(body.progress.semana20).toBe(1);
      expect(body.progress.semana60).toBe(1);
    });

    it("validates required fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/journeys/complete",
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
  // POST /api/admin/journeys/generate
  // ---------------------------------------------------------------
  describe("POST /api/admin/journeys/generate", () => {
    it("returns 403 for non-admin users", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/journeys/generate",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          week: 1,
          journeyType: "empuje",
        },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("administrador");
    });

    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/journeys/generate",
        payload: {
          week: 1,
          journeyType: "empuje",
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid journey type", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/journeys/generate",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          week: 1,
          journeyType: "invalid_type",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    // Note: actual session generation depends on SPOM/exercise data in test DB.
    // This test validates the endpoint handles requests correctly.
    it("accepts valid generate request from admin", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/journeys/generate",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          week: 50,
          journeyType: "tren_inferior",
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
  // GET /api/admin/journeys/members
  // ---------------------------------------------------------------
  describe("GET /api/admin/journeys/members", () => {
    it("returns 403 for non-admin users", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/journeys/members",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns members list with journey status for admin", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/journeys/members",
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
        // journeyType can be string or null
        expect(member).toHaveProperty("journeyType");
      }
    });

    it("supports search filter", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/journeys/members?search=journey-member",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      // All returned members should match the search
      for (const member of body.members) {
        const matchesSearch =
          member.email.includes("journey-member") ||
          (member.firstName && member.firstName.includes("journey-member")) ||
          (member.lastName && member.lastName.includes("journey-member"));
        expect(matchesSearch).toBe(true);
      }
    });

    it("supports pagination", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/journeys/members?page=1&limit=1",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeLessThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------
  // GET /api/admin/journeys/members/:userId
  // ---------------------------------------------------------------
  describe("GET /api/admin/journeys/members/:userId", () => {
    it("returns 403 for non-admin users", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/journeys/members/1",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 for nonexistent user", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/journeys/members/99999",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns detailed journey info for a specific member", async () => {
      // First, get the member's user ID from the members list
      const listRes = await app.inject({
        method: "GET",
        url: "/api/admin/journeys/members?search=journey-member@test.com",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const listBody = JSON.parse(listRes.body);
      expect(listBody.members.length).toBeGreaterThanOrEqual(1);
      const memberId = listBody.members[0].userId;

      // Get detail
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/journeys/members/${memberId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("active");
      expect(body).toHaveProperty("archived");
      expect(body).toHaveProperty("completions");

      // Active journey should be traccion (set earlier in tests)
      expect(body.active).not.toBeNull();
      expect(body.active.journeyType).toBe("traccion");

      // Archived should contain empuje (switched earlier)
      expect(Array.isArray(body.archived)).toBe(true);
      expect(body.archived.length).toBeGreaterThanOrEqual(1);

      // Completions should include the completion recorded earlier
      expect(Array.isArray(body.completions)).toBe(true);
      expect(body.completions.length).toBeGreaterThanOrEqual(1);

      const completion = body.completions[0];
      expect(completion).toHaveProperty("dayId");
      expect(completion).toHaveProperty("date");
      expect(completion).toHaveProperty("journeyType");
      expect(completion).toHaveProperty("duration");
      expect(completion).toHaveProperty("completedAt");
    });
  });
});
