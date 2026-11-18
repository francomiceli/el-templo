---
phase: 215-regalar-aura
plan: 11
subsystem: api-aura
tags: [aura, regalo, detalle-privado, etiquetas]
requires: ["215-10"]
provides:
  - "El regalo recibido se lee con quien dio y el motivo en `GET /api/members/aura/movements`"
  - "`auraMovementLabel` con cuarto parámetro opcional `gift`"
affects: [215-21, 215-27]
tech-stack:
  added: []
  patterns:
    [una consulta extra por página para datos de la fila, texto fijo en Map]
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/aura/movement-labels.ts
    - el-templo-api/src/modules/aura/member-routes.ts
    - el-templo-api/test/unit/aura-movement-labels.test.ts
    - el-templo-api/test/aura/member-aura-movements.test.ts
    - .planning/phases/215-regalar-aura/215-DECISIONES-AUTONOMAS.md
    - .planning/phases/215-regalar-aura/215-EJECUTORES.md
key-decisions:
  - "Solo se nombra a quien dio si el regalo lo recibió la propia persona; del profe, solo el nombre"
requirements-completed: [SC-4, SC-8, D-13, D-19, D-22]
duration: 20 min
completed: 2026-11-18
---

# Fase 215 Plan 11: regalos en el detalle privado de Aura Summary

En el detalle privado, un regalo recibido se lee "Sofía M. te dio Aura · Buena energía" o "Tu profe Fran te dio Aura · Buena técnica" con su monto positivo, y la anulación "Regalo anulado" con monto negativo. La forma de la respuesta no cambió y la suma de los movimientos sigue siendo la Aura ganada.

## Tareas

| Tarea | Commit      | Asunto                                                          |
| ----- | ----------- | --------------------------------------------------------------- |
| 1 RED | `1f67fd1db` | test(215-11): etiquetas de regalos en el detalle (rojo)         |
| 1     | `9000c878f` | feat(215-11): etiquetas de regalos en el detalle                |
| 2     | `9200ef72e` | feat(215-11): regalos con nombre y motivo en el detalle privado |

## Qué quedó

- `auraMovementLabel(sourceType, referenceType, referenceId, gift?)`: para `social`, `aura_gift_void` da `GIFT_VOID_LABEL` y el resto `giftMovementLabel(gift ?? null)` ("Regalo de Aura" sin datos). Las demás fuentes quedaron iguales.
- `member-routes.ts`: `giftLabelInputs` hace UNA consulta por página a `aura_gifts` unida a `users` del dador (`tenantWhere` en ambas tablas, filtro por `receiver_user_id` del token, nombre de pila e inicial con `LEFT(last_name, 1)`). Sin regalos en la página no consulta. Del profe se descarta la inicial.
- Unitario: 5 casos nuevos (12 `it` en total, en verde).
- Integración: 6 casos nuevos (regalo de alumno, de profe, anulado con `earned` = suma y igual a `/me`, el dador no ve nada, regalo ajeno no revela al dador, regalo borrado y claves exactas de la respuesta). Nunca corrieron local.

## Control posterior

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests` (heap ampliado): sin menciones de `member-aura-movements` ni `aura-movement-labels`; la deuda listada es ajena.
- App y admin no tocados. Sin migración, sin cambios en dependencias, sin bump, sin push.

## Desvíos respecto del plan

- El plan pedía juntar también los `referenceId` de `aura_gift_void`. No hace falta: la anulación no lleva nombres, así que solo se consultan los regalos recibidos (menos datos, misma regla).
- Se agregó el filtro por `receiver_user_id` (no estaba en el plan): impide que un `referenceId` ajeno revele al dador (T-215-11-01).

## Decisiones propias

Una fila en `215-DECISIONES-AUTONOMAS.md`: qué nombre ve quien recibe un regalo en el detalle.

## Lecciones para los planes siguientes

- Las apps no necesitan cambios para este plan: solo cambian los `label`.
- Si CI falla en `member-aura-movements.test.ts`, mirar primero `seedGiftClass` (usa la primera sede real) y que `createStaffUser` reciba el `branchId` de esa sede.

## Self-Check: PASSED

Archivos y commits `1f67fd1db`, `9000c878f` y `9200ef72e` verificados.
