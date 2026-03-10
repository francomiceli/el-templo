import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { createTestApp, getAuthToken, registerUser } from "../helpers";
import { attendance } from "../../src/db/schema/attendance";
import { payments } from "../../src/db/schema/payments";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { users } from "../../src/db/schema/users";
import { auraTransactions } from "../../src/db/schema/aura-transactions";
import { auraBalances } from "../../src/db/schema/aura-balances";
import { memberNotes } from "../../src/db/schema/member-notes";
import { branches } from "../../src/db/schema/branches";
import { bookings } from "../../src/db/schema/bookings";
import { schedules } from "../../src/db/schema/schedules";
import { activities } from "../../src/db/schema/activities";
import { holidays } from "../../src/db/schema/holidays";

const ADMIN_ATTENDANCE_URL = "/api/admin/attendance";
const MEMBER_ATTENDANCE_URL = "/api/members/attendance";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";
const MEMBERS_URL = "/api/admin/members";
const PAYMENTS_URL = "/api/admin/payments";

describe("Attendance API", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let testBranchId: number;
  let testBranchName: string;

  // Reusable plan payload (single-branch)
  const basePlan = {
    name: "Plan Asistencia Test",
    planTier: "flex",
    bookingMode: "flexible",
    priceRegular: 15000,
    priceZero: 10000,
    durationDays: 30,
    classesPerWeek: 3,
    multiBranch: false,
  };

  // Reusable member payload (branchId set in beforeAll after discovering non-virtual branch)
  const baseMember = {
    email: "attendance-test@test.com",
    password: "pass123456",
    firstName: "Asistencia",
    lastName: "Tester",
    phone: "+5491100009999",
    dni: "90000001",
    branchId: 0, // overwritten in beforeAll
  };

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Get the first non-virtual branch (migration seeds Templo Online as virtual before test seed)
    const [branch] = await app.db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.isVirtual, false));
    testBranchId = branch.id;
    testBranchName = branch.name;
    baseMember.branchId = testBranchId;
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Helper: clean up all test data in FK order.
   */
  async function cleanupAll(): Promise<void> {
    await app.db.delete(auraTransactions);
    await app.db.delete(auraBalances);
    await app.db.delete(bookings);
    await app.db.delete(holidays);
    await app.db.delete(attendance);
    await app.db.delete(schedules);
    await app.db.delete(activities);
    await app.db.delete(payments);
    await app.db.delete(subscriptions);
    await app.db.delete(subscriptionPlans);
    await app.db.delete(memberNotes);
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
        branchId: testBranchId,
        startDate: "2026-03-01",
        priceTypeApplied: "regular",
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  /**
   * Helper: record a payment for a member (to avoid overdue status).
   */
  async function recordPayment(
    userId: number,
    amount: number,
    subscriptionId?: number,
  ): Promise<void> {
    const res = await app.inject({
      method: "POST",
      url: `${PAYMENTS_URL}/members/${userId}/payments`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        amount,
        paymentMethod: "cash",
        paymentDate: "2026-03-10",
        ...(subscriptionId ? { subscriptionId } : {}),
      },
    });
    expect(res.statusCode).toBe(201);
  }

  /**
   * Helper: set up a member with active, paid subscription (ready to check in).
   */
  async function setupMemberWithSubscription(
    memberOverrides: Record<string, unknown> = {},
    planOverrides: Record<string, unknown> = {},
  ): Promise<{
    member: { id: number; [key: string]: unknown };
    plan: { id: number; [key: string]: unknown };
    subscription: { id: number; [key: string]: unknown };
    memberToken: string;
  }> {
    const plan = await createPlan(planOverrides);
    const member = await createMember(memberOverrides);
    const subscription = await assignPlan(member.id, plan.id);
    // Pay full amount to avoid overdue
    await recordPayment(
      member.id,
      basePlan.priceRegular,
      subscription.id as number,
    );
    // Get member's auth token
    const memberToken = await getAuthToken(
      app,
      (memberOverrides.email as string) || baseMember.email,
      (memberOverrides.password as string) || baseMember.password,
    );
    return { member, plan, subscription, memberToken };
  }

  // =========================================================================
  // QR Token Generation
  // =========================================================================
  describe("QR Token Generation", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("GET generates QR token for valid branch", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/qr/${testBranchId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.token).toBeTruthy();
      expect(typeof body.token).toBe("string");
      expect(body.branchId).toBe(testBranchId);
      expect(body.branchName).toBe(testBranchName);
    });

    it("GET rejects QR generation for virtual branch", async () => {
      // Use the existing Templo Online virtual branch (seeded by migration 0030)
      const [virtualBranch] = await app.db
        .select({ id: branches.id })
        .from(branches)
        .where(eq(branches.isVirtual, true));

      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/qr/${virtualBranch.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("virtual");
    });

    it("GET returns 404 for non-existent branch", async () => {
      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/qr/99999`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("non-admin cannot generate QR", async () => {
      const { token: memberToken } = await registerUser(app, {
        email: "qr-auth-test@test.com",
        password: "pass123456",
        branchId: testBranchId,
        firstName: "QR",
        lastName: "AuthTest",
      });

      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/qr/${testBranchId}`,
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // Member Check-in
  // =========================================================================
  describe("Member Check-in", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("POST valid QR check-in returns 201 with registrado record", async () => {
      const { member, memberToken } = await setupMemberWithSubscription();

      // Generate QR token
      const qrRes = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/qr/${testBranchId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { token: qrToken } = JSON.parse(qrRes.body);

      // Check in
      const res = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.id).toBeTruthy();
      expect(body.memberId).toBe(member.id);
      expect(body.branchId).toBe(testBranchId);
      expect(body.status).toBe("registrado");
      expect(body.source).toBe("qr");
      expect(body.confirmedAt).toBeNull();
      expect(body.memberName).toBeTruthy();
      expect(body.branchName).toBe(testBranchName);
    });

    it("POST rejects invalid/forged QR token", async () => {
      const { memberToken } = await setupMemberWithSubscription();

      const res = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken: "forged-token-value" },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("QR invalido");
    });

    it("POST rejects check-in without active subscription", async () => {
      // Create member without subscription
      const member = await createMember({
        email: "nosub@test.com",
        dni: "90000010",
      });
      const memberToken = await getAuthToken(
        app,
        "nosub@test.com",
        baseMember.password,
      );

      const qrRes = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/qr/${testBranchId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { token: qrToken } = JSON.parse(qrRes.body);

      const res = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("suscripcion activa");
    });

    it("POST rejects overdue member check-in", async () => {
      // Create member with paused subscription past end date and partial payment.
      // Paused subs are NOT auto-expired, so getMemberSubscription finds it,
      // and getMemberBalance returns isOverdue=true.
      const plan = await createPlan({ durationDays: 1 });
      const member = await createMember({
        email: "overdue-checkin@test.com",
        dni: "90000020",
      });
      const sub = await assignPlan(member.id, plan.id, {
        startDate: "2025-01-01",
      });

      // Pause the subscription (before it gets auto-expired)
      // We need to manually set status=paused + pausedAt in DB
      // since the pause API checks for active status (but sub is now expired)
      await app.db
        .update(subscriptions)
        .set({
          status: "paused",
          pausedAt: new Date("2025-01-01"),
        })
        .where(eq(subscriptions.id, sub.id as number));

      // No payment — subscription overdue
      const memberToken = await getAuthToken(
        app,
        "overdue-checkin@test.com",
        baseMember.password,
      );

      const qrRes = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/qr/${testBranchId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { token: qrToken } = JSON.parse(qrRes.body);

      const res = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("pago pendiente");
    });

    it("POST rejects check-in with expired subscription (no active sub)", async () => {
      // Create member with expired subscription (auto-expired on read)
      const plan = await createPlan({ durationDays: 1 });
      const member = await createMember({
        email: "expired-checkin@test.com",
        dni: "90000025",
      });
      await assignPlan(member.id, plan.id, { startDate: "2025-01-01" });
      // Subscription endDate 2025-01-02, auto-expires on read

      const memberToken = await getAuthToken(
        app,
        "expired-checkin@test.com",
        baseMember.password,
      );

      const qrRes = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/qr/${testBranchId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { token: qrToken } = JSON.parse(qrRes.body);

      const res = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("suscripcion activa");
    });

    it("POST rejects duplicate check-in same day", async () => {
      const { memberToken } = await setupMemberWithSubscription();

      const qrRes = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/qr/${testBranchId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { token: qrToken } = JSON.parse(qrRes.body);

      // First check-in
      const res1 = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });
      expect(res1.statusCode).toBe(201);

      // Second check-in same day
      const res2 = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });

      expect(res2.statusCode).toBe(400);
      const body = JSON.parse(res2.body);
      expect(body.message).toContain("Ya registraste");
    });

    it("POST rejects single-branch plan at wrong branch", async () => {
      // Create a second non-virtual branch
      await app.db.insert(branches).values({
        name: "Branch 2",
        code: "BR2",
        isVirtual: false,
      });
      const [branch2] = await app.db
        .select({ id: branches.id })
        .from(branches)
        .where(eq(branches.code, "BR2"));

      // Member assigned to branch 1, single-branch plan
      const { memberToken } = await setupMemberWithSubscription(
        { email: "branch-test@test.com", dni: "90000030" },
        { multiBranch: false },
      );

      // Generate QR for branch 2
      const qrRes = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/qr/${branch2.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { token: qrToken } = JSON.parse(qrRes.body);

      const res = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("sede asignada");

      // Cleanup branch 2
      await app.db.delete(branches).where(eq(branches.id, branch2.id));
    });
  });

  // =========================================================================
  // Batch Confirm
  // =========================================================================
  describe("Batch Confirm", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("POST confirms attendance records and awards AURA", async () => {
      const { member, memberToken } = await setupMemberWithSubscription();

      // Check in via QR
      const qrRes = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/qr/${testBranchId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const { token: qrToken } = JSON.parse(qrRes.body);

      const checkInRes = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });
      const checkInBody = JSON.parse(checkInRes.body);
      expect(checkInBody.status).toBe("registrado");

      // Batch confirm
      const confirmRes = await app.inject({
        method: "POST",
        url: `${ADMIN_ATTENDANCE_URL}/confirm`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { attendanceIds: [checkInBody.id] },
      });

      expect(confirmRes.statusCode).toBe(200);
      const confirmBody = JSON.parse(confirmRes.body);
      expect(confirmBody.confirmed).toBe(1);

      // Verify record is now confirmado
      const todayRes = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/today?branchId=${testBranchId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const todayBody = JSON.parse(todayRes.body);
      const record = todayBody.records.find(
        (r: Record<string, unknown>) => r.id === checkInBody.id,
      );
      expect(record.status).toBe("confirmado");
      expect(record.confirmedAt).toBeTruthy();

      // Verify AURA was awarded
      const [auraBalance] = await app.db
        .select({ balance: auraBalances.balance })
        .from(auraBalances)
        .where(eq(auraBalances.userId, member.id));
      expect(auraBalance).toBeTruthy();
      expect(auraBalance.balance).toBeGreaterThan(0);
    });

    it("POST with empty array returns count 0", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${ADMIN_ATTENDANCE_URL}/confirm`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { attendanceIds: [] },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.confirmed).toBe(0);
    });

    it("non-admin cannot batch confirm", async () => {
      const { token: memberToken } = await registerUser(app, {
        email: "confirm-auth-test@test.com",
        password: "pass123456",
        branchId: testBranchId,
        firstName: "Confirm",
        lastName: "AuthTest",
      });

      const res = await app.inject({
        method: "POST",
        url: `${ADMIN_ATTENDANCE_URL}/confirm`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { attendanceIds: [1] },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // Manual Check-in
  // =========================================================================
  describe("Manual Check-in", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("POST creates auto-confirmed record with AURA award", async () => {
      const { member } = await setupMemberWithSubscription();

      const res = await app.inject({
        method: "POST",
        url: `${ADMIN_ATTENDANCE_URL}/manual`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { memberId: member.id, branchId: testBranchId },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.memberId).toBe(member.id);
      expect(body.status).toBe("confirmado");
      expect(body.source).toBe("manual");
      expect(body.confirmedAt).toBeTruthy();

      // Verify AURA awarded immediately
      const [auraBalance] = await app.db
        .select({ balance: auraBalances.balance })
        .from(auraBalances)
        .where(eq(auraBalances.userId, member.id));
      expect(auraBalance).toBeTruthy();
      expect(auraBalance.balance).toBeGreaterThan(0);
    });

    it("POST rejects duplicate manual check-in same day", async () => {
      const { member } = await setupMemberWithSubscription();

      // First manual check-in
      const res1 = await app.inject({
        method: "POST",
        url: `${ADMIN_ATTENDANCE_URL}/manual`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { memberId: member.id, branchId: testBranchId },
      });
      expect(res1.statusCode).toBe(201);

      // Second manual check-in same day
      const res2 = await app.inject({
        method: "POST",
        url: `${ADMIN_ATTENDANCE_URL}/manual`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { memberId: member.id, branchId: testBranchId },
      });

      expect(res2.statusCode).toBe(400);
      const body = JSON.parse(res2.body);
      expect(body.message).toContain("Ya registraste");
    });
  });

  // =========================================================================
  // Attendance Queries
  // =========================================================================
  describe("Attendance Queries", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("GET /today returns today's records for branch", async () => {
      const { member } = await setupMemberWithSubscription();

      // Manual check-in
      await app.inject({
        method: "POST",
        url: `${ADMIN_ATTENDANCE_URL}/manual`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { memberId: member.id, branchId: testBranchId },
      });

      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/today?branchId=${testBranchId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.records.length).toBeGreaterThanOrEqual(1);
      expect(body.records[0].branchId).toBe(testBranchId);
    });

    it("GET / with date filter returns filtered results", async () => {
      const { member } = await setupMemberWithSubscription();

      // Manual check-in (creates a record for today)
      await app.inject({
        method: "POST",
        url: `${ADMIN_ATTENDANCE_URL}/manual`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { memberId: member.id, branchId: testBranchId },
      });

      const today = new Date().toISOString().split("T")[0];

      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}?branchId=${testBranchId}&date=${today}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.records.length).toBeGreaterThanOrEqual(1);
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
      expect(body).toHaveProperty("limit");
    });

    it("GET /member/:userId returns member attendance history", async () => {
      const { member } = await setupMemberWithSubscription();

      // Manual check-in
      await app.inject({
        method: "POST",
        url: `${ADMIN_ATTENDANCE_URL}/manual`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { memberId: member.id, branchId: testBranchId },
      });

      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/member/${member.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.records.length).toBeGreaterThanOrEqual(1);
      expect(body.records[0].memberId).toBe(member.id);
      expect(body).toHaveProperty("total");
      expect(body).toHaveProperty("page");
    });

    it("GET /history returns member's own attendance", async () => {
      const { member, memberToken } = await setupMemberWithSubscription();

      // Manual check-in by admin
      await app.inject({
        method: "POST",
        url: `${ADMIN_ATTENDANCE_URL}/manual`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { memberId: member.id, branchId: testBranchId },
      });

      const res = await app.inject({
        method: "GET",
        url: `${MEMBER_ATTENDANCE_URL}/history`,
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.records.length).toBeGreaterThanOrEqual(1);
      expect(body.records[0].memberId).toBe(member.id);
    });
  });

  // =========================================================================
  // Authorization
  // =========================================================================
  describe("Authorization", () => {
    it("non-admin gets 403 on admin attendance endpoints", async () => {
      const { token: memberToken } = await registerUser(app, {
        email: "attn-auth-test@test.com",
        password: "pass123456",
        branchId: testBranchId,
        firstName: "Auth",
        lastName: "Test",
      });

      const adminEndpoints = [
        {
          method: "GET" as const,
          url: `${ADMIN_ATTENDANCE_URL}/qr/${testBranchId}`,
        },
        {
          method: "GET" as const,
          url: `${ADMIN_ATTENDANCE_URL}/today?branchId=${testBranchId}`,
        },
        {
          method: "POST" as const,
          url: `${ADMIN_ATTENDANCE_URL}/confirm`,
          payload: { attendanceIds: [] },
        },
        {
          method: "POST" as const,
          url: `${ADMIN_ATTENDANCE_URL}/manual`,
          payload: { memberId: 1, branchId: 1 },
        },
        { method: "GET" as const, url: `${ADMIN_ATTENDANCE_URL}` },
        {
          method: "GET" as const,
          url: `${ADMIN_ATTENDANCE_URL}/member/1`,
        },
      ];

      for (const ep of adminEndpoints) {
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

    it("unauthenticated request to member check-in returns 401", async () => {
      const res = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        payload: { qrToken: "whatever" },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
