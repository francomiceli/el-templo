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
 * Usage:
 *   npx tsx bootstrap-milestones.ts            # default: write pending proposals
 *   npx tsx bootstrap-milestones.ts --dry-run  # READ-ONLY: print the hito→variantes plan
 *   npx tsx bootstrap-milestones.ts --apply     # persist truth via acceptMilestoneReview
 *
 * The dry-run (D-01) prints the full plan (Front Lever witness route) WITHOUT
 * touching the DB, plus the count of pending DIMENSION proposals that --apply
 * would accept as a side-effect of acceptMilestoneReview (so the operator sees
 * the risk before approving). The --apply (D-02/D-03/D-04) persists the
 * heuristic by transactionally accepting every `pending` milestone proposal via
 * `TreeEditorService.acceptMilestoneReview` — milestone-only BY CONTRACT: it
 * ABORTS if any pending dimension proposals remain (the v5.1 sequence
 * guarantees 124+133 already settled dimensions). Apply is idempotent: re-runs
 * touch only `pending` proposals, leaving coach-corrected accepted/rejected
 * rows intact.
 */

import "dotenv/config";
import { createSingleConnection } from "./src/db/index";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  proposeMilestones,
  type CatalogRow,
  type MilestoneProposal,
} from "./src/modules/exercises/milestone-heuristic";
import { TreeEditorService } from "./src/modules/tree-editor/service";
import * as schema from "./src/db/schema";

/** Engine metadata tag stamped on every generated proposal. */
const ENGINE = "milestone-heuristic-v1";

/**
 * Shared SQL for the milestone-candidate catalog scope (same predicate used by
 * the proposal-writer at runBootstrapMilestones). Exported as a constant so the
 * dry-run reuses the EXACT scope the heuristic was proposed against — no drift.
 */
const CATALOG_SCOPE_SQL = sql`SELECT e.id,
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
      AND r.excluded_from_tree = 0`;

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
  const exerciseRows = await db.execute(CATALOG_SCOPE_SQL);
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

/**
 * Read the count of PENDING exercise_dimension_proposals from a mysql2
 * db.execute() result, narrowed without `any` (style of readExerciseIdSet).
 * This is the side-effect surface of acceptMilestoneReview (service.ts:1027-1049):
 * a non-zero count means --apply would accept dimension proposals too (writing
 * habilidad/step, possibly pruning off-backbone) beyond milestone assignment.
 */
function readPendingDimensionCount(result: unknown): number {
  if (!Array.isArray(result)) return 0;
  const rows = result[0];
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const first = rows[0];
  if (typeof first !== "object" || first === null) return 0;
  const value = (first as Record<string, unknown>).cnt;
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

/**
 * The persisted shape of a `pending` milestone proposal that --apply iterates.
 * proposed_milestone_exercise_id NULL → accept as role='hito'; NOT NULL → accept
 * as role='variante' hanging off that hito id.
 */
interface PendingMilestoneRow {
  exerciseId: number;
  proposedMilestoneExerciseId: number | null;
}

/**
 * Narrow a mysql2 db.execute() result into pending milestone rows without `any`.
 */
function readPendingMilestoneRows(result: unknown): PendingMilestoneRow[] {
  if (!Array.isArray(result)) return [];
  const rows = result[0];
  if (!Array.isArray(rows)) return [];
  const out: PendingMilestoneRow[] = [];
  for (const raw of rows) {
    if (typeof raw !== "object" || raw === null) continue;
    const rec = raw as Record<string, unknown>;
    const exerciseId = Number(rec.exerciseId);
    if (!Number.isFinite(exerciseId)) continue;
    const hitoRaw = rec.proposedMilestoneExerciseId;
    const hito =
      hitoRaw === null || hitoRaw === undefined ? null : Number(hitoRaw);
    out.push({
      exerciseId,
      proposedMilestoneExerciseId:
        hito !== null && Number.isFinite(hito) ? hito : null,
    });
  }
  return out;
}

// ── --dry-run (D-01): READ-ONLY plan printer ─────────────────────────────────

/** Route code recognized as the Front Lever / TTB witness case (D-01). */
const WITNESS_ROUTES = new Set(["FL", "TTB"]);

/**
 * runDryRunMilestones — READ-ONLY (D-01). Reads the catalog, runs the pure
 * `proposeMilestones`, and prints the hito→variantes plan grouped by route
 * (Front Lever / TTB witness surfaced), each row showing movementToken /
 * stepRank / confidence. ALSO reads and reports the count of pending DIMENSION
 * proposals --apply would accept as a side-effect. Opens NO write transaction
 * and calls NO accept method — it only reads (catalog + dimension count) and
 * formats. Returns the computed plan for the caller (Plan 02 emits the
 * migration from the same assignment shape).
 */
export async function runDryRunMilestones<
  TSchema extends Record<string, unknown>,
>(
  db: MySql2Database<TSchema>,
): Promise<{ proposals: MilestoneProposal[]; pendingDimensionCount: number }> {
  // 1. READ-ONLY: same catalog scope the heuristic was proposed against.
  const exerciseRows = await db.execute(CATALOG_SCOPE_SQL);
  const catalog = readCatalogRows(exerciseRows);

  // Map exerciseId → name/route for human-readable plan lines (read-only).
  const nameByid = new Map<number, { name: string; route: string }>();
  for (const row of catalog) {
    nameByid.set(row.id, { name: row.name, route: row.route });
  }

  // 2. PURE transform — same call as the proposal-writer at :103.
  const proposals = proposeMilestones(catalog);

  // 3. READ-ONLY: count pending dimension proposals (the accept side-effect).
  const dimCountRows = await db.execute(
    sql`SELECT COUNT(*) AS cnt FROM exercise_dimension_proposals WHERE status = 'pending'`,
  );
  const pendingDimensionCount = readPendingDimensionCount(dimCountRows);

  // ── Print the plan, grouped by route → hito → variantes ──
  console.log(`\n=== Milestone Apply DRY-RUN (hito/variante R1) ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Engine: ${ENGINE} (heuristic, no LLM/API)`);
  console.log(`Catalog in milestone-candidate scope: ${catalog.length}`);

  // Group proposals by route, then within a route by hito (NULL parent), with
  // its variantes (parent = hito id) listed under it.
  const byHito = new Map<number, MilestoneProposal[]>();
  const hitos: MilestoneProposal[] = [];
  for (const p of proposals) {
    if (p.proposedMilestoneExerciseId === null) {
      hitos.push(p);
    } else {
      const list = byHito.get(p.proposedMilestoneExerciseId) ?? [];
      list.push(p);
      byHito.set(p.proposedMilestoneExerciseId, list);
    }
  }

  // Order hitos by route then id for stable, readable output.
  hitos.sort((a, b) => {
    const ra = nameByid.get(a.exerciseId)?.route ?? "";
    const rb = nameByid.get(b.exerciseId)?.route ?? "";
    if (ra !== rb) return ra < rb ? -1 : 1;
    return a.exerciseId - b.exerciseId;
  });

  let currentRoute: string | null = null;
  for (const hito of hitos) {
    const meta = nameByid.get(hito.exerciseId);
    const route = meta?.route ?? "?";
    if (route !== currentRoute) {
      currentRoute = route;
      const witness = WITNESS_ROUTES.has(route.toUpperCase())
        ? "  ◀── WITNESS (Front Lever / TTB)"
        : "";
      console.log(`\n── Route: ${route}${witness} ──`);
    }
    const variantes = byHito.get(hito.exerciseId) ?? [];
    console.log(
      `  ● HITO  #${hito.exerciseId} ${meta?.name ?? ""}  ` +
        `[mov=${hito.movementToken ?? "-"} step=${hito.stepRank ?? "-"} conf=${hito.confidence}]` +
        (variantes.length > 0 ? `  (+${variantes.length} variantes)` : ""),
    );
    for (const v of variantes) {
      const vmeta = nameByid.get(v.exerciseId);
      console.log(
        `      └ variante #${v.exerciseId} ${vmeta?.name ?? ""}  ` +
          `[mov=${v.movementToken ?? "-"} step=${v.stepRank ?? "-"} conf=${v.confidence}]`,
      );
    }
  }

  const milestoneCount = hitos.length;
  const variantCount = proposals.length - milestoneCount;
  console.log(
    `\nPlan: ${proposals.length} proposals (${milestoneCount} hitos, ${variantCount} variantes).`,
  );

  // ── Side-effect warning (the human safety gate D-01 requires) ──
  console.log(
    `\n⚠️  Pending DIMENSION proposals that --apply would accept as a side-effect ` +
      `of acceptMilestoneReview (service.ts:1027-1049): ${pendingDimensionCount}`,
  );
  if (pendingDimensionCount === 0) {
    console.log(
      `    OK — 0 pending dimension proposals. --apply is milestone-only on this state.`,
    );
  } else {
    console.log(
      `    WARNING — ${pendingDimensionCount} pending dimension proposal(s) exist. ` +
        `--apply would mutate habilidad/step and possibly prune nodes off-backbone ` +
        `beyond milestone assignment. --apply will ABORT until these are resolved ` +
        `(run the dimension review / settle phases 124+133 first).`,
    );
  }
  console.log(`\n(DRY-RUN — nothing written to the DB.)`);

  return { proposals, pendingDimensionCount };
}

// ── --apply (D-02/D-03/D-04): transactional bulk accept, milestone-only ──────

/** Sentinel result of the apply run for callers/tests (no process.exit here). */
export interface ApplyMilestonesResult {
  /** True only when the milestone-only guard tripped (apply did nothing). */
  aborted: boolean;
  /** Count of pending dimension proposals at guard time (reason for abort). */
  pendingDimensionCount: number;
  hitosAccepted: number;
  variantesAccepted: number;
  skipped: number;
}

/**
 * runApplyMilestones — persist the heuristic (D-02/D-03/D-04). Milestone-only BY
 * CONTRACT: FIRST asserts zero pending dimension proposals and ABORTS otherwise
 * (returns aborted=true, writes nothing). With the guard passed, selects ONLY
 * `pending` milestone proposals and accepts each via
 * `TreeEditorService.acceptMilestoneReview` — the ONLY truth-writer of
 * milestone_exercise_id. Processes all role='hito' rows BEFORE role='variante'
 * rows (CRITICAL — acceptMilestoneReview validates the destination hito is not
 * itself a variante, which only holds once every hito is accepted). Each accept
 * is isolated in its own try/catch (acceptMilestoneReview wraps each in its own
 * db.transaction); a failing proposal is logged-and-skipped, never aborting the
 * run. Idempotent (D-04): the SELECT filters to `pending` and
 * acceptMilestoneReview flips only `pending` proposals, so coach-corrected
 * accepted/rejected rows are never re-touched.
 */
export async function runApplyMilestones(
  db: MySql2Database<typeof schema>,
): Promise<ApplyMilestonesResult> {
  // ── Milestone-only contract guard (assert-and-abort) ──
  const dimCountRows = await db.execute(
    sql`SELECT COUNT(*) AS cnt FROM exercise_dimension_proposals WHERE status = 'pending'`,
  );
  const pendingDimensionCount = readPendingDimensionCount(dimCountRows);
  if (pendingDimensionCount > 0) {
    console.error(
      `\n✗ ABORT: ${pendingDimensionCount} pending DIMENSION proposal(s) exist.\n` +
        `  acceptMilestoneReview (service.ts:1027-1049) accepts a pending dimension\n` +
        `  proposal for the same exercise in the SAME transaction — writing\n` +
        `  habilidad/step and possibly pruning the node off-backbone. The v5.1\n` +
        `  sequence (phases 124+133) is supposed to have settled all dimensions\n` +
        `  before milestone apply. Resolve/clear the pending dimension proposals\n` +
        `  (run the dimension review) and re-run --apply. milestone_exercise_id is\n` +
        `  milestone-only by contract; nothing was written.`,
    );
    return {
      aborted: true,
      pendingDimensionCount,
      hitosAccepted: 0,
      variantesAccepted: 0,
      skipped: 0,
    };
  }

  // ── Guard passed: select ONLY pending milestone proposals ──
  const pendingRows = await db.execute(
    sql`SELECT exercise_id AS exerciseId,
               proposed_milestone_exercise_id AS proposedMilestoneExerciseId
        FROM exercise_milestone_proposals
        WHERE status = 'pending'`,
  );
  const pending = readPendingMilestoneRows(pendingRows);

  // hitos (proposed_milestone_exercise_id IS NULL) FIRST, then variantes
  // (CRITICAL ordering — PATTERNS.md A1 / service.ts:1073-1077).
  const hitoRows = pending.filter(
    (r) => r.proposedMilestoneExerciseId === null,
  );
  const varianteRows = pending.filter(
    (r) => r.proposedMilestoneExerciseId !== null,
  );

  const service = new TreeEditorService(db);

  console.log(`\n=== Milestone APPLY (hito/variante R1) ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(
    `Pending milestone proposals: ${pending.length} ` +
      `(${hitoRows.length} hitos, ${varianteRows.length} variantes). ` +
      `Pending dimension proposals: 0 (guard passed).`,
  );

  let hitosAccepted = 0;
  let variantesAccepted = 0;
  let skipped = 0;

  // Per-row isolation (imitates proposal-service bulkAccept :280-296): a failing
  // proposal logs + continues; acceptMilestoneReview already wraps each accept
  // in its own db.transaction, so one bad row never rolls back the others.
  for (const row of hitoRows) {
    try {
      await service.acceptMilestoneReview({
        exerciseId: row.exerciseId,
        role: "hito",
      });
      hitosAccepted += 1;
    } catch (err: unknown) {
      skipped += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`  skip hito #${row.exerciseId}: ${message}`);
    }
  }

  for (const row of varianteRows) {
    // Non-null asserted by the filter above; narrow for the typed input.
    const hito = row.proposedMilestoneExerciseId;
    if (hito === null) {
      skipped += 1;
      continue;
    }
    try {
      await service.acceptMilestoneReview({
        exerciseId: row.exerciseId,
        role: "variante",
        milestoneExerciseId: hito,
      });
      variantesAccepted += 1;
    } catch (err: unknown) {
      skipped += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `  skip variante #${row.exerciseId} (hito #${hito}): ${message}`,
      );
    }
  }

  console.log(
    `Apply complete: ${hitosAccepted} hitos accepted, ` +
      `${variantesAccepted} variantes accepted, ${skipped} skipped. ` +
      `(Idempotent: only status='pending' proposals were touched.)`,
  );

  return {
    aborted: false,
    pendingDimensionCount: 0,
    hitosAccepted,
    variantesAccepted,
    skipped,
  };
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");

  const { db, connection } = await createSingleConnection();
  try {
    if (dryRun) {
      await runDryRunMilestones(db);
    } else if (apply) {
      const result = await runApplyMilestones(db);
      if (result.aborted) {
        // Non-zero exit so a CI/pipeline caller learns the apply did nothing.
        await connection.end();
        process.exit(2);
      }
    } else {
      // Default behavior unchanged: write pending proposals.
      await runBootstrapMilestones(db);
    }
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
