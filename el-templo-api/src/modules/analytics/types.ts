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

export interface KpiStats {
  activeMembers: { value: number; trend: Trend };
  monthlyRevenue: { value: number; trend: Trend };
  dailyAttendanceAvg: { value: number; trend: Trend };
  morososCount: { value: number; trend: Trend };
}

// -- Member Analytics ----------------------------------------------------

export interface AttentionMember {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  planName: string;
  phone: string | null;
  type: "expiring" | "overdue";
  daysUntilExpiry: number | null;
  daysOverdue: number | null;
}

export interface MemberAnalytics {
  newMembers: number;
  churnedMembers: number;
  retentionRate: number;
  planDistribution: Array<{ planName: string; count: number }>;
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

// -- Financial Analytics -------------------------------------------------

export interface FinancialAnalytics {
  revenueTrend: Array<{ month: string; revenue: number }>;
  revenueByMethod: { cash: number; transfer: number; card: number };
  revenueByBranch: Array<{
    branchId: number;
    branchName: string;
    revenue: number;
  }>;
  totalOutstanding: number;
  collectionRate: number;
}

// -- Filters -------------------------------------------------------------

export interface AnalyticsFilters {
  branchId?: number;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
}
