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

  const validQuizAnswers = {
    goalType: "muscle_up",
    experienceLevel: "beginner",
    trainingFocus: "upper_body",
    motivationStyle: "discipline",
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
  // POST /api/onboarding/complete
  // -----------------------------------------------------------------
  describe("POST /api/onboarding/complete", () => {
    it("creates profile and awards 50 AURA on success", async () => {
      const { token } = await registerUser(app, {
        email: "onboard-success@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: validQuizAnswers,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.profile).toHaveProperty("goalType", "muscle_up");
      expect(body.profile).toHaveProperty("experienceLevel", "beginner");
      expect(body.profile).toHaveProperty("trainingFocus", "upper_body");
      expect(body.profile).toHaveProperty("motivationStyle", "discipline");
      expect(body.profile).toHaveProperty("onboardingCompletedAt");
      expect(body.profile.onboardingCompletedAt).toBeTruthy();
      expect(body.auraAwarded).toBe(50);
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
        payload: validQuizAnswers,
      });
      expect(first.statusCode).toBe(201);

      // Second attempt
      const second = await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: validQuizAnswers,
      });
      expect(second.statusCode).toBe(409);
      const body = JSON.parse(second.body);
      expect(body.message).toBe("Onboarding already completed");
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
          ...validQuizAnswers,
          goalType: "invalid_value",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 401 when unauthenticated", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        payload: validQuizAnswers,
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
        payload: { goalType: "muscle_up" }, // missing 3 fields
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // -----------------------------------------------------------------
  // GET /api/onboarding/profile
  // -----------------------------------------------------------------
  describe("GET /api/onboarding/profile", () => {
    it("returns 200 with profile after completion", async () => {
      const { token } = await registerUser(app, {
        email: "profile-after@test.com",
        password: "password123",
        branchId: 1,
      });

      // Complete onboarding
      await app.inject({
        method: "POST",
        url: "/api/onboarding/complete",
        headers: { authorization: `Bearer ${token}` },
        payload: validQuizAnswers,
      });

      // Get profile
      const res = await app.inject({
        method: "GET",
        url: "/api/onboarding/profile",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("goalType", "muscle_up");
      expect(body).toHaveProperty("experienceLevel", "beginner");
      expect(body).toHaveProperty("trainingFocus", "upper_body");
      expect(body).toHaveProperty("motivationStyle", "discipline");
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
  // GET /api/auth/me — onboardingCompleted flag
  // -----------------------------------------------------------------
  describe("GET /api/auth/me — onboardingCompleted", () => {
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
        payload: validQuizAnswers,
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
          answerValue: "muscle_up",
          durationMs: 3200,
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
    it("includes onboardingProfile after member completes onboarding", async () => {
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
        payload: validQuizAnswers,
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
      expect(body.onboardingProfile.goalType).toBe("muscle_up");
      expect(body.onboardingProfile.goalLabel).toBe("Primer Muscle-Up");
      expect(body.onboardingProfile.experienceLevel).toBe("beginner");
      expect(body.onboardingProfile.experienceLabel).toBe("Empiezo de cero");
      expect(body.onboardingProfile.trainingFocus).toBe("upper_body");
      expect(body.onboardingProfile.focusLabel).toBe("Tren superior");
      expect(body.onboardingProfile.motivationStyle).toBe("discipline");
      expect(body.onboardingProfile.motivationLabel).toBe(
        "Disciplina personal",
      );
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
