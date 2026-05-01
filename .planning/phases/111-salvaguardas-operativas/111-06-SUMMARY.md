---
phase: 111-salvaguardas-operativas
plan: 06
subsystem: database-migration-data-fix
tags:
  [
    soledad,
    reconcile,
    data-fix,
    idempotent-migration,
    audit-log,
    REQ-8,
    splitSqlStatements,
  ]

requires:
  - phase: 111-salvaguardas-operativas
    plan: 02
    provides: audit_log table + AuditAction union (used by the reconciliation INSERT)
  - phase: 111-salvaguardas-operativas
    plan: 03
    provides: REQ-7 audit_log call sites (the helper pattern this plan mirrors in raw SQL)
provides:
  - Hand-written idempotent data-fix migration 0109_reconcile_soledad_mailland.sql
  - Integration test (4 cases) for the reconcile migration against eltemplo_test
  - splitSqlStatements named export from src/db/run-migrations.ts so tests share the production parser
  - Phase 111 verification scaffold (111-VERIFICATION.md) covering REQ-1..REQ-9 + D-01..D-28 + 23 SPEC items + 8 staging checkpoints
affects:
  [
    111 phase sign-off,
    future data-fix migrations needing the same idempotency pattern,
  ]

tech-stack:
  added: []
  patterns:
    - Hand-written DML migration with WHERE-on-BEFORE-state guards (UPDATE), DELETE-by-id, and INSERT … SELECT … WHERE NOT EXISTS — re-runnable as a no-op
    - Test reads migration SQL from disk and applies it via the SAME splitter used in production (single source of truth for parser semantics)
    - Comment-with-semicolon guard assertion at test boot (Phase 103-01 invariant defended in CI)
    - require.main === module guard so a CLI entry-point file can also export library helpers without auto-running

key-files:
  created:
    - el-templo-api/src/db/migrations/0109_reconcile_soledad_mailland.sql
    - el-templo-api/test/migrations/0109_reconcile_soledad.test.ts
    - .planning/phases/111-salvaguardas-operativas/111-VERIFICATION.md
  modified:
    - el-templo-api/src/db/run-migrations.ts

key-decisions:
  - "Hand-write the data-fix SQL — db:generate is for schema diffs, not data fixes (CLAUDE.md + Phase 103-01 precedent)"
  - "Idempotency guards in WHERE on each UPDATE check the BEFORE-state value, not the AFTER, so manual re-application produces 0 row changes"
  - "balance for sub 6382 is zeroed explicitly in step 4 (D-19 — eliminates the 'inseguro' lazy applyDelta path)"
  - "audit_log INSERT uses INSERT … SELECT … WHERE NOT EXISTS gated on action+target_id+reason LIKE so re-apply does not duplicate the row"
  - "actorId is COALESCE((SELECT id FROM users WHERE role='owner' ORDER BY id LIMIT 1), 1) so the migration works on any environment regardless of owner-row presence"
  - "Refactored run-migrations.ts to export splitSqlStatements + guarded auto-run with require.main check — tests import the function without triggering a real migration run"

patterns-established:
  - "Data-fix migrations use defensive WHERE on UPDATEs, hardcoded ids in DELETE, and NOT EXISTS guards on INSERTs to be replay-safe"
  - "Migration integration tests read SQL from disk and split via the production splitter — the test exercises the same parse path as pnpm db:migrate"
  - "Tests with explicit/conflict-prone primary keys use a single pooled connection with FOREIGN_KEY_CHECKS=0 around the seed block to avoid cross-pool inconsistency"
  - "CLI entrypoint files that also export helpers gate the top-level execution with require.main === module so importing them is side-effect-free"

requirements-completed: [] # REQ-8 is PARTIAL — local correctness verified, staging+prod runs are the human checkpoint

duration: ~28min (autonomous portion — staging + prod runs are the human checkpoint and not counted)
completed: 2026-05-01 (partial — see "Final Phase Status" in 111-VERIFICATION.md)
---

# Phase 111 Plan 06: Reconcile caso Soledad Mailland — Partial Summary

**Idempotent data-fix migration 0109 + 4-case integration test + verification scaffold; staging-then-prod human checkpoint pending.**

## Performance

- **Duration (autonomous):** ~28 min
- **Started:** 2026-05-01T20:53:58Z
- **Autonomous tasks completed:** 2026-05-01T21:22Z (approx)
- **Tasks completed (autonomous):** 3 of 4 (Tasks 1, 2, 4)
- **Task pending (human checkpoint):** Task 3 — staging + production runs of `pnpm db:migrate`
- **Files created:** 3 (migration SQL + test + verification scaffold)
- **Files modified:** 1 (run-migrations.ts splitter refactor)

## Accomplishments

- Wrote 0109_reconcile_soledad_mailland.sql by hand. Six SQL statements
  reconcile the inconsistent state left by the Soledad case:
  1. Reassign `financial_transactions.id=34` from member 5588 (deleted) to 5912.
  2. Move `transaction_links` for tx 34 from sub 6132 (cancelled) to sub 6382 (active).
  3. Delete orphan balances 14, 16, 20.
  4. Zero the balance for sub 6382 explicitly (per D-19).
  5. Cancel the dangling program_enrollment 1125.
  6. Insert an `audit_log` row with action='reconciliation', target_id=5912.

  Every UPDATE has a defensive WHERE on the BEFORE state. DELETE filters by
  exact ids. INSERT uses NOT EXISTS guard. Re-applying after the first run is
  a 0-row no-op.

- Built integration test `test/migrations/0109_reconcile_soledad.test.ts` with
  four scenarios:
  1. Source → target — seed the buggy state, apply, verify all 6 conditions.
  2. Idempotency via manual re-apply — apply twice, snapshot equality.
  3. Idempotency from already-target state (with the audit row pre-seeded so
     the NOT EXISTS guard skips the insert) — apply, zero state change.
  4. Owner fallback — seed without an `owner` user, apply, verify
     `audit_log.actor_id = 1` (the COALESCE fallback).

  All 4 tests pass against the per-worker `eltemplo_test` MySQL DB. Full API
  suite re-run: 74 test files / 1129 passing — no regressions from the splitter refactor.

- Refactored `src/db/run-migrations.ts` to export `splitSqlStatements()` and
  guarded the CLI auto-run with `require.main === module`. The integration
  test imports the same parser used in production, so any future change to
  splitter semantics is automatically exercised by the test.

- Scaffolded `.planning/phases/111-salvaguardas-operativas/111-VERIFICATION.md`
  with REQ-1..REQ-9 + D-01..D-28 + 23 SPEC items + an empty 8-row C1..C8 block
  for the staging run + a mirror block for production. Plans 01-05 are
  recorded as ✓ DONE; REQ-8/D-20 + SPEC items 16-22 are PARTIAL/PENDING until
  the human checkpoint completes.

## Task Commits

1. **Task 1: Hand-write 0109_reconcile_soledad_mailland.sql** — `e98eb2b7` (feat)
2. **Refactor splitSqlStatements export** — `817d68ac` (refactor)
3. **Task 2: Integration test for migration 0109** — `bc3850aa` (test)
4. **Task 4: 111-VERIFICATION.md scaffold** — `2f11c505` (docs)

**Task 3 commits:** _pending the staging + prod runs (the human checkpoint)._

## Files Created/Modified

- `el-templo-api/src/db/migrations/0109_reconcile_soledad_mailland.sql` —
  88-line hand-written DML migration. 6 statements + extensive header
  documenting the 6 reconciliation steps, the idempotency strategy, and the
  Phase 103-01 no-semicolon-in-comments invariant.
- `el-templo-api/test/migrations/0109_reconcile_soledad.test.ts` — 777 lines
  (after Prettier). Bootstrap seeds plan + program once, then per-test
  reset/seed via a single pooled connection with FK checks toggled off.
- `el-templo-api/src/db/run-migrations.ts` — extracted `splitSqlStatements`
  to a named export; replaced the inline splitter call with the function;
  guarded the auto-run with `require.main === module` so the file is
  side-effect-free when imported.
- `.planning/phases/111-salvaguardas-operativas/111-VERIFICATION.md` —
  scaffold of the canonical phase verification artifact. Filled rows for
  every REQ + D + SPEC item; placeholder rows for the 8 staging C1..C8
  outputs and the mirror production block.

## Decisions Made

All decisions follow the plan and CONTEXT.md as written:

- Hand-written migration (CLAUDE.md `pnpm db:generate` is for schema, not data fixes; reinforced by Phase 103-01 precedent).
- Step 4 (explicit zero of balance for sub 6382) included per D-19 — chose the safer explicit path over the lazy applyDelta path.
- COALESCE fallback to user id 1 per D-16. Document COALESCE behaviour in the migration header so the operator can verify the chosen actor before running.
- Splitter Option A: extracted `splitSqlStatements()` to a named export so the test imports the production parser. Did NOT add the Option B grep guard inline in the test as the only check — the boot-time `offendingComments` assertion already covers the comment invariant defensively, mirroring the same idea Option B suggested.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Guarded run-migrations.ts auto-run with require.main check**

- **Found during:** Task 2 (refactor preparation)
- **Issue:** `run-migrations.ts` calls `runMigrations()` at module load. Importing `splitSqlStatements` from the test file would trigger a real migration run against whatever DB the env points to. That's both a side-effect leak and a destructive action during test boot.
- **Fix:** Wrapped the auto-run in `if (require.main === module) { … }`. Production CLI invocations (`npx tsx src/db/run-migrations.ts`, `node dist/db/run-migrations.js`) still execute the function because the file is the entrypoint. Imports become side-effect-free.
- **Files modified:** `el-templo-api/src/db/run-migrations.ts`
- **Verification:** Full test suite re-run (74 files, 1129 tests) succeeded with no regressions; the test imports `splitSqlStatements` without triggering an unintended migration.
- **Committed in:** `817d68ac`

**2. [Rule 1 - Bug] Test 4 needed an explicit user id=1 seed**

- **Found during:** Task 2 (full-suite parallel run)
- **Issue:** Test 4 verifies that `audit_log.actor_id` falls back to literal 1 when no owner-role user exists. On worker pool 1 the test passed because `admin@test.com` already had id=1; on worker pool 2 the auto-increment had advanced past 1 (Phase 102 trial users seed first), so the FK on `actor_id → users(id)` failed.
- **Fix:** In `seedBuggyState({ omitOwnerRole: true })`, added `INSERT IGNORE INTO users (id=1, …)` after downgrading any owner. The fallback FK now resolves on every worker. afterAll cleanup deletes the synthetic fallback user (`fallback-actor-1@test.local`) so subsequent test files in the same worker are unaffected.
- **Files modified:** `el-templo-api/test/migrations/0109_reconcile_soledad.test.ts`
- **Verification:** Full test suite re-run (74 files, 1129 tests) — Test 4 passes on every worker pool.
- **Committed in:** `bc3850aa` (folded into the Task 2 commit since the bug surfaced during Task 2 verification)

---

**Total deviations:** 2 auto-fixed (1 blocking infra fix, 1 bug)
**Impact on plan:** Both fixes were necessary for the test to be deterministic and side-effect-free. No scope creep.

## Issues Encountered

- Vitest 4 deprecation warning about `test.poolOptions` is unrelated and pre-existing (visible in every test file).
- Prettier reformatted the test file and the verification scaffold during commit (lint-staged hook). No semantic changes — only column alignment and line wrapping. Documented in the system reminders.

## Threat Model Compliance

| Threat   | Mitigation                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-111-29 | Tampering — wrong-environment apply: Task 3 is a `checkpoint:human-action`, the agent cannot push or SSH; the operator approves the production run explicitly. _Mitigated by structure._ |
| T-111-30 | Tampering — hardcoded ids match wrong rows on dev/staging: every UPDATE WHERE includes the BEFORE-state value, so a non-matching row is a no-op (Tests 2 + 3 prove this).                |
| T-111-31 | Information Disclosure — PII-adjacent ids in audit_log: documented as accepted (operational metadata only).                                                                              |
| T-111-32 | Repudiation — actor_id may fall back to 1: documented in the migration header + verified in Test 4. Operator MUST confirm during Task 3 step 1 before running prod.                      |
| T-111-33 | Tampering — unintended DROP/TRUNCATE/ALTER: acceptance check via `grep -c 'DROP\|TRUNCATE\|ALTER TABLE\|CREATE TABLE' 0109_reconcile_soledad_mailland.sql` returns 0/0/0/0.              |
| T-111-34 | DoS — long-running locks: accepted; the migration touches < 10 rows.                                                                                                                     |
| T-111-35 | Information Disclosure — production ids in git: accepted (private repo, same risk profile as Phase 110 backfill).                                                                        |

## Pending: Task 3 Human Checkpoint

The plan's Task 3 is a `checkpoint:human-verify` (re-tagged here as
`human-action` because it requires SSH + DB credentials the agent cannot
reach). Procedure recorded in 111-VERIFICATION.md:

1. Confirm phase 111 plans 1-5 deployed to staging.
2. ASK USER FIRST before SSH.
3. Run `pnpm db:migrate` on staging, expect mention of 0109.
4. Verify `_migrations` row.
5. Run the 8 C1..C8 queries, paste output verbatim into VERIFICATION.md.
6. If all green: type `approved-for-prod`. Otherwise type `halt-fix: {note}`.
7. After prod run, repeat C1..C8 against production and append to VERIFICATION.md.

Until then, the plan is **PARTIAL**. The agent will not push, SSH, or apply
the migration to any non-test database.

## Self-Check

Files created (verified by `ls`):

- `el-templo-api/src/db/migrations/0109_reconcile_soledad_mailland.sql` — FOUND
- `el-templo-api/test/migrations/0109_reconcile_soledad.test.ts` — FOUND
- `.planning/phases/111-salvaguardas-operativas/111-VERIFICATION.md` — FOUND

Files modified:

- `el-templo-api/src/db/run-migrations.ts` — modified (splitter export + require.main guard)

Commits exist:

- `e98eb2b7` (Task 1 migration) — verified by `git log --oneline -6`
- `817d68ac` (splitter refactor) — verified
- `bc3850aa` (Task 2 test) — verified
- `2f11c505` (Task 4 verification scaffold) — verified

Tests:

- `pnpm test test/migrations/0109_reconcile_soledad.test.ts` — 4 / 4 PASS (40s)
- Full suite — 74 / 74 files, 1129 / 1129 tests pass (1 skipped, 2 todo)

Acceptance grep checks (Task 1):

- `grep -c "Reconciliación caso Soledad Mailland" 0109_…sql` = 2
- `grep -cE "^--.*;" 0109_…sql` = 0
- `grep -c "WHERE NOT EXISTS" 0109_…sql` = 1
- DROP/TRUNCATE/ALTER TABLE/CREATE TABLE counts = 0/0/0/0

## Self-Check: PASSED (autonomous portion)

The plan is PARTIAL pending Task 3 (staging + production runs). All
autonomous-portion acceptance criteria are met.

---

_Phase: 111-salvaguardas-operativas_
_Plan 06 partial completion: 2026-05-01_
_Final completion blocked by: staging + production runs (Task 3 human checkpoint)_
