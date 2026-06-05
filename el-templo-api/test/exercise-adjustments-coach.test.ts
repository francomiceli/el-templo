/**
 * Phase 131 Plan 02 — Integration test for the COACH read of a member's
 * dominado/bajado log: GET /api/admin/exercise-adjustments/:memberId. Runs
 * against real MySQL (eltemplo_test_<worker>), CI-only — do NOT run the suite
 * locally (project policy: local gate is tsc).
 *
 * Contracts under test (ADJUST-04, D-05, T-131-05):
 *   1. coach gets 200 with the member's records, newest first, with origin +
 *      served-neighbor names resolved.
 *   2. owner also gets 200 (TRAINING_ROLES = coach + owner).
 *   3. a MEMBER token gets 403 (elevation-of-privilege guard, T-131-05).
 *   4. no token → 401.
 *
 * Seeds exercise_adjustments rows directly (member_id + exercise_id +
 * to_exercise_id + status + created_at). Cleans up only the rows it seeds, in FK
 * order (adjustments → exercises → sub-families); users via cleanAllTestData.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray, eq } from "drizzle-orm";
import {
  createTestApp,
  registerUser,
  createStaffUser,
  getAuthToken,
  cleanAllTestData,
} from "./helpers";
import * as schema from "../src/db/schema";

describe("GET /api/admin/exercise-adjustments/:memberId (Phase 131 Plan 02)", () => {
  let app: FastifyInstance;

  const MARK = `ADJUST_COACH_${Date.now()}`;
  const seededExerciseIds: number[] = [];
  const seededSubfamilyIds: number[] = [];
  const seededMemberIds: number[] = [];

  async function seedSubfamily(name: string): Promise<number> {
    const [res] = await app.db
      .insert(schema.exerciseSubfamilies)
      .values({ route: "TEST", name: `${MARK}_${name}` })
      .$returningId();
    seededSubfamilyIds.push(res.id);
    return res.id;
  }

  async function seedExercise(name: string): Promise<number> {
    const sf = await seedSubfamily(name);
    const [res] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "test",
        category: "test",
        exercise: `${MARK}_${name}`,
        effort: "EXC",
        route: "TEST",
        subfamilyId: sf,
        dificultadLineal: 3,
      })
      .$returningId();
    seededExerciseIds.push(res.id);
    return res.id;
  }

  async function seedMember(): Promise<number> {
    const email = `adjcoach-m-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}@test.com`;
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: 1,
    });
    const id = (result.user as { id: number }).id;
    seededMemberIds.push(id);
    return id;
  }

  /** Member token (role='member'). */
  async function seedMemberWithToken(): Promise<{ id: number; token: string }> {
    const email = `adjcoach-mt-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}@test.com`;
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: 1,
    });
    const id = (result.user as { id: number }).id;
    seededMemberIds.push(id);
    return { id, token: result.token };
  }

  async function seedStaffToken(role: string): Promise<string> {
    const email = `adjcoach-${role}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}@test.com`;
    const id = await createStaffUser(app, {
      email,
      password: "pass123456",
      firstName: "Coach",
      lastName: "Test",
      role,
      branchId: 1,
    });
    seededMemberIds.push(id);
    return getAuthToken(app, email, "pass123456");
  }

  async function seedAdjustment(opts: {
    memberId: number;
    exerciseId: number;
    toExerciseId: number | null;
    status: "dominado" | "bajado";
    createdAt: Date;
  }): Promise<void> {
    await app.db.insert(schema.exerciseAdjustments).values({
      memberId: opts.memberId,
      exerciseId: opts.exerciseId,
      toExerciseId: opts.toExerciseId,
      status: opts.status,
      dayId: "W1-lunes-sigma",
      date: "2026-06-05",
      createdAt: opts.createdAt,
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    if (seededMemberIds.length > 0) {
      await app.db
        .delete(schema.exerciseAdjustments)
        .where(inArray(schema.exerciseAdjustments.memberId, seededMemberIds));
    }
    if (seededExerciseIds.length > 0) {
      await app.db
        .delete(schema.exercises)
        .where(inArray(schema.exercises.id, seededExerciseIds));
      seededExerciseIds.length = 0;
    }
    if (seededSubfamilyIds.length > 0) {
      await app.db
        .delete(schema.exerciseSubfamilies)
        .where(inArray(schema.exerciseSubfamilies.id, seededSubfamilyIds));
      seededSubfamilyIds.length = 0;
    }
    seededMemberIds.length = 0;
  });

  afterAll(async () => {
    await cleanAllTestData(app);
    await app.close();
  });

  it("1 — a coach gets the member's records newest first with resolved names", async () => {
    const member = await seedMember();
    const origin = await seedExercise("origin");
    const neighbor = await seedExercise("neighbor");

    // Two rows; the newer one must come first.
    await seedAdjustment({
      memberId: member,
      exerciseId: origin,
      toExerciseId: neighbor,
      status: "dominado",
      createdAt: new Date("2026-06-05T10:00:00Z"),
    });
    await seedAdjustment({
      memberId: member,
      exerciseId: origin,
      toExerciseId: neighbor,
      status: "bajado",
      createdAt: new Date("2026-06-05T12:00:00Z"),
    });

    const token = await seedStaffToken("coach");
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/exercise-adjustments/${member}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    // Newest first.
    expect(body[0].status).toBe("bajado");
    expect(body[1].status).toBe("dominado");
    // Names resolved via the joins.
    expect(body[0].exerciseId).toBe(origin);
    expect(body[0].exerciseName).toBe(`${MARK}_origin`);
    expect(body[0].toExerciseId).toBe(neighbor);
    expect(body[0].toExerciseName).toBe(`${MARK}_neighbor`);
  });

  it("2 — an owner also gets 200 (TRAINING_ROLES = coach + owner)", async () => {
    const member = await seedMember();
    const origin = await seedExercise("o2");
    await seedAdjustment({
      memberId: member,
      exerciseId: origin,
      toExerciseId: null,
      status: "dominado",
      createdAt: new Date("2026-06-05T10:00:00Z"),
    });

    const token = await seedStaffToken("owner");
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/exercise-adjustments/${member}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(1);
  });

  it("3 — a member token is rejected with 403 (T-131-05)", async () => {
    const target = await seedMember();
    const attacker = await seedMemberWithToken();

    const res = await app.inject({
      method: "GET",
      url: `/api/admin/exercise-adjustments/${target}`,
      headers: { authorization: `Bearer ${attacker.token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it("4 — without a token the endpoint returns 401", async () => {
    const target = await seedMember();
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/exercise-adjustments/${target}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("5 — an empty log returns an empty array (200)", async () => {
    const member = await seedMember();
    // Sanity: no adjustment rows seeded for this member.
    const existing = await app.db
      .select()
      .from(schema.exerciseAdjustments)
      .where(eq(schema.exerciseAdjustments.memberId, member));
    expect(existing).toHaveLength(0);

    const token = await seedStaffToken("coach");
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/exercise-adjustments/${member}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });
});
