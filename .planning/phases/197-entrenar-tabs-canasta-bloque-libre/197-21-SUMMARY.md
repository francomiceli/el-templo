---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 21
subsystem: app/progression
tags: [mi-templo, today-card, libre, D-17]
requires: [197-19]
provides: ["TodayCardModel.libreLink", "link 'Probá el modo Libre' en la card de hoy"]
key-files:
  modified:
    - el-templo-app/src/modules/progression/utils/today-card.ts
    - el-templo-app/src/modules/progression/utils/__tests__/today-card.test.ts
    - el-templo-app/src/modules/progression/components/TodayCard.vue
metrics:
  tasks: 2
  files: 3
---

# Phase 197 Plan 21: Link a Libre en la card de hoy Summary

Campo `libreLink` en el modelo de la card de hoy, con la regla conservadora de D-17 aplicada en un único punto (`withLibreLink`), y su render como botón de texto en `TodayCard.vue`.

## Commits

- `0ba515ec0` feat(197-21): link "Probá el modo Libre" en el modelo de la card de hoy (D-17)
- `6f61028c9` feat(197-21): link a Libre en la card de hoy

## Qué se hizo

- `resolveTodayCard` ahora envuelve al resolver anterior (renombrado `resolveBaseCard`, sin cambios de lógica) con `withLibreLink`. Se extrajo `hasCurrentPlan(input)` (misma expresión que antes) para no duplicarla.
- Regla (solo con plan active/paused o `planStatus.hasActivePlan`; un plan solo programado no): `completada` y `presencial-proxima` sí; `presencial-turno` solo con `attendanceMarkedAt`; `presencial-sin-turno` solo sin lista de espera (cubre la clase de hoy perdida por la regla D5); `online-programa`/`online-libre` solo con `todayRoute` null. `cargando`, `sin-plan-*` y el resto: null.
- Tests: `describe('libreLink (fase 197 D-17)')` con 21 casos (24 menciones de `libreLink`).
- Vista: `<button class="today-card__libre">` debajo del hook, 13 px / 600, color sólido `#e3c9a8`, subrayado, `min-height: 44px`, alineado a la izquierda, dentro de `__content` (z-index 2), con `:focus-visible`. Navega vía `onAction` a `/training?tab=libre` (EntrenarView ya lee `query.tab`).

## Desvíos/decisiones

- Color: el plan sugería `$pd-cream-2` importando `src/css/premium-card`. La card usa hex literales en todo el archivo (el mismo `#e3c9a8` en kicker y foco) y no importa tokens; se usó el hex para no agregar un import a una card recién rediseñada. Mismo valor.
- `online-libre` con plan y plani hoy: sin link (no está en la lista de casos, conservador).
- Diff de TodayCard: 30 líneas agregadas, 1 borrada (el selector `&__link:focus-visible` pasó a llevar una línea más).
- Sin verificación local (typecheck/tests corren en CI).

## Threat Flags

Ninguno.

## Self-Check: PASSED
