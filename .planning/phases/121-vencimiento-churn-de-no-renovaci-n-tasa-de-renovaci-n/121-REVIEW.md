---
phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - el-templo-api/src/modules/analytics/expiry-cohort.ts
  - el-templo-api/src/modules/analytics/churn-service.ts
  - el-templo-api/src/modules/analytics/renewal-service.ts
  - el-templo-api/src/modules/analytics/routes.ts
  - el-templo-api/src/modules/analytics/schemas.ts
  - el-templo-api/src/modules/analytics/service.ts
  - el-templo-api/src/modules/analytics/types.ts
  - el-templo-api/test/analytics/churn.test.ts
  - el-templo-api/test/analytics/expiry-cohort.test.ts
  - el-templo-api/test/analytics/renewal.test.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 121: Code Review Report

**Reviewed:** 2026-06-04T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the person-based churn + renovación analytics implementation: the shared
expiry-cohort engine (`expiry-cohort.ts`), the two consumer services
(`churn-service.ts`, `renewal-service.ts`), routes, schemas, types, and the three
integration test files. The scope guard story is solid (ADMIN_ROLES-only via
`requireAdminAnalytics` + `applyScope` on `subscriptions.branchId`, verified by the
403 tests) and the SQL-injection discipline is mostly correct — date bounds are
parameterized, and the `sql.raw` calls feed only schema-validated integers
(`window` bounded 1..365 in the route schema).

However, the **core retention predicate (`retainedExpr`) is logically wrong**: it
has no lower bound and no continuity constraint, so a person's OWN earlier
subscription cycle satisfies it and mislabels a genuine churner as retained. This
directly contradicts the D-04 multi-expiry semantics the engine claims to enforce,
and the existing tests `churn.test.ts:187` and the renovación shared-denominator
tests appear to assert the OPPOSITE of what the SQL will return — so this is both a
data-correctness defect AND a likely CI failure. A second blocker: the retention and
last-expiry correlated subqueries are not scoped, so cross-branch / out-of-range
subscriptions leak into the renewal decision.

## Critical Issues

### CR-01: `retainedExpr` mislabels churners as retained — no lower bound, no continuity constraint

**File:** `el-templo-api/src/modules/analytics/expiry-cohort.ts:162-170`

**Issue:** The renovación predicate is the heart of both churn% and renovación%. As
written it returns TRUE whenever the person has ANY other subscription row whose
`start_date <= E + windowDays`:

```sql
EXISTS (
  SELECT 1 FROM subscriptions s_next
  WHERE s_next.user_id = <userId>
    AND s_next.id <> <id>
    AND s_next.start_date <= DATE_ADD(<endDate>, INTERVAL n DAY)
)
```

There is **no lower bound** on `s_next.start_date` and **no constraint that
`s_next` is a continuation** (e.g. `s_next.end_date > E`, or
`s_next.start_date >= E - someFloor`, or `s_next.id > <id>`). Consequently a
person's OWN earlier, already-expired cycle satisfies the predicate.

Trace the D-04 two-expiry case (the cohort's own headline guarantee, and the exact
scenario in `churn.test.ts:187-206`):

- Person has sub1 `(start −80, end −50)` and sub2 `(start −50, end −40)`.
- `lastExpiryPerPersonExpr` collapses the cohort to sub2 (the last expiry).
- `retainedExpr(15)` for sub2 asks: does another sub exist with
  `start_date <= −40 + 15 = −25`? sub1's `start_date = −80 <= −25` → **TRUE → the
  person is classified RETAINED (not churned).**
- The test asserts `res.window.churn.nominal === 1` (churned). The SQL produces 0.

The same false-positive fires whenever the matured cohort row is a person's _last_
cycle but they had _any_ prior cycle (the overwhelmingly common case for a real
gym member), so production churn will be systematically **under-counted** and
renovación **over-counted**. The "early renewal, no floor" requirement (D-06) is
real, but it cannot be satisfied by simply dropping all bounds — the predicate must
still distinguish "a genuine continuation of THIS expiry" from "a different/earlier
cycle of the same person."

**Fix:** Constrain `s_next` to be a continuation of the expiring row, not merely
any other row. The minimal correct form keeps the early-renewal allowance while
excluding prior cycles by requiring the candidate to extend past the expiry and to
be a strictly-later subscription record:

```ts
export function retainedExpr(windowDays: number): SQL {
  const n = sql.raw(String(windowDays));
  return sql`EXISTS (
    SELECT 1 FROM subscriptions s_next
    WHERE s_next.user_id = ${schema.subscriptions.userId}
      AND s_next.id <> ${schema.subscriptions.id}
      AND s_next.subscription_status <> 'paused'
      -- a continuation must cover/extend the expiry, not be a prior cycle:
      AND s_next.end_date > ${schema.subscriptions.endDate}
      -- and it must START within the renewal window (early renewal allowed: it
      -- may start before E, but it must be a LATER record than the expiring row):
      AND s_next.id > ${schema.subscriptions.id}
      AND s_next.start_date <= DATE_ADD(${schema.subscriptions.endDate}, INTERVAL ${n} DAY)
  )`;
}
```

The exact continuity rule is a product decision (whether to gate on
`end_date > E`, on `id > <id>`, or on `start_date >= E`), but the current
unbounded form is provably wrong against the engine's own D-04 contract and its own
tests. Resolve the semantics, then fix the predicate AND re-confirm every churn /
renewal test expectation.

### CR-02: correlated subqueries (`lastExpiryPerPersonExpr`, `retainedExpr`) ignore branch/country scope

**File:** `el-templo-api/src/modules/analytics/expiry-cohort.ts:120-141, 162-170`
(consumed at `churn-service.ts:178-184` and `renewal-service.ts:151-157`)

**Issue:** Every outer query correctly spreads `applyScope(...).conditions` onto
`subscriptions.branchId`, so the COHORT is branch/country-scoped. But the
correlated subqueries inside `lastExpiryPerPersonExpr` (`s2`) and `retainedExpr`
(`s_next`) join only on `user_id` — they apply **no branch/scope filter**. Effects:

1. **Scope leak in the retention decision.** A member who churned at branch A but
   has any subscription at branch B (or whose B-subscription started before the
   window) will be evaluated against that out-of-scope row. When the dashboard is
   filtered to branch A, the renewal/churn outcome is silently influenced by data
   the operator is not authorized to (or did not intend to) see. For a multi-sede
   operator this is both a correctness defect and a scope-isolation concern
   (T-121-03/05/09 claim "EVERY query" is scoped — these subqueries are not).

2. **Last-expiry collapse crosses scope.** `lastExpiryPerPersonExpr`'s `s2`
   considers the person's expiries at OTHER branches when deciding which row
   "survives", so the surviving cohort row for a branch-A-filtered view may be
   suppressed by a branch-B expiry.

**Fix:** Thread the active scope into the correlated subqueries, or restrict them to
the same branch as the outer row. Minimal version (same-branch continuity, which is
also usually the correct product rule — a renewal happens at the member's branch):

```ts
// in retainedExpr / lastExpiryPerPersonExpr, add to the correlated WHERE:
AND s_next.branch_id = ${schema.subscriptions.branchId}
```

If cross-branch renewals must count, instead pass the resolved
`applyScope(...).conditions` (branchId/country) down and re-apply them to `s_next` /
`s2`. Either way the subquery must not be unconditionally global. Confirm the
intended rule before fixing.

## Warnings

### WR-01: `country` breakdown axis groups by PLAN country, not branch/scope country

**File:** `el-templo-api/src/modules/analytics/churn-service.ts:354, 388-393`
and `el-templo-api/src/modules/analytics/renewal-service.ts:212, 245-250`

**Issue:** The breakdown rows select `country: schema.subscriptionPlans.country`
and feed it as the `country` axis key. But the access scope (`applyScope`) filters
on `branches.country`. Plan country and branch country are independent columns — a
member at an AR branch can hold a plan whose `subscriptionPlans.country = 'ES'`
(nothing in the schema forbids it). The "country" breakdown will therefore attribute
churn to a country the member is not physically in, and it is inconsistent with how
every scoped query defines country. The `plan` composite key (`name‖country`) has
the same issue baked in.

**Fix:** Decide whether the country axis means "plan country" or "branch/operating
country" and source it consistently with `applyScope` (likely `branches.country`,
which already requires a `branches` join — present here). If plan country is
deliberate, rename the axis/field to make that explicit so it is not conflated with
the scope country.

### WR-02: `userId` selected but never used in `officialAndGrace`

**File:** `el-templo-api/src/modules/analytics/churn-service.ts:173` and
`el-templo-api/src/modules/analytics/renewal-service.ts:146`

**Issue:** Both `officialAndGrace` queries `select({ userId, matured, retained })`
but never read `r.userId` in the fold loop (`churn-service.ts:188-196`,
`renewal-service.ts:161-169`). The distinct-person guarantee comes entirely from
`lastExpiryPerPersonExpr` in SQL, so the selected `userId` is dead. It is harmless
but misleading — it implies a JS-side dedup that does not exist, and the
`CohortRow.userId` interface field (`churn-service.ts:85`) is likewise never
populated/consumed.

**Fix:** Drop `userId` from the select (and from `CohortRow` if it is otherwise
unused) so the code does not imply a dedup step that lives in SQL.

### WR-03: `Number(r.matured) === 1` assumes a specific driver coercion of a boolean SQL expression

**File:** `el-templo-api/src/modules/analytics/churn-service.ts:189-190, 247, 301-302, 400`
and `el-templo-api/src/modules/analytics/renewal-service.ts:162-163, 257`

**Issue:** `maturedExpr`/`retainedExpr` are selected as bare boolean SQL expressions
(`<col> <= DATE_SUB(...)`, `EXISTS(...)`), not wrapped in `CASE WHEN ... THEN 1 ELSE
0 END`. MySQL returns boolean expressions as `0`/`1`, and mysql2 typically yields a
JS `number`, so `Number(r.matured) === 1` works today. But the value is typed
loosely and the truthiness contract is implicit — if the column ever comes back as a
string `"1"`, a `Buffer`, or `true`, `Number(...) === 1` is fragile. Note the
test files deliberately wrap the same exprs in `CASE WHEN ... THEN 1 ELSE 0 END`
(`expiry-cohort.test.ts:297, 335`) — the services do not, so the test does not
actually exercise the services' raw-boolean coercion path.

**Fix:** Make the SELECT explicit to match the test's wrapping, e.g.
`matured: sql<number>\`CASE WHEN ${maturedExpr(window)} THEN 1 ELSE 0 END\``, or
compare with a tolerant check (`Number(r.matured) > 0`). Prefer the explicit CASE so
the wire value is unambiguously 0/1.

### WR-04: monthly series buckets by RAW endDate, so multi-expiry persons can be bucketed inconsistently with the cohort

**File:** `el-templo-api/src/modules/analytics/churn-service.ts:274-289`

**Issue:** `monthlySeries` selects `bucketExpr(subscriptions.endDate, "monthly")`
over the same cohort query. Because `lastExpiryPerPersonExpr` keeps only the last
expiry per person, the bucket is that last expiry's month — which is correct. But
the series sums `metricShape` per bucket independently; a person whose only matured
expiry falls in month M contributes to M, while the `provisional` flag is set if ANY
person in that bucket is not matured. That is defensible, but the `window.churn`
headline and the sum of `series` buckets will NOT reconcile when in-grace persons
exist (they are dropped from series numerator/denominator but counted in `enGracia`
only at the top level). This is easy to misread as a bug downstream; there is no
test asserting `series` reconciles with `window.churn`.

**Fix:** Add an integration assertion that the matured cohort size equals the sum of
`series[].churn.n` (for fully-matured buckets) and document that provisional buckets
are excluded from the headline reconciliation, so the relationship is pinned.

## Info

### IN-01: comparison windows recompute the full cohort scan N times

**File:** `el-templo-api/src/modules/analytics/churn-service.ts:212-254`

**Issue:** `multiNComparison` issues one full cohort query per window in
`CHURN_COMPARISON_WINDOWS` (3x), and `officialAndGrace` issues a 4th nearly
identical scan. The cohort rows are identical; only the `maturedExpr`/`retainedExpr`
window differs. (Performance is out of v1 scope, flagged for maintainability only.)

**Fix:** Optionally select all needed windows' `matured`/`retained` flags in one
scan and fold per window in JS, removing 3 redundant round-trips.

### IN-02: no test covers the multi-expiry false-positive that CR-01 describes against renovación's shared-denominator claim

**File:** `el-templo-api/test/analytics/renewal.test.ts:175-206, 208-233`

**Issue:** The renovación tests seed renewals as a SEPARATE active sub (start in the
future), which happens to dodge the CR-01 false-positive. No test seeds the
"churner who has a prior expired cycle but no genuine continuation" case — exactly
the case CR-01 mislabels. The suite therefore gives false confidence that
churn/renovación reconcile.

**Fix:** Add a test: one person with two consecutive expired subs (e.g. `−80/−50`
then `−50/−40`) and NO future continuation; assert the person counts as CHURNED in
both services and as NOT renovado. This will currently fail and pin CR-01.

### IN-03: `window` default (15) is duplicated as the literal `15` in several test assertions

**File:** `el-templo-api/test/analytics/churn.test.ts:181` and
`el-templo-api/test/analytics/renewal.test.ts:294`

**Issue:** Tests assert `windowDays).toBe(15)` with a magic literal rather than
importing `RENOVATION_WINDOW_DEFAULT_DAYS`. If the product default changes, these
assertions silently encode the old value. Minor; the constant is already imported in
`expiry-cohort.test.ts`.

**Fix:** Assert against `RENOVATION_WINDOW_DEFAULT_DAYS` for the default-window cases.

---

_Reviewed: 2026-06-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
