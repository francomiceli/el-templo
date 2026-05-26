---
phase: 117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico
plan: 03
subsystem: analytics
tags: [analytics, attendance, unique-members, check-in-adoption, scope, tdd]
requires:
  - "analytics/scope.ts::applyScope (Plan 01)"
provides:
  - "analytics/attendance-metrics-service.ts::AttendanceMetricsService — uniqueMembers 7/14/30 + checkInAdoptionByBranch"
  - "GET /api/admin/analytics/attendance/unique-members"
  - "GET /api/admin/analytics/attendance/checkin-adoption"
  - "types UniqueMembersMetric + CheckInAdoptionRow"
affects:
  - el-templo-admin (Asistencias tab — frontend en Plan 05 consume los nuevos endpoints)
tech-stack:
  added: []
  patterns:
    - "Domain service nuevo por feature/operativo (D-09) en vez de tocar el monolito service.ts (split = v4.9)"
    - "COUNT(DISTINCT member_id) por ventana de fecha half-open (preserva índice, D-08)"
    - "Ratio de adopción vía LEFT JOIN attendance ON (member+schedule+date) — attendance no tiene booking_id FK"
    - "applyScope reutilizado en service nuevo (branchColumn = attendance.branchId / schedules.branchId)"
key-files:
  created:
    - el-templo-api/src/modules/analytics/attendance-metrics-service.ts
    - el-templo-api/test/analytics/attendance-metrics.test.ts
  modified:
    - el-templo-api/src/modules/analytics/types.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/analytics/schemas.ts
decisions: [D-09, D-11, D-13, D-17, D-18, D-04, D-08]
metrics:
  duration: ~30min
  completed: 2026-05-26
---

# Phase 117 Plan 03: Métricas de asistencia (únicos + ratio check-in) Summary

Nuevo `AttendanceMetricsService` que expone miembros únicos en ventanas 7/14/30
días (D-11) y ratio de adopción de check-in por sede (D-13 Parte B), con scope
branch/país reutilizando `applyScope`, más los dos endpoints GET que consumirá la
tab de Asistencias del admin (frontend en Plan 05). NO se tocó el monolito
`service.ts` (D-09 — el split es v4.9).

## What Was Built

- **`attendance-metrics-service.ts`** (nuevo, DI `db+log` como AnalyticsService /
  SegmentationService):
  - `uniqueMembers(filters)`: `COUNT(DISTINCT member_id)` sobre `attendance` para
    cada ventana (7/14/30 días hacia atrás desde "ahora"), con rango half-open
    `checked_in_at >= now-Ndías AND checked_in_at < now+1s` (D-08, preserva el
    índice `(member_id, checked_in_at)`). `applyScope` sobre `attendance.branchId`
    para branchId/country (D-17). Devuelve `{ last7, last14, last30 }`.
  - `checkInAdoptionByBranch(filters)`: por sede, `ratio = bookings 'confirmado'
con check-in registrado ÷ total 'confirmado'`. `bookings` no tiene branch_id
    → la sede sale de `schedules.branchId`. La correlación booking↔check-in es
    LEFT JOIN `attendance` ON (member + schedule + date), porque `attendance` no
    tiene `booking_id` FK. Enum `'confirmado'` (D-04). `applyScope` sobre
    `schedules.branchId`. Devuelve `{ branchId, branchName, confirmados,
conCheckin, ratio }` con `ratio` en 0..1 (el warning <50% es frontend, Plan
    05). Guard de divide-by-zero: `ratio = 0` (no NaN) si confirmados>0 y
    conCheckin=0; sedes con 0 confirmados no aparecen.
- **Tipos** (`types.ts`): `UniqueMembersMetric`, `CheckInAdoptionRow`.
- **Endpoints** (`routes.ts`): `GET /attendance/unique-members` y
  `GET /attendance/checkin-adoption` bajo el mismo plugin (heredan el `onRequest`
  hook con ADMIN_ROLES + attachCountryScope), cada uno con
  `requireBranchAccess({ from: "query.branchId", optional: true })` y mapeo de
  filters (`branchId` + `request.scope.country ?? undefined` + dateFrom/dateTo) +
  `handleServiceError`.
- **Schemas Fastify** (`schemas.ts`): `uniqueMembersSchema`,
  `checkInAdoptionSchema` (array de filas por sede).
- **Tests** (`attendance-metrics.test.ts`, MySQL real, reloj real): únicos por
  ventana incl. dedup de 2 check-ins del mismo miembro y exclusión a 40 días;
  scope por branchId; ratio 0.25 vs 1.0; ratio 0 sin NaN; bookings no-confirmado
  ignorados; scope; y tests de ruta (401/403, owner global, admin AR denegado en
  sede ES por scope cross-country — T-117-01). 13/13 verdes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug en el plan de test] Scope test usa admin cross-country, no coach**

- **Found during:** Task 2
- **Issue:** El plan pedía un test "coach de sede X no ve datos de sede Y". Pero
  el módulo analytics está gateado a `ADMIN_ROLES = ["admin","owner"]` — un coach
  recibe 403 en el `onRequest` hook ANTES de llegar al scope de sede (mensaje
  "Acceso de administrador requerido"). Probar con coach habría verificado el
  guard de rol, no el scope de sede pedido por T-117-01.
- **Fix:** El test de scope usa un **admin AR** (su país resuelve de su sede AR vía
  `createStaffUser`) que es denegado (403, `requireBranchAccess` → `canAccessBranch`
  Rule 3 cross-country) al consultar una **sede ES**, y permitido (200) en una sede
  AR. Este es el mecanismo real de no-fuga entre sedes/países para los roles que sí
  acceden a analytics. Se agregó una sede ES (`TESTES`) al fixture.
- **Files modified:** test/analytics/attendance-metrics.test.ts
- **Commit:** 1f8dcfa9

### Pre-existing observation (no cambio)

El test existente `analytics.test.ts:567` inserta `attendance` con `confirmedAt`
(campo inexistente — Drizzle lo ignora silenciosamente y `checked_in_at` toma su
default `NOW()`). No es de este plan; se dejó intacto (fuera de scope). Los nuevos
tests usan `checkedInAt` explícito (el campo real).

## Known Stubs

Ninguno. El warning visual <50% (D-13) es lógica de frontend (Plan 05),
documentado en el JSDoc del service y en el tipo — no es un stub de datos.

## Threat Flags

Ninguno nuevo. Los endpoints respetan el modelo de scope existente
(ADMIN_ROLES + attachCountryScope + requireBranchAccess); applyScope aplicado en
toda query (grep `applyScope` >= 2; T-117-01 mitigado y verificado por test de
ruta cross-country).

## Self-Check: PASSED

- Archivos creados: attendance-metrics-service.ts, attendance-metrics.test.ts
  (FOUND); types.ts/routes.ts/schemas.ts modificados (FOUND).
- Commits: 2647023f (Task 1), 1f8dcfa9 (Task 2) — verificados en git log.
- `pnpm tsc --noEmit` limpio; `pnpm vitest run test/analytics/attendance-metrics.test.ts`
  13/13 verde; suite analytics.test.ts 25/25 verde (sin regresión).
- Grep gates: `COUNT(DISTINCT` en service (>=1); `applyScope` en service (>=2);
  enum `'confirmado'` presente y sin typo `'confirmed'` runtime;
  `AttendanceMetricsService` en routes.ts (2); ambos endpoints bajo el onRequest hook.
