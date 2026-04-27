import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import {
  createTestApp,
  cleanAllTestData,
  createTestMember,
  todayStr,
} from "../helpers";

/**
 * Phase 104 Plan 03: gating + view resolution tests for /api/sessions/*.
 *
 * Covers SPEC R7 (4 cases) + R8 (default view resolution) + a /daily smoke.
 *
 * The tests intentionally bypass the assignPlan service path to keep setup
 * isolated to the gating behavior we're proving — direct DB inserts give
 * full control over plan category, enrollment status, and the
 * `users.current_program_enrollment_id` pointer.
 */

// Pick dates that fall on weekdays in the SPOM week 1 frame
// (WEEK_ONE_MONDAY = 2026-02-23). Tuesday 2026-02-24 → W1, Tuesday → martes.
const WEEK_START_MONDAY = "2026-02-23";
const WEEKDAY_DATE = "2026-02-24"; // martes, week 1

// Helper: insert a subscription_plans row, return id.
async function insertPlan(
  app: FastifyInstance,
  overrides: Partial<{
    name: string;
    planCategory:
      | "presencial"
      | "online_regular"
      | "online_goal"
      | "online_coach";
    planTier: "flex" | "foundation" | "performance" | "other";
    bookingMode: "fixed" | "flexible";
    priceRegular: number;
    priceZero: number;
    durationDays: number;
  }> = {},
): Promise<number> {
  const [row] = await app.db
    .insert(schema.subscriptionPlans)
    .values({
      name: overrides.name ?? "Gating Test Plan",
      planTier: overrides.planTier ?? "flex",
      bookingMode: overrides.bookingMode ?? "flexible",
      planCategory: overrides.planCategory ?? "presencial",
      priceRegular: overrides.priceRegular ?? 15000,
      priceZero: overrides.priceZero ?? 10000,
      durationDays: overrides.durationDays ?? 30,
      classesPerWeek: 3,
    })
    .$returningId();
  return row.id;
}

// Helper: assign an active subscription to a user (direct insert).
async function insertActiveSubscription(
  app: FastifyInstance,
  userId: number,
  planId: number,
): Promise<number> {
  const [row] = await app.db
    .insert(schema.subscriptions)
    .values({
      userId,
      planId,
      branchId: 1,
      status: "active",
      startDate: todayStr(),
      pricePaid: 15000,
      priceTypeApplied: "regular",
    })
    .$returningId();
  return row.id;
}

// Helper: insert a program with an optional goalPlanType.
async function insertProgram(
  app: FastifyInstance,
  overrides: Partial<{
    name: string;
    goalPlanType: string | null;
    durationWeeks: number;
  }> = {},
): Promise<number> {
  const [row] = await app.db
    .insert(schema.programs)
    .values({
      name: overrides.name ?? `Test Program ${Date.now()}`,
      goalPlanType: overrides.goalPlanType ?? null,
      durationWeeks: overrides.durationWeeks ?? 4,
      isActive: true,
    })
    .$returningId();
  return row.id;
}

// Helper: insert an enrollment with a chosen status.
async function insertEnrollment(
  app: FastifyInstance,
  userId: number,
  programId: number,
  status: "active" | "completed" | "expired" | "cancelled" = "active",
): Promise<number> {
  const [row] = await app.db
    .insert(schema.programEnrollments)
    .values({
      userId,
      programId,
      status,
      currentWeek: 1,
      sessionsCompletedThisWeek: 0,
    })
    .$returningId();
  return row.id;
}

// Helper: set users.current_program_enrollment_id directly.
async function setCurrentProgramEnrollment(
  app: FastifyInstance,
  userId: number,
  enrollmentId: number | null,
): Promise<void> {
  await app.db
    .update(schema.users)
    .set({ currentProgramEnrollmentId: enrollmentId })
    .where(eq(schema.users.id, userId));
}

// Helper: insert a minimal approved session (just enough for getSessionByDayId
// to return a row — block content is not asserted in these tests).
async function insertApprovedSession(
  app: FastifyInstance,
  dayId: string,
  levelGroup: "alfa_delta" | "sigma" | "omega" = "alfa_delta",
): Promise<void> {
  // Idempotent: clean any leftover from prior run.
  await app.db.delete(schema.sessions).where(eq(schema.sessions.dayId, dayId));

  const parts = dayId.split("-");
  // For W1-martes-alfa: parts = ["W1","martes","alfa"]
  // For GP-piernas_gluteos-W1-martes-alfa: parts = ["GP","piernas_gluteos","W1","martes","alfa"]
  let week = 1;
  let day = "martes";
  if (parts[0].startsWith("W")) {
    week = Number(parts[0].slice(1));
    day = parts[1];
  } else if (parts[0] === "GP") {
    week = Number(parts[2].slice(1));
    day = parts[3];
  }

  await app.db.insert(schema.sessions).values({
    dayId,
    week,
    day,
    levelGroup,
    blockCount: 0,
    status: "approved",
    sessionMode: "regular",
  });
}

describe("Sessions gating (Phase 104 R7 + R8)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
  });

  // ============================================================
  // R7 — ownership gating
  // ============================================================

  it("R7 case 1: online-only user with ?view=templo returns 403 with Spanish message", async () => {
    const member = await createTestMember(app);
    const onlinePlan = await insertPlan(app, {
      name: "Online Regular",
      planCategory: "online_regular",
    });
    await insertActiveSubscription(app, member.id, onlinePlan);

    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${WEEK_START_MONDAY}&view=templo`,
      headers: { authorization: `Bearer ${member.token}` },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/plan presencial/i);
  });

  it("R7 case 2: user with no enrollment + ?view=program returns 404 with 'programa activo seleccionado'", async () => {
    const member = await createTestMember(app);
    // No enrollment, no current_program_enrollment_id pointer.

    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${WEEK_START_MONDAY}&view=program`,
      headers: { authorization: `Bearer ${member.token}` },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/programa activo seleccionado/i);
  });

  it("R7 case 3: presencial user with ?view=templo returns 200 with view='templo'", async () => {
    const member = await createTestMember(app);
    const presencial = await insertPlan(app, {
      name: "Presencial Test",
      planCategory: "presencial",
    });
    await insertActiveSubscription(app, member.id, presencial);

    // Seed an approved templo session for the date so we can also assert
    // that the resolved dayId is the W* form (not GP-*).
    await insertApprovedSession(app, "W1-martes-alfa");

    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${WEEK_START_MONDAY}&view=templo`,
      headers: { authorization: `Bearer ${member.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.view).toBe("templo");
    expect(body.sessions[WEEKDAY_DATE]).not.toBeNull();
    expect(body.sessions[WEEKDAY_DATE].dayId).toBe("W1-martes-alfa");
  });

  it("R7 case 4: user with active GP enrollment + currentProgramEnrollmentId + ?view=program returns 200 with GP-* dayIds", async () => {
    const member = await createTestMember(app);
    const program = await insertProgram(app, {
      name: "Piernas y Gluteos",
      goalPlanType: "piernas_gluteos",
    });
    const enrollmentId = await insertEnrollment(app, member.id, program);
    await setCurrentProgramEnrollment(app, member.id, enrollmentId);

    // Seed approved session at the GP-* dayId so the response shows the
    // resolved dayId came from the program branch.
    await insertApprovedSession(app, "GP-piernas_gluteos-W1-martes-alfa");

    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${WEEK_START_MONDAY}&view=program`,
      headers: { authorization: `Bearer ${member.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.view).toBe("program");
    expect(body.sessions[WEEKDAY_DATE]).not.toBeNull();
    expect(body.sessions[WEEKDAY_DATE].dayId).toBe(
      "GP-piernas_gluteos-W1-martes-alfa",
    );
  });

  // ============================================================
  // R8 — default view resolution (no ?view= param)
  // ============================================================

  it("R8 case 5: presencial only, currentProgramEnrollmentId=null, no view param → view='templo'", async () => {
    const member = await createTestMember(app);
    const presencial = await insertPlan(app, {
      name: "Presencial Default",
      planCategory: "presencial",
    });
    await insertActiveSubscription(app, member.id, presencial);

    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${WEEK_START_MONDAY}`,
      headers: { authorization: `Bearer ${member.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.view).toBe("templo");
  });

  it("R8 case 6: presencial + currentProgramEnrollmentId set → defaults to program view", async () => {
    const member = await createTestMember(app);
    const presencial = await insertPlan(app, {
      name: "Presencial + Program",
      planCategory: "presencial",
    });
    await insertActiveSubscription(app, member.id, presencial);
    const program = await insertProgram(app, {
      name: "Espalda Strong",
      goalPlanType: "espalda",
    });
    const enrollmentId = await insertEnrollment(app, member.id, program);
    await setCurrentProgramEnrollment(app, member.id, enrollmentId);

    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${WEEK_START_MONDAY}`,
      headers: { authorization: `Bearer ${member.token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.view).toBe("program");
  });

  it("R8 case 7: stale (cancelled) enrollment pointer + no presencial → 404 'No hay vista disponible'", async () => {
    const member = await createTestMember(app);
    const program = await insertProgram(app, { goalPlanType: "core" });
    const enrollmentId = await insertEnrollment(
      app,
      member.id,
      program,
      "cancelled",
    );
    // Pointer references a cancelled enrollment — should fall through to 404
    // (no presencial, no other active enrollments).
    await setCurrentProgramEnrollment(app, member.id, enrollmentId);

    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/weekly?weekStart=${WEEK_START_MONDAY}`,
      headers: { authorization: `Bearer ${member.token}` },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/no hay vista disponible/i);
  });

  // ============================================================
  // Daily-handler smoke
  // ============================================================

  it("daily smoke: online-only user with ?view=templo returns 403 from /api/sessions/daily too", async () => {
    const member = await createTestMember(app);
    const onlinePlan = await insertPlan(app, {
      name: "Online Regular Daily",
      planCategory: "online_regular",
    });
    await insertActiveSubscription(app, member.id, onlinePlan);

    const res = await app.inject({
      method: "GET",
      url: `/api/sessions/daily?date=${WEEKDAY_DATE}&view=templo`,
      headers: { authorization: `Bearer ${member.token}` },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/plan presencial/i);
  });
});
