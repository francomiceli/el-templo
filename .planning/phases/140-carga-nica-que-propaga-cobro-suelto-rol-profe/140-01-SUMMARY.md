---
phase: 140-carga-nica-que-propaga-cobro-suelto-rol-profe
plan: 01
subsystem: finance / subscriptions (backend foundation)
tags: [idempotency, permissions, validation-status, migration, recorderRole]
requires:
  - "Phase 137: validation_status state machine + recorderRole on recordAssignmentCharge"
  - "Phase 138: resolveCashRegister (server-side caja resolution)"
provides:
  - "financial_transactions.idempotency_key (nullable UNIQUE) for double-tap dedup"
  - "FINANCE_LOAD_ROLES = FINANCE_WRITE_ROLES + coach (load-only gate)"
  - "CreateTransactionInput.idempotencyKey persisted by create()"
  - "RenewSubscriptionInput.recorderRole + idempotencyKey forwarded into recordAssignmentCharge"
affects:
  - "Wave 2 (plan 02): thin coach load endpoints + ER_DUP_ENTRY dedup handling"
tech-stack:
  added: []
  patterns:
    - "Hand-written migration (db:generate hangs on sessions.goal_plan_type drift)"
    - "Nullable UNIQUE index for idempotency (MySQL allows unlimited NULLs)"
    - "Server-side role→validation_status derivation, never from body"
key-files:
  created:
    - el-templo-api/src/db/migrations/0156_idempotency_key.sql
  modified:
    - el-templo-api/src/db/schema/financial-transactions.ts
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/service.ts
decisions:
  - "idempotency_key as a nullable UNIQUE column on financial_transactions (not a separate table) — D-09"
  - "ER_DUP_ENTRY catch deferred to Wave 2 (Pitfall 3: renewal tx must roll back before re-reading)"
metrics:
  duration: ~9min
  completed: 2026-06-24
---

# Phase 140 Plan 01: Backend foundation (idempotency + load permission + recorderRole threading) Summary

Wired the three service-level seams every downstream coach-load task depends on: a nullable UNIQUE `idempotency_key` column (migration 0156 + Drizzle schema), the `FINANCE_LOAD_ROLES` permission (write roles + coach, load-only), `idempotencyKey` accepted by `CreateTransactionInput` and persisted in `transactionService.create()`, and `recorderRole`/`idempotencyKey` threaded through `renewSubscription → recordAssignmentCharge` (Pitfall 1) so a coach renewal is born `validation_status='pendiente'` while the admin path stays `'validado'`. No HTTP surface, no frontend — those are Waves 2/3. Typecheck green.

## What Was Built

- **Task 1 (`8157fe3d`):** Hand-written `0156_idempotency_key.sql` (column + UNIQUE index ALTERs, no `;` in comments), applied to local DB. Schema: `idempotencyKey: varchar("idempotency_key", { length: 64 })` after `notes`, `uniqueIndex` import added, `uq_financial_tx_idempotency_key` added to table-extras.
- **Task 2 (`5b8b9321`):** `FINANCE_LOAD_ROLES = [...FINANCE_WRITE_ROLES, "coach"]` in permissions.ts (VOID/ADJUSTMENT/READ untouched). `CreateTransactionInput.idempotencyKey?: string | null`; create() persists `input.idempotencyKey ?? null` on the INSERT. No ER_DUP_ENTRY catch (deferred to Wave 2 per Pitfall 3).
- **Task 3 (`7fbbf372`):** `RenewSubscriptionInput` gains `recorderRole?: AdminRole` + `idempotencyKey?: string` (AdminRole imported from shared/permissions). `renewSubscription` forwards both into the renew-path `recordAssignmentCharge` call; `recordAssignmentCharge` accepts `idempotencyKey?` and passes it into `transactionService.create`. assignPlan call sites (~1211/~2798/~3141) left untouched → admin assign/change stay `validado`.

## Verification

- `cd el-templo-api && npx tsc --noEmit` — passes after each task and overall.
- `! grep -nE '^\s*--.*;' 0156_idempotency_key.sql` — clean (no `;` in SQL comments).
- `pnpm db:migrate` — 0156 applied (2 statements), recorded in `_migrations`.
- `grep FINANCE_LOAD_ROLES permissions.ts` — present; `! grep "FINANCE_(VOID|ADJUSTMENT|READ)_ROLES = [...coach"` — clean (coach not widened into those sets).
- `grep "recorderRole: input.recorderRole" service.ts` — match in the renew path.

## Deviations from Plan

- **`varchar` already imported** in financial-transactions.ts (only `uniqueIndex` needed adding) — as the plan's interfaces section anticipated.
- **Requirement marking corrected:** the plan frontmatter listed `requirements: [CARGA-02, CARGA-03, CARGA-04]`, but plan 140-01 delivers only the backend foundation. CARGA-02 (atomic idempotent propagation — column + threading) is marked Complete. CARGA-03 (cobro suelto UI/endpoint) and CARGA-04 (coach load endpoint + authorization test) require the Wave 2 endpoints and Wave 3 UI that do NOT exist yet, so they were reverted to Pending in REQUIREMENTS.md to keep the traceability accurate. They will be completed by plans 140-02 / 140-03.

## Self-Check: PASSED

- FOUND: el-templo-api/src/db/migrations/0156_idempotency_key.sql
- FOUND commits: 8157fe3d, 5b8b9321, 7fbbf372
