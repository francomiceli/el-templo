/**
 * Analytics Module Types
 *
 * Response interfaces for KPI stats, member analytics,
 * attendance analytics, and financial analytics.
 */

// Reuse the canonical segment union (segmentation module) — analytics NEVER
// redefines segments (D-12).
import type { MemberSegment } from "../segmentation/types";

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
 * Plan-category filter for the retention curve (Phase 118 D-06). `todas` means
 * no plan-category restriction. The four concrete values mirror the
 * `plan_category` enum (`subscription-plans.ts`).
 */
export type RetentionPlanCategory =
  | "presencial"
  | "online_regular"
  | "online_goal"
  | "online_coach"
  | "todas";

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
 * can surface a caveat.
 */
export interface RetentionAnalytics {
  cohorts: RetentionCohort[];
  maxCycle: number;
  cycleDistribution: CycleDistribution;
  invalidWindowSubs: number;
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
   * Plan-category restriction (Phase 118 D-06, retention only). When absent or
   * `todas`, no plan-category filter is applied. Ignored by metrics that do not
   * support it.
   */
  planCategory?: RetentionPlanCategory;
}
