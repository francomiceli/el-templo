/**
 * Analytics frontend types.
 * Mirror the API response shapes from el-templo-api/src/modules/analytics/types.ts.
 */

// -- Trend ---------------------------------------------------------------

export interface TrendInfo {
  direction: 'up' | 'down' | 'flat';
  percentage: number;
}

// -- KPI Stats -----------------------------------------------------------

export interface KpiStats {
  activeMembers: { value: number; trend: TrendInfo };
  monthlyRevenue: { value: number; trend: TrendInfo };
  dailyAttendanceAvg: { value: number; trend: TrendInfo };
}

// -- Member Analytics ----------------------------------------------------

export interface AttentionMember {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  planName: string;
  phone: string | null;
  type: 'expiring' | 'overdue';
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

// -- Financial Analytics -------------------------------------------------

export interface FinancialAnalytics {
  revenueTrend: Array<{ month: string; revenue: number }>;
  revenueByMethod: { cash: number; transfer: number; card: number };
  revenueByBranch: Array<{
    branchId: number;
    branchName: string;
    revenue: number;
  }>;
  totalOutstanding?: number;
  collectionRate?: number;
}

// -- Filter params -------------------------------------------------------

export interface AnalyticsFilters {
  branchId?: number;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
}
