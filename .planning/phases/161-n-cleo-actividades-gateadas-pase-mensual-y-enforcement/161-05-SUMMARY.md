---
phase: 161-n-cleo-actividades-gateadas-pase-mensual-y-enforcement
plan: 05
subsystem: scheduling
tags: [activities, crud, gating-contract, is-special]
requires:
  - activities.is_special (Plan 01, schema + migración 0179)
provides:
  - CRUD de actividades acepta/persiste/devuelve isSpecial (ACT-01)
  - getScheduleSlotRaw expone isSpecial vía JOIN activities (contrato del gating, Plan 06)
affects:
  - el-templo-api/src/modules/scheduling/activity-service.ts
  - el-templo-api/src/modules/scheduling/routes.ts
  - el-templo-api/src/modules/scheduling/schemas.ts
  - el-templo-api/src/modules/scheduling/booking-service.ts
tech-stack:
  added: []
  patterns:
    - Columna nueva recorre schema → service → routes body → schemas → GET list (espejo de maxCapacity)
    - Flag de dominio resuelto server-side por JOIN (nunca del request) para el contrato downstream
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/scheduling/activity-service.ts
    - el-templo-api/src/modules/scheduling/types.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/test/scheduling/schedule-activity-crud.test.ts
decisions:
  - "isSpecial default false en create (cero cambio de comportamiento para actividades regulares)"
  - "getScheduleSlotRaw añade isSpecial de forma aditiva (JOIN activities) — no toca gating; el enforcement es del Plan 06"
metrics:
  duration: ~10min
  completed: 2026-07-14
---

# Phase 161 Plan 05: Flag is_special end-to-end del lado API Summary

Expone el flag `is_special` de actividades end-to-end del lado backend: el CRUD de actividades (POST/PUT/GET `/activities` + schemas) lo acepta, persiste y devuelve siguiendo exactamente el recorrido de `maxCapacity`, y `getScheduleSlotRaw` lo trae vía JOIN a `activities` como contrato tipado que consumirá el gating de reserva del Plan 06.

## What Was Built

**Task 1 — CRUD de actividades acepta y persiste is_special** (`e915faf9`):

- `activity-service.ts`: `createActivity` acepta `isSpecial?: boolean` (persiste `isSpecial ?? false`), `updateActivity` acepta `isSpecial?` en su `data` (edita sólo si viene la key, mismo patrón que `maxCapacity`), `mapActivityRow` devuelve `isSpecial: row.isSpecial`.
- `types.ts`: `ActivityRecord` expone `isSpecial: boolean`.
- `routes.ts`: `POST` y `PUT /activities` agregan `isSpecial?: boolean` al Body; POST lo pasa como 4º arg al service, PUT lo propaga vía `request.body` completo. GET `/activities` lo devuelve por el mapeo del service.
- `schemas.ts`: `isSpecial: { type: "boolean" }` en el body de create/update y en `activityRecordSchema` (usado por el response 201 de POST, el 200 de PUT y el item del list de GET) — sin declararlo, fast-json-stringify lo strippearía.

**Task 2 — getScheduleSlotRaw trae isSpecial + tests del CRUD del flag** (`25ae25d3`):

- `booking-service.ts`: `getScheduleSlotRaw` extiende su tipo de retorno con `isSpecial: boolean` y añade un `innerJoin` a `activities` por `activityId`, seleccionando `activities.isSpecial`. Cambio aditivo — no altera el gating (enforcement es alcance del Plan 06). Resuelto server-side desde la actividad, nunca del request (T-161-11).
- `test/scheduling/schedule-activity-crud.test.ts`: 4 casos nuevos — POST con `isSpecial=true` persiste (verificado en DB), POST sin flag default false, GET devuelve `isSpecial` por actividad (especial vs regular), PUT a `isSpecial=false` actualiza y persiste (round-trip). `ActivityResponse` del test extendida con `isSpecial?`.

## Verification

- `npx tsc --noEmit` verde tras cada tarea.
- `npx vitest run test/scheduling/schedule-activity-crud.test.ts`: 12/12 pasan (8 existentes de fase 113 + 4 nuevos del flag).
- Greps de aceptación: `isSpecial` en activity-service (5), routes (POST+PUT), schemas (create+update+response). `isSpecial: schema.activities.isSpecial` presente en getScheduleSlotRaw.

## Deviations from Plan

Ninguna. Ejecutado exactamente como está escrito. Nota de alcance respetada: `booking-service.ts` sólo se tocó para exponer `isSpecial` en `getScheduleSlotRaw` — el gating (que también toca este archivo) queda para el Plan 06/wave 3.

## Known Stubs

Ninguno. El flag está wireado end-to-end y ejercitado por tests. El consumo del contrato (`getScheduleSlotRaw.isSpecial` en el enforcement de `reserve()`) es alcance del Plan 06 por diseño de olas.

## Self-Check: PASSED

- Archivos modificados existen: activity-service.ts, types.ts, routes.ts, schemas.ts, booking-service.ts, schedule-activity-crud.test.ts — todos FOUND.
- Commits: `e915faf9`, `25ae25d3` FOUND en git log.
- Test file ≥40 líneas de cobertura del flag: 12 tests, archivo ~410 líneas.
