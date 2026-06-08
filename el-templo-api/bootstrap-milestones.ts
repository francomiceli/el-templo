/**
 * bootstrap-milestones.ts — Heuristic first pass of the hito/variante
 * classification (R1, phase 133) over the exercise catalog.
 *
 * Reads the milestone-candidate scope of the catalog and writes deterministic,
 * REVIEWABLE proposals into `exercise_milestone_proposals` (status =
 * 'pending'). It NEVER writes the truth column
 * `exercises.milestone_exercise_id` — a profe confirms each proposal in the
 * tree-map review drawer, and THAT transactional accept is the only writer of
 * truth (phase-125 boundary).
 *
 * ENGINE = deterministic heuristic, NO LLM/API. The grouping lives in the pure
 * module `src/modules/exercises/milestone-heuristic.ts`: per (route × effort)
 * partition, exercises are grouped by (movement × step) and the most canonical
 * name of each group is proposed as the MILESTONE
 * (proposed_milestone_exercise_id = NULL); the rest are proposed as VARIANTS
 * pointing at it. The step comes from an ACCEPTED dimension proposal when one
 * exists, otherwise from classify() live (the truth progression_step has 0
 * populated rows).
 *
 * Idempotent / resumable: the heuristic runs over the FULL candidate scope so
 * group composition stays deterministic across runs, but only exercises
 * WITHOUT an existing milestone proposal are inserted (`WHERE NOT EXISTS`,
 * backed by UNIQUE(exercise_id) from migration 0145). A pre-existing proposal
 * (any status) is never touched — re-running cannot duplicate or overwrite.
 *
 * console.log is acceptable here: standalone one-off CLI maintenance tool
 * (analog bootstrap-dimensions.ts), NOT the API server.
 *
 * Usage: npx tsx bootstrap-milestones.ts
 */

import "dotenv/config";
import { createSingleConnection } from "./src/db/index";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  proposeMilestones,
  type CatalogRow,
} from "./src/modules/exercises/milestone-heuristic";

/** Engine metadata tag stamped on every generated proposal. */
const ENGINE = "milestone-heuristic-v1";

/**
 * Run the milestone bootstrap against an open Drizzle connection. Exported so
 * the integration test can drive it against the per-worker test DB without
 * spawning a process. Generic over the schema so both the app's typed db and a
 * bare createSingleConnection() db are accepted.
 */
export async function runBootstrapMilestones<
  TSchema extends Record<string, unknown>,
>(db: MySql2Database<TSchema>): Promise<{ proposed: number; skipped: number }> {
  // ── 1. READ the milestone-candidate scope (read-only report before mutate) ──
  //
  // Same scope as the current backbone (canonical IS NULL, valid contraction,
  // no habilidad, route in the tree). The hito-vs-variante decision itself is
  // what we are proposing, BUT we still exclude rows that are ALREADY a
  // confirmed truth-variante (milestone_exercise_id IS NOT NULL): those are
  // settled decisions, not candidates (WR-04). Re-proposing them would (a)
  // re-open an already-accepted decision in the drawer and (b) let a
  // truth-variante win moreCanonical and become a group milestone target the
  // accept endpoint rejects, dead-ending the whole group. The LEFT JOIN pulls
  // the profe-corrected step ONLY from ACCEPTED dimension proposals
  // (UNIQUE(exercise_id) on that table guarantees no fan-out).
  const exerciseRows = await db.execute(
    sql`SELECT e.id,
               e.exercise AS name,
               e.position AS position,
               e.route,
               e.effort,
               e.dificultad_lineal AS dificultadLineal,
               edp.proposed_step AS acceptedStep
        FROM exercises e
        INNER JOIN routes r ON e.route = r.code
        LEFT JOIN exercise_dimension_proposals edp
          ON edp.exercise_id = e.id AND edp.status = 'accepted'
        WHERE e.canonical_exercise_id IS NULL
          AND e.effort IN ('CON', 'EXC', 'ISO')
          AND e.habilidad IS NULL
          AND e.milestone_exercise_id IS NULL
          AND r.excluded_from_tree = 0`,
  );
  const catalog = readCatalogRows(exerciseRows);

  const proposalRows = await db.execute(
    sql`SELECT exercise_id AS exerciseId FROM exercise_milestone_proposals`,
  );
  const existing = readExerciseIdSet(proposalRows);

  console.log(`\n=== Exercise Milestone Bootstrap (hito/variante R1) ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Engine: ${ENGINE} (heuristic, no LLM/API)`);
  console.log(`Exercises in milestone-candidate scope: ${catalog.length}`);
  console.log(`Already have a milestone proposal: ${existing.size}`);

  // ── 2. TRANSFORM (pure, deterministic) ──
  //
  // The heuristic partitions by (route × effort) IN MEMORY (catalog ~1.5k rows
  // — no correlated subqueries, Pitfall 3) and runs over the FULL scope, not
  // just unproposed rows: excluding already-proposed exercises would change
  // group composition (and therefore milestone selection) between runs.
  const proposals = proposeMilestones(catalog);
  const milestoneCount = proposals.filter(
    (p) => p.proposedMilestoneExerciseId === null,
  ).length;
  console.log(
    `Heuristic output: ${proposals.length} proposals (${milestoneCount} hitos, ${proposals.length - milestoneCount} variantes)`,
  );

  // ── 3. INSERT proposals (pending). NEVER write any exercises truth column. ──
  //
  // One row at a time so a mid-run failure leaves already-inserted rows in
  // place and a re-run resumes from where it stopped. The NOT EXISTS guard
  // (backed by UNIQUE(exercise_id)) makes the insert idempotent at the DB
  // level; a pre-existing proposal is counted as skipped and never overwritten.
  let proposed = 0;
  let skipped = 0;
  for (const p of proposals) {
    if (existing.has(p.exerciseId)) {
      skipped += 1;
      continue;
    }
    await db.execute(
      sql`INSERT INTO exercise_milestone_proposals
            (exercise_id, proposed_milestone_exercise_id, movement_token, step_rank, status, engine, confidence)
          SELECT ${p.exerciseId}, ${p.proposedMilestoneExerciseId}, ${p.movementToken}, ${p.stepRank}, 'pending', ${ENGINE}, ${p.confidence}
          WHERE NOT EXISTS (
            SELECT 1 FROM exercise_milestone_proposals WHERE exercise_id = ${p.exerciseId}
          )`,
    );
    proposed += 1;
  }

  console.log(
    `Bootstrap complete: ${proposed} pending proposals inserted, ${skipped} skipped (idempotent; exercises truth untouched).`,
  );
  return { proposed, skipped };
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
    const dl = Number(rec.dificultadLineal);
    const acceptedStepRaw = rec.acceptedStep;
    const acceptedStep =
      acceptedStepRaw === null || acceptedStepRaw === undefined
        ? null
        : Number(acceptedStepRaw);
    out.push({
      id,
      name: typeof rec.name === "string" ? rec.name : String(rec.name ?? ""),
      position: typeof rec.position === "string" ? rec.position : null,
      route:
        typeof rec.route === "string" ? rec.route : String(rec.route ?? ""),
      effort:
        typeof rec.effort === "string" ? rec.effort : String(rec.effort ?? ""),
      dificultadLineal: Number.isFinite(dl) ? dl : 1,
      acceptedStep:
        acceptedStep !== null && Number.isFinite(acceptedStep)
          ? acceptedStep
          : null,
    });
  }
  return out;
}

/**
 * Pull the set of exercise_ids that already have a milestone proposal, from a
 * mysql2 db.execute() result. Narrowed without `any`.
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
    await runBootstrapMilestones(db);
  } finally {
    await connection.end();
  }
}

// Only run the CLI when executed directly (not when imported by the test).
if (process.argv[1] && process.argv[1].endsWith("bootstrap-milestones.ts")) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Bootstrap failed: ${message}`);
    process.exit(1);
  });
}
