/**
 * Phase 131 Plan 01 — Integration test for the in-session difficulty adjustment
 * endpoint (POST /api/exercise-adjustments) and ExerciseAdjustmentService. Runs
 * against real MySQL (eltemplo_test_<worker>), CI-only — do NOT run the suite
 * locally (project policy: local gate is tsc).
 *
 * Contracts under test (ADJUST-01/02/03, D-02/D-03/D-04/D-06):
 *   1. swap up → dominado: a member with a harder neighbor POSTs direction='up'
 *      → 200 with the neighbor; a row exists with status='dominado',
 *      exercise_id=origin, to_exercise_id=neighbor, member_id=auth user.
 *   2. swap down → bajado: direction='down' with an easier neighbor → 200 with
 *      the neighbor; row status='bajado'.
 *   3. chain end → null: a tap at the end of the chain (getNeighbor null) → 200
 *      with { neighbor: null, message }; NO row inserted.
 *   4. member-scope (T-131-01, D-04): the persisted member_id is ALWAYS the
 *      authenticated user, even when a spoofed memberId/userId is sent in the
 *      body (rejected by additionalProperties:false; the row's member_id is the
 *      token user regardless).
 *   5. FK invalid exercise: a non-existent exerciseId → getNeighbor null →
 *      graceful no-op (200, no 500, no orphan row).
 *   6. auth: no token → 401.
 *
 * Seeds the graph EDGES via the auto-backbone constructor (same as the Phase 126
 * primitive test) so getNeighbor resolves. Real clock. Cleans up only the rows
 * it seeds, in FK order (adjustments → edges → exercises → sub-families); the
 * member is registered via the auth API and removed by cleanAllTestData.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray, or, eq } from "drizzle-orm";
import { createTestApp, registerUser, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";
import { runRebuildProgressionGraph } from "../rebuild-progression-graph";

describe("POST /api/exercise-adjustments (Phase 131 Plan 01)", () => {
  let app: FastifyInstance;

  const MARK = `ADJUST_TEST_${Date.now()}`;
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

  async function seedExercise(opts: {
    name: string;
    effort: string;
    subfamilyId: number | null;
    dl: number;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "test",
        category: "test",
        exercise: `${MARK}_${opts.name}`,
        effort: opts.effort,
        route: "TEST",
        subfamilyId: opts.subfamilyId,
        dificultadLineal: opts.dl,
      })
      .$returningId();
    seededExerciseIds.push(res.id);
    return res.id;
  }

  /** Register a member via the auth API and return id + token. */
  async function seedMember(): Promise<{ id: number; token: string }> {
    const email = `adjust-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}@test.com`;
    const result = await registerUser(app, {
      email,
      password: "pass123456",
      branchId: 1,
    });
    const user = result.user as { id: number };
    seededMemberIds.push(user.id);
    return { id: user.id, token: result.token };
  }

  /**
   * Seed a 3-node chain (low → mid → high) of the SAME effort in a fresh
   * sub-family and build the auto backbone so getNeighbor resolves. Returns the
   * three exercise ids.
   */
  async function seedChain(
    label: string,
    effort = "EXC",
  ): Promise<{ low: number; mid: number; high: number }> {
    const sf = await seedSubfamily(label);
    const low = await seedExercise({
      name: `${label}_low`,
      effort,
      subfamilyId: sf,
      dl: 1,
    });
    const mid = await seedExercise({
      name: `${label}_mid`,
      effort,
      subfamilyId: sf,
      dl: 3,
    });
    const high = await seedExercise({
      name: `${label}_high`,
      effort,
      subfamilyId: sf,
      dl: 5,
    });
    await runRebuildProgressionGraph(app.db);
    return { low, mid, high };
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    // FK order: adjustments referencing seeded exercises/members first, then the
    // progression edges, then the exercises, then the sub-families. Members are
    // removed by cleanAllTestData at file scope.
    if (seededExerciseIds.length > 0 || seededMemberIds.length > 0) {
      if (seededMemberIds.length > 0) {
        await app.db
          .delete(schema.exerciseAdjustments)
          .where(inArray(schema.exerciseAdjustments.memberId, seededMemberIds));
      }
      if (seededExerciseIds.length > 0) {
        await app.db
          .delete(schema.exerciseAdjustments)
          .where(
            inArray(schema.exerciseAdjustments.exerciseId, seededExerciseIds),
          );
        await app.db
          .delete(schema.exerciseProgressions)
          .where(
            or(
              inArray(
                schema.exerciseProgressions.fromExerciseId,
                seededExerciseIds,
              ),
              inArray(
                schema.exerciseProgressions.toExerciseId,
                seededExerciseIds,
              ),
            ),
          );
        await app.db
          .delete(schema.exercises)
          .where(inArray(schema.exercises.id, seededExerciseIds));
        seededExerciseIds.length = 0;
      }
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

  it("1 — swap up records the origin as dominado and returns the harder neighbor", async () => {
    const { mid, high } = await seedChain("A");
    const member = await seedMember();

    const res = await app.inject({
      method: "POST",
      url: "/api/exercise-adjustments",
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        exerciseId: mid,
        direction: "up",
        dayId: "W1-lunes-sigma",
        date: "2026-06-05",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBeNull();
    expect(body.neighbor).not.toBeNull();
    expect(body.neighbor.id).toBe(high);

    const rows = await app.db
      .select()
      .from(schema.exerciseAdjustments)
      .where(eq(schema.exerciseAdjustments.memberId, member.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].exerciseId).toBe(mid);
    expect(rows[0].toExerciseId).toBe(high);
    expect(rows[0].status).toBe("dominado");
    expect(rows[0].memberId).toBe(member.id);
  });

  it("2 — swap down records the origin as bajado and returns the easier neighbor", async () => {
    const { low, mid } = await seedChain("B");
    const member = await seedMember();

    const res = await app.inject({
      method: "POST",
      url: "/api/exercise-adjustments",
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        exerciseId: mid,
        direction: "down",
        dayId: "W1-lunes-sigma",
        date: "2026-06-05",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBeNull();
    expect(body.neighbor.id).toBe(low);

    const rows = await app.db
      .select()
      .from(schema.exerciseAdjustments)
      .where(eq(schema.exerciseAdjustments.memberId, member.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("bajado");
    expect(rows[0].toExerciseId).toBe(low);
  });

  it("3 — a tap at the end of the chain is a graceful no-op (null neighbor, no row)", async () => {
    const { high } = await seedChain("C");
    const member = await seedMember();

    // `high` has no harder neighbor → getNeighbor('up') is null.
    const res = await app.inject({
      method: "POST",
      url: "/api/exercise-adjustments",
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        exerciseId: high,
        direction: "up",
        dayId: "W1-lunes-sigma",
        date: "2026-06-05",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.neighbor).toBeNull();
    expect(typeof body.message).toBe("string");
    expect(body.message.length).toBeGreaterThan(0);

    const rows = await app.db
      .select()
      .from(schema.exerciseAdjustments)
      .where(eq(schema.exerciseAdjustments.memberId, member.id));
    expect(rows).toHaveLength(0);
  });

  it("4 — member-scope: the row's member_id is always the authenticated user", async () => {
    const { mid, high } = await seedChain("D");
    const victim = await seedMember();
    const attacker = await seedMember();

    // Attacker tries to write a record as the victim by spoofing a body id.
    // additionalProperties:false rejects the unknown field; even so the handler
    // would ignore it. Assert the schema rejects it AND no victim row appears.
    const spoof = await app.inject({
      method: "POST",
      url: "/api/exercise-adjustments",
      headers: { authorization: `Bearer ${attacker.token}` },
      payload: {
        exerciseId: mid,
        direction: "up",
        dayId: "W1-lunes-sigma",
        date: "2026-06-05",
        memberId: victim.id,
        userId: victim.id,
      },
    });
    expect(spoof.statusCode).toBe(400); // unknown property rejected by schema

    // A clean request from the attacker writes a row owned by the ATTACKER.
    const clean = await app.inject({
      method: "POST",
      url: "/api/exercise-adjustments",
      headers: { authorization: `Bearer ${attacker.token}` },
      payload: {
        exerciseId: mid,
        direction: "up",
        dayId: "W1-lunes-sigma",
        date: "2026-06-05",
      },
    });
    expect(clean.statusCode).toBe(200);
    expect(JSON.parse(clean.body).neighbor.id).toBe(high);

    const victimRows = await app.db
      .select()
      .from(schema.exerciseAdjustments)
      .where(eq(schema.exerciseAdjustments.memberId, victim.id));
    expect(victimRows).toHaveLength(0);

    const attackerRows = await app.db
      .select()
      .from(schema.exerciseAdjustments)
      .where(eq(schema.exerciseAdjustments.memberId, attacker.id));
    expect(attackerRows).toHaveLength(1);
    expect(attackerRows[0].memberId).toBe(attacker.id);
  });

  it("5 — a non-existent exerciseId is a graceful no-op (no 500, no orphan row)", async () => {
    const member = await seedMember();
    // An id that cannot exist (well above any seeded autoincrement value).
    const bogusExerciseId = 2_000_000_000;

    const res = await app.inject({
      method: "POST",
      url: "/api/exercise-adjustments",
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        exerciseId: bogusExerciseId,
        direction: "up",
        dayId: "W1-lunes-sigma",
        date: "2026-06-05",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).neighbor).toBeNull();

    const rows = await app.db
      .select()
      .from(schema.exerciseAdjustments)
      .where(eq(schema.exerciseAdjustments.memberId, member.id));
    expect(rows).toHaveLength(0);
  });

  it("6 — without a token the endpoint returns 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/exercise-adjustments",
      payload: {
        exerciseId: 1,
        direction: "up",
        dayId: "W1-lunes-sigma",
        date: "2026-06-05",
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
