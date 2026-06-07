/**
 * Integration test for the neighbor adjacency primitive
 * (`ExerciseProgressionService.getNeighbor`), reworked for "Progresión por ruta +
 * Habilidad". Runs against real MySQL (eltemplo_test_<worker>), CI-only — do NOT
 * run the suite locally (project policy: local gate is tsc).
 *
 * The primitive is an ADJACENCY LOOKUP over the persisted `exercise_progressions`
 * table (D-03), NOT a re-derivation from the `exercises` catalog. So these tests
 * seed the EDGES (by running the auto-backbone constructor and/or inserting manual
 * edges) and assert getNeighbor reads adjacency from the table. The constructor now
 * partitions by (route × effort) and orders by (progression_step, dl, id), so the
 * seeds set `route` + `progressionStep` and seed the `routes` rows the constructor
 * INNER-JOINs.
 *
 * Contracts under test (TREE-04, D-03/D-04/D-05):
 *   A. up:   getNeighbor(mid, 'up') → to_exercise_id of the edge from mid (harder).
 *   B. down: getNeighbor(mid, 'down') → from_exercise_id of the edge into mid.
 *   C. chain end up:   getNeighbor(top, 'up') → null (no outgoing edge).
 *   D. chain end down: getNeighbor(bottom, 'down') → null (no incoming edge).
 *   E. effort fixed (D-04): a manual cross-effort edge is NOT followed.
 *   F. persisted tiebreak up (D-05): the backbone consecutive edge is followed, so
 *      the runtime neighbor equals the persisted successor on a step+dl tie.
 *   F2. persisted tiebreak down (WR-02): the `down` neighbor equals the persisted
 *      PREDECESSOR on a step+dl tie (not merely the smallest-id dl-closest row).
 *   G. excluded: a Habilidad variant (off-backbone) resolves no neighbor (null).
 *   H. manual edge honored (D-03): a profe-authored source='manual' edge is followed.
 *   I. empty-effort off-graph (WR-03): a target with effort='' resolves null, and an
 *      edge pointing at an effort='' neighbor is never returned.
 *
 * Seeds routes + exercises + edges directly via Drizzle (NOT via API). Real clock
 * (fake timers desync from MySQL). Cleans up only the rows it seeds, in afterEach
 * (edges → exercises → routes, FK / dependency order).
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray, or } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import { ExerciseProgressionService } from "../../src/modules/sessions/progressions/exercise-progression-service";
import { runRebuildProgressionGraph } from "../../rebuild-progression-graph";

describe("ExerciseProgressionService.getNeighbor (progresión por ruta)", () => {
  let app: FastifyInstance;
  let service: ExerciseProgressionService;

  // Unique, short marker so the test only ever touches and cleans its own rows
  // even if a real catalog is present. routes.code is varchar(20).
  const PREFIX = `R${(Date.now() % 1e9).toString(36).toUpperCase()}`; // ≤ 7 chars
  const seededIds: number[] = [];
  const seededRouteCodes: string[] = [];

  /** Insert one route (FK target via e.route = r.code) and track it for cleanup. */
  async function seedRoute(suffix: string): Promise<string> {
    const code = `${PREFIX}${suffix}`;
    await app.db.insert(schema.routes).values({ code });
    seededRouteCodes.push(code);
    return code;
  }

  /**
   * Insert one exercise (filling the NOT NULL columns) and track its id for
   * cleanup. `habilidad` defaults NULL (on-backbone); set it to push the row off
   * the backbone (Test G). `milestoneExerciseId` defaults NULL (hito); set it to
   * make the row a VARIANTE, off the backbone (Test J — phase 133 R1-FILTER).
   * `progressionStep` orders the partition.
   */
  async function seedExercise(opts: {
    name: string;
    effort: string;
    route: string;
    dl: number;
    progressionStep?: number | null;
    habilidad?: string | null;
    milestoneExerciseId?: number | null;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "test",
        category: "test",
        exercise: `${PREFIX}_${opts.name}`,
        effort: opts.effort,
        route: opts.route,
        progressionStep: opts.progressionStep ?? null,
        habilidad: opts.habilidad ?? null,
        milestoneExerciseId: opts.milestoneExerciseId ?? null,
        dificultadLineal: opts.dl,
      })
      .$returningId();
    seededIds.push(res.id);
    return res.id;
  }

  /** Insert one directed edge into the persisted graph. */
  async function seedEdge(
    from: number,
    to: number,
    source: "auto" | "manual",
  ): Promise<void> {
    await app.db
      .insert(schema.exerciseProgressions)
      .values({ fromExerciseId: from, toExerciseId: to, source });
  }

  beforeAll(async () => {
    app = await createTestApp();
    service = new ExerciseProgressionService(app.db);
  });

  afterEach(async () => {
    // Delete this test's edges first (incident to any seeded exercise), then the
    // exercises, then the routes. Explicit FK order even though the FKs cascade, so
    // the test stays self-contained.
    if (seededIds.length > 0) {
      await app.db
        .delete(schema.exerciseProgressions)
        .where(
          or(
            inArray(schema.exerciseProgressions.fromExerciseId, seededIds),
            inArray(schema.exerciseProgressions.toExerciseId, seededIds),
          ),
        );
      await app.db
        .delete(schema.exercises)
        .where(inArray(schema.exercises.id, seededIds));
      seededIds.length = 0;
    }
    if (seededRouteCodes.length > 0) {
      await app.db
        .delete(schema.routes)
        .where(inArray(schema.routes.code, seededRouteCodes));
      seededRouteCodes.length = 0;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("A — up follows the persisted edge from the target (next harder)", async () => {
    const route = await seedRoute("A");
    const low = await seedExercise({
      name: "A_low",
      effort: "EXC",
      route,
      dl: 1,
      progressionStep: 1,
    });
    const mid = await seedExercise({
      name: "A_mid",
      effort: "EXC",
      route,
      dl: 3,
      progressionStep: 2,
    });
    const high = await seedExercise({
      name: "A_high",
      effort: "EXC",
      route,
      dl: 5,
      progressionStep: 3,
    });

    // Build the auto backbone from the catalog (low→mid→high).
    await runRebuildProgressionGraph(app.db);

    const neighbor = await service.getNeighbor(mid, "up");
    expect(neighbor).not.toBeNull();
    expect(neighbor?.id).toBe(high);
    // sanity: not the lower one
    expect(neighbor?.id).not.toBe(low);
  });

  it("B — down follows the persisted edge into the target (next easier)", async () => {
    const route = await seedRoute("B");
    const low = await seedExercise({
      name: "B_low",
      effort: "EXC",
      route,
      dl: 1,
      progressionStep: 1,
    });
    const mid = await seedExercise({
      name: "B_mid",
      effort: "EXC",
      route,
      dl: 3,
      progressionStep: 2,
    });
    await seedExercise({
      name: "B_high",
      effort: "EXC",
      route,
      dl: 5,
      progressionStep: 3,
    });

    await runRebuildProgressionGraph(app.db);

    const neighbor = await service.getNeighbor(mid, "down");
    expect(neighbor).not.toBeNull();
    expect(neighbor?.id).toBe(low);
  });

  it("C — at the top of the chain up returns null (no outgoing edge)", async () => {
    const route = await seedRoute("C");
    await seedExercise({
      name: "C_low",
      effort: "EXC",
      route,
      dl: 1,
      progressionStep: 1,
    });
    const top = await seedExercise({
      name: "C_top",
      effort: "EXC",
      route,
      dl: 5,
      progressionStep: 2,
    });

    await runRebuildProgressionGraph(app.db);

    const neighbor = await service.getNeighbor(top, "up");
    expect(neighbor).toBeNull();
  });

  it("D — at the bottom of the chain down returns null (no incoming edge)", async () => {
    const route = await seedRoute("D");
    const bottom = await seedExercise({
      name: "D_bottom",
      effort: "EXC",
      route,
      dl: 1,
      progressionStep: 1,
    });
    await seedExercise({
      name: "D_high",
      effort: "EXC",
      route,
      dl: 5,
      progressionStep: 2,
    });

    await runRebuildProgressionGraph(app.db);

    const neighbor = await service.getNeighbor(bottom, "down");
    expect(neighbor).toBeNull();
  });

  it("E — effort is fixed: a manual cross-effort edge is NOT followed (D-04)", async () => {
    const route = await seedRoute("E");
    const exMid = await seedExercise({
      name: "E_exc_mid",
      effort: "EXC",
      route,
      dl: 3,
      progressionStep: 1,
    });
    const exHigh = await seedExercise({
      name: "E_exc_high",
      effort: "EXC",
      route,
      dl: 5,
      progressionStep: 2,
    });
    // A CON exercise in the SAME route (different effort partition). A profe could
    // (mistakenly, for this test) author a manual cross-effort edge exMid→conHigh;
    // the primitive must ignore it because effort is fixed (D-04).
    const conHigh = await seedExercise({
      name: "E_con_high",
      effort: "CON",
      route,
      dl: 6,
      progressionStep: 1,
    });

    // Auto backbone wires exMid→exHigh. Add a manual cross-effort edge.
    await runRebuildProgressionGraph(app.db);
    await seedEdge(exMid, conHigh, "manual");

    const neighbor = await service.getNeighbor(exMid, "up");
    expect(neighbor).not.toBeNull();
    // Returns the same-effort EXC successor, never the cross-effort CON neighbor.
    expect(neighbor?.id).toBe(exHigh);
    expect(neighbor?.id).not.toBe(conHigh);
    expect(neighbor?.contraction).toBe("EXC");
  });

  it("F — up neighbor equals the persisted backbone successor on a step+dl tie (D-05)", async () => {
    const route = await seedRoute("F");
    const mid = await seedExercise({
      name: "F_mid",
      effort: "EXC",
      route,
      dl: 3,
      progressionStep: 1,
    });
    // Two candidates share step 2 AND dl 5. The backbone constructor sorts by
    // (step, dl, id) and chains mid → min(tie) → max(tie); so mid's persisted
    // successor is the smaller-id tie. The primitive reads that edge.
    const tieA = await seedExercise({
      name: "F_tie_a",
      effort: "EXC",
      route,
      dl: 5,
      progressionStep: 2,
    });
    const tieB = await seedExercise({
      name: "F_tie_b",
      effort: "EXC",
      route,
      dl: 5,
      progressionStep: 2,
    });
    const expectedUp = Math.min(tieA, tieB);

    await runRebuildProgressionGraph(app.db);

    const neighbor = await service.getNeighbor(mid, "up");
    expect(neighbor).not.toBeNull();
    expect(neighbor?.id).toBe(expectedUp);
  });

  it("F2 — down neighbor equals the persisted backbone predecessor on a step+dl tie (WR-02)", async () => {
    const route = await seedRoute("F2");
    // Two tied candidates at the LOWER step, then a higher target. The backbone is
    // min(tie) → max(tie) → top, so top's persisted predecessor is the LARGER-id
    // tie (max). A naive catalog re-derivation ("dl-closest then smallest id")
    // would instead return the smaller-id tie — this test pins the persisted
    // predecessor and would fail under that old behavior.
    const tieA = await seedExercise({
      name: "F2_tie_a",
      effort: "EXC",
      route,
      dl: 3,
      progressionStep: 1,
    });
    const tieB = await seedExercise({
      name: "F2_tie_b",
      effort: "EXC",
      route,
      dl: 3,
      progressionStep: 1,
    });
    const top = await seedExercise({
      name: "F2_top",
      effort: "EXC",
      route,
      dl: 5,
      progressionStep: 2,
    });
    const expectedDown = Math.max(tieA, tieB);
    const notExpected = Math.min(tieA, tieB);

    await runRebuildProgressionGraph(app.db);

    const neighbor = await service.getNeighbor(top, "down");
    expect(neighbor).not.toBeNull();
    // The persisted predecessor is the larger-id tie, NOT the dl-closest smallest id.
    expect(neighbor?.id).toBe(expectedDown);
    expect(neighbor?.id).not.toBe(notExpected);
  });

  it("G — a Habilidad variant (off-backbone) resolves no neighbor", async () => {
    // Seed a real backbone (low→high) so a graph neighbor WOULD exist if the target
    // were on the backbone — proving the null is due to the target's habilidad, not
    // an empty catalog.
    const route = await seedRoute("G");
    await seedExercise({
      name: "G_low",
      effort: "EXC",
      route,
      dl: 1,
      progressionStep: 1,
    });
    await seedExercise({
      name: "G_high",
      effort: "EXC",
      route,
      dl: 5,
      progressionStep: 2,
    });
    // A Habilidad variant (habilidad != NULL) sits parallel to the backbone — the
    // constructor never wires it, so it carries no incident edges.
    const variant = await seedExercise({
      name: "G_variant",
      effort: "EXC",
      route,
      dl: 3,
      progressionStep: 1,
      habilidad: "WIDE",
    });

    await runRebuildProgressionGraph(app.db);

    const up = await service.getNeighbor(variant, "up");
    const down = await service.getNeighbor(variant, "down");
    expect(up).toBeNull();
    expect(down).toBeNull();
  });

  it("H — a manual edge is honored by the primitive (D-03)", async () => {
    // The whole rationale of persisting the graph (D-03) is that the primitive reads
    // MANUAL edges authored by profes in phase 128, not just the auto backbone. Here
    // a profe reorders the chain: they author a same-effort manual edge a→c that the
    // auto backbone would NOT produce (a's auto successor is b).
    const route = await seedRoute("H");
    const a = await seedExercise({
      name: "H_a",
      effort: "ISO",
      route,
      dl: 2,
      progressionStep: 1,
    });
    const b = await seedExercise({
      name: "H_b",
      effort: "ISO",
      route,
      dl: 8,
      progressionStep: 2,
    });
    const c = await seedExercise({
      name: "H_c",
      effort: "ISO",
      route,
      dl: 9,
      progressionStep: 3,
    });

    // Build the auto backbone (a→b→c by step). c's only auto predecessor is b.
    await runRebuildProgressionGraph(app.db);

    // The profe deletes the auto edge b→c and authors a manual edge a→c (jump c
    // straight onto a). Now the ONLY incoming edge to c is the manual a→c.
    await app.db
      .delete(schema.exerciseProgressions)
      .where(inArray(schema.exerciseProgressions.toExerciseId, [c]));
    await seedEdge(a, c, "manual");

    // getNeighbor(c,'down') must follow the persisted manual edge → a, proving the
    // primitive reads `manual` edges (catalog re-derivation would have returned b).
    const downManualOnly = await service.getNeighbor(c, "down");
    expect(downManualOnly).not.toBeNull();
    expect(downManualOnly?.id).toBe(a);
    expect(downManualOnly?.id).not.toBe(b);
  });

  it("J — a milestone VARIANTE is never returned as a neighbor after a rebuild (R1-FILTER)", async () => {
    // low and high are milestones; the variante of low sits BETWEEN them by
    // step/dl. With the milestone filter the rebuild leaves the variante with no
    // incident edges, so adjacency from its neighbors skips it entirely
    // (membership is by edges) and the variante itself resolves no neighbor.
    const route = await seedRoute("J");
    const low = await seedExercise({
      name: "J_low",
      effort: "CON",
      route,
      dl: 1,
      progressionStep: 1,
    });
    const variante = await seedExercise({
      name: "J_variante",
      effort: "CON",
      route,
      dl: 3,
      progressionStep: 2,
      milestoneExerciseId: low,
    });
    const high = await seedExercise({
      name: "J_high",
      effort: "CON",
      route,
      dl: 5,
      progressionStep: 3,
    });

    await runRebuildProgressionGraph(app.db);

    // From the milestone below: up goes straight to the next milestone.
    const upFromLow = await service.getNeighbor(low, "up");
    expect(upFromLow).not.toBeNull();
    expect(upFromLow?.id).toBe(high);
    expect(upFromLow?.id).not.toBe(variante);

    // From the milestone above: down goes straight to the previous milestone.
    const downFromHigh = await service.getNeighbor(high, "down");
    expect(downFromHigh).not.toBeNull();
    expect(downFromHigh?.id).toBe(low);
    expect(downFromHigh?.id).not.toBe(variante);

    // The variante itself carries no incident edges → no neighbors at all.
    expect(await service.getNeighbor(variante, "up")).toBeNull();
    expect(await service.getNeighbor(variante, "down")).toBeNull();
  });

  it("I — empty-effort target and empty-effort neighbor are off-graph (WR-03)", async () => {
    const route = await seedRoute("I");
    // A real same-effort neighbor exists, plus an edge into the empty-effort target
    // — proving the null is due to the target's invalid effort.
    const realNeighbor = await seedExercise({
      name: "I_real",
      effort: "EXC",
      route,
      dl: 2,
      progressionStep: 1,
    });
    const emptyTarget = await seedExercise({
      name: "I_empty",
      effort: "",
      route,
      dl: 4,
      progressionStep: 2,
    });
    // Manually wire an edge realNeighbor → emptyTarget (auto rebuild would never
    // create it: the empty-effort row is excluded from the node set, WR-04).
    await seedEdge(realNeighbor, emptyTarget, "manual");

    // Target has effort='' → off-graph, never gets an `'' as Contraction` cast.
    const up = await service.getNeighbor(emptyTarget, "up");
    const down = await service.getNeighbor(emptyTarget, "down");
    expect(up).toBeNull();
    expect(down).toBeNull();

    // And from the real node, the only outgoing edge points at the empty-effort
    // neighbor (different effort), so it is filtered out → null, never an invalid
    // Contraction.
    const upFromReal = await service.getNeighbor(realNeighbor, "up");
    expect(upFromReal).toBeNull();
  });
});
