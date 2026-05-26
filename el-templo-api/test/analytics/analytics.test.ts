import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  createStaffUser,
} from "../helpers";
import { bookings } from "../../src/db/schema/bookings";
import { completedSessions } from "../../src/db/schema/completed-sessions";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import { holidays } from "../../src/db/schema/holidays";
import { attendance } from "../../src/db/schema/attendance";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { users } from "../../src/db/schema/users";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { auraBalances } from "../../src/db/schema/aura-balances";
import { memberNotes } from "../../src/db/schema/member-notes";
import { branches } from "../../src/db/schema/branches";
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";
import { memberProfiles } from "../../src/db/schema/member-profiles";
import type { MemberSegment } from "../../src/modules/segmentation/types";
import { sql } from "drizzle-orm";
import { activeMemberExists } from "../../src/modules/shared/active-member";

const ANALYTICS_URL = "/api/admin/analytics";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";
const MEMBERS_URL = "/api/admin/members";
const PAYMENTS_URL = "/api/admin/payments";

describe("Analytics API", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminUserId: number;
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

    // Get admin user ID for recordedBy on financial_transactions inserts.
    const [adminUser] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@test.com"));
    adminUserId = adminUser.id;

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
   * Plan 105-06: payments API dropped — write directly to financial_transactions
   * + transaction_links pivot. Phase 106 will add /api/admin/transactions and
   * tests will migrate at that time.
   */
  async function recordPayment(
    memberId: number,
    amount: number,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
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
    const paymentMethod =
      (overrides.paymentMethod as "cash" | "transfer" | "card") ?? "cash";
    const [inserted] = await app.db.insert(financialTransactions).values({
      memberId,
      kind: "plan_charge",
      direction: "inflow",
      amount,
      currency: "ARS",
      paymentMethod,
      transactionDate: today,
      effectiveDate: today,
      branchId: testBranchId,
      recordedBy: adminUserId,
    });
    const txnId = (inserted as { insertId: number }).insertId;
    await app.db.insert(transactionLinks).values({
      transactionId: txnId,
      targetKind: "subscription",
      targetId: subId,
      allocatedAmount: amount,
    });
    return { id: txnId, amount, paymentMethod, subscriptionId: subId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Canonical "active member" predicate (Phase 117 D-01/D-02)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("activeMemberExists (shared canonical predicate)", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    /**
     * Count members for whom activeMemberExists is true, against MySQL real.
     * Real clock — NO vi.useFakeTimers (it desyncs from MySQL CURDATE(),
     * lesson from Plan 103-03).
     */
    async function countActiveViaHelper(): Promise<number> {
      const predicate = activeMemberExists(users.id);
      const [row] = await app.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(sql`${users.role} = 'member' AND ${predicate}`);
      return Number(row?.count ?? 0);
    }

    it("counts a member with an in-effect subscription (active + future end_date)", async () => {
      const member = await createMember({
        email: "active-vigente@test.com",
        dni: "90001001",
      });
      const plan = await createPlan({ name: `AM-Active-${Date.now()}` });
      // assignSubscription starts today; end_date = today + durationDays (future).
      await assignSubscription(member.id, plan.id);

      const count = await countActiveViaHelper();
      expect(count).toBe(1);
    });

    it("excludes a ghost: subscription end_date in the past even though users.status='activo'", async () => {
      const member = await createMember({
        email: "fantasma-vencido@test.com",
        dni: "90001002",
      });
      const plan = await createPlan({ name: `AM-Ghost-${Date.now()}` });
      await assignSubscription(member.id, plan.id);

      // Force the drift: subscription expired in the past, but users.status
      // left stale at 'activo' (the ~48 fantasmas scenario). The canonical
      // predicate must IGNORE users.status and look at the live subscription.
      const past = new Date(Date.now() - 86400000 * 10)
        .toISOString()
        .split("T")[0];
      const pastStart = new Date(Date.now() - 86400000 * 40)
        .toISOString()
        .split("T")[0];
      await app.db
        .update(subscriptions)
        .set({ startDate: pastStart, endDate: past, status: "expired" })
        .where(eq(subscriptions.userId, member.id));
      await app.db
        .update(users)
        .set({ status: "activo" })
        .where(eq(users.id, member.id));

      const count = await countActiveViaHelper();
      expect(count).toBe(0);
    });
  });

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
      // Phase 103 (R10): activeMembers now reads users.status='activo' (no
      // longer the legacy isActive=true that defaulted true for every
      // non-deleted user). Self-registered members start at 'freemium' —
      // assign each a subscription so recomputeUserStatus flips them to
      // 'activo' and they're counted.
      const m1 = await createMember({ email: "m1@test.com", dni: "90000002" });
      const m2 = await createMember({ email: "m2@test.com", dni: "90000003" });
      const plan = await createPlan({ name: `KPI-Plan-${Date.now()}` });
      await assignSubscription(m1.id, plan.id);
      await assignSubscription(m2.id, plan.id);

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
      // Phase 103 (R10): same migration as the test above — assign sub so
      // status='activo' and the member is counted by countActiveMembers.
      const m1 = await createMember({ email: "m1@test.com", dni: "90000002" });
      const plan = await createPlan({ name: `KPI-Plan-${Date.now()}` });
      await assignSubscription(m1.id, plan.id);

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

      // activeMembers + dailyAttendanceAvg keep the single { value, trend } shape.
      for (const key of ["activeMembers", "dailyAttendanceAvg"]) {
        expect(body[key]).toBeDefined();
        expect(body[key].trend).toBeDefined();
        expect(body[key].trend.direction).toMatch(/^(up|down|flat)$/);
        expect(typeof body[key].trend.percentage).toBe("number");
      }

      // Phase 117 D-05: monthlyRevenue is now per-currency, each with its own trend.
      expect(body.monthlyRevenue).toBeDefined();
      for (const cur of ["ARS", "EUR"]) {
        expect(body.monthlyRevenue[cur]).toBeDefined();
        expect(body.monthlyRevenue[cur].trend).toBeDefined();
        expect(body.monthlyRevenue[cur].trend.direction).toMatch(
          /^(up|down|flat)$/,
        );
        expect(typeof body.monthlyRevenue[cur].trend.percentage).toBe("number");
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
      // Phase 117 D-06: newMembers now counts only NEW *active* members
      // (canonical predicate), so the member must have a live subscription —
      // a bare self-registered freemium would no longer be counted.
      const m = await createMember({ email: "m1@test.com", dni: "90000002" });
      const plan = await createPlan({ name: `NewMembers-${Date.now()}` });
      await assignSubscription(m.id, plan.id);

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

    // ── D-14: overdue members in buckets 1-7/8-14/15-30 with REAL daysOverdue ─
    /**
     * Seed an EXPIRED, non-renewed subscription whose end_date is `daysAgo`
     * days in the past. The member is left without any in-effect subscription
     * so activeMemberExists() is false (= "vencido sin renovar").
     */
    async function seedOverdueSub(
      memberId: number,
      planId: number,
      daysAgo: number,
    ): Promise<void> {
      const end = new Date();
      end.setDate(end.getDate() - daysAgo);
      const endStr = end.toISOString().split("T")[0];
      const start = new Date();
      start.setDate(start.getDate() - daysAgo - 30);
      const startStr = start.toISOString().split("T")[0];
      await app.db.insert(subscriptions).values({
        userId: memberId,
        planId,
        branchId: testBranchId,
        status: "expired",
        startDate: startStr,
        endDate: endStr,
        pricePaid: 15000,
        priceTypeApplied: "regular",
      });
    }

    async function setSegment(
      userId: number,
      segment: MemberSegment | null,
    ): Promise<void> {
      await app.db
        .insert(memberProfiles)
        .values({ userId, segment })
        .onDuplicateKeyUpdate({ set: { segment } });
    }

    it("D-14: overdue members appear in buckets 1-7/8-14/15-30 with real daysOverdue; >30 excluded", async () => {
      const plan = await createPlan({ name: `Overdue-${Date.now()}` });
      const m3 = await createMember({ email: "ov3@test.com", dni: "90003001" });
      const m10 = await createMember({
        email: "ov10@test.com",
        dni: "90003002",
      });
      const m20 = await createMember({
        email: "ov20@test.com",
        dni: "90003003",
      });
      const m40 = await createMember({
        email: "ov40@test.com",
        dni: "90003004",
      });

      await seedOverdueSub(m3.id, plan.id, 3);
      await seedOverdueSub(m10.id, plan.id, 10);
      await seedOverdueSub(m20.id, plan.id, 20);
      await seedOverdueSub(m40.id, plan.id, 40); // >30 → excluded

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      const byId = (id: number) =>
        body.attentionList.find((m: { userId: number }) => m.userId === id);

      const o3 = byId(m3.id);
      const o10 = byId(m10.id);
      const o20 = byId(m20.id);

      expect(o3).toBeDefined();
      expect(o3.type).toBe("overdue");
      expect(o3.daysOverdue).toBe(3);
      expect(o3.daysUntilExpiry).toBeNull();

      expect(o10).toBeDefined();
      expect(o10.daysOverdue).toBe(10);
      expect(o20).toBeDefined();
      expect(o20.daysOverdue).toBe(20);

      // Overdue >30 days does NOT appear.
      expect(byId(m40.id)).toBeUndefined();
    });

    it("D-16: overdue member carries yaPago flag derived from recent financial_transactions", async () => {
      const plan = await createPlan({ name: `YaPago-${Date.now()}` });
      const paid = await createMember({
        email: "paid@test.com",
        dni: "90003010",
      });
      const unpaid = await createMember({
        email: "unpaid@test.com",
        dni: "90003011",
      });

      await seedOverdueSub(paid.id, plan.id, 5);
      await seedOverdueSub(unpaid.id, plan.id, 5);

      // The "paid" member has a recent non-voided plan_charge inflow.
      const today = new Date().toISOString().split("T")[0];
      await app.db.insert(financialTransactions).values({
        memberId: paid.id,
        kind: "plan_charge",
        direction: "inflow",
        amount: 15000,
        currency: "ARS",
        paymentMethod: "cash",
        transactionDate: today,
        effectiveDate: today,
        branchId: testBranchId,
        recordedBy: adminUserId,
      });

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const byId = (id: number) =>
        body.attentionList.find((m: { userId: number }) => m.userId === id);

      expect(byId(paid.id).yaPago).toBe(true);
      expect(byId(unpaid.id).yaPago).toBe(false);
    });

    it("D-16/D-17: overdue member carries its engagement segment for prioritization", async () => {
      const plan = await createPlan({ name: `Seg-${Date.now()}` });
      const ghost = await createMember({
        email: "ghost-ov@test.com",
        dni: "90003020",
      });
      await seedOverdueSub(ghost.id, plan.id, 4);
      await setSegment(ghost.id, "ghost");

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const found = body.attentionList.find(
        (m: { userId: number }) => m.userId === ghost.id,
      );
      expect(found).toBeDefined();
      expect(found.segment).toBe("ghost");
    });

    it("D-15: renewalRate returns last7/last14/last30 windows", async () => {
      const plan = await createPlan({ name: `Renewal-${Date.now()}` });
      // Member who expired 5 days ago and DID renew (has an in-effect sub).
      const renewed = await createMember({
        email: "renewed@test.com",
        dni: "90003030",
      });
      await seedOverdueSub(renewed.id, plan.id, 5);
      const today = new Date().toISOString().split("T")[0];
      const future = new Date(Date.now() + 86400000 * 30)
        .toISOString()
        .split("T")[0];
      await app.db.insert(subscriptions).values({
        userId: renewed.id,
        planId: plan.id,
        branchId: testBranchId,
        status: "active",
        startDate: today,
        endDate: future,
        pricePaid: 15000,
        priceTypeApplied: "regular",
      });
      // Member who expired 5 days ago and did NOT renew.
      const lapsed = await createMember({
        email: "lapsed@test.com",
        dni: "90003031",
      });
      await seedOverdueSub(lapsed.id, plan.id, 5);

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.renewalRate).toBeDefined();
      expect(body.renewalRate).toHaveProperty("last7");
      expect(body.renewalRate).toHaveProperty("last14");
      expect(body.renewalRate).toHaveProperty("last30");
      // 1 of 2 that ended in the last 7 days renewed → 50%.
      expect(body.renewalRate.last7).toBe(50);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 117 D-14/D-15/D-16/D-17 — member analytics contract + scope (Task 2)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET /members — extended contract + scope (Plan 05)", () => {
    let branchES: number;

    beforeEach(async () => {
      await cleanupAll();
      await app.db
        .insert(branches)
        .values({ name: "Sede ES Members", code: "TESTESM", country: "ES" })
        .onDuplicateKeyUpdate({ set: { name: "Sede ES Members" } });
      const [es] = await app.db
        .select({ id: branches.id })
        .from(branches)
        .where(eq(branches.code, "TESTESM"));
      branchES = es.id;
    });

    it("serializes the new attentionList fields (yaPago/segment/daysOverdue/type) without stripping", async () => {
      const plan = await createPlan({ name: `Contract-${Date.now()}` });
      const member = await createMember({
        email: "contract-ov@test.com",
        dni: "90004001",
      });
      // Overdue 6 days, not renewed.
      const end = new Date();
      end.setDate(end.getDate() - 6);
      const start = new Date();
      start.setDate(start.getDate() - 36);
      await app.db.insert(subscriptions).values({
        userId: member.id,
        planId: plan.id,
        branchId: testBranchId,
        status: "expired",
        startDate: start.toISOString().split("T")[0],
        endDate: end.toISOString().split("T")[0],
        pricePaid: 15000,
        priceTypeApplied: "regular",
      });
      await app.db
        .insert(memberProfiles)
        .values({ userId: member.id, segment: "en_riesgo" })
        .onDuplicateKeyUpdate({ set: { segment: "en_riesgo" } });

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const row = body.attentionList.find(
        (m: { userId: number }) => m.userId === member.id,
      );
      expect(row).toBeDefined();
      // fast-json-stringify would drop undeclared keys — assert they survive.
      expect(row).toHaveProperty("yaPago");
      expect(row).toHaveProperty("segment");
      expect(row).toHaveProperty("daysOverdue");
      expect(row).toHaveProperty("type");
      expect(row.type).toBe("overdue");
      expect(row.segment).toBe("en_riesgo");
      expect(row.daysOverdue).toBe(6);
      expect(typeof row.yaPago).toBe("boolean");
      // daysUntilExpiry still present in the contract (not broken).
      expect(row).toHaveProperty("daysUntilExpiry");
      // renewalRate present in the response.
      expect(body.renewalRate).toHaveProperty("last30");
    });

    it("scopes attentionList by sede: AR admin denied on ES sede, allowed on AR (T-117-01)", async () => {
      await createStaffUser(app, {
        email: "admin-ar-members@test.com",
        password: "adminarpass123",
        firstName: "Admin",
        lastName: "Members",
        role: "admin",
        branchId: testBranchId,
      });
      const arAdminToken = await getAuthToken(
        app,
        "admin-ar-members@test.com",
        "adminarpass123",
      );

      const denied = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members?branchId=${branchES}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(denied.statusCode).toBe(403);

      const ok = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members?branchId=${testBranchId}`,
        headers: { authorization: `Bearer ${arAdminToken}` },
      });
      expect(ok.statusCode).toBe(200);
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
      // Phase 117 D-05: per-currency shape. Total ARS: 15000 (auto from assign)
      // + 15000 (manual) = 30000; no EUR.
      expect(body.revenueTrend[0].ARS).toBe(30000);
      expect(body.revenueTrend[0].EUR).toBe(0);
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
      // Phase 117 D-05: per-currency shape. cash ARS: 15000 (auto) + 5000
      // (manual) = 20000; transfer ARS: 3000; card: none.
      expect(body.revenueByMethod.cash.ARS).toBe(20000);
      expect(body.revenueByMethod.cash.EUR).toBe(0);
      expect(body.revenueByMethod.transfer.ARS).toBe(3000);
      expect(body.revenueByMethod.card.ARS).toBe(0);
    });

    it("should expose outstandingByCurrency from balances (single currency, fully paid → 0)", async () => {
      const member = await createMember({
        email: "fin-m3@test.com",
        dni: "90000022",
      });
      // Default assignSubscription pays full chargeBase, so balance settles to 0.
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
      expect(body.outstandingByCurrency).toBeDefined();
      expect(body.outstandingByCurrency.ARS).toBe(0);
      expect(body.outstandingByCurrency.EUR).toBe(0);
      expect(body.totalOutstanding).toBeUndefined();
      expect(body.collectionRate).toBeUndefined();
    });

    it("should report unpaid plan as outstanding ARS debt", async () => {
      const member = await createMember({
        email: "fin-m4@test.com",
        dni: "90000023",
      });
      const plan = await createPlan({ name: `Debt-Plan-${Date.now()}` });
      // amountReceived=0 with positive chargeBase seeds a balance row equal to
      // the plan price, simulating "asignación con deuda total".
      await assignSubscription(member.id, plan.id, { amountReceived: 0 });

      const today = new Date().toISOString().split("T")[0];
      const firstOfMonth = today.substring(0, 8) + "01";

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/financial?dateFrom=${firstOfMonth}&dateTo=${today}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // chargeBase = priceRegular = 15000 (basePlan)
      expect(body.outstandingByCurrency.ARS).toBe(15000);
      expect(body.outstandingByCurrency.EUR).toBe(0);
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

    it("gestion reaches operational endpoints but is denied on admin-only ones (Phase 117)", async () => {
      await createStaffUser(app, {
        email: "gestion-analytics@test.com",
        password: "gestionpass123",
        firstName: "Gestion",
        lastName: "Analytics",
        role: "gestion",
        branchId: testBranchId,
      });
      const gestionToken = await getAuthToken(
        app,
        "gestion-analytics@test.com",
        "gestionpass123",
      );

      // Operational analytics surfaced inside Reportes — gestion is allowed.
      const operational = [
        `${ANALYTICS_URL}/attendance`,
        `${ANALYTICS_URL}/attendance/unique-members`,
        `${ANALYTICS_URL}/attendance/checkin-adoption`,
        `${ANALYTICS_URL}/engagement`,
      ];
      for (const url of operational) {
        const res = await app.inject({
          method: "GET",
          url,
          headers: { authorization: `Bearer ${gestionToken}` },
        });
        expect(res.statusCode).toBe(200);
      }

      // Financial / KPI / member analytics stay admin-only — gestion is denied.
      const adminOnly = [
        ANALYTICS_URL,
        `${ANALYTICS_URL}/members`,
        `${ANALYTICS_URL}/financial`,
      ];
      for (const url of adminOnly) {
        const res = await app.inject({
          method: "GET",
          url,
          headers: { authorization: `Bearer ${gestionToken}` },
        });
        expect(res.statusCode).toBe(403);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 117 bug fixes (D-02/D-04/D-05/D-06/D-07)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Phase 117 correctness fixes", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    async function createSchedule(): Promise<number> {
      const [act] = await app.db.insert(activities).values({
        name: `Act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        branchId: testBranchId,
      });
      const activityId = (act as { insertId: number }).insertId;
      const [sch] = await app.db.insert(schedules).values({
        branchId: testBranchId,
        activityId,
        dayOfWeek: 1,
        startTime: "10:00",
        endTime: "11:00",
      });
      return (sch as { insertId: number }).insertId;
    }

    // ── D-04: no-show uses the real enum 'confirmado' (not 'confirmed') ──────
    it("D-04: noShowRate uses 'confirmado' enum and returns the real proportion", async () => {
      const member = await createMember({
        email: "ns-m@test.com",
        dni: "90002001",
      });
      const scheduleId = await createSchedule();
      const today = new Date().toISOString().split("T")[0];

      // 3 attended ('confirmado') + 1 no_show => 25% no-show.
      await app.db.insert(bookings).values([
        {
          memberId: member.id,
          scheduleId,
          bookingDate: today,
          status: "confirmado",
        },
      ]);
      const m2 = await createMember({
        email: "ns-m2@test.com",
        dni: "90002002",
      });
      const m3 = await createMember({
        email: "ns-m3@test.com",
        dni: "90002003",
      });
      const m4 = await createMember({
        email: "ns-m4@test.com",
        dni: "90002004",
      });
      await app.db.insert(bookings).values([
        {
          memberId: m2.id,
          scheduleId,
          bookingDate: today,
          status: "confirmado",
        },
        {
          memberId: m3.id,
          scheduleId,
          bookingDate: today,
          status: "confirmado",
        },
        {
          memberId: m4.id,
          scheduleId,
          bookingDate: today,
          status: "no_show",
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/attendance?dateFrom=${today}&dateTo=${today}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // 1 no_show of 4 booked = 25%. With the old 'confirmed' typo the
      // confirmado rows would not match and the rate would be 100% (1/1).
      expect(body.noShowRate).toBe(25);
    });

    // ── D-05: revenue never sums currencies; ARS/EUR are separate keys ───────
    it("D-05: revenue separates ARS and EUR and never sums them", async () => {
      const member = await createMember({
        email: "cur-m@test.com",
        dni: "90002010",
      });
      const plan = await createPlan({ name: `Cur-Plan-${Date.now()}` });
      const sub = await assignSubscription(member.id, plan.id);
      const today = new Date().toISOString().split("T")[0];

      // One ARS inflow and one EUR inflow, both plan_charge.
      for (const currency of ["ARS", "EUR"] as const) {
        const [tx] = await app.db.insert(financialTransactions).values({
          memberId: member.id,
          kind: "plan_charge",
          direction: "inflow",
          amount: currency === "ARS" ? 10000 : 200,
          currency,
          paymentMethod: "cash",
          transactionDate: today,
          effectiveDate: today,
          branchId: testBranchId,
          recordedBy: adminUserId,
        });
        await app.db.insert(transactionLinks).values({
          transactionId: (tx as { insertId: number }).insertId,
          targetKind: "subscription",
          targetId: sub.id as number,
          allocatedAmount: currency === "ARS" ? 10000 : 200,
        });
      }

      const firstOfMonth = today.substring(0, 8) + "01";
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/financial?dateFrom=${firstOfMonth}&dateTo=${today}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      // assignSubscription auto-charges priceRegular(15000) ARS, plus our
      // 10000 ARS manual = 25000 ARS; EUR is the standalone 200.
      // revenueTrend entry carries SEPARATE ARS/EUR — never a single summed number.
      expect(body.revenueTrend.length).toBeGreaterThanOrEqual(1);
      const monthRow = body.revenueTrend[0];
      expect(monthRow.ARS).toBe(25000);
      expect(monthRow.EUR).toBe(200);
      expect(monthRow.revenue).toBeUndefined();

      // revenueByMethod.cash is keyed by currency.
      expect(body.revenueByMethod.cash.ARS).toBe(25000);
      expect(body.revenueByMethod.cash.EUR).toBe(200);

      // revenueByBranch separates per currency.
      const branchRow = body.revenueByBranch.find(
        (b: { branchId: number }) => b.branchId === testBranchId,
      );
      expect(branchRow.ARS).toBe(25000);
      expect(branchRow.EUR).toBe(200);
    });

    it("D-05: monthlyRevenue KPI is split per currency", async () => {
      const member = await createMember({
        email: "kpi-cur@test.com",
        dni: "90002011",
      });
      const plan = await createPlan({ name: `KpiCur-${Date.now()}` });
      const sub = await assignSubscription(member.id, plan.id);
      const today = new Date().toISOString().split("T")[0];

      const [tx] = await app.db.insert(financialTransactions).values({
        memberId: member.id,
        kind: "plan_charge",
        direction: "inflow",
        amount: 500,
        currency: "EUR",
        paymentMethod: "cash",
        transactionDate: today,
        effectiveDate: today,
        branchId: testBranchId,
        recordedBy: adminUserId,
      });
      await app.db.insert(transactionLinks).values({
        transactionId: (tx as { insertId: number }).insertId,
        targetKind: "subscription",
        targetId: sub.id as number,
        allocatedAmount: 500,
      });

      const today2 = new Date().toISOString().split("T")[0];
      const firstOfMonth = today2.substring(0, 8) + "01";
      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}?dateFrom=${firstOfMonth}&dateTo=${today2}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.monthlyRevenue.ARS).toBeDefined();
      expect(body.monthlyRevenue.EUR).toBeDefined();
      // assignSubscription auto-charges priceRegular(15000) ARS + 500 EUR manual.
      expect(body.monthlyRevenue.EUR.value).toBe(500);
      expect(body.monthlyRevenue.ARS.value).toBe(15000);
      expect(typeof body.monthlyRevenue.value).toBe("undefined");
    });

    // ── D-06: newInPeriod counts only new ACTIVE members ─────────────────────
    it("D-06: newMembers counts only new active members, not freemium/trial", async () => {
      // Active new member (has a subscription -> activeMemberExists true).
      const active = await createMember({
        email: "new-active@test.com",
        dni: "90002020",
      });
      const plan = await createPlan({ name: `NewActive-${Date.now()}` });
      await assignSubscription(active.id, plan.id);

      // Freemium new member (self-registered, no subscription).
      await createMember({ email: "new-freemium@test.com", dni: "90002021" });

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
      // Only the active member counts; the freemium one is excluded.
      expect(body.newMembers).toBe(1);
    });

    // ── D-07: plan distribution groups by (name, country), excludes archived ─
    it("D-07: planDistribution groups by name+country and hides archived plans", async () => {
      const ts = Date.now();
      const planAR = await createPlan({ name: `Flex-${ts}`, country: "AR" });
      const planES = await createPlan({ name: `Flex-${ts}`, country: "ES" });
      const archived = await createPlan({ name: `Archived-${ts}` });

      const mAR = await createMember({
        email: "flex-ar@test.com",
        dni: "90002030",
      });
      const mES = await createMember({
        email: "flex-es@test.com",
        dni: "90002031",
      });
      const mArch = await createMember({
        email: "arch@test.com",
        dni: "90002032",
      });

      // Insert subscriptions directly (the /assign API enforces a cross-country
      // guard that would reject an ES plan for an AR-branch member; here we only
      // need active subscriptions referencing each plan to exercise the
      // group-by-(name,country) + is_archived filter). All members share
      // testBranchId so they pass the analytics branch/country scope; grouping
      // is by the PLAN's country, not the branch's.
      const today = new Date().toISOString().split("T")[0];
      const future = new Date(Date.now() + 86400000 * 30)
        .toISOString()
        .split("T")[0];
      for (const [m, p] of [
        [mAR, planAR],
        [mES, planES],
        [mArch, archived],
      ] as const) {
        await app.db.insert(subscriptions).values({
          userId: m.id,
          planId: p.id as number,
          branchId: testBranchId,
          status: "active",
          startDate: today,
          endDate: future,
          pricePaid: 15000,
          priceTypeApplied: "regular",
        });
      }

      // Archive the third plan after subscription creation.
      await app.db
        .update(subscriptionPlans)
        .set({ isArchived: true })
        .where(eq(subscriptionPlans.id, archived.id as number));

      const res = await app.inject({
        method: "GET",
        url: `${ANALYTICS_URL}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      const flexRows = body.planDistribution.filter(
        (p: { planName: string }) => p.planName === `Flex-${ts}`,
      );
      // Two separate rows: Flex (AR) and Flex (ES) — never merged.
      expect(flexRows.length).toBe(2);
      const countries = flexRows
        .map((r: { country: string }) => r.country)
        .sort();
      expect(countries).toEqual(["AR", "ES"]);

      // Archived plan does not appear.
      const archRow = body.planDistribution.find(
        (p: { planName: string }) => p.planName === `Archived-${ts}`,
      );
      expect(archRow).toBeUndefined();
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
