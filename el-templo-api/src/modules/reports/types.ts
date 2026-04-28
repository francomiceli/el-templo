/**
 * Reports Module Types
 *
 * Filter and response interfaces for access log, charge history,
 * expiring memberships, and inactive members reports.
 */

// -- Filters -----------------------------------------------------------------

export interface AccessReportFilters {
  branchId?: number;
  country?: "AR" | "ES";
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  search?: string; // member name or DNI
  source?: "qr" | "manual";
  page?: number;
  limit?: number;
}

export interface ChargeReportFilters {
  branchId?: number;
  country?: "AR" | "ES";
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  paymentMethod?: "cash" | "transfer" | "card";
  page?: number;
  limit?: number;
}

export interface ExpiringReportFilters {
  branchId?: number;
  country?: "AR" | "ES";
  daysWindow?: number; // default 7
  includeExpired?: boolean; // default true
}

export interface InactiveReportFilters {
  branchId?: number;
  country?: "AR" | "ES";
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
  currency: string; // "ARS" | "EUR" — REQ-98-10 / D-13
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
  currency: string; // "ARS" | "EUR" — REQ-98-10 / D-13 (from subscriptions.currency)
}

export interface InactiveReportRow {
  userId: number;
  memberName: string;
  planName: string;
  lastCheckIn: string | null;
  daysSinceCheckIn: number;
  phone: string | null;
}

// -- Trial Conversion (Phase 102-07) ----------------------------------------

export interface TrialConversionFilters {
  country?: "AR" | "ES";
  dateFrom?: string; // YYYY-MM-DD — filters on trial.booking_date
  dateTo?: string;
  branchId?: number; // optional single-branch scope
}

export interface TrialConversionTotals {
  trialsCount: number;
  convertedCount: number;
  conversionRatePct: number;
  medianDaysToConvert: number | null;
  revenueFromConverted: number; // raw number, currency inferred from context
  revenuePerTrial: number;
}

export interface TrialConversionBranchRow {
  branchId: number;
  branchName: string;
  trialsCount: number;
  convertedCount: number;
  conversionRatePct: number;
}

export interface TrialConversionHourRow {
  hour: string; // "HH:00"
  trialsCount: number;
  convertedCount: number;
  conversionRatePct: number;
}

export interface TrialConversionShiftRow {
  shift: "TM" | "TT";
  trialsCount: number;
  convertedCount: number;
  conversionRatePct: number;
}

export interface TrialConversionPendingLead {
  userId: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  branchId: number;
  branchName: string;
  trialDate: string; // YYYY-MM-DD (first trial)
  daysSinceTrial: number;
}

export interface TrialConversionReport {
  totals: TrialConversionTotals;
  byBranch: TrialConversionBranchRow[];
  byHourSlot: TrialConversionHourRow[];
  byShift: TrialConversionShiftRow[];
  pendingLeads: TrialConversionPendingLead[];
}

// -- Paginated Result --------------------------------------------------------
// Re-exported from shared so finance/ and other modules can consume it
// without depending on reports/. Phase 106 relocation.
export { type PaginatedResult } from "../shared/types";
