/**
 * Phase 124 Plan 02 — Integration test for the exercise-catalog saneo
 * (`saneo-exercises.ts`). Runs against real MySQL (eltemplo_test_<worker>),
 * CI-only — do NOT run the suite locally (project policy: local gate is tsc).
 *
 * Contract under test (D-06/D-07/D-08/D-11/D-12):
 *   A. Soft-merge exact dupe: two rows with identical
 *      exercise+dificultad_lineal+route+effort collapse to a canonical pointer
 *      (the higher id points at MIN(id); the canonical's pointer stays NULL).
 *      BOTH rows still exist — zero deletes.
 *   B. Distinct step is NOT a dupe (D-06): same exercise+route+effort but a
 *      different dificultad_lineal → neither row gets a canonical pointer.
 *   C. Route marking (D-08): empty/placeholder route → route_pending = 1; a
 *      valid route stays route_pending = 0. The `route` column is never written.
 *   D. Idempotency (D-12): a second run mutates nothing already written (guards
 *      canonical_exercise_id IS NULL / route_pending = 0).
 *   E. FKs intact: the exercises row count is identical before and after.
 *
 * Seeds exercises directly via Drizzle (NOT via API). Real clock (fake timers
 * desync from MySQL). Cleans up only the rows it seeds, in afterEach.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { runSaneo } from "../../saneo-exercises";

describe("saneo-exercises (Phase 124 Plan 02)", () => {
  let app: FastifyInstance;

  // Unique marker so the test only ever touches and cleans its own rows even
  // if a real catalog is present in the per-worker DB.
  const MARK = `SANEO_TEST_${Date.now()}`;
  const seededIds: number[] = [];

  /**
   * Insert one exercise, fill the NOT NULL columns, and track its id for
   * cleanup. `name` carries the MARK so dupe-grouping stays scoped to the test.
   */
  async function seedExercise(opts: {
    name: string;
    route: string;
    effort: string;
    dificultadLineal: number;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "test",
        category: "test",
        exercise: opts.name,
        effort: opts.effort,
        route: opts.route,
        dificultadLineal: opts.dificultadLineal,
      })
      .$returningId();
    seededIds.push(res.id);
    return res.id;
  }

  async function getRow(id: number): Promise<{
    id: number;
    canonicalExerciseId: number | null;
    routePending: boolean;
  }> {
    const [row] = await app.db
      .select({
        id: schema.exercises.id,
        canonicalExerciseId: schema.exercises.canonicalExerciseId,
        routePending: schema.exercises.routePending,
      })
      .from(schema.exercises)
      .where(inArray(schema.exercises.id, [id]));
    return row;
  }

  async function countAllExercises(): Promise<number> {
    const rows = await app.db
      .select({ id: schema.exercises.id })
      .from(schema.exercises);
    return rows.length;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    if (seededIds.length > 0) {
      // Null the self-pointers first so no row references another we delete.
      await app.db
        .update(schema.exercises)
        .set({ canonicalExerciseId: null })
        .where(inArray(schema.exercises.id, seededIds));
      await app.db
        .delete(schema.exercises)
        .where(inArray(schema.exercises.id, seededIds));
      seededIds.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("A — soft-merges an exact dupe to the MIN-id canonical, deleting nothing", async () => {
    const name = `${MARK}_A`;
    const lowId = await seedExercise({
      name,
      route: "tren-superior",
      effort: "CON",
      dificultadLineal: 5,
    });
    const highId = await seedExercise({
      name,
      route: "tren-superior",
      effort: "CON",
      dificultadLineal: 5,
    });

    const countBefore = await countAllExercises();
    await runSaneo(app.db);
    const countAfter = await countAllExercises();

    const low = await getRow(lowId);
    const high = await getRow(highId);

    // canonical (MIN id) keeps a NULL pointer; the dupe points at it.
    expect(low.canonicalExerciseId).toBeNull();
    expect(high.canonicalExerciseId).toBe(lowId);
    // zero deletes — both rows survive.
    expect(countAfter).toBe(countBefore);
  });

  it("B — does NOT collapse a distinct dificultad_lineal step (D-06)", async () => {
    const name = `${MARK}_B`;
    const stepA = await seedExercise({
      name,
      route: "tren-superior",
      effort: "CON",
      dificultadLineal: 4,
    });
    const stepB = await seedExercise({
      name,
      route: "tren-superior",
      effort: "CON",
      dificultadLineal: 7,
    });

    await runSaneo(app.db);

    const a = await getRow(stepA);
    const b = await getRow(stepB);
    expect(a.canonicalExerciseId).toBeNull();
    expect(b.canonicalExerciseId).toBeNull();
  });

  it("C — marks route_pending for empty route, leaves valid route untouched (D-08)", async () => {
    const emptyRouteId = await seedExercise({
      name: `${MARK}_C_empty`,
      route: "",
      effort: "CON",
      dificultadLineal: 2,
    });
    const validRouteId = await seedExercise({
      name: `${MARK}_C_valid`,
      route: "core",
      effort: "CON",
      dificultadLineal: 2,
    });

    await runSaneo(app.db);

    const empty = await getRow(emptyRouteId);
    const valid = await getRow(validRouteId);
    expect(empty.routePending).toBe(true);
    expect(valid.routePending).toBe(false);
  });

  it("D — is idempotent: a second run changes nothing already written (D-12)", async () => {
    const name = `${MARK}_D`;
    const lowId = await seedExercise({
      name,
      route: "tren-superior",
      effort: "CON",
      dificultadLineal: 6,
    });
    const highId = await seedExercise({
      name,
      route: "tren-superior",
      effort: "CON",
      dificultadLineal: 6,
    });
    const emptyRouteId = await seedExercise({
      name: `${MARK}_D_empty`,
      route: "",
      effort: "CON",
      dificultadLineal: 6,
    });

    await runSaneo(app.db);
    const high1 = await getRow(highId);
    const empty1 = await getRow(emptyRouteId);

    await runSaneo(app.db);
    const low2 = await getRow(lowId);
    const high2 = await getRow(highId);
    const empty2 = await getRow(emptyRouteId);

    // Second run is a no-op for already-written values.
    expect(high2.canonicalExerciseId).toBe(high1.canonicalExerciseId);
    expect(high2.canonicalExerciseId).toBe(lowId);
    expect(low2.canonicalExerciseId).toBeNull();
    expect(empty2.routePending).toBe(empty1.routePending);
    expect(empty2.routePending).toBe(true);
  });

  it("E — never deletes an exercises row (FKs intact)", async () => {
    const name = `${MARK}_E`;
    await seedExercise({
      name,
      route: "tren-superior",
      effort: "CON",
      dificultadLineal: 3,
    });
    await seedExercise({
      name,
      route: "tren-superior",
      effort: "CON",
      dificultadLineal: 3,
    });

    const countBefore = await countAllExercises();
    await runSaneo(app.db);
    const countAfter = await countAllExercises();
    expect(countAfter).toBe(countBefore);
  });
});
