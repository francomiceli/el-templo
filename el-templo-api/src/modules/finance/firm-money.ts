// Module: finance — phase 137
//
// Canonical "firm money" predicate. This is the SINGLE source of truth for
// the rule that revenue / firm-cash queries count ONLY validated, non-voided
// transactions. Before phase 137 the predicate `voided_at IS NULL` was copied
// across 14 call sites; phase 137 adds the new `validation_status='validado'`
// dimension and centralizes it here so it is never inlined again.
//
// Two equivalent forms are exported because the codebase has two consumer
// styles:
//   - Drizzle condition builders → use firmMoneyConditions()
//   - raw-SQL string builders     → use FIRM_MONEY_SQL
//
// IMPORTANT — what this helper does NOT include:
//   - `direction='inflow'` and `kind IN (...)` stay CALLER-SPECIFIC. Each call
//     site already constrains its own inflow universe (some use
//     kind IN ('plan_charge','debt_settlement'), a stricter slice). The ONE
//     predicate they all newly share is `validation_status='validado'`.
//   - This helper expresses ONLY the firm-money axis: not voided AND validated.

import { eq, isNull, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

/**
 * Drizzle conditions for "firm money": a transaction whose money is firm in the
 * register — i.e. not soft-voided AND validated. Single source of truth; never
 * inline `isNull(voidedAt)` + `eq(validationStatus,'validado')` anywhere else.
 *
 * Returns an array meant to be spread into a call site's existing `conds[]`,
 * alongside its own caller-specific `direction`/`kind` filters.
 */
export function firmMoneyConditions(): SQL[] {
  return [
    isNull(schema.financialTransactions.voidedAt),
    eq(schema.financialTransactions.validationStatus, "validado"),
  ];
}

/**
 * Raw-SQL fragment of the firm-money predicate for the 3 call sites that build
 * SQL strings (analytics/service.ts, reports/service.ts x2). Static constant
 * with NO user-input interpolation — safe to embed in a WHERE/EXISTS clause.
 * Combine with the caller's own `direction`/`kind` conditions via AND.
 */
export const FIRM_MONEY_SQL = `voided_at IS NULL AND validation_status = 'validado'`;
