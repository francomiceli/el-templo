/**
 * Report types for the admin app.
 * Mirrors the API response shapes from el-templo-api/src/modules/reports/types.ts.
 */

import type { LegacyPaymentMethod } from './transaction';
import type { LeadStage } from './member';

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

// -- Fase 194 (D-19 / D-18): Reportes ▸ Invitaciones --------------------------
// Espejo de GET /admin/referrals/invitations/report y GET /admin/referrals/invitations
// (194-20). Los montos vienen separados por moneda: nunca se suman ARS + EUR.

export interface InvitationReportMonth {
  /** 'YYYY-MM' (mes de cohorte, tz de la sede del invitador). */
  month: string;
  activated: number;
  converted: number;
  /** converted / activated (0 si no hubo), 4 decimales. */
  conversionRate: number;
}

export interface InvitationReportDiscount {
  month: string;
  /** 'ARS' | 'EUR' */
  currency: string;
  amount: number;
  credits: number;
}

export interface InvitationReport {
  from: string;
  to: string;
  months: InvitationReportMonth[];
  totals: { activated: number; converted: number; conversionRate: number };
  /** Invitados distintos con invitación activa y membresía vigente hoy (no acotado al rango). */
  activeInvitees: number;
  discounts: InvitationReportDiscount[];
}

export interface InvitationReportParams {
  from?: string;
  to?: string;
}

export interface InvitationLeadRow {
  invitationId: number;
  invitee: { userId: number; firstName: string; lastName: string; phone: string | null };
  inviter: { userId: number; name: string };
  /** ISO 8601 */
  activatedAt: string;
  accessesUsed: number | null;
  accessesBudget: number | null;
  /** 'YYYY-MM-DD' */
  accessExpiresOn: string;
  branchId: number;
  branchName: string;
  branchesTrained: string[];
  stage: LeadStage;
  leadStatus: 'en_seguimiento' | 'ganado' | 'perdido' | null;
  channel: 'self_service' | 'assisted';
}

export interface InvitationLeadListParams {
  stage?: LeadStage;
  branchId?: number;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface InvitationLeadList {
  rows: InvitationLeadRow[];
  total: number;
  page: number;
  pageSize: number;
}
