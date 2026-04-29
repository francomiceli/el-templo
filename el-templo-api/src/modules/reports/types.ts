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

// -- CAJA-03 — Outstanding balances (aging report) -------------------------
// Phase 109-02. Internal naming: "aging" / "outstanding-balances". UI label
// always "Deudas" (D-01, D-03 — never expose "aging" to users).
//
// Source: balances WHERE amount > 0 LEFT JOIN subscriptions LEFT JOIN
// subscription_plans LEFT JOIN branches LEFT JOIN users (D-08).
// LEFT JOIN preserves target_kind='debt_balance' rows that don't have a
// subscription.

/** D-05 buckets, computed in JS from DATEDIFF(today, effectiveDate). */
export type DebtBucket = "0-30" | "31-60" | "61-90" | "90+";

/**
 * One row of the Deudas report.
 *
 * D-04: target_kind ∈ {'subscription','debt_balance'} (matches balances enum).
 * D-05: ageInDays = max(0, DATEDIFF(today, effectiveDate)) — clamped at 0
 *   when effective_date is in the future (consistent with Phase 108 D-04).
 */
export interface OutstandingBalanceRow {
  memberId: number;
  memberName: string;
  branchId: number | null;
  branchName: string | null;
  targetKind: "subscription" | "debt_balance";
  targetId: number;
  /**
   * For subscription rows: "Mensualidad <Mes> <Año> — <PlanName>".
   * For debt_balance rows: "Saldo a regularizar".
   * Frontend renders this verbatim — never translates "aging" to UI.
   */
  conceptLabel: string;
  /** Per balances.currency (varchar(3) — 'ARS' | 'EUR'). Signed int upstream
   * but always > 0 here (WHERE amount > 0). */
  amount: number;
  currency: string;
  effectiveDate: string; // YYYY-MM-DD
  ageInDays: number;
  bucket: DebtBucket;
}

/**
 * Filter inputs for getOutstandingBalances.
 *
 * D-09 country resolution:
 *  - Non-owner: country forced to request.scope.country (always populated).
 *  - Owner without ?country: country = undefined (sees all countries).
 *  - Owner with ?country: country = that value (filters).
 */
export interface OutstandingBalancesFilters {
  branchId?: number;
  country?: "AR" | "ES";
  /** Owner-only filter. balances.currency enum values: 'ARS' | 'EUR'. */
  currency?: string;
  /** Case-insensitive partial match on member firstName/lastName. */
  search?: string;
  page?: number;
  limit?: number;
}

/** D-05 — totals aggregated across the FULL filtered set (not just current page). */
export type BucketTotals = Record<DebtBucket, number>;

/**
 * D-05 + D-06 response shape.
 *
 * bucketTotals:
 *  - Non-owner (single-currency by country scope): flat BucketTotals.
 *  - Owner (potentially multi-currency): keyed by currency code, e.g.
 *    { ARS: { '0-30': ..., '31-60': ... }, EUR: { ... } }.
 *  NEVER sum amounts across different currencies (D-06).
 */
export interface OutstandingBalancesResult {
  rows: OutstandingBalanceRow[];
  total: number;
  page: number;
  limit: number;
  bucketTotals: BucketTotals | Record<string, BucketTotals>;
}
