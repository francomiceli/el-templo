---
phase: 215-regalar-aura
plan: 04
subsystem: api-aura
tags: [aura, regalo, transaccion, elegibilidad]
requires: ["215-03"]
provides:
  - "`AuraService.awardInTransaction(tx, ctx, input)` y el tipo `AuraTx`"
  - "`gift-eligibility.ts`: una sola regla de quién da y quién recibe"
  - "Fixture `test/aura/_gift-fixtures.ts` para los tests de la 215"
affects: [215-05, 215-07, 215-09, 215-11, 215-14]
tech-stack:
  added: []
  patterns:
    [
      escritura del ledger dentro de una transacción ajena,
      lecturas con tenantWhere literal,
    ]
key-files:
  created:
    - el-templo-api/src/modules/aura/gift-eligibility.ts
    - el-templo-api/test/aura/award-in-transaction.test.ts
    - el-templo-api/test/aura/gift-eligibility.test.ts
    - el-templo-api/test/aura/_gift-fixtures.ts
  modified:
    - el-templo-api/src/modules/aura/service.ts
key-decisions:
  - "Reserva de prueba (aunque cancelada) saca a la persona de las caras"
  - "Orden de las caras: hora de reserva vigente, si no la del check-in"
requirements-completed:
  [SC-1, SC-2, SC-4, SC-5, SC-8, D-02, D-04, D-05, D-07, D-08, D-09, D-13]
duration: 40 min
completed: 2026-11-18
---

# Fase 215 Plan 04: base atómica y elegibilidad del regalo Summary

El regalo y su Aura pueden escribirse en la misma transacción (`awardInTransaction`) y hay una sola regla, en `gift-eligibility.ts`, de quién puede regalar y a quién se le puede regalar.

## Tareas

| Tarea | Commit      | Asunto                                                          |
| ----- | ----------- | --------------------------------------------------------------- |
| 1     | `464cec04f` | feat(215-04): Aura dentro de una transacción ajena              |
| 2     | `4f330f816` | feat(215-04): elegibilidad del regalo (quién da y quién recibe) |

La tarea 1 ya estaba commiteada al arrancar esta ejecución (corrida previa interrumpida); se revisó el código y el test y se conservaron tal cual. De la tarea 2 existía `gift-eligibility.ts` sin commitear: se revisó, pasó `tsc` y `lint:tenant` y se completó con el fixture y el test.

## Qué quedó

- `awardInTransaction`: no abre transacción, `amount` obligatorio (acepta negativos), `tenant_id` en el ledger y en el `INSERT` de `aura_balances` (la tabla lo tiene). `award` quedó como estaba. Test con rollback, duplicado (`isDuplicateKeyError`), anulación negativa, conciliación saldo = ledger y regalo fuera del tope del día (D-13).
- `gift-eligibility.ts`: `loadClassAttendance`, `listRecentClassAttendances`, `classHasEnded`, `giverAccess`, `listEligibleClassmates`, `weeklyGiftCountsByReceiver`. `Classmate` solo trae `userId`, `attendanceId`, nombre de pila y una inicial.
- `_gift-fixtures.ts`: `seedGiftClass` (con `tz` crea una sede propia; se borra con `cleanupGiftClasses`), `seedGiftPlan`, `seedMember`, `seedMemberWithPlan`, `seedAttendance` (`app.dbPool.query`), `seedBooking`, `setCommunityVisible`, `seedGift`, `ledgerSum`, `earnedOf`.
- `gift-eligibility.test.ts`: 27 `it` (compañeros: dador, profe, campos expuestos, staff, oculto, menor, prueba, borrado, Wellhub, otro horario/fecha, orden, otro gimnasio; acceso; tope semanal con extremos; carga de asistencia; ventana con zonas horarias; `classHasEnded` con `now` inyectado).

## Control posterior

- API `npx tsc --noEmit`: 0 (base 0). `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests`: sin menciones de `gift-eligibility`, `_gift-fixtures` ni `award-in-transaction`; las 18 discrepancias son la deuda ajena de base.
- Tests de integración: no corridos (quedan para CI). App y admin no tocados. Sin cambios en dependencias, sin push, sin bump, sin migración.

## Desvíos respecto del plan

Ninguno de fondo. `classHasEnded` se prueba con un `now` inyectado (sin `skipIf`): no depende del reloj.

## Decisiones propias

- Una reserva de prueba, aunque esté cancelada, saca a la persona de las caras (lo más conservador).
- Orden de las caras en memoria (sin LEFT JOIN a `bookings`): reserva vigente más temprana, si no hora de check-in, y desempate por id de asistencia.
- Si una persona tiene dos asistencias en el mismo horario y fecha, aparece una vez.
- Anotadas en `215-DECISIONES-AUTONOMAS.md`.

## Lecciones para los planes siguientes

- `pnpm typecheck:tests` se queda sin memoria con el heap por defecto: correrlo con `NODE_OPTIONS=--max-old-space-size=4096`.
- Para leer clases usar `loadClassAttendance` / `listRecentClassAttendances` y para las caras `listEligibleClassmates`; el regalo del profe pasa `excludeUserId: null`. `todayLocal` es el día local de la sede de la clase.
- Los servicios de regalo abren `db.transaction` y llaman a `AuraService.awardInTransaction(tx, ctx, { ..., amount })` con `sourceType: "social"`, `referenceType: GIFT_REFERENCE` y `referenceId` = id del regalo; la anulación escribe `-amount` con la referencia de anulación.
- Test de integración nuevo: `test/aura/gift-eligibility.test.ts`; fixtures en `test/aura/_gift-fixtures.ts` (los tests que usan `seedGiftClass({ tz })` deben llamar a `cleanupGiftClasses` en `afterAll`). `branches` no se limpia en `cleanAllTestData`.
- Ningún test de la 215 corrió en local: si fallan en CI, mirar primero la siembra de `seedMemberWithPlan` (plan por admin de prueba) y las zonas horarias del caso Auckland/Honolulu.

## Self-Check: PASSED

Archivos y commits `464cec04f` y `4f330f816` verificados.
