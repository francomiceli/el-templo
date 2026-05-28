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
 * Active-member counts per behavioral segment (Phase 117 D-12). The 6 segments
 * are the canonical `MemberSegment` values — analytics only AGGREGATES
 * `member_profiles.segment` for active members. Every key defaults to 0.
 * `sinSegmento` is the bucket for active members with no computed segment.
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
 * shape as `AttentionMember`, carries `phone` for the WhatsApp deep-link. Only
 * `en_riesgo` and `ghost` active members appear.
 */
export interface EngagementMember {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  planName: string | null;
  phone: string | null;
  segment: 'en_riesgo' | 'ghost';
}

/**
 * GET /admin/analytics/engagement response (Phase 117 D-12): per-segment active
 * counts + the en_riesgo/ghost nominal worklist.
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

// -- Filter params -------------------------------------------------------

export interface AnalyticsFilters {
  branchId?: number;
  country?: 'AR' | 'ES';
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  /**
   * Plan restriction (retention only, follow-up). Exact match on the
   * subscription's plan. When absent, no plan filter is applied. Ignored by other
   * metrics.
   */
  planId?: number;
  /**
   * Funnel entry-origin segment (funnel follow-up, funnel only). When absent or
   * `all`, the classic 3-stage funnel is returned. Ignored by other metrics.
   */
  entryOrigin?: FunnelEntryOrigin;
}
