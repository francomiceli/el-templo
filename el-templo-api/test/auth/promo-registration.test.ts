import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, cleanAllTestData } from "../helpers";
import { promoPlans } from "../../src/db/schema/promo-plans";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { subscriptions } from "../../src/db/schema/subscriptions";

describe("Promo Registration Flow", () => {
  let app: FastifyInstance;
  let promoSubPlanId: number;

  beforeAll(async () => {
    app = await createTestApp();
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
        name: "Test Promo Plan",
        planTier: "other",
        bookingMode: "flexible",
        priceRegular: 0,
        priceZero: 0,
        durationDays: 30,
        planCategory: "online_regular",
        isTrial: true,
      })
      .$returningId();
    promoSubPlanId = planResult.id;
  });

  // Helper to seed a promo plan with configurable dates
  async function seedPromo(
    overrides: {
      promoCode?: string;
      startDate?: Date;
      expiryDate?: Date;
      isActive?: boolean;
    } = {},
  ) {
    const now = new Date();
    const defaults = {
      name: "Test Promo",
      promoCode: overrides.promoCode ?? "TESTPROMO",
      planDurationDays: 30,
      subscriptionPlanId: promoSubPlanId,
      startDate: overrides.startDate ?? new Date(now.getTime() - 86400000), // yesterday
      expiryDate: overrides.expiryDate ?? new Date(now.getTime() + 86400000), // tomorrow
      promoType: "auto" as const,
      isActive: overrides.isActive ?? true,
    };
    await app.db.insert(promoPlans).values(defaults);
  }

  function makeRegPayload(overrides: Record<string, unknown> = {}) {
    const unique =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    return {
      email: `promo-${unique}@test.com`,
      password: "password123",
      firstName: "Promo",
      lastName: "Tester",
      branchId: 1,
      dni: `PROMO-${unique}`,
      phone: "+5491100000099",
      gender: "male",
      ...overrides,
    };
  }

  it("registers with valid promo code and auto-assigns subscription", async () => {
    await seedPromo({ promoCode: "VALIDCODE" });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ promoCode: "VALIDCODE" }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("token");
    expect(body).toHaveProperty("promoApplied", true);

    // Verify subscription was actually created
    const [sub] = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, body.user.id));
    expect(sub).toBeDefined();
    expect(sub.status).toBe("active");

    // Verify redemption count incremented
    const [promo] = await app.db
      .select()
      .from(promoPlans)
      .where(eq(promoPlans.promoCode, "VALIDCODE"));
    expect(promo.redemptionCount).toBe(1);
  });

  it("registers with expired promo code -- registration succeeds, no subscription", async () => {
    const pastStart = new Date("2020-01-01");
    const pastExpiry = new Date("2020-01-02");
    await seedPromo({
      promoCode: "EXPIREDCODE",
      startDate: pastStart,
      expiryDate: pastExpiry,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ promoCode: "EXPIREDCODE" }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("token");
    expect(body).toHaveProperty("promoApplied", false);

    // No subscription created
    const subs = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, body.user.id));
    expect(subs).toHaveLength(0);
  });

  it("registers with invalid (nonexistent) promo code -- registration succeeds, no subscription", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ promoCode: "DOESNOTEXIST" }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("token");
    expect(body).toHaveProperty("promoApplied", false);
  });

  it("registers with deactivated promo code -- registration succeeds, no subscription", async () => {
    await seedPromo({ promoCode: "INACTIVE", isActive: false });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload({ promoCode: "INACTIVE" }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("promoApplied", false);
  });

  it("registers without promo code -- normal registration, promoApplied is false", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: makeRegPayload(),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("promoApplied", false);
  });

  it("registers duplicate email with promo code -- auto-logs in existing user", async () => {
    await seedPromo({ promoCode: "DUPTEST" });
    const payload = makeRegPayload({ promoCode: "DUPTEST" });

    // First registration
    await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload,
    });

    // Second with same email — should auto-login
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.existingAccount).toBe(true);
    expect(body.token).toBeDefined();
  });
});
