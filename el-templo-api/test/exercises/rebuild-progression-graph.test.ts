/**
 * Integration test for the deterministic graph constructor
 * (`rebuild-progression-graph.ts`), reworked for "Progresión por ruta + Habilidad".
 * Runs against real MySQL (eltemplo_test_<worker>), CI-only — do NOT run the suite
 * locally (project policy: local gate is tsc).
 *
 * Contract under test (TREE-04, D-02/D-03/D-04/D-05):
 *   A. Backbone: 3 exercises in one (route × effort) at progression_step 1,2,3 yield
 *      exactly 2 auto edges in step order (a→b, b→c). Single-node partition → 0 edges.
 *   B. Idempotency: running twice yields the identical auto edge set, no dupes.
 *   C. Manual-preserving: a pre-existing source='manual' edge survives a rebuild
 *      untouched (D-03).
 *   D. Effort NOT crossed: an EXC and a CON exercise in the same route never share
 *      an auto edge (D-04).
 *   E. Habilidad excluded: an exercise with habilidad != NULL is off-backbone and
 *      appears in no auto edge.
 *   E2. Excluded route: a route with excluded_from_tree=1 yields 0 edges.
 *   F. Tiebreak determinism: two exercises at the same step+dl in one partition
 *      produce the identical edge orientation across runs, by id (D-05).
 *   G. Empty-effort confirmed exercises are excluded (WR-04).
 *   H. progression_step ordering overrides dificultad_lineal.
 *   Locked: a (route × effort) partition that owns a same-partition manual edge is
 *      not regenerated; untouched partitions still regenerate (D-02).
 *
 * Seeds routes + exercises directly via Drizzle (NOT via API). The backbone READ
 * INNER-JOINs `routes` on `e.route = r.code`, so every route code used MUST have a
 * `routes` row or its nodes vanish from the graph. Real clock (fake timers desync
 * from MySQL). Cleans up only the rows it seeds, in afterEach — edges THEN exercises
 * THEN routes (FK / dependency order).
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray, or } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  runRebuildProgressionGraph,
  readExerciseNodes,
  readManualEdgePartitionRows,
} from "../../rebuild-progression-graph";

describe("rebuild-progression-graph (progresión por ruta)", () => {
  let app: FastifyInstance;

  // Unique, short marker so the test only ever touches and cleans its own rows
  // even if a real catalog is present in the per-worker DB. routes.code is
  // varchar(20): keep the prefix small so `${PREFIX}${suffix}` stays in bounds.
  const PREFIX = `R${(Date.now() % 1e9).toString(36).toUpperCase()}`; // ≤ 7 chars
  const seededExerciseIds: number[] = [];
  const seededRouteCodes: string[] = [];

  /** Insert one route (FK target via e.route = r.code) and track it for cleanup. */
  async function seedRoute(
    suffix: string,
    excludedFromTree = false,
  ): Promise<string> {
    const code = `${PREFIX}${suffix}`;
    await app.db.insert(schema.routes).values({ code, excludedFromTree });
    seededRouteCodes.push(code);
    return code;
  }

  /**
   * Insert one exercise (filling the NOT NULL columns) and track its id for
   * cleanup. `exercise` carries the PREFIX; canonicalExerciseId left NULL so the
   * row is canonical. `habilidad` defaults NULL (on-backbone); set it to push the
   * row off the backbone (Test E). `progressionStep` may be null (linear routes).
   */
  async function seedExercise(opts: {
    name: string;
    effort: string;
    dl: number;
    route: string;
    progressionStep?: number | null;
    habilidad?: string | null;
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
        dificultadLineal: opts.dl,
      })
      .$returningId();
    seededExerciseIds.push(res.id);
    return res.id;
  }

  /** Read back the edges incident to any of the given exercise ids. */
  async function getAutoEdges(exerciseIds: number[]): Promise<
    {
      fromExerciseId: number;
      toExerciseId: number;
      source: "auto" | "manual";
    }[]
  > {
    if (exerciseIds.length === 0) return [];
    return app.db
      .select({
        fromExerciseId: schema.exerciseProgressions.fromExerciseId,
        toExerciseId: schema.exerciseProgressions.toExerciseId,
        source: schema.exerciseProgressions.source,
      })
      .from(schema.exerciseProgressions)
      .where(
        or(
          inArray(schema.exerciseProgressions.fromExerciseId, exerciseIds),
          inArray(schema.exerciseProgressions.toExerciseId, exerciseIds),
        ),
      );
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    // Delete this test's edges first (explicit FK order), then exercises, then
    // routes. Edges scoped to the seeded exercise ids only.
    if (seededExerciseIds.length > 0) {
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

  it("A — backbone: 3 exercises at step 1,2,3 yield exactly 2 auto edges in step order", async () => {
    const route = await seedRoute("A");
    const a = await seedExercise({
      name: "A1",
      effort: "CON",
      dl: 1,
      route,
      progressionStep: 1,
    });
    const b = await seedExercise({
      name: "A3",
      effort: "CON",
      dl: 3,
      route,
      progressionStep: 2,
    });
    const c = await seedExercise({
      name: "A5",
      effort: "CON",
      dl: 5,
      route,
      progressionStep: 3,
    });

    await runRebuildProgressionGraph(app.db);

    const edges = (await getAutoEdges([a, b, c])).filter(
      (e) => e.source === "auto",
    );
    expect(edges).toHaveLength(2);
    // a→b and b→c, in step order.
    expect(edges).toContainEqual({
      fromExerciseId: a,
      toExerciseId: b,
      source: "auto",
    });
    expect(edges).toContainEqual({
      fromExerciseId: b,
      toExerciseId: c,
      source: "auto",
    });
    // No self-cycle and no a→c skip edge: the backbone is strictly consecutive.
    expect(
      edges.some((e) => e.fromExerciseId === a && e.toExerciseId === c),
    ).toBe(false);
  });

  it("A2 — a single-exercise partition produces 0 edges", async () => {
    const route = await seedRoute("A2");
    const only = await seedExercise({
      name: "A2only",
      effort: "CON",
      dl: 2,
      route,
      progressionStep: 1,
    });

    await runRebuildProgressionGraph(app.db);

    const edges = await getAutoEdges([only]);
    expect(edges).toHaveLength(0);
  });

  it("B — idempotency: running twice yields the identical auto edge set, no dupes", async () => {
    const route = await seedRoute("B");
    const a = await seedExercise({
      name: "B1",
      effort: "ISO",
      dl: 1,
      route,
      progressionStep: 1,
    });
    const b = await seedExercise({
      name: "B2",
      effort: "ISO",
      dl: 2,
      route,
      progressionStep: 2,
    });
    const c = await seedExercise({
      name: "B3",
      effort: "ISO",
      dl: 3,
      route,
      progressionStep: 3,
    });

    await runRebuildProgressionGraph(app.db);
    const first = (await getAutoEdges([a, b, c]))
      .filter((e) => e.source === "auto")
      .map((e) => `${e.fromExerciseId}->${e.toExerciseId}`)
      .sort();

    await runRebuildProgressionGraph(app.db);
    const second = (await getAutoEdges([a, b, c]))
      .filter((e) => e.source === "auto")
      .map((e) => `${e.fromExerciseId}->${e.toExerciseId}`)
      .sort();

    expect(second).toEqual(first);
    // No duplicates: the UNIQUE backs this, so the set size equals the array size.
    expect(new Set(second).size).toBe(second.length);
    expect(second).toHaveLength(2);
  });

  it("C — manual edges survive a rebuild untouched (D-03)", async () => {
    const route = await seedRoute("C");
    const a = await seedExercise({
      name: "C1",
      effort: "CON",
      dl: 1,
      route,
      progressionStep: 1,
    });
    const b = await seedExercise({
      name: "C2",
      effort: "CON",
      dl: 2,
      route,
      progressionStep: 2,
    });
    // A manual cross-effort edge a profe could author in 128 — the constructor
    // would NEVER produce this (effort differs), so its survival is solely due to
    // the source='auto'-scoped DELETE. Cross-effort → does NOT lock the partition.
    const manualFrom = await seedExercise({
      name: "Cmanual_from",
      effort: "EXC",
      dl: 9,
      route,
      progressionStep: 1,
    });
    const manualTo = await seedExercise({
      name: "Cmanual_to",
      effort: "ISO",
      dl: 1,
      route,
      progressionStep: 1,
    });

    await app.db.insert(schema.exerciseProgressions).values({
      fromExerciseId: manualFrom,
      toExerciseId: manualTo,
      source: "manual",
    });

    await runRebuildProgressionGraph(app.db);

    const edges = await getAutoEdges([a, b, manualFrom, manualTo]);
    // The manual edge is still present and still source='manual'.
    expect(edges).toContainEqual({
      fromExerciseId: manualFrom,
      toExerciseId: manualTo,
      source: "manual",
    });
    // The auto backbone for the CON pair was (re)generated alongside it.
    expect(edges).toContainEqual({
      fromExerciseId: a,
      toExerciseId: b,
      source: "auto",
    });
  });

  it("locked partition — a (route×effort) partition with a same-partition manual edge is NOT regenerated; untouched partitions still regenerate (D-02)", async () => {
    // Partition X: route X, effort CON, three nodes at step 1/2/3. Its auto chain
    // has been REPLACED by the editor with a MANUAL chain in a different order
    // (5→1→3), and X's auto edges deleted — exactly what the editor does on the
    // first override. X must therefore be LOCKED: a rebuild must NOT delete its
    // manual edges nor re-insert the ascending auto chain.
    const routeX = await seedRoute("X");
    const x1 = await seedExercise({
      name: "X1",
      effort: "CON",
      dl: 1,
      route: routeX,
      progressionStep: 1,
    });
    const x3 = await seedExercise({
      name: "X3",
      effort: "CON",
      dl: 3,
      route: routeX,
      progressionStep: 2,
    });
    const x5 = await seedExercise({
      name: "X5",
      effort: "CON",
      dl: 5,
      route: routeX,
      progressionStep: 3,
    });

    // Partition Y: route Y, effort CON, three nodes — untouched (no manual edge).
    // It must regenerate its full auto backbone on rebuild.
    const routeY = await seedRoute("Y");
    const y1 = await seedExercise({
      name: "Y1",
      effort: "CON",
      dl: 1,
      route: routeY,
      progressionStep: 1,
    });
    const y3 = await seedExercise({
      name: "Y3",
      effort: "CON",
      dl: 3,
      route: routeY,
      progressionStep: 2,
    });
    const y5 = await seedExercise({
      name: "Y5",
      effort: "CON",
      dl: 5,
      route: routeY,
      progressionStep: 3,
    });

    // Lock X: write its manual chain in the profe's chosen order (5→1→3). All
    // endpoints are inside partition X (same route × effort), so this is a
    // same-partition chain rewrite that locks the partition (D-02/D-03).
    await app.db.insert(schema.exerciseProgressions).values([
      { fromExerciseId: x5, toExerciseId: x1, source: "manual" },
      { fromExerciseId: x1, toExerciseId: x3, source: "manual" },
    ]);

    await runRebuildProgressionGraph(app.db);

    // Partition X: EXACTLY its two manual edges (5→1, 1→3), zero auto edges.
    const xEdges = await getAutoEdges([x1, x3, x5]);
    expect(xEdges).toHaveLength(2);
    expect(xEdges).toContainEqual({
      fromExerciseId: x5,
      toExerciseId: x1,
      source: "manual",
    });
    expect(xEdges).toContainEqual({
      fromExerciseId: x1,
      toExerciseId: x3,
      source: "manual",
    });
    // No auto edge was resurrected for the locked partition.
    expect(xEdges.some((e) => e.source === "auto")).toBe(false);

    // Partition Y: full auto backbone (y1→y3, y3→y5) in step order, all auto.
    const yEdges = await getAutoEdges([y1, y3, y5]);
    expect(yEdges).toHaveLength(2);
    expect(yEdges).toContainEqual({
      fromExerciseId: y1,
      toExerciseId: y3,
      source: "auto",
    });
    expect(yEdges).toContainEqual({
      fromExerciseId: y3,
      toExerciseId: y5,
      source: "auto",
    });
    expect(yEdges.some((e) => e.source !== "auto")).toBe(false);

    // Regression: a SECOND rebuild leaves X's manual edges byte-for-byte and
    // produces no duplicate auto edges for Y (UNIQUE backs the dedupe).
    await runRebuildProgressionGraph(app.db);

    const xEdges2 = await getAutoEdges([x1, x3, x5]);
    expect(xEdges2).toHaveLength(2);
    expect(xEdges2).toContainEqual({
      fromExerciseId: x5,
      toExerciseId: x1,
      source: "manual",
    });
    expect(xEdges2).toContainEqual({
      fromExerciseId: x1,
      toExerciseId: x3,
      source: "manual",
    });

    const yEdges2 = await getAutoEdges([y1, y3, y5]);
    expect(yEdges2).toHaveLength(2);
    expect(
      yEdges2.map((e) => `${e.fromExerciseId}->${e.toExerciseId}`).sort(),
    ).toEqual(
      yEdges.map((e) => `${e.fromExerciseId}->${e.toExerciseId}`).sort(),
    );
  });

  it("D — effort is NOT crossed: EXC and CON in the same route never share an edge (D-04)", async () => {
    const route = await seedRoute("D");
    const exc = await seedExercise({
      name: "Dexc",
      effort: "EXC",
      dl: 1,
      route,
      progressionStep: 1,
    });
    const con = await seedExercise({
      name: "Dcon",
      effort: "CON",
      dl: 2,
      route,
      progressionStep: 1,
    });

    await runRebuildProgressionGraph(app.db);

    const edges = await getAutoEdges([exc, con]);
    // Each is the lone member of its (route × effort) partition → 0 edges, and
    // crucially NO edge connects across effort.
    expect(
      edges.some(
        (e) =>
          (e.fromExerciseId === exc && e.toExerciseId === con) ||
          (e.fromExerciseId === con && e.toExerciseId === exc),
      ),
    ).toBe(false);
    expect(edges).toHaveLength(0);
  });

  it("E — Habilidad variants (habilidad != NULL) are off-backbone and appear in no edge", async () => {
    const route = await seedRoute("E");
    // Two backbone nodes (habilidad NULL) form the chain...
    const base1 = await seedExercise({
      name: "Ebase1",
      effort: "CON",
      dl: 1,
      route,
      progressionStep: 1,
    });
    const base2 = await seedExercise({
      name: "Ebase2",
      effort: "CON",
      dl: 2,
      route,
      progressionStep: 2,
    });
    // ...a Habilidad variant at the same step is parallel, off the backbone.
    const variant = await seedExercise({
      name: "Evariant",
      effort: "CON",
      dl: 2,
      route,
      progressionStep: 2,
      habilidad: "WIDE",
    });

    await runRebuildProgressionGraph(app.db);

    const edges = await getAutoEdges([base1, base2, variant]);
    // The variant appears in NO edge.
    expect(
      edges.some(
        (e) => e.fromExerciseId === variant || e.toExerciseId === variant,
      ),
    ).toBe(false);
    // The backbone pair still chains (base1→base2), and that's the only edge.
    expect(edges).toHaveLength(1);
    expect(edges).toContainEqual({
      fromExerciseId: base1,
      toExerciseId: base2,
      source: "auto",
    });
  });

  it("E2 — a route with excluded_from_tree=1 yields 0 edges", async () => {
    const route = await seedRoute("E2", true); // excluded (movilidad/games)
    const a = await seedExercise({
      name: "E2a",
      effort: "CON",
      dl: 1,
      route,
      progressionStep: 1,
    });
    const b = await seedExercise({
      name: "E2b",
      effort: "CON",
      dl: 2,
      route,
      progressionStep: 2,
    });

    await runRebuildProgressionGraph(app.db);

    const edges = await getAutoEdges([a, b]);
    expect(edges).toHaveLength(0);
  });

  it("G — empty-effort confirmed exercises are excluded from the graph (WR-04)", async () => {
    const route = await seedRoute("G");
    // Two confirmed canonical exercises with effort='' in the same route. effort
    // is a free varchar and the catalog demonstrably holds '' rows; they must NOT
    // form a partition or chain — an empty-effort axis is meaningless (D-04).
    const empty1 = await seedExercise({
      name: "Gempty1",
      effort: "",
      dl: 1,
      route,
      progressionStep: 1,
    });
    const empty2 = await seedExercise({
      name: "Gempty2",
      effort: "",
      dl: 2,
      route,
      progressionStep: 2,
    });
    // A real CON exercise in the same route, single member → 0 edges, so the ONLY
    // way an edge could appear incident to these ids is the (wrong) '' chain.
    const con = await seedExercise({
      name: "Gcon",
      effort: "CON",
      dl: 3,
      route,
      progressionStep: 1,
    });

    await runRebuildProgressionGraph(app.db);

    const edges = await getAutoEdges([empty1, empty2, con]);
    // The empty-effort rows appear in NO edge — no '' backbone was formed.
    expect(
      edges.some(
        (e) =>
          e.fromExerciseId === empty1 ||
          e.toExerciseId === empty1 ||
          e.fromExerciseId === empty2 ||
          e.toExerciseId === empty2,
      ),
    ).toBe(false);
    expect(edges).toHaveLength(0);
  });

  it("H — progression_step ordering overrides dificultad_lineal", async () => {
    const route = await seedRoute("H");
    // Step order is the OPPOSITE of dl order: the backbone must follow step.
    const easyStep = await seedExercise({
      name: "Hstep1",
      effort: "CON",
      dl: 9, // high dl...
      route,
      progressionStep: 1, // ...but earliest step → head of chain
    });
    const hardStep = await seedExercise({
      name: "Hstep2",
      effort: "CON",
      dl: 1, // low dl...
      route,
      progressionStep: 2, // ...but later step → tail of chain
    });

    await runRebuildProgressionGraph(app.db);

    const edges = (await getAutoEdges([easyStep, hardStep])).filter(
      (e) => e.source === "auto",
    );
    expect(edges).toHaveLength(1);
    // Edge follows progression_step (easyStep→hardStep), NOT dl (which would
    // orient hardStep→easyStep).
    expect(edges).toContainEqual({
      fromExerciseId: easyStep,
      toExerciseId: hardStep,
      source: "auto",
    });
  });

  it("F — same step+dl tiebreak is deterministic by id across runs (D-05)", async () => {
    const route = await seedRoute("F");
    // Two exercises at the SAME step AND dl in one partition. Seeded so the
    // tiebreak is provably by id (ascending), not insertion/name order.
    const first = await seedExercise({
      name: "Ftie_a",
      effort: "CON",
      dl: 4,
      route,
      progressionStep: 1,
    });
    const second = await seedExercise({
      name: "Ftie_b",
      effort: "CON",
      dl: 4,
      route,
      progressionStep: 1,
    });
    // A third at a higher step so there is at least one edge to orient.
    const third = await seedExercise({
      name: "Ftie_c",
      effort: "CON",
      dl: 6,
      route,
      progressionStep: 2,
    });

    await runRebuildProgressionGraph(app.db);
    const run1 = (await getAutoEdges([first, second, third]))
      .filter((e) => e.source === "auto")
      .map((e) => `${e.fromExerciseId}->${e.toExerciseId}`)
      .sort();

    await runRebuildProgressionGraph(app.db);
    const run2 = (await getAutoEdges([first, second, third]))
      .filter((e) => e.source === "auto")
      .map((e) => `${e.fromExerciseId}->${e.toExerciseId}`)
      .sort();

    // Identical orientation across runs (stable id tiebreak).
    expect(run2).toEqual(run1);
    // Smaller id (first) precedes larger id (second) at the tie, then second→third.
    expect(run1).toEqual([`${first}->${second}`, `${second}->${third}`].sort());
  });
});

/**
 * Pure unit tests for `readExerciseNodes` — the result-narrowing helper. These
 * exercise data-error paths the integration suite cannot reach (the DB column
 * `dificultad_lineal` is NOT NULL DEFAULT 1, so a NaN dl cannot be seeded), so the
 * unit test feeds the raw mysql2 `[rows, fields]` shape directly. No DB. The
 * helper now reads route + progressionStep (NOT subfamilyId).
 */
describe("readExerciseNodes (data hygiene — WR-04 / WR-05)", () => {
  /** Wrap rows in the mysql2 db.execute() shape: [rows, fields]. */
  function asResult(rows: unknown[]): unknown {
    return [rows, []];
  }

  it("WR-05 — skips a row with a non-finite dl instead of coercing it to 0", () => {
    const nodes = readExerciseNodes(
      asResult([
        { id: 1, route: "FL", effort: "CON", dl: 1, progressionStep: 1 },
        // A NaN dl: must be SKIPPED, not planted at dl=0 (which would sort below
        // every legitimate dl≥1 and become the wrong head of the chain).
        {
          id: 2,
          route: "FL",
          effort: "CON",
          dl: Number.NaN,
          progressionStep: 2,
        },
        {
          id: 3,
          route: "FL",
          effort: "CON",
          dl: "not-a-number",
          progressionStep: 3,
        },
        { id: 4, route: "FL", effort: "CON", dl: 3, progressionStep: 4 },
      ]),
    );
    expect(nodes.map((n) => n.id).sort((a, b) => a - b)).toEqual([1, 4]);
    expect(nodes.some((n) => n.dl === 0)).toBe(false);
  });

  it("WR-04 — skips a row with an empty or invalid effort", () => {
    const nodes = readExerciseNodes(
      asResult([
        { id: 1, route: "FL", effort: "CON", dl: 1, progressionStep: 1 },
        { id: 2, route: "FL", effort: "", dl: 2, progressionStep: 2 }, // empty → off-graph
        { id: 3, route: "FL", effort: "WAT", dl: 3, progressionStep: 3 }, // invalid → off-graph
        { id: 4, route: "FL", effort: "ISO", dl: 4, progressionStep: 4 },
      ]),
    );
    expect(nodes.map((n) => n.id).sort((a, b) => a - b)).toEqual([1, 4]);
    expect(nodes.map((n) => n.effort).sort()).toEqual(["CON", "ISO"]);
  });

  it("skips non-finite id and empty route (new partition axis)", () => {
    const nodes = readExerciseNodes(
      asResult([
        {
          id: Number.NaN,
          route: "FL",
          effort: "CON",
          dl: 1,
          progressionStep: 1,
        },
        { id: 2, route: "", effort: "CON", dl: 2, progressionStep: 2 }, // empty route → off-graph
        { id: 3, route: "FL", effort: "CON", dl: 3, progressionStep: 3 },
      ]),
    );
    expect(nodes.map((n) => n.id)).toEqual([3]);
    expect(nodes[0].route).toBe("FL");
  });

  it("keeps a NULL progression_step as null (linear routes), never coerces to 0", () => {
    const nodes = readExerciseNodes(
      asResult([
        { id: 1, route: "PS", effort: "CON", dl: 5, progressionStep: null },
        {
          id: 2,
          route: "PS",
          effort: "CON",
          dl: 7,
          progressionStep: undefined,
        },
      ]),
    );
    expect(nodes).toHaveLength(2);
    expect(nodes.every((n) => n.progressionStep === null)).toBe(true);
  });

  it("returns [] for a non-array or malformed result", () => {
    expect(readExerciseNodes(null)).toEqual([]);
    expect(readExerciseNodes([null])).toEqual([]);
    expect(readExerciseNodes("nope")).toEqual([]);
  });
});

/**
 * Pure unit tests for `readManualEdgePartitionRows` — narrows the locked-partition
 * query result. A locked partition is keyed by (route, effort); rows with an empty
 * route or an invalid/empty effort must be skipped so a bad row can never (fail to)
 * lock a partition silently.
 */
describe("readManualEdgePartitionRows (locked-partition narrowing)", () => {
  function asResult(rows: unknown[]): unknown {
    return [rows, []];
  }

  it("keeps valid (route, effort) rows and skips empty route / invalid effort", () => {
    const parts = readManualEdgePartitionRows(
      asResult([
        { route: "FL", effort: "CON" },
        { route: "", effort: "CON" }, // empty route → skip
        { route: "MU", effort: "" }, // empty effort → skip
        { route: "PL", effort: "WAT" }, // invalid effort → skip
        { route: "BL", effort: "ISO" },
      ]),
    );
    expect(parts).toEqual([
      { route: "FL", effort: "CON" },
      { route: "BL", effort: "ISO" },
    ]);
  });

  it("returns [] for a non-array or malformed result", () => {
    expect(readManualEdgePartitionRows(null)).toEqual([]);
    expect(readManualEdgePartitionRows([null])).toEqual([]);
    expect(readManualEdgePartitionRows("nope")).toEqual([]);
  });
});
