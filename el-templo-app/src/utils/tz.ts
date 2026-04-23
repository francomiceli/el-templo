/**
 * Branch-timezone helpers for the member app.
 *
 * Server returns `branchTimezone` (IANA, e.g. "America/Argentina/Buenos_Aires",
 * "Europe/Madrid") with the weekly grid. Everything the user sees —
 * "today", "past/future slot", week navigation — must be computed in
 * that timezone, never the browser's local time, so a member travelling
 * or on a device with a wrong clock still sees their branch's reality.
 */

/**
 * Convert a wall-clock date+time in the given IANA timezone to a UTC Date.
 * DST-aware via Intl.DateTimeFormat (stdlib, no dep).
 */
export function zonedWallClockToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)

  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!)

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(guess))

  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)

  const zonedAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  )

  const offset = zonedAsUtc - guess
  return new Date(guess - offset)
}

/** "YYYY-MM-DD" in the given timezone. */
export function todayInTz(tz: string, now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: tz })
}

/** ISO day-of-week (1=Mon ... 7=Sun) in the given timezone. */
export function dowInTz(tz: string, now: Date = new Date()): number {
  // Derive weekday from the zoned Y/M/D via UTC date math. Avoids
  // Intl.DateTimeFormat weekday:'short' string matching, which has shipped
  // locale-dependent variants on some iOS builds (e.g. "Thu." with trailing
  // punctuation) that silently break a Mon..Sun lookup table.
  const [y, m, d] = todayInTz(tz, now).split('-').map(Number)
  const utcDow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() // 0=Sun..6=Sat
  return utcDow === 0 ? 7 : utcDow
}

/** True if the given schedule wall-clock moment is in the past for the branch. */
export function isWallClockPast(
  dateStr: string,
  timeStr: string,
  tz: string,
  now: Date = new Date(),
): boolean {
  return zonedWallClockToUtc(dateStr, timeStr, tz) < now
}

/**
 * Parse a "YYYY-MM-DD" into year/month/day with no local-timezone drift.
 * Useful for building Date objects for display without relying on the
 * browser's timezone.
 */
export function parseDateParts(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split('-').map(Number)
  return { y: y!, m: m!, d: d! }
}
