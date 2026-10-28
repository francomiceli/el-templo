---
phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula
plan: 01
subsystem: database
tags: [drizzle, mysql, subscription-plans, plan-category, migration]

# Dependency graph
requires:
  - phase: 161-actividades-con-aura
    provides: "precedente de categoría de plan con budget explícito + patrón de INSERT por migración (0179_especial_pass_core.sql), patrón categoryGroup de 3 valores"
provides:
  - "enum plan_category acepta 'paquete' en Drizzle schema, tipo TS de la API y tipo TS del admin"
  - "36 filas subscription_plans reales (18 AR/ARS + 18 ES/EUR) con categoría 'paquete', bookingMode='flexible', durationDays/classesPerWeek/priceRegular calculados por fórmula (D-05) y copiados exactos de las grillas D-07/D-08"
  - "categoryGroup('paquete') === 'presencial' e isOnlinePlan('paquete') === false — paquete se comporta como presencial-flexible en los helpers de categoría"
  - "label admin 'Paquete de clases', oculto de PLAN_CATEGORY_OPTIONS (picker manual normal)"
affects: [177-02, 177-03, 177-04, 177-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Matriz de planes reales generada por migración hand-written (Opción B) en vez de motor de precios runtime — precio ya calculado, solo se persiste"
    - "categoryGroup de 3 valores extendido: nuevas categorías se mapean explícitamente a un grupo existente (paquete → presencial) en vez de heredar el fallback binario de isOnlinePlan"

key-files:
  created:
    - el-templo-api/src/db/migrations/0205_paquete_clases_matrix.sql
  modified:
    - el-templo-api/src/db/schema/subscription-plans.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-admin/src/types/subscription.ts

key-decisions:
  - "Migración numerada 0205 (verificada contra el directorio de migraciones de TODAS las ramas locales vía git branch -a, máximo previo encontrado 0204 en et-159/rename_calistenia_general sin pushear)"
  - "isOnlinePlan('paquete') se resuelve como false desde el día 1 (no queda como deuda transitoria como pasó con 'especial' en fase 161, porque paquete es una categoría nueva sin callsites históricos que asuman lo contrario)"
  - "PLAN_CATEGORY_OPTIONS del admin (picker manual de creación de plan) NO incluye 'paquete' a propósito — las 36 filas nacen por migración, no se crean a mano; queda oculto del picker normal por diseño (D-01), la UI dedicada de alta la construyen los planes 177-03/04"

patterns-established: []

requirements-completed:
  [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-12, D-14]

# Metrics
duration: ~15min
completed: 2026-08-14
---

# Phase 177 Plan 01: Enum + Migración de la Matriz Paquete de Clases Summary

**Enum `plan_category` extendido con `paquete` (Drizzle + API + admin) y migración 0205 con las 36 filas reales de la matriz semanas×frecuencia (18 ARS + 18 EUR), precios copiados exacto de las grillas D-07/D-08, verificados programáticamente contra el plan.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2/2 completados
- **Files modified:** 3 modificados, 1 creado

## Accomplishments

- `planCategoryEnum` (Drizzle) + `PlanCategory` (API y admin) aceptan `'paquete'`, append-last, byte-for-byte entre schema TS y migración SQL.
- `categoryGroup('paquete') === 'presencial'` e `isOnlinePlan('paquete') === false` — paquete se comporta como presencial-flexible: conflictúa con un presencial activo, coexiste con online (comportamiento documentado en un comentario extenso en `types.ts`).
- Migración `0205_paquete_clases_matrix.sql`: Section 1 (ALTER MODIFY del enum) + Section 2 (36 `INSERT IGNORE`, 18 `country='AR'/currency='ARS'` + 18 `country='ES'/currency='EUR'`), idempotente vía `ux_subscription_plans_tenant_name_country` (0196).
- Todas las 36 filas verificadas programáticamente (script Python ad-hoc, no comiteado) contra las grillas D-07 (ARS) y D-08 (EUR): precio exacto por celda, `priceZero === priceRegular`, `priceCreditCard = NULL`, `durationDays = semanas*7`, `classesPerWeek = frecuencia`.
- Label admin `'Paquete de clases'` agregado a `PLAN_CATEGORY_LABELS`/`PLAN_CATEGORY_COLORS` (requerido por TS, `Record<PlanCategory, string>` es exhaustivo); `paquete` queda deliberadamente fuera de `PLAN_CATEGORY_OPTIONS` (picker manual de creación de plan) para no ensuciarlo — las filas nacen solo por migración.

## Task Commits

Each task was committed atomically:

1. **Task 1: Ampliar enum + tipos + helpers de categoría para paquete** - `d957219a` (feat)
2. **Task 2: Migración — MODIFY del enum + 36 INSERT de la matriz** - `44570cb3` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/subscription-plans.ts` - `planCategoryEnum` += `'paquete'` (append-last)
- `el-templo-api/src/modules/subscriptions/types.ts` - `PlanCategory` += `'paquete'`; `categoryGroup`/`isOnlinePlan` refinados para tratar paquete como grupo presencial; comentario extenso documentando el gap conocido en `assignPlan` (ver Deviations)
- `el-templo-admin/src/types/subscription.ts` - `PlanCategory` += `'paquete'`; label/color agregados; `PLAN_CATEGORY_OPTIONS` deliberadamente sin `'paquete'`
- `el-templo-api/src/db/migrations/0205_paquete_clases_matrix.sql` (nuevo) - ALTER del enum + 36 INSERT IGNORE de la matriz

## Decisions Made

- **Numeración de migración:** 0205, verificada contra el directorio de migraciones en TODAS las ramas locales (`git branch -a` + `git ls-tree` por rama), no solo la rama de trabajo actual (que solo tenía hasta 0196 — el checkout principal está detrás del tren v6.0 y de otras fases con worktrees no pusheadas). El máximo encontrado en cualquier rama fue `0204_rename_calistenia_general.sql` (worktree `et-159`, fase 159, sin pushear). 0205 es el próximo libre real, sin colisión.
- **`isOnlinePlan('paquete')` se resuelve correcto desde el día 1** (a diferencia de `especial` en fase 161, que quedó transitoriamente lumpeado con online por callsites históricos) — no hay deuda equivalente que gestionar para paquete.
- **`PLAN_CATEGORY_OPTIONS` del admin excluye `'paquete'` a propósito** — es el array que alimenta el picker manual de `PlanFormDialog.vue` (creación libre de un plan nuevo); las 36 filas de paquete nacen exclusivamente por esta migración, nunca a mano. Esto respeta D-01 ("filas ocultas del picker normal") en el único lugar donde ya existía la infraestructura para ocultarlas sin tocar código de UI nuevo; la ocultación del picker de **alta** (`CobrosPage`/`AssignPlanDialog`) es trabajo de los planes 177-03/04, que ya la tienen como must_have explícito.

## Deviations from Plan

### Documented (no auto-fix — gap fuera del alcance de esta fase por restricción dura del usuario)

**1. [Rule 4 análogo — arquitectural, NO corregido, solo documentado] Gap en el chequeo de solapamiento de `assignPlan`**

- **Found during:** Task 1, al leer los 3 callsites de conflicto citados en la NOTA de `types.ts` (`member-routes.ts`, `service.ts:259`, `service.ts:1337-1346`) como pedía el plan.
- **Issue:** `SubscriptionService.assignPlan` (service.ts, sección "category GROUP", ~línea 1337) arma la condición SQL de solapamiento con `eq(planCategory, 'presencial')` **literal**, no con `categoryGroup(...)`. Con `paquete` sumado al grupo `'presencial'` vía `categoryGroup`, esa condición queda incompleta:
  - `paquete` nuevo vs. `presencial` existente → **SÍ detecta el conflicto** (correcto, porque el nuevo plan es `paquete`, `planGroup='presencial'`, y la condición busca literal `'presencial'`, que sí matchea la sub existente).
  - `presencial` nuevo vs. `paquete` existente → **NO detecta el conflicto** (la condición sigue siendo `eq(planCategory,'presencial')`, no encuentra la sub `paquete` existente) — permite un solapamiento que D-02 pide bloquear.
  - `paquete` nuevo vs. `paquete` existente → **NO detecta el conflicto** — mismo motivo, permite dos paquetes simultáneos.
- **Por qué NO se corrigió acá:** CONTEXT.md documenta una restricción dura confirmada con Franco el 2026-08-14: _"assignPlan NO cambia de firma/contrato ni se le agrega lógica de asignación — el único toque permitido es agregar guards de categoría en la composición de precio para D-13"_ (guard de descuentos, plan 177-02). Tocar `sameGroupCategoryCondition` es lógica de asignación, no de composición de precio — está fuera del toque permitido en esta fase. Ningún plan de la fase 177 (01-05) toca esta condición.
- **Documentado en:** comentario extenso sobre `categoryGroup` en `el-templo-api/src/modules/subscriptions/types.ts` (commit `d957219a`), explicando el gap exacto y remitiendo a un plan/sign-off posterior.
- **Impacto real hoy:** bajo — el caso más común (alguien intenta comprar un paquete teniendo ya un presencial activo) SÍ se bloquea. Los casos que se cuelan (presencial sobre paquete existente, o dos paquetes simultáneos) requieren que primero exista un flujo de alta que ofrezca `paquete` como opción — eso llega recién en 177-03/04. No bloquea el éxito de este plan (enum + migración), pero **debe revisarse antes o durante 177-03/04**, cuando `paquete` empiece a ser asignable de verdad.

---

**Total deviations:** 0 auto-fixed, 1 documentado (gap arquitectónico pre-existente, fuera de alcance por restricción explícita del usuario).
**Impact on plan:** Ninguno sobre el alcance de este plan (enum + tipos + migración). Riesgo real diferido a los planes de UI de alta (177-03/04) — señalado explícitamente para que no se pierda.

## Issues Encountered

None — los 2 tasks se ejecutaron sin bloqueos. El único hallazgo relevante (el gap de `assignPlan`) se documentó, no bloqueó.

## User Setup Required

None - no external service configuration required. La migración `0205` corre por el pipeline normal (`pnpm db:migrate` local / `run-migrations.js` en deploy) — no requiere pasos manuales.

## Next Phase Readiness

- El enum, los tipos y las 36 filas del catálogo están listos para que 177-02 (exclusión de descuentos D-13), 177-03/04 (UI de alta con los 2 selectores) y 177-05 (tests) construyan encima.
- **Bloqueador a revisar antes de 177-03/04:** el gap de `sameGroupCategoryCondition` en `assignPlan` documentado arriba — cuando la UI de alta empiece a ofrecer `paquete` como opción real, un socio podría terminar con `presencial`+`paquete` simultáneos o dos `paquete` simultáneos sin que el backend lo bloquee. Recomendado: decisión explícita de Franco sobre si esto se corrige en un plan de la fase 177 o se acepta como comportamiento transitorio documentado.
- Verificación local: `cd el-templo-api && npx tsc --noEmit` → limpio. `cd el-templo-admin && npx vue-tsc --noEmit` → sin errores nuevos relacionados a `PlanCategory`/`subscription.ts` (ruido pre-existente no relacionado, fuera de alcance).
- No se corrió el suite de integración local (regla del repo — corre en CI tras push a staging).

---

_Phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula_
_Completed: 2026-08-14_

## Self-Check: PASSED

All created/modified files verified present on disk; both task commits (`d957219a`, `44570cb3`) verified present in `git log --oneline --all`.
