---
status: deferred
plan: 135-02
phase: 135-rbol-del-admin-jerarqu-a-visual-de-hitos-y-variantes-en-tree
reason: prod-data-rollout-prerequisite-missing
decided: 2026-06-08
decided_by: user (execute-phase checkpoint)
---

# 135-02 — DIFERIDO (no ejecutado)

## Decisión

Durante la ejecución de la Ola 2 el ejecutor escaló un bloqueo Rule 4. La investigación
de estado de la DB local destapó que la **premisa del plan es insatisfacible** con el
estado actual del catálogo, y el usuario decidió **diferir** la migración `0146` y cerrar
la fase 135 a nivel código (135-01/03/04), dejando esto como deuda documentada.

## Por qué la migración estática `0146` no es viable hoy

El plan 135-02 asumía que el `--apply` de Plan 01 ya había corrido localmente y producido
un set de asignaciones `exercise_id → milestone_exercise_id` para transcribir a prod. La DB
local NO está en ese estado (verificado 2026-06-08):

- `exercise_milestone_proposals`: **0 filas** (el heurístico de hitos nunca se persistió;
  `runApplyMilestones` lee `WHERE status='pending'` → no tiene nada que aceptar).
- `exercises.milestone_exercise_id`: **NULL en las 1493 filas** (nada que migrar).
- `exercise_dimension_proposals`: **1176, todas `pending`** → `--apply` ABORTA (exit 2) por el
  guard milestone-only.
- `code_number`: **solo 5 valores distintos** (banda 1–5) → NO sirve como clave estable cross-env.
- `(exercise, route)`: **183 pares duplicados** → fallback por clave natural haría fan-out.
- IDs locales 2979–4471 (re-seedeados con offset) → casi seguro ≠ IDs de prod.

## Qué falta realmente (el rollout de datos de v5.1)

El poblado de `milestone_exercise_id` NO es un paso auto-ejecutable de una fase de código.
Es el rollout de datos de v5.1, que por diseño es un flujo de **revisión de profes** (fase 125):

1. `bootstrap-dimensions` → hecho (1176 pending).
2. **Revisión/aceptación de las 1176 propuestas de dimensión** (gate humano, fase 125; no hay bulk-accept).
3. **Generación de propuestas de hito** (tabla vacía; nunca se generó).
4. **Revisión/aceptación de hitos** (gate humano).
5. `bootstrap-milestones --apply` → recién aquí escribe `milestone_exercise_id`.

Y el mismo flujo debe correr en **prod** por separado. No cabe en una migración SQL estática.

## Estado de la viz del admin

Los planes 135-01 (motor de poblado `--dry-run`/`--apply`), 135-03 (backend `variants[]` en
`/tree`) y 135-04 (render jerárquico) quedan listos. **Cuando los datos existan** (tras el
rollout de profes), la jerarquía hito→variantes se renderiza sin más cambios de código:
hoy los hitos simplemente no tienen variantes asignadas (`variants: []`), así que el árbol
del admin se ve correcto pero "plano" hasta que se pueble `milestone_exercise_id`.

## Próximo paso (deuda)

Planificar el rollout de datos de v5.1 como esfuerzo dedicado (probablemente una fase nueva):
revisión de profes de dimensiones → generación + revisión de hitos → apply local → emitir
`0146` desde un resultado real con clave estable verificada contra prod. Ver todo asociado.
