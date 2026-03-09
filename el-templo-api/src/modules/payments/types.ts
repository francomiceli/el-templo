/**
 * Payments Module Types
 *
 * Interfaces for payment recording, voiding, balance computation,
 * overdue detection, global payment list, and financial summary.
 */

// -- Enum Union Types --------------------------------------------------------

export type PaymentMethod = "cash" | "transfer" | "card";

// -- Payment Types -----------------------------------------------------------

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

export interface PaymentDetail extends PaymentListItem {}

export interface RecordPaymentInput {
  memberId: number;
  subscriptionId?: number;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  reference?: string;
  notes?: string;
}

export interface VoidPaymentInput {
  reason: string;
}

// -- Balance Types -----------------------------------------------------------

export interface MemberBalance {
  subscriptionId: number;
  planName: string;
  pricePaid: number;
  totalPaid: number;
  remaining: number;
  isOverdue: boolean;
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
  totalOutstanding: number;
  collectionRate: number;
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

// -- Overdue Member ----------------------------------------------------------

export interface OverdueMember {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  branchName: string;
  planName: string;
  amountOwed: number;
  amountPaid: number;
  amountDue: number;
}
