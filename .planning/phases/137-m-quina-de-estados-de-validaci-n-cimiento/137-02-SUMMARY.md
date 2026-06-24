---
phase: 137-m-quina-de-estados-de-validaci-n-cimiento
plan: 02
subsystem: finance
tags: [validation, state-machine, ledger, rbac, audit-log, subscriptions]
requires:
  - financial_transactions.validation_status (plan 01 — migration 0153)
  - audit-log transaction_validated/observed/corrected actions (plan 01)
  - firm-money.ts canonical predicate (plan 01)
provides:
  - TransactionService.validate/observe/correct + _void(tx,...) + extended void()
  - server-side role→validation_status derivation (create + recordAssignmentCharge)
  - SubscriptionService._cancelSubscription(tx, ..., skipActiveChargesGuard)
  - POST /transactions/:id/{validate,observe,correct} endpoints (FINANCE_VOID_ROLES)
  - validation-state.test.ts (transitions + RBAC + keepMembershipActive)
affects:
  - plan 03 (refactor 14 call sites + regression gate — reads firm money)
  - phase 140 (opens create to coach role via FINANCE_WRITE_ROLES)
  - phase 141 (pendientes inbox UI consumes these transitions + audit trail)
tech-stack:
  added: []
  patterns:
    - "Atomic primitive extraction (_void(tx,...), _cancelSubscription(tx,...)) so multi-write operations share ONE db.transaction"
    - "Structural back-edge via narrow interface (SubscriptionCanceller) + post-construction setter to break circular DI"
    - "Optional param defaulting to safe path (recorderRole? → validado) so existing callers stay correct without edits"
    - "Server-side role→status derivation (never from request body) — security control VAL-02"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/test/finance/validation-state.test.ts
decisions:
  - "_cancelSubscription made PUBLIC (not private) because TS private members can't satisfy a public interface member (SubscriptionCanceller); the `_` prefix marks it internal-only"
  - "void() back-edge to SubscriptionService wired via setSubscriptionCanceller() post-construction (mirror of setBookingService) to avoid a circular constructor; throws loudly if unset rather than silently leaving the sub active"
  - "_cancelSubscription resolves the target sub via a tx-scoped SELECT (not getMemberSubscriptions, which reads this.db) so it never opens a second connection inside the caller's tx"
  - "correct() re-points the single-link allocatedAmount to the new amount so TXN-06 (Σalloc===amount) holds; multi-link corrections copy links verbatim (out-of-scope error class)"
  - "State transitions tested at the SERVICE level (REST create is gated to FINANCE_WRITE_ROLES, coach excluded in 137); RBAC tested over HTTP"
metrics:
  duration: ~40min (incl. mid-run connection-drop recovery)
  completed: 2026-06-24
---

# Phase 137 Plan 02: Máquina de estados de validación (cimiento) Summary

The validation state machine backend: `validate()`/`observe()`/`correct()` transitions plus an extended `void(keepMembershipActive)` on TransactionService, server-side role→status derivation in both the create REST path and `recordAssignmentCharge`, three RBAC-guarded REST endpoints, and the `_cancelSubscription(tx,...)` extraction that lets `void()` cancel a linked subscription atomically — all with an audit row per transition.

## What Was Built

**Task 1+2 — `_void(tx)` extraction + validate/observe/correct state machine** (`fb8d5dc3`)

- Extracted `private async _void(tx, id, voidedBy, input, statusOverride?)` from the old `void()`, operating against the caller's tx handle (mirror of `create(tx?)`). Public `void()` now wraps it in `this.db.transaction` — identical behaviour for existing callers, but `correct()` can now share a single tx.
- `_void` with `statusOverride='corregido'` also sets `validation_status='corregido'` on the voided row (distinguishes void-for-correction from void-for-refund, D-05). A plain anular leaves `validation_status` untouched (orthogonal axis).
- `validate(id, adminId)`: pendiente → validado + `transaction_validated` audit row; rejects absent / voided / non-pendiente.
- `observe(id, adminId, {reason})`: pendiente → observado + `transaction_observed` audit; reason mandatory.
- `correct(originalId, correctedFields, adminId)`: in ONE tx — `_void(original,'corregido')` + `create(new, born 'validado')` (copying every field except the `amount`/`memberId`/`paymentMethod` overrides + carrying over the original's links) + a `transaction_links` provenance row (`target_kind='transaction'`, allocatedAmount 0) linking new→original + `transaction_corrected` audit. Atomic: a failing recreate rolls back the void.
- `create()` now passes `validationStatus: input.validationStatus ?? 'validado'` to the INSERT. **`applyDelta` still runs unconditionally** — a PENDIENTE settles the member's balance exactly as before (D-09 / VAL-07). The read-side firm-money filter is the only thing that excludes pendientes.
- `void(keepMembershipActive=false)` cancels the linked subscription inside the same tx via the injected `SubscriptionCanceller._cancelSubscription(tx, ..., skipActiveChargesGuard:true)`. Default true (and undefined) leaves the sub active.
- types.ts: added `InitialValidationStatus`, `ObserveTransactionInput`, `keepMembershipActive?` on `VoidTransactionInput`, `validationStatus?` on `CreateTransactionInput`.

**Task 3 — endpoints + server-side derivation + `_cancelSubscription` + tests** (`1aeafd9e`)

- routes.ts: three new endpoints `POST /transactions/:id/{validate,observe,correct}`, each guarded by `FINANCE_VOID_ROLES` (coach → 403). `POST /transactions` derives `initialStatus` server-side (`["coach"].includes(role) ? 'pendiente' : 'validado'`) and passes it to `create` — **never** read from the body (VAL-02 / T-137-04). `void` reads `keepMembershipActive` (default true). Wired `setSubscriptionCanceller` by assembling a `SubscriptionService` in the finance plugin.
- schemas.ts: `validateTransactionSchema`, `observeTransactionSchema` (reason required), `correctTransactionSchema` (`correctedFields` = subset of amount/memberId/paymentMethod, `minProperties: 1`), and `keepMembershipActive` on the void schema.
- subscriptions/service.ts: `recordAssignmentCharge` gains an OPTIONAL `recorderRole?: AdminRole` param; derivation `recorderRole === 'coach' ? 'pendiente' : 'validado'` (undefined → validado). **Only the definition site changed** — the 4 internal callers (~1192/2699/3042/3363) are untouched (verified by diff), so an admin-initiated assignment never births a PENDIENTE. Extracted `_cancelSubscription(tx, userId, actorId, notes, subscriptionId, opts)` containing the full cancel body (sub resolution via tx-scoped select + guard + scheduled-successor cascade + phantom-debt collapse + enrollment teardown + status recompute + audit); the public `cancelSubscription` wraps it in `this.db.transaction` + does the post-tx booking cancel + re-read. `opts.skipActiveChargesGuard` (only set by `void()`) bypasses the SUB_HAS_ACTIVE_TRANSACTIONS guard, since the charge that would block is already soft-voided in that same tx.
- validation-state.test.ts: filled all `it.todo` with real integration cases — admin create→validado, coach-derived→pendiente, VAL-07 (pendiente settles balances), validate/observe/correct transitions + audit assertions, correct() provenance link + atomicity guard, VAL-01 (a validado can still be voided, axes orthogonal), keepMembershipActive default-true / false-cancels (+ subscription_cancelled audit), RBAC 403 for coach on validate/observe/correct/void, and the admin REST validate happy path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `_cancelSubscription` had to be public, not private**

- **Found during:** Task 3 (typecheck)
- **Issue:** The plan specified `private async _cancelSubscription`. But `TransactionService.void()` reaches it structurally through the `SubscriptionCanceller` interface, and TypeScript private members cannot satisfy a public interface member (`TS2345: Property '_cancelSubscription' is private`).
- **Fix:** Made `_cancelSubscription` public, documenting that the `_` prefix marks it internal-only (call `cancelSubscription()` from app code). This is the standard TS pattern for a cross-class structural back-edge and matches the public `_void` exposure intent.
- **Files modified:** `subscriptions/service.ts`
- **Commit:** `1aeafd9e`

**2. [Rule 2 - Missing critical functionality] DI assembly for the void→cancel back-edge**

- **Found during:** Task 3
- **Issue:** The plan described injecting SubscriptionService into TransactionService but the finance plugin (`finance/routes.ts`) only constructs a TransactionService. Without wiring, `void(keepMembershipActive=false)` over REST would throw.
- **Fix:** Assembled a `SubscriptionService` (Aura + Enrollment + tx services) in the finance plugin and called `transactionService.setSubscriptionCanceller(subscriptionService)`, mirroring the DI in subscriptions/routes.ts. The setter pattern (post-construction) breaks the circular dependency.
- **Files modified:** `finance/routes.ts`
- **Commit:** `1aeafd9e`

## Phase-Critical Constraints — Compliance

- applyDelta NOT tied to validation_status — CONFIRMED (runs unconditionally in both create +1 and \_void -1; VAL-07 test proves a pendiente zeroes balances).
- `_void(tx,...)` extracted; public void() wraps it — CONFIRMED.
- correct() limited to amount/memberId/paymentMethod, born validado, original→corregido+void, linked via transaction_links — CONFIRMED.
- Role→status server-side only; coach NOT added to FINANCE_WRITE_ROLES — CONFIRMED (grep `coach.*FINANCE_WRITE_ROLES` = 0).
- recorderRole? optional, defaults to validado; 4 callers untouched — CONFIRMED (diff shows definition-site-only change).
- keepMembershipActive=false actually deactivates via \_cancelSubscription(tx,...,skipActiveChargesGuard) — CONFIRMED (test asserts sub.status='cancelled').
- Audit row on every transition — CONFIRMED (validate/observe/correct/void each write an auditLog row; tests assert the action types).

## Known Stubs

None. All `it.todo` placeholders in validation-state.test.ts are replaced with real cases; `grep it.todo` returns nothing.

## TDD Gate Compliance

This wave built on the plan-01 RED scaffold (`validation-state.test.ts` shipped as `it.todo`). Plan 02 implemented the service/route behaviour AND filled the tests in the same wave; the suite runs in CI on push (project rule: no local full-suite runs — typecheck local only, which passes clean). The state-machine commits are `feat(...)` per the GREEN gate.

## Self-Check: PASSED

- `el-templo-api/src/modules/finance/transaction-service.ts` — FOUND (`_void`, `validate`, `observe`, `correct`)
- `el-templo-api/src/modules/finance/routes.ts` — FOUND (3 endpoints, FINANCE_VOID_ROLES, server-side initialStatus, keepMembershipActive)
- `el-templo-api/src/modules/finance/schemas.ts` — FOUND (validate/observe/correct schemas + keepMembershipActive)
- `el-templo-api/src/modules/subscriptions/service.ts` — FOUND (`_cancelSubscription`, `recorderRole`, `skipActiveChargesGuard`)
- `el-templo-api/test/finance/validation-state.test.ts` — FOUND (no `it.todo`)
- Commits `fb8d5dc3`, `1aeafd9e` — both FOUND in git log
- `pnpm tsc --noEmit` — clean (verified after each task, post-prettier)
- coach NOT in FINANCE_WRITE_ROLES — verified (grep = 0)
- 4 recordAssignmentCharge callers untouched — verified (diff hunks exclude the call sites)
