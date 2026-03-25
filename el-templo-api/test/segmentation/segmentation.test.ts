/**
 * Segmentation Integration Tests
 *
 * Tests behavioral segment calculation logic, /auth/me integration,
 * settings CRUD, and member list filtering.
 *
 * Runs against real MySQL (eltemplo_test database).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import {
  createTestApp,
  registerUser,
  getAuthToken,
  cleanAllTestData,
  createStaffUser,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { SegmentationService } from "../../src/modules/segmentation/service";
import type { MemberSegment } from "../../src/modules/segmentation/types";

describe("Segmentation", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);

    // Register a member user, then promote to admin for this test
    const adminResult = await registerUser(app, {
      email: "admin@test.com",
      password: "admin123",
      branchId: 1,
    });
    await app.db
      .update(schema.users)
      .set({ role: "admin" })
      .where(eq(schema.users.email, "admin@test.com"));
    adminToken = await getAuthToken(app, "admin@test.com", "admin123");

    // Seed segment threshold settings for all tests
    await app.db.insert(schema.systemSettings).values([
      { settingKey: "segment.espartano_pct", settingValue: "80" },
      { settingKey: "segment.intermitente_pct", settingValue: "40" },
      { settingKey: "segment.en_riesgo_weeks", settingValue: "2" },
      { settingKey: "segment.ghost_weeks", settingValue: "8" },
      { settingKey: "segment.nuevo_guerrero_days", settingValue: "30" },
      { settingKey: "segment.window_days", settingValue: "28" },
    ]);
  });

  // ─── Helper: create a member with a specific registration date ────────

  async function createMemberWithDate(
    email: string,
    createdAt: Date,
  ): Promise<number> {
    const { user } = await registerUser(app, {
      email,
      password: "password123",
      branchId: 1,
    });
    const userId = (user as Record<string, unknown>).id as number;

    // Override createdAt to simulate registration date
    await app.db
      .update(schema.users)
      .set({ createdAt })
      .where(eq(schema.users.id, userId));

    return userId;
  }

  // ─── Helper: create subscription plan and assign to member ────────────

  async function assignPlan(
    userId: number,
    classesPerWeek: number,
  ): Promise<void> {
    const [plan] = await app.db
      .insert(schema.subscriptionPlans)
      .values({
        name: `Plan-${classesPerWeek}x`,
        planTier: "foundation",
        bookingMode: "flexible",
        priceRegular: 10000,
        priceZero: 8000,
        durationDays: 30,
        classesPerWeek,
      })
      .$returningId();

    const today = new Date().toISOString().split("T")[0];
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    await app.db.insert(schema.subscriptions).values({
      userId,
      planId: plan.id,
      branchId: 1,
      status: "active",
      startDate: today,
      endDate,
      pricePaid: 10000,
      priceTypeApplied: "regular",
      classesBudget: classesPerWeek * 4,
    });
  }

  // ─── Helper: insert attendance records ────────────────────────────────

  async function insertAttendance(
    userId: number,
    count: number,
    withinDays: number,
  ): Promise<void> {
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor((withinDays / count) * i) + 1;
      const checkedInAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
      await app.db.insert(schema.attendance).values({
        memberId: userId,
        branchId: 1,
        checkedInAt,
      });
    }
  }

  // ─── Helper: insert login records ─────────────────────────────────────

  async function insertLogins(
    userId: number,
    count: number,
    withinDays: number,
  ): Promise<void> {
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor((withinDays / count) * i);
      const loggedInAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
      await app.db.insert(schema.memberLogins).values({
        userId,
        loggedInAt,
      });
    }
  }

  // ─── Helper: insert session completions ───────────────────────────────

  async function insertSessionCompletions(
    userId: number,
    count: number,
    withinDays: number,
  ): Promise<void> {
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const daysAgo = Math.floor((withinDays / count) * i);
      const completedAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
      const startedAt = new Date(completedAt.getTime() - 60 * 60 * 1000);
      const dateStr = completedAt.toISOString().split("T")[0];
      await app.db.insert(schema.completedSessions).values({
        userId,
        dayId: `W1-test-${i}`,
        date: dateStr,
        branchId: 1,
        startedAt,
        completedAt,
        blocksCompleted: JSON.stringify(["NUCLEUS"]),
      });
    }
  }

  // ─── Helper: create member profile ────────────────────────────────────

  async function createMemberProfile(userId: number): Promise<void> {
    await app.db.insert(schema.memberProfiles).values({
      userId,
      goalType: "fitness",
      experienceLevel: "beginner",
      trainingFocus: "full_body",
      motivationStyle: "discipline",
      onboardingCompletedAt: new Date(),
    });
  }

  // =========================================================================
  // Group 1: Segment Calculation Logic
  // =========================================================================

  describe("Segment Calculation Logic", () => {
    it("new member (< 30 days) always gets nuevo_guerrero regardless of attendance", async () => {
      const userId = await createMemberWithDate(
        "new-member@test.com",
        new Date(), // registered today
      );

      await assignPlan(userId, 3);
      await insertAttendance(userId, 12, 7); // 100%+ attendance

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("nuevo_guerrero");
    });

    it("member with 80%+ attendance gets espartano", async () => {
      const userId = await createMemberWithDate(
        "espartano@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
      );

      await assignPlan(userId, 3); // 3x/week = 12 expected in 28 days
      await insertAttendance(userId, 10, 28); // 10/12 = 83%

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("espartano");
    });

    it("member with 40-80% attendance gets intermitente", async () => {
      const userId = await createMemberWithDate(
        "intermitente@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 5); // 5x/week = 20 expected in 28 days
      await insertAttendance(userId, 10, 28); // 10/20 = 50%

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("intermitente");
    });

    it("member with <40% attendance for 2+ weeks gets en_riesgo", async () => {
      const userId = await createMemberWithDate(
        "enriesgo@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 5); // 5x/week = 20 expected
      await insertAttendance(userId, 3, 28); // 3/20 = 15%

      // Need a recent login/activity within 2 weeks to avoid inactivity trigger
      await insertLogins(userId, 1, 1);

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("en_riesgo");
    });

    it("member inactive 8+ weeks gets ghost", async () => {
      const userId = await createMemberWithDate(
        "ghost@test.com",
        new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // 120 days ago
      );

      // Last activity was 9 weeks ago
      const nineWeeksAgo = new Date(Date.now() - 63 * 24 * 60 * 60 * 1000);
      await app.db.insert(schema.attendance).values({
        memberId: userId,
        branchId: 1,
        checkedInAt: nineWeeksAgo,
      });

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("ghost");
    });

    it("member with low attendance but high app usage gets digital_warrior", async () => {
      const userId = await createMemberWithDate(
        "digitalwarrior@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 5); // 5x/week = 20 expected
      await insertAttendance(userId, 2, 28); // 2/20 = 10% (low)

      // High app usage: 3 session completions + 4 login days = 7 total
      await insertSessionCompletions(userId, 3, 28);
      await insertLogins(userId, 4, 28);

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("digital_warrior");
    });

    it("member with no subscription and no activity gets ghost", async () => {
      const userId = await createMemberWithDate(
        "nosub@test.com",
        new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
      );
      // No subscription, no attendance, no logins, no sessions

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("ghost");
    });

    it("paused subscription members still get segmented", async () => {
      const userId = await createMemberWithDate(
        "paused@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      // Create plan and subscription with paused status
      const [plan] = await app.db
        .insert(schema.subscriptionPlans)
        .values({
          name: "Paused Plan",
          planTier: "foundation",
          bookingMode: "flexible",
          priceRegular: 10000,
          priceZero: 8000,
          durationDays: 30,
          classesPerWeek: 3,
        })
        .$returningId();

      const today = new Date().toISOString().split("T")[0];
      await app.db.insert(schema.subscriptions).values({
        userId,
        planId: plan.id,
        branchId: 1,
        status: "paused",
        startDate: today,
        pricePaid: 10000,
        priceTypeApplied: "regular",
        classesBudget: 12,
        pausedAt: new Date(),
      });

      // Some attendance in window -> intermitente
      await insertAttendance(userId, 6, 28); // 6/12 = 50%

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("intermitente");
    });
  });

  // =========================================================================
  // Group 2: Plan-Relative Thresholds
  // =========================================================================

  describe("Plan-Relative Thresholds", () => {
    it("member on 2x/week plan attending 2x/week = 100% = espartano", async () => {
      const userId = await createMemberWithDate(
        "plan2x@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 2); // 2x/week = 8 expected in 28 days
      await insertAttendance(userId, 8, 28); // 8/8 = 100%

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("espartano");
    });

    it("member on 5x/week plan attending 2x/week = 40% = intermitente (barely)", async () => {
      const userId = await createMemberWithDate(
        "plan5x@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 5); // 5x/week = 20 expected
      await insertAttendance(userId, 8, 28); // 8/20 = 40%

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("intermitente");
    });

    it("same absolute attendance produces different segments based on plan", async () => {
      // Member A: 2x/week plan, attending 6 times in 28 days = 75% = intermitente
      const userA = await createMemberWithDate(
        "planA@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );
      await assignPlan(userA, 2); // 8 expected
      await insertAttendance(userA, 6, 28); // 6/8 = 75% -> intermitente

      // Member B: 5x/week plan, attending 6 times in 28 days = 30% = en_riesgo
      const userB = await createMemberWithDate(
        "planB@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );
      await assignPlan(userB, 5); // 20 expected
      await insertAttendance(userB, 6, 28); // 6/20 = 30% -> en_riesgo

      // Recent login to avoid inactivity-based en_riesgo
      await insertLogins(userB, 1, 1);

      const service = new SegmentationService(app.db, app.log);
      const segmentA = await service.calculateSegment(userA);
      const segmentB = await service.calculateSegment(userB);

      expect(segmentA).toBe("intermitente");
      expect(segmentB).toBe("en_riesgo");
    });
  });

  // =========================================================================
  // Group 3: /auth/me Integration
  // =========================================================================

  describe("/auth/me Integration", () => {
    it("GET /auth/me for a member records a login in member_logins table", async () => {
      const { token, user } = await registerUser(app, {
        email: "me-login@test.com",
        password: "password123",
        branchId: 1,
      });
      const userId = (user as Record<string, unknown>).id as number;

      await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      const logins = await app.db
        .select()
        .from(schema.memberLogins)
        .where(eq(schema.memberLogins.userId, userId));

      expect(logins.length).toBeGreaterThanOrEqual(1);
    });

    it("GET /auth/me returns segment field in response", async () => {
      const { token, user } = await registerUser(app, {
        email: "me-segment@test.com",
        password: "password123",
        branchId: 1,
      });
      const userId = (user as Record<string, unknown>).id as number;

      // Create member profile so segment can be persisted
      await createMemberProfile(userId);

      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      const body = JSON.parse(res.body);
      expect(body).toHaveProperty("segment");
      // New member registered just now -> should be nuevo_guerrero
      expect(body.segment).toBe("nuevo_guerrero");
    });

    it("non-member roles (coach/admin) do NOT trigger segment calculation", async () => {
      // Admin user exists from seed; use that
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      // segment should be null for non-members
      expect(body.segment).toBeNull();

      // No login records for admin
      const [adminUser] = await app.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, "admin@test.com"))
        .limit(1);

      const logins = await app.db
        .select()
        .from(schema.memberLogins)
        .where(eq(schema.memberLogins.userId, adminUser.id));

      expect(logins.length).toBe(0);
    });
  });

  // =========================================================================
  // Group 4: Settings API
  // =========================================================================

  describe("Settings API", () => {
    it("GET /api/admin/settings/segments returns all 6 threshold values", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/settings/segments",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body).toEqual({
        espartanoPct: 80,
        intermitentePct: 40,
        enRiesgoWeeks: 2,
        ghostWeeks: 8,
        nuevoGuerreroDays: 30,
        windowDays: 28,
      });
    });

    it("PUT /api/admin/settings/segments updates thresholds", async () => {
      const putRes = await app.inject({
        method: "PUT",
        url: "/api/admin/settings/segments",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          espartanoPct: 90,
          ghostWeeks: 10,
        },
      });

      expect(putRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: "GET",
        url: "/api/admin/settings/segments",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(getRes.body);
      expect(body.espartanoPct).toBe(90);
      expect(body.ghostWeeks).toBe(10);
      // Unchanged values remain
      expect(body.intermitentePct).toBe(40);
    });

    it("PUT validates positive integers (rejects negative/zero)", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/admin/settings/segments",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          espartanoPct: 0,
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("non-admin roles get 403 on settings endpoints", async () => {
      // Create a coach user
      await createStaffUser(app, {
        email: "coach-settings@test.com",
        password: "password123",
        firstName: "Coach",
        lastName: "Test",
        role: "coach",
        branchId: 1,
      });

      const coachToken = await getAuthToken(
        app,
        "coach-settings@test.com",
        "password123",
      );

      const getRes = await app.inject({
        method: "GET",
        url: "/api/admin/settings/segments",
        headers: { authorization: `Bearer ${coachToken}` },
      });

      expect(getRes.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // Group 5: Member List Segment Filter
  // =========================================================================

  describe("Member List Segment Filter", () => {
    it("GET /api/admin/members?segment=espartano returns only espartano members", async () => {
      // Create two members with profiles, different segments
      const userA = await createMemberWithDate(
        "memberA@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );
      const userB = await createMemberWithDate(
        "memberB@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await createMemberProfile(userA);
      await createMemberProfile(userB);

      // Set segments directly
      await app.db
        .update(schema.memberProfiles)
        .set({ segment: "espartano" })
        .where(eq(schema.memberProfiles.userId, userA));

      await app.db
        .update(schema.memberProfiles)
        .set({ segment: "ghost" })
        .where(eq(schema.memberProfiles.userId, userB));

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?segment=espartano",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.members.length).toBe(1);
      expect(body.members[0].segment).toBe("espartano");
    });

    it("GET /api/admin/members returns segment field in member list items", async () => {
      const userId = await createMemberWithDate(
        "list-segment@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await createMemberProfile(userId);

      await app.db
        .update(schema.memberProfiles)
        .set({ segment: "intermitente" })
        .where(eq(schema.memberProfiles.userId, userId));

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      const member = body.members.find(
        (m: Record<string, unknown>) => m.email === "list-segment@test.com",
      );
      expect(member).toBeDefined();
      expect(member.segment).toBe("intermitente");
    });

    it("GET /api/admin/members/:userId returns segment and segmentUpdatedAt", async () => {
      const userId = await createMemberWithDate(
        "detail-segment@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await createMemberProfile(userId);

      const now = new Date();
      await app.db
        .update(schema.memberProfiles)
        .set({ segment: "en_riesgo", segmentUpdatedAt: now })
        .where(eq(schema.memberProfiles.userId, userId));

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.segment).toBe("en_riesgo");
      expect(body.segmentUpdatedAt).toBeTruthy();
    });
  });
});
