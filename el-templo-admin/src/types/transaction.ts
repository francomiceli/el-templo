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
  /**
   * Phase 109 D-11 — additive segmentation by transaction kind. Same
   * inflow + non-voided + filter semantics as monthlyRevenue. All 5
   * keys always present (defaults 0). `refund` always 0 by design
   * (refund is outflow-only per balance-service.ts:76-77).
   */
  revenueByKind: Record<TransactionKind, number>;
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

// -- Phase 108: Outstanding concepts (D-01) --------------------------------

/**
 * Phase 108 — Concepto pendiente con saldo abierto.
 * Mirror del backend (`api/src/modules/finance/types.ts` OutstandingConcept,
 * to be added by Plan 01). Source: GET /admin/members/:memberId/outstanding-concepts.
 */
export interface OutstandingConcept {
  /** 'subscription' | 'debt_balance' — same union as BalanceTargetKind in backend. */
  targetKind: 'subscription' | 'debt_balance';
  targetId: number;
  /** Human label, e.g. "Mensualidad Marzo 2026 — Performance Mensual" or "Saldo libre #12". */
  description: string;
  currency: string;
  /** Saldo pendiente positivo (entero). */
  balance: number;
  /** Días desde effective_date (clamp >= 0). */
  ageInDays: number;
  /** YYYY-MM-DD — usado para orden FIFO. */
  effectiveDate: string;
}

// -- Phase 108: Financial history item (D-12 / D-14) -----------------------

/**
 * Phase 108 — Item del historial financiero del miembro.
 * Mirror del backend `FinancialHistoryItem` (api/src/modules/finance/types.ts:126-139).
 * Source: GET /admin/members/:memberId/financial-history (paginado).
 *
 * `transaction` shape = mirror inline del FinancialTransactionRow (Drizzle inferSelect),
 * para evitar exponer un type del backend en el admin.
 */
export interface FinancialHistoryItem {
  transaction: {
    id: number;
    memberId: number;
    kind: TransactionKind;
    direction: TransactionDirection;
    amount: number;
    currency: string;
    paymentMethod: PaymentMethod;
    transactionDate: string;
    effectiveDate: string;
    branchId: number;
    notes: string | null;
    voidedAt: string | null;
    voidedBy: number | null;
    voidReason: string | null;
    createdAt: string;
  };
  links: Array<{
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
    conceptLabel?: string;
  }>;
  voidInfo?: {
    voidedAt: string;
    voidedBy: number;
    voidReason: string;
  };
}

// -- Phase 108: Register payment (D-22) ------------------------------------

/**
 * Phase 108 — Payload para POST /admin/finance/transactions cuando se registra
 * un pago de saldo (kind='debt_settlement'). Per CONTEXT D-22.
 *
 * Σ links[].allocatedAmount DEBE coincidir con `amount` (D-09/D-10);
 * frontend valida en vivo, backend rechaza 400 si no coincide.
 */
export interface RegisterPaymentInput {
  memberId: number;
  kind: 'debt_settlement';
  direction: 'inflow';
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  /** YYYY-MM-DD — fecha en la que entró a caja. */
  transactionDate: string;
  /** YYYY-MM-DD — período al que se imputa. */
  effectiveDate: string;
  branchId: number;
  notes?: string | null;
  links: Array<{
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
  }>;
}

// -- Phase 109 CAJA-03 — Outstanding balances (Deudas report) -------------
// Internal naming: aging / outstanding-balances. UI label always "Deudas"
// (D-01 — never expose "aging" string to the user).
//
// Mirrors backend types from el-templo-api/src/modules/reports/types.ts
// (added by Plan 109-02). The bucketTotals shape is bivariant:
//   - non-owner: flat BucketTotals (single currency by country scope).
//   - owner: keyed by currency, e.g. { ARS: BucketTotals, EUR: BucketTotals }.
// We NEVER sum amounts across different currencies.

export type DebtBucket = '0-30' | '31-60' | '61-90' | '90+';

export interface OutstandingBalanceRow {
  memberId: number;
  memberName: string;
  memberPhone: string | null;
  branchId: number | null;
  branchName: string | null;
  targetKind: 'subscription' | 'debt_balance';
  targetId: number;
  conceptLabel: string;
  amount: number;
  currency: string;
  effectiveDate: string; // YYYY-MM-DD
  ageInDays: number;
  bucket: DebtBucket;
}

export type BucketTotals = Record<DebtBucket, number>;

export interface OutstandingBalancesResult {
  rows: OutstandingBalanceRow[];
  total: number;
  page: number;
  limit: number;
  /** Owner: keyed by currency. Non-owner: flat. */
  bucketTotals: BucketTotals | Record<string, BucketTotals>;
}

export interface OutstandingBalancesFilters {
  branchId?: number;
  country?: 'AR' | 'ES';
  /** balances.currency — 'ARS' | 'EUR'. Owner-only filter. */
  currency?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// -- Phase 108: POST /transactions response shape (D-22) -------------------

/**
 * Mirror del backend `CreateTransactionResponse` (api/src/modules/finance/types.ts:143-147).
 * Tipos minimal — solo lo que el dialog/tab necesita; los rich rows del backend
 * no se mirroran completos para no acoplarse al schema Drizzle.
 */
export interface CreateTransactionResponse {
  transaction: {
    id: number;
    memberId: number;
    kind: TransactionKind;
    direction: TransactionDirection;
    amount: number;
    currency: string;
    paymentMethod: PaymentMethod;
    transactionDate: string;
    effectiveDate: string;
    branchId: number;
    notes: string | null;
    voidedAt: string | null;
    voidedBy: number | null;
    voidReason: string | null;
    createdAt: string;
  };
  links: Array<{
    id: number;
    transactionId: number;
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
  }>;
  affectedBalances: Array<{
    id: number;
    memberId: number;
    targetKind: 'subscription' | 'debt_balance';
    targetId: number;
    currency: string;
    amount: number;
    updatedAt: string;
  }>;
}
