---
phase: 214-comunidad-anotados-aura
plan: 03
subsystem: api-tests
tags: [aura, tests, amounts, onboarding]
requires: ["214-02"]
provides:
  - "Tests de asistencia, onboarding, antigüedad, estiramiento y bloque libre afirmando contra aura/amounts.ts"
affects: [214-09]
key-files:
  modified:
    - el-templo-api/test/attendance/attendance.test.ts
    - el-templo-api/test/attendance/attendance-cross-tenant.test.ts
    - el-templo-api/test/scheduling/scheduling.test.ts
    - el-templo-api/test/onboarding/onboarding.test.ts
    - el-templo-api/test/unit/tenure-milestones.test.ts
    - el-templo-api/test/jobs/tenure-milestones.test.ts
    - el-templo-api/test/sessions/stretch-complete.test.ts
    - el-templo-api/test/sessions/free-blocks-complete.test.ts
decisions:
  - "streak-service.test.ts no se tocó: no afirma montos de streak_bonus"
metrics:
  tasks: 3
  completed: 2026-11-17
---

# Phase 214 Plan 03: Tests con la escala nueva de Aura Summary

Los tests que afirmaban montos viejos de Aura (asistencia, onboarding, antigüedad, estiramiento, bloque libre) ahora afirman contra `AURA_AMOUNTS`, `AURA_TENURE` y `tenureAuraFor`, y hay un test nuevo que prueba que el onboarding devuelve el monto acreditado aunque el usuario ya tenga saldo.

## Commits

- `40990f3f8` test(214-03): asistencia y onboarding con montos de amounts.ts
- `298ffa671` test(214-03): antigüedad y rachas con montos de amounts.ts
- `c27df2bb5` test(214-03): estiramiento y bloque libre con montos de amounts.ts

## Verificación

- API `tsc --noEmit`: 0 errores. `pnpm lint:tenant`: sale 0.
- `pnpm typecheck:tests`: ningún error en los archivos tocados por este plan, salvo `attendance/attendance.test.ts` TS2300 "Duplicate identifier 'appBranchName'": es PREEXISTENTE (el archivo importa `appBranchName` dos veces, líneas 25 y 47 originalmente) y no se arregló (fuera de alcance).
- `test/unit/tenure-milestones.test.ts` con la config unitaria: 34 de 34 en verde.
- Tests de integración (asistencia, onboarding, jobs/tenure, stretch, free-blocks): no corridos en local, quedan para CI.

## Cambios por tarea

1. attendance: `r.amount === AURA_AMOUNTS.attendance` (3 lugares), `tens` pasa a `attendanceAwards`. attendance-cross-tenant: 4 controles con `+ AURA_AMOUNTS.attendance`, títulos sin "+10". scheduling: `toBeGreaterThanOrEqual(AURA_AMOUNTS.attendance)`. onboarding: todas las aserciones de 50 contra `AURA_AMOUNTS.onboarding`, y caso nuevo "auraAwarded es el monto acreditado aunque el usuario ya tenga saldo" (siembra 40 con `seedAuraBalance`, afirma `auraAwarded === 5` y saldo final 45). El caso de reenvío (`isRepeat`) ya existía y afirma `auraAwarded === 0`.
2. unit/tenure-milestones: escalera con `AURA_TENURE`, `milestoneOnDate` con `tenureAuraFor(3/12/24)`, guarda literal `milestoneAura(12) === 50`. jobs/tenure-milestones: `tenureAuraFor(6)` y `tenureAuraFor(3)`. streak-service: sin cambios (no afirma montos de `streak_bonus`; la aserción de `training_completion` queda para el plan 09).
3. stretch-complete: `AURA_AMOUNTS.stretch`. free-blocks-complete: `AURA_AMOUNTS.extraBlock` en las 4 aserciones de monto/saldo y en la fila previa sembrada del caso del candado. La siembra de `aura_config` se dejó con un comentario de que el monto sale de `AURA_AMOUNTS`.

## Barrido final de `test/`

`grep` de `amount.toBe(<monto viejo>)`, `amount === ...` y `amount: <monto viejo>` sobre toda la carpeta, más búsqueda por archivos que tocan `aura_transactions` / `aura_balances` / `auraAwarded`. Revisados y SIN cambios (no son montos de Aura de una fuente cuyo valor cambió):
- `finance/**`, `analytics/**`, `weekly-board/**`, `reports/**`, `invitations/**`: montos en dinero.
- `programs/admin-addons.test.ts:631`: monto de cobro en EUR.
- `unit/aura-service.test.ts`: prueba el servicio genérico con montos sembrados por el propio test.
- `programs.test.ts`, `goal-plans/goal-plans.test.ts`, `programs/current-program.test.ts`: solo siembran `auraWeeklyBonus: 15` / `auraCompletionBonus: 100` como valores personalizados del programa (el plan 02 no toca los bonus personalizados) y no afirman la transacción resultante.
- `wellhub/*`, `members/members.test.ts`, `referrals/aura-annotation.test.ts`: afirman 0 filas o monto 0.
Fuera de alcance, como indicó el plan: `sessions/complete-aura-cap.test.ts`, `goal-plans/complete-aura-cap.test.ts`, `sessions/session-complete-streak.test.ts` y la línea de `training_completion` de `streak-service.test.ts` (plan 09). No se cambió ningún archivo de test fuera de `files_modified` (el plan lista 9, se tocaron 8 porque `streak-service` no tenía nada que cambiar).

## Deviations from Plan

None, salvo que `streak-service.test.ts` quedó sin tocar (no afirma montos de racha).

## Decisiones del ejecutor

- Se dejó la siembra de `aura_config` en los tests de stretch y bloque libre (inofensiva) con comentario, tal como pedía el plan.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 3 commits y los 8 archivos de test verificados con `git log` y `git status` (worktree limpio salvo el `.tsv` ajeno).
