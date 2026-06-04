/**
 * Duration-tier derivation (Phase 120 FUND-01 / D-01 / D-02).
 *
 * Pure, stateless utility shared by ALL 6 metric blocks (phases 121-123). Given a
 * subscription plan's `durationDays` (`subscription_plans.duration_days`, an
 * `int(...).notNull()` per subscription-plans.ts:40), it derives the duration tier
 * used to compare comparable memberships:
 *
 *   - null  → EXCLUDED. The membership is a one-off (Clase única, Sesión de Prueba)
 *             — NOT a recurring membership, so it must drop out of every duration
 *             breakdown rather than skew it. `durationDays === null` (no plan / no
 *             duration) and `durationDays <= ONE_OFF_MAX_DURATION_DAYS` both map here.
 *   - "monthly"   → 2..31 days (a single billing cycle).
 *   - "long_term" → > 31 days (multi-month / packaged plans: 120 / 180 / 240, etc.).
 *
 * D-01: the tier is PURE DERIVATION from `durationDays` — there is NO `duration_tier`
 * column and NO migration. Every block recomputes it from the same source of truth.
 *
 * D-02: the thresholds live here as named exported constants (never inline magic
 * numbers), and the tier is derived from the DAY COUNT — NOT the plan name. Renaming
 * a plan therefore never changes its tier, and the `subscription_plans.planTier`
 * enum is intentionally NOT consulted (the day threshold is robust to renames and to
 * mis-tagged enum values).
 *
 * Real plan durations validated in production: 1 / 30 / 120 / 180 / 240 days
 * → excluded / monthly / long_term / long_term / long_term.
 *
 * No DB access, no logging, no `any`.
 */

/**
 * Inclusive upper bound (in days) for a "one-off" membership. A plan whose
 * `durationDays` is `<=` this is EXCLUDED from duration breakdowns (Clase única,
 * Sesión de Prueba). Exported product rule — NOT an env var, NOT a DB column.
 */
export const ONE_OFF_MAX_DURATION_DAYS = 1;

/**
 * Inclusive upper bound (in days) for the "monthly" tier. A plan whose
 * `durationDays` is `> ONE_OFF_MAX_DURATION_DAYS` and `<=` this is "monthly";
 * anything above it is "long_term". Exported product rule — NOT an env var, NOT a
 * DB column.
 */
export const MONTHLY_MAX_DURATION_DAYS = 31;

/** The two comparable duration tiers (one-off plans derive to `null`, not a tier). */
export type DurationTier = "monthly" | "long_term";

/**
 * Derive the duration tier from a plan's `durationDays` (D-01 / D-02).
 *
 * @param durationDays the plan's duration in days, or `null` when there is no plan
 *   / no duration to classify.
 * @returns `null` for excluded one-off plans (`durationDays === null` OR
 *   `durationDays <= ONE_OFF_MAX_DURATION_DAYS`); `"monthly"` for 2..31 days;
 *   `"long_term"` for > 31 days.
 */
export function deriveDurationTier(
  durationDays: number | null,
): DurationTier | null {
  if (durationDays === null || durationDays <= ONE_OFF_MAX_DURATION_DAYS) {
    return null; // excluded one-off (not a recurring membership)
  }
  return durationDays <= MONTHLY_MAX_DURATION_DAYS ? "monthly" : "long_term";
}
