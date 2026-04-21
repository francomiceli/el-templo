/**
 * Payments Module Types
 *
 * Interfaces for payment recording, voiding, global payment list,
 * and financial summary.
 */

// -- Enum Union Types --------------------------------------------------------

export type PaymentMethod = "cash" | "transfer" | "card";

// -- Payment Types -----------------------------------------------------------

export interface PaymentListItem {
  id: number;
  memberId: number;
  memberName: string;
  subscriptionId: number;
  planName: string | null;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  amount: number;
  currency: "ARS" | "EUR";
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

export interface PaymentDetail extends PaymentListItem {}

export interface RecordPaymentInput {
  memberId: number;
  subscriptionId: number;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  reference?: string;
  notes?: string | null;
  currency?: "ARS" | "EUR";
}

export interface VoidPaymentInput {
  reason: string;
}

// -- Payment List Params -----------------------------------------------------

export interface PaymentListParams {
  branchId?: number;
  paymentMethod?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page: number;
  limit: number;
}

// -- Financial Summary -------------------------------------------------------

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
