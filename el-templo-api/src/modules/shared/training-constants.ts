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

/** Map Spanish day name to day_of_week number (for day_modes table lookup) */
export const DAY_NAME_TO_NUMBER: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
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
 * Parse a dayId string into its components.
 *
 * General format: "W1-lunes-alfa"
 * Goal plan format: "GP-tren_superior-W1-lunes-alfa"
 * Legacy formats: "P-tren_superior-W1-lunes-alfa", "J-tren_superior-W1-lunes-alfa" (backward compat)
 */
export function parseDayId(dayId: string): {
  week: string;
  day: string;
  level: string;
} {
  if (
    dayId.startsWith("GP-") ||
    dayId.startsWith("P-") ||
    dayId.startsWith("J-")
  ) {
    // Goal plan format: GP-{goalPlanType}-W{week}-{day}-{memberLevel}
    // Also handles legacy P- and J- prefixes for backward compatibility
    const parts = dayId.split("-");
    // Personalizada type may contain underscores, so find the W{n} part to anchor
    const weekIdx = parts.findIndex((p) => p.startsWith("W"));
    if (weekIdx >= 0) {
      return {
        week: parts[weekIdx] || "",
        day: parts[weekIdx + 1] || "",
        level: parts[weekIdx + 2] || "",
      };
    }
  }

  // General format: W{week}-{day}-{memberLevel}
  const parts = dayId.split("-");
  return {
    week: parts[0] || "",
    day: parts[1] || "",
    level: parts[2] || "",
  };
}
