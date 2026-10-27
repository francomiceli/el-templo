---
phase: 204-usuarios-wellhub
plan: 05
subsystem: api
tags: [wellhub, bookings, cancel-guards, tests]
requires: ["204-04"]
provides:
  - "Staff y socio no pueden cancelar una reserva Wellhub (409 con mensaje fijo)"
  - "Cancelar/pausar/cambiar plan, anulacion de invitacion, compensar dias, cambio de sede y baja del socio no cancelan reservas Wellhub"
  - "El cierre de clase cancela la reserva Wellhub pero no le da credito de recupero al plan fijo"
affects: [204-06]
key-files:
  modified:
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/subscriptions/booking-population.ts
  created:
    - el-templo-api/test/wellhub/cancel-guards.test.ts
metrics:
  tasks: 2
  files: 5
  completed: 2026-10-27
---

# Phase 204 Plan 05: Guardas de cancelacion de reservas Wellhub Summary

Una reserva Wellhub se gestiona desde la app de Wellhub: ni el staff ni el socio la cancelan desde El Templo, y ningun cancelado masivo del ciclo de vida del plan la toca. Nada se corrio localmente (sin node_modules): verificacion por grep y lectura de codigo.

## Commits

- `c6a79fd25` feat(204-05): reservas Wellhub protegidas de cancelaciones del plan y del staff (D-11, D-24, D-25, D-18) (Task 1)
- `6014f7c0c` test(204-05): guardas de cancelacion de reservas Wellhub (D-11, D-24, D-25, D-18) (Task 2)

## Lo hecho

- `booking-service.ts`
  - Constante exportada `WELLHUB_BOOKING_MANAGED_MSG = "Esta reserva se gestiona desde la app de Wellhub"`.
  - `adminRemoveBooking` (D-11) y `cancel()` (D-24): el select trae `source`; si `isWellhubBookingSource` lanza `ConflictError(WELLHUB_BOOKING_MANAGED_MSG)`. `handleServiceError` lo mapea a 409 `{ error, message }` en ambas rutas (verificado). En `cancel()` el chequeo va despues de la verificacion de pertenencia y antes del bloqueo de trial / ventana de 20 min.
  - `cancelFutureBookings` y `cancelUpcomingBookingsForMember` (select de candidatos y UPDATE): `notWellhubBookingSql()`.
  - `cancelBookingsFromDateAndGrantCredits` y `previewScheduleDeletion`: SOLO la query `fixedHits` lleva `notWellhubBookingSql()`. `toCancel`, el UPDATE de cancelacion y `cancelAllFutureBookingsForSchedule` quedan sin tocar.
- `booking-population.ts` `cancelBookingsInRange` (compensar dias), `members/service.ts` `updateMember` (cambio de sede sin plan multisede): `notWellhubBookingSql()` + import desde `../shared/wellhub-sources`.
- `members/routes.ts` DELETE (D-25): bulk cancel con `notWellhubBookingSql()`; despues un COUNT con `isWellhubBookingSql()` y `request.log.info({ userId, wellhubBookings }, "Baja de socio: reservas Wellhub vivas quedan para Wellhub")` si quedan.
- Tests (`cancel-guards.test.ts`): los 8 `it` pedidos. 409 + mensaje exportado en staff y socio (con controles de reserva propia, `source` NULL), cancelar plan, baja de socio, compensar dias (dos turnos anclados, uno propio y uno Wellhub), cambio de sede (sede nueva insertada en el test) y cierre de clase (socio propio +1 credito, socio Wellhub credito sin cambios y reserva `cancelado`).

## Deviations from Plan

- **[Decision] `previewScheduleDeletion` solo excluye Wellhub de `fixedHits`.** Sus `candidateBookings` siguen incluyendo reservas Wellhub, por lo que el socio con reserva Wellhub cuenta como "flexible" en `affectedFlexibleMembers`/`sampleMembers`. `cancelledBookings` sigue siendo el total real que se cancela. Segun el plan, solo `fixedHits` cambia; el numero `creditsToGrant` queda alineado con lo que otorga el cancelado.
- **[Decision] En los tests de plan fijo la reserva Wellhub se siembra con UPDATE de `source`** sobre una reserva generada por el plan, porque el indice unico (socio, horario, fecha) impide insertar otra sobre el mismo turno anclado.
- **[Decision] El conteo post-baja usa la misma ventana (`>= hoy`, `reservado`/`lista_espera`) que el bulk cancel**, no `confirmado`.
- Co-Authored-By con `Claude Sonnet 5.5`.

## Bugs / observaciones no anticipadas

- `cancelFutureBookings` calcula "hoy" con `new Date().toISOString()` (UTC) y no con la tz de la sede (pre-existente, no se toco).
- El bulk cancel de `updateMember` por cambio de sede incluye `confirmado` pero el de baja/plan solo `reservado`/`lista_espera`; no se unifico.
- La reserva Wellhub de un socio con plan fijo puede quedar viva despues de cancelar su plan: el socio sigue figurando con la reserva pero ya sin plan. Es lo pedido (D-25); la reserva no consume plan (D-18).

## Known Stubs

Ninguno.

## Dudas para Franco

- Los tests nuevos no se corrieron ni tipearon (sin node_modules). Puntos de riesgo para CI: (1) `schema.branches` insertado con `tenantValues(TEMPLO_CTX, ...)` y `.$returningId()` en el test de cambio de sede (la sede nueva queda en la base de test, como en `admin-sede-scope.test.ts`); (2) el PUT de ficha con `branchId` asume que `admin@test.com` puede mover socios a una sede cualquiera; (3) `dayOfWeek` de los horarios se calcula con `getUTCDay()` evitando domingos (el schema documenta 1=lunes..6=sabado); (4) la ruta `cancel-date` exige fecha valida para el dia anclado, se usa una fecha `hoy + >=3` no domingo.
- Pendiente diferido (CONTEXT): el cierre de clase cancela la reserva Wellhub sin avisarle a Wellhub (`cancelBookingByGym` sin uso). Sigue como estaba.
- Prettier no se pudo confirmar (el orquestador formatea al final).

## Self-Check: PASSED

- `c6a79fd25`, `6014f7c0c`: FOUND
- `notWellhubBookingSql()` x9 en booking-service.ts, x1 en booking-population.ts, members/service.ts y members/routes.ts; `new ConflictError(WELLHUB_BOOKING_MANAGED_MSG)` x2
- 8 `it(` en cancel-guards.test.ts; sin ids de usuario hardcodeados
