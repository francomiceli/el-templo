/**
 * Format Parameters Type System
 *
 * Defines the FormatParams discriminated union and default value factory
 * for configurable format parameters. These parameters describe the format
 * configuration (coach-visible metadata) and are stored in session_blocks.formatParams.
 *
 * Coverage: All HIGH and MEDIUM importance formats from Phase 13.
 */

// =============================================================================
// Type Definitions
// =============================================================================

export type FormatParams =
  | { type: 'amrap'; minutes: number }
  | { type: 'emom'; intervalSeconds: number; totalMinutes: number }
  | { type: 'complex'; rounds: number }
  | { type: 'tabata'; workSeconds: number; restSeconds: number; rounds: number }
  | { type: 'interval'; workSeconds: number; restSeconds: number; rounds: number }
  | { type: 'for_time'; timeCapMinutes?: number }
  | { type: 'chipper'; rounds: number }
  | { type: 'buy_in_cash_out'; rounds?: number }
  | { type: 'cluster'; clusterSize: number; restBetweenClusters: number }
  | { type: 'ladder'; direction: 'ascending' | 'descending' }
  | { type: 'unbroken' }
  | { type: 'couplet' }
  | { type: 'triplet' }
  | { type: 'for_max' }
  | { type: 'time_cap'; minutes: number }
  | { type: 'standard' };

// =============================================================================
// Default Value Constants
// =============================================================================

/** Default values aligned with existing constants.ts decisions */
const DEFAULTS = {
  AMRAP_MINUTES: 10, // Decision 08-01
  EMOM_INTERVAL_SECONDS: 60, // Decision 08-01
  COMPLEX_ROUNDS: 3,
  TABATA_WORK_SECONDS: 20, // Decision 13-07
  TABATA_REST_SECONDS: 10, // Decision 13-07
  TABATA_ROUNDS: 8,
  INTERVAL_HIGH_WORK: 30, // From constants.ts
  INTERVAL_HIGH_REST: 30,
  INTERVAL_MEDIUM_WORK: 40,
  INTERVAL_MEDIUM_REST: 20,
  INTERVAL_LOW_WORK: 45,
  INTERVAL_LOW_REST: 15,
  INTERVAL_DEFAULT_ROUNDS: 8,
  CHIPPER_ROUNDS: 1,
  BUY_IN_CASH_OUT_DEFAULT_ROUNDS: 3,
  CLUSTER_SIZE: 3,
  CLUSTER_REST_SECONDS: 90,
  LADDER_HIGH_INTENSITY_THRESHOLD: 75, // Decision 13-07
  TIME_CAP_MINUTES: 10,
} as const;

// =============================================================================
// Factory Function
// =============================================================================

export interface FormatParamsContext {
  intensity: number;
  exerciseCount: number;
}

/**
 * Get default format parameters for a given format name
 *
 * Normalizes format name (lowercase, strip spaces), maps to correct type
 * with sensible defaults. Uses intensity to determine ladder direction,
 * uses exerciseCount for EMOM total minutes.
 *
 * @param formatName - Format name from session generation (e.g., "AMRAP", "EMOM", "Complex")
 * @param context - Intensity and exercise count for context-dependent defaults
 * @returns FormatParams with appropriate defaults
 */
export function getDefaultFormatParams(
  formatName: string,
  context: FormatParamsContext
): FormatParams {
  const normalized = formatName.toLowerCase().trim().replace(/\s+/g, '_');
  const { intensity, exerciseCount } = context;

  // AMRAP formats
  if (normalized.includes('amrap')) {
    return { type: 'amrap', minutes: DEFAULTS.AMRAP_MINUTES };
  }

  // EMOM formats
  if (normalized.includes('emom')) {
    return {
      type: 'emom',
      intervalSeconds: DEFAULTS.EMOM_INTERVAL_SECONDS,
      totalMinutes: exerciseCount, // 1 minute per exercise
    };
  }

  // Complex
  if (normalized === 'complex') {
    return { type: 'complex', rounds: DEFAULTS.COMPLEX_ROUNDS };
  }

  // Tabata
  if (normalized === 'tabata') {
    return {
      type: 'tabata',
      workSeconds: DEFAULTS.TABATA_WORK_SECONDS,
      restSeconds: DEFAULTS.TABATA_REST_SECONDS,
      rounds: DEFAULTS.TABATA_ROUNDS,
    };
  }

  // Interval Training
  if (normalized.includes('interval')) {
    let workSeconds: number;
    let restSeconds: number;
    if (intensity >= 80) {
      workSeconds = DEFAULTS.INTERVAL_HIGH_WORK;
      restSeconds = DEFAULTS.INTERVAL_HIGH_REST;
    } else if (intensity >= 70) {
      workSeconds = DEFAULTS.INTERVAL_MEDIUM_WORK;
      restSeconds = DEFAULTS.INTERVAL_MEDIUM_REST;
    } else {
      workSeconds = DEFAULTS.INTERVAL_LOW_WORK;
      restSeconds = DEFAULTS.INTERVAL_LOW_REST;
    }
    return {
      type: 'interval',
      workSeconds,
      restSeconds,
      rounds: DEFAULTS.INTERVAL_DEFAULT_ROUNDS,
    };
  }

  // For Time
  if (normalized.includes('for_time') || normalized === 'for_time') {
    return { type: 'for_time' }; // No time cap by default
  }

  // Chipper
  if (normalized === 'chipper') {
    return { type: 'chipper', rounds: DEFAULTS.CHIPPER_ROUNDS };
  }

  // Buy-in / Cash-out
  if (normalized.includes('buy') || normalized.includes('cash')) {
    return { type: 'buy_in_cash_out', rounds: DEFAULTS.BUY_IN_CASH_OUT_DEFAULT_ROUNDS };
  }

  // Cluster
  if (normalized === 'cluster') {
    return {
      type: 'cluster',
      clusterSize: DEFAULTS.CLUSTER_SIZE,
      restBetweenClusters: DEFAULTS.CLUSTER_REST_SECONDS,
    };
  }

  // Ladder
  if (normalized.includes('ladder')) {
    // High intensity = descending (harder first), per decision 13-07
    const direction = intensity >= DEFAULTS.LADDER_HIGH_INTENSITY_THRESHOLD ? 'descending' : 'ascending';
    return { type: 'ladder', direction };
  }

  // Unbroken
  if (normalized.includes('unbroken')) {
    return { type: 'unbroken' };
  }

  // Couplet
  if (normalized === 'couplet') {
    return { type: 'couplet' };
  }

  // Triplet
  if (normalized === 'triplet') {
    return { type: 'triplet' };
  }

  // For Max
  if (normalized.includes('for_max') || normalized.includes('max_reps')) {
    return { type: 'for_max' };
  }

  // Time Cap
  if (normalized.includes('time_cap')) {
    return { type: 'time_cap', minutes: DEFAULTS.TIME_CAP_MINUTES };
  }

  // Default fallback for unknown formats
  return { type: 'standard' };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate human-readable label from FormatParams
 *
 * @param params - FormatParams object
 * @returns Human-readable string describing the format parameters
 */
export function formatParamsLabel(params: FormatParams): string {
  switch (params.type) {
    case 'amrap':
      return `AMRAP - ${params.minutes} min`;

    case 'emom':
      return `EMOM - ${params.intervalSeconds}s / ${params.totalMinutes} min total`;

    case 'complex':
      return `Complex - ${params.rounds} rondas`;

    case 'tabata':
      return `Tabata - ${params.workSeconds}s/${params.restSeconds}s x ${params.rounds} rondas`;

    case 'interval':
      return `Interval - ${params.workSeconds}s/${params.restSeconds}s x ${params.rounds} rondas`;

    case 'for_time':
      return params.timeCapMinutes
        ? `For Time - ${params.timeCapMinutes} min cap`
        : 'For Time';

    case 'chipper':
      return `Chipper - ${params.rounds} ronda${params.rounds > 1 ? 's' : ''}`;

    case 'buy_in_cash_out':
      return params.rounds
        ? `Buy-in/Cash-out - ${params.rounds} rondas`
        : 'Buy-in/Cash-out';

    case 'cluster':
      return `Cluster - ${params.clusterSize} reps, ${params.restBetweenClusters}s rest`;

    case 'ladder':
      return `Ladder - ${params.direction === 'ascending' ? 'Ascendente' : 'Descendente'}`;

    case 'unbroken':
      return 'Unbroken';

    case 'couplet':
      return 'Couplet';

    case 'triplet':
      return 'Triplet';

    case 'for_max':
      return 'For Max Reps';

    case 'time_cap':
      return `Time Cap - ${params.minutes} min`;

    case 'standard':
      return 'Standard';

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = params;
      return 'Unknown';
  }
}
