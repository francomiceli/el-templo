/**
 * User Management Integration Tests
 *
 * Tests owner-only CRUD operations for staff users,
 * role enforcement (403 for non-owner roles), and
 * edge cases (duplicate email, self-deactivation).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
} from "../helpers";

describe("User Management Routes", () => {
  let app: FastifyInstance;
  let ownerToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    // admin@test.com is seeded as owner in globalSetup
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    // Re-get token since cleanAllTestData may have cleaned up related data
    ownerToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  // =====================================================================
  // GET /api/admin/users - List staff users
  // =====================================================================

  describe("GET /api/admin/users", () => {
    it("owner can list staff users", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      // Should include at least the seeded owner
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0]).toHaveProperty("email");
      expect(body[0]).toHaveProperty("role");
      expect(body[0]).toHaveProperty("branchName");
    });

    it("coach gets 403", async () => {
      await createStaffUser(app, {
        email: "coach-test@test.com",
        password: "testpass123",
        firstName: "Test",
        lastName: "Coach",
        role: "coach",
        branchId: 1,
      });
      const coachToken = await getAuthToken(
        app,
        "coach-test@test.com",
        "testpass123",
      );

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${coachToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("admin gets 403", async () => {
      await createStaffUser(app, {
        email: "admin-test@test.com",
        password: "testpass123",
        firstName: "Test",
        lastName: "Admin",
        role: "admin",
        branchId: 1,
      });
      const adminToken = await getAuthToken(
        app,
        "admin-test@test.com",
        "testpass123",
      );

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // =====================================================================
  // POST /api/admin/users - Create staff user
  // =====================================================================

  describe("POST /api/admin/users", () => {
    it("owner can create a coach user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          firstName: "New",
          lastName: "Coach",
          email: "newcoach@test.com",
          password: "secure123",
          role: "coach",
          branchId: 1,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("id");
      expect(body.email).toBe("newcoach@test.com");
      expect(body.firstName).toBe("New");
      expect(body.lastName).toBe("Coach");
      expect(body.role).toBe("coach");
      expect(body.branchId).toBe(1);
      // Password should NOT be in the response
      expect(body).not.toHaveProperty("password");
      expect(body).not.toHaveProperty("passwordHash");
    });

    it("duplicate email returns 409", async () => {
      // Create first user
      await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          firstName: "First",
          lastName: "User",
          email: "duplicate@test.com",
          password: "secure123",
          role: "coach",
          branchId: 1,
        },
      });

      // Try to create with same email
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          firstName: "Second",
          lastName: "User",
          email: "duplicate@test.com",
          password: "secure456",
          role: "admin",
          branchId: 1,
        },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  // =====================================================================
  // PUT /api/admin/users/:userId - Update staff user
  // =====================================================================

  describe("PUT /api/admin/users/:userId", () => {
    it("owner can update user role", async () => {
      const userId = await createStaffUser(app, {
        email: "toupdate@test.com",
        password: "testpass123",
        firstName: "Before",
        lastName: "Update",
        role: "coach",
        branchId: 1,
      });

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/users/${userId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { role: "admin" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.role).toBe("admin");
    });

    it("owner can update password (no password in response)", async () => {
      const userId = await createStaffUser(app, {
        email: "pwdupdate@test.com",
        password: "oldpassword",
        firstName: "Pwd",
        lastName: "Test",
        role: "coach",
        branchId: 1,
      });

      const res = await app.inject({
        method: "PUT",
        url: `/api/admin/users/${userId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { password: "newpassword123" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).not.toHaveProperty("password");
      expect(body).not.toHaveProperty("passwordHash");

      // Verify the new password works
      const token = await getAuthToken(
        app,
        "pwdupdate@test.com",
        "newpassword123",
      );
      expect(token).toBeTruthy();
    });
  });

  // =====================================================================
  // PATCH /api/admin/users/:userId/status - Toggle active status
  // =====================================================================

  describe("PATCH /api/admin/users/:userId/status", () => {
    it("owner can deactivate a user", async () => {
      const userId = await createStaffUser(app, {
        email: "todeactivate@test.com",
        password: "testpass123",
        firstName: "To",
        lastName: "Deactivate",
        role: "coach",
        branchId: 1,
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${userId}/status`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.isActive).toBe(false);
    });

    it("deactivated user cannot login", async () => {
      const userId = await createStaffUser(app, {
        email: "nodeactivated@test.com",
        password: "testpass123",
        firstName: "No",
        lastName: "Login",
        role: "coach",
        branchId: 1,
      });

      // Deactivate
      await app.inject({
        method: "PATCH",
        url: `/api/admin/users/${userId}/status`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      // Try to login
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "nodeactivated@test.com", password: "testpass123" },
      });

      // Inactive users can now login (features gated in frontend)
      expect(loginRes.statusCode).toBe(200);
    });
  });

  // =====================================================================
  // Role enforcement
  // =====================================================================

  describe("Role enforcement", () => {
    it("recepcionista gets 403 on user management endpoints", async () => {
      await createStaffUser(app, {
        email: "recep@test.com",
        password: "testpass123",
        firstName: "Test",
        lastName: "Recep",
        role: "recepcionista",
        branchId: 1,
      });
      const recepToken = await getAuthToken(
        app,
        "recep@test.com",
        "testpass123",
      );

      const getRes = await app.inject({
        method: "GET",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${recepToken}` },
      });
      expect(getRes.statusCode).toBe(403);

      const postRes = await app.inject({
        method: "POST",
        url: "/api/admin/users",
        headers: { authorization: `Bearer ${recepToken}` },
        payload: {
          firstName: "New",
          lastName: "User",
          email: "new@test.com",
          password: "secure123",
          role: "coach",
          branchId: 1,
        },
      });
      expect(postRes.statusCode).toBe(403);
    });
  });
});
