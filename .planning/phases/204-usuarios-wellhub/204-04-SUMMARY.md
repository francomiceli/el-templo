---
phase: 204-usuarios-wellhub
plan: 04
subsystem: api
tags: [wellhub, attendance, webhook, manual-presence, tests]
requires: ["204-03"]
provides:
  - "coachCheckIn sobre reserva Wellhub => attendance wellhub_manual sin efectos en el plan (D-19)"
  - "removeCheckIn: deshace wellhub_manual sin tocar el plan, rechaza con 409 la visita validada (D-18 #6)"
  - "Guarda diaria del coach por lados separados (D-18 #5)"
  - "Webhook promueve una visita wellhub_manual a wellhub al validar en Wellhub"
affects: [204-05, 204-06]
key-files:
  modified:
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/wellhub/service.ts
  created:
    - el-templo-api/test/wellhub/manual-presence.test.ts
metrics:
  tasks: 2
  files: 3
  completed: 2026-10-27
---

# Phase 204 Plan 04: Presente a mano en reservas Wellhub Summary

El staff puede marcar presente a mano una reserva Wellhub: queda como visita `wellhub_manual`, confirma la reserva y no toca el plan (sin AURA, sin clases, sin completed_sessions). Deshacerla es seguro y una visita validada por Wellhub no se puede deshacer. Si el usuario valida despues en la app de Wellhub, la fila a mano sube a `wellhub` sin duplicarse. Nada se ejecuto localmente (sin node_modules): verificacion por grep y lectura de codigo.

## Commits

- `de4327137` feat(204-04): presente a mano en reservas Wellhub sin tocar el plan (D-19, D-18 #5/#6) (Task 1)
- `4af9ac651` test(204-04): presente a mano, deshacer y promocion a validada en reservas Wellhub (D-19) (Task 2)

## Lo hecho

- `attendance/service.ts`
  - `coachCheckIn`: antes de la guarda diaria busca la reserva `(socio, horario, fecha)` con `tenantWhere`; `isWellhubVisit = isWellhubBookingSource(source)`. La guarda diaria agrega `isWellhubAttendanceSql()` si es visita Wellhub y `notWellhubAttendanceSql()` si no (D-18 #5). Si es Wellhub delega en el nuevo metodo privado `coachCheckInWellhub`, que inserta `source: "wellhub_manual"`, confirma la reserva con un UPDATE (limpia `cancelled_at`/`waitlist_position`, solo sobre reserva Wellhub) y retorna un warning informativo. Esa rama NUNCA llama a `auraService.award`, al decremento de `classesRemaining`, a `recordPresencialSession` ni a `pickSubscriptionForActivity`. La rama propia queda identica.
  - `removeCheckIn`: el select trae `sessionDate` y `source`. `wellhub` => `ConflictError("Esta visita la validó Wellhub y no se puede deshacer desde acá")`. `wellhub_manual` => borra la fila (con `tenantWhere`), revierte la reserva `confirmado -> reservado` por `session_date` (Pitfall 8) solo si es reserva Wellhub, y retorna sin tocar clases/AURA/completed_sessions. Otras fuentes: sin cambios.
- `wellhub/service.ts`: el guard `existingToday` y el `recheck` dentro de la tx traen `source`; solo una fila `wellhub` corta (`already_checked_in`). Una fila `wellhub_manual` sigue a `validateCheckin` y, en la tx, se hace UPDATE a `source: 'wellhub'` (se conserva `checked_in_at`) en vez de insertar. Log "Visita Wellhub a mano validada luego por Wellhub".
- Tests (`manual-presence.test.ts`): los 7 `it` pedidos. Para el no-show se agrega un control (otra reserva Wellhub sin marcar del mismo dia SI pasa a `no_show`) para que no pase por azar.

## Deviations from Plan

- **[Decision] `POST /force` no necesita rama Wellhub.** `forceCheckIn` inserta siempre `scheduleId: null` (asistencia propia del dia sin horario), asi que no puede alcanzar una reserva Wellhub. Sin cambios.
- **[Decision] Reserva Wellhub cancelada/en espera cuenta como visita Wellhub.** El lookup no filtra por status: si el staff marca presente a alguien con una reserva `source = 'wellhub'` cancelada, se revive como `confirmado` (misma conducta que el upsert propio) y sigue siendo visita Wellhub. Alternativa descartada: tratarla como propia, que descontaria clases y daria AURA sobre una reserva con `source` Wellhub.
- **[Decision] Warning informativo siempre presente** en la rama Wellhub ("Visita Wellhub marcada a mano: no la valida Wellhub"), opcional segun el plan.
- **[Decision] Rama Wellhub en metodo privado** (`coachCheckInWellhub`) en vez de if-anidados: deja intacta la rama propia en el diff.
- Co-Authored-By con `Claude Sonnet 5.5`, como en planes anteriores.

## Bugs / observaciones no anticipadas

- `AttendanceSource` en `attendance/types.ts` sigue siendo `"qr" | "manual"` y `mapAttendanceRow` castea (`as "qr" | "manual"`); la respuesta del check-in a mano ya devuelve `"wellhub_manual"` en runtime. Tipos y `getSlotAttendance` (`source: "qr" | "manual" | null`) se ensanchan en el plan 06 (no se toco aca).
- El webhook solo busca reservas `reservado`/`qr_escaneado` para confirmar: tras una marca a mano la reserva ya esta `confirmado`, por eso la promocion solo actualiza la fila de attendance (no hace falta tocar la reserva).
- Pre-existente: `removeCheckIn` de filas propias sigue usando la fecha UTC de `checked_in_at` para revertir la reserva (no se toco; solo la rama `wellhub_manual` usa `session_date`).

## Known Stubs

Ninguno.

## Dudas para Franco

- CI debe correr `manual-presence.test.ts`, `webhook-checkin.test.ts` y `especial-consumption.test.ts` (toca `removeCheckIn`/`coachCheckIn`). Riesgos de test: el 409 se asserta sobre `JSON.stringify(body)` (no se verifico el formato exacto de `handleServiceError`), y el test de no-show usa una reserva de hace 2 dias via `coachCheckIn` retroactivo (la ruta lo permite segun el comentario del servicio).
- Un socio ya validado por Wellhub el mismo dia que el staff intenta marcarlo a mano recibe el error generico "El miembro ya tiene asistencia registrada en esta fecha" (guarda de lado Wellhub), sin mensaje especifico.
- Los tests nuevos no estan cubiertos por `tsc`; un error de tipos solo aparece al correr vitest. Prettier no se pudo confirmar.

## Self-Check: PASSED

- `de4327137`, `4af9ac651`: FOUND
- `source: "wellhub_manual"` en attendance/service.ts, `isWellhubBookingSource(` usado, mensaje 409 presente, `wellhub_manual` en wellhub/service.ts
- 7 `it(` en manual-presence.test.ts; sin ids de usuario hardcodeados
