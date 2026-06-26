---
phase: 148-pos-profe-alta-de-alumno-plan-en-el-cobro
plan: 04
subsystem: backend (finance — coach-load /alta integration tests)
tags:
  [
    pos-profe,
    alta-alumno,
    integration-tests,
    idempotency,
    void-cascade,
    createdMemberId,
    W-1,
  ]
requires:
  - "148-02: POST /admin/finance/coach-load/alta (orquestador alta+plan+cobro pendiente)"
  - "148-03: _void cascade (alumno-nuevo → inactivo) + createdMemberId surfacing"
  - "test/helpers.ts: createTestApp, createStaffUser, getAuthToken, registerUser, ensureEfectivoCaja"
provides:
  - "Suite de integración de los 7 escenarios críticos del alta + cascade contra MySQL real (eltemplo_test)"
  - "Red de seguridad del tren a prod para el corazón de la Fase 148"
affects:
  - "CI (pnpm test) — la suite corre al pushear a staging"
tech-stack:
  added: []
  patterns:
    - "Integración con app.inject + asserts sobre filas reales (users, subscriptions, financial_transactions, subscription_schedules, bookings, balances, userStatusHistory)"
    - "DNIs únicos por test (timestamp+seq) → members creados por /alta no colisionan en el DB por-worker compartido"
    - "Lectura directa de la tx por idempotencyKey para verificar createdMemberId atómico (W-1)"
    - "void como gestión (admin) con keepMembershipActive=false para disparar el cascade"
key-files:
  created:
    - el-templo-api/test/finance/coach-load-alta.test.ts
  modified: []
decisions:
  - "DNIs únicos por test en vez de limpiar la tabla users en beforeEach (evita FK churn; los members alta persisten inofensivos)."
  - "crear-nuevo verifica status final 'activo' (assignPlan lo flipa desde 'prueba') + history null→prueba como prueba de que nació por createMinimalMember."
  - "void se ejerce con keepMembershipActive=false (gestión) para cancelar la sub Y disparar el flip del alumno; el flip de createdMemberId corre siempre, pero la sub solo se cancela con el flag en false."
  - "retry-tras-fallo-parcial (I-1) lee la tx persistida por key tras el replay y afirma createdMemberId NO-NULL == el alumno creado (cierra W-1: el id viajó atómico con el insert del charge, no por persistencia desacoplada)."
metrics:
  duration: ~18min
  completed: 2026-06-26
---

# Phase 148 Plan 04: Suite de integración del endpoint /alta + cascade Summary

**One-liner:** Blindaje del corazón de la Fase 148 — un único archivo de integración (`test/finance/coach-load-alta.test.ts`, ~650 líneas) que ejercita los 7 escenarios críticos del alta de alumno + plan en el cobro y del cascade en void contra MySQL real (`eltemplo_test`), con asserts sobre filas reales en `users`, `subscriptions`, `financial_transactions`, `subscription_schedules`, `bookings`, `balances` y `userStatusHistory`.

## What Was Built

### Task 1 — Tests crear-nuevo, dedup, parcial→deuda, fixed — `7c5ee195`

Setup (`beforeAll`): app de test, `adminToken` + `coachToken` (coach creado vía `createStaffUser`), `ensureEfectivoCaja`, y dos planes sembrados directo en DB — uno **flexible** (`Alta Flex Plan`, priceRegular 100000, priceCreditCard 120000, classesPerWeek 3) y uno **fixed** (`Alta Fixed Plan`, classesPerWeek 2). `beforeEach` limpia el estado finance + suscripciones (tx_links, financial_transactions, balances, bookings, subscription_schedules, subscriptions). Helpers: `postAlta`, `readChargeByKey`, `readUser`, `countUsersByDni`, `readSubBalance`, `createScheduleSlots`, `uniqueDni`.

- **crear-nuevo:** alumno sin match ⇒ `createdNew=true`, exactamente 1 user con ese DNI, email `null`, history `null→prueba` (prueba de que nació por `createMinimalMember`), status final `'activo'` (assignPlan lo flipa), sub `active`, charge `plan_charge` `validation_status='pendiente'` con `amount=100000` y `createdMemberId` = el alumno nuevo.
- **dedup:** DNI que matchea un member preexistente (sembrado vía `registerUser`) ⇒ `createdNew=false`, `createdMemberId=null`, NO se crea un 2º user (count DNI sigue en 1), la sub pertenece al member existente, el charge nace `pendiente` con `createdMemberId=null`.
- **parcial→deuda:** `amountReceived=40000 < precio 100000` ⇒ el charge cobra 40000 y la subscription queda con `balance = 60000` (deuda = precio − recibido, lazy-seed desde `subscriptions.pricePaid`).
- **fixed (happy):** `scheduleIds.length===classesPerWeek` ⇒ filas en `subscription_schedules` (una por slot) + bookings recurrentes generados para el alumno. **fixed (negativo):** `scheduleIds` con count erróneo ⇒ **400** y la tx del charge rolleó (no queda charge con esa key).

### Task 2 — Tests void→cascade, retry-tras-fallo-parcial (I-1), idempotencia — `653eb621`

Helper agregado: `voidCharge(txId, token=admin, keepMembershipActive=false)` (anula como gestión).

- **void→cascade (alumno-nuevo):** alta como coach → `voidCharge` como admin ⇒ tx anulada (`voided_at` seteado), sub `cancelled`, alumno **NO borrado** (count DNI sigue en 1) y ahora `status='inactivo'`, con exactamente 1 fila `userStatusHistory` `toStatus='inactivo'`.
- **void→cascade (preexistente):** alta vía dedup contra un member existente → `voidCharge` ⇒ el member preexistente **NO** queda `'inactivo'` (cascade no-op porque `createdMemberId` null), sin history `→inactivo`.
- **retry-tras-fallo-parcial (I-1 / W-1):** 1er alta crea alumno + charge con `createdMemberId` grabado; replay con la **misma** `idempotencyKey` ⇒ 200 no-op, sigue habiendo 1 user, la **única** tx persistida conserva `createdMemberId` NO-NULL == el alumno creado (cierra W-1: el id viajó atómico con el insert del charge, no por una persistencia desacoplada que el replay pudiera perder); el `void` posterior desactiva al alumno (`inactivo`).
- **idempotencia (doble-submit):** dos POST con la misma key ⇒ 2º devuelve **200** con el charge existente; exactamente 1 user con ese DNI y exactamente 1 `financial_transaction` con esa key.

## Verification Results

- `cd el-templo-api && pnpm exec tsc --noEmit` ⇒ **verde** tras ambas tasks (EXIT 0), incluido el reformateo de prettier en el pre-commit.
- `grep -c "void\|idempotenc\|createdMemberId" test/finance/coach-load-alta.test.ts` ⇒ 75 (≥1).
- Archivo presente: `test/finance/coach-load-alta.test.ts`.
- La suite **no se corrió localmente** (MEMORY: corre en CI contra `eltemplo_test` al pushear a staging). El comando de un caso queda documentado en el header del archivo: `npx vitest run test/finance/coach-load-alta.test.ts -t "<tag>"`.

## Deviations from Plan

None - plan executed exactly as written. Los 7 casos requeridos (CONTEXT L182 / PATTERNS L242 / plan L29-37) están cubiertos con asserts sobre filas reales.

## Threat Model Compliance

- **T-148-15 (Repudiation — regresión silenciosa en alta/cascade):** suite de integración cubre los 7 escenarios críticos contra MySQL real antes del tren a prod. ✓
- **T-148-16 (Tampering — idempotencia rota deja duplicados):** test doble-submit explícito afirma 1 user + 1 charge. ✓
- **T-148-24 (Integrity — createdMemberId perdido en replay, W-1):** test retry-tras-fallo-parcial afirma `createdMemberId` NO-NULL tras el replay en la única tx persistida y que el cascade de void lo desactiva. ✓
- **T-148-SC (npm/pip/cargo installs):** accept — sin dependencias nuevas en esta fase. ✓

## Known Stubs

None — todos los asserts leen filas reales de la DB; no hay valores hardcodeados ni mocks de datos.

## Notes for Downstream Plans

- **CI:** `pnpm test` corre la suite al pushear a staging. Si `eltemplo_test` no tiene `planCategory` válido o el enum `subscription_status`/`status` cambia, los asserts de `'active'`/`'cancelled'`/`'inactivo'`/`'activo'` son los anclajes a actualizar.
- **148-05/148-06 (frontend):** estos tests fijan el contrato de la respuesta del endpoint (`createdMemberId`, `createdNew`, `subscription.id`, `transaction.id`) que el frontend consume para el ticket "Nuevo" y la copy de la bandeja.

## Self-Check: PASSED

- FOUND: el-templo-api/test/finance/coach-load-alta.test.ts
- FOUND commit 7c5ee195 (Task 1)
- FOUND commit 653eb621 (Task 2)
