---
phase: 214-comunidad-anotados-aura
plan: 09
subsystem: aura-tests-app
tags: [aura, D-20, D-48, D-64, tests, goal-plan]
requires: ["214-08"]
provides:
  - "Fixture seedSessionWithBlocks / startedAtForRatio / startedAtBelowRatio que calcula el tiempo propuesto con el código de producción"
  - "complete-aura-rule.test.ts: 11 casos de integración de D-20 y D-64 (lado app)"
  - "Los 4 tests que completaban sesiones esperando Aura migrados a la regla nueva"
  - "GoalPlanSession.vue reconstruye startedAt al retomar (D-48)"
affects: ["214-10"]
key-files:
  created:
    - el-templo-api/test/sessions/_aura-session-fixtures.ts
    - el-templo-api/test/sessions/complete-aura-rule.test.ts
  modified:
    - el-templo-api/test/sessions/complete-aura-cap.test.ts
    - el-templo-api/test/goal-plans/complete-aura-cap.test.ts
    - el-templo-api/test/sessions/session-complete-streak.test.ts
    - el-templo-api/test/streaks/streak-service.test.ts
    - el-templo-app/src/modules/goal-plan/pages/GoalPlanSession.vue
decisions:
  - "El fixture crea un ejercicio de apoyo por sesión sembrada (las prescripciones no tienen FK a exercises) y lo borra en cleanupFixtureExercises"
  - "proposedSec cuenta todos los roles sembrados; proposedSecFor(blocksCompleted) cubre el caso de Deuteros"
  - "En streak-service y session-complete-streak se quitó solo la fila training_completion de la siembra de aura_config: streak_bonus se mantiene (la usan otros casos)"
metrics:
  tasks: 3
  completed: 2026-11-17
---

# Phase 214 Plan 09: tests de D-20 y arreglo D-48 de la app Summary

Un helper siembra sesiones con bloques y prescripciones reales y toma el tiempo propuesto de `getSessionByDayId` + `proposedSecondsForSession`; sobre él hay un test de integración nuevo de la regla de Aura, los cuatro tests viejos quedaron migrados y retomar un plan a medida manda el inicio real.

## Commits

- `8bd1c28a6` test(214-09): fixture de sesión con bloques y regla de Aura D-20
- `f92e178c6` test(214-09): cierres de sesión de los tests con tiempo y bloques que cumplen D-20
- `4a97a1af8` fix(214-09): plan a medida retomado manda el inicio real (D-48)

## Detalle

- `complete-aura-rule.test.ts` (11 `it`): 80 % con Aura; 79 % sin Aura; bloque faltante sin Aura; asistencia acreditada el mismo día sin Aura; visita Wellhub sin fila de Aura CON Aura; plan a medida + app el mismo día (una sola fila, total 3); día de combos con ALT (ALT de 600 s que el cálculo descarta) con Aura; inicio de hace 13 h sin Aura; Deuteros (DEUTEROS_1 + ATHLOS) con Aura; plan a medida 80 % (monto `goalPlan` y `duration` no nula y >= 80 %); plan a medida 79 % sin Aura. En todos los casos sin Aura se afirma sesión guardada y `current_streak >= 1`.
- Cada caso usa usuario nuevo (con perfil de onboarding para la racha) y dayId propio (semanas 41 y 42). El catálogo del plan a medida se crea una vez en `beforeAll`.
- Migrados: `complete-aura-cap` (sesiones y plan a medida: mapa `dayId -> proposedSec`, `startedAtFor(dayId)`, `blocksCompleted = rolesOf(STANDARD_BLOCKS)`, saldos con `AURA_AMOUNTS`), `session-complete-streak` (primer caso) y `streak-service` (caso "awards AURA", resiembra `W1-lunes-alfa` con bloques en el propio test y el helper `completeSession` ahora acepta `startedAt` y `blocksCompleted`).
- App: `beginSession` usa `Date.now() - elapsedSeconds * 1000` cuando `mode === 'resume'` y hay player; en arranque nuevo, `new Date()`. El `?? new Date().toISOString()` de `:403` queda de respaldo. El nombre real del composable es `elapsedSeconds` (coincide con DayPlayer).

## Barrido de `startedAt: new Date().toISOString()` (test/sessions, test/goal-plans, test/streaks)

- `test/sessions/sessions.test.ts` (6 apariciones) y `test/goal-plans/goal-plans.test.ts` (3): no afirman Aura (no hay `aura`/`balance` de entrenamiento), se dejan.
- `test/sessions/session-complete-streak.test.ts:187`: el segundo caso ("sin config de AURA", martes) solo afirma 200 y racha; queda con inicio de ahora a propósito (no espera Aura).
- `complete-aura-cap` y `streak-service`: las apariciones restantes son del fallback para dayIds sin bloques (400 esperados) y de los casos de racha que no afirman Aura.

## Verificación

- `pnpm typecheck:tests`: ningún error en los 7 archivos tocados (el total ya viene en rojo por archivos ajenos: 263 contra 175 de base, ninguno mío).
- `npx tsc --noEmit` API: 0. `pnpm lint:tenant`: sale 0.
- App: `pnpm lint` 0 errores (2 warnings previos ajenos). `vue-tsc`: 21 errores, igual que la línea de base, 0 en `GoalPlanSession.vue`.
- `complete-aura-rule.test.ts` se intentó correr en local: `test/setup.ts` se cuelga 120 s provisionando la base y deja los 11 casos en skipped (problema conocido). Quedan para CI.

## Deviations from Plan

None - plan executed exactly as written.

## Supuestos a vigilar

- Los 11 casos nunca corrieron: en CI revisar primero el fixture (inserts a `exercises`, `session_blocks`, `session_prescriptions`) y la creación del catálogo del plan a medida.
- Margen de la prueba del 79 %: queda 5 s por debajo del umbral; la latencia de `inject` suma al tiempo medido por el servidor, así que con proposedSec chico (unos 4 min) el margen es holgado pero no infinito.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 3 commits y los 7 archivos existen.
