---
phase: 98-multi-currency-and-country-scoped-plans
plan: 03
subsystem: server-enforcement
tags: [fastify-hook, preHandler, country-scope, multi-currency]
requires:
  - "phase 98 plan 02 (attachCountryScope preHandler exists at src/modules/shared/country-scope.ts)"
provides:
  - "request.scope populated on every route inside members, subscriptions (admin + member), payments, reports, analytics, and gladius /admin/products plugins"
  - "Single wiring point for non-owner country enforcement — no plan after 03 touches plugin registration"
affects:
  - "Plans 04-06 (service-layer scoping can safely destructure request.scope)"
  - "Plan 11 (integration tests exercise the full hook chain end-to-end)"
tech_stack:
  added: []
  patterns:
    - "Append-to-existing-onRequest-hook (matches PATTERNS.md §2, canonical payments/routes.ts shape)"
    - "Per-route preHandler scope attach (gladius divergence — public routes coexist with admin routes in same plugin)"
key_files:
  modified:
    - "el-templo-api/src/modules/members/routes.ts"
    - "el-templo-api/src/modules/subscriptions/routes.ts"
    - "el-templo-api/src/modules/subscriptions/member-routes.ts"
    - "el-templo-api/src/modules/payments/routes.ts"
    - "el-templo-api/src/modules/reports/routes.ts"
    - "el-templo-api/src/modules/analytics/routes.ts"
    - "el-templo-api/src/modules/gladius/routes.ts"
decisions:
  - 'Followed PATTERNS.md §2 (append to existing onRequest hook, one block per plugin) over the executor prompt''s suggestion to add a second preHandler hook. The plan''s acceptance criterion test $(grep -c ''addHook("onRequest"'' ...) -eq 1 disambiguates this — a second hook would have failed that check.'
  - "Gladius plugin required a per-route divergence: its public product/inquire endpoints (listPublishedProducts, getProductBySlug, submitInquiry) must remain unauthenticated, so no plugin-level addHook could be added. Scope is attached inside each admin handler after the inline OWNER_ROLES check — preserving the plugin's existing per-route auth shape."
  - "Confirmed promo-plans routes live inside subscriptions/routes.ts (8 matches for '/promo-plans' — list, create, patch, deactivate). The single subscriptions plugin registration covers them transitively."
metrics:
  duration: "~15 minutes"
  completed_date: "2026-04-21"
---

# Phase 98 Plan 03: Register attachCountryScope on all 7 country-scoped route plugins — Summary

Wired `attachCountryScope` into the onRequest hook chain of every country-scoped
Fastify plugin so that `request.scope = { country, isOwner }` is available on
every route handler before Plans 04-06 begin consuming it in service layers.

## Files modified (7 total)

All 7 files show `attachCountryScope` count = 2 (import + call) except gladius
which shows 5 (import + 4 per-route calls — see divergence note below).

| File                                         | Import line | Hook/call lines                    | addHook("onRequest") count | attachCountryScope count |
| -------------------------------------------- | ----------- | ---------------------------------- | -------------------------- | ------------------------ |
| `src/modules/members/routes.ts`              | 48          | authenticate L86 → scope L93       | 1                          | 2                        |
| `src/modules/subscriptions/routes.ts`        | 54          | authenticate L76 → scope L85       | 1                          | 2                        |
| `src/modules/subscriptions/member-routes.ts` | 16          | authenticate L31 → scope L32       | 1                          | 2                        |
| `src/modules/payments/routes.ts`             | 27          | authenticate L36 → scope L43       | 1                          | 2                        |
| `src/modules/reports/routes.ts`              | 33          | authenticate L42 → scope L49       | 1                          | 2                        |
| `src/modules/analytics/routes.ts`            | 21          | authenticate L30 → scope L37       | 1                          | 2                        |
| `src/modules/gladius/routes.ts`              | 29          | scope L166,181,197,219 (per-route) | 0 (divergent)              | 5                        |

**Hook-order evidence (bash-verified):** every plugin's `attachCountryScope` line
number is strictly greater than its `fastify.authenticate` line number. For the
6 non-gladius plugins, the role guard is between authenticate and scope inside
the same `onRequest` hook body; for gladius, the role guard is inside the
handler above the scope call — so role check also precedes scope attach in all
cases.

## Promo-plans coverage (explicit confirmation)

Grep of `/promo-plans` in `el-templo-api/src/modules/subscriptions/routes.ts`
returns **8 hits** (lines 447, 454, 467, 484 route definitions + inline
comments). No separate `promo-plans/routes.ts` file exists. The single
subscriptions plugin registration covers every `/promo-plans*` endpoint
transitively — matches the grep evidence cited in CONTEXT §promo_plans_resolution
and PLAN §action.

## Deviations from Plan

### Rule 3 - Blocking issue: gladius/routes.ts has no plugin-level onRequest hook

**Found during:** Task 1 — reading gladius/routes.ts to locate its onRequest
block.

**Issue:** Unlike the other 6 plugins, gladius mixes public routes (GET
`/products`, GET `/products/:slug`, POST `/inquire`) with admin routes (the 4
under `/admin/products`) inside the same plugin. Public routes have NO auth at
all — they must remain accessible without a JWT. Adding a plugin-level
`fastify.addHook("onRequest", ...)` that calls `fastify.authenticate` and
`attachCountryScope` would break the public endpoints by requiring auth on
every request, including anonymous shop browsing.

**Fix:** Followed gladius's existing per-route preHandler convention. On each
of the 4 admin routes (GET/POST/PUT/DELETE `/admin/products[/:id]`), appended
`await attachCountryScope(request, fastify.db)` inside the handler, AFTER the
inline `OWNER_ROLES` role check (matching PATTERNS.md §2 ordering requirement)
and BEFORE the service call. Public routes are untouched — they never need
`request.scope` because they list published products country-agnostic or
submit a public inquiry.

**Alternative considered:** route-scoped preHandler arrays (
`preHandler: [fastify.authenticate, attachCountryScopeBound]`). Rejected
because `attachCountryScope` has signature `(request, db)` not the Fastify
preHandler shape `(request, reply)`, so it would need a wrapping closure per
route — strictly more code than a single in-handler await per route.

**Files:** `el-templo-api/src/modules/gladius/routes.ts`
**Covered in commit:** `2c9ea1e4`

### Interpretation note: PATTERNS §2 vs executor prompt re: hook phase

The executor prompt suggested registering as a separate `fastify.addHook('preHandler', attachCountryScope)` hook. PATTERNS.md §2 and the plan's `<action>` block both specify appending to the existing `onRequest` hook body. The plan's acceptance criterion

```
test $(grep -c 'addHook("onRequest"' ...) -eq 1
```

requires exactly ONE onRequest hook per file — a separate preHandler hook would
have passed this check too, but PATTERNS.md §2 is explicit: "Do not introduce a
second addHook; keep one block per plugin (matches existing convention)."

Followed PATTERNS.md. Zero new addHook calls introduced; the existing blocks
are extended in place.

## Acceptance criteria — all met

| Check                                                                                                  | Result      | Expected | Status |
| ------------------------------------------------------------------------------------------------------ | ----------- | -------- | ------ |
| `grep -q "attachCountryScope"` in each of the 7 files                                                  | 7/7         | 7        | OK     |
| `grep -q 'from "../shared/country-scope"'` in each of the 7 files                                      | 7/7         | 7        | OK     |
| `grep -c 'addHook("onRequest"' ...` == 1 for 6 hook-using plugins                                      | 1,1,1,1,1,1 | 1 each   | OK     |
| `grep -c 'addHook("onRequest"' gladius/routes.ts` == 0 (divergent per-route pattern, documented above) | 0           | 0        | OK     |
| `cd el-templo-api && pnpm tsc --noEmit`                                                                | exit 0      | exit 0   | OK     |
| `grep -c '/promo-plans' subscriptions/routes.ts` ≥ 3                                                   | 8           | ≥ 3      | OK     |
| `authenticate` line < `attachCountryScope` line in all 6 hook plugins                                  | 6/6         | 6        | OK     |
| Gladius: role check line < scope line on all 4 admin routes                                            | 4/4         | 4        | OK     |

## Out of scope (untouched per plan)

- `attachCountryScope` implementation in `src/modules/shared/country-scope.ts` — Plan 02 owns it.
- Service-layer scope consumption (`request.scope.country` plumbing into filters) — Plans 04-06 own it.
- Service-layer cross-country / cross-currency write guards — Plan 05.
- Integration tests for the RBAC + cross-country matrix — Plan 11.
- Frontend `formatPrice` migration — Plans 04, 07-10.
- `pnpm db:generate` or schema drift — Plans 01-02 handled schemas.

## Public-route note (for Plan 11 test planner)

Gladius has 3 public endpoints that do NOT call `attachCountryScope`:

- `GET /gladius/products` — listPublishedProducts
- `GET /gladius/products/:slug` — getProductBySlug
- `POST /gladius/inquire` — submitInquiry

Plan 11's integration tests should NOT assert `request.scope` on these; they
are intentionally country-agnostic. If a future plan decides gladius shop
inventory should be country-scoped on the public side, that is a new decision
out of scope for Phase 98.

## Self-Check: PASSED

Files modified (verified via grep — each returns attachCountryScope count ≥ 2):

- `el-templo-api/src/modules/members/routes.ts` — FOUND (count 2)
- `el-templo-api/src/modules/subscriptions/routes.ts` — FOUND (count 2)
- `el-templo-api/src/modules/subscriptions/member-routes.ts` — FOUND (count 2)
- `el-templo-api/src/modules/payments/routes.ts` — FOUND (count 2)
- `el-templo-api/src/modules/reports/routes.ts` — FOUND (count 2)
- `el-templo-api/src/modules/analytics/routes.ts` — FOUND (count 2)
- `el-templo-api/src/modules/gladius/routes.ts` — FOUND (count 5; 1 import + 4 per-route calls)

Commits (verified via `git log --oneline`):

- `2c9ea1e4` feat(98-03): register attachCountryScope preHandler on all 7 country-scoped route plugins — FOUND

TypeScript: `cd el-templo-api && pnpm tsc --noEmit` exit 0 (no output).
