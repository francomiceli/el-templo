---
phase: 214-comunidad-anotados-aura
plan: 04
subsystem: db-migration
tags: [aura, migration, revaluation, ledger]
requires: ["214-03"]
provides:
  - "Migración 0344: respaldo, re-valorización por valor viejo exacto, tope del día D-64, programas, aura_config y recálculo de saldos"
  - "Consulta de conciliación 05 (solo lectura)"
affects: [214-09, 214-12, 214-16]
key-files:
  created:
    - el-templo-api/src/db/migrations/0344_aura_revaluation.sql
    - el-templo-api/test/migrations/0344-aura-revaluation.test.ts
    - .planning/phases/214-comunidad-anotados-aura/consultas/05-conciliacion-aura.sql
  modified:
    - el-templo-api/src/db/schema/micro-programs.ts
decisions:
  - "Número de migración usado: 0344 (libre en origin/master, origin/staging y en todas las ramas remotas)"
  - "Asistencia revertida cuenta como asistencia del día para el tope D-64 (la reversa no tiene reference_id)"
metrics:
  tasks: 3
  completed: 2026-11-17
---

# Phase 214 Plan 04: Migración 0344 de re-valorización de Aura Summary

La migración 0344 re-valoriza el ledger de Aura por valor viejo exacto (sin fórmulas), con respaldo previo `*_backup_0344`, tope del día de D-64, programas y `aura_config` coherentes y recálculo de saldos; el test corre los UPDATE reales dos veces y la consulta 05 mide la conciliación.

## Commits

- `5140a3f0c` feat(214-04): migración 0344 de re-valorización de Aura (D-21)
- `54786bb39` test(214-04): re-valorización 0344 idempotente con los statements reales
- `fdd642211` docs(214-04): consulta de conciliación de Aura

## Contenido de la 0344

Número: 0344 (verificado tras `git fetch`: master y staging terminan en 0343, ninguna rama remota tiene 0344 a 0349). 30 sentencias en total, 18 `UPDATE aura_transactions` (16 de mapeo + 2 del tope del día), 2 `CREATE TABLE ... _backup_0344` primeros, 2 `UPDATE programs`, 2 `ALTER ... SET DEFAULT` (8 y 50), 5 `UPDATE aura_config`, `UPDATE aura_balances ... LEFT JOIN` último.

Verificado por lectura: cero `;` dentro de comentarios y de literales (30 `;` = 30 sentencias), sin fórmulas sobre `amount`, cada sentencia autónoma. `micro-programs.ts` con `.default(8)` y `.default(50)` en el mismo commit que el `.sql`.

Tope del día: se confirmó con `git show 91bd5cfc3` que los tipos viejos `completed_session` y `goal_plan_session` guardaban `completed_sessions.id` como `reference_id`, así que el día se reconstruye por `completed_sessions.date` (con `user_id` igual). Los tipos `training_day` y `goal_plan_day` usan `reference_id` como YYYYMMDD. Cualquier otro tipo no se toca (la consulta 05 bloque 6b los cuenta). Las dos derivadas llevan `GROUP BY` (evita el error 1093).

## Verificación

- API `tsc --noEmit`: 0. `pnpm lint:tenant`: sale 0.
- `pnpm typecheck:tests`: ningún error en `0344-aura-revaluation.test.ts`.
- La migración NO se aplicó en la base local y el test de integración NO se corrió: queda para CI (instrucción del orquestador).
- Consulta 05 no se corrió (solo escrita, 8 bloques SELECT: 0 a 6 más 6b).

## Deviations from Plan

None en lo funcional. El test tiene 10 `it(` (el plan pedía 8 o más, y suma un caso de extracción que cuenta 18 + 1 statements).

## Decisiones del ejecutor

- La asistencia revertida (`manual_adjustment`/`attendance_reversal`) no se puede vincular a su asistencia (la reversa no guarda `reference_id`), así que una asistencia revertida sigue contando para el tope del día. Queda anotado en el encabezado de la migración. Efecto: en un usuario-día con asistencia revertida y app, la app se pone en 0 aunque el saldo de asistencia neto sea 0. Es un caso marginal.
- La consulta 05 bloque 1 acepta además `training/goal_plan` en 0 y `attendance` entre 0 y 5, como pedía el plan, para servir antes y después del plan 10.

## Para los planes siguientes

- Plan 12/16: la numeración sigue desde 0345 (0344 usado). El repaso de D-49 tiene la forma documentada en `<repaso_d49>` del plan 04, no se escribió acá.
- Test de la 0344 usa `app.dbPool.query` para sembrar `attendance` y `completed_sessions` (sin helpers).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 3 commits (`5140a3f0c`, `54786bb39`, `fdd642211`) y los 4 archivos existen.
