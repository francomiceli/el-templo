/**
 * Trace Event Types for Session Generation Pipeline
 *
 * Provides comprehensive type definitions for structured logging
 * and auditability of all pipeline decisions.
 */

/** Trace event severity levels */
export type TraceSeverity = "INFO" | "WARNING" | "ERROR" | "HARD_ERROR";

/**
 * Trace event codes - comprehensive list from system specs
 *
 * Each code represents a specific decision point in the pipeline.
 */
export type TraceCode =
  // Stage 1: Rotator
  | "ROUTE_RESOLVED"
  | "ROUTE_SKIPPED" // DEUTEROS_2 null
  // Stage 2: SPOM
  | "SPOM_RESOLVED"
  | "SPOM_NOT_FOUND"
  // Stage 3: Budget
  | "BUDGET_DERIVED"
  | "BUDGET_CAPPED"
  | "INTENSITY_RULE_NOT_FOUND"
  // Stage 4: Contraction
  | "CONTRACTION_DERIVED"
  | "CONTRACTION_RULE_NOT_FOUND"
  // Stage 5: Format
  | "FORMAT_SELECTED"
  | "FORMAT_FALLBACK"
  | "FORMAT_DEFAULT_USED"
  | "FORMAT_FORCED"
  // Stage 6: Exercises
  | "EXERCISES_SELECTED"
  | "EXERCISE_FALLBACK"
  | "EXERCISE_POOL_EMPTY"
  | "EXERCISE_SELECTION_SHIFT"
  | "CROSS_ROUTE_SELECTED"
  | "CROSS_ROUTE_EMPTY"
  | "CONTRACTION_SUBSTITUTED"
  // Stage 7: Prescription
  | "PRESCRIPTIONS_GENERATED"
  | "BUDGET_ALLOCATION"
  // Validation
  | "VALIDATION_PASSED"
  | "VALIDATION_WARNING"
  | "VALIDATION_FAILED"
  // Session level
  | "SESSION_GENERATED"
  | "SESSION_CACHED"
  | "SESSION_ERROR"
  // Block level
  | "BLOCK_STARTED"
  | "BLOCK_COMPLETED"
  | "BLOCK_SKIPPED"
  // Pipeline level
  | "PIPELINE_ERROR"
  // Initium-specific
  | "INITIUM_FORMAT_SELECTED"
  | "INITIUM_CONTEXTUAL_ATTEMPT"
  | "INITIUM_CONTEXTUAL_SUCCESS"
  | "INITIUM_GENERIC_FALLBACK"
  | "INITIUM_PIPELINE_SELECTED"
  | "INITIUM_EXERCISES_SELECTED"
  | "INITIUM_PRESCRIPTIONS_GENERATED";

/** Location context for trace events */
export interface TraceWhere {
  readonly weekId: number;
  readonly dayId: string;
  readonly levelGroup: string;
  readonly blockId?: string;
  readonly blockRole?: string;
  readonly stage?: number;
  readonly slotIndex?: number; // For exercise selection
}

/** Full trace event structure */
export interface TraceEvent {
  readonly ts: string; // ISO timestamp
  readonly severity: TraceSeverity;
  readonly code: TraceCode;
  readonly where: TraceWhere;
  readonly decision?: Readonly<Record<string, unknown>>; // What was decided
  readonly reason?: Readonly<{
    ruleId?: string;
    tieBreakers?: readonly string[];
    fallbackTier?: number;
  }>;
  readonly metrics?: Readonly<Record<string, number>>; // Performance/count data
  readonly message?: string; // Human-readable summary
}

/** Aggregated traces per block */
export interface BlockTrace {
  readonly blockId: string;
  readonly events: readonly TraceEvent[];
  readonly summary: {
    readonly totalEvents: number;
    readonly warnings: number;
    readonly errors: number;
    readonly fallbacksApplied: number;
  };
}

/** Aggregated session traces with timing */
export interface SessionTrace {
  readonly sessionId: string;
  readonly blockTraces: readonly BlockTrace[];
  readonly summary: {
    readonly totalEvents: number;
    readonly totalWarnings: number;
    readonly totalErrors: number;
    readonly generationDurationMs: number;
  };
}
