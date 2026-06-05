/**
 * Phase 126 Plan 03 — Integration test for the neighbor adjacency primitive
 * (`ExerciseProgressionService.getNeighbor`). Runs against real MySQL
 * (eltemplo_test_<worker>), CI-only — do NOT run the suite locally (project
 * policy: local gate is tsc).
 *
 * Contracts under test (TREE-04, D-04/D-05):
 *   A. up:   getNeighbor(mid, 'up') → the next-harder same-effort exercise.
 *   B. down: getNeighbor(mid, 'down') → the next-easier same-effort exercise.
 *   C. chain end up:   getNeighbor(top, 'up') → null.
 *   D. chain end down: getNeighbor(bottom, 'down') → null.
 *   E. effort fixed (D-04): a CON exercise in the SAME sub-family is never
 *      returned for an EXC target — the contraction is never crossed.
 *   F. tiebreak (D-05): two candidates sharing the adjacent dl → the smaller-id
 *      one is returned deterministically.
 *   G. excluded: an exercise with NULL subfamily_id resolves no neighbor (null).
 *
 * Seeds exercises directly via Drizzle (NOT via API). Real clock (fake timers
 * desync from MySQL). Cleans up only the rows it seeds, in afterEach.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { ExerciseProgressionService } from "../../src/modules/sessions/progressions/exercise-progression-service";

describe("ExerciseProgressionService.getNeighbor (Phase 126 Plan 03)", () => {
  let app: FastifyInstance;
  let service: ExerciseProgressionService;

  // Unique marker so the test only ever touches and cleans its own rows even if
  // a real catalog is present in the per-worker DB.
  const MARK = `PROGRESSION_TEST_${Date.now()}`;
  const seededIds: number[] = [];
  // Track sub-families we create so we can clean them up in FK order (after the
  // exercises that reference them).
  const seededSubfamilyIds: number[] = [];

  /**
   * Insert one sub-family and track its id for cleanup. The name carries the MARK
   * so it stays scoped to the test.
   */
  async function seedSubfamily(name: string): Promise<number> {
    const [res] = await app.db
      .insert(schema.exerciseSubfamilies)
      .values({ route: "TEST", name: `${MARK}_${name}` })
      .$returningId();
    seededSubfamilyIds.push(res.id);
    return res.id;
  }

  /**
   * Insert one exercise (filling the NOT NULL columns) and track its id for
   * cleanup. `subfamilyId` is nullable so the exclusion case (G) can seed a row
   * outside the graph.
   */
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
    seededIds.push(res.id);
    return res.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    service = new ExerciseProgressionService(app.db);
  });

  afterEach(async () => {
    // Delete seeded exercises first (they reference sub-families), then the
    // sub-families (explicit FK order — exercises.subfamily_id is ON DELETE SET
    // NULL, but we delete explicitly so the test stays self-contained).
    if (seededIds.length > 0) {
      await app.db
        .delete(schema.exercises)
        .where(inArray(schema.exercises.id, seededIds));
      seededIds.length = 0;
    }
    if (seededSubfamilyIds.length > 0) {
      await app.db
        .delete(schema.exerciseSubfamilies)
        .where(inArray(schema.exerciseSubfamilies.id, seededSubfamilyIds));
      seededSubfamilyIds.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("A — up returns the next-harder same-effort exercise", async () => {
    const sf = await seedSubfamily("A");
    const low = await seedExercise({
      name: "A_low",
      effort: "EXC",
      subfamilyId: sf,
      dl: 1,
    });
    const mid = await seedExercise({
      name: "A_mid",
      effort: "EXC",
      subfamilyId: sf,
      dl: 3,
    });
    const high = await seedExercise({
      name: "A_high",
      effort: "EXC",
      subfamilyId: sf,
      dl: 5,
    });

    const neighbor = await service.getNeighbor(mid, "up");
    expect(neighbor).not.toBeNull();
    expect(neighbor?.id).toBe(high);
    // sanity: not the lower one
    expect(neighbor?.id).not.toBe(low);
  });

  it("B — down returns the next-easier same-effort exercise", async () => {
    const sf = await seedSubfamily("B");
    const low = await seedExercise({
      name: "B_low",
      effort: "EXC",
      subfamilyId: sf,
      dl: 1,
    });
    const mid = await seedExercise({
      name: "B_mid",
      effort: "EXC",
      subfamilyId: sf,
      dl: 3,
    });
    await seedExercise({
      name: "B_high",
      effort: "EXC",
      subfamilyId: sf,
      dl: 5,
    });

    const neighbor = await service.getNeighbor(mid, "down");
    expect(neighbor).not.toBeNull();
    expect(neighbor?.id).toBe(low);
  });

  it("C — at the top of the chain up returns null", async () => {
    const sf = await seedSubfamily("C");
    await seedExercise({
      name: "C_low",
      effort: "EXC",
      subfamilyId: sf,
      dl: 1,
    });
    const top = await seedExercise({
      name: "C_top",
      effort: "EXC",
      subfamilyId: sf,
      dl: 5,
    });

    const neighbor = await service.getNeighbor(top, "up");
    expect(neighbor).toBeNull();
  });

  it("D — at the bottom of the chain down returns null", async () => {
    const sf = await seedSubfamily("D");
    const bottom = await seedExercise({
      name: "D_bottom",
      effort: "EXC",
      subfamilyId: sf,
      dl: 1,
    });
    await seedExercise({
      name: "D_high",
      effort: "EXC",
      subfamilyId: sf,
      dl: 5,
    });

    const neighbor = await service.getNeighbor(bottom, "down");
    expect(neighbor).toBeNull();
  });

  it("E — effort is fixed: an EXC target never returns a CON neighbor (D-04)", async () => {
    const sf = await seedSubfamily("E");
    const exMid = await seedExercise({
      name: "E_exc_mid",
      effort: "EXC",
      subfamilyId: sf,
      dl: 3,
    });
    const exHigh = await seedExercise({
      name: "E_exc_high",
      effort: "EXC",
      subfamilyId: sf,
      dl: 5,
    });
    // A CON exercise sits at dl 4 in the SAME sub-family — closer by dl than the
    // EXC dl-5, yet must be ignored because effort is fixed.
    const conMid = await seedExercise({
      name: "E_con_mid",
      effort: "CON",
      subfamilyId: sf,
      dl: 4,
    });

    const neighbor = await service.getNeighbor(exMid, "up");
    expect(neighbor).not.toBeNull();
    // Returns the EXC dl-5, never the closer-by-dl CON dl-4.
    expect(neighbor?.id).toBe(exHigh);
    expect(neighbor?.id).not.toBe(conMid);
    expect(neighbor?.contraction).toBe("EXC");
  });

  it("F — dl ties are broken deterministically by smallest id (D-05)", async () => {
    const sf = await seedSubfamily("F");
    const mid = await seedExercise({
      name: "F_mid",
      effort: "EXC",
      subfamilyId: sf,
      dl: 3,
    });
    // Two candidates share the adjacent dl 5. The smaller-id one must win.
    const tieA = await seedExercise({
      name: "F_tie_a",
      effort: "EXC",
      subfamilyId: sf,
      dl: 5,
    });
    const tieB = await seedExercise({
      name: "F_tie_b",
      effort: "EXC",
      subfamilyId: sf,
      dl: 5,
    });
    const expectedId = Math.min(tieA, tieB);

    const neighbor = await service.getNeighbor(mid, "up");
    expect(neighbor).not.toBeNull();
    expect(neighbor?.id).toBe(expectedId);
  });

  it("G — an exercise with NULL subfamily_id resolves no neighbor", async () => {
    // Seed a same-effort exercise in a real sub-family so a graph neighbor WOULD
    // exist if the target were in the graph — proving the null is due to the
    // target's NULL subfamily_id, not an empty catalog.
    const sf = await seedSubfamily("G");
    await seedExercise({
      name: "G_in_graph",
      effort: "EXC",
      subfamilyId: sf,
      dl: 5,
    });
    const excluded = await seedExercise({
      name: "G_excluded",
      effort: "EXC",
      subfamilyId: null,
      dl: 3,
    });

    const up = await service.getNeighbor(excluded, "up");
    const down = await service.getNeighbor(excluded, "down");
    expect(up).toBeNull();
    expect(down).toBeNull();
  });
});
