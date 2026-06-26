---
phase: 146-caja-validaci-n-e-imputaci-n-fundacional
plan: 02
subsystem: finance
tags: [caja, validacion, imputacion, multibanco, CAJA-02, CAJA-03, COBRO-05]
requires:
  - "validate() pendiente→validado (fase 137)"
  - "cashRegisterService.resolveCashRegister (fase 138)"
  - "cash_registers entity + Banco ARS/EUR seed (fase 138/0154)"
  - "miscReason enum sin_plan/otro (fase 145/0159)"
provides:
  - "validate(id, adminId, cashRegisterId?) con guards de coherencia (existe/activa/moneda)"
  - "bloqueo server-side de validar miscReason='sin_plan' (COBRO-05)"
  - "cajas banco Galicia + Mercado Pago (ARS) seedeadas (migración 0160)"
  - "TransactionService.voidInTx(tx, ...) tx-aware (primitivo plan 03)"
  - "TransactionService.listPendingMiscForMember(memberId) + GET /transactions/pending-misc/:memberId"
  - "resolveCashRegister: sugerencia banco estable con orderBy(id) (LOW 1)"
affects:
  - "plan 146-03 (imputación del anticipo: usa voidInTx + listPendingMiscForMember)"
  - "plan 146-04/05 (UI de validación elige caja; arqueo por caja)"
tech-stack:
  added: []
  patterns:
    - "Body schema opcional type [object,null] para retrocompat de un endpoint que antes no tenía body"
    - "Guard de coherencia de caja en validate espejo del guard del resolver (D-09)"
    - "Primitivo tx-aware (voidInTx) expuesto para componer en la db.transaction del caller"
    - "RBAC per-handler FINANCE_VOID_ROLES sobre el guard de módulo FINANCE_READ_ROLES (LOW 2)"
key-files:
  created:
    - "el-templo-api/src/db/migrations/0160_seed_banco_cuentas.sql"
    - "el-templo-api/test/finance/validate-caja.test.ts"
  modified:
    - "el-templo-api/src/modules/finance/transaction-service.ts"
    - "el-templo-api/src/modules/finance/schemas.ts"
    - "el-templo-api/src/modules/finance/routes.ts"
    - "el-templo-api/src/modules/finance/cash-register-service.ts"
    - "el-templo-api/src/modules/finance/types.ts"
decisions:
  - "Migración 0160 idempotente por nombre con derived tables (LIMIT 1 + agregación) para esquivar el error 1093 de MySQL al referenciar la tabla destino en un subquery del propio INSERT."
  - "cutoff_date de las cajas nuevas = MIN(cutoff_date) global existente (NOT NULL satisfecho sin hardcodear fecha)."
  - "Body de validate con type [object,null] para que una validación SIN body siga pasando (retrocompat con el endpoint previo sin body)."
  - "pending-misc gateado con FINANCE_VOID_ROLES per-handler (no SUBSCRIPTION_ROLES) para no exponer datos financieros a recepción/coach (LOW 2)."
metrics:
  duration: "~35 min"
  completed: "2026-06-26"
  tasks: 3
  files: 7
---

# Phase 146 Plan 02: Validación e imputación de caja (multibanco) + primitivos plan 03 Summary

Abre el endpoint de validación para que gestión confirme/cambie la caja imputada (incl. elegir entre cuentas banco Galicia/Mercado Pago seedeadas por migración), bloquea server-side la validación manual de cobros "sin plan", y agrega los primitivos `voidInTx` + `listPendingMiscForMember` (con endpoint) que el plan 03 necesita para imputar el anticipo.

## Tasks

| Task | Nombre                                                                                | Commit   |
| ---- | ------------------------------------------------------------------------------------- | -------- |
| 1    | Migración 0160 — seed cajas banco Galicia + Mercado Pago (ARS)                        | 46c47146 |
| 2    | validate(cashRegisterId) + guards de coherencia + bloqueo sin_plan (+ LOW 1 resolver) | e6fa89f3 |
| 3    | Primitivos plan 03: voidInTx + listPendingMiscForMember + endpoint                    | e6fa89f3 |

(Tasks 2 y 3 comparten los mismos 4 archivos — transaction-service, schemas, routes, test — por lo que se commitearon juntas como unidad cohesiva.)

## Migración aplicada

- `0160_seed_banco_cuentas.sql` aplicada con `pnpm db:migrate` (no `drizzle-kit migrate`). Idempotente (segunda corrida = "No new migrations"). Verificado en la DB de desarrollo: existen `Galicia` (id 19) y `Mercado Pago` (id 20) como banco ARS activas, cutoff copiado del global (`2026-06-24`). La sugerida del resolver queda fija en `Banco ARS` (id 17, el menor) vía `orderBy(id)`.

## Typecheck / Tests

- `tsc --noEmit`: verde.
- `test/finance/validate-caja.test.ts` (12 tests) + `test/finance/validation-state.test.ts` (18 tests): 30/30 verde.
- `test/finance/cash-register-service.test.ts` (22 tests): verde (regresión del resolver descartada).

Cobertura nueva: imputa caja banco elegida; conserva sugerida sin cashRegisterId; rechaza caja inexistente/inactiva/otra-moneda (400); rechaza validar sin_plan (400); permite misc 'otro'; validate con caja sobre REST (200); listPendingMiscForMember filtra solo advance_payment pendientes no anulados del socio; voidInTx revierte balance dentro de la tx del caller; endpoint pending-misc 200 admin / 403 recepción.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Regresión: validate REST 400 al agregar body schema**

- **Found during:** Task 2 (corrida de tests)
- **Issue:** Agregar `body` a `validateTransactionSchema` hizo que el test existente `validation-state.test.ts` ("admin validates a pendiente over REST") devolviera 400 — la request sin payload deja `request.body=null` y el schema `type:"object"` rechaza `null`.
- **Fix:** `type: ["object", "null"]` en el body schema → una validación sin body sigue pasando (retrocompat). `request.body?.cashRegisterId` ya maneja el null.
- **Files modified:** `el-templo-api/src/modules/finance/schemas.ts`
- **Commit:** e6fa89f3

## Plan-checker care items (aplicados)

- **LOW 1 (multibanco estable):** `orderBy(cashRegisters.id)` en la query banco del resolver → sugerencia determinista con varias cuentas banco de la misma moneda.
- **LOW 2 (RBAC pending-misc):** endpoint gateado con `FINANCE_VOID_ROLES` per-handler; test "recepción → 403" incluido.
- **COBRO-05 server-side:** guard `miscReason==='sin_plan'` dentro de `validate()`, con test de rechazo.
- **CAJA-02 coherencia:** guard caja existe + activa + misma moneda dentro de `validate()` (espejo del resolver), manteniendo el RBAC FINANCE_VOID.

## Self-Check: PASSED
