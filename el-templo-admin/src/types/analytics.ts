/**
 * Analytics frontend types.
 * Mirror the API response shapes from el-templo-api/src/modules/analytics/types.ts.
 */

import type { MemberSegment } from 'src/types/member';

// -- Trend ---------------------------------------------------------------

export interface TrendInfo {
  direction: 'up' | 'down' | 'flat';
  percentage: number;
}

// -- KPI Stats -----------------------------------------------------------

/**
 * Monetary value broken down per currency (Phase 117 D-05 / D-17). Currencies
 * are NEVER summed across — ARS and EUR are always reported separately, each
 * with its own trend vs the prior period.
 */
export interface MonetaryKpiByCurrency {
  ARS: { value: number; trend: TrendInfo };
  EUR: { value: number; trend: TrendInfo };
}

export interface KpiStats {
  activeMembers: { value: number; trend: TrendInfo };
  /**
   * Monthly revenue per currency (D-05). Replaces the former single
   * `{ value, trend }` that silently summed ARS+EUR in the owner view.
   */
  monthlyRevenue: MonetaryKpiByCurrency;
  dailyAttendanceAvg: { value: number; trend: TrendInfo };
}

// -- Member Analytics ----------------------------------------------------

/**
 * A member on the renewals/expirations worklist (Phase 117 D-14/D-16).
 *
 * `type`:
 *   - `expiring`: ACTIVE subscription ending within the next 7 days;
 *     `daysUntilExpiry` >= 0, `daysOverdue` null.
 *   - `overdue`: subscription whose `end_date` is 1..30 days in the past AND
 *     the member is NOT active (did not renew). `daysOverdue` is the real
 *     CURDATE()-end_date count (buckets 1-7 / 8-14 / 15-30 are a frontend
 *     classification); `daysUntilExpiry` null.
 *
 * `yaPago` (D-16): a recent non-voided plan_charge inflow exists.
 * `segment` (D-16/D-17): engagement segment for prioritization (NULL unknown).
 */
export interface AttentionMember {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  planName: string;
  phone: string | null;
  type: 'expiring' | 'overdue';
  daysUntilExpiry: number | null;
  daysOverdue: number | null;
  /** Recent non-voided plan_charge inflow exists (D-16). */
  yaPago: boolean;
  /** Engagement segment for prioritization (D-16/D-17); NULL when unknown. */
  segment: MemberSegment | null;
}

/**
 * Operational renewal rate (Phase 117 D-15). For each window N (7/14/30 days),
 * of the members whose subscription ended within the last N days, the
 * percentage (0..100) that renewed.
 */
export interface RenewalRate {
  last7: number;
  last14: number;
  last30: number;
}

/**
 * Plan distribution row (Phase 117 D-07). Grouped by (name, country) so
 * "Flex (AR)" and "Flex (ES)" stay separate. Archived plans excluded.
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
  dayOfWeek: number; // 1=Mon .. 6=Sat (ISO)
  hour: number; // 6-22
  averageOccupancy: number; // 0-100
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
 * 7 / 14 / 30 days (D-11).
 */
export interface UniqueMembersMetric {
  last7: number;
  last14: number;
  last30: number;
}

/**
 * Per-branch check-in adoption (D-13 Parte B). `ratio` is `conCheckin /
 * confirmados` in the 0..1 range. The <50% warning is frontend logic. A branch
 * with `confirmados > 0` and `conCheckin = 0` reports `ratio = 0` (never NaN).
 * Branches with 0 confirmed bookings in scope do not appear.
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
 * Active-member counts per attendance band (Phase 136 D-01). The 4 bands are the
 * canonical `MemberSegment` values — analytics only AGGREGATES
 * `member_profiles.segment` for active members. Every key defaults to 0.
 * `sinSegmento` is the bucket for active members with no computed segment.
 */
export interface SegmentCounts {
  optima: number;
  regular: number;
  alerta: number;
  ausente: number;
  /** Active members with no computed segment (member_profiles.segment IS NULL). */
  sinSegmento: number;
}

/**
 * A member on the engagement worklist (Phase 117 D-12 / D-17, Phase 136 D-01).
 * Same nominal shape as `AttentionMember`, carries `phone` for the WhatsApp
 * deep-link. Only `alerta` and `ausente` active members appear.
 */
export interface EngagementMember {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  planName: string | null;
  phone: string | null;
  segment: 'alerta' | 'ausente';
}

/**
 * GET /admin/analytics/engagement response (Phase 117 D-12, Phase 136 D-01):
 * per-band active counts + the alerta/ausente nominal worklist.
 */
export interface EngagementAnalytics {
  counts: SegmentCounts;
  nominalList: EngagementMember[];
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
   * and EUR totals so the owner view never sums them.
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
  /** Snapshot of debt at "now" (NOT period-scoped). Same source as Reportes/Deudas. */
  outstandingByCurrency: OutstandingByCurrency;
}

// -- Funnel (Phase 118 D-01/D-03) ----------------------------------------

/**
 * A single conversion-funnel cohort (Phase 118 D-03). `cohortMonth` is the
 * month (`YYYY-MM`) of `users.created_at`. `size` is the cohort size in scope.
 * `toPruebaPct` / `toActivoPct` are 0..100 percentages. Median fields are whole
 * days, computed ONLY over the users who reached that stage, and are `null`
 * (never NaN) when no user reached it (T-118-12).
 *
 * CAVEAT (D-01): precise `prueba`/`activo` transitions are forward-only since
 * 2026-05-26; older cohorts are approximated (the `activo` stage falls back to
 * `MIN(subscriptions.created_at)`). The FunnelTab surfaces a permanent ramp-up
 * caveat banner.
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
 * Funnel entry-origin segment (funnel follow-up). Attributes conversions by the
 * path the trial came from:
 *   - `all`: classic 3-stage cohort funnel freemium → prueba → activo.
 *   - `directo`: trials created directly as prueba (Meta ads / WhatsApp / walk-in).
 *   - `freemium`: trials that converted from a freemium account.
 * `directo`/`freemium` read as a 2-stage prueba → activo funnel.
 */
export type FunnelEntryOrigin = 'all' | 'directo' | 'freemium';

/**
 * GET /admin/analytics/funnel response (Phase 118 D-01/D-03). `cohorts` is
 * sorted ascending by `cohortMonth`. `entryOrigin` echoes the requested segment
 * so the chart renders the right shape (3-stage for `all`, 2-stage otherwise).
 */
export interface FunnelAnalytics {
  cohorts: FunnelCohort[];
  entryOrigin: FunnelEntryOrigin;
}

// -- Retención por ciclos (Phase 118 D-04/D-05/D-06) ---------------------

/**
 * A plan offered as a retention filter option (follow-up). The retention curve
 * is filterable by a single concrete plan (`planId`); the selector is built from
 * `availablePlans` and shows the duration in parentheses. `durationDays` may be
 * null for legacy plans with no duration set.
 */
export interface RetentionPlanOption {
  id: number;
  name: string;
  durationDays: number | null;
}

/**
 * A single retention cohort (Phase 118 D-06). `cohort` is the month (`YYYY-MM`)
 * of the member's FIRST active subscription. `cycleRetention[i]` is the
 * percentage (0..100) of the cohort that reached AT LEAST cycle `i+1`
 * (`cycleRetention[0]` is always 100). A consecutive cycle counts iff
 * `next.startDate − prev.endDate ≤ 30` days (D-04); a larger gap ENDS the
 * streak (D-05).
 */
export interface RetentionCohort {
  cohort: string; // YYYY-MM
  size: number;
  /** % reaching at least cycle N, index 0 = cycle 1 (always 100). */
  cycleRetention: number[];
}

/**
 * Distribution of completed consecutive cycles among CURRENTLY ACTIVE members
 * (Phase 118 D-06). "Active" is the canonical `activeMemberExists` predicate.
 */
export interface CycleDistribution {
  ciclo1: number;
  ciclo2: number;
  ciclo3plus: number;
}

/**
 * GET /admin/analytics/retention response (Phase 118 D-06). `cohorts` is sorted
 * ascending by `cohort` month. `maxCycle` is the longest cycle index present
 * across cohorts (drives the X-axis length). `invalidWindowSubs` counts subs
 * skipped for defensive reasons (null start/end or end<start) so the frontend
 * can surface a caveat. `availablePlans` lists the distinct plans present in the
 * current scope — the plan filter options are built from it.
 */
export interface RetentionAnalytics {
  cohorts: RetentionCohort[];
  maxCycle: number;
  cycleDistribution: CycleDistribution;
  invalidWindowSubs: number;
  availablePlans: RetentionPlanOption[];
}

// -- Finanzas avanzadas: Caja vs Devengado + ARPU (Phase 118 D-07/D-08) ---

/**
 * A single month point split per currency (ARS/EUR NEVER summed).
 */
export interface AdvancedFinancePoint {
  month: string; // YYYY-MM
  ARS: number;
  EUR: number;
}

/**
 * GET /admin/analytics/advanced-finance response (Phase 118 D-07/D-08). All
 * three series are split per currency and sorted ascending by `month`.
 *
 *   - `cashTrend` (CAJA): canonical cash-basis revenue per month.
 *   - `accruedTrend` (DEVENGADO): `price_paid` prorated over each sub's
 *     effective window and distributed across the months it touches.
 *   - `arpu`: `accruedTrend[month] ÷ activos` per currency (activeMemberExists
 *     denominator; 0 activos → ARPU 0).
 *
 * `excludedInvalidWindow` counts subscriptions skipped from the accrual because
 * their window was invalid (null start/end, end<start, or zero-day) so the
 * frontend can surface a caveat — these never divided by zero.
 */
export interface AdvancedFinanceAnalytics {
  cashTrend: AdvancedFinancePoint[];
  accruedTrend: AdvancedFinancePoint[];
  arpu: AdvancedFinancePoint[];
  excludedInvalidWindow: number;
}

// -- Shared metric envelope (Phase 120-123) ------------------------------

/**
 * The uniform envelope for a count-of-a-population metric, mirrored from the
 * backend `MetricShape` (el-templo-api/src/modules/analytics/metric-shape.ts).
 * Every field is always present (defaulted to 0) so the wire shape is stable.
 *   - `nominal`:    the raw count being reported.
 *   - `percentage`: `nominal / n` as an integer percentage; `0` when `n === 0`.
 *   - `n`:          the sample size / denominator. Always reported.
 */
export interface MetricShape {
  nominal: number;
  percentage: number;
  n: number;
}

// -- Ticket promedio (Phase 120 Block 6 — D-01) --------------------------

/**
 * The average of a single cohort of charges plus its sample size. `average` is
 * `null` when the cohort is empty (`n === 0`) so the wire shape never carries NaN.
 */
export interface TicketCohortAverage {
  average: number | null;
  n: number;
}

/**
 * The list-price vs discounted/customized split of a ticket figure so discounts
 * do not distort the headline. `$0` charges belong to NEITHER cohort (surfaced
 * separately via `zeroCount`/`zeroPct`).
 */
export interface TicketCohortSplit {
  listPrice: TicketCohortAverage;
  discounted: TicketCohortAverage;
}

/**
 * Per-plan ticket row (grouped by `(name, country)`). Every figure is for ONE
 * currency — the per-currency block owns the array.
 */
export interface TicketPlanRow {
  planName: string;
  country: string;
  durationTier: 'monthly' | 'long_term' | null;
  ticket: MetricShape;
  discountMean: number | null;
  discountMedian: number | null;
  zeroCount: number;
  zeroPct: number;
  cohorts: TicketCohortSplit;
}

/** Per-branch ticket row (one currency). */
export interface TicketBranchRow {
  branchName: string;
  ticket: MetricShape;
  discountMean: number | null;
  discountMedian: number | null;
}

/** Per-duration-tier ticket row (one currency). One-off plans excluded. */
export interface TicketDurationRow {
  durationTier: 'monthly' | 'long_term';
  ticket: MetricShape;
}

/**
 * The complete ticket payload for ONE currency. ARS and EUR are NEVER summed —
 * each currency owns its own block (TICKET-04).
 */
export interface TicketCurrencyBlock {
  global: MetricShape;
  globalCohorts: TicketCohortSplit;
  zeroCount: number;
  zeroPct: number;
  discountMean: number | null;
  discountMedian: number | null;
  perPlan: TicketPlanRow[];
  byBranch: TicketBranchRow[];
  byDuration: TicketDurationRow[];
}

/**
 * GET /admin/analytics/ticket response (Phase 120 Block 6). Per-currency
 * volume-weighted ticket from `subscriptions.price_paid`, the `$0` charge
 * count/%, mean+median discount, and the list-price vs discounted cohort split.
 *   - `historicalFallbackCount`: charges that fell back to the plan's current
 *     `priceRegular` (the list price was never stored).
 *   - `excludedNoLink`: in-period charges with no subscription link, excluded.
 */
export interface TicketAnalytics {
  byCurrency: {
    ARS: TicketCurrencyBlock;
    EUR: TicketCurrencyBlock;
  };
  historicalFallbackCount: number;
  excludedNoLink: number;
}

// -- Churn + Renovación (Phase 121 — D-02 / D-03) ------------------------

/**
 * The breakdown axis a churn/renovación segment row is grouped by. ADDITIVE
 * grouping keys, NEVER access filters.
 */
export type ChurnRenewalAxis = 'branch' | 'country' | 'duration' | 'plan';

/** One churn segment (CHURN-06): churn `{ nominal, percentage, n }` per axis value. */
export interface ChurnSegmentRow {
  axis: ChurnRenewalAxis;
  key: string;
  churn: MetricShape;
}

/** One comparative churn column at a specific window (CHURN-02). */
export interface ChurnWindowResult {
  windowDays: number;
  churn: MetricShape;
}

/**
 * One point of the monthly churn series (CHURN-05). `provisional` is `true` when
 * the cohort has NOT yet matured (value not final).
 */
export interface ChurnSeriesPoint {
  bucket: string; // YYYY-MM
  churn: MetricShape;
  provisional: boolean;
}

/**
 * GET /admin/analytics/churn response (Phase 121 Block 1). Person-based churn of
 * non-renewal over the matured expiry cohort, sharing ONE cohort definition with
 * renovación so churn% and renov% sit on the same denominator.
 */
export interface ChurnAnalytics {
  /** OFFICIAL churn at the configured window that pairs with renovación. */
  window: ChurnWindowResult;
  /** Multi-N comparative columns (default 5/10/15) — exploration view. */
  comparison: ChurnWindowResult[];
  /** Persons in the grace window excluded from the matured churn ("número vivo"). */
  enGracia: number;
  /** Monthly churn series by expiry cohort, provisional flag per point. */
  series: ChurnSeriesPoint[];
  /** Churn opened by branch / country / duration / plan. */
  breakdowns: ChurnSegmentRow[];
}

/** One renovación segment (RENOV-04): renewal `{ nominal, percentage, n }` per axis value. */
export interface RenewalSegmentRow {
  axis: ChurnRenewalAxis;
  key: string;
  renewal: MetricShape;
}

/**
 * GET /admin/analytics/renewal response (Phase 121 Block 2). `renovados ÷
 * vencidos` over the SAME matured expiry cohort as churn. `enGracia` is the
 * "número vivo" residual (renov% + churn% only sum to 100 when `enGracia === 0`).
 */
export interface RenewalAnalytics {
  windowDays: number;
  renewal: MetricShape;
  enGracia: number;
  breakdowns: RenewalSegmentRow[];
}

// -- LTV / vida del cliente (Phase 122 — D-05) ---------------------------

/**
 * The per-currency monetary LTV block for ONE currency. ARS and EUR are NEVER
 * summed. Every figure is from REAL payments. All averages are `number | null`
 * (a `null` means "no data", never NaN on the wire).
 */
export interface LtvCurrencyBlock {
  projected: number | null;
  observed: number | null;
  monthlyRealRevenue: number | null;
  n: number;
}

/** The monetary LTV surface, one block per currency (ARS / EUR never summed). */
export interface LtvMonetary {
  ARS: LtvCurrencyBlock;
  EUR: LtvCurrencyBlock;
}

/**
 * One LTV breakdown segment (LTV-05). Reuses the churn/renovación axis union.
 * Each row carries its own headline / survival median / per-currency monetary.
 */
export interface LtvSegmentRow {
  axis: ChurnRenewalAxis;
  key: string;
  lifetimeHeadlineMonths: number | null;
  survivalMedianMonths: number | null;
  monetary: LtvMonetary;
  n: number;
}

/**
 * GET /admin/analytics/ltv response (Phase 122). Exposes TWO duration numbers:
 *   - `lifetimeHeadlineMonths`: simple `1 ÷ churn_mensual` (`null` when churn 0).
 *   - `survivalMedianMonths`:   robust Kaplan-Meier survival median (`null` when
 *     the cohort is too small or survival never crosses 0.5).
 * Monetary LTV is per currency, from REAL payments only, projected vs observed.
 */
export interface LtvAnalytics {
  lifetimeHeadlineMonths: number | null;
  survivalMedianMonths: number | null;
  monetary: LtvMonetary;
  breakdowns: LtvSegmentRow[];
  /** The matured cohort size the headline / survival median were computed over. */
  n: number;
}

// -- Frecuencia de asistencia (Phase 123 Block 4 — D-04) -----------------

/**
 * The four frequency bands a member is classified into by visits/week.
 * `inactivo` (0 visits) is the actionable signal.
 */
export type FrequencyBand = 'inactivo' | 'bajo' | 'medio' | 'alto';

/** The breakdown axis a frequency segment row is grouped by. */
export type FrequencyBreakdownAxis = 'branch' | 'country' | 'duration' | 'plan';

/** One band of the frequency distribution. `count.nominal` = members in band, `count.n` = population. */
export interface FrequencyDistributionRow {
  band: FrequencyBand;
  count: MetricShape;
}

/**
 * One "enfriándose" (cooling-down) member (D-123-05): a member whose
 * current-window band rank dropped below their prior-window band rank.
 * `name` + `phone` are enriched from the `users` join (Phase 132 D-12) so the
 * list is export-ready (nombre → perfil, `tel:`, CSV) in a single call. PII —
 * only ever for members within the caller's scope; `/frequency` is ADMIN-only.
 * `pctVariacion` is informative and `null` when the prior window had 0 visits.
 */
export interface FrequencyCoolingRow {
  userId: number;
  /** Full name (`firstName + lastName`, trimmed) — Phase 132 D-12 enrichment. */
  name: string;
  /** Phone (`null` when `users.phone` is null) — Phase 132 D-12 enrichment. */
  phone: string | null;
  currentBand: FrequencyBand;
  priorBand: FrequencyBand;
  pctVariacion: number | null;
}

/** One frequency breakdown segment: the band count for one band of one axis value. */
export interface FrequencySegmentRow {
  axis: FrequencyBreakdownAxis;
  key: string;
  band: FrequencyBand;
  count: MetricShape;
}

/**
 * GET /admin/analytics/frequency response (Phase 123 Block 4). Per-member
 * visits/week over the rolling last 4 weeks, surfaced as the band distribution
 * (incl. active-0-visits → Inactivo), the cooling-down list (with name/phone),
 * the per-branch check-in adoption ratio (validity gate), and the breakdowns.
 */
export interface FrequencyAnalytics {
  distribution: FrequencyDistributionRow[];
  coolingDown: FrequencyCoolingRow[];
  checkInAdoption: CheckInAdoptionRow[];
  breakdowns: FrequencySegmentRow[];
}

// -- Trial-session Funnel (Phase 123 Block 3 — D-06) ---------------------

/**
 * A trial-session turno (shift) bucket. mañana = [07,10), tarde = [17,20),
 * everything else `"otro"`. Used as a funnel breakdown axis value AND
 * (mañana/tarde only) as the D-10 turno INPUT filter (`AnalyticsFilters.turno`).
 */
export type TrialTurno = 'manana' | 'tarde' | 'otro';

/**
 * The breakdown axis a trial-funnel segment row is grouped by. `turno` is a
 * funnel-LOCAL axis; the `plan` axis groups by the plan the lead BOUGHT.
 */
export type TrialFunnelAxis = 'branch' | 'country' | 'turno' | 'plan';

/** The three cascade counts: reservaron → asistieron → compraron. */
export interface TrialFunnelStageCounts {
  reservaron: number;
  asistieron: number;
  compraron: number;
}

/**
 * The three cascade rates (each a `{ nominal, percentage, n }` envelope):
 *   - tasaShow    = asistieron ÷ reservaron
 *   - tasaCierre  = compraron ÷ asistieron (denominator = ASISTENTES) — the star rate
 *   - puntaAPunta = compraron ÷ reservaron
 */
export interface TrialFunnelRates {
  tasaShow: MetricShape;
  tasaCierre: MetricShape;
  puntaAPunta: MetricShape;
}

/**
 * One bucket of the weekly/monthly cascade series. `provisional` is `true` when
 * the bucket's attribution window has not fully elapsed.
 */
export interface TrialFunnelSeriesRow {
  bucket: string; // %x-W%v weekly or %Y-%m monthly
  rates: TrialFunnelRates;
  counts: TrialFunnelStageCounts;
  provisional: boolean;
}

/** One breakdown segment: the cascade counts + rates for one axis value. */
export interface TrialFunnelBreakdownRow {
  axis: TrialFunnelAxis;
  key: string;
  rates: TrialFunnelRates;
  counts: TrialFunnelStageCounts;
}

/**
 * GET /admin/analytics/trial-funnel response (Phase 123 Block 3). The cascade
 * reservó → asistió → compró over the new-lead trial cohort, with the three
 * rates, the weekly+monthly provisional series, the breakdowns, and the
 * effective attribution window in whole days.
 */
export interface TrialFunnelAnalytics {
  counts: TrialFunnelStageCounts;
  rates: TrialFunnelRates;
  series: TrialFunnelSeriesRow[];
  breakdowns: TrialFunnelBreakdownRow[];
  attributionWindowDays: number;
}

// -- Filter params -------------------------------------------------------

export interface AnalyticsFilters {
  branchId?: number;
  country?: 'AR' | 'ES';
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  /**
   * Plan restriction. Exact match on the subscription's plan (Phase 132 D-10:
   * accepted as an INPUT filter by all 6 v5.0 metrics + retention). When absent,
   * no plan filter is applied.
   */
  planId?: number;
  /**
   * Turno (shift) restriction (Phase 132 D-10). Applies ONLY to the funnel
   * (`getTrialFunnel`) and frecuencia (`getFrequency`) metrics — the only ones
   * with a class schedule. `'manana'` = [07,10), `'tarde'` = [17,20). Ignored
   * (hidden in the UI) for ticket/churn/renovación/LTV (per-subscription).
   */
  turno?: 'manana' | 'tarde';
  /**
   * Maturation/comparison window in whole days (Phase 132 D-02/D-05). Serialized
   * for the metrics that accept it (churn / renewal / ltv / trial-funnel); when
   * absent each endpoint uses its configured default.
   */
  window?: number;
  /**
   * Funnel entry-origin segment (Phase 118 funnel only). When absent or `all`,
   * the classic 3-stage funnel is returned. Ignored by other metrics.
   */
  entryOrigin?: FunnelEntryOrigin;
}

// ── Class ratings ("Clases" tab) ─────────────────────────────────────────────

/** One weekly point of the class-rating trend. `period` is an ISO year-week. */
export interface ClassRatingTrendPoint {
  period: string; // e.g. "2026-W23"
  avgStars: number;
  count: number;
}

/** Per-branch class-rating average. */
export interface ClassRatingBranchRow {
  branchId: number;
  branchName: string;
  avgStars: number;
  count: number;
}

/** Per-turno (mañana/tarde, split at 12:00) class-rating average. */
export interface ClassRatingTurnoRow {
  turno: 'manana' | 'tarde';
  avgStars: number;
  count: number;
}

/** Full payload for the "Clases" analytics tab. */
export interface ClassRatingsAnalytics {
  overall: { avgStars: number | null; count: number };
  trend: ClassRatingTrendPoint[];
  byBranch: ClassRatingBranchRow[];
  byTurno: ClassRatingTurnoRow[];
}
