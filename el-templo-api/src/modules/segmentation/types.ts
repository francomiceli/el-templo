/**
 * Segmentation Module Types
 *
 * Defines the Attendance label (4 bands based on % membership usage over a
 * rolling 28-day window) and display metadata for the admin UI.
 *
 * Phase 136 (D-01..D-04): the 6-value behavioral segment + the system_settings
 * threshold configuration were removed. The cut points are now fixed in code.
 */

// ─── Segment Type ─────────────────────────────────────────────────────────

/**
 * Attendance label (D-01). Replaces the legacy 6-value behavioral segment.
 * Classified 100% by % of membership usage over the rolling 28-day window.
 */
export type MemberSegment = "optima" | "regular" | "alerta" | "ausente";

// ─── Fixed Cut Points (D-03: in code, NOT in system_settings) ─────────────

/** >= 75% of plan budget used → Óptima. */
export const ATTENDANCE_OPTIMA_PCT = 75;

/** 50% <= pct < 75% → Regular. */
export const ATTENDANCE_REGULAR_PCT = 50;

/** 1% <= pct < 50% → Alerta (any usage > 0 below Regular). */
export const ATTENDANCE_ALERTA_PCT = 1;

/** Rolling window in days for the attendance percentage (D-02). */
export const ATTENDANCE_WINDOW_DAYS = 28;

// ─── Display Metadata (for admin UI) ──────────────────────────────────────

export const SEGMENT_LABELS: Record<MemberSegment, string> = {
  optima: "Óptima",
  regular: "Regular",
  alerta: "Alerta",
  ausente: "Ausente",
};

export const SEGMENT_COLORS: Record<MemberSegment, string> = {
  optima: "green",
  regular: "amber",
  alerta: "orange",
  ausente: "red",
};

export const SEGMENT_VALUES: MemberSegment[] = [
  "optima",
  "regular",
  "alerta",
  "ausente",
];
