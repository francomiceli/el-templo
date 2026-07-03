/**
 * Segmentation Integration Tests
 *
 * Tests the Attendance label calculation (4 bands by % of membership usage over
 * a rolling 28-day window), /auth/me integration, and member list filtering.
 *
 * Runs against real MySQL (eltemplo_test database).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  registerUser,
  getAuthToken,
  cleanAllTestData,
} from "../helpers";
import * as schema from "../../src/db/schema";
import { SegmentationService } from "../../src/modules/segmentation/service";

describe("Segmentation", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Use the shared FK-safe cleaner so residual rows from prior test files
    // (subscription_schedules, bookings, payments, …) don't block the
    // subscriptions delete.
    await cleanAllTestData(app);
    // No threshold settings seed: cut points are fixed in code (D-03).
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
        planCategory: "presencial",
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
        sessionDate: checkedInAt.toISOString().split("T")[0],
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
  // Group 1: Attendance Label Calculation (4 bands)
  // =========================================================================

  describe("Attendance Label Calculation", () => {
    it("member < 1 month of tenure gets NULL regardless of attendance (D-07)", async () => {
      const userId = await createMemberWithDate(
        "new-member@test.com",
        new Date(), // registered today
      );

      await assignPlan(userId, 3);
      await insertAttendance(userId, 12, 7); // 100%+ attendance

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBeNull();
    });

    it("member at 30 days is still 'Nuevo' (< 1 month = 30.44d) and gets NULL", async () => {
      // Regression: the tenure guard must use the exact same boundary as the
      // Antigüedad pill (computeSeniority, 30.44 days/month). At 30 days the
      // member is still "Nuevo", so it must never carry an Attendance label.
      const userId = await createMemberWithDate(
        "boundary-30d@test.com",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 3);
      await insertAttendance(userId, 12, 7); // 100%+ attendance

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBeNull();
    });

    it("member with no active plan gets NULL (no denominator, D-08)", async () => {
      const userId = await createMemberWithDate(
        "noplan@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );
      // No subscription assigned.
      await insertAttendance(userId, 4, 28);

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBeNull();
    });

    it("member with >= 75% usage gets optima", async () => {
      const userId = await createMemberWithDate(
        "optima@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 3); // 3x/week = 12 expected in 28 days
      await insertAttendance(userId, 10, 28); // 10/12 = 83% → optima

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("optima");
    });

    it("member with > 100% usage stays optima (D-04)", async () => {
      const userId = await createMemberWithDate(
        "over100@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 2); // 2x/week = 8 expected in 28 days
      await insertAttendance(userId, 12, 28); // 12/8 = 150% → optima

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("optima");
    });

    it("member with 50-74% usage gets regular", async () => {
      const userId = await createMemberWithDate(
        "regular@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 3); // 3x/week = 12 expected in 28 days
      await insertAttendance(userId, 7, 28); // 7/12 = 58% → regular

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("regular");
    });

    it("member with 1-49% usage gets alerta", async () => {
      const userId = await createMemberWithDate(
        "alerta@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 3); // 3x/week = 12 expected
      await insertAttendance(userId, 3, 28); // 3/12 = 25% → alerta

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("alerta");
    });

    it("member with 0% usage gets ausente", async () => {
      const userId = await createMemberWithDate(
        "ausente@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 3); // 3x/week = 12 expected
      // No attendance at all → 0% → ausente.

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("ausente");
    });

    it("paused subscription members still get classified", async () => {
      const userId = await createMemberWithDate(
        "paused@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      const [plan] = await app.db
        .insert(schema.subscriptionPlans)
        .values({
          name: "Paused Plan",
          planTier: "foundation",
          bookingMode: "flexible",
          planCategory: "presencial",
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

      // 6/12 = 50% → regular.
      await insertAttendance(userId, 6, 28);

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("regular");
    });
  });

  // =========================================================================
  // Group 2: Plan-Relative Classification
  // =========================================================================

  describe("Plan-Relative Classification", () => {
    it("member on 2x/week plan attending 2x/week = 100% = optima", async () => {
      const userId = await createMemberWithDate(
        "plan2x@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 2); // 2x/week = 8 expected in 28 days
      await insertAttendance(userId, 8, 28); // 8/8 = 100%

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("optima");
    });

    it("same absolute attendance produces different labels based on plan", async () => {
      // Member A: 2x/week plan, 6 visits in 28 days = 75% = optima.
      const userA = await createMemberWithDate(
        "planA@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );
      await assignPlan(userA, 2); // 8 expected
      await insertAttendance(userA, 6, 28); // 6/8 = 75% → optima

      // Member B: 6x/week plan (target capped at 3 → 12 expected), 6 visits
      // in 28 days = 50% = regular.
      const userB = await createMemberWithDate(
        "planB@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );
      await assignPlan(userB, 6); // capped to 3/week → 12 expected
      await insertAttendance(userB, 6, 28); // 6/12 = 50% → regular

      const service = new SegmentationService(app.db, app.log);
      const segmentA = await service.calculateSegment(userA);
      const segmentB = await service.calculateSegment(userB);

      expect(segmentA).toBe("optima");
      expect(segmentB).toBe("regular");
    });
  });

  // =========================================================================
  // Group 3: Realistic Target Cap (ATTENDANCE_TARGET_MAX_PER_WEEK)
  // =========================================================================

  describe("Realistic Target Cap", () => {
    it("6x/week plan attending 3x/week is optima (cap makes 12 visits = 100%)", async () => {
      // Pre-cap this was 12/24 = 50% = regular. The booking cap of 6 is not a
      // realistic attendance target, so it is capped at 3/week (denom 12).
      const userId = await createMemberWithDate(
        "cap-optima@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 6); // capped to 3/week → 12 expected
      await insertAttendance(userId, 12, 28); // 12/12 = 100% → optima

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("optima");
    });

    it("6x/week plan attending 2x/week is regular, not alerta", async () => {
      // Pre-cap this was 8/24 = 33% = alerta — the "too strict" case the fix
      // targets. With the cap it is 8/12 = 67% = regular.
      const userId = await createMemberWithDate(
        "cap-regular@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 6); // capped to 3/week → 12 expected
      await insertAttendance(userId, 8, 28); // 8/12 = 67% → regular

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("regular");
    });

    it("entry plan (cap 2) is unaffected by the target cap", async () => {
      // min(2, 3) = 2 → denom 8, identical to pre-cap behavior.
      const userId = await createMemberWithDate(
        "cap-entry@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignPlan(userId, 2); // stays 2/week → 8 expected
      await insertAttendance(userId, 8, 28); // 8/8 = 100% → optima

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("optima");
    });
  });

  // =========================================================================
  // Group 4: Plan Category Gate (presencial vs online)
  // =========================================================================

  describe("Plan Category Gate", () => {
    async function assignCategoryPlan(
      userId: number,
      planCategory: "presencial" | "online_regular",
      classesPerWeek: number | null,
    ): Promise<void> {
      const [plan] = await app.db
        .insert(schema.subscriptionPlans)
        .values({
          name: `Cat-${planCategory}`,
          planTier: "other",
          bookingMode: "flexible",
          planCategory,
          priceRegular: 10000,
          priceZero: 8000,
          durationDays: 180,
          classesPerWeek,
        })
        .$returningId();

      const today = new Date().toISOString().split("T")[0];
      await app.db.insert(schema.subscriptions).values({
        userId,
        planId: plan.id,
        branchId: 1,
        status: "active",
        startDate: today,
        pricePaid: 10000,
        priceTypeApplied: "regular",
        classesBudget: 0,
      });
    }

    it("presencial plan without classesPerWeek uses the default target (open-ended program)", async () => {
      // PROGRAMA 6 MESES et al.: presencial, no booking cap. Falls back to the
      // default target (3/week → 12 expected). 12 visits = 100% → optima.
      const userId = await createMemberWithDate(
        "prog-optima@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignCategoryPlan(userId, "presencial", null);
      await insertAttendance(userId, 12, 28); // 12/12 = 100% → optima

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("optima");
    });

    it("presencial plan without classesPerWeek classifies low attendance as alerta", async () => {
      const userId = await createMemberWithDate(
        "prog-alerta@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignCategoryPlan(userId, "presencial", null);
      await insertAttendance(userId, 4, 28); // 4/12 = 33% → alerta

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBe("alerta");
    });

    it("online plan gets no label regardless of attendance", async () => {
      const userId = await createMemberWithDate(
        "online-null@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await assignCategoryPlan(userId, "online_regular", null);
      await insertAttendance(userId, 12, 28); // high usage, but online → NULL

      const service = new SegmentationService(app.db, app.log);
      const segment = await service.calculateSegment(userId);

      expect(segment).toBeNull();
    });
  });

  // =========================================================================
  // Group 5: /auth/me Integration
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
      // New member registered just now (< 1 month) → no label (NULL, D-07).
      expect(body.segment).toBeNull();
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
  // Group 4: Member List Segment Filter
  // =========================================================================

  describe("Member List Segment Filter", () => {
    it("GET /api/admin/members?segment=optima returns only optima members", async () => {
      // Create two members with profiles, different labels.
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

      // Set labels directly
      await app.db
        .update(schema.memberProfiles)
        .set({ segment: "optima" })
        .where(eq(schema.memberProfiles.userId, userA));

      await app.db
        .update(schema.memberProfiles)
        .set({ segment: "ausente" })
        .where(eq(schema.memberProfiles.userId, userB));

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/members?segment=optima",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.members.length).toBe(1);
      expect(body.members[0].segment).toBe("optima");
    });

    it("GET /api/admin/members returns segment field in member list items", async () => {
      const userId = await createMemberWithDate(
        "list-segment@test.com",
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      );

      await createMemberProfile(userId);

      await app.db
        .update(schema.memberProfiles)
        .set({ segment: "alerta" })
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
      expect(member.segment).toBe("alerta");
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
        .set({ segment: "alerta", segmentUpdatedAt: now })
        .where(eq(schema.memberProfiles.userId, userId));

      const res = await app.inject({
        method: "GET",
        url: `/api/admin/members/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);

      expect(body.segment).toBe("alerta");
      expect(body.segmentUpdatedAt).toBeTruthy();
    });
  });
});
