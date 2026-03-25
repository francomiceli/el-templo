import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";

describe("Check-in Routes", () => {
  let app: FastifyInstance;
  let memberToken: string;
  let memberId: number;

  /**
   * Insert N completed sessions for a given user.
   * Each session gets a unique date going backwards from today.
   */
  async function insertCompletedSessions(
    count: number,
    userId: number,
  ): Promise<void> {
    for (let i = 0; i < count; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      await app.db.insert(schema.completedSessions).values({
        userId,
        dayId: `W1-test-day-${i}-${Date.now()}`,
        date: dateStr,
        branchId: 1,
        startedAt: new Date(),
        completedAt: new Date(),
        blocksCompleted: JSON.stringify(["NUCLEUS"]),
      });
    }
  }

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
      await insertCompletedSessions(1, memberId);

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
      await insertCompletedSessions(3, memberId);

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
      await insertCompletedSessions(3, memberId);

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
      await insertCompletedSessions(1, memberId);

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

    it("returns 403 for locked question", async () => {
      // No sessions inserted — energy is locked
      const res = await app.inject({
        method: "POST",
        url: "/api/check-ins",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { questionType: "energy", value: "bajo" },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Pregunta no disponible todavia");
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
      await insertCompletedSessions(1, memberId);

      const res = await app.inject({
        method: "POST",
        url: "/api/check-ins",
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { questionType: "mood", value: "happy" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid value", async () => {
      await insertCompletedSessions(1, memberId);

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
      await insertCompletedSessions(3, memberId);

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
    it("returns empty unlocked for fresh member with no sessions", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/check-ins/today",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.unlocked).toEqual([]);
      expect(body.answers.energy).toBeNull();
      expect(body.answers.soreness).toBeNull();
      expect(body.answers.sleep).toBeNull();
    });

    it("returns energy unlocked after 1 session", async () => {
      await insertCompletedSessions(1, memberId);

      const res = await app.inject({
        method: "GET",
        url: "/api/check-ins/today",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.unlocked).toContain("energy");
      expect(body.unlocked).not.toContain("soreness");
      expect(body.unlocked).not.toContain("sleep");
    });

    it("returns energy and soreness unlocked after 3 sessions", async () => {
      await insertCompletedSessions(3, memberId);

      const res = await app.inject({
        method: "GET",
        url: "/api/check-ins/today",
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.unlocked).toContain("energy");
      expect(body.unlocked).toContain("soreness");
    });

    it("returns today's answer after submission", async () => {
      await insertCompletedSessions(1, memberId);

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
