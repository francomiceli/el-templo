// Module: finance — phase 105
//
// D-05: enums declared inline in the Drizzle schema. TS literals are
// inferred here via $inferSelect so the schema is the single source of
// truth.

import type {
  financialTransactions,
  transactionLinks,
  balances,
} from "../../db/schema";
import type { CountryCode } from "../shared/country-scope";

// -- Row shapes inferred from the Drizzle tables -----------------------------

export type FinancialTransactionRow = typeof financialTransactions.$inferSelect;
export type FinancialTransactionInsert =
  typeof financialTransactions.$inferInsert;
export type TransactionKind = FinancialTransactionRow["kind"];
export type TransactionDirection = FinancialTransactionRow["direction"];
export type PaymentMethod = FinancialTransactionRow["paymentMethod"];

export type TransactionLinkRow = typeof transactionLinks.$inferSelect;
export type TargetKind = TransactionLinkRow["targetKind"];

export type BalanceRow = typeof balances.$inferSelect;
export type BalanceTargetKind = BalanceRow["targetKind"];

// -- Service input shapes ----------------------------------------------------

export interface CreateTransactionLinkInput {
  targetKind: TargetKind;
  targetId: number;
  allocatedAmount: number;
}

export interface CreateTransactionInput {
  memberId: number;
  kind: TransactionKind;
  direction: TransactionDirection;
  amount: number;
  /** Defaults to 'ARS' when omitted. */
  currency?: string;
  paymentMethod: PaymentMethod;
  /** YYYY-MM-DD: when the transaction entered caja. */
  transactionDate: string;
  /** YYYY-MM-DD: which month/period the transaction accrues to. */
  effectiveDate: string;
  branchId: number;
  notes?: string | null;
  links: CreateTransactionLinkInput[];
}

export interface VoidTransactionInput {
  reason: string;
}

// -- Service output shapes ---------------------------------------------------

export interface TransactionDetail extends FinancialTransactionRow {
  links: TransactionLinkRow[];
}

// -- Phase 106: list/history shapes ----------------------------------------

// -- Filter shapes (analog: reports/types.ts:21-30 ChargeReportFilters) ----

/** Filters for GET /api/admin/finance/transactions (D-12). */
export interface TransactionListFilters {
  branchId?: number;
  /** Injected by route handler from request.scope.country (Phase 98 pattern). */
  country?: CountryCode;
  kind?: TransactionKind;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  memberId?: number;
  paymentMethod?: PaymentMethod;
  /** Member name search; uses buildMemberNameSearchCondition. */
  search?: string;
  page?: number;
  limit?: number;
}

/** Filters for GET /api/admin/members/:id/financial-history (D-13). */
export interface FinancialHistoryFilters {
  page?: number;
  limit?: number;
}

// -- Response row shapes ----------------------------------------------------

/**
 * Flat row for the GET /transactions table (D-12). Includes denormalized
 * member name + branch name + recorder name + a lightweight summary of
 * links (full link rows omitted for the list view).
 */
export interface TransactionListItem {
  id: number;
  transactionDate: string; // YYYY-MM-DD
  effectiveDate: string; // YYYY-MM-DD
  memberId: number;
  memberName: string; // CONCAT(first_name, ' ', last_name)
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
  linkSummary: Array<{
    targetKind: TargetKind;
    targetId: number;
    allocatedAmount: number;
  }>;
}

/**
 * Item for GET /api/admin/members/:id/financial-history (D-13).
 * `conceptLabel` is populated for target_kind='subscription' via JOIN
 * to subscriptions + subscription_plans (e.g. "Plan Pro — 2026-03-01").
 */
export interface FinancialHistoryItem {
  transaction: FinancialTransactionRow;
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

// -- POST /transactions response shape (D-10) ------------------------------

export interface CreateTransactionResponse {
  transaction: FinancialTransactionRow;
  links: TransactionLinkRow[];
  affectedBalances: BalanceRow[];
}
