---
phase: 214-comunidad-anotados-aura
plan: 31
subsystem: aura-migracion-repaso
tags: [aura, migracion, repaso, D-21, D-38, D-49, D-64, SC-4]
requires: ["214-30"]
provides:
  - "deploy-2/aura_revaluation_repaso.sql: migracion de repaso de D-49 con el tope del dia acotado (sin numero, fuera de src/db/migrations)"
  - "deploy-2/README.md: cuando y como moverla, y el control con la consulta 05"
  - "test/migrations/aura-revaluation-repaso.test.ts: 15 it con los casos del blocker de la segunda verificacion"
affects: ["214-32"]
key-files:
  created:
    - .planning/phases/214-comunidad-anotados-aura/deploy-2/aura_revaluation_repaso.sql
    - .planning/phases/214-comunidad-anotados-aura/deploy-2/README.md
    - el-templo-api/test/migrations/aura-revaluation-repaso.test.ts
  modified: []
metrics:
  tasks: 2
  completed: 2026-11-18
---

# Phase 214 Plan 31: Migracion de repaso de D-49 Summary

El repaso de D-49 quedo preparado en `deploy-2/` (no en `src/db/migrations/`) para un deploy posterior al de la 0344, con su README y un test que corre sus UPDATE reales.

## Commits

- `c4077b715` feat(214-31): migracion de repaso de D-49 lista para el segundo deploy
- `a0e54f62d` test(214-31): repaso de D-49 sin pisar dias legitimos de D-64

## Que hace el SQL

- 11 UPDATE de mapeo por valor viejo exacto, copiados de la 0344: asistencia 10 a 5, reversa -10 a -5, onboarding 50 a 5, antiguedad (3, 6, >=12) y los cinco pares de rachas.
- Tope del dia acotado: una fila `training_completion` o `goal_plan_completion` de 3 pasa a 0 solo si (a) ese dia hay una asistencia de 5 o 10, (b) ese dia NO hay una asistencia de `BETWEEN 1 AND 4`, (c) `created_at` es anterior a `applied_at` de `0344_aura_revaluation.sql` en `_migrations` mas 1 hora. Derivada con `GROUP BY` (evita `ER_UPDATE_TABLE_USED`); el dia de la fila de app se calcula una sola vez en una subderivada.
- App y plan a medida el mismo dia, igual que en la 0344 (sin ventana).
- Recalculo de `aura_balances` al final. Sin `CREATE TABLE`, `ALTER`, `aura_config` ni `programs`.
- Si `_migrations` no tiene la fila de la 0344, la subconsulta da NULL y el tope acotado no toca nada (falla segura).

## Verificacion

- `pnpm exec tsc --noEmit` (API): 0 errores.
- `pnpm lint:tenant`: 0 discrepancias.
- `pnpm typecheck:tests`: 18 discrepancias de base, ninguna en `aura-revaluation-repaso.test.ts`.
- Verify automatico de la tarea 1 en verde; no hay ningun archivo `*repaso*` en `src/db/migrations/`.
- El test NO se corrio (la suite de integracion queda para CI, `test/setup.ts` se cuelga en local).

## Deviations from Plan

None - plan executed exactly as written.

## Decisiones propias

- El filtro (a) usa `att.amount IN (5, 10)` en vez de solo 10: asi el tope funciona igual si corre despues del mapeo de la misma migracion (10 ya paso a 5) o en una segunda corrida.
- Los casos del test siembran `created_at` con `DATE_ADD((SELECT applied_at FROM _migrations WHERE name = ...), INTERVAL n MINUTE)`: 10 minutos para "en ventana", 120 para "fuera". Un `beforeAll` verifica que la fila de la 0344 exista en `_migrations`.
- Casos agregados a los 8 pedidos: no tocar fuentes de config/programa, app 3 sin asistencia del dia o con asistencia de otro dia, filas que no encajan, y guard de DDL/config. Total 15 `it`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-214-31-01 mitigado por las condiciones (a), (b), (c) y el test del caso app 3 + asistencia 2. T-214-31-02 mitigado: el SQL queda fuera de `src/db/migrations/` y el README explica cuando moverlo.

## Pendiente para el orquestador

- Mover la migracion en el segundo deploy: numero libre al momento (0348 si no se colo nada; hoy `origin/master` y `origin/staging` terminan en 0343 y esta rama en 0347), actualizar `REPASO_PATH` del test, commit y deploy aparte, y controlar con la consulta 05 bloques 1, 4 y 6.
- El test nunca corrio local: si falla en CI, mirar primero que la base de test tenga `0344_aura_revaluation.sql` en `_migrations` y la siembra de `completed_sessions`.

## Self-Check: PASSED
