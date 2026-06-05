/**
 * Phase 131 Plan 01 — Integration test for the in-session difficulty adjustment
 * endpoint (POST /api/exercise-adjustments) and ExerciseAdjustmentService.
 * Reworked for "Progresión por ruta + Habilidad". Runs against real MySQL
 * (eltemplo_test_<worker>), CI-only — do NOT run the suite locally (project
 * policy: local gate is tsc).
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
 *      authenticated user, even when a spoofed memberId/userId is sent in the body.
 *   5. FK invalid exercise: a non-existent exerciseId → getNeighbor null →
 *      graceful no-op (200, no 500, no orphan row).
 *   6. auth: no token → 401.
 *
 * Seeds the graph EDGES via the auto-backbone constructor (same as the Phase 126
 * primitive test) so getNeighbor resolves: a `routes` row (the constructor INNER-
 * JOINs it) + exercises with `progression_step`. Real clock. Cleans up only the
 * rows it seeds, in FK order (adjustments → edges → exercises → routes); the member
 * is registered via the auth API and removed by cleanAllTestData.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray, or, eq } from "drizzle-orm";
import { createTestApp, registerUser, cleanAllTestData } from "./helpers";
import * as schema from "../src/db/schema";
import { runRebuildProgressionGraph } from "../rebuild-progression-graph";

describe("POST /api/exercise-adjustments (progresión por ruta)", () => {
  let app: FastifyInstance;

  const MARK = `ADJUST_TEST_${Date.now()}`;
  // routes.code is varchar(20): a short prefix keeps `${PREFIX}${label}` in bounds.
  const PREFIX = `R${(Date.now() % 1e9).toString(36).toUpperCase()}`; // ≤ 7 chars
  const seededExerciseIds: number[] = [];
  const seededRouteCodes: string[] = [];
  const seededMemberIds: number[] = [];

  async function seedRoute(label: string): Promise<string> {
    const code = `${PREFIX}${label}`;
    await app.db.insert(schema.routes).values({ code });
    seededRouteCodes.push(code);
    return code;
  }

  async function seedExercise(opts: {
    name: string;
    effort: string;
    route: string;
    dl: number;
    progressionStep?: number | null;
    videoUrl?: string | null;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "test",
        category: "test",
        exercise: `${MARK}_${opts.name}`,
        effort: opts.effort,
        route: opts.route,
        progressionStep: opts.progressionStep ?? null,
        dificultadLineal: opts.dl,
        videoUrl: opts.videoUrl ?? null,
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
   * Seed a 3-node chain (low → mid → high) of the SAME effort on a fresh route and
   * build the auto backbone so getNeighbor resolves. Returns the three exercise ids.
   */
  async function seedChain(
    label: string,
    effort = "EXC",
  ): Promise<{ low: number; mid: number; high: number }> {
    const route = await seedRoute(label);
    const low = await seedExercise({
      name: `${label}_low`,
      effort,
      route,
      dl: 1,
      progressionStep: 1,
    });
    const mid = await seedExercise({
      name: `${label}_mid`,
      effort,
      route,
      dl: 3,
      progressionStep: 2,
    });
    const high = await seedExercise({
      name: `${label}_high`,
      effort,
      route,
      dl: 5,
      progressionStep: 3,
      // Seed a clip on the harder neighbor so the WR-03 contract (the response
      // carries the neighbor's videoUrl for the in-session swap) is asserted.
      videoUrl: `https://videos.test/${MARK}_${label}_high.mp4`,
    });
    await runRebuildProgressionGraph(app.db);
    return { low, mid, high };
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    // FK order: adjustments referencing seeded exercises/members first, then the
    // progression edges, then the exercises, then the routes. Members are removed
    // by cleanAllTestData at file scope.
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
    if (seededRouteCodes.length > 0) {
      await app.db
        .delete(schema.routes)
        .where(inArray(schema.routes.code, seededRouteCodes));
      seededRouteCodes.length = 0;
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
    // WR-03: the response carries the neighbor's clip URL so the player renders
    // the swapped exercise in-session without a re-fetch (no blank clip).
    expect(body.neighbor.videoUrl).toContain("_high.mp4");

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

    // Attacker tries to write a record as the victim by spoofing body ids.
    // Fastify runs with removeAdditional=true, so the unknown memberId/userId
    // props are STRIPPED (not rejected with 400) and the request SUCCEEDS.
    // The security property is that the handler scopes the write to
    // request.user.userId (the attacker), so the spoof can never touch the
    // victim — assert exactly that, not a 400.
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
    // Spoofed extra props are stripped; request succeeds like a clean one.
    expect(spoof.statusCode).toBe(200);
    expect(JSON.parse(spoof.body).neighbor.id).toBe(high);

    // The spoof must NOT have created a row owned by the victim, and the row
    // it did write must be owned by the ATTACKER (request.user.userId).
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
