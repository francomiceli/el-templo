---
phase: 146-caja-validaci-n-e-imputaci-n-fundacional
plan: 03
subsystem: finance
tags: [caja, imputacion, cobro-suelto, anticipo, COBRO-03, COBRO-04]
requires:
  - "TransactionService.voidInTx(tx, ...) tx-aware (fase 146-02)"
  - "TransactionService.listPendingMiscForMember + GET /transactions/pending-misc/:memberId (fase 146-02)"
  - "recordAssignmentCharge param cashRegisterId override (fase 146-01)"
  - "assignPlan db.transaction atómica (fase 103/107)"
provides:
  - "assignPlan(appliedMiscChargeId): imputación atómica anular+recrear plan_charge con misma caja/monto/método"
  - "COBRO-04: rechazo 400 si el anticipo excede el precio del plan (sin anular nada)"
  - "AssignPlanDialog: selector de cobro suelto pendiente a imputar al alta"
  - "useTransactionsApi.getPendingMisc(memberId) + PendingMiscItem (admin)"
affects:
  - "plan 146-04/05 (UI de validación / arqueo: el plan_charge imputado nace validado con la caja del anticipo)"
tech-stack:
  added: []
  patterns:
    - "if/else mutuamente excluyente default-charge vs imputación (nunca doble plan_charge)"
    - "void + recreate compartiendo el tx del caller (atomicidad total, rollback si falla cualquier paso)"
    - "Guard de excedente (COBRO-04) ANTES del void (no perder ni duplicar plata)"
    - "Selector de imputación sólo en modo assign (changePlan no implementa el flujo)"
key-files:
  created:
    - "el-templo-api/test/subscriptions/impute-advance-on-assign.test.ts"
  modified:
    - "el-templo-api/src/modules/subscriptions/service.ts"
    - "el-templo-api/src/modules/subscriptions/types.ts"
    - "el-templo-api/src/modules/subscriptions/schemas.ts"
    - "el-templo-admin/src/components/AssignPlanDialog.vue"
    - "el-templo-admin/src/composables/useTransactionsApi.ts"
    - "el-templo-admin/src/types/transaction.ts"
    - "el-templo-admin/src/types/subscription.ts"
decisions:
  - "recordAssignmentCharge default vs imputación = if/else excluyente (corrección MEDIUM del plan-checker): nunca se crean dos plan_charge; el test cuenta filas plan_charge=1."
  - "Lectura del advance + guards + voidInTx + recordAssignmentCharge dentro de la db.transaction existente de assignPlan → atomicidad total (rollback no anula el advance)."
  - "COBRO-04 (excedente) se chequea antes del void; aunque la tx rollbackearía igual, evita siquiera intentar anular."
  - "paymentMethod/cashRegisterId del anticipo overridean el payload del dialog; el plan_charge imputado nace validado (camino admin)."
  - "Selector de cobro suelto sólo en modo assign (changePlan no soporta appliedMiscChargeId en backend); getPendingMisc en useTransactionsApi (dominio finance), su falla no bloquea el alta."
metrics:
  duration: "~30 min"
  completed: "2026-06-26"
  tasks: 2
  files: 8
---

# Phase 146 Plan 03: Imputación del cobro suelto al asignar plan (COBRO-03/04) Summary

Al asignar un plan, gestión puede usar la plata de un cobro suelto pendiente (`advance_payment`) del socio para cubrir el alta: el backend **anula** ese anticipo y **recrea** un `plan_charge` vinculado a la nueva sub con la **misma caja, monto y método**, todo dentro de la `db.transaction` de `assignPlan` (atómico). Si el anticipo **excede** el precio del plan → 400 sin anular nada (COBRO-04). El `AssignPlanDialog` ofrece todos los cobros sueltos pendientes del socio en un selector opcional.

## Tasks

| Task | Nombre                                                                       | Commit   |
| ---- | ---------------------------------------------------------------------------- | -------- |
| 1    | Imputación atómica del anticipo en assignPlan (anular + recrear plan_charge) | c6617718 |
| 2    | AssignPlanDialog — selector de cobro suelto pendiente a imputar              | 16e52721 |

## Corrección crítica del plan-checker (aplicada)

La llamada **incondicional** original a `recordAssignmentCharge(tx, ...)` en `assignPlan` se convirtió en `if (appliedMiscChargeId) { void + recreate } else { default }`. Ejecutar ambos caminos crearía un segundo `plan_charge` (doble ingreso, crédito fantasma del socio). El test **cuenta** las filas `plan_charge` del socio = exactamente 1 (no sólo "existe una").

## Mecánica de imputación (Task 1)

Dentro de la `db.transaction` de `assignPlan`, cuando viene `appliedMiscChargeId`:

1. Lee el `advance_payment` con el `tx` handle.
2. Guards T-146-08: `memberId===userId`, `kind==='advance_payment'`, `validationStatus==='pendiente'`, `voidedAt===null` → si no, 400.
3. COBRO-04 (T-146-10): si `advance.amount > pricePaid` → 400 "excede el precio del plan", **antes** de anular nada.
4. `voidInTx(tx, advance.id, adminId, { reason: 'Imputado al alta de plan' })` — anula el anticipo (sin links → balance del socio intacto).
5. `recordAssignmentCharge(tx, { ..., paymentMethod: advance.paymentMethod, amountReceived: advance.amount, cashRegisterId: advance.cashRegisterId })` — recrea el `plan_charge` validado, vinculado a la sub, con la caja/monto/método del anticipo.
6. `auditLog plan_assigned` lleva `imputedFromMiscChargeId` (T-146-11); el `voidInTx` deja su propio `transaction_voided`.

Si cualquier paso posterior revienta, el `void` rollbackea junto con todo → el advance **NO** queda anulado.

## UI (Task 2)

- `AssignPlanDialog` (sólo modo `assign`): al abrir pide `GET /admin/finance/transactions/pending-misc/:memberId`. Si hay cobros sueltos pendientes, muestra el selector opcional "Aplicar un cobro pendiente" listando **todos** (motivo + monto + método + fecha), incluidos los `'otro'`.
- Al elegir uno: envía `appliedMiscChargeId`, deshabilita los inputs de monto recibido y método (los aporta el anticipo), y avisa: banner rojo si el anticipo **excede** el precio (bloquea Confirmar vía `isCobroInvalid`); banner amarillo si es **menor** (socio queda deudor por la diferencia).
- Sin cobros pendientes → no se muestra el selector; flujo de asignación normal intacto.

## Typecheck / Tests

- API `tsc --noEmit`: verde.
- `test/subscriptions/impute-advance-on-assign.test.ts` (6 tests): **6/6 verde**.
  - Happy (monto = precio): advance anulado; **EXACTAMENTE 1 `plan_charge`** validado vinculado a la sub con `paymentMethod='transfer'` y `cashRegisterId` del anticipo; **balance de la sub = 0**.
  - COBRO-04 (60000 > 50000): 400 "excede el precio del plan"; advance sigue `pendiente`; sin sub ni plan_charge.
  - Guard otro socio → 400; guard ya validado → 400.
  - Atomicidad: `applyDelta` revienta sólo en el recreate (`row.kind==='plan_charge'`) → rollback total, advance **no** anulado, sin sub ni plan_charge.
  - Sin regresión: assign sin `appliedMiscChargeId` crea el plan_charge normal (cash).
- `test/subscriptions/charge-on-assign.test.ts` (14 tests): **14/14 verde** (sin regresión del camino default).
- Admin `pnpm build` (vue-tsc): verde (sólo warnings de chunk-size).

## Deviations from Plan

None — el plan se ejecutó según lo escrito, incorporando la corrección MEDIUM del plan-checker (default vs imputación excluyentes + test que cuenta plan_charge=1) que ya venía indicada en el prompt de ejecución.

## Self-Check: PASSED
