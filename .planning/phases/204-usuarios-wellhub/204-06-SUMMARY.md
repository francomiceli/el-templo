---
phase: 204-usuarios-wellhub
plan: 06
subsystem: api
tags: [wellhub, horarios, roster, response-schema, tests]
requires: ["204-05"]
provides:
  - "GET /api/admin/attendance/slot/:scheduleId/:date devuelve isWellhub por alumno (reserva o visita Wellhub, antes del check-in)"
  - "GET /api/admin/scheduling/schedules/:scheduleId/detail devuelve source por reserva ('wellhub' o null)"
  - "AttendanceSource y response schemas de asistencia ampliados a qr|manual|wellhub|wellhub_manual"
affects: [204-13]
key-files:
  modified:
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/attendance/schemas.ts
    - el-templo-api/src/modules/attendance/types.ts
    - el-templo-api/src/modules/scheduling/types.ts
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/reports/types.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/schemas.ts
  created:
    - el-templo-api/test/wellhub/horarios-roster.test.ts
metrics:
  tasks: 2
  files: 10
  completed: 2026-10-27
---

# Phase 204 Plan 06: Origen Wellhub en los rosters de Horarios Summary

Los dos rosters de Horarios exponen de donde vino cada reserva (D-10). Nada se corrio localmente (sin node_modules): verificacion por grep y lectura de codigo.

## Commits

- `35c79daea` feat(204-06): origen de la reserva Wellhub en los rosters de Horarios (D-10) (Task 1)
- `1cce32bea` test(204-06): rosters de Horarios marcan las reservas Wellhub (D-10) (Task 2)

## Lo hecho

- `attendance/service.ts` `getSlotAttendance`: el select de reservas trae `bookingSource: schema.bookings.source`. Cada item del roster lleva `isWellhub`: arranca con `isWellhubBookingSource(bookingSource)`; al superponer la asistencia se hace OR con `isWellhubAttendanceSource(a.source)`; el walk-in (asistencia sin reserva) usa solo la asistencia. Marca la reserva/visita, no la persona.
- `attendance/schemas.ts`: `slotAttendanceItemSchema` declara `isWellhub: boolean` con el comentario de la fase. El enum de `attendanceRecordSchema.source` pasa a los 4 valores.
- `attendance/types.ts`: `AttendanceSource` = `qr | manual | wellhub | wellhub_manual`. En `service.ts` los tipos inline y los 3 casts (`mapAttendanceRow` y las dos asignaciones del roster) usan `AttendanceSource` (import de tipo agregado).
- `scheduling/types.ts`: `BookingRecord.source?: string | null` (opcional, ningun otro constructor se rompe). `getSlotDetail` selecciona `bookings.source` y lo mapea con `r.source ?? null`. `bookingRecordSchema` declara `source: ["string","null"]`, fuera de `required`.
- `test/wellhub/horarios-roster.test.ts`: 5 `it` via `app.inject` (visitante con reserva Wellhub antes del check-in, socio activo con reserva Wellhub, reservas propias con source NULL / 'admin' / asistencia qr, visita `wellhub_manual` con y sin reserva, detalle futuro con `source` 'wellhub' y null).

## Deviations from Plan

- **[Rule 2 - leccion plan 04] Ampliados tambien los tipos de `reports`.** El reporte de accesos (`reports/types.ts` `AccessReportRow.source`, el cast en `reports/service.ts` y el enum de respuesta de `accessReportSchema`) sigue el mismo patron `qr|manual` y ahora puede devolver filas `wellhub` / `wellhub_manual`. Se amplio SOLO la fila de respuesta; el filtro de querystring `source` (`AccessReportFilters`, enum de entrada) queda en `qr|manual`. Archivos fuera de `files_modified` del plan.
- **[Decision] `getBookingRecord` y my-bookings NO setean `source`.** El plan lo permitia solo si era una linea; ahi `BookingRecord` se arma sin el campo, asi que queda sin definir (el schema lo omite). Solo el roster del detalle futuro lo trae.
- Co-Authored-By con `Claude Sonnet 5.5`.

## Bugs / observaciones no anticipadas

- El enum de respuesta de `attendanceRecordSchema` (`qr|manual`) habria sido un problema latente para cualquier endpoint que devuelva una asistencia Wellhub (el enum no valida al serializar en fast-json-stringify, pero estaba desalineado con la DB). Corregido.
- `bookingRecordSchema` se comparte con muchas respuestas (admin add booking, my-bookings, etc.). Como `source` es opcional, las que no lo setean no lo emiten. Si alguna vez my-bookings lo setea, el socio vera el canal de su propia reserva (T-204-19, aceptado).

## Known Stubs

Ninguno. El render del chip en el admin llega en el plan 13.

## Dudas para Franco

- Los tests nuevos no se corrieron ni tipearon. Puntos de riesgo para CI: (1) el detalle futuro asume que `getSlotDetail` no valida que la fecha coincida con el `dayOfWeek` del horario (igual se siembra con el dia de semana correcto, evitando domingos); (2) `admin@test.com` accede a ambas rutas (la de detalle usa `requireScheduleBranchAccess`); (3) el item de roster de un alumno con reserva `confirmado` y asistencia se une por `memberId`, asi que sale una sola fila.
- Prettier no se pudo confirmar (el orquestador formatea al final).

## Self-Check: PASSED

- `35c79daea`, `1cce32bea`: FOUND
- `bookingSource: schema.bookings.source` y `isWellhub` en attendance/service.ts y schemas.ts; `source?: string | null` en scheduling/types.ts; `source: { type: ["string", "null"] }` en scheduling/schemas.ts
- 5 `it(` en horarios-roster.test.ts con `app.inject`; sin ids de usuario hardcodeados
