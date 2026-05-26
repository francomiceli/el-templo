---
phase: 117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico
plan: 04
subsystem: analytics
tags: [analytics, engagement, segmentation, scope, pii, tdd]
requires:
  - "analytics/scope.ts::applyScope (Plan 01)"
  - "shared/active-member.ts::activeMemberExists (Plan 01)"
  - "segmentation/types.ts::MemberSegment (reuse, no redefine)"
  - "member_profiles.segment (segmentation module)"
provides:
  - "analytics/engagement-service.ts::EngagementService — countActiveBySegment + getEngagementNominalList"
  - "GET /api/admin/analytics/engagement"
  - "types SegmentCounts + EngagementMember"
affects:
  - el-templo-admin (Asistencias tab — frontend en Plan 05 consume el endpoint de engagement)
tech-stack:
  added: []
  patterns:
    - "Domain service nuevo por feature (D-09), reutiliza segmentation (NO recalcula segmentos)"
    - "Conteo de activos por segmento vía LEFT JOIN member_profiles + COALESCE(segment,'sinSegmento') + activeMemberExists"
    - "Lista nominal con planName por subquery correlacionada sobre la sub in-effect (sin fan-out)"
    - "applyScope reutilizado sobre users.branchId (corte de PII por sede, T-117-01/T-117-06)"
key-files:
  created:
    - el-templo-api/src/modules/analytics/engagement-service.ts
    - el-templo-api/test/analytics/engagement.test.ts
  modified:
    - el-templo-api/src/modules/analytics/types.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/analytics/schemas.ts
decisions: [D-09, D-12, D-17, D-18]
metrics:
  duration: ~20min
  completed: 2026-05-26
---

# Phase 117 Plan 04: EngagementService (conteo por segmento + worklist) Summary

Nuevo `EngagementService` que REUTILIZA el módulo de segmentación: lee
`member_profiles.segment` (6 segmentos ya calculados) y solo AGREGA — conteo de
miembros ACTIVOS por segmento (predicado canónico `activeMemberExists`) + lista
nominal de `en_riesgo`/`ghost` activos con teléfono/acción WhatsApp, todo con
scope branch/país (D-17). NO recalcula segmentos ni inventa umbrales (D-12). NO
toca el monolito `service.ts` (D-09 — el split es v4.9).

## What Was Built

- **`engagement-service.ts`** (nuevo, DI `db+log` como AnalyticsService /
  AttendanceMetricsService / SegmentationService):
  - `countActiveBySegment(filters)`: `LEFT JOIN users↔member_profiles`, filtra
    `role='member'` + `activeMemberExists(users.id)` (NUNCA `users.status`),
    agrupa por `COALESCE(member_profiles.segment, 'sinSegmento')`. Devuelve los 6
    segmentos canónicos (default 0) + bucket `sinSegmento` para activos sin
    segment calculado (perfil inexistente o nunca logueado desde que existe
    segmentación). `applyScope` sobre `users.branchId`. Un ghost NO-activo NO se
    cuenta.
  - `getEngagementNominalList(filters)`: `INNER JOIN member_profiles`, filtra
    `segment IN ('en_riesgo','ghost')` + activo, mismo shape que getAttentionList
    (`userId/firstName/lastName/planName/phone`) + `segment`. `planName` sale de
    una subquery correlacionada sobre la sub in-effect (mismo predicado que
    `activeMemberExists`, `ORDER BY end_date DESC LIMIT 1`) para evitar fan-out.
    Orden por urgencia (`ghost` antes que `en_riesgo`), luego por apellido.
    `applyScope` sobre `users.branchId` (T-117-01: sin fuga de PII entre sedes).
- **Tipos** (`types.ts`): `SegmentCounts` (6 segmentos + `sinSegmento`) y
  `EngagementMember` (segment `'en_riesgo'|'ghost'`, con `phone`).
- **Endpoint** (`routes.ts`): `GET /engagement` instancia `EngagementService` en
  el plugin (junto a AnalyticsService/AttendanceMetricsService), devuelve
  `{ counts, nominalList }` bajo el mismo `onRequest` hook (ADMIN_ROLES +
  attachCountryScope) + `requireBranchAccess({ from: "query.branchId",
optional: true })` + mapeo de filters (`branchId` + `request.scope.country ??
undefined`) + `handleServiceError`.
- **Schema Fastify** (`schemas.ts`): `engagementSchema` (objeto `counts` +
  array `nominalList`; phone declarado nullable).
- **Tests** (`engagement.test.ts`, MySQL real): conteo solo-activos por segmento
  (ghost no-activo excluido), bucket `sinSegmento` (null + sin perfil), all-zero,
  scope por branchId; listas nominales en_riesgo/ghost con phone/planName, scope
  sin fuga, lista vacía; rutas 401/403, owner global, admin AR denegado en sede
  ES (T-117-01/T-117-06). 11/11 verdes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug en el plan de test] Test de scope usa admin cross-country, no coach**

- **Found during:** Task 2
- **Issue:** El plan pedía "coach de sede X no ve member de sede Y". El módulo
  analytics está gateado a `ADMIN_ROLES = [admin, owner]` — un coach recibe 403
  en el `onRequest` hook ANTES de llegar al scope de sede. Mismo hallazgo que
  117-03.
- **Fix:** El test de PII por scope usa un admin AR (país resuelto de su sede AR)
  denegado (403, cross-country) al consultar una sede ES y permitido (200) en su
  país — el mecanismo real de no-fuga para los roles que sí acceden a analytics.
- **Files modified:** test/analytics/engagement.test.ts
- **Commit:** 50230489

### Decisión de diseño (documentada, D-12)

- **`sinSegmento` bucket:** activos con `member_profiles.segment` NULL (sin
  perfil o nunca logueado desde que existe segmentación) NO se descartan — se
  cuentan en `sinSegmento` para que los conteos por segmento reconcilien contra
  el total de activos. Documentado en el JSDoc del tipo y del método.

## Known Stubs

Ninguno. La priorización ghost+por-vencer (D-16) y el render del worklist son
Plan 05 (frontend) / Plan 05-backend — fuera de scope acá.

## Threat Flags

Ninguno nuevo. El endpoint hereda el guard (ADMIN_ROLES + attachCountryScope +
requireBranchAccess) y `applyScope` se aplica en ambos métodos (grep `applyScope`

> = 2 en el service). T-117-01 y T-117-06 mitigados y verificados por test de ruta
> cross-country (admin AR → 403 en sede ES) y por el test de scope del service.

## Self-Check: PASSED

- Archivos creados: engagement-service.ts, engagement.test.ts (FOUND);
  types.ts/routes.ts/schemas.ts modificados (FOUND).
- Commits: a4feedb8 (Task 1 service+types+test), 76f77d1e (refactor dead code),
  50230489 (Task 2 routes+schema) — verificados en git log.
- `pnpm tsc --noEmit` limpio (sin lint script en el paquete API — CI del API solo
  type-check+build+tests; Prettier corre vía lint-staged en el commit).
- `pnpm vitest run test/analytics/engagement.test.ts` 11/11 verde; suite
  analytics completa 49/49 verde (sin regresión).
- Grep gates: `memberProfiles.segment`=5 (>=1), `activeMemberExists`=6 (>=1),
  `applyScope`=6 (>=2), `mysqlEnum`=0 (no enum propio), `EngagementService` en
  routes=2 (>=1).
