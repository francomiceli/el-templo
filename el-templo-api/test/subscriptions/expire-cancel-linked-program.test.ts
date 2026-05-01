/**
 * Linked-program enrollment teardown — covers the historical gap where
 * cancelSubscription and autoExpireSubscriptions only tore down BUNDLE
 * enrollments, leaving single-program-plan enrollments (linkedProgramId)
 * alive after the sub ended. Without these the front gate
 * (canEnterTraining = hasPresencialPlan || allActiveEnrollments.length>0)
 * keeps users in Entrenamiento indefinitely after their sub vencio.
 *
 * Also covers the autoExpireSubscriptions recomputeUserStatus gap:
 * passive expiry was the only lifecycle path that did not flip
 * users.status back to 'inactivo'.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { subscriptions } from "../../src/db/schema/subscriptions";
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

describe("Linked-program enrollment teardown (cancel + autoExpire)", () => {
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

  // ─── Test 1: cancelSubscription tears down linkedProgramId enrollment ──────

  it("cancelSubscription cancels the enrollment owned by the plan's linkedProgramId", async () => {
    const programId = await createTestProgram({
      name: "Linked Program",
      goalPlanType: "tren_superior",
    });
    const plan = await createPlan(app, adminToken, {
      name: "Online Goal Linked",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId: programId,
    });
    const member = await createMember(app);

    // priceOverrideAmount=0 skips the charge tx so REQ-3 doesn't block cancel.
    const assignRes = await assignPlan(app, adminToken, member.id as number, {
      planId: plan.id,
      priceOverrideAmount: 0,
      priceOverrideReason: "test (no charge — REQ-3 isolation)",
    });
    expect(assignRes.statusCode).toBe(201);

    // Pre-cancel: enrollment is active
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
    expect(before[0].programId).toBe(programId);

    // Set users.currentProgramEnrollmentId pointing at this enrollment so
    // we can also verify the pointer cleanup branch.
    await app.db
      .update(users)
      .set({ currentProgramEnrollmentId: before[0].id })
      .where(eq(users.id, member.id as number));

    const cancelRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { notes: "test cancel" },
    });
    expect(cancelRes.statusCode).toBe(200);

    // Post-cancel: enrollment cancelled, pointer cleared, user status flipped
    const after = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe("cancelled");
    expect(after[0].cancelledAt).toBeTruthy();

    const [u] = await app.db
      .select({
        currentProgramEnrollmentId: users.currentProgramEnrollmentId,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, member.id as number));
    expect(u.currentProgramEnrollmentId).toBeNull();
    expect(u.status).toBe("inactivo");
  });

  // ─── Test 2: autoExpireSubscriptions tears down linkedProgramId enrollment ─

  it("autoExpireSubscriptions cancels enrollment + recomputes users.status when a linked-program sub expires by date", async () => {
    const programId = await createTestProgram({
      name: "Linked Program",
      goalPlanType: "tren_superior",
    });
    const plan = await createPlan(app, adminToken, {
      name: "Online Goal Linked",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId: programId,
    });
    const member = await createMember(app);

    const assignRes = await assignPlan(app, adminToken, member.id as number, {
      planId: plan.id,
      startDate: dateOffsetStr(-2),
    });
    expect(assignRes.statusCode).toBe(201);

    // Pre-conditions: enrollment active, user activo
    const enrollmentsBefore = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.status, "active"),
        ),
      );
    expect(enrollmentsBefore).toHaveLength(1);

    const [userBefore] = await app.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, member.id as number));
    expect(userBefore.status).toBe("activo");

    // Force endDate into the past so the next read auto-expires.
    await app.db
      .update(subscriptions)
      .set({ startDate: dateOffsetStr(-10), endDate: dateOffsetStr(-5) })
      .where(eq(subscriptions.userId, member.id as number));

    // Trigger autoExpireSubscriptions via the GET route.
    const readRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(readRes.statusCode).toBe(404);

    // Enrollment cancelled
    const enrollmentsAfter = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));
    expect(enrollmentsAfter).toHaveLength(1);
    expect(enrollmentsAfter[0].status).toBe("cancelled");

    // user.status recomputed to 'inactivo'
    const [userAfter] = await app.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, member.id as number));
    expect(userAfter.status).toBe("inactivo");
  });

  // ─── Test 3: protection — another sub linking same program preserves it ───

  it("teardown preserves enrollment when ANOTHER active sub links to the same program", async () => {
    const programId = await createTestProgram({
      name: "Shared Program",
      goalPlanType: "tren_superior",
    });
    // Plan A — online linked to program (this sub will be auto-expired)
    const planA = await createPlan(app, adminToken, {
      name: "Online Linked A",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId: programId,
      priceRegular: 12000,
      priceZero: 8000,
    });
    // Plan B — presencial also linking to same program (will protect)
    const planB = await createPlan(app, adminToken, {
      name: "Presencial Linked B",
      planCategory: "presencial",
      linkedProgramId: programId,
      priceRegular: 15000,
      priceZero: 10000,
    });
    const member = await createMember(app);

    // Assign B (presencial) first via API — creates p enrollment + active sub.
    const bAssign = await assignPlan(app, adminToken, member.id as number, {
      planId: planB.id,
    });
    expect(bAssign.statusCode).toBe(201);

    // Direct-insert sub A (online) bypassing assignPlan dual-online guards.
    // The enrollment for `programId` was already created by B; we won't
    // duplicate it (the helper checks existing).
    const today = todayStr();
    const yesterday = dateOffsetStr(-1);
    await app.db.insert(subscriptions).values({
      userId: member.id as number,
      planId: planA.id,
      branchId: 1,
      status: "active",
      startDate: dateOffsetStr(-2),
      endDate: yesterday,
      pricePaid: 12000,
      priceTypeApplied: "regular",
      currency: "ARS",
    });

    const enrollmentBefore = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.programId, programId),
          eq(programEnrollments.status, "active"),
        ),
      );
    expect(enrollmentBefore).toHaveLength(1);

    // Trigger auto-expire — sub A expires, sub B stays active.
    const readRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    // Sub B is still active so the read returns 200.
    expect(readRes.statusCode).toBe(200);
    void today;

    // Enrollment must be PRESERVED (protected by sub B linkedProgramId)
    const [enrollmentAfter] = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.id, enrollmentBefore[0].id));
    expect(enrollmentAfter.status).toBe("active");

    // user.status remains 'activo' because sub B is still active
    const [userAfter] = await app.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, member.id as number));
    expect(userAfter.status).toBe("activo");
  });

  // ─── Test 4: regression — bundle teardown still works ─────────────────────

  it("regression — bundle teardown still cancels owned enrollments on autoExpire", async () => {
    await createTestProgram({
      name: "Program 1",
      goalPlanType: "tren_superior",
    });
    await createTestProgram({
      name: "Program 2",
      goalPlanType: "piernas_gluteos",
    });
    const bundle = await createPlan(app, adminToken, {
      name: "Bundle Test",
      planCategory: "online_regular",
      grantsAllPrograms: true,
      priceRegular: 20000,
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
    expect(enrollmentsBefore.length).toBeGreaterThan(0);

    // Force expire
    await app.db
      .update(subscriptions)
      .set({ endDate: dateOffsetStr(-1) })
      .where(eq(subscriptions.userId, member.id as number));

    const readRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect([200, 404]).toContain(readRes.statusCode);

    const enrollmentsAfter = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));
    for (const e of enrollmentsAfter) {
      expect(e.status).toBe("cancelled");
    }

    const [userAfter] = await app.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, member.id as number));
    expect(userAfter.status).toBe("inactivo");
  });
});
