import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
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
      expect(body.user).toHaveProperty("level", "kairos");
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

    it("exposes memberSince as the user's createdAt in ISO format", async () => {
      const { user, token } = await registerUser(app, {
        email: "me-member-since@test.com",
        password: "password123",
        branchId: 1,
        dni: "AUTH-ME-SINCE",
      });

      const alta = new Date("2024-07-01T12:00:00.000Z");
      await app.db
        .update(schema.users)
        .set({ createdAt: alta })
        .where(eq(schema.users.id, user.id as number));

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.memberSince).toBe(alta.toISOString());
    });
  });

  // ---------------------------------------------------------------
  // Phase 103 R12 — staff_disabled gate + isActive removal
  // ---------------------------------------------------------------
  describe("Phase 103 R12 — staff_disabled gate, isActive removal", () => {
    let onlineBranchId: number;
    let presentialBranchId: number;
    let counter = 0;

    beforeAll(async () => {
      const branches = await app.db.select().from(schema.branches);
      const online = branches.find((b) => b.code === "ONLINE");
      const presential = branches.find((b) => b.code !== "ONLINE");
      if (!online || !presential) {
        throw new Error("R12 test setup: missing seeded branches");
      }
      onlineBranchId = online.id;
      presentialBranchId = presential.id;
    });

    type UserOverrides = Partial<typeof schema.users.$inferInsert>;
    const insertUser = async (
      overrides: UserOverrides = {},
    ): Promise<{ id: number; email: string; password: string }> => {
      counter += 1;
      const password = "password123";
      const email =
        overrides.email ??
        `r12-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}@test.com`;
      const passwordHash = await argon2.hash(password);
      const [{ id }] = await app.db
        .insert(schema.users)
        .values({
          email,
          passwordHash,
          branchId: presentialBranchId,
          firstName: "R12",
          lastName: "Test",
          role: "member",
          level: "alfa",
          status: "activo",
          ...overrides,
        })
        .$returningId();
      return { id, email, password };
    };

    it("login: active member → 200", async () => {
      const u = await insertUser();
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: u.email, password: u.password },
      });
      expect(res.statusCode).toBe(200);
    });

    it("login: soft-deleted user → 401", async () => {
      const u = await insertUser();
      await app.db
        .update(schema.users)
        .set({ deletedAt: new Date() })
        .where(eq(schema.users.id, u.id));
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: u.email, password: u.password },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toContain("eliminada");
    });

    it("login: member with status=inactivo → 200 (status is NOT a gate)", async () => {
      const u = await insertUser({ status: "inactivo" });
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: u.email, password: u.password },
      });
      expect(res.statusCode).toBe(200);
    });

    it("login: member with status=freemium → 200", async () => {
      const u = await insertUser({
        branchId: onlineBranchId,
        status: "freemium",
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: u.email, password: u.password },
      });
      expect(res.statusCode).toBe(200);
    });

    it("login: coach with staff_disabled=true → 401 (NEW R12 gate)", async () => {
      const u = await insertUser({
        role: "coach",
        status: null,
        staffDisabled: true,
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: u.email, password: u.password },
      });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).message).toContain("desactivada");
    });

    it("login: coach with staff_disabled=false → 200", async () => {
      const u = await insertUser({
        role: "coach",
        status: null,
        staffDisabled: false,
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: u.email, password: u.password },
      });
      expect(res.statusCode).toBe(200);
    });

    it("login: member with staff_disabled=true → 200 (gate only applies to non-member)", async () => {
      const u = await insertUser({ staffDisabled: true });
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: u.email, password: u.password },
      });
      expect(res.statusCode).toBe(200);
    });

    it("/login response payload does NOT include isActive or staffDisabled", async () => {
      const u = await insertUser();
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: u.email, password: u.password },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const userObj = body.user ?? body;
      expect(userObj).not.toHaveProperty("isActive");
      expect(userObj).not.toHaveProperty("staffDisabled");
    });

    it("/me response payload does NOT include isActive or staffDisabled", async () => {
      const u = await insertUser();
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: u.email, password: u.password },
      });
      const { token } = JSON.parse(loginRes.body);
      const meRes = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(meRes.statusCode).toBe(200);
      const body = JSON.parse(meRes.body);
      expect(body).not.toHaveProperty("isActive");
      expect(body).not.toHaveProperty("staffDisabled");
    });

    it("POST /me/delete-account with correct password sets deleted_at", async () => {
      const u = await insertUser();
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: u.email, password: u.password },
      });
      const { token } = JSON.parse(loginRes.body);

      const delRes = await app.inject({
        method: "POST",
        url: "/api/auth/me/delete-account",
        headers: { authorization: `Bearer ${token}` },
        payload: { password: u.password },
      });
      expect([200, 204]).toContain(delRes.statusCode);

      const [row] = await app.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, u.id));
      expect(row.deletedAt).not.toBeNull();

      // Subsequent login is rejected by the soft-delete gate
      const reloginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: u.email, password: u.password },
      });
      // After delete-account, password is replaced by "DELETED" so argon2.verify
      // fails with "Credenciales invalidas" before reaching the deletedAt check.
      // Either rejection path proves the account is unreachable.
      expect(reloginRes.statusCode).toBe(401);
    });
  });
});
