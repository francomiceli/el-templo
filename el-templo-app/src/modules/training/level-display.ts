/**
 * Level Display Module — single client-side source of truth for training levels.
 *
 * Values MUST match server-side canonical sources byte-for-byte:
 * - Enum / type guard: el-templo-api/src/modules/shared/training-constants.ts
 * - Greek letters:      el-templo-api/src/modules/progression/service.ts (GREEK_LETTER_MAP)
 * Re-verified 2026-04-21 during Phase 99 Plan 99-02 execution.
 *
 * Note: a prior utility file exists at src/modules/training/utils/levelDisplay.ts
 * with case-insensitive lookup helpers (getLevelGreek, getLevelDisplayFull, formatLevelName).
 * This module is intentionally separate: it is the strict enum + type guard
 * consumed by the selection store (useUserStore.selectedLevel) and content composables.
 */

export const TRAINING_LEVELS = ['alfa', 'delta', 'sigma', 'omega', 'spartan'] as const
export type Level = (typeof TRAINING_LEVELS)[number]

/**
 * Greek letter mapping — MUST match el-templo-api/src/modules/progression/service.ts GREEK_LETTER_MAP.
 *   alfa    -> α  (U+03B1, lowercase alpha)
 *   delta   -> Δ  (U+0394)
 *   sigma   -> Σ  (U+03A3)
 *   omega   -> Ω  (U+03A9)
 *   spartan -> Ω  (U+03A9, same as omega per server source)
 */
export const LEVEL_GREEK_MAP: Record<Level, string> = {
  alfa: 'α', // α
  delta: 'Δ', // Δ
  sigma: 'Σ', // Σ
  omega: 'Ω', // Ω
  spartan: 'Ω', // Ω — same as omega per server source
}

/**
 * Proper-cased display names (server's getLevelDisplayName parity).
 */
export const LEVEL_DISPLAY_MAP: Record<Level, string> = {
  alfa: 'Alfa',
  delta: 'Delta',
  sigma: 'Sigma',
  omega: 'Omega',
  spartan: 'Spartan',
}

/**
 * Strict enum type guard. Returns true only for the 5 exact lowercase strings.
 * Does NOT normalise case — use the lookup helpers in utils/levelDisplay.ts
 * if you need case-insensitive behaviour.
 */
export function isTrainingLevel(value: unknown): value is Level {
  return typeof value === 'string' && (TRAINING_LEVELS as readonly string[]).includes(value)
}
