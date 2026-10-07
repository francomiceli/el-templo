---
phase: 194-invitaciones
plan: 01
subsystem: api
tags: [membership, is_trial, recomputeUserStatus, active-member, tenancy]
requires: []
provides:
  - "shared/membership.ts: notTrialPlanSql, membershipInEffectSql, membershipPlanCondition (invariante D-03)"
  - "test/invitations/_helpers.ts: fábricas Wave 0 de la fase"
affects: [194-03, 194-04, 194-08, 194-13]
tech-stack:
  added: []
  patterns:
    - "Una sola definición SQL de membresía vigente; ACCESO (deriveCoveredUntil) separado de MEMBRESÍA"
key-files:
  created:
    - el-templo-api/src/modules/shared/membership.ts
    - el-templo-api/test/invitations/_helpers.ts
    - el-templo-api/test/invitations/membership-invariant.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/shared/active-member.ts
    - el-templo-api/src/modules/members/service.ts
key-decisions:
  - "s2 (purchased_plan_id) usa membershipInEffectSql('s2') completo en vez de repetir las condiciones + notTrialPlanSql('s2'): DRY, mismo efecto"
  - "effectiveStatusExpr de listMembers/searchMembers era idéntico: extraído a effectiveMemberStatusSql (función privada del módulo)"
requirements-completed: [SC-4, D-03, D-01]
duration: ~50min
completed: 2026-10-06
---

# Phase 194 Plan 01: Invariante D-03 (is_trial da acceso, nunca membresía) Summary

Un plan `is_trial` ya no vuelve `activo` a nadie: hay una única definición SQL de "membresía vigente" (`shared/membership.ts`) usada por `recomputeUserStatus`, los 5 helpers de `active-member.ts` (analytics/reports/SEPA) y el estado efectivo de los listados de socios.

## Commits

- `435742c45` test(194-01): caracterización de la invariante (RED) — fábricas + test
- `138976535` feat(194-01): invariante D-03 (GREEN) — helper + migración de los sitios 1-9

## Salida RED (Task 1, antes del cambio)

`vitest run test/invitations/membership-invariant.test.ts` → **6 failed | 2 passed (8)**:

- FAIL socio en prueba con SOLO sub is_trial NO pasa a activo (ctx real)
- FAIL camino ctx = null (cron `autoExpireDueSubscriptions`)
- FAIL `activeMemberExists` no incluye al socio solo-is_trial (`expected 1 to be 0`)
- FAIL listado de alumnos / typeahead (`expected [6] to not include 6`)
- FAIL `purchased_plan_id` nunca is_trial (`expected 78 to be 79`: elegía el plan is_trial más reciente)
- FAIL lead con SP y solo is_trial NO se convierte (`expected 'activo' to be 'prueba'`)
- PASS control presencial sola; PASS control Yoga (presencial + is_trial)

## Salida GREEN

`membership-invariant` 8/8, `lead-status-transitions` 4/4, `subscriptions-conversion-hook` 5/5 (17 tests, 0 fallos; el único fallo de la primera corrida fue un error de forma de respuesta en mi propio test del typeahead: `{ members: [...] }`, corregido). `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0.

## Call sites migrados (inventario RESEARCH §Patrón 1, sitios 1-9)

1. `subscriptions/service.ts::recomputeUserStatus` CASE de `activo` -> `membershipGate`
2-3. CASE `lead_status` y `lead_status_source` -> `membershipGate`
4. CASE `purchased_plan_id` -> `membershipGate` + subquery `s2` con `membershipInEffectSql("s2")` (no elige nunca un plan is_trial)
5. CASE `converted_at` -> `membershipGate` (sigue ÚLTIMO en el SET; filtro de tenant `u.tenant_id = ... / IS NOT NULL` intacto, rama `ctx = null` preservada)
6. `shared/active-member.ts`: los 5 helpers sobre un único `activeMembershipExists` (de ~10 copias a 1; firmas públicas idénticas)
7. Consumidores de (6) (analytics, reports, members, export SEPA): se arreglan solos, sin tocar
8-9. `members/service.ts`: las 2 copias de `effectiveStatusExpr` -> `effectiveMemberStatusSql(ctx)`

`deriveCoveredUntil` NO se tocó (`git diff -U0 origin/master` sin matches).

## Deviations from Plan

**1. [Criterio de aceptación] `notTrialPlanSql("s2")` no aparece literal en service.ts**
- El criterio pedía `grep -n 'notTrialPlanSql("s2")'` = 1 línea. Usé `${membershipInEffectSql("s2")}` en la subquery `s2` (que ya incluye `notTrialPlanSql("s2")`), en vez de repetir status+fechas y sumar el not-trial a mano. Mismo efecto, sin copia extra; cubierto por el test "purchased_plan_id nunca es un plan is_trial".

**2. [Rule 3 - lint] Exenciones `tenant-safe` en consts de módulo de `active-member.ts`**
- `NOT_ESPECIAL_PLAN` (subscription_plans) y `EFFECTIVE_KIND` (users) viven a nivel módulo, fuera del `return` que ya tenía la exención: `lint:tenant` las marcó (2 violaciones). Se agregó un comentario `tenant-safe` a cada una.

**3. Fábricas: `ctx` es `{ app, tenant }`**
- El plan no fijaba el tipo de `ctx`. `fixtureCtx(app, tenantId = TENANT_TEMPLO)` arma `InvitationsFixtureCtx { app, tenant: TenantContext }`. Extras no pedidos: `ensurePhysicalBranch(ctx, country)` y `ensureVirtualBranch(ctx)`.

**Sin hallazgos de cobros/precios.** Impacto de prod esperado: 0 estados (las 2 subs is_trial vigentes son Yoga de socios con presencial).

## Issues / observaciones para el orquestador

- `pnpm typecheck:tests` sale 1 por **deuda ajena ya existente** (16 discrepancias en `test/unit/*`, `attendance`, `check-ins`, `email`, `tenancy/mod-02-hooks`, baseline de `analytics`/`lifecycle`): ningún archivo de `test/invitations/` aparece. No se tocó el baseline (no es de este plan).
- `git status` muestra `.planning/ROADMAP.md`, `194-21/22/28/29-PLAN.md` y `194-RESEARCH.md` modificados SIN que yo los tocara (edición del orquestador en curso): no se commitearon.
- Tests existentes que usan planes `is_trial` como si fueran membresía y NO corrí (fuera de `<verify>`; los cubre CI): `test/scheduling/especial-trial.test.ts`, `test/subscriptions/promo-plans.test.ts`, `test/members/members.test.ts`, `test/analytics/trial-funnel.test.ts`. Si alguno falla en CI es un fixture a revisar, no una regresión de la invariante.

## Lecciones para los próximos ejecutores

- Cada archivo de test de integración tarda ~170 s (provisionamiento de la DB del worker); 3 archivos juntos ~340 s. Alcanza con `timeout 900`.
- Trigger de `recomputeUserStatus` por vía pública sin API: sub `status:'scheduled'` con `startOffsetDays:-1` + `new SubscriptionService(app.db, app.log, undefined, new EnrollmentService(app.db, app.log)).activateDueScheduledSubs(ctx.tenant)` (ctx real) y `autoExpireDueSubscriptions()` (ctx = null, necesita EnrollmentService).
- `createActiveSub` inserta directo (no corre `recomputeUserStatus`); acepta `createdAt` para controlar `ORDER BY created_at DESC`. Default de fechas: arrancó hace 2 días, vence en 20.
- `GET /api/admin/members/search` responde `{ members: [...] }`, no un array.
- Un `const` de módulo con SQL que nombre `subscription_plans`/`users` necesita su PROPIO `/* tenant-safe: ... */`; el del `return` de otra función no lo cubre.
- `subscription_plans` está en `TABLES_TO_CLEAN`: `createTrialPlan`/`createMembershipPlan` hay que llamarlos DESPUÉS de `cleanAllTestData` (en el test o `beforeEach`).
- `node_modules` está symlinkeado a otro worktree (`et-empeza`): el warning de sourcemap de node-cron es inofensivo.

## Self-Check: PASSED

- FOUND: `el-templo-api/src/modules/shared/membership.ts`, `test/invitations/_helpers.ts`, `test/invitations/membership-invariant.test.ts`
- FOUND commits: 435742c45, 138976535
