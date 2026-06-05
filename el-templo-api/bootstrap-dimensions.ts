/**
 * bootstrap-dimensions.ts -- Heuristic first pass of the 3-dimension
 * decomposition for the v5.1 skill tree (Phase 125 Plan 01, TREE-02).
 *
 * Reads the ~1.493-row exercise catalog and writes deterministic, REVIEWABLE
 * proposals into `exercise_dimension_proposals` (status = 'pending'). It NEVER
 * writes the phase-124 truth columns on `exercises` (subfamily_id / leverage /
 * route / route_pending) and never touches `effort` (D-01/D-03) -- a profe
 * confirms each proposal in the review screen of Plan 02, which is what writes
 * the truth columns.
 *
 * ENGINE = HEURISTIC, deterministic, NO LLM/API (D-05). It imports no AI SDK and
 * reads no AI API key (see CONTEXT D-05 — the prior LLM bootstrap was dropped).
 * The `route` column already encodes the skill family/area, so the engine
 * derives:
 *
 *   1. proposed_subfamily  via ROUTE_TO_SUBFAMILY (route code -> canonical name).
 *      Unmapped codes fall back to the raw (upper-cased) route code so families
 *      still cluster (the profe renames in review, D-04). Empty route -> NULL.
 *   2. proposed_leverage   via LEVERAGE_KEYWORDS matched on the lowercased name
 *      (tuck / adv tuck / straddle / half / full and analogs). Nullable when
 *      nothing matches (leverage is per-family, D-03).
 *   3. proposed_route      ONLY for exercises with route_pending = 1 (D-03): a
 *      best-guess route code inferred from the name. NEVER overwrite an existing
 *      route -- a routed exercise gets proposed_route = NULL.
 *
 * Idempotent / resumable (D-06): only inserts a proposal where one does not yet
 * exist for that exercise. A UNIQUE(exercise_id) on the table (migration 0138)
 * backs the NOT-EXISTS guard, so re-running creates no duplicates and a run that
 * fails mid-way can be resumed.
 *
 * console.log is acceptable here: this is a standalone one-off CLI maintenance
 * tool (analog `saneo-exercises.ts` / `backfill-gender.ts`), NOT the API server.
 * The "never console.log" rule (CLAUDE.md) targets the server (request.log/
 * app.log) and the frontend apps.
 *
 * Usage: npx tsx bootstrap-dimensions.ts
 * Works against any environment via .env DATABASE_URL -- but it is meant to be
 * inspected first: it prints the to-process / will-insert counts BEFORE mutating.
 */

import "dotenv/config";
import { createSingleConnection } from "./src/db/index";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

/** Engine metadata tag stamped on every generated proposal. */
const ENGINE = "heuristic-v1";

/**
 * Route code -> canonical sub-family name (D-04/D-05). The `route` column on
 * exercises already encodes the skill family/area; this map gives each family a
 * canonical display name so proposals from the same family cluster naturally.
 *
 * Keys are upper-cased route codes. The known codes come from the design doc
 * (new-training-system-design.md): "24-32 codes that are skill families
 * (PL=planche, FL=front lever, BL=back lever, HS=handstand, MU=muscle-up,
 * L=L-sit, etc.)". Codes NOT listed here fall back to the raw upper-cased route
 * code (still a deterministic, clustering name a profe renames in review).
 * Fine normalization (merge/split) is profe + tree-editor work (128), NOT this
 * pass (D-04).
 */
const ROUTE_TO_SUBFAMILY: Record<string, string> = {
  PL: "Planche",
  FL: "Front Lever",
  BL: "Back Lever",
  HS: "Handstand",
  MU: "Muscle Up",
  L: "L-Sit",
  VIC: "Victorian",
  DF: "Dragon Flag",
  HSPU: "Handstand Push Up",
  OAC: "One Arm Chin",
  OAP: "One Arm Push Up",
  PU: "Pull Up",
  DIP: "Dip",
  SQ: "Squat",
  PIKE: "Pike",
};

/**
 * Leverage keyword -> canonical leverage value (D-03/D-05). The lever arm axis
 * is universal across sub-families (tuck < adv tuck < straddle < half < full).
 * Matched against the lowercased exercise name; the FIRST match in `order` wins,
 * so the more specific "adv tuck" is checked before the bare "tuck". Nothing
 * matches -> proposed_leverage = NULL (leverage is per-family, often N/A).
 */
const LEVERAGE_KEYWORDS: { keywords: string[]; leverage: string }[] = [
  {
    keywords: ["adv tuck", "advanced tuck", "adv. tuck"],
    leverage: "Adv Tuck",
  },
  { keywords: ["tuck"], leverage: "Tuck" },
  { keywords: ["straddle"], leverage: "Straddle" },
  { keywords: ["half lay", "half-lay", "half"], leverage: "Half" },
  { keywords: ["full lay", "full-lay", "full", "layout"], leverage: "Full" },
  { keywords: ["one arm", "one-arm", "1 arm", "1-arm"], leverage: "One Arm" },
];

/**
 * Best-guess route code from a name, used ONLY for route_pending exercises
 * (D-03). Scans the name for any known family keyword and returns its route
 * code; returns null when nothing is recognizable (the profe assigns the route
 * in review). Order matters: longer/more specific phrases first.
 */
const NAME_TO_ROUTE_GUESS: { keywords: string[]; route: string }[] = [
  { keywords: ["handstand push", "hspu"], route: "HSPU" },
  { keywords: ["handstand", "parada de manos", "pino"], route: "HS" },
  { keywords: ["front lever", "front-lever"], route: "FL" },
  { keywords: ["back lever", "back-lever"], route: "BL" },
  { keywords: ["planche", "plancha"], route: "PL" },
  { keywords: ["muscle up", "muscle-up", "muscleup"], route: "MU" },
  { keywords: ["victorian"], route: "VIC" },
  { keywords: ["dragon flag"], route: "DF" },
  { keywords: ["l-sit", "l sit", "lsit"], route: "L" },
  { keywords: ["pull up", "pull-up", "dominada"], route: "PU" },
  { keywords: ["dip", "fondo"], route: "DIP" },
];

/** A row read from the exercise catalog (only the columns the engine needs). */
interface CatalogRow {
  id: number;
  name: string;
  route: string;
  routePending: boolean;
}

/** A proposal the engine decided to insert for one exercise. */
interface ProposalToInsert {
  exerciseId: number;
  proposedSubfamily: string | null;
  proposedLeverage: string | null;
  proposedRoute: string | null;
}

/** Canonical sub-family name from a route code (empty route -> NULL). */
function subfamilyFromRoute(route: string): string | null {
  const code = route.trim().toUpperCase();
  if (code === "") return null;
  return ROUTE_TO_SUBFAMILY[code] ?? code;
}

/** Canonical leverage from a name, or NULL when no keyword matches. */
function leverageFromName(name: string): string | null {
  const lower = name.toLowerCase();
  for (const entry of LEVERAGE_KEYWORDS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.leverage;
    }
  }
  return null;
}

/** Best-guess route code from a name, or NULL when unrecognizable. */
function routeGuessFromName(name: string): string | null {
  const lower = name.toLowerCase();
  for (const entry of NAME_TO_ROUTE_GUESS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.route;
    }
  }
  return null;
}

/**
 * Run the heuristic bootstrap against an open Drizzle connection. Exported so
 * the integration test can drive it against the per-worker test DB without
 * spawning a process. Generic over the schema so both the app's typed db and a
 * bare createSingleConnection() db are accepted.
 */
export async function runBootstrap<TSchema extends Record<string, unknown>>(
  db: MySql2Database<TSchema>,
): Promise<void> {
  // ── 1. READ exercises + existing proposals (read-only report before mutate) ──

  const exerciseRows = await db.execute(
    sql`SELECT id, exercise AS name, route, route_pending AS routePending
        FROM exercises`,
  );
  const catalog = readCatalogRows(exerciseRows);

  const proposalRows = await db.execute(
    sql`SELECT exercise_id AS exerciseId FROM exercise_dimension_proposals`,
  );
  const existing = readExerciseIdSet(proposalRows);

  const toProcess = catalog.filter((row) => !existing.has(row.id));

  console.log(`\n=== Exercise Dimension Bootstrap (Phase 125 Plan 01) ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Engine: ${ENGINE} (heuristic, no LLM/API)`);
  console.log(`Exercises in catalog: ${catalog.length}`);
  console.log(`Already have a proposal (skipped): ${existing.size}`);
  console.log(`Will generate proposals for: ${toProcess.length}\n`);

  if (toProcess.length === 0) {
    console.log(`Nothing to do -- every exercise already has a proposal.`);
    return;
  }

  // ── 2. TRANSFORM (deterministic heuristic, no API) ──

  const proposals: ProposalToInsert[] = toProcess.map((row) => ({
    exerciseId: row.id,
    proposedSubfamily: subfamilyFromRoute(row.route),
    proposedLeverage: leverageFromName(row.name),
    // proposed_route ONLY for route_pending rows; NEVER overwrite an existing
    // route (D-03). A normally-routed exercise gets NULL here.
    proposedRoute: row.routePending ? routeGuessFromName(row.name) : null,
  }));

  // ── 3. INSERT proposals (pending). NEVER write any exercises truth column. ──
  //
  // Idempotency (D-06): only rows without an existing proposal reach here. The
  // UNIQUE(exercise_id) on the table backs this guard at the DB level. We insert
  // one row at a time so a mid-run failure leaves the already-inserted rows in
  // place and a re-run resumes from where it stopped.
  let inserted = 0;
  for (const p of proposals) {
    await db.execute(
      sql`INSERT INTO exercise_dimension_proposals
            (exercise_id, proposed_subfamily, proposed_leverage, proposed_route, status, engine)
          SELECT ${p.exerciseId}, ${p.proposedSubfamily}, ${p.proposedLeverage}, ${p.proposedRoute}, 'pending', ${ENGINE}
          WHERE NOT EXISTS (
            SELECT 1 FROM exercise_dimension_proposals WHERE exercise_id = ${p.exerciseId}
          )`,
    );
    inserted += 1;
  }

  console.log(
    `Bootstrap complete: ${inserted} pending proposals inserted (idempotent; truth columns untouched).`,
  );
}

/**
 * Narrow a mysql2 db.execute() result into typed catalog rows without `any`
 * (CLAUDE.md TS rule). The driver returns [rows, fields]; rows is our array.
 */
function readCatalogRows(result: unknown): CatalogRow[] {
  if (!Array.isArray(result)) return [];
  const rows = result[0];
  if (!Array.isArray(rows)) return [];
  const out: CatalogRow[] = [];
  for (const raw of rows) {
    if (typeof raw !== "object" || raw === null) continue;
    const rec = raw as Record<string, unknown>;
    const id = Number(rec.id);
    if (!Number.isFinite(id)) continue;
    out.push({
      id,
      name: typeof rec.name === "string" ? rec.name : String(rec.name ?? ""),
      route:
        typeof rec.route === "string" ? rec.route : String(rec.route ?? ""),
      // route_pending comes back as 0/1 (TINYINT) — coerce to boolean.
      routePending: Number(rec.routePending) === 1,
    });
  }
  return out;
}

/**
 * Pull the set of exercise_ids that already have a proposal, from a mysql2
 * db.execute() result. Narrowed without `any`.
 */
function readExerciseIdSet(result: unknown): Set<number> {
  const set = new Set<number>();
  if (!Array.isArray(result)) return set;
  const rows = result[0];
  if (!Array.isArray(rows)) return set;
  for (const raw of rows) {
    if (typeof raw !== "object" || raw === null) continue;
    const value = (raw as Record<string, unknown>).exerciseId;
    const id = Number(value);
    if (Number.isFinite(id)) set.add(id);
  }
  return set;
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { db, connection } = await createSingleConnection();
  try {
    await runBootstrap(db);
  } finally {
    await connection.end();
  }
}

// Only run the CLI when executed directly (not when imported by the test).
if (process.argv[1] && process.argv[1].endsWith("bootstrap-dimensions.ts")) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Bootstrap failed: ${message}`);
    process.exit(1);
  });
}
