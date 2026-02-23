const WEEK_ONE_MONDAY = new Date('2026-02-16T00:00:00');
const MONTH_NAMES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

export function weekToDateRange(week: number): { start: Date; end: Date } {
  const start = new Date(WEEK_ONE_MONDAY);
  start.setDate(start.getDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

export function formatWeekLabel(week: number): string {
  const { start, end } = weekToDateRange(week);
  const startDay = start.getDate();
  const startMonth = MONTH_NAMES[start.getMonth()];
  const startYear = start.getFullYear();
  const endDay = end.getDate();
  const endMonth = MONTH_NAMES[end.getMonth()];
  const endYear = end.getFullYear();

  if (startYear !== endYear) {
    // Cross-year: 29 Dic 2026 - 4 Ene 2027
    return `${startDay} ${startMonth} ${startYear} - ${endDay} ${endMonth} ${endYear}`;
  }
  if (startMonth === endMonth) {
    // Same month: 16 - 22 Feb 2026
    return `${startDay} - ${endDay} ${endMonth} ${endYear}`;
  }
  // Cross-month same year: 27 Feb - 5 Mar 2026
  return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${endYear}`;
}

/** Returns 'YYYY-MM-DD' Monday of week (for URL params) */
export function weekToUrlParam(week: number): string {
  const { start } = weekToDateRange(week);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses 'YYYY-MM-DD' to week number. Falls back to parsing as plain number for compat. Returns null if unparseable. */
export function urlParamToWeek(param: string): number | null {
  // Try date format first: YYYY-MM-DD
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(param);
  if (dateMatch) {
    const date = new Date(`${param}T00:00:00`);
    if (!isNaN(date.getTime())) {
      const diffMs = date.getTime() - WEEK_ONE_MONDAY.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const week = Math.floor(diffDays / 7) + 1;
      return Math.max(1, Math.min(52, week));
    }
  }
  // Fallback: plain number (backward compat)
  const num = Number(param);
  if (!isNaN(num) && num >= 1 && num <= 52) {
    return num;
  }
  return null;
}

/** Client-side current week based on today's date relative to WEEK_ONE_MONDAY. Clamped 1-52. */
export function getCurrentWeekNumber(): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = today.getTime() - WEEK_ONE_MONDAY.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(52, week));
}

/** Returns Monday of week in Quasar QDate format 'YYYY/MM/DD' */
export function weekToQDate(week: number): string {
  const { start } = weekToDateRange(week);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

/** Parses QDate 'YYYY/MM/DD' value to week number. Clamped 1-52. */
export function qDateToWeek(qDate: string): number {
  const [y, m, d] = qDate.split('/').map(Number);
  const date = new Date(y, m - 1, d);
  const diffMs = date.getTime() - WEEK_ONE_MONDAY.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(52, week));
}
