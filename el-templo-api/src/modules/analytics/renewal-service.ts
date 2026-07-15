/**
 * Tasa de renovación service (Phase 121 Block 2 — RENOV-01..04).
 *
 * A NEW read-only domain service (analytics convention: strategic metrics live in
 * their own service; the `analytics/service.ts` monolith is NOT touched). It is the
 * SECOND consumer of the Plan 01 expiry-cohort engine (`expiry-cohort.ts`),
 * composing the SAME injection-safe predicates as `ChurnService` (Plan 02) so
 * renovación and churn sit on the EXACT SAME denominator (RENOV-01):
 *   - `expiryCohortConditions` (D-01/D-03): the cohort by `endDate ∈ [from, to)`,
 *     paused excluded.
 *   - `lastExpiryPerPersonExpr` (D-04): one row per person, their last in-range expiry.
 *   - `maturedExpr` (D-08): only persons whose grace window has elapsed enter num+den.
 *   - `retainedExpr` (D-05/D-06): the renovación predicate — a later sub starts by
 *     `E + window`; plan change AND duration change count, early renewal counts.
 *
 * WHAT IT COUNTS (RENOV-01/RENOV-02):
 *   - `renewal.nominal` = DISTINCT matured persons whose last in-range expiry
 *     satisfies `retainedExpr(window)` (renovados).
 *   - `renewal.n`       = the matured cohort size (vencidos) — the SAME denominator
 *     churn uses, so `renewal.n === churn.window.churn.n` for identical filters.
 *   - `windowDays`      = the effective window (`filters.window ?? RENOVATION_WINDOW_DEFAULT_DAYS`).
 *
 * NÚMERO VIVO (RENOV-03 / D-07): renovación is the complement of churn over the
 * matured cohort (`retained` vs `NOT retained`), so renov% + churn% reconcile to
 * 100 ONLY when there are no persons still settling. The grace residual is exposed
 * as `enGracia` (cohort persons NOT yet matured) rather than forcing the sum to 100.
 *
 * Scope (T-121-09): EVERY query spreads `applyScope(...).conditions` on
 * `subscriptions.branchId`; breakdown axes are ADDITIVE groupBy keys ONLY, never
 * access filters (the access filter always remains `applyScope`).
 *
 * SQL-injection (T-121-10): cohort/maturity/retention window values are
 * SERVICE-controlled integers (validated + bounded at the route, Plan 03 Task 2)
 * before they reach the expiry-cohort predicates; date bounds are bound via Drizzle
 * `sql` parameterization in `rangeConditions` / `expiryCohortConditions`.
 *
 * Defensive: every division is guarded through `metricShape` — a cohort / segment
 * with zero matured persons reports `percentage: 0`, never NaN.
 *
 * Constructor DI (Phase 56), same shape as ChurnService / TicketService.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, ne, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { metricShape } from "./metric-shape";
import { deriveDurationTier } from "./duration-tier";
import { breakdownSegmentKey, type BreakdownAxis } from "./breakdowns";
import {
  expiryCohortConditions,
  lastExpiryPerPersonExpr,
  retainedExpr,
  maturedExpr,
  subscriptionPlanFilter,
  RENOVATION_WINDOW_DEFAULT_DAYS,
} from "./expiry-cohort";
import { excludeEspecialSubs } from "./especial-exclusion";
import type {
  AnalyticsFilters,
  RenewalAnalytics,
  RenewalSegmentRow,
  ChurnRenewalAxis,
} from "./types";

/** The four breakdown axes renovación opens by (RENOV-04). */
const RENEWAL_AXES: readonly ChurnRenewalAxis[] = [
  "branch",
  "country",
  "duration",
  "plan",
];

/** Mutable renewal accumulator (renovados numerator + matured denominator). */
interface RenewalAcc {
  /** Renovados: matured AND retained. */
  renovados: number;
  /** Matured cohort size (the vencidos denominator — shared with churn). */
  matured: number;
}

/** A fresh, empty renewal accumulator. */
function emptyRenewalAcc(): RenewalAcc {
  return { renovados: 0, matured: 0 };
}

/** Fold one matured-or-not cohort row into a renewal accumulator. */
function foldRenewal(
  acc: RenewalAcc,
  matured: boolean,
  retained: boolean,
): void {
  if (!matured) return; // in-grace: excluded from BOTH numerator and denominator.
  acc.matured += 1;
  if (retained) acc.renovados += 1;
}

export class RenewalService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * The full renovación payload (RENOV-01..04). Resolves the effective window
   * (`filters.window ?? RENOVATION_WINDOW_DEFAULT_DAYS`), then fans out the
   * official renewal + grace count and the 4-axis breakdowns over the ONE shared
   * expiry cohort (the SAME denominator churn uses, RENOV-01).
   */
  async getRenewal(filters: AnalyticsFilters): Promise<RenewalAnalytics> {
    const window = filters.window ?? RENOVATION_WINDOW_DEFAULT_DAYS;

    const [official, breakdowns] = await Promise.all([
      this.officialAndGrace(filters, window),
      this.allBreakdowns(filters, window),
    ]);

    return {
      windowDays: window,
      renewal: official.renewal,
      enGracia: official.enGracia,
      breakdowns,
    };
  }

  /**
   * The OFFICIAL renovación at `window` (RENOV-01/RENOV-02) plus the grace count
   * (RENOV-03 / D-08), computed together so they share one scan of the cohort. The
   * cohort is one row per person (D-04); each row is classified matured/retained at
   * the window.
   *   - `renewal` = `metricShape(renovados, maturedDenominator)`; the denominator is
   *     the SAME matured cohort size churn uses (shared by construction).
   *   - `enGracia` = cohort persons NOT matured at the window (the número vivo).
   */
  private async officialAndGrace(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<{ renewal: RenewalAnalytics["renewal"]; enGracia: number }> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    // Country scope filters on `branches.country`, so join `branches` only when a
    // country filter is active (needsBranchJoin). Without this the bare
    // `branches.country` condition references a table not in the FROM → 500. The
    // join never fans out (each sub has exactly one branch FK). The breakdown
    // query already joins branches unconditionally (flavor A).
    let query = this.db
      .select({
        userId: schema.subscriptions.userId,
        matured: maturedExpr(window),
        retained: retainedExpr(window),
      })
      .from(schema.subscriptions)
      .$dynamic();
    if (needsBranchJoin) {
      query = query.innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      );
    }
    const rows = await query.where(
      and(
        ...expiryCohortConditions(filters.dateFrom, filters.dateTo),
        lastExpiryPerPersonExpr(filters.dateFrom, filters.dateTo),
        // D-11: el pase especial no cuenta en la renovación de membresía.
        excludeEspecialSubs(),
        ...scopeConditions,
        ...subscriptionPlanFilter(filters.planId),
      ),
    );

    const acc = emptyRenewalAcc();
    let enGracia = 0;
    for (const r of rows) {
      const matured = Number(r.matured) === 1;
      const retained = Number(r.retained) === 1;
      if (!matured) {
        enGracia += 1;
        continue;
      }
      foldRenewal(acc, matured, retained);
    }

    return {
      renewal: metricShape(acc.renovados, acc.matured),
      enGracia,
    };
  }

  /** Run all four breakdown axes (RENOV-04) in parallel and flatten. */
  private async allBreakdowns(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<RenewalSegmentRow[]> {
    const perAxis = await Promise.all(
      RENEWAL_AXES.map((axis) => this.breakdownByAxis(filters, axis, window)),
    );
    return perAxis.flat();
  }

  /**
   * Renovación opened by one breakdown `axis` (RENOV-04). Groups the cohort by the
   * axis's columns, joins `branches` / `subscriptionPlans` as the axis requires, and
   * accumulates matured renewal per `breakdownSegmentKey`. The duration axis buckets
   * the raw `durationDays` to a tier in JS via `deriveDurationTier` (the 1/31
   * threshold stays in `duration-tier.ts`). Excluded one-off durations (tier `null`)
   * are dropped from the duration axis. Axes are ADDITIVE grouping keys, never access
   * filters (scope stays in `applyScope`).
   */
  private async breakdownByAxis(
    filters: AnalyticsFilters,
    axis: ChurnRenewalAxis,
    window: number,
  ): Promise<RenewalSegmentRow[]> {
    const { conditions: scopeConditions } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    const rows = await this.db
      .select({
        branchName: schema.branches.name,
        country: schema.subscriptionPlans.country,
        planName: schema.subscriptionPlans.name,
        durationDays: schema.subscriptionPlans.durationDays,
        matured: maturedExpr(window),
        retained: retainedExpr(window),
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.branches,
        sql`${schema.branches.id} = ${schema.subscriptions.branchId}`,
      )
      .innerJoin(
        schema.subscriptionPlans,
        sql`${schema.subscriptionPlans.id} = ${schema.subscriptions.planId}`,
      )
      .where(
        and(
          ...expiryCohortConditions(filters.dateFrom, filters.dateTo),
          lastExpiryPerPersonExpr(filters.dateFrom, filters.dateTo),
          // D-11: excluir el pase especial de los breakdowns de renovación.
          ne(schema.subscriptionPlans.planCategory, "especial"),
          ...scopeConditions,
          ...subscriptionPlanFilter(filters.planId),
        ),
      );

    const bySegment = new Map<string, RenewalAcc>();
    for (const r of rows) {
      const durationDays =
        r.durationDays === null ? null : Number(r.durationDays);

      // Duration axis: drop excluded one-off plans (tier null) so they never
      // appear as an "excluded" segment.
      if (axis === "duration" && deriveDurationTier(durationDays) === null) {
        continue;
      }

      const key = breakdownSegmentKey(axis as BreakdownAxis, {
        branchName: r.branchName,
        country: r.country,
        planName: r.planName,
        durationDays,
      });

      let acc = bySegment.get(key);
      if (acc === undefined) {
        acc = emptyRenewalAcc();
        bySegment.set(key, acc);
      }
      foldRenewal(acc, Number(r.matured) === 1, Number(r.retained) === 1);
    }

    const out: RenewalSegmentRow[] = [];
    for (const [key, acc] of bySegment) {
      out.push({
        axis,
        key,
        renewal: metricShape(acc.renovados, acc.matured),
      });
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }
}
