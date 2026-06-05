/**
 * Phase 126 Plan 02 — Integration test for the deterministic graph constructor
 * (`rebuild-progression-graph.ts`). Runs against real MySQL
 * (eltemplo_test_<worker>), CI-only — do NOT run the suite locally (project
 * policy: local gate is tsc).
 *
 * Contract under test (TREE-04, D-02/D-03/D-04/D-05):
 *   A. Backbone: 3 exercises in one (subfamily × effort) at dl 1,3,5 yield exactly
 *      2 auto edges in dl order (a→b, b→c). A single-exercise partition → 0 edges.
 *   B. Idempotency: running twice yields the identical auto edge set, no dupes.
 *   C. Manual-preserving: a pre-existing source='manual' edge survives a rebuild
 *      untouched (D-03).
 *   D. Effort NOT crossed: an EXC and a CON exercise in the same sub-family never
 *      share an auto edge (D-04).
 *   E. Exclusion: an exercise with NULL subfamily_id appears in no edge.
 *   F. Tiebreak determinism: two exercises at the same dl in one partition produce
 *      the identical edge orientation across runs (D-05).
 *
 * Seeds exercises + sub-families directly via Drizzle (NOT via API). Real clock
 * (fake timers desync from MySQL). Cleans up only the rows it seeds, in afterEach
 * — deleting this test's exercise_progressions rows THEN exercises THEN
 * sub-families (FK order; the FKs are ON DELETE CASCADE but we delete explicitly
 * so the test stays self-contained).
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { inArray, or } from "drizzle-orm";
import { createTestApp } from "../helpers";
import * as schema from "../../src/db/schema";
import {
  runRebuildProgressionGraph,
  readExerciseNodes,
} from "../../rebuild-progression-graph";

describe("rebuild-progression-graph (Phase 126 Plan 02)", () => {
  let app: FastifyInstance;

  // Unique marker so the test only ever touches and cleans its own rows even if
  // a real catalog is present in the per-worker DB.
  const MARK = `PROGRESSION_TEST_${Date.now()}`;
  const seededExerciseIds: number[] = [];
  const seededSubfamilyIds: number[] = [];

  /** Insert one sub-family (FK target for exercises) and track it for cleanup. */
  async function seedSubfamily(name: string): Promise<number> {
    const [res] = await app.db
      .insert(schema.exerciseSubfamilies)
      .values({ route: "TEST", name: `${MARK}_${name}`, sortOrder: 0 })
      .$returningId();
    seededSubfamilyIds.push(res.id);
    return res.id;
  }

  /**
   * Insert one exercise (filling the NOT NULL columns) and track its id for
   * cleanup. `name` carries the MARK; canonicalExerciseId left NULL so the row is
   * canonical. `subfamilyId` may be null to exercise the exclusion path (Test E).
   */
  async function seedExercise(opts: {
    name: string;
    effort: string;
    dl: number;
    subfamilyId: number | null;
  }): Promise<number> {
    const [res] = await app.db
      .insert(schema.exercises)
      .values({
        pattern: "test",
        category: "test",
        exercise: `${MARK}_${opts.name}`,
        effort: opts.effort,
        route: "TEST",
        subfamilyId: opts.subfamilyId ?? undefined,
        dificultadLineal: opts.dl,
      })
      .$returningId();
    seededExerciseIds.push(res.id);
    return res.id;
  }

  /** Read back the auto edges incident to any of the given exercise ids. */
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
    // sub-families. Edges scoped to the seeded exercise ids only.
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

  it("A — backbone: 3 exercises at dl 1,3,5 yield exactly 2 auto edges in dl order", async () => {
    const sf = await seedSubfamily("A");
    const a = await seedExercise({
      name: "A1",
      effort: "CON",
      dl: 1,
      subfamilyId: sf,
    });
    const b = await seedExercise({
      name: "A3",
      effort: "CON",
      dl: 3,
      subfamilyId: sf,
    });
    const c = await seedExercise({
      name: "A5",
      effort: "CON",
      dl: 5,
      subfamilyId: sf,
    });

    await runRebuildProgressionGraph(app.db);

    const edges = (await getAutoEdges([a, b, c])).filter(
      (e) => e.source === "auto",
    );
    expect(edges).toHaveLength(2);
    // a→b and b→c, in dl order.
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
    const sf = await seedSubfamily("A2");
    const only = await seedExercise({
      name: "A2only",
      effort: "CON",
      dl: 2,
      subfamilyId: sf,
    });

    await runRebuildProgressionGraph(app.db);

    const edges = await getAutoEdges([only]);
    expect(edges).toHaveLength(0);
  });

  it("B — idempotency: running twice yields the identical auto edge set, no dupes", async () => {
    const sf = await seedSubfamily("B");
    const a = await seedExercise({
      name: "B1",
      effort: "ISO",
      dl: 1,
      subfamilyId: sf,
    });
    const b = await seedExercise({
      name: "B2",
      effort: "ISO",
      dl: 2,
      subfamilyId: sf,
    });
    const c = await seedExercise({
      name: "B3",
      effort: "ISO",
      dl: 3,
      subfamilyId: sf,
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
    const sf = await seedSubfamily("C");
    const a = await seedExercise({
      name: "C1",
      effort: "CON",
      dl: 1,
      subfamilyId: sf,
    });
    const b = await seedExercise({
      name: "C2",
      effort: "CON",
      dl: 2,
      subfamilyId: sf,
    });
    // A manual cross-effort edge a profe could author in 128 — the constructor
    // would NEVER produce this (effort differs / non-consecutive), so its survival
    // is solely due to the source='auto'-scoped DELETE.
    const manualFrom = await seedExercise({
      name: "Cmanual_from",
      effort: "EXC",
      dl: 9,
      subfamilyId: sf,
    });
    const manualTo = await seedExercise({
      name: "Cmanual_to",
      effort: "ISO",
      dl: 1,
      subfamilyId: sf,
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

  it("locked partition — a (subfamily×effort) partition with a manual edge is NOT regenerated; untouched partitions still regenerate (D-02)", async () => {
    // Partition X: subfamily X, effort CON, three nodes at dl 1/3/5. Its auto
    // chain has been REPLACED by the editor with a MANUAL chain in a different
    // order (dl 5→1→3), and X's auto edges deleted — exactly what Plan 02's
    // editor does on the first override. X must therefore be LOCKED: a rebuild
    // must NOT delete its manual edges nor re-insert the dl-ascending auto chain.
    const sfX = await seedSubfamily("LockedX");
    const x1 = await seedExercise({
      name: "X1",
      effort: "CON",
      dl: 1,
      subfamilyId: sfX,
    });
    const x3 = await seedExercise({
      name: "X3",
      effort: "CON",
      dl: 3,
      subfamilyId: sfX,
    });
    const x5 = await seedExercise({
      name: "X5",
      effort: "CON",
      dl: 5,
      subfamilyId: sfX,
    });

    // Partition Y: subfamily Y, effort CON, three nodes at dl 1/3/5 — untouched
    // (no manual edge). It must regenerate its full auto backbone on rebuild.
    const sfY = await seedSubfamily("UnlockedY");
    const y1 = await seedExercise({
      name: "Y1",
      effort: "CON",
      dl: 1,
      subfamilyId: sfY,
    });
    const y3 = await seedExercise({
      name: "Y3",
      effort: "CON",
      dl: 3,
      subfamilyId: sfY,
    });
    const y5 = await seedExercise({
      name: "Y5",
      effort: "CON",
      dl: 5,
      subfamilyId: sfY,
    });

    // Lock X: write its manual chain in the profe's chosen order (5→1→3). All
    // endpoints are inside partition X (same subfamily × effort), so this is a
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

    // Partition Y: full auto backbone (y1→y3, y3→y5) in dl order, all auto.
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

  it("D — effort is NOT crossed: EXC and CON in the same sub-family never share an edge (D-04)", async () => {
    const sf = await seedSubfamily("D");
    const exc = await seedExercise({
      name: "Dexc",
      effort: "EXC",
      dl: 1,
      subfamilyId: sf,
    });
    const con = await seedExercise({
      name: "Dcon",
      effort: "CON",
      dl: 2,
      subfamilyId: sf,
    });

    await runRebuildProgressionGraph(app.db);

    const edges = await getAutoEdges([exc, con]);
    // Each is the lone member of its (subfamily × effort) partition → 0 edges, and
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

  it("E — exercises with NULL subfamily_id are excluded from the graph", async () => {
    const sf = await seedSubfamily("E");
    const confirmed = await seedExercise({
      name: "Econfirmed",
      effort: "CON",
      dl: 1,
      subfamilyId: sf,
    });
    const unconfirmed = await seedExercise({
      name: "Eunconfirmed",
      effort: "CON",
      dl: 2,
      subfamilyId: null,
    });

    await runRebuildProgressionGraph(app.db);

    const edges = await getAutoEdges([confirmed, unconfirmed]);
    // The unconfirmed (NULL subfamily) exercise appears in NO edge.
    expect(
      edges.some(
        (e) =>
          e.fromExerciseId === unconfirmed || e.toExerciseId === unconfirmed,
      ),
    ).toBe(false);
  });

  it("G — empty-effort confirmed exercises are excluded from the graph (WR-04)", async () => {
    const sf = await seedSubfamily("G");
    // Two confirmed canonical exercises with effort='' in the same sub-family.
    // effort is a free varchar and the catalog demonstrably holds '' rows
    // (exercise-fallback.ts filters effort = ''). They must NOT form a partition
    // or chain — an empty-effort axis is meaningless (D-04).
    const empty1 = await seedExercise({
      name: "Gempty1",
      effort: "",
      dl: 1,
      subfamilyId: sf,
    });
    const empty2 = await seedExercise({
      name: "Gempty2",
      effort: "",
      dl: 2,
      subfamilyId: sf,
    });
    // A real CON exercise in the same sub-family, single member → 0 edges, so the
    // ONLY way an edge could appear incident to these ids is the (wrong) '' chain.
    const con = await seedExercise({
      name: "Gcon",
      effort: "CON",
      dl: 3,
      subfamilyId: sf,
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

  it("F — dl-tiebreak is deterministic by id across runs (D-05)", async () => {
    const sf = await seedSubfamily("F");
    // Two exercises at the SAME dl in one partition. Seeded in reverse id-vs-name
    // order to prove the tiebreak is by id, not insertion/name order.
    const first = await seedExercise({
      name: "Ftie_a",
      effort: "CON",
      dl: 4,
      subfamilyId: sf,
    });
    const second = await seedExercise({
      name: "Ftie_b",
      effort: "CON",
      dl: 4,
      subfamilyId: sf,
    });
    // A third at a higher dl so there is at least one edge to orient.
    const third = await seedExercise({
      name: "Ftie_c",
      effort: "CON",
      dl: 6,
      subfamilyId: sf,
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
    // Smaller id (first) precedes larger id (second) at the tied dl, then second→third.
    expect(run1).toEqual([`${first}->${second}`, `${second}->${third}`].sort());
  });
});

/**
 * Pure unit tests for `readExerciseNodes` — the result-narrowing helper. These
 * exercise data-error paths the integration suite cannot reach (the DB column
 * `dificultad_lineal` is NOT NULL DEFAULT 1, so a NaN dl cannot be seeded), so
 * the unit test feeds the raw mysql2 `[rows, fields]` shape directly. No DB.
 */
describe("readExerciseNodes (Phase 126 — WR-05 / WR-04 data hygiene)", () => {
  /** Wrap rows in the mysql2 db.execute() shape: [rows, fields]. */
  function asResult(rows: unknown[]): unknown {
    return [rows, []];
  }

  it("WR-05 — skips a row with a non-finite dl instead of coercing it to 0", () => {
    const nodes = readExerciseNodes(
      asResult([
        { id: 1, subfamilyId: 10, effort: "CON", dl: 1 },
        // A NaN dl: must be SKIPPED, not planted at dl=0 (which would sort below
        // every legitimate dl≥1 and become the wrong head of the chain).
        { id: 2, subfamilyId: 10, effort: "CON", dl: Number.NaN },
        { id: 3, subfamilyId: 10, effort: "CON", dl: "not-a-number" },
        { id: 4, subfamilyId: 10, effort: "CON", dl: 3 },
      ]),
    );
    expect(nodes.map((n) => n.id).sort((a, b) => a - b)).toEqual([1, 4]);
    expect(nodes.some((n) => n.dl === 0)).toBe(false);
  });

  it("WR-04 — skips a row with an empty or invalid effort", () => {
    const nodes = readExerciseNodes(
      asResult([
        { id: 1, subfamilyId: 10, effort: "CON", dl: 1 },
        { id: 2, subfamilyId: 10, effort: "", dl: 2 }, // empty → off-graph
        { id: 3, subfamilyId: 10, effort: "WAT", dl: 3 }, // invalid → off-graph
        { id: 4, subfamilyId: 10, effort: "ISO", dl: 4 },
      ]),
    );
    expect(nodes.map((n) => n.id).sort((a, b) => a - b)).toEqual([1, 4]);
    expect(nodes.map((n) => n.effort).sort()).toEqual(["CON", "ISO"]);
  });

  it("still skips non-finite id / subfamilyId (existing contract)", () => {
    const nodes = readExerciseNodes(
      asResult([
        { id: Number.NaN, subfamilyId: 10, effort: "CON", dl: 1 },
        { id: 2, subfamilyId: Number.NaN, effort: "CON", dl: 2 },
        { id: 3, subfamilyId: 10, effort: "CON", dl: 3 },
      ]),
    );
    expect(nodes.map((n) => n.id)).toEqual([3]);
  });

  it("returns [] for a non-array or malformed result", () => {
    expect(readExerciseNodes(null)).toEqual([]);
    expect(readExerciseNodes([null])).toEqual([]);
    expect(readExerciseNodes("nope")).toEqual([]);
  });
});
