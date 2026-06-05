/**
 * saneo-exercises.ts -- One-off catalog saneo for the v5.1 skill tree (Phase 124 Plan 02).
 *
 * Two idempotent, NON-destructive structural fixes over the ~1.493-row exercise
 * catalog, on the columns added by Plan 01 (migration 0137):
 *
 *   1. SOFT-MERGE of EXACT dupes (D-06/D-07): rows sharing the same
 *      exercise + dificultad_lineal + route + effort point at the MIN(id) of
 *      their group via `canonical_exercise_id`. The canonical row keeps a NULL
 *      pointer. ZERO deletes, zero id reassignment — exercises.id is FK-referenced
 *      by session_prescriptions.exercise_id and program_content_blocks.exercise_id
 *      (historical sessions/programs), so a delete would orphan them.
 *
 *   2. ROUTE DETECTION (D-08): exercises with an empty/placeholder `route` are
 *      MARKED `route_pending = 1`. We only DETECT + MARK — we never invent or
 *      write a `route`. The real route assignment is proposed by the LLM (125)
 *      and confirmed by coaches in the editor (128).
 *
 * Both writes are guarded (canonical_exercise_id IS NULL / route_pending = 0) so
 * re-running the script is a no-op on already-saneado rows (D-12). Reversible:
 * rollback = the column drops in the Plan 01 migration.
 *
 * A distinct `dificultad_lineal` of the same exercise is a legitimate progression
 * step of the chain (D-06) and is intentionally NOT treated as a dupe.
 *
 * console.log is acceptable here: this is a standalone one-off CLI maintenance
 * tool (analog `backfill-gender.ts`), NOT the API server. The "never console.log"
 * rule (CLAUDE.md) targets the server (request.log/app.log) and the frontend apps.
 *
 * Usage: npx tsx saneo-exercises.ts
 * Works against any environment via .env DATABASE_URL — but it is meant to be
 * inspected first: it prints the dupe-group and empty-route counts BEFORE mutating.
 */

import "dotenv/config";
import { createSingleConnection } from "./src/db/index";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

/**
 * Run the saneo against an open Drizzle connection. Exported so the integration
 * test can drive it against the per-worker test DB without spawning a process.
 * Generic over the schema so both the app's typed db and a bare
 * createSingleConnection() db are accepted.
 */
export async function runSaneo<TSchema extends Record<string, unknown>>(
  db: MySql2Database<TSchema>,
): Promise<void> {
  // ── 1. DETECTION + REPORT (read-only; lets a human eyeball before mutating) ──

  const dupeGroupRows = await db.execute(
    sql`SELECT COUNT(*) AS dupe_groups FROM (
          SELECT exercise, dificultad_lineal, route, effort
          FROM exercises
          GROUP BY exercise, dificultad_lineal, route, effort
          HAVING COUNT(*) > 1
        ) g`,
  );
  // mysql2 returns [rows, fields]; the rows array holds our single aggregate row.
  const dupeGroups = readCount(dupeGroupRows, "dupe_groups");

  const emptyRouteRows = await db.execute(
    sql`SELECT COUNT(*) AS empty_routes FROM exercises
        WHERE (route = '' OR route IS NULL)`,
  );
  const emptyRoutes = readCount(emptyRouteRows, "empty_routes");

  console.log(`\n=== Exercise Catalog Saneo (Phase 124 Plan 02) ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Exact-dupe groups (will soft-merge to MIN id): ${dupeGroups}`);
  console.log(
    `Empty/placeholder routes (will mark route_pending): ${emptyRoutes}\n`,
  );

  // ── 2. SOFT-MERGE exact dupes (D-06/D-07) ──
  //
  // Exact dupe key = exercise + dificultad_lineal + route + effort (the 4, D-06).
  // canonical = MIN(id) per group; every other row in the group points at it.
  // Guarded by `canonical_exercise_id IS NULL` so re-runs no-op (D-12).
  // No DELETE, no id reassignment — only the new pointer column is written.
  await db.execute(
    sql`UPDATE exercises e
        JOIN (
          SELECT MIN(id) AS canonical_id, exercise, dificultad_lineal, route, effort
          FROM exercises
          GROUP BY exercise, dificultad_lineal, route, effort
          HAVING COUNT(*) > 1
        ) g
          ON e.exercise = g.exercise
         AND e.dificultad_lineal = g.dificultad_lineal
         AND e.route = g.route
         AND e.effort = g.effort
        SET e.canonical_exercise_id = g.canonical_id
        WHERE e.id <> g.canonical_id
          AND e.canonical_exercise_id IS NULL`,
  );

  // ── 3. ROUTE DETECTION + MARK (D-08) ──
  //
  // route is NOT NULL in the schema, so "sin ruta" is the empty string; the
  // `route IS NULL` arm is defensive. If prod turns out to use a literal
  // placeholder token (e.g. "-" / "n/a"), add it here after confirming against
  // prod data — do NOT block on it. We MARK only; we never write the route.
  // Guarded by `route_pending = 0` so re-runs no-op (D-12).
  await db.execute(
    sql`UPDATE exercises
        SET route_pending = 1
        WHERE (route = '' OR route IS NULL)
          AND route_pending = 0`,
  );

  console.log(
    `Saneo complete: soft-merge pointers + route_pending markers written (idempotent).`,
  );
}

/**
 * Pull a single integer aggregate out of a mysql2 db.execute() result. The
 * driver returns [rows, fields]; rows[0] is our one-row aggregate. Narrowed
 * without `any` (CLAUDE.md TS rule).
 */
function readCount(result: unknown, column: string): number {
  if (!Array.isArray(result)) return 0;
  const rows = result[0];
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const first = rows[0];
  if (typeof first !== "object" || first === null) return 0;
  const value = (first as Record<string, unknown>)[column];
  return typeof value === "number" ? value : Number(value ?? 0);
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { db, connection } = await createSingleConnection();
  try {
    await runSaneo(db);
  } finally {
    await connection.end();
  }
}

// Only run the CLI when executed directly (not when imported by the test).
if (process.argv[1] && process.argv[1].endsWith("saneo-exercises.ts")) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Saneo failed: ${message}`);
    process.exit(1);
  });
}
