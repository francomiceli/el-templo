import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
} from "../helpers";
import { activities } from "../../src/db/schema/activities";
import { schedules } from "../../src/db/schema/schedules";
import { bookings } from "../../src/db/schema/bookings";
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";
import { users } from "../../src/db/schema/users";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
} from "./_helpers";

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

  it("rejects when sub is paused", async () => {
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
    expect(statusCode).toBe(400);
    expect(body.message).toContain("activa");
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
      .where(eq(users.email, coachEmail));
    const coachToken = await getAuthToken(app, coachEmail, "coach12345");

    const { statusCode } = await patchSchedules(
      subId,
      { scheduleIds: newSlots },
      coachToken,
    );
    expect(statusCode).toBe(200);
  });
});
