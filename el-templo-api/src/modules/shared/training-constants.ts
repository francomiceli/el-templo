/**
 * Shared training constants used across admin and session modules.
 */

/** Ordered list of training days (Monday-Saturday in Spanish) */
export const TRAINING_DAYS = [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
] as const;

export type TrainingDay = (typeof TRAINING_DAYS)[number];

/** Map JS Date.getDay() (0=Sun) to Spanish day name */
export const DAY_OF_WEEK_MAP: Record<number, TrainingDay> = {
  1: "lunes",
  2: "martes",
  3: "miercoles",
  4: "jueves",
  5: "viernes",
  6: "sabado",
};

/** Sort order for mobility exercises (always last in block) */
export const MOBILITY_SORT_ORDER = 999;

/** Maximum exercise difficulty per member level */
export const LEVEL_DIFFICULTY_MAP: Record<string, number> = {
  alfa: 3,
  delta: 6,
  sigma: 8,
  omega: 10,
  spartan: 12,
};

/**
 * Parse a dayId string like "W1-lunes-alfa" into its components.
 */
export function parseDayId(dayId: string): {
  week: string;
  day: string;
  level: string;
} {
  const parts = dayId.split("-");
  return {
    week: parts[0] || "",
    day: parts[1] || "",
    level: parts[2] || "",
  };
}
