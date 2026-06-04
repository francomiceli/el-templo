/**
 * Comparable-breakdowns engine (Phase 120 FUND-03 / FUND-04).
 *
 * Every strategic metric block (the ticket in Plan 04, then phases 121-123) must
 * be openable "side by side" along orthogonal grouping axes — by branch, by
 * country, by duration tier, and by plan name — and per currency, with ARS and
 * EUR NEVER summed into one total. This module is the single shared place those
 * axes + the per-currency accumulator contract live.
 *
 * SECURITY INVARIANT (T-120-06 / T-117-01): this module NEVER produces, relaxes,
 * or owns scope WHERE conditions. Branch/country SECURITY scoping is owned solely
 * by `applyScope` (scope.ts) and is append-only there. Breakdowns are PURELY
 * ADDITIVE: they contribute only `groupBy` keys and the JS duration mapping.
 * Callers MUST still spread `applyScope(...).conditions` into their own
 * `and(...)`; nothing exported here returns scope conditions. The "branch" /
 * "country" axes here are GROUPING keys for comparison, not access filters — the
 * access filter always remains `applyScope`.
 *
 * SQL-injection (T-120-07): every grouping key is a Drizzle `sql` template bound
 * to typed `AnyColumn`s (parameterized), and `BreakdownAxis` is a constrained
 * string-literal union — no raw user string is ever interpolated into SQL.
 *
 * Currency isolation (T-120-08 / FUND-04): `CurrencyMap` + `emptyCurrencyEntry`
 * are the canonical per-currency accumulator (mirrors
 * advanced-finance-service.ts:67, 216-225). ARS and EUR are kept as separate keys
 * end-to-end; this module offers NO helper that sums across currencies.
 *
 * Duration axis: the tier is derived in JS via `deriveDurationTier` (Plan 01's
 * duration-tier.ts). The 1 / 31 day thresholds live ONLY inside that helper as
 * named constants — this file must NEVER re-declare or inline them in SQL or in a
 * numeric comparison against `durationDays`. The duration axis therefore SELECTs
 * the raw `durationDays` column (see `breakdownKeyExpr("duration", ...)`) and the
 * caller maps each row's day count to a tier with `deriveDurationTier`.
 *
 * No DB access, no logging, no `any`.
 */
import { sql, type SQL, type AnyColumn } from "drizzle-orm";
import { deriveDurationTier, type DurationTier } from "./duration-tier";

/**
 * The orthogonal grouping axes a metric can be opened by, side by side. These are
 * COMPARISON groupings, never access filters (access stays in `applyScope`).
 */
export type BreakdownAxis = "branch" | "country" | "duration" | "plan";

/**
 * Per-currency accumulator — ARS and EUR are kept as SEPARATE keys and are NEVER
 * summed into one total (FUND-04 / T-120-08). Keyed by the breakdown segment key
 * (e.g. branch name, `country`, duration tier, or `name‖country` for the plan
 * axis). Mirrors advanced-finance-service.ts:67.
 */
export type CurrencyMap = Map<string, { ARS: number; EUR: number }>;

/**
 * A fresh `{ ARS: 0, EUR: 0 }` accumulator entry. Use as the `?? emptyCurrencyEntry()`
 * default when reading from a `CurrencyMap` so a missing segment starts both
 * currencies at zero (mirrors `?? { ARS: 0, EUR: 0 }` at
 * advanced-finance-service.ts:219). Never collapses ARS+EUR.
 */
export function emptyCurrencyEntry(): { ARS: number; EUR: number } {
  return { ARS: 0, EUR: 0 };
}

/**
 * The relevant columns a caller supplies so `breakdownKeyExpr` can build the
 * grouping key for any axis without hard-coding a specific table. Each axis only
 * needs the subset it groups by, so all are optional — pass whichever the axis in
 * play requires.
 */
export interface BreakdownColumns {
  /** Branch display name (e.g. `branches.name`) — the "branch" axis groups by this. */
  branchName?: AnyColumn;
  /** Country code (e.g. `branches.country`) — the "country" and "plan" axes use this. */
  country?: AnyColumn;
  /** Plan name (e.g. `subscriptionPlans.name`) — the "plan" axis composite key. */
  planName?: AnyColumn;
  /** Plan duration in days (e.g. `subscriptionPlans.durationDays`) — the "duration" axis. */
  durationDays?: AnyColumn;
}

/**
 * Build the Drizzle SQL grouping key(s) for a breakdown `axis`. PURELY a `groupBy`
 * contribution — emits NO scope WHERE conditions (security stays in `applyScope`).
 *
 *   - "branch"   → `branchName` (one key).
 *   - "country"  → `country` (one key).
 *   - "plan"     → a COMPOSITE key over `planName` AND `country` (NOT name alone),
 *                  so "Flex (AR)" and "Flex (ES)" stay distinct segments — mirrors
 *                  the (name, country) rule of PlanDistributionRow (types.ts:94-104).
 *                  Returned as two keys to group by both columns.
 *   - "duration" → the RAW `durationDays` column (one key). The tier bucketing is
 *                  NOT done in SQL — the caller maps each selected `durationDays`
 *                  to a tier via `deriveDurationTier` (`durationTierFromDays`
 *                  below) so the 1/31 threshold lives in ONE place (Plan 01).
 *
 * Throws if a column required by the requested axis is missing — fail loud rather
 * than silently group by nothing.
 *
 * @param axis the grouping axis.
 * @param cols the available grouping columns (supply at least what the axis needs).
 * @returns the SQL key(s) to spread into `.groupBy(...)`.
 */
export function breakdownKeyExpr(
  axis: BreakdownAxis,
  cols: BreakdownColumns,
): SQL[] {
  switch (axis) {
    case "branch": {
      if (cols.branchName === undefined) {
        throw new Error(
          "breakdownKeyExpr: branch axis requires cols.branchName",
        );
      }
      return [sql`${cols.branchName}`];
    }
    case "country": {
      if (cols.country === undefined) {
        throw new Error("breakdownKeyExpr: country axis requires cols.country");
      }
      return [sql`${cols.country}`];
    }
    case "plan": {
      if (cols.planName === undefined || cols.country === undefined) {
        throw new Error(
          "breakdownKeyExpr: plan axis requires cols.planName AND cols.country (group by (name, country), never name alone)",
        );
      }
      // Composite (name, country): two grouping keys so Flex (AR) ≠ Flex (ES).
      return [sql`${cols.planName}`, sql`${cols.country}`];
    }
    case "duration": {
      if (cols.durationDays === undefined) {
        throw new Error(
          "breakdownKeyExpr: duration axis requires cols.durationDays",
        );
      }
      // Group by the raw day count — the caller buckets to a tier in JS via
      // deriveDurationTier so the threshold stays in ONE place (Plan 01).
      return [sql`${cols.durationDays}`];
    }
  }
}

/**
 * Compose the segment key for a single row given the breakdown `axis` and the
 * row's grouping values. PURE string-keying for the `CurrencyMap`; emits no SQL.
 *
 *   - "branch"   → the branch name.
 *   - "country"  → the country code.
 *   - "plan"     → `name‖country` (composite, U+2016 separator) so Flex (AR) and
 *                  Flex (ES) get distinct keys.
 *   - "duration" → the duration TIER (`deriveDurationTier(durationDays)`); one-off
 *                  plans derive to `null` and are reported under the `"excluded"`
 *                  key so the caller can drop or surface them deliberately.
 *
 * @param axis the grouping axis.
 * @param row the row's branch/country/plan/duration grouping values.
 * @returns the `CurrencyMap` key for this row's segment.
 */
export function breakdownSegmentKey(
  axis: BreakdownAxis,
  row: {
    branchName?: string | null;
    country?: string | null;
    planName?: string | null;
    durationDays?: number | null;
  },
): string {
  switch (axis) {
    case "branch":
      return String(row.branchName ?? "");
    case "country":
      return String(row.country ?? "");
    case "plan":
      // U+2016 (double vertical line) — not a legal char in plan names/country
      // codes, so the composite key is unambiguous.
      return `${row.planName ?? ""}‖${row.country ?? ""}`;
    case "duration": {
      const tier = durationTierFromDays(row.durationDays ?? null);
      return tier ?? "excluded";
    }
  }
}

/**
 * Thin re-export wrapper so callers buckets duration via THIS module's single
 * dependency on Plan 01's helper. Delegates entirely to `deriveDurationTier`
 * (the 1/31 threshold lives only there). Returns `null` for excluded one-off
 * plans.
 *
 * @param durationDays the plan's duration in days, or `null`.
 * @returns the duration tier, or `null` when excluded (one-off).
 */
export function durationTierFromDays(
  durationDays: number | null,
): DurationTier | null {
  return deriveDurationTier(durationDays);
}
