---
phase: 204-usuarios-wellhub
plan: 02
subsystem: api
tags: [wellhub, attendance, no-show, qr, tenancy, tests]
requires: ["204-01"]
provides:
  - "shared/wellhub-sources.ts: constantes + fragmentos SQL NULL-safe para excluir/aislar Wellhub"
  - "test/fixtures/wellhub-personas.ts: personas (visitante, ex-alumno, socio activo) + helpers de filas y webhook"
  - "D-18 sitios #1-#4 corregidos (no-show, QR bookingsInRange, guardas diarias, conteo semanal)"
affects: [204-03, 204-04, 204-06, 204-08]
key-files:
  created:
    - el-templo-api/src/modules/shared/wellhub-sources.ts
    - el-templo-api/test/fixtures/wellhub-personas.ts
    - el-templo-api/test/wellhub/plan-separation-attendance.test.ts
  modified:
    - el-templo-api/src/jobs/mark-no-shows.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/test/wellhub/webhook-checkin.test.ts
metrics:
  tasks: 2
  files: 6
  completed: 2026-10-27
---

# Phase 204 Plan 02: Helper Wellhub + fugas de asistencia Summary

Helper unico `wellhub-sources.ts` (D-27) y fixture de personas, mas el arreglo de las cuatro fugas de asistencia de Wellhub hacia el plan del socio (D-18 #1-#4). Nada se ejecuto localmente (sin node_modules): la verificacion fue por grep y lectura de codigo.

## Commits

- `de8a2a198` feat(204-02): helper wellhub-sources NULL-safe + fixture de personas Wellhub (Task 1)
- `e347ad7c4` fix(204-02): la asistencia Wellhub no toca el plan del socio (D-18 #1-#4) (Task 2)

## Lo hecho

- `wellhub-sources.ts`: `WELLHUB_BOOKING_SOURCE`, `WELLHUB_ATTENDANCE_SOURCES` (`wellhub` + `wellhub_manual`), predicados JS NULL-safe y 8 fragmentos SQL (4 Drizzle + 4 con alias cerrado `b|bk|bookings` / `a|att|attendance`), cada uno con comentario `tenant-safe`. La lista del IN se arma desde la constante (parametros, una sola fuente de valores).
- `mark-no-shows.ts`: el select trae `bookings.source`; todas las reservas vencidas siguen pasando a `no_show` (el reporte Wellhub las necesita, D-16) pero las Wellhub se saltan al armar `memberCounts`. No hay otro consumo por no-show (creditos, penalidades) en ese archivo.
- `attendance/service.ts`: `notWellhubBookingSql()` en `bookingsInRange`; `notWellhubAttendanceSql()` en la guarda diaria del fast path, en la de dentro de la transaccion y en `countWeeklyAttendance`. No se toco `coachCheckIn`/`removeCheckIn`/`getSlotAttendance` (planes 04 y 06).
- `webhook-checkin.test.ts`: helpers movidos al fixture con los nombres nuevos (`signWellhub`, `postWellhubWebhook`, `WELLHUB_TEST_SECRET`, `WELLHUB_WEBHOOK_URL`), sin cambio de comportamiento.
- Fixture: `createWellhubVisitor`, `createWellhubExAlumno`, `createWellhubSocioActivo`, `insertBooking`, `insertAttendance`, `insertActivityWithSchedule`, `insertWellhubSlot`, `insertWellhubBookingRow`, `getBranchTimezone`/`branchToday`/`nowHHMMInTz`, `uniqueGympassId` y los helpers de webhook. Todo insert usa `tenantValues(TEMPLO_CTX, ...)`.
- `plan-separation-attendance.test.ts`: los 6 `it` pedidos mas un control extra (una asistencia propia SI consume el limite semanal), 7 en total.

## Deviations from Plan

- **[Extra] Test de control semanal.** Agregue un 7mo `it` ("una asistencia propia de la semana SI consume el limite semanal") para probar que el test del limite no pasa por azar. No contradice los criterios (piden >= 6).
- **[Decision] Test semanal aislado del guard diario.** Las visitas Wellhub del test semanal se insertan con `checkedInAt` = lunes 12:00Z de la semana (via `getWeekRange`) en vez de hoy, para que el guard diario no enmascare al conteo semanal. Un lunes coinciden con hoy y el test igual es valido (pasa solo con ambos arreglos).
- **[Decision] Clase del QR sembrada a la hora actual de la sede** (`nowHHMMInTz`) en lugar de fake timers con fecha fija, siguiendo la regla de fechas relativas. Cerca de un cambio de minuto/medianoche la ventana de +-20 min lo absorbe.
- Co-Authored-By con `Claude Sonnet 5.5` (modelo real), como en el plan 01.

## Bugs / observaciones no anticipadas

- La guarda diaria del fast path compara `DATE(attendance.checked_in_at) = todayStr` (tz del servidor MySQL) mientras la de la transaccion usa `session_date`: pre-existente, no se toco, pero cerca de medianoche pueden discrepar.
- `getWeekRange` es UTC y el conteo semanal usa `DATE(checked_in_at)`: tampoco se toco.
- Los tests nuevos y el fixture NO estan cubiertos por `tsc` (`tsconfig` solo incluye `src/**`) ni hay eslint en la API, asi que un error de tipos en tests solo aparece al correr vitest en CI.
- Prettier: los commits pasaron el hook sin errores, pero sin node_modules no pude confirmar que haya reformateado los archivos nuevos (lineas largas posibles).

## Known Stubs

Ninguno.

## Dudas para Franco

- `insertWellhubSlot`/`insertWellhubBookingRow` quedaron creados "por las dudas" para los planes 03-11 pero ningun test de este plan los usa: si algun plan posterior necesita otra forma (p.ej. slot ya existente), hay que ajustarlos.
- `createWellhubExAlumno` ignora `adminToken` (parametro `_adminToken`, mantenido por la firma pedida en el plan) porque inserta la suscripcion vencida directo.
- CI debe correr `plan-separation-attendance.test.ts` y `webhook-checkin.test.ts`: nada se ejecuto localmente. Si el assert del mensaje "limite semanal" falla, revisar el texto en `attendance/service.ts`.

## Self-Check: PASSED

- wellhub-sources.ts, wellhub-personas.ts, plan-separation-attendance.test.ts: FOUND
- Commits de8a2a198, e347ad7c4: FOUND
- `grep -rn "ne(schema.bookings.source" el-templo-api/src`: vacio; `tenant-safe` x8; 7 `it(`
