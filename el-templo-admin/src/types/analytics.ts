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

// -- Filter params -------------------------------------------------------

export interface AnalyticsFilters {
  branchId?: number;
  country?: 'AR' | 'ES';
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
}
