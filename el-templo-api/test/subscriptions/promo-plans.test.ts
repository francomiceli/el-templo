import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { promoPlans } from "../../src/db/schema/promo-plans";

const BASE_URL = "/api/admin/subscriptions/promo-plans";

describe("Promo Plans API", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let promoSubPlanId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Create a subscription plan for promos to reference
    const [planResult] = await app.db
      .insert(subscriptionPlans)
      .values({
        name: "Promo Sub Plan",
        planTier: "other",
        bookingMode: "flexible",
        priceRegular: 0,
        priceZero: 0,
        durationDays: 30,
        isOnline: true,
        isTrial: true,
      })
      .$returningId();
    promoSubPlanId = planResult.id;
  });

  // ─── GET /promo-plans ──────────────────────────────────────────────

  describe("GET /promo-plans", () => {
    it("returns promo list for admin", async () => {
      // Seed a promo
      await app.db.insert(promoPlans).values({
        name: "Test Promo",
        promoCode: "TESTGET",
        planDurationDays: 30,
        subscriptionPlanId: promoSubPlanId,
        startDate: new Date(),
        expiryDate: new Date(Date.now() + 86400000),
        promoType: "auto",
      });

      const res = await app.inject({
        method: "GET",
        url: BASE_URL,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0]).toHaveProperty("promoCode", "TESTGET");
      expect(body[0]).toHaveProperty("redemptionCount", 0);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: BASE_URL,
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for member role", async () => {
      const { token: memberToken } = await registerUser(app, {
        email: "member-promo@test.com",
        password: "password123",
        branchId: 1,
      });

      const res = await app.inject({
        method: "GET",
        url: BASE_URL,
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── POST /promo-plans ─────────────────────────────────────────────

  describe("POST /promo-plans", () => {
    it("creates a promo plan with valid data", async () => {
      const res = await app.inject({
        method: "POST",
        url: BASE_URL,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "New Campaign",
          promoCode: "NEWCAMP",
          planDurationDays: 14,
          startDate: new Date().toISOString(),
          expiryDate: new Date(Date.now() + 86400000 * 7).toISOString(),
          promoType: "auto",
          subscriptionPlanId: promoSubPlanId,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("promoCode", "NEWCAMP");
      expect(body).toHaveProperty("planDurationDays", 14);
      expect(body).toHaveProperty("redemptionCount", 0);
      expect(body).toHaveProperty("isActive", true);
    });

    it("rejects duplicate promo code", async () => {
      // Create first promo
      await app.db.insert(promoPlans).values({
        name: "First",
        promoCode: "DUPLICATE",
        planDurationDays: 30,
        subscriptionPlanId: promoSubPlanId,
        startDate: new Date(),
        expiryDate: new Date(Date.now() + 86400000),
        promoType: "auto",
      });

      // Try to create second with same code
      const res = await app.inject({
        method: "POST",
        url: BASE_URL,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Second",
          promoCode: "DUPLICATE",
          planDurationDays: 30,
          startDate: new Date().toISOString(),
          expiryDate: new Date(Date.now() + 86400000).toISOString(),
          promoType: "auto",
          subscriptionPlanId: promoSubPlanId,
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it("rejects invalid subscriptionPlanId", async () => {
      const res = await app.inject({
        method: "POST",
        url: BASE_URL,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "Bad Plan Ref",
          promoCode: "BADREF",
          planDurationDays: 30,
          startDate: new Date().toISOString(),
          expiryDate: new Date(Date.now() + 86400000).toISOString(),
          promoType: "auto",
          subscriptionPlanId: 99999,
        },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ─── PATCH /promo-plans/:promoId/deactivate ────────────────────────

  describe("PATCH /promo-plans/:promoId/deactivate", () => {
    it("deactivates an active promo", async () => {
      const [promoResult] = await app.db
        .insert(promoPlans)
        .values({
          name: "To Deactivate",
          promoCode: "DEACT",
          planDurationDays: 30,
          subscriptionPlanId: promoSubPlanId,
          startDate: new Date(),
          expiryDate: new Date(Date.now() + 86400000),
          promoType: "auto",
        })
        .$returningId();

      const res = await app.inject({
        method: "PATCH",
        url: `${BASE_URL}/${promoResult.id}/deactivate`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);

      // Verify in DB
      const [updated] = await app.db
        .select()
        .from(promoPlans)
        .where(eq(promoPlans.id, promoResult.id));
      expect(updated.isActive).toBe(false);
    });

    it("returns 404 for nonexistent promo", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `${BASE_URL}/99999/deactivate`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
