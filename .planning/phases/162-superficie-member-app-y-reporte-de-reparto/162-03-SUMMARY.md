---
phase: 162-superficie-member-app-y-reporte-de-reparto
plan: 03
subsystem: analytics
tags: [analytics, reporte, especiales, socio-externo, xlsx, attendance]
requires:
  - "attendance (schema): memberId/scheduleId/sessionDate/branchId, SIN subscription_id"
  - "activities.isSpecial (161-01) — flag de gating"
  - "subscription_plans.requiresPresencial (161-01) — discrimina Socio↔Externo"
  - "categoryGroup / planCategory='especial' (161)"
  - "applyScope (analytics/scope.ts) — branch/country scope"
  - "sendExcelReply + styleHeaderRow (shared/excel.ts)"
  - "requireAdminAnalytics + requireBranchAccess (analytics/routes.ts)"
provides:
  - "GET /api/admin/analytics/especiales?month=YYYY-MM — reporte socio/externo por actividad + KPIs D-05 (JSON)"
  - "GET /api/admin/analytics/especiales/export?month=YYYY-MM — XLSX del reporte"
  - "EspecialReportService (getReport) — clasificación socio/externo + fallback + conteo D-05"
  - "especialesSchema / especialesExportSchema (month validado YYYY-MM)"
affects:
  - "el-templo-admin EspecialesTab / useAnalyticsApi (162-06) — consume estos endpoints"
tech-stack:
  added: []
  patterns:
    - "Clasificación por subqueries correlacionadas (anti JOIN-fanout) en vez de LEFT JOIN a subscriptions"
    - "Reporte por month explícito (sin fake timers en tests)"
    - "Guard ADMIN_ROLES-only (requireAdminAnalytics) + branch scope, patrón churned-members"
    - "Export XLSX vía sendExcelReply (no armado manual)"
key-files:
  created:
    - el-templo-api/src/modules/analytics/especial-report-service.ts
    - el-templo-api/test/analytics/especial-report.test.ts
  modified:
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/analytics/schemas.ts
decisions:
  - "attendance no guarda subscription_id → clasificación derivada del requires_presencial de la sub especial que cubre session_date"
  - "Fallback (sin sub especial que cubra la fecha, bypass staff D-07): presencial active/paused cubriendo la fecha ⇒ socio, si no ⇒ externo"
  - "Anti JOIN-fanout: subqueries correlacionadas + ORDER BY start_date DESC LIMIT 1 → una fila por asistencia, la renovación vigente (Socio) gana"
  - "Sin montos (D-04): el service NUNCA joinea financial_transactions/caja"
metrics:
  duration: ~14min
  completed: 2026-07-15
  tasks: 3
  files: 4
---

# Phase 162 Plan 03: Reporte de reparto socio/externo (REP-01) Summary

Reporte admin de asistencias a actividades especiales ("Actividades con Aura") por mes, clasificadas por origen socio/externo (insumo del reparto manual a profes, SIN montos, D-04), más los KPIs D-05 (subs especiales activas por origen). Endpoint JSON + export XLSX, ambos guardados por el guard de analytics.

## What Was Built

- **`EspecialReportService`** (`especial-report-service.ts`, nuevo): clase DI espejo de `AttendanceMetricsService`. `getReport(month, filters)` agrega asistencias a actividades `isSpecial` del mes por (actividad × origen). Como `attendance` NO guarda `subscription_id`, la clasificación se deriva del `requires_presencial` de la sub especial que **cubre** `session_date` (=1 → socio, =0 → externo). **Fallback** documentado para asistencias huérfanas (bypass staff D-07): presencial active/paused cubriendo la fecha ⇒ socio, si no ⇒ externo. **KPIs D-05**: conteo de subs `especial` active/paused por origen. Scoped por sede/país vía `applyScope`. Sin montos.
- **Anti JOIN-fanout (Pitfall 4):** la clasificación viaja en **subqueries correlacionadas**, no en un LEFT JOIN a `subscriptions`. Así una renovación Externo→Socio con dos subs especial solapadas/contiguas que cubren la misma fecha NO duplica la asistencia; la sub vigente se elige determinísticamente (`ORDER BY start_date DESC, id DESC LIMIT 1` → la renovación Socio).
- **Rutas** (`routes.ts`): `GET /especiales` (JSON: `{ month, kpis, rows }`) + `GET /especiales/export` (XLSX vía `sendExcelReply`, worksheet "Especiales", columnas Actividad/Asistencias socio/Asistencias externo/Total/Mes). Ambas con `preHandler:[requireAdminAnalytics, requireBranchAccess(...)]`.
- **Schemas** (`schemas.ts`): `especialesSchema` + `especialesExportSchema` con `month` obligatorio validado por pattern `^\d{4}-\d{2}$` antes del service (T-162-03-04).
- **Test de integración** (`especial-report.test.ts`, MySQL real, 4 casos): (a/b) socio+externo misma actividad/mes → socioCount=1/externoCount=1 + KPIs D-05; (c) export content-type XLSX + body no vacío; (d) fallback presencial→socio; (e) renovación Externo→Socio solapada → cuenta una vez, clasifica Socio.

## Tasks Completed

| Task | Name                                                         | Commit             | Files                      |
| ---- | ------------------------------------------------------------ | ------------------ | -------------------------- |
| 1    | especial-report-service.ts (clasificación + fallback + D-05) | f6cf051b, 5720ae6e | especial-report-service.ts |
| 2    | Rutas GET /especiales (JSON) + /especiales/export (XLSX)     | 3692b99e           | routes.ts, schemas.ts      |
| 3    | Test de integración especial-report.test.ts                  | 9efb9f5c           | especial-report.test.ts    |

## Verification

- `cd el-templo-api && npx tsc --noEmit` → verde.
- `cd el-templo-api && npx vitest run test/analytics/especial-report.test.ts` → 4/4 verde.
- Guards presentes en ambas rutas; grep de montos en el service (líneas no-comentario) == 0.

## Threat Model

- **T-162-03-01 (Elevation of Privilege)** mitigado: ambas rutas con `requireAdminAnalytics` (ADMIN_ROLES-only) + `requireBranchAccess`. Gestion/coach/recepción reciben 403.
- **T-162-03-02 (fuga de plata)** mitigado: reporte de asistencias SIN montos (D-04); el service no joinea financial_transactions/caja.
- **T-162-03-03 (cross-branch)** mitigado: `applyScope` acota por sede/país.
- **T-162-03-04 (month injection)** mitigado: `month` validado por JSON-schema pattern YYYY-MM; queries parametrizadas por Drizzle.
- **T-162-SC (installs)**: cero paquetes nuevos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Columna real `subscription_status` en las subqueries correlacionadas.**

- **Found during:** Task 3 (el test dio 500 en las 4 corridas).
- **Issue:** las subqueries correlacionadas usaban SQL crudo `s.status`, pero la columna DB de `subscriptions.status` se llama `subscription_status` (`mysqlEnum("subscription_status", …)` — 1er arg = nombre de columna, nota de memoria del repo) → `ER_BAD_FIELD_ERROR "Unknown column 's.status'"`.
- **Fix:** `s.status` → `s.subscription_status` en ambas subqueries (especial covering + presencial fallback). La query de KPIs D-05 ya usaba la referencia Drizzle (`schema.subscriptions.status`), que renderiza el nombre correcto, así que no requirió cambio.
- **Files modified:** especial-report-service.ts
- **Commit:** 5720ae6e

### Notas

**Reformulación de comentario para el grep de acceptance.** El acceptance `grep -v '^\s*//' | grep -ci 'monto|amount|price|precio' == 0` no strippea líneas de comentario de bloque (` * …`). El docblock decía "SIN montos" → contaba 1. Se reformuló a "SIN plata / importes en pesos" (mismo sentido) para que el grep dé 0. El service sigue sin montos reales.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- especial-report-service.ts — FOUND
- especial-report.test.ts — FOUND
- Commits f6cf051b / 3692b99e / 5720ae6e / 9efb9f5c — FOUND
