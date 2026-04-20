/**
 * Branch-timezone helpers for the admin app.
 *
 * Admin views are cross-branch: when a coach switches between Moreno and
 * BCN, "today" and "past slot" should flip to the viewing branch's local
 * time. These helpers take an IANA timezone string and use the stdlib
 * Intl.DateTimeFormat API (DST-aware, no external dep).
 */

/**
 * Convert a wall-clock date+time in the given IANA timezone to a UTC Date.
 */
export function zonedWallClockToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);

  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(guess));

  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);

  const zonedAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  );

  const offset = zonedAsUtc - guess;
  return new Date(guess - offset);
}

/** "YYYY-MM-DD" in the given timezone. */
export function todayInTz(tz: string, now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: tz });
}

/** ISO day-of-week (1=Mon ... 7=Sun) in the given timezone. */
export function dowInTz(tz: string, now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  })
    .formatToParts(now)
    .find((p) => p.type === 'weekday')!.value;
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[weekday]!;
}

/** True if the wall-clock moment has passed in the given timezone. */
export function isWallClockPast(
  dateStr: string,
  timeStr: string,
  tz: string,
  now: Date = new Date()
): boolean {
  return zonedWallClockToUtc(dateStr, timeStr, tz) < now;
}

/**
 * Compute the Monday (ISO week start) of the current week for the given
 * timezone, returned as "YYYY-MM-DD".
 */
export function getMondayInTz(tz: string, now: Date = new Date()): string {
  const today = todayInTz(tz, now);
  const [y, m, d] = today.split('-').map(Number);
  const iso = dowInTz(tz, now); // 1=Mon ... 7=Sun
  const anchor = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  // Sunday: jump forward to next Monday (Mon–Sat week).
  const diff = iso === 7 ? 1 : 1 - iso;
  anchor.setUTCDate(anchor.getUTCDate() + diff);
  return anchor.toISOString().slice(0, 10);
}
