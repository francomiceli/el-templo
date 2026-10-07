---
phase: 194-invitaciones
plan: 31
subsystem: api
tags: [membership, is_trial, analytics, reports, finance]
requires: ["194-03"]
provides:
  - "Indicadores de MEMBRESÍA restantes (distribución de planes, inactivos, hasActivePlan, bajas/churn/retención/renovación) ignoran subs de planes is_trial"
  - "analytics/especial-exclusion.ts: excludeTrialSubs() (compuesto en excludeInternalSubs y usado suelto en la renovación)"
key-files:
  modified:
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/src/modules/analytics/especial-exclusion.ts
    - el-templo-api/src/modules/analytics/renewal-service.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/test/invitations/membership-invariant.test.ts
requirements-completed: [SC-4, D-03]
completed: 2026-10-06
---

# Phase 194 Plan 31: Indicadores de membresía restantes Summary

Un invitado con solo accesos `is_trial` ya no aparece como socio en la distribución de planes, el reporte de inactivos, el badge `hasActivePlan` de la bandeja de caja ni en las métricas de bajas/churn/retención/renovación.

## Commits

- `826b4c524` feat(194-31): indicadores de membresía restantes sin planes is_trial (D-03) (Task 1)

## Sitios migrados

| Sitio | Cambio |
|-------|--------|
| `analytics/service.ts::getPlanDistribution` | `membershipPlanCondition()` (ninguna fila de plan is_trial) |
| `analytics/service.ts::countChurnedMembers` (legacy) | `membershipPlanCondition()` |
| `analytics/service.ts::computeRetentionRate` (legacy) | `membershipPlanCondition()` en vencidos + `notTrialPlanSql("s2")` en la sub "renovada" |
| `analytics/service.ts::getRenewalRate` (legacy) | `notTrialPlanSql("subscriptions")` en vencidos |
| `reports/service.ts::getInactiveMembers` (también alimenta el export) | `notTrialPlanSql("s")` |
| `finance/transaction-service.ts::listPendingTray` `hasActivePlan` | `notTrialPlanSql("s")` dentro del EXISTS (conserva `s.tenant_id = financial_transactions.tenant_id` y el status `scheduled`) |
| `analytics/especial-exclusion.ts` | nueva `excludeTrialSubs()`; `excludeInternalSubs()` la compone, así que churn, retención y member-flows (8 call sites) quedan cubiertos |
| `analytics/renewal-service.ts` | `excludeTrialSubs()` (esta query no usaba `excludeInternalSubs`) |

## NO migrados a propósito (display del plan que la persona tiene)

`members/service.ts` (nombre de plan en listado y panel de turno, filtro por plan, `membership_kind`) y `analytics/engagement-service.ts` `planNameExpr`: para un invitado "Invitación" es el plan real que tiene, así que se muestra.

## Verificación de churn / altas (criterio d)

- Altas: `countNewMembers` ya excluía is_trial vía `activePayingNonEspecialMemberExists` -> `membershipInEffectSql` (194-01). Sin cambios.
- Churn/retención/flujos: `excludeInternalSubs` filtra por `membership_kind = 'paga'`, y eso NO cubre las invitaciones: una sub de plan is_trial solo queda `bonificada` si se carga con precio pisado en 0; por defecto (y con `createActiveSub`) es `paga`. Por eso se agregó el filtro por plan. El test cubre sub trial `paga`, sub trial `bonificada` y sub trial cancelada.
- Renovación (`RenewalService`) no tenía ni la exclusión de internas: se agregó solo la de is_trial.

## Tests

- `test/invitations/membership-invariant.test.ts` 16/16 (+4: distribución de planes, reporte de inactivos, `hasActivePlan` por HTTP en `/pending-tray`, y bajas/churn/renovación/legacy con sub trial paga + bonificada + cancelada y control con presencial).
- Mutation testing: revertí `src/modules/{analytics,reports,finance}` y corrí el archivo: los 4 casos nuevos fallaron (12 viejos pasaron); restaurado el cambio y verde.
- `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `typecheck:tests` sin errores en los archivos tocados.

## Deviations from Plan

**1. [Rule 3 - alcance] `analytics/renewal-service.ts` y `analytics/especial-exclusion.ts` modificados (fuera de `files_modified`).** Necesario para cumplir "churn/retención/renovación no cuentan subs is_trial": la etiqueta `membership_kind` no alcanza (ver arriba). Es un cambio de métricas de analytics, no de cobros ni precios.

## Candidatos no migrados (decisión de orquestador)

- `expiry-cohort.ts::lastExpiryPerPersonExpr` (`s2`) y `retainedExpr` (`s_next`) no excluyen is_trial: una sub is_trial posterior a un vencimiento real podría contarse como "continuación" (retenido) o ser el "último vencimiento" que oculta al real. Caso de borde (invitar a alguien cuya membresía acaba de vencer). Arreglarlo requiere sumar `s_next` a `SubAlias` de `shared/membership.ts` o inlinear la subquery.

## Lecciones

- `membership_kind` NO distingue invitaciones de membresías pagas: para analytics de membresía hay que filtrar por plan (`is_trial`), no por etiqueta.
- `pending-tray` se prueba por HTTP con `ensureEfectivoCaja` + insert directo de `financial_transactions` (después de `cleanAllTestData`, que vacía las cajas).
- El hook de git del harness rechaza comandos que combinan `cd` + `git` o `git -C` con rutas calculadas: usar `cd` en una llamada y `git ...` plano en otra.
- Archivo de integración: ~115-120 s.

## Self-Check: PASSED

- FOUND commit 826b4c524; worktree limpio tras el commit.
- `grep "shared/membership"` devuelve línea en analytics/service.ts, reports/service.ts y transaction-service.ts (y especial-exclusion.ts).
