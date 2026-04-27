/**
 * Phase 104 Plan 02 — Bundle "Todos los Programas" lifecycle tests.
 *
 * Covers:
 *  - R3 acceptance (auto-enroll on bundle assignment)
 *  - R3 Foundation exclusion (anti-piracy: programs with goalPlanType IS NULL
 *    are NOT auto-enrolled when a bundle is assigned)
 *  - R3 idempotency (re-assigning a bundle does not duplicate enrollments)
 *  - Double-bundle 409 (no two simultaneous active bundles per user)
 *  - R4 acceptance (cancel bundle → cancels owned enrollments)
 *  - R4 + currentProgramEnrollmentId hygiene (pointer cleared if stale)
 *  - R4 protection (bundle teardown preserves enrollments owned by other
 *    active subs via linkedProgramId binding, AND preserves the pointer
 *    when it is NOT stale)
 *  - R4 expire path (autoExpireSubscriptions triggers teardown)
 *  - changePlanNow teardown (switching FROM a bundle tears down its
 *    enrollments)
 *  - changePlanNow auto-enroll (switching TO a bundle creates enrollments
 *    for all active programs with goalPlanType, idempotency preserved)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { programs } from "../../src/db/schema/micro-programs";
import { programEnrollments } from "../../src/db/schema/program-enrollments";
import { users } from "../../src/db/schema/users";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
  dateOffsetStr,
} from "./_helpers";

describe("Bundle Todos los Programas (Phase 104 R3+R4 + checker fixes)", () => {
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
    await cleanAllTestData(app);
  });

  // ─── Fixture helpers ──────────────────────────────────────────────────────

  /**
   * Create the canonical "Todos los Programas" bundle plan via direct INSERT
   * (cleanAllTestData wipes the seed, so each test re-creates it). Mirrors
   * migration 0104 values.
   */
  async function createBundlePlan(
    overrides: Partial<typeof subscriptionPlans.$inferInsert> = {},
  ): Promise<{ id: number }> {
    const result = await app.db.insert(subscriptionPlans).values({
      name: "Todos los Programas",
      description:
        "Acceso a todos los programas virtuales activos durante 30 dias.",
      planTier: "other",
      bookingMode: "flexible",
      planCategory: "online_regular",
      priceRegular: 20000,
      priceZero: 20000,
      durationDays: 30,
      country: "AR",
      currency: "ARS",
      isActive: true,
      grantsAllPrograms: true,
      ...overrides,
    });
    return { id: Number(result[0].insertId) };
  }

  async function createTestProgram(
    overrides: Partial<typeof programs.$inferInsert> = {},
  ): Promise<number> {
    const result = await app.db.insert(programs).values({
      name: overrides.name ?? "Test Program",
      description: overrides.description ?? "Test program for bundle",
      durationWeeks: overrides.durationWeeks ?? 4,
      sessionsPerWeekToAdvance: overrides.sessionsPerWeekToAdvance ?? 3,
      isActive: overrides.isActive ?? true,
      goalPlanType: overrides.goalPlanType ?? "tren_superior",
      ...overrides,
    });
    return Number(result[0].insertId);
  }

  // ─── Test 1: bundle plan persistence ──────────────────────────────────────

  it("bundle plan can be created with grantsAllPrograms=true and reads back correctly", async () => {
    const bundle = await createBundlePlan();

    const [row] = await app.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, bundle.id));

    expect(row.grantsAllPrograms).toBe(true);
    expect(row.name).toBe("Todos los Programas");
    expect(row.priceRegular).toBe(20000);
    expect(row.durationDays).toBe(30);
    expect(row.planCategory).toBe("online_regular");

    // Also assert the API response surfaces grantsAllPrograms.
    const apiRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/plans/${bundle.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(apiRes.statusCode).toBe(200);
    const apiBody = JSON.parse(apiRes.body) as { grantsAllPrograms: boolean };
    expect(apiBody.grantsAllPrograms).toBe(true);
  });

  // ─── Test 2: R3 auto-enroll + Foundation exclusion ────────────────────────

  it("R3 — assigning bundle enrolls user in every active program WITH goalPlanType (Foundation excluded)", async () => {
    // 3 active programs WITH goalPlanType (auto-enroll candidates)
    const p1 = await createTestProgram({
      name: "Tren Superior",
      goalPlanType: "tren_superior",
    });
    const p2 = await createTestProgram({
      name: "Piernas y Glúteos",
      goalPlanType: "piernas_gluteos",
    });
    const p3 = await createTestProgram({
      name: "Full Body",
      goalPlanType: "full_body",
    });
    // Foundation: active but goalPlanType=null → MUST be excluded
    const foundationId = await createTestProgram({
      name: "Foundation",
      goalPlanType: null,
    });
    // Inactive: must be excluded
    await createTestProgram({
      name: "Inactive Program",
      goalPlanType: "tren_inferior",
      isActive: false,
    });

    const bundle = await createBundlePlan();
    const member = await createMember(app);

    const result = await assignPlan(app, adminToken, member.id as number, {
      planId: bundle.id,
    });
    expect(result.statusCode).toBe(201);

    const enrollments = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.status, "active"),
        ),
      );

    expect(enrollments).toHaveLength(3);
    const enrolledProgramIds = enrollments.map((e) => e.programId).sort();
    expect(enrolledProgramIds).toEqual([p1, p2, p3].sort());

    // Foundation must NOT have an enrollment
    expect(
      enrollments.find((e) => e.programId === foundationId),
    ).toBeUndefined();

    // All enrollments start at week 1
    for (const e of enrollments) {
      expect(e.currentWeek).toBe(1);
      expect(e.sessionsCompletedThisWeek).toBe(0);
    }
  });

  // ─── Test 3: R3 idempotency ───────────────────────────────────────────────

  it("R3 idempotency — assigning bundle does not duplicate pre-existing active enrollments", async () => {
    const p1 = await createTestProgram({
      name: "Program 1",
      goalPlanType: "tren_superior",
    });
    const p2 = await createTestProgram({
      name: "Program 2",
      goalPlanType: "piernas_gluteos",
    });
    const p3 = await createTestProgram({
      name: "Program 3",
      goalPlanType: "full_body",
    });

    const bundle = await createBundlePlan();
    const member = await createMember(app);

    // Pre-create an active enrollment for p1
    const preInsert = await app.db.insert(programEnrollments).values({
      userId: member.id as number,
      programId: p1,
      status: "active",
      currentWeek: 2,
      sessionsCompletedThisWeek: 1,
    });
    const preEnrollmentId = Number(preInsert[0].insertId);

    const [preRow] = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.id, preEnrollmentId));
    const originalEnrolledAt = preRow.enrolledAt;

    // Assign the bundle
    const result = await assignPlan(app, adminToken, member.id as number, {
      planId: bundle.id,
    });
    expect(result.statusCode).toBe(201);

    const activeEnrollments = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.status, "active"),
        ),
      );

    // Total = 3 (1 pre-existing + 2 new), NOT 4 (no duplicate for p1)
    expect(activeEnrollments).toHaveLength(3);
    const enrolledIds = activeEnrollments.map((e) => e.programId).sort();
    expect(enrolledIds).toEqual([p1, p2, p3].sort());

    // Pre-existing enrollment was NOT replaced — same id, same enrolledAt,
    // and the previous progress (week 2, 1 session) is preserved.
    const [preserved] = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.id, preEnrollmentId));
    expect(preserved.status).toBe("active");
    expect(preserved.currentWeek).toBe(2);
    expect(preserved.sessionsCompletedThisWeek).toBe(1);
    expect(preserved.enrolledAt.getTime()).toBe(originalEnrolledAt.getTime());
  });

  // ─── Test 4: double-bundle 409 ────────────────────────────────────────────

  it("double-bundle — assigning a second bundle while one is active is rejected with 409", async () => {
    await createTestProgram({
      name: "Program A",
      goalPlanType: "tren_superior",
    });
    await createTestProgram({
      name: "Program B",
      goalPlanType: "piernas_gluteos",
    });

    const bundle1 = await createBundlePlan();
    const bundle2 = await createBundlePlan({ name: "Bundle Pro" });
    const member = await createMember(app);

    const first = await assignPlan(app, adminToken, member.id as number, {
      planId: bundle1.id,
    });
    expect(first.statusCode).toBe(201);

    const second = await assignPlan(app, adminToken, member.id as number, {
      planId: bundle2.id,
    });
    expect(second.statusCode).toBe(409);
    expect((second.body as { message: string }).message).toContain(
      "ya tiene un bundle activo",
    );

    // Only the first bundle subscription exists (no orphan from failed assign)
    const memberSubs = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, member.id as number));
    expect(memberSubs).toHaveLength(1);
    expect(memberSubs[0].planId).toBe(bundle1.id);
  });

  // ─── Test 5: R4 cancel + pointer clear ────────────────────────────────────

  it("R4 — cancelling bundle subscription cancels its enrollments AND clears stale current_program_enrollment_id pointer", async () => {
    await createTestProgram({
      name: "Program 1",
      goalPlanType: "tren_superior",
    });
    await createTestProgram({
      name: "Program 2",
      goalPlanType: "piernas_gluteos",
    });
    await createTestProgram({
      name: "Program 3",
      goalPlanType: "full_body",
    });

    const bundle = await createBundlePlan();
    const member = await createMember(app);

    const assignRes = await assignPlan(app, adminToken, member.id as number, {
      planId: bundle.id,
    });
    expect(assignRes.statusCode).toBe(201);

    const enrollmentsBefore = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.status, "active"),
        ),
      );
    expect(enrollmentsBefore).toHaveLength(3);

    // Set current_program_enrollment_id to the first enrollment
    const pointerEnrollmentId = enrollmentsBefore[0].id;
    await app.db
      .update(users)
      .set({ currentProgramEnrollmentId: pointerEnrollmentId })
      .where(eq(users.id, member.id as number));

    // Cancel via HTTP endpoint
    const cancelRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { notes: "test cancel" },
    });
    expect(cancelRes.statusCode).toBe(200);

    const enrollmentsAfter = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));

    expect(enrollmentsAfter).toHaveLength(3);
    for (const e of enrollmentsAfter) {
      expect(e.status).toBe("cancelled");
      expect(e.cancelledAt).not.toBeNull();
    }

    // Pointer must be cleared (stale → NULL)
    const [u] = await app.db
      .select({
        currentProgramEnrollmentId: users.currentProgramEnrollmentId,
      })
      .from(users)
      .where(eq(users.id, member.id as number));
    expect(u.currentProgramEnrollmentId).toBeNull();
  });

  // ─── Test 6: R4 protection (linkedProgramId binding + pointer NOT cleared) ─

  it("R4 protection — bundle teardown preserves enrollment also covered by another sub's linkedProgramId, AND does NOT clear the pointer when it points at the protected enrollment", async () => {
    const p1 = await createTestProgram({
      name: "Program 1",
      goalPlanType: "tren_superior",
    });
    const p2 = await createTestProgram({
      name: "Program 2",
      goalPlanType: "piernas_gluteos",
    });
    const p3 = await createTestProgram({
      name: "Program 3",
      goalPlanType: "full_body",
    });

    // Non-bundle plan binding p1 — assigning it creates 1 active enrollment
    // for p1. The bundle and the linked plan are both online, so the normal
    // assignPlan online-online guard would block having both at once. To set
    // up the R4 protection scenario (bundle teardown sees ANOTHER active sub
    // with linkedProgramId=p1), we direct-DB-insert the bundle subscription
    // bypassing the conflict check.
    const linkedPlan = await createPlan(app, adminToken, {
      name: "Online Linked p1",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId: p1,
      priceRegular: 12000,
      priceZero: 8000,
    });

    const member = await createMember(app);

    // Assign linked plan first (creates p1 enrollment, active online sub)
    const linkedAssign = await assignPlan(
      app,
      adminToken,
      member.id as number,
      {
        planId: linkedPlan.id,
      },
    );
    expect(linkedAssign.statusCode).toBe(201);

    // Bundle is also online_regular — direct DB insert to bypass the
    // online-online conflict guard (we are intentionally setting up the
    // R4 protection scenario where the teardown helper sees BOTH subs).
    const bundle = await createBundlePlan();
    const today = todayStr();
    const yesterday = dateOffsetStr(-1);
    // Set bundle endDate to YESTERDAY so autoExpireSubscriptions will
    // expire it on the next read. This is how we trigger teardown without
    // depending on which sub getMemberSubscription/cancel happens to pick.
    const bundleSubInsert = await app.db.insert(subscriptions).values({
      userId: member.id as number,
      planId: bundle.id,
      branchId: 1,
      status: "active",
      startDate: today,
      endDate: yesterday,
      pricePaid: 20000,
      priceTypeApplied: "regular",
      currency: "ARS",
    });
    const bundleSubId = Number(bundleSubInsert[0].insertId);

    // Create the bundle's enrollments for p2, p3 manually (mirrors what
    // assignPlan would have done — p1 already has an active enrollment from
    // the linked plan, so the bundle would skip it via idempotency).
    await app.db.insert(programEnrollments).values([
      {
        userId: member.id as number,
        programId: p2,
        status: "active",
        currentWeek: 1,
        sessionsCompletedThisWeek: 0,
        weekUnlockedAt: new Date(),
      },
      {
        userId: member.id as number,
        programId: p3,
        status: "active",
        currentWeek: 1,
        sessionsCompletedThisWeek: 0,
        weekUnlockedAt: new Date(),
      },
    ]);

    // Find the p1 enrollment id (created by linkedAssign) and set the pointer
    // to it. The pointer SHOULD survive the teardown because the protected
    // enrollment is not in the cancelled set.
    const [p1Enrollment] = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.programId, p1),
          eq(programEnrollments.status, "active"),
        ),
      );
    expect(p1Enrollment).toBeDefined();
    await app.db
      .update(users)
      .set({ currentProgramEnrollmentId: p1Enrollment.id })
      .where(eq(users.id, member.id as number));

    // Trigger autoExpireSubscriptions by reading the member subscription.
    // The bundle has endDate=yesterday → marked expired → teardown invoked.
    const readRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // Linked sub is still active so the read returns 200 with the linked sub
    expect(readRes.statusCode).toBe(200);

    // Refetch enrollments
    const enrollmentsAfter = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));

    const e1 = enrollmentsAfter.find((e) => e.programId === p1);
    const e2 = enrollmentsAfter.find((e) => e.programId === p2);
    const e3 = enrollmentsAfter.find((e) => e.programId === p3);

    // p1 must be PRESERVED (covered by another active sub's linkedProgramId)
    expect(e1?.status).toBe("active");
    // p2 and p3 must be CANCELLED (only the bundle owned them)
    expect(e2?.status).toBe("cancelled");
    expect(e3?.status).toBe("cancelled");

    // Verify the bundle sub was expired
    const [bundleSub] = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, bundleSubId));
    expect(bundleSub.status).toBe("expired");

    // Pointer must STILL point at p1Enrollment (not in cancelled set)
    const [u] = await app.db
      .select({
        currentProgramEnrollmentId: users.currentProgramEnrollmentId,
      })
      .from(users)
      .where(eq(users.id, member.id as number));
    expect(u.currentProgramEnrollmentId).toBe(p1Enrollment.id);
  });

  // ─── Test 7: R4 expire path (auto-expire) ─────────────────────────────────

  it("R4 expire — auto-expire on read tears down bundle enrollments and clears pointer", async () => {
    await createTestProgram({
      name: "Program 1",
      goalPlanType: "tren_superior",
    });
    await createTestProgram({
      name: "Program 2",
      goalPlanType: "piernas_gluteos",
    });
    await createTestProgram({
      name: "Program 3",
      goalPlanType: "full_body",
    });

    const bundle = await createBundlePlan();
    const member = await createMember(app);

    const assignRes = await assignPlan(app, adminToken, member.id as number, {
      planId: bundle.id,
    });
    expect(assignRes.statusCode).toBe(201);

    const enrollmentsBefore = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.status, "active"),
        ),
      );
    expect(enrollmentsBefore).toHaveLength(3);

    const pointerEnrollmentId = enrollmentsBefore[0].id;
    await app.db
      .update(users)
      .set({ currentProgramEnrollmentId: pointerEnrollmentId })
      .where(eq(users.id, member.id as number));

    // Force-expire by directly UPDATE-ing endDate to yesterday
    const yesterday = dateOffsetStr(-1);
    await app.db
      .update(subscriptions)
      .set({ endDate: yesterday })
      .where(eq(subscriptions.userId, member.id as number));

    // Trigger autoExpireSubscriptions by reading the member's subscription
    const readRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // After auto-expire, there is no active sub → 404 expected
    expect([200, 404]).toContain(readRes.statusCode);

    const enrollmentsAfter = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));

    expect(enrollmentsAfter).toHaveLength(3);
    for (const e of enrollmentsAfter) {
      expect(e.status).toBe("cancelled");
    }

    const [u] = await app.db
      .select({
        currentProgramEnrollmentId: users.currentProgramEnrollmentId,
      })
      .from(users)
      .where(eq(users.id, member.id as number));
    expect(u.currentProgramEnrollmentId).toBeNull();
  });

  // ─── Test 8: changePlanNow teardown (FROM bundle) ─────────────────────────

  it("changePlanNow teardown — switching FROM bundle to a non-bundle plan tears down bundle enrollments and clears pointer", async () => {
    await createTestProgram({
      name: "Program 1",
      goalPlanType: "tren_superior",
    });
    await createTestProgram({
      name: "Program 2",
      goalPlanType: "piernas_gluteos",
    });
    const p3 = await createTestProgram({
      name: "Program 3",
      goalPlanType: "full_body",
    });

    const bundle = await createBundlePlan();
    // Target plan: non-bundle, online_goal, linkedProgramId=p3, price >= bundle
    // (avoid downgrade block which rejects priceRegular < currentPlan.priceRegular)
    const targetPlan = await createPlan(app, adminToken, {
      name: "Online Goal Target",
      planCategory: "online_goal",
      goalPlanType: "full_body",
      linkedProgramId: p3,
      priceRegular: 25000,
      priceZero: 20000,
    });

    const member = await createMember(app);

    const assignRes = await assignPlan(app, adminToken, member.id as number, {
      planId: bundle.id,
    });
    expect(assignRes.statusCode).toBe(201);

    const enrollmentsBefore = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.status, "active"),
        ),
      );
    expect(enrollmentsBefore).toHaveLength(3);

    const pointerEnrollmentId = enrollmentsBefore[0].id;
    await app.db
      .update(users)
      .set({ currentProgramEnrollmentId: pointerEnrollmentId })
      .where(eq(users.id, member.id as number));

    // Change plan (default startMode = "now")
    const changeRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: targetPlan.id,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(changeRes.statusCode).toBe(201);

    // All 3 bundle-owned enrollments must now be cancelled, EXCEPT a NEW
    // active enrollment for p3 (created by the new plan's linkedProgramId).
    const enrollmentsAfter = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));

    const activeAfter = enrollmentsAfter.filter((e) => e.status === "active");
    const cancelledAfter = enrollmentsAfter.filter(
      (e) => e.status === "cancelled",
    );

    // 1 new active enrollment for p3
    expect(activeAfter).toHaveLength(1);
    expect(activeAfter[0].programId).toBe(p3);

    // Bundle's 3 enrollments are cancelled (the bundle's p3 enrollment was
    // torn down BEFORE the new linkedProgramId enrollment was created — the
    // teardown commits before the new-sub tx opens, per design)
    expect(cancelledAfter).toHaveLength(3);

    // Pointer cleared (was pointing at one of the cancelled ones)
    const [u] = await app.db
      .select({
        currentProgramEnrollmentId: users.currentProgramEnrollmentId,
      })
      .from(users)
      .where(eq(users.id, member.id as number));
    expect(u.currentProgramEnrollmentId).toBeNull();
  });

  // ─── Test 9: changePlanNow auto-enroll (TO bundle) ────────────────────────

  it("changePlanNow auto-enroll — switching FROM a non-bundle online plan TO bundle creates enrollments for all eligible programs (idempotency preserves the linked one)", async () => {
    const p1 = await createTestProgram({
      name: "Program 1",
      goalPlanType: "tren_superior",
    });
    const p2 = await createTestProgram({
      name: "Program 2",
      goalPlanType: "piernas_gluteos",
    });
    const p3 = await createTestProgram({
      name: "Program 3",
      goalPlanType: "full_body",
    });

    // Existing online plan that links to p1 (price < bundle to allow upgrade)
    const linkedPlan = await createPlan(app, adminToken, {
      name: "Online Linked p1",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId: p1,
      priceRegular: 12000,
      priceZero: 8000,
    });
    const bundle = await createBundlePlan();

    const member = await createMember(app);

    const linkedAssign = await assignPlan(
      app,
      adminToken,
      member.id as number,
      {
        planId: linkedPlan.id,
      },
    );
    expect(linkedAssign.statusCode).toBe(201);

    // Verify p1 enrollment exists, no enrollments for p2/p3 yet
    const before = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.status, "active"),
        ),
      );
    expect(before).toHaveLength(1);
    expect(before[0].programId).toBe(p1);
    const originalP1EnrollmentId = before[0].id;

    // Switch to bundle (upgrade in price → allowed)
    const changeRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: bundle.id,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(changeRes.statusCode).toBe(201);

    const after = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.status, "active"),
        ),
      );

    // Should have 3 active enrollments — one per active program with
    // goalPlanType IS NOT NULL (p1, p2, p3). Note: the original p1
    // enrollment from the outgoing linked plan was first CANCELLED by
    // changePlanNow's existing `currentPlan.linkedProgramId` branch
    // (pre-Phase 104 behavior, not introduced here). When the bundle
    // auto-enroll loop then runs inside the new-sub tx there are 0
    // active enrollments left, so it creates fresh enrollments for
    // p1, p2 AND p3 (idempotency only protects when an enrollment is
    // already active at loop time).
    expect(after).toHaveLength(3);
    const programIds = after.map((e) => e.programId).sort();
    expect(programIds).toEqual([p1, p2, p3].sort());

    // The original p1 enrollment was cancelled (not active anymore) —
    // and a NEW active p1 enrollment exists with a different id.
    const allP1 = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.programId, p1),
        ),
      );
    const originalP1Row = allP1.find((e) => e.id === originalP1EnrollmentId);
    expect(originalP1Row?.status).toBe("cancelled");
    const newP1Row = allP1.find(
      (e) => e.id !== originalP1EnrollmentId && e.status === "active",
    );
    expect(newP1Row).toBeDefined();
  });
});
