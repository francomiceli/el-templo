import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken, registerUser } from "../helpers";
import { users } from "../../src/db/schema/users";
import { memberNotes } from "../../src/db/schema/member-notes";
import { payments } from "../../src/db/schema/payments";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { auraBalances } from "../../src/db/schema/aura-balances";
import { attendance } from "../../src/db/schema/attendance";

describe("Members Management Routes", () => {
  let app: FastifyInstance;
  let adminToken: string;

  // Reusable member payload
  const baseMember = {
    email: "member@test-members.com",
    password: "pass123456",
    firstName: "Juan",
    lastName: "Perez",
    phone: "+5491155551234",
    dni: "30123456",
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
   * Helper: clean up test members (not the admin seed user).
   * Also cleans up member_notes.
   */
  async function cleanupTestMembers(): Promise<void> {
    // Delete in FK constraint order: attendance -> payments -> subscriptions -> plans -> aura -> notes -> users
    await app.db.delete(attendance);
    await app.db.delete(payments);
    await app.db.delete(subscriptions);
    await app.db.delete(subscriptionPlans);
    await app.db.delete(auraTransactions);
    await app.db.delete(auraBalances);
    await app.db.delete(memberNotes);
    // Delete all members except the admin seed user
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
   * Helper: create a member via the API and return the profile.
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

  // =========================================================================
  // GET /api/admin/members — List Members
  // =========================================================================
  describe("GET /api/admin/members", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
    });

    it("returns paginated list of members with total count", async () => {
      await createMember();
      await createMember({
        email: "member2@test.com",
        dni: "30123457",
        firstName: "Maria",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body).toHaveProperty("page", 1);
      expect(body).toHaveProperty("limit", 20);
    });

    it("filters by search (name/email/DNI substring)", async () => {
      await createMember({ firstName: "Carlos", dni: "40111222" });
      await createMember({
        email: "maria@test.com",
        firstName: "Maria",
        dni: "40333444",
      });

      // Search by name
      const resByName = await app.inject({
        method: "GET",
        url: "/api/admin/members?search=Carlos",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyByName = JSON.parse(resByName.body);
      expect(bodyByName.members).toHaveLength(1);
      expect(bodyByName.members[0].firstName).toBe("Carlos");

      // Search by DNI
      const resByDni = await app.inject({
        method: "GET",
        url: "/api/admin/members?search=40333",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyByDni = JSON.parse(resByDni.body);
      expect(bodyByDni.members).toHaveLength(1);
      expect(bodyByDni.members[0].firstName).toBe("Maria");
    });

    it("filters by branchId", async () => {
      await createMember();

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?branchId=1",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      for (const m of body.members) {
        expect(m.branchId).toBe(1);
      }
    });

    it("filters by isActive=false returns only inactive members", async () => {
      const member = await createMember();

      // Deactivate the member
      await app.inject({
        method: "PATCH",
        url: `/api/admin/members/${member.id}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { isActive: false },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?isActive=false",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body.members.length).toBe(1);
      expect(body.members[0].isActive).toBe(false);
    });
  });

  // =========================================================================
  // POST /api/admin/members — Create Member
  // =========================================================================
  describe("POST /api/admin/members", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
    });

    it("creates a member with all required fields and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: baseMember,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("id");
      expect(body.email).toBe(baseMember.email);
      expect(body.firstName).toBe(baseMember.firstName);
      expect(body.lastName).toBe(baseMember.lastName);
      expect(body.phone).toBe(baseMember.phone);
      expect(body.dni).toBe(baseMember.dni);
      expect(body.branchId).toBe(baseMember.branchId);
      expect(body.isActive).toBe(true);
      expect(body.level).toBe("alfa");
      expect(body.role).toBe("member");
      expect(body).toHaveProperty("branchName");
      expect(body).toHaveProperty("createdAt");
    });

    it("returns 409 for duplicate email", async () => {
      await createMember();

      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ...baseMember, dni: "99999999" }, // different DNI, same email
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("email");
    });

    it("returns 409 for duplicate DNI", async () => {
      await createMember();

      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...baseMember,
          email: "different@test.com", // different email, same DNI
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("DNI");
    });
  });

  // =========================================================================
  // GET /api/admin/members/:userId — Get Member Profile
  // =========================================================================
  describe("GET /api/admin/members/:userId", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
    });

    it("returns full member profile", async () => {
      const member = await createMember({
        dateOfBirth: "1990-05-15",
        gender: "male",
        emergencyContactName: "Ana Perez",
        emergencyContactPhone: "+5491155559999",
        emergencyContactRelationship: "Madre",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(member.id);
      expect(body.dateOfBirth).toBe("1990-05-15");
      expect(body.gender).toBe("male");
      expect(body.emergencyContactName).toBe("Ana Perez");
      expect(body.emergencyContactPhone).toBe("+5491155559999");
      expect(body.emergencyContactRelationship).toBe("Madre");
    });

    it("returns 404 for non-existent member", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/99999",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // PUT /api/admin/members/:userId — Update Member
  // =========================================================================
  describe("PUT /api/admin/members/:userId", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
    });

    it("updates profile fields", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          firstName: "Carlos",
          phone: "+5491199998888",
          level: "delta",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.firstName).toBe("Carlos");
      expect(body.phone).toBe("+5491199998888");
      expect(body.level).toBe("delta");
      // Unchanged fields preserved
      expect(body.lastName).toBe(baseMember.lastName);
    });

    it("returns 404 for non-existent member", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/admin/members/99999",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { firstName: "Ghost" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // PATCH /api/admin/members/:userId/status — Toggle Active
  // =========================================================================
  describe("PATCH /api/admin/members/:userId/status", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
    });

    it("toggles isActive to false", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/members/${member.id}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { isActive: false },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.isActive).toBe(false);
    });

    it("toggles isActive back to true", async () => {
      const member = await createMember();

      // Deactivate
      await app.inject({
        method: "PATCH",
        url: `/api/admin/members/${member.id}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { isActive: false },
      });

      // Reactivate
      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/members/${member.id}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { isActive: true },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.isActive).toBe(true);
    });
  });

  // =========================================================================
  // GET /api/admin/members/check-dni — DNI Uniqueness Check
  // =========================================================================
  describe("GET /api/admin/members/check-dni", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
    });

    it("returns available=true for unused DNI", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/check-dni?dni=99999999",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.available).toBe(true);
    });

    it("returns available=false with existing member name for taken DNI", async () => {
      await createMember({ firstName: "Pedro", lastName: "Garcia" });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/check-dni?dni=${baseMember.dni}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.available).toBe(false);
      expect(body.existingMemberName).toBe("Pedro Garcia");
    });

    it("excludes a specific user from uniqueness check", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/check-dni?dni=${baseMember.dni}&excludeUserId=${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.available).toBe(true);
    });
  });

  // =========================================================================
  // Notes CRUD
  // =========================================================================
  describe("Notes", () => {
    let memberId: number;

    beforeEach(async () => {
      await cleanupTestMembers();
      const member = await createMember();
      memberId = member.id;
    });

    it("POST creates a note and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "Primera sesion de evaluacion completada." },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("id");
      expect(body.userId).toBe(memberId);
      expect(body.content).toBe("Primera sesion de evaluacion completada.");
      expect(body).toHaveProperty("authorName");
      expect(body).toHaveProperty("createdAt");
    });

    it("GET returns notes with author info ordered by most recent", async () => {
      // Create two notes
      await app.inject({
        method: "POST",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "Nota 1" },
      });
      await app.inject({
        method: "POST",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "Nota 2" },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.notes).toHaveLength(2);
      // Most recent first
      expect(body.notes[0].content).toBe("Nota 2");
      expect(body.notes[1].content).toBe("Nota 1");
      // Author info present
      expect(body.notes[0]).toHaveProperty("authorId");
      expect(body.notes[0]).toHaveProperty("authorName");
    });

    it("PUT updates note content", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "Original" },
      });
      const note = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${memberId}/notes/${note.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "Updated content" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.content).toBe("Updated content");
    });

    it("DELETE removes note", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { content: "To be deleted" },
      });
      const note = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/admin/members/${memberId}/notes/${note.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);

      // Verify it's gone
      const listRes = await app.inject({
        method: "GET",
        url: `/api/admin/members/${memberId}/notes`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const listBody = JSON.parse(listRes.body);
      expect(listBody.notes).toHaveLength(0);
    });
  });

  // =========================================================================
  // Authorization
  // =========================================================================
  describe("Authorization", () => {
    it("non-admin user gets 403 on all /admin/members endpoints", async () => {
      // Register a regular member
      const { token: memberToken } = await registerUser(app, {
        email: "regular-member-auth@test.com",
        password: "pass123456",
        branchId: 1,
        firstName: "Regular",
        lastName: "Member",
      });

      const endpoints = [
        { method: "GET" as const, url: "/api/admin/members" },
        { method: "GET" as const, url: "/api/admin/members/1" },
        {
          method: "POST" as const,
          url: "/api/admin/members",
          payload: baseMember,
        },
        {
          method: "PUT" as const,
          url: "/api/admin/members/1",
          payload: { firstName: "Hacked" },
        },
        {
          method: "PATCH" as const,
          url: "/api/admin/members/1/status",
          payload: { isActive: false },
        },
        {
          method: "GET" as const,
          url: "/api/admin/members/check-dni?dni=12345",
        },
        { method: "GET" as const, url: "/api/admin/members/1/notes" },
        {
          method: "POST" as const,
          url: "/api/admin/members/1/notes",
          payload: { content: "hacked" },
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
  // Deactivated login block
  // =========================================================================
  describe("Deactivated user login block", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
    });

    it("deactivated user cannot login (returns 401)", async () => {
      // Create a member via admin API
      const member = await createMember({
        email: "deactivated@test.com",
        dni: "50111222",
        password: "pass123456",
      });

      // Deactivate
      await app.inject({
        method: "PATCH",
        url: `/api/admin/members/${member.id}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { isActive: false },
      });

      // Attempt login
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "deactivated@test.com", password: "pass123456" },
      });

      expect(loginRes.statusCode).toBe(401);
      const body = JSON.parse(loginRes.body);
      expect(body.message).toContain("desactivada");
    });
  });
});
