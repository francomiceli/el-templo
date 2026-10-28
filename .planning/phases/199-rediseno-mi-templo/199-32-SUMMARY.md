---
phase: 199-rediseno-mi-templo
plan: 32
subsystem: app-mi-templo
tags: [check-in, week-strip, uat-d20, uat-d21, gap-closure, ajuste]
requires: [199-25, 199-16]
provides:
  - "Registro del día con título visible (pregunta y línea colapsada)"
  - "Tu semana con layout de 199-16 y total en pastilla terracota"
affects: [199-31]
tech-stack:
  added: []
  patterns:
    - "Títulos de bloque con `$mt-block-title-color` (D14)"
key-files:
  modified:
    - el-templo-app/src/modules/progression/components/CheckInPanel.vue
    - el-templo-app/src/modules/progression/components/WeekStrip.vue
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
    - el-templo-app/src/modules/progression/utils/check-in-summary.ts
    - el-templo-app/src/modules/progression/utils/__tests__/check-in-summary.test.ts
decisions:
  - 'D20 revierte parte de D18: vuelve el título; se mantienen "hoy" en las preguntas, "Bien" y "Energía: bien"'
  - 'D21 revierte D17: vuelve "Tu semana"; el número del total va en badge `#96593a`/`#fff` (5.6:1, AA)'
  - '`sessionsTotalCaption(label, count)` ahora pluraliza: "sesión"/"sesiones" + "en total"/"en El Templo"'
metrics:
  tasks: 2
  commits: 2
  completed: 2026-10-16
---

# Phase 199 Plan 32: Título del registro y Tu semana con total en pastilla (UAT D20/D21) Summary

Ajuste chico sin PLAN.md propio, pedido en el UAT (D20, D21 en `199-UAT.md`). Ejecutado en la sesión del 2026-10-15/16; la sesión se cortó antes del SUMMARY, que se escribe a mano desde los dos commits.

## Commits

- `9b3794977` fix(199-32): vuelve el título Registro del día (también colapsado) en el color de títulos de bloque (UAT D20) — `CheckInPanel.vue`
- `b8e1169d6` fix(199-32): vuelve Tu semana con el total en pastilla terracota (UAT D21) — `WeekStrip.vue`, `MiTemplo.vue`, `check-in-summary.ts` + test

## Qué se hizo

- **D20:** "Registro del día" visible en la pregunta y en la línea colapsada (`<b>Registro del día</b> · resumen`), con `$mt-block-title-color`. Se mantienen "hoy" en las preguntas, "Bien" (value alto) y "Energía: bien" en el resumen.
- **D21:** `WeekStrip` vuelve al layout de 199-16: título "Tu semana" (`aria-label` incluido), cifra grande de la semana, puntos L–D y total abajo. El número del total va en una pastilla terracota (`#96593a` / `#fff`, radio 999, 600) seguida del texto de `sessionsTotalCaption`.
- `sessionsTotalCaption(label, count)` suma el conteo para pluralizar ("1 sesión en El Templo", "42 sesiones en total"); tests actualizados.
- Comentarios de `MiTemplo.vue` y `check-in-summary.ts`: "Tus sesiones" → "Tu semana".

## Verificación (2026-10-16, worktree `et-199-mi-templo`, HEAD `b8e1169d6`)

- API `tsc --noEmit`: 0. `lint:tenant`: 0.
- App `vue-tsc --noEmit` (3.3.13): 18 errores, todos preexistentes, 0 en archivos de este plan. Admin: 21 (sin cambios).
- `eslint src/modules/progression`: 0 errores.
- `check-in-summary.test.ts`: 34/34 verde.
- Worktree limpio.

## Deviations from Plan

Sin PLAN.md: el alcance sale de D20/D21 del UAT. SUMMARY escrito por el orquestador, no por el ejecutor.

## Dudas / para 199-31

- No se midió en navegador: la re-captura de 199-31 tiene que cubrir el título colapsado del registro y la pastilla del total (contraste y que no rompa a 390 px).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED
