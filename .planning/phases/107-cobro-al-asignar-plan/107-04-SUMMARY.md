---
phase: 107-cobro-al-asignar-plan
plan: 04
subsystem: admin-frontend-types
tags: [types, frontend, admin, subscription, charge]
requires: []
provides:
  - "AssignPlanInput.amountReceived?: number"
  - "RenewSubscriptionInput.amountReceived?: number"
affects:
  - el-templo-admin/src/types/subscription.ts
tech_stack:
  added: []
  patterns:
    - "Optional payload field for backward compatibility (Phase 107 D-19)"
key_files:
  created: []
  modified:
    - el-templo-admin/src/types/subscription.ts
decisions:
  - "Field name is `amountReceived` per locked decisions D-12/D-13."
  - "Field is optional (`?:`) to preserve existing callers per D-19 backward-compat."
  - "No separate ChangePlanInput type exists in admin frontend; AssignPlanInput is reused at callsites, so a single edit covers assign + change."
metrics:
  duration_seconds: 81
  completed_date: 2026-04-28
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
requirements_completed:
  - CHARGE-01
---

# Phase 107 Plan 04: Frontend Types — amountReceived Summary

Extiende `AssignPlanInput` y `RenewSubscriptionInput` con el campo opcional `amountReceived?: number` para que `AssignPlanDialog.vue` (Plan 05) y futuros consumers puedan tipar el payload sin `any`.

## Tasks Completed

| Task | Name                                                                               | Commit     | Files                                       |
| ---- | ---------------------------------------------------------------------------------- | ---------- | ------------------------------------------- |
| 1    | Agregar amountReceived a AssignPlanInput, RenewSubscriptionInput, ChangePlanInput  | `490919bf` | `el-templo-admin/src/types/subscription.ts` |

## Implementation Details

- **AssignPlanInput**: Se añadió `amountReceived?: number` como último campo de la interfaz, con JSDoc en español que cita las decisiones D-12 y D-13 y documenta la semántica backward-compat (`undefined → backend defaults to pricePaid`) y la regla de validación frontend (`0 <= amountReceived <= chargeBase`).
- **RenewSubscriptionInput**: Se añadió `amountReceived?: number` con JSDoc breve (`undefined → renewalPrice`).
- **ChangePlanInput**: Verificado por `grep` — no existe como tipo separado en el archivo. Los callsites de change-plan reusan `AssignPlanInput`, por lo que el campo nuevo ya queda disponible para esa ruta sin trabajo adicional.

## Verification

- `grep -cE "amountReceived\?: number" el-templo-admin/src/types/subscription.ts` → **2** (cumple `≥ 2`).
- `grep -cE "amountReceived: number" el-templo-admin/src/types/subscription.ts` → **0** (campo siempre opcional, sin variantes required).
- `npx vue-tsc --noEmit` filtrado por `subscription.ts | amountReceived` → **0 errores** introducidos por este plan.
- El typecheck global muestra errores pre-existentes (faltan `node_modules` en el worktree y `any` implícitos en `SessionsPage.vue`/`SessionEditPage.vue` no relacionados). Per la regla de Scope Boundary del executor, esos issues quedan fuera de este plan.

## Deviations from Plan

None — el plan se ejecutó tal como estaba escrito. La verificación automatizada del plan invocaba `pnpm typecheck`, pero el script no existe en `el-templo-admin/package.json`; se sustituyó por `npx vue-tsc --noEmit` con filtrado por archivo, lo que cumple el espíritu de la verificación (cero errores nuevos introducidos por el cambio).

## Known Stubs

Ninguno. El cambio añade únicamente type definitions; no hay rutas, datos o componentes que queden en estado stub.

## Threat Flags

Ninguno. Este plan modifica sólo type definitions en el frontend; no introduce nueva superficie de red, auth, file access ni cambios de schema en límites de confianza.

## Self-Check: PASSED

- File `el-templo-admin/src/types/subscription.ts` exists and was modified (verified via `git status` and edit success).
- Commit `490919bf` exists in `git log` (verified via `git rev-parse --short HEAD` immediately after commit).
- SUMMARY.md created at `.planning/phases/107-cobro-al-asignar-plan/107-04-SUMMARY.md`.
