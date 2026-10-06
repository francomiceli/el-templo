---
phase: 194-invitaciones
plan: 05
subsystem: api
tags: [subscription-plans, migrations, invitations, partners]
requires: ["194-04"]
provides:
  - "subscription_plans.allows_invitation_discount (mig 0256, backfill D-23 guardado)"
  - "planes Invitación AR/ARS y ES/EUR (mig 0257)"
  - "isInvitationPlan, planAllowsInvitationDiscount (subscriptions/types.ts), invitationPlanIdsSql (shared/membership.ts), SubscriptionService.findInvitationPlan"
  - "CRUD del flag con piso duro server-side"
affects: [194-09, 194-14]
key-files:
  created:
    - el-templo-api/src/db/migrations/0256_plans_allows_invitation_discount.sql
    - el-templo-api/src/db/migrations/0257_invitation_plans.sql
    - el-templo-api/test/invitations/plans-and-flag.test.ts
  modified:
    - el-templo-api/src/db/schema/subscription-plans.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/shared/membership.ts
    - el-templo-api/src/modules/scheduling/partner-week-service.ts
    - el-templo-api/test/referral-partners/semana-gratis.test.ts
key-decisions:
  - "Plan Invitación con duration_days=6 + endDateOverride (194-09), sin relajar assertPlanInvariants"
  - "El flag baja solo a false si un update cambia categoría o is_trial a una excluida sin mandar el flag"
requirements-completed: [D-02, D-10b, D-23, D-14, SC-1, SC-3]
duration: ~1 h
completed: 2026-10-06
---

# Phase 194 Plan 05: flag por plan y planes Invitación Summary

Flag `allows_invitation_discount` con backfill D-23 que corre una sola vez, planes "Invitación" por país (paquete, is_trial, 6 días, 3 por semana, $0) identificables sin ambigüedad en TS y SQL, CRUD del flag con piso duro, y guard para que la semana de regalo de partners nunca elija un plan is_trial.

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `ef89b74e5` | schema + migraciones 0256/0257 (mismo commit) + helpers + `findInvitationPlan` + tests de migración |
| 2 | `ec6025a3e` | CRUD del flag (create/update/list/detail) con piso duro + guard Pitfall 2 + tests |

## Decisión: endDateOverride vs relajar assertPlanInvariants

Se eligió `duration_days=6` + `endDateOverride` (lo fijará 194-09) y NO relajar `assertPlanInvariants`:

- `classesRemaining = ceil(6/7) * 3 = 3` sale del plan sin tocar el cálculo de cupo.
- 10 días hábiles es un largo variable en días corridos (feriados, domingos): exige override igual en cualquier alternativa.
- 6 días (no 7) queda bajo `EXPIRY_REMINDER_MIN_DURATION_DAYS=7` y `MIN_RENEWAL_PLAN_DURATION_DAYS=7` (sin recordatorios de vencimiento ni entrada a Renovaciones) y no choca con la búsqueda de la semana de partners (paquete/7/3).
- `assertPlanInvariants` valida la forma de 0257: `paquete` (grupo no online) con `monthly_class_budget`, `requires_presencial`, `special_line` en NULL/false/NULL. Es válida tal cual, no hizo falta tocar invariantes.
- "Accesos (3)" configurable = `classes_per_week` del plan Invitación, editable desde el admin de planes (una sola fuente de verdad).

## Mapa de lo implementado

- **0256:** `ALTER ... ADD COLUMN allows_invitation_discount TINYINT(1) NOT NULL DEFAULT 0` + `UPDATE` a 1 donde `plan_category NOT IN ('especial','paquete') AND is_trial = 0` con guard `NOT EXISTS (SELECT 1 FROM (SELECT id ... WHERE allows_invitation_discount = 1) marcado)` (derived table por el error 1093). El runner no saltea los statements tras un "Duplicate column name", por eso el guard: el backfill ocurre una sola vez y no re-marca planes que gestión desmarcó.
- **0257:** dos `INSERT ... SELECT ... WHERE NOT EXISTS` (tenant 1, nombre 'Invitación', país), AR/ARS y ES/EUR, flag en 0.
- **Helpers:** `isInvitationPlan` (is_trial AND paquete), `planAllowsInvitationDiscount` (flag AND NOT excludedFromReferrals AND NOT is_trial), `invitationPlanIdsSql()` (espejo SQL), `findInvitationPlan(ctx, country)` (tenantWhere + is_trial + paquete + país + activo + no archivado; 0 o más de 1 -> `log.error` + BadRequestError "No hay un plan de Invitación configurado para <país>").
- **CRUD:** `allowsInvitationDiscount` en `PlanListItem` (y por herencia `PlanDetail`), `CreatePlanInput`, `UpdatePlanInput`, los 3 JSON-schemas y `mapPlanRow`. Create: default false; true en especial/paquete/is_trial -> 400 "Este tipo de plan no admite descuento por invitación". Update: se evalúa el estado final post-merge; flag explícito true + estado final excluido -> 400; flag no enviado + cambio de categoría o `isTrial` que deja al plan excluido con el flag en true -> baja a false en el mismo update.
- **Pitfall 2:** `eq(isTrial, false)` en la búsqueda de `partner-week-service.ts`.

## Tests

- `test/invitations/plans-and-flag.test.ts`: 23 tests verdes (backfill por categoría, re-aplicación completa, desmarcado que sobrevive al re-apply, DB sin planes, plan nuevo nace en false, 0257 aplicada dos veces, helpers puros, `findInvitationPlan` con 0/1/2/archivado/inactivo/especial trial/paquete no trial, CRUD con 400 en cada categoría excluida).
- `test/referral-partners/semana-gratis.test.ts`: 10 tests verdes (+2 nuevos: coexistencia (9) y solo-trial (10)).
- Mutation testing honesto: (a) sacar el guard `NOT EXISTS` de 0256 -> falla el test "desmarcó"; (b) sacar `isTrial=false` del partner-week -> fallan (9) y (10). El (9) original NO detectaba la mutación (MySQL recorre por el índice único de nombre y el plan real ordenaba antes que el trial): se renombró el trial a "Invitación semana ..." para que ordene primero.
- Gates: `tsc --noEmit` 0, `lint:tenant` 0 (DISCREPANCIAS 0), `typecheck:tests` sin errores en los archivos tocados (la deuda ajena preexistente se mantiene), prettier OK.

## Deviations from Plan

**1. [Rule 3 - Bloqueo] `paquete` no es creable por la API de planes.** Los JSON-schemas de create/update NO listan `paquete` en el enum de `planCategory` (solo el de respuesta). Los tests de 400 por `paquete` siembran el plan por DB (`createMembershipPlan`) y usan `especial` para los casos create/cambio de categoría por HTTP. No se amplió el enum de entrada (fuera de alcance).

**2. [Decisión menor] Semántica de update.** El plan decía validar post-merge y bajar el flag al cambiar de categoría. Se aplicó la misma regla a `isTrial` (consistencia): sin enviar el flag, cambiar a is_trial lo baja a false (200); enviándolo en true -> 400.

**3. Tests de migración necesitan exención del sentinel.** Las queries del test pasan por el sentinel de tenancy y el `UPDATE` de 0256 es cross-tenant a propósito (backfill de D-23 para todo gimnasio). El helper `applyMigration` antepone un comentario `/* tenant-safe: ... */` a cada statement; el runner de producción usa conexión cruda y no se ve afectado.

**4. Tarea 1 incluye cambios de CRUD mínimos.** `schemas.ts`, el mapeo en `mapPlanRow` y los tipos se separaron entre commits como pide el plan, salvo que los tipos de input (`CreatePlanInput`/`UpdatePlanInput`) y `PlanDetail` quedaron en el commit de la tarea 1 porque el `tsc` los necesita junto con `mapPlanRow`.

## Limitaciones conocidas

- El guard de 0256 se apoya en "ningún plan marcado": si gestión desmarcara TODOS los planes y alguien re-ejecutara la migración completa por un camino que no sea el runner normal (que registra la migración en `_migrations`), el backfill volvería a correr. Con el runner normal la migración se ejecuta una vez.
- Los planes Invitación quedan visibles en "Vender otro pase" del admin (is_trial solo los oculta del catálogo de la app), igual que el plan de prueba de Yoga. No se tocó el front: el toggle del flag en el admin de planes lo cubre un plan posterior.
- El enum de entrada de la API sigue sin aceptar `paquete`.

## Auth gates / Threat flags / Stubs

Ninguno. Mitigaciones T-194-13..16 implementadas y cubiertas por tests.

## Lecciones para planes siguientes

- Los tests que aplican SQL de migración por `app.dbPool` pasan por el sentinel de tenancy: prefijar el statement con `/* tenant-safe: ... */` si la migración es cross-tenant.
- `subscription_plans` tiene UNIQUE (tenant, name, country) y MySQL recorre por ese índice: un test que depende de "cuál elige un `.limit(1)` sin orden" debe controlar el orden por nombre, o no discrimina.
- La API de planes no acepta `paquete` (create/update): sembrar por DB.
- `createMembershipPlan(ctx, {category})` / `createTrialPlan` sirven para sembrar planes; los de 0257 no sobreviven a `cleanAllTestData`.
- Un archivo de integración ~130-150 s; dos archivos ~220 s.

## Self-Check: PASSED

Archivos creados presentes (0256, 0257, `plans-and-flag.test.ts`), commits `ef89b74e5` y `ec6025a3e` en el log de la rama, numeración 0256/0257 verificada libre en el árbol, `origin/master` y `origin/staging` (tope 0254, más 0255 propia de 194-04).
