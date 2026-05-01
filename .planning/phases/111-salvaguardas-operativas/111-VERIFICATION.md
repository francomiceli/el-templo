# Phase 111 — Verification

**Status:** COMPLETE
**Created:** 2026-05-01
**Last updated:** 2026-05-01
**Verifier:** Franco Miceli (orchestrator-assisted via SSH)
**Environments covered:**

- staging — applied 2026-05-01 21:53 UTC via `pnpm db:migrate` in deploy pipeline (no-op as designed; IDs don't exist in staging-DB). UI verified manually by Ignacio.
- production — applied 2026-05-01 21:53 UTC via `pnpm db:migrate` in deploy pipeline. Reconcile executed successfully on real Soledad Mailland data. C1-C6 all green.

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

| REQ   | Status | Evidence                                                                                                                          |
| ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| REQ-1 | DONE   | Plan 03 task 1 — `assignPlan` validates plan_category vs branch.isVirtual; integration test in subscriptions/lifecycle            |
| REQ-2 | DONE   | Plan 05 task 1 — AssignPlanDialog filter + banner CTA + stacked MemberFormDialog conversion (manual UAT in plan 05)               |
| REQ-3 | DONE   | Plan 03 task 2 — `cancelSubscription` blocks on non-voided transaction_links; structured 4xx body                                 |
| REQ-4 | DONE   | Plan 04 task 1 + plan 05 task 2 — `/admin/members/check-duplicates` endpoint + on-blur lookup in MemberFormDialog                 |
| REQ-5 | DONE   | Plan 04 task 2 — `/auth/register` blocks duplicate phone; HTTP 409 PHONE_ALREADY_REGISTERED                                       |
| REQ-6 | DONE   | Plan 05 task 3 — Eliminar button + confirm dialog removed from AlumnoDetailPage; `softDeleteMember` UI callers grep = 0           |
| REQ-7 | DONE   | Plan 02 + plan 03 — audit_log table + helper + 3 call sites (cancelSubscription, void, assignPlan)                                |
| REQ-8 | DONE   | Plan 06 — migration 0109 applied to staging (no-op, IDs absent) and production (reconcile executed). Verified via SSH 2026-05-01. |
| REQ-9 | DONE   | Plan 01 — `normalizePhone()` helper (backend + frontend mirror) + trim of first_name/last_name in service layer                   |

---

## SPEC Acceptance — 23 Checkboxes

The acceptance items from `111-SPEC.md` (lines 130-153). One row per checkbox.
Status legend: ✓ implemented + verified locally; (S) staging-pending; (P)
production-pending.

| #   | Acceptance criterion                                                                                                          | Status  | Evidence                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | POST /subscriptions/assign-plan with plan presencial + branch virtual → HTTP 400 with "Plan presencial requiere sede física"  | ✓       | Plan 03 — assignPlan validation (subscriptions/service.ts) + integration test                                                 |
| 2   | AssignPlanDialog for virtual-branch member does not show plans with plan_category='presencial'                                | ✓       | Plan 05 — AssignPlanDialog `filteredPlans` + `memberBranchIsVirtual` prop                                                     |
| 3   | AssignPlanDialog for virtual-branch member shows card-banner with CTA "Convertir a sede física"                               | ✓       | Plan 05 — banner template + click opens stacked MemberFormDialog                                                              |
| 4   | Banner CTA opens MemberFormDialog conversion; after save, plan list refreshes and presenciales appear                         | ✓       | Plan 05 — watcher on memberBranchId triggers loadPlans refetch                                                                |
| 5   | POST cancel sub with non-voided transaction_links → HTTP 400 with array of pending tx_ids                                     | ✓       | Plan 03 — REQ-3 guard in cancelSubscription with structured body code=SUB_HAS_ACTIVE_TRANSACTIONS                             |
| 6   | POST cancel sub with no tx or all voided → HTTP 200 (existing behavior preserved)                                             | ✓       | Plan 03 — integration test for happy path                                                                                     |
| 7   | GET /admin/members/check-duplicates?dni=X / ?phone=Y returns matches with id, firstName, lastName, branchName, isVirtual, …   | ✓       | Plan 04 — endpoint + service method `checkDuplicates`                                                                         |
| 8   | MemberFormDialog (create mode) does on-blur lookup and shows "Ya existe: {name} ({sede})" link if non-deleted match           | ✓       | Plan 05 — onDniChange + onPhoneChange + inline match banner                                                                   |
| 9   | Submit button of create-member form disabled when lookup found a match                                                        | ✓       | Plan 05 — `submitDisabled` computed bound to form submit                                                                      |
| 10  | POST /auth/register with normalized phone matching active presential user → HTTP 409                                          | ✓       | Plan 04 — REQ-5 phone block in auth/routes.ts                                                                                 |
| 11  | Admin UI: no button on any screen triggers `softDeleteMember`; grep of admin callers = 0                                      | ✓       | Plan 05 — Eliminar button + dialog + handlers + refs removed from AlumnoDetailPage                                            |
| 12  | `audit_log` table exists in the new Drizzle migration                                                                         | ✓       | Plan 02 — schema audit-log.ts + migration 0108_create_audit_log.sql                                                           |
| 13  | Each `cancelSubscription` success inserts audit_log entry with action='subscription_cancelled'                                | ✓       | Plan 03 — call site in cancelSubscription within db.transaction                                                               |
| 14  | Each `TransactionService.void` success inserts audit_log entry with action='transaction_voided'                               | ✓       | Plan 03 — call site inside void's db.transaction                                                                              |
| 15  | Each `assignPlan` success inserts audit_log entry with action='plan_assigned'                                                 | ✓       | Plan 03 — call site at end of assignPlan happy path                                                                           |
| 16  | After Soledad migration: `financial_transactions.id=34.member_id=5912`                                                        | ✓ prod  | Verified via SSH (mysql query) post-deploy 2026-05-01 — member_id=5912                                                        |
| 17  | After Soledad migration: `transaction_links.id=34.target_id=6382`                                                             | ✓ prod  | Verified via SSH — target_kind='subscription', target_id=6382, allocated_amount=65000                                         |
| 18  | After Soledad migration: `balances` has no rows with `target_id IN (6132, 6134, 6381)` matching the deleted member's orphans  | ✓ prod  | Verified via SSH — `SELECT * FROM balances WHERE id IN (14, 16, 20)` returned 0 rows                                          |
| 19  | After Soledad migration: `balances` for sub 6382 = 0 ARS                                                                      | ✓ prod  | Verified via SSH — id=21, target_id=6382, amount=0, last_recomputed_at=2026-05-01 21:53:57                                    |
| 20  | After Soledad migration: `program_enrollments.id=1125.status='cancelled'`                                                     | ✓ prod  | Verified via SSH — status='cancelled', cancelled_at='2026-05-01 21:53:57'                                                     |
| 21  | After Soledad migration: an `audit_log` entry with reason "Reconciliación caso Soledad Mailland — phase 111" exists           | ✓ prod  | Verified via SSH — id=1, action='reconciliation', target_id=5912, reason matches exactly                                      |
| 22  | Re-running the Soledad migration → 0 errors, 0 duplicated rows                                                                | ✓ local | Plan 06 task 2 Tests 2 + 3 cover this. Not re-run on prod (pipeline tracks via `_migrations` already; second run would skip). |
| 23  | `normalizePhone("+54 223 661 4406")` returns `"2236614406"` in unit test; insert with `firstName="  Soledad  "` saves trimmed | ✓       | Plan 01 — phone.test.ts + members service trim integration tests                                                              |

---

## CONTEXT Decisions — 28 D-XX

The decisions from `111-CONTEXT.md`. Each maps to the implementation that
realises it.

| D-XX | Decision summary                                                                                                        | Status | Evidence                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | No dedicated "convertir" mode — reuse MemberFormDialog edit flow                                                        | ✓      | Plan 05 — banner CTA opens MemberFormDialog mode='edit' with isVirtual→isVirtual!==true detection                                                                   |
| D-02 | Filter presencial plans for virtual-branch members + render q-banner with "Editar alumno" CTA                           | ✓      | Plan 05 — AssignPlanDialog filter + banner template                                                                                                                 |
| D-03 | After branch change, AssignPlanDialog refetches plans automatically via watch on member.branchId                        | ✓      | Plan 05 — watcher on memberBranchId triggers loadPlans                                                                                                              |
| D-04 | If admin cancels edit without changing sede, AssignPlanDialog stays open with banner                                    | ✓      | Plan 05 — banner remains because memberBranchIsVirtual unchanged                                                                                                    |
| D-05 | Phone match: exact last 10 digits via `normalizePhone(input).slice(-10)`                                                | ✓      | Plan 01 — `normalizePhone` helper (3-line implementation, AR mobile convention)                                                                                     |
| D-06 | New endpoint `GET /admin/members/check-duplicates?dni=X&phone=Y` returns array of matches                               | ✓      | Plan 04 — endpoint in members/routes.ts + service `checkDuplicates`                                                                                                 |
| D-07 | MemberFormDialog on-blur lookup, inline link banner, submit disabled while match exists                                 | ✓      | Plan 05 — onDniChange + onPhoneChange wired to checkDuplicates composable                                                                                           |
| D-08 | Autorregister blocks duplicate phone (any non-deleted user) → HTTP 409 PHONE_ALREADY_REGISTERED                         | ✓      | Plan 04 — auth/routes.ts phone block before insert                                                                                                                  |
| D-09 | cancelSubscription guards on `transaction_links` JOIN `financial_transactions` voided_at IS NULL                        | ✓      | Plan 03 — guard query in subscriptions/service.ts                                                                                                                   |
| D-10 | Reuses Phase 110 D-05 structured 4xx pattern (code, details.transactionIds, totalAmount, currency)                      | ✓      | Plan 03 — BadRequestError JSON-encoded body unwrapped in route layer                                                                                                |
| D-11 | No new unwind modes — admin uses existing `TransactionService.void` then retries cancel                                 | ✓      | Plan 03 — code path documented in 111-03-SUMMARY                                                                                                                    |
| D-12 | audit_log schema (8 cols + 3 indexes per spec)                                                                          | ✓      | Plan 02 — `audit-log.ts` schema matches D-12 byte-for-byte                                                                                                          |
| D-13 | Per-action payload shape: subscription_cancelled, transaction_voided, plan_assigned, reconciliation                     | ✓      | Plan 03 — call sites use the documented field names; plan 06 reconciliation uses JSON_OBJECT in SQL                                                                 |
| D-14 | Helper `auditLog.write(tx, {...})` requires tx; helper does NOT open its own transaction                                | ✓      | Plan 02 — helper signature requires tx; rollback test confirms atomicity                                                                                            |
| D-15 | Three call sites: cancelSubscription, TransactionService.void, assignPlan                                               | ✓      | Plan 03 — three call sites inside their respective db.transaction blocks                                                                                            |
| D-16 | actorId from JWT (`request.user.id`); for the migration use `(SELECT id FROM users WHERE role='owner' …)` with fallback | ✓      | Plan 03 — actorId plumbed through routes; plan 06 — `COALESCE((SELECT id FROM users WHERE role='owner' …), 1)` in 0109 SQL                                          |
| D-17 | Drizzle migration committed via `pnpm db:migrate` (custom runner; never `drizzle-kit migrate`)                          | ✓      | Plan 06 — 0109_reconcile_soledad_mailland.sql committed; will run via pnpm db:migrate in task 3                                                                     |
| D-18 | Migration idempotent — guards in each step (UPDATE WHERE BEFORE-state, DELETE by id, NOT EXISTS)                        | ✓      | Plan 06 — verified by integration tests 2 + 3 (re-apply + target-state)                                                                                             |
| D-19 | Balance for sub 6382 zeroed explicitly (eliminating the inseguro lazy applyDelta path)                                  | ✓      | Plan 06 — explicit `UPDATE balances SET amount=0 WHERE target_id=6382 AND amount<>0`                                                                                |
| D-20 | Run on staging first, verify 8 acceptance checkpoints, then production                                                  | ✓      | Staging deploy applied 0109 first (no-op as designed); UI verified manually; then push to master applied to prod where 6 of 6 prod queries returned expected values |
| D-21 | Remove "Eliminar" button + showDeleteDialog + canDeleteMember + onConfirmDelete from AlumnoDetailPage                   | ✓      | Plan 05 — file diff confirms no `Eliminar` references remain                                                                                                        |
| D-22 | Drop other admin UI call sites of softDelete; composable `useMembersApi.deleteMember` may stay (no callers)             | ✓      | Plan 05 — grep on admin source returns 0 callers                                                                                                                    |
| D-23 | Backend `softDeleteMember` service + DELETE route untouched                                                             | ✓      | Plan 05 — service intact, only UI surface removed                                                                                                                   |
| D-24 | `normalizePhone(input)` — strip non-digits, slice last 10                                                               | ✓      | Plan 01 — phone.ts implementation (one-liner) + 7 unit tests                                                                                                        |
| D-25 | Frontend mirror at `el-templo-admin/src/utils/phone.ts` (manual sync, sync warning JSDoc)                               | ✓      | Plan 01 — frontend mirror with sync comment                                                                                                                         |
| D-26 | `.trim()` first_name + last_name in service layer (create + update); covers /auth/register too                          | ✓      | Plan 01 — service-layer trim; plan 04 — autorregister trim                                                                                                          |
| D-27 | UI polish: AlumnoDetailPage badge reorder (status + segment + avatarType in same row)                                   | ✓      | Plan 05 — badge layout reordered per D-27                                                                                                                           |
| D-28 | Pure CSS/layout change for D-27 (no logic added)                                                                        | ✓      | Plan 05 — diff shows only template movement                                                                                                                         |

---

## REQ-8 Reconcile — Staging Verification

The deploy pipeline applied `pnpm db:migrate` on staging EC2 at 21:53 UTC as part of the
`master:staging` push. Since staging-DB does not have the production IDs (5588, 5912, tx 34,
subs 6132/6134/6381/6382, balances 14/16/20, enrollment 1125), all UPDATE/DELETE steps were
no-ops by design (idempotency guards). The audit_log INSERT step inserted a stray
"reconciliation" row in staging-DB — cosmetic, no impact (acknowledged by Ignacio: "da igual
staging").

UI verification was performed manually on staging-admin and confirmed green by Ignacio
("staging verde") prior to the production push.

---

## Production Run

**Run timestamp (prod):** 2026-05-01 21:53:57 UTC (auto via deploy pipeline post `master` push)
**Run operator (prod):** Franco Miceli (deploy pipeline) + post-run verification via SSH at 22:0X UTC

| Check | Query                                                                                                                                      | Output                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1    | `SELECT id, member_id, amount, currency FROM financial_transactions WHERE id=34;`                                                          | `id=34, member_id=5912, amount=65000, currency=ARS` ✓                                                                                                                      |
| C2    | `SELECT * FROM transaction_links WHERE transaction_id=34;`                                                                                 | `id=34, transaction_id=34, target_kind=subscription, target_id=6382, allocated_amount=65000, created_at=2026-04-30 11:40:19` ✓                                             |
| C3    | `SELECT * FROM balances WHERE id IN (14, 16, 20);`                                                                                         | 0 rows ✓                                                                                                                                                                   |
| C4    | `SELECT * FROM balances WHERE target_kind='subscription' AND target_id=6382;`                                                              | `id=21, member_id=5912, target_kind=subscription, target_id=6382, currency=ARS, amount=0, last_recomputed_at=2026-05-01 21:53:57` ✓                                        |
| C5    | `SELECT id, user_id, program_id, status, cancelled_at FROM program_enrollments WHERE id=1125;`                                             | `id=1125, user_id=5588, program_id=2, status=cancelled, cancelled_at=2026-05-01 21:53:57` ✓                                                                                |
| C6    | `SELECT id, actor_id, action, target_kind, target_id, reason, created_at FROM audit_log WHERE action='reconciliation' AND target_id=5912;` | `id=1, actor_id=1, action=reconciliation, target_kind=member, target_id=5912, reason="Reconciliación caso Soledad Mailland — phase 111", created_at=2026-05-01 21:53:57` ✓ |

All 6 C1-C6 outputs match expectations. C7-C8 (re-run idempotency) were validated locally
in plan 06 integration tests; not re-executed on prod because the `_migrations` table
already tracks 0109 as applied — the runner would skip on a second invocation by design.

---

## Source Audit

All 9 phase requirements (REQ-1..REQ-9), all 28 user decisions (D-01..D-28),
and all 23 SPEC acceptance criteria are accounted for above. Nothing
deferred-from-discuss has slipped into the implementation surface beyond what
the SPEC explicitly locked.

## Production Incident — 502 During Deploy (Resolved)

A single user (Vanesa Baldacci, user 4709) saw a transient 502 on
`GET /api/members/me/current-program` at 21:54:02 UTC — exactly during the
~5-15s window of pm2 restart after migrations 0108+0109 applied. She retried
46 seconds later and successfully booked schedule 41 for 2026-05-02 (booking
13646). Zero data loss, zero permanent impact.

**Root cause**: `eltemplo-api` runs in pm2 `mode=fork` with single instance. During
deploy, pm2 kills the old process and waits for the new one to bind port 3000.
Nginx upstream returns 502 during that window. This pattern affects every deploy,
not specifically phase 111.

**Mitigation applied in same session** (out of phase 111 scope but related): nginx
retry config added to `/etc/nginx/sites-available/api.eltemplo.org` and
`/etc/nginx/sites-available/api-staging.eltemplo.org`:

```nginx
proxy_next_upstream error timeout http_502 http_503 http_504;
proxy_next_upstream_tries 3;
proxy_next_upstream_timeout 10s;
```

This makes nginx retry the upstream up to 3 times (within 10s total) on 502.
Future deploys should not surface 502s to clients for GET requests. Backups of
the original configs left at `*.bak-pre-retry-20260501`. Note: this nginx config
lives on the EC2 only and is not yet mirrored in the project repo's
`deploy/nginx/` templates — TODO captured.

---

## Final Phase Status

`COMPLETE`
