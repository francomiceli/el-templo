---
phase: 156-planes-de-pago-vs-rutinas-de-entrenamiento
plan: 02
subsystem: subscriptions (multi-program access + price history)
tags: [white-label, plan-programs, join-table, programIds, PLAN-04, migration]
requires:
  - "subscription_plans (grantsAllPrograms, linkedProgramId) + programs (micro-programs)"
  - "plans CRUD: createPlan/updatePlan/mapPlanRow/assertPlanInvariants (subscriptions/service.ts)"
provides:
  - "tabla join plan_programs (subscription_plan_id, program_id, UNIQUE compuesto) + migración 0169"
  - "createPlan/updatePlan aceptan programIds:number[] y lo persisten (delete+insert por planId, en db.transaction)"
  - "validación server-side de programIds (T-156-04): cada id debe ser un programa activo → 400 sin persistir"
  - "payload de planes (planSchema/mapPlanRow/PlanListItem) expone programIds"
  - "assertPlanInvariants acepta lista no vacía como binding válido para planes online"
  - "test de regresión PLAN-04 (update de precio no crea plan ni reescribe históricos) + persistencia/rechazo de programIds"
affects:
  - "el-templo-api/src/db/schema/plan-programs.ts (NEW)"
  - "el-templo-api/src/db/schema/index.ts"
  - "el-templo-api/src/db/migrations/0169_plan_programs.sql (NEW)"
  - "el-templo-api/src/modules/subscriptions/service.ts"
  - "el-templo-api/src/modules/subscriptions/schemas.ts"
  - "el-templo-api/src/modules/subscriptions/types.ts"
  - "el-templo-api/test/subscriptions/plans-crud.test.ts"
tech-stack:
  added: []
  patterns:
    - "join table analog blog_post_tags (UNIQUE compuesto + índices por columna, FKs RESTRICT)"
    - "migración a mano aditiva analog 0152 (numeración 0169, sin `;` en comentarios, columnas snake_case byte-for-byte)"
    - "reconciliación de lista delete+insert por planId dentro de db.transaction (atomicidad plan+lista)"
    - "validación server-side de ids del payload antes de persistir (no confiar en el cliente, T-156-04)"
    - "payload embebido (programIds en el response de planes) en vez de endpoints propios (D-06 discreción)"
key-files:
  created:
    - "el-templo-api/src/db/schema/plan-programs.ts"
    - "el-templo-api/src/db/migrations/0169_plan_programs.sql"
  modified:
    - "el-templo-api/src/db/schema/index.ts"
    - "el-templo-api/src/modules/subscriptions/service.ts"
    - "el-templo-api/src/modules/subscriptions/schemas.ts"
    - "el-templo-api/src/modules/subscriptions/types.ts"
    - "el-templo-api/test/subscriptions/plans-crud.test.ts"
decisions:
  - "programIds embebido en el payload de planes (no endpoints propios) — recomendación del CONTEXT D-06"
  - "reconciliación delete+insert por planId dentro de db.transaction; el UNIQUE compuesto respalda la no-duplicación a nivel DB"
  - "validación de existencia contra programas ACTIVOS (isActive=true); la exclusión Foundation en la resolución de acceso se difiere a 156-03"
  - "assertPlanInvariants gana el 4º binding hasProgramList (lista no vacía) sin tocar los 3 existentes"
  - "PLAN-04: la renovación hereda pricePaid POR DISEÑO (regla Pomilio) — el test lo asserta explícitamente, NO se corrige"
metrics:
  duration: ~12min
  completed: 2026-07-05
---

# Phase 156 Plan 02: Base de datos + CRUD multi-programa por plan + regresión de precios Summary

Tabla join `plan_programs` (analog `blog_post_tags`) + migración a mano 0169 que permite a un plan dar acceso a una lista explícita de programas además del "todos" existente (PLAN-03, D-06/D-08). El CRUD de planes acepta `programIds:number[]` embebido en el payload, lo persiste con delete+insert por planId dentro de `db.transaction`, valida server-side que cada id sea un programa activo (rechaza inexistentes con 400 sin persistir, T-156-04) y expone la lista en el response. `assertPlanInvariants` acepta una lista no vacía como binding válido para planes online. PLAN-04 (D-09) queda garantizado por test de regresión: actualizar el precio de un plan no crea plan nuevo ni altera `subscriptions.pricePaid` / `financial_transactions` históricos; una asignación nueva usa el precio nuevo y la renovación hereda `pricePaid` por diseño (documentado, no corregido).

## What Was Built

**Task 1 — Schema plan_programs + migración 0169 (commit `58cd8217`):**

- `src/db/schema/plan-programs.ts` (NEW): `planPrograms = mysqlTable("plan_programs", ...)` con `subscriptionPlanId`/`programId` (`.references()` reales a `subscription_plans.id` y `programs.id`), `uniqueIndex("plan_program_unique")` compuesto + índices por columna. Columnas snake_case byte-for-byte con la migración.
- `src/db/schema/index.ts`: `export * from "./plan-programs"` registrado junto a `subscription-plans`.
- `0169_plan_programs.sql` (NEW): `CREATE TABLE plan_programs` puramente aditivo (analog 0152), UNIQUE compuesto, FKs RESTRICT con nombres de constraint convención-Drizzle, encabezado con rationale de reversibilidad/idempotencia, sin `;` en comentarios.

**Task 2 — CRUD programIds embebido + payload + invariante + test PLAN-04 (commit `529a03e4`):**

- `schemas.ts`: `programIds: { type: "array", items: { type: "integer" } }` en `createPlanSchema`, `updatePlanSchema` (body) y `planSchema` (response — sin esto Fastify strippearía el campo).
- `types.ts`: `programIds?: number[]` en `CreatePlanInput`/`UpdatePlanInput` y `programIds: number[]` en `PlanListItem`.
- `service.ts`:
  - `assertPlanInvariants` gana el 4º campo `hasProgramList`; un plan online se satisface con linkedProgramId **O** grantsAllPrograms **O** lista no vacía.
  - `getPlanProgramIds(planId)` privado (lectura de la lista).
  - `assertProgramsExist(tx, ids)` privado: valida cada id (deduped) contra `programs` activos dentro del tx; ids inválidos/inactivos → `BadRequestError` (400) antes de cualquier write (T-156-04).
  - `persistPlanPrograms(tx, planId, ids)` privado: delete-por-planId + insert del set deduped.
  - `createPlan`: envuelto en `db.transaction` — valida → inserta el plan → persiste la lista → devuelve el id; `getPlanById` re-fetch tras el commit.
  - `updatePlan`: calcula `effectiveProgramIds` (lista entrante o la persistida) para el invariante; el patch de `subscription_plans` + la reconciliación de lista corren juntos en `db.transaction`; si `programIds` viene, valida antes de persistir. Sigue tocando SOLO `subscription_plans`/`plan_programs` — nunca `subscriptions`/`financial_transactions` (base de PLAN-04).
  - `mapPlanRow`: incluye `programIds` (query a `plan_programs`).
- `plans-crud.test.ts`: helper `createProgram` + dos bloques nuevos:
  - **PLAN-03:** persistencia en create, invariante satisfecho por lista sola, reemplazo en update, conservación cuando update omite `programIds`, y **rechazo 400 de id fantasma en POST y PUT con verificación de que NADA se persiste / la lista existente queda intacta** (warning 2 del plan-checker).
  - **PLAN-04:** assign a precio viejo → update de `priceRegular`/`priceZero` → assert mismo `plan.id`, `subscriptions.pricePaid` y `financial_transactions.amount` intactos → nuevo assign (otro socio) usa el precio nuevo (20000) → renovación del primer socio hereda `pricePaid` viejo (10000) por diseño (aserto explícito).

## Threat Model Coverage

- **T-156-04** (Tampering, programIds arbitrarios): mitigado con `assertProgramsExist` dentro del tx — cada id se valida contra programas activos antes de insertar; inválidos → 400, nada persistido. Tests de rechazo POST/PUT lo cubren.
- **T-156-05** (Information Disclosure, mapPlanRow expone programIds): accept — ids no sensibles, endpoint staff/owner-gated.
- **T-156-06** (DoS, delete+insert por planId): accept — lista acotada a programas activos del gym, dentro de transacción.
- **T-156-SC** (installs): accept — no se instalaron paquetes.

## Deviations from Plan

None - plan ejecutado exactamente como fue escrito. Se ejerció la discreción del plan envolviendo create+programIds y update+programIds en `db.transaction` (atomicidad plan+lista) y validando ids server-side, tal como el `<action>` de Task 2 pedía.

## Notas de verificación

- Gate local `tsc --noEmit` verde tras cada task (regla de proyecto: los suites de tests corren en CI, no localmente). El `tsconfig.json` de la API solo incluye `src/**/*`, así que el test file se typechequeó por separado — sin errores propios en `plans-crud.test.ts` (los únicos errores del compile aislado son de archivos pre-existentes no relacionados: `campaigns/templates.ts`, `test/helpers.ts`, `_helpers.ts`).
- Migración 0169: réplica aditiva del analog probado 0152; se valida al aplicar en CI/staging (`pnpm db:migrate`, runner propio; `_migrations` es la fuente de verdad). No se aplicó contra la DB local para no arrastrar migraciones pendientes del entorno.
- La exclusión Foundation (`goalPlanType IS NOT NULL`) en la resolución de acceso NO se aplica en la validación de este plan — este plan solo persiste la lista; la resolución de acceso (all → lista → nada) con la exclusión anti-piratería se cubre en 156-03 (per `<verification>` del plan).

## Self-Check: PASSED

Archivos creados/modificados verificados en disco; commits `58cd8217` y `529a03e4` en el historial.
