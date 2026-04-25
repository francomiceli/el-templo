/**
 * Phase 103-03: Member Creation Status Defaults — Integration Tests (R7)
 *
 * Verifies the per-endpoint status defaults at the entry points owned
 * by Plan 03 (single-owner rule):
 *   - POST /api/auth/register (no promo)        → status='freemium'
 *   - POST /api/auth/register (with valid promo)→ status='activo' (Plan 02 chain)
 *   - POST /api/admin/scheduling/trials         → status='prueba'
 *
 * Tests for the other 3 R7 acceptance scenarios live in their owning plans:
 *   - POST /api/admin/members (with/without planId) → Plan 04 (members/service.ts)
 *   - Staff role insert null status                  → Plan 06 (users/service.ts)
 *
 * Runs against real MySQL (eltemplo_test). NOTE: this file deliberately
 * does NOT use vi.useFakeTimers — Plan 02's recomputeUserStatus helper
 * compares subscription.end_date against MySQL's CURDATE(), which is bound
 * to the database server clock and not affected by Node-side fake timers.
 * Using the real clock keeps JS Date.now() and CURDATE() aligned so the
 * promo→activo transition is observable.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import * as schema from "../../src/db/schema";

const REGISTER_URL = "/api/auth/register";
const TRIALS_URL = "/api/admin/scheduling/trials";
const ADMIN_SCHEDULING = "/api/admin/scheduling";

describe("Phase 103-03 — Member creation status defaults (R7)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let onlineBranchId: number;
  let presentialBranchId: number;
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

    // Resolve branches needed across tests.
    const [online] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, "ONLINE"));
    if (!online) throw new Error("ONLINE branch missing from seed");
    onlineBranchId = online.id;

    const [presential] = await app.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.isVirtual, false));
    if (!presential) throw new Error("No physical branch found in seed");
    presentialBranchId = presential.id;

    // Seed a subscription plan referenced by the promo (test 2).
    const [planResult] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: "103-03 Promo Plan",
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

  function uniqueSuffix(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function buildRegisterPayload(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const u = uniqueSuffix();
    return {
      email: `m103-${u}@test.com`,
      password: "password123",
      firstName: "Default",
      lastName: "Tester",
      dni: `D103-${u}`,
      phone: `+549115555${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, "0")}`,
      gender: "male",
      ...overrides,
    };
  }

  // ─── Test 1: /register (no promo) → freemium ──────────────────────────

  it("POST /register without promoCode → status='freemium'", async () => {
    const payload = buildRegisterPayload();

    const res = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.id).toBeTruthy();
    expect(body.promoApplied).toBe(false);

    // Default branch resolves to ONLINE per auth/routes.ts (no branchId
    // supplied) — confirming the freemium intent at the online entry point.
    expect(body.user.branchId).toBe(onlineBranchId);

    const [row] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, body.user.id));
    expect(row.status).toBe("freemium");
  });

  // ─── Test 2: /register (with valid promo) → activo (Plan 02 chain) ────

  it("POST /register with valid promoCode → status='activo' (verifies Plan 02 recomputeUserStatus chain)", async () => {
    const promoCode = `PROMO-${uniqueSuffix()}`.toUpperCase();
    const now = new Date();
    await app.db.insert(schema.promoPlans).values({
      name: "103-03 Test Promo",
      promoCode,
      planDurationDays: 30,
      subscriptionPlanId: promoSubPlanId,
      startDate: new Date(now.getTime() - 86400000), // yesterday
      expiryDate: new Date(now.getTime() + 86400000), // tomorrow
      promoType: "auto",
      isActive: true,
    });

    const payload = buildRegisterPayload({ promoCode });

    const res = await app.inject({
      method: "POST",
      url: REGISTER_URL,
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.promoApplied).toBe(true);

    // The user was inserted with status='freemium' but the subsequent
    // assignPlan triggers Plan 02's recomputeUserStatus, flipping to 'activo'
    // inside the same transaction.
    const [row] = await app.db
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, body.user.id));
    expect(row.status).toBe("activo");

    // Belt-and-braces: a subscription row exists.
    const subs = await app.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, body.user.id));
    expect(subs.length).toBeGreaterThan(0);
  });

  // ─── Test 5: /api/admin/trials → prueba ───────────────────────────────

  it("POST /api/admin/scheduling/trials → status='prueba'", async () => {
    // Create a future schedule slot to attach the trial booking to.
    const activityRes = await app.inject({
      method: "POST",
      url: `${ADMIN_SCHEDULING}/activities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Calistenia 103-03", description: "test" },
    });
    expect(activityRes.statusCode).toBe(201);
    const activity = JSON.parse(activityRes.body);

    // Pick a guaranteed-future weekday (today + 2 days, ISO dayOfWeek).
    // Using +2 days avoids same-day reserve-window edge cases.
    const target = new Date();
    target.setDate(target.getDate() + 2);
    // ISO dayOfWeek: 1=Mon..7=Sun. Convert from JS getDay() (0=Sun..6=Sat).
    const jsDay = target.getDay();
    const isoDayOfWeek = jsDay === 0 ? 7 : jsDay;
    const bookingDate = target.toISOString().split("T")[0];

    const slotRes = await app.inject({
      method: "POST",
      url: `${ADMIN_SCHEDULING}/schedules`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        branchId: presentialBranchId,
        activityId: activity.id,
        dayOfWeek: isoDayOfWeek,
        startTime: "10:00",
        endTime: "11:00",
      },
    });
    expect(slotRes.statusCode).toBe(201);
    const slot = JSON.parse(slotRes.body);

    const phone = `+5491177${uniqueSuffix().slice(0, 6)}`;
    const trialRes = await app.inject({
      method: "POST",
      url: TRIALS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        firstName: "Trial",
        lastName: "Lead",
        phone,
        branchId: presentialBranchId,
        scheduleId: slot.id,
        bookingDate,
      },
    });
    expect(trialRes.statusCode).toBe(201);
    const trialBody = JSON.parse(trialRes.body);
    expect(trialBody.userId).toBeTruthy();

    const [row] = await app.db
      .select({ status: schema.users.status, phone: schema.users.phone })
      .from(schema.users)
      .where(eq(schema.users.id, trialBody.userId));
    expect(row.status).toBe("prueba");
    expect(row.phone).toBe(phone);
  });
});
