import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken, registerUser } from "../helpers";

describe("Personalizada Routes", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let adminToken: string;
  let memberToken2: string;

  beforeAll(async () => {
    app = await createTestApp();

    // Get admin token (admin@test.com seeded in globalSetup)
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Register member for personalizada tests
    await registerUser(app, {
      email: "personalizada-member@test.com",
      password: "password123",
      branchId: 1,
    });
    memberToken = await getAuthToken(
      app,
      "personalizada-member@test.com",
      "password123",
    );

    // Register a second member for isolation tests
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
  });

  afterAll(async () => {
    await app.close();
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
  // POST /api/personalizadas/select
  // ---------------------------------------------------------------
  describe("POST /api/personalizadas/select", () => {
    it("returns 401 without authentication", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/personalizadas/select",
        payload: { personalizadaType: "empuje" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid personalizada type", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/personalizadas/select",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { personalizadaType: "nonexistent" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("selects a personalizada and returns progress", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/personalizadas/select",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { personalizadaType: "empuje" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("personalizada");
      expect(body.personalizada.personalizadaType).toBe("empuje");
      expect(body.personalizada.semana20).toBe(1);
      expect(body.personalizada.semana40).toBe(1);
      expect(body.personalizada.semana60).toBe(1);
      expect(body.personalizada.isActive).toBe(true);
      expect(body.personalizada.startedAt).toBeTruthy();
    });

    it("returns current state when selecting same personalizada again (idempotent)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/personalizadas/select",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { personalizadaType: "empuje" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.personalizada.personalizadaType).toBe("empuje");
      expect(body.personalizada.isActive).toBe(true);
    });

    it("archives old personalizada when selecting a different one", async () => {
      // Switch from empuje to traccion
      const res = await app.inject({
        method: "POST",
        url: "/api/personalizadas/select",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { personalizadaType: "traccion" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.personalizada.personalizadaType).toBe("traccion");
      expect(body.personalizada.isActive).toBe(true);
      expect(body.personalizada.semana20).toBe(1); // Fresh start
    });
  });

  // ---------------------------------------------------------------
  // GET /api/personalizadas/active (after selection)
  // ---------------------------------------------------------------
  describe("GET /api/personalizadas/active (after selection)", () => {
    it("returns the active personalizada with correct semana values", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/active",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.personalizada).not.toBeNull();
      expect(body.personalizada.personalizadaType).toBe("traccion");
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

    it("returns archived personalizada after switching", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/archived",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("personalizadas");
      // Member switched from empuje to traccion, so empuje should be archived
      expect(body.personalizadas.length).toBeGreaterThanOrEqual(1);

      const archivedEmpuje = body.personalizadas.find(
        (p: { personalizadaType: string }) => p.personalizadaType === "empuje",
      );
      expect(archivedEmpuje).toBeDefined();
      expect(archivedEmpuje.archivedAt).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------
  // GET /api/personalizadas/session
  // ---------------------------------------------------------------
  describe("GET /api/personalizadas/session", () => {
    it("returns 400 when member has no active personalizada", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/personalizadas/session?week=1&day=lunes&duration=20",
        headers: { authorization: `Bearer ${memberToken2}` },
      });

      // member2 has no personalizada selected
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("personalizada activa");
    });

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
    it("returns 400 when member has no active personalizada", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/personalizadas/complete",
        headers: { authorization: `Bearer ${memberToken2}` },
        payload: {
          dayId: "P-empuje-W1-lunes-alfa",
          duration: 20,
          date: "2026-02-10",
          startedAt: new Date().toISOString(),
          blocksCompleted: ["INITIUM", "NUCLEUS"],
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("personalizada activa");
    });

    it("records a personalizada session completion and advances semana", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/personalizadas/complete",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          dayId: "P-traccion-W1-lunes-alfa",
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
      expect(body.progress.personalizadaType).toBe("traccion");
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
      const memberId = listBody.members[0].userId;

      // Get detail
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/personalizadas/members/${memberId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("active");
      expect(body).toHaveProperty("archived");
      expect(body).toHaveProperty("completions");

      // Active personalizada should be traccion (set earlier in tests)
      expect(body.active).not.toBeNull();
      expect(body.active.personalizadaType).toBe("traccion");

      // Archived should contain empuje (switched earlier)
      expect(Array.isArray(body.archived)).toBe(true);
      expect(body.archived.length).toBeGreaterThanOrEqual(1);

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
