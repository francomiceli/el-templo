# Phase 112 — Deferred Items

Items discovered during execution that are out of scope for the current plan.

## From Plan 112-01 (Schema migration)

_None._

### Resolved during execution (not deferred)

**Test 6 idempotency tolerance** — Initially flagged as "test DB infra bug" by the executor; on re-run found to be a Drizzle wrapper issue (the test inspected `err.message` but Drizzle puts MySQL errors in `err.cause` per Plan 105-02 precedent). Fix: extended tolerance check to walk `err.cause.code` + `err.cause.sqlMessage` and added regex variants for `Duplicate FOREIGN KEY constraint` (mixed-case MySQL 8 wording). All 6 tests pass post-fix. Migration itself was already verified idempotent at the runner level via two consecutive `pnpm db:migrate` runs.

## From Plan 112-03 (Lifecycle hooks)

**3 pre-existing failures in `expire-cancel-linked-program.test.ts`** — When run after ~21:00 local Argentina time (UTC-3), 3 of the 4 tests in this file fail with `'freemium'` instead of expected `'activo'` / `'inactivo'` for `users.status`. Root cause is a timezone race in `recomputeUserStatus`: `assignPlan` writes `start_date` derived from `new Date().toISOString().split("T")[0]` (UTC date) while MySQL's `CURDATE()` returns the server's local date — when local is one day behind UTC, `start_date > CURDATE()` and the active-sub EXISTS check fails, so a 'freemium' user is never promoted to 'activo' (and the cancel-time recompute then leaves status as 'freemium' rather than flipping to 'inactivo'). Confirmed pre-existing on the Plan-02 baseline (`git stash` + run reproduces). Test 2 in the same file uses `startDate: dateOffsetStr(-2)` and passes regardless. Out of scope per SCOPE BOUNDARY rule (failures unrelated to Plan 03 changes); recommend a future test-infra plan to either pin MySQL session time_zone or switch the test fixtures to use the dateOffsetStr helper consistently.
