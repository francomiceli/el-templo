import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { bookings } from "../../src/db/schema/bookings";
import { completedSessions } from "../../src/db/schema/completed-sessions";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import { holidays } from "../../src/db/schema/holidays";
import { attendance } from "../../src/db/schema/attendance";
import { payments } from "../../src/db/schema/payments";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { users } from "../../src/db/schema/users";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { auraBalances } from "../../src/db/schema/aura-balances";
import { memberNotes } from "../../src/db/schema/member-notes";
import { branches } from "../../src/db/schema/branches";
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";

const ANALYTICS_URL = "/api/admin/analytics";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";
const MEMBERS_URL = "/api/admin/members";
const PAYMENTS_URL = "/api/admin/payments";

describe("Analytics API", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;

  const basePlan = {
    name: "Plan Analytics Test",
    planTier: "flex",
    bookingMode: "flexible",
    priceRegular: 15000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: 3,
    multiBranch: false,
  };

  const baseMemberDefaults = {
    email: "analytics-test@test.com",
    password: "pass123456",
    firstName: "Analytics",
    lastName: "Tester",
    branchId: 0,
  };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const [branch] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isVirtual, false));
    testBranchId = branch.id;
    baseMemberDefaults.branchId = testBranchId;
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Clean up all test data in FK order.
   */
  async function cleanupAll(): Promise<void> {
    memberSubscriptions.clear();
    await cleanAllTestData(app);
  }

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

  async function assignSubscription(
    memberId: number,
    planId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const today = new Date().toISOString().split("T")[0];
    const res = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/assign`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId,
        branchId: testBranchId,
        startDate: today,
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  /**
   * Track subscription per member so multiple recordPayment calls reuse the same sub.
   */
  const memberSubscriptions = new Map<number, number>();

  /**
   * Helper: create a plan + subscription for a member (if needed) and record a payment.
   * Needed because subscriptionId is required on payments.
   */
  async function recordPayment(
    memberId: number,
    amount: number,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    // Ensure we have a plan and subscription for this member
    let subId = overrides.subscriptionId as number | undefined;
    if (!subId) {
      subId = memberSubscriptions.get(memberId);
    }
    if (!subId) {
      const plan = await createPlan({ name: `RP-Plan-${Date.now()}` });
      const sub = await assignSubscription(memberId, plan.id);
      subId = sub.id as number;
      memberSubscriptions.set(memberId, subId);
    }

    const today = new Date().toISOString().split("T")[0];
    const res = await app.inject({
      method: "POST",
      url: `${PAYMENTS_URL}/members/${memberId}/payments`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        amount,
        paymentMethod: "cash",
        paymentDate: today,
        subscriptionId: subId,
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KPIs Endpoint
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET /api/admin/analytics (KPIs)", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("should return 401 for unauthenticated request", async () => {
      const res = await app.inject({
        method: "GET",
        url: ANALYTICS_URL,
      });
      expect(res.statusCode).toBe(401);
    });

    it("should return KPI stats with correct activeMembers count", async () => {
      // Create 2 active members
      await createMember({ email: "m1@test.com", dni: "90000002" });
      await createMember({ email: "m2@test.com", dni: "90000003" });

      const res = await app.inject({
        method: "GET",
        url: ANALYTICS_URL,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.activeMembers).toBeDefined();
      expect(body.activeMembers.value).toBe(2);
      expect(body.activeMembers.trend).toBeDefined();
      expect(body.activeMembers.trend.direction).toMatch(/^(up|down|flat)$/);
      expect(typeof body.activeMembers.trend.percentage).toBe("number");
    });

    it("should accept branchId filter and return branch-scoped results", async () => {
      await createMember({ email: "m1@test.com", dni: "90000002" });

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}?branchId=${testBranchId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.activeMembers.value).toBe(1);
    });

    it("should return trend data for each KPI", async () => {
      const res = await app.inject({
        method: "GET",
        url: ANALYTICS_URL,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      for (const key of [
        "activeMembers",
        "monthlyRevenue",
        "dailyAttendanceAvg",
      ]) {
        expect(body[key]).toBeDefined();
        expect(body[key].trend).toBeDefined();
        expect(body[key].trend.direction).toMatch(/^(up|down|flat)$/);
        expect(typeof body[key].trend.percentage).toBe("number");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Member Analytics
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET /api/admin/analytics/members", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("should return newMembers count matching members created in date range", async () => {
      // Create member today
      await createMember({ email: "m1@test.com", dni: "90000002" });

      // Use ±1 day range to handle UTC/MySQL timezone boundary mismatches
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000)
        .toISOString()
        .split("T")[0];
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members?dateFrom=${yesterday}&dateTo=${tomorrow}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.newMembers).toBeGreaterThanOrEqual(1);
    });

    it("should return planDistribution array with plan names and counts", async () => {
      const plan = await createPlan({ name: "Plan Distribution Test" });
      const member = await createMember({
        email: "m1@test.com",
        dni: "90000002",
      });
      await assignSubscription(member.id, plan.id);

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.planDistribution).toBeInstanceOf(Array);
      expect(body.planDistribution.length).toBeGreaterThanOrEqual(1);

      const found = body.planDistribution.find(
        (p: { planName: string }) => p.planName === "Plan Distribution Test",
      );
      expect(found).toBeDefined();
      expect(found.count).toBe(1);
    });

    it("should compute retentionRate = 50% when 1 of 2 members renews", async () => {
      const plan = await createPlan({
        name: "Plan Retention Test",
        durationDays: 30,
      });

      // Create 2 members
      const member1 = await createMember({
        email: "ret1@test.com",
        dni: "90000050",
      });
      const member2 = await createMember({
        email: "ret2@test.com",
        dni: "90000051",
      });

      // Assign subs starting 35 days ago (endDate = 5 days ago — these are "ending" subs)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 35);
      const startDateStr = startDate.toISOString().split("T")[0];

      await assignSubscription(member1.id, plan.id, {
        startDate: startDateStr,
      });
      await assignSubscription(member2.id, plan.id, {
        startDate: startDateStr,
      });

      // Force both to expired status
      await app.db
        .update(subscriptions)
        .set({ status: "expired" })
        .where(eq(subscriptions.userId, member1.id));
      await app.db
        .update(subscriptions)
        .set({ status: "expired" })
        .where(eq(subscriptions.userId, member2.id));

      // Member 1 renews — assign a new active sub starting today
      const today = new Date().toISOString().split("T")[0];
      await assignSubscription(member1.id, plan.id, {
        startDate: today,
      });

      // Query with date range covering the ending period (10 days ago to today)
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 10);
      const dateFromStr = dateFrom.toISOString().split("T")[0];

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members?dateFrom=${dateFromStr}&dateTo=${today}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.retentionRate).toBe(50);
    });

    it("should compute retentionRate = 100% when no subs end in period", async () => {
      const plan = await createPlan({
        name: "Plan NoEnd Test",
        durationDays: 30,
      });
      const member = await createMember({
        email: "ret-noend@test.com",
        dni: "90000052",
      });

      // Assign sub starting today (ends in 30 days — not ending in our query range)
      const today = new Date().toISOString().split("T")[0];
      await assignSubscription(member.id, plan.id, {
        startDate: today,
      });

      // Query with date range covering past 10 days (no subs end in this range)
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - 10);
      const dateFromStr = dateFrom.toISOString().split("T")[0];

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members?dateFrom=${dateFromStr}&dateTo=${today}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.retentionRate).toBe(100);
    });

    it("should return attentionList with expiring members", async () => {
      const plan = await createPlan({
        name: "Plan Expiring Test",
        durationDays: 3,
      });
      const member = await createMember({
        email: "m-expire@test.com",
        dni: "90000010",
      });

      // Assign subscription starting 27 days ago (ends in 3 days)
      const startDate = new Date();
      startDate.setDate(
        startDate.getDate() - (plan.durationDays as number) + 3,
      );
      await assignSubscription(member.id, plan.id, {
        startDate: startDate.toISOString().split("T")[0],
      });

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.attentionList).toBeInstanceOf(Array);

      // The member should appear in attention list as expiring
      const expiring = body.attentionList.find(
        (m: { userId: number }) => m.userId === member.id,
      );
      expect(expiring).toBeDefined();
      expect(expiring.type).toBe("expiring");
      expect(expiring.daysUntilExpiry).toBeGreaterThanOrEqual(0);
      expect(expiring.daysUntilExpiry).toBeLessThanOrEqual(7);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Attendance Analytics
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET /api/admin/analytics/attendance", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("should return dailyCheckins array with dates and counts", async () => {
      // Create member and manually insert attendance records
      const member = await createMember({
        email: "m1@test.com",
        dni: "90000002",
      });

      await app.db.insert(attendance).values({
        memberId: member.id,
        branchId: testBranchId,
        status: "confirmado",
        source: "manual",
        confirmedAt: new Date(),
        sessionDate: new Date().toISOString().split("T")[0],
      });

      // Use ±1 day range to handle UTC/MySQL timezone boundary mismatches
      const yesterday = new Date(Date.now() - 86400000)
        .toISOString()
        .split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000)
        .toISOString()
        .split("T")[0];
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/attendance?dateFrom=${yesterday}&dateTo=${tomorrow}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.dailyCheckins).toBeInstanceOf(Array);
      expect(body.dailyCheckins.length).toBeGreaterThanOrEqual(1);
      expect(body.dailyCheckins[0].count).toBeGreaterThanOrEqual(1);
    });

    it("should return noShowRate as percentage", async () => {
      const today = new Date().toISOString().split("T")[0];
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/attendance?dateFrom=${today}&dateTo=${today}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.noShowRate).toBe("number");
      expect(body.noShowRate).toBeGreaterThanOrEqual(0);
      expect(body.noShowRate).toBeLessThanOrEqual(100);
    });

    it("should accept date range filters", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      const today = new Date().toISOString().split("T")[0];

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/attendance?dateFrom=${yesterdayStr}&dateTo=${today}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.dailyCheckins).toBeInstanceOf(Array);
      expect(body.peakHoursHeatmap).toBeInstanceOf(Array);
      expect(body.slotOccupancy).toBeInstanceOf(Array);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Financial Analytics
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET /api/admin/analytics/financial", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("should return revenueTrend with monthly revenue entries", async () => {
      const member = await createMember({
        email: "fin-m1@test.com",
        dni: "90000020",
      });
      // recordPayment auto-creates a plan+subscription (auto-payment of priceRegular=15000)
      // then records the manual payment of 15000 on top
      await recordPayment(member.id, 15000);

      const today = new Date().toISOString().split("T")[0];
      const firstOfMonth = today.substring(0, 8) + "01";

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/financial?dateFrom=${firstOfMonth}&dateTo=${today}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.revenueTrend).toBeInstanceOf(Array);
      expect(body.revenueTrend.length).toBeGreaterThanOrEqual(1);
      // Total: 15000 (auto from assign) + 15000 (manual) = 30000
      expect(body.revenueTrend[0].revenue).toBe(30000);
    });

    it("should return revenueByMethod breakdown", async () => {
      const member = await createMember({
        email: "fin-m2@test.com",
        dni: "90000021",
      });
      // First recordPayment creates a plan+sub (auto-payment of 15000 cash)
      // then records 5000 cash manually
      await recordPayment(member.id, 5000, { paymentMethod: "cash" });
      // Second recordPayment reuses same sub, records 3000 transfer
      await recordPayment(member.id, 3000, { paymentMethod: "transfer" });

      const today = new Date().toISOString().split("T")[0];
      const firstOfMonth = today.substring(0, 8) + "01";

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/financial?dateFrom=${firstOfMonth}&dateTo=${today}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.revenueByMethod).toBeDefined();
      // cash: 15000 (auto) + 5000 (manual) = 20000
      expect(body.revenueByMethod.cash).toBe(20000);
      expect(body.revenueByMethod.transfer).toBe(3000);
      expect(body.revenueByMethod.card).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // General / Auth
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Authorization", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("should return 403 for non-admin users on all endpoints", async () => {
      // Register a regular member
      const { token: memberToken } = await registerUser(app, {
        email: "regular-member@test.com",
        password: "pass123456",
        firstName: "Regular",
        lastName: "Member",
        branchId: testBranchId,
      });

      const endpoints = [
        ANALYTICS_URL,
        `${ANALYTICS_URL}/members`,
        `${ANALYTICS_URL}/attendance`,
        `${ANALYTICS_URL}/financial`,
      ];

      for (const url of endpoints) {
        const res = await app.inject({
          method: "GET",
          url,
          headers: { authorization: `Bearer ${memberToken}` },
        });
        expect(res.statusCode).toBe(403);
      }
    });
  });

  describe("Date range filtering", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("should filter results by dateFrom and dateTo across all endpoints", async () => {
      // Create member with some data
      const member = await createMember({
        email: "filter-m@test.com",
        dni: "90000030",
      });
      await recordPayment(member.id, 10000);

      // Use a narrow date range (today only)
      const today = new Date().toISOString().split("T")[0];

      const endpoints = [
        ANALYTICS_URL,
        `${ANALYTICS_URL}/members`,
        `${ANALYTICS_URL}/attendance`,
        `${ANALYTICS_URL}/financial`,
      ];

      for (const url of endpoints) {
        const res = await app.inject({
          method: "GET",
          url: `${url}?dateFrom=${today}&dateTo=${today}`,
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
      }
    });
  });
});
