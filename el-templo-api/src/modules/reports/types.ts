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
  // Expiration date range (YYYY-MM-DD). When BOTH are present the query lists
  // subscriptions whose end_date is within [dateFrom, dateTo] and daysWindow/
  // includeExpired are ignored. This is the path the admin now uses.
  dateFrom?: string;
  dateTo?: string;
  daysWindow?: number; // default 7 — legacy window mode (no date range given)
  includeExpired?: boolean; // default true — legacy window mode only
  // default false — hide members who already have future coverage of the same
  // category (already renewed). Set true to include them (flagged via the
  // hasFutureCoverage row field).
  includeRenewed?: boolean;
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
  branchId: number;
  branchName: string;
  planName: string;
  endDate: string;
  daysRemaining: number; // positive = days left, negative = days overdue
  phone: string | null;
  currency: string; // "ARS" | "EUR" — REQ-98-10 / D-13 (from subscriptions.currency)
  // true when the member already has future coverage of the same category
  // (an active/paused/scheduled subscription ending after this one). Such rows
  // are hidden unless includeRenewed is set.
  hasFutureCoverage: boolean;
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

// -- Trial Sessions Report (Phase 114-05) ------------------------------------
//
// One row per LEAD (user), not per booking. The report is driven by the
// latest non-cancelado trial booking per user (D-03 / D-42 / D-43).
// Leads with only cancelado trials are excluded entirely.

export type AttendedFilter = "true" | "false" | "pending";
export type ShiftFilter = "TM" | "TT";
export type LeadStatusValue = "en_seguimiento" | "cerrado" | "perdido";

export interface TrialSessionsFilters {
  branchId?: number;
  country?: "AR" | "ES";
  /** ISO YYYY-MM-DD on bookings.booking_date of the latest non-cancelled trial. */
  dateFrom?: string;
  dateTo?: string;
  /** Multi-value: ?leadStatus=cerrado&leadStatus=perdido. */
  leadStatus?: LeadStatusValue[];
  attended?: AttendedFilter;
  shift?: ShiftFilter;
  /**
   * Owner-only filter (D-44). The route layer silently strips this when
   * request.user.role !== 'owner' (with a request.log.warn) — the service
   * trusts the shape it receives.
   */
  gestionaUserId?: number;
  /**
   * Includes only NON-converted leads where
   * DATEDIFF(CURDATE(), bookings.booking_date) >= N for the chosen
   * representative trial booking (D-40).
   */
  daysWithoutConvertingMin?: number;
  /** Token-based name search; reuses buildMemberNameSearchCondition pattern. */
  search?: string;
  page?: number;
  limit?: number;
}

export interface TrialSessionsRow {
  /** id of the latest non-cancelado trial booking for this user (D-42). */
  bookingId: number;
  userId: number;
  /** firstName + lastName trimmed (D-04). */
  lead: string;
  /** YYYY-MM-DD — API exposes ISO; UI renders DD/MM/YYYY (D-05). */
  bookingDate: string;
  /** YYYY-MM-DD — when the trial booking (SP) was created (bookings.booked_at). */
  bookingCreatedAt: string;
  /** HH:MM (D-06). */
  startTime: string;
  branchId: number;
  branchName: string;
  /**
   * D-08: 'si' when an attendance row exists for the chosen booking;
   * 'no' when the booking_date is in the past with no attendance; null
   * when the booking_date is today or future (session hasn't happened yet).
   */
  attended: "si" | "no" | null;
  leadStatus: LeadStatusValue | null;
  /** D-09: leadStatus ?? (convertedAt ? 'cerrado' : 'en_seguimiento'). */
  leadStatusEffective: LeadStatusValue;
  /** Null when the lead was self-registered or pre-dates Plan 02 (D-10/D-20). */
  createdBy: { userId: number; name: string } | null;
  leadNotes: string | null;
  /** D-12: 'TM' when startTime < '12:00', else 'TT'. */
  shift: ShiftFilter;
  /** D-13: bookingDate.slice(0,7) — 'YYYY-MM'. */
  period: string;
  /** D-14: ISO Mon-Sun range — 'YYYY-MM-DD --- YYYY-MM-DD'. */
  weekRange: string;
  /** Math.floor((today - bookingDate) / 1day). Negative when booking is in the future. */
  daysSinceTrial: number;
  /** users.converted_at IS NOT NULL. */
  converted: boolean;
}

export interface TrialSessionsReport {
  rows: TrialSessionsRow[];
  total: number;
  page: number;
  limit: number;
}

// -- CAJA-03 — Outstanding balances (aging report) -------------------------
// Phase 109-02. Internal naming: "aging" / "outstanding-balances". UI label
// always "Deudas" (D-01, D-03 — never expose "aging" to users).
//
// Source: balances WHERE amount > 0 LEFT JOIN subscriptions LEFT JOIN
// subscription_plans LEFT JOIN branches LEFT JOIN users (D-08).
// LEFT JOIN preserves target_kind='debt_balance' rows that don't have a
// subscription.

/** D-05 buckets, computed in JS from DATEDIFF(today, effectiveDate). */
export type DebtBucket = "0-5" | "6-10" | "11-15" | "15+";

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
  memberPhone: string | null;
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
  /**
   * Phase 153 (DEUDA-02): short structured motivo derived from the debt origin.
   * - subscription rows: "Cuota <PlanName>" (fallback "Cuota" when planName null).
   * - debt_balance (cobro suelto) with an advance_payment origin: "Sin plan"
   *   (miscReason 'sin_plan') / "Otro" (miscReason 'otro').
   * - orphaned debt_balance (no resolvable origin): "Saldo a regularizar".
   * Derived from existing data (no migration) — see deriveOutstandingRowFields.
   */
  reasonLabel: string;
  /**
   * Phase 153 (DEUDA-03): cycle period of the plan for subscription debts,
   * ISO YYYY-MM-DD. null for debt_balance rows (no subscription cycle).
   */
  periodStart: string | null;
  periodEnd: string | null;
  /**
   * Phase 153 (DEUDA-01): date the debt was registered in the system =
   * balances.createdAt (date portion, ISO YYYY-MM-DD). Distinct from
   * effectiveDate (the cycle/devengo date used for aging).
   */
  registeredAt: string;
  /**
   * Phase 153 (D-11): free-text note of the origin transaction, shown in a
   * tooltip on the "Por deuda" tab. Only populated for debt_balance rows with
   * an advance_payment origin; null otherwise.
   */
  notes: string | null;
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
 *    { ARS: { '0-5': ..., '6-10': ... }, EUR: { ... } }.
 *  NEVER sum amounts across different currencies (D-06).
 */
export interface OutstandingBalancesResult {
  rows: OutstandingBalanceRow[];
  total: number;
  page: number;
  limit: number;
  bucketTotals: BucketTotals | Record<string, BucketTotals>;
}
