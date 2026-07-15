---
phase: 161-n-cleo-actividades-gateadas-pase-mensual-y-enforcement
plan: 03
subsystem: attendance
tags: [routing, especial-pass, class-consumption, no-shows, gate-02]
requires:
  - pickSubscriptionForActivity (Plan 01)
  - activities.is_special (Plan 01)
provides:
  - consumo de clases ruteado por actividad en los 4 puntos de attendance
  - decremento de no-shows ruteado por actividad (mark-no-shows)
  - cobertura de integración GATE-02 (especial-consumption.test.ts)
affects:
  - el-templo-api/src/modules/attendance/service.ts
  - el-templo-api/src/jobs/mark-no-shows.ts
tech-stack:
  added: []
  patterns:
    - Routing de sub por actividad vía pickSubscriptionForActivity (nunca el singular)
    - Job instancia SubscriptionService completo (patrón auto-resume-pauses) para rutear
    - Resolución de is_special server-side por scheduleId→activity (nunca input del cliente)
key-files:
  created:
    - el-templo-api/test/attendance/especial-consumption.test.ts
  modified:
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/jobs/mark-no-shows.ts
decisions:
  - "checkIn QR: bookings query up-front para resolver isSpecial, pero el throw 'sin reserva' se mantiene en su posición original (preserva el orden de errores existente)"
  - "forceCheckIn (scheduleId null): rutea a sub NO-especial (pick(false)) — sin contexto de actividad, comportamiento previo intacto"
  - "mark-no-shows agrupa por (member, isSpecial) y decrementa cada bucket en su sub correcta"
metrics:
  duration: ~30min
  completed: 2026-07-14
requirements: [GATE-02]
---

# Phase 161 Plan 03: Consumo de clases ruteado por actividad (GATE-02) Summary

Los 4 puntos de decremento de `attendance/service.ts` (check-in QR, force check-in, coach check-in, undo) y el job `mark-no-shows` ahora eligen la suscripción a decrementar con `pickSubscriptionForActivity(userId, isSpecial)` en lugar del singular `getMemberSubscription`: asistir a una actividad especial descuenta del pase y a una regular descuenta del presencial, sin cruces entre budgets.

## What Was Built

**Task 1 — Routing en los 4 puntos de attendance** (`a84ab837` + fix `04a312bc`):

- **checkIn (QR):** el query `bookingsInRange` (que ya joinea `activities`) ahora trae `activities.is_special`; `isSpecialActivity` se resuelve del booking que matchea la ventana de ±20 min y se pasa a `pickSubscriptionForActivity`. La sub elegida rige el pre-check de budget **y** el decremento dentro de la tx.
- **forceCheckIn:** `scheduleId` es null (sin contexto de actividad), así que rutea a la sub NO-especial vía `pick(memberId, false)` — comportamiento previo intacto (`pick(false)` ≡ el singular para socios sin pase).
- **coachCheckIn:** el query del schedule ahora joinea `activities` para traer `is_special`; la sub para warnings y decremento sale de `pick(memberId, schedule.isSpecial)`.
- **removeCheckIn (undo):** helper privado `isSpecialSchedule(scheduleId)` (join schedules→activities; false si null) resuelve la actividad del registro borrado y `pick(...)` restaura +1 a la sub correcta.

**Task 2 — Routing en el job de no-shows** (`7cf45ab7`):

- `toMark` resuelve `is_special` por `scheduleId` (join a `activities`).
- Los no-shows se agrupan por `(memberId, isSpecial)` en vez de solo por member; cada bucket decrementa su sub correcta.
- El job instancia un `SubscriptionService` completo (factory `buildSubscriptionService`, mismo patrón que `auto-resume-pauses.ts`: Aura/Balance/CashRegister/Transaction/Enrollment) y usa `pickSubscriptionForActivity` en lugar de la query cruda active-first que cruzaría pase↔presencial. Guard `classesRemaining > 0` agregado al UPDATE.

**Task 3 — Tests de integración GATE-02** (`46c46859`):

- `test/attendance/especial-consumption.test.ts` (4 casos, todos verdes): (1) check-in especial baja el pase y **NO** el presencial, (2) check-in regular baja el presencial y no el pase, (3) undo del especial restaura el pase a 2, (4) no-show sobre especial (job `runMarkNoShows`) baja el pase, presencial intacto. Usa el flujo coach check-in (toma `scheduleId` directo, sin la ventana de ±20 min del QR) y seedea el pase vía Drizzle (mismo shape que la migración 0179), igual que `especial-pass.test.ts`.

## Verification

- `npx tsc --noEmit` verde tras cada tarea.
- `npx vitest run test/attendance/especial-consumption.test.ts`: 4/4 verde.
- No-regresión: `test/attendance/attendance.test.ts` 16/16 verde tras el fix de orden.
- Acceptance: `pickSubscriptionForActivity` ×4 en attendance/service.ts, `getMemberSubscription(` = 0 en los puntos de decremento; `pickSubscriptionForActivity` presente en mark-no-shows.ts; `is_special`/`isSpecial` matchea la resolución en ambos archivos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preservar el orden de validación en el check-in QR**

- **Found during:** Task 1 (verificación de no-regresión con `attendance.test.ts`).
- **Issue:** El reorder inicial del path QR adelantó el throw "No tenes una clase reservada" antes de los checks de suscripción/budget, rompiendo 5 tests que esperan el error de suscripción/"clases del periodo" primero (esos tests no crean booking).
- **Fix:** El query de `bookingsInRange` se resuelve up-front (necesario para conocer `isSpecial` antes de elegir la sub para el pre-check de budget), pero el `if (!matchingBooking) throw` volvió a su posición original — después de sub/branch/weekly/budget/one-per-day. Con esto la prioridad de errores queda idéntica a la original y el gating sigue correcto.
- **Files modified:** `el-templo-api/src/modules/attendance/service.ts`
- **Commit:** `04a312bc`

**Nota (no es desviación):** el plan enumeraba 4 puntos por número de línea (:89/:412/:659/:772). El punto :412 resultó ser `forceCheckIn`, que tiene `scheduleId: null` (sin actividad asociada) — se ruteó defensivamente a la sub NO-especial (`pick(false)`), preservando el comportamiento previo, como corresponde a un override manual sin contexto de clase.

## Known Stubs

Ninguno. Los 4 puntos + el job rutean el consumo real y están ejercitados por tests de integración contra MySQL real.

## Threat Flags

Ninguno nuevo. Las mitigaciones del threat register (T-161-06 tampering: resolver `is_special` server-side por scheduleId→activity, nunca input del cliente; T-161-07 repudiation: restaurar/decrementar sobre la sub elegida con guard `> 0`) están implementadas y cubiertas por el test (caso 1 asierta que el presencial no baja tras un check-in a especial).

## Self-Check: PASSED

- Archivo creado: `test/attendance/especial-consumption.test.ts` FOUND.
- Archivos modificados: `attendance/service.ts`, `jobs/mark-no-shows.ts` FOUND.
- Commits `a84ab837`, `7cf45ab7`, `46c46859`, `04a312bc` FOUND en git log.
