import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  dateOffsetStr,
} from "../helpers";
import { attendance } from "../../src/db/schema/attendance";
import { completedSessions } from "../../src/db/schema/completed-sessions";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import { transactionLinks } from "../../src/db/schema/transaction-links";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantValues, tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 172: `finance` entra en `TENANT_STRICT_MODULES`. El seed de cobro de
 * este archivo estampa el gimnasio explicito en vez de depender del `DEFAULT 1`
 * de la columna `tenant_id`.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };
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
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";
import { generateQrToken as generateQr } from "../../src/modules/shared/qr-token";

const ADMIN_ATTENDANCE_URL = "/api/admin/attendance";
const MEMBER_ATTENDANCE_URL = "/api/members/attendance";
const SUBSCRIPTIONS_URL = "/api/admin/subscriptions";
const MEMBERS_URL = "/api/admin/members";
const PAYMENTS_URL = "/api/admin/payments";

describe("Attendance API", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminUserId: number;
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

  // Reusable member defaults (branchId set in beforeAll)
  const baseMemberDefaults = {
    email: "attendance-test@test.com",
    password: "pass123456",
    firstName: "Asistencia",
    lastName: "Tester",
    branchId: 0, // overwritten in beforeAll
  };

  beforeAll(async () => {
    // Pin to Wednesday 13:00 UTC (= 10:00 AR for branches with default
    // timezone "America/Argentina/Buenos_Aires") so booking-window and
    // week-range helpers always have valid future slots within Mon-Sat.
    // Using explicit UTC ensures the test is independent of the host
    // timezone — production servers run in UTC and check-in must work
    // correctly for branches in negative-offset timezones.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-11T13:00:00Z")); // 10:00 AR Wednesday

    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Get admin user ID for recordedBy on financial_transactions inserts.
    const [adminUser] = await app.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(tenantWhere(users, TEMPLO_CTX), eq(users.email, "admin@test.com")),
      );
    adminUserId = adminUser.id;

    // Get the first non-virtual branch (migration seeds Templo Online as virtual before test seed)
    const [branch] = await app.db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.isVirtual, false));
    testBranchId = branch.id;
    testBranchName = branch.name;
    baseMemberDefaults.branchId = testBranchId;
  });

  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });

  /**
   * Helper: clean up all test data in FK order.
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
        startDate: dateOffsetStr(-25),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.body);
  }

  /**
   * Helper: record a payment for a member.
   */
  /**
   * Plan 105-06: payments API dropped — write directly to financial_transactions
   * + transaction_links to keep tests that depend on a paid subscription state.
   * Phase 106 will add /api/admin/transactions as the new endpoint and tests can
   * migrate to it.
   */
  async function recordPayment(
    userId: number,
    amount: number,
    subscriptionId: number,
  ): Promise<void> {
    const [inserted] = await app.db.insert(financialTransactions).values(
      tenantValues(TEMPLO_CTX, {
        memberId: userId,
        kind: "plan_charge",
        direction: "inflow",
        amount,
        currency: "ARS",
        paymentMethod: "cash",
        transactionDate: "2026-03-10",
        effectiveDate: "2026-03-10",
        branchId: testBranchId,
        recordedBy: adminUserId,
      }),
    );
    const txnId = (inserted as { insertId: number }).insertId;
    await app.db.insert(transactionLinks).values(
      tenantValues(TEMPLO_CTX, {
        transactionId: txnId,
        targetKind: "subscription",
        targetId: subscriptionId,
        allocatedAmount: amount,
      }),
    );
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
    // Record payment for subscription
    await recordPayment(
      member.id,
      basePlan.priceRegular,
      subscription.id as number,
    );
    // Get member's auth token
    const memberToken = await getAuthToken(
      app,
      (memberOverrides.email as string) || baseMemberDefaults.email,
      (memberOverrides.password as string) || baseMemberDefaults.password,
    );
    return { member, plan, subscription, memberToken };
  }

  /**
   * Helper: generate a QR token directly via shared util.
   */
  function generateQrToken(branchId: number): string {
    return generateQr(branchId);
  }

  /**
   * Helper: create an activity, schedule slot, and booking for a member.
   * The schedule is set to the faked "now" time (10:00) on Wednesday (day 3)
   * so it falls within the ±20 min check-in window.
   */
  async function createBookingForNow(
    memberId: number,
    branchId: number,
  ): Promise<{ activityId: number; scheduleId: number; bookingId: number }> {
    // Create activity
    const [actResult] = await app.db.insert(activities).values({
      name: "Calistenia Test",
      branchId,
    });
    const activityId = Number(actResult.insertId);

    // Create schedule for Wednesday (day 3) at 10:00 (matches faked time)
    const [schResult] = await app.db.insert(schedules).values({
      activityId,
      branchId,
      dayOfWeek: 3, // Wednesday
      startTime: "10:00",
      endTime: "11:00",
      isActive: true,
    });
    const scheduleId = Number(schResult.insertId);

    // Create booking for the faked today (2026-03-11)
    const [bkResult] = await app.db.insert(bookings).values({
      memberId,
      scheduleId,
      branchId,
      bookingDate: "2026-03-11",
      status: "reservado",
    });
    const bookingId = Number(bkResult.insertId);

    return { activityId, scheduleId, bookingId };
  }

  // =========================================================================
  // Member Check-in
  // =========================================================================
  describe("Member Check-in", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("POST valid QR check-in returns 201 with confirmado record and awards AURA", async () => {
      const { member, memberToken } = await setupMemberWithSubscription();
      await createBookingForNow(member.id, testBranchId);

      const qrToken = generateQrToken(testBranchId);

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
      expect(body.status).toBe("confirmado");
      expect(body.source).toBe("qr");
      expect(body.memberName).toBeTruthy();
      expect(body.branchName).toBe(testBranchName);

      // Verify AURA was awarded immediately
      const auraRows = await app.db
        .select({ amount: auraTransactions.amount })
        .from(auraTransactions)
        .where(eq(auraTransactions.userId, member.id));

      expect(auraRows.length).toBeGreaterThanOrEqual(1);
      const attendanceAward = auraRows.find((r) => r.amount === 10);
      expect(attendanceAward).toBeTruthy();
    });

    it("POST QR check-in mirrors the attendance as a completed_sessions row tagged 'presencial'", async () => {
      const { member, memberToken } = await setupMemberWithSubscription();
      await createBookingForNow(member.id, testBranchId);

      const qrToken = generateQrToken(testBranchId);

      const res = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });
      expect(res.statusCode).toBe(201);

      const sessions = await app.db
        .select({
          userId: completedSessions.userId,
          branchId: completedSessions.branchId,
          goalPlanType: completedSessions.goalPlanType,
          date: completedSessions.date,
          dayId: completedSessions.dayId,
        })
        .from(completedSessions)
        .where(eq(completedSessions.userId, member.id));

      expect(sessions).toHaveLength(1);
      expect(sessions[0].goalPlanType).toBe("presencial");
      expect(sessions[0].branchId).toBe(testBranchId);
      const todayStr = new Date().toISOString().split("T")[0];
      expect(sessions[0].date).toBe(todayStr);
      expect(sessions[0].dayId).toBe(`presencial-${todayStr}`);
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
        baseMemberDefaults.password,
      );

      const qrToken = generateQrToken(testBranchId);

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

    it("POST rejects check-in with expired subscription (hard block, no grace period)", async () => {
      // Create member with expired subscription — should be auto-expired and return no active sub
      const plan = await createPlan({ durationDays: 1 });
      const member = await createMember({
        email: "expired-checkin@test.com",
        dni: "90000025",
      });
      await assignPlan(member.id, plan.id, { startDate: dateOffsetStr(-2) });
      // Subscription endDate 2025-01-02, 14+ months ago — auto-expire catches it

      const memberToken = await getAuthToken(
        app,
        "expired-checkin@test.com",
        baseMemberDefaults.password,
      );

      const qrToken = generateQrToken(testBranchId);

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
      const { member, memberToken } = await setupMemberWithSubscription();
      await createBookingForNow(member.id, testBranchId);

      const qrToken = generateQrToken(testBranchId);

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
      const qrToken = generateQrToken(branch2.id);

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
  // Attendance Queries
  // =========================================================================
  describe("Attendance Queries", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("GET /member/:userId returns member attendance history", async () => {
      const { member, memberToken } = await setupMemberWithSubscription();
      await createBookingForNow(member.id, testBranchId);

      // Check in via QR
      const qrToken = generateQrToken(testBranchId);
      await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
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
      await createBookingForNow(member.id, testBranchId);

      // Check in via QR
      const qrToken = generateQrToken(testBranchId);
      await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
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

    it("GET /slot endDate refleja la cobertura encadenada (sub programada), no solo la activa", async () => {
      // Bug Joaquim Mas (2026-07-07): el pill "Venc" mostraba "vence mañana"
      // mirando solo la sub activa e ignorando la renovación/cambio ya
      // programado que continúa la cobertura. El endDate del slot debe ser el
      // MÁXIMO entre active + scheduled.
      const { member, subscription } = await setupMemberWithSubscription();
      const activeEndDate = subscription.endDate as string;

      // Renovación anticipada → successor 'scheduled' encadenado al vencimiento
      // actual, extiende la cobertura.
      const renewRes = await app.inject({
        method: "POST",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { paymentMethod: "cash" },
      });
      expect(renewRes.statusCode).toBe(201);
      const scheduled = JSON.parse(renewRes.body);
      expect(scheduled.status).toBe("scheduled");
      expect(scheduled.endDate > activeEndDate).toBe(true);

      const { scheduleId } = await createBookingForNow(member.id, testBranchId);

      const res = await app.inject({
        method: "GET",
        url: `${ADMIN_ATTENDANCE_URL}/slot/${scheduleId}/2026-03-11`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const row = body.members.find(
        (m: { memberId: number }) => m.memberId === member.id,
      );
      expect(row).toBeTruthy();
      // La cobertura más lejana (la programada), no el vencimiento de la activa.
      expect(row.endDate).toBe(scheduled.endDate);
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
          url: `${ADMIN_ATTENDANCE_URL}/member/1`,
        },
      ];

      for (const ep of adminEndpoints) {
        const res = await app.inject({
          method: ep.method,
          url: ep.url,
          headers: { authorization: `Bearer ${memberToken}` },
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

  // =========================================================================
  // Class Tracking Enforcement (Phase 60 Plan 02)
  // =========================================================================
  describe("Class Tracking Enforcement", () => {
    beforeEach(async () => {
      await cleanupAll();
    });

    it("blocks check-in when weekly limit is reached", async () => {
      // Plan allows 1 class per week
      const { member, memberToken } = await setupMemberWithSubscription(
        { email: "weekly-limit@test.com", dni: "60020001" },
        { classesPerWeek: 1, name: "Plan Weekly Limit Test" },
      );

      // Insert a past attendance record earlier this week (not today) so
      // the weekly count is already at 1. We can't use vi.setSystemTime
      // because MySQL CURDATE() ignores JS time mocks, causing the
      // once-per-day check to fire before the weekly limit check.
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      monday.setHours(10, 0, 0, 0);

      // Pick a day this week that isn't today for the existing record
      // If today is Monday, use Tuesday; otherwise use Monday
      const pastDay = new Date(monday);
      if (monday.toDateString() === now.toDateString()) {
        pastDay.setDate(monday.getDate() + 1); // Tuesday
      }

      await app.db.insert(attendance).values({
        memberId: member.id,
        branchId: testBranchId,
        scheduleId: null,
        status: "confirmado",
        source: "qr",
        checkedInAt: pastDay,
        sessionDate: pastDay.toISOString().split("T")[0],
      });

      // Now try to check in — should be blocked (weekly limit = 1, already used 1)
      const qrToken = generateQrToken(testBranchId);
      const res = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("limite semanal");
    });

    it("blocks check-in when monthly budget is exhausted", async () => {
      const { member, subscription, memberToken } =
        await setupMemberWithSubscription(
          { email: "budget-limit@test.com", dni: "60020002" },
          { classesPerWeek: 3, name: "Plan Budget Test" },
        );

      // Set classesRemaining to 0 directly in DB
      await app.db
        .update(subscriptions)
        .set({ classesRemaining: 0 })
        .where(eq(subscriptions.id, subscription.id as number));

      const qrToken = generateQrToken(testBranchId);

      const res = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message).toContain("clases del periodo");
    });

    it("decrements classesRemaining after successful check-in", async () => {
      const { member, subscription, memberToken } =
        await setupMemberWithSubscription(
          { email: "decrement@test.com", dni: "60020003" },
          { classesPerWeek: 3, name: "Plan Decrement Test" },
        );
      await createBookingForNow(member.id, testBranchId);

      // Get initial classesRemaining
      const [before] = await app.db
        .select({ classesRemaining: subscriptions.classesRemaining })
        .from(subscriptions)
        .where(eq(subscriptions.id, subscription.id as number));

      expect(before.classesRemaining).toBeGreaterThan(0);

      const qrToken = generateQrToken(testBranchId);

      const res = await app.inject({
        method: "POST",
        url: `${MEMBER_ATTENDANCE_URL}/check-in`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { qrToken },
      });
      expect(res.statusCode).toBe(201);

      // Verify decrement
      const [after] = await app.db
        .select({ classesRemaining: subscriptions.classesRemaining })
        .from(subscriptions)
        .where(eq(subscriptions.id, subscription.id as number));

      expect(after.classesRemaining).toBe(
        (before.classesRemaining as number) - 1,
      );
    });

    it("force check-in bypasses all limits and awards AURA", async () => {
      const { member, subscription } = await setupMemberWithSubscription(
        { email: "force-checkin@test.com", dni: "60020005" },
        { classesPerWeek: 1, name: "Plan Force Test" },
      );

      // Exhaust budget
      await app.db
        .update(subscriptions)
        .set({ classesRemaining: 0 })
        .where(eq(subscriptions.id, subscription.id as number));

      // Force check-in as admin
      const res = await app.inject({
        method: "POST",
        url: `${ADMIN_ATTENDANCE_URL}/force`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          memberId: member.id,
          branchId: testBranchId,
          reason: "One-time exception",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.memberId).toBe(member.id);
      expect(body.source).toBe("manual");
      expect(body.status).toBe("confirmado");

      // Verify AURA was awarded on force check-in
      const auraRows = await app.db
        .select({ amount: auraTransactions.amount })
        .from(auraTransactions)
        .where(eq(auraTransactions.userId, member.id));

      const attendanceAward = auraRows.find((r) => r.amount === 10);
      expect(attendanceAward).toBeTruthy();

      // Force check-in also mirrors as a presencial completed_sessions row.
      const sessions = await app.db
        .select({ goalPlanType: completedSessions.goalPlanType })
        .from(completedSessions)
        .where(eq(completedSessions.userId, member.id));
      expect(sessions).toHaveLength(1);
      expect(sessions[0].goalPlanType).toBe("presencial");

      // AURA shouldn't be doubled — only the attendance award (10), not a
      // second 10 from a synthetic completed_session.
      const tens = auraRows.filter((r) => r.amount === 10);
      expect(tens).toHaveLength(1);
    });
  });
});
