/**
 * Coach module — public types.
 *
 * Endpoints in this module serve the coach-facing "Deudas" tab in the admin
 * web: a minimal projection of outstanding member balances so a professor
 * receiving a payment at the door knows exactly how much to collect, with no
 * other financial detail exposed.
 */

export interface CoachOutstandingBalancesFilters {
  /** Free-text search on member first/last name (case-insensitive). */
  search?: string;
}

/** One row per (member, currency) aggregated from active balances. */
export interface CoachOutstandingBalanceRow {
  memberId: number;
  memberName: string;
  memberPhone: string | null;
  totalAmount: number;
  currency: string;
}

export interface CoachOutstandingBalancesResult {
  rows: CoachOutstandingBalanceRow[];
}
