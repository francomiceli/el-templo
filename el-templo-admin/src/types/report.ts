/**
 * Report types for the admin app.
 * Mirrors the API response shapes from el-templo-api/src/modules/reports/types.ts.
 */

import type { LegacyPaymentMethod } from './transaction';

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
  currency?: string;
  paymentMethod: LegacyPaymentMethod;
  recorderName: string;
  voidedAt: string | null;
}

export interface ExpiringReportRow {
  userId: number;
  memberName: string;
  branchId?: number;
  branchName?: string;
  planName: string;
  endDate: string;
  daysRemaining: number;
  phone: string | null;
  currency?: string;
  // true when the member already has future coverage of the same category
  // (already renewed). Only relevant when includeRenewed is set.
  hasFutureCoverage?: boolean;
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
  country?: 'AR' | 'ES';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  source?: 'qr' | 'manual';
  page?: number;
  limit?: number;
}

export interface ChargeReportParams {
  branchId?: number;
  country?: 'AR' | 'ES';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  paymentMethod?: LegacyPaymentMethod;
  page?: number;
  limit?: number;
}

export interface ExpiringReportParams {
  branchId?: number;
  country?: 'AR' | 'ES';
  // Expiration date range (YYYY-MM-DD). When both are set the server lists
  // subscriptions whose end_date falls within [dateFrom, dateTo].
  dateFrom?: string;
  dateTo?: string;
  // Legacy window mode (kept for back-compat): end_date <= today + daysWindow.
  // The admin now always sends dateFrom/dateTo instead.
  daysWindow?: number;
  includeExpired?: boolean;
  // default false — include members who already renewed (future same-category
  // coverage). When true, those rows return with hasFutureCoverage = true.
  includeRenewed?: boolean;
}

export interface InactiveReportParams {
  branchId?: number;
  country?: 'AR' | 'ES';
  daysThreshold?: number;
}

// Phase 102-07: Trial Conversion report.

export interface TrialConversionParams {
  branchId?: number;
  country?: 'AR' | 'ES';
  dateFrom?: string;
  dateTo?: string;
}

export interface TrialConversionTotals {
  trialsCount: number;
  convertedCount: number;
  conversionRatePct: number;
  medianDaysToConvert: number | null;
  revenueFromConverted: number;
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
  hour: string;
  trialsCount: number;
  convertedCount: number;
  conversionRatePct: number;
}

export interface TrialConversionShiftRow {
  shift: 'TM' | 'TT';
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
  trialDate: string;
  daysSinceTrial: number;
}

export interface TrialConversionReport {
  totals: TrialConversionTotals;
  byBranch: TrialConversionBranchRow[];
  byHourSlot: TrialConversionHourRow[];
  byShift: TrialConversionShiftRow[];
  pendingLeads: TrialConversionPendingLead[];
}
