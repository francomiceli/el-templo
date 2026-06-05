/**
 * rebuild-progression-graph.ts -- Deterministic constructor of the skill-tree
 * progression graph (DAG), reworked for "Progresión por ruta + Habilidad".
 *
 * Reads the confirmed per-route progression on `exercises` and writes the LINEAR
 * BACKBONE of the DAG into `exercise_progressions` as `source='auto'` edges: one
 * chain per `(route × effort)` partition, connecting exercises consecutively in
 * ascending `(progression_step, dificultad_lineal)` order (D-02). It derives ONLY
 * the linear backbone -- NO speculative cross-edges between partitions or across
 * effort; those are profe work in phase 128.
 *
 * Regenerable + manual-preserving (D-03): the write step DELETEs and re-inserts
 * ONLY `source='auto'` edges inside a single transaction, so re-running converges
 * and never touches `source='manual'` edges authored by profes.
 *
 * Determinism (D-04/D-05):
 *   - effort is NEVER crossed: an EXC and a CON exercise in the same route live
 *     in different partitions and never share an auto edge (D-04).
 *   - within a partition, order by `progression_step` (NULL for linear/leg routes,
 *     which then order by `dl`), then `dl`, then `id` as a stable tiebreak (D-05).
 *
 * Node scope (backbone): only exercises ON the per-route progression participate —
 *   canonical_exercise_id IS NULL  (canonical only)
 *   AND effort IN ('CON','EXC','ISO')
 *   AND habilidad IS NULL          (Habilidad variants are parallel, off-backbone)
 *   AND routes.excluded_from_tree = false  (movilidad/games fuera del árbol)
 *
 * console.log is acceptable here: standalone one-off CLI maintenance tool, NOT the
 * API server.
 *
 * Usage: npx tsx rebuild-progression-graph.ts
 */

import "dotenv/config";
import { createSingleConnection } from "./src/db/index";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

/** A backbone exercise row (only the columns the constructor needs). */
export interface ExerciseNode {
  id: number;
  route: string;
  effort: string;
  dl: number;
  /** Step rank within (route × effort); NULL for linear routes (order by dl). */
  progressionStep: number | null;
}

/** A single directed auto edge the constructor decided to insert. */
interface EdgeToInsert {
  fromExerciseId: number;
  toExerciseId: number;
}

/**
 * A same-partition manual edge, narrowed to the partition coordinates of its FROM
 * endpoint. Used only to derive the LOCKED partition set (D-02). A partition
 * `(route × effort)` is LOCKED when at least one manual edge has BOTH its FROM and
 * TO nodes inside that same partition (a manual chain rewrite, D-03). Cross-
 * partition manual precedence edges (D-04) do NOT lock either endpoint's backbone.
 */
interface ManualEdgePartition {
  route: string;
  effort: string;
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
  // ── 1. READ backbone nodes (read-only report before mutate) ──
  const exerciseRows = await db.execute(
    sql`SELECT e.id,
               e.route AS route,
               e.effort,
               e.dificultad_lineal AS dl,
               e.progression_step AS progressionStep
        FROM exercises e
        JOIN routes r ON r.code = e.route
        WHERE e.canonical_exercise_id IS NULL
          AND e.effort IN ('CON', 'EXC', 'ISO')
          AND e.habilidad IS NULL
          AND r.excluded_from_tree = 0`,
  );
  const nodes = readExerciseNodes(exerciseRows);

  // ── 1b. READ the LOCKED partition set (D-02) ─────────────────────────────────
  const manualEdgePartitions = await readManualEdgePartitions(db);
  const lockedPartitions = new Set<string>();
  for (const mep of manualEdgePartitions) {
    lockedPartitions.add(`${mep.route}|${mep.effort}`);
  }

  // ── 2. TRANSFORM (pure, in-memory, deterministic, NO inference -- D-02) ──
  const edges = buildBackboneEdges(nodes, lockedPartitions);

  // Auto edges are deleted+reinserted ONLY for UNLOCKED partitions.
  const unlockedNodeIds = nodes
    .filter((n) => !lockedPartitions.has(`${n.route}|${n.effort}`))
    .map((n) => n.id);

  console.log(`\n=== Rebuild Progression Graph (Progresión por ruta) ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Backbone exercises (nodes): ${nodes.length}`);
  console.log(`Partitions (route × effort): ${countPartitions(nodes)}`);
  console.log(
    `Locked partitions (own a manual edge, skipped): ${lockedPartitions.size}`,
  );
  console.log(
    `Auto backbone edges to write (unlocked only): ${edges.length}\n`,
  );

  // ── 3. WRITE -- regenerate auto edges ONLY for unlocked partitions (D-02/D-03) ──
  await db.transaction(async (tx) => {
    // Guard against an empty IN list (no unlocked nodes → nothing to delete).
    if (unlockedNodeIds.length > 0) {
      await tx.execute(
        sql`DELETE FROM exercise_progressions
            WHERE source = 'auto'
              AND from_exercise_id IN (${sql.join(unlockedNodeIds, sql`, `)})`,
      );
    }
    for (const edge of edges) {
      await tx.execute(
        sql`INSERT INTO exercise_progressions
              (from_exercise_id, to_exercise_id, source)
            VALUES (${edge.fromExerciseId}, ${edge.toExerciseId}, 'auto')`,
      );
    }
  });

  console.log(
    `Rebuild complete: ${edges.length} auto edges written for unlocked partitions; ` +
      `${lockedPartitions.size} locked partitions left untouched (manual edges preserved).`,
  );
}

/**
 * Read the LOCKED partition coordinates from `exercise_progressions` (D-02).
 *
 * A partition is locked when a `source='manual'` edge has BOTH endpoints in the
 * same `(route × effort)` partition — a same-partition chain rewrite (D-03). Both
 * endpoints must be backbone nodes (canonical, valid effort, habilidad IS NULL),
 * matching the node READ above. Cross-partition manual precedence edges (D-04) are
 * excluded by the same-route/same-effort predicate, so they never lock a backbone.
 */
async function readManualEdgePartitions<
  TSchema extends Record<string, unknown>,
>(db: MySql2Database<TSchema>): Promise<ManualEdgePartition[]> {
  const rows = await db.execute(
    sql`SELECT ef.route AS route, ef.effort AS effort
        FROM exercise_progressions ep
        JOIN exercises ef ON ef.id = ep.from_exercise_id
        JOIN exercises et ON et.id = ep.to_exercise_id
        WHERE ep.source = 'manual'
          AND ef.canonical_exercise_id IS NULL
          AND et.canonical_exercise_id IS NULL
          AND ef.habilidad IS NULL
          AND et.habilidad IS NULL
          AND ef.route = et.route
          AND ef.effort = et.effort
          AND ef.effort IN ('CON', 'EXC', 'ISO')`,
  );
  return readManualEdgePartitionRows(rows);
}

/**
 * Narrow a mysql2 db.execute() result into typed locked-partition coordinates
 * without `any`. Rows with an empty route or an invalid/empty effort are SKIPPED
 * defensively so a bad row can never lock (or fail to lock) a partition silently.
 */
export function readManualEdgePartitionRows(
  result: unknown,
): ManualEdgePartition[] {
  if (!Array.isArray(result)) return [];
  const rows = result[0];
  if (!Array.isArray(rows)) return [];
  const out: ManualEdgePartition[] = [];
  for (const raw of rows) {
    if (typeof raw !== "object" || raw === null) continue;
    const rec = raw as Record<string, unknown>;
    const route = typeof rec.route === "string" ? rec.route : "";
    const effort = typeof rec.effort === "string" ? rec.effort : "";
    if (route === "") continue;
    if (!VALID_EFFORTS.has(effort)) continue;
    out.push({ route, effort });
  }
  return out;
}

/**
 * Partition the nodes by (route × effort), order each partition by
 * (progression_step, dl, id) (D-05), and emit the consecutive linear backbone
 * (from = element[i], to = element[i+1]). A single-node partition emits 0 edges.
 * Pure and deterministic -- no inference, no cross-partition edges (D-02).
 *
 * `lockedPartitions` holds the `${route}|${effort}` keys of partitions that own a
 * manual edge (D-02). Any node whose partition key is locked emits NO backbone
 * edges — the profe's manual chain owns that partition's order.
 */
function buildBackboneEdges(
  nodes: ExerciseNode[],
  lockedPartitions: ReadonlySet<string>,
): EdgeToInsert[] {
  const partitions = new Map<string, ExerciseNode[]>();
  for (const node of nodes) {
    // effort is part of the key, so EXC and CON never share a partition (D-04).
    const key = `${node.route}|${node.effort}`;
    // Skip locked partitions entirely — no auto backbone is emitted for them.
    if (lockedPartitions.has(key)) continue;
    const bucket = partitions.get(key);
    if (bucket) {
      bucket.push(node);
    } else {
      partitions.set(key, [node]);
    }
  }

  const edges: EdgeToInsert[] = [];
  for (const bucket of partitions.values()) {
    // Stable order: progression_step ascending (NULL = linear → falls to dl),
    // then dl ascending, then id as a deterministic tiebreak (D-05). Within a
    // partition all nodes share a route → same strategy → step is all-NULL or
    // all-int, so NULL/int never mix.
    bucket.sort((a, b) => {
      if (
        a.progressionStep !== null &&
        b.progressionStep !== null &&
        a.progressionStep !== b.progressionStep
      ) {
        return a.progressionStep - b.progressionStep;
      }
      if (a.dl !== b.dl) return a.dl - b.dl;
      return a.id - b.id;
    });
    for (let i = 0; i < bucket.length - 1; i += 1) {
      edges.push({
        fromExerciseId: bucket[i].id,
        toExerciseId: bucket[i + 1].id,
      });
    }
  }
  return edges;
}

/** Distinct (route × effort) partition count, for the report only. */
function countPartitions(nodes: ExerciseNode[]): number {
  const keys = new Set<string>();
  for (const node of nodes) keys.add(`${node.route}|${node.effort}`);
  return keys.size;
}

/** The only effort values that are valid contraction partition axes (D-04). */
const VALID_EFFORTS = new Set<string>(["CON", "EXC", "ISO"]);

/**
 * Narrow a mysql2 db.execute() result into typed exercise nodes without `any`.
 * Rows with a non-finite id, non-finite dl, or an invalid/empty effort are SKIPPED
 * defensively. progression_step may be NULL (linear routes) — kept as null.
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
    const dl = Number(rec.dl);
    const route = typeof rec.route === "string" ? rec.route : "";
    const effort = typeof rec.effort === "string" ? rec.effort : "";
    // progression_step is nullable (NULL for linear routes); keep null, never
    // coerce a NULL to 0 (which would plant the row at the head of its chain).
    const rawStep = rec.progressionStep;
    const stepNum =
      rawStep === null || rawStep === undefined ? null : Number(rawStep);
    const progressionStep =
      stepNum !== null && Number.isFinite(stepNum) ? stepNum : null;
    if (!Number.isFinite(id) || !Number.isFinite(dl)) continue;
    if (route === "") continue;
    if (!VALID_EFFORTS.has(effort)) continue;
    out.push({ id, route, effort, dl, progressionStep });
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
