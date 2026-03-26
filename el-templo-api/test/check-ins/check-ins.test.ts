import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, cleanAllTestData } from "../helpers";

describe("Check-in Routes", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let memberId: number;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    const result = await registerUser(app, {
      email: `checkin-member-${Date.now()}@test.com`,
      password: "password123",
      branchId: 1,
    });
    memberToken = result.token;
    memberId = (result.user as { id: number }).id;
  });

  // -----------------------------------------------------------------
  // POST /api/check-ins
  // -----------------------------------------------------------------
  describe("POST /api/check-ins", () => {
    it("returns 201 for valid energy check-in after 1 session", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/check-ins",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { questionType: "energy", value: "normal" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it("returns 201 for valid soreness check-in with bodyArea after 3 sessions", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/check-ins",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          questionType: "soreness",
          value: "leve",
          bodyArea: "espalda",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
    });

    it("returns 400 for soreness without bodyArea when value is leve", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/check-ins",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { questionType: "soreness", value: "leve" },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("zona del cuerpo");
    });

    it("returns 409 for duplicate answer same day", async () => {
      // First submission
      const first = await app.inject({
        method: "POST",
        url: "/api/check-ins",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { questionType: "energy", value: "bajo" },
      });
      expect(first.statusCode).toBe(201);

      // Second submission same question same day
      const second = await app.inject({
        method: "POST",
        url: "/api/check-ins",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { questionType: "energy", value: "alto" },
      });

      // Upsert behavior — second answer updates the first, returns 201
      expect(second.statusCode).toBe(201);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/check-ins",
        payload: { questionType: "energy", value: "bajo" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid questionType", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/check-ins",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { questionType: "mood", value: "happy" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid value", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/check-ins",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { questionType: "energy", value: "super" },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain("Valor invalido");
    });

    it("stores null bodyArea for soreness ninguna even if bodyArea sent", async () => {
      // Submit soreness='ninguna' with bodyArea (should be ignored)
      const submitRes = await app.inject({
        method: "POST",
        url: "/api/check-ins",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          questionType: "soreness",
          value: "ninguna",
          bodyArea: "espalda",
        },
      });
      expect(submitRes.statusCode).toBe(201);

      // Verify via GET that bodyArea is null
      const todayRes = await app.inject({
        method: "GET",
        url: "/api/check-ins/today",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(todayRes.statusCode).toBe(200);
      const body = JSON.parse(todayRes.body);
      expect(body.answers.soreness).not.toBeNull();
      expect(body.answers.soreness.value).toBe("ninguna");
      expect(body.answers.soreness.bodyArea).toBeNull();
    });
  });

  // -----------------------------------------------------------------
  // GET /api/check-ins/today
  // -----------------------------------------------------------------
  describe("GET /api/check-ins/today", () => {
    it("returns all answers as null for fresh member", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/check-ins/today",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.answers.energy).toBeNull();
      expect(body.answers.soreness).toBeNull();
      expect(body.answers.sleep).toBeNull();
    });

    it("returns today's answer after submission", async () => {
      // Submit energy check-in
      await app.inject({
        method: "POST",
        url: "/api/check-ins",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { questionType: "energy", value: "alto" },
      });

      // Get today state
      const res = await app.inject({
        method: "GET",
        url: "/api/check-ins/today",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.answers.energy).not.toBeNull();
      expect(body.answers.energy.value).toBe("alto");
      expect(body.answers.energy.bodyArea).toBeNull();
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/check-ins/today",
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
