/**
 * Transaction types for the admin app (Phase 106).
 * Mirrors the API response shapes from el-templo-api/src/modules/finance/types.ts.
 * Replaces src/types/payment.ts (deleted in this phase).
 */

// -- Enum union types -------------------------------------------------------

export type TransactionKind =
  | 'plan_charge'
  | 'debt_settlement'
  | 'refund'
  | 'adjustment'
  | 'advance_payment';

export type TransactionDirection = 'inflow' | 'outflow';

/**
 * Widened from legacy 3-key shape to match Phase 105 schema (5 keys).
 * UI dropdowns in Phase 106 still expose 3 options (cash/transfer/card)
 * per PATTERNS.md decision 4 — full UI widening is Phase 109.
 */
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'aura_credit' | 'internal';

/**
 * Legacy 3-key subset preserved for callsites that still bind to the
 * narrow contract (charges report `ChargeReportParams.paymentMethod`,
 * assign-plan + renewal selectors). When Phase 109 widens the reports
 * pipeline this can be removed and call-sites switched to PaymentMethod.
 */
export type LegacyPaymentMethod = 'cash' | 'transfer' | 'card';

export type TargetKind = 'subscription' | 'debt_balance' | 'transaction';

// -- Label / color / option maps -------------------------------------------

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  aura_credit: 'AURA',
  internal: 'Interno',
};

export const PAYMENT_METHOD_COLORS: Record<PaymentMethod, string> = {
  cash: 'green',
  transfer: 'blue',
  card: 'purple',
  aura_credit: 'amber',
  internal: 'grey',
};

/**
 * Filter / selector dropdown options (3-option subset for Phase 106).
 *
 * Phase 106 keeps the 3-option dropdown (cash/transfer/card) for
 * backward compatibility with CajaPage filter, AssignPlanDialog, and
 * MemberSubscriptionTab renewal — see PATTERNS.md decision 4.
 *
 * Phase 109 (CajaPage v2) will widen this to all 5 options.
 */
export const PAYMENT_METHOD_FILTER_OPTIONS: Array<{
  label: string;
  value: PaymentMethod;
}> = [
  { label: 'Efectivo', value: 'cash' },
  { label: 'Transferencia', value: 'transfer' },
  { label: 'Tarjeta', value: 'card' },
];

/**
 * Backward-compatible alias for callsites that previously imported
 * `PAYMENT_METHOD_OPTIONS` from `src/types/payment` (assign-plan dialog,
 * subscription renewal, charges report filter). Same 3-option subset as
 * PAYMENT_METHOD_FILTER_OPTIONS — kept under the legacy name to avoid
 * a Phase 106 rename churn across unrelated callsites.
 */
export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHOD_FILTER_OPTIONS;

// -- Row + list shapes -----------------------------------------------------

export interface TransactionLinkSummary {
  targetKind: TargetKind;
  targetId: number;
  allocatedAmount: number;
}

export interface TransactionListItem {
  id: number;
  transactionDate: string; // YYYY-MM-DD
  effectiveDate: string;
  memberId: number;
  memberName: string;
  kind: TransactionKind;
  direction: TransactionDirection;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  branchId: number;
  branchName: string;
  recordedBy: number;
  recorderName: string;
  voidedAt: string | null;
  notes: string | null;
  linkSummary: TransactionLinkSummary[];
}

export interface TransactionListParams {
  branchId?: number;
  country?: 'AR' | 'ES';
  kind?: TransactionKind;
  paymentMethod?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  memberId?: number;
  page: number;
  limit: number;
}

// -- Summary (D-16 — preserves legacy CajaPage shape, widened to 5 keys) ---

export interface FinanceSummary {
  monthlyRevenue: number;
  revenueByMethod: {
    cash: number;
    transfer: number;
    card: number;
    aura_credit: number;
    internal: number;
  };
  revenueByBranch: Array<{
    branchId: number;
    branchName: string;
    revenue: number;
  }>;
}

export interface FinanceSummaryParams {
  branchId?: number;
  country?: 'AR' | 'ES';
  dateFrom?: string;
  dateTo?: string;
}

// -- Void --------------------------------------------------------------

export interface VoidTransactionInput {
  reason: string;
}
