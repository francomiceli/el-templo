---
phase: 199-rediseno-mi-templo
plan: 06
subsystem: api-scheduling-auth
tags:
  [my-bookings, branch-timezone, checked-in-at, magic-link, d-03, d-04, d-06]
requires: [199-05]
provides:
  - GET /api/members/scheduling/my-bookings con branchId, branchName, branchTimezone y checkedInAt (aditivo)
  - branchTimezone obligatorio en GET /auth/me, POST /auth/login, POST /auth/register y POST /campaigns/exchange
affects: [199-07]
key-files:
  created:
    - el-templo-api/test/scheduling/my-bookings-branch-tz.test.ts
    - el-templo-api/test/auth/me-branch-timezone.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/types.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/campaigns/magic-link-service.ts
    - el-templo-api/test/campaigns-magic-link.test.ts
key-decisions:
  - "MyBookingRecord/myBookingRecordSchema separados: BookingRecord y bookingRecordSchema (roster admin, slot detail) intactos"
  - "checkedInAt por segunda query a attendance (no left join); con varias asistencias para la misma clase y fecha gana la mas temprana"
requirements-completed: [D-03, D-04, D-06]
completed: 2026-10-15
---

# Phase 199 Plan 06: my-bookings con sede/zona/asistencia y branchTimezone en el perfil Summary

`my-bookings` ahora devuelve la sede de la clase (id, nombre, zona) y la hora de asistencia registrada, y las 4 respuestas de perfil (me, login, register, canje de magic link) mandan siempre `branchTimezone`. Todo aditivo.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `2c1692e74` feat(199-06): my-bookings con sede/zona/asistencia y branchTimezone en me/login/register/magic link (aditivo)
- Task 2: `a3ba4f3ec` test(199-06): integración de my-bookings enriquecido y branchTimezone en /auth/me

## Que se implemento

- `types.ts`: `MyBookingRecord extends BookingRecord` (`branchId`, `branchName`, `branchTimezone`, `checkedInAt`).
- `schemas.ts`: `myBookingRecordSchema` = properties de `bookingRecordSchema` + las 4 nuevas, usado SOLO en `myBookingsSchema` (sin esto Fastify las recorta). El diff de `bookingRecordSchema` es nulo; solo cambia la linea `items:` de `myBookingsSchema`.
- `booking-service.ts` `getMyBookings`: `innerJoin` a `branches` con `tenantWhere(schema.branches, ctx)` por `schedules.branchId` (sede de la CLASE, no la del socio); segunda query a `attendance` con `tenantWhere`, `memberId`, `scheduleId` no nulo y `sessionDate` en la semana, indexada por `scheduleId|sessionDate`. `branchTimezone ?? DEFAULT_TENANT_TIMEZONE`. `isSpecial`/`specialLine` se conservan (D-06).
- `auth/routes.ts`: `timezone: branches.timezone` en los 3 selects de sede (register, login, me) y `branchTimezone` con fallback `DEFAULT_TENANT_TIMEZONE` en las 3 respuestas.
- `magic-link-service.ts`: `branchTimezone` en la interface del usuario del canje, en el select y en la respuesta.
- Ninguna de las 4 rutas de perfil tiene `response` schema (verificado por grep en `auth/schemas.ts` y campaigns), asi que no hubo que declarar nada ahi. `POST /refresh` no devuelve perfil y no se toco.

## Resultados de verificacion

- `npx tsc --noEmit` (el-templo-api): 0 errores tras cada task y al final.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0`.
- `prettier --check` limpio en los 5 archivos de src tocados; lint-staged paso en ambos commits.
- `pnpm -s typecheck:tests`: 14 discrepancias de base (preexistentes); 0 lineas que mencionen `my-bookings-branch-tz`, `me-branch-timezone` ni `campaigns-magic-link`. Confirmado tambien con `tsc -p tsconfig.test-check.json`.
- Greps de aceptacion: `myBookingRecordSchema` en schemas.ts (definicion + uso), `interface MyBookingRecord extends BookingRecord` = 1, `branchTimezone` en auth/routes.ts >= 3, `timezone: branches.timezone` = 3, `branchTimezone`/`DEFAULT_TENANT_TIMEZONE` en magic-link-service.ts presentes; en tests `checkedInAt` 15, `Europe/Madrid` 6, `America/Argentina/Buenos_Aires` 5, `/api/auth/login` 4, `/api/auth/register` 3, `branchTimezone` (magic link) 3, `isSpecial` 12.
- No se corrio vitest (corre en CI). Worktree limpio.

## Casos de test

`my-bookings-branch-tz.test.ts` (11 `it`):

1. sede de la clase (id, nombre, zona) y `checkedInAt` null sin asistencia
2. sede sembrada con zona default de Argentina
3. clase en sede `Europe/Madrid` (socio de otra sede): devuelve la de la CLASE
4. dos reservas en sedes distintas, cada una con su sede/zona
5. `checkedInAt` ISO string, igual al valor leido de la fila
6. asistencia de otra clase o de otra fecha no marca la reserva
7. asistencia de otro socio a la misma clase no marca la reserva
8. dos asistencias misma clase/fecha (insertadas en orden inverso): una sola reserva, gana la mas temprana
9. asistencia con `scheduleId` null (check-in forzado) no marca nada
10. no incluye reservas ajenas
11. D-06: `isSpecial`/`specialLine` por reserva (regular, yoga con linea, Aura sin linea)
12. 401 sin token

`me-branch-timezone.test.ts` (8 `it`): `/auth/me` con sede Madrid, con sede default, y admin (string no vacio); `/auth/login` Madrid y default; `/auth/register` Madrid, default, y sin `branchId` (sede ONLINE, string no vacio).

`campaigns-magic-link.test.ts`: el `it` D-01 suma `branchTimezone` al tipo y afirma string no vacio.

Fechas relativas a hoy calculadas dentro de cada `it` (lunes de la semana en curso), sin ids de `users` hardcodeados; las sedes de Madrid se crean con codigo propio (`TZMAD199`, `TZMAD199A`) en vez de mutar la sembrada.

## Deviations from Plan

1. **[Menor] Fallback de zona no testeable con datos reales.** `branches.timezone` es NOT NULL con default Buenos Aires, asi que "sede con timezone null" no se puede sembrar. El `?? DEFAULT_TENANT_TIMEZONE` queda como defensa y el caso "zona default" se testea con una sede que conserva el default (el test falla si la sede sembrada deja de tener ese default).
2. **[Menor] Sin test de regresion del roster admin** (el plan lo marcaba opcional si no habia endpoint barato): `bookingRecordSchema` no se toco por diseno y el diff lo confirma.
3. **[Menor] `/auth/me` responde plano** (no `{ user }`): los tests de `/me` leen el body directo; login/register si usan `body.user`.
4. **[Menor] Casos extra** sobre lo pedido: asistencia de otro socio, asistencia con `scheduleId` null, doble asistencia, registro sin `branchId`, perfil de admin, 401.

No se encontraron bugs reales en codigo previo.

## Dudas abiertas (no bloqueantes)

- `getMyBookings` ya no devuelve reservas cuya sede no pertenezca al tenant del ctx (el `innerJoin` a `branches` con `tenantWhere`); antes un horario con sede de otro tenant habria salido. Es el comportamiento correcto para tenancy, pero conviene que el UAT confirme que no hay horarios huerfanos.
- Primera corrida en CI: el unico riesgo es runtime (p. ej. insert de `attendance` con `scheduleId: null`, o el `INSERT ... ON DUPLICATE KEY` de las sedes Madrid).
- El perfil de `branchTimezone` ya viaja en las 4 respuestas, pero la app (`setProfile`, tipos de store) debe consumirlo en el plan de frontend.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-20 (attendance con `tenantWhere` y `memberId` del token), T-199-21 (join a `branches` con `tenantWhere`), T-199-22 (`bookingRecordSchema` intacto) mitigados; T-199-22b aceptado.

## Self-Check: PASSED

- Los 2 tests nuevos existen; commits `2c1692e74` y `a3ba4f3ec` presentes en `git log`; `git status --porcelain` vacio en el worktree.
