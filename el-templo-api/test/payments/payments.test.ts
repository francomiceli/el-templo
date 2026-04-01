import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { payments } from "../../src/db/schema/payments";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { users } from "../../src/db/schema/users";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { auraBalances } from "../../src/db/schema/aura-balances";
import { memberNotes } from "../../src/db/schema/member-notes";
import { attendance } from "../../src/db/schema/attendance";
import { bookings } from "../../src/db/schema/bookings";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import { holidays } from "../../src/db/schema/holidays";
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";

const PAYMENTS_URL = "/api/admin/payments";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";
const MEMBERS_URL = "/api/admin/members";

describe("Payments API", () => {
  let app: FastifyInstance;
  let adminToken: string;

  // Reusable plan payload
  const basePlan = {
    name: "Plan Mensual Test",
    planTier: "flex",
    bookingMode: "flexible",
    priceRegular: 15000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: 3,
  };

  // Reusable member defaults for createMember helper
  const baseMemberDefaults = {
    email: "pay-test-member@test.com",
    password: "pass123456",
    firstName: "Pay",
    lastName: "Tester",
    branchId: 1,
  };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Helper: clean up all payment/subscription test data.
   */
  async function cleanupAll(): Promise<void> {
    await cleanAllTestData(app);
  }

  /**
   * Helper: create a subscription plan via API.
   */
  async function createPlan(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/plans`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...basePlan, ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  /**
   * Helper: create a member via auth registration (no auto-subscription).
   */
  async function createMember(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const data = { ...baseMemberDefaults, ...overrides } as {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      branchId: number;
      dni?: string;
      phone?: string;
    };
    const result = await registerUser(app, data);
    return { id: (result.user as { id: number }).id, ...result.user };
  }

  /**
   * Helper: assign a subscription plan to a member.
   */
  /** Today as YYYY-MM-DD */
  function todayStr(): string {
    return new Date().toISOString().split("T")[0];
  }

  async function assignPlan(
    userId: number,
    planId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${userId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  /**
   * Helper: record a payment via API (requires subscriptionId).
   */
  async function recordPayment(
    userId: number,
    subscriptionId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<{ statusCode: number; body: Record<string, unknown> }> {
    const res = await app.inject({
      method: "POST",
      url: `${PAYMENTS_URL}/members/${userId}/payments`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        amount: 15000,
        paymentMethod: "cash",
        paymentDate: "2026-03-10",
        subscriptionId,
        ...overrides,
      },
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  // =========================================================================
  // Record Payment
  // =========================================================================
  describe("Record Payment", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("POST records a payment linked to subscription and returns 201", async () => {
      const plan = await createPlan();
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id);

      const { statusCode, body } = await recordPayment(
        member.id,
        sub.id as number,
        {
          amount: 15000,
          paymentMethod: "cash",
          paymentDate: "2026-03-10",
          reference: "REC-001",
          notes: "Pago mensual",
        },
      );

      expect(statusCode).toBe(201);
      expect(body).toHaveProperty("id");
      expect(body.memberId).toBe(member.id);
      expect(body.subscriptionId).toBe(sub.id);
      expect(body.amount).toBe(15000);
      expect(body.paymentMethod).toBe("cash");
      expect(body.paymentDate).toBe("2026-03-10");
      expect(body.reference).toBe("REC-001");
      expect(body.notes).toBe("Pago mensual");
      expect(body.memberName).toBeTruthy();
      expect(body.recorderName).toBeTruthy();
      expect(body.voidedAt).toBeNull();
      expect(body.planName).toBe(basePlan.name);
    });

    it("POST with invalid amount (below minimum) returns 400", async () => {
      const plan = await createPlan();
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id);

      const res = await app.inject({
        method: "POST",
        url: `${PAYMENTS_URL}/members/${member.id}/payments`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          amount: 0,
          paymentMethod: "cash",
          paymentDate: "2026-03-10",
          subscriptionId: sub.id,
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("POST for non-existent member returns 404", async () => {
      const plan = await createPlan();
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id);

      const { statusCode, body } = await recordPayment(99999, sub.id as number);

      expect(statusCode).toBe(404);
      expect(body.message).toContain("Miembro");
    });

    it("POST without subscriptionId returns 400", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "POST",
        url: `${PAYMENTS_URL}/members/${member.id}/payments`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          amount: 15000,
          paymentMethod: "cash",
          paymentDate: "2026-03-10",
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // Void Payment
  // =========================================================================
  describe("Void Payment", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("POST void returns 200 with voided payment", async () => {
      const plan = await createPlan();
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id);
      const { body: payment } = await recordPayment(
        member.id,
        sub.id as number,
      );

      const res = await app.inject({
        method: "POST",
        url: `${PAYMENTS_URL}/payments/${payment.id}/void`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: "Pago duplicado" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.voidedAt).toBeTruthy();
      expect(body.voidReason).toBe("Pago duplicado");
    });

    it("POST void on already voided payment returns 400", async () => {
      const plan = await createPlan();
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id);
      const { body: payment } = await recordPayment(
        member.id,
        sub.id as number,
      );

      // Void first time
      await app.inject({
        method: "POST",
        url: `${PAYMENTS_URL}/payments/${payment.id}/void`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: "Error" },
      });

      // Try to void again
      const res = await app.inject({
        method: "POST",
        url: `${PAYMENTS_URL}/payments/${payment.id}/void`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: "Double void" },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("anulado");
    });

    it("POST void on non-existent payment returns 404", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${PAYMENTS_URL}/payments/99999/void`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: "Test" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // Member Payment History
  // =========================================================================
  describe("Member Payment History", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("GET returns payments sorted by date desc, includes voided", async () => {
      const plan = await createPlan();
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id);
      // assignPlan auto-records 1 payment on startDate (today)

      // Record an additional payment on a future date
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14);
      const futureDateStr = futureDate.toISOString().split("T")[0];

      const { body: payment2 } = await recordPayment(
        member.id,
        sub.id as number,
        {
          amount: 10000,
          paymentDate: futureDateStr,
        },
      );

      // Void the later payment
      await app.inject({
        method: "POST",
        url: `${PAYMENTS_URL}/payments/${payment2.id}/void`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: "Error" },
      });

      const res = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/members/${member.id}/payments`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // 1 auto from assign + 1 manual = 2 total
      expect(body.payments).toHaveLength(2);
      // Most recent first
      expect(body.payments[0].paymentDate).toBe(futureDateStr);
      expect(body.payments[1].paymentDate).toBe(todayStr());
      // Voided payment included with voided fields
      expect(body.payments[0].voidedAt).toBeTruthy();
    });
  });

  // =========================================================================
  // Global Payment List
  // =========================================================================
  describe("Global Payment List", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("GET returns paginated results excluding voided payments", async () => {
      const plan = await createPlan();
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id);
      // assignPlan auto-records 1 payment

      const { body: p1 } = await recordPayment(member.id, sub.id as number, {
        amount: 5000,
        paymentDate: "2026-03-02",
      });

      // Void the manually recorded payment
      await app.inject({
        method: "POST",
        url: `${PAYMENTS_URL}/payments/${p1.id}/void`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: "Error" },
      });

      const res = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/payments?page=1&limit=10`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // 1 auto from assign (non-voided) + 1 manual (voided) = 1 visible
      expect(body.payments).toHaveLength(1);
      expect(body.total).toBe(1);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(10);
    });

    it("GET filters by payment method and date range", async () => {
      const plan = await createPlan();
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id);
      // assignPlan auto-records 1 cash payment on today

      // Record a transfer payment 60 days in the future (different month)
      const futureMonth = new Date();
      futureMonth.setDate(futureMonth.getDate() + 60);
      const futureMonthStr = futureMonth.toISOString().split("T")[0];
      // Use a range that brackets the exact date
      const dayBefore = new Date(futureMonth);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(futureMonth);
      dayAfter.setDate(dayAfter.getDate() + 1);
      const futureFrom = dayBefore.toISOString().split("T")[0];
      const futureTo = dayAfter.toISOString().split("T")[0];

      await recordPayment(member.id, sub.id as number, {
        amount: 10000,
        paymentMethod: "transfer",
        paymentDate: futureMonthStr,
      });

      // Filter by method: transfer should return 1
      const resByMethod = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/payments?paymentMethod=transfer`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyByMethod = JSON.parse(resByMethod.body);
      expect(bodyByMethod.payments).toHaveLength(1);
      expect(bodyByMethod.payments[0].paymentMethod).toBe("transfer");

      // Filter by date range (future month only)
      const resByDate = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/payments?dateFrom=${futureFrom}&dateTo=${futureTo}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyByDate = JSON.parse(resByDate.body);
      expect(bodyByDate.payments).toHaveLength(1);
      expect(bodyByDate.payments[0].amount).toBe(10000);

      // Filter by branch: should return all 2 payments (1 auto + 1 manual)
      const resByBranch = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/payments?branchId=1`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyByBranch = JSON.parse(resByBranch.body);
      expect(bodyByBranch.payments).toHaveLength(2);
    });
  });

  // =========================================================================
  // Financial Summary
  // =========================================================================
  describe("Financial Summary", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("GET returns revenue by method and branch (no outstanding/collectionRate)", async () => {
      const plan = await createPlan({ durationDays: 1 });
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id, {
        startDate: "2025-01-01",
      });

      // Record a payment in current month
      const today = new Date().toISOString().split("T")[0];
      await recordPayment(member.id, sub.id as number, {
        amount: 5000,
        paymentDate: today,
      });

      const res = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/payments/summary`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("monthlyRevenue");
      expect(body).toHaveProperty("revenueByMethod");
      expect(body).toHaveProperty("revenueByBranch");
      // These fields should NOT exist anymore
      expect(body).not.toHaveProperty("totalOutstanding");
      expect(body).not.toHaveProperty("collectionRate");
      expect(body.monthlyRevenue).toBe(5000);
      expect(body.revenueByMethod).toHaveProperty("cash");
    });
  });

  // =========================================================================
  // Members List (no overdue)
  // =========================================================================
  describe("Members List", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("GET /admin/members does NOT include isOverdue field", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "GET",
        url: MEMBERS_URL,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      // isOverdue should NOT be present anymore
      for (const m of body.members) {
        expect(m).not.toHaveProperty("isOverdue");
      }
    });
  });

  // =========================================================================
  // Subscription Renewal
  // =========================================================================
  describe("Subscription Renewal", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("POST renew active subscription creates new period and records payment", async () => {
      const plan = await createPlan({ durationDays: 30 });
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id);

      // Compute expected dates dynamically
      const start = new Date();
      const oldEnd = new Date(start);
      oldEnd.setDate(oldEnd.getDate() + 30);
      const oldEndStr = oldEnd.toISOString().split("T")[0];
      const newEnd = new Date(oldEnd);
      newEnd.setDate(newEnd.getDate() + 30);
      const newEndStr = newEnd.toISOString().split("T")[0];

      // Renew the subscription
      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      // Old sub still active (endDate in future) → new sub is scheduled
      expect(body.status).toBe("scheduled");
      // New period starts from old endDate and extends by 30 days
      expect(body.startDate).toBe(oldEndStr);
      expect(body.endDate).toBe(newEndStr);
      // New sub links to old sub
      expect(body.previousSubscriptionId).toBe(sub.id);

      // Verify a payment was created for the renewal
      const paymentsRes = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/members/${member.id}/payments`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const paymentsBody = JSON.parse(paymentsRes.body);
      // assignPlan auto-records one payment, renew records another = 2 total
      expect(paymentsBody.payments.length).toBeGreaterThanOrEqual(2);
    });

    it("POST renew expired subscription creates new period from today", async () => {
      const plan = await createPlan({ durationDays: 30 });
      const member = await createMember({
        email: "renew-expired@test.com",
        dni: "80000300",
      });
      const sub = await assignPlan(member.id, plan.id, {
        startDate: "2025-01-01",
      });

      // Force status to expired
      await app.db
        .update(subscriptions)
        .set({ status: "expired" })
        .where(eq(subscriptions.id, sub.id as number));

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "transfer" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("active");
      // endDate should be today + 30 days since the subscription was expired
      const today = new Date();
      const expected = new Date(today);
      expected.setDate(expected.getDate() + 30);
      expect(body.endDate).toBe(expected.toISOString().split("T")[0]);
    });

    it("POST renew with no subscription returns 404", async () => {
      const member = await createMember({
        email: "no-sub-renew@test.com",
        dni: "80000301",
      });

      const res = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // Authorization
  // =========================================================================
  describe("Authorization", () => {
    it("non-admin user gets 403 on payment endpoints", async () => {
      const { token: memberToken } = await registerUser(app, {
        email: "regular-pay-auth@test.com",
        password: "pass123456",
        branchId: 1,
        firstName: "Regular",
        lastName: "Payer",
      });

      const endpoints = [
        {
          method: "POST" as const,
          url: `${PAYMENTS_URL}/members/1/payments`,
          payload: {
            amount: 1000,
            paymentMethod: "cash",
            paymentDate: "2026-03-10",
            subscriptionId: 1,
          },
        },
        {
          method: "POST" as const,
          url: `${PAYMENTS_URL}/payments/1/void`,
          payload: { reason: "hack" },
        },
        {
          method: "GET" as const,
          url: `${PAYMENTS_URL}/members/1/payments`,
        },
        { method: "GET" as const, url: `${PAYMENTS_URL}/payments` },
        {
          method: "GET" as const,
          url: `${PAYMENTS_URL}/payments/summary`,
        },
      ];

      for (const ep of endpoints) {
        const res = await app.inject({
          method: ep.method,
          url: ep.url,
          headers: { authorization: `Bearer ${memberToken}` },
          payload: "payload" in ep ? ep.payload : undefined,
        });

        expect(
          res.statusCode,
          `Expected 403 for ${ep.method} ${ep.url}, got ${res.statusCode}`,
        ).toBe(403);
      }
    });
  });
});
