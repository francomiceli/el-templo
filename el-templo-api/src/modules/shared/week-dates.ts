/**
 * Week/day derivation shared by every module that indexes the plani by
 * SPOM week + Spanish day name.
 *
 * Extracted from `modules/sessions/routes.ts` (phase 164): the TV of a branch
 * has to resolve "which session is today" on its own, and a second in-backend
 * copy of the anchor arithmetic would be guaranteed to drift from the one
 * `/sessions/daily` uses. The admin keeps its own browser copy
 * (`el-templo-admin/src/utils/weekDates.ts`) because it cannot import server
 * modules.
 *
 * The move was mechanical: the anchor and the clamp are byte-identical to the
 * pre-extraction implementation, so `/sessions/daily` and `/sessions/weekly`
 * keep resolving exactly the same dayIds they resolved before.
 */
import { DAY_OF_WEEK_MAP } from "./training-constants";

/**
 * Monday of SPOM week 1. Parsed as a LOCAL wall-clock date on purpose (no
 * trailing `Z`): every caller builds its date the same way, so the difference
 * is timezone-agnostic.
 */
const WEEK_ONE_MONDAY = new Date("2026-02-23T00:00:00");

/**
 * Derive the SPOM week number from a "YYYY-MM-DD" date, relative to week 1.
 * Clamped to 1-52.
 */
export function dateToWeekNumber(date: string): number {
  const d = new Date(date + "T00:00:00");
  const diffMs = d.getTime() - WEEK_ONE_MONDAY.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(52, week));
}

/**
 * Map a "YYYY-MM-DD" date to its Spanish day name ("lunes".."sabado").
 * Sunday is not a training day and falls back to "domingo".
 */
export function dateToDayName(date: string): string {
  const d = new Date(date + "T00:00:00");
  return DAY_OF_WEEK_MAP[d.getDay()] || "domingo";
}
