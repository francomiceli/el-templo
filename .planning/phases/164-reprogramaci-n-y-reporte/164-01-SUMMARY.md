---
phase: 164-reprogramaci-n-y-reporte
plan: 01
subsystem: scheduling
tags: [drizzle, mysql, trials, leads, scheduling, transaction, fastify]

# Dependency graph
requires:
  - phase: 163-03
    provides: "reset Perdido → en_seguimiento (source 'auto') en bookTrial — snippet reusado in-tx"
  - phase: 163-01
    provides: "users.lead_status_source column (mig 0182) + enum auto|manual"
provides:
  - "rescheduleTrial(input) transaccional: soft-cancel de la prueba vieja + reset del lead (source auto) + creación de la nueva en UNA db.transaction"
  - "rescheduleTrialSchema (params.bookingId + body {scheduleId,date,branchId}, additionalProperties:false, response 200 {bookingId})"
  - "POST /api/admin/scheduling/trials/:bookingId/reschedule (guard ALL_STAFF_ROLES heredado del hook)"
affects: [164-02, trial-sessions-report]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cancel-old + reset-lead + create-new en UNA db.transaction (rollback atómico); reactivate-or-insert respeta el UNIQUE (member_id, schedule_id, booking_date)"
    - "Reschedule NO corre pending-check: la vieja se cancela in-tx, así la regla una-prueba-por-vida nunca bloquea (D-01)"
    - "Waitlist promotion omitida: las pruebas (is_trial=1) no ocupan capacidad → promoción no-op, se mantiene single-tx (PATTERNS opción a)"

key-files:
  created:
    - el-templo-api/test/scheduling/reschedule-trial.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/trials-service.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/routes.ts

key-decisions:
  - "El reset del lead se copió verbatim de bookTrial (D-02): mismo tx.update(users).set({leadStatus:'en_seguimiento', leadStatusSource:'auto'}) dentro de la tx, sin duplicar lógica en otro sitio"
  - "Validación de fecha: paridad con bookTrial (no re-valida ventana; confía en el slot) — Claude's Discretion elegida a favor de la forma más liviana, sin validateTrialBookingDate"
  - "Doble guard de coherencia de sede: input.branchId vs schedule.branchId (CR-01 de reserveTrialSelfService) + userRow.branchId vs schedule.branchId (bookTrial); cualquiera de los dos da 409"
  - "Guard extra 409 si la booking apuntada no es is_trial — reschedule es una acción trial-only"

requirements-completed: [REPRO-01]

# Metrics
duration: ~15min
completed: 2026-07-16
---

# Phase 164 Plan 01: Backend transaccional de "Reprogramar" prueba — Summary

**`rescheduleTrial` cablea la acción admin "Reprogramar" de una sesión de prueba como operación atómica: en UNA `db.transaction` cancela la booking vieja, resetea el lead a En seguimiento (source `auto`, reusando el snippet de 163) y crea la nueva con la rama reactivate-or-insert de `bookTrial` — expuesto en `POST /trials/:bookingId/reschedule` con guard `ALL_STAFF_ROLES` heredado, y cubierto por 5 tests de integración verdes.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **`rescheduleTrial` (REPRO-01, D-01/D-02):** un método nuevo en `TrialService` que carga la booking vieja (→ `memberId`; 404 si no existe, 409 si no es trial), valida el nuevo schedule (404) y la coherencia de sede (409), y en UNA tx hace (a) soft-cancel de la vieja (`status='cancelado', cancelledAt, waitlistPosition:null`, semántica de `adminRemoveBooking`), (b) reset del lead `en_seguimiento`/`auto` (snippet verbatim de `bookTrial`, D-02), (c) creación de la nueva con la rama reactivate-or-insert que respeta el UNIQUE `(member_id, schedule_id, booking_date)`.
- **`rescheduleTrialSchema`:** `params.bookingId` (de `adminRemoveBookingSchema`) + body `{scheduleId, date, branchId}` con `additionalProperties:false` y pattern de fecha (`date`, no `bookingDate`, para matchear el body de D-01) + `response.200 = {bookingId}` / 400/404/409 `errorSchema`.
- **Ruta `POST /trials/:bookingId/reschedule`:** handler que llama `trialService.rescheduleTrial` y devuelve `reply.code(200)` (mutación de un lead existente, no 201). Error path vía `handleServiceError(...)`, sin try/catch hand-rolled. Sin guard per-route — el hook `onRequest` del plugin ya aplica `ALL_STAFF_ROLES` + `attachCountryScope`.
- **Tests:** `test/scheduling/reschedule-trial.test.ts` con 5 casos (el 3 se dividió en 404 + cross-branch), 5/5 verde contra `eltemplo_test`.

## Task Commits

1. **Task 1: rescheduleTrial (service + schema + route)** — `70cadf77` (feat)
2. **Task 2: tests de integración de reschedule** — `47eb342b` (test)

**Plan metadata:** committed por separado con SUMMARY.md + STATE.md + ROADMAP.md.

## Files Created/Modified

- `el-templo-api/src/modules/scheduling/trials-service.ts` — `RescheduleTrialInput` + `rescheduleTrial(input)` transaccional (reusa imports/errores/reset de bookTrial).
- `el-templo-api/src/modules/scheduling/schemas.ts` — `rescheduleTrialSchema`.
- `el-templo-api/src/modules/scheduling/routes.ts` — import del schema + ruta `POST /trials/:bookingId/reschedule`.
- `el-templo-api/test/scheduling/reschedule-trial.test.ts` — 5 casos de integración (NEW).

## Decisions Made

- **Reset copiado verbatim (D-02).** El `tx.update(users).set({ leadStatus:'en_seguimiento', leadStatusSource:'auto' })` es idéntico al de `bookTrial`, ubicado dentro de la tx antes de la rama insert/reactivate — cubre ambos caminos de retorno con un único write.
- **Validación de fecha liviana (paridad con bookTrial).** `bookTrial` no re-valida la ventana de fecha (confía en el slot); se eligió esa forma (Claude's Discretion) en vez de `validateTrialBookingDate`, manteniendo el reschedule single-tx y simple.
- **Doble coherencia de sede.** Se aplican los dos guards: `schedule.branchId !== input.branchId` (CR-01) y `userRow.branchId !== schedule.branchId` (bookTrial). El test cross-branch los ejercita (409).
- **Guard is_trial.** Si el `bookingId` apunta a una reserva no-trial → 409 (reschedule es trial-only), evitando mover bookings normales por esta ruta.
- **Waitlist promotion omitida (PATTERNS opción a).** Las pruebas no ocupan capacidad, así que promover la waitlist sobre una prueba cancelada es no-op; omitirlo mantiene la operación en una sola tx sin transacciones anidadas.

## Deviations from Plan

None - plan ejecutado exactamente como fue escrito. El caso (3) del plan (404 + cross-branch) se implementó como dos `it(...)` separados para aislar cada aserción — mismo alcance, mayor claridad.

## Issues Encountered

- El suite completo NO se corrió (regla del repo: los tests corren en CI). Sólo `test/scheduling/reschedule-trial.test.ts` (5/5 verde, ~86s) + `tsc --noEmit` limpio. Sin flakiness (una sola corrida).

## Threat Flags

None nuevo. T-164-01 (elevation) mitigado: la ruta vive dentro del plugin con el hook `onRequest` `ALL_STAFF_ROLES` + `attachCountryScope`, sin guard más laxo. T-164-02 (info disclosure cross-branch) mitigado: coherencia sede↔schedule → 409, cubierto por el test cross-branch. T-164-03 (tampering del body) mitigado: `additionalProperties:false` + tipos/pattern, AJV valida antes del handler. T-164-04 (fallo parcial) mitigado: cancel-old + reset + create-new en UNA `db.transaction`, verificado por el test (1). T-164-SC: sin dependencias nuevas.

## User Setup Required

None. La UI de "Reprogramar" (D-03) y el reporte (D-04/D-06) los monta el Plan 164-02 sobre este backend.

## Next Phase Readiness

- 164-02 (UI admin + reporte) puede montarse: `rescheduleTrial` + la ruta + el schema ya están, y el reset de estado queda garantizado por la tx.
- No blockers.

## Self-Check: PASSED

Archivos presentes (trials-service.ts, schemas.ts, routes.ts modificados; test/scheduling/reschedule-trial.test.ts creado); commits `70cadf77`, `47eb342b` en git log; `grep rescheduleTrial routes.ts` muestra la ruta con `handleServiceError`.

---
*Phase: 164-reprogramaci-n-y-reporte*
*Completed: 2026-07-16*
