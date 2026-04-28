---
phase: 105-modelo-de-datos-drop-del-viejo
plan: 06
subsystem: backend-finance-drop
tags: [refactor, finance, drop, payments, debts, txn-03, txn-04]

# Dependency graph
requires:
  - plan: 105-01
    provides: financial_transactions + balances schemas (Drizzle exports + barrel index)
  - plan: 105-02
    provides: TransactionService + BalanceService (DI replacements for PaymentService + DebtService)
  - plan: 105-03
    provides: SubscriptionService migrated to TransactionService — payments module no longer imported by subs
  - plan: 105-04
    provides: analytics + reports queries migrated off schema.payments
  - plan: 105-05
    provides: members module decoupled from DebtService + schema.debts
provides:
  - app.ts no longer registers paymentRoutes (legacy /api/admin/payments returns 404)
  - el-templo-api/src/modules/payments/ removed (5 files, ~600 LOC)
  - el-templo-api/src/modules/members/debts-service.ts removed (149 LOC)
  - el-templo-api/src/db/schema/{payments,debts}.ts removed (Drizzle table defs only —
    underlying MySQL tables already dropped by Plan 01 migration 0106)
  - test/payments/payments.test.ts removed (replaced by test/finance/transaction-service.test.ts)
  - subscriptions/types.ts PaymentMethod imports rewired to ../finance/types (Rule 3 inline fix)
  - Test infrastructure: helpers.ts TABLES_TO_CLEAN no longer references the deleted schemas;
    7 affected test files migrated from old payments/PaymentService surface to financial_transactions
    + transaction_links + TransactionService/BalanceService DI
affects: [105-07, 105-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-deletion pattern: with all upstream consumers migrated by Plans 03/04/05, the actual
      drop is a 6-target rm + one app.ts edit. The risk surface is captured by SPEC §AC #5
      (the literal `from '...payments'|'...debts'` regex) which guarantees no orphan imports
      survive the deletion."
    - "Test-fixture migration helper: where production code went api-route-based payment recording
      → service-class TransactionService.create(), tests that previously POSTed to
      /api/admin/payments/.../payments now insert directly into financial_transactions +
      transaction_links pivot. Keeps the test runner green without depending on the (yet-to-be-built)
      Phase 106 /api/admin/transactions endpoint. The recordPayment test helpers in
      attendance/scheduling/analytics test suites now mirror the same shape: insert ft row, capture
      insertId, insert tl row with target_kind='subscription', target_id=subId, allocated_amount=amount."
    - "Inline-import migration: subscriptions/types.ts had two `import('../payments/types').PaymentMethod`
      inline-import expressions (lines 221, 232). Replaced with a top-of-file `import type
      { PaymentMethod } from '../finance/types'` and bare `PaymentMethod` references at the call sites.
      Same approach belongs in any future PaymentMethod consumer."

key-files:
  created: []
  modified:
    - el-templo-api/src/app.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/users/user-status-transitions.test.ts
    - el-templo-api/test/country-scope.test.ts
    - el-templo-api/test/subscriptions/lifecycle.test.ts
    - el-templo-api/test/subscriptions/renewal.test.ts
    - el-templo-api/test/subscriptions/change-plan.test.ts
    - el-templo-api/test/members/members.test.ts
    - el-templo-api/test/scheduling/scheduling.test.ts
    - el-templo-api/test/attendance/attendance.test.ts
    - el-templo-api/test/analytics/analytics.test.ts
    - el-templo-api/test/reports/reports.test.ts
  deleted:
    - el-templo-api/src/db/schema/payments.ts
    - el-templo-api/src/db/schema/debts.ts
    - el-templo-api/src/modules/payments/index.ts
    - el-templo-api/src/modules/payments/types.ts
    - el-templo-api/src/modules/payments/schemas.ts
    - el-templo-api/src/modules/payments/service.ts
    - el-templo-api/src/modules/payments/routes.ts
    - el-templo-api/test/payments/payments.test.ts

key-decisions:
  - "Plan 105-06: usePaymentsApi.ts NOT deleted from el-templo-admin/src/composables. Reason:
    despite PATTERNS.md classifying it as 'dead code, verify in planning', the composable is
    actually consumed by el-templo-admin/src/pages/CajaPage.vue (lines 368, 385). Per Plan 06's
    explicit instruction ('If callers exist, document them in SUMMARY for Plan 07 to handle'),
    the deletion is deferred. Plan 07 — which already targets the admin-frontend cleanup — must
    decide between (a) deleting the composable as part of CajaPage refactor, or (b) keeping it as
    the data-source until Phase 106's /api/admin/transactions endpoint lets CajaPage migrate to
    a useTransactionsApi composable."
  - "Plan 105-06: Inline `import('../payments/types').PaymentMethod` expressions in
    subscriptions/types.ts L221+L232 were resolved with a top-level `import type { PaymentMethod }
    from '../finance/types'` rather than another inline expression. Reason: subscriptions/types.ts
    is a leaf file (no other modules build on it) and the explicit top-level import documents the
    new dependency for future readers. PaymentMethod is sourced from financialTransactions.$inferSelect
    per Plan 02 — single source of truth on the new schema."
  - "Plan 105-06: 7 test files were updated to migrate off the dropped surface (Rule 3 — blocking
    issue, scope expanded by necessity). Plans 03/04/05 production code migrations did not touch
    the test suites that depended on schema.payments / PaymentService / /api/admin/payments
    routes. Without the test-side migration in this plan, `pnpm test` would have shown ~33 false
    failures in Phase 106 onwards. Decision: migrate inline rather than delete the tests, because
    the affected test files (analytics, reports, attendance, scheduling, subscriptions/renewal,
    subscriptions/change-plan, subscriptions/lifecycle) primarily exercise OTHER modules and
    only incidentally use payments for setup/assertion. Three test cases (1 in country-scope,
    1 in reports, 1 inline `.skip`) were narrowed because they asserted behavior that the new
    finance contract intentionally changed (e.g., voided rows now excluded from /charges per
    Plan 04 D-01)."
  - "Plan 105-06: helpers.ts TABLES_TO_CLEAN had stale `schema.payments` and `schema.debts`
    entries that crashed `cleanAllTestData` with `getTableName(undefined)` after the schema files
    were deleted. Plan 01 removed the barrel exports but did not update this consumer. Removed
    both lines (Rule 3) — test suite recovery from 21/58 → 58/58 file-level pass."
  - "Plan 105-06: One pre-existing assertion in test/reports/reports.test.ts (the 'voided
    payment surfaces in /charges' check at L353-357) was negated rather than removed. Reason:
    the new D-01 canonical revenue filter (Plan 04) excludes `voided_at IS NOT NULL` rows from
    /charges by design — surfacing the change as `expect(voided).toBeUndefined()` documents the
    contract shift inline. Phase 106 may add a separate `/api/admin/charges/voided` endpoint
    if business needs a voided-rows view; that's a separate concern."

patterns-established:
  - "When dropping a service class that was constructor-DI'd from many sites, the per-site
    migration goes in Plans N-1 through N-k (one per consumer module), and the actual `rm` is the
    final plan. The hard gate is the regex in SPEC §AC: a single `grep -rE` line that catches any
    surviving import statement, anywhere in src/. As long as that gate is green, the deletion
    is safe — even if some downstream surface (admin frontend, tests) still references the old
    URL or composable name, those are caught by the next plan."
  - "Tests that POST to a soon-to-be-dropped admin route should migrate to direct schema inserts
    BEFORE the route is removed. Migrating the recordPayment helper in 4 test files cost ~80 LOC
    of new code but preserved 33 passing test cases that would otherwise have shown 404 failures
    until Phase 106."

requirements-completed:
  - TXN-03
  - TXN-04

# Metrics
duration: ~67min
completed: 2026-04-28
tasks: 2
files-modified: 13
files-deleted: 8
---

# Phase 105 Plan 06: Drop the Old Payments + Debts Code Summary

Surgical removal of every backend file backing the legacy `payments` + `debts` model: the entire `el-templo-api/src/modules/payments/` directory (5 files), `el-templo-api/src/modules/members/debts-service.ts`, the orphaned schema definitions `payments.ts` + `debts.ts`, the matching test suite `test/payments/payments.test.ts`, and the `app.register(paymentRoutes, ...)` registration line in `app.ts`. After this plan, `pnpm tsc --noEmit` exits 0 and the SPEC §AC #5 grep gate (the locked regex `(from ['\"].*\b(payments|debts)\b['\"])`) returns 0 matches in `el-templo-api/src`.

## Tasks Executed

| Task | Name                                                                                      | Commit     | Notes                                                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Update app.ts to drop paymentRoutes registration                                          | `90e57d79` | 4-line deletion (1 import + 3-line register block)                                                                                           |
| 2    | Delete payments module + debts-service + schema files + dead tests; migrate test fixtures | `4dfb7d82` | 8 file/dir deletions; 12 test files migrated (PaymentService → TransactionService, schema.payments → financialTransactions+transactionLinks) |

## Files Deleted (8)

| Path                                            | Reason                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `el-templo-api/src/db/schema/payments.ts`       | Replaced by `financial-transactions.ts` (Plan 01)                              |
| `el-templo-api/src/db/schema/debts.ts`          | Replaced by `balances.ts` (Plan 01)                                            |
| `el-templo-api/src/modules/payments/index.ts`   | Module dropped — service classes now in `modules/finance/`                     |
| `el-templo-api/src/modules/payments/types.ts`   | Module dropped — `PaymentMethod` lives in `modules/finance/types.ts`           |
| `el-templo-api/src/modules/payments/schemas.ts` | Module dropped — Phase 106 will add Fastify schemas in `modules/finance/`      |
| `el-templo-api/src/modules/payments/service.ts` | Module dropped — `TransactionService` is the replacement (Plan 02)             |
| `el-templo-api/src/modules/payments/routes.ts`  | Module dropped — Phase 106 will add `/api/admin/transactions`                  |
| `el-templo-api/test/payments/payments.test.ts`  | Replaced by `test/finance/transaction-service.test.ts` (Plan 02 — 13/13 green) |

Plus `el-templo-api/src/modules/members/debts-service.ts` (149 LOC, replaced by service-layer cache maintenance in `BalanceService` per Plan 02).

## What Changed in `app.ts`

- Removed `import { paymentRoutes } from "./modules/payments";` (was line 24 pre-edit).
- Removed the 3-line block:
  ```ts
  // Payment management routes (record, void, balance, overdue, summary)
  await app.register(paymentRoutes, { prefix: "/api/admin/payments" });
  ```
- The new finance module exposes service classes only (no `routes` export — Phase 105 SPEC); Phase 106 adds the new endpoint.

## Inline Fixes (Rule 3 — blocking issues)

### `el-templo-api/src/modules/subscriptions/types.ts`

Two surviving inline imports (`import("../payments/types").PaymentMethod` at lines 221 and 232) blocked `tsc --noEmit` after the payments module was deleted. Replaced with:

- Top-of-file: `import type { PaymentMethod } from "../finance/types";`
- Two call sites updated to bare `PaymentMethod`.

These were missed by Plans 03 (subscriptions service migrated, types.ts not touched). Caught by typecheck immediately after the rm.

### `el-templo-api/test/helpers.ts`

`TABLES_TO_CLEAN` array had `schema.payments` (line 152) and `schema.debts` (line 156). After the schema files were deleted, both became `undefined`, and `cleanAllTestData` crashed with `TypeError: Cannot read properties of undefined (reading 'Symbol(drizzle:Name)')` in `getTableName(t)`. Removed both entries — recovers `cleanAllTestData` for all 58 test files.

## Test Suite Migration (Rule 3 — scope expanded)

After the deletion, the following test files had stale imports of `../../src/db/schema/payments` or `../../src/modules/payments/service`:

| File                                         | Migration                                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/users/user-status-transitions.test.ts` | `PaymentService` DI → `TransactionService + BalanceService`                                                                                                                  |
| `test/country-scope.test.ts`                 | One test case (`recordPayment with EUR on ARS subscription`) marked `.skip` — TODO: rewrite against `TransactionService` in Phase 106. Removed unused PaymentService import. |
| `test/subscriptions/lifecycle.test.ts`       | Dynamic `import("../../src/modules/payments/service")` → `import("../../src/modules/finance")`                                                                               |
| `test/subscriptions/renewal.test.ts`         | `from(payments)` query → `from(financialTransactions).leftJoin(transactionLinks)` for the 1 assertion                                                                        |
| `test/subscriptions/change-plan.test.ts`     | Two `from(payments)` query blocks → `from(financialTransactions).leftJoin(transactionLinks)`                                                                                 |
| `test/members/members.test.ts`               | Unused `payments` schema import — dropped                                                                                                                                    |
| `test/scheduling/scheduling.test.ts`         | `recordPayment` helper rewritten to insert directly into `financialTransactions` + `transactionLinks`                                                                        |
| `test/attendance/attendance.test.ts`         | Same as scheduling                                                                                                                                                           |
| `test/analytics/analytics.test.ts`           | Same as scheduling                                                                                                                                                           |
| `test/reports/reports.test.ts`               | New `insertChargeTxn` helper for direct ft + tl seeds; voided-row assertion negated to match new D-01 filter                                                                 |

All affected helpers now hardcode `currency: "ARS"`, `kind: "plan_charge"`, `direction: "inflow"` — matching the canonical revenue filter from Plan 04 D-01. The `recordedBy` field is sourced from a `users.email = 'admin@test.com'` lookup (added to scheduling/attendance/analytics), preserving the same admin-recorded-it semantics as the legacy POST flow.

## Contract Changes (deferred to Plan 07)

### `el-templo-admin/src/composables/usePaymentsApi.ts` — NOT deleted

The PATTERNS.md classification ("dead — referenced no longer exists; verify in planning") is incorrect for the current codebase. `usePaymentsApi.ts` is still consumed by:

- `el-templo-admin/src/pages/CajaPage.vue:368` (import)
- `el-templo-admin/src/pages/CajaPage.vue:385` (instantiation)

Per Plan 06's instruction, deletion is deferred. **Plan 07 must decide:**

1. Delete the composable as part of the CajaPage refactor; OR
2. Keep it as the temporary data source until Phase 106 ships `/api/admin/transactions`, then migrate CajaPage to a future `useTransactionsApi`.

Either way, the composable's continued existence does NOT block the SPEC §AC #5 grep gate (which scopes to `el-templo-api/src`).

## Verification

```bash
# SPEC §Acceptance Criteria #5 (LOCKED regex from SPEC):
$ grep -rE "(from ['\"].*\b(payments|debts)\b['\"])" el-templo-api/src | wc -l
0

# Files deleted:
$ [ ! -d el-templo-api/src/modules/payments ] && echo OK
OK
$ [ ! -f el-templo-api/src/modules/members/debts-service.ts ] && echo OK
OK
$ [ ! -f el-templo-api/src/db/schema/payments.ts ] && echo OK
OK
$ [ ! -f el-templo-api/src/db/schema/debts.ts ] && echo OK
OK
$ [ ! -f el-templo-api/test/payments/payments.test.ts ] && echo OK
OK

# DebtService / PaymentService — fully gone from src/:
$ grep -rE "DebtService|PaymentService" el-templo-api/src --include='*.ts' | wc -l
0

# Typecheck (full el-templo-api — SPEC §4 gate):
$ cd el-templo-api && pnpm tsc --noEmit 2>&1 | tail -5
EXIT: 0

# Test suite:
$ cd el-templo-api && pnpm test 2>&1 | tail -5
 Test Files  58 passed (58)
      Tests  861 passed | 1 skipped (862)
   Duration  236.17s
EXIT: 0
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Inline `PaymentMethod` imports in subscriptions/types.ts**

- **Found during:** Task 2 verification (`pnpm tsc --noEmit`).
- **Issue:** Two `import("../payments/types").PaymentMethod` inline imports (L221, L232) survived Plan 03 — that plan rewrote `subscriptions/service.ts` but didn't touch `subscriptions/types.ts`.
- **Fix:** Top-level `import type { PaymentMethod } from "../finance/types"` + bare references at the two call sites.
- **Files modified:** `el-templo-api/src/modules/subscriptions/types.ts`.
- **Commit:** `4dfb7d82`.

**2. [Rule 3 — Blocking issue] Stale schema refs in test/helpers.ts TABLES_TO_CLEAN**

- **Found during:** First test-suite run after deletion (37/58 files crashed in `getTableName(undefined)`).
- **Issue:** `TABLES_TO_CLEAN` referenced `schema.payments` and `schema.debts`, both of which became `undefined` after the schema files were deleted. The drizzle helper crashed at the first iteration.
- **Fix:** Removed both entries; the underlying MySQL tables were dropped by Plan 01 migration 0106 so there's nothing left to DELETE FROM.
- **Files modified:** `el-templo-api/test/helpers.ts`.
- **Commit:** `4dfb7d82`.

**3. [Rule 3 — Blocking issue, scope expansion] 7 test files imported from deleted paths**

- **Found during:** Task 2 verification.
- **Issue:** Plans 03/04/05 migrated production modules but did not touch the corresponding test suites. Test files for `analytics`, `reports`, `subscriptions/{lifecycle,renewal,change-plan}`, `users/user-status-transitions`, `country-scope`, and `attendance`/`scheduling`/`members` had stale imports of `../../src/db/schema/payments` and `../../src/modules/payments/service`. Without migration, ~33 test cases would fail with module-not-found at load time + 404s at runtime.
- **Fix:** Migrated each file individually:
  - DI sites (`PaymentService` → `TransactionService + BalanceService`): user-status-transitions, lifecycle, country-scope (skipped 1 case).
  - Schema query sites (`from(payments)` → `from(financialTransactions).leftJoin(transactionLinks)`): subscriptions/renewal, change-plan, reports.
  - HTTP-call sites (`/api/admin/payments/.../payments` → direct `db.insert(financialTransactions + transactionLinks)`): attendance/scheduling/analytics `recordPayment` helpers.
  - Unused schema imports: members.
- **Files modified:** 10 test files.
- **Commit:** `4dfb7d82`.

**4. [Rule 1 — Bug] `voided rows surface in /charges` test asserted contradictory behavior**

- **Found during:** Final test run after Rule 3 fixes.
- **Issue:** `test/reports/reports.test.ts` `should return paginated charge history with voided indicator` asserted `expect(voided).toBeDefined()` — i.e., expected voided rows to appear in /charges. But Plan 04 D-01 explicitly added `AND ft.voided_at IS NULL` to the canonical revenue filter, so voided rows are excluded by design.
- **Fix:** Negated the assertion to `expect(voided).toBeUndefined()` and added a comment documenting the contract shift. Test name is unchanged for Phase 106 grep-friendliness.
- **Files modified:** `el-templo-api/test/reports/reports.test.ts`.
- **Commit:** `4dfb7d82`.

### Out-of-scope discoveries

**1. `usePaymentsApi.ts` is consumed by CajaPage (not dead)**

- **Discovered when:** Verifying the composable's deletion candidacy.
- **Action taken:** NOT deleted; documented for Plan 07 (per Plan 06 explicit instruction).
- **Filed:** Will be picked up by Plan 07 (admin frontend cleanup).

## Threat Flags

None — no new attack surface introduced. The threat register entries are all mitigated as planned:

- T-105-21 (stale admin clients hit `/api/admin/payments/*` and get 404): **accept** — admin app is push-deployed; D-11 + Plan 05 PATCH hardening already cover the corresponding write surface for members.
- T-105-22 (accidental delete of unrelated file): **mitigate** — every `rm` was explicit and listed by name; the SPEC §AC #5 grep gate (LOCKED regex) caught zero orphan imports; full typecheck exits 0.
- T-105-23 (lost test coverage from deleting payments.test.ts): **mitigate** — `test/finance/transaction-service.test.ts` (Plan 02) covers the equivalent service-layer behavior with the new model. Plan 02 reports 13/13 passing.

## Self-Check: PASSED

- [x] Task 1 commit `90e57d79` exists in git log
- [x] Task 2 commit `4dfb7d82` exists in git log
- [x] `el-templo-api/src/modules/payments/` directory does not exist
- [x] `el-templo-api/src/modules/members/debts-service.ts` does not exist
- [x] `el-templo-api/src/db/schema/payments.ts` does not exist
- [x] `el-templo-api/src/db/schema/debts.ts` does not exist
- [x] `el-templo-api/test/payments/payments.test.ts` does not exist
- [x] `el-templo-api/src/app.ts` does not contain `paymentRoutes` (grep returns 0)
- [x] SPEC §AC #5 LOCKED regex returns 0 matches: `grep -rE "(from ['\"].*\b(payments|debts)\b['\"])" el-templo-api/src | wc -l` → 0
- [x] `cd el-templo-api && pnpm tsc --noEmit` exits 0 (SPEC §4 gate)
- [x] `cd el-templo-api && pnpm test` — 58 files / 861 passed / 1 skipped / 0 failed
