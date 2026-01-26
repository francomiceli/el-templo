import type { DayState } from '../types/session';

/**
 * Spanish day names for calendar display
 * Index 0 = Sunday, 1 = Monday, ..., 6 = Saturday (matches JavaScript Date.getDay())
 */
const SPANISH_DAYS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];

/**
 * Date navigation utilities for Weekly View
 *
 * Provides functions for:
 * - Generating week date ranges (Monday-Sunday, ISO week)
 * - Formatting dates with Spanish locale
 * - Determining day states for calendar display
 */

/**
 * Get array of 7 date strings for the week containing the reference date
 *
 * Week starts on Monday (ISO week standard).
 * Returns dates in YYYY-MM-DD format for API compatibility.
 *
 * @param referenceDate - Date to find the week for (defaults to today)
 * @returns Array of 7 date strings [Monday, Tuesday, ..., Sunday]
 *
 * @example
 * getWeekDates(new Date('2026-01-26')) // Returns week containing Jan 26
 * // => ['2026-01-20', '2026-01-21', ..., '2026-01-26']
 */
export function getWeekDates(referenceDate?: Date): string[] {
  const date = referenceDate ? new Date(referenceDate) : new Date();

  // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayOfWeek = date.getDay();

  // Calculate days to subtract to get to Monday
  // If Sunday (0), go back 6 days; otherwise go back (dayOfWeek - 1) days
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // Get Monday of this week
  const monday = new Date(date);
  monday.setDate(date.getDate() - daysToMonday);

  // Generate array of 7 dates starting from Monday
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(monday);
    currentDate.setDate(monday.getDate() + i);

    // Format as YYYY-MM-DD
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    weekDates.push(`${year}-${month}-${day}`);
  }

  return weekDates;
}

/**
 * Format date to Spanish day name
 *
 * @param date - Date string (YYYY-MM-DD) or Date object
 * @returns Spanish day name with first letter capitalized
 *
 * @example
 * formatDayName('2026-01-26') // => 'Lunes'
 * formatDayName(new Date(2026, 0, 26)) // => 'Lunes'
 */
export function formatDayName(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  return SPANISH_DAYS[d.getDay()];
}

/**
 * Format date to short DD/MM format
 *
 * @param date - Date string (YYYY-MM-DD) or Date object
 * @returns Formatted string in DD/MM format
 *
 * @example
 * formatShortDate('2026-01-26') // => '26/01'
 */
export function formatShortDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/**
 * Check if a date string matches today's date
 *
 * @param date - Date string in YYYY-MM-DD format
 * @returns True if date is today
 *
 * @example
 * isToday('2026-01-26') // => true (if today is Jan 26, 2026)
 */
/**
 * Get today's date in YYYY-MM-DD format using local timezone
 */
function getTodayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isToday(date: string): boolean {
  return date === getTodayLocal();
}

/**
 * Check if a date string represents a Sunday
 *
 * Sundays are rest days in El Templo training schedule.
 *
 * @param date - Date string in YYYY-MM-DD format
 * @returns True if date is a Sunday
 *
 * @example
 * isSunday('2026-01-26') // => false (Monday)
 * isSunday('2026-01-25') // => true (Sunday)
 */
export function isSunday(date: string): boolean {
  const d = new Date(date + 'T00:00:00');
  return d.getDay() === 0;
}

/**
 * Determine the state of a date for calendar display
 *
 * State priority:
 * 1. Sunday -> 'rest' (always)
 * 2. Completed date -> 'completed' (from user activity)
 * 3. Today -> 'today' (highlighted)
 * 4. Before today -> 'past' (dimmed)
 * 5. After today -> 'future' (normal)
 *
 * @param date - Date string in YYYY-MM-DD format
 * @param completedDates - Array of completed date strings
 * @returns DayState enum value
 *
 * @example
 * getDateState('2026-01-26', []) // => 'today' (if today)
 * getDateState('2026-01-25', []) // => 'rest' (Sunday)
 * getDateState('2026-01-24', ['2026-01-24']) // => 'completed'
 */
export function getDateState(date: string, completedDates: string[]): DayState {
  // Sunday is always rest day
  if (isSunday(date)) {
    return 'rest';
  }

  // Check if date is in completed dates
  if (completedDates.includes(date)) {
    return 'completed';
  }

  // Compare with today (using local timezone)
  const today = getTodayLocal();

  if (date === today) {
    return 'today';
  }

  if (date < today) {
    return 'past';
  }

  return 'future';
}
