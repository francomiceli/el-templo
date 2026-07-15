---
phase: 162-superficie-member-app-y-reporte-de-reparto
plan: 01
subsystem: scheduling
tags: [scheduling, member-grid, isSpecial, aura, display-flag]
requires:
  - "activities.is_special (schema 0179, 161-01)"
  - "JOIN a activities en getWeeklyGrid (ya existente)"
provides:
  - "WeeklySlotView.isSpecial end-to-end en el grid member y admin"
affects:
  - "el-templo-api/src/modules/scheduling (getWeeklyGrid response contract)"
  - "consumidores futuros: 162-04 / 162-05 (badge member + reporte)"
tech-stack:
  added: []
  patterns:
    - "self-mirror del recorrido de activityMaxCapacity (155-01) por los 4 puntos de getWeeklyGrid"
    - "declaración explícita en el response schema para evitar strip de fast-json-stringify"
key-files:
  created:
    - "(ninguno nuevo — el test extiende un suite existente)"
  modified:
    - "el-templo-api/src/modules/scheduling/service.ts"
    - "el-templo-api/src/modules/scheduling/types.ts"
    - "el-templo-api/src/modules/scheduling/schemas.ts"
    - "el-templo-api/test/scheduling/especial-gating.test.ts"
decisions:
  - "isSpecial es sólo display: el gating real vive server-side en reserve() (161-06). Falsear el flag no gana acceso."
  - "Un solo cambio en weeklySlotViewSchema cubre grid member y admin (schema compartido como items)."
metrics:
  duration: ~12min
  completed: 2026-07-15
  tasks: 2
  files: 4
---

# Phase 162 Plan 01: Superficie member — isSpecial en el grid semanal Summary

Expone `WeeklySlotView.isSpecial:boolean` por slot en `getWeeklyGrid`, resuelto server-side desde `activities.is_special` vía el JOIN existente, con test de integración que asierta el flag en el grid member (especial=true, regular=false).

## What Was Built

- **Task 1 — Propagación de `isSpecial` por los 4 puntos del backend** (`0c4b8048`):
  - `.select()` de `scheduleRows`: `isSpecial: schema.activities.isSpecial` junto a `activityMaxCapacity` (JOIN a `activities` ya existente, no re-agregado).
  - `slots.push({...})`: `isSpecial: row.isSpecial`.
  - `WeeklySlotView` (types.ts): `isSpecial: boolean` con comentario de fase.
  - `weeklySlotViewSchema` (schemas.ts): `isSpecial: { type: "boolean" }` — **crítico**, sin esto fast-json-stringify strippea la prop y el badge nunca llega (Pitfall 2). Cobertura doble: el schema es `items` del grid admin (:256) y member (:769).
  - `npx tsc --noEmit` verde.

- **Task 2 — Test de integración del grid member** (`b18033d6`):
  - Caso (9) agregado a `especial-gating.test.ts`: pega a `GET /api/members/scheduling/weekly?weekStart=2026-03-09&branchId=...` y asierta `isSpecial === true` en los slots especiales (Verticales, Acrobacias) y `=== false` en el regular (Calistenia).
  - Reusa fixtures existentes (`createActivityAndSchedule` con flag, `createMemberToken`). Sin watch-mode.
  - `npx vitest run test/scheduling/especial-gating.test.ts` → 9/9 verdes.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `cd el-templo-api && npx tsc --noEmit` → verde.
- `cd el-templo-api && npx vitest run test/scheduling/especial-gating.test.ts` → 9/9 verdes (incluye el caso (9) nuevo; los 8 casos de gating de 161-06 siguen verdes = sin regresión).
- Acceptance greps de Task 1: todos matchean (select + push en service.ts, `type: "boolean"` en schemas.ts, `isSpecial: boolean` en types.ts).

## Notes for Next Plans

- `WeeklySlotView.isSpecial` ya viaja al frontend. Los planes 162-04 (badge member en `ReservasPage.vue`) y 162-05 pueden consumirlo directo.
- El mirror del type en `el-templo-app/src/types/scheduling.ts` (`isSpecial: boolean`) es responsabilidad de un plan de frontend posterior — CI NO typechequea el app, correr `vue-tsc` local al tocarlo.

## Self-Check: PASSED

Todos los archivos y commits verificados en disco.
