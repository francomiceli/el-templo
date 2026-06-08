---
title: Rollout de datos v5.1 — poblar milestone_exercise_id (local + prod)
created: 2026-06-08
source: 135-02 (deferred)
priority: high
type: data-rollout
---

# Rollout de datos v5.1 — poblar `milestone_exercise_id`

Diferido desde la fase 135 (plan 135-02). El árbol del admin (135) y del miembro (134)
están listos a nivel código, pero `milestone_exercise_id` está NULL en todo el catálogo,
así que los hitos no tienen variantes asignadas y el árbol se ve "plano".

## Lo que falta (flujo de revisión de profes, fase 125)

1. Revisión/aceptación de las **1176 propuestas de dimensión `pending`** (gate humano; no hay bulk-accept).
2. Generación de propuestas de hito (`exercise_milestone_proposals` está vacía).
3. Revisión/aceptación de hitos (gate humano).
4. `bootstrap-milestones --apply` → escribe `milestone_exercise_id` localmente.
5. Replicar en **prod**: emitir migración `0146` desde el resultado real, con clave estable
   verificada contra prod (NO `exercise_id` —diverge—, NO `code_number` —5 valores—,
   NO `(exercise,route)` —183 duplicados—). Decidir keying con paridad real local↔prod.

## Detalle completo

`.planning/phases/135-*/135-02-DEFERRED.md`

## Por qué importa

Sin este rollout, las features de árbol de v5.1 (134/135) no muestran la jerarquía
hito→variantes — el problema original de Front Lever (~70 nodos planos) sigue visible.
