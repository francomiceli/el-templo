/**
 * Analytics Module Types
 *
 * Response interfaces for KPI stats, member analytics,
 * attendance analytics, and financial analytics.
 */

// Reuse the canonical segment union (segmentation module) — analytics NEVER
// redefines segments (D-12).
import type { MemberSegment } from "../segmentation/types";
// Phase 120 Block 6: the ticket reuses the canonical `{ nominal, percentage, n }`
// envelope (FUND-02) for every ticket figure rather than redefining it.
import type { MetricShape } from "./metric-shape";

// -- Trend ---------------------------------------------------------------

export interface Trend {
  direction: "up" | "down" | "flat";
  percentage: number;
}

// -- KPI Stats -----------------------------------------------------------

/**
 * Monetary value broken down per currency (Phase 117 D-05 / D-17). Currencies
 * are NEVER summed across — ARS and EUR are always reported separately, each
 * with its own trend vs the prior period.
 */
export interface MonetaryKpiByCurrency {
  ARS: { value: number; trend: Trend };
  EUR: { value: number; trend: Trend };
}

export interface KpiStats {
  activeMembers: { value: number; trend: Trend };
  /**
   * Monthly revenue per currency (D-05). Replaces the former single
   * `{ value, trend }` that silently summed ARS+EUR in the owner view.
   */
  monthlyRevenue: MonetaryKpiByCurrency;
  dailyAttendanceAvg: { value: number; trend: Trend };
}

// -- Member Analytics ----------------------------------------------------

/**
 * A member on the renewals/expirations worklist (Phase 117 D-14/D-16).
 *
 * Two kinds (`type`):
 *   - `expiring`: an ACTIVE subscription ending within the next 7 days.
 *     `daysUntilExpiry` is the (>=0) days remaining; `daysOverdue` is null.
 *   - `overdue`: a subscription whose `end_date` is in the past by 1..30 days
 *     AND the member is NOT currently active (no in-effect sub — they did not
 *     renew). `daysOverdue` is the real CURDATE()-end_date count (buckets
 *     1-7 / 8-14 / 15-30 are a frontend classification); `daysUntilExpiry` is
 *     null. Members overdue >30 days are NOT included.
 *
 * `yaPago` (D-16): true when the member has a recent (last 30 days) non-voided
 * `plan_charge` inflow in `financial_transactions` — derived, no new schema.
 * Used by reception to skip members who already paid but whose subscription
 * row has not been renewed yet. ("habló con coach" is DEFERRED — see service.)
 *
 * `segment` (D-16/D-17): the member's engagement segment from
 * `member_profiles.segment` (NULL when no profile / never segmented), so the
 * worklist can be prioritized — e.g. a `ghost` that is about to expire is the
 * highest-priority contact.
 */
export interface AttentionMember {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  planName: string;
  phone: string | null;
  type: "expiring" | "overdue";
  daysUntilExpiry: number | null;
  daysOverdue: number | null;
  /** Recent non-voided plan_charge inflow exists (D-16). */
  yaPago: boolean;
  /** Engagement segment for prioritization (D-16/D-17); NULL when unknown. */
  segment: MemberSegment | null;
}

/**
 * Operational renewal rate (Phase 117 D-15). For each window N (7/14/30 days),
 * of the members whose subscription ended exactly within the last N days, the
 * percentage (0..100, rounded) that renewed — i.e. now have an in-effect
 * subscription per the canonical `activeMemberExists` predicate. Complements
 * the strategic retention-by-cohort curve deferred to Phase 118. When no
 * subscription ended in a window, that window reports 0.
 */
export interface RenewalRate {
  last7: number;
  last14: number;
  last30: number;
}

/**
 * Plan distribution row (Phase 117 D-07). Grouped by (name, country) — NOT by
 * name alone — so "Flex (AR)" (plan id 1) and "Flex (ES)" (plan id 105) appear
 * as separate rows instead of being summed into one. Archived plans
 * (`is_archived = true`) are excluded.
 */
export interface PlanDistributionRow {
  planName: string;
  country: string;
  count: number;
}

export interface MemberAnalytics {
  newMembers: number;
  churnedMembers: number;
  retentionRate: number;
  planDistribution: PlanDistributionRow[];
  attentionList: AttentionMember[];
  /** Operational renewal rate 7/14/30 (Phase 117 D-15). */
  renewalRate: RenewalRate;
}

// -- Attendance Analytics ------------------------------------------------

export interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  averageOccupancy: number;
}

export interface SlotOccupancy {
  scheduleId: number;
  activityName: string;
  dayOfWeek: number;
  startTime: string;
  averageOccupancy: number;
}

export interface AttendanceAnalytics {
  dailyCheckins: Array<{ date: string; count: number }>;
  peakHoursHeatmap: HeatmapCell[];
  slotOccupancy: SlotOccupancy[];
  noShowRate: number;
}

// -- Attendance Metrics (Phase 117 D-11 / D-13) --------------------------

/**
 * Unique members (COUNT DISTINCT member_id) over `attendance` for the last
 * 7 / 14 / 30 days (D-11). Each window is counted backwards from "now".
 */
export interface UniqueMembersMetric {
  last7: number;
  last14: number;
  last30: number;
}

/**
 * Per-branch check-in adoption (D-13 Parte B). `ratio` is `conCheckin /
 * confirmados` in the 0..1 range (0 = nadie checkea, 1 = todos). The <50%
 * warning is frontend logic (Plan 05). A branch with `confirmados > 0` and
 * `conCheckin = 0` reports `ratio = 0` (never NaN). Branches with 0 confirmed
 * bookings in scope do not appear.
 */
export interface CheckInAdoptionRow {
  branchId: number;
  branchName: string;
  confirmados: number;
  conCheckin: number;
  ratio: number;
}

// -- Engagement (Phase 117 D-12) -----------------------------------------

/**
 * Active-member counts per behavioral segment (Phase 117 D-12). The 6 segments
 * are the canonical `MemberSegment` values (segmentation/types.ts) — analytics
 * NEVER recalculates them, it only AGGREGATES `member_profiles.segment` for
 * members that are active (canonical predicate `activeMemberExists`). Every key
 * is always present and defaults to 0.
 *
 * `sinSegmento` is the bucket for active members whose `member_profiles.segment`
 * is NULL (no profile row yet, or segment never computed — the member has not
 * logged in since segmentation shipped). These members are real and active, so
 * they are counted here rather than dropped, keeping the per-segment counts
 * reconcilable against the total active count.
 */
export interface SegmentCounts {
  nuevo: number;
  espartano: number;
  intermitente: number;
  en_riesgo: number;
  digital_warrior: number;
  ghost: number;
  /** Active members with no computed segment (member_profiles.segment IS NULL). */
  sinSegmento: number;
}

/**
 * A member on the engagement worklist (Phase 117 D-12 / D-17). Same nominal
 * shape as `AttentionMember` (getAttentionList) — carries `phone` for the
 * WhatsApp deep-link action in the admin. Only `en_riesgo` and `ghost` active
 * members appear here ("activos que se van a ir si nadie los toca"). PII
 * (phone) is gated by the ADMIN_ROLES guard + scope (T-117-01 / T-117-06).
 */
export interface EngagementMember {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  planName: string | null;
  phone: string | null;
  segment: "en_riesgo" | "ghost";
}

// -- Retention by cycle cohorts (Phase 118 D-04/D-05/D-06) ---------------

/**
 * A plan offered as a retention filter option (follow-up). The retention curve
 * is filterable by a single concrete plan (`planId`); the frontend builds the
 * selector from `availablePlans` and shows the duration in parentheses.
 * `durationDays` may be null for legacy plans with no duration set.
 */
export interface RetentionPlanOption {
  id: number;
  name: string;
  durationDays: number | null;
}

/**
 * A single retention cohort (Phase 118 D-06). `cohort` is the month (`YYYY-MM`)
 * of the member's FIRST active subscription. `size` is the number of distinct
 * members whose first active sub falls in that month. `cycleRetention[i]` is the
 * percentage (0..100, rounded) of the cohort that reached AT LEAST cycle `i+1`
 * (so `cycleRetention[0]` is always 100 — every cohort member completed cycle 1
 * by definition). A consecutive cycle is the next subscription iff
 * `next.startDate − prev.endDate ≤ CONSECUTIVE_CYCLE_GAP_DAYS` days; a larger gap
 * ENDS the streak (D-05) and the member does not count toward later cycles of
 * the original cohort.
 */
export interface RetentionCohort {
  cohort: string; // YYYY-MM
  size: number;
  /** % reaching at least cycle N, index 0 = cycle 1 (always 100). */
  cycleRetention: number[];
}

/**
 * Distribution of completed consecutive cycles among CURRENTLY ACTIVE members
 * (Phase 118 D-06). "Active" is the canonical `activeMemberExists` predicate
 * (NEVER `users.status`). Each active member is bucketed by the length of their
 * current consecutive-cycle streak: 1, 2, or 3+. A proxy of base maturity.
 */
export interface CycleDistribution {
  ciclo1: number;
  ciclo2: number;
  ciclo3plus: number;
}

/**
 * Retention-by-cycle response (Phase 118 D-06). `cohorts` is sorted ascending by
 * `cohort` month. `maxCycle` is the longest cycle index present across cohorts
 * (so the frontend knows how many X-axis points to render). `cycleDistribution`
 * is the maturity snapshot over active members. `invalidWindowSubs` counts subs
 * skipped for defensive reasons (null start/end or end<start) so the frontend
 * can surface a caveat. `availablePlans` lists the distinct plans present in the
 * current scope — the frontend builds the plan filter options from it (follow-up).
 */
export interface RetentionAnalytics {
  cohorts: RetentionCohort[];
  maxCycle: number;
  cycleDistribution: CycleDistribution;
  invalidWindowSubs: number;
  availablePlans: RetentionPlanOption[];
}

// -- Conversion funnel freemium → prueba → activo (Phase 118 D-01/D-03) ---

/**
 * Funnel entry-origin segment (Phase 118 follow-up). Discriminates trials by the
 * `from_status` of their EARLIEST `prueba` transition in `user_status_history`:
 *
 *   - `all`: no segmentation — the classic 3-stage cohort funnel
 *     `freemium → prueba → activo` over every user created in the cohort month.
 *   - `directo`: trials created directly as `prueba` (`from_status = NULL`) — the
 *     Meta-ads / WhatsApp / walk-in channel. Returns a 2-stage `prueba → activo`
 *     funnel (`toPruebaPct` is 100 by construction; the freemium stage is N/A).
 *   - `freemium`: trials that converted from a freemium account
 *     (`from_status = 'freemium'`). Same 2-stage `prueba → activo` shape.
 *
 * `directo`/`freemium` only classify users that have a `prueba` transition, so —
 * like the rest of the funnel — they are precise forward-only since the Plan 01
 * hooks (2026-05-26). Users without a `prueba` row appear only in `all`.
 */
export type FunnelEntryOrigin = "all" | "directo" | "freemium";

/**
 * A single funnel cohort (Phase 118 D-03). `cohortMonth` is the month
 * (`YYYY-MM`) of `users.created_at` — every user created that month falls in the
 * same cohort. `size` is the number of users in the cohort (in scope).
 *
 *   - `toPruebaPct`: % of the cohort that reached the `prueba` stage (a
 *     transition to 'prueba' exists in `user_status_history`). CAVEAT (D-01):
 *     `prueba` rows are precise ONLY forward-only since 2026-05-26 (Plan 01
 *     hooks); older cohorts under-count. The frontend surfaces the ramp-up
 *     caveat.
 *   - `toActivoPct`: % of the cohort that reached `activo` — a transition to
 *     'activo' in `user_status_history` OR, as a historical approximation
 *     (D-01), the existence of at least one subscription
 *     (`MIN(subscriptions.created_at)`).
 *   - `medianDaysFreemiumToPrueba`: median whole-days from `users.created_at` to
 *     the `prueba` transition, computed ONLY over the users who actually reached
 *     `prueba` (not the whole cohort). `null` when no user reached `prueba`
 *     (never NaN, T-118-12).
 *   - `medianDaysPruebaToActivo`: median whole-days from the `prueba` transition
 *     to the `activo` moment, computed ONLY over users who passed through BOTH
 *     stages. `null` when no user passed through both.
 */
export interface FunnelCohort {
  cohortMonth: string; // YYYY-MM
  size: number;
  toPruebaPct: number;
  toActivoPct: number;
  medianDaysFreemiumToPrueba: number | null;
  medianDaysPruebaToActivo: number | null;
}

/**
 * Conversion-funnel response (Phase 118 D-01/D-03). `cohorts` is sorted ascending
 * by `cohortMonth`. The historical `activo` stage is approximated via
 * `MIN(subscriptions.created_at)`; precise `prueba`/`activo` transitions are
 * forward-only since 2026-05-26 — the frontend (Plan 06) shows the ramp-up
 * caveat (D-01).
 */
export interface FunnelAnalytics {
  cohorts: FunnelCohort[];
  /**
   * Echoes the requested segment so the frontend renders the right shape:
   * `all` → 3-stage (freemium → prueba → activo); `directo`/`freemium` →
   * 2-stage (prueba → activo).
   */
  entryOrigin: FunnelEntryOrigin;
}

// -- Advanced Finance: Caja vs Devengado + ARPU (Phase 118 D-07/D-08) -----

/**
 * Advanced-finance response (Phase 118 D-07/D-08). All three series are split per
 * currency (ARS/EUR are NEVER summed) and sorted ascending by `month` (`YYYY-MM`).
 *
 *   - `cashTrend` (CAJA): the canonical cash-basis revenue per month — the same
 *     figure `FinancialAnalytics.revenueTrend` reports. A long plan paid up-front
 *     lands fully in the month of payment.
 *   - `accruedTrend` (DEVENGADO): `price_paid` of each subscription prorated over
 *     its EFFECTIVE window (`[startDate, MIN(endDate, cancelledAt)]`) and
 *     distributed across the months it touches, proportional to the days inside
 *     each month. Honest revenue for long plans + cancellations.
 *   - `arpu`: `accruedTrend[month] ÷ activos` per currency, where `activos` is the
 *     canonical `activeMemberExists` count (NEVER `users.status`). A month with 0
 *     active members reports ARPU 0 (div-by-zero guard, T-118-08).
 *
 * `excludedInvalidWindow` counts subscriptions skipped from the accrual because
 * their window was invalid (null start/end, end<start, or zero-day) so the
 * frontend can surface a caveat — these never divided by zero.
 */
export interface AdvancedFinanceAnalytics {
  cashTrend: Array<{ month: string; ARS: number; EUR: number }>;
  accruedTrend: Array<{ month: string; ARS: number; EUR: number }>;
  arpu: Array<{ month: string; ARS: number; EUR: number }>;
  excludedInvalidWindow: number;
}

// -- Ticket promedio (Phase 120 Block 6 — TICKET-01..04) -----------------

/**
 * The average of a single cohort of charges plus its sample size. Used for the
 * list-price vs discounted/customized split (both per-plan and global). `average`
 * is `null` when the cohort is empty (`n === 0`) so the wire shape never carries
 * NaN; the schema declares it `["number","null"]`.
 */
export interface TicketCohortAverage {
  /** Mean `price_paid` of this cohort, or `null` when the cohort is empty. */
  average: number | null;
  /** Number of charges in this cohort. */
  n: number;
}

/**
 * The two-cohort split of a ticket figure so discounts/overrides do not silently
 * distort the headline number (TICKET must read cleanly):
 *   - `listPrice`:  charges placed at the agreed list price with no override
 *     (`price_paid === listBase` AND `priceOverrideAmount` is null).
 *   - `discounted`: charges placed below list price OR with a price override/
 *     customization applied (`price_paid < listBase` OR `priceOverrideAmount` is
 *     non-null).
 * `$0` charges (`price_paid === 0`) belong to NEITHER cohort — they are excluded
 * from both averages and surfaced separately via `zeroCount`/`zeroPct`.
 */
export interface TicketCohortSplit {
  listPrice: TicketCohortAverage;
  discounted: TicketCohortAverage;
}

/**
 * Per-plan ticket row (grouped by `(name, country)` so "Flex (AR)" ≠ "Flex (ES)").
 * Every figure here is for ONE currency — the per-currency block owns the array.
 */
export interface TicketPlanRow {
  /** Plan display name. */
  planName: string;
  /** Plan country (`AR` | `ES`). Part of the grouping key alongside `planName`. */
  country: string;
  /**
   * Duration tier derived from the plan's `durationDays` via `deriveDurationTier`
   * (`"monthly"` | `"long_term"`); `null` for excluded one-off plans.
   */
  durationTier: "monthly" | "long_term" | null;
  /**
   * The plan's volume-weighted ticket over its charges with `price_paid > 0`:
   * `nominal` = mean `price_paid`, `n` = count of those charges. `$0` charges are
   * excluded from this average and reported via `zeroCount`/`zeroPct`.
   */
  ticket: MetricShape;
  /** Mean discount fraction (0..1) vs list base; `null` when no priced charge. */
  discountMean: number | null;
  /** Median discount fraction (0..1) vs list base; `null` when no priced charge. */
  discountMedian: number | null;
  /** Count of `$0` charges (`price_paid === 0`) placed on this plan. */
  zeroCount: number;
  /** `zeroCount` as a percentage of ALL the plan's charges (incl. `$0`); `0` when none. */
  zeroPct: number;
  /** List-price vs discounted/customized split of this plan's priced charges. */
  cohorts: TicketCohortSplit;
}

/** Per-branch ticket row (one currency, owned by the per-currency block). */
export interface TicketBranchRow {
  /** Branch display name. */
  branchName: string;
  /** Volume-weighted ticket over the branch's `price_paid > 0` charges. */
  ticket: MetricShape;
  /** Mean discount fraction (0..1) for the branch; `null` when no priced charge. */
  discountMean: number | null;
  /** Median discount fraction (0..1) for the branch; `null` when no priced charge. */
  discountMedian: number | null;
}

/** Per-duration-tier ticket row (one currency, owned by the per-currency block). */
export interface TicketDurationRow {
  /** The duration tier (`"monthly"` | `"long_term"`). One-off plans are excluded. */
  durationTier: "monthly" | "long_term";
  /** Volume-weighted ticket over the tier's `price_paid > 0` charges. */
  ticket: MetricShape;
}

/**
 * The complete ticket payload for ONE currency. ARS and EUR are NEVER summed —
 * each currency owns its own block (FUND-04 / TICKET-04).
 */
export interface TicketCurrencyBlock {
  /**
   * Volume-weighted GLOBAL ticket: `SUM(price_paid) / COUNT(charges)` over all
   * `price_paid > 0` charges in this currency (TICKET-02 — NOT the mean of the
   * per-plan means). `nominal` = the weighted average, `n` = the charge count.
   */
  global: MetricShape;
  /** List-price vs discounted/customized split of the global priced charges. */
  globalCohorts: TicketCohortSplit;
  /** Count of GLOBAL `$0` charges (`price_paid === 0`) in this currency. */
  zeroCount: number;
  /** Global `zeroCount` as a percentage of ALL charges (incl. `$0`); `0` when none. */
  zeroPct: number;
  /** Global mean discount fraction (0..1); `null` when no priced charge. */
  discountMean: number | null;
  /** Global median discount fraction (0..1); `null` when no priced charge. */
  discountMedian: number | null;
  /** Per-plan ticket rows, grouped by `(name, country)`. */
  perPlan: TicketPlanRow[];
  /** Per-branch ticket rows. */
  byBranch: TicketBranchRow[];
  /** Per-duration-tier ticket rows. */
  byDuration: TicketDurationRow[];
}

/**
 * Ticket promedio analytics (Phase 120 Block 6). Per currency: the per-plan and
 * volume-weighted global ticket sourced from the LINKED `subscriptions.price_paid`
 * (NOT `financial_transactions.amount`, which is cash received and can be a partial
 * payment), the `$0` charge count/%, the mean+median discount vs the
 * `price_regular_snapshot` (current-`priceRegular` fallback for historical rows),
 * and the list-price vs discounted/customized cohort split.
 *
 * Caveat counts:
 *   - `historicalFallbackCount`: charges whose subscription had a NULL
 *     `priceRegularSnapshot` and whose discount therefore fell back to the plan's
 *     CURRENT `priceRegular` (the list price was never stored) — surfaced so the
 *     frontend can disclaim the discount fidelity for those rows.
 *   - `excludedNoLink` (MANDATORY): in-period `plan_charge`s with NO subscription
 *     link (e.g. enrollment-only charges linked via `target_kind='enrollment'`).
 *     These are NOT membership charges, so they are excluded from every ticket
 *     figure and surfaced here rather than silently dropped.
 */
export interface TicketAnalytics {
  byCurrency: {
    ARS: TicketCurrencyBlock;
    EUR: TicketCurrencyBlock;
  };
  /** Count of priced charges that fell back to the plan's current `priceRegular`. */
  historicalFallbackCount: number;
  /** MANDATORY: in-period `plan_charge`s with no subscription link (per currency, summed). */
  excludedNoLink: number;
}

// -- Churn + Renovación Analytics (Phase 121) ----------------------------

/**
 * The breakdown axis a churn/renovación segment row is grouped by (CHURN-06 /
 * RENOV-04). Mirrors the standard analytics breakdown axes — branch / country /
 * duration tier / plan. These are ADDITIVE grouping keys, NEVER access filters
 * (scope stays in `applyScope`).
 */
export type ChurnRenewalAxis = "branch" | "country" | "duration" | "plan";

/**
 * One churn segment (CHURN-06): the churn `{ nominal, percentage, n }` for one
 * value of one breakdown `axis`. `nominal` = churned persons, `n` = matured
 * cohort size for the segment.
 */
export interface ChurnSegmentRow {
  /** The breakdown axis this row is grouped by. */
  axis: ChurnRenewalAxis;
  /** The segment key within the axis (branch name, country, duration tier, or plan name). */
  key: string;
  /** Churn for this segment (`nominal` = churned, `n` = matured cohort). */
  churn: MetricShape;
}

/**
 * One multi-N comparative churn column (D-07 / CHURN-02): the churn at a specific
 * window. The comparative view shows several of these side by side (default set
 * `CHURN_COMPARISON_WINDOWS`); the OFFICIAL churn that pairs with renovación uses
 * the single configured window.
 */
export interface ChurnWindowResult {
  /** The window (in whole days) this churn was computed at. */
  windowDays: number;
  /** Churn at this window (`nominal` = churned, `n` = matured cohort). */
  churn: MetricShape;
}

/**
 * One point of the monthly churn series (CHURN-05): the churn for the expiry
 * cohort of one bucket. `provisional` is `true` when the cohort has NOT yet
 * matured (its expiries are still within `windowDays` of today), so the value is
 * not final and the frontend should mark it as such.
 */
export interface ChurnSeriesPoint {
  /** The monthly bucket key (`YYYY-MM`) of the expiry cohort. */
  bucket: string;
  /** Churn for this cohort (`nominal` = churned, `n` = matured cohort). */
  churn: MetricShape;
  /** `true` when the cohort has not yet matured (>= windowDays old) — value is provisional. */
  provisional: boolean;
}

/**
 * Churn de no renovación analytics (Phase 121 Block 1). Person-based: distinct
 * persons whose membership expired in `[from, to)` (D-01, cohort from
 * `expiry-cohort.ts`) and who did NOT renew within the configured window (D-05),
 * counted only once matured (D-08). Shares ONE cohort definition with renovación
 * so churn% and renov% sit on the same denominator (RENOV-01).
 */
export interface ChurnAnalytics {
  /**
   * The OFFICIAL churn at the configured ventana that pairs with renovación
   * (D-07). Same window the renovación block uses.
   */
  window: ChurnWindowResult;
  /**
   * The multi-N comparative columns (default `CHURN_COMPARISON_WINDOWS` =
   * 5/10/15) side by side — exploration view only (D-07 / CHURN-02).
   */
  comparison: ChurnWindowResult[];
  /**
   * Persons in the grace window (expired < windowDays ago) excluded from the
   * matured churn calculation (D-08). Surfaced so the frontend can show the
   * "número vivo" not yet counted.
   */
  enGracia: number;
  /** Monthly churn series by expiry cohort (CHURN-05), provisional flag per point. */
  series: ChurnSeriesPoint[];
  /** Churn opened by branch / country / duration / plan (CHURN-06). */
  breakdowns: ChurnSegmentRow[];
}

/**
 * One renovación segment (RENOV-04): the renewal `{ nominal, percentage, n }` for
 * one value of one breakdown `axis`. `nominal` = renovados, `n` = matured cohort
 * size (vencidos) for the segment. Sortable / comparable.
 */
export interface RenewalSegmentRow {
  /** The breakdown axis this row is grouped by. */
  axis: ChurnRenewalAxis;
  /** The segment key within the axis (branch name, country, duration tier, or plan name). */
  key: string;
  /** Renewal for this segment (`nominal` = renovados, `n` = matured cohort / vencidos). */
  renewal: MetricShape;
}

/**
 * Tasa de renovación analytics (Phase 121 Block 2). `renovados ÷ vencidos` over
 * the SAME matured expiry cohort as churn (RENOV-01). The renewal predicate is the
 * shared `retainedExpr` at the configured window (default
 * `RENOVATION_WINDOW_DEFAULT_DAYS`, D-07).
 */
export interface RenewalAnalytics {
  /** The configured renovación window (whole days) this rate was computed at. */
  windowDays: number;
  /** Renewal over the matured cohort (`nominal` = renovados, `n` = vencidos). */
  renewal: MetricShape;
  /**
   * Persons still in the grace window (excluded from the matured cohort) — the
   * "número vivo" (RENOV-03 / D-07). `renov% + churn%` only sum to 100 when
   * `enGracia === 0`; this field exposes that residual rather than forcing the sum.
   */
  enGracia: number;
  /** Renewal opened by branch / country / duration / plan (RENOV-04). */
  breakdowns: RenewalSegmentRow[];
}

// -- LTV / vida del cliente (Phase 122 — LTV-01..05) ---------------------

/**
 * The per-currency monetary LTV block for ONE currency (D-122-07 / D-122-09).
 * ARS and EUR are NEVER summed — `LtvCurrencyBlock` owns the figures for a single
 * currency and `LtvMonetary` holds one block per currency. Every monetary figure is
 * computed from REAL payments (`financial_transactions`), NEVER from an ARPU snapshot
 * or list price (D-122-07 caveat #8): the projected/observed split lets the panel
 * compare an estimate against the exact sum over already-closed lives.
 *
 * All averages are nullable (`number | null`) because the underlying cohort can be
 * empty: a `null` means "no data" and is declared `["number","null"]` on the wire so
 * the JSON never carries NaN (mirrors `TicketCohortAverage.average`).
 */
export interface LtvCurrencyBlock {
  /**
   * Projected LTV: `lifetime × ingreso_mensual_real_promedio_por_cliente`, where the
   * monthly real revenue per customer comes from real payments (D-122-07). `null`
   * when the cohort is empty or the lifetime headline is unavailable (churn 0).
   */
  projected: number | null;
  /**
   * Observed LTV: the EXACT sum of all real payments over the CLOSED customers' lives
   * (no estimation, D-122-07). `null` when there are no closed lives in this currency.
   */
  observed: number | null;
  /**
   * The real monthly revenue per customer this block was built on, derived from real
   * payments (`LTV_observado ÷ lifetime`, or the cohort mean of monthly real revenue).
   * Surfaced so the panel can audit the projection. `null` when the cohort is empty.
   */
  monthlyRealRevenue: number | null;
  /** Sample size for this currency's monetary figures (closed lives counted). */
  n: number;
}

/**
 * The monetary LTV surface, one block per currency (D-122-09 — ARS / EUR never
 * summed). An unknown currency is skipped upstream, never folded into either block.
 */
export interface LtvMonetary {
  ARS: LtvCurrencyBlock;
  EUR: LtvCurrencyBlock;
}

/**
 * One LTV breakdown segment (LTV-05 / D-122-09): the LTV figures for one value of one
 * breakdown `axis` (branch / country / plan — `duration` is available via the shared
 * `ChurnRenewalAxis` but optional for LTV). Reuses the churn/renovación axis union so
 * the breakdown contract stays uniform across blocks. Each row carries its own
 * headline / survival median / per-currency monetary block so segments are directly
 * comparable (which membership retains the longest, most-valuable lives).
 */
export interface LtvSegmentRow {
  /** The breakdown axis this row is grouped by. */
  axis: ChurnRenewalAxis;
  /** The segment key within the axis (branch name, country, duration tier, or plan name). */
  key: string;
  /**
   * Headline lifetime in months for this segment (`1 ÷ churn_mensual`, D-122-03).
   * `null` when the segment churn is 0 (no finite lifetime — never NaN/∞).
   */
  lifetimeHeadlineMonths: number | null;
  /**
   * Kaplan-Meier survival median (months) for this segment (D-122-05). `null` when the
   * cohort is empty / single-customer / survival never crosses 0.5.
   */
  survivalMedianMonths: number | null;
  /** Per-currency monetary LTV for this segment (ARS / EUR never summed). */
  monetary: LtvMonetary;
  /** Cohort sample size for this segment. */
  n: number;
}

/**
 * LTV / vida del cliente analytics (Phase 122). The customer-lifetime block chained
 * onto the Phase 121 churn engine: the "end of life" is exactly the matured,
 * not-retained churn event (D-122-02), and reactivation inherits the same 15-day
 * renovación window (D-122-04). Exposes TWO duration numbers so the panel can compare
 * them (a large gap between headline and KM median signals front-loaded churn):
 *
 *   - `lifetimeHeadlineMonths`: the simple `1 ÷ churn_mensual` reusing Phase 121's
 *     person-based churn (D-122-03). `null` when churn is 0 (no finite lifetime).
 *   - `survivalMedianMonths`: the robust Kaplan-Meier survival median treating active
 *     customers as censored data (D-122-05). `null` when the cohort is too small or
 *     survival never crosses 0.5.
 *
 * Monetary LTV (`monetary`) is per currency, from REAL payments only (D-122-07), with
 * a projected/observed split. Everything is opened by branch / country / plan via
 * `breakdowns` (D-122-09). `n` is the matured cohort size (always reported).
 */
export interface LtvAnalytics {
  /**
   * Headline lifetime in months: `1 ÷ churn_mensual` (D-122-03), reusing the Phase
   * 121 person-based churn. `null` when churn is 0 (no finite lifetime — never NaN).
   */
  lifetimeHeadlineMonths: number | null;
  /**
   * Kaplan-Meier survival median in months (D-122-05). `null` when the cohort is
   * empty / single-customer / survival never reaches the median threshold.
   */
  survivalMedianMonths: number | null;
  /** Per-currency monetary LTV (projected + observed, real-payment based, D-122-07). */
  monetary: LtvMonetary;
  /** LTV opened by branch / country / plan (LTV-05 / D-122-09). */
  breakdowns: LtvSegmentRow[];
  /** The matured cohort size the headline / survival median were computed over. */
  n: number;
}

// -- Frecuencia de asistencia (Phase 123 Block 4 — FREQ-01..04) ----------

/**
 * The four frequency bands a member is classified into by visits/week
 * (D-123-04). `inactivo` (0 visits) is the actionable signal; the cutoffs
 * between bajo / medio / alto live as named constants in `frequency-service.ts`.
 * Mirrors the `FrequencyBand` exported by the service (kept in sync here so the
 * wire types do not import from the service module).
 */
export type FrequencyBand = "inactivo" | "bajo" | "medio" | "alto";

/**
 * The breakdown axis a frequency segment row is grouped by (D-123-14). Same
 * standard axes as churn/renovación — branch / country / duration tier / plan.
 * ADDITIVE grouping keys, NEVER access filters (scope stays in `applyScope`).
 */
export type FrequencyBreakdownAxis = "branch" | "country" | "duration" | "plan";

/**
 * One band of the frequency distribution (D-123-04): the count of active members
 * in `band` over the active population. `count.nominal` = members in the band,
 * `count.n` = the active population. Active-with-0-visits members fold into
 * `inactivo`.
 */
export interface FrequencyDistributionRow {
  /** The band this row counts. */
  band: FrequencyBand;
  /** Count of active members in this band (`nominal`) over the population (`n`). */
  count: MetricShape;
}

/**
 * One "enfriándose" (cooling-down) member (D-123-05): a member whose
 * current-window band rank dropped strictly below their prior-window band rank.
 * `pctVariacion` is informative (the trigger is the band drop, not the %) and is
 * `null` when the prior window had 0 visits/week (declared `["number","null"]`
 * on the wire — never NaN).
 */
export interface FrequencyCoolingRow {
  /** The member's user id. */
  userId: number;
  /** The member's CURRENT-window band. */
  currentBand: FrequencyBand;
  /** The member's PRIOR-window band (strictly higher rank than `currentBand`). */
  priorBand: FrequencyBand;
  /** % change in visits/week (current vs prior); `null` when prior is 0. */
  pctVariacion: number | null;
}

/**
 * One frequency breakdown segment (D-123-14): the band count `{ nominal,
 * percentage, n }` for one band of one value of one breakdown `axis`. `nominal`
 * = members of that band in the segment, `n` = the segment's active population.
 */
export interface FrequencySegmentRow {
  /** The breakdown axis this row is grouped by. */
  axis: FrequencyBreakdownAxis;
  /** The segment key within the axis (branch name, country, duration tier, or plan composite). */
  key: string;
  /** The band this row counts within the segment. */
  band: FrequencyBand;
  /** Count of active members of this band in the segment (`nominal`) over the segment population (`n`). */
  count: MetricShape;
}

/**
 * Frecuencia de asistencia analytics (Phase 123 Block 4). Per-member visits/week
 * over the rolling last 4 weeks (normalized for <4-week members, D-123-03),
 * surfaced as the band distribution (incl. active-0-visits → Inactivo), the
 * cooling-down list, the reused per-branch check-in adoption ratio (validity
 * gate, D-123-06), and the 4-axis breakdowns.
 */
export interface FrequencyAnalytics {
  /** Band distribution over the active population (D-123-04). */
  distribution: FrequencyDistributionRow[];
  /** Members who dropped ≥1 band vs the prior 4 weeks, with % de variación (D-123-05). */
  coolingDown: FrequencyCoolingRow[];
  /** Per-branch check-in adoption ratio (REUSED from AttendanceMetricsService, D-123-06). */
  checkInAdoption: CheckInAdoptionRow[];
  /** Band counts opened by branch / country / duration / plan (D-123-14). */
  breakdowns: FrequencySegmentRow[];
}

// -- Trial-session Funnel Analytics (Phase 123 Block 3 — FUNNEL-01..05) --

/**
 * A trial-session turno (shift) bucket (D-123-13), classified from a schedule's
 * `startTime`: mañana = [07,10), tarde = [17,20), everything else `"otro"`. Used
 * both as a funnel breakdown axis value AND (mañana/tarde only) as the D-10 turno
 * INPUT filter. The runtime classifier `classifyTurno` lives in
 * `trial-funnel-service.ts`; this is the single shared literal so `AnalyticsFilters`
 * can reference it without a circular service import.
 */
export type TrialTurno = "manana" | "tarde" | "otro";

/**
 * The breakdown axis a trial-funnel segment row is grouped by (FUNNEL-05).
 * `branch`/`country`/`plan` mirror the standard axes; `turno` is a funnel-LOCAL
 * axis (bucketed from `schedules.startTime`, NOT part of the shared
 * `breakdowns.ts`). The `plan` axis groups by the plan the lead BOUGHT
 * (D-123-09), NOT the trial plan. ADDITIVE grouping keys, never access filters.
 */
export type TrialFunnelAxis = "branch" | "country" | "turno" | "plan";

/**
 * The three cascade counts (D-123-08/07/09): every new-lead trial booking
 * (`reservaron`), the subset that attended (`asistieron`, from
 * `bookings.status`), and the subset that bought a first paid sub in the window
 * (`compraron`).
 */
export interface TrialFunnelStageCounts {
  /** New-lead trial bookings in the cohort, regardless of final status. */
  reservaron: number;
  /** Bookings with status IN ('qr_escaneado','confirmado') (D-123-07). */
  asistieron: number;
  /** Leads who bought a first paid sub within the attribution window (D-123-09). */
  compraron: number;
}

/**
 * The three cascade rates (D-123-11), each a `{ nominal, percentage, n }`
 * envelope (div-by-zero → 0, never NaN):
 *   - tasaShow     = asistieron ÷ reservaron
 *   - tasaCierre   = compraron ÷ asistieron (denominator = ASISTENTES)
 *   - puntaAPunta  = compraron ÷ reservaron
 */
export interface TrialFunnelRates {
  /** asistieron ÷ reservaron. */
  tasaShow: MetricShape;
  /** compraron ÷ asistieron (over asistentes, NOT reservas — D-123-11). */
  tasaCierre: MetricShape;
  /** compraron ÷ reservaron (end-to-end). */
  puntaAPunta: MetricShape;
}

/**
 * One bucket of the weekly/monthly cascade series (D-123-04/10/12). The cohort
 * is anchored by `bookings.bookingDate` and bucketed `%x-W%v` (weekly) / `%Y-%m`
 * (monthly). `provisional` is true when ANY of the bucket's sessions has not yet
 * matured (sessionDate + attribution window > today — D-123-12).
 */
export interface TrialFunnelSeriesRow {
  /** The bucket key (`%x-W%v` weekly or `%Y-%m` monthly). */
  bucket: string;
  /** The three rates for this bucket. */
  rates: TrialFunnelRates;
  /** The three counts for this bucket. */
  counts: TrialFunnelStageCounts;
  /** True when the bucket's attribution window has not fully elapsed (D-123-12). */
  provisional: boolean;
}

/**
 * One breakdown segment (FUNNEL-05): the cascade counts + rates for one value of
 * one axis. branch/country/turno/plan-bought; the plan axis only counts buyers
 * (the bought plan is undefined for a non-converter — D-123-09).
 */
export interface TrialFunnelBreakdownRow {
  /** The breakdown axis this row is grouped by. */
  axis: TrialFunnelAxis;
  /** The segment key within the axis (branch name, country, turno, or plan-bought composite). */
  key: string;
  /** The three rates for this segment. */
  rates: TrialFunnelRates;
  /** The three counts for this segment. */
  counts: TrialFunnelStageCounts;
}

/**
 * Trial-session funnel analytics (Phase 123 Block 3). The cascade
 * reservó → asistió → compró over the NEW-LEAD trial cohort anchored by the
 * scheduled-session date, with the three rates, the weekly+monthly provisional
 * series, the branch/country/turno/plan-bought breakdowns, and the effective
 * attribution window in whole days (D-123-12).
 */
export interface TrialFunnelAnalytics {
  /** The official cascade counts over the whole new-lead cohort. */
  counts: TrialFunnelStageCounts;
  /** The official cascade rates over the whole new-lead cohort. */
  rates: TrialFunnelRates;
  /** Weekly + monthly cascade series with the provisional flag (D-123-12). */
  series: TrialFunnelSeriesRow[];
  /** Cascade opened by branch / country / turno / plan-bought (FUNNEL-05). */
  breakdowns: TrialFunnelBreakdownRow[];
  /** The effective attribution window in whole days (default 21, D-123-12). */
  attributionWindowDays: number;
}

// -- Financial Analytics -------------------------------------------------

export interface OutstandingByCurrency {
  ARS: number;
  EUR: number;
}

/**
 * A pair of revenue totals keyed by currency (Phase 117 D-05 / D-17).
 * Currencies are NEVER summed across — ARS and EUR are reported separately.
 */
export interface RevenueByCurrency {
  ARS: number;
  EUR: number;
}

export interface FinancialAnalytics {
  /**
   * Monthly revenue trend, per currency (D-05). Each entry carries both ARS
   * and EUR totals for the month so the owner view never sums them.
   */
  revenueTrend: Array<{ month: string; ARS: number; EUR: number }>;
  /**
   * Revenue by payment method, each method split per currency (D-05).
   */
  revenueByMethod: {
    cash: RevenueByCurrency;
    transfer: RevenueByCurrency;
    card: RevenueByCurrency;
  };
  revenueByBranch: Array<{
    branchId: number;
    branchName: string;
    ARS: number;
    EUR: number;
  }>;
  /**
   * Total outstanding debt (amount > 0 in `balances`) at "now",
   * grouped by currency. Source of truth: the same `balances` table the
   * Reports/Deudas tab reads from. Currencies are NEVER summed across.
   * Non-owner scopes will only have one non-zero key.
   */
  outstandingByCurrency: OutstandingByCurrency;
}

// -- Filters -------------------------------------------------------------

export interface AnalyticsFilters {
  branchId?: number;
  country?: "AR" | "ES";
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  /**
   * Plan restriction (retention only, follow-up). Exact match on
   * `subscriptions.plan_id`. When absent, no plan filter is applied. Lets the
   * retention curve be read per concrete plan (a "cycle 2" on a 30-day plan ≠ a
   * "cycle 2" on a 240-day plan). Ignored by metrics that do not support it.
   */
  planId?: number;
  /**
   * Funnel entry-origin segment (Phase 118 follow-up, funnel only). Attributes
   * conversions by the path the trial came from. When absent or `all`, the
   * classic 3-stage cohort funnel is returned; `directo` / `freemium` return a
   * 2-stage `prueba → activo` funnel restricted to trials of that origin.
   * Ignored by metrics that do not support it.
   */
  entryOrigin?: FunnelEntryOrigin;
  /**
   * Configurable window in whole days, reused by two metrics:
   *   - churn/renovación (Phase 121, D-07): the "ventana de renovación" — the
   *     renewal window (no new sub within it = churneó) and the maturity gate;
   *     defaults to `RENOVATION_WINDOW_DEFAULT_DAYS`.
   *   - trial funnel (Phase 123, D-123-12): the attribution window — `compró` =
   *     the lead's first paid sub within `[sessionDate, sessionDate + window)`;
   *     defaults to `TRIAL_ATTRIBUTION_WINDOW_DEFAULT_DAYS`. A cohort period
   *     whose window has not fully elapsed is flagged provisional.
   * Ignored by metrics that don't support it.
   */
  window?: number;
  /**
   * Turno (shift) INPUT filter (Phase 132 D-10), supported ONLY by the metrics
   * that carry a class schedule (trial funnel; frequency in plan 132-02). Restricts
   * the cohort to bookings whose schedule `startTime` classifies to this turno via
   * `classifyTurno` (mañana = [07,10), tarde = [17,20)). `"otro"` is NOT a
   * selectable input value (the schema enum is ["manana","tarde"]) — it only exists
   * as a breakdown bucket. Ignored by per-subscription metrics with no schedule.
   */
  turno?: TrialTurno;
}
