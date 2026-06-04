/**
 * LTV / vida del cliente service (Phase 122 Block 5 — LTV-01..05).
 *
 * A NEW read-only domain service (analytics convention: strategic metrics live in
 * their own service; the `analytics/service.ts` monolith is NOT touched). It is the
 * SECOND consumer of the Phase 121 expiry-cohort engine (`expiry-cohort.ts`) and
 * CHAINS onto it rather than redefining "end of life": the close of a customer's
 * life is EXACTLY the Phase 121 matured, not-retained churn event (D-122-02), and
 * reactivation inherits the same 15-day renovación window (D-122-04). Nothing about
 * the cohort predicates is re-implemented here.
 *
 * WHAT IT DELIVERS (LTV-01..05):
 *   - `lifetimeHeadlineMonths` (LTV-01 / D-122-03): the simple `1 ÷ churn_mensual`.
 *     The monthly churn % is REUSED from `ChurnService.getChurn` (instantiated here)
 *     — churn is NEVER recomputed inline. Guarded: churn 0 → `null` (never NaN/∞).
 *   - `survivalMedianMonths` (LTV-02 / D-122-05): the robust Kaplan-Meier survival
 *     median. The survival cohort is built from the SAME per-person expiry scan churn
 *     uses; closed lives (matured AND not retained) are survival EVENTS, active /
 *     in-grace lives are CENSORED (never dropped) and fed to `kaplanMeierMedian`.
 *   - `monetary` (LTV-04 / D-122-07/08): per-currency monetary LTV from REAL payments
 *     (`financial_transactions`, the canonical revenue filter) — NEVER list price /
 *     ARPU snapshot. Both PROJECTED (`lifetime × monthly real revenue per customer`)
 *     and OBSERVED (exact sum over closed lives).
 *   - `breakdowns` (LTV-05 / D-122-09): branch / country / plan, each segment with its
 *     own headline / KM median / per-currency monetary block.
 *
 * Currency isolation (LTV-05 / D-122-09): ARS and EUR are NEVER summed — per-currency
 * `Map` accumulators throughout; an unknown currency is skipped, never folded in.
 *
 * Scope (T-122-02 / T-122-03): EVERY cohort query spreads `applyScope(...).conditions`
 * on `subscriptions.branchId`; the money query spreads it on `users.branchId` with the
 * unconditional `branches` join (flavor A, mirroring advanced-finance-service.ts).
 * breakdown axes are ADDITIVE groupBy keys ONLY, never access filters.
 *
 * SQL-injection (T-122-04): cohort/maturity/retention window values are
 * SERVICE-controlled integers (validated + bounded 1..365 at the route) before they
 * reach the expiry-cohort predicates; date bounds are bound parameters.
 *
 * Defensive (T-122-01): every division is guarded — an empty cohort / segment / a 0
 * churn / a 0 duration reports `null`, never NaN.
 *
 * Constructor DI (Phase 56), same shape as ChurnService / AdvancedFinanceService.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, isNull, inArray, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { dayDiff } from "./cohorts";
import { deriveDurationTier } from "./duration-tier";
import { breakdownSegmentKey, type BreakdownAxis } from "./breakdowns";
import {
  expiryCohortConditions,
  lastExpiryPerPersonExpr,
  retainedExpr,
  maturedExpr,
  RENOVATION_WINDOW_DEFAULT_DAYS,
} from "./expiry-cohort";
import { kaplanMeierMedian, type KaplanMeierObservation } from "./kaplan-meier";
import { ChurnService } from "./churn-service";
import type {
  AnalyticsFilters,
  ChurnRenewalAxis,
  LtvAnalytics,
  LtvCurrencyBlock,
  LtvMonetary,
  LtvSegmentRow,
} from "./types";

/** The breakdown axes LTV opens by (LTV-05 — branch / country / plan, D-122-09). */
const LTV_AXES: readonly ChurnRenewalAxis[] = ["branch", "country", "plan"];

/** Average days per month used to convert a day-span lifetime into months. */
const DAYS_PER_MONTH = 30;

/** The two supported currencies — ARS and EUR are NEVER summed (D-122-09). */
type Currency = "ARS" | "EUR";

/**
 * One person's life from the expiry cohort, reduced to what LTV needs. The duration
 * span is materialized from the cohort engine: a person's FIRST start to their LAST
 * expiry (closed) or to "today" (censored).
 */
interface CohortLifeRow {
  /** Distinct person id (one row per person — D-04 enforced in SQL). */
  userId: number;
  /** Subscription currency for this life (ARS/EUR; unknown skipped). */
  currency: string;
  /** First start date of the person's life (`YYYY-MM-DD`). */
  firstStart: string | null;
  /** Last expiry date of the person's life (`YYYY-MM-DD`). */
  lastEnd: string | null;
  /** Today (`YYYY-MM-DD`, server CURDATE) for censored elapsed-time math. */
  today: string;
  /** TRUE when the grace window has elapsed at the official window (D-08). */
  matured: boolean;
  /** TRUE when the person renewed within the window (D-05) — only meaningful when matured. */
  retained: boolean;
  /** Branch display name (branch axis key). */
  branchName: string | null;
  /** Plan/branch country code (country + plan axis composite). */
  country: string | null;
  /** Plan display name (plan axis composite). */
  planName: string | null;
  /** Plan duration in days (duration axis → `deriveDurationTier`). */
  durationDays: number | null;
}

/** One classified life: its survival observation + whether it is a closed life. */
interface ClassifiedLife {
  userId: number;
  currency: Currency | null;
  durationMonths: number;
  /** TRUE = closed life (churned, survival event); FALSE = censored (active/in-grace). */
  closed: boolean;
}

/** Narrow a raw currency string to the supported union, or `null` (never summed in). */
function toCurrency(raw: string | null | undefined): Currency | null {
  return raw === "EUR" ? "EUR" : raw === "ARS" ? "ARS" : null;
}

/** Mean of a numeric array, or `null` for empty (never NaN). */
function meanOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/**
 * Materialize a life's observed duration in WHOLE months. Closed lives span
 * first-start → last-expiry; censored lives span first-start → today. Returns 0 when
 * the dates are missing or inverted (guarded — the caller drops 0-month lives from the
 * monthly-revenue math so it never divides by zero).
 */
function lifeDurationMonths(
  firstStart: string | null,
  end: string | null,
): number {
  if (firstStart === null || end === null) return 0;
  const days = dayDiff(firstStart, end);
  if (days <= 0) return 0;
  return days / DAYS_PER_MONTH;
}

export class LtvService {
  private readonly churnService: ChurnService;

  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {
    // Reuse Phase 121 churn for the headline — never recompute churn inline (D-122-03).
    this.churnService = new ChurnService(db, log);
  }

  /**
   * The full LTV payload (LTV-01..05). Resolves the effective window
   * (`filters.window ?? RENOVATION_WINDOW_DEFAULT_DAYS`), then fans out: the churn
   * headline (reused from ChurnService), the survival cohort (KM median + per-life
   * classification), the per-customer real-payment sums, and the 3-axis breakdowns.
   */
  async getLtv(filters: AnalyticsFilters): Promise<LtvAnalytics> {
    const window = filters.window ?? RENOVATION_WINDOW_DEFAULT_DAYS;

    const [churn, lives, paymentsByMember, breakdowns] = await Promise.all([
      this.churnService.getChurn(filters),
      this.cohortLives(filters, window),
      this.realPaymentsByMember(filters),
      this.allBreakdowns(filters, window),
    ]);

    // Headline (LTV-01 / D-122-03): 1 ÷ churn mensual, reusing ChurnService.
    const headline = lifetimeFromChurnPct(churn.window.churn.percentage);

    // Classify each matured life (closed vs censored) for KM + monetary.
    const classified = classifyLives(lives);

    // Survival median (LTV-02 / D-122-05): censored lives stay in the cohort.
    const survivalMedian = kaplanMeierMedian(
      classified.map<KaplanMeierObservation>((c) => ({
        durationMonths: c.durationMonths,
        event: c.closed,
      })),
    );

    // Monetary (LTV-04 / D-122-07/08): per currency, from real payments only.
    const monetary = this.buildMonetary(classified, paymentsByMember, headline);

    return {
      lifetimeHeadlineMonths: headline,
      survivalMedianMonths: survivalMedian,
      monetary,
      breakdowns,
      n: classified.length,
    };
  }

  /**
   * The survival cohort (LTV-02/03, D-122-02/04). One row per person from the SAME
   * expiry-cohort scan churn uses (D-04), enriched with the person's FIRST start and
   * LAST expiry (for the duration span) plus the breakdown columns. Scope on
   * `subscriptions.branchId` (subscription-based metric, matching churn). The first
   * start / last end are correlated subqueries over the SAME-branch, non-paused rows
   * so the life span stays inside the active scope (consistent with the cohort engine).
   */
  private async cohortLives(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<CohortLifeRow[]> {
    const { conditions: scopeConditions } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.subscriptions.branchId,
    });

    const rows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        currency: schema.subscriptions.currency,
        firstStart: sql<
          string | null
        >`(SELECT MIN(s_life.start_date) FROM subscriptions s_life WHERE s_life.user_id = ${schema.subscriptions.userId} AND s_life.branch_id = ${schema.subscriptions.branchId} AND s_life.subscription_status <> 'paused')`,
        lastEnd: schema.subscriptions.endDate,
        today: sql<string>`DATE_FORMAT(CURDATE(), '%Y-%m-%d')`,
        matured: maturedExpr(window),
        retained: retainedExpr(window),
        branchName: schema.branches.name,
        country: schema.subscriptionPlans.country,
        planName: schema.subscriptionPlans.name,
        durationDays: schema.subscriptionPlans.durationDays,
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

    return rows.map((r) => ({
      userId: Number(r.userId),
      currency: String(r.currency),
      firstStart: r.firstStart === null ? null : String(r.firstStart),
      lastEnd: r.lastEnd === null ? null : String(r.lastEnd),
      today: String(r.today),
      matured: Number(r.matured) === 1,
      retained: Number(r.retained) === 1,
      branchName: r.branchName === null ? null : String(r.branchName),
      country: r.country === null ? null : String(r.country),
      planName: r.planName === null ? null : String(r.planName),
      durationDays: r.durationDays === null ? null : Number(r.durationDays),
    }));
  }

  /**
   * Per-customer real-payment totals (LTV-04 / D-122-07/08). The CANONICAL revenue
   * filter on `financial_transactions` (kind IN ('plan_charge','debt_settlement'),
   * direction='inflow', voidedAt IS NULL, transactionDate in range) — NEVER list
   * price. Scope on `users.branchId` via the unconditional `branches` join (flavor A,
   * mirroring advanced-finance-service.ts cashTrend). Grouped by (memberId, currency)
   * so per-customer real revenue is summed by the customer link (`memberId`).
   */
  private async realPaymentsByMember(
    filters: AnalyticsFilters,
  ): Promise<Map<number, { currency: Currency; total: number }>> {
    const { conditions: scopeConditions } = applyScope({
      branchId: filters.branchId,
      country: filters.country,
      branchColumn: schema.users.branchId,
    });

    const conditions: SQL[] = [
      isNull(schema.financialTransactions.voidedAt),
      inArray(schema.financialTransactions.kind, [
        "plan_charge",
        "debt_settlement",
      ]) as unknown as SQL,
      eq(schema.financialTransactions.direction, "inflow") as unknown as SQL,
      ...scopeConditions,
    ];
    if (filters.dateFrom !== undefined) {
      conditions.push(
        sql`${schema.financialTransactions.transactionDate} >= ${filters.dateFrom}`,
      );
    }
    if (filters.dateTo !== undefined) {
      // EXCLUSIVE upper bound — consistent with the half-open cohort window.
      conditions.push(
        sql`${schema.financialTransactions.transactionDate} < ${filters.dateTo}`,
      );
    }

    const rows = await this.db
      .select({
        memberId: schema.financialTransactions.memberId,
        currency: schema.financialTransactions.currency,
        total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`,
      })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.financialTransactions.memberId),
      )
      // Flavor A: branches always joined (country filter needs branches.country).
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions))
      .groupBy(
        schema.financialTransactions.memberId,
        schema.financialTransactions.currency,
      );

    const byMember = new Map<number, { currency: Currency; total: number }>();
    for (const r of rows) {
      const currency = toCurrency(String(r.currency));
      if (currency === null) continue; // unknown currency — never summed in.
      const memberId = Number(r.memberId);
      // A member normally pays in one currency; keep the largest total if mixed.
      const existing = byMember.get(memberId);
      const total = Number(r.total);
      if (existing === undefined || total > existing.total) {
        byMember.set(memberId, { currency, total });
      }
    }
    return byMember;
  }

  /**
   * Assemble the per-currency monetary LTV (D-122-07/08). For each currency:
   *   - observed = mean of the closed customers' EXACT real-payment totals.
   *   - monthlyRealRevenue = mean of each customer's `total ÷ durationMonths`
   *     (real monthly revenue per customer) over lives with a positive duration.
   *   - projected = `lifetime_headline × monthlyRealRevenue` (guarded: null headline
   *     or null revenue → null).
   * ARS and EUR are accumulated separately — never summed (D-122-09).
   */
  private buildMonetary(
    classified: ClassifiedLife[],
    paymentsByMember: Map<number, { currency: Currency; total: number }>,
    headline: number | null,
  ): LtvMonetary {
    const observedByCurrency: Record<Currency, number[]> = { ARS: [], EUR: [] };
    const monthlyByCurrency: Record<Currency, number[]> = { ARS: [], EUR: [] };
    const nByCurrency: Record<Currency, number> = { ARS: 0, EUR: 0 };

    for (const life of classified) {
      const payment = paymentsByMember.get(life.userId);
      if (payment === undefined) continue; // no real payments in range for this life.
      const currency = payment.currency;

      // Real monthly revenue per customer (guard 0-month lives — never divide by 0).
      if (life.durationMonths > 0) {
        monthlyByCurrency[currency].push(payment.total / life.durationMonths);
      }

      // Observed LTV is the exact real sum over CLOSED lives only (D-122-07).
      if (life.closed) {
        observedByCurrency[currency].push(payment.total);
        nByCurrency[currency] += 1;
      }
    }

    const block = (currency: Currency): LtvCurrencyBlock => {
      const observed = meanOrNull(observedByCurrency[currency]);
      const monthlyRealRevenue = meanOrNull(monthlyByCurrency[currency]);
      const projected =
        headline !== null && monthlyRealRevenue !== null
          ? headline * monthlyRealRevenue
          : null;
      return {
        projected: projected === null ? null : Math.round(projected),
        observed: observed === null ? null : Math.round(observed),
        monthlyRealRevenue:
          monthlyRealRevenue === null ? null : Math.round(monthlyRealRevenue),
        n: nByCurrency[currency],
      };
    };

    return { ARS: block("ARS"), EUR: block("EUR") };
  }

  /** Run the LTV breakdown axes (LTV-05) in parallel and flatten. */
  private async allBreakdowns(
    filters: AnalyticsFilters,
    window: number,
  ): Promise<LtvSegmentRow[]> {
    const perAxis = await Promise.all(
      LTV_AXES.map((axis) => this.breakdownByAxis(filters, axis, window)),
    );
    return perAxis.flat();
  }

  /**
   * LTV opened by one breakdown `axis` (LTV-05 / D-122-09). Groups the survival cohort
   * by the axis's segment key (branch / country / plan), joining branches +
   * subscriptionPlans exactly like churn-service.ts. Each segment carries its own
   * headline (`1 ÷ segment churn`), KM survival median, and per-currency monetary block
   * — so segments are directly comparable. Axes are ADDITIVE grouping keys, never
   * access filters (scope stays in `applyScope`).
   */
  private async breakdownByAxis(
    filters: AnalyticsFilters,
    axis: ChurnRenewalAxis,
    window: number,
  ): Promise<LtvSegmentRow[]> {
    const [lives, paymentsByMember] = await Promise.all([
      this.cohortLives(filters, window),
      this.realPaymentsByMember(filters),
    ]);

    // Group the classified lives by this axis's segment key.
    const bySegment = new Map<string, CohortLifeRow[]>();
    for (const life of lives) {
      // Duration axis (not in LTV_AXES, but guarded for completeness): drop one-off.
      if (
        axis === "duration" &&
        deriveDurationTier(life.durationDays) === null
      ) {
        continue;
      }
      const key = breakdownSegmentKey(axis as BreakdownAxis, {
        branchName: life.branchName,
        country: life.country,
        planName: life.planName,
        durationDays: life.durationDays,
      });
      const bucket = bySegment.get(key);
      if (bucket === undefined) {
        bySegment.set(key, [life]);
      } else {
        bucket.push(life);
      }
    }

    const out: LtvSegmentRow[] = [];
    for (const [key, segmentLives] of bySegment) {
      const classified = classifyLives(segmentLives);

      // Per-segment headline = 1 ÷ segment churn (matured closed / matured total).
      const maturedTotal = classified.length;
      const closedCount = classified.filter((c) => c.closed).length;
      const churnPct =
        maturedTotal > 0 ? Math.round((closedCount / maturedTotal) * 100) : 0;
      const segmentHeadline = lifetimeFromChurnPct(churnPct);

      const survivalMedian = kaplanMeierMedian(
        classified.map<KaplanMeierObservation>((c) => ({
          durationMonths: c.durationMonths,
          event: c.closed,
        })),
      );

      const monetary = this.buildMonetary(
        classified,
        paymentsByMember,
        segmentHeadline,
      );

      out.push({
        axis,
        key,
        lifetimeHeadlineMonths: segmentHeadline,
        survivalMedianMonths: survivalMedian,
        monetary,
        n: maturedTotal,
      });
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }
}

/**
 * Lifetime headline in months from a monthly churn percentage (D-122-03):
 * `1 ÷ (churn% / 100)`. Guards churn 0 → `null` (no finite lifetime — never NaN/∞),
 * mirroring the ARPU div-by-zero guard.
 */
function lifetimeFromChurnPct(churnPercentage: number): number | null {
  if (churnPercentage <= 0) return null;
  return Math.round((1 / (churnPercentage / 100)) * 10) / 10; // 1 decimal
}

/**
 * Classify every MATURED life from the cohort into a survival observation. Closed
 * lives (matured AND not retained) are survival EVENTS (`closed: true`); active /
 * in-grace lives (matured AND retained, OR not matured) are CENSORED (`closed: false`)
 * — they are KEPT (never dropped, D-122-05). The duration span comes from the cohort
 * engine: closed → first-start..last-expiry; censored → first-start..today.
 */
function classifyLives(lives: CohortLifeRow[]): ClassifiedLife[] {
  const out: ClassifiedLife[] = [];
  for (const life of lives) {
    const closed = life.matured && !life.retained;
    // Closed lives measure to their expiry; censored lives measure to today.
    const end = closed ? life.lastEnd : life.today;
    const durationMonths = lifeDurationMonths(life.firstStart, end);
    out.push({
      userId: life.userId,
      currency: toCurrency(life.currency),
      durationMonths,
      closed,
    });
  }
  return out;
}
