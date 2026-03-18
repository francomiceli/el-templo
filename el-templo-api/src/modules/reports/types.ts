/**
 * Reports Module Types
 *
 * Filter and response interfaces for access log, charge history,
 * expiring memberships, and inactive members reports.
 */

// -- Filters -----------------------------------------------------------------

export interface AccessReportFilters {
  branchId?: number;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  search?: string; // member name or DNI
  source?: "qr" | "manual";
  page?: number;
  limit?: number;
}

export interface ChargeReportFilters {
  branchId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  paymentMethod?: "cash" | "transfer" | "card";
  page?: number;
  limit?: number;
}

export interface ExpiringReportFilters {
  branchId?: number;
  daysWindow?: number; // default 7
  includeExpired?: boolean; // default true
}

export interface InactiveReportFilters {
  branchId?: number;
  daysThreshold?: number; // default 14
}

// -- Response Row Types ------------------------------------------------------

export interface AccessReportRow {
  id: number;
  checkedInAt: string;
  memberName: string;
  memberId: number;
  branchName: string;
  source: "qr" | "manual";
  scheduleSlot: string | null; // e.g. "Lun 09:00 - Calistenia" or null
}

export interface ChargeReportRow {
  id: number;
  paymentDate: string;
  memberName: string;
  memberId: number;
  planName: string;
  amount: number;
  paymentMethod: "cash" | "transfer" | "card";
  recorderName: string;
  voidedAt: string | null;
}

export interface ExpiringReportRow {
  userId: number;
  memberName: string;
  planName: string;
  endDate: string;
  daysRemaining: number; // positive = days left, negative = days overdue
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
