---
phase: 106-endpoints-transaccionales
plan: 01
subsystem: api
tags: [finance, rbac, drizzle, mysql, pagination, types]

# Dependency graph
requires:
  - phase: 105-modelo-de-datos-drop-del-viejo
    provides: TransactionService.create/void/getById, BalanceService.applyDelta/getRow, financial_transactions/transaction_links/balances schema
provides:
  - Four FINANCE_*_ROLES constants (D-01..D-04) for Plan 02/03 RBAC hooks
  - PaginatedResult<T> relocated to shared/types.ts (cross-module)
  - TransactionService.list(filters) — paginated D-12 list with denormalized member/branch/recorder names + linkSummary
  - TransactionService.getFinancialHistory(memberId, filters) — D-13 history with conceptLabel via subscriptions+plans LEFT JOIN
  - BalanceService.getRowsForTransaction(transactionId) — powers D-10 affectedBalances response
  - 5 new finance/types interfaces: TransactionListFilters, TransactionListItem, FinancialHistoryFilters, FinancialHistoryItem, CreateTransactionResponse
affects:
  - 106-02 (POST /transactions + /void HTTP routes consume FINANCE_WRITE_ROLES, FINANCE_VOID_ROLES, CreateTransactionResponse, BalanceService.getRowsForTransaction)
  - 106-03 (GET /transactions + /financial-history routes consume FINANCE_READ_ROLES, list(), getFinancialHistory())
  - 106-04 (CajaPage migration consumes the new endpoints — types align with admin TransactionListItem)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "alias() from drizzle-orm/mysql-core for self-joins (recorder vs member on users)"
    - "Service-layer defense-in-depth pagination clamp Math.min(200, Math.max(1, limit ?? 50))"
    - "Single follow-up inArray() query for link summaries to avoid N+1 across paginated rows"

key-files:
  created:
    - el-templo-api/src/modules/shared/types.ts
    - .planning/phases/106-endpoints-transaccionales/106-01-SUMMARY.md
  modified:
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/src/modules/reports/types.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/index.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/balance-service.ts
    - el-templo-api/test/finance/transaction-service.test.ts

key-decisions:
  - "FINANCE_WRITE_ROLES + FINANCE_READ_ROLES include 'recepcion' (per CONTEXT D-02/D-04); FINANCE_VOID_ROLES + FINANCE_ADJUSTMENT_ROLES exclude it for abuse risk."
  - "PaginatedResult<T> moved to shared/types.ts; reports/types.ts re-exports — zero callsite churn."
  - "buildListConditions is private and parameter-free for the alias (recorder injected at call site, conditions only reference base tables) — keeps the helper signature simple."
  - "list() pagination defaults page=1, limit=50, max=200 per D-12; clamped server-side as defense-in-depth (T-106-LISTSIZE)."
  - "getFinancialHistory composes conceptLabel as `<Plan Name> — <subscription startDate>` for target_kind='subscription'; non-subscription targets get conceptLabel=undefined."
  - "BalanceService.getRowsForTransaction excludes target_kind='transaction' both via JOIN equality (balances enum doesn't include 'transaction') AND ne() WHERE clause (defense-in-depth)."

patterns-established:
  - "Drizzle self-join via alias(): const recorder = alias(schema.users, 'recorder') with eq(recorder.id, ...) — first non-raw-SQL recorder join in the codebase."
  - "Phase 106 finance read methods follow paginated-COUNT-then-rows pattern from reports/service.ts (no SQL_CALC_FOUND_ROWS)."

requirements-completed: [API-04, API-05, API-06, API-07]

# Metrics
duration: ~10min
completed: 2026-04-28
---

# Phase 106 Plan 01: Foundation Layer Summary

**RBAC role constants, shared PaginatedResult, and TransactionService.list/getFinancialHistory + BalanceService.getRowsForTransaction service-layer extensions ready for Plans 02/03 HTTP exposure.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-28T19:18:12Z (approx, from STATE.md)
- **Completed:** 2026-04-28T19:28:31Z
- **Tasks:** 3 (1 TDD)
- **Files modified:** 7 (1 created, 6 modified, 1 test extended)

## Accomplishments

- Four FINANCE\_\*\_ROLES constants exported from `shared/permissions.ts` matching D-01..D-04 exactly (FINANCE_WRITE_ROLES, FINANCE_ADJUSTMENT_ROLES, FINANCE_VOID_ROLES, FINANCE_READ_ROLES).
- `PaginatedResult<T>` moved to `shared/types.ts`; `reports/types.ts` re-exports the type so existing callers stay unchanged.
- `TransactionService.list(filters)` — paginated query with country/branchId/kind/dateFrom/dateTo/memberId/paymentMethod/search filters. Uses Drizzle `alias()` for the recorder self-join (first non-raw-SQL recorder join). Returns denormalized memberName/branchName/recorderName + linkSummary array fetched in a single follow-up `inArray()` query (no N+1).
- `TransactionService.getFinancialHistory(memberId, filters)` — paginated by transaction_date DESC with `conceptLabel` resolved for target_kind='subscription' via LEFT JOIN to subscriptions + subscription_plans. `voidInfo` populated when voidedAt is non-null.
- `BalanceService.getRowsForTransaction(transactionId)` — single SELECT with double JOIN to financial_transactions + transaction_links. Powers D-10 affectedBalances response. Excludes target_kind='transaction' (no balance effect).
- 5 new finance type interfaces, all re-exported from finance/index.ts barrel.
- 19 new integration tests (L1-L11, H1-H5, B1-B3); all 32 finance tests green; full TypeScript typecheck clean.

## Task Commits

1. **Task 1: Add FINANCE\_\*\_ROLES + relocate PaginatedResult** — `2f014848` (feat)
2. **Task 2: Add finance list/history/create response types** — `b1877345` (feat)
3. **Task 3: Add list/getFinancialHistory + getRowsForTransaction (TDD)** — `710832cb` (feat)

_Note: Task 3 was a TDD task. Per the plan's Part D, tests were appended to the existing Phase 105 test file alongside the GREEN implementation in a single commit (the existing file's structure assumes a stateful service tested against the live DB; the RED→GREEN cycle was followed by writing the implementation first to verify the test scaffolding compiled, then executing the new test cases against the new methods — all 19 new tests passed on first run after fixing two test fixture bugs noted below)._

## Files Created/Modified

- `el-templo-api/src/modules/shared/permissions.ts` — Added 4 FINANCE\_\*\_ROLES constants
- `el-templo-api/src/modules/shared/types.ts` — Created with PaginatedResult<T>
- `el-templo-api/src/modules/reports/types.ts` — Replaced inline PaginatedResult with re-export from shared/types
- `el-templo-api/src/modules/finance/types.ts` — Added TransactionListFilters/Item, FinancialHistoryFilters/Item, CreateTransactionResponse + CountryCode import
- `el-templo-api/src/modules/finance/index.ts` — Barrel re-exports the 5 new types
- `el-templo-api/src/modules/finance/transaction-service.ts` — Added list(), getFinancialHistory(), private buildListConditions(); added imports for and/sql/gte/lte/inArray/SQL/alias/buildMemberNameSearchCondition/PaginatedResult/new finance types
- `el-templo-api/src/modules/finance/balance-service.ts` — Added getRowsForTransaction(); added `ne` to drizzle-orm import
- `el-templo-api/test/finance/transaction-service.test.ts` — Appended 3 new describe blocks (list, getFinancialHistory, getRowsForTransaction) with 19 tests

## Decisions Made

- **`PaginatedResult<T>` in shared/types.ts (not reports/types.ts):** Recommended in PATTERNS.md "Open Decisions" #1; finance is the second consumer, so making it shared avoids reports/ becoming a god-module dependency. Re-export from reports/types.ts preserves existing callsites (zero churn).
- **`recorder` self-join via Drizzle `alias()`:** reports/service.ts uses raw SQL for its recorder self-join because of historical complexity around currency casting; the new list() doesn't need that, so we use the modern `alias(schema.users, 'recorder')` pattern. First non-raw-SQL recorder join in the codebase.
- **`linkSummary` via single follow-up query:** Mapping with `inArray(transactionLinks.transactionId, txIds)` after the page rows arrive is O(2) queries total regardless of page size; alternative per-row queries would be O(n+1).
- **`getRowsForTransaction` joins both transaction_links AND financial_transactions:** Matching only on transaction_id from the link table would suffice for finding the correct (target_kind, target_id) pairs, but joining financial_transactions enforces the (member_id, currency) match to the canonical balances composite key — defense against schema drift if a transaction's links ever spanned multiple members.
- **Test fixture bug fixes (Task 3):** Two test bugs surfaced on first test run; fixed under Rule 1 (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test L2 used branch code longer than VARCHAR(20)**

- **Found during:** Task 3 (TDD GREEN phase first run)
- **Issue:** `code: \`ES-TEST-${Date.now()}\``produced strings > 20 chars; MySQL rejected with`ER_DATA_TOO_LONG`. Plan template guidance for L2 said "seed a second branch with country='ES'" but did not specify code length.
- **Fix:** Used `\`ES${Date.now().toString(36).slice(-4)}\`` — 6 chars, well under the 20-char column limit.
- **Files modified:** `el-templo-api/test/finance/transaction-service.test.ts`
- **Verification:** L2 test passes; branch insert succeeds.
- **Committed in:** 710832cb (Task 3 commit)

**2. [Rule 1 - Bug] Test L3 used `kind: 'refund'` with empty links — disallowed by service**

- **Found during:** Task 3 (TDD GREEN phase first run)
- **Issue:** Plan template's L3 example seeded `{ kind: 'refund', links: [] }` to test kind filtering, but `transaction-service.ts:KINDS_ALLOWED_WITHOUT_LINKS` only permits `advance_payment` and `adjustment` to have empty links. Service threw BadRequestError.
- **Fix:** Replaced the third seeded transaction with `{ kind: 'advance_payment', links: [] }` — still distinct from plan_charge for the filter assertion.
- **Files modified:** `el-templo-api/test/finance/transaction-service.test.ts`
- **Verification:** L3 test passes; filter returns the single plan_charge row.
- **Committed in:** 710832cb (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — test fixture bugs)
**Impact on plan:** Both fixes were necessary to satisfy the plan's L2/L3 acceptance criteria. The fixes are scoped to test fixtures only; production code (TransactionService.list, BalanceService) was not changed in response. No scope creep.

## Issues Encountered

- The repo-root `pnpm lint` runs Android Lint (Quasar Android setup) instead of TS/ESLint; there is no `lint` script in `el-templo-api/package.json`. Per CLAUDE.md, lint-staged + Husky run Prettier on commit (which executed cleanly here). TypeScript correctness is validated by `npx tsc --noEmit`, which passes.
- Default `pnpm test` in monorepo root not invoked; I ran the targeted test file `pnpm test test/finance/transaction-service.test.ts` from `el-templo-api/` per plan's verify block. All 32 tests pass (13 existing Phase 105 + 19 new Phase 106).

## User Setup Required

None — service-layer-only plan; no environment, secrets, or external service configuration changed.

## Self-Check: PASSED

**Files verified to exist:**

- FOUND: `el-templo-api/src/modules/shared/types.ts`
- FOUND: `el-templo-api/src/modules/shared/permissions.ts` (with 4 FINANCE\_\*\_ROLES)
- FOUND: `el-templo-api/src/modules/finance/types.ts` (with 5 new interfaces)
- FOUND: `el-templo-api/src/modules/finance/index.ts` (5 new types re-exported)
- FOUND: `el-templo-api/src/modules/finance/transaction-service.ts` (list, getFinancialHistory, buildListConditions)
- FOUND: `el-templo-api/src/modules/finance/balance-service.ts` (getRowsForTransaction)
- FOUND: `el-templo-api/test/finance/transaction-service.test.ts` (19 new tests appended)

**Commits verified:**

- FOUND: 2f014848 (Task 1 — feat: FINANCE\_\*\_ROLES + PaginatedResult relocation)
- FOUND: b1877345 (Task 2 — feat: finance list/history/create response types)
- FOUND: 710832cb (Task 3 — feat: list/getFinancialHistory + getRowsForTransaction + 19 tests)

**Verification commands run:**

- `npx tsc --noEmit` — exit 0 (TypeScript clean)
- `pnpm test test/finance/transaction-service.test.ts` — 32/32 passed

## Next Phase Readiness

- Plan 106-02 (POST /transactions + /void HTTP routes) can now consume FINANCE_WRITE_ROLES, FINANCE_ADJUSTMENT_ROLES, FINANCE_VOID_ROLES, CreateTransactionResponse, and BalanceService.getRowsForTransaction directly from the finance barrel.
- Plan 106-03 (GET /transactions + /financial-history HTTP routes) can consume FINANCE_READ_ROLES, TransactionService.list/getFinancialHistory, TransactionListFilters/FinancialHistoryFilters and corresponding row types.
- Plan 106-04 (CajaPage admin migration) — server-side TransactionListItem shape locked; admin types/transaction.ts can mirror it byte-for-byte.

---

_Phase: 106-endpoints-transaccionales_
_Completed: 2026-04-28_
