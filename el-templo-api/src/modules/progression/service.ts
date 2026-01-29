/**
 * Greek letter mapping for level display
 */
export const GREEK_LETTER_MAP: Record<string, string> = {
  alfa: '\u03B1',    // α (lowercase alpha)
  delta: '\u0394',   // Δ
  sigma: '\u03A3',   // Σ
  omega: '\u03A9',   // Ω
  spartan: '\u03A9', // Ω (same as omega)
};

/**
 * Calculate consecutive training days streak
 *
 * @param sessions Array of sessions with date strings (YYYY-MM-DD format)
 * @returns Number of consecutive days in current streak
 */
export function calculateStreak(sessions: { date: string }[]): number {
  if (sessions.length === 0) return 0;

  // Get unique dates and sort descending (most recent first)
  const uniqueDates = [...new Set(sessions.map(s => s.date))].sort((a, b) => b.localeCompare(a));

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Check if most recent session is today or yesterday
  const mostRecent = uniqueDates[0];
  if (mostRecent !== today && mostRecent !== yesterday) {
    return 0; // Streak broken
  }

  // Count consecutive calendar days
  let streak = 1;
  let currentDate = new Date(mostRecent + 'T00:00:00');

  for (let i = 1; i < uniqueDates.length; i++) {
    const expectedDate = new Date(currentDate);
    expectedDate.setDate(expectedDate.getDate() - 1);
    const expectedStr = expectedDate.toISOString().split('T')[0];

    if (uniqueDates[i] === expectedStr) {
      streak++;
      currentDate = expectedDate;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Check if user is eligible for evaluation request
 * Eligibility requires average RPE <= 6 over last 2 weeks
 *
 * @param avgRpe Average RPE from last 2 weeks (null if no sessions with RPE)
 * @returns boolean indicating eligibility
 */
export function checkEligibility(avgRpe: number | null): boolean {
  if (avgRpe === null) {
    return false; // No RPE data means not eligible
  }
  return avgRpe <= 6;
}

/**
 * Format date string for chart label
 * Converts YYYY-MM-DD to localized short format (e.g., "6 ene")
 *
 * @param dateStr Date string in YYYY-MM-DD format
 * @returns Localized short date label
 */
export function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
}

/**
 * Get display name for level (capitalized)
 *
 * @param level Level string (alfa, delta, sigma, omega, spartan)
 * @returns Capitalized display name
 */
export function getLevelDisplayName(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * Get Greek letter for level
 *
 * @param level Level string (alfa, delta, sigma, omega, spartan)
 * @returns Greek letter character
 */
export function getGreekLetter(level: string): string {
  return GREEK_LETTER_MAP[level] || level;
}
