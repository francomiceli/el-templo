/**
 * rebuild-progression-graph.ts -- Deterministic constructor of the v5.1 skill-tree
 * progression graph (DAG), Phase 126 Plan 02 (TREE-04).
 *
 * Reads the confirmed 3-dimension decomposition on `exercises` and writes the
 * LINEAR BACKBONE of the DAG into `exercise_progressions` as `source='auto'`
 * edges: one chain per `(subfamily_id × effort)` partition, connecting exercises
 * consecutively in ascending `dificultad_lineal` order (D-02). It derives ONLY
 * the linear backbone -- there are NO speculative cross-edges between partitions
 * or across effort; cross-family/cross-effort edges are profe work in phase 128.
 *
 * Regenerable + manual-preserving (D-03): the write step DELETEs and re-inserts
 * ONLY `source='auto'` edges inside a single transaction, so re-running converges
 * to the same auto backbone (the edge UNIQUE backs the dedupe) and never touches
 * `source='manual'` edges authored by profes in 128.
 *
 * Determinism (D-04/D-05):
 *   - effort is NEVER crossed: an EXC and a CON exercise in the same sub-family
 *     live in different partitions and never share an auto edge (D-04).
 *   - `dl` ties within a partition are broken by a stable secondary key (`id`,
 *     smaller first) so the chain orientation is identical across runs (D-05).
 *
 * Node scope (D-01/Discretion): only CONFIRMED canonical exercises participate --
 * rows with NULL `subfamily_id` (unconfirmed) are excluded, and only canonical
 * rows (`canonical_exercise_id IS NULL`) are nodes; soft-merged dupes are not.
 *
 * console.log is acceptable here: this is a standalone one-off CLI maintenance
 * tool (analog `bootstrap-dimensions.ts`), NOT the API server. The "never
 * console.log" rule (CLAUDE.md) targets the server (request.log / app.log) and
 * the frontend apps.
 *
 * Usage: npx tsx rebuild-progression-graph.ts
 * Works against any environment via .env DATABASE_URL -- it prints the
 * to-process / will-write counts BEFORE mutating.
 */

import "dotenv/config";
import { createSingleConnection } from "./src/db/index";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

/** A confirmed-canonical exercise row (only the columns the constructor needs). */
export interface ExerciseNode {
  id: number;
  subfamilyId: number;
  effort: string;
  dl: number;
}

/** A single directed auto edge the constructor decided to insert. */
interface EdgeToInsert {
  fromExerciseId: number;
  toExerciseId: number;
}

/**
 * Rebuild the auto backbone of the progression graph against an open Drizzle
 * connection. Exported so the integration test can drive it against the
 * per-worker test DB without spawning a process. Generic over the schema so both
 * the app's typed db and a bare createSingleConnection() db are accepted.
 */
export async function runRebuildProgressionGraph<
  TSchema extends Record<string, unknown>,
>(db: MySql2Database<TSchema>): Promise<void> {
  // ── 1. READ confirmed canonical exercises (read-only report before mutate) ──
  //
  // Only nodes that are CONFIRMED (subfamily_id IS NOT NULL) and CANONICAL
  // (canonical_exercise_id IS NULL, D-01) participate in the graph. The effort
  // axis MUST be a real contraction (CON/EXC/ISO): `effort` is a free
  // varchar(10) and the catalog demonstrably holds empty-effort rows (see
  // exercise-fallback.ts filtering effort = ''), so an empty/invalid-effort row
  // is off-graph and must NEVER form a partition/backbone (WR-04, D-04).
  const exerciseRows = await db.execute(
    sql`SELECT id, subfamily_id AS subfamilyId, effort, dificultad_lineal AS dl
        FROM exercises
        WHERE subfamily_id IS NOT NULL
          AND canonical_exercise_id IS NULL
          AND effort IN ('CON', 'EXC', 'ISO')`,
  );
  const nodes = readExerciseNodes(exerciseRows);

  // ── 2. TRANSFORM (pure, in-memory, deterministic, NO inference -- D-02) ──
  //
  // Partition by the composite key (subfamilyId × effort) so effort is NEVER
  // crossed (D-04). Within each partition order by dl ascending with a stable
  // id tiebreak (D-05), then emit the consecutive linear backbone.
  const edges = buildBackboneEdges(nodes);

  console.log(`\n=== Rebuild Progression Graph (Phase 126 Plan 02) ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Confirmed canonical exercises (nodes): ${nodes.length}`);
  console.log(`Partitions (subfamily × effort): ${countPartitions(nodes)}`);
  console.log(`Auto backbone edges to write: ${edges.length}\n`);

  // ── 3. WRITE -- replace ONLY source='auto' edges, never touch manual (D-03) ──
  //
  // The DELETE-then-INSERT runs in a single transaction so a concurrent reader
  // never sees a half-rebuilt graph, and a mid-run failure rolls back cleanly.
  // The edge UNIQUE (from, to) guarantees no duplicates within the auto set.
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`DELETE FROM exercise_progressions WHERE source = 'auto'`,
    );
    for (const edge of edges) {
      await tx.execute(
        sql`INSERT INTO exercise_progressions
              (from_exercise_id, to_exercise_id, source)
            VALUES (${edge.fromExerciseId}, ${edge.toExerciseId}, 'auto')`,
      );
    }
  });

  console.log(
    `Rebuild complete: ${edges.length} auto edges written (manual edges untouched).`,
  );
}

/**
 * Partition the nodes by (subfamilyId × effort), order each partition by dl
 * ascending with a stable id tiebreak (D-05), and emit the consecutive linear
 * backbone (from = element[i], to = element[i+1]). A single-node partition emits
 * 0 edges. Pure and deterministic -- no inference, no cross-partition edges (D-02).
 */
function buildBackboneEdges(nodes: ExerciseNode[]): EdgeToInsert[] {
  const partitions = new Map<string, ExerciseNode[]>();
  for (const node of nodes) {
    // effort is part of the key, so EXC and CON never share a partition (D-04).
    const key = `${node.subfamilyId}|${node.effort}`;
    const bucket = partitions.get(key);
    if (bucket) {
      bucket.push(node);
    } else {
      partitions.set(key, [node]);
    }
  }

  const edges: EdgeToInsert[] = [];
  for (const bucket of partitions.values()) {
    // Stable order: primary key dl ascending, deterministic tiebreak by id (D-05).
    bucket.sort((a, b) => (a.dl !== b.dl ? a.dl - b.dl : a.id - b.id));
    for (let i = 0; i < bucket.length - 1; i += 1) {
      edges.push({
        fromExerciseId: bucket[i].id,
        toExerciseId: bucket[i + 1].id,
      });
    }
  }
  return edges;
}

/** Distinct (subfamilyId × effort) partition count, for the report only. */
function countPartitions(nodes: ExerciseNode[]): number {
  const keys = new Set<string>();
  for (const node of nodes) keys.add(`${node.subfamilyId}|${node.effort}`);
  return keys.size;
}

/** The only effort values that are valid contraction partition axes (D-04). */
const VALID_EFFORTS = new Set<string>(["CON", "EXC", "ISO"]);

/**
 * Narrow a mysql2 db.execute() result into typed exercise nodes without `any`
 * (CLAUDE.md TS rule). The driver returns [rows, fields]; rows is our array.
 * Rows with a non-finite id, non-finite subfamilyId, non-finite dl, or an
 * invalid/empty effort are SKIPPED defensively as data errors — never coerced.
 * The READ already filters NULL subfamily_id and non-contraction effort, but
 * the skips are explicit here so a bad row can never silently distort a chain.
 */
export function readExerciseNodes(result: unknown): ExerciseNode[] {
  if (!Array.isArray(result)) return [];
  const rows = result[0];
  if (!Array.isArray(rows)) return [];
  const out: ExerciseNode[] = [];
  for (const raw of rows) {
    if (typeof raw !== "object" || raw === null) continue;
    const rec = raw as Record<string, unknown>;
    const id = Number(rec.id);
    const subfamilyId = Number(rec.subfamilyId);
    const dl = Number(rec.dl);
    const effort = typeof rec.effort === "string" ? rec.effort : "";
    // Skip data errors instead of fabricating a default. A non-finite dl coerced
    // to 0 would sort BELOW every legitimate dl (which start at 1) and silently
    // plant the row at the head of its chain (WR-05). An empty/invalid effort is
    // off-graph and must not form a partition (WR-04). dl is NOT NULL DEFAULT 1
    // in the schema, so the dl skip should be unreachable — skipping is strictly
    // safer than inventing an ordering key.
    if (!Number.isFinite(id) || !Number.isFinite(subfamilyId)) continue;
    if (!Number.isFinite(dl)) continue;
    if (!VALID_EFFORTS.has(effort)) continue;
    out.push({ id, subfamilyId, effort, dl });
  }
  return out;
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { db, connection } = await createSingleConnection();
  try {
    await runRebuildProgressionGraph(db);
  } finally {
    await connection.end();
  }
}

// Only run the CLI when executed directly (not when imported by the test).
if (
  process.argv[1] &&
  process.argv[1].endsWith("rebuild-progression-graph.ts")
) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Rebuild failed: ${message}`);
    process.exit(1);
  });
}
