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
