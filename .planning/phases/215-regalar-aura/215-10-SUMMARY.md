---
phase: 215-regalar-aura
plan: 10
subsystem: api-aura
tags: [aura, regalo, admin, medicion, tenancy]
requires: ["215-09"]
provides:
  - "`GET /api/admin/aura/gifts`: lista de regalos del período y medición de las últimas 4 semanas"
  - "`listAdminGifts` y `weeklyGiftUsage` en `aura/gift-admin-queries.ts`"
affects: [215-23]
tech-stack:
  added: []
  patterns:
    [
      agrupación por semana en SQL con WEEKDAY y una consulta por métrica,
      alias de users para dador,
      receptor y quien anuló,
    ]
key-files:
  created:
    - el-templo-api/src/modules/aura/gift-admin-queries.ts
    - el-templo-api/test/aura/gifts-admin-list.test.ts
  modified:
    - el-templo-api/src/modules/aura/gift-admin-routes.ts
    - el-templo-api/src/modules/aura/gift-schemas.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - .planning/phases/215-regalar-aura/215-DECISIONES-AUTONOMAS.md
key-decisions:
  - "El porcentaje de quienes regalaron se acota a 100 y solo cuenta regalos vigentes de alumno"
requirements-completed: [SC-7, D-20, D-21]
duration: 30 min
completed: 2026-11-18
---

# Fase 215 Plan 10: lista de regalos y medición para el staff Summary

El staff (dueño, admin y admin_sede) puede pedir los regalos del período con nombres completos, motivo, puntos, estado y quién anuló, junto con la medición de las últimas 4 semanas (regalos de alumnos, de profes, asistentes y porcentaje que regaló). La pantalla es del plan 23.

## Tareas

| Tarea | Commit      | Asunto                                                  |
| ----- | ----------- | ------------------------------------------------------- |
| 1     | `caf0d631d` | feat(215-10): consultas de lista y medición de regalos  |
| 2     | `ab0d7d805` | feat(215-10): lista de regalos y medición para el staff |

## Qué quedó

- `gift-admin-queries.ts`: `listAdminGifts` (una consulta con 3 alias de `users` y `left join` a `schedules`; filtro `session_date >= hoy - (days - 1)`, `includeVoided`, orden fecha desc, hora desc, id desc, tope 500; `branchIds` vacío devuelve `[]` sin consultar) y `weeklyGiftUsage` (una consulta de regalos y una de asistencias, ambas agrupadas por el lunes de la semana calculado con `WEEKDAY`; las 4 semanas salen siempre, la actual primero, y las vacías en 0).
- Ruta `GET /gifts` en `gift-admin-routes.ts`: roles dueño, admin y admin_sede (403 `REGALO_SIN_PERMISO` al resto), `requireBranchAccess` opcional (403 `BRANCH_OUT_OF_SCOPE` con sede ajena) y `enforcedBranchIds` para el admin_sede sin `branchId`. "Hoy" con la zona de la sede filtrada o la única del actor; si no, Buenos Aires.
- `adminGiftsListSchema` (querystring `branchId`, `days` 7/30/90 con default 7, `includeVoided` default false; respuesta con cada campo declarado, `startTime` nullable).
- Manifiesto: `GET /api/admin/aura/gifts` (`templo-module` / `templo-gamification`); `ENTRADAS_BASELINE` 596 a 597 (y el título del `it`).
- `gifts-admin-list.test.ts`: 10 `it` (orden y nombres, anulados, período, `days` inválido, admin_sede con y sin sede ajena, profe y recepción, gimnasio 2, medición 2 de 3 = 67 %, 4 semanas, zona por defecto). Nunca corrió local.

## Control posterior

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests` (heap ampliado): ninguna mención de `gifts-admin-list`, `tenant-manifest` ni `iso-01`; la deuda listada es ajena.
- No se corrió ningún test de integración (quedan para CI). App y admin no tocados. Sin migración, sin cambios en dependencias, sin bump, sin push.

## Desvíos respecto del plan

- El plan citaba `requireBranchAccess({ from: "query" ... })`: el valor real del tipo es `"query.branchId"`.
- El 403 del esquema declara solo `error` y `message` como obligatorios (`code` opcional), porque el 403 puede venir del guard de staff, que no trae `code`.
- `lint:tenant` no acepta un `tenantWhere` metido en una variable: cada `.where(...)` lo lleva literal y las condiciones opcionales van aparte con spread.

## Decisiones propias

Tres filas nuevas en `215-DECISIONES-AUTONOMAS.md`: quiénes cuentan como asistentes, tope de 100 % en el porcentaje y día de referencia de las semanas.

## Lecciones para los planes siguientes

- Plan 23 (admin): respuesta `{ items, weeks }`; `startTime` puede ser null, `voidCause` y `voidedByName` también; `weeks[0]` es la semana actual. Sin regalos todo viene vacío o en 0 (no hay 404). El módulo apagado da 404 sin `code`.
- La agrupación por semana usa `DATE_FORMAT(DATE_SUB(col, INTERVAL WEEKDAY(col) DAY), '%Y-%m-%d')` (lunes). Un `sql` que nombra directo `schema.attendance.<col>` fuera del `.where` lo cuenta `lint:tenant` como acceso sin gimnasio: pasar la columna por el helper `weekStartSql`.
- Si CI falla en `gifts-admin-list.test.ts`, mirar primero que el admin_sede del caso 4 quede con una sola sede (`createStaffUser` con `user_branches`) y la sede Auckland creada por `seedGiftClass({ tz })`, y que el flag `templo-gamification` del gimnasio 2 esté encendido en el caso 8.

## Self-Check: PASSED

Archivos y commits `caf0d631d` y `ab0d7d805` verificados.
