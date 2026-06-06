/**
 * Level Display Utilities
 *
 * Maps member levels to Greek letters for El Templo brand identity.
 * Uses actual Greek Unicode characters for authentic display.
 */

/**
 * Map of level codes to Greek letters.
 * - Alpha (alfa) uses lowercase alpha (α) for visual distinction from Delta
 * - Spartan maps to Omega (both are highest tier)
 */
export const LEVEL_GREEK_MAP: Record<string, string> = {
  kairos: '☉', // kairos = tiempo/ciclo, glyph propio
  alfa: 'α',
  delta: 'Δ',
  sigma: 'Σ',
  omega: 'Ω',
  spartan: 'Ω',
}

/**
 * Map of level codes to their display names (proper capitalization).
 */
const LEVEL_NAMES: Record<string, string> = {
  kairos: 'Kairos',
  alfa: 'Alfa',
  delta: 'Delta',
  sigma: 'Sigma',
  omega: 'Omega',
  spartan: 'Spartan',
}

/**
 * Get the Greek letter for a member level.
 * Case-insensitive lookup with graceful fallback.
 *
 * @param level - The level code (e.g., 'Alfa', 'DELTA', 'sigma')
 * @returns Greek letter or original input if level not found
 *
 * @example
 * getLevelGreek('alfa')    // 'α'
 * getLevelGreek('Delta')   // 'Δ'
 * getLevelGreek('SIGMA')   // 'Σ'
 * getLevelGreek('unknown') // 'unknown'
 */
export function getLevelGreek(level: string): string {
  const normalized = level.toLowerCase()
  return LEVEL_GREEK_MAP[normalized] ?? level
}

/**
 * Get the full display format for a level: "Δ Delta".
 * Combines Greek letter with proper name for enhanced display.
 *
 * @param level - The level code (e.g., 'alfa', 'Delta')
 * @returns Formatted string "Greek Name" or original if not found
 *
 * @example
 * getLevelDisplayFull('delta')  // 'Δ Delta'
 * getLevelDisplayFull('sigma')  // 'Σ Sigma'
 * getLevelDisplayFull('unknown') // 'unknown'
 */
export function getLevelDisplayFull(level: string): string {
  const normalized = level.toLowerCase()
  const greek = LEVEL_GREEK_MAP[normalized]
  const name = LEVEL_NAMES[normalized]

  if (greek && name) {
    return `${greek} ${name}`
  }

  return level
}

/**
 * Format a level name with proper capitalization.
 *
 * @param level - The level code in any case
 * @returns Properly capitalized name or original if not found
 *
 * @example
 * formatLevelName('ALFA')   // 'Alfa'
 * formatLevelName('delta')  // 'Delta'
 * formatLevelName('unknown') // 'unknown'
 */
export function formatLevelName(level: string): string {
  const normalized = level.toLowerCase()
  return LEVEL_NAMES[normalized] ?? level
}
