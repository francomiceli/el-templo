---
phase: 161-n-cleo-actividades-gateadas-pase-mensual-y-enforcement
plan: 02
subsystem: subscriptions
tags: [especial-pass, assign, renew, referrals-guard, budget, d-01, d-09]
requires:
  - planCategory 'especial' (enum + tipo + whitelists)
  - subscription_plans.monthly_class_budget + requires_presencial
  - categoryGroup (grupo de categoría de 3 valores)
provides:
  - assignPlan vende el pase especial (conflicto por grupo, budget explícito, D-01, D-09)
  - renewSubscription renueva el pase por subscriptionId explícito (discriminador presencial+pase)
  - guard D-09 en los 4 callsites de referral (assign/changePlanNow/changePlanAfterCurrent/renew)
  - PlanListItem/getPlanById exponen monthlyClassBudget + requiresPresencial
affects:
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-api/src/modules/subscriptions/types.ts
  - el-templo-api/src/modules/subscriptions/schemas.ts
tech-stack:
  added: []
  patterns:
    - Conflicto de suscripción por grupo de categoría de 3 valores (categoryGroup) en vez del binario isOnlinePlan
    - Budget derivado con override explícito (monthlyClassBudget cuando classesPerWeek es NULL)
    - Discriminador de renovación por subscriptionId con validación de ownership (T-161-04)
    - Guard de categoría 'especial' en las charge-paths para excluir referidos (D-09)
key-files:
  created:
    - el-templo-api/test/subscriptions/especial-pass.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
decisions:
  - "renewSubscription lee subscriptionId de RenewSubscriptionInput (el input completo ya se forwardea) en vez de un 4º parámetro — routes.ts no cambia, consistente con cómo se threadean startDate/scheduleIds"
  - "Los 2 callsites de isOnlinePlan restantes (service.ts:251 assertPlanInvariants, member-routes.ts:194-195 sort) se dejan sin migrar: su semántica no se rompe con especial en el flujo real"
  - "Planes especiales de test seedeados vía Drizzle insert (mirror de la migración 0179), no vía la ruta admin create-plan (no persiste las columnas nuevas todavía)"
metrics:
  duration: ~28min
  completed: 2026-07-14
---

# Phase 161 Plan 02: Venta y renovación del pase especial Summary

Extiende `assignPlan` y `renewSubscription` para vender/renovar el pase "Actividades con Aura" sin regresiones: conflicto de suscripción por grupo de categoría de 3 valores (el pase no choca con presencial ni online), budget mensual explícito de 2, validación server-side "presencial activo" del pase Socio (D-01), exclusión total de referidos (D-09) en los 4 callsites de charge, y discriminador `subscriptionId` para renovar la sub correcta cuando hay presencial + pase activos.

## What Was Built

**Task 1 — assignPlan** (`31a25114`):

- **Conflicto por grupo (D-35 extendido):** el binario `isOnlinePlan` (que colapsaba `especial` con online) se reemplaza por `categoryGroup(plan.planCategory)`. Se construye un `sameGroupCategoryCondition` de 3 ramas (presencial → `eq presencial`; especial → `eq especial`; online → `ne presencial AND ne especial`). Un usuario puede tener en paralelo una sub por grupo (presencial + online + especial); dos del mismo grupo siguen rechazadas con 409 (mensaje por grupo, incl. "ya tiene un pase de actividades activo").
- **Budget explícito (PASE-01):** cuando `plan.classesPerWeek === null` el budget usa `plan.monthlyClassBudget ?? null` en vez de `null`; `classesBudget` = ese mismo valor. Los planes online siguen NULL.
- **Validación D-01 (T-161-03):** tras el conflicto de grupo, si `plan.requiresPresencial`, se consulta `getMemberSubscriptions` y se exige una sub `planCategory==='presencial'` en estado active/paused; si no, `BadRequestError("El pase Socio requiere un plan presencial activo. Ofrecé el pase Externo.")`.
- **Guard D-09 (T-161-05):** el par `qualifyReferralOnCharge` + `computePriceWithReferralDiscount` queda envuelto en `if (plan.planCategory !== "especial")`. `recordReferralCreditOnCharge` pasa a leer las variables externas `referralDiscountPercent/Amount ?? 0` (no-op cuando es especial).
- `PlanListItem` + `mapPlanRow` exponen `monthlyClassBudget` y `requiresPresencial` (getPlanById los devuelve).

**Task 2 — renewSubscription + changePlan** (`de87084b`):

- **Discriminador `subscriptionId` (PASE-04, Open Q 2):** nuevo campo opcional en `RenewSubscriptionInput` + `renewSubscriptionSchema`. Cuando viene, `renewSubscription` selecciona esa sub con `and(id, userId)` — si no matchea, `NotFoundError` (T-161-04, evita renovar sub ajena). Sin él, mantiene la selección active-first histórica (backward-compat). La ruta no cambia: ya forwardea `request.body` completo.
- **Budget explícito en renew:** `periodBudget` usa `monthlyClassBudget` cuando `classesPerWeek` es NULL, igual que assign.
- **Validación D-01 en renew (D-02):** si el plan de la sub renovada tiene `requiresPresencial`, se re-evalúa presencial active/paused; si dejó de ser socio, no se le renueva el Socio (mismo BadRequestError que assign).
- **Guard D-09 en los 3 callsites restantes:** `changePlanNow` (`if targetPlan.planCategory !== 'especial'`), `changePlanAfterCurrent` (idem), `renewSubscription` (`if plan.planCategory !== 'especial'`). Con el de assign, quedan los **4** callsites de referral guardados. Los 3 `recordReferralCreditOnCharge` afectados pasan a las variables externas.

**Task 3 — Tests de integración** (`954f177e`):

- `test/subscriptions/especial-pass.test.ts`, 6 casos (todos verdes): PASE-02 positivo (2 subs en paralelo + budget 2), PASE-02 negativo/D-01 (400 con "presencial activo"), PASE-03 (Externo sin presencial), PASE-04 (renew por subscriptionId extiende la especial, resetea a 2), D-09 assign (no flip pending + sin descuento) y D-09 renew (cubre específicamente el callsite `:3966-3967` que el BLOCKER identificó sin guard).

## Verification

- `npx tsc --noEmit` verde tras cada tarea.
- `npx vitest run test/subscriptions/especial-pass.test.ts`: **6/6 pasan**.
- Acceptance greps: `categoryGroup` y `requiresPresencial` matchean el nuevo conflicto y la validación D-01; `planCategory !== "especial"` matchea **4** veces (los 4 callsites de referral); `subscriptionId` presente en schemas.ts.
- No se corrió la suite completa local (regla del repo — corre en CI).

## Deviations from Plan

### Ajustes de implementación (no cambian comportamiento)

**1. [Rule 3 - Blocking] `routes.ts` no se modificó**

- **Encontrado en:** Task 2.
- **Motivo:** el plan sugería pasar `request.body.subscriptionId` como 4º parámetro a `renewSubscription`. La ruta ya forwardea `request.body` completo (tipado `RenewSubscriptionInput`), así que agregar `subscriptionId?: number` al input + schema es suficiente y más DRY (consistente con cómo se threadean `startDate`, `scheduleIds`, etc.). `routes.ts` queda intacto — `files_modified` del plan lo listaba pero no hizo falta tocarlo.
- **Archivos:** `types.ts`, `schemas.ts`.

**2. [Rule 3 - Blocking] Planes especiales de test vía Drizzle insert, no createPlan**

- **Encontrado en:** Task 3.
- **Motivo:** la ruta admin create-plan todavía NO persiste `monthly_class_budget` ni `requires_presencial` (ese ABM es de una ola posterior) y trata `especial` como online en `assertPlanInvariants` (callsite de `isOnlinePlan` diferido). El seed directo vía `app.db.insert(schema.subscriptionPlans)` mirror-ea cómo prod obtiene estos planes (migración 0179 INSERT) y controla `classesPerWeek=NULL` + `monthlyClassBudget=2` + `requiresPresencial`. El plan ya contemplaba esta alternativa ("o usá los 2 planes seedeados por 0179").
- **Archivos:** `especial-pass.test.ts`.

### Callsites de `isOnlinePlan` — decisión por callsite (Task 1)

El plan pedía migrar a `categoryGroup` sólo si `especial` rompe la semántica:

- **`service.ts:1300` (conflicto de assign):** MIGRADO a `categoryGroup` — era el que rompía (`especial` chocaba con online).
- **`service.ts:251` (assertPlanInvariants):** SIN CAMBIO. Sólo corre en create/updatePlan; los planes especiales entran por migración (INSERT directo), nunca por esa ruta en prod, así que el invariante no aplica. Migrarlo es alcance del ABM de planes (ola posterior).
- **`member-routes.ts:194-195` (orden del listado de planes del member app):** SIN CAMBIO. Es sólo ordenamiento de display (presencial primero, luego el resto); `especial` cae en el bucket "no-presencial" sin romper nada. El refinamiento del listado member es fase 162.

## Known Stubs

Ninguno. El pase queda vendible y renovable end-to-end del lado assign/renew con las reglas D-01/D-09 y budget explícito. El enforcement en `reserve()`, el consumo por asistencia (check-in), la exclusión de métricas y el ABM admin son alcance de las olas 3+ de esta fase, por diseño.

## Self-Check: PASSED

- Archivo creado: `especial-pass.test.ts` FOUND.
- Commits `31a25114`, `de87084b`, `954f177e` FOUND en git log.
- 6/6 tests verdes, tsc verde, 4 callsites de referral guardados.
