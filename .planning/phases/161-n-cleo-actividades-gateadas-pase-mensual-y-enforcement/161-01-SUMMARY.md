---
phase: 161-n-cleo-actividades-gateadas-pase-mensual-y-enforcement
plan: 01
subsystem: subscriptions
tags: [schema, migration, contracts, especial-pass, routing]
requires: []
provides:
  - planCategory 'especial' (enum + tipo + whitelists)
  - subscription_plans.monthly_class_budget + requires_presencial
  - activities.is_special
  - PassRequiredError (code PASS_REQUIRED)
  - categoryGroup (grupo de categoría de 3 valores)
  - pickSubscriptionForActivity (routing de sub por actividad)
  - 2 planes AR seedeados (Socio 10000 / Externo 20000)
affects:
  - el-templo-api/src/modules/subscriptions/service.ts
  - el-templo-api/src/modules/subscriptions/types.ts
  - el-templo-api/src/modules/subscriptions/schemas.ts
  - el-templo-api/src/modules/shared/errors.ts
tech-stack:
  added: []
  patterns:
    - Seed de prod-data por migración (INSERT IGNORE + índice único name,country)
    - Error tipado con code legible (espejo de CoverageExpiredError)
    - Grupo de categoría de 3 valores (reemplaza el binario isOnlinePlan sin borrarlo)
    - Routing de sub por actividad vía getMemberSubscriptions plural (nunca el singular)
key-files:
  created:
    - el-templo-api/src/db/migrations/0179_especial_pass_core.sql
    - el-templo-api/test/subscriptions/especial-pass-core.test.ts
  modified:
    - el-templo-api/src/db/schema/subscription-plans.ts
    - el-templo-api/src/db/schema/activities.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/shared/errors.ts
    - el-templo-api/src/modules/subscriptions/service.ts
decisions:
  - "especial se agrega al FINAL del enum (append-last, byte-for-byte con 0179)"
  - "monthly_class_budget nullable (NULL para planes no-especiales); requires_presencial NOT NULL DEFAULT 0"
  - "isOnlinePlan NO se refina — sus callsites (member-routes:194-195, service:251, service:1300) se migran a categoryGroup en el Plan 02"
metrics:
  duration: ~18min
  completed: 2026-07-14
---

# Phase 161 Plan 01: Contratos del pase especial (Actividades con Aura) Summary

Contratos compartidos de la fase 161: categoría de plan `especial`, budget mensual explícito + discriminador Socio↔Externo, flag de gating en actividades, error tipado `PassRequiredError`, helper `categoryGroup` de 3 valores y `pickSubscriptionForActivity` para rutear el consumo por actividad — todo seedeado y aplicado en la DB local vía migración 0179.

## What Was Built

**Task 1 — Schema + migración 0179** (`e54e89e4`):

- `planCategoryEnum`: agrega `"especial"` al final del array (append-last, byte-for-byte con el SQL).
- `subscription_plans`: `monthlyClassBudget` (int nullable, budget explícito del pase) + `requiresPresencial` (boolean NOT NULL default false, discriminador Socio↔Externo).
- `activities`: `isSpecial` (boolean NOT NULL default false, flag de gating — cero cambio de comportamiento).
- Migración `0179_especial_pass_core.sql`: enum MODIFY + 3 columnas + INSERT IGNORE de los 2 planes AR (Socio $10.000 `requires_presencial=1`, Externo $20.000 `requires_presencial=0`; ambos `monthly_class_budget=2`, `duration_days=30`, `classes_per_week=NULL`, `country='AR'`, `currency='ARS'`). Dedupe por índice único `ux_subscription_plans_name_country`. Sin `;` en comentarios (semicolon trap evitado).

**Task 2 [BLOCKING] — Migración aplicada** (sin cambio de archivo; el SQL se commiteó en Task 1):

- `pnpm db:migrate` aplicó 0179 con el runner custom (trackeada en `_migrations`).
- Verificado en DB local: 3 columnas nuevas presentes + 2 planes especiales con `monthly_class_budget=2` y `requires_presencial` correcto (1/0).

**Task 3 (TDD) — Contratos compartidos** (RED `ff3e2b68`, GREEN `d0b746bf`):

- `types.ts`: `especial` en la union `PlanCategory`; nuevo `CategoryGroup` + `categoryGroup(c)` que mapea a `presencial`/`online`/`especial`. `isOnlinePlan` intacto (con nota de callsites para el Plan 02).
- `schemas.ts`: `especial` en las 3 whitelists JSON-schema (`:35`, `:181`, `:223`) — evita romper CI contra MySQL real.
- `errors.ts`: `PassRequiredError extends BadRequestError` con `code = "PASS_REQUIRED"` (espejo de `CoverageExpiredError`).
- `service.ts`: `pickSubscriptionForActivity(userId, isSpecialActivity)` — base en `getMemberSubscriptions` plural, filtra por `categoryGroup`, ordena cubre-hoy > active > paused > scheduled > startDate. Incluye `scheduled` (sin regresión de reserva dentro de ventana).

## Verification

- `npx tsc --noEmit` verde tras cada tarea.
- Migración 0179 aplicada y verificada en DB local (2 planes especiales, 3 columnas nuevas, fila en `_migrations`).
- Test de integración `especial-pass-core.test.ts`: 4/4 pasan (categoryGroup, PassRequiredError, pickSubscriptionForActivity routing + null).
- Callsites de `isOnlinePlan` documentados para el Plan 02: `member-routes.ts:194-195`, `service.ts:251` (assertPlanInvariants), `service.ts:1300` (conflicto de assign).

## Deviations from Plan

Ninguna desviación de comportamiento. Nota de implementación en el test (no es desviación del plan): crear un plan `especial` vía la API de create-plan hoy dispara `assertPlanInvariants` (uno de los callsites de `isOnlinePlan` que el plan defiere explícitamente al Plan 02), que trata `especial` como online y exige un programa vinculado. En prod los planes especiales entran por la migración 0179 (INSERT directo), no por esa ruta, así que el invariante nunca aplica. El test satisface el invariante con `grantsAllPrograms:true` para poder ejercitar el ruteo — consistente con dejar `isOnlinePlan` sin refinar (decisión del plan).

## Known Stubs

Ninguno. Todos los contratos están wireados y ejercitados por tests. El consumo real (budget en assign/renew, gating en reserve, decremento por actividad en check-in, exclusión de métricas, admin ABM) es alcance de las olas 2-3 de esta fase, por diseño.

## Self-Check: PASSED

- Archivos creados: `0179_especial_pass_core.sql` FOUND, `especial-pass-core.test.ts` FOUND.
- Commits: `e54e89e4`, `ff3e2b68`, `d0b746bf` FOUND en git log.
- Migración 0179 en `_migrations`: yes.
