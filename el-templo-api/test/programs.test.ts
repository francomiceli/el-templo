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

  const timestamp = Date.now();
  const adminEmail = `prog-admin-${timestamp}@test.com`;
  const adminPassword = "admin-pass-123";
  const memberEmail = `prog-member-${timestamp}@test.com`;
  const memberPassword = "member-pass-123";

  const testProgram = {
    name: `Test Program ${timestamp}`,
    description: "A test micro-program for integration tests",
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

    it("should update program name", async () => {
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
        payload: { name: "Updated Program" },
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

    /** Helper: create enrollment directly in DB (manual enroll route removed). */
    async function createEnrollment(
      userId: number,
      progId: number,
    ): Promise<number> {
      const [result] = await app.db.insert(schema.programEnrollments).values({
        userId,
        programId: progId,
        status: "active",
        currentWeek: 1,
        sessionsCompletedThisWeek: 0,
      });
      return Number(result.insertId);
    }

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

    it("should get enrollments for user", async () => {
      // Enroll directly via DB
      await createEnrollment(memberId, programId);

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
      // Enroll directly via DB
      const eId = await createEnrollment(memberId, programId);

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
      // Enroll directly via DB
      const eId = await createEnrollment(memberId, programId);

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
      // Enroll directly via DB
      await app.db.insert(schema.programEnrollments).values({
        userId: memberId,
        programId,
        status: "active",
        currentWeek: 1,
        sessionsCompletedThisWeek: 0,
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
      // Enroll directly via DB
      await app.db.insert(schema.programEnrollments).values({
        userId: memberId,
        programId,
        status: "active",
        currentWeek: 1,
        sessionsCompletedThisWeek: 0,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/members/programs/has-goal-plan-access",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.hasAccess).toBe(true);
    });

    it("should return has-goal-plan-access false when not enrolled", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/members/programs/has-goal-plan-access",
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
  // 4b. RBAC Dueño-only del CRUD admin de programs (D-15/D-04)
  //
  // Programas es una superficie de entrenamiento Dueño-only. El CRUD admin
  // gateaba históricamente con CAJA_ROLES (incluye gestion), abriendo una
  // puerta trasera por API. Estos tests aseguran gestion → 403 en el CRUD
  // admin; el dueño (admin) sigue operando (cubierto en "Program CRUD (admin)").
  // =========================================================================
  describe("RBAC Dueño-only (D-15)", () => {
    let gestionToken: string;

    beforeEach(async () => {
      await createStaffUser(app, {
        email: `prog-gestion-${timestamp}@test.com`,
        password: "gestion-pass-123",
        firstName: "Gestion",
        lastName: "Test",
        role: "gestion",
        branchId: 1,
      });
      gestionToken = await getAuthToken(
        app,
        `prog-gestion-${timestamp}@test.com`,
        "gestion-pass-123",
      );
    });

    it("gestion gets 403 across the admin CRUD of programs", async () => {
      const endpoints = [
        {
          method: "POST" as const,
          url: "/api/admin/programs",
          payload: testProgram,
        },
        { method: "GET" as const, url: "/api/admin/programs/analytics" },
        {
          method: "GET" as const,
          url: "/api/admin/programs/1",
        },
        {
          method: "PUT" as const,
          url: "/api/admin/programs/1",
          payload: { name: "Hack" },
        },
        {
          method: "POST" as const,
          url: "/api/admin/programs/1/content",
          payload: {
            blocks: [
              {
                weekNumber: 1,
                sortOrder: 0,
                blockType: "text" as const,
                title: "x",
              },
            ],
          },
        },
        {
          method: "POST" as const,
          url: "/api/admin/programs/1/deactivate",
        },
      ];

      for (const ep of endpoints) {
        const res = await app.inject({
          method: ep.method,
          url: ep.url,
          headers: { authorization: `Bearer ${gestionToken}` },
          payload: "payload" in ep ? ep.payload : undefined,
        });
        expect(
          res.statusCode,
          `Expected 403 for ${ep.method} ${ep.url}, got ${res.statusCode}`,
        ).toBe(403);
      }
    });

    it("gestion puede LISTAR programas — GET /admin/programs → 200 (CR-01)", async () => {
      // El listado del catálogo se reabrió al staff administrativo
      // (PROGRAMAS_LIST_ROLES) para que la columna "Programa" de /planes y el
      // diálogo "Asignar programa adicional" funcionen. La escritura/detalle
      // sigue dueño-only (cubierto en el loop de 403 de arriba).
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${gestionToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.programs)).toBe(true);
    });

    it("coach NO puede listar programas — GET /admin/programs → 403 (D-10)", async () => {
      // Programas es superficie de entrenamiento que NO se le muestra al profe
      // (D-10). Coach queda excluido de PROGRAMAS_LIST_ROLES.
      const coachEmail = `prog-coach-${timestamp}@test.com`;
      await createStaffUser(app, {
        email: coachEmail,
        password: "coach-pass-123",
        firstName: "Coach",
        lastName: "Test",
        role: "coach",
        branchId: 1,
      });
      const coachToken = await getAuthToken(app, coachEmail, "coach-pass-123");
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/programs",
        headers: { authorization: `Bearer ${coachToken}` },
      });
      expect(res.statusCode).toBe(403);
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

      // Enroll directly via DB
      await app.db.insert(schema.programEnrollments).values({
        userId: memberId,
        programId,
        status: "active",
        currentWeek: 1,
        sessionsCompletedThisWeek: 0,
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
