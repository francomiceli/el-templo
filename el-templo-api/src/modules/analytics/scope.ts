/**
 * applyScope — analytics branch/country scope helper (Phase 117 D-09 / D-17).
 *
 * Eliminates the ~15 repeated `branchId`/`country` + `innerJoin(branches)`
 * blocks across `analytics/service.ts`. There are two flavors of those blocks
 * in the wild, and this helper absorbs BOTH:
 *
 *   FLAVOR A ("join always"): the query already innerJoins `branches`
 *     unconditionally (e.g. countActiveMembers, getRevenueTrend). Country
 *     filtering is just an extra WHERE condition on `branches.country`.
 *
 *   FLAVOR B ("join conditional"): the query only needs `branches` when a
 *     country filter is present, so the join is added conditionally
 *     (e.g. getDailyCheckins, getNoShowRate, computeDailyAvg). When `country`
 *     is undefined no `branches` join happens at all.
 *
 * This helper does NOT mutate the query builder (Drizzle query builders are
 * not safely re-assignable across the conditional-join boundary without losing
 * type info). Instead it computes:
 *   - `conditions`: the scope WHERE fragments to spread into `and(...)`.
 *   - `needsBranchJoin`: whether the caller must innerJoin `branches`
 *     (true only when a country filter is active — flavor B callers gate their
 *     join on this; flavor A callers always join and ignore the flag).
 *
 * The branch column is supplied by the caller (`branchColumn`) because it
 * differs per query: `users.branchId`, `attendance.branchId`,
 * `schedules.branchId`, `subscriptions.branchId`, or
 * `financialTransactions.branchId`. `country` always filters on
 * `branches.country`, so the caller is responsible for having (or adding) the
 * `branches` join when `needsBranchJoin` is true.
 *
 * Security (T-117-01): scope conditions are append-only — this helper never
 * relaxes a filter. Callers MUST spread `conditions` into their WHERE clause.
 */
import { eq, sql, type SQL, type AnyColumn } from "drizzle-orm";
import * as schema from "../../db/schema";

export interface ApplyScopeArgs {
  branchId: number | undefined;
  country: "AR" | "ES" | undefined;
  /** The branch foreign-key column on the primary table being filtered. */
  branchColumn: AnyColumn;
}

export interface ApplyScopeResult {
  /** Scope WHERE fragments to spread into the query's `and(...)`. */
  conditions: SQL[];
  /**
   * True when a country filter is active and the caller therefore needs an
   * innerJoin to `branches`. Flavor-A callers (already joined) ignore this.
   */
  needsBranchJoin: boolean;
}

export function applyScope({
  branchId,
  country,
  branchColumn,
}: ApplyScopeArgs): ApplyScopeResult {
  const conditions: SQL[] = [];

  if (branchId !== undefined) {
    conditions.push(eq(branchColumn, branchId) as unknown as SQL);
  }
  if (country !== undefined) {
    conditions.push(eq(schema.branches.country, country) as unknown as SQL);
  }

  // The innerJoin on branches is only required to evaluate branches.country.
  // A bare branchId filter compares against the primary table's own column,
  // so it never forces a join.
  const needsBranchJoin = country !== undefined;

  return { conditions, needsBranchJoin };
}

// Re-export sql so callers that only import from scope.ts keep a single import
// site if they later compose additional fragments. (No behavior change.)
export { sql };
