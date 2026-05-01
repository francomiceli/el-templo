# Phase 111 — Verification

**Status:** SCAFFOLD — pending staging run + production approval (plan 06 task 3)
**Created:** 2026-05-01
**Last updated:** 2026-05-01
**Verifier:** _to be filled in after staging run_
**Environments covered:**

- staging — _pending_
- production — _pending_

This document is the canonical verification artifact for phase 111. It is filled
out incrementally:

- Plans 01..05 are complete and their evidence is recorded in the SPEC + REQ +
  CONTEXT tables below.
- Plan 06 task 3 (the staging-then-production reconcile run for migration 0109)
  is the human-action checkpoint. After staging executes, paste the eight
  C1..C8 query outputs into the "REQ-8 Reconcile — Staging Verification"
  section. After production runs, copy the same eight checkpoints into the
  "Production Run" section.

Until both runs are recorded, the **Final phase status** at the bottom of this
file remains `IN PROGRESS — awaiting staging + prod runs`.

---

## REQ Coverage

| REQ   | Status                         | Evidence                                                                                                                     |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| REQ-1 | DONE                           | Plan 03 task 1 — `assignPlan` validates plan_category vs branch.isVirtual; integration test in subscriptions/lifecycle       |
| REQ-2 | DONE                           | Plan 05 task 1 — AssignPlanDialog filter + banner CTA + stacked MemberFormDialog conversion (manual UAT in plan 05)          |
| REQ-3 | DONE                           | Plan 03 task 2 — `cancelSubscription` blocks on non-voided transaction_links; structured 4xx body                            |
| REQ-4 | DONE                           | Plan 04 task 1 + plan 05 task 2 — `/admin/members/check-duplicates` endpoint + on-blur lookup in MemberFormDialog            |
| REQ-5 | DONE                           | Plan 04 task 2 — `/auth/register` blocks duplicate phone; HTTP 409 PHONE_ALREADY_REGISTERED                                  |
| REQ-6 | DONE                           | Plan 05 task 3 — Eliminar button + confirm dialog removed from AlumnoDetailPage; `softDeleteMember` UI callers grep = 0      |
| REQ-7 | DONE                           | Plan 02 + plan 03 — audit_log table + helper + 3 call sites (cancelSubscription, void, assignPlan)                           |
| REQ-8 | PARTIAL — staging+prod pending | Plan 06 — migration 0109 written + integration test passes locally (4 cases). Awaiting staging run + prod approval (task 3). |
| REQ-9 | DONE                           | Plan 01 — `normalizePhone()` helper (backend + frontend mirror) + trim of first_name/last_name in service layer              |

---

## SPEC Acceptance — 23 Checkboxes

The acceptance items from `111-SPEC.md` (lines 130-153). One row per checkbox.
Status legend: ✓ implemented + verified locally; (S) staging-pending; (P)
production-pending.

| #   | Acceptance criterion                                                                                                          | Status                    | Evidence                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | POST /subscriptions/assign-plan with plan presencial + branch virtual → HTTP 400 with "Plan presencial requiere sede física"  | ✓                         | Plan 03 — assignPlan validation (subscriptions/service.ts) + integration test                     |
| 2   | AssignPlanDialog for virtual-branch member does not show plans with plan_category='presencial'                                | ✓                         | Plan 05 — AssignPlanDialog `filteredPlans` + `memberBranchIsVirtual` prop                         |
| 3   | AssignPlanDialog for virtual-branch member shows card-banner with CTA "Convertir a sede física"                               | ✓                         | Plan 05 — banner template + click opens stacked MemberFormDialog                                  |
| 4   | Banner CTA opens MemberFormDialog conversion; after save, plan list refreshes and presenciales appear                         | ✓                         | Plan 05 — watcher on memberBranchId triggers loadPlans refetch                                    |
| 5   | POST cancel sub with non-voided transaction_links → HTTP 400 with array of pending tx_ids                                     | ✓                         | Plan 03 — REQ-3 guard in cancelSubscription with structured body code=SUB_HAS_ACTIVE_TRANSACTIONS |
| 6   | POST cancel sub with no tx or all voided → HTTP 200 (existing behavior preserved)                                             | ✓                         | Plan 03 — integration test for happy path                                                         |
| 7   | GET /admin/members/check-duplicates?dni=X / ?phone=Y returns matches with id, firstName, lastName, branchName, isVirtual, …   | ✓                         | Plan 04 — endpoint + service method `checkDuplicates`                                             |
| 8   | MemberFormDialog (create mode) does on-blur lookup and shows "Ya existe: {name} ({sede})" link if non-deleted match           | ✓                         | Plan 05 — onDniChange + onPhoneChange + inline match banner                                       |
| 9   | Submit button of create-member form disabled when lookup found a match                                                        | ✓                         | Plan 05 — `submitDisabled` computed bound to form submit                                          |
| 10  | POST /auth/register with normalized phone matching active presential user → HTTP 409                                          | ✓                         | Plan 04 — REQ-5 phone block in auth/routes.ts                                                     |
| 11  | Admin UI: no button on any screen triggers `softDeleteMember`; grep of admin callers = 0                                      | ✓                         | Plan 05 — Eliminar button + dialog + handlers + refs removed from AlumnoDetailPage                |
| 12  | `audit_log` table exists in the new Drizzle migration                                                                         | ✓                         | Plan 02 — schema audit-log.ts + migration 0108_create_audit_log.sql                               |
| 13  | Each `cancelSubscription` success inserts audit_log entry with action='subscription_cancelled'                                | ✓                         | Plan 03 — call site in cancelSubscription within db.transaction                                   |
| 14  | Each `TransactionService.void` success inserts audit_log entry with action='transaction_voided'                               | ✓                         | Plan 03 — call site inside void's db.transaction                                                  |
| 15  | Each `assignPlan` success inserts audit_log entry with action='plan_assigned'                                                 | ✓                         | Plan 03 — call site at end of assignPlan happy path                                               |
| 16  | After Soledad migration: `financial_transactions.id=34.member_id=5912`                                                        | ✓ local · (S)/(P) pending | Plan 06 task 2 Test 1 — assertion #1 passes against eltemplo_test                                 |
| 17  | After Soledad migration: `transaction_links.id=34.target_id=6382`                                                             | ✓ local · (S)/(P) pending | Plan 06 task 2 Test 1 — assertion #2 passes                                                       |
| 18  | After Soledad migration: `balances` has no rows with `target_id IN (6132, 6134, 6381)` matching the deleted member's orphans  | ✓ local · (S)/(P) pending | Plan 06 task 2 Test 1 — assertion #3 verifies ids 14, 16, 20 deleted                              |
| 19  | After Soledad migration: `balances` for sub 6382 = 0 ARS                                                                      | ✓ local · (S)/(P) pending | Plan 06 task 2 Test 1 — assertion #4 (explicit zero per D-19)                                     |
| 20  | After Soledad migration: `program_enrollments.id=1125.status='cancelled'`                                                     | ✓ local · (S)/(P) pending | Plan 06 task 2 Test 1 — assertion #5                                                              |
| 21  | After Soledad migration: an `audit_log` entry with reason "Reconciliación caso Soledad Mailland — phase 111" exists           | ✓ local · (S)/(P) pending | Plan 06 task 2 Test 1 — assertion #6                                                              |
| 22  | Re-running the Soledad migration → 0 errors, 0 duplicated rows                                                                | ✓ local · (S)/(P) pending | Plan 06 task 2 Tests 2 + 3 — manual re-apply and target-state idempotency                         |
| 23  | `normalizePhone("+54 223 661 4406")` returns `"2236614406"` in unit test; insert with `firstName="  Soledad  "` saves trimmed | ✓                         | Plan 01 — phone.test.ts + members service trim integration tests                                  |

---

## CONTEXT Decisions — 28 D-XX

The decisions from `111-CONTEXT.md`. Each maps to the implementation that
realises it.

| D-XX | Decision summary                                                                                                        | Status  | Evidence                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| D-01 | No dedicated "convertir" mode — reuse MemberFormDialog edit flow                                                        | ✓       | Plan 05 — banner CTA opens MemberFormDialog mode='edit' with isVirtual→isVirtual!==true detection                          |
| D-02 | Filter presencial plans for virtual-branch members + render q-banner with "Editar alumno" CTA                           | ✓       | Plan 05 — AssignPlanDialog filter + banner template                                                                        |
| D-03 | After branch change, AssignPlanDialog refetches plans automatically via watch on member.branchId                        | ✓       | Plan 05 — watcher on memberBranchId triggers loadPlans                                                                     |
| D-04 | If admin cancels edit without changing sede, AssignPlanDialog stays open with banner                                    | ✓       | Plan 05 — banner remains because memberBranchIsVirtual unchanged                                                           |
| D-05 | Phone match: exact last 10 digits via `normalizePhone(input).slice(-10)`                                                | ✓       | Plan 01 — `normalizePhone` helper (3-line implementation, AR mobile convention)                                            |
| D-06 | New endpoint `GET /admin/members/check-duplicates?dni=X&phone=Y` returns array of matches                               | ✓       | Plan 04 — endpoint in members/routes.ts + service `checkDuplicates`                                                        |
| D-07 | MemberFormDialog on-blur lookup, inline link banner, submit disabled while match exists                                 | ✓       | Plan 05 — onDniChange + onPhoneChange wired to checkDuplicates composable                                                  |
| D-08 | Autorregister blocks duplicate phone (any non-deleted user) → HTTP 409 PHONE_ALREADY_REGISTERED                         | ✓       | Plan 04 — auth/routes.ts phone block before insert                                                                         |
| D-09 | cancelSubscription guards on `transaction_links` JOIN `financial_transactions` voided_at IS NULL                        | ✓       | Plan 03 — guard query in subscriptions/service.ts                                                                          |
| D-10 | Reuses Phase 110 D-05 structured 4xx pattern (code, details.transactionIds, totalAmount, currency)                      | ✓       | Plan 03 — BadRequestError JSON-encoded body unwrapped in route layer                                                       |
| D-11 | No new unwind modes — admin uses existing `TransactionService.void` then retries cancel                                 | ✓       | Plan 03 — code path documented in 111-03-SUMMARY                                                                           |
| D-12 | audit_log schema (8 cols + 3 indexes per spec)                                                                          | ✓       | Plan 02 — `audit-log.ts` schema matches D-12 byte-for-byte                                                                 |
| D-13 | Per-action payload shape: subscription_cancelled, transaction_voided, plan_assigned, reconciliation                     | ✓       | Plan 03 — call sites use the documented field names; plan 06 reconciliation uses JSON_OBJECT in SQL                        |
| D-14 | Helper `auditLog.write(tx, {...})` requires tx; helper does NOT open its own transaction                                | ✓       | Plan 02 — helper signature requires tx; rollback test confirms atomicity                                                   |
| D-15 | Three call sites: cancelSubscription, TransactionService.void, assignPlan                                               | ✓       | Plan 03 — three call sites inside their respective db.transaction blocks                                                   |
| D-16 | actorId from JWT (`request.user.id`); for the migration use `(SELECT id FROM users WHERE role='owner' …)` with fallback | ✓       | Plan 03 — actorId plumbed through routes; plan 06 — `COALESCE((SELECT id FROM users WHERE role='owner' …), 1)` in 0109 SQL |
| D-17 | Drizzle migration committed via `pnpm db:migrate` (custom runner; never `drizzle-kit migrate`)                          | ✓       | Plan 06 — 0109_reconcile_soledad_mailland.sql committed; will run via pnpm db:migrate in task 3                            |
| D-18 | Migration idempotent — guards in each step (UPDATE WHERE BEFORE-state, DELETE by id, NOT EXISTS)                        | ✓       | Plan 06 — verified by integration tests 2 + 3 (re-apply + target-state)                                                    |
| D-19 | Balance for sub 6382 zeroed explicitly (eliminating the inseguro lazy applyDelta path)                                  | ✓       | Plan 06 — explicit `UPDATE balances SET amount=0 WHERE target_id=6382 AND amount<>0`                                       |
| D-20 | Run on staging first, verify 8 acceptance checkpoints, then production                                                  | PENDING | Plan 06 task 3 — staging + production runs not yet executed (this checkpoint)                                              |
| D-21 | Remove "Eliminar" button + showDeleteDialog + canDeleteMember + onConfirmDelete from AlumnoDetailPage                   | ✓       | Plan 05 — file diff confirms no `Eliminar` references remain                                                               |
| D-22 | Drop other admin UI call sites of softDelete; composable `useMembersApi.deleteMember` may stay (no callers)             | ✓       | Plan 05 — grep on admin source returns 0 callers                                                                           |
| D-23 | Backend `softDeleteMember` service + DELETE route untouched                                                             | ✓       | Plan 05 — service intact, only UI surface removed                                                                          |
| D-24 | `normalizePhone(input)` — strip non-digits, slice last 10                                                               | ✓       | Plan 01 — phone.ts implementation (one-liner) + 7 unit tests                                                               |
| D-25 | Frontend mirror at `el-templo-admin/src/utils/phone.ts` (manual sync, sync warning JSDoc)                               | ✓       | Plan 01 — frontend mirror with sync comment                                                                                |
| D-26 | `.trim()` first_name + last_name in service layer (create + update); covers /auth/register too                          | ✓       | Plan 01 — service-layer trim; plan 04 — autorregister trim                                                                 |
| D-27 | UI polish: AlumnoDetailPage badge reorder (status + segment + avatarType in same row)                                   | ✓       | Plan 05 — badge layout reordered per D-27                                                                                  |
| D-28 | Pure CSS/layout change for D-27 (no logic added)                                                                        | ✓       | Plan 05 — diff shows only template movement                                                                                |

---

## REQ-8 Reconcile — Staging Verification (PENDING)

This section is filled after the staging run of `pnpm db:migrate` on EC2.

> **Procedure (per plan 06 task 3):**
>
> 1. Confirm phase 111 plans 1-5 are deployed to staging.
> 2. ASK USER FIRST before SSHing (per memory `feedback_always_ask_before_ssh.md`).
> 3. Run `pnpm db:migrate` on staging. The runner should mention `0109_reconcile_soledad_mailland.sql`.
> 4. Confirm `_migrations` row: `SELECT * FROM _migrations WHERE name LIKE '0109%';` returns 1 row.
> 5. Run the eight checkpoint queries below. Paste the output verbatim.

**Run timestamp (staging):** _PENDING_
**Run operator (staging):** _PENDING_

| Check | Query                                                                                                             | Expectation                                                                   | Output    |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| C1    | `SELECT id, member_id FROM financial_transactions WHERE id = 34;`                                                 | `member_id = 5912`                                                            | _PENDING_ |
| C2    | `SELECT transaction_id, target_kind, target_id FROM transaction_links WHERE transaction_id = 34;`                 | `target_kind = 'subscription'`, `target_id = 6382`                            | _PENDING_ |
| C3    | `SELECT COUNT(*) FROM balances WHERE id IN (14, 16, 20);`                                                         | `0`                                                                           | _PENDING_ |
| C4    | `SELECT id, amount FROM balances WHERE target_kind='subscription' AND target_id=6382;`                            | `amount = 0` (or 0 rows if id=21 was deleted by a separate process)           | _PENDING_ |
| C5    | `SELECT id, status, cancelled_at FROM program_enrollments WHERE id = 1125;`                                       | `status = 'cancelled'`, `cancelled_at IS NOT NULL`                            | _PENDING_ |
| C6    | `SELECT id, action, target_id, LEFT(reason, 50) FROM audit_log WHERE action='reconciliation' AND target_id=5912;` | exactly 1 row, reason starts with "Reconciliación caso Soledad Mailland"      | _PENDING_ |
| C7    | re-run `pnpm db:migrate` on staging                                                                               | "No new migrations to apply" or `count == 0`                                  | _PENDING_ |
| C8    | re-apply 0109 SQL manually via mysql client                                                                       | each statement reports `0 rows affected` (or unchanged for `INSERT … SELECT`) | _PENDING_ |

If any of C1-C8 fails, type `halt-fix: {note}` to the orchestrator. Otherwise
type `approved-for-prod` to authorise the production run.

---

## Production Run (PENDING)

Filled after the production run of `pnpm db:migrate`.

**Run timestamp (prod):** _PENDING_
**Run operator (prod):** _PENDING_

Repeat C1..C8 against the production DB and paste verbatim:

| Check | Output    |
| ----- | --------- |
| C1    | _PENDING_ |
| C2    | _PENDING_ |
| C3    | _PENDING_ |
| C4    | _PENDING_ |
| C5    | _PENDING_ |
| C6    | _PENDING_ |
| C7    | _PENDING_ |
| C8    | _PENDING_ |

---

## Source Audit

All 9 phase requirements (REQ-1..REQ-9), all 28 user decisions (D-01..D-28),
and all 23 SPEC acceptance criteria are accounted for above. Nothing
deferred-from-discuss has slipped into the implementation surface beyond what
the SPEC explicitly locked.

**Outstanding work (this scaffold is incomplete until both rows below resolve):**

- D-20 staging run + 8 checkpoint outputs
- Production run + 8 checkpoint outputs
- Final verifier signature

---

## Final Phase Status

`IN PROGRESS — awaiting staging + prod runs`

Will flip to `COMPLETE` once D-20 and the production run rows above are
populated and all C1..C8 evidence is ✓.
