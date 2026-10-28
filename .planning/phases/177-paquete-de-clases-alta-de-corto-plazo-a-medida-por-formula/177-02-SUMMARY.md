---
phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula
plan: 02
subsystem: subscriptions
tags: [aura, referidos, plan-category, discounts, service-layer]

# Dependency graph
requires:
  - phase: 177-01
    provides: "enum plan_category acepta 'paquete', categoryGroup/isOnlinePlan tratan paquete como presencial-flexible"
provides:
  - "excludedFromReferrals(c) / excludedFromAura(c) — predicados DRY de elegibilidad de descuento por categoría en types.ts"
  - "paquete excluido de Aura y de referidos en los 9 callsites de composición de precio de service.ts (assignPlan, changePlanNow, changePlanAfterCurrent, previewChangePlan, renewSubscription, getPricingPreview)"
affects: [177-03, 177-04, 177-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Predicado por-categoría exportado (excludedFromReferrals/excludedFromAura) en vez de literal inline repetido — mismo patrón que categoryGroup/isOnlinePlan de la fase 161/177-01"
    - "Guard AURA asimétrico entre paths de cobro (throw BadRequestError) y preview (no-throw, simplemente no computa) — igual asimetría que ya existía entre cobro real y preview para referidos"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/service.ts

key-decisions:
  - "excludedFromAura NO incluye 'especial' — el pase especial sigue pudiendo recibir descuento AURA como hoy (D-13 solo dice paquete; el guard de especial en Aura nunca existió, no se agrega uno nuevo)"
  - "Los 3 bloques Aura de paths de cobro (assignPlan, changePlanAfterCurrent) lanzan BadRequestError si llega auraSpend>0 con un plan paquete — defensa server-side porque el payload es untrusted (T-177-04), aunque el front nunca ofrezca la opción. renewSubscription no tiene bloque Aura (RenewSubscriptionInput no expone auraSpend, verificado por grep) — nada que guardar ahí."
  - "getPricingPreview (no cobra) NO lanza — simplemente no computa el descuento AURA para paquete, siguiendo el patrón exacto pedido por el plan (preview silencioso, cobro explícito)"
  - "Los line-numbers estimados en el plan para 'renew ~3749'/'renew2 ~4175' correspondían en realidad a changePlanAfterCurrent (~3749, método privado invocado por changePlan cuando startMode='after_current') y renewSubscription (~4175) respectivamente — confirmado con grep de nombres de método antes de editar, sin impacto en el resultado (mismos 9 callsites migrados, mismo mecanismo)"

patterns-established: []

requirements-completed: [D-13]

# Metrics
duration: ~20min
completed: 2026-08-14
---

# Phase 177 Plan 02: Exclusión de paquete de Aura y referidos (D-13) Summary

**Dos predicados DRY en `types.ts` (`excludedFromReferrals`, `excludedFromAura`) reemplazan el criterio inline `planCategory !== "especial"` en los 9 callsites de composición de precio de `service.ts`, sumando `paquete` a la exclusión de referidos y AURA sin tocar la lógica de asignación/overlap de `assignPlan`.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2/2 completados
- **Files modified:** 2

## Accomplishments

- `excludedFromReferrals(c: PlanCategory)` → true para `'especial'` (precedente D-09/T-161-05) y `'paquete'` (D-13).
- `excludedFromAura(c: PlanCategory)` → true SOLO para `'paquete'` (D-13); `'especial'` no se toca en Aura (comportamiento actual preservado).
- Migrados los 6 guards de referidos (literal `!== "especial"` → `!excludedFromReferrals(...)`):
  - `assignPlan` línea 1520 (`plan.planCategory`)
  - `previewChangePlan` línea 3090 (`targetPlan.planCategory && netAmount > 0`)
  - `changePlanNow` línea 3287 (`targetPlan.planCategory`)
  - `changePlanAfterCurrent` línea 3803 (`targetPlan.planCategory`)
  - `renewSubscription` línea 4203 (`plan.planCategory`)
  - `getPricingPreview` línea 4674 (`plan.planCategory && finalPrice > 0`)
- Migrados los 3 bloques Aura:
  - `assignPlan` línea 1481 — guard `excludedFromAura(plan.planCategory)` → `throw BadRequestError("Los paquetes de clases no aceptan descuento AURA")` antes de tocar `auraService.spend`.
  - `changePlanAfterCurrent` línea 3771 — mismo guard con throw sobre `targetPlan.planCategory`.
  - `getPricingPreview` línea 4648 — sin throw: `auraSpend && auraSpend > 0 && !excludedFromAura(plan.planCategory)` (el preview no cobra, así que simplemente no computa el descuento).
- Confirmado por grep que `renewSubscription`/`RenewSubscriptionInput` no exponen `auraSpend` — no hay un cuarto bloque Aura que migrar ahí.
- `assignPlan` overlap/conflict logic (`sameGroupCategoryCondition`, sección "category GROUP") verificado sin diff — hard constraint respetado.
- Grep de control post-edición: cero ocurrencias residuales del literal `!== "especial"` en `service.ts`; 9 usos de `excludedFromReferrals`/`excludedFromAura` (más el import).

## Task Commits

Each task was committed atomically:

1. **Task 1: Predicados DRY de elegibilidad de descuento en types.ts** - `503305d2` (feat)
2. **Task 2: Aplicar exclusión de paquete en todos los paths de cobro** - `5bf80051` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/subscriptions/types.ts` - agrega `excludedFromReferrals`/`excludedFromAura` exportados, comentario con rationale D-13
- `el-templo-api/src/modules/subscriptions/service.ts` - import de los 2 predicados nuevos; 6 guards de referidos + 3 bloques Aura migrados del criterio inline al predicado; `assignPlan` overlap logic sin cambios

## Decisions Made

Ver `key-decisions` en el frontmatter — resumen: `excludedFromAura` no incluye `especial` (fuera de alcance de D-13); los paths de cobro (assign/changePlanAfterCurrent) rechazan con `BadRequestError` si llega `auraSpend` con un plan paquete, el preview no lanza; `renewSubscription` no tiene bloque Aura que migrar (input no lo soporta).

## Deviations from Plan

None — plan ejecutado según lo escrito. Los line-numbers de la interfaz del plan eran aproximados (advertido explícitamente en el plan: "verificar con grep antes de editar — los números pueden correrse") y se resolvieron correctamente vía grep + lectura de nombres de método antes de cada edit (ver key-decisions).

## Issues Encountered

None — los 2 tasks se ejecutaron sin bloqueos. Typecheck (`npx tsc --noEmit`) en verde tras cada task.

## User Setup Required

None - no requiere configuración externa. No hay migración nueva en este plan (solo lógica de servicio).

## Next Phase Readiness

- Los predicados `excludedFromReferrals`/`excludedFromAura` y los 9 callsites migrados están listos para que 177-03/04 (UI de alta con selectores de paquete) ofrezcan el plan `paquete` sabiendo que el backend ya rechaza/omite descuentos correctamente, y para que 177-05 (tests) escriba los casos de exclusión sobre esta base.
- El gap de `sameGroupCategoryCondition` en `assignPlan` documentado en 177-01-SUMMARY.md sigue pendiente y sin tocar — no es parte del alcance de este plan (D-13 es guard de precio, no de asignación).
- Verificación local: `cd el-templo-api && npx tsc --noEmit` → limpio tras cada task.
- No se corrió el suite de integración local (regla del repo — los tests de exclusión viven en 177-05, corren en CI).

---

_Phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula_
_Completed: 2026-08-14_

## Self-Check: PASSED

All modified files verified present on disk; both task commits (`503305d2`, `5bf80051`) verified present in `git log --oneline --all`.
