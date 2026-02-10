/**
 * Pipeline Orchestrator
 *
 * Runs all 7 stages in sequence for a single block,
 * passing enriched context through each stage.
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../../../db/schema';
import { SpomService } from '../../spom/service';
import type { BlockContext, BlockContextComplete } from './context';
import type { BlockPlan, TraceEvent } from '../types';
import { createTraceEvent, appendTrace } from './context';

// Import all stages
import { resolveRotator } from './stage-1-rotator';
import { resolveSpom } from './stage-2-spom';
import { deriveBudget } from './stage-3-budget';
import { deriveContraction } from './stage-4-contraction';
import { selectFormat } from './stage-5-format';
import { selectExercises } from './stage-6-exercises';
import { generatePrescriptions } from './stage-7-prescription';

// Import INITIUM special pipeline
import { runInitiumPipeline } from './initium-pipeline';

/** Options for block pipeline execution */
export interface BlockPipelineOptions {
  /** Force a specific format (used for Deuteros consistency) */
  forcedFormat?: {
    formatId: number;
    name: string;
  };
}

/**
 * Run the complete block pipeline
 *
 * Executes stages 1-7 in sequence, each enriching the context.
 * Handles errors by adding ERROR trace event and re-throwing.
 *
 * @param initialContext - Starting context with week, day, levelGroup, role
 * @param spomService - SPOM service for data lookups
 * @param db - Database connection for direct queries
 * @param options - Optional pipeline options (e.g., forced format)
 * @returns Complete BlockPlan with all fields populated
 */
export async function runBlockPipeline(
  initialContext: BlockContext,
  spomService: SpomService,
  db: MySql2Database<typeof schema>,
  options?: BlockPipelineOptions
): Promise<BlockPlan> {
  // INITIUM uses special pipeline (no SPOM lookup per spec)
  if (initialContext.role === 'INITIUM') {
    return runInitiumPipeline(initialContext, db);
  }

  let ctx: BlockContext | BlockContextComplete = initialContext;

  try {
    // Stage 1: Resolve route from rotator
    const ctx1 = await resolveRotator(ctx, spomService);

    // Stage 2: Resolve SPOM rule
    const ctx2 = await resolveSpom(ctx1, spomService);

    // Stage 3: Derive budget from intensity
    const ctx3 = await deriveBudget(ctx2, spomService);

    // Stage 4: Derive contraction mix
    const ctx4 = await deriveContraction(ctx3, spomService);

    // Stage 5: Select format (or use forced format for Deuteros consistency)
    let ctx5;
    if (options?.forcedFormat) {
      // Skip format selection, use forced format (for DEUTEROS_2 to match DEUTEROS_1)
      const formatTrace = createTraceEvent(
        ctx4,
        'FORMAT_FORCED',
        'INFO',
        {
          reason: 'Deuteros blocks must share same format',
          formatId: options.forcedFormat.formatId,
          formatName: options.forcedFormat.name,
        }
      );
      ctx5 = {
        ...appendTrace(ctx4, formatTrace),
        format: options.forcedFormat,
      };
    } else {
      ctx5 = await selectFormat(ctx4, db);
    }

    // Stage 6: Select exercises
    const ctx6 = await selectExercises(ctx5, db);

    // Stage 7: Generate prescriptions
    const finalCtx = generatePrescriptions(ctx6);

    // Assemble final BlockPlan
    const blockPlan: BlockPlan = {
      blockId: finalCtx.blockId,
      role: finalCtx.role,
      route: finalCtx.route,
      pattern: finalCtx.pattern,
      intensity: finalCtx.intensity,
      repsBudget: finalCtx.repsBudget,
      format: finalCtx.format,
      formatParams: finalCtx.formatParams,
      exercises: finalCtx.prescriptions,
      trace: finalCtx.trace,
    };

    return blockPlan;
  } catch (error) {
    // Add ERROR trace and re-throw
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorTrace = createTraceEvent(
      ctx,
      'PIPELINE_ERROR',
      'ERROR',
      {
        stage: 'unknown',
        error: errorMessage,
      }
    );
    ctx = appendTrace(ctx, errorTrace);
    throw error;
  }
}

export { createInitialContext } from './context';
