/**
 * Report types for the admin app.
 * Mirrors the API response shapes from el-templo-api/src/modules/reports/types.ts.
 */

// -- Response Row Types ------------------------------------------------------

export interface AccessReportRow {
  id: number;
  checkedInAt: string;
  memberName: string;
  memberId: number;
  branchName: string;
  source: 'qr' | 'manual';
  scheduleSlot: string | null;
}

export interface ChargeReportRow {
  id: number;
  paymentDate: string;
  memberName: string;
  memberId: number;
  planName: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer' | 'card';
  recorderName: string;
  voidedAt: string | null;
}

export interface ExpiringReportRow {
  userId: number;
  memberName: string;
  planName: string;
  endDate: string;
  daysRemaining: number;
  phone: string | null;
}

export interface InactiveReportRow {
  userId: number;
  memberName: string;
  planName: string;
  lastCheckIn: string | null;
  daysSinceCheckIn: number;
  phone: string | null;
}

// -- Paginated Result --------------------------------------------------------

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}

// -- Filter Param Interfaces -------------------------------------------------

export interface AccessReportParams {
  branchId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  source?: 'qr' | 'manual';
  page?: number;
  limit?: number;
}

export interface ChargeReportParams {
  branchId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  paymentMethod?: 'cash' | 'transfer' | 'card';
  page?: number;
  limit?: number;
}

export interface ExpiringReportParams {
  branchId?: number;
  daysWindow?: number;
  includeExpired?: boolean;
}

export interface InactiveReportParams {
  branchId?: number;
  daysThreshold?: number;
}
