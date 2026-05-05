/**
 * Phase 112 Plan 03 — Lifecycle hooks integration tests.
 *
 * Covers the four lifecycle decisions locked in 112-CONTEXT.md:
 *   D-16  pause cascade (sub→enrollments)
 *   D-17  resume cascade (paused→active only; never resurrects cancelled)
 *   D-18  cancel + expire teardown of admin add-ons (no auto-refund)
 *   D-19  changePlan transferAddons (admin add-ons follow the new sub)
 *   D-20  zero-add-on changePlan is a clean no-op
 *
 * All tests run against the per-worker `eltemplo_test` DB (real MySQL).
 * Admin add-on enrollment rows are seeded directly via Drizzle since the
 * admin add-on assignment endpoint is delivered in Plan 04 (not yet wired);
 * Plan 03's contract is the EnrollmentService method bodies + the hooks in
 * subscriptions/service.ts, and those hooks operate on rows regardless of
 * how they were created.
 *
 * Date fixtures intentionally use dateOffsetStr(-1) for startDate to avoid
 * the late-night UTC vs local CURDATE() drift documented in
 * .planning/phases/112-enrollment-service-admin-add-ons/deferred-items.md.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and, inArray, desc } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { subscriptionPlans } from "../../src/db/schema/subscription-plans";
import { programs } from "../../src/db/schema/micro-programs";
import { programEnrollments } from "../../src/db/schema/program-enrollments";
import { financialTransactions } from "../../src/db/schema/financial-transactions";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  dateOffsetStr,
  todayStr,
} from "../subscriptions/_helpers";

describe("EnrollmentService lifecycle hooks (Phase 112 Plan 03)", () => {
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

  // ─── Fixtures ─────────────────────────────────────────────────────────────

  async function createTestProgram(
    overrides: Partial<typeof programs.$inferInsert> = {},
  ): Promise<number> {
    const result = await app.db.insert(programs).values({
      name: overrides.name ?? "Test Program",
      description: overrides.description ?? "Test program",
      durationWeeks: overrides.durationWeeks ?? 4,
      sessionsPerWeekToAdvance: overrides.sessionsPerWeekToAdvance ?? 3,
      isActive: overrides.isActive ?? true,
      goalPlanType: overrides.goalPlanType ?? "tren_superior",
      ...overrides,
    });
    return Number(result[0].insertId);
  }

  async function createBundlePlan(
    overrides: Partial<typeof subscriptionPlans.$inferInsert> = {},
  ): Promise<{ id: number }> {
    const result = await app.db.insert(subscriptionPlans).values({
      name: "Todos los Programas",
      description: "Bundle test",
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

  /**
   * Direct-insert an admin add-on enrollment row tied to a given sub. The
   * /api/admin/users/:id/program-addons endpoint that produces these rows
   * organically is Plan 04's deliverable; Plan 03 only owns the lifecycle
   * behavior over rows that already exist.
   */
  async function seedAdminAddon(
    userId: number,
    programId: number,
    subscriptionId: number,
  ): Promise<number> {
    const result = await app.db.insert(programEnrollments).values({
      userId,
      programId,
      status: "active",
      currentWeek: 1,
      sessionsCompletedThisWeek: 0,
      weekUnlockedAt: new Date(),
      source: "admin_addon",
      subscriptionId,
    });
    return Number(result[0].insertId);
  }

  /**
   * Resolve the active/paused subscription id for a user. Tests use this
   * after assignPlan to grab the sub id without round-tripping through the
   * detail GET (which auto-expires). Filters by status so closed subs
   * (status='changed' from a prior changePlanNow) are not returned.
   */
  async function getActiveSubId(userId: number): Promise<number> {
    const [row] = await app.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          inArray(subscriptions.status, ["active", "paused"]),
        ),
      )
      .orderBy(desc(subscriptions.id))
      .limit(1);
    if (!row) throw new Error(`No active sub found for user ${userId}`);
    return row.id;
  }

  // ─── Test 1 (D-16): pause cascades to plan-linked enrollment ──────────────

  it("D-16 — pause cascades plan_linked enrollment from active to paused", async () => {
    const programId = await createTestProgram({ name: "Linked p1" });
    const plan = await createPlan(app, adminToken, {
      name: "Online Goal Linked",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId: programId,
    });
    const member = await createMember(app);
    const assignRes = await assignPlan(app, adminToken, member.id as number, {
      planId: plan.id,
      startDate: dateOffsetStr(-1),
    });
    expect(assignRes.statusCode).toBe(201);

    const before = await app.db
      .select({ status: programEnrollments.status })
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));
    expect(before).toHaveLength(1);
    expect(before[0].status).toBe("active");

    const pauseRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pause`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { pauseEndDate: dateOffsetStr(7) },
    });
    expect(pauseRes.statusCode).toBe(200);

    const after = await app.db
      .select({ status: programEnrollments.status })
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe("paused");
  });

  // ─── Test 2 (D-17): resume reverts paused→active ──────────────────────────

  it("D-17 — resume reverts paused enrollment back to active", async () => {
    const programId = await createTestProgram({ name: "Linked p1" });
    const plan = await createPlan(app, adminToken, {
      name: "Online Goal Linked",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId: programId,
    });
    const member = await createMember(app);
    await assignPlan(app, adminToken, member.id as number, {
      planId: plan.id,
      startDate: dateOffsetStr(-1),
    });

    await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pause`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { pauseEndDate: dateOffsetStr(7) },
    });

    const resumeRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/resume`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(resumeRes.statusCode).toBe(200);

    const after = await app.db
      .select({ status: programEnrollments.status })
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe("active");
  });

  // ─── Test 3 (D-17 negation): resume does NOT resurrect cancelled rows ─────

  it("D-17 — resume does not resurrect a previously cancelled enrollment on the same sub", async () => {
    const programId = await createTestProgram({ name: "Linked p1" });
    const plan = await createPlan(app, adminToken, {
      name: "Online Goal Linked",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId: programId,
    });
    const member = await createMember(app);
    await assignPlan(app, adminToken, member.id as number, {
      planId: plan.id,
      startDate: dateOffsetStr(-1),
    });

    const subId = await getActiveSubId(member.id as number);

    // Direct-cancel the plan_linked enrollment created by assignPlan.
    await app.db
      .update(programEnrollments)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.subscriptionId, subId),
        ),
      );

    // Pause + resume the sub (no paused enrollment exists, so no-op cascade).
    await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/pause`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { pauseEndDate: dateOffsetStr(7) },
    });
    await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/resume`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });

    const after = await app.db
      .select({ status: programEnrollments.status })
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe("cancelled");
  });

  // ─── Test 4 (D-19): changePlanNow transfers admin add-ons + recreates plan-bound

  it("D-19 — changePlanNow transfers admin add-on to new sub and recreates plan_linked rows on the new sub", async () => {
    const linkedProgramId = await createTestProgram({
      name: "Linked p1",
      goalPlanType: "tren_superior",
    });
    const addonProgramId = await createTestProgram({
      name: "Addon p2",
      goalPlanType: "piernas_gluteos",
    });

    const oldPlan = await createPlan(app, adminToken, {
      name: "Online Linked p1 Cheaper",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId,
      priceRegular: 12000,
      priceZero: 8000,
    });
    const newPlan = await createPlan(app, adminToken, {
      name: "Online Linked p1 Pricier",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId,
      priceRegular: 18000,
      priceZero: 12000,
    });
    const member = await createMember(app);
    const assignRes = await assignPlan(app, adminToken, member.id as number, {
      planId: oldPlan.id,
      startDate: dateOffsetStr(-1),
    });
    expect(assignRes.statusCode).toBe(201);

    const oldSubId = await getActiveSubId(member.id as number);

    const addonId = await seedAdminAddon(
      member.id as number,
      addonProgramId,
      oldSubId,
    );

    const changeRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: newPlan.id,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(changeRes.statusCode).toBe(201);

    const newSubId = await getActiveSubId(member.id as number);
    expect(newSubId).not.toBe(oldSubId);

    // Admin add-on row was transferred (still active, subscription_id flipped).
    const [addonAfter] = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.id, addonId));
    expect(addonAfter.status).toBe("active");
    expect(addonAfter.subscriptionId).toBe(newSubId);
    expect(addonAfter.source).toBe("admin_addon");

    // Old plan_linked row tied to oldSubId is cancelled.
    const oldLinkedRows = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.subscriptionId, oldSubId),
        ),
      );
    expect(oldLinkedRows).toHaveLength(1);
    expect(oldLinkedRows[0].status).toBe("cancelled");
    expect(oldLinkedRows[0].source).toBe("plan_linked");

    // New plan_linked row tied to newSubId exists and is active.
    const newLinkedRows = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.subscriptionId, newSubId),
          eq(programEnrollments.source, "plan_linked"),
        ),
      );
    expect(newLinkedRows).toHaveLength(1);
    expect(newLinkedRows[0].status).toBe("active");
    expect(newLinkedRows[0].programId).toBe(linkedProgramId);
  });

  // ─── Test 5 (D-20 no-op): changePlan with zero add-ons doesn't break ─────

  it("D-20 — changePlanNow with zero admin add-ons is a clean no-op (transferAddons returns transferred:0)", async () => {
    const linkedProgramId = await createTestProgram({
      name: "Linked p1",
      goalPlanType: "tren_superior",
    });
    const oldPlan = await createPlan(app, adminToken, {
      name: "Online Linked Cheap",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId,
      priceRegular: 10000,
      priceZero: 8000,
    });
    const newPlan = await createPlan(app, adminToken, {
      name: "Online Linked Pricier",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId,
      priceRegular: 18000,
      priceZero: 12000,
    });
    const member = await createMember(app);
    await assignPlan(app, adminToken, member.id as number, {
      planId: oldPlan.id,
      startDate: dateOffsetStr(-1),
    });

    const oldSubId = await getActiveSubId(member.id as number);

    // No admin add-ons seeded — only the plan_linked row from assignPlan.

    const changeRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: newPlan.id,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(changeRes.statusCode).toBe(201);

    const newSubId = await getActiveSubId(member.id as number);
    expect(newSubId).not.toBe(oldSubId);

    // After: 0 admin_addon rows for this user (transferred count = 0).
    const addonRows = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.source, "admin_addon"),
        ),
      );
    expect(addonRows).toHaveLength(0);

    // Plan-bound rows: old cancelled, new active — same as Plan 02 baseline.
    const allRows = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));
    const oldLinked = allRows.find(
      (r) => r.subscriptionId === oldSubId && r.source === "plan_linked",
    );
    const newLinked = allRows.find(
      (r) => r.subscriptionId === newSubId && r.source === "plan_linked",
    );
    expect(oldLinked?.status).toBe("cancelled");
    expect(newLinked?.status).toBe("active");
  });

  // ─── Test 6 (D-18 cancel): cancel sub teardowns admin_addon ──────────────

  it("D-18 — cancelSubscription cancels admin add-on enrollment on the closing sub", async () => {
    const addonProgramId = await createTestProgram({
      name: "Addon Program",
      goalPlanType: "piernas_gluteos",
    });
    const plan = await createPlan(app, adminToken, {
      name: "Plan Vanilla",
    });
    const member = await createMember(app);
    const assignRes = await assignPlan(app, adminToken, member.id as number, {
      planId: plan.id,
      startDate: dateOffsetStr(-1),
      priceOverrideAmount: 0,
      priceOverrideReason: "test no-charge (REQ-3 isolation)",
    });
    expect(assignRes.statusCode).toBe(201);

    const subId = await getActiveSubId(member.id as number);
    const addonId = await seedAdminAddon(
      member.id as number,
      addonProgramId,
      subId,
    );

    const cancelRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { notes: "test cancel" },
    });
    expect(cancelRes.statusCode).toBe(200);

    const [addonAfter] = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.id, addonId));
    expect(addonAfter.status).toBe("cancelled");
    expect(addonAfter.cancelledAt).toBeTruthy();
  });

  // ─── Test 7 (D-18 expire): autoExpire teardowns admin_addon ──────────────

  it("D-18 — autoExpireSubscriptions cancels admin add-on enrollment when the parent sub expires", async () => {
    const addonProgramId = await createTestProgram({
      name: "Addon Program",
      goalPlanType: "piernas_gluteos",
    });
    const plan = await createPlan(app, adminToken, {
      name: "Plan Vanilla",
    });
    const member = await createMember(app);
    await assignPlan(app, adminToken, member.id as number, {
      planId: plan.id,
      startDate: dateOffsetStr(-2),
    });

    const subId = await getActiveSubId(member.id as number);
    const addonId = await seedAdminAddon(
      member.id as number,
      addonProgramId,
      subId,
    );

    // Force endDate into the past so the next read auto-expires.
    await app.db
      .update(subscriptions)
      .set({ startDate: dateOffsetStr(-10), endDate: dateOffsetStr(-5) })
      .where(eq(subscriptions.id, subId));

    // Trigger autoExpireSubscriptions via the GET endpoint.
    const readRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // 404 (no active sub left) or 200 (a successor existed) — both valid;
    // the assertion below is what matters.
    expect([200, 404]).toContain(readRes.statusCode);

    const [addonAfter] = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.id, addonId));
    expect(addonAfter.status).toBe("cancelled");
  });

  // ─── Test 8 (no-refund): cancel of admin_addon does NOT create refund row

  it("D-18 — cancelling a sub with admin add-ons does NOT create a financial refund row", async () => {
    const addonProgramId = await createTestProgram({
      name: "Addon Program",
      goalPlanType: "piernas_gluteos",
    });
    const plan = await createPlan(app, adminToken, {
      name: "Plan Vanilla",
    });
    const member = await createMember(app);
    await assignPlan(app, adminToken, member.id as number, {
      planId: plan.id,
      startDate: dateOffsetStr(-1),
      priceOverrideAmount: 0,
      priceOverrideReason: "test no-charge (REQ-3 isolation)",
    });

    const subId = await getActiveSubId(member.id as number);
    await seedAdminAddon(member.id as number, addonProgramId, subId);

    const refundsBefore = await app.db
      .select()
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.memberId, member.id as number),
          eq(financialTransactions.kind, "refund"),
        ),
      );
    expect(refundsBefore).toHaveLength(0);

    const cancelRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { notes: "no-refund test" },
    });
    expect(cancelRes.statusCode).toBe(200);

    const refundsAfter = await app.db
      .select()
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.memberId, member.id as number),
          eq(financialTransactions.kind, "refund"),
        ),
      );
    expect(refundsAfter).toHaveLength(0);
  });
});
