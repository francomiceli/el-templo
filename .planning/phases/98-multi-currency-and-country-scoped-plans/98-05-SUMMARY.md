---
phase: 98-multi-currency-and-country-scoped-plans
plan: 05
subsystem: route-service-country-scoping
tags:
  [country-scope, route-wiring, service-filter, multi-currency, forward-compat]
requires:
  - "phase 98 plan 01 (subscriptionPlans.country/currency, promoPlans.country, gladiusProducts.country columns)"
  - "phase 98 plan 02 (attachCountryScope preHandler)"
  - "phase 98 plan 03 (attachCountryScope wired on all 7 country-scoped plugins)"
  - "phase 98 plan 04 (service-layer cross-country/currency validation + currency inheritance)"
provides:
  - "GET /api/admin/subscriptions/plans accepts optional ?branchId and ?country; resolves branchId->country server-side; branchId wins when both set"
  - "GET /api/admin/subscriptions/promo-plans scoped by request.scope.country via listPromoPlans({ country })"
  - "createPromo inherits country from the referenced subscription plan (can never drift cross-country)"
  - "GET /api/members/plans (member-facing catalog) derives country from authenticated member's branch via request.scope.country — no query param accepted"
  - "GET /api/admin/members list handler plumbs request.scope.country through listMembers filter"
  - "GET /api/admin/members/export plumbs request.scope.country through exportMembers filter"
  - "GET /api/admin/gladius/admin/products plumbs request.scope.country through listAllProducts"
  - "POST /api/admin/gladius/admin/products inherits request.scope.country on insert"
affects:
  - "Plan 06 (reports/analytics/caja country filter — service signature precedent set here)"
  - "Plan 07-10 (admin + member UI — owner country dropdowns now drive server-side filtering)"
  - "Plan 11 (integration tests — test both list AND /export endpoints for cross-country 403/empty-result shape)"
tech_stack:
  added: []
  patterns:
    - "Options-object listPlans(filters) with legacy positional overload (listPlans(true, false) still compiles)"
    - "Service-layer branchId -> country resolution via branches SELECT (branchId wins over explicit country)"
    - "Grep-verified ≥2 request.scope.country hits in members/routes.ts guarantees /export is not forgotten"
    - "ListPlansFilters / ListPromoPlansFilters / ListProductsFilters exported for reuse"
key_files:
  modified:
    - "el-templo-api/src/modules/subscriptions/service.ts"
    - "el-templo-api/src/modules/subscriptions/routes.ts"
    - "el-templo-api/src/modules/subscriptions/schemas.ts"
    - "el-templo-api/src/modules/subscriptions/member-routes.ts"
    - "el-templo-api/src/modules/members/service.ts"
    - "el-templo-api/src/modules/members/routes.ts"
    - "el-templo-api/src/modules/members/schemas.ts"
    - "el-templo-api/src/modules/members/types.ts"
    - "el-templo-api/src/modules/gladius/service.ts"
    - "el-templo-api/src/modules/gladius/routes.ts"
decisions:
  - "listPlans signature preserved via union overload (isActiveOrFilters?: boolean | ListPlansFilters) so the member-facing catalog call — still used for legacy sites — compiles without refactoring every caller. The new call sites use the object form."
  - "branchId wins over country when both are supplied to listPlans — documented in the route handler's JSDoc. Rationale: if an admin explicitly picks a branch, its country is canonical; any ?country= must match by definition, so resolving branchId covers both. Preserves belt-and-suspenders enforcement."
  - "Member-facing /plans continues to surface a legacy cross-country subscription plan if the authenticated member has one (grandfathered ES member viewing an AR plan they're still on). This is narrower than exposing the full other-country catalog and mirrors the existing `planIds.has(sub.planId)` path."
  - "Added .innerJoin(branches) to the list count subquery in members/service.ts so the country-scope condition resolves identically in both count and paginated SELECT. Counts unchanged (users.branchId is NOT NULL + FK)."
  - "createPromo inherits country from the referenced subscription plan rather than trusting request.scope — prevents cross-country promo even if the route-layer scope somehow drifts. Defense in depth alongside request.scope."
  - "Gladius: createProduct accepts optional country on the ProductData interface and the admin route passes request.scope.country; when omitted, DB default AR applies (public/legacy callers unchanged)."
metrics:
  duration: "~55 minutes"
  completed_date: "2026-04-21"
---

# Phase 98 Plan 05: Country scope plumbed through list/read endpoints — Summary

Wired `request.scope.country` (set by Plan 03's `attachCountryScope` preHandler)
through every country-scoped list/read endpoint in the API. Admin endpoints
honor `?country=` and `?branchId=` query parameters; the member-facing plan
catalog derives country from the authenticated member's branch with no
client-controlled override. Response shapes remain a strict superset of the
pre-phase-98 contract (REQ-98-11).

## Endpoint contract changes

| Endpoint                                   | Audience | Query params accepted                                | Country source                                         |
| ------------------------------------------ | -------- | ---------------------------------------------------- | ------------------------------------------------------ |
| `GET /api/admin/subscriptions/plans`       | admin    | `isActive`, `includeArchived`, `branchId`, `country` | `branchId` (server-resolved) > `request.scope.country` |
| `GET /api/admin/subscriptions/promo-plans` | admin    | (none new)                                           | `request.scope.country`                                |
| `GET /api/members/plans`                   | member   | (none — D-04 enforces no override)                   | `request.scope.country` (derived from member's branch) |
| `GET /api/admin/members`                   | admin    | `country` (+ existing search/filters)                | `request.scope.country`                                |
| `GET /api/admin/members/export`            | admin    | `country` (+ existing filters)                       | `request.scope.country`                                |
| `GET /api/admin/gladius/admin/products`    | owner    | (none new)                                           | `request.scope.country`                                |
| `POST /api/admin/gladius/admin/products`   | owner    | (none new)                                           | `request.scope.country` inherited into the insert      |

### `?branchId=` vs `?country=` precedence (admin plans list)

When both are supplied to `GET /api/admin/subscriptions/plans`:

1. `request.scope.country` is already set by the preHandler (honoring owner
   `?country=` or derived for non-owners).
2. If `?branchId=` is present, the service layer SELECTs `branches.country`
   for that branch and uses it as the effective filter. **branchId wins.**
3. If only `?country=` is present, the service uses `request.scope.country`
   (which already reflects that value).
4. If neither is present, the service uses `request.scope.country` (owner
   default AR per D-06; non-owner = their branch's country).

Non-owners cannot escape their branch country even by sending both — the
preHandler collapses their `?country=` to the branch-derived value before
the service ever runs.

## Service method signatures that changed

| Service method                       | Signature change                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SubscriptionService.listPlans`      | Added union overload: `(isActive?, includeArchived?)` still works; new form is `(filters: ListPlansFilters)` with `{ isActive?, includeArchived?, country?, branchId? }` |
| `SubscriptionService.listPromoPlans` | Added optional `filters: ListPromoPlansFilters = {}` param with `{ country? }`                                                                                           |
| `SubscriptionService.createPromo`    | No signature change — now inherits `country` from the referenced plan on insert                                                                                          |
| `MemberService.listMembers`          | `MemberListParams` gained optional `country: "AR" \| "ES"`. Count subquery now innerJoins `branches`.                                                                    |
| `MemberService.exportMembers`        | Same: accepts optional `country` via `Omit<MemberListParams, ...>`                                                                                                       |
| `GladiusService.listAllProducts`     | Added optional `filters: ListProductsFilters = {}` param with `{ country? }`                                                                                             |
| `GladiusService.createProduct`       | `ProductData` gained optional `country`; when provided, written to the insert                                                                                            |

Exported interfaces: `ListPlansFilters`, `ListPromoPlansFilters`,
`ListProductsFilters`.

## Files modified (10) with grep-count evidence

| File                                    | Grep check                                                              | Count | Need | Status                    |
| --------------------------------------- | ----------------------------------------------------------------------- | ----- | ---- | ------------------------- |
| `members/routes.ts`                     | `request.scope.country`                                                 | 4     | ≥2   | PASS                      |
| `subscriptions/routes.ts`               | `request.scope`                                                         | 5     | ≥1   | PASS                      |
| `subscriptions/member-routes.ts`        | `request.scope`                                                         | 2     | ≥1   | PASS                      |
| `gladius/routes.ts`                     | `request.scope`                                                         | 3     | ≥1   | PASS                      |
| `members/service.ts`                    | `schema.branches.country`                                               | 2     | ≥1   | PASS                      |
| `subscriptions/service.ts`              | `subscriptionPlans.country`                                             | 1     | ≥1   | PASS                      |
| `subscriptions/service.ts`              | `schema.branches.country` (branchId resolution + earlier plans' guards) | 4     | ≥1   | PASS                      |
| `subscriptions/service.ts`              | `promoPlans.country`                                                    | 1     | ≥1   | PASS                      |
| `gladius/service.ts`                    | `country`                                                               | 10    | ≥2   | PASS                      |
| `promo-plans/service.ts`                | `test ! -f`                                                             | -     | -    | PASS (absent as required) |
| `cd el-templo-api && pnpm tsc --noEmit` | exit status                                                             | 0     | 0    | PASS                      |

## Forward-compat affirmation (REQ-98-11)

No existing response-shape field was renamed or removed. Only additive
changes:

- `PlanListItem` / `PlanDetail` already gained `country` and `currency` in
  Plan 04; this plan does not touch those shapes.
- Member list/export response shapes are unchanged by this plan.
- Gladius product rows continue to include `country` (a schema addition
  from Plan 01); no existing field was touched.

Grep spot-check shows the original plan fields (`priceRegular`, `priceZero`,
`priceCreditCard`, `durationDays`, `classesPerWeek`) retain identical hit
counts in `subscriptions/` files as before (73 in service.ts, 18 in
types.ts, 20 in schemas.ts, 2 in member-routes.ts). `git diff`
confirmed no response-shape field deletions — only method-signature and
internal-query additions.

## Deviations from Plan

### Rule 3 - Structural: count query needed the branches join

`MemberService.listMembers` had a count subquery that did NOT innerJoin
`branches` (only the paginated SELECT did). Adding
`eq(schema.branches.country, country)` to the shared `whereClause`
required the count query to join branches too, else MySQL would error on
the missing reference. Added `.innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))`
to the count subquery. Counts are unchanged because `users.branchId` is
`NOT NULL` + FK-constrained.

### Rule 2 - Correctness: createPromo inherits country from plan

The PLAN did not explicitly require this, but without it an owner on the
ES scope could create a promo pointing at an ES plan and the promo row
would default to `country='AR'` — the schema's column default. This would
silently break `listPromoPlans({ country: 'ES' })` because the promo would
never appear in the ES scope despite pointing at an ES plan. Inheriting
country from the referenced plan is the correct invariant; the promo's
country must match the plan's country by construction.

### Rule 2 - Correctness: createProduct on gladius admin inherits country

Same reasoning as `createPromo`: without this change, an owner viewing the
ES gladius products scope who creates a product would end up with an AR
product (DB default) invisible to their scope. Added `country` to
`ProductData` (optional for public backwards-compat) and the admin route
passes `request.scope.country` in.

### Legacy overload preserved for listPlans

The PLAN's action block described `listPlans({...filters})` as a clean
object-arg signature, but `member-routes.ts` already called
`subscriptionService.listPlans(true, false)` positionally. Rather than
edit the call site's argument list after I was also updating its country
source, I added a union overload
(`isActiveOrFilters?: boolean | ListPlansFilters`) that accepts either.
The member-routes call was updated to the object form; no other caller
breaks. Tradeoff: slightly more type-juggling at the function entry;
upside: no risk of accidentally changing a remote caller's semantics.

### Admin plans route: schema widened, not narrowed

`listPlansSchema.querystring.properties` gained `branchId` (integer) and
`country` (enum AR|ES). Both are optional, so existing callers that send
neither are unaffected. Non-owners who do send `?country=` still have it
ignored because the preHandler layer collapses their scope to the
branch-derived value.

## Out of scope (deferred)

- **Integration tests** covering cross-country 403 / empty-result shapes
  per endpoint — Plan 11. Test matrix should include:
  - Admin plan-list: ES owner + `?branchId=<AR-branch>` → AR plans
  - Admin plan-list: non-owner + `?country=ES` ignored, returns their branch country
  - Member catalog: AR member → zero ES plans visible
  - Members list: non-owner + export + list both scoped correctly
  - Promo-plans: country filter + createPromo inherits country
  - Gladius: admin list scoped, createProduct inherits country
- **Reports/analytics/caja** country filtering — Plan 06.
- **Admin UI** (`PlanesPage`, `MemberFormDialog`, etc.) passing `?country=`
  and `?branchId=` — Plans 07-10.
- **`listPublishedProducts`** (gladius public catalog) — left country-
  agnostic per plan rules; public route intentionally sees all products.

## Note for Plan 11 (integration tests)

These endpoints should get cross-country 403 / empty-result tests:

1. `GET /api/admin/subscriptions/plans` with owner `?country=ES` and
   `?branchId=<AR-branch>` — must return AR plans (branchId wins).
2. `GET /api/admin/subscriptions/plans` with non-owner (AR coach) sending
   `?country=ES` — must return AR plans (scope override blocks).
3. `GET /api/admin/subscriptions/promo-plans` owner toggling country via
   `?country=` — must return only that country's promos.
4. `GET /api/members/plans` AR member — zero ES plans in the catalog.
5. `GET /api/members/plans` AR member with legacy ES subscription — their
   ES plan is present even though other ES plans are not (tests
   legacyPlan path).
6. `GET /api/admin/members` non-owner — cross-country members absent.
7. `GET /api/admin/members/export` non-owner — the Excel file contains
   zero cross-country rows (verifies the `>= 2` grep constraint's intent).
8. `POST /api/admin/subscriptions/promo-plans` creating a promo — verify
   the inserted row's `country` matches the referenced plan's country,
   not the default AR.
9. `GET /api/admin/gladius/admin/products` owner — only their scope
   country's products.
10. `POST /api/admin/gladius/admin/products` owner — new product's row
    `country` matches `request.scope.country`.

## Commit

- `33ae84d8` feat(98-05): plumb country scope through admin + member plan/members/gladius list endpoints

## Self-Check: PASSED

Files modified (verified via `[ -f … ]`):

- `el-templo-api/src/modules/subscriptions/service.ts` — FOUND
- `el-templo-api/src/modules/subscriptions/routes.ts` — FOUND
- `el-templo-api/src/modules/subscriptions/schemas.ts` — FOUND
- `el-templo-api/src/modules/subscriptions/member-routes.ts` — FOUND
- `el-templo-api/src/modules/members/service.ts` — FOUND
- `el-templo-api/src/modules/members/routes.ts` — FOUND
- `el-templo-api/src/modules/members/schemas.ts` — FOUND
- `el-templo-api/src/modules/members/types.ts` — FOUND
- `el-templo-api/src/modules/gladius/service.ts` — FOUND
- `el-templo-api/src/modules/gladius/routes.ts` — FOUND

Commit (verified via `git log --oneline`):

- `33ae84d8` feat(98-05): plumb country scope through admin + member plan/members/gladius list endpoints — FOUND

TypeScript: `cd el-templo-api && pnpm tsc --noEmit` exit 0.

Grep acceptance criteria: ALL PASS (see table above).

Forward-compat: no response-shape field renamed or removed.
