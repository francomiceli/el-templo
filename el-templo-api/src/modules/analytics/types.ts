/**
 * Analytics Module Types
 *
 * Response interfaces for KPI stats, member analytics,
 * attendance analytics, and financial analytics.
 */

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

export interface AttentionMember {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  planName: string;
  phone: string | null;
  type: "expiring";
  daysUntilExpiry: number | null;
  daysOverdue: number | null;
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
}
