/**
 * Format an ISO date string for display using Argentine Spanish locale.
 * Uses noon UTC to avoid day-boundary drift (midnight UTC = previous day in UTC-3).
 * Returns the original string if parsing fails.
 */
export function formatDate(dateStr: string): string {
  try {
    // Append T12:00:00 for date-only strings to avoid timezone day shift
    const normalized = dateStr.length === 10 ? dateStr + 'T12:00:00' : dateStr;
    return new Date(normalized).toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
