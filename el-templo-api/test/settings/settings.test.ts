import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { createTestApp, getAuthToken, registerUser } from "../helpers";

const BASE_URL = "/api/admin/settings";

describe("Settings API", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Grace Period", () => {
    it("GET /grace-period returns default grace period value", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/grace-period`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("gracePeriodDays");
      expect(typeof body.gracePeriodDays).toBe("number");
      expect(body.gracePeriodDays).toBe(5); // Default value
    });

    it("PUT /grace-period updates the grace period", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `${BASE_URL}/grace-period`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { gracePeriodDays: 10 },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.gracePeriodDays).toBe(10);

      // Verify the change persisted
      const getRes = await app.inject({
        method: "GET",
        url: `${BASE_URL}/grace-period`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const getBody = JSON.parse(getRes.body);
      expect(getBody.gracePeriodDays).toBe(10);

      // Reset to default for other tests
      await app.inject({
        method: "PUT",
        url: `${BASE_URL}/grace-period`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { gracePeriodDays: 5 },
      });
    });

    it("PUT /grace-period rejects negative values", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `${BASE_URL}/grace-period`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { gracePeriodDays: -1 },
      });

      expect(res.statusCode).toBe(400);
    });

    it("PUT /grace-period rejects values above 30", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `${BASE_URL}/grace-period`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { gracePeriodDays: 31 },
      });

      expect(res.statusCode).toBe(400);
    });

    it("non-admin user gets 403 on settings routes", async () => {
      const { token: memberToken } = await registerUser(app, {
        email: "settings-auth-test@test.com",
        password: "pass123456",
        branchId: 1,
        firstName: "Settings",
        lastName: "Tester",
      });

      const res = await app.inject({
        method: "GET",
        url: `${BASE_URL}/grace-period`,
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
