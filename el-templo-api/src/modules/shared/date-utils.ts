/**
 * Shared date utility functions with explicit timezone handling.
 *
 * Two families:
 *   - Noon-UTC helpers for date arithmetic that don't depend on a branch.
 *   - Branch-timezone helpers (buildClassDateTime, todayInTz, dowInTz,
 *     nowInTz) that take an IANA timezone string and use the stdlib
 *     Intl.DateTimeFormat API — DST-aware, no external dep.
 */

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
 * Convert a wall-clock date+time in a given IANA timezone to a UTC Date.
 *
 * DST-aware: for timezones that observe DST (e.g. Europe/Madrid), the
 * returned moment reflects the correct UTC offset at that wall-clock
 * instant. For fixed-offset timezones (AR), behaves like a simple offset
 * application.
 */
function zonedWallClockToUtc(
  dateStr: string,
  timeStr: string,
  tz: string,
): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);

  // Provisional UTC instant assuming input is already UTC.
  const guess = Date.UTC(y, m - 1, d, hh, mm);

  // Render that instant in the target timezone, then treat the rendered
  // wall clock as UTC to extract the tz-vs-UTC offset for that moment.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(guess));

  const getPart = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);

  const zonedAsUtc = Date.UTC(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    getPart("hour") % 24, // some runtimes emit "24" for midnight
    getPart("minute"),
    getPart("second"),
  );

  const offset = zonedAsUtc - guess;
  return new Date(guess - offset);
}

/**
 * Build the UTC Date representing a class's start moment.
 *
 * Interprets `bookingDate + timeStr` as a wall-clock time in the branch's
 * timezone and returns the corresponding UTC instant.
 */
export function buildClassDateTime(
  bookingDate: string,
  timeStr: string,
  tz: string,
): Date {
  return zonedWallClockToUtc(bookingDate, timeStr, tz);
}

/**
 * Get the current date string ("YYYY-MM-DD") as seen in the given timezone.
 */
export function todayInTz(tz: string, now: Date = new Date()): string {
  // en-CA locale formats dates as YYYY-MM-DD.
  return now.toLocaleDateString("en-CA", { timeZone: tz });
}

/**
 * Get the current ISO day-of-week (1=Mon ... 7=Sun) in the given timezone.
 */
export function dowInTz(tz: string, now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  })
    .formatToParts(now)
    .find((p) => p.type === "weekday")!.value;
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

/**
 * Tenure ("Antigüedad") label for a member, derived on the fly from
 * users.createdAt. Phase 136 D-05/D-06: surfaced only in Horarios (slot
 * endpoints), never persisted — no column / enum / cron.
 */
export type MemberSeniority = "nuevo" | "1-3m" | "3-6m" | "6m+";

/** Days per average month, used to derive month boundaries from a day delta. */
const DAYS_PER_MONTH = 30.44;

/**
 * Classify a member's tenure into a seniority band from their createdAt.
 * Boundaries in months (D-06): [0,1)=nuevo, [1,3)=1-3m, [3,6)=3-6m, [6,∞)=6m+.
 * Returns null when createdAt is missing (defensive) or in the future.
 */
export function computeSeniority(
  createdAt: Date | string | null | undefined,
): MemberSeniority | null {
  if (createdAt == null) return null;
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const ms = created.getTime();
  if (Number.isNaN(ms)) return null;

  const days = (Date.now() - ms) / (1000 * 60 * 60 * 24);
  const months = days / DAYS_PER_MONTH;

  if (months < 1) return "nuevo";
  if (months < 3) return "1-3m";
  if (months < 6) return "3-6m";
  return "6m+";
}
