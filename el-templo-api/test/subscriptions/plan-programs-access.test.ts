/**
 * Phase 156 Plan 03 — Multi-program access via explicit list (PLAN-03 / D-07).
 *
 * A plan resolves program access as all → list → nothing:
 *   - grantsAllPrograms=true  → every active program (Foundation excluded),
 *     list ignored (regression against the phase 104 bundle behavior).
 *   - grantsAllPrograms=false + non-empty programIds → exactly the listed
 *     programs, keeping the SAME Foundation filter (a list can NOT grant
 *     Foundation, anti-piracy 104 R7).
 *   - grantsAllPrograms=false + empty list → no enrollment (current behavior).
 *
 * Covers: all/list/nothing resolution, Foundation exclusion from the list,
 * idempotency (re-assign does not duplicate), teardown (cancel removes the
 * list enrollments) and teardown protection (another active sub whose LIST
 * covers a program preserves that program's enrollment).
 *
 * Assertions are made directly against `program_enrollments`. Fixtures mirror
 * bundle-todos-los-programas.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { programs } from "../../src/db/schema/micro-programs";
import { programEnrollments } from "../../src/db/schema/program-enrollments";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
  dateOffsetStr,
} from "./_helpers";

describe("Multi-program access via list (Phase 156-03 PLAN-03 / D-07)", () => {
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

  /** Insert an active program directly via DB. Returns its id. */
  async function createTestProgram(
    overrides: Partial<typeof programs.$inferInsert> = {},
  ): Promise<number> {
    const result = await app.db.insert(programs).values({
      name: overrides.name ?? "Test Program",
      description: overrides.description ?? "Programa de prueba",
      durationWeeks: overrides.durationWeeks ?? 4,
      sessionsPerWeekToAdvance: overrides.sessionsPerWeekToAdvance ?? 3,
      isActive: overrides.isActive ?? true,
      goalPlanType: overrides.goalPlanType ?? "tren_superior",
      ...overrides,
    });
    return Number(result[0].insertId);
  }

  /** Read active enrollments for a member (programIds only). */
  async function activeProgramIds(userId: number): Promise<number[]> {
    const rows = await app.db
      .select({ programId: programEnrollments.programId })
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, userId),
          eq(programEnrollments.status, "active"),
        ),
      );
    return rows.map((r) => r.programId).sort((a, b) => a - b);
  }

  // ─── Test 1: all=true enrolls in every program (regression) ───────────────

  it("grantsAllPrograms=true enrolls in every active program WITH goalPlanType (list ignored)", async () => {
    const p1 = await createTestProgram({
      name: "Tren Superior",
      goalPlanType: "tren_superior",
    });
    const p2 = await createTestProgram({
      name: "Piernas y Glúteos",
      goalPlanType: "piernas_gluteos",
    });
    const foundationId = await createTestProgram({
      name: "Foundation",
      goalPlanType: null,
    });

    // grantsAllPrograms=true; a programIds list is also sent to prove it is
    // ignored when `all` wins (only p1/p2 come back, never fewer/more).
    const allPlan = await createPlan(app, adminToken, {
      name: "Todos los Programas (lista ignorada)",
      planCategory: "online_regular",
      grantsAllPrograms: true,
      programIds: [p1],
    });
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id as number, {
      planId: allPlan.id,
    });
    expect(res.statusCode).toBe(201);

    expect(await activeProgramIds(member.id as number)).toEqual(
      [p1, p2].sort((a, b) => a - b),
    );
    // Foundation is never granted.
    const enrolled = await activeProgramIds(member.id as number);
    expect(enrolled).not.toContain(foundationId);
  });

  // ─── Test 2: list enrolls ONLY the listed programs ────────────────────────

  it("grantsAllPrograms=false + non-empty list enrolls SOLO the listed programs", async () => {
    const p1 = await createTestProgram({
      name: "Prog 1",
      goalPlanType: "tren_superior",
    });
    const p2 = await createTestProgram({
      name: "Prog 2",
      goalPlanType: "piernas_gluteos",
    });
    const p3 = await createTestProgram({
      name: "Prog 3 (fuera de la lista)",
      goalPlanType: "full_body",
    });

    const listPlan = await createPlan(app, adminToken, {
      name: "Plan Lista p1+p2",
      planCategory: "online_regular",
      programIds: [p1, p2],
    });
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id as number, {
      planId: listPlan.id,
    });
    expect(res.statusCode).toBe(201);

    // Only p1 and p2 — p3 is active but NOT in the list.
    expect(await activeProgramIds(member.id as number)).toEqual(
      [p1, p2].sort((a, b) => a - b),
    );
    expect(await activeProgramIds(member.id as number)).not.toContain(p3);
  });

  // ─── Test 3: empty list enrolls in nothing ────────────────────────────────

  it("grantsAllPrograms=false + empty list enrolls in NO program", async () => {
    await createTestProgram({ name: "Prog A", goalPlanType: "tren_superior" });
    await createTestProgram({ name: "Prog B", goalPlanType: "full_body" });

    // Presencial flex plan (basePlan default) with no list, no linked program,
    // no bundle → grants no online program.
    const noList = await createPlan(app, adminToken, {
      name: "Plan sin acceso a programas",
    });
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id as number, {
      planId: noList.id,
    });
    expect(res.statusCode).toBe(201);

    expect(await activeProgramIds(member.id as number)).toEqual([]);
  });

  // ─── Test 4: Foundation in the list is NOT granted (anti-piracy) ──────────

  it("a Foundation program (goalPlanType IS NULL) in the list is NOT enrolled", async () => {
    const p1 = await createTestProgram({
      name: "Prog Válido",
      goalPlanType: "tren_superior",
    });
    const foundationId = await createTestProgram({
      name: "Foundation",
      goalPlanType: null,
    });

    // The list explicitly includes Foundation — the resolution MUST still drop
    // it (goalPlanType IS NOT NULL filter, phase 104 R7).
    const listPlan = await createPlan(app, adminToken, {
      name: "Plan Lista con Foundation",
      planCategory: "online_regular",
      programIds: [p1, foundationId],
    });
    const member = await createMember(app);

    const res = await assignPlan(app, adminToken, member.id as number, {
      planId: listPlan.id,
    });
    expect(res.statusCode).toBe(201);

    // Only p1 — Foundation excluded even though it was listed.
    expect(await activeProgramIds(member.id as number)).toEqual([p1]);
    expect(await activeProgramIds(member.id as number)).not.toContain(
      foundationId,
    );
  });

  // ─── Test 5: idempotency (re-assign does not duplicate) ───────────────────

  it("re-assigning a list plan does not duplicate a pre-existing active enrollment", async () => {
    const p1 = await createTestProgram({
      name: "Prog 1",
      goalPlanType: "tren_superior",
    });
    const p2 = await createTestProgram({
      name: "Prog 2",
      goalPlanType: "piernas_gluteos",
    });

    const member = await createMember(app);

    // Pre-create an active enrollment for p1 with in-flight progress.
    const preInsert = await app.db.insert(programEnrollments).values({
      userId: member.id as number,
      programId: p1,
      status: "active",
      currentWeek: 2,
      sessionsCompletedThisWeek: 1,
    });
    const preEnrollmentId = Number(preInsert[0].insertId);

    const listPlan = await createPlan(app, adminToken, {
      name: "Plan Lista p1+p2",
      planCategory: "online_regular",
      programIds: [p1, p2],
    });

    const res = await assignPlan(app, adminToken, member.id as number, {
      planId: listPlan.id,
    });
    expect(res.statusCode).toBe(201);

    // Total = 2 (p1 pre-existing + p2 new), NOT 3 — no duplicate for p1.
    expect(await activeProgramIds(member.id as number)).toEqual(
      [p1, p2].sort((a, b) => a - b),
    );

    // Pre-existing p1 enrollment preserved (same id + progress, not replaced).
    const [preserved] = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.id, preEnrollmentId));
    expect(preserved.status).toBe("active");
    expect(preserved.currentWeek).toBe(2);
    expect(preserved.sessionsCompletedThisWeek).toBe(1);
  });

  // ─── Test 6: teardown cancels the list enrollments ────────────────────────

  it("cancelling a list-plan subscription cancels its enrollments", async () => {
    const p1 = await createTestProgram({
      name: "Prog 1",
      goalPlanType: "tren_superior",
    });
    const p2 = await createTestProgram({
      name: "Prog 2",
      goalPlanType: "piernas_gluteos",
    });

    const listPlan = await createPlan(app, adminToken, {
      name: "Plan Lista teardown",
      planCategory: "online_regular",
      programIds: [p1, p2],
    });
    const member = await createMember(app);

    const assignRes = await assignPlan(app, adminToken, member.id as number, {
      planId: listPlan.id,
      // Skip the charge tx so the cancel endpoint runs without first having to
      // anular each tx (this test targets enrollment teardown, not finance).
      priceOverrideAmount: 0,
      priceOverrideReason: "test (no charge — teardown isolation)",
    });
    expect(assignRes.statusCode).toBe(201);
    expect(await activeProgramIds(member.id as number)).toEqual(
      [p1, p2].sort((a, b) => a - b),
    );

    const cancelRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/cancel`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { notes: "test cancel" },
    });
    expect(cancelRes.statusCode).toBe(200);

    // Both list enrollments cancelled.
    expect(await activeProgramIds(member.id as number)).toEqual([]);
    const all = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));
    expect(all).toHaveLength(2);
    for (const e of all) {
      expect(e.status).toBe("cancelled");
      expect(e.cancelledAt).not.toBeNull();
    }
  });

  // ─── Test 7: teardown protection via another sub's LIST ───────────────────

  it("teardown preserves a program still covered by ANOTHER active sub's list", async () => {
    const p1 = await createTestProgram({
      name: "Prog 1 (protegido)",
      goalPlanType: "tren_superior",
    });
    const p2 = await createTestProgram({
      name: "Prog 2",
      goalPlanType: "piernas_gluteos",
    });
    const p3 = await createTestProgram({
      name: "Prog 3",
      goalPlanType: "full_body",
    });

    const member = await createMember(app);

    // Protector plan: its LIST covers p1. Assigned via API so its plan_programs
    // row and its p1 enrollment exist against an active sub.
    const protectorPlan = await createPlan(app, adminToken, {
      name: "Plan Protector Lista p1",
      planCategory: "online_regular",
      programIds: [p1],
    });
    const protectorAssign = await assignPlan(
      app,
      adminToken,
      member.id as number,
      { planId: protectorPlan.id },
    );
    expect(protectorAssign.statusCode).toBe(201);

    // Target plan: LIST covers p1, p2, p3. It is also online_regular, so the
    // online-online conflict guard would block a second API assign — direct-DB
    // insert the sub (endDate=yesterday so autoExpire triggers teardown) and
    // manually create the enrollments p2/p3 it would own (p1 already active
    // via the protector, so the list resolution would have skipped it).
    const targetPlan = await createPlan(app, adminToken, {
      name: "Plan Objetivo Lista p1+p2+p3",
      planCategory: "online_regular",
      programIds: [p1, p2, p3],
    });
    const targetSubInsert = await app.db.insert(subscriptions).values({
      userId: member.id as number,
      planId: targetPlan.id,
      branchId: 1,
      status: "active",
      startDate: todayStr(),
      endDate: dateOffsetStr(-1),
      pricePaid: 15000,
      priceTypeApplied: "regular",
      currency: "ARS",
    });
    const targetSubId = Number(targetSubInsert[0].insertId);

    await app.db.insert(programEnrollments).values([
      {
        userId: member.id as number,
        programId: p2,
        status: "active",
        currentWeek: 1,
        sessionsCompletedThisWeek: 0,
        weekUnlockedAt: new Date(),
        source: "plan_bundle",
        subscriptionId: targetSubId,
      },
      {
        userId: member.id as number,
        programId: p3,
        status: "active",
        currentWeek: 1,
        sessionsCompletedThisWeek: 0,
        weekUnlockedAt: new Date(),
        source: "plan_bundle",
        subscriptionId: targetSubId,
      },
    ]);

    // Trigger autoExpireSubscriptions by reading the member subscription. The
    // target sub (endDate=yesterday) is expired → tearDownForSubscription runs.
    const readRes = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(readRes.statusCode).toBe(200);

    const enrollmentsAfter = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));

    const e1 = enrollmentsAfter.find((e) => e.programId === p1);
    const e2 = enrollmentsAfter.find((e) => e.programId === p2);
    const e3 = enrollmentsAfter.find((e) => e.programId === p3);

    // p1 PRESERVED — covered by the protector sub's list.
    expect(e1?.status).toBe("active");
    // p2 and p3 CANCELLED — only the expired target sub owned them.
    expect(e2?.status).toBe("cancelled");
    expect(e3?.status).toBe("cancelled");

    // The target sub was expired.
    const [targetSub] = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, targetSubId));
    expect(targetSub.status).toBe("expired");
  });

  // ─── Test 8: WR-01 — renewal re-grants the LIST even with linked in-flight ──

  it("renewal grants the plan's LIST even when the linked enrollment is in-flight, without resetting the linked progress (WR-01)", async () => {
    const linked = await createTestProgram({
      name: "Programa Vinculado",
      goalPlanType: "tren_superior",
    });
    const listProg = await createTestProgram({
      name: "Programa de la Lista",
      goalPlanType: "piernas_gluteos",
    });

    // Plan con linkedProgramId + lista: al asignar, ambos quedan activos.
    const plan = await createPlan(app, adminToken, {
      name: "Plan linked + lista (WR-01)",
      planCategory: "online_regular",
      linkedProgramId: linked,
      programIds: [listProg],
    });
    const member = await createMember(app);

    const assignRes = await assignPlan(app, adminToken, member.id as number, {
      planId: plan.id,
    });
    expect(assignRes.statusCode).toBe(201);
    expect(await activeProgramIds(member.id as number)).toEqual(
      [linked, listProg].sort((a, b) => a - b),
    );

    // Simular progreso en curso del linked (currentWeek=3) — debe preservarse.
    await app.db
      .update(programEnrollments)
      .set({ currentWeek: 3, sessionsCompletedThisWeek: 2 })
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.programId, linked),
        ),
      );

    // Simular que la inscripción de la LISTA se completó/canceló (ya no activa):
    // antes del fix, la renovación con linked activo saltaba enrollFromPlan por
    // completo y NUNCA re-otorgaba la lista.
    await app.db
      .update(programEnrollments)
      .set({ status: "completed" })
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.programId, listProg),
        ),
      );
    expect(await activeProgramIds(member.id as number)).toEqual([linked]);

    // Renovar: el linked sigue in-flight → shouldEnrollLinked=false, pero la
    // lista debe otorgarse igual (enrollFromPlan corre con linkedProgramId=null).
    const renewRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/renew`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { paymentMethod: "cash", amountReceived: 0 },
    });
    expect(renewRes.statusCode).toBe(201);

    // La lista se re-otorgó Y el linked conserva su progreso (no se reseteó).
    expect(await activeProgramIds(member.id as number)).toEqual(
      [linked, listProg].sort((a, b) => a - b),
    );
    const [linkedEnrollment] = await app.db
      .select()
      .from(programEnrollments)
      .where(
        and(
          eq(programEnrollments.userId, member.id as number),
          eq(programEnrollments.programId, linked),
          eq(programEnrollments.status, "active"),
        ),
      );
    expect(linkedEnrollment.currentWeek).toBe(3);
    expect(linkedEnrollment.sessionsCompletedThisWeek).toBe(2);
  });
});
