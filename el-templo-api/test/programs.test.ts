import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  registerUser,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";

describe("Programs Module", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;
  let memberId: number;
  let createdProgramId: number;
  let enrollmentId: number;

  const timestamp = Date.now();
  const adminEmail = `prog-admin-${timestamp}@test.com`;
  const adminPassword = "admin-pass-123";
  const memberEmail = `prog-member-${timestamp}@test.com`;
  const memberPassword = "member-pass-123";

  const testProgram = {
    name: `Test Program ${timestamp}`,
    description: "A test micro-program for integration tests",
    price: 20000,
    durationWeeks: 4,
    sessionsPerWeekToAdvance: 3,
    auraWeeklyBonus: 15,
    auraCompletionBonus: 100,
    contentBlocks: [
      {
        weekNumber: 1,
        sortOrder: 0,
        blockType: "text" as const,
        title: "Week 1 Introduction",
        content: "Welcome to week 1 of the program",
        videoUrl: null,
        exerciseId: null,
      },
      {
        weekNumber: 1,
        sortOrder: 1,
        blockType: "text" as const,
        title: "Week 1 Guide",
        content: "Follow this guide for week 1",
        videoUrl: null,
        exerciseId: null,
      },
    ],
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Create admin user
    const adminId = await createStaffUser(app, {
      email: adminEmail,
      password: adminPassword,
      firstName: "Admin",
      lastName: "Test",
      role: "admin",
      branchId: 1,
    });
    adminToken = await getAuthToken(app, adminEmail, adminPassword);

    // Create member user
    const memberResult = await registerUser(app, {
      email: memberEmail,
      password: memberPassword,
      branchId: 1,
    });
    memberToken = memberResult.token;
    memberId = (memberResult.user as { id: number }).id;
  });

  // =========================================================================
  // 1. Program CRUD (admin)
  // =========================================================================
  describe("Program CRUD (admin)", () => {
    it("should create a program with content blocks", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: testProgram,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeTypeOf("number");
      createdProgramId = body.id;
    });

    it("should list programs", async () => {
      // Create a program first
      const createRes = await app.inject({
        method: "POST",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: testProgram,
      });
      const createBody = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.programs).toBeInstanceOf(Array);
      expect(body.programs.length).toBeGreaterThanOrEqual(1);
      const found = body.programs.find(
        (p: { id: number }) => p.id === createBody.id,
      );
      expect(found).toBeDefined();
    });

    it("should get program detail with content blocks", async () => {
      // Create a program first
      const createRes = await app.inject({
        method: "POST",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: testProgram,
      });
      const { id } = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/programs/${id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe(testProgram.name);
      expect(body.contentBlocks).toBeInstanceOf(Array);
      expect(body.contentBlocks.length).toBe(2);
      expect(body.activeEnrollmentCount).toBe(0);
    });

    it("should update program name and price", async () => {
      // Create a program first
      const createRes = await app.inject({
        method: "POST",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: testProgram,
      });
      const { id } = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/programs/${id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "Updated Program", price: 25000 },
      });

      expect(res.statusCode).toBe(200);

      // Verify the update
      const detailRes = await app.inject({
        method: "GET",
        url: `/api/admin/programs/${id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const detail = JSON.parse(detailRes.body);
      expect(detail.name).toBe("Updated Program");
      expect(detail.price).toBe(25000);
    });

    it("should deactivate program", async () => {
      // Create a program first
      const createRes = await app.inject({
        method: "POST",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: testProgram,
      });
      const { id } = JSON.parse(createRes.body);

      const res = await app.inject({
        method: "POST",
        url: `/api/admin/programs/${id}/deactivate`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);

      // Verify deactivation
      const detailRes = await app.inject({
        method: "GET",
        url: `/api/admin/programs/${id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const detail = JSON.parse(detailRes.body);
      expect(detail.isActive).toBe(false);
    });
  });

  // =========================================================================
  // 2. Enrollment lifecycle (admin)
  // =========================================================================
  describe("Enrollment lifecycle (admin)", () => {
    let programId: number;

    beforeEach(async () => {
      // Create a program for enrollment tests
      const createRes = await app.inject({
        method: "POST",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: testProgram,
      });
      programId = JSON.parse(createRes.body).id;
    });

    it("should enroll member in program", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/programs/enroll",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberId,
          programId,
          paymentAmount: 20000,
          paymentMethod: "transferencia",
          notes: null,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.enrollmentId).toBeTypeOf("number");
      enrollmentId = body.enrollmentId;
    });

    it("should reject duplicate active enrollment", async () => {
      // First enrollment
      await app.inject({
        method: "POST",
        url: "/api/admin/programs/enroll",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberId,
          programId,
          paymentAmount: 20000,
          paymentMethod: "transferencia",
          notes: null,
        },
      });

      // Duplicate enrollment
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/programs/enroll",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberId,
          programId,
          paymentAmount: 20000,
          paymentMethod: "transferencia",
          notes: null,
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("ya tiene un programa activo");
    });

    it("should get enrollments for user", async () => {
      // Enroll first
      await app.inject({
        method: "POST",
        url: "/api/admin/programs/enroll",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberId,
          programId,
          paymentAmount: 20000,
          paymentMethod: "transferencia",
          notes: null,
        },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/programs/enrollments/user/${memberId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.enrollments).toBeInstanceOf(Array);
      expect(body.enrollments.length).toBe(1);
      expect(body.enrollments[0].status).toBe("active");
    });

    it("should advance enrollment week", async () => {
      // Enroll first
      const enrollRes = await app.inject({
        method: "POST",
        url: "/api/admin/programs/enroll",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberId,
          programId,
          paymentAmount: 20000,
          paymentMethod: "transferencia",
          notes: null,
        },
      });
      const eId = JSON.parse(enrollRes.body).enrollmentId;

      // Advance week
      const res = await app.inject({
        method: "POST",
        url: `/api/admin/programs/enrollments/${eId}/advance`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);

      // Verify advancement
      const enrollmentsRes = await app.inject({
        method: "GET",
        url: `/api/admin/programs/enrollments/user/${memberId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const enrollments = JSON.parse(enrollmentsRes.body).enrollments;
      expect(enrollments[0].currentWeek).toBe(2);
    });

    it("should cancel enrollment", async () => {
      // Enroll first
      const enrollRes = await app.inject({
        method: "POST",
        url: "/api/admin/programs/enroll",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberId,
          programId,
          paymentAmount: 20000,
          paymentMethod: "transferencia",
          notes: null,
        },
      });
      const eId = JSON.parse(enrollRes.body).enrollmentId;

      // Cancel
      const res = await app.inject({
        method: "POST",
        url: `/api/admin/programs/enrollments/${eId}/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);

      // Verify cancellation
      const enrollmentsRes = await app.inject({
        method: "GET",
        url: `/api/admin/programs/enrollments/user/${memberId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const enrollments = JSON.parse(enrollmentsRes.body).enrollments;
      expect(enrollments[0].status).toBe("cancelled");
    });
  });

  // =========================================================================
  // 3. Member endpoints
  // =========================================================================
  describe("Member endpoints", () => {
    let programId: number;

    beforeEach(async () => {
      // Create a program for member tests
      const createRes = await app.inject({
        method: "POST",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: testProgram,
      });
      programId = JSON.parse(createRes.body).id;
    });

    it("should return program catalog for members", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/members/programs/catalog",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.programs).toBeInstanceOf(Array);
      expect(body.programs.length).toBeGreaterThanOrEqual(1);
    });

    it("should return 204 when no active enrollment", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/members/programs/my-progress",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(204);
    });

    it("should return progress with programId when enrolled", async () => {
      // Enroll via admin
      await app.inject({
        method: "POST",
        url: "/api/admin/programs/enroll",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberId,
          programId,
          paymentAmount: 20000,
          paymentMethod: "transferencia",
          notes: null,
        },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/members/programs/my-progress",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.programId).toBe(programId);
      expect(body.currentWeek).toBe(1);
      expect(body.sessionsCompletedThisWeek).toBe(0);
      expect(body.contentBlocks).toBeInstanceOf(Array);
      expect(body.contentBlocks.length).toBe(2);
    });

    it("should return has-goal-plan-access true when enrolled", async () => {
      // Enroll via admin
      await app.inject({
        method: "POST",
        url: "/api/admin/programs/enroll",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberId,
          programId,
          paymentAmount: 20000,
          paymentMethod: "transferencia",
          notes: null,
        },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/members/programs/has-personalizada-access",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.hasAccess).toBe(true);
    });

    it("should return has-goal-plan-access false when not enrolled", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/members/programs/has-personalizada-access",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.hasAccess).toBe(false);
    });
  });

  // =========================================================================
  // 4. Auth/permissions
  // =========================================================================
  describe("Auth/permissions", () => {
    it("should reject member creating program", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: testProgram,
      });

      expect(res.statusCode).toBe(403);
    });

    it("should reject unauthenticated catalog request", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/members/programs/catalog",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // 5. Analytics
  // =========================================================================
  describe("Analytics", () => {
    it("should return program analytics", async () => {
      // Create a program and enroll a member to have some data
      const createRes = await app.inject({
        method: "POST",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: testProgram,
      });
      const programId = JSON.parse(createRes.body).id;

      await app.inject({
        method: "POST",
        url: "/api/admin/programs/enroll",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberId,
          programId,
          paymentAmount: 20000,
          paymentMethod: "transferencia",
          notes: null,
        },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/programs/analytics",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalEnrollments).toBeGreaterThanOrEqual(1);
      expect(body.activeEnrollments).toBeGreaterThanOrEqual(0);
      expect(body.completedCount).toBeGreaterThanOrEqual(0);
    });
  });
});
