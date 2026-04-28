---
phase: 106-endpoints-transaccionales
plan: 03
subsystem: api
tags:
  [
    finance,
    fastify,
    json-schema,
    pagination,
    country-scope,
    integration-tests,
    summary-aggregator,
  ]

# Dependency graph
requires:
  - phase: 106-endpoints-transaccionales
    plan: 01
    provides: TransactionService.list, FINANCE_READ_ROLES, PaginatedResult
  - phase: 106-endpoints-transaccionales
    plan: 02
    provides: financeRoutes plugin (with module hook), SHARED_* schema fragments
provides:
  - GET /api/admin/finance/transactions (paginated list — D-12)
  - GET /api/admin/finance/transactions/summary (CajaPage legacy summary — D-16)
  - listTransactionsSchema + transactionsSummarySchema (JSON Schema with country querystring)
  - TransactionService.getSummary(filters) — aggregated revenue by method + branch
  - FinanceSummary + FinanceSummaryFilters types
  - Locked HTTP READ contract for Plan 05 (CajaPage frontend swap)
affects:
  - 106-04 (members financial-history — independent of this plan, runs in parallel)
  - 106-05 (frontend admin migration of CajaPage — consumes both new GET endpoints)
  - 106-06 (verifier checks the country querystring is honored)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Owner-aware country resolution: owner with ?country=XX filters to that country; owner without ?country sees ALL countries; non-owners LOCKED to request.scope.country (query.country silently ignored — T-106-02 mitigation). This pattern diverges from a naïve `request.scope.country` pin because attachCountryScope unconditionally defaults scope.country='AR' for owners (Plan 02 SUMMARY decision)."
    - "Loose response schema (no additionalProperties on response objects) with documented inline rationale — service-produced shapes are trusted; Phase 109 audit gate is the comment block in schemas.ts."
    - "isNull(...) drizzle predicate for the void exclusion in summary aggregation."
    - "Triple GROUP BY query strategy: 1× SUM for monthlyRevenue + 1× GROUP BY paymentMethod + 1× GROUP BY branchId (ORDER BY revenue DESC). Each query uses the same JOIN chain so country/branchId/date filters resolve identically."
    - "Test isolation: financial_transactions / transaction_links / balances aren't in TABLES_TO_CLEAN, so the summary describe block clears them explicitly in beforeEach. The list describe block doesn't need this because INNER JOIN to users excludes rows with orphan memberId (cleanAllTestData wipes non-admin users)."

key-files:
  created:
    - .planning/phases/106-endpoints-transaccionales/106-03-SUMMARY.md
  modified:
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/index.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/test/finance/transaction-service.test.ts
    - el-templo-api/test/finance/transactions-api.test.ts

key-decisions:
  - "Owner-without-?country sees ALL countries (no country filter applied), not the default-AR derived by attachCountryScope. Otherwise LS2 (owner GET no country query → both countries) cannot pass — see Deviations Rule 1 #1 below for why this differs from a naïve scope.country pin."
  - "Loose response schema convention: matches reports/schemas.ts loose-passthrough pattern. Properties listed for documentation/IDE autocomplete; additionalProperties intentionally omitted on response objects. Service produces trusted shapes (TransactionListItem from Plan 01; FinanceSummary defined here)."
  - "revenueByMethod widened to 5 keys (cash/transfer/card/aura_credit/internal) per Phase 106 enum. Frontend Plan 05 widens its TS type to match. Legacy 3-key dropdown stays in CajaPage UI per PATTERNS.md decision 4 (full UI widening is Phase 109)."
  - "LV5 (and SUV1) document Fastify default AJV strip-vs-reject behavior for unknown query params, mirroring the project-wide convention from Plan 02's V3b. Schema enforcement is still proven via wrong-type rejection (LV1-LV4 + SUV1)."
  - "Test isolation: GET /transactions/summary describe block adds explicit DELETE for finance tables (not in TABLES_TO_CLEAN); the list describe block didn't need this because INNER JOIN users filters out rows with orphan memberId."

patterns-established:
  - "First Phase 106 read endpoints with the locked owner-aware country querystring contract — Plan 05 frontend migration is now a thin swap of usePaymentsApi → useTransactionsApi."
  - "Service.getSummary aggregator returning legacy frontend shape (preserves Plan 05 zero-churn frontend swap)."

requirements-completed: [API-04, API-07]

# Metrics
duration: ~50min
completed: 2026-04-28
---

# Phase 106 Plan 03: Endpoints Transaccionales — Read Endpoints Summary

**GET /api/admin/finance/transactions (paginated list — D-12) and GET /api/admin/finance/transactions/summary (legacy CajaPage shape — D-16) are live, country-scoped per T-106-02 with owner-only override via `?country=XX` (Blocker #1 mitigated), JSON-Schema-validated, and integration-tested with 28 new cases against eltemplo_test (full el-templo-api suite: 948 passed / 1 skipped / 0 failed).**

## Performance

- **Duration:** ~50min
- **Started:** ~16:50 UTC
- **Completed:** ~17:25 UTC
- **Tasks:** 4 (1 schemas + 1 service-aggregator-with-tests + 1 list-handler-with-tests + 1 summary-handler-with-tests)
- **Files modified:** 7 (1 created summary, 6 modified across api + tests)
- **Tests added:** 28 (9 service SUM + 19 list integration + 9 summary integration; total 50 in transactions-api.test.ts after Plan 03 vs 31 after Plan 02)

## Accomplishments

- `el-templo-api/src/modules/finance/schemas.ts` — Appended **listTransactionsSchema** + **transactionsSummarySchema** (Fastify JSON Schema, NO Zod). BOTH querystrings include the owner-only `country: { type: "string", minLength: 2, maxLength: 2 }` field per the locked CajaPage.vue:521-530 contract. `additionalProperties: false` on both querystrings (T-106-05 / T-106-07). Loose response with documented passthrough rationale on both schemas (Warning #4 fix).
- `el-templo-api/src/modules/finance/types.ts` — Appended **FinanceSummary** (legacy CajaPage shape, revenueByMethod widened to 5 keys) + **FinanceSummaryFilters**.
- `el-templo-api/src/modules/finance/index.ts` — Barrel re-exports the two new types.
- `el-templo-api/src/modules/finance/transaction-service.ts` — Appended **getSummary(filters)** method aggregating `direction='inflow' AND voided_at IS NULL` rows. Three GROUP BY queries against the same JOIN chain: monthlyRevenue (single SUM), revenueByMethod (GROUP BY paymentMethod, 5 keys default 0), revenueByBranch (GROUP BY branchId, ORDER BY SUM(amount) DESC). Added `isNull` to drizzle imports.
- `el-templo-api/src/modules/finance/routes.ts` — Appended **GET /transactions** + **GET /transactions/summary** handlers to financeRoutes (after the void handler, inside the same plugin). Both use the owner-aware country resolution: owner with `?country=XX` filters to that country, owner without `?country` applies no country filter (sees all), non-owners are LOCKED to `request.scope.country` (query.country silently ignored — T-106-02 mitigation). Module hook from Plan 02 still applies authenticate + FINANCE_READ_ROLES + attachCountryScope for both new handlers.
- `el-templo-api/test/finance/transaction-service.test.ts` — Appended `describe("TransactionService.getSummary()")` with 9 tests (SUM1..SUM9): shape, sum semantics, voided + outflow exclusion, country filter, branchId filter, dateFrom/dateTo filter, revenueByMethod bucketing, revenueByBranch DESC ordering.
- `el-templo-api/test/finance/transactions-api.test.ts` — Appended TWO new top-level describe blocks: `describe("Finance API — GET /transactions")` (19 tests: L1-L10 + LD1-LD2 + LS1-LS2 + LV1-LV5) and `describe("Finance API — GET /transactions/summary")` (9 tests: SU1-SU6 + SUD1 + SUS1 + SUV1).

## Task Commits

1. **Task 1: schemas + types + barrel** — `57c8c493` (feat)
2. **Task 2: TransactionService.getSummary + 9 SUM service tests** — `05154e28` (feat)
3. **Task 3a: GET /transactions handler + 19 list integration tests** — `5ee2175d` (feat)
4. **Task 3b: GET /transactions/summary handler + 9 summary integration tests** — `b200cca7` (feat)

## Files Modified

- `el-templo-api/src/modules/finance/schemas.ts` — listTransactionsSchema + transactionsSummarySchema (with country querystring)
- `el-templo-api/src/modules/finance/types.ts` — FinanceSummary + FinanceSummaryFilters
- `el-templo-api/src/modules/finance/index.ts` — barrel exports the two new types
- `el-templo-api/src/modules/finance/transaction-service.ts` — getSummary aggregator
- `el-templo-api/src/modules/finance/routes.ts` — GET /transactions + GET /transactions/summary handlers
- `el-templo-api/test/finance/transaction-service.test.ts` — 9 SUM tests
- `el-templo-api/test/finance/transactions-api.test.ts` — 28 new integration tests (19 list + 9 summary)

## Decisions Made

### Owner-without-?country sees ALL countries (no country filter)

The plan's LS2 acceptance test ("owner GET (no `?country`) → list contains rows from both countries") cannot pass if the handler pins the country filter to `request.scope.country`. `attachCountryScope` (shared/country-scope.ts:44) unconditionally sets a default `country = 'AR'` for owners and overrides with the owner's branch country if no `?country` query is supplied — so a naïve `country = scope.country` would always restrict owner-no-query to AR-only.

This mirrors Plan 02's same insight: the country gate uses `!request.scope.isOwner` as the discriminator, not `scope.country` itself. Final logic in BOTH GET handlers:

```typescript
let country: string | undefined;
if (request.scope.isOwner) {
  country = request.query.country
    ? request.query.country.toUpperCase()
    : undefined;
} else {
  country = request.scope.country;
}
```

This satisfies LS2 (owner sees both), L8/L9 (owner ?country=AR/ES filters), L10/SU6 (non-owner query.country ignored — pinned to scope.country), LS1/SUS1 (non-owner without query is scoped to their country).

### Test isolation: explicit finance-table cleanup in summary describe block

`cleanAllTestData` does NOT touch `financial_transactions`, `transaction_links`, or `balances` (none are in `TABLES_TO_CLEAN`). Across describe blocks, these rows accumulate. The list describe block masks this because the row query uses `INNER JOIN users` — when `cleanAllTestData` deletes non-admin users, transactions referencing those (now-orphan) memberIds are excluded from the join and from `total`.

The summary aggregator deliberately does NOT join users (D-16 only filters on branches.country + financial_transactions columns). Without the explicit cleanup, prior test runs' rows would leak into the SUM totals. The summary describe block's `beforeEach` adds `DELETE FROM transaction_links/financial_transactions/balances` (with `SET FOREIGN_KEY_CHECKS=0` for safety).

This is the correct fix because:

1. Adding the three tables to TABLES_TO_CLEAN globally would change the cleanup contract for all 59 test files (out of scope, risk of regressions).
2. The list describe block's natural FK-via-JOIN filtering is fine — no need to change it.
3. The summary scope is well-bounded — only this describe block needs the deeper cleanup.

### Loose response schema with documented gate (Warning #4)

Both new schemas use the project-wide reports/schemas.ts loose-response pattern: `properties: { ... }` listed on the 200 response for IDE/documentation but no `additionalProperties: false`. Service-produced shapes (TransactionListItem, FinanceSummary) are trusted at the type-system layer. The inline comments in schemas.ts make this explicit so a future Phase 109 audit knows the gate to flip. No new convention introduced.

### LV5 / SUV1: AJV strip-vs-reject documented contract

Plan 02 established that Fastify's default AJV STRIPS unknown body fields rather than rejecting them (V3b). The same default applies to querystring validation. Rather than introduce a new AJV config divergent from the codebase, LV5 (`?evil=1`) asserts the strip behavior (200 response, the field is dropped before reaching the handler) and SUV1 asserts wrong-type rejection (`branchId=abc` → 400). This locks BOTH the documented behavior AND schema enforcement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Naïve country pin would break LS2 / SU "owner sees all" assertions**

- **Found during:** Task 3a first test run (LS2 failed with `expected false to be true` on `branchIds.has(esBranchId)`)
- **Issue:** Plan template's snippet pinned country via `request.scope.isOwner && request.query.country ? request.query.country.toUpperCase() : request.scope.country`. But `attachCountryScope` always sets `request.scope.country` (defaulting to 'AR' for owners). So owner-with-no-?country evaluated to `request.scope.country = 'AR'` and the handler restricted owner GETs to AR-only — contradicting the LS2 / SUS1 assertion that owner sees both countries by default.
- **Fix:** Restructured the resolution to `let country = isOwner ? (query.country?.toUpperCase() ?? undefined) : scope.country`. Owner without query → undefined country filter (no filter applied at the service layer). Owner with query → that country. Non-owner → scope.country (always set by hook).
- **Files modified:** `el-templo-api/src/modules/finance/routes.ts` (both GET handlers)
- **Verification:** LS2, L8, L9, L10, SU4, SU5, SU6, SUS1 all pass. Mirrors the Plan 02 `!isOwner` pattern.
- **Committed in:** `5ee2175d` (Task 3a) — Task 3b reuses the same pattern from the start.

**2. [Rule 1 — Bug] seedNArTxns helper used basePayload defaults that violated TXN-06 sum invariant**

- **Found during:** Task 3a first test run (12 tests failed with "La suma de los montos asignados no coincide con el monto de la transaccion")
- **Issue:** `basePayload(ctx, { amount: 1000+i })` keeps the default link `[{ targetId: subArId, allocatedAmount: 10000 }]`. Sum of 10000 ≠ amount of 1000+i, and TransactionService.create rejects the transaction.
- **Fix:** seedNArTxns now (a) seeds a fresh subscription per iteration after the first (UNIQUE on transaction_links forbids duplicate (transaction_id, target_kind, target_id) but each new transaction has a different transaction_id, so the constraint is per-tx — but reusing the same subscription across many transactions still works for a single tx; the iteration creates one tx per sub for clarity), and (b) overrides `links` with `allocatedAmount === amount`. L3 and L4 also have similar manual link-override fixes.
- **Files modified:** `el-templo-api/test/finance/transactions-api.test.ts`
- **Verification:** All 19 list integration tests pass.
- **Committed in:** `5ee2175d` (Task 3a)

**3. [Rule 1 — Bug] Summary aggregates leaked across describe blocks (test isolation)**

- **Found during:** Task 3b first test run (7 SU tests failed with totals like 180513 instead of 1000)
- **Issue:** `cleanAllTestData` doesn't clean `financial_transactions`, `transaction_links`, or `balances`. The list describe block worked because INNER JOIN users masks orphan-FK rows; the summary describe block's aggregator doesn't join users so prior tests' rows leaked into SUM totals.
- **Fix:** Added explicit `DELETE FROM` for the three tables in the summary describe block's `beforeEach` (with `SET FOREIGN_KEY_CHECKS=0` for safety).
- **Files modified:** `el-templo-api/test/finance/transactions-api.test.ts`
- **Verification:** All 9 summary integration tests pass; full el-templo-api suite stays green at 948/948.
- **Committed in:** `b200cca7` (Task 3b)

---

**Total deviations:** 3 auto-fixed (all Rule 1). All three are implementation/test fixture bugs in the plan template that contradicted runtime reality. No scope creep, no architectural changes, no contract changes — the locked HTTP shapes and country querystring contract are intact.

## Issues Encountered

- No `lint` script in `el-templo-api/package.json` (per Plan 02 SUMMARY note); used `npx tsc --noEmit` for type-check enforcement (exit 0). Husky+lint-staged runs Prettier on commit (which executed cleanly on all four commits).
- Pre-commit Prettier reformatted some long lines in routes.ts and the test file; the resulting diff is purely whitespace and was committed as part of the task commits.
- Full test suite duration ~7min (948 tests) — within expected pacing; no new slow paths introduced.

## User Setup Required

None — purely backend HTTP-layer plan; no environment, secrets, DB schema, or external service configuration changed.

## Country Querystring Contract (for Plan 06 verifier)

Both new GET endpoints accept an OPTIONAL `country` querystring on their JSON Schema. The handler enforces the owner-only semantics:

- `GET /api/admin/finance/transactions?country=XX`
- `GET /api/admin/finance/transactions/summary?country=XX`

Where `XX` is a 2-letter ISO country code (validated by `{ type: "string", minLength: 2, maxLength: 2 }`). The handler:

- For owners: uses `request.query.country.toUpperCase()` if present, otherwise applies no country filter (sees all countries).
- For non-owners: silently ignores `request.query.country` and pins to `request.scope.country` set by `attachCountryScope`.

This contract is the basis for Plan 05's frontend migration — `usePaymentsApi.getFinancialSummary(branchId, dateFrom, dateTo, country)` and `usePaymentsApi.listPayments(... country?)` map directly to the new endpoints with no shape changes.

## Self-Check: PASSED

**Files verified to exist:**

- FOUND: `el-templo-api/src/modules/finance/schemas.ts` (+ listTransactionsSchema + transactionsSummarySchema)
- FOUND: `el-templo-api/src/modules/finance/types.ts` (+ FinanceSummary + FinanceSummaryFilters)
- FOUND: `el-templo-api/src/modules/finance/index.ts` (barrel re-exports two new types)
- FOUND: `el-templo-api/src/modules/finance/transaction-service.ts` (+ getSummary)
- FOUND: `el-templo-api/src/modules/finance/routes.ts` (+ GET /transactions + GET /transactions/summary)
- FOUND: `el-templo-api/test/finance/transaction-service.test.ts` (+ 9 SUM tests)
- FOUND: `el-templo-api/test/finance/transactions-api.test.ts` (+ 28 GET tests)

**Commits verified:**

- FOUND: `57c8c493` — Task 1 (feat: schemas + types)
- FOUND: `05154e28` — Task 2 (feat: getSummary + tests)
- FOUND: `5ee2175d` — Task 3a (feat: GET /transactions + tests)
- FOUND: `b200cca7` — Task 3b (feat: GET /transactions/summary + tests)

**Verification commands run:**

- `npx tsc --noEmit` — exit 0 (TypeScript clean)
- `pnpm test test/finance/transaction-service.test.ts` — 41/41 passed
- `pnpm test test/finance/transactions-api.test.ts` — 59/59 passed
- `pnpm test` (full el-templo-api suite) — 948 passed, 1 skipped, 0 failed across 59 files
- `grep -rn "from \"zod\"\|from 'zod'" src/modules/finance/` — empty (zero Zod usage)
- `grep -c "fastify.get" src/modules/finance/routes.ts` — 2 (list + summary)
- `grep -c "request.scope.isOwner" src/modules/finance/routes.ts` — 4 (Plan 02 create + void + Plan 03 list + summary)
- `grep -cE 'country: \{ type: "string", minLength: 2, maxLength: 2 \}' src/modules/finance/schemas.ts` — 2 (BOTH list + summary)

## Next Plan Readiness

- **Plan 106-04** (members financial-history) is INDEPENDENT of this plan and can run in parallel — it touches `members/routes.ts` and reuses `TransactionService.getFinancialHistory` from Plan 01. No coupling.
- **Plan 106-05** (CajaPage frontend migration): both endpoints live with the locked country querystring contract. The composable can be a thin swap of `paymentsApi.listPayments(...)` → `transactionsApi.list(...)` and `paymentsApi.getFinancialSummary(...)` → `transactionsApi.getSummary(...)`. CajaPage.vue:521-530's owner toggle works without changes.
- **Plan 106-06** (verifier): the country querystring contract is documented above and grep-verifiable via `grep -cE 'country: \{ type: "string", minLength: 2, maxLength: 2 \}' el-templo-api/src/modules/finance/schemas.ts` returning 2. Owner-aware handler resolution is grep-verifiable via `grep -c "request.scope.isOwner" el-templo-api/src/modules/finance/routes.ts` returning 4.

---

_Phase: 106-endpoints-transaccionales_
_Completed: 2026-04-28_
