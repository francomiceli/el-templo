---
phase: 111-salvaguardas-operativas
plan: 02
subsystem: audit-log-foundation
tags: [audit-log, drizzle-schema, migration, transactional-helper, atomicity]

requires:
  - phase: 111-salvaguardas-operativas
    plan: 01
    provides: shared/ helper module pattern + index barrel re-export convention
provides:
  - audit_log table physically present in dev DB (8 cols + 3 indexes + FK actor->users)
  - Drizzle schema export `auditLog` from src/db/schema/audit-log.ts
  - Migration 0108_create_audit_log.sql tracked in _migrations
  - Transactional helper auditLog.write(tx, params) at modules/shared/audit-log.ts
  - AuditAction union: subscription_cancelled | transaction_voided | plan_assigned | reconciliation
  - AuditTargetKind union: subscription | transaction | member
  - 4 integration tests covering happy path, rollback atomicity, optional reason, JSON round-trip
affects: [111-03, 111-04, 111-05, 111-06]

tech-stack:
  added: []
  patterns:
    - Heterogeneous-FK audit row (actor_id FK to users, target_id intentionally NOT a FK; target_kind discriminator) — mirrors transaction_links.ts
    - Helper takes REQUIRED tx handle, never opens its own transaction (atomicity owned by caller)
    - Hand-written migration SQL when drizzle-kit meta is out of sync (Phase 86 / 103-01 / 90 precedent)

key-files:
  created:
    - el-templo-api/src/db/schema/audit-log.ts
    - el-templo-api/src/db/migrations/0108_create_audit_log.sql
    - el-templo-api/src/modules/shared/audit-log.ts
    - el-templo-api/test/shared/audit-log.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts (barrel re-export of audit-log)
    - el-templo-api/src/modules/shared/index.ts (barrel re-export auditLog + types)

key-decisions:
  - "Helper accepts REQUIRED tx handle (not optional) — every Phase 111 call site already wraps in db.transaction"
  - "Helper does NOT open its own transaction; if caller's tx rolls back, the audit row vanishes (T-111-09)"
  - "target_id has no FK; target_kind+target_id is heterogeneous (mirrors transaction_links.ts) — service layer enforces"
  - "Hand-written migration SQL because drizzle-kit meta/_journal.json snapshot is at 0059 while DB is at 0107 — db:generate would either prompt interactively or pollute the file with unrelated columns (Phase 86 / 103-01 precedent)"
  - "TxHandle imported from finance/balance-service (where it is the canonical export) rather than redefining it locally"
  - "AuditTargetKind union includes 'member' to support reconciliation (Plan 06) writes that target a user row"

patterns-established:
  - "Audit helper as object with .write method (not a free function) — mirrors phone.ts named-export style at the barrel while keeping the call site auditLog.write(tx, ...) self-documenting"
  - "Integration test asserts atomicity by THROWING inside db.transaction and confirming row count unchanged — direct verification of rollback behaviour"
  - "JSON round-trip test reads back via Drizzle select to confirm payloadJson stores arbitrary Record<string, unknown>"

requirements-completed: [REQ-7-foundation]

duration: ~6min
completed: 2026-05-01
---

# Phase 111 Plan 02: audit_log foundation Summary

Built the audit_log foundation: Drizzle schema, generated migration applied to the dev DB, and the transactional helper `auditLog.write(tx, params)` that subsequent plans (REQ-1, REQ-3, REQ-7, REQ-8 call sites in Plans 03+) consume.

## What Was Built

### Drizzle schema (Task 1)

`el-templo-api/src/db/schema/audit-log.ts` exports `auditLog` mysqlTable with 8 columns:

| Column       | Type               | Constraint                                     |
| ------------ | ------------------ | ---------------------------------------------- |
| id           | INT AUTO_INCREMENT | PRIMARY KEY                                    |
| actor_id     | INT                | NOT NULL, FK -> users(id)                      |
| action       | VARCHAR(50)        | NOT NULL                                       |
| target_kind  | VARCHAR(30)        | NOT NULL                                       |
| target_id    | INT                | NOT NULL (no FK — heterogeneous discriminator) |
| payload_json | JSON               | NOT NULL                                       |
| reason       | TEXT               | NULL                                           |
| created_at   | TIMESTAMP          | NOT NULL DEFAULT CURRENT_TIMESTAMP             |

3 indexes:

- `idx_audit_log_action_created` on (action, created_at) — for "all cancellations in a window" queries
- `idx_audit_log_target` on (target_kind, target_id) — for "all events on subscription X"
- `idx_audit_log_actor_created` on (actor_id, created_at) — for "all actions by admin Y"

Confirmed against D-12: schema matches the contract exactly.

### Migration (Task 2)

Filename: `el-templo-api/src/db/migrations/0108_create_audit_log.sql`

**Drizzle-kit prompts encountered:** `pnpm db:generate` prompted interactively about an unrelated `sessions.goal_plan_type` column (drizzle-kit's snapshot meta is stale — latest journal entry is 0059, DB is at 0107). Continuing through the prompts would have polluted the migration file with columns unrelated to Plan 02. Per Phase 86, 90, and 103-01 precedent in STATE.md, the SQL was hand-written to mirror the schema exactly. The Drizzle schema in `audit-log.ts` is the canonical source of truth — the SQL DDL replicates it byte-for-byte (column types, lengths, indexes, FK).

Applied via `pnpm db:migrate`. Verification:

```
mysql> SHOW TABLES LIKE 'audit_log';   -- 1 row
mysql> DESCRIBE audit_log;             -- 8 columns match
mysql> SHOW INDEXES FROM audit_log;    -- PRIMARY + 3 expected indexes
mysql> SELECT name FROM _migrations WHERE name LIKE '0108%';  -- '0108_create_audit_log.sql'
```

No inline `;` in any SQL line comment (Phase 103-01 runner constraint satisfied — the runner splits on `;` BEFORE stripping comments).

### Helper (Task 3)

`el-templo-api/src/modules/shared/audit-log.ts` — RED → GREEN TDD cycle.

Signature for downstream plans:

```typescript
import { auditLog } from "../shared/audit-log";
// or: import { auditLog } from "../shared";

await auditLog.write(tx, {
  actorId: request.user.userId,
  action: "subscription_cancelled",
  targetKind: "subscription",
  targetId: sub.id,
  payload: { subId: sub.id, prevStatus, newStatus, ... },
  reason: input.notes ?? null,
});
```

**Atomicity contract (D-14):**

- `tx` is REQUIRED — TypeScript signature forbids calling without a transaction handle.
- Helper does NOT call `db.transaction()`. The single `transaction(` substring match in the file is in a JSDoc comment, not code.
- If the caller's `db.transaction(async (tx) => { ... })` rolls back (throws), the audit row vanishes. **Verified by Test 2** below.

### Tests (Task 3)

`el-templo-api/test/shared/audit-log.test.ts` — 4/4 passing in 34.8s against the per-worker `eltemplo_test_*` DB.

| #   | Test                                                                      | Outcome  |
| --- | ------------------------------------------------------------------------- | -------- |
| 1   | Happy path — row persists after commit                                    | PASS     |
| 2   | **Atomicity** — row vanishes when caller's tx rolls back via thrown error | **PASS** |
| 3   | `reason` omitted → DB row has `reason IS NULL`                            | PASS     |
| 4   | Payload JSON round-trip equality (nested object + array)                  | PASS     |

Full suite re-run: 70 test files, 1102 passed / 1 skipped / 2 todo. No regressions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hand-wrote migration SQL instead of `pnpm db:generate`**

- **Found during:** Task 2
- **Issue:** `pnpm db:generate` opened an interactive prompt about unrelated `sessions.goal_plan_type` column (drizzle-kit's `meta/_journal.json` snapshot is at 0059 while the DB is at 0107 — heavy drift documented in CLAUDE.md). Answering would have generated a migration file containing columns from 0060-0107 PLUS our audit_log, a clear pollution risk.
- **Fix:** Wrote `0108_create_audit_log.sql` by hand, mirroring `src/db/schema/audit-log.ts` exactly (8 columns, 3 indexes, FK actor_id->users(id)). This matches the established Phase 86 ("Manual migration SQL instead of drizzle-kit generate to avoid interactive prompts in non-interactive execution"), Phase 90, and Phase 103-01 precedents already recorded in STATE.md.
- **Files modified:** `el-templo-api/src/db/migrations/0108_create_audit_log.sql`
- **Commit:** `818c6677`

## Threat Model Compliance

All Phase 111 threat-model items relevant to Task 3 are mitigated by structure, not by runtime checks:

| Threat                                            | Mitigation                                                                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| T-111-05 (Tampering — UPDATE/DELETE on audit_log) | Helper exposes only `.write()`; no update/delete surface in code. JSDoc documents this. SQL-level REVOKE deferred.                |
| T-111-07 (Repudiation — wrong actor_id)           | Helper requires `actorId` param; does NOT infer it. Route layer must source from `request.user.userId`.                           |
| T-111-09 (Atomicity violation)                    | Helper signature requires `tx`; does NOT open its own transaction. Test 2 (rollback) verifies the structural contract end-to-end. |

T-111-06 (PII in payload_json) is a Plan 03 / Plan 06 concern — the call sites must use the D-13 payload shapes that exclude DOB / DNI.

## Downstream Integration Points

For Plan 03 (REQ-1 + REQ-3 + REQ-7 call sites) and Plan 06 (REQ-8 reconciliation migration):

- Import path: `import { auditLog } from "../shared/audit-log"` or `import { auditLog } from "../shared"`
- Both call sites already wrap in `db.transaction(async (tx) => { ... })` per `cancelSubscription` (line 1881-1955), `TransactionService.void` (line 234), and `assignPlan` (final block).
- Pass the `tx` handle from the surrounding callback — do NOT re-wrap.
- For Plan 06's reconciliation INSERT, raw SQL inside the migration uses `INSERT INTO audit_log (...)` directly with action='reconciliation', target_kind='member'.

## Self-Check: PASSED

Files created:

- `el-templo-api/src/db/schema/audit-log.ts` — FOUND
- `el-templo-api/src/db/migrations/0108_create_audit_log.sql` — FOUND
- `el-templo-api/src/modules/shared/audit-log.ts` — FOUND
- `el-templo-api/test/shared/audit-log.test.ts` — FOUND

Commits:

- `a6ed65b7` (Task 1 schema) — FOUND
- `818c6677` (Task 2 migration) — FOUND
- `b992140a` (Task 3 RED test) — FOUND
- `e7923b49` (Task 3 GREEN helper) — FOUND

Database:

- `audit_log` table exists in `eltemplo` dev DB with 8 columns + 3 indexes + FK
- `_migrations` row for `0108_create_audit_log.sql` present

Tests:

- 4/4 audit-log tests PASS
- Full API suite: 1102 PASS / 1 skipped / 2 todo (no regressions)
