/**
 * Payment types for the admin app.
 * Matches the API response shapes from the payments module (Plan 49-01).
 */

// -- Enum Union Types --------------------------------------------------------

export type PaymentMethod = 'cash' | 'transfer' | 'card';

// -- Label & Color Maps -------------------------------------------------------

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
};

export const PAYMENT_METHOD_COLORS: Record<PaymentMethod, string> = {
  cash: 'green',
  transfer: 'blue',
  card: 'purple',
};

export const PAYMENT_METHOD_OPTIONS: Array<{ label: string; value: PaymentMethod }> = [
  { label: 'Efectivo', value: 'cash' },
  { label: 'Transferencia', value: 'transfer' },
  { label: 'Tarjeta', value: 'card' },
];

// -- Payment Types ------------------------------------------------------------

export interface PaymentListItem {
  id: number;
  memberId: number;
  memberName: string;
  subscriptionId: number | null;
  planName: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  recordedBy: number;
  recorderName: string;
  voidedAt: string | null;
  voidedBy: number | null;
  voidReason: string | null;
  createdAt: string;
}

export interface VoidPaymentInput {
  reason: string;
}

// -- Payment List Params ------------------------------------------------------

export interface PaymentListParams {
  branchId?: number;
  paymentMethod?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page: number;
  limit: number;
}

// -- Financial Summary --------------------------------------------------------

export interface FinancialSummary {
  monthlyRevenue: number;
  revenueByMethod: {
    cash: number;
    transfer: number;
    card: number;
  };
  revenueByBranch: Array<{
    branchId: number;
    branchName: string;
    revenue: number;
  }>;
}
