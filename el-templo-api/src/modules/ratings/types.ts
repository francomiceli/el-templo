/**
 * Ratings module — public types (Phase 143).
 *
 * Three decoupled flows:
 *  1. Roster write (owner/coach assigns ONE coach per branch/ISO-week/day/slot).
 *  2. Member pending + submit (attribution resolved server-side from the roster).
 *  3. Owner view (per-coach average + recent ratings; owner-only, D-M3).
 *
 * The slot is the turn derived from a schedule's startTime: "morning" when
 * startTime < "12:00", else "afternoon" (D-A1), the same split ReservasPage uses.
 */

export type ClassSlot = "morning" | "afternoon";

/** Input to assign/replace a coach in a single roster slot (D-A1). */
export interface RosterAssignmentInput {
  branchId: number;
  /** Monday of the ISO week ("YYYY-MM-DD"). */
  weekStartDate: string;
  /** 1=Monday .. 6=Saturday (ISO). */
  dayOfWeek: number;
  slot: ClassSlot;
  coachId: number;
}

/** One roster cell with the assigned coach's name (for the admin grid). */
export interface RosterWeekRow {
  id: number;
  branchId: number;
  weekStartDate: string;
  dayOfWeek: number;
  slot: ClassSlot;
  coachId: number;
  coachName: string;
}

/** A coach option for a branch (roster assignment dropdown). */
export interface CoachOption {
  id: number;
  firstName: string;
  lastName: string;
}

/**
 * The class the member is being asked to rate. Deliberately exposes NOTHING
 * about the coach (no coachId/name/photo) — the pop-up is built around the
 * CLASS, not the professor (D-A3). Null when there is nothing to rate.
 */
export interface PendingRating {
  sessionDate: string;
  branchId: number;
  scheduleId: number;
  activityName: string;
  dayOfWeek: number;
}

/** Member's rating submission. */
export interface SubmitRatingInput {
  sessionDate: string;
  scheduleId: number;
  /** Profe rating 1–5 (backs /puntuaciones). */
  stars: number;
  /** Class rating 1–5 (backs the "Clases" analytics tab). */
  classStars: number;
  comment?: string;
}

/** Per-coach aggregate for the owner view (D-O1). */
export interface OwnerCoachRatingSummary {
  coachId: number;
  coachName: string;
  averageStars: number;
  ratingCount: number;
}

/** A single recent rating row for the owner view (D-O1). */
export interface OwnerRecentRating {
  id: number;
  coachId: number;
  coachName: string;
  stars: number;
  comment: string | null;
  sessionDate: string;
  activityName: string | null;
}

export interface OwnerRatingsResult {
  perCoach: OwnerCoachRatingSummary[];
  recent: OwnerRecentRating[];
}

/** Scope passed from the route guard (mirrors CoachService scope shape). */
export interface RatingsScope {
  role: string;
  isOwner: boolean;
  country: "AR" | "ES" | null;
  branchIds: number[];
}
