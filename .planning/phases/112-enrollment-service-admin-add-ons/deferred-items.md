# Phase 112 — Deferred Items

Items discovered during execution that are out of scope for the current plan.

## From Plan 112-01 (Schema migration)

_None._

### Resolved during execution (not deferred)

**Test 6 idempotency tolerance** — Initially flagged as "test DB infra bug" by the executor; on re-run found to be a Drizzle wrapper issue (the test inspected `err.message` but Drizzle puts MySQL errors in `err.cause` per Plan 105-02 precedent). Fix: extended tolerance check to walk `err.cause.code` + `err.cause.sqlMessage` and added regex variants for `Duplicate FOREIGN KEY constraint` (mixed-case MySQL 8 wording). All 6 tests pass post-fix. Migration itself was already verified idempotent at the runner level via two consecutive `pnpm db:migrate` runs.
