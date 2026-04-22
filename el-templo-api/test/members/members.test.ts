import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { users } from "../../src/db/schema/users";
import { memberNotes } from "../../src/db/schema/member-notes";
import { payments } from "../../src/db/schema/payments";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { auraBalances } from "../../src/db/schema/aura-balances";
import { attendance } from "../../src/db/schema/attendance";
import { bookings } from "../../src/db/schema/bookings";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import { holidays } from "../../src/db/schema/holidays";
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";
import { memberProfiles } from "../../src/db/schema/member-profiles";

describe("Members Management Routes", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testPlanId: number;

  // Reusable member payload (planId set in beforeEach after plan creation)
  const getBaseMember = () => ({
    email: "member@test-members.com",
    firstName: "Juan",
    lastName: "Perez",
    phone: "+5491155551234",
    dni: "30123456",
    branchId: 1,
    planId: testPlanId,
  });

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Helper: clean up test members (not the admin seed user).
   * Also cleans up member_notes, subscriptions, plans.
   */
  async function cleanupTestMembers(): Promise<void> {
    await cleanAllTestData(app);
  }

  /**
   * Helper: create a test subscription plan and return its ID.
   */
  async function createTestPlan(): Promise<number> {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/subscriptions/plans",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: "Test Plan",
        planTier: "foundation",
        bookingMode: "flexible",
        priceRegular: 10000,
        priceZero: 0,
        durationDays: 30,
      },
    });
    const body = JSON.parse(res.body);
    return body.id;
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
      payload: { ...getBaseMember(), ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  // =========================================================================
  // GET /api/admin/members -- List Members
  // =========================================================================
  describe("GET /api/admin/members", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
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

    it("search matches full name across firstName + lastName tokens", async () => {
      await createMember({
        email: "mf@test.com",
        firstName: "Martin",
        lastName: "Figueras",
        dni: "40555666",
      });
      // Decoy member: same first name, different last name
      await createMember({
        email: "mg@test.com",
        firstName: "Martin",
        lastName: "Gomez",
        dni: "40777888",
      });

      // First name alone finds both Martins
      const resFirst = await app.inject({
        method: "GET",
        url: "/api/admin/members?search=Martin",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyFirst = JSON.parse(resFirst.body);
      expect(bodyFirst.members.length).toBeGreaterThanOrEqual(2);

      // Full name in order finds only Martin Figueras
      const resFull = await app.inject({
        method: "GET",
        url: "/api/admin/members?search=Martin%20Figueras",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyFull = JSON.parse(resFull.body);
      expect(bodyFull.members).toHaveLength(1);
      expect(bodyFull.members[0].lastName).toBe("Figueras");

      // Full name in reversed order also finds Martin Figueras
      const resReversed = await app.inject({
        method: "GET",
        url: "/api/admin/members?search=Figueras%20Martin",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyReversed = JSON.parse(resReversed.body);
      expect(bodyReversed.members).toHaveLength(1);
      expect(bodyReversed.members[0].lastName).toBe("Figueras");
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

      // isActive is derived from subscriptions: cancel the member's sub so
      // they become derivably inactive.
      await app.inject({
        method: "POST",
        url: `/api/admin/subscriptions/members/${member.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
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

    it("returns planName field for members with active subscription", async () => {
      await createMember();

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      // Member was created with planId => auto-subscription => planName should be set
      expect(body.members[0]).toHaveProperty("planName", "Test Plan");
    });

    it("filters by planId returns only members with that plan", async () => {
      // Create a second plan
      const secondPlanRes = await app.inject({
        method: "POST",
        url: "/api/admin/subscriptions/plans",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Second Plan",
          planTier: "flex",
          bookingMode: "flexible",
          priceRegular: 5000,
          priceZero: 0,
          durationDays: 30,
        },
      });
      const secondPlanId = JSON.parse(secondPlanRes.body).id;

      await createMember();
      await createMember({
        email: "member2@test.com",
        dni: "40555666",
        planId: secondPlanId,
      });

      // Filter by first plan
      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members?planId=${testPlanId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body.members).toHaveLength(1);
      expect(body.members[0].planName).toBe("Test Plan");
    });

    it("filters by planId=0 returns members without active subscription", async () => {
      // Create member with subscription
      await createMember();

      // Create member without subscription by registering via auth (no plan)
      await registerUser(app, {
        email: "noplan@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?planId=0",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body.members).toHaveLength(1);
      expect(body.members[0].email).toBe("noplan@test.com");
      expect(body.members[0].planName).toBeNull();
    });
  });

  // =========================================================================
  // POST /api/admin/members -- Create Member
  // =========================================================================
  describe("POST /api/admin/members", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("creates a member with all required fields and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: getBaseMember(),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("id");
      expect(body.email).toBe(getBaseMember().email);
      expect(body.firstName).toBe(getBaseMember().firstName);
      expect(body.lastName).toBe(getBaseMember().lastName);
      expect(body.phone).toBe(getBaseMember().phone);
      expect(body.dni).toBe(getBaseMember().dni);
      expect(body.branchId).toBe(getBaseMember().branchId);
      expect(body.isActive).toBe(true);
      expect(body.level).toBe("alfa");
      expect(body.role).toBe("member");
      expect(body).toHaveProperty("branchName");
      expect(body).toHaveProperty("createdAt");
      // tempPassword must NOT leak in response
      expect(body).not.toHaveProperty("tempPassword");
    });

    it("auto-creates subscription when member is created with planId", async () => {
      const member = await createMember();

      // Verify subscription exists via subscriptions API
      const subRes = await app.inject({
        method: "GET",
        url: `/api/admin/subscriptions/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(subRes.statusCode).toBe(200);
      const subBody = JSON.parse(subRes.body);
      expect(subBody).toHaveProperty("id");
      expect(subBody.planId).toBe(testPlanId);
      expect(subBody.status).toBe("active");
      expect(subBody.planName).toBe("Test Plan");
    });

    it("returns 409 for duplicate email", async () => {
      await createMember();

      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ...getBaseMember(), dni: "99999999" }, // different DNI, same email
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
          ...getBaseMember(),
          email: "different@test.com", // different email, same DNI
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("DNI");
    });
  });

  // =========================================================================
  // GET /api/admin/members/:userId -- Get Member Profile
  // =========================================================================
  describe("GET /api/admin/members/:userId", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
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
  // PUT /api/admin/members/:userId -- Update Member
  // =========================================================================
  describe("PUT /api/admin/members/:userId", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
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
      expect(body.lastName).toBe(getBaseMember().lastName);
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
  // GET /api/admin/members/check-dni -- DNI Uniqueness Check
  // =========================================================================
  describe("GET /api/admin/members/check-dni", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
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
        url: `/api/admin/members/check-dni?dni=${getBaseMember().dni}`,
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
        url: `/api/admin/members/check-dni?dni=${getBaseMember().dni}&excludeUserId=${member.id}`,
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
      testPlanId = await createTestPlan();
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
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

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
          payload: getBaseMember(),
        },
        {
          method: "PUT" as const,
          url: "/api/admin/members/1",
          payload: { firstName: "Hacked" },
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
  // documentType and address fields
  // =========================================================================
  describe("documentType and address fields", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("POST creates member with documentType and address", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...getBaseMember(),
          documentType: "DNI",
          address: "Calle Falsa 123",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.documentType).toBe("DNI");
      expect(body.address).toBe("Calle Falsa 123");
    });

    it("POST creates member without documentType/address (backward compatible)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: getBaseMember(),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.documentType).toBeNull();
      expect(body.address).toBeNull();
    });

    it("PUT updates documentType and address", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          documentType: "Pasaporte",
          address: "Av. Siempre Viva 742",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.documentType).toBe("Pasaporte");
      expect(body.address).toBe("Av. Siempre Viva 742");
    });

    it("PUT with documentType=null clears the field", async () => {
      const member = await createMember({
        documentType: "DNI",
        address: "Calle Test 456",
      });

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          documentType: null,
          address: null,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.documentType).toBeNull();
      expect(body.address).toBeNull();
    });

    it("GET member profile returns documentType and address", async () => {
      const member = await createMember({
        documentType: "NIE",
        address: "Gran Via 100, Madrid",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.documentType).toBe("NIE");
      expect(body.address).toBe("Gran Via 100, Madrid");
    });

    it("GET member list includes documentType", async () => {
      await createMember({ documentType: "NIF" });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      expect(body.members[0]).toHaveProperty("documentType");
      expect(body.members[0].documentType).toBe("NIF");
    });
  });

  // =========================================================================
  // Member export
  // =========================================================================
  describe("Member export", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("export returns 200 with xlsx Content-Type and Content-Disposition", async () => {
      await createMember({ firstName: "Juan", lastName: "Perez" });
      await createMember({
        email: "member2@test.com",
        dni: "40111222",
        firstName: "Maria",
        lastName: "Lopez",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/export",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const disposition = res.headers["content-disposition"] as string;
      expect(disposition).toContain("attachment");
      expect(disposition).toContain(".xlsx");
      // Response body should be a non-empty buffer
      expect(res.rawPayload.length).toBeGreaterThan(0);
    });

    it("filter params (isActive=true) reduce result set correctly", async () => {
      // Create active member
      await createMember({
        firstName: "Activo",
        lastName: "Member",
        email: "activo@test.com",
        dni: "50111111",
      });
      // Create member then deactivate by cancelling their subscription
      // (isActive is derived from subs, not the stale users.is_active column).
      const inactive = await createMember({
        firstName: "Inactivo",
        lastName: "Member",
        email: "inactivo@test.com",
        dni: "50222222",
      });
      await app.inject({
        method: "POST",
        url: `/api/admin/subscriptions/members/${inactive.id}/subscription/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members/export?isActive=true",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);

      // Parse the xlsx buffer with exceljs to verify contents
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      await workbook.xlsx.load(res.rawPayload);

      const sheet = workbook.getWorksheet("Alumnos");
      expect(sheet).toBeDefined();

      // Row 1 is header, data rows start at 2
      // Only the active member should appear
      expect(sheet!.rowCount).toBe(2); // 1 header + 1 data row

      const dataRow = sheet!.getRow(2);
      // Column 1 = Nombre, Column 8 = Estado
      expect(dataRow.getCell(1).value).toBe("Activo Member");
      expect(dataRow.getCell(8).value).toBe("Activo");
    });
  });

  // =========================================================================
  // Member photo upload URL
  // =========================================================================
  describe("Member photo upload URL", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("returns 503 when R2 is not configured", async () => {
      // In the test environment, R2 is not configured (no R2_ACCOUNT_ID env var),
      // so fastify.r2 should be undefined and the endpoint should return 503.
      const hasR2 = !!process.env.R2_ACCOUNT_ID;
      if (hasR2) {
        // If R2 is configured in test env, skip this test
        return;
      }

      const member = await createMember();

      const res = await app.inject({
        method: "POST",
        url: `/api/admin/members/${member.id}/photo/upload-url`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { filename: "profile.jpg" },
      });

      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.body);
      expect(body.message).toBe("Almacenamiento de imagenes no configurado");
    });

    it("returns photoUrl field in member profile (null by default)", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("photoUrl");
      expect(body.photoUrl).toBeNull();
    });

    it("returns photoUrl field in member list (null by default)", async () => {
      await createMember();

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      expect(body.members[0]).toHaveProperty("photoUrl");
      expect(body.members[0].photoUrl).toBeNull();
    });

    it("photoUrl persists after update via PUT", async () => {
      const member = await createMember();
      const testUrl = "https://cdn.example.com/members/photos/1-12345.jpg";

      // Update photoUrl via PUT member endpoint
      const updateRes = await app.inject({
        method: "PUT",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { photoUrl: testUrl },
      });

      expect(updateRes.statusCode).toBe(200);
      const updateBody = JSON.parse(updateRes.body);
      expect(updateBody.photoUrl).toBe(testUrl);

      // Verify it persists on GET
      const getRes = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(getRes.statusCode).toBe(200);
      const getBody = JSON.parse(getRes.body);
      expect(getBody.photoUrl).toBe(testUrl);
    });
  });

  // =========================================================================
  // avatarType filter and response field
  // =========================================================================
  describe("avatarType filter and response field", () => {
    beforeEach(async () => {
      await cleanupTestMembers();
      testPlanId = await createTestPlan();
    });

    it("GET /members returns avatarType in list response", async () => {
      const member = await createMember();

      // Seed member_profiles with avatarType
      await app.db.insert(memberProfiles).values({
        userId: member.id,
        avatarType: "B",
        onboardingCompletedAt: new Date(),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const found = body.members.find(
        (m: Record<string, unknown>) => m.id === member.id,
      );
      expect(found).toBeDefined();
      expect(found.avatarType).toBe("B");
    });

    it("GET /members?avatarType=B filters to matching members only", async () => {
      const memberA = await createMember({
        email: "avatar-a@test.com",
        dni: "60111111",
      });
      const memberB = await createMember({
        email: "avatar-b@test.com",
        dni: "60222222",
      });

      await app.db.insert(memberProfiles).values({
        userId: memberA.id,
        avatarType: "A",
        onboardingCompletedAt: new Date(),
      });
      await app.db.insert(memberProfiles).values({
        userId: memberB.id,
        avatarType: "B",
        onboardingCompletedAt: new Date(),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?avatarType=B",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members).toHaveLength(1);
      expect(body.members[0].avatarType).toBe("B");
      expect(body.members[0].id).toBe(memberB.id);
    });

    it("GET /members?avatarType=none filters to members without avatar", async () => {
      const memberWithAvatar = await createMember({
        email: "has-avatar@test.com",
        dni: "60333333",
      });
      const memberWithout = await createMember({
        email: "no-avatar@test.com",
        dni: "60444444",
      });

      // Only memberWithAvatar gets an avatar
      await app.db.insert(memberProfiles).values({
        userId: memberWithAvatar.id,
        avatarType: "A",
        onboardingCompletedAt: new Date(),
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?avatarType=none",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // memberWithout has no profile row, so no avatar_type
      const ids = body.members.map((m: Record<string, unknown>) => m.id);
      expect(ids).toContain(memberWithout.id);
      expect(ids).not.toContain(memberWithAvatar.id);
    });

    it("GET /members/:id returns avatarType in detail response", async () => {
      const member = await createMember();

      await app.db.insert(memberProfiles).values({
        userId: member.id,
        avatarType: "K",
        onboardingCompletedAt: new Date(),
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.avatarType).toBe("K");
    });

    it("GET /members/:id returns null avatarType when not set", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.avatarType).toBeNull();
    });
  });
});
