import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  registerUser,
  cleanAllTestData,
  getAuthToken,
} from "../helpers";

describe("Onboarding Routes", () => {
  let app: FastifyInstance;

  const validQuizAnswersV2 = {
    ageRange: "29_40",
    trainingBackground: "nunca",
    goal: "habito",
    painPoint: "tiempo",
    trainingFrequency: "3",
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // -----------------------------------------------------------------
  // POST /api/onboarding/complete (V2 — avatar profiling)
  // -----------------------------------------------------------------
  describe("POST /api/onboarding/complete", () => {
    it("creates profile with avatarType and suggestedProgram, awards 50 AURA", async () => {
      const { token } = await registerUser(app, {
        email: "onboard-success@test.com",
        password: "password123",
        branchId: 1,
        gender: "male",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: validQuizAnswersV2,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.profile).toHaveProperty("ageRange", "29_40");
      expect(body.profile).toHaveProperty("trainingBackground", "nunca");
      expect(body.profile).toHaveProperty("goal", "habito");
      expect(body.profile).toHaveProperty("painPoint", "tiempo");
      expect(body.profile).toHaveProperty("trainingFrequency", "3");
      expect(body.profile).toHaveProperty("avatarType");
      expect(body.profile.avatarType).toMatch(/^[A-K]$/);
      expect(body.profile).toHaveProperty("suggestedProgram");
      expect(body.profile.suggestedProgram).toBeTruthy();
      expect(body.profile).toHaveProperty("onboardingCompletedAt");
      expect(body.profile.onboardingCompletedAt).toBeTruthy();
      expect(body.auraAwarded).toBe(50);
    });

    it("resolves avatar K for young female user", async () => {
      const { token } = await registerUser(app, {
        email: "onboard-female-k@test.com",
        password: "password123",
        branchId: 1,
        gender: "female",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          ageRange: "18_28",
          trainingBackground: "nunca",
          goal: "habito",
          painPoint: "constancia",
          trainingFrequency: "3",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.profile.avatarType).toBe("K");
    });

    it("returns 409 on duplicate onboarding submission", async () => {
      const { token } = await registerUser(app, {
        email: "onboard-dup@test.com",
        password: "password123",
        branchId: 1,
      });

      // First completion
      const first = await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: validQuizAnswersV2,
      });
      expect(first.statusCode).toBe(201);

      // Second attempt
      const second = await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: validQuizAnswersV2,
      });
      expect(second.statusCode).toBe(409);
      const body = JSON.parse(second.body);
      expect(body.message).toBe("El onboarding ya fue completado");
    });

    it("returns 400 for invalid enum value", async () => {
      const { token } = await registerUser(app, {
        email: "onboard-invalid@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          ...validQuizAnswersV2,
          goal: "invalid_value",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 when unauthenticated", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        payload: validQuizAnswersV2,
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 when required fields are missing", async () => {
      const { token } = await registerUser(app, {
        email: "onboard-missing@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: { ageRange: "29_40" }, // missing 4 fields
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------
  // GET /api/onboarding/profile
  // -----------------------------------------------------------------
  describe("GET /api/onboarding/profile", () => {
    it("returns 200 with profile after V2 completion", async () => {
      const { token } = await registerUser(app, {
        email: "profile-after@test.com",
        password: "password123",
        branchId: 1,
      });

      // Complete onboarding with V2 payload
      await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: validQuizAnswersV2,
      });

      // Get profile (still uses V1 shape for backward compat)
      const res = await app.inject({
        method: "GET",
        url: "/api/onboarding/profile",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // V2 users have null old fields
      expect(body).toHaveProperty("onboardingCompletedAt");
      expect(body.onboardingCompletedAt).toBeTruthy();
    });

    it("returns 204 before completion", async () => {
      const { token } = await registerUser(app, {
        email: "profile-before@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/onboarding/profile",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe("");
    });
  });

  // -----------------------------------------------------------------
  // GET /api/auth/me — onboardingCompleted flag + gender
  // -----------------------------------------------------------------
  describe("GET /api/auth/me — onboardingCompleted + gender", () => {
    it("returns onboardingCompleted: false for fresh user", async () => {
      const { token } = await registerUser(app, {
        email: "me-fresh@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("onboardingCompleted", false);
    });

    it("returns onboardingCompleted: true after completion", async () => {
      const { token } = await registerUser(app, {
        email: "me-done@test.com",
        password: "password123",
        branchId: 1,
      });

      // Complete onboarding
      await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: validQuizAnswersV2,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("onboardingCompleted", true);
    });

    it("returns gender field for member user", async () => {
      const { token } = await registerUser(app, {
        email: "me-gender@test.com",
        password: "password123",
        branchId: 1,
        gender: "female",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("gender", "female");
    });
  });

  // -----------------------------------------------------------------
  // POST /api/onboarding/analytics
  // -----------------------------------------------------------------
  describe("POST /api/onboarding/analytics", () => {
    it("records event and returns 204", async () => {
      const { token } = await registerUser(app, {
        email: "analytics@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/analytics",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          eventType: "quiz_started",
        },
      });

      expect(res.statusCode).toBe(204);
    });

    it("records question_answered event with details", async () => {
      const { token } = await registerUser(app, {
        email: "analytics-detail@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/analytics",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          eventType: "question_answered",
          questionIndex: 0,
          answerValue: "18_28",
          durationMs: 3200,
        },
      });

      expect(res.statusCode).toBe(204);
    });

    it("accepts questionIndex 4 (5 questions, 0-indexed)", async () => {
      const { token } = await registerUser(app, {
        email: "analytics-q4@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/analytics",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          eventType: "question_answered",
          questionIndex: 4,
          answerValue: "5_plus",
          durationMs: 2100,
        },
      });

      expect(res.statusCode).toBe(204);
    });

    it("accepts eventType avatar_assigned (per D-23)", async () => {
      const { token } = await registerUser(app, {
        email: "analytics-avatar@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/analytics",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          eventType: "avatar_assigned",
          answerValue: "B",
        },
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 400 for invalid event type", async () => {
      const { token } = await registerUser(app, {
        email: "analytics-bad@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/analytics",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          eventType: "invalid_event",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 when unauthenticated", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/analytics",
        payload: {
          eventType: "quiz_started",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------
  // GET /api/admin/members/:userId — onboardingProfile
  // -----------------------------------------------------------------
  describe("GET /api/admin/members/:userId — onboardingProfile", () => {
    it("includes onboardingProfile after member completes V2 onboarding", async () => {
      // Register member and complete onboarding
      const { token: memberToken, user: memberUser } = await registerUser(app, {
        email: "admin-view-member@test.com",
        password: "password123",
        branchId: 1,
      });

      await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: validQuizAnswersV2,
      });

      // Login as admin to view member detail
      const adminToken = await getAuthToken(
        app,
        "admin@test.com",
        "adminpass123",
      );

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${memberUser.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.onboardingProfile).toBeTruthy();
      // V2 users have null old fields but completedAt is set
      expect(body.onboardingProfile.completedAt).toBeTruthy();
    });

    it("returns null onboardingProfile when member has not completed onboarding", async () => {
      // Register member without completing onboarding
      const { user: memberUser } = await registerUser(app, {
        email: "admin-view-no-onboard@test.com",
        password: "password123",
        branchId: 1,
      });

      // Login as admin
      const adminToken = await getAuthToken(
        app,
        "admin@test.com",
        "adminpass123",
      );

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${memberUser.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.onboardingProfile).toBeNull();
    });
  });
});
