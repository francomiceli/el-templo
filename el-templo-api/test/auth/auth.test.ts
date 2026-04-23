import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser } from "../helpers";
import * as schema from "../../src/db/schema";

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
          gender: "male",
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
          gender: "male",
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
          gender: "male",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("rejects duplicate email with 409", async () => {
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
          gender: "male",
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
          gender: "male",
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Email en uso");
    });

    it("rejects duplicate DNI with 409", async () => {
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
          dni: "AUTH-DNIDUP-001",
          phone: "+5491100000098",
          gender: "male",
        },
      });

      // Second registration with same DNI, different email
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: "dnisecond@test.com",
          password: "password123",
          branchId: 1,
          firstName: "Dni",
          lastName: "Second",
          dni: "AUTH-DNIDUP-001",
          phone: "+5491100000099",
          gender: "male",
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("DNI en uso");
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
          gender: "male",
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("Sucursal invalida");
    });

    it("registers successfully without DNI (optional)", async () => {
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
          gender: "male",
        },
      });

      expect(res.statusCode).toBe(200);
    });

    it("registers successfully without phone (optional)", async () => {
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
          gender: "male",
        },
      });

      expect(res.statusCode).toBe(200);
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

    it("exposes dateOfBirth and gender so the app can skip the onboarding DOB step for admin-created members", async () => {
      // Simulate an admin-created account by writing DOB + gender directly to
      // the row after registration (the /register endpoint does not accept a
      // DOB, but /admin/members and manual DB work do). The login response
      // must surface both fields so OnboardingPage can derive the age bucket
      // up-front (see deriveAgeRangeFromDob in the app).
      const { user: registered } = await registerUser(app, {
        email: "dob-login@test.com",
        password: "password123",
        branchId: 1,
      });
      await app.db
        .update(schema.users)
        .set({ dateOfBirth: "1990-06-15", gender: "female" })
        .where(eq(schema.users.id, (registered as { id: number }).id));

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "dob-login@test.com", password: "password123" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.dateOfBirth).toBe("1990-06-15");
      expect(body.user.gender).toBe("female");
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
      expect(body.message).toContain("Credenciales invalidas");
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
      expect(body.message).toContain("Credenciales invalidas");
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
      expect(body).toHaveProperty("role", "owner");
      expect(body).toHaveProperty("branchId");
    });

    it("exposes dateOfBirth (null when not set)", async () => {
      const { token } = await registerUser(app, {
        email: "me-dob-null@test.com",
        password: "password123",
        branchId: 1,
        dni: "AUTH-ME-DOB-NULL",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("dateOfBirth");
      expect(body.dateOfBirth).toBeNull();
    });

    it("returns stored dateOfBirth in YYYY-MM-DD format", async () => {
      const { user, token } = await registerUser(app, {
        email: "me-dob-set@test.com",
        password: "password123",
        branchId: 1,
        dni: "AUTH-ME-DOB-SET",
      });

      await app.db
        .update(schema.users)
        .set({ dateOfBirth: "1990-06-15" })
        .where(eq(schema.users.id, user.id as number));

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.dateOfBirth).toBe("1990-06-15");
    });
  });
});
