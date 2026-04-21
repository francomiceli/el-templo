---
phase: 98-multi-currency-and-country-scoped-plans
plan: 11
subsystem: integration-tests
tags:
  [
    integration-tests,
    RBAC,
    cross-country,
    cross-currency,
    forward-compat,
    regression,
  ]
requires:
  - "phase 98 plan 01-05 (schema, preHandler, service-layer guards, route plumbing)"
provides:
  - "test/country-scope.test.ts — 13 integration tests across 7 describe groups"
  - "Automated regression guard for REQ-98-05, REQ-98-06, REQ-98-11, SPEC AC-7"
  - "Explicit superset assertions on member-app endpoints (/plans, /me/subscription)"
affects:
  - "Plan 12 (manual UAT can rely on the REQ-98-11 forward-compat tests as the automated gate)"
  - "Follow-up phase: 3 discovered gaps in Plans 03-05 documented for fix"
tech_stack:
  added: []
  patterns:
    - "vitest describe/it nested groups matching existing test layout"
    - "Direct PaymentService instantiation when route layer does not plumb service input (cross-currency test)"
    - "Superset-shape assertion (explicit pre-existing key enumeration) for mobile-app forward-compat"
    - "Defense-in-depth: after status-code assertion, verify response body does NOT contain forbidden identifiers"
key_files:
  created:
    - "el-templo-api/test/country-scope.test.ts"
  modified: []
decisions:
  - "Used `country-scope.test.ts` as the filename to match the plan's grep acceptance criteria (the executor prompt said `multi-currency.test.ts` but the PLAN frontmatter and grep checks reference `country-scope.test.ts`). Named describe blocks around REQ-numbers so failures are immediately traceable to requirements."
  - "Called PaymentService directly for the cross-currency guard test because the payment route accepts a currency field in its JSON schema but does not plumb `request.body.currency` into `paymentService.recordPayment(...)`. Plan 04 summary flagged this as deferred to Plan 05; Plan 05 did not do it. Keeping the test in place at the service layer exercises the guard that Plan 04 added and avoids modifying production route code."
  - "Seeded AR/ES plans directly via Drizzle inserts rather than through POST /plans because `createPlanSchema.body` does not accept `country` — the plan-create endpoint relies on the DB default `AR`. Seeding directly also avoids coupling the test to a future plan-create country parameter."
  - "Did not modify or extend `test/helpers.ts`. All new fixtures (ES branch, AR/ES plans, admin staff per country, AR/ES members) are assembled inside the test file's `beforeAll` using existing helpers. Helpers therefore stay stable for the rest of the suite."
  - "Left 3 failing tests in place intentionally (cross-country member read, member catalog superset, /me/subscription superset). They reveal legitimate gaps in Phases 98 Plans 03-05 and are the automated gate the Phase wanted. Per execution rules, no production code was modified in this plan."
metrics:
  duration: "~65 minutes"
  completed_date: "2026-04-21"
---

# Phase 98 Plan 11: Integration test suite — Summary

Added `el-templo-api/test/country-scope.test.ts` with 13 integration tests
across 7 describe groups. Tests exercise the real Fastify app against the
`eltemplo_test` MySQL DB via `fastify.inject()` and cover RBAC scoping,
cross-country write guards, AR regression, and the mandatory member-app
forward-compat supersets (REQ-98-11).

## Test matrix — what runs

| #   | Group             | Test                                                                            | Status                 |
| --- | ----------------- | ------------------------------------------------------------------------------- | ---------------------- |
| 1   | REQ-98-05 plans   | AR admin GET /admin/subscriptions/plans returns only AR plans                   | PASS                   |
| 2   | REQ-98-05 plans   | ES admin GET /admin/subscriptions/plans returns only ES plans                   | PASS                   |
| 3   | REQ-98-05 plans   | Owner GET /admin/subscriptions/plans?country=ES returns only ES plans           | PASS                   |
| 4   | REQ-98-05 plans   | Owner GET /admin/subscriptions/plans?country=AR returns only AR plans           | PASS                   |
| 5   | REQ-98-05 plans   | Non-owner cannot override country via ?country= (AR admin sees only AR)         | PASS                   |
| 6   | REQ-98-05 members | AR admin GET /admin/members sees only AR members                                | PASS                   |
| 7   | REQ-98-05 members | ES admin GET /admin/members sees only ES members                                | PASS                   |
| 8   | SPEC AC-7         | AR admin cannot read an ES member (403/404 + no ES identifiers leaked)          | **FAIL (reveals gap)** |
| 9   | REQ-98-06         | assignPlan cross-country → 400 "El plan no corresponde"                         | PASS                   |
| 10  | REQ-98-06         | recordPayment cross-currency → throws "moneda distinta" (direct PaymentService) | PASS                   |
| 11  | AR regression     | assignPlan AR→AR returns 201, subscription.currency='ARS'                       | PASS                   |
| 12  | REQ-98-11         | /api/members/subscription/plans superset (expects currency + country)           | **FAIL (reveals gap)** |
| 13  | REQ-98-11         | /api/members/subscription/me/subscription superset (expects currency)           | **FAIL (reveals gap)** |

## Full suite results

```
Test Files  1 failed | 38 passed (39)
Tests       3 failed | 730 passed (733)
Duration    255.27s
```

**No pre-existing AR test regressed.** All 720+ pre-existing tests still
pass. The 3 failures are the new REQ-98-11 and SPEC AC-7 coverage revealing
genuine gaps in Phases 98 Plans 03-05 — exactly what the test suite was
designed to catch.

## Grep acceptance-criteria verification

| Check                             | Need | Got                              | Status |
| --------------------------------- | ---- | -------------------------------- | ------ |
| `it(` count                       | ≥ 9  | 13                               | PASS   |
| `describe(` count                 | ≥ 1  | 7                                | PASS   |
| `"El plan no corresponde"`        | ≥ 1  | 2                                | PASS   |
| `"moneda distinta"`               | ≥ 1  | 2                                | PASS   |
| `country: "ES"` or `seedESBranch` | ≥ 1  | 2                                | PASS   |
| cross-country member read         | ≥ 1  | 7 matches (describe + it + body) | PASS   |
| superset / forward-compat         | ≥ 1  | 7 matches (describe + it + body) | PASS   |

## Pre-existing keys enumerated (REQ-98-11 forward-compat guard)

Derived from reading the CURRENT handlers in
`el-templo-api/src/modules/subscriptions/member-routes.ts` on phase-98
master. Any future PR that renames or removes one of these keys will
break the deployed member app and WILL fail these tests.

### `/api/members/subscription/plans` (member catalog)

Derived from `member-routes.ts` lines 129-140 — the `mapped` return shape
is intentionally narrower than the admin plan shape (no prices; member-safe).

- `id`
- `name`
- `description`
- `planTier`
- `durationDays`
- `classesPerWeek`
- `planCategory`
- `linkedProgramId`
- `goalPlanType`
- `goalPlanZones`

Expected additive (Phase 98): `currency`, `country` — **currently absent**
(see Gap 2 below).

### `/api/members/subscription/me/subscription`

Derived from `member-routes.ts` GET /me/subscription handler lines 76-88.

- `id`
- `planName`
- `planTier`
- `status`
- `startDate`
- `endDate`
- `daysRemaining`
- `pricePaid`
- `planCategory`
- `goalPlanType`
- `multiBranch`

Expected additive (Phase 98): `currency` — **currently absent** (see Gap 3
below).

## Discovered gaps (must be addressed — NOT fixed in this plan)

### Gap 1 — SPEC AC-7: `GET /api/admin/members/:userId` has NO country scope check

**Observed:** AR admin requesting `GET /api/admin/members/:esMemberId`
returns **200 OK** with the ES member's full profile (including email,
DNI, first/last name). This is a cross-country information-disclosure leak.

**Root cause:** `el-templo-api/src/modules/members/routes.ts` lines 255-311
calls `memberService.getMemberById(request.params.userId)` without passing
`request.scope.country`. The service's `getMemberById` (service.ts:257) is
a straight primary-key lookup — no branch-country filter. The Plan 05
summary wired scope into the LIST endpoint only.

**Fix sketch:** In the admin members route's `/:userId` handler, read the
member's branch country and compare against `request.scope.country`. On
mismatch return 404 (hide) or 403 (explicit). Update the service to accept
a scope filter OR wrap the service call at the route layer.

**Threat:** T-98-27 from this plan's STRIDE register — Information
Disclosure: AR admin reading an ES member. Currently not mitigated despite
the disposition claiming `mitigate`.

### Gap 2 — REQ-98-11: Member plans catalog response is not a Phase-98 superset

**Observed:** `GET /api/members/subscription/plans` returns plan rows
without `currency` or `country` fields. The deployed mobile apps therefore
cannot tell an ES plan from an AR one.

**Root cause:** The catalog mapper in `member-routes.ts` lines 129-140
intentionally projects a narrow member-safe shape (no prices). It was not
extended in Plan 05 to include the new `currency` / `country` fields even
though the SPEC REQ-98-11 requires the response to be a superset of the
pre-phase-98 shape.

**Fix sketch:** Add `currency: p.currency` and `country: p.country` to the
`mapped` projection in the catalog route. `PlanListItem` (Plan 04) already
exposes both fields on the service-layer result — only the route mapper
needs the additive line.

### Gap 3 — REQ-98-11: `/me/subscription` response missing `currency`

**Observed:** `GET /api/members/subscription/me/subscription` returns the
pre-phase-98 shape with no `currency`. An ES member would see their sub
with no indication that payments are in EUR.

**Root cause:** The route handler (`member-routes.ts` lines 76-88) maps
the service's `SubscriptionDetail` to an explicit return object and never
added `currency: sub.currency` when Plan 04 extended `SubscriptionDetail`
to include currency.

**Fix sketch:** Add `currency: sub.currency` to the return object literal
in the `/me/subscription` handler. One additive line; no schema/service
change needed.

### Gap 4 (tangential) — Admin plans list Fastify schema strips `country`/`currency`

Not asserted by these tests (the tests compare plan IDs rather than
reading the field off the response), but spotted while auditing:
`subscriptions/schemas.ts` `planSchema` lacks `country`/`currency`
properties. Fastify's `fast-json-stringify` will silently drop them from
the response even though `mapPlanRow` returns them. Any admin UI test
(Plans 07-10) that reads those fields off the admin plan list would find
them undefined. Filter-by-country still works server-side because filter
is query-param driven and the service does the WHERE clause before the
mapper runs.

## Decisions captured

- **Test file naming** — used `country-scope.test.ts` (matches PLAN
  frontmatter's `files_modified`). The executor prompt said
  `multi-currency.test.ts`; I followed the PLAN's grep acceptance criteria.
- **Cross-currency test strategy** — since the payment route accepts a
  `currency` body field in its JSON schema but the handler never plumbs it
  to the service, I instantiated `PaymentService` directly in the test.
  This still exercises the Plan 04 guard (`input.currency !== sub.currency`
  → BadRequestError) and avoids touching route code in a test-only plan.
- **Plan fixture insert via Drizzle** — `POST /plans` doesn't accept
  `country`, so the test file inserts `subscription_plans` rows directly.
  This also avoids coupling the test to a future plan-create country param.
- **Admin plans list assertions** — verified by plan ID membership rather
  than reading `country`/`currency` off each row, because Fastify's JSON
  schema strips those fields (see Gap 4). ID-based assertions are stronger
  — they don't care about serialization — and they prove the country
  filter ran at the DB level.
- **Owner scope-default** — the seeded `admin@test.com` user is
  `branchId=1` (AR). Owner without `?country=` defaults to AR per the
  `attachCountryScope` preHandler. Tests that need ES coverage pass
  `?country=ES` explicitly on owner requests.

## Deviations from Plan

### Rule 3 - Blocking: plan-create endpoint doesn't accept country

The PLAN skeleton's `seedPlan` helper called `.insert(schema.subscriptionPlans).values(...)`
which I followed directly. The ALTERNATIVE would have been to POST to
`/api/admin/subscriptions/plans` — but `createPlanSchema.body` does not
accept `country`, so POST'd ES plans would land with `country='AR'` (DB
default) and fail the filter tests. Direct Drizzle insert is the correct
approach and matches the skeleton's intent.

### Interpretation: Route layer does not plumb currency for recordPayment

The PLAN skeleton assumed the API body's `currency` would flow into
`PaymentService.recordPayment`. Reading `payments/routes.ts` showed the
handler only forwards a fixed set of fields (no currency). Plan 04's
summary flagged this as deferred to Plan 05; Plan 05 did not wire it.
Rather than modify production route code in a test-only plan, I
instantiated `PaymentService` directly. The guard still gets exercised;
the test intent is preserved.

### Non-deviation: 3 failing tests left in place

Per execution rules ("Do NOT fix bugs discovered by failing tests — log
them in SUMMARY"), the 3 failing tests stay red. They are the automated
counterpart to Plan 12's manual UAT and provide the forward-compat gate
the phase requested. Fixing the underlying gaps is out of scope for Plan
11 but is captured in the "Discovered gaps" section above with fix
sketches.

## Out of scope (deferred)

- Gap 1 fix (member GET scope check)
- Gap 2 fix (member catalog currency/country additive)
- Gap 3 fix (/me/subscription currency additive)
- Gap 4 fix (admin plans list JSON schema properties for country/currency)
- Admin UI plan 07-10 integration tests
- Gladius country-scope tests
- Analytics / caja country filtering tests

## Commits

- `9172f28e` test(98-11): add multi-currency integration tests (RBAC +
  cross-country + regression + forward-compat)

## Self-Check: PASSED

Files created (verified via `[ -f … ]`):

- `el-templo-api/test/country-scope.test.ts` — FOUND

Commits (verified via `git log --oneline | grep 9172f28e`):

- `9172f28e` test(98-11): add multi-currency integration tests — FOUND

Grep acceptance: ALL PASS (see grep verification table above).

Test suite: 13 new tests, 10 pass (77%). The 3 failures are the documented
REQ-98-11 / SPEC AC-7 coverage revealing Phase 98 implementation gaps.
Full suite 733 tests, 730 pass — no pre-existing AR regression.
