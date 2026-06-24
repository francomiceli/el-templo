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
 * Raw-SQL fragment of the firm-money predicate for the call sites that build
 * SQL strings with UNqualified columns. Static constant with NO user-input
 * interpolation — safe to embed in a WHERE/EXISTS clause. Combine with the
 * caller's own `direction`/`kind` conditions via AND.
 *
 * Use this ONLY where `financial_transactions` is the sole/unaliased table in
 * scope. When the raw SQL references the table via an alias (e.g. `ft`, `fx`)
 * inside a correlated subquery that JOINs other tables, use
 * `firmMoneySqlFor(alias)` instead — unqualified columns in a correlated
 * subquery are a known footgun that can silently bind to the wrong table.
 */
export const FIRM_MONEY_SQL = `voided_at IS NULL AND validation_status = 'validado'`;

/**
 * Alias-qualified form of {@link FIRM_MONEY_SQL} for the 3 raw-SQL call sites
 * that reference `financial_transactions` through an alias inside a correlated
 * subquery (analytics/service.ts yaPagoExpr `ft`, reports/service.ts
 * charge-history `ft`, reports/service.ts trial-conversion `fx`).
 *
 * `alias` is a hard-coded internal table alias (never user input), so the
 * resulting fragment is a static, injection-safe constant. Single source of
 * truth: both columns always carry the same alias, so they bind unambiguously
 * to `financial_transactions` even when the surrounding query joins other
 * tables.
 */
export function firmMoneySqlFor(alias: string): string {
  return `${alias}.voided_at IS NULL AND ${alias}.validation_status = 'validado'`;
}
