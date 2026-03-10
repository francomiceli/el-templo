/**
 * Shared date utility functions with explicit timezone handling.
 *
 * All functions are pure (no side effects, no server context).
 * Argentina uses fixed UTC-3 year-round (no DST since 2009).
 * Internal arithmetic uses noon-UTC pattern to avoid DST/day-boundary issues.
 */

const ARGENTINA_OFFSET = "-03:00";

/**
 * Add days to an ISO date string ("YYYY-MM-DD") and return new ISO date string.
 * Uses noon UTC to avoid DST/day-boundary drift.
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

/**
 * Get the Monday-Saturday range for the week containing the given date.
 * Sunday maps to the prior week's Monday (Mon-Sat week).
 */
export function getWeekRange(date: Date): {
  monday: string;
  saturday: string;
} {
  // Convert to noon UTC internally to avoid DST edge cases
  const d = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      12,
      0,
      0,
    ),
  );
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);

  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);

  return {
    monday: monday.toISOString().split("T")[0],
    saturday: saturday.toISOString().split("T")[0],
  };
}

/**
 * Build a Date representing a class time in Argentina timezone (UTC-3).
 *
 * Given a booking date ("YYYY-MM-DD") and a schedule time ("HH:MM"),
 * both in Argentina local time, returns the UTC Date for that moment.
 *
 * Safe because Argentina does not observe DST (fixed UTC-3 since 2009).
 */
export function buildClassDateTime(bookingDate: string, timeStr: string): Date {
  return new Date(`${bookingDate}T${timeStr}:00${ARGENTINA_OFFSET}`);
}

/**
 * Format a Date as "YYYY-MM-DD" using UTC methods.
 * Avoids local timezone shifting that can change the date.
 */
export function toDateString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Resolve month range: first and last day of the month.
 * Accepts optional `now` param for testability.
 */
export function resolveMonthRange(now?: Date): {
  dateFrom: string;
  dateTo: string;
} {
  const d = now ?? new Date();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-indexed

  const firstDay = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0)); // day 0 = last day of prior month

  return {
    dateFrom: toDateString(firstDay),
    dateTo: toDateString(lastDay),
  };
}

/**
 * Compute prior period of equal length ending the day before dateFrom.
 * Uses noon-UTC pattern for date arithmetic.
 */
export function computePriorPeriod(
  dateFrom: string,
  dateTo: string,
): { priorFrom: string; priorTo: string } {
  const from = new Date(dateFrom + "T12:00:00Z");
  const to = new Date(dateTo + "T12:00:00Z");
  const durationMs = to.getTime() - from.getTime();

  // Prior period ends the day before current period starts
  const priorTo = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  priorTo.setUTCHours(12, 0, 0, 0);

  const priorFrom = new Date(priorTo.getTime() - durationMs);
  priorFrom.setUTCHours(12, 0, 0, 0);

  return {
    priorFrom: toDateString(priorFrom),
    priorTo: toDateString(priorTo),
  };
}
