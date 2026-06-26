---
phase: 148-pos-profe-alta-de-alumno-plan-en-el-cobro
plan: 01
subsystem: backend (finance + subscriptions + members)
tags: [pos-profe, alta-alumno, createdMemberId, idempotency, caja-sugerida]
requires:
  - financial_transactions ledger (Fase 105/137/140)
  - recordAssignmentCharge + assignPlan (Fase 146)
  - createTrialMember pattern (Fase 114)
provides:
  - "financial_transactions.created_member_id (FK nullable a users.id)"
  - "CreateTransactionInput.createdMemberId persistido en el insert del charge (misma tx, W-1)"
  - "AssignPlanInput { recorderRole, idempotencyKey, recorderBranchId, createdMemberId }"
  - "assignPlan propaga recorder + caja sugerida + createdMemberId hasta create()"
  - "MemberService.createMinimalMember (nombre + apellido + DNI + sucursal)"
affects:
  - 148-02 (endpoint orquestador /alta — consume los 3 contratos)
  - 148-03 (cascade en void — lee created_member_id)
tech-stack:
  added: []
  patterns:
    - "Columna FK nullable (sibling de memberId/idempotencyKey)"
    - "Camino de escritura atómico: createdMemberId viaja por CreateTransactionInput, se graba en el insert del charge dentro de la tx del caller (sin UPDATE desacoplado)"
    - "Resolución recorderBranchId→suggestedCajaId análoga a renewSubscription"
    - "isDuplicateKeyError catch → re-dedup en createMinimalMember (race backstop)"
key-files:
  created:
    - el-templo-api/src/db/migrations/0162_created_member_id.sql
  modified:
    - el-templo-api/src/db/schema/financial-transactions.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/types.ts
decisions:
  - "createdMemberId se persiste DENTRO de la tx del charge (W-1) — no UPDATE separado — para no dejar un alumno activo huérfano ante un crash."
  - "Migración 0162 hand-written (db:generate roto por drift sessions.goal_plan_type, igual que 0154/0158/0161); aplicada local sin error."
  - "createMinimalMember: status 'prueba', email null, level kairos; guard isDuplicateKeyError sobre dni UNIQUE devuelve el existente."
metrics:
  duration: ~10min
  completed: 2026-06-26
---

# Phase 148 Plan 01: Fundación backend (createdMemberId + AssignPlanInput + createMinimalMember) Summary

**One-liner:** Wave 1 de la Fase 148 — agrega `created_member_id` al ledger con camino de escritura atómico (mismo insert del charge, sin ventana de crash), extiende `AssignPlanInput` con los 3 campos recorder + `createdMemberId` propagándolos por `assignPlan`→`recordAssignmentCharge`→`create`, y suma `createMinimalMember` (nombre+apellido+DNI+sucursal) — los contratos que desbloquean el endpoint orquestador (148-02) y el cascade en void (148-03).

## What Was Built

### Task 1 — Columna createdMemberId + persistencia atómica (W-1) — `bfef7fb5`

- `financial_transactions.created_member_id`: `int("created_member_id").references(() => users.id)` (nullable, sibling de `memberId`/`idempotencyKey`).
- Migración `0162_created_member_id.sql` hand-written: `ADD COLUMN created_member_id int NULL AFTER idempotency_key` + FK `fk_financial_tx_created_member` → `users(id)`. Sin `;` en comentarios (regla del runner). **Aplicada local con `pnpm db:migrate` (2 statements, OK).**
- `CreateTransactionInput.createdMemberId?: number | null` + persistencia en el `.values({...})` de `transactionService.create` como `createdMemberId: input.createdMemberId ?? null` — sibling exacto de `idempotencyKey ?? null`. Cuando el caller corre dentro de su tx (assignPlan), el id queda en el MISMO insert del charge.

### Task 2 — AssignPlanInput + propagación en assignPlan — `ca54b925`

- `AssignPlanInput` gana `recorderRole?: AdminRole`, `idempotencyKey?: string`, `recorderBranchId?: number` (copiados verbatim de `RenewSubscriptionInput` con doc-comments) **+ `createdMemberId?: number | null`**.
- `recordAssignmentCharge` acepta `createdMemberId?` y lo forwardea al `CreateTransactionInput` del charge.
- `assignPlan` replica la resolución `recorderBranchId → suggestedCajaId` de `renewSubscription` (try/catch con fallback no-rompe + log) y propaga `recorderRole` / `idempotencyKey` / `cashRegisterId` (sugerida) / `createdMemberId` en **ambas** llamadas a `recordAssignmentCharge` (branch anticipo y path normal). El branch anticipo mantiene `advance.cashRegisterId` para la imputación.

### Task 3 — createMinimalMember — `67af590e`

- `CreateMinimalMemberServiceInput { firstName, lastName, dni, branchId, createdBy }` en `members/types.ts`.
- `MemberService.createMinimalMember`: copia la estructura de tx de `createTrialMember` pero setea `dni` (no phone), `email: null`, `status: 'prueba'`, `level: 'kairos'`, escribe `userStatusHistory` (`fromStatus:null, toStatus:'prueba', source:'admin'`); `createdBy` del JWT (D-31). Devuelve el `userId`.
- Guard `isDuplicateKeyError` sobre el UNIQUE de `dni`: ante un dup re-corre `checkDuplicates({dni})` y devuelve el id existente (T-148-02, backstop del dedup del orquestador 148-02).

## Verification Results

- `pnpm exec tsc --noEmit` verde tras cada task.
- `pnpm db:migrate` aplicó 0162 contra `eltemplo` (local) sin error — columna creada.
- `grep '^--' 0162_created_member_id.sql | grep -c ';'` == 0.
- createdMemberId fluye: `finance/types.ts` → `create()` → `recordAssignmentCharge` → `AssignPlanInput`/`assignPlan` (verificado por grep en cada archivo).
- Path admin (sin recorderRole/createdMemberId) intacto: nace `validado` con `createdMemberId` null — `undefined` no cambia comportamiento.

## Deviations from Plan

None - plan executed exactly as written.

## Notes for Downstream Plans

- **148-02 (endpoint `/alta`):** instanciar `MemberService` en el plugin de `coach-load-routes.ts`, llamar `createMinimalMember` con `createdBy = request.user.userId`, y pasar `createdMemberId` (+ `recorderRole`/`idempotencyKey`/`recorderBranchId`) en el `AssignPlanInput`.
- **148-03 (cascade en void):** leer `existing.createdMemberId` en `_void`; si no-null, flip del member a `inactivo` + `userStatusHistory` dentro de la tx del void (la membresía ya la cancela el `SubscriptionCanceller`).
- La migración 0162 viaja a prod en el tren staging→master (tras confirmar 137-142 / v5.2 + v5.3).

## Self-Check: PASSED

- FOUND: el-templo-api/src/db/migrations/0162_created_member_id.sql
- FOUND commit bfef7fb5, ca54b925, 67af590e
