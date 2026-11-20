---
phase: 214-comunidad-anotados-aura
plan: 07
subsystem: admin-aura
tags: [aura, admin, D-22, D-19]
requires: ["214-06"]
provides:
  - "El admin ya no ofrece descuento por Aura; el asistente de programas propone 8 y 50"
affects: []
key-files:
  modified:
    - el-templo-admin/src/components/AssignPlanDialog.vue
    - el-templo-admin/src/components/ProgramWizardDialog.vue
decisions:
  - "Se retiró también el import AURA_DISCOUNT_TIERS de AssignPlanDialog porque solo lo usaba auraOptions"
metrics:
  tasks: 2
  completed: 2026-11-17
---

# Phase 214 Plan 07: descuento por Aura apagado en el admin Summary

Se quitó el selector "Descuento AURA" del diálogo de asignar plan (comentario D-22 con instrucciones para restaurarlo) y los defaults del asistente de programas pasaron a 8 por semana y 50 por programa.

## Commits

- `1f95c1025` feat(214-07): apagar el descuento por Aura en el admin (D-22)
- `1649255c2` feat(214-07): defaults de Aura del asistente de programas en la escala nueva

## Detalle

- `AssignPlanDialog.vue`: bloque `<!-- AURA discount -->` reemplazado por comentario; eliminados `auraOptions` y el import `AURA_DISCOUNT_TIERS`. Los envíos de `auraSpend` (`?? undefined`) y los resets a `null` no se tocaron; no hay ninguna asignación numérica a `auraSpend`. La API queda intacta.
- `ProgramWizardDialog.vue`: `auraWeeklyBonus: 8` y `auraCompletionBonus: 50` en el estado inicial y en el reset (con comentario D-19). No había textos de ayuda que citaran 15 o 100.

## Verificación

- vue-tsc del admin: 36 errores antes y 36 después (igual que la línea de base, cero nuevos).
- `pnpm lint`: 0 errores, 8 warnings previos ajenos a los archivos tocados.
- Tests del admin: no se pueden correr en local (sin vitest).

## Deviations from Plan

None - plan executed exactly as written. (Nota: el plan menciona ~21 errores de base del admin; la base real registrada es 36 y es la que se usó.)

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 2 commits y los 2 archivos existen.
