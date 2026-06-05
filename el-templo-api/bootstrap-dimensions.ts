/**
 * bootstrap-dimensions.ts — Heuristic first pass of the per-route progression
 * decomposition (rework de "Progresión por ruta + Habilidad").
 *
 * Reads the exercise catalog and writes deterministic, REVIEWABLE proposals into
 * `exercise_dimension_proposals` (status = 'pending'). It NEVER writes the truth
 * columns on `exercises` (progression_step / habilidad / route / route_pending) —
 * a profe confirms each proposal in the review screen of Plan 02, which is what
 * writes the truth columns.
 *
 * ENGINE = HEURISTIC, deterministic, NO LLM/API (D-05). Classification lives in
 * the single source of truth `src/modules/exercises/route-progression-map.ts`:
 * `classify(name + position, route)` returns the progression step + Habilidad for
 * each exercise within its route. Strategies per route type:
 *   - token  → progression_step = step rank; non-default variant → habilidad.
 *   - linear → progression_step = NULL (engine orders by dificultad_lineal);
 *              intensity modifiers (W/OL/JUMP) → habilidad.
 *   - unknown→ progression_step = NULL + confidence 0 (the profe resolves it).
 *   - excluded (movilidad/games) → SKIPPED (out of the strength tree).
 *
 * proposed_route is still inferred ONLY for route_pending exercises (D-03): a
 * best-guess route code from the name. A normally-routed exercise gets NULL.
 *
 * Idempotent / resumable (D-06): only inserts a proposal where one does not yet
 * exist for that exercise (UNIQUE(exercise_id), migration 0138).
 *
 * console.log is acceptable here: standalone one-off CLI maintenance tool (analog
 * saneo-exercises.ts / backfill-gender.ts), NOT the API server.
 *
 * Usage: npx tsx bootstrap-dimensions.ts
 */

import "dotenv/config";
import { createSingleConnection } from "./src/db/index";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { classify } from "./src/modules/exercises/route-progression-map";

/** Engine metadata tag stamped on every generated proposal. */
const ENGINE = "route-progression-v1";

/** Confidence per classification kind (the profe re-reviews regardless). */
const CONFIDENCE = { step: 100, linear: 80, unknown: 0 } as const;

/**
 * Best-guess route code from a name, used ONLY for route_pending exercises
 * (D-03). Scans the name for any known family keyword and returns its route
 * code; returns null when nothing is recognizable. Order matters: longer/more
 * specific phrases first.
 */
const NAME_TO_ROUTE_GUESS: { keywords: string[]; route: string }[] = [
  { keywords: ["handstand push", "hspu"], route: "HSPU" },
  { keywords: ["handstand", "parada de manos", "pino"], route: "HS" },
  { keywords: ["front lever", "front-lever"], route: "FL" },
  { keywords: ["back lever", "back-lever"], route: "BL" },
  { keywords: ["planche", "plancha"], route: "PL" },
  { keywords: ["muscle up", "muscle-up", "muscleup"], route: "MU" },
  { keywords: ["pistol", "sentadilla a una pierna"], route: "PS" },
  { keywords: ["l-sit", "l sit", "lsit"], route: "L" },
  { keywords: ["dip", "fondo"], route: "HD/ID" },
];

/** A row read from the exercise catalog (only the columns the engine needs). */
interface CatalogRow {
  id: number;
  name: string;
  position: string;
  route: string;
  routePending: boolean;
}

/** A proposal the engine decided to insert for one exercise. */
interface ProposalToInsert {
  exerciseId: number;
  proposedStep: number | null;
  proposedHabilidad: string | null;
  proposedRoute: string | null;
  confidence: number;
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
 * Run the heuristic bootstrap against an open Drizzle connection. Exported so the
 * integration test can drive it against the per-worker test DB without spawning a
 * process. Generic over the schema so both the app's typed db and a bare
 * createSingleConnection() db are accepted.
 */
export async function runBootstrap<TSchema extends Record<string, unknown>>(
  db: MySql2Database<TSchema>,
): Promise<void> {
  // ── 1. READ exercises + existing proposals (read-only report before mutate) ──

  const exerciseRows = await db.execute(
    sql`SELECT id, exercise AS name, position, route, route_pending AS routePending
        FROM exercises`,
  );
  const catalog = readCatalogRows(exerciseRows);

  const proposalRows = await db.execute(
    sql`SELECT exercise_id AS exerciseId FROM exercise_dimension_proposals`,
  );
  const existing = readExerciseIdSet(proposalRows);

  const toProcess = catalog.filter((row) => !existing.has(row.id));

  console.log(`\n=== Exercise Dimension Bootstrap (Progresión por ruta) ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Engine: ${ENGINE} (heuristic, no LLM/API)`);
  console.log(`Exercises in catalog: ${catalog.length}`);
  console.log(`Already have a proposal (skipped): ${existing.size}`);

  if (toProcess.length === 0) {
    console.log(`\nNothing to do -- every exercise already has a proposal.`);
    return;
  }

  // ── 2. TRANSFORM (deterministic heuristic, no API) ──
  //
  // classify() reads name + position together: position often carries the
  // orientation/variant while the leverage/step lives in the name (and vice
  // versa). Excluded routes (movilidad/games) produce NO proposal.

  const proposals: ProposalToInsert[] = [];
  let skippedExcluded = 0;
  let routePendingCount = 0;
  const kindCounts = { step: 0, linear: 0, unknown: 0 };
  for (const row of toProcess) {
    // route_pending rows (empty/placeholder route) come FIRST: they can't be
    // classified yet (no route), so we only propose a best-guess route for the
    // profe and leave step/habilidad NULL. Skipping classify here also avoids the
    // empty-route → "excluded" path eating these saneo rows (D-03).
    if (row.routePending) {
      routePendingCount += 1;
      proposals.push({
        exerciseId: row.id,
        proposedStep: null,
        proposedHabilidad: null,
        proposedRoute: routeGuessFromName(row.name),
        confidence: 0,
      });
      continue;
    }
    const result = classify(`${row.name} ${row.position}`, row.route);
    if (result.kind === "excluded") {
      skippedExcluded += 1;
      continue;
    }
    kindCounts[result.kind] += 1;
    proposals.push({
      exerciseId: row.id,
      proposedStep: result.step,
      proposedHabilidad: result.habilidad,
      // A normally-routed exercise never re-proposes its route (D-03).
      proposedRoute: null,
      confidence: CONFIDENCE[result.kind],
    });
  }

  console.log(`Will generate proposals for: ${proposals.length}`);
  console.log(
    `  step: ${kindCounts.step}  linear: ${kindCounts.linear}  unknown→pending: ${kindCounts.unknown}  route_pending: ${routePendingCount}`,
  );
  console.log(
    `Skipped (excluded routes — movilidad/games): ${skippedExcluded}\n`,
  );

  // ── 3. INSERT proposals (pending). NEVER write any exercises truth column. ──
  //
  // Idempotency (D-06): only rows without an existing proposal reach here. The
  // UNIQUE(exercise_id) on the table backs this guard at the DB level. We insert
  // one row at a time so a mid-run failure leaves already-inserted rows in place
  // and a re-run resumes from where it stopped.
  let inserted = 0;
  for (const p of proposals) {
    await db.execute(
      sql`INSERT INTO exercise_dimension_proposals
            (exercise_id, proposed_step, proposed_habilidad, proposed_route, status, engine, confidence)
          SELECT ${p.exerciseId}, ${p.proposedStep}, ${p.proposedHabilidad}, ${p.proposedRoute}, 'pending', ${ENGINE}, ${p.confidence}
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
      position:
        typeof rec.position === "string"
          ? rec.position
          : String(rec.position ?? ""),
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
