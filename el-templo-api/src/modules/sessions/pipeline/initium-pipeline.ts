/**
 * INITIUM Pipeline Handler
 *
 * Special pipeline for INITIUM warmup block that bypasses SPOM lookup.
 * Per system specs (line 266, 506):
 * - INITIUM has NO route (route.code not required)
 * - Does NOT use reps_budget (warmup/skill prep)
 * - Uses fixed warmup intensity (~30%)
 * - Selects exercises from FLOW pattern or Movilidad category
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, or, like, and, lte } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import type { BlockContext } from './context';
import type { BlockPlan, ContractionMix, LevelGroup } from '../types';
import { createTraceEvent, appendTrace } from './context';
import { selectFormatWithFallback } from '../fallback/format-fallback';
import type { FormatRequirements } from '../fallback/types';

/** Get allowed exercise levels for a level group */
function getAllowedLevels(levelGroup: LevelGroup): ('alfa' | 'delta' | 'sigma' | 'omega' | 'spartan')[] {
  switch (levelGroup) {
    case 'alfa_delta':
      return ['alfa', 'delta'];
    case 'sigma':
      return ['alfa', 'delta', 'sigma'];
    case 'omega':
      return ['alfa', 'delta', 'sigma', 'omega', 'spartan'];
  }
}

/** Map LevelGroup to individual level for format lookup */
function levelGroupToLevel(levelGroup: LevelGroup): 'alfa' | 'delta' | 'sigma' | 'omega' {
  // Use representative level from each group
  switch (levelGroup) {
    case 'alfa_delta':
      return 'delta'; // Use delta as representative (higher of the two)
    case 'sigma':
      return 'sigma';
    case 'omega':
      return 'omega';
  }
}

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
  const repsBudget = 0; // Not used per spec line 506
  const exerciseCount = 3; // Fixed warmup exercise count
  const difficultyBucket = '3'; // Easy warmup exercises (bucket 3 = low difficulty)

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

  // Select exercises for INITIUM (FLOW pattern or Movilidad category)
  const allowedLevels = getAllowedLevels(ctx.levelGroup);

  const exerciseResults = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.exercise,
      effort: schema.exercises.effort,
      difficulty: schema.exercises.difficulty,
      pattern: schema.exercises.pattern,
      category: schema.exercises.category,
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
    .limit(exerciseCount);

  if (exerciseResults.length === 0) {
    throw new Error('No INITIUM exercises found (FLOW pattern or Movilidad category)');
  }

  const exercisesTrace = createTraceEvent(
    updatedCtx,
    'INITIUM_EXERCISES_SELECTED',
    'INFO',
    {
      count: exerciseResults.length,
      exercises: exerciseResults.map(e => ({
        id: e.id,
        name: e.name,
        pattern: e.pattern,
        category: e.category,
      })),
    }
  );
  updatedCtx = appendTrace(updatedCtx, exercisesTrace);

  // Generate simple warmup prescriptions
  const prescriptions = exerciseResults.map(ex => {
    // Map 'effort' (CON/EXC/ISO) to contraction type
    const effort = ex.effort as 'CON' | 'EXC' | 'ISO';

    return {
      exerciseId: ex.id,
      name: ex.name,
      contraction: effort,
      reps: 10, // Standard warmup reps
      seconds: 0, // Not time-based
      rest: 30, // Short warmup rest
      notes: 'Warmup - focus on form and activation',
    };
  });

  const prescriptionTrace = createTraceEvent(
    updatedCtx,
    'INITIUM_PRESCRIPTIONS_GENERATED',
    'INFO',
    {
      count: prescriptions.length,
      repsPerExercise: 10,
      restSeconds: 30,
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
