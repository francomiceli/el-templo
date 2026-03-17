/**
 * Format-related constants shared across admin components.
 */

/** Normalize a format name for consistent lookups (lowercase, trimmed, spaces→underscores) */
export function normalizeFormatName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '_');
}

/** Format param TYPES that don't have configurable parameters (no editor shown) */
export const NO_PARAMS_FORMATS: string[] = [
  'standard',
  'chipper',
  'for_max_carga',
  'for_max_tiempo',
  'couplet',
  'triplet',
  'singlet',
  'benchmark_wod',
  'hero_wod',
  'floater_wod',
  'flow_guiado',
  'unbroken_reps',
  'unbroken_chipper',
  'ub_test',
  'accumulate',
  'buy_in_cash_out',
  'task_priority',
  'circuito_cooperativo',
];

/**
 * DB format NAMES (normalized) that don't have configurable parameters.
 * Used by hasConfigurableParams in EditableBlockCard to determine
 * if the params editor should be shown — independent of stored param type.
 */
export const NO_PARAMS_FORMAT_NAMES: string[] = [
  'chipper',
  'for_max_(carga)',
  'for_max_(tiempo)',
  'couplet',
  'triplet',
  'singlet',
  'benchmark',
  'benchmark_wod',
  'hero_wod',
  'floater_wod',
  'flow_guiado',
  'unbroken_reps',
  'unbroken_chipper',
  'ub_test',
  'task_priority',
  'accumulate_x',
  'buy-in_/_cash-out',
  'task_priority_vs_time_priority',
  'circuito_cooperativo',
];

/**
 * Format param TYPES where reps/secs are entirely dictated by the format structure.
 * Used by EditableExerciseRow (suppress per-exercise inputs) and
 * session-data-transformer (suppress reps/secs in PDF output).
 */
export const FORMAT_DICTATED_TYPES = new Set([
  // Time-dictated
  'tabata',
  'interval',
  'hiit',
  'on_the_x',
  // Structure-dictated
  'death_by',
  'death_by_unbroken',
  'pyramid',
  'ladder',
  'ladder_block',
  'ladder_corta',
  'broken_ladder',
]);

/**
 * Check if a format (by display name) dictates reps/secs, meaning
 * per-exercise prescription should be suppressed.
 */
export function isFormatDictatedByName(formatName: string): boolean {
  const f = formatName.toLowerCase().trim();
  return (
    f === 'tabata' ||
    f === 'interval training' ||
    f === 'hiit' ||
    f.startsWith('on the') ||
    f.startsWith('death by') ||
    f === 'death_by' ||
    f === 'death_by_unbroken' ||
    f === 'pyramid' ||
    f.includes('ladder')
  );
}
