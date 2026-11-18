---
phase: 215-regalar-aura
plan: 09
subsystem: api-aura
tags: [aura, regalo, anulacion, asistencia, ledger, tenancy]
requires: ["215-08"]
provides:
  - "`POST /api/admin/aura/gifts/:id/void`: anula un regalo vigente y descuenta exactamente lo recibido"
  - "`voidGift` y `voidGiftsForAttendance` en `aura/gift-void.ts`"
  - "Deshacer una asistencia anula antes los regalos que dio o recibió"
affects: [215-10, 215-22, 215-24]
tech-stack:
  added: []
  patterns:
    [
      CAS sobre el estado de la fila más fila negativa del ledger en la misma transacción,
      anulación en cascada previa al borrado y fuera de todo try,
    ]
key-files:
  created:
    - el-templo-api/src/modules/aura/gift-void.ts
    - el-templo-api/test/aura/gifts-void.test.ts
  modified:
    - el-templo-api/src/modules/aura/gift-admin-routes.ts
    - el-templo-api/src/modules/aura/gift-schemas.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/attendance/routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - .planning/phases/215-regalar-aura/215-DECISIONES-AUTONOMAS.md
key-decisions:
  - "removeCheckIn recibe el actor como tercer parámetro opcional para que la anulación en cascada deje a quién la hizo"
requirements-completed: [SC-7, SC-8, D-08, D-09, D-20]
duration: 25 min
completed: 2026-11-18
---

# Fase 215 Plan 09: anulación de regalos Summary

El staff puede anular un regalo (el receptor pierde exactamente lo que recibió, con una fila negativa propia en el ledger) y deshacer una asistencia anula antes los regalos que esa asistencia dio o recibió. La pantalla para anular es de otro plan (22).

## Tareas

| Tarea | Commit      | Asunto                                                                   |
| ----- | ----------- | ------------------------------------------------------------------------ |
| 1     | `8efced733` | feat(215-09): anulación de regalos con reversa exacta en el ledger       |
| 2     | `76aae406f` | feat(215-09): anular regalos desde el admin y al deshacer una asistencia |
| 3     | `ed64155d2` | test(215-09): integración de la anulación de regalos                     |

## Qué quedó

- `gift-void.ts`: `voidGift(db, ctx, { giftId, voidedBy, cause, allowedBranchIds, log? })` en una transacción: lee el regalo con `tenantWhere` (inexistente, de otro gimnasio o fuera de las sedes permitidas da `REGALO_NO_ENCONTRADO`), CAS `UPDATE ... WHERE status = 'vigente'` con `readAffectedRows` (0 filas da `REGALO_YA_ANULADO`) y `awardInTransaction` con `-amount`, `social` y `aura_gift_void`. `voidGiftsForAttendance` anula los vigentes con `giver_attendance_id` o `receiver_attendance_id` igual a la asistencia; ignora solo `REGALO_YA_ANULADO` y relanza cualquier otro error. Nunca usa `spend`.
- Ruta `POST /gifts/:id/void` (204): dueño, admin y admin_sede (solo sus sedes con `enforcedBranchIds`; fuera de ellas 404). Profes y recepción reciben 403 `REGALO_SIN_PERMISO`. Quien anula queda en `voided_by_user_id`, con `void_cause = 'staff'`.
- `removeCheckIn`: llama a `voidGiftsForAttendance` en los dos caminos que borran `attendance` (Wellhub manual y general), antes del `DELETE` y fuera de cualquier `try`; si falla, el deshacer falla entero. No se tocó la reversa de Aura de la asistencia.
- Manifiesto: `POST /api/admin/aura/gifts/:id/void` (`templo-module` / `templo-gamification`); `ENTRADAS_BASELINE` 595 a 596 (y el título del `it`).
- `gifts-void.test.ts`: 12 `it` (reversa exacta alumno y profe con valor cambiado, doble anulación, admin_sede propio y ajeno, 403, 404, gimnasio 2, cupo del dador, deshacer asistencia del receptor y del dador, deshacer sin regalos, conciliación de `/auth/me`, SQL crudo, ledger y saldo). Nunca corrió local.

## Control posterior

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests` (heap ampliado): ninguna mención de `gifts-void`, `tenant-manifest` ni `iso-01`; la deuda listada es ajena (`attendance.test.ts`, `check-ins-roster`, `email/sender`).
- No se corrió ningún test de integración (quedan para CI). App y admin no tocados. Sin migración, sin cambios en dependencias, sin bump, sin push.

## Desvíos respecto del plan

- `removeCheckIn` no conocía al actor: se le agregó un tercer parámetro opcional `voidedBy: number | null = null` y la ruta `DELETE /:attendanceId` pasa `request.user.userId`. El plan lo preveía ("si lo conoce, pasarlo"); así la anulación en cascada deja a nombre de quién fue.
- `voidGift` no pasa `log` a `AuraService` (pide un `Logger` de pino y la ruta tiene un `FastifyBaseLogger`): el log de la anulación lo escribe `gift-void.ts`.

## Decisiones propias

Tres filas nuevas en `215-DECISIONES-AUTONOMAS.md`: admin_sede fuera de sus sedes ve "no encontrado", el actor queda registrado al deshacer una asistencia, y anular descuenta siempre lo recibido aunque la persona ya haya usado esa Aura.

## Lecciones para los planes siguientes

- Plan 10 en adelante: `voidGift` y `voidGiftsForAttendance` viven en `aura/gift-void.ts`. La anulación no manda push ni toca la bandeja: si el plan de la bandeja quiere marcar "Anulado" (UI-SPEC), tiene que leer `aura_gifts.status`.
- Plan 22 (admin): la anulación responde 204 sin cuerpo; el 404 puede ser inexistente, ajeno o fuera de sedes (la pantalla no distingue), el 409 es `REGALO_YA_ANULADO`, el 403 es `REGALO_SIN_PERMISO`.
- Si CI falla en `gifts-void.test.ts`, mirar primero la siembra de la otra sede (`seedGiftClass({ tz })` con `staffToken("coach", ...)`), el módulo `templo-gamification` del gimnasio 2 encendido en el caso 7 y que `removeCheckIn` por `DELETE` funcione con una asistencia sembrada por SQL.

## Self-Check: PASSED

Archivos y commits `8efced733`, `76aae406f` y `ed64155d2` verificados.
