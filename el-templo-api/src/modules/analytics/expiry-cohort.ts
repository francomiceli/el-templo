/**
 * Expiry-cohort engine (Phase 121 — shared heart of Block 1 churn + Block 2 renovación).
 *
 * Pure, stateless SQL-fragment / predicate builders shared by `churn-service.ts`
 * (Plan 02) and `renewal-service.ts` (Plan 03). It is the SINGLE definition of
 * "the cohort of people whose membership expired in `[from, to)`" so that churn%
 * and renovación% sit on the EXACT SAME denominator (RENOV-01). Extracting it here
 * is the DRY win the CONTEXT and PATTERNS both endorse, and it mirrors the
 * foundation-style of `cohorts.ts` / `duration-tier.ts` (pure, no DB, no logging,
 * no `any`, named exported constants for every threshold).
 *
 * Decisions encoded (see 121-CONTEXT.md):
 *
 *   - D-01: the cohort = distinct persons with a subscription whose `endDate` falls
 *           in `[from, to)` (natural expiry by end date). NEVER keyed off
 *           `updatedAt` / `cancelledAt` — that is exactly the legacy
 *           `countChurnedMembers` (service.ts:329-358) this replaces.
 *   - D-02: an early voluntary cancellation is NOT modelled as a separate event; a
 *           `cancelled` row whose `endDate` is in range enters by the SAME endDate
 *           predicate as any other row. No special cancellation logic here.
 *   - D-03 / CHURN-04: a subscription `status='paused'` whose `endDate` is in range
 *           is EXCLUDED from the cohort while paused (it did not truly expire). We do
 *           NOT shift the effective endDate by the pause duration (descartado).
 *   - D-04: a person with several expiries in range is evaluated on their LAST (max)
 *           expiry in range — the earlier ones were renewed (that is why a later one
 *           exists); the last reflects the current state. Guarantees the distinct-
 *           persons count (CHURN-01).
 *   - D-05 / D-06 / CHURN-04: a person retained (did NOT churn) iff a DISTINCT later
 *           subscription row starts on or before `E + ventana` and gives continuity.
 *           Plan change AND duration change (mensual↔largo) count as renewal; an
 *           early renewal counts with NO lower bound on how early. Detection is over
 *           `subscriptions` rows, not payments.
 *   - D-07: a single configurable "ventana de renovación" (default 15 days) defines
 *           both the renewal window and the official churn window; the multi-N set
 *           (5/10/15) is only the comparative view.
 *   - D-08 / CHURN-03: churn maduro — only persons whose expiry happened `>= ventana`
 *           days ago enter the numerator AND denominator; those still inside the
 *           grace window are excluded until they mature.
 *
 * SQL-injection discipline (T-121-01 / T-120-07): `from` / `to` always pass through
 * Drizzle `sql` parameterization (bind values, never string-interpolated). The ONLY
 * `sql.raw` is `String(windowDays)` for an INTEGER the SERVICE controls — never user
 * input. Window values arriving from the querystring are validated + integer-coerced
 * at the route (Plans 02/03) before reaching these helpers.
 *
 * No DB access, no logging, no `any`.
 */
import { sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";
import { rangeConditions } from "./cohorts";

/**
 * The single configurable "ventana de renovación", default 15 days (D-07). Unifies
 * the renewal cutoff (a new sub within this window = renovado) with the official
 * churn window (no new sub within this window = churneó). The SERVICE may override
 * it from a validated, integer-coerced querystring param; this constant is the
 * fallback when none is supplied. Exported product rule — NOT an env var.
 */
export const RENOVATION_WINDOW_DEFAULT_DAYS = 15;

/**
 * The default multi-N comparative window set for the churn exploration view
 * (D-07 / CHURN-02): churn@5 / @10 / @15 side by side. This is the comparative
 * view ONLY — the "official" churn that pairs with renovación uses the single
 * configured window (`RENOVATION_WINDOW_DEFAULT_DAYS` by default). Planner-
 * discretion value per CONTEXT. Exported product rule — NOT an env var.
 */
export const CHURN_COMPARISON_WINDOWS = [5, 10, 15] as const;

/**
 * Cohort membership predicate (D-01 + D-03): the set of subscription rows whose
 * `endDate` falls in the HALF-OPEN range `[from, to)` AND whose status is not
 * `'paused'`.
 *
 *   - D-01: composes `rangeConditions(subscriptions.endDate, from, to)` (INCLUSIVE
 *     lower `>= from`, EXCLUSIVE upper `< to`). NEVER `updatedAt` / `cancelledAt`.
 *     The `< to` bound already excludes NULL `endDate` rows in MySQL (NULL `<` x is
 *     NULL → not matched).
 *   - D-03: adds `status <> 'paused'` so a paused membership whose `endDate` is in
 *     range never enters the cohort while paused (it did not truly expire). We do
 *     NOT shift the effective endDate by the pause duration.
 *
 * `from` / `to` are bound via `rangeConditions` (parameterized), never
 * string-interpolated (T-121-01).
 *
 * @param from inclusive lower bound (`YYYY-MM-DD`), or `undefined` for no lower bound.
 * @param to EXCLUSIVE upper bound (`YYYY-MM-DD`), or `undefined` for no upper bound.
 * @returns the WHERE fragments to spread into the query's `and(...)`.
 */
export function expiryCohortConditions(
  from: string | undefined,
  to: string | undefined,
): SQL[] {
  return [
    ...rangeConditions(schema.subscriptions.endDate, from, to),
    // D-03 / CHURN-04: a paused membership did not truly expire — exclude it.
    sql`${schema.subscriptions.status} <> 'paused'`,
  ];
}

/**
 * Last-expiry-per-person predicate (D-04): keeps EXACTLY ONE row per `user_id` —
 * the person's MAX `endDate` within the cohort window, tie-broken by the larger
 * `id`. When a person has several in-range expiries, only their latest survives
 * (the earlier ones were renewed; the latest reflects the current state),
 * guaranteeing the distinct-persons count (CHURN-01).
 *
 * Implemented as a correlated `NOT EXISTS`: there is no OTHER in-range, non-paused
 * row `s2` for the same user with a strictly-later `endDate` (or an equal `endDate`
 * but a larger `id`, as the tie-break). `from` / `to` are bound as parameters,
 * never string-interpolated (T-121-01).
 *
 * Spread the result alongside `expiryCohortConditions(from, to)` so the surviving
 * rows are exactly "one per person, their last expiry in range".
 *
 * @param from inclusive lower bound (`YYYY-MM-DD`) of the cohort window.
 * @param to EXCLUSIVE upper bound (`YYYY-MM-DD`) of the cohort window.
 * @returns a single SQL fragment to add to the query's `and(...)`.
 */
export function lastExpiryPerPersonExpr(
  from: string | undefined,
  to: string | undefined,
): SQL {
  // Lower / upper bound fragments mirror rangeConditions' half-open contract, but
  // applied to the correlated alias `s2`. Built conditionally so an unbounded
  // from/to side simply omits its fragment (same semantics as rangeConditions).
  const lower = from !== undefined ? sql`AND s2.end_date >= ${from}` : sql``;
  const upper = to !== undefined ? sql`AND s2.end_date < ${to}` : sql``;
  return sql`NOT EXISTS (
    SELECT 1 FROM subscriptions s2
    WHERE s2.user_id = ${schema.subscriptions.userId}
      AND s2.id <> ${schema.subscriptions.id}
      AND s2.subscription_status <> 'paused'
      ${lower}
      ${upper}
      AND (
        s2.end_date > ${schema.subscriptions.endDate}
        OR (s2.end_date = ${schema.subscriptions.endDate} AND s2.id > ${schema.subscriptions.id})
      )
  )`;
}

/**
 * Retention predicate (D-05 / D-06 / CHURN-04): TRUE for a person whose membership
 * expired at `E` and who has a DISTINCT later subscription row (different `id`, same
 * `user_id`) whose `start_date` is ON OR BEFORE `E + windowDays` and gives
 * continuity.
 *
 *   - Plan change AND duration change (mensual↔largo) count as renovación — the
 *     predicate does NOT constrain `plan_id`.
 *   - An EARLY renewal counts with NO lower bound on how early — there is NO floor on
 *     `start_date`, only the `<= E + windowDays` ceiling.
 *   - Detection is over `subscriptions` rows, NOT payments.
 *
 * `windowDays` is an INTEGER the SERVICE controls; it is the ONLY value passed
 * through `sql.raw(String(windowDays))` (never user input — mirrors
 * getRenewalRate at service.ts:689). All other references are bound columns.
 *
 * @param windowDays the renovación window in whole days (SERVICE-controlled integer).
 * @returns a boolean SQL expression (usable in SELECT CASE / WHERE / HAVING).
 */
export function retainedExpr(windowDays: number): SQL {
  const n = sql.raw(String(windowDays));
  return sql`EXISTS (
    SELECT 1 FROM subscriptions s_next
    WHERE s_next.user_id = ${schema.subscriptions.userId}
      AND s_next.id <> ${schema.subscriptions.id}
      AND s_next.start_date <= DATE_ADD(${schema.subscriptions.endDate}, INTERVAL ${n} DAY)
  )`;
}

/**
 * Churn-maturity gate (D-08 / CHURN-03): TRUE only when the membership `end_date`
 * is at least `windowDays` before today — i.e. the person's grace window has
 * elapsed and their churn/renovación outcome is final. Persons still inside the
 * grace window are excluded (from BOTH numerator and denominator) until they
 * mature; the historical series marks such cohorts as provisional.
 *
 * `windowDays` is an INTEGER the SERVICE controls; it is passed through
 * `sql.raw(String(windowDays))` (never user input — mirrors getRenewalRate
 * at service.ts:689).
 *
 * @param windowDays the maturity window in whole days (SERVICE-controlled integer).
 * @returns a boolean SQL expression (usable in SELECT CASE / WHERE / HAVING).
 */
export function maturedExpr(windowDays: number): SQL {
  const n = sql.raw(String(windowDays));
  return sql`${schema.subscriptions.endDate} <= DATE_SUB(CURDATE(), INTERVAL ${n} DAY)`;
}
