/**
 * Combos Session Generator
 *
 * Phase 159 (SEM-02/SEM-03, D-05/D-06/D-10/D-11): generates "dia de combos"
 * sessions with 4 blocks: INITIUM (warmup), COMBOS_I (tren_superior),
 * COMBOS_II (tren_inferior), STRETCHING (shared mobility close).
 *
 * COMBOS_I and COMBOS_II reuse the SPOM pipeline stages 2-7 via
 * `runSemanaNuevaBlockPipeline` (plan 02, D-P6) with a route injected
 * deterministically from the goal-plan route map (D-05) and the real
 * 'Combos' format forced (D-06 — same rounds+reps-per-exercise shape the
 * coach already uses, migration 0172; NO new single-reps parameter).
 *
 * This file also hosts `assembleFixedStructureSession`, the shared trunk
 * reused by `tecnica-generator.ts` (Task 2): both day modes are
 * INITIUM -> role block 1 -> role block 2 -> STRETCHING, and only differ in
 * how the two role blocks resolve their route(s) and forced format.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type {
  DaySession,
  BlockPlan,
  BlockRole,
  ExerciseLevel,
  LevelGroup,
  FormatInstance,
  TraceEvent,
} from "./types";
import { SpomService } from "../spom/service";
import { createInitialContext } from "./pipeline/context";
import {
  runSemanaNuevaBlockPipeline,
  resolveRoutePool,
} from "./pipeline/semana-nueva-pipeline";
import { selectStretchingExercises } from "./pipeline/utils/stretching-selection";
import { queryFormatByName } from "./fallback/format-fallback";
import { GOAL_PLAN_ROUTE_MAP } from "../goal-plans/constants";

/**
 * D-05: COMBOS_I resolves its route from the curated tren_superior pool,
 * COMBOS_II from tren_inferior — reusing the goal-plans route classification
 * (there is no superior/inferior column on `routes`, per research Hallazgo 5).
 */
export const COMBOS_ROUTE_POOLS: Readonly<
  Record<"COMBOS_I" | "COMBOS_II", readonly string[]>
> = {
  COMBOS_I: GOAL_PLAN_ROUTE_MAP.tren_superior,
  COMBOS_II: GOAL_PLAN_ROUTE_MAP.tren_inferior,
};

/** STRETCHING has no force route of its own (D-11) — descriptive label only. */
const STRETCHING_ROUTE = "STRETCHING";

/** D-13: same defaults as INITIUM/ROM zone blocks — moderate, informational only. */
const STRETCHING_INTENSITY = 40;

/** D-13: budget reference for ~4 mobility exercises (4 x 10 reps default). */
const STRETCHING_REPS_BUDGET = 40;

/**
 * Specification for one of the two "role" blocks (COMBOS_I/II or
 * TECNICA_I/II) of a fixed-structure semana-nueva session: which role and
 * which route it resolves to.
 */
export interface FixedStructureBlockSpec {
  readonly role: BlockRole;
  readonly route: string;
}

/**
 * Shared trunk (D-P6, ~80% of the assembly) for the combos/tecnica
 * generators: builds the 4-block DaySession (INITIUM -> block 1 -> block 2
 * -> STRETCHING) common to both day modes.
 *
 * `blockSpecs` supplies the two role blocks in output order (their routes
 * already resolved by the caller — COMBOS uses two different pools per role,
 * TECNICA uses ONE shared route for both, D-08). `forcedFormat` is the real
 * `formats` row both role blocks are forced onto (D-06/D-09 — never a
 * synthetic/zero format id).
 *
 * STRETCHING is the exception to the shared pipeline: it never goes through
 * `runSemanaNuevaBlockPipeline` (no force route, no budget/SPOM concept) and
 * is assembled directly from `selectStretchingExercises(db, week, day)` — a
 * pure function of (week, day) only (Pitfall 1: no `memberLevel`, no
 * non-deterministic randomness, identical across the 6 levels of the same
 * day).
 */
export async function assembleFixedStructureSession(
  db: MySql2Database<typeof schema>,
  week: number,
  day: string,
  levelGroup: LevelGroup,
  memberLevel: ExerciseLevel,
  sessionMode: "combos" | "tecnica",
  blockSpecs: readonly [FixedStructureBlockSpec, FixedStructureBlockSpec],
  forcedFormat: FormatInstance,
): Promise<DaySession> {
  const dayId = `W${week}-${day}-${memberLevel}`;
  const spomService = new SpomService(db);
  const traceCodePrefix = sessionMode.toUpperCase();
  const sessionTrace: TraceEvent[] = [];
  const blocks: BlockPlan[] = [];

  // INITIUM: shared special pipeline, identical shape to regular/ROM/goal-plan
  // sessions. `runSemanaNuevaBlockPipeline` delegates to `runInitiumPipeline`
  // for this role and ignores `options.route` (INITIUM has no route).
  const initiumCtx = createInitialContext(week, day, levelGroup, memberLevel, "INITIUM");
  const initiumBlock = await runSemanaNuevaBlockPipeline(initiumCtx, spomService, db, {
    route: "INITIUM",
  });
  blocks.push(initiumBlock);

  sessionTrace.push({
    ts: new Date().toISOString(),
    severity: "INFO",
    code: `${traceCodePrefix}_INITIUM_GENERATED`,
    where: {
      week,
      day,
      levelGroup,
      memberLevel,
      blockId: initiumBlock.blockId,
      role: "INITIUM",
    },
    decision: {
      exerciseCount: initiumBlock.exercises.length,
      format: initiumBlock.format.name,
    },
  });

  // Role blocks (COMBOS_I/COMBOS_II or TECNICA_I/TECNICA_II): reuse stages
  // 2-7 of the SPOM pipeline with the route injected and the format forced.
  for (const spec of blockSpecs) {
    const blockCtx = createInitialContext(week, day, levelGroup, memberLevel, spec.role);
    const blockPlan = await runSemanaNuevaBlockPipeline(blockCtx, spomService, db, {
      route: spec.route,
      forcedFormat,
    });
    blocks.push(blockPlan);

    sessionTrace.push({
      ts: new Date().toISOString(),
      severity: "INFO",
      code: `${traceCodePrefix}_BLOCK_GENERATED`,
      where: {
        week,
        day,
        levelGroup,
        memberLevel,
        blockId: blockPlan.blockId,
        role: spec.role,
      },
      decision: {
        route: blockPlan.route,
        format: blockPlan.format.name,
        exerciseCount: blockPlan.exercises.length,
      },
    });
  }

  // STRETCHING: pure (week, day) selection — must stay byte-identical across
  // all 6 levels of the same day (D-11, Pitfall 1). Never derived from
  // memberLevel/levelGroup.
  const stretchingExercises = await selectStretchingExercises(db, week, day);
  const stretchingBlockId = `${traceCodePrefix}-STRETCHING-W${week}-${day}-${memberLevel}`;
  const stretchingBlock: BlockPlan = {
    blockId: stretchingBlockId,
    role: "STRETCHING",
    route: STRETCHING_ROUTE,
    pattern: "MOVILIDAD",
    intensity: STRETCHING_INTENSITY,
    repsBudget: STRETCHING_REPS_BUDGET,
    format: await resolveStretchingFormat(db),
    formatParams: { type: "stretching" },
    exercises: stretchingExercises,
    trace: [],
  };
  blocks.push(stretchingBlock);

  sessionTrace.push({
    ts: new Date().toISOString(),
    severity: "INFO",
    code: `${traceCodePrefix}_STRETCHING_GENERATED`,
    where: {
      week,
      day,
      levelGroup,
      memberLevel,
      blockId: stretchingBlockId,
      role: "STRETCHING",
    },
    decision: {
      exerciseCount: stretchingExercises.length,
    },
  });

  return {
    dayId,
    week,
    day,
    levelGroup,
    memberLevel,
    blocks,
    trace: sessionTrace,
    goalPlanType: null,
    sessionMode,
  };
}

/**
 * Resolve the real 'Stretching' formats row (migration 0172). Never a
 * synthetic/zero format id — 'Stretching' is a real format, unlike ROM's
 * synthetic one.
 */
async function resolveStretchingFormat(
  db: MySql2Database<typeof schema>,
): Promise<FormatInstance> {
  const stretchingFormat = await queryFormatByName(db, "Stretching");
  if (!stretchingFormat) {
    throw new Error(
      "Format 'Stretching' not found in formats table (expected from migration 0172)",
    );
  }
  return { formatId: stretchingFormat.formatId, name: stretchingFormat.name };
}

/**
 * Generate a complete Combos session for a given week, day, and member
 * level (D-10: one call per level; the caller loops over the 6 levels).
 *
 * @param db - Database connection
 * @param week - Week number
 * @param day - Day name (e.g., 'miercoles')
 * @param levelGroup - Aggregated level group (alfa_delta | sigma | omega)
 * @param memberLevel - Member's individual level (all 6 supported, D-10)
 * @returns Complete DaySession with sessionMode='combos'
 */
export async function generateCombosSession(
  db: MySql2Database<typeof schema>,
  week: number,
  day: string,
  levelGroup: LevelGroup,
  memberLevel: ExerciseLevel,
): Promise<DaySession> {
  const combosFormat = await queryFormatByName(db, "Combos");
  if (!combosFormat) {
    throw new Error(
      "Format 'Combos' not found in formats table (expected from migration 0172)",
    );
  }
  const forcedFormat: FormatInstance = {
    formatId: combosFormat.formatId,
    name: combosFormat.name,
  };

  // D-05: hashInput includes the role so COMBOS_I/COMBOS_II land on different
  // routes (and to avoid index collisions within the same pool).
  const routeComboI = resolveRoutePool(
    COMBOS_ROUTE_POOLS.COMBOS_I,
    `${week}-${day}-COMBOS_I`,
  );
  const routeComboII = resolveRoutePool(
    COMBOS_ROUTE_POOLS.COMBOS_II,
    `${week}-${day}-COMBOS_II`,
  );

  return assembleFixedStructureSession(
    db,
    week,
    day,
    levelGroup,
    memberLevel,
    "combos",
    [
      { role: "COMBOS_I", route: routeComboI },
      { role: "COMBOS_II", route: routeComboII },
    ],
    forcedFormat,
  );
}
