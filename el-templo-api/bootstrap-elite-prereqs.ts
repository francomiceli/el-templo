/**
 * bootstrap-elite-prereqs.ts — Seed the manual cross-route prerequisite edges
 * for the ELITE routes (R4, phase 133).
 *
 * The elite routes start high on the linear-difficulty scale (FLR at dl 5,
 * PLPU at dl 4 — verified in 133-RESEARCH) instead of filling in low steps:
 * the member reaches them THROUGH the base route. This CLI declares that
 * relationship as data, reproducing by script exactly what a profe would do
 * through POST /admin/tree-editor/precedence (setPrecedenceEdge semantics: a
 * single `source='manual'` cross-partition edge).
 *
 * Deterministic rule per pair, for effort 'CON':
 *   - TARGET = the FIRST backbone exercise of the elite route by
 *     (dificultad_lineal ASC, id ASC) within the backbone scope (canonical IS
 *     NULL, habilidad IS NULL, milestone_exercise_id IS NULL, route in tree).
 *   - SOURCE = the backbone exercise of the base route with the GREATEST
 *     dificultad_lineal STRICTLY BELOW target's (tie-break id ASC).
 * The rule respects the verified floors (FLR dl 5, PLPU dl 4) without
 * hardcoding the values — if the catalog shifts, the edge follows.
 *
 * Idempotent and curation-safe:
 *   - If ANY manual cross-route edge already points INTO the elite route, the
 *     whole pair is skipped — profes may have adjusted it, human criteria is
 *     never overridden (T-133-22).
 *   - The INSERT is guarded by WHERE NOT EXISTS over (from, to), backed by
 *     UNIQUE(from_exercise_id, to_exercise_id).
 *   - The CLI never DELETEs or UPDATEs edges.
 *   - A pair whose routes are missing or have no exercises in scope is
 *     skipped with a log, never a throw (resumable).
 *
 * console.log is acceptable here: standalone one-off CLI maintenance tool
 * (analog bootstrap-dimensions.ts), NOT the API server.
 *
 * Usage: npx tsx bootstrap-elite-prereqs.ts
 */

import "dotenv/config";
import { createSingleConnection } from "./src/db/index";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

/** The elite → base route pairs whose cross-route prerequisite is seeded. */
export const ELITE_PREREQS: readonly { elite: string; base: string }[] = [
  { elite: "FLR", base: "FL" },
  { elite: "PLPU", base: "PL" },
];

/** The contraction the prerequisite edge is anchored on. */
const EFFORT = "CON";

/** An (id, dl) row from a backbone scope query. */
interface ScopedExercise {
  id: number;
  dl: number;
}

/**
 * Run the elite-prerequisite seeding against an open Drizzle connection.
 * Exported so the integration test can drive it against the per-worker test DB
 * without spawning a process. Generic over the schema so both the app's typed
 * db and a bare createSingleConnection() db are accepted.
 */
export async function runBootstrapElitePrereqs<
  TSchema extends Record<string, unknown>,
>(db: MySql2Database<TSchema>): Promise<{ inserted: number; skipped: number }> {
  console.log(`\n=== Elite Prerequisite Bootstrap (cross-ruta R4) ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(
    `Pairs: ${ELITE_PREREQS.map((p) => `${p.base}→${p.elite}`).join(", ")} (effort ${EFFORT})`,
  );

  let inserted = 0;
  let skipped = 0;

  for (const pair of ELITE_PREREQS) {
    // 1. Never override human curation: if ANY manual cross-route edge already
    //    points into the elite route, skip the whole pair (T-133-22).
    const existingManual = await db.execute(
      sql`SELECT ep.id
          FROM exercise_progressions ep
          INNER JOIN exercises ef ON ef.id = ep.from_exercise_id
          INNER JOIN exercises et ON et.id = ep.to_exercise_id
          WHERE ep.source = 'manual'
            AND et.route = ${pair.elite}
            AND ef.route <> ${pair.elite}
          LIMIT 1`,
    );
    if (readRows(existingManual).length > 0) {
      console.log(
        `  ${pair.base}→${pair.elite}: SKIP (ya existe arista manual cross-ruta hacia ${pair.elite} — criterio humano intacto)`,
      );
      skipped += 1;
      continue;
    }

    // 2. TARGET: first elite backbone exercise by (dl ASC, id ASC).
    const targetRows = await db.execute(
      sql`SELECT e.id, e.dificultad_lineal AS dl
          FROM exercises e
          INNER JOIN routes r ON e.route = r.code
          WHERE e.route = ${pair.elite}
            AND e.effort = ${EFFORT}
            AND e.canonical_exercise_id IS NULL
            AND e.habilidad IS NULL
            AND e.milestone_exercise_id IS NULL
            AND r.excluded_from_tree = 0
          ORDER BY e.dificultad_lineal ASC, e.id ASC
          LIMIT 1`,
    );
    const target = readScopedExercise(targetRows);
    if (!target) {
      console.log(
        `  ${pair.base}→${pair.elite}: SKIP (ruta élite ${pair.elite} sin ejercicios en scope)`,
      );
      skipped += 1;
      continue;
    }

    // 3. SOURCE: base backbone exercise with the greatest dl strictly below
    //    the target's (tie-break id ASC).
    const sourceRows = await db.execute(
      sql`SELECT e.id, e.dificultad_lineal AS dl
          FROM exercises e
          INNER JOIN routes r ON e.route = r.code
          WHERE e.route = ${pair.base}
            AND e.effort = ${EFFORT}
            AND e.canonical_exercise_id IS NULL
            AND e.habilidad IS NULL
            AND e.milestone_exercise_id IS NULL
            AND r.excluded_from_tree = 0
            AND e.dificultad_lineal < ${target.dl}
          ORDER BY e.dificultad_lineal DESC, e.id ASC
          LIMIT 1`,
    );
    const source = readScopedExercise(sourceRows);
    if (!source) {
      console.log(
        `  ${pair.base}→${pair.elite}: SKIP (ruta base ${pair.base} sin ejercicios en scope con dl < ${target.dl})`,
      );
      skipped += 1;
      continue;
    }

    // 4. Idempotent INSERT of the single manual cross-route edge.
    const result = await db.execute(
      sql`INSERT INTO exercise_progressions (from_exercise_id, to_exercise_id, source)
          SELECT ${source.id}, ${target.id}, 'manual'
          WHERE NOT EXISTS (
            SELECT 1 FROM exercise_progressions
            WHERE from_exercise_id = ${source.id} AND to_exercise_id = ${target.id}
          )`,
    );
    const affected = readAffectedRows(result);
    if (affected > 0) {
      inserted += 1;
      console.log(
        `  ${pair.base}→${pair.elite}: INSERTED manual edge ${source.id} (dl ${source.dl}) → ${target.id} (dl ${target.dl})`,
      );
    } else {
      skipped += 1;
      console.log(
        `  ${pair.base}→${pair.elite}: SKIP (la arista ${source.id}→${target.id} ya existe)`,
      );
    }
  }

  console.log(
    `Bootstrap complete: ${inserted} edges inserted, ${skipped} pairs skipped (idempotent; never deletes/updates edges).`,
  );
  return { inserted, skipped };
}

/** Narrow a mysql2 db.execute() SELECT result into its row array (no `any`). */
function readRows(result: unknown): Record<string, unknown>[] {
  if (!Array.isArray(result)) return [];
  const rows = result[0];
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (raw): raw is Record<string, unknown> =>
      typeof raw === "object" && raw !== null,
  );
}

/** Narrow the first (id, dl) row of a scope query, or null when empty. */
function readScopedExercise(result: unknown): ScopedExercise | null {
  const rows = readRows(result);
  if (rows.length === 0) return null;
  const id = Number(rows[0].id);
  const dl = Number(rows[0].dl);
  if (!Number.isFinite(id) || !Number.isFinite(dl)) return null;
  return { id, dl };
}

/** Narrow a mysql2 INSERT result's affectedRows (ResultSetHeader, no `any`). */
function readAffectedRows(result: unknown): number {
  if (!Array.isArray(result)) return 0;
  const header = result[0];
  if (typeof header !== "object" || header === null) return 0;
  const affected = Number((header as Record<string, unknown>).affectedRows);
  return Number.isFinite(affected) ? affected : 0;
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { db, connection } = await createSingleConnection();
  try {
    await runBootstrapElitePrereqs(db);
  } finally {
    await connection.end();
  }
}

// Only run the CLI when executed directly (not when imported by the test).
if (process.argv[1] && process.argv[1].endsWith("bootstrap-elite-prereqs.ts")) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Bootstrap failed: ${message}`);
    process.exit(1);
  });
}
