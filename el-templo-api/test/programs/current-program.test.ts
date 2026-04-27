/**
 * Phase 104 R6 — Current Program endpoint
 *
 * Integration tests for the read/write pointer endpoints + the active
 * enrollments listing that the Plan 05 selector consumes:
 *
 *   GET  /api/members/me/current-program
 *   PUT  /api/members/me/current-program        body: { enrollmentId: number | null }
 *   GET  /api/members/me/enrollments
 *
 * Acceptance cases (per 104-04-PLAN.md):
 *   1.  GET initial — null/null
 *   2.  PUT valid own enrollment — 200, persists pointer, GET reflects it
 *   3.  PUT another user's enrollment — 403
 *   4.  PUT non-active enrollment — 403
 *   5a. PUT null without presencial — 403
 *   5b. PUT null with presencial — 200, NULL persisted in DB
 *   6.  PUT additionalProperties — 400 (Fastify schema enforcement)
 *   7.  GET /enrollments — active only, id ASC, full EnrollmentSummary shape
 *   8.  GET /enrollments — empty array for user with no enrollments
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
import { users } from "../../src/db/schema/users";
import { programs } from "../../src/db/schema/micro-programs";
import { programEnrollments } from "../../src/db/schema/program-enrollments";

// =============================================================================
// Local fixture helpers
// =============================================================================

const SUBSCRIPTIONS_ADMIN_URL = "/api/admin/subscriptions";

async function createPresencialPlan(
  app: FastifyInstance,
  adminToken: string,
  name: string,
): Promise<number> {
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_ADMIN_URL}/plans`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      name,
      planTier: "flex",
      bookingMode: "flexible",
      planCategory: "presencial",
      priceRegular: 15000,
      priceZero: 10000,
      durationDays: 30,
      classesPerWeek: 3,
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(
      `createPresencialPlan failed: ${res.statusCode} ${res.body}`,
    );
  }
  return (JSON.parse(res.body) as { id: number }).id;
}

async function assignPresencialPlan(
  app: FastifyInstance,
  adminToken: string,
  userId: number,
  planId: number,
): Promise<void> {
  const todayStr = new Date().toISOString().split("T")[0];
  const res = await app.inject({
    method: "POST",
    url: `${SUBSCRIPTIONS_ADMIN_URL}/members/${userId}/subscription/assign`,
    headers: { authorization: `Bearer ${adminToken}` },
    payload: {
      planId,
      branchId: 1,
      startDate: todayStr,
      priceTypeApplied: "regular",
      paymentMethod: "cash",
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(
      `assignPresencialPlan failed: ${res.statusCode} ${res.body}`,
    );
  }
}

async function createProgram(
  app: FastifyInstance,
  name: string,
  goalPlanType: string | null = null,
  durationWeeks: number | null = 4,
): Promise<number> {
  const result = await app.db.insert(programs).values({
    name,
    description: `Program ${name}`,
    durationWeeks,
    sessionsPerWeekToAdvance: 3,
    goalPlanType,
    auraWeeklyBonus: 15,
    auraCompletionBonus: 100,
    isActive: true,
  });
  return Number(result[0].insertId);
}

async function createEnrollment(
  app: FastifyInstance,
  userId: number,
  programId: number,
  status: "active" | "cancelled" | "completed" | "expired" = "active",
  currentWeek = 1,
): Promise<number> {
  const result = await app.db.insert(programEnrollments).values({
    userId,
    programId,
    status,
    currentWeek,
    sessionsCompletedThisWeek: 0,
  });
  return Number(result[0].insertId);
}

// =============================================================================
// Test suite
// =============================================================================

describe("Current Program endpoint (Phase 104 R6)", () => {
  let app: FastifyInstance;
  let adminToken: string;

  // Per-test fixtures (re-created in beforeEach)
  let memberAToken: string;
  let memberAId: number;
  let memberBToken: string;
  let memberBId: number;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTestData(app);
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    const ts = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const memberA = await registerUser(app, {
      email: `mem-a-${ts}@test.com`,
      password: "pass123456",
      branchId: 1,
    });
    memberAToken = memberA.token;
    memberAId = (memberA.user as { id: number }).id;

    const memberB = await registerUser(app, {
      email: `mem-b-${ts}@test.com`,
      password: "pass123456",
      branchId: 1,
    });
    memberBToken = memberB.token;
    memberBId = (memberB.user as { id: number }).id;
  });

  // ---------------------------------------------------------------------------
  // 1. GET initial state
  // ---------------------------------------------------------------------------
  it("GET returns { enrollmentId: null, program: null } when pointer is unset", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/members/me/current-program",
      headers: { authorization: `Bearer ${memberAToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      enrollmentId: null,
      program: null,
    });
  });

  // ---------------------------------------------------------------------------
  // 2. PUT a valid own enrollment + GET round-trip
  // ---------------------------------------------------------------------------
  it("PUT a valid own active enrollment persists the pointer and GET reflects it", async () => {
    const programId = await createProgram(app, "Calistenia Base");
    const enrollmentId = await createEnrollment(app, memberAId, programId);

    const putRes = await app.inject({
      method: "PUT",
      url: "/api/members/me/current-program",
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { enrollmentId },
    });
    expect(putRes.statusCode).toBe(200);
    const putBody = JSON.parse(putRes.body);
    expect(putBody.enrollmentId).toBe(enrollmentId);
    expect(putBody.program).toMatchObject({
      id: programId,
      name: "Calistenia Base",
      currentWeek: 1,
      durationWeeks: 4,
    });

    const getRes = await app.inject({
      method: "GET",
      url: "/api/members/me/current-program",
      headers: { authorization: `Bearer ${memberAToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body)).toEqual(putBody);

    // DB-level confirmation that the pointer was persisted.
    const [row] = await app.db
      .select({ id: users.currentProgramEnrollmentId })
      .from(users)
      .where(eq(users.id, memberAId));
    expect(row.id).toBe(enrollmentId);
  });

  // ---------------------------------------------------------------------------
  // 3. PUT another user's enrollment → 403
  // ---------------------------------------------------------------------------
  it("PUT another user's enrollmentId returns 403 with the shared not-found-or-unauthorized message", async () => {
    const programId = await createProgram(app, "Otro Programa");
    const enrollmentId = await createEnrollment(app, memberAId, programId);

    const res = await app.inject({
      method: "PUT",
      url: "/api/members/me/current-program",
      headers: { authorization: `Bearer ${memberBToken}` },
      payload: { enrollmentId },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/no encontrada o no autorizada/i);

    // The pointer for B must remain unset (defense-in-depth).
    const [row] = await app.db
      .select({ id: users.currentProgramEnrollmentId })
      .from(users)
      .where(eq(users.id, memberBId));
    expect(row.id).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 4. PUT a cancelled enrollment → 403
  // ---------------------------------------------------------------------------
  it("PUT a non-active (cancelled) enrollment returns 403 with the inactive-enrollment message", async () => {
    const programId = await createProgram(app, "Programa Cancelado");
    const enrollmentId = await createEnrollment(
      app,
      memberAId,
      programId,
      "cancelled",
    );

    const res = await app.inject({
      method: "PUT",
      url: "/api/members/me/current-program",
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { enrollmentId },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/no esta activa/i);
  });

  // ---------------------------------------------------------------------------
  // 5a. PUT null without presencial → 403
  // ---------------------------------------------------------------------------
  it("PUT null returns 403 when the user has no active presencial subscription", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/me/current-program",
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { enrollmentId: null },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/plan presencial/i);
  });

  // ---------------------------------------------------------------------------
  // 5b. PUT null WITH presencial → 200, NULL persisted
  // ---------------------------------------------------------------------------
  it("PUT null returns 200 and persists NULL when the user has an active presencial subscription", async () => {
    // Give member A a presencial plan first.
    const planId = await createPresencialPlan(
      app,
      adminToken,
      `Presencial ${Date.now()}`,
    );
    await assignPresencialPlan(app, adminToken, memberAId, planId);

    // Pre-populate the pointer with a valid enrollment so we can prove the
    // PUT actually clears it (vs. leaving an existing null untouched).
    const programId = await createProgram(app, "Pre-pointer Program");
    const enrollmentId = await createEnrollment(app, memberAId, programId);
    await app.db
      .update(users)
      .set({ currentProgramEnrollmentId: enrollmentId })
      .where(eq(users.id, memberAId));

    const res = await app.inject({
      method: "PUT",
      url: "/api/members/me/current-program",
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { enrollmentId: null },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      enrollmentId: null,
      program: null,
    });

    // DB-level confirmation: pointer is NULL.
    const [row] = await app.db
      .select({ id: users.currentProgramEnrollmentId })
      .from(users)
      .where(eq(users.id, memberAId));
    expect(row.id).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 6. PUT body schema enforcement
  //
  // Note: `additionalProperties: false` under Fastify's default AJV config
  // STRIPS extra properties silently rather than rejecting them (verified
  // project-wide — see test/scheduling/trials.test.ts:1116). We instead
  // exercise schema enforcement via wrong types (string instead of int|null),
  // which the validator MUST reject with 400 before reaching the handler.
  // ---------------------------------------------------------------------------
  it("PUT with a wrong-typed enrollmentId is rejected by the body schema (400)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/members/me/current-program",
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { enrollmentId: "not-a-number" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT silently strips extra properties (Fastify default Ajv behavior) and still applies the valid enrollmentId", async () => {
    const programId = await createProgram(app, "Programa Strip");
    const enrollmentId = await createEnrollment(app, memberAId, programId);

    const res = await app.inject({
      method: "PUT",
      url: "/api/members/me/current-program",
      headers: { authorization: `Bearer ${memberAToken}` },
      payload: { enrollmentId, garbage: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).enrollmentId).toBe(enrollmentId);
  });

  // ---------------------------------------------------------------------------
  // 7. GET /enrollments — lists active enrollments only, id ASC
  // ---------------------------------------------------------------------------
  it("GET /enrollments lists active enrollments id ASC and excludes cancelled rows", async () => {
    const p1 = await createProgram(app, "Programa Uno", "tren_superior", 4);
    const p2 = await createProgram(app, "Programa Dos", null, 6);
    const p3 = await createProgram(app, "Programa Tres", "empuje", 8);

    const e1 = await createEnrollment(app, memberAId, p1, "active", 2);
    const e2 = await createEnrollment(app, memberAId, p2, "active", 1);
    const eCancelled = await createEnrollment(
      app,
      memberAId,
      p3,
      "cancelled",
      3,
    );
    expect(eCancelled).toBeGreaterThan(0); // sanity: row exists and is excluded

    const res = await app.inject({
      method: "GET",
      url: "/api/members/me/enrollments",
      headers: { authorization: `Bearer ${memberAToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      enrollments: Array<{
        id: number;
        programId: number;
        programName: string;
        goalPlanType: string | null;
        currentWeek: number;
        durationWeeks: number | null;
      }>;
    };
    expect(body.enrollments).toHaveLength(2);
    expect(body.enrollments[0].id).toBe(e1);
    expect(body.enrollments[1].id).toBe(e2);
    // First row shape — every required key present.
    expect(body.enrollments[0]).toEqual({
      id: e1,
      programId: p1,
      programName: "Programa Uno",
      goalPlanType: "tren_superior",
      currentWeek: 2,
      durationWeeks: 4,
    });
    // Second row shape — null goalPlanType handled correctly.
    expect(body.enrollments[1]).toEqual({
      id: e2,
      programId: p2,
      programName: "Programa Dos",
      goalPlanType: null,
      currentWeek: 1,
      durationWeeks: 6,
    });
  });

  // ---------------------------------------------------------------------------
  // 8. GET /enrollments — empty array for user with no enrollments
  // ---------------------------------------------------------------------------
  it("GET /enrollments returns { enrollments: [] } for a user with no enrollments", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/members/me/enrollments",
      headers: { authorization: `Bearer ${memberBToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ enrollments: [] });
  });
});
