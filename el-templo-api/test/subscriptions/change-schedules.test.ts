import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq, sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { activities } from "../../src/db/schema/activities";
import { schedules } from "../../src/db/schema/schedules";
import { bookings } from "../../src/db/schema/bookings";
import { branches } from "../../src/db/schema/branches";
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";
import { subscriptions } from "../../src/db/schema/subscriptions";
import { users } from "../../src/db/schema/users";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
} from "./_helpers";
import { TENANT_TEMPLO } from "../fixtures/second-tenant";
import { tenantWhere } from "../../src/modules/shared/tenant";

/**
 * Fase 173 (ADO-02): gimnasio de la escritura DIRECTA de `users` en este
 * archivo. Con `members` en TENANT_STRICT_MODULES un UPDATE sin filtro hace
 * throw antes de llegar a MySQL.
 */
const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };

describe("Subscriptions API — PATCH /:id/schedules (change fixed turnos)", () => {
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

  // `branches` is intentionally NOT cleaned by cleanAllTestData (the seed sede
  // id 1 must survive). Tests share a DB per worker (isolate:false), so a fixed
  // branch code may already exist from another file. Upsert + select-by-code
  // keeps these inserts idempotent and avoids ER_DUP_ENTRY collisions.
  async function upsertBranch(
    name: string,
    code: string,
    country: string,
  ): Promise<number> {
    await app.db
      .insert(branches)
      .values({ name, code, country })
      .onDuplicateKeyUpdate({ set: { name } });
    const [row] = await app.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, code));
    return row.id;
  }

  async function createScheduleSlots(
    branchId: number,
    count: number,
    offset = 0,
  ): Promise<number[]> {
    await app.db.insert(activities).values({
      name: `Calistenia ChangeTurnos ${offset}`,
      isActive: true,
    });
    const actRows = await app.db.select({ id: activities.id }).from(activities);
    const activityId = actRows[actRows.length - 1].id;
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const dayOfWeek = ((offset + i) % 5) + 1;
      const startHour = 8 + offset + i;
      const startTime = `${String(startHour).padStart(2, "0")}:00`;
      const endTime = `${String(startHour + 1).padStart(2, "0")}:00`;
      const result = await app.db.insert(schedules).values({
        branchId,
        activityId,
        dayOfWeek,
        startTime,
        endTime,
        isActive: true,
      });
      ids.push(Number(result[0].insertId));
    }
    return ids;
  }

  async function setupActiveFixedSub(classesPerWeek = 2): Promise<{
    subId: number;
    memberId: number;
    originalSlots: number[];
  }> {
    const plan = await createPlan(app, adminToken, {
      name: `Fixed ChangeTurnos ${classesPerWeek}x`,
      bookingMode: "fixed",
      classesPerWeek,
      durationDays: 60,
    });
    const member = await createMember(app);
    const originalSlots = await createScheduleSlots(1, classesPerWeek, 0);
    const { statusCode, body } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      scheduleIds: originalSlots,
    });
    expect(statusCode).toBe(201);
    return {
      subId: body.id as number,
      memberId: member.id,
      originalSlots,
    };
  }

  async function patchSchedules(
    subId: number,
    payload: { scheduleIds: number[]; reason?: string },
    token = adminToken,
  ) {
    const res = await app.inject({
      method: "PATCH",
      url: `${SUBSCRIPTIONS_URL}/subscriptions/${subId}/schedules`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    return { statusCode: res.statusCode, body: JSON.parse(res.body) };
  }

  it("swaps subscription_schedules rows and returns updated sub", async () => {
    const { subId } = await setupActiveFixedSub(2);
    const newSlots = await createScheduleSlots(1, 2, 10);

    const { statusCode, body } = await patchSchedules(subId, {
      scheduleIds: newSlots,
      reason: "Cambio de disponibilidad",
    });

    expect(statusCode).toBe(200);
    expect([...(body.scheduleIds as number[])].sort()).toEqual(
      [...newSlots].sort(),
    );

    const rows = await app.db
      .select()
      .from(subscriptionSchedules)
      .where(eq(subscriptionSchedules.subscriptionId, subId));
    expect(rows.map((r) => r.scheduleId).sort()).toEqual([...newSlots].sort());
  });

  it("cancels future bookings on old slots and generates on new ones", async () => {
    const { subId, memberId, originalSlots } = await setupActiveFixedSub(2);

    const oldFutureCount = await app.db
      .select({ c: sql<number>`COUNT(*)` })
      .from(bookings)
      .where(
        sql`${bookings.memberId} = ${memberId}
            AND ${bookings.scheduleId} IN (${sql.join(
              originalSlots.map((id) => sql`${id}`),
              sql`, `,
            )})
            AND ${bookings.status} = 'reservado'
            AND ${bookings.bookingDate} > CURDATE()`,
      );
    expect(Number(oldFutureCount[0].c)).toBeGreaterThan(0);

    const newSlots = await createScheduleSlots(1, 2, 20);
    const { statusCode } = await patchSchedules(subId, {
      scheduleIds: newSlots,
    });
    expect(statusCode).toBe(200);

    const oldActiveAfter = await app.db
      .select({ c: sql<number>`COUNT(*)` })
      .from(bookings)
      .where(
        sql`${bookings.memberId} = ${memberId}
            AND ${bookings.scheduleId} IN (${sql.join(
              originalSlots.map((id) => sql`${id}`),
              sql`, `,
            )})
            AND ${bookings.status} = 'reservado'
            AND ${bookings.bookingDate} > CURDATE()`,
      );
    expect(Number(oldActiveAfter[0].c)).toBe(0);

    const newActiveAfter = await app.db
      .select({ c: sql<number>`COUNT(*)` })
      .from(bookings)
      .where(
        sql`${bookings.memberId} = ${memberId}
            AND ${bookings.scheduleId} IN (${sql.join(
              newSlots.map((id) => sql`${id}`),
              sql`, `,
            )})
            AND ${bookings.status} = 'reservado'
            AND ${bookings.bookingDate} > CURDATE()`,
      );
    expect(Number(newActiveAfter[0].c)).toBeGreaterThan(0);
  });

  it("records audit entry with actor and old/new slot IDs", async () => {
    const { subId, originalSlots } = await setupActiveFixedSub(2);
    const newSlots = await createScheduleSlots(1, 2, 30);

    await patchSchedules(subId, {
      scheduleIds: newSlots,
      reason: "Cliente pidió cambio",
    });

    const res = await app.inject({
      method: "GET",
      url: `${SUBSCRIPTIONS_URL}/subscriptions/${subId}/schedule-changes`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.changes).toHaveLength(1);
    const entry = parsed.changes[0];
    expect([...(entry.oldScheduleIds as number[])].sort()).toEqual(
      [...originalSlots].sort(),
    );
    expect([...(entry.newScheduleIds as number[])].sort()).toEqual(
      [...newSlots].sort(),
    );
    expect(entry.reason).toBe("Cliente pidió cambio");
    expect(entry.actorId).toBeTypeOf("number");
  });

  it("rejects when scheduleIds count does not match plan.classesPerWeek", async () => {
    const { subId } = await setupActiveFixedSub(2);
    const tooFew = await createScheduleSlots(1, 1, 40);

    const { statusCode, body } = await patchSchedules(subId, {
      scheduleIds: tooFew,
    });
    expect(statusCode).toBe(400);
    expect(body.message).toContain("exactamente");
  });

  it("accepts when sub is paused", async () => {
    const { subId, memberId } = await setupActiveFixedSub(2);
    const pauseRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${memberId}/subscription/pause`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {},
    });
    expect(pauseRes.statusCode).toBe(200);

    const newSlots = await createScheduleSlots(1, 2, 50);
    const { statusCode, body } = await patchSchedules(subId, {
      scheduleIds: newSlots,
    });
    expect(statusCode).toBe(200);
    expect([...(body.scheduleIds as number[])].sort()).toEqual(
      [...newSlots].sort(),
    );
  });

  it("accepts when sub is scheduled (paid in advance, hasn't started yet)", async () => {
    const { subId } = await setupActiveFixedSub(2);
    // Push the sub forward so it becomes 'scheduled': startDate in the
    // future + status='scheduled'. Mirrors the early-renewal flow.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await app.db
      .update(subscriptions)
      .set({ status: "scheduled", startDate: tomorrow })
      .where(eq(subscriptions.id, subId));

    const newSlots = await createScheduleSlots(1, 2, 60);
    const { statusCode, body } = await patchSchedules(subId, {
      scheduleIds: newSlots,
    });
    expect(statusCode).toBe(200);
    expect([...(body.scheduleIds as number[])].sort()).toEqual(
      [...newSlots].sort(),
    );
  });

  it("rejects when sub is cancelled", async () => {
    const { subId } = await setupActiveFixedSub(2);
    await app.db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(subscriptions.id, subId));

    const newSlots = await createScheduleSlots(1, 2, 70);
    const { statusCode, body } = await patchSchedules(subId, {
      scheduleIds: newSlots,
    });
    expect(statusCode).toBe(400);
    expect(body.message).toMatch(/activas, programadas o pausadas/);
  });

  it("accepts partial anchors on a flexible presencial plan", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Flex Partial Anchors",
      bookingMode: "flexible",
      classesPerWeek: 4,
      durationDays: 60,
    });
    const member = await createMember(app);
    const { body: assignBody } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    const subId = assignBody.id as number;
    const partial = await createScheduleSlots(1, 2, 60);

    const { statusCode, body } = await patchSchedules(subId, {
      scheduleIds: partial,
    });
    expect(statusCode).toBe(200);
    expect([...(body.scheduleIds as number[])].sort()).toEqual(
      [...partial].sort(),
    );
    expect(body.replacementCredits).toBe(0);
  });

  it("rejects flexible plan anchors when count exceeds classesPerWeek", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Flex Overcount",
      bookingMode: "flexible",
      classesPerWeek: 2,
      durationDays: 30,
    });
    const member = await createMember(app);
    const { body: assignBody } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
    });
    const subId = assignBody.id as number;
    const tooMany = await createScheduleSlots(1, 3, 65);

    const { statusCode, body } = await patchSchedules(subId, {
      scheduleIds: tooMany,
    });
    expect(statusCode).toBe(400);
    expect(body.message).toContain("hasta");
  });

  it("clears all anchors on a flexible plan when called with empty set", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Flex Clear Anchors",
      bookingMode: "flexible",
      classesPerWeek: 3,
      durationDays: 30,
    });
    const member = await createMember(app);
    const initial = await createScheduleSlots(1, 2, 75);
    const { body: assignBody } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      startDate: todayStr(),
      scheduleIds: initial,
    });
    const subId = assignBody.id as number;

    const { statusCode, body } = await patchSchedules(subId, {
      scheduleIds: [],
    });
    expect(statusCode).toBe(200);
    expect(body.scheduleIds).toEqual([]);

    const rows = await app.db
      .select()
      .from(subscriptionSchedules)
      .where(eq(subscriptionSchedules.subscriptionId, subId));
    expect(rows).toHaveLength(0);
  });

  it("rejects when new slots are the same set as current", async () => {
    const { subId, originalSlots } = await setupActiveFixedSub(2);
    const { statusCode, body } = await patchSchedules(subId, {
      scheduleIds: [...originalSlots].reverse(),
    });
    expect(statusCode).toBe(400);
    expect(body.message).toContain("iguales");
  });

  it("rejects when new schedules are inactive or wrong branch", async () => {
    const { subId } = await setupActiveFixedSub(2);
    const newSlots = await createScheduleSlots(1, 2, 70);
    await app.db
      .update(schedules)
      .set({ isActive: false })
      .where(eq(schedules.id, newSlots[0]));

    const { statusCode, body } = await patchSchedules(subId, {
      scheduleIds: newSlots,
    });
    expect(statusCode).toBe(400);
    expect(body.message).toContain("inactiv");
  });

  it("allows coach role (not just admin) to change schedules", async () => {
    const { subId } = await setupActiveFixedSub(2);
    const newSlots = await createScheduleSlots(1, 2, 80);

    const coachEmail = "coach-change-turnos@test.com";
    await registerUser(app, {
      email: coachEmail,
      password: "coach12345",
      firstName: "Coach",
      lastName: "ChangeTurnos",
      branchId: 1,
    });
    await app.db
      .update(users)
      .set({ role: "coach" })
      .where(and(tenantWhere(users, TEMPLO_CTX), eq(users.email, coachEmail)));
    const coachToken = await getAuthToken(app, coachEmail, "coach12345");

    const { statusCode } = await patchSchedules(
      subId,
      { scheduleIds: newSlots },
      coachToken,
    );
    expect(statusCode).toBe(200);
  });

  // ── Multi-branch fixed anchors (Phase: feat/multi-branch-fixed-anchors) ──
  // A plan with multi_branch=1 lets the admin pick fixed anchors in any sede
  // of the same country as the subscription's anchor branch. Cross-country
  // anchors are always rejected. Plans without multi_branch keep the legacy
  // "all anchors must match the sub's branch" behavior.

  it("multi_branch plan: accepts anchors split across branches in the same country", async () => {
    // Create a second AR branch (sede secundaria) for the multi-branch case.
    const secondBranchId = await upsertBranch("Test Branch B", "TESTB", "AR");

    const plan = await createPlan(app, adminToken, {
      name: "Fixed Multi-Branch 2x",
      bookingMode: "fixed",
      classesPerWeek: 2,
      multiBranch: true,
      durationDays: 30,
    });
    const member = await createMember(app);

    // One anchor in branch 1 (Test Branch), one in branch 2 (Test Branch B).
    // Offsets stay small: createScheduleSlots derives `start_time = 8+offset+i`
    // and the column is varchar(5) — values >= 92 overflow.
    const slotsBranch1 = await createScheduleSlots(1, 1, 0);
    const slotsBranch2 = await createScheduleSlots(secondBranchId, 1, 1);
    const mixedSlots = [...slotsBranch1, ...slotsBranch2];

    const { statusCode, body } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      branchId: 1,
      startDate: todayStr(),
      scheduleIds: mixedSlots,
    });

    expect(statusCode).toBe(201);
    expect([...(body.scheduleIds as number[])].sort()).toEqual(
      [...mixedSlots].sort(),
    );
  });

  it("multi_branch plan: rejects anchors in a different country", async () => {
    // Spanish (ES) branch — cross-country must be rejected even for multi_branch.
    const esBranchId = await upsertBranch("Test Branch ES", "TESTES", "ES");

    const plan = await createPlan(app, adminToken, {
      name: "Fixed Multi-Branch X-Country 2x",
      bookingMode: "fixed",
      classesPerWeek: 2,
      multiBranch: true,
      durationDays: 30,
    });
    const member = await createMember(app);

    const slotsAR = await createScheduleSlots(1, 1, 0);
    const slotsES = await createScheduleSlots(esBranchId, 1, 1);
    const mixed = [...slotsAR, ...slotsES];

    const { statusCode, body } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      branchId: 1,
      startDate: todayStr(),
      scheduleIds: mixed,
    });

    expect(statusCode).toBe(400);
    expect(body.message).toMatch(/otro país|otro pais/);
  });

  it("non-multi_branch plan: rejects anchors in another sede (regression)", async () => {
    const secondBranchId = await upsertBranch("Test Branch C", "TESTC", "AR");

    const plan = await createPlan(app, adminToken, {
      name: "Fixed Single-Branch 2x",
      bookingMode: "fixed",
      classesPerWeek: 2,
      multiBranch: false,
      durationDays: 30,
    });
    const member = await createMember(app);

    const slotSubBranch = await createScheduleSlots(1, 1, 0);
    const slotOtherBranch = await createScheduleSlots(secondBranchId, 1, 1);

    const { statusCode, body } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      branchId: 1,
      startDate: todayStr(),
      scheduleIds: [...slotSubBranch, ...slotOtherBranch],
    });

    expect(statusCode).toBe(400);
    expect(body.message).toMatch(/no pertenece a la sucursal/);
  });

  it("changeFixedSchedules: multi_branch plan accepts cross-sede swap", async () => {
    const secondBranchId = await upsertBranch("Test Branch D", "TESTD", "AR");

    const plan = await createPlan(app, adminToken, {
      name: "Fixed Multi-Branch Swap 2x",
      bookingMode: "fixed",
      classesPerWeek: 2,
      multiBranch: true,
      durationDays: 30,
    });
    const member = await createMember(app);
    const initialSlots = await createScheduleSlots(1, 2, 0);
    const { body: assignBody } = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      branchId: 1,
      startDate: todayStr(),
      scheduleIds: initialSlots,
    });
    const subId = assignBody.id as number;

    // Swap to a new pair: one in branch 1, one in branch D — different days
    // from the initial pair (offset 2,3 vs 0,1) so the swap actually changes.
    const newSlotBranch1 = await createScheduleSlots(1, 1, 2);
    const newSlotBranchD = await createScheduleSlots(secondBranchId, 1, 3);
    const mixedNew = [...newSlotBranch1, ...newSlotBranchD];

    const { statusCode, body } = await patchSchedules(subId, {
      scheduleIds: mixedNew,
    });

    expect(statusCode).toBe(200);
    expect([...(body.scheduleIds as number[])].sort()).toEqual(
      [...mixedNew].sort(),
    );
  });
});
