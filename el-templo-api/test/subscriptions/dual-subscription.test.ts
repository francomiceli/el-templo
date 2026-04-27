import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
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
} from "./_helpers";

describe("Subscriptions API — Dual subscription + auto-enrollment", () => {
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
      description: overrides.description ?? "Test program for enrollment",
      durationWeeks: overrides.durationWeeks ?? 4,
      sessionsPerWeekToAdvance: overrides.sessionsPerWeekToAdvance ?? 3,
      ...overrides,
    });
    return Number(result[0].insertId);
  }

  it("allows presencial + online subscriptions simultaneously", async () => {
    const presencialPlan = await createPlan(app, adminToken, {
      name: "Plan Presencial Dual",
      planCategory: "presencial",
    });
    const onlineProgramId = await createTestProgram({
      name: "Online Dual Program",
    });
    const onlinePlan = await createPlan(app, adminToken, {
      name: "Plan Online Dual",
      planCategory: "online_regular",
      linkedProgramId: onlineProgramId,
    });
    const member = await createMember(app);

    const result1 = await assignPlan(app, adminToken, member.id, {
      planId: presencialPlan.id,
    });
    expect(result1.statusCode).toBe(201);

    const result2 = await assignPlan(app, adminToken, member.id, {
      planId: onlinePlan.id,
    });
    expect(result2.statusCode).toBe(201);

    const activeSubs = await app.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, member.id as number));
    const activeCount = activeSubs.filter((s) => s.status === "active").length;
    expect(activeCount).toBe(2);
  });

  it("blocks two presencial subscriptions", async () => {
    const plan1 = await createPlan(app, adminToken, {
      name: "Presencial A",
      planCategory: "presencial",
    });
    const plan2 = await createPlan(app, adminToken, {
      name: "Presencial B",
      planCategory: "presencial",
    });
    const member = await createMember(app);

    const result1 = await assignPlan(app, adminToken, member.id, {
      planId: plan1.id,
    });
    expect(result1.statusCode).toBe(201);

    const result2 = await assignPlan(app, adminToken, member.id, {
      planId: plan2.id,
    });
    expect(result2.statusCode).toBe(409);
    expect((result2.body as { message: string }).message).toContain(
      "presencial activa",
    );
  });

  it("blocks two online subscriptions", async () => {
    const program1Id = await createTestProgram({
      name: "Online Regular A Program",
    });
    const program2Id = await createTestProgram({
      name: "Online Goal B Program",
      goalPlanType: "tren_superior",
    });
    const plan1 = await createPlan(app, adminToken, {
      name: "Online Regular A",
      planCategory: "online_regular",
      linkedProgramId: program1Id,
    });
    const plan2 = await createPlan(app, adminToken, {
      name: "Online Goal B",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId: program2Id,
    });
    const member = await createMember(app);

    const result1 = await assignPlan(app, adminToken, member.id, {
      planId: plan1.id,
    });
    expect(result1.statusCode).toBe(201);

    const result2 = await assignPlan(app, adminToken, member.id, {
      planId: plan2.id,
    });
    expect(result2.statusCode).toBe(409);
    expect((result2.body as { message: string }).message).toContain(
      "online activa",
    );
  });

  it("auto-creates program enrollment when assigning plan with linkedProgramId", async () => {
    const programId = await createTestProgram({
      name: "Program Enrollment Test",
    });
    const plan = await createPlan(app, adminToken, {
      name: "Online With Program",
      planCategory: "online_goal",
      goalPlanType: "empuje",
      linkedProgramId: programId,
    });
    const member = await createMember(app);

    const result = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
    });
    expect(result.statusCode).toBe(201);

    const enrollments = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].programId).toBe(programId);
    expect(enrollments[0].status).toBe("active");
    expect(enrollments[0].currentWeek).toBe(1);
    expect(enrollments[0].sessionsCompletedThisWeek).toBe(0);
  });

  it("plan change cancels old enrollment and creates new one", async () => {
    const programA = await createTestProgram({ name: "Program A" });
    const programB = await createTestProgram({ name: "Program B" });
    const planA = await createPlan(app, adminToken, {
      name: "Online Goal A",
      planCategory: "online_goal",
      goalPlanType: "tren_superior",
      linkedProgramId: programA,
      priceRegular: 10000,
      priceZero: 8000,
    });
    const planB = await createPlan(app, adminToken, {
      name: "Online Goal B",
      planCategory: "online_goal",
      goalPlanType: "tren_inferior",
      linkedProgramId: programB,
      priceRegular: 15000,
      priceZero: 10000,
    });
    const member = await createMember(app);

    await assignPlan(app, adminToken, member.id, { planId: planA.id });

    const changeRes = await app.inject({
      method: "POST",
      url: `${SUBSCRIPTIONS_URL}/members/${member.id}/subscription/change-plan`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        planId: planB.id,
        branchId: 1,
        startDate: todayStr(),
        priceTypeApplied: "regular",
        paymentMethod: "cash",
      },
    });
    expect(changeRes.statusCode).toBe(201);

    const enrollments = await app.db
      .select()
      .from(programEnrollments)
      .where(eq(programEnrollments.userId, member.id as number));

    expect(enrollments.length).toBeGreaterThanOrEqual(2);
    const enrollmentA = enrollments.find((e) => e.programId === programA);
    const enrollmentB = enrollments.find((e) => e.programId === programB);

    expect(enrollmentA?.status).toBe("cancelled");
    expect(enrollmentA?.cancelledAt).not.toBeNull();
    expect(enrollmentB?.status).toBe("active");
    expect(enrollmentB?.currentWeek).toBe(1);
  });

  it("price override still works with planCategory model", async () => {
    const plan = await createPlan(app, adminToken, {
      name: "Plan Override Test",
      planCategory: "presencial",
      priceRegular: 20000,
      priceZero: 15000,
    });
    const member = await createMember(app);

    const result = await assignPlan(app, adminToken, member.id, {
      planId: plan.id,
      priceOverrideAmount: 5000,
      priceOverrideReason: "Descuento especial por amigo",
    });

    expect(result.statusCode).toBe(201);
    expect(result.body.pricePaid).toBe(5000);
    expect(result.body.priceOverrideAmount).toBe(5000);
    expect(result.body.priceOverrideReason).toBe(
      "Descuento especial por amigo",
    );
  });
});
