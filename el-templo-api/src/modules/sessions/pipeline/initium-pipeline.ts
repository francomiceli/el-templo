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

import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, or, like, and, lte, isNotNull } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import type { BlockContext } from './context';
import type { BlockPlan, ContractionMix } from '../types';
import { createTraceEvent, appendTrace } from './context';
import { selectFormatWithFallback } from '../fallback/format-fallback';
import type { FormatRequirements } from '../fallback/types';
import { getAllowedLevels, levelGroupToLevel } from './utils/level-mapping';
import { ROUTE_TO_MOBILITY_ROUTES } from './utils/mobility-routes';
import { calculateExerciseOffset, selectWithVariety } from './utils/variety';
import { REST_TIMES, ISO_SECONDS } from './utils/constants';

/**
 * Run INITIUM-specific pipeline
 *
 * Bypasses standard SPOM-based pipeline with fixed warmup parameters.
 * Per spec: INITIUM is warmup/mobility block with no route, no reps_budget.
 *
 * @param ctx - Initial block context with week, day, levelGroup, role='INITIUM'
 * @param db - Database connection for format/exercise queries
 * @returns Complete BlockPlan with warmup configuration
 */
export async function runInitiumPipeline(
  ctx: BlockContext,
  db: MySql2Database<typeof schema>
): Promise<BlockPlan> {
  let updatedCtx = ctx;

  // Mark that INITIUM special pipeline is being used
  const pipelineTrace = createTraceEvent(
    updatedCtx,
    'INITIUM_PIPELINE_USED',
    'INFO',
    {
      reason: 'INITIUM bypasses SPOM lookup per spec line 266, 506',
    }
  );
  updatedCtx = appendTrace(updatedCtx, pipelineTrace);

  // Fixed INITIUM parameters (per spec and existing validator ranges)
  const route = 'INITIUM'; // Marker, not a real route
  const intensity = 30; // Low warmup intensity (INITIUM range: 10-40%)
  const pattern = 'FLOW'; // Mobility/warmup pattern
  const category = 'Movilidad'; // Warmup category
  // Warmup needs volume - alternate between 80 and 100 based on week parity
  const repsBudget = ctx.week % 2 === 0 ? 100 : 80;
  const exerciseCount = 4; // 3-4 exercises for warmup variety
  const difficultyBucket = '3'; // Easy warmup exercises (bucket 3 = low difficulty)

  // Calculate offset for exercise variety across sessions
  const exerciseOffset = calculateExerciseOffset(ctx.week, ctx.day);
  const exercisePoolSize = 20; // Query larger pool for rotation

  // INITIUM uses simple contraction mix (focus on concentric for warmup)
  const contractionMix: ContractionMix = {
    CON: 2,
    EXC: 1,
    ISO: 0,
  };

  const paramsTrace = createTraceEvent(
    updatedCtx,
    'INITIUM_PARAMS_SET',
    'INFO',
    {
      route,
      intensity,
      pattern,
      category,
      repsBudget,
      exerciseCount,
      difficultyBucket,
      contractionMix,
    }
  );
  updatedCtx = appendTrace(updatedCtx, paramsTrace);

  // Select format using fallback system
  // Note: use intensity=55 (minimum with format compatibility entries, since INITIUM warmup intensity 30 has none)
  const formatRequirements: FormatRequirements = {
    block: 'initium',
    level: levelGroupToLevel(ctx.levelGroup),
    intensity: 55, // Minimum intensity with format compatibility entries
  };

  const formatResult = await selectFormatWithFallback(formatRequirements, db);

  if (formatResult.status === 'failed') {
    throw new Error('No format found for INITIUM block (even with fallbacks)');
  }

  const selectedFormat = formatResult.data[0];

  const formatTrace = createTraceEvent(
    updatedCtx,
    'INITIUM_FORMAT_SELECTED',
    'INFO',
    {
      formatId: selectedFormat.formatId,
      formatName: selectedFormat.name,
      fallbackTier: formatResult.tier,
      usedFallback: formatResult.status === 'fallback',
    }
  );
  updatedCtx = appendTrace(updatedCtx, formatTrace);

  // Select exercises for INITIUM with contextual enhancement
  const allowedLevels = getAllowedLevels(ctx.levelGroup);
  const nucleusRoute = ctx.nucleusRoute;

  // Step 1: Try contextual selection if nucleusRoute is provided
  let exerciseResults: {
    id: number;
    name: string;
    effort: string;
    difficulty: number;
    pattern: string;
    category: string;
    mobilityRelated: string | null;
  }[] = [];
  let usedContextual = false;

  if (nucleusRoute) {
    const relatedMobilityRoutes = ROUTE_TO_MOBILITY_ROUTES[nucleusRoute] || [];

    // Trace contextual selection attempt
    const contextAttemptTrace = createTraceEvent(
      updatedCtx,
      'INITIUM_CONTEXTUAL_ATTEMPT',
      'INFO',
      {
        nucleusRoute,
        relatedMobilityRoutes,
        hasMapping: relatedMobilityRoutes.length > 0,
      }
    );
    updatedCtx = appendTrace(updatedCtx, contextAttemptTrace);

    if (relatedMobilityRoutes.length > 0) {
      // Query exercises where mobilityRelated matches any of the related routes
      // Query larger pool for variety rotation
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
              like(schema.exercises.pattern, '%FLOW%'),
              eq(schema.exercises.category, 'Movilidad')
            ),
            or(...allowedLevels.map(level => eq(schema.exercises.level, level))),
            lte(schema.exercises.difficulty, 3), // Easy warmup exercises
            isNotNull(schema.exercises.mobilityRelated),
            or(...relatedMobilityRoutes.map(route =>
              like(schema.exercises.mobilityRelated, `%${route}%`)
            ))
          )
        )
        .orderBy(schema.exercises.id) // Deterministic ordering
        .limit(exercisePoolSize);

      // Select with variety using stride-based approach for better day-to-day variation
      const contextualExercises = selectWithVariety(contextualPool, exerciseCount, exerciseOffset);

      if (contextualExercises.length >= exerciseCount) {
        exerciseResults = contextualExercises;
        usedContextual = true;

        const contextSuccessTrace = createTraceEvent(
          updatedCtx,
          'INITIUM_CONTEXTUAL_SUCCESS',
          'INFO',
          {
            nucleusRoute,
            poolSize: contextualPool.length,
            exerciseOffset,
            selectionMethod: 'stride_variety',
            selectedCount: contextualExercises.length,
            requiredCount: exerciseCount,
            exercises: contextualExercises.map(e => ({
              id: e.id,
              name: e.name,
              mobilityRelated: e.mobilityRelated,
            })),
          }
        );
        updatedCtx = appendTrace(updatedCtx, contextSuccessTrace);
      } else {
        // Not enough contextual matches, will fall back to generic
        const contextFallbackTrace = createTraceEvent(
          updatedCtx,
          'INITIUM_CONTEXTUAL_FALLBACK',
          'INFO',
          {
            nucleusRoute,
            poolSize: contextualPool.length,
            selectedCount: contextualExercises.length,
            requiredCount: exerciseCount,
            reason: 'Not enough contextual exercises, falling back to generic selection',
          }
        );
        updatedCtx = appendTrace(updatedCtx, contextFallbackTrace);
      }
    }
  }

  // Step 2: Fallback to generic FLOW/Movilidad selection if contextual didn't work
  if (!usedContextual) {
    // Query larger pool for variety rotation
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
            like(schema.exercises.pattern, '%FLOW%'),
            eq(schema.exercises.category, 'Movilidad')
          ),
          or(...allowedLevels.map(level => eq(schema.exercises.level, level))),
          lte(schema.exercises.difficulty, 3) // Easy warmup exercises
        )
      )
      .orderBy(schema.exercises.id) // Deterministic ordering
      .limit(exercisePoolSize);

    // Select with variety using stride-based approach for better day-to-day variation
    exerciseResults = selectWithVariety(genericPool, exerciseCount, exerciseOffset);
  }

  if (exerciseResults.length === 0) {
    throw new Error('No INITIUM exercises found (FLOW pattern or Movilidad category)');
  }

  const exercisesTrace = createTraceEvent(
    updatedCtx,
    'INITIUM_EXERCISES_SELECTED',
    'INFO',
    {
      count: exerciseResults.length,
      usedContextual,
      nucleusRoute: nucleusRoute || null,
      exerciseOffset,
      week: ctx.week,
      day: ctx.day,
      exercises: exerciseResults.map(e => ({
        id: e.id,
        name: e.name,
        pattern: e.pattern,
        category: e.category,
        mobilityRelated: e.mobilityRelated,
      })),
    }
  );
  updatedCtx = appendTrace(updatedCtx, exercisesTrace);

  // Generate warmup prescriptions with proper volume distribution
  // Assume 2 series for warmup - reps shown are per series, rounded to nearest 5
  const series = 2;
  const totalRepsPerExercise = repsBudget / exerciseResults.length;
  const repsPerSeries = Math.round(totalRepsPerExercise / series / 5) * 5; // Round to nearest 5
  const minReps = 10; // Minimum reps for warmup

  const prescriptions = exerciseResults.map(ex => {
    // Map 'effort' (CON/EXC/ISO) to contraction type, default to CON for warmup
    const effort = (ex.effort?.toUpperCase() || 'CON') as 'CON' | 'EXC' | 'ISO';

    // ISO exercises use seconds instead of reps
    const isIsometric = effort === 'ISO';

    return {
      exerciseId: ex.id,
      name: ex.name,
      contraction: effort,
      reps: isIsometric ? 0 : Math.max(repsPerSeries, minReps),
      seconds: isIsometric ? ISO_SECONDS.DEFAULT : 0,
      rest: REST_TIMES.WARMUP,
      notes: 'Warmup - focus on form and activation',
      dificultadLineal: ex.difficulty,
    };
  });

  const prescriptionTrace = createTraceEvent(
    updatedCtx,
    'INITIUM_PRESCRIPTIONS_GENERATED',
    'INFO',
    {
      count: prescriptions.length,
      repsBudget,
      series,
      repsPerSeries,
      restSeconds: REST_TIMES.WARMUP,
    }
  );
  updatedCtx = appendTrace(updatedCtx, prescriptionTrace);

  // Assemble final BlockPlan
  const blockPlan: BlockPlan = {
    blockId: updatedCtx.blockId,
    role: updatedCtx.role,
    route,
    pattern,
    intensity,
    repsBudget,
    format: {
      formatId: selectedFormat.formatId,
      name: selectedFormat.name,
    },
    exercises: prescriptions,
    trace: updatedCtx.trace,
  };

  return blockPlan;
}
