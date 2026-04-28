---
phase: 105-modelo-de-datos-drop-del-viejo
plan: 01
subsystem: database
tags: [drizzle, mysql, schema, migration, finance, payments, debts]

# Dependency graph
requires:
  - phase: 101-debts-tracking
    provides: debts table that this phase drops
  - phase: 49-payments-foundation
    provides: payments table that this phase drops
provides:
  - financial_transactions Drizzle schema and SQL table
  - transaction_links Drizzle schema and SQL table (pivot with UNIQUE(transaction_id, target_kind, target_id))
  - balances Drizzle schema and SQL table (cache with UNIQUE(member_id, target_kind, target_id, currency))
  - schema barrel updated to remove payments/debts and add the 3 new tables
  - migration 0106 applied to local eltemplo and eltemplo_test_1 databases
  - DROP of payments and debts tables in MySQL
affects: [105-02, 105-03, 105-04, 105-05, 105-06, 105-07, 105-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated heterogeneous FK target via (target_kind, target_id) with no DB-level FK on target_id (lifted from aura_transactions.referenceType + referenceId)"
    - "Cache table mirrored from ledger via UNIQUE composite key + service-layer atomic upsert (lifted from aura_balances)"
    - "CREATE-before-DROP migration ordering as the only safety mechanism for non-transactional MySQL DDL"

key-files:
  created:
    - el-templo-api/src/db/schema/financial-transactions.ts
    - el-templo-api/src/db/schema/transaction-links.ts
    - el-templo-api/src/db/schema/balances.ts
    - el-templo-api/src/db/migrations/0106_finance_model_replace_payments_debts.sql
  modified:
    - el-templo-api/src/db/schema/index.ts

key-decisions:
  - "Plan 105-01: financial_transactions enums declared inline via mysqlEnum (single source of truth per D-05); TS literals will be inferred via $inferSelect downstream in Plan 02 types.ts"
  - "Plan 105-01: transaction_links.target_id has no DB-level FK; service layer enforces heterogeneous integrity by target_kind per SPEC §7"
  - "Plan 105-01: balances.amount is signed int (negatives allowed for saldo a favor per D-08); rows with amount=0 are kept (D-07) for audit and to simplify void reversal"
  - "Plan 105-01: Migration order is CREATE financial_transactions / transaction_links / balances then DROP payments then DROP debts so that a partial failure leaves the old tables intact (MySQL DDL is non-transactional)"
  - "Plan 105-01: Migration runner column is `_migrations.name` not `filename`; the planned verification command using `filename` would fail. Updated mental model for downstream verifier"

patterns-established:
  - "Inline mysqlEnum on the column with no separate enum export when the literal types only feed $inferSelect-derived TS unions"
  - "Soft-void columns (voided_at / voided_by / void_reason) on financial_transactions mirror payments.ts shape exactly; same Drizzle pattern, distinct relationName values for ambiguity"
  - "Per-column .references(() => table.id) thunks safe with circular schema imports (financial_transactions ⇄ transaction_links)"

requirements-completed:
  - TXN-01
  - TXN-02
  - TXN-03
  - TXN-04

# Metrics
duration: 12min
completed: 2026-04-28
---

# Phase 105 Plan 01: Schema + Migration Summary

**Three Drizzle schemas (financial_transactions, transaction_links, balances) plus migration 0106 that creates the new tables and drops payments + debts in a single atomic file, applied to local and test MySQL.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-28T13:27:00Z (approx)
- **Completed:** 2026-04-28T13:39:35Z
- **Tasks:** 3
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- Created `financial_transactions` schema with `kind` (5 values), `direction` (2 values), `payment_method` (5 values) enums; `branch_id` NOT NULL; soft-void triplet; `transaction_date` + `effective_date` separate fields per SPEC §1; 4 indices including `(branch_id, transaction_date)` and `(kind, voided_at)`.
- Created `transaction_links` pivot with UNIQUE composite `(transaction_id, target_kind, target_id)` and lookup index `(target_kind, target_id)`; **no FK on `target_id`** so service layer can enforce heterogeneous targets per SPEC §7.
- Created `balances` cache with UNIQUE composite `(member_id, target_kind, target_id, currency)`; signed `amount` int allows saldo a favor; `idx_balances_amount_member(amount, member_id)` backs the "Solo deudores" listing.
- Wrote migration `0106_finance_model_replace_payments_debts.sql` with CREATE-before-DROP ordering, all FKs declared, comments free of inline `;` for the run-migrations splitter.
- Applied the migration with `pnpm db:migrate` against `eltemplo` and `eltemplo_test_1`. Verified all three new tables exist and `payments`/`debts` are gone in both DBs.
- Updated `schema/index.ts` barrel: removed `payments` + `debts` exports, added `financial-transactions` + `transaction-links` + `balances`. Schema barrel parses cleanly via `tsc --noEmit`.

## Task Commits

1. **Task 1: Create 3 Drizzle schema files + update barrel** — `d48b30b9` (feat)
2. **Task 2: Write manual migration SQL 0106** — `a1c79ea7` (feat)
3. **Task 3: [BLOCKING] Apply migration 0106 to local MySQL** — no commit (state-only change in MySQL `_migrations` row; no file artifact)

## Files Created/Modified

- `el-templo-api/src/db/schema/financial-transactions.ts` — Drizzle table + relations for the new ledger
- `el-templo-api/src/db/schema/transaction-links.ts` — Pivot table with discriminated heterogeneous target
- `el-templo-api/src/db/schema/balances.ts` — Cache of outstanding balances per (member, target, currency)
- `el-templo-api/src/db/migrations/0106_finance_model_replace_payments_debts.sql` — Single-file CREATE×3 then DROP×2
- `el-templo-api/src/db/schema/index.ts` — Removed `payments`/`debts` exports, added 3 new

## Decisions Made

- **mysqlEnum inline (no separate `export const enum…`):** Per D-05 single-source-of-truth via Drizzle. Plan 02 will derive TS literals via `$inferSelect`. Diverges from `aura-transactions.ts` which exports `sourceTypeEnum` separately, but matches the explicit decision in 105-CONTEXT.
- **Distinct `relationName` per relation in `financialTransactionsRelations`:** Three FKs from `financial_transactions` to `users` (member, recorder, voider) require disambiguating relation names (`financialTxMember`, `financialTxRecorder`, `financialTxVoider`) to avoid Drizzle ambiguity errors at query time. Mirrors the `paymentsRelations` shape exactly.
- **Circular schema imports between `financial-transactions.ts` and `transaction-links.ts`:** `transaction-links.ts` references `financialTransactions` via `.references(() => …)` thunks (lazy) and via `relations(financialTransactions, …)`. Verified to typecheck cleanly. Common drizzle pattern; no extraction-to-third-file needed.
- **Migration `_migrations.name` not `filename`:** The planned acceptance verify command used `WHERE filename = …` which would error against the actual schema (`name VARCHAR(255) NOT NULL UNIQUE`). Adjusted at execution time. Documented in key-decisions for downstream verifier.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused import in transaction-links.ts**

- **Found during:** Task 1 (write transaction-links.ts)
- **Issue:** Initial draft imported `one` from `drizzle-orm` at the top of the file then aliased it inside the `relations` builder as `oneFn`. Lint would flag the unused `one` symbol in the import.
- **Fix:** Removed the top-level `, one` from the import; kept the destructured `({ one })` inside `relations(...)` matching the project's analog files (e.g. `aura-transactions.ts`).
- **Files modified:** el-templo-api/src/db/schema/transaction-links.ts
- **Verification:** `pnpm tsc --noEmit` shows zero errors in the new schema files.
- **Committed in:** d48b30b9 (Task 1 commit)

**2. [Rule 1 - Bug] Verified migration runner column name before final verify**

- **Found during:** Task 3 (apply migration)
- **Issue:** Plan's `<verify><automated>` block used `WHERE filename = '0106_…'` against `_migrations`, but the actual schema column is `name`. The plan command would have returned 0 even on a successful migration.
- **Fix:** Verified using `WHERE name = '0106_finance_model_replace_payments_debts.sql'` which returned 1. No code change — just the verification SQL.
- **Files modified:** none
- **Verification:** Both `eltemplo` and `eltemplo_test_1` show the row.
- **Committed in:** n/a (verification-only)

---

**Total deviations:** 2 auto-fixed (1 lint-correctness bug, 1 documentation alignment)
**Impact on plan:** No scope creep. Both auto-fixes are minor and do not change the deliverables.

## Issues Encountered

None — every acceptance criterion from the plan passed:

- 5 CREATE/DROP statements present in correct order (CREATE at lines 18, 47, 60; DROP at lines 76, 77).
- 0 lines match the `^\s*--.*;` regex (no semicolons inside line comments after the documentation phrasing was rewritten).
- Migration runner reports `Applying: 0106_… (5 statements) Applied successfully` for both `eltemplo` and `eltemplo_test_1`.
- `SHOW TABLES` confirms `financial_transactions`, `transaction_links`, `balances` exist; `payments`, `debts` do not.

## Pre-existing Typecheck Errors (Expected)

`pnpm tsc --noEmit` reports ~25 errors from `payments/service.ts`, `members/debts-service.ts`, `analytics/service.ts`, `reports/service.ts`, `subscriptions/service.ts`, `auth/routes.ts`, `jobs/auto-resume-pauses.ts`, `members/service.ts`, `members/routes.ts` referencing `schema.payments` / `schema.debts` which no longer exist on the barrel. These are the exact callsites enumerated in 105-CONTEXT D-01/D-02/D-10/D-11 and 105-PATTERNS "Modified files" — they are resolved by Plan 02 (TransactionService + BalanceService), Plan 03 (callers in subscriptions/auth/jobs), Plan 04 (analytics/reports rewrites), Plan 05 (members service rewrite + AlumnosPage), and Plan 06 (delete `payments.ts` + `debts.ts` schema files and the legacy modules). The schema barrel itself parses cleanly.

## Next Phase Readiness

- **Plan 02 (TransactionService + BalanceService):** Can start. New tables exist on local MySQL and on `eltemplo_test_1`, so integration tests can spin up a test app, instantiate the services, and assert against the DB.
- **Wave 2+ executors:** Should NOT be surprised by the typecheck red from `payments`/`debts` callers; that is the intended state until Plans 03-06 land.
- **No blockers.** Migration is idempotent (tracked in `_migrations`); a re-run is a no-op.

## Self-Check: PASSED

- el-templo-api/src/db/schema/financial-transactions.ts — FOUND
- el-templo-api/src/db/schema/transaction-links.ts — FOUND
- el-templo-api/src/db/schema/balances.ts — FOUND
- el-templo-api/src/db/migrations/0106_finance_model_replace_payments_debts.sql — FOUND
- el-templo-api/src/db/schema/index.ts (barrel update) — FOUND
- d48b30b9 (Task 1 commit) — FOUND in git log
- a1c79ea7 (Task 2 commit) — FOUND in git log
- MySQL `eltemplo` `_migrations` row for 0106 — FOUND
- MySQL `eltemplo_test_1` `_migrations` row for 0106 — FOUND
- `payments`/`debts` tables — DROPPED in both DBs

---

_Phase: 105-modelo-de-datos-drop-del-viejo_
_Completed: 2026-04-28_
