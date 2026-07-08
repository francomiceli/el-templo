// Module: finance — hotfix deudas de plan a futuro
//
// Shared predicate for every "deuda / deudor" read against the `balances`
// cache.

import { sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

/**
 * A `balances` row counts as **currently-collectible debt** unless it is a
 * subscription charge for a plan that has NOT started yet
 * (`subscriptions.start_date > CURDATE()`).
 *
 * Why: `recordAssignmentCharge` seeds the full plan price into `balances` the
 * moment a plan is assigned/scheduled, even when the plan's `start_date` is
 * months away (a `scheduled` renewal). Without this exclusion a member whose
 * only obligation is a future plan is flagged as a deudor and inflates every
 * Deudas total, days before the plan even begins.
 *
 * `debt_balance` (saldo libre) rows have no subscription and always count.
 *
 * References only `balances.target_kind` / `balances.target_id`, so it composes
 * into any query that has `schema.balances` as a FROM table — no extra JOIN
 * required (the subquery resolves the subscription itself, aliased `sub_started`
 * to avoid clashing with any LEFT JOINed `subscriptions` in the outer query).
 */
export function collectibleDebtCondition(): SQL {
  return sql`NOT (
    ${schema.balances.targetKind} = 'subscription'
    AND EXISTS (
      SELECT 1 FROM subscriptions sub_started
      WHERE sub_started.id = ${schema.balances.targetId}
        AND sub_started.start_date > CURDATE()
    )
  )`;
}

/**
 * Raw-SQL variant of {@link collectibleDebtCondition} for correlated subqueries
 * where the `balances` table is referenced by an explicit alias rather than the
 * Drizzle `schema.balances` object (e.g. the `EXISTS (SELECT 1 FROM balances b …)`
 * debtor filter on the members listing).
 *
 * @param alias the SQL alias the `balances` row is bound to in the caller.
 */
export function collectibleDebtConditionForAlias(alias: string): SQL {
  return sql`NOT (
    ${sql.raw(alias)}.target_kind = 'subscription'
    AND EXISTS (
      SELECT 1 FROM subscriptions sub_started
      WHERE sub_started.id = ${sql.raw(alias)}.target_id
        AND sub_started.start_date > CURDATE()
    )
  )`;
}
