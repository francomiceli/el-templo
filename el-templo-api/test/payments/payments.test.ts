import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { createTestApp, getAuthToken, registerUser } from "../helpers";
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

  // Reusable member payload
  const baseMember = {
    email: "pay-test-member@test.com",
    password: "pass123456",
    firstName: "Pay",
    lastName: "Tester",
    phone: "+5491100002222",
    dni: "80000001",
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
    // Delete in FK order: bookings first (FK on users+schedules), then scheduling, then rest
    await app.db.delete(bookings);
    await app.db.delete(holidays);
    await app.db.delete(attendance);
    await app.db.delete(schedules);
    await app.db.delete(activities);
    await app.db.delete(payments);
    await app.db.delete(subscriptions);
    await app.db.delete(subscriptionPlans);
    await app.db.delete(auraTransactions);
    await app.db.delete(auraBalances);
    await app.db.delete(memberNotes);
    // Reset boarding pass on all users
    await app.db.update(users).set({ boardingPassUsed: false });
    // Delete non-admin test users
    const testUsers = await app.db
      .select({ id: users.id, email: users.email })
      .from(users);
    for (const u of testUsers) {
      if (u.email !== "admin@test.com") {
        await app.db.delete(users).where(eq(users.id, u.id));
      }
    }
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
   * Helper: create a member via the members API.
   */
  async function createMember(
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: number; [key: string]: unknown }> {
    const res = await app.inject({
      method: "POST",
      url: MEMBERS_URL,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ...baseMember, ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  /**
   * Helper: assign a subscription plan to a member.
   */
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
        startDate: "2026-03-01",
        priceTypeApplied: "regular",
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  /**
   * Helper: record a payment via API.
   */
  async function recordPayment(
    userId: number,
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

    it("POST records a payment and returns 201 with detail", async () => {
      const member = await createMember();

      const { statusCode, body } = await recordPayment(member.id, {
        amount: 15000,
        paymentMethod: "cash",
        paymentDate: "2026-03-10",
        reference: "REC-001",
        notes: "Pago mensual",
      });

      expect(statusCode).toBe(201);
      expect(body).toHaveProperty("id");
      expect(body.memberId).toBe(member.id);
      expect(body.amount).toBe(15000);
      expect(body.paymentMethod).toBe("cash");
      expect(body.paymentDate).toBe("2026-03-10");
      expect(body.reference).toBe("REC-001");
      expect(body.notes).toBe("Pago mensual");
      expect(body.memberName).toBeTruthy();
      expect(body.recorderName).toBeTruthy();
      expect(body.voidedAt).toBeNull();
    });

    it("POST with invalid amount (below minimum) returns 400", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "POST",
        url: `${PAYMENTS_URL}/members/${member.id}/payments`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          amount: 0,
          paymentMethod: "cash",
          paymentDate: "2026-03-10",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("POST for non-existent member returns 404", async () => {
      const { statusCode, body } = await recordPayment(99999);

      expect(statusCode).toBe(404);
      expect(body.message).toContain("Miembro");
    });

    it("POST with subscription_id links payment to subscription", async () => {
      const plan = await createPlan();
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id);

      const { statusCode, body } = await recordPayment(member.id, {
        subscriptionId: sub.id,
      });

      expect(statusCode).toBe(201);
      expect(body.subscriptionId).toBe(sub.id);
      expect(body.planName).toBe(basePlan.name);
    });

    it("POST without subscription_id records one-off payment", async () => {
      const member = await createMember();

      const { statusCode, body } = await recordPayment(member.id);

      expect(statusCode).toBe(201);
      expect(body.subscriptionId).toBeNull();
      expect(body.planName).toBeNull();
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
      const member = await createMember();
      const { body: payment } = await recordPayment(member.id);

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
      const member = await createMember();
      const { body: payment } = await recordPayment(member.id);

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
      const member = await createMember();

      // Record two payments on different dates
      await recordPayment(member.id, {
        amount: 5000,
        paymentDate: "2026-03-01",
      });
      const { body: payment2 } = await recordPayment(member.id, {
        amount: 10000,
        paymentDate: "2026-03-15",
      });

      // Void the second payment
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
      expect(body.payments).toHaveLength(2);
      // Most recent first
      expect(body.payments[0].paymentDate).toBe("2026-03-15");
      expect(body.payments[1].paymentDate).toBe("2026-03-01");
      // Voided payment included with voided fields
      expect(body.payments[0].voidedAt).toBeTruthy();
    });
  });

  // =========================================================================
  // Member Balance
  // =========================================================================
  describe("Member Balance", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("GET returns correct balance when fully paid (not overdue)", async () => {
      const plan = await createPlan();
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id);

      // Pay full amount
      await recordPayment(member.id, {
        amount: 15000,
        subscriptionId: sub.id,
      });

      const res = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/members/${member.id}/balance`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.pricePaid).toBe(15000);
      expect(body.totalPaid).toBe(15000);
      expect(body.remaining).toBe(0);
      expect(body.isOverdue).toBe(false);
    });

    it("GET returns isOverdue=true when expired and underpaid", async () => {
      // Create plan with short duration so it expires
      const plan = await createPlan({ durationDays: 1 });
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id, {
        startDate: "2025-01-01",
      });

      // Partial payment
      await recordPayment(member.id, {
        amount: 5000,
        subscriptionId: sub.id,
      });

      const res = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/members/${member.id}/balance`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalPaid).toBe(5000);
      expect(body.remaining).toBe(10000);
      expect(body.isOverdue).toBe(true);
    });

    it("GET excludes voided payments from totalPaid", async () => {
      const plan = await createPlan({ durationDays: 1 });
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id, {
        startDate: "2025-01-01",
      });

      // Record and void a payment
      const { body: payment } = await recordPayment(member.id, {
        amount: 15000,
        subscriptionId: sub.id,
      });
      await app.inject({
        method: "POST",
        url: `${PAYMENTS_URL}/payments/${payment.id}/void`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: "Error de monto" },
      });

      const res = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/members/${member.id}/balance`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.totalPaid).toBe(0);
      expect(body.remaining).toBe(15000);
      expect(body.isOverdue).toBe(true);
    });

    it("GET returns 404 when member has no subscription", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/members/${member.id}/balance`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // Global Payment List
  // =========================================================================
  describe("Global Payment List", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("GET returns paginated results", async () => {
      const member = await createMember();

      await recordPayment(member.id, {
        amount: 5000,
        paymentDate: "2026-03-01",
      });
      await recordPayment(member.id, {
        amount: 10000,
        paymentDate: "2026-03-02",
      });

      const res = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/payments?page=1&limit=10`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.payments).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(10);
    });

    it("GET filters by branch, payment method, and date range", async () => {
      const member = await createMember();

      await recordPayment(member.id, {
        amount: 5000,
        paymentMethod: "cash",
        paymentDate: "2026-03-01",
      });
      await recordPayment(member.id, {
        amount: 10000,
        paymentMethod: "transfer",
        paymentDate: "2026-04-01",
      });

      // Filter by method
      const resByMethod = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/payments?paymentMethod=cash`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyByMethod = JSON.parse(resByMethod.body);
      expect(bodyByMethod.payments).toHaveLength(1);
      expect(bodyByMethod.payments[0].paymentMethod).toBe("cash");

      // Filter by date range
      const resByDate = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/payments?dateFrom=2026-04-01&dateTo=2026-04-30`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const bodyByDate = JSON.parse(resByDate.body);
      expect(bodyByDate.payments).toHaveLength(1);
      expect(bodyByDate.payments[0].amount).toBe(10000);

      // Filter by branch
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

    it("GET returns revenue, outstanding, collection rate", async () => {
      const plan = await createPlan({ durationDays: 1 });
      const member = await createMember();
      const sub = await assignPlan(member.id, plan.id, {
        startDate: "2025-01-01",
      });

      // Record a payment in current month
      const today = new Date().toISOString().split("T")[0];
      await recordPayment(member.id, {
        amount: 5000,
        subscriptionId: sub.id,
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
      expect(body).toHaveProperty("totalOutstanding");
      expect(body).toHaveProperty("collectionRate");
      expect(body).toHaveProperty("revenueByMethod");
      expect(body).toHaveProperty("revenueByBranch");
      expect(body.monthlyRevenue).toBe(5000);
      expect(body.revenueByMethod).toHaveProperty("cash");
    });
  });

  // =========================================================================
  // Morosos Count
  // =========================================================================
  describe("Morosos Count", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("GET returns count of overdue members", async () => {
      // Create member with expired unpaid subscription
      const plan = await createPlan({ durationDays: 1 });
      const member = await createMember();
      await assignPlan(member.id, plan.id, { startDate: "2025-01-01" });
      // No payment — subscription overdue

      const res = await app.inject({
        method: "GET",
        url: `${PAYMENTS_URL}/payments/morosos`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.count).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // Members List with Overdue Flag
  // =========================================================================
  describe("Members List Overdue", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("GET /admin/members returns isOverdue field", async () => {
      const member = await createMember();

      const res = await app.inject({
        method: "GET",
        url: MEMBERS_URL,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.members.length).toBeGreaterThanOrEqual(1);
      // Each member should have isOverdue field
      for (const m of body.members) {
        expect(m).toHaveProperty("isOverdue");
      }
    });

    it("GET /admin/members?overdue=true returns only overdue members", async () => {
      // Create two members: one overdue, one not
      const plan = await createPlan({ durationDays: 1 });

      const memberOverdue = await createMember({
        email: "overdue@test.com",
        dni: "80000100",
      });
      await assignPlan(memberOverdue.id, plan.id, {
        startDate: "2025-01-01",
      });
      // No payment, subscription expired => overdue

      const memberPaid = await createMember({
        email: "paid@test.com",
        dni: "80000200",
      });
      // No subscription => not overdue

      const res = await app.inject({
        method: "GET",
        url: `${MEMBERS_URL}?overdue=true`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // Only the overdue member should appear
      expect(body.members).toHaveLength(1);
      expect(body.members[0].email).toBe("overdue@test.com");
      expect(body.members[0].isOverdue).toBe(true);
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
        {
          method: "GET" as const,
          url: `${PAYMENTS_URL}/members/1/balance`,
        },
        { method: "GET" as const, url: `${PAYMENTS_URL}/payments` },
        {
          method: "GET" as const,
          url: `${PAYMENTS_URL}/payments/summary`,
        },
        {
          method: "GET" as const,
          url: `${PAYMENTS_URL}/payments/morosos`,
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
