/**
 * Churn de no renovación service (Phase 121 Block 1 — CHURN-01..06).
 *
 * A NEW read-only domain service (per the analytics convention: strategic metrics
 * live in their own service; the `analytics/service.ts` monolith is NOT touched).
 * It is the FIRST real consumer of the Plan 01 expiry-cohort engine
 * (`expiry-cohort.ts`), composing its injection-safe predicate/fragment builders
 * (`expiryCohortConditions` D-01/D-03, `lastExpiryPerPersonExpr` D-04,
 * `retainedExpr` D-05/D-06, `maturedExpr` D-08) with the Phase 120 foundation
 * (`applyScope`, `metricShape`, `bucketExpr`, the breakdowns helpers,
 * `deriveDurationTier`) — none of those primitives are re-implemented here.
 *
 * WHAT IT COUNTS (CHURN-01): DISTINCT persons whose LAST subscription expiry in
 * `[from, to)` (D-04) did NOT renew within the configured renovación window (D-05),
 * counted only once their grace window has matured (D-08). The denominator is the
 * matured cohort size; both numerator and denominator EXCLUDE in-grace persons
 * (surfaced as `enGracia`), so churn% + renov% only reconcile to 100 when
 * `enGracia === 0` (RENOV-03 "número vivo").
 *
 * The whole thing is built from ONE cohort definition shared with renovación
 * (Plan 03) so both sit on the EXACT same denominator (RENOV-01).
 *
 * Output (per CHURN-02..06):
 *   - `window`     : the OFFICIAL churn at the configured ventana (D-07) — the one
 *                    that pairs with renovación.
 *   - `comparison` : the multi-N comparative columns (`CHURN_COMPARISON_WINDOWS` =
 *                    5/10/15) side by side over the SAME cohort, each with its own
 *                    maturity + retention window (D-07 / CHURN-02, exploration view).
 *   - `enGracia`   : cohort persons NOT yet matured at the official window (D-08).
 *   - `series`     : monthly churn by expiry-cohort bucket, `provisional` when the
 *                    bucket has not fully matured (CHURN-05).
 *   - `breakdowns` : churn opened by branch / country / duration / plan (CHURN-06).
 *
 * Scope (T-121-03 / T-121-05): EVERY query spreads `applyScope(...).conditions` on
 * `subscriptions.branchId`; breakdown axes are ADDITIVE groupBy keys ONLY, never
 * access filters (the access filter always remains `applyScope`).
 *
 * SQL-injection (T-121-06): cohort/maturity/retention window values are
 * SERVICE-controlled integers (validated + bounded at the route, Plan 02 Task 2)
 * before they reach the expiry-cohort predicates; date bounds are bound via
 * Drizzle `sql` parameterization in `rangeConditions`/`expiryCohortConditions`.
 *
 * Defensive (T-120-12): every division is guarded through `metricShape` — a cohort
 * / segment / bucket with zero matured persons reports `percentage: 0`, never NaN.
 *
 * Constructor DI (Phase 56), same shape as TicketService / AdvancedFinanceService.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { bucketExpr } from "./cohorts";
import { metricShape } from "./metric-shape";
import { deriveDurationTier } from "./duration-tier";
import { breakdownSegmentKey, type BreakdownAxis } from "./breakdowns";
import {
  expiryCohortConditions,
  lastExpiryPerPersonExpr,
  retainedExpr,
  maturedExpr,
  RENOVATION_WINDOW_DEFAULT_DAYS,
  CHURN_COMPARISON_WINDOWS,
} from "./expiry-cohort";
import type {
  AnalyticsFilters,
  ChurnAnalytics,
  ChurnWindowResult,
  ChurnSeriesPoint,
  ChurnSegmentRow,
  ChurnRenewalAxis,
} from "./types";

/** The four breakdown axes churn opens by (CHURN-06). */
const CHURN_AXES: readonly ChurnRenewalAxis[] = [
  "branch",
  "country",
  "duration",
  "plan",
];

/** One person's last-in-range expiry, reduced to what the JS folding needs. */
interface CohortRow {
  /** Distinct person id (one row per person — D-04 enforced in SQL). */
  userId: number;
  /** The person's last expiry month bucket (`YYYY-MM`), for the series (CHURN-05). */
  bucket: string;
  /** Branch display name (branch axis key). */
  branchName: string;
  /** Branch/plan country code (country + plan axis composite). */
  country: string;
  /** Plan display name (plan axis composite). */
  planName: string;
  /** Plan duration in days (duration axis → `deriveDurationTier`). */
  durationDays: number | null;
  /** TRUE when this person's grace window has elapsed at the official window (D-08). */
  matured: boolean;
  /** TRUE when this person renewed within the official window (D-05) — only meaningful when matured. */
  retained: boolean;
}

/** Mutable churn accumulator (matured numerator + denominator). */
interface ChurnAcc {
  /** Churned: matured AND not retained. */
  churned: number;
  /** Matured cohort size (the denominator). */
  matured: number;
}

/** A fresh, empty churn accumulator. */
function emptyChurnAcc(): ChurnAcc {
  return { churned: 0, matured: 0 };
}

/** Fold one matured-or-not cohort row into a churn accumulator. */
function foldChurn(acc: ChurnAcc, matured: boolean, retained: boolean): void {
  if (!matured) return; // in-grace: excluded from BOTH numerator and denominator.
  acc.matured += 1;
  if (!retained) acc.churned += 1;
}

export class ChurnService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * The full churn payload (CHURN-01..06). Resolves the effective window
   * (`filters.window ?? RENOVATION_WINDOW_DEFAULT_DAYS`), then fans out the
   * official window, the multi-N comparison, the grace count, the monthly series,
   * and the 4-axis breakdowns over the ONE shared expiry cohort.
   */
  async getChurn(filters: AnalyticsFilters): Promise<ChurnAnalytics> {
    const window = filters.window ?? RENOVATION_WINDOW_DEFAULT_DAYS;

    const [official, comparison, series, breakdowns] = await Promise.all([
      this.officialAndGrace(filters, window),
      this.multiNComparison(filters),
      this.monthlySeries(filters, window),
      this.allBreakdowns(filters, window),
    ]);

    return {
      window: official.window,
      comparison,
      enGracia: official.enGracia,
      series,
      breakdowns,
    };
  }

  /**
   * The OFFICIAL churn at `window` (D-07) plus the grace count (D-08), computed
   * together so they share one scan of the cohort. The cohort is one row per
   * person (D-04); each row is classified matured/retained at the official window.
   *   - `window.churn` = `metricShape(churned, maturedDenominator)`.
   *   - `enGracia`     = cohort persons NOT matured at the official window.
   */
  private async officialAndGrace(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<{ window: ChurnWindowResult; enGracia: number }> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    // Country scope filters on `branches.country`, so join `branches` only when a
    // country filter is active (needsBranchJoin). Without this the bare
    // `branches.country` condition references a table not in the FROM → 500. The
    // join never fans out (each sub has exactly one branch FK). The breakdown
    // queries already join branches unconditionally (flavor A).
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
        ...scopeConditions,
      ),
    );

    const acc = emptyChurnAcc();
    let enGracia = 0;
    for (const r of rows) {
      const matured = Number(r.matured) === 1;
      const retained = Number(r.retained) === 1;
      if (!matured) {
        enGracia += 1;
        continue;
      }
      foldChurn(acc, matured, retained);
    }

    return {
      window: {
        windowDays: window,
        churn: metricShape(acc.churned, acc.matured),
      },
      enGracia,
    };
  }

  /**
   * The multi-N comparative columns (D-07 / CHURN-02): the SAME cohort evaluated at
   * each `CHURN_COMPARISON_WINDOWS` value, each with its own maturity + retention
   * window. Mirrors the Promise.all-of-windows shape of the old `getRenewalRate`.
   */
  private async multiNComparison(
    filters: AnalyticsFilters,
  ): Promise<ChurnWindowResult[]> {
    return Promise.all(
      CHURN_COMPARISON_WINDOWS.map((w) => this.churnAtWindow(filters, w)),
    );
  }

  /** Churn `{ nominal, percentage, n }` over the matured cohort at a single window. */
  private async churnAtWindow(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<ChurnWindowResult> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    // Join `branches` only under an active country filter (see officialAndGrace).
    let query = this.db
      .select({
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
        ...scopeConditions,
      ),
    );

    const acc = emptyChurnAcc();
    for (const r of rows) {
      foldChurn(acc, Number(r.matured) === 1, Number(r.retained) === 1);
    }

    return {
      windowDays: window,
      churn: metricShape(acc.churned, acc.matured),
    };
  }

  /**
   * The monthly churn series by expiry-cohort bucket (CHURN-05). Buckets the
   * cohort by `bucketExpr(endDate, "monthly")`; per bucket reports churn over the
   * matured rows. A bucket is `provisional` when its cohort has not yet fully
   * matured — i.e. any expiry in that month is still within `window` days of today
   * (detected via the persisted per-row `matured` flag: a bucket with at least one
   * not-yet-matured person is provisional).
   */
  private async monthlySeries(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<ChurnSeriesPoint[]> {
    const { conditions: scopeConditions, needsBranchJoin } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    const bucket = bucketExpr(schema.subscriptions.endDate, "monthly");

    // Join `branches` only under an active country filter (see officialAndGrace).
    let query = this.db
      .select({
        bucket,
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
        ...scopeConditions,
      ),
    );

    // Accumulate per bucket; a bucket is provisional if ANY of its persons has not
    // yet matured (the cohort is still settling).
    const byBucket = new Map<string, { acc: ChurnAcc; provisional: boolean }>();
    for (const r of rows) {
      const key = String(r.bucket ?? "");
      let entry = byBucket.get(key);
      if (entry === undefined) {
        entry = { acc: emptyChurnAcc(), provisional: false };
        byBucket.set(key, entry);
      }
      const matured = Number(r.matured) === 1;
      const retained = Number(r.retained) === 1;
      if (!matured) entry.provisional = true;
      foldChurn(entry.acc, matured, retained);
    }

    const out: ChurnSeriesPoint[] = [];
    for (const [bucketKey, entry] of byBucket) {
      out.push({
        bucket: bucketKey,
        churn: metricShape(entry.acc.churned, entry.acc.matured),
        provisional: entry.provisional,
      });
    }
    // Deterministic ascending order by bucket (YYYY-MM sorts lexically).
    out.sort((a, b) => a.bucket.localeCompare(b.bucket));
    return out;
  }

  /** Run all four breakdown axes (CHURN-06) in parallel and flatten. */
  private async allBreakdowns(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<ChurnSegmentRow[]> {
    const perAxis = await Promise.all(
      CHURN_AXES.map((axis) => this.breakdownByAxis(filters, axis, window)),
    );
    return perAxis.flat();
  }

  /**
   * Churn opened by one breakdown `axis` (CHURN-06). Groups the cohort by the
   * axis's `breakdownKeyExpr` columns, joins `branches` / `subscriptionPlans` as the
   * axis requires, and accumulates matured churn per `breakdownSegmentKey`. The
   * duration axis buckets the raw `durationDays` to a tier in JS via
   * `deriveDurationTier` (the 1/31 threshold stays in `duration-tier.ts`). Excluded
   * one-off durations (tier `null`) are dropped from the duration axis. Axes are
   * ADDITIVE grouping keys, never access filters (scope stays in `applyScope`).
   */
  private async breakdownByAxis(
    filters: AnalyticsFilters,
    axis: ChurnRenewalAxis,
    window: number,
  ): Promise<ChurnSegmentRow[]> {
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
          ...scopeConditions,
        ),
      );

    const bySegment = new Map<string, ChurnAcc>();
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
        acc = emptyChurnAcc();
        bySegment.set(key, acc);
      }
      foldChurn(acc, Number(r.matured) === 1, Number(r.retained) === 1);
    }

    const out: ChurnSegmentRow[] = [];
    for (const [key, acc] of bySegment) {
      out.push({
        axis,
        key,
        churn: metricShape(acc.churned, acc.matured),
      });
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }
}
