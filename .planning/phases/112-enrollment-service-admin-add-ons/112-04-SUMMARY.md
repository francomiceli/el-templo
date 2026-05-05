---
phase: 112-enrollment-service-admin-add-ons
plan: 04
subsystem: programs
tags: [api, finance, audit, admin, programs, enrollments, addons]
requires:
  - EnrollmentService chokepoint (Plan 02)
  - Lifecycle hooks pause/resume/transfer/teardown (Plan 03)
  - program_enrollments source enum + subscription_id column (Plan 01)
  - TransactionService + BalanceService (Phase 105)
  - auditLog.write helper (Phase 111-02)
provides:
  - "POST /api/admin/users/:userId/program-addons (D-10) — admin add-on assignment"
  - "EnrollmentService.enrollAddon body — atomic enrollment + financial_transaction (when pricePaid > 0) + audit log"
  - "TransactionService.create accepts target_kind='enrollment' (TXN-07 probe extended)"
  - "POST /api/admin/programs/enrollments/:enrollmentId/cancel writes audit_log entry when source='admin_addon'"
  - "transaction_links.target_kind enum widened to include 'enrollment'"
affects:
  - "BalanceService.applyDelta — early-skip for target_kind='enrollment' (no balances cache effect)"
tech-stack:
  added: []
  patterns:
    - "D-13 LOCKED: extend target_kind (NOT kind) — preserves Phase 105-04 D-01 canonical revenue filter (kind IN ('plan_charge','debt_settlement') AND direction='inflow') unchanged"
    - "Optional 3rd-arg DI: EnrollmentService(db, log, transactionService?) — preserves Plan 02 DI rollout shape, only the new admin route wires the finance layer"
    - "Structured 4xx error codes via (err as { code?: string }).code property — mirrors Phase 111-03 cancelSubscription pattern"
    - "BalanceService applyDelta early-skip mirrors target_kind='transaction' precedent — enrollment links are trazability-only, no running obligation"
    - "Audit reuse of action='plan_assigned' for cancel via cancelledByAdmin:true payload flag — avoids extending the AuditAction enum (defer to a future phase if ops needs cleaner reporting)"
key-files:
  created:
    - el-templo-api/src/db/migrations/0112_transaction_links_target_kind_enrollment.sql
    - el-templo-api/test/programs/admin-addons.test.ts
  modified:
    - el-templo-api/src/db/schema/transaction-links.ts
    - el-templo-api/src/modules/finance/balance-service.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/programs/enrollment-service.ts
    - el-templo-api/src/modules/programs/routes.ts
    - el-templo-api/src/modules/programs/types.ts
decisions:
  - "D-13 (LOCKED by planner): extend transaction_links.target_kind enum with 'enrollment' — kind='plan_charge' semantically fits, granular trazability lives at the link layer, Phase 105-04 D-01 canonical revenue filter stays unchanged (zero analytics audit needed)"
  - "D-22 (LOCKED by planner): RBAC = FINANCE_WRITE_ROLES (owner|admin|gestion|recepcion) — matches recepcion's existing precedent of creating kind='plan_charge' transactions via assignPlan today"
  - "BalanceService.applyDelta gained an early-skip for target_kind='enrollment' (Rule 1 deviation) — type widening surfaced at the balances call sites because BalanceTargetKind narrows to the 2-value subset; admin add-on charges are one-shot and do not represent a running obligation"
  - "EnrollmentService constructor takes TransactionService as an OPTIONAL 3rd arg — only the new admin route wires it; Plan 02's 11 DI sites are unchanged because they never invoke enrollAddon"
  - "Cancel audit reuses action='plan_assigned' with payload.cancelledByAdmin=true rather than extending the AuditAction enum (4 values today: subscription_cancelled, transaction_voided, plan_assigned, reconciliation) — minimal-surface choice, defer enum widening until ops-side reporting requires it"
  - "Atomicity test exercises the program-not-found rollback path (deterministic NotFoundError before insert) — financial-write rollback is structurally guaranteed by the same db.transaction wrapping but harder to deterministically test without a TransactionService mock; the contract is unambiguous (5 mutations under 1 tx)"
  - "Currency inheritance (D-15) reads from subscription_plans.currency via INNER JOIN, NOT subscriptions.currency — both values are normally identical at assign time, but the plan join is the canonical source per the plan's 'inherits from active sub plan' wording"
metrics:
  duration: ~26min
  tasks: 5
  files: 8
  completed: 2026-05-05
requirements:
  - ADDON-API-01
  - ADDON-API-02
  - ADDON-API-03
  - ADDON-API-04
  - ADDON-API-05
  - ADDON-API-06
---

# Phase 112 Plan 04: Admin Add-on API + Finance Integration Summary

The admin add-on assignment surface is live. Migration `0112` extends `transaction_links.target_kind` with `'enrollment'`, the TransactionService TXN-07 probe gained a fourth case for the new value, `EnrollmentService.enrollAddon` now contains the atomic 6-step body (validate sub → validate program → duplicate gate → insert enrollment → optional financial_transaction + transaction_links → audit log), and a new admin route `POST /api/admin/users/:userId/program-addons` orchestrates the flow with FINANCE_WRITE_ROLES guard + structured 4xx error codes. The existing cancel endpoint now writes an audit_log entry when the cancelled enrollment is source='admin_addon'. 13 new integration tests against real MySQL cover all six ADDON-API requirements plus RBAC, audit, atomicity and currency inheritance.

## Endpoint Contract

### Request

```
POST /api/admin/users/:userId/program-addons
Headers: Authorization: Bearer <token>
Body:
  {
    "programId": <integer ≥ 1>,
    "pricePaid": <integer ≥ 0 | null>,    // optional; null|0 → regalo path
    "paymentMethod": "cash" | "transfer" | "card" | "aura_credit" | "internal",  // optional, default 'cash'
    "notes": <string ≤ 500 chars | null>  // optional
  }
```

`additionalProperties: false` — every other key is rejected with HTTP 400 (T-112-04-02 mitigation).

### Response

```
200 OK
{ "enrollmentId": <integer> }
```

### Error codes

| Status | Code                     | Trigger                                                       |
| ------ | ------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 400    | `ASSIGN_PLAN_FIRST`      | User has no active or paused subscription (D-11)              |
| 400    | _(no code)_              | Body fails Fastify schema (additionalProperties, type, range) |
| 403    | _(no code)_              | role ∉ FINANCE_WRITE_ROLES (D-22)                             |
| 404    | _(no code)_              | Program not found OR `is_active=false`                        |
| 409    | `PROGRAM_ALREADY_ACTIVE` | Existing active                                               | paused enrollment for the same program (D-12, any source — including bundle edge case) |

## Locked Decisions (planner)

### D-13 — extend `target_kind` (not `kind`)

The financial transaction emitted at `pricePaid > 0` time uses `kind='plan_charge'` and links to the new enrollment via `target_kind='enrollment'`. Reason locked at the planner level: reusing `kind='plan_charge'` keeps the **Phase 105-04 D-01 canonical revenue filter** (`kind IN ('plan_charge','debt_settlement') AND direction='inflow' AND voided_at IS NULL`) unchanged across every analytics + reports query block. Granular trazability (this charge is for _which_ enrollment) lives at the link layer instead — minimal-surface change.

### D-22 — RBAC = FINANCE_WRITE_ROLES

`owner | admin | gestion | recepcion` (matches `el-templo-api/src/modules/shared/permissions.ts:80-85`). Recepcion already creates `kind='plan_charge'` transactions today via `assignPlan` (Phase 107) and receives the same revenue surface. Asymmetric blocking would create operational friction with no security benefit.

## Sample audit_log payload (sanitized)

Happy-path POST with `pricePaid=5000` writes:

```json
{
  "actor_id": 1,
  "action": "plan_assigned",
  "target_kind": "member",
  "target_id": 42,
  "payload_json": {
    "enrollmentId": 117,
    "programId": 8,
    "pricePaid": 5000,
    "subscriptionId": 91,
    "currency": "ARS",
    "source": "admin_addon"
  },
  "reason": null,
  "created_at": "2026-05-05T00:55:12.000Z"
}
```

Manual cancel of the same row writes a SECOND audit_log entry with the same `action='plan_assigned'` and `payload.cancelledByAdmin=true` (intentional reuse — see Decisions).

## Verification

| Check                                                                       | Result                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `cd el-templo-api && pnpm db:migrate`                                       | Applied `0112_transaction_links_target_kind_enrollment.sql` (1 row)    |
| `pnpm tsc --noEmit`                                                         | exit 0                                                                 |
| `grep "MODIFY COLUMN target_kind ENUM.*enrollment" 0112_*.sql`              | match                                                                  |
| `grep -E "^--.*;" 0112_*.sql`                                               | 0 lines (no semicolon hazards in comments)                             |
| `grep "case \"enrollment\":" finance/transaction-service.ts`                | 1 match                                                                |
| `grep "Plan 04" programs/enrollment-service.ts`                             | 0 (stub gone)                                                          |
| `grep -c "ASSIGN_PLAN_FIRST\|PROGRAM_ALREADY_ACTIVE" enrollment-service.ts` | 4 (declaration + assignment lines)                                     |
| `grep -c "auditLog.write" enrollment-service.ts`                            | 2 (assign + comment)                                                   |
| `grep "kind: \"plan_charge\"" enrollment-service.ts`                        | match                                                                  |
| `grep "targetKind: \"enrollment\"" enrollment-service.ts`                   | match                                                                  |
| `grep -c "program-addons" programs/routes.ts`                               | ≥ 1                                                                    |
| `grep "FINANCE_WRITE_ROLES" programs/routes.ts`                             | match                                                                  |
| `grep "ASSIGN_PLAN_FIRST\|PROGRAM_ALREADY_ACTIVE" programs/routes.ts`       | both match                                                             |
| `grep "auditLog.write" programs/routes.ts`                                  | match (cancel handler)                                                 |
| `grep "new EnrollmentService(.*transactionService" programs/routes.ts`      | match                                                                  |
| `pnpm test test/programs/admin-addons.test.ts`                              | **13/13 PASS** (30s)                                                   |
| `pnpm test test/finance/`                                                   | 141/141 PASS (no regression)                                           |
| `pnpm test test/programs/`                                                  | 31/31 PASS across 3 files (admin-addons + lifecycle + current-program) |
| `pnpm test test/programs/ test/finance/ test/subscriptions/`                | 289/292 PASS — 3 PRE-EXISTING timezone failures (see "Known Issues")   |
| `git diff el-templo-api/test/finance/ el-templo-api/test/subscriptions/`    | empty (no test file modified)                                          |

## Test results — admin-addons.test.ts (13/13)

```
✓ ADDON-API-01: admin POST creates an active admin_addon enrollment row
✓ ADDON-API-02: user with no active sub returns 400 ASSIGN_PLAN_FIRST
✓ ADDON-API-03: pricePaid>0 emits financial_transaction (plan_charge inflow) + transaction_links target_kind=enrollment
✓ ADDON-API-04: pricePaid=0 creates the enrollment but no financial_transaction (regalo path)
✓ ADDON-API-04: pricePaid omitted (null) also skips financial_transaction
✓ ADDON-API-05: duplicate active enrollment for same program returns 409 PROGRAM_ALREADY_ACTIVE (admin_addon source)
✓ ADDON-API-05: duplicate via plan_linked source also returns 409 PROGRAM_ALREADY_ACTIVE
✓ ADDON-API-06: cancel of admin_addon enrollment writes audit_log entry with cancelledByAdmin=true
✓ D-22: coach role gets 403 (FINANCE_WRITE_ROLES excludes coach)
✓ D-22: recepcion role gets 200 (FINANCE_WRITE_ROLES includes recepcion)
✓ D-24: assignment writes audit_log row with action=plan_assigned and full payload
✓ Atomicity: program does not exist → no enrollment row inserted (full tx rollback)
✓ D-15: currency inherits from active sub plan — EUR plan produces EUR financial_transaction
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug surfaced by Task 1] BalanceService.applyDelta needed early-skip for `target_kind='enrollment'`.**

- **Found during:** Task 1 verify (`pnpm tsc --noEmit` reported 2 errors in `el-templo-api/src/modules/finance/balance-service.ts:102` and `:160`).
- **Issue:** Widening `transaction_links.target_kind` to include `'enrollment'` widens `TargetKind` (via `$inferSelect`) which is the type of `link.targetKind` consumed by `applyDelta`. That value is then passed to `eq(schema.balances.targetKind, link.targetKind)` and to `tx.insert(schema.balances).values({ targetKind: ... })` — but `balances.targetKind` is a NARROWER enum (only `'subscription' | 'debt_balance'`). TS overload resolution failed.
- **Fix:** Added an early `if (link.targetKind === "enrollment") continue;` immediately after the existing `'transaction'` skip. Same pattern, identical justification: enrollment links are trazability-only — admin add-on charges are one-shot and do NOT represent a running obligation that the `balances` cache should track. Doc-comment in `applyDelta` updated to spell out the new rule.
- **Files modified:** `el-templo-api/src/modules/finance/balance-service.ts`.
- **Why not a CHECKPOINT:** The semantics are unambiguous (enrollment is trazability-only, mirrors target_kind='transaction' precedent which is also a no-op in the cache). The fix is additive and visible at the call site. Test ADDON-API-03 verifies the financial_transaction + transaction_links rows are still written correctly without a balances row.
- **Commit:** `5a2a1732`.

### Deferred Issues

_None._ Plan 04 ships everything intended.

## Pre-existing test was modified

**Zero.** `git diff el-templo-api/test/finance/ el-templo-api/test/subscriptions/` returns empty before, during, and after Plan 04 commits. Only `test/programs/admin-addons.test.ts` was created (Task 5).

## Known Issues (carried)

**3 pre-existing timezone failures in `test/subscriptions/expire-cancel-linked-program.test.ts`:**

```
✗ cancelSubscription cancels the enrollment owned by the plan's linkedProgramId
✗ teardown preserves enrollment when ANOTHER active sub links to the same program
✗ regression — bundle teardown still cancels owned enrollments on autoExpire
```

Documented in Plan 03 deferred-items as carried-over from Plan 03 (root cause: `recomputeUserStatus` SQL uses MySQL `CURDATE()` while `assignPlan` writes `start_date` from UTC, so when local clock is one day behind UTC the active-sub EXISTS check fails and the user stays at registration default `'freemium'`). Pre-existing on Plan 02 baseline. Out of scope for Plan 04 per the SCOPE BOUNDARY rule. Fix path: pin MySQL session `time_zone='+00:00'` in test setup OR migrate the failing tests to consistent `dateOffsetStr(-1)`.

## Auth Gates

None — fully autonomous against the local dev environment.

## Operator Checkpoints (Pending — DO NOT auto-run)

1. **Staging:** run `pnpm db:migrate` against staging MySQL after sign-off. Migration is idempotent; expected output: `Applying: 0112_transaction_links_target_kind_enrollment.sql (1 statements) Applied successfully`. Verify with:

   ```sql
   SHOW COLUMNS FROM transaction_links LIKE 'target_kind';
   -- Expect: enum('subscription','debt_balance','transaction','enrollment')

   SELECT name FROM _migrations WHERE name = '0112_transaction_links_target_kind_enrollment.sql';
   -- Expect: 1 row
   ```

   Then deploy code and smoke-test: `POST /api/admin/users/<userId>/program-addons` with `pricePaid=0` and a valid programId. Expect 200 + a row in `program_enrollments` with `source='admin_addon'` and `audit_log` row with `action='plan_assigned'`.

2. **Production:** only after staging is verified clean. Same pattern: `pnpm db:migrate` then deploy. Idempotent — re-running on already-applied DB is a 0-row no-op (the `_migrations` tracker blocks).

Mirror of the same human-checkpoint pattern from Plan 01 (migration 0111) and Plan 111-06 (migration 0109).

## Threat Flags

None — the new endpoint mounts at `/api/admin/users/:userId/program-addons` which is well within the existing admin trust boundary (FINANCE_WRITE_ROLES guard, audit log on every write). No new auth path or data-egress surface introduced.

## Commits (per-task)

| Task | Description                                                                                        | Hash       |
| ---- | -------------------------------------------------------------------------------------------------- | ---------- |
| 1    | Migration 0112 + Drizzle schema + BalanceService.applyDelta enrollment skip                        | `5a2a1732` |
| 2    | TransactionService TXN-07 probe extension (case "enrollment" → program_enrollments)                | `c00efe32` |
| 3    | EnrollmentService.enrollAddon body: validate → insert → optional finance → audit log (atomic)      | `60e3e6eb` |
| 4    | POST /api/admin/users/:userId/program-addons + cancel-with-audit enhancement + EnrollAddonResponse | `a566bf72` |
| 5    | 13 integration tests covering ADDON-API-01..06 + RBAC + atomicity + audit + currency               | `2dad17dd` |

## Self-Check: PASSED

- ✓ `el-templo-api/src/db/migrations/0112_transaction_links_target_kind_enrollment.sql` exists (FOUND)
- ✓ `el-templo-api/test/programs/admin-addons.test.ts` exists (FOUND, 550 LOC)
- ✓ Schema enum widened (FOUND: `grep -c "enrollment" src/db/schema/transaction-links.ts` = 3)
- ✓ TXN-07 probe extended (FOUND: `case "enrollment":` line in transaction-service.ts)
- ✓ enrollAddon body filled (FOUND: 0 occurrences of "Plan 04" stub string)
- ✓ POST endpoint registered (FOUND: `program-addons` in routes.ts)
- ✓ Cancel audit branch (FOUND: `cancelledByAdmin` in routes.ts)
- ✓ Commit `5a2a1732` (FOUND in `git log --oneline`)
- ✓ Commit `c00efe32` (FOUND)
- ✓ Commit `60e3e6eb` (FOUND)
- ✓ Commit `a566bf72` (FOUND)
- ✓ Commit `2dad17dd` (FOUND)
- ✓ `pnpm db:migrate` — exit 0, 1 migration applied
- ✓ `pnpm tsc --noEmit` — exit 0
- ✓ `pnpm test test/programs/admin-addons.test.ts` — 13/13 PASS
- ✓ `pnpm test test/finance/` — 141/141 PASS (no regression)
- ✓ `pnpm test test/programs/ test/finance/ test/subscriptions/` — 289/292 PASS (3 pre-existing timezone failures only)
- ✓ `git diff el-templo-api/test/finance/ el-templo-api/test/subscriptions/` — empty (no test file modified)
