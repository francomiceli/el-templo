/**
 * Immutable Pipeline Context
 *
 * BlockContext is passed through pipeline stages, each stage
 * returning a new context with additional data populated.
 *
 * Pattern: Each stage function accepts context + dependencies,
 * returns new context with spread operator (never mutates).
 */

import type {
  LevelGroup,
  BlockRole,
  TraceEvent,
  ContractionMix,
  FormatInstance,
  SelectedExercise,
  ExercisePrescription,
  ExerciseLevel,
} from '../types';

/** Base context with required initial fields */
export interface BlockContext {
  readonly week: number;
  readonly day: string;
  readonly levelGroup: LevelGroup;
  readonly memberLevel: ExerciseLevel;
  readonly blockId: string;
  readonly role: BlockRole;
  readonly trace: readonly TraceEvent[];
  /** Day's Nucleus route for contextual Initium selection */
  readonly nucleusRoute?: string;
}

/** Context with route resolved (after stage 1) */
export interface BlockContextWithRoute extends BlockContext {
  readonly route: string;
}

/** Context with SPOM data resolved (after stage 2) */
export interface BlockContextWithSpom extends BlockContextWithRoute {
  readonly intensity: number;
  readonly pattern: string;
  readonly category: string;
}

/** Context with budget derived (after stage 3) */
export interface BlockContextWithBudget extends BlockContextWithSpom {
  readonly repsBudget: number;
  readonly exerciseCountMin: number;
  readonly exerciseCountMax: number;
  readonly difficultyBucket: string;
}

/** Context with contraction mix (after stage 4) */
export interface BlockContextWithContraction extends BlockContextWithBudget {
  readonly exerciseCount: number;
  readonly contractionMix: ContractionMix;
}

/** Context with format selected (after stage 5) */
export interface BlockContextWithFormat extends BlockContextWithContraction {
  readonly format: FormatInstance;
}

/** Context with exercises selected (after stage 6) */
export interface BlockContextWithExercises extends BlockContextWithFormat {
  readonly exercises: readonly SelectedExercise[];
}

/** Final context with prescriptions (after stage 7) */
export interface BlockContextComplete extends BlockContextWithExercises {
  readonly prescriptions: readonly ExercisePrescription[];
}

/**
 * Create initial context for a block
 *
 * @param week - SPOM week number
 * @param day - Day of week (lunes, martes, etc.)
 * @param levelGroup - Aggregated level group
 * @param memberLevel - Member's individual level
 * @param role - Block role (INITIUM, NUCLEUS, etc.)
 * @param nucleusRoute - Optional Nucleus route for contextual Initium selection
 * @returns Initial BlockContext ready for pipeline
 */
export function createInitialContext(
  week: number,
  day: string,
  levelGroup: LevelGroup,
  memberLevel: ExerciseLevel,
  role: BlockRole,
  nucleusRoute?: string
): BlockContext {
  const blockId = `W${week}-${day}-${memberLevel}-${role}`;

  return {
    week,
    day,
    levelGroup,
    memberLevel,
    blockId,
    role,
    trace: [],
    nucleusRoute,
  };
}

/**
 * Create a trace event for the current context
 *
 * @param ctx - Current block context
 * @param code - Event code (e.g., ROUTE_RESOLVED)
 * @param severity - Event severity
 * @param decision - Optional decision data
 * @param reason - Optional reason data
 * @returns TraceEvent with timestamp and context location
 */
export function createTraceEvent(
  ctx: BlockContext,
  code: string,
  severity: 'INFO' | 'WARNING' | 'ERROR',
  decision?: Record<string, unknown>,
  reason?: { ruleId?: string; tieBreakers?: string[] }
): TraceEvent {
  return {
    ts: new Date().toISOString(),
    severity,
    code,
    where: {
      week: ctx.week,
      day: ctx.day,
      levelGroup: ctx.levelGroup,
      memberLevel: ctx.memberLevel,
      blockId: ctx.blockId,
      role: ctx.role,
    },
    ...(decision && { decision }),
    ...(reason && { reason }),
  };
}

/**
 * Append a trace event to context immutably
 *
 * @param ctx - Current context
 * @param event - Trace event to append
 * @returns New context with event appended to trace
 */
export function appendTrace<T extends BlockContext>(
  ctx: T,
  event: TraceEvent
): T {
  return {
    ...ctx,
    trace: [...ctx.trace, event],
  };
}
