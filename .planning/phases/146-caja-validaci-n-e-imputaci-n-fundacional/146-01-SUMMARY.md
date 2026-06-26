---
phase: 146-caja-validaci-n-e-imputaci-n-fundacional
plan: 01
subsystem: finance
tags: [caja, coach-load, cash-register, imputacion, CAJA-01, CAJA-04]
requires:
  - "cashRegisterService.resolveCashRegister (fase 138)"
  - "coach-load-routes /misc + /pay-plan (fase 140)"
  - "recordAssignmentCharge recorderRole/idempotencyKey (fase 140)"
provides:
  - "caja sugerida derivada de la sede del profe (recordedBy) para efectivo"
  - "recordAssignmentCharge.cashRegisterId override (reutilizable por plan 03)"
  - "RenewSubscriptionInput.recorderBranchId"
  - "TransactionService.resolveCashRegister (delegación pública)"
affects:
  - "plan 146-02 (validación: confirmar/cambiar caja sugerida)"
  - "plan 146-03 (imputación de anticipo al alta reusa cashRegisterId)"
  - "plan 146-05 (arqueo por caja)"
tech-stack:
  added: []
  patterns:
    - "Override interno de caja (cashRegisterId) pre-resuelto server-side desde recordedBy; nunca del body"
    - "DRY: resolveUserBranchId compartido por member/recorder branch resolution"
key-files:
  created: []
  modified:
    - "el-templo-api/src/modules/finance/coach-load-routes.ts"
    - "el-templo-api/src/modules/subscriptions/service.ts"
    - "el-templo-api/src/modules/subscriptions/types.ts"
    - "el-templo-api/src/modules/finance/transaction-service.ts"
    - "el-templo-api/test/finance/coach-load.test.ts"
decisions:
  - "Fallback amplio en resolveSuggestedCaja: cualquier error de resolución → caja por sede del socio (no romper el cobro)"
  - "TransactionService.resolveCashRegister público en vez de DI extra de CashRegisterService en SubscriptionService"
  - "Pre-resolución en renew guardada por renewalPrice > 0 (evita throw en renovación gratis)"
metrics:
  duration: "~25 min"
  completed: "2026-06-26"
  tasks: 3
  files: 5
---

# Phase 146 Plan 01: Caja sugerida = sede del profe (CAJA-01 + CAJA-04) Summary

El cobro del profe nace con una caja **sugerida** (no definitiva) derivada de la
**sede del profe que carga** (`recordedBy` → su `branchId`) para efectivo, y banco
por moneda para transferencia/tarjeta, en las 3 rutas de cobro (`/misc`,
`/pay-plan` settle, `/pay-plan` renew). El `branch_id` comercial de la transacción
sigue siendo el del socio. La PoS del profe nunca expone selección de caja/sede y
el body de coach-load rechaza `cashRegisterId` (CAJA-04).

## What was built

- **Task 1 — `/misc` + `/pay-plan` (settle):** nuevos helpers en
  `coach-load-routes.ts`: `resolveUserBranchId` (compartido), `resolveMemberBranchId`
  (sede del socio, ledger), `resolveRecorderBranchId` (sede del profe) y
  `resolveSuggestedCaja` (pre-resuelve la caja desde la sede del profe vía
  `cashRegisterService.resolveCashRegister` y devuelve el override). Ambas rutas
  pasan `cashRegisterId: suggestedCajaId` a `transactionService.create` y loguean
  `recorderBranchId` + `suggestedCajaId`.
- **Task 2 — rama renew:** `recordAssignmentCharge` acepta `cashRegisterId?` y lo
  forwardea como override a `create`. `RenewSubscriptionInput.recorderBranchId`
  hace que `renewSubscription` pre-resuelva la caja sugerida (vía el nuevo método
  público `TransactionService.resolveCashRegister`) y la pase a
  `recordAssignmentCharge`. La ruta `/pay-plan` (renew) pasa `recorderBranchId =
resolveRecorderBranchId(request.user.userId)`. Los 4 callers internos admin no
  pasan `cashRegisterId` → caja por sede del socio (sin regresión).
- **Task 3 — CAJA-04:** verificado que `CargarPagoPage.vue` no expone ningún
  selector de caja/sede (grep sin coincidencias); los schemas de `/misc` y
  `/pay-plan` con `additionalProperties:false` y sin `cashRegisterId` en
  `properties` rechazan el campo. Se agregó un comentario marcando CAJA-04.

## Verification / tests

- `el-templo-api`: `pnpm tsc --noEmit` verde.
- `pnpm test test/finance/coach-load.test.ts test/subscriptions/charge-on-assign.test.ts`
  → **41/41 verdes** (27 coach-load + 14 charge-on-assign).
- Tests nuevos (TDD RED→GREEN) en `coach-load.test.ts`, describe "caja sugerida por
  sede del profe": misc cash cross-sede (caja efectivo de A, branch_id de B), misc
  transfer (banco por moneda, sin regresión), settle cash (caja efectivo de A),
  renew cash (plan_charge en caja efectivo de A). `readTx` extendido con
  `cashRegisterId` + `branchId`.

## Deviations from Plan

Ninguna desviación de comportamiento respecto al plan. Decisiones de
implementación registradas en `.planning/AUTONOMOUS-DECISIONS-v5.3.md` (sección
Fase 146 / 146-01):

- Fallback amplio en `resolveSuggestedCaja` (cualquier error de resolución →
  caja por sede del socio, "no romper").
- DRY: `resolveUserBranchId` compartido por member/recorder.
- `TransactionService.resolveCashRegister` público (delega a `cashRegisterService`)
  en vez de inyectar `CashRegisterService` en `SubscriptionService`.
- Pre-resolución en renew guardada por `renewalPrice > 0`.

Out-of-scope: error pre-existente `onExportBandeja` (TS2339) en
`BandejaPendientesTab.vue` (no tocado por este plan; ya documentado en 145).

## Threat model compliance

- **T-146-01 (Tampering, cashRegisterId en body):** mitigado — schemas con
  `additionalProperties:false` sin `cashRegisterId`; comentario CAJA-04 agregado.
- **T-146-02 (Spoofing, recorderBranchId):** mitigado — se resuelve de
  `request.user.userId` (token), nunca del body.
- **T-146-03 (Information Disclosure):** accept — la caja sugerida no expone saldos.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Todos los archivos modificados/creados existen y los 4 commits de tarea
(`9d3c2677`, `e3d8d365`, `78ec7a0a`, `cbc2d9cc`) están en el árbol.
