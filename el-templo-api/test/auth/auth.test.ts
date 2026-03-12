import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser } from "../helpers";

describe("Auth Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // POST /api/auth/register
  // ---------------------------------------------------------------
  describe("POST /api/auth/register", () => {
    it("registers a new user with valid data", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "newuser@test.com",
          password: "password123",
          branchId: 1,
          firstName: "New",
          lastName: "User",
          dni: "AUTH-REG-001",
          phone: "+5491100000001",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("token");
      expect(body.user).toHaveProperty("email", "newuser@test.com");
      expect(body.user).toHaveProperty("role", "member");
      expect(body.user).toHaveProperty("level", "alfa");
      expect(body.user).toHaveProperty("branchId", 1);
    });

    it("returns 400 when email is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          password: "password123",
          branchId: 1,
          firstName: "No",
          lastName: "Email",
          dni: "AUTH-NOEMAIL-001",
          phone: "+5491100000002",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when password is too short", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "short@test.com",
          password: "abc",
          branchId: 1,
          firstName: "Short",
          lastName: "Pass",
          dni: "AUTH-SHORT-001",
          phone: "+5491100000003",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 409 when registering a duplicate email", async () => {
      // First registration
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "duplicate@test.com",
          password: "password123",
          branchId: 1,
          firstName: "Dup",
          lastName: "One",
          dni: "AUTH-DUP-001",
          phone: "+5491100000004",
        },
      });

      // Second registration with same email
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "duplicate@test.com",
          password: "otherpassword",
          branchId: 1,
          firstName: "Dup",
          lastName: "Two",
          dni: "AUTH-DUP-002",
          phone: "+5491100000005",
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("already registered");
    });

    it("returns 400 for invalid branch ID", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "badbranch@test.com",
          password: "password123",
          branchId: 9999,
          firstName: "Bad",
          lastName: "Branch",
          dni: "AUTH-BADBRANCH-001",
          phone: "+5491100000006",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("Invalid branch");
    });

    it("returns 400 when DNI is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "nodni@test.com",
          password: "password123",
          branchId: 1,
          firstName: "No",
          lastName: "Dni",
          phone: "+5491100000007",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when phone is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "nophone@test.com",
          password: "password123",
          branchId: 1,
          firstName: "No",
          lastName: "Phone",
          dni: "AUTH-NOPHONE-001",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 409 when registering a duplicate DNI", async () => {
      const sharedDni = "AUTH-DUPDNI-001";

      // First registration
      await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "dnifirst@test.com",
          password: "password123",
          branchId: 1,
          firstName: "Dni",
          lastName: "First",
          dni: sharedDni,
          phone: "+5491100000008",
        },
      });

      // Second registration with same DNI
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "dnisecond@test.com",
          password: "password123",
          branchId: 1,
          firstName: "Dni",
          lastName: "Second",
          dni: sharedDni,
          phone: "+5491100000009",
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("DNI already registered");
    });
  });

  // ---------------------------------------------------------------
  // POST /api/auth/login
  // ---------------------------------------------------------------
  describe("POST /api/auth/login", () => {
    it("logs in with correct credentials", async () => {
      // Register a user first
      await registerUser(app, {
        email: "logintest@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "logintest@test.com",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("token");
      expect(body.user).toHaveProperty("email", "logintest@test.com");
      expect(body.user).toHaveProperty("role");
      expect(body.user).toHaveProperty("branchId");
    });

    it("returns 401 for wrong password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "admin@test.com",
          password: "wrongpassword",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("Invalid credentials");
    });

    it("returns 401 for nonexistent email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "nobody@test.com",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("Invalid credentials");
    });
  });

  // ---------------------------------------------------------------
  // GET /api/auth/me (protected route access)
  // ---------------------------------------------------------------
  describe("GET /api/auth/me", () => {
    it("returns 401 without Authorization header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with invalid token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: "Bearer invalid-jwt-token-here",
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns user profile with valid token", async () => {
      // Login to get a valid token (admin@test.com seeded in setup.ts)
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          email: "admin@test.com",
          password: "adminpass123",
        },
      });

      const { token } = JSON.parse(loginRes.body);

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("email", "admin@test.com");
      expect(body).toHaveProperty("role", "superadmin");
      expect(body).toHaveProperty("branchId");
    });
  });
});
