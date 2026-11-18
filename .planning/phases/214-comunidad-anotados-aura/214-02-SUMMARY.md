---
phase: 214-comunidad-anotados-aura
plan: 02
subsystem: api
tags: [aura, amounts, onboarding, tenure, streaks]
requires: ["214-01"]
provides:
  - "aura/amounts.ts: AURA_AMOUNTS, AURA_TENURE, AURA_STREAK, tenureAuraFor"
affects: [214-03, 214-04, 214-08, 214-10]
key-files:
  created:
    - el-templo-api/src/modules/aura/amounts.ts
    - el-templo-api/test/unit/aura-amounts.test.ts
  modified:
    - el-templo-api/src/modules/aura/daily-award.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/modules/goal-plans/routes.ts
    - el-templo-api/src/modules/sessions/free-blocks-service.ts
    - el-templo-api/src/modules/sessions/stretch-service.ts
    - el-templo-api/src/modules/programs/service.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/onboarding/service.ts
    - el-templo-api/src/modules/shared/tenure-milestones.ts
    - el-templo-api/src/modules/aura/streak-reward.ts
decisions:
  - "Montos de Aura como constantes de código (no aura_config)"
  - "Un override streak.* en system_settings le sigue ganando a amounts.ts"
metrics:
  tasks: 3
  completed: 2026-11-17
---

# Phase 214 Plan 02: Montos de Aura en la escala nueva Summary

Todos los montos de Aura que acredita el servidor salen de `aura/amounts.ts` (clase 5, onboarding 5, entrenar 3, plan a medida 3, bloque libre 2, estirar 1, antigüedad 15/25/50, rachas 5/10/15/25/50, programas 8 y 50 por defecto) y el onboarding devuelve el monto acreditado en vez del saldo.

## Commits

- `5629cb6d8` test(214-02): montos de Aura de D-19 (rojo)
- `785bc2bd0` feat(214-02): tabla única de montos de Aura (D-18, D-19)
- `f021b61f3` feat(214-02): fuentes diarias y programas con monto explícito
- `02ead59b2` feat(214-02): asistencia, onboarding, antigüedad y rachas en la escala nueva

## Verificación

- `pnpm exec tsc --noEmit` (API): 0 errores. `pnpm lint:tenant`: sale 0.
- `vitest run test/unit/aura-amounts.test.ts`: rojo confirmado antes de la implementación (módulo inexistente). Después de la implementación NO se pudo ver verde en local: `test/setup.ts` espera MySQL y se colgó 120 s (los 6 tests quedaron "skipped"). Lo corre CI.
- `pnpm typecheck:tests`: falla con 263 errores contra 175 de base, todos en archivos que este plan no toca (`test/unit/combos-generator.test.ts`, `tecnica-generator`, `email/sender`, `analytics`, `wellhub`, etc.; son TS2835/TS7006 y Buffer). Es una discrepancia de entorno previa al plan; `aura-amounts.test.ts` no aparece. No se corrigió (fuera de alcance).
- Greps del plan: `amount: (10|50)` vacío en attendance y onboarding; `?? (15|100)` = 0 en programas; 4 llamadas a `awardOncePerLocalDay` con `amount`.

## Deviations from Plan

None en lo funcional. Detalles menores:
- Se corrió prettier sobre `programs/service.ts` y otros archivos tocados; el reformateo de `programs/service.ts` (líneas largas de la tarea 2) quedó en el commit de la tarea 3.
- Se reescribieron comentarios que mencionaban "+5 AURA" en `free-blocks-service.ts` y `stretch-service.ts` (y "10 AURA" en `attendance/service.ts`) sin número.

## Decisiones del ejecutor

- Ninguna decisión de producto nueva. Se siguió el plan tal cual (override `streak.*` conservado, descripción del asiento de racha sin tocar).

## Notas para el plan 03

- Los tests de integración que afirman montos viejos (10/50/20..200/50-100-250, 15/100) quedan rotos hasta el plan 03.
- `milestoneAura` conserva firma; ahora devuelve 15/25/50.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Archivos y los 4 commits verificados con `git log`.
