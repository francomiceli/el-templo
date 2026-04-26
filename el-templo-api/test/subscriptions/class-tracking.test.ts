import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createTestApp, getAuthToken, cleanAllTestData } from "../helpers";
import { activities } from "../../src/db/schema/activities";
import { schedules } from "../../src/db/schema/schedules";
import { subscriptionSchedules } from "../../src/db/schema/subscription-schedules";
import {
  SUBSCRIPTIONS_URL,
  createPlan,
  createMember,
  assignPlan,
  todayStr,
} from "./_helpers";

describe("Subscriptions API — Class tracking + fixed slots", () => {
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

  describe("Budget calculation", () => {
    it("calculates classesRemaining from classesPerWeek and durationDays", async () => {
      // ceil(30/7)*2 = 5*2 = 10
      const plan = await createPlan(app, adminToken, {
        name: "Flex 2x",
        classesPerWeek: 2,
        durationDays: 30,
      });
      const member = await createMember(app);

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          startDate: todayStr(),
        },
      );

      expect(statusCode).toBe(201);
      expect(body.classesRemaining).toBe(10);
    });

    it("sets classesRemaining to null when plan has no classesPerWeek", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Open Plan",
        classesPerWeek: undefined,
        durationDays: 30,
      });
      const member = await createMember(app);

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          startDate: todayStr(),
        },
      );

      expect(statusCode).toBe(201);
      expect(body.classesRemaining).toBeNull();
    });

    it("GET class-usage returns weekly usage info", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Flex Usage Test",
        classesPerWeek: 3,
        durationDays: 30,
      });
      const member = await createMember(app);
      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
      });

      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/class-usage`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.classesUsedThisWeek).toBe(0);
      expect(body.weeklyLimit).toBe(3);
      expect(body.bookingMode).toBe("flexible");
      expect(body).toHaveProperty("classesRemaining");
    });
  });

  describe("Fixed schedule slots", () => {
    async function createScheduleSlots(
      branchId: number,
      count: number,
    ): Promise<number[]> {
      await app.db.insert(activities).values({
        name: "Calistenia Test",
        isActive: true,
      });
      const [activityRow] = await app.db
        .select({ id: activities.id })
        .from(activities)
        .limit(1);

      const ids: number[] = [];
      for (let i = 0; i < count; i++) {
        const dayOfWeek = (i % 5) + 1;
        const startTime = `${String(8 + i).padStart(2, "0")}:00`;
        const endTime = `${String(9 + i).padStart(2, "0")}:00`;
        const result = await app.db.insert(schedules).values({
          branchId,
          activityId: activityRow.id,
          dayOfWeek,
          startTime,
          endTime,
          isActive: true,
        });
        ids.push(Number(result[0].insertId));
      }
      return ids;
    }

    it("inserts subscription_schedules rows on assign with fixed plan", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Fixed 3x",
        bookingMode: "fixed",
        classesPerWeek: 3,
        durationDays: 30,
      });
      const member = await createMember(app);
      const slotIds = await createScheduleSlots(1, 3);

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          startDate: todayStr(),
          scheduleIds: slotIds,
        },
      );

      expect(statusCode).toBe(201);
      const rows = await app.db
        .select()
        .from(subscriptionSchedules)
        .where(eq(subscriptionSchedules.subscriptionId, body.id as number));
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.scheduleId).sort()).toEqual([...slotIds].sort());
    });

    it("rejects when scheduleIds count does not match classesPerWeek", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Fixed 3x Mismatch",
        bookingMode: "fixed",
        classesPerWeek: 3,
        durationDays: 30,
      });
      const member = await createMember(app);
      const slotIds = await createScheduleSlots(1, 2);

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          startDate: todayStr(),
          scheduleIds: slotIds,
        },
      );

      expect(statusCode).toBe(400);
      expect(body.message).toContain("classesPerWeek");
    });

    it("rejects inactive scheduleId", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Fixed Invalid Schedule",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
      });
      const member = await createMember(app);
      const slotIds = await createScheduleSlots(1, 2);

      await app.db
        .update(schedules)
        .set({ isActive: false })
        .where(eq(schedules.id, slotIds[0]));

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          startDate: todayStr(),
          scheduleIds: slotIds,
        },
      );

      expect(statusCode).toBe(400);
      expect(body.message).toContain("inactiv");
    });

    it("rejects fixed plan without scheduleIds", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Fixed No Ids",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
      });
      const member = await createMember(app);

      const { statusCode, body } = await assignPlan(
        app,
        adminToken,
        member.id,
        {
          planId: plan.id,
          startDate: todayStr(),
        },
      );

      expect(statusCode).toBe(400);
      expect(body.message).toContain("scheduleIds");
    });

    it("GET subscription returns scheduleIds for fixed-plan subs", async () => {
      const plan = await createPlan(app, adminToken, {
        name: "Fixed Detail",
        bookingMode: "fixed",
        classesPerWeek: 2,
        durationDays: 30,
      });
      const member = await createMember(app);
      const slotIds = await createScheduleSlots(1, 2);

      await assignPlan(app, adminToken, member.id, {
        planId: plan.id,
        startDate: todayStr(),
        scheduleIds: slotIds,
      });

      const res = await app.inject({
        method: "GET",
        url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.scheduleIds).toBeDefined();
      expect(body.scheduleIds).toHaveLength(2);
      expect(body.scheduleIds.sort()).toEqual([...slotIds].sort());
    });
  });
});
