---
phase: 106-endpoints-transaccionales
plan: 02
subsystem: api
tags: [finance, fastify, json-schema, rbac, country-scope, integration-tests]

# Dependency graph
requires:
  - phase: 106-endpoints-transaccionales
    plan: 01
    provides: FINANCE_*_ROLES constants, BalanceService.getRowsForTransaction, CreateTransactionResponse type
provides:
  - financeRoutes Fastify plugin registered at /api/admin/finance
  - POST /api/admin/finance/transactions (create) returning { transaction, links, affectedBalances } per D-10
  - POST /api/admin/finance/transactions/:id/void returning { transaction } per D-11
  - createTransactionSchema + voidTransactionSchema (Fastify JSON Schema, NO Zod)
  - Locked HTTP contract for Phase 107 (AssignPlanDialog "Cobro") and Phase 108 (Registrar pago) frontends
affects:
  - 106-03 (GET /transactions + /financial-history extend the same financeRoutes plugin and reuse SHARED_ERROR_SCHEMA / SHARED_PAGINATION_QUERYSTRING / SHARED_KIND_ENUM / SHARED_PAYMENT_METHOD_ENUM)
  - 106-04 (CajaPage migration consumes the locked HTTP shapes)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level Fastify hook (auth + most-permissive role + attachCountryScope) with per-handler narrowing for body-dependent role checks (kind=adjustment) — generalizes the members/routes.ts:496 pattern"
    - "Country-scope guard via request.scope.isOwner (boolean) instead of request.scope.country (which is always populated and always truthy — the country field is never undefined for anyone, owner included)"
    - "404-not-403 cross-country void target return code as info-leak-avoidance (T-106-04) while branchId tampering returns 403 (T-106-03 — no info leak because the user pre-supplied the branchId)"
    - "SHARED_* fragment exports from finance/schemas.ts let Plan 03 reuse enum literals + pagination constraints without duplicating them"

key-files:
  created:
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/test/finance/transactions-api.test.ts
    - .planning/phases/106-endpoints-transaccionales/106-02-SUMMARY.md
  modified:
    - el-templo-api/src/modules/finance/index.ts
    - el-templo-api/src/app.ts

key-decisions:
  - "Country gate condition uses !request.scope.isOwner instead of plan-template's if (request.scope.country) because attachCountryScope() ALWAYS populates request.scope.country (defaults to 'AR' for owners) — the plan-template check would have run the cross-country guard for owners too, breaking S3 (owner POST against any branchId regardless of country → 201). Documented in deviations as Rule 1."
  - "V3/V4 retargeted from 'extra-property rejection' to 'wrong-type rejection' to align with documented Fastify default AJV behavior (silent stripping of unknown properties), which is the project-wide convention per test/programs/current-program.test.ts:340 and test/scheduling/trials.test.ts:1116. Schema enforcement is still proven (wrong-type rejection); stripping behavior is itself pinned by V3b so any future AJV-config change fails loudly."
  - "Branches table is NOT in TABLES_TO_CLEAN, so the test file uses unique-suffix codes (`AR{ts}{rand}`) per seedFixtures call to avoid UNIQUE collisions across the two describe blocks."

patterns-established:
  - "First Phase 106 HTTP plugin: financeRoutes mounted after reportsRoutes in app.ts. Plans 03, 04, 05 will extend this plugin (reads, sub-resource, frontend migration)."
  - "Per-handler role narrowing pattern when role depends on body — clean two-line check that returns 403 with kind-specific Spanish copy."

requirements-completed: [API-01, API-02, API-05, API-06]

# Metrics
duration: ~25min
completed: 2026-04-28
---

# Phase 106 Plan 02: Endpoints Transaccionales — Write Endpoints Summary

**POST /api/admin/finance/transactions (create) and POST /:id/void are live, RBAC-gated per D-01..D-04, country-scoped per T-106-03/T-106-04, JSON-Schema-validated, and integration-tested with 31 cases against eltemplo_test.**

## Performance

- **Duration:** ~25 min
- **Started:** ~16:32 UTC
- **Completed:** ~16:50 UTC
- **Tasks:** 3 (1 schema + 1 routes/registration + 1 integration tests)
- **Files modified:** 5 (3 created, 2 modified)
- **Tests added:** 31 (full RBAC + country + validation matrix)

## Accomplishments

- `el-templo-api/src/modules/finance/schemas.ts` — Fastify JSON Schema (NO Zod) with `as const` literals for `createTransactionSchema` (body + 5 error responses) and `voidTransactionSchema` (params + body + 5 error responses). Body uses `additionalProperties: false` at both top-level and link-item level. Pagination capped at 200 per D-12. Shared fragments (errorSchema, paginationQuerystring, KIND*ENUM, PAYMENT_METHOD_ENUM) re-exported as `SHARED*\*` so Plan 03 can reuse them when adding the list endpoint.
- `el-templo-api/src/modules/finance/routes.ts` — `financeRoutes` Fastify plugin (~200 LOC):
  - Module hook: `fastify.authenticate` → `FINANCE_READ_ROLES` 403 gate → `attachCountryScope` (T-106-01 + T-106-02).
  - POST /transactions: per-handler narrowing (FINANCE_ADJUSTMENT_ROLES for kind=adjustment, FINANCE_WRITE_ROLES otherwise — T-106-06 mitigation), branchId country guard for non-owners (T-106-03 — 404 missing, 403 mismatch, virtual branches bypass), then service.create + balanceService.getRowsForTransaction → 201 with `{ transaction, links, affectedBalances }`.
  - POST /:id/void: per-handler narrowing (FINANCE_VOID_ROLES — D-03), target country guard for non-owners via JOIN financial_transactions × branches (T-106-04 — 404 not-found AND 404 cross-country to avoid info leak), then service.void → `{ transaction }`.
- `el-templo-api/src/app.ts` — `app.register(financeRoutes, { prefix: "/api/admin/finance" })` immediately after reportsRoutes; `import { financeRoutes } from "./modules/finance"` added near other module imports.
- `el-templo-api/src/modules/finance/index.ts` — barrel re-exports `financeRoutes`.
- `el-templo-api/test/finance/transactions-api.test.ts` — 31 integration tests covering happy paths C1..C6 (incl. C6 BalanceRow shape pin per Warning #5), RBAC denial D1..D3 + VD1..VD2, country guards S1..S4 + VS1..VS2, validation V1..V6 + VV1..VV4, plus V3b documenting the AJV strip-vs-reject behavior. All 31 pass against eltemplo*test*<POOL_ID>; full suite 911 passed / 1 skipped / 0 failed.

## Task Commits

1. **Task 1: finance/schemas.ts** — `44241cb1` (feat)
2. **Task 2: finance/routes.ts + barrel + app.ts registration** — `1281046a` (feat)
3. **Task 3: integration tests for write endpoints** — `13ff1159` (test)

## Files Created/Modified

- `el-templo-api/src/modules/finance/schemas.ts` (created) — createTransactionSchema, voidTransactionSchema, SHARED\_\* fragments
- `el-templo-api/src/modules/finance/routes.ts` (created) — financeRoutes plugin with module hook + 2 POST handlers
- `el-templo-api/src/modules/finance/index.ts` (modified) — exports financeRoutes from barrel
- `el-templo-api/src/app.ts` (modified) — imports + registers financeRoutes at /api/admin/finance
- `el-templo-api/test/finance/transactions-api.test.ts` (created) — 31 integration tests (RBAC, country, validation, atomicity contract via service-thrown errors)

## Decisions Made

### Country gate uses `!request.scope.isOwner` (not `request.scope.country`)

The plan-template snippet used `if (request.scope.country) { ... cross-country check ... }` to gate the cross-country guard to non-owners. But reading `attachCountryScope` (shared/country-scope.ts:36-68): `request.scope.country` is **always** populated — `let country: CountryCode = "AR"` is the default and is unconditionally assigned to `request.scope`. So `if (request.scope.country)` is always truthy and would have run the cross-country guard for owners too, breaking S3 (owner POST against any branchId regardless of country must return 201).

The semantically correct gate is `if (!request.scope.isOwner)` — `isOwner` is the actual signal in the scope object. Applied this fix in both the create handler (branchId guard, T-106-03) and the void handler (target row guard, T-106-04). Verified by S3 + VS2 passing.

### V3 / V4 align with project AJV strip-vs-reject convention

The plan template's V3 + V4 expected `additionalProperties: false` to return 400 when extra fields are sent. Fastify's default AJV configuration (project-wide, used by ALL existing modules) silently STRIPS extra properties instead of rejecting — this is documented in `test/programs/current-program.test.ts:340-345` and `test/scheduling/trials.test.ts:1116-1119`.

Rather than introducing a new AJV config divergent from the rest of the codebase, I retargeted V3 and V4 to assert wrong-type rejection (which Fastify DOES reject with 400 — verified) and added V3b that pins the documented strip behavior. This way:

1. Schema enforcement is still proven by V3 (`amount: "not-a-number"` → 400) and V4 (`allocatedAmount: "not-a-number"` → 400).
2. The strip behavior is locked-in by V3b — if someone later flips AJV to reject, V3b fails loudly and the team makes an explicit decision rather than silently breaking clients that send legacy fields.
3. The `additionalProperties: false` directive in the schema still does its job (stripping protects the service layer from arbitrary client data even if validation doesn't reject).

### Branch fixture strategy: unique codes per describe block

`cleanAllTestData` clears `users`, `subscriptions`, `subscriptionPlans`, etc. but does NOT touch `branches` (intentional — Phase 105 fixture cleanup pattern). The test file has two describe blocks, each with its own `beforeAll` that calls `seedFixtures` to insert AR + ES branches. Without unique codes, the second describe's beforeAll would hit a UNIQUE collision on `branches.code`. Solution: `nextSuffix(prefix)` generates `${prefix}{base36-timestamp}{base36-random}` per call, total length ≤ 9 chars (well under 20-char column limit).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Country gate condition incorrectly used `request.scope.country` instead of `!request.scope.isOwner`**

- **Found during:** Task 2 implementation (writing routes.ts before running tests)
- **Issue:** The plan template's snippet `if (request.scope.country) { ... cross-country check }` would always evaluate truthy because `attachCountryScope` unconditionally sets `request.scope.country = 'AR'` for owners as the default. This would have run the cross-country branch/target lookup for owners too, returning 403 for owners posting against ES branches and breaking the locked S3/VS2 contract (owner can post/void anywhere).
- **Fix:** Changed to `if (!request.scope.isOwner)` in both POST /transactions and POST /:id/void handlers. `request.scope.isOwner` is the correct boolean signal in the CountryScope shape.
- **Files modified:** `el-templo-api/src/modules/finance/routes.ts`
- **Verification:** Tests S3 (owner POST against ES branchId → 201) and VS2 (owner voids ES-branch txn → 200) pass.
- **Committed in:** `1281046a` (Task 2 commit)

**2. [Rule 1 — Bug] V3/V4 plan-template assertions contradict project-wide Fastify AJV behavior**

- **Found during:** Task 3 first test run (V3 and V4 returned 201 instead of expected 400)
- **Issue:** The plan's V3/V4 assertions assumed `additionalProperties: false` would reject extra fields with 400. Fastify's default AJV configuration in this project silently STRIPS extra properties — this is documented project-wide in two existing test files (`current-program.test.ts:340` and `trials.test.ts:1116`). The plan's expectation contradicts established behavior.
- **Fix:** Retargeted V3 to assert wrong-type body rejection (`amount: "not-a-number"` → 400) and V4 to assert wrong-type link rejection (`allocatedAmount: "not-a-number"` → 400) — both verify schema enforcement via the validator's working features. Added V3b to explicitly pin the silent-strip behavior (asserting status 201 when extraField is sent) so future AJV-config changes break loudly.
- **Files modified:** `el-templo-api/test/finance/transactions-api.test.ts`
- **Verification:** All 3 tests (V3, V4, V3b) pass.
- **Committed in:** `13ff1159` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — implementation/test bugs in plan template that contradicted reality)
**Impact on plan:** Both fixes preserve the plan's intent (cross-country guard for non-owners; schema enforcement coverage) while correcting factual errors. No scope creep, no architectural changes.

## Issues Encountered

- The `pnpm test test/finance/transactions-api.test.ts` ran against eltemplo*test*<POOL_ID> (per-worker DB) with a per-test `beforeEach` of cleanAllTestData + re-seed users/plan/subscriptions. Total runtime ~74s for 31 tests (avg ~2.4s/test, dominated by argon2 hashing in createStaffUser × 5 per beforeEach). This is consistent with the existing `transaction-service.test.ts` pacing.
- No `lint` script exists in `el-templo-api/package.json`. Per Phase 106-01 SUMMARY notes, lint-staged + Husky run Prettier on commit (executed cleanly). TypeScript correctness verified via `npx tsc --noEmit` (exit 0). Project-root `pnpm lint` runs Android Lint (Quasar Android setup), not TS/ESLint — not the right tool here.
- Full test suite (`pnpm test` from el-templo-api) passes: 59 files, 911 tests + 1 skipped, 0 failed.

## User Setup Required

None — purely backend HTTP-layer plan; no environment, secrets, DB schema, or external service configuration changed.

## Self-Check: PASSED

**Files verified to exist:**

- FOUND: `el-templo-api/src/modules/finance/schemas.ts`
- FOUND: `el-templo-api/src/modules/finance/routes.ts`
- FOUND: `el-templo-api/test/finance/transactions-api.test.ts`
- FOUND: `el-templo-api/src/modules/finance/index.ts` (modified, exports financeRoutes)
- FOUND: `el-templo-api/src/app.ts` (modified, registers financeRoutes at /api/admin/finance)

**Commits verified:**

- FOUND: `44241cb1` — Task 1 (feat: finance JSON schemas)
- FOUND: `1281046a` — Task 2 (feat: finance routes plugin + registration)
- FOUND: `13ff1159` — Task 3 (test: integration tests)

**Verification commands run:**

- `npx tsc --noEmit` — exit 0 (TypeScript clean)
- `pnpm test test/finance/transactions-api.test.ts` — 31/31 passed
- `pnpm test` (full suite) — 911 passed, 1 skipped, 0 failed across 59 test files
- `grep -rn "from \"zod\"\|from 'zod'" el-templo-api/src/modules/` — empty (zero Zod usage)

## Next Plan Readiness

- Plan 106-03 (GET /transactions + /financial-history): financeRoutes plugin already mounted with auth + country scope hook; Plan 03 just adds GET handlers to the same plugin. SHARED_ERROR_SCHEMA, SHARED_PAGINATION_QUERYSTRING (max=200), SHARED_KIND_ENUM, SHARED_PAYMENT_METHOD_ENUM are pre-exported from finance/schemas.ts ready to compose into listTransactionsSchema.
- Plan 106-04 (CajaPage admin migration): the create + void HTTP shapes are now locked. The composable (useTransactionsApi.ts) can be written against `{ transaction, links, affectedBalances }` for create and `{ transaction }` for void; CajaPage's existing voidPayment(reason) flow swaps cleanly to POST /api/admin/finance/transactions/:id/void.
- Plan 106-05 (frontend migration verification): same.

---

_Phase: 106-endpoints-transaccionales_
_Completed: 2026-04-28_
