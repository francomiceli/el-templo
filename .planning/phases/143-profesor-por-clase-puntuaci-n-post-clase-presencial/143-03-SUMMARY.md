---
phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial
plan: 03
subsystem: attendance
tags: [attendance, coach, qr, branch-access, user-branches]

# Dependency graph
requires:
  - phase: 143-01
    provides: schema base de la fase (no usado directamente aquí; este plan reusa user_branches/attendance preexistentes)
  - phase: 110-admin-multisede
    provides: user_branches junction (coach branch scope) — fuente de verdad para la validación del self-scan
  - phase: 61-attendance-scheduling
    provides: attendance append-log + checkIn flow del miembro reutilizado
provides:
  - "checkIn distingue coach vs miembro: si el que escanea es coach, deriva a coachSelfScan (D-Q2)"
  - "coachSelfScan: registra asistencia del coach validada contra user_branches, sin enforcement de miembro ni AURA, con one-per-day"
affects: [attendance-service, coach-app-checkin-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bifurcación temprana por rol dentro de checkIn tras resolver tz/branch (coach path vs member path)"
    - "Validación de pertenencia coach↔sucursal vía user_branches antes de registrar attendance (espejo de canAccessBranch Rule 4)"

key-files:
  created:
    - el-templo-api/test/attendance/coach-self-scan.test.ts
  modified:
    - el-templo-api/src/modules/attendance/service.ts

key-decisions:
  - "Coach detectado por select de users.role tras resolver branch; si role==='coach' → coachSelfScan, sino flujo de miembro intacto (sin regresión)"
  - "coachSelfScan NO otorga AURA (asistencia operativa del coach, no crédito de programa de miembro) — mantiene limpio el balance del coach"
  - "coachSelfScan saltea TODO el enforcement de miembro (suscripción/plan multiBranch/weekly/budget/booking) — esas reglas no aplican al coach"
  - "One-per-day guard reusado dentro de transacción comparando sessionDate (no DATE(checkedInAt)), consistente con el path autoritativo del miembro"
  - "Independencia D-Q1: el self-scan NO toca coach_ratings ni class_coach_assignments (la atribución del rating sale del roster)"

patterns-established:
  - "coachSelfScan: rama de check-in del coach validada contra user_branches, sin AURA, one-per-day"

requirements-completed: [PROF-SELFSCAN]

# Metrics
duration: ~8min
completed: 2026-06-24
---

# Phase 143 Plan 03: QR self-scan del profe Summary

**Un coach registra su propia asistencia escaneando el QR de clase con la app de alumno (flujo de check-in existente), validado contra su(s) sucursal(es) asignada(s) en `user_branches`, sin AURA ni enforcement de miembro y con guard one-per-day; independiente de la atribución del rating (que sale del roster, D-Q1).**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `checkIn(memberId, qrToken)` agrega una bifurcación temprana por rol: tras `validateQrToken` y resolución de tz/branch, hace `select users.role`; si role === 'coach' deriva a `coachSelfScan`, sino sigue el path de miembro sin cambios (no regresión — `classesPerWeek`/`matchingBooking` count = 11, sin disminución).
- `coachSelfScan(coachId, branchId, tz)`: valida que `branchId` del QR esté en `user_branches` del coach (T-143-10: elevación de privilegio); si no, `BadRequestError("No estas asignado a esta sede")`. Registra attendance `{ memberId: coachId, branchId, sessionDate, status:'confirmado', source:'qr' }` dentro de una transacción con guard one-per-day por `sessionDate` (T-143-12). Sin AURA, sin reglas de miembro.
- Tests en `test/attendance/coach-self-scan.test.ts` (3 casos): coach en sucursal asignada (201 + fila), coach en sucursal no asignada (error + sin fila), one-per-day (segundo intento rechazado, solo persiste el primero).

## Task Commits

Each task was committed atomically:

1. **Task 1: Rama coach en attendance.checkIn validada contra user_branches** - `b4a64df0` (feat)
2. **Task 2: Tests del coach self-scan** - `3f6e7e4f` (test)

## Files Created/Modified

- `el-templo-api/src/modules/attendance/service.ts` - Bifurcación por rol en `checkIn` + método privado `coachSelfScan` (validación user_branches, sin AURA, one-per-day)
- `el-templo-api/test/attendance/coach-self-scan.test.ts` - 3 tests de integración del self-scan validado y bloqueo cross-sucursal

## Decisions Made

- El coach se detecta con un `select users.role` tras resolver el branch; el path del miembro queda exactamente igual (no regresión verificada por grep: count de `classesPerWeek|matchingBooking` = 11).
- `coachSelfScan` NO otorga AURA (asistencia operativa, no crédito de programa) ni decrementa budget ni toca bookings — esas reglas son del miembro.
- One-per-day reusa el patrón autoritativo: comparación por `sessionDate` dentro de la transacción.
- Independencia D-Q1 confirmada por grep: el service NO referencia `coachRatings` ni `classCoachAssignments`.

## Deviations from Plan

None - plan executed exactly as written.

Nota: el plan referenciaba `pnpm typecheck` pero el script real es `tsc --noEmit` (no existe script `typecheck`). Se usó `pnpm exec tsc --noEmit` (EXIT 0), igual que 143-01. No es desviación de implementación, solo del comando de verificación.

## Issues Encountered

None.

## User Setup Required

None - sin configuración de servicios externos. No hay nueva UI (reusa `CheckInPage` tal cual en la app de alumno).

## Next Phase Readiness

- El self-scan del coach queda como dato de asistencia operativa independiente. Las olas/planes que muestren el profe dictante o el reporte del owner se apoyan en el roster (143-01/143-02), no en este dato.
- Sin blockers.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/attendance/service.ts (coachSelfScan + rama coach)
- FOUND: el-templo-api/test/attendance/coach-self-scan.test.ts
- FOUND: commit b4a64df0
- FOUND: commit 3f6e7e4f

---

_Phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial_
_Completed: 2026-06-24_
