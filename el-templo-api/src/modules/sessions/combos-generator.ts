/**
 * Combos Session Generator
 *
 * Phase 159 (SEM-02/SEM-03, D-05/D-06/D-10): generates "dia de combos"
 * sessions with 5 blocks: INITIUM (warmup), COMBOS_I (tren_superior),
 * COMBOS_II (tren_inferior), COMBOS_II_ALT (phase 178 — alternative variant
 * of COMBOS_II, same pool/format, distinct route/exercises), and a full-body
 * "Circuito cooperativo" close (ATHLOS on odd weeks / EPIKOS on even, route
 * FB). The FB close supersedes D-11's STRETCHING for the combos day (UAT
 * 2026-08-18): it automates what the coaches were doing by hand in prod
 * W21-W26 (route_update -> FB + format_change -> Circuito cooperativo).
 * STRETCHING remains the close of the tecnica day only.
 *
 * COMBOS_I, COMBOS_II and COMBOS_II_ALT reuse the SPOM pipeline stages 2-7
 * via `runSemanaNuevaBlockPipeline` (plan 02, D-P6) with a route injected
 * deterministically from the goal-plan route map (D-05) and the real
 * 'Combos' format forced (D-06 — same rounds+reps-per-exercise shape the
 * coach already uses, migration 0172; NO new single-reps parameter).
 *
 * This file also hosts `assembleFixedStructureSession`, the shared trunk
 * reused by `tecnica-generator.ts` (Task 2): both day modes are
 * INITIUM -> role block 1 -> role block 2 -> alt block -> closing block, and
 * differ in how the role/alt blocks resolve their route(s)/format and in the
 * closing block (combos: FB circuit; tecnica: STRETCHING).
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
  resolveDistinctRoutePool,
} from "./pipeline/semana-nueva-pipeline";
import { selectStretchingExercises } from "./pipeline/utils/stretching-selection";
import { selectFullBodyCircuitExercises } from "./pipeline/utils/full-body-selection";
import { queryFormatByName } from "./fallback/format-fallback";
import { GOAL_PLAN_ROUTE_MAP } from "../goal-plans/constants";
import { getFinalBlockRole } from "./types";
import { FULL_BODY_ROUTE } from "../shared/training-constants";

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
 * generators: builds the 5-block DaySession (INITIUM -> block 1 -> block 2
 * -> alt block -> closing block) common to both day modes. The closing block
 * branches on `sessionMode`: combos closes with the full-body ATHLOS/EPIKOS
 * circuit, tecnica with STRETCHING.
 *
 * `blockSpecs` supplies the two role blocks in output order (their routes
 * already resolved by the caller — COMBOS uses two different pools per role,
 * TECNICA uses ONE shared route for both, D-08). `altSpec` supplies the
 * phase-178 alternative of the 2nd role block (`*_II_ALT`): same pool and
 * `forcedFormat` as the II, but a route resolved by the caller with a
 * role-inclusive hash so it lands on different exercises (T-178-03). The alt
 * block is inserted immediately after the two role blocks and before the
 * closing block. `forcedFormat` is the real `formats` row the role blocks
 * AND the alt block are forced onto (D-06/D-09 — never a synthetic/zero
 * format id).
 *
 * Both closing blocks are exceptions to the shared pipeline: they never go
 * through `runSemanaNuevaBlockPipeline` (no SPOM rules for their routes) and
 * are assembled directly from their selectors — STRETCHING from
 * `selectStretchingExercises(db, week, day)`, a pure function of (week, day)
 * only (Pitfall 1: no `memberLevel`, identical across the 6 levels of the
 * day); the FB circuit from `selectFullBodyCircuitExercises`, per-level
 * because each level caps difficulty differently. The combos FB close keeps
 * mirroring the SECOND role block's (`*_II`) intensity/repsBudget, captured
 * in `secondRoleBlock` before the alt block is generated and pushed — the
 * alt is now the new last entry of `blocks`, so `blocks[blocks.length - 1]`
 * can no longer be used for that purpose.
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
  altSpec: FixedStructureBlockSpec,
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

  // Capture the second role block (COMBOS_II/TECNICA_II) BEFORE generating
  // the alt block below — the combos FB close mirrors its intensity/
  // repsBudget, and once the alt block is pushed it becomes the new last
  // entry of `blocks`.
  const secondRoleBlock = blocks[blocks.length - 1];

  // Alt block (phase 178, T-178-03): reuses the SAME pool and forcedFormat as
  // the II, but `altSpec.route` was resolved by the caller with a
  // role-inclusive hash so it lands on a DIFFERENT route/exercises than the
  // II — a real, editable block, not an ephemeral TV-only swap.
  const altCtx = createInitialContext(week, day, levelGroup, memberLevel, altSpec.role);
  const altBlock = await runSemanaNuevaBlockPipeline(altCtx, spomService, db, {
    route: altSpec.route,
    forcedFormat,
  });
  blocks.push(altBlock);

  sessionTrace.push({
    ts: new Date().toISOString(),
    severity: "INFO",
    code: `${traceCodePrefix}_ALT_GENERATED`,
    where: {
      week,
      day,
      levelGroup,
      memberLevel,
      blockId: altBlock.blockId,
      role: altSpec.role,
    },
    decision: {
      route: altBlock.route,
      format: altBlock.format.name,
      exerciseCount: altBlock.exercises.length,
    },
  });

  if (sessionMode === "combos") {
    // Combos close (UAT 2026-08-18, supersedes D-11 for this day): full-body
    // "Circuito cooperativo" on route FB, keeping the regular pipeline's
    // final-role alternation (odd weeks ATHLOS / even EPIKOS). Intensity and
    // reps budget mirror the day's COMBOS_II block (`secondRoleBlock`, NOT
    // the alt) — the manual prod blocks kept the generator's numbers and only
    // replaced route/format/exercises.
    const finalRole = getFinalBlockRole(week);
    const fullBodyExercises = await selectFullBodyCircuitExercises(
      db,
      week,
      day,
      memberLevel,
    );
    const fullBodyBlockId = `${traceCodePrefix}-${finalRole}-W${week}-${day}-${memberLevel}`;
    const fullBodyBlock: BlockPlan = {
      blockId: fullBodyBlockId,
      role: finalRole,
      route: FULL_BODY_ROUTE,
      pattern: "FULL BODY",
      intensity: secondRoleBlock.intensity,
      repsBudget: secondRoleBlock.repsBudget,
      format: await resolveRealFormat(db, "Circuito cooperativo"),
      formatParams: { type: "circuito_cooperativo" },
      exercises: fullBodyExercises,
      trace: [],
    };
    blocks.push(fullBodyBlock);

    sessionTrace.push({
      ts: new Date().toISOString(),
      severity: "INFO",
      code: `${traceCodePrefix}_FULL_BODY_GENERATED`,
      where: {
        week,
        day,
        levelGroup,
        memberLevel,
        blockId: fullBodyBlockId,
        role: finalRole,
      },
      decision: {
        route: FULL_BODY_ROUTE,
        exerciseCount: fullBodyExercises.length,
      },
    });
  } else {
    // STRETCHING (tecnica only): pure (week, day) selection — must stay
    // byte-identical across all 6 levels of the same day (D-11, Pitfall 1).
    // Never derived from memberLevel/levelGroup.
    const stretchingExercises = await selectStretchingExercises(db, week, day);
    const stretchingBlockId = `${traceCodePrefix}-STRETCHING-W${week}-${day}-${memberLevel}`;
    const stretchingBlock: BlockPlan = {
      blockId: stretchingBlockId,
      role: "STRETCHING",
      route: STRETCHING_ROUTE,
      pattern: "MOVILIDAD",
      intensity: STRETCHING_INTENSITY,
      repsBudget: STRETCHING_REPS_BUDGET,
      format: await resolveRealFormat(db, "Stretching"),
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
  }

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
 * Resolve a real `formats` row by name ('Stretching' from migration 0172,
 * 'Circuito cooperativo' pre-existing). Never a synthetic/zero format id —
 * both closing blocks use real formats, unlike ROM's synthetic one.
 */
async function resolveRealFormat(
  db: MySql2Database<typeof schema>,
  name: string,
): Promise<FormatInstance> {
  const format = await queryFormatByName(db, name);
  if (!format) {
    throw new Error(`Format '${name}' not found in formats table`);
  }
  return { formatId: format.formatId, name: format.name };
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

  // Phase 178 (T-178-03): COMBOS_II_ALT reuses the COMBOS_II pool, but its
  // hashInput includes "COMBOS_II_ALT" (not just the role) so it lands on a
  // different index than routeComboII in the common case; if it still
  // collides, `resolveDistinctRoutePool` shifts to the next pool index.
  const routeComboIIAlt = resolveDistinctRoutePool(
    COMBOS_ROUTE_POOLS.COMBOS_II,
    `${week}-${day}-COMBOS_II_ALT`,
    routeComboII,
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
    { role: "COMBOS_II_ALT", route: routeComboIIAlt },
  );
}
