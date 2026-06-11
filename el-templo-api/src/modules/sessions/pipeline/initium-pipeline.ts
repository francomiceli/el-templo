/**
 * INITIUM Pipeline Handler
 *
 * Special pipeline for INITIUM warmup block that bypasses SPOM lookup.
 * Per system specs (line 266, 506):
 * - INITIUM has NO route (route.code not required)
 * - Does NOT use reps_budget (warmup/skill prep)
 * - Uses fixed warmup intensity (~30%)
 * - Selects exercises from FLOW pattern or Movilidad category
 *
 * Contextual enhancement (13-04):
 * - Uses nucleusRoute to select exercises contextual to day's main stimulus
 * - If Nucleus is push-dominant -> shoulder/chest mobility exercises
 * - If Nucleus is pull-dominant -> back/scapular activation exercises
 * - If Nucleus is lower body -> hip/leg mobility exercises
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, or, like, and, lte, isNotNull } from "drizzle-orm";
import * as schema from "../../../db/schema";
import type { BlockContext } from "./context";
import type { BlockPlan, ContractionMix } from "../types";
import { createTraceEvent, appendTrace } from "./context";
import {
  queryFormatsAnyLevel,
  selectBestFormat,
} from "../fallback/format-fallback";
import type { ContentLevel } from "./utils/level-mapping";
import { ROUTE_TO_MOBILITY_ROUTES } from "./utils/mobility-routes";
import { calculateExerciseOffset, selectWithVariety } from "./utils/variety";
import { REST_TIMES, ISO_SECONDS } from "./utils/constants";
import { getDefaultFormatParams } from "../../admin/format-params";

// Fixed INITIUM parameters (per spec and existing validator ranges)
const INITIUM_INTENSITY = 30;
const INITIUM_PATTERN = "FLOW";
const INITIUM_CATEGORY = "Movilidad";
const INITIUM_EXERCISE_COUNT = 4;
const INITIUM_DIFFICULTY_BUCKET = 3;
const INITIUM_POOL_SIZE = 20;
const INITIUM_REPS_PER_EXERCISE = 30;
const INITIUM_SERIES = 2;
const INITIUM_CONTRACTION_MIX: ContractionMix = { CON: 2, EXC: 1, ISO: 0 };
// Exercise *content* levels (never 'kairos' — kairos borrows Alfa content, D-03).
const INITIUM_LEVELS: ContentLevel[] = [
  "alfa",
  "delta",
  "sigma",
  "omega",
  "spartan",
];

interface InitiumExercise {
  id: number;
  name: string;
  effort: string;
  difficulty: number;
  pattern: string;
  category: string;
  mobilityRelated: string | null;
}

/**
 * Select the best format for INITIUM block.
 * Uses level-agnostic query with intensity=55 (minimum with compatibility entries).
 *
 * INITIUM is the shared day warmup: it must come out IDENTICAL for every member
 * level (kairos included) so the printed sheet and all per-level sessions agree.
 * No level-dependent input may enter this selection.
 */
async function selectInitiumFormat(
  db: MySql2Database<typeof schema>,
  ctx: BlockContext,
  excludeFormatNames?: string[],
): Promise<{
  format: { formatId: number; name: string };
  ctx: BlockContext;
}> {
  let updatedCtx = ctx;

  let formatCandidates = await queryFormatsAnyLevel(db, "initium", 55);

  if (formatCandidates.length === 0) {
    throw new Error("No format found for INITIUM block");
  }

  // Apply exclusions (avoid repeating formats within the same day)
  if (excludeFormatNames && excludeFormatNames.length > 0) {
    const filtered = formatCandidates.filter(
      (c) => !excludeFormatNames.includes(c.name),
    );
    if (filtered.length > 0) formatCandidates = filtered;
  }

  const selectedFormat = selectBestFormat(formatCandidates);

  const formatTrace = createTraceEvent(
    updatedCtx,
    "INITIUM_FORMAT_SELECTED",
    "INFO",
    {
      formatId: selectedFormat.formatId,
      formatName: selectedFormat.name,
      candidateCount: formatCandidates.length,
    },
  );
  updatedCtx = appendTrace(updatedCtx, formatTrace);

  return { format: selectedFormat, ctx: updatedCtx };
}

/**
 * Try contextual exercise selection based on nucleus route.
 * Returns exercises if enough contextual matches are found, otherwise null.
 */
async function selectContextualExercises(
  db: MySql2Database<typeof schema>,
  ctx: BlockContext,
  nucleusRoute: string,
  exerciseOffset: number,
  exerciseCount: number,
): Promise<{
  exercises: InitiumExercise[] | null;
  ctx: BlockContext;
}> {
  let updatedCtx = ctx;
  const relatedMobilityRoutes = ROUTE_TO_MOBILITY_ROUTES[nucleusRoute] || [];

  const contextAttemptTrace = createTraceEvent(
    updatedCtx,
    "INITIUM_CONTEXTUAL_ATTEMPT",
    "INFO",
    {
      nucleusRoute,
      relatedMobilityRoutes,
      hasMapping: relatedMobilityRoutes.length > 0,
    },
  );
  updatedCtx = appendTrace(updatedCtx, contextAttemptTrace);

  if (relatedMobilityRoutes.length === 0) {
    return { exercises: null, ctx: updatedCtx };
  }

  const contextualPool = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.exercise,
      effort: schema.exercises.effort,
      difficulty: schema.exercises.difficulty,
      pattern: schema.exercises.pattern,
      category: schema.exercises.category,
      mobilityRelated: schema.exercises.mobilityRelated,
    })
    .from(schema.exercises)
    .where(
      and(
        or(
          like(schema.exercises.pattern, "%FLOW%"),
          eq(schema.exercises.category, INITIUM_CATEGORY),
        ),
        or(...INITIUM_LEVELS.map((level) => eq(schema.exercises.level, level))),
        lte(schema.exercises.difficulty, INITIUM_DIFFICULTY_BUCKET),
        isNotNull(schema.exercises.mobilityRelated),
        or(
          ...relatedMobilityRoutes.map((route) =>
            like(schema.exercises.mobilityRelated, `%${route}%`),
          ),
        ),
      ),
    )
    .orderBy(schema.exercises.id)
    .limit(INITIUM_POOL_SIZE);

  const contextualExercises = selectWithVariety(
    contextualPool,
    exerciseCount,
    exerciseOffset,
  );

  if (contextualExercises.length >= exerciseCount) {
    const successTrace = createTraceEvent(
      updatedCtx,
      "INITIUM_CONTEXTUAL_SUCCESS",
      "INFO",
      {
        nucleusRoute,
        poolSize: contextualPool.length,
        exerciseOffset,
        selectionMethod: "stride_variety",
        selectedCount: contextualExercises.length,
        requiredCount: exerciseCount,
        exercises: contextualExercises.map((e) => ({
          id: e.id,
          name: e.name,
          mobilityRelated: e.mobilityRelated,
        })),
      },
    );
    updatedCtx = appendTrace(updatedCtx, successTrace);
    return { exercises: contextualExercises, ctx: updatedCtx };
  }

  const fallbackTrace = createTraceEvent(
    updatedCtx,
    "INITIUM_CONTEXTUAL_FALLBACK",
    "INFO",
    {
      nucleusRoute,
      poolSize: contextualPool.length,
      selectedCount: contextualExercises.length,
      requiredCount: exerciseCount,
      reason:
        "Not enough contextual exercises, falling back to generic selection",
    },
  );
  updatedCtx = appendTrace(updatedCtx, fallbackTrace);
  return { exercises: null, ctx: updatedCtx };
}

/**
 * Goal-plan-specific contextual exercise selection using pre-computed mobility routes.
 * Used when goal plan pipeline provides zone-specific mobility routes directly,
 * bypassing the nucleusRoute -> ROUTE_TO_MOBILITY_ROUTES lookup.
 */
async function selectGoalPlanContextualExercises(
  db: MySql2Database<typeof schema>,
  ctx: BlockContext,
  goalPlanMobilityRoutes: string[],
  exerciseOffset: number,
  exerciseCount: number,
): Promise<{
  exercises: InitiumExercise[] | null;
  ctx: BlockContext;
}> {
  let updatedCtx = ctx;

  const contextAttemptTrace = createTraceEvent(
    updatedCtx,
    "INITIUM_GOAL_PLAN_CONTEXTUAL_ATTEMPT",
    "INFO",
    {
      goalPlanMobilityRoutes,
      routeCount: goalPlanMobilityRoutes.length,
    },
  );
  updatedCtx = appendTrace(updatedCtx, contextAttemptTrace);

  if (goalPlanMobilityRoutes.length === 0) {
    return { exercises: null, ctx: updatedCtx };
  }

  const contextualPool = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.exercise,
      effort: schema.exercises.effort,
      difficulty: schema.exercises.difficulty,
      pattern: schema.exercises.pattern,
      category: schema.exercises.category,
      mobilityRelated: schema.exercises.mobilityRelated,
    })
    .from(schema.exercises)
    .where(
      and(
        or(
          like(schema.exercises.pattern, "%FLOW%"),
          eq(schema.exercises.category, INITIUM_CATEGORY),
        ),
        or(...INITIUM_LEVELS.map((level) => eq(schema.exercises.level, level))),
        lte(schema.exercises.difficulty, INITIUM_DIFFICULTY_BUCKET),
        isNotNull(schema.exercises.mobilityRelated),
        or(
          ...goalPlanMobilityRoutes.map((route) =>
            like(schema.exercises.mobilityRelated, `%${route}%`),
          ),
        ),
      ),
    )
    .orderBy(schema.exercises.id)
    .limit(INITIUM_POOL_SIZE);

  const contextualExercises = selectWithVariety(
    contextualPool,
    exerciseCount,
    exerciseOffset,
  );

  if (contextualExercises.length >= exerciseCount) {
    const successTrace = createTraceEvent(
      updatedCtx,
      "INITIUM_GOAL_PLAN_CONTEXTUAL_SUCCESS",
      "INFO",
      {
        goalPlanMobilityRoutes,
        poolSize: contextualPool.length,
        exerciseOffset,
        selectionMethod: "stride_variety",
        selectedCount: contextualExercises.length,
        requiredCount: exerciseCount,
        exercises: contextualExercises.map((e) => ({
          id: e.id,
          name: e.name,
          mobilityRelated: e.mobilityRelated,
        })),
      },
    );
    updatedCtx = appendTrace(updatedCtx, successTrace);
    return { exercises: contextualExercises, ctx: updatedCtx };
  }

  const fallbackTrace = createTraceEvent(
    updatedCtx,
    "INITIUM_GOAL_PLAN_CONTEXTUAL_FALLBACK",
    "INFO",
    {
      goalPlanMobilityRoutes,
      poolSize: contextualPool.length,
      selectedCount: contextualExercises.length,
      requiredCount: exerciseCount,
      reason:
        "Not enough goal-plan-contextual exercises, falling back to generic selection",
    },
  );
  updatedCtx = appendTrace(updatedCtx, fallbackTrace);
  return { exercises: null, ctx: updatedCtx };
}

/**
 * Generic FLOW/Movilidad exercise selection (fallback when contextual fails).
 */
async function selectGenericExercises(
  db: MySql2Database<typeof schema>,
  exerciseOffset: number,
  exerciseCount: number,
): Promise<InitiumExercise[]> {
  const genericPool = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.exercise,
      effort: schema.exercises.effort,
      difficulty: schema.exercises.difficulty,
      pattern: schema.exercises.pattern,
      category: schema.exercises.category,
      mobilityRelated: schema.exercises.mobilityRelated,
    })
    .from(schema.exercises)
    .where(
      and(
        or(
          like(schema.exercises.pattern, "%FLOW%"),
          eq(schema.exercises.category, INITIUM_CATEGORY),
        ),
        or(...INITIUM_LEVELS.map((level) => eq(schema.exercises.level, level))),
        lte(schema.exercises.difficulty, INITIUM_DIFFICULTY_BUCKET),
      ),
    )
    .orderBy(schema.exercises.id)
    .limit(INITIUM_POOL_SIZE);

  return selectWithVariety(genericPool, exerciseCount, exerciseOffset);
}

/**
 * Generate warmup prescriptions with proper volume distribution.
 */
function generateInitiumPrescriptions(exercises: InitiumExercise[]): {
  exerciseId: number;
  name: string;
  contraction: "CON" | "EXC" | "ISO";
  reps: number;
  seconds: number;
  rest: number;
  notes: string;
  dificultadLineal: number;
}[] {
  return exercises.map((ex) => {
    const effort = (ex.effort?.toUpperCase() || "CON") as "CON" | "EXC" | "ISO";
    const isIsometric = effort === "ISO";

    return {
      exerciseId: ex.id,
      name: ex.name,
      contraction: effort,
      reps: isIsometric ? 0 : INITIUM_REPS_PER_EXERCISE,
      seconds: isIsometric ? ISO_SECONDS.DEFAULT : 0,
      rest: REST_TIMES.WARMUP,
      notes: "Entrada en calor - enfocate en la tecnica y activacion",
      dificultadLineal: ex.difficulty,
    };
  });
}

/**
 * Run INITIUM-specific pipeline
 *
 * Bypasses standard SPOM-based pipeline with fixed warmup parameters.
 * Per spec: INITIUM is warmup/mobility block with no route, no reps_budget.
 *
 * @param ctx - Initial block context with week, day, levelGroup, role='INITIUM'
 * @param db - Database connection for format/exercise queries
 * @param excludeFormatNames - Format names to exclude for variety
 * @param goalPlanMobilityRoutes - Optional zone-specific mobility routes for goal plan sessions.
 *   When provided, overrides nucleusRoute-based contextual selection with goal plan zone routes.
 * @returns Complete BlockPlan with warmup configuration
 */
export async function runInitiumPipeline(
  ctx: BlockContext,
  db: MySql2Database<typeof schema>,
  excludeFormatNames?: string[],
  goalPlanMobilityRoutes?: string[],
): Promise<BlockPlan> {
  let updatedCtx = ctx;

  // Mark that INITIUM special pipeline is being used
  const pipelineTrace = createTraceEvent(
    updatedCtx,
    "INITIUM_PIPELINE_USED",
    "INFO",
    {
      reason: "INITIUM bypasses SPOM lookup per spec line 266, 506",
    },
  );
  updatedCtx = appendTrace(updatedCtx, pipelineTrace);

  const route = "INITIUM";
  const repsBudget = ctx.week % 2 === 0 ? 100 : 80;
  const exerciseOffset = calculateExerciseOffset(ctx.week, ctx.day);

  const paramsTrace = createTraceEvent(
    updatedCtx,
    "INITIUM_PARAMS_SET",
    "INFO",
    {
      route,
      intensity: INITIUM_INTENSITY,
      pattern: INITIUM_PATTERN,
      category: INITIUM_CATEGORY,
      repsBudget,
      exerciseCount: INITIUM_EXERCISE_COUNT,
      difficultyBucket: String(INITIUM_DIFFICULTY_BUCKET),
      contractionMix: INITIUM_CONTRACTION_MIX,
    },
  );
  updatedCtx = appendTrace(updatedCtx, paramsTrace);

  // Step 1: Select format
  const formatResult = await selectInitiumFormat(
    db,
    updatedCtx,
    excludeFormatNames,
  );
  updatedCtx = formatResult.ctx;

  // Step 2: Select exercises (contextual first, then generic fallback)
  let exerciseResults: InitiumExercise[] = [];
  let usedContextual = false;

  if (goalPlanMobilityRoutes && goalPlanMobilityRoutes.length > 0) {
    // Goal plan mode: use zone-specific mobility routes directly
    const goalPlanContextResult = await selectGoalPlanContextualExercises(
      db,
      updatedCtx,
      goalPlanMobilityRoutes,
      exerciseOffset,
      INITIUM_EXERCISE_COUNT,
    );
    updatedCtx = goalPlanContextResult.ctx;
    if (goalPlanContextResult.exercises) {
      exerciseResults = goalPlanContextResult.exercises;
      usedContextual = true;
    }
  } else if (ctx.nucleusRoute) {
    // Standard mode: derive mobility routes from nucleus route
    const contextualResult = await selectContextualExercises(
      db,
      updatedCtx,
      ctx.nucleusRoute,
      exerciseOffset,
      INITIUM_EXERCISE_COUNT,
    );
    updatedCtx = contextualResult.ctx;
    if (contextualResult.exercises) {
      exerciseResults = contextualResult.exercises;
      usedContextual = true;
    }
  }

  if (!usedContextual) {
    exerciseResults = await selectGenericExercises(
      db,
      exerciseOffset,
      INITIUM_EXERCISE_COUNT,
    );
  }

  if (exerciseResults.length === 0) {
    throw new Error(
      "No INITIUM exercises found (FLOW pattern or Movilidad category)",
    );
  }

  const exercisesTrace = createTraceEvent(
    updatedCtx,
    "INITIUM_EXERCISES_SELECTED",
    "INFO",
    {
      count: exerciseResults.length,
      usedContextual,
      nucleusRoute: ctx.nucleusRoute || null,
      exerciseOffset,
      week: ctx.week,
      day: ctx.day,
      exercises: exerciseResults.map((e) => ({
        id: e.id,
        name: e.name,
        pattern: e.pattern,
        category: e.category,
        mobilityRelated: e.mobilityRelated,
      })),
    },
  );
  updatedCtx = appendTrace(updatedCtx, exercisesTrace);

  // Step 3: Generate prescriptions (fixed 30 reps per exercise)
  const prescriptions = generateInitiumPrescriptions(exerciseResults);

  const prescriptionTrace = createTraceEvent(
    updatedCtx,
    "INITIUM_PRESCRIPTIONS_GENERATED",
    "INFO",
    {
      count: prescriptions.length,
      repsBudget,
      series: INITIUM_SERIES,
      repsPerExercise: INITIUM_REPS_PER_EXERCISE,
      restSeconds: REST_TIMES.WARMUP,
    },
  );
  updatedCtx = appendTrace(updatedCtx, prescriptionTrace);

  // Step 4: Generate format parameters
  const formatParams = getDefaultFormatParams(formatResult.format.name, {
    intensity: INITIUM_INTENSITY,
    exerciseCount: prescriptions.length,
  });

  // Assemble final BlockPlan
  const blockPlan: BlockPlan = {
    blockId: updatedCtx.blockId,
    role: updatedCtx.role,
    route,
    pattern: INITIUM_PATTERN,
    intensity: INITIUM_INTENSITY,
    repsBudget,
    format: formatResult.format,
    formatParams,
    exercises: prescriptions,
    trace: updatedCtx.trace,
  };

  return blockPlan;
}
