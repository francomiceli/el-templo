---
phase: 156-planes-de-pago-vs-rutinas-de-entrenamiento
plan: 03
subsystem: programs + subscriptions (multi-program access resolution)
tags:
  [white-label, plan-programs, enrollment, teardown, anti-piracy, PLAN-03, D-07]
requires:
  - "tabla join plan_programs + programIds CRUD (156-02)"
  - "EnrollmentService.enrollFromPlan + tearDownForSubscription (fase 112)"
  - "filtro anti-piratería goalPlanType IS NOT NULL del bundle (fase 104 R3/R7)"
provides:
  - "EnrollFromPlanInput gana programIds:number[]"
  - "enrollFromPlan resuelve acceso all → lista → nada en un criterio único"
  - "la rama lista HEREDA el filtro goalPlanType IS NOT NULL (la lista nunca otorga Foundation)"
  - "insert de la lista con source plan_bundle (sin migrar el enum de program_enrollments.source)"
  - "tearDownForSubscription: el protected set suma los plan_programs de los protectores con lista"
  - "getPlanProgramIds acepta tx opcional"
  - "los 4 callers de enrollFromPlan proyectan la lista y amplían el guard con programIds.length > 0"
  - "test de integración plan-programs-access (all/lista/nada + Foundation + idempotencia + teardown + protección)"
affects:
  - "el-templo-api/src/modules/programs/enrollment-service.ts"
  - "el-templo-api/src/modules/subscriptions/service.ts"
  - "el-templo-api/test/subscriptions/plan-programs-access.test.ts"
tech-stack:
  added: []
  patterns:
    - "resolución de acceso en un criterio único all → lista → nada dentro de enrollFromPlan (la app de miembros consulta enrollments, no el plan → funciona sin cambios)"
    - "herencia del filtro anti-piratería (goalPlanType IS NOT NULL) en la rama lista, idéntico al bundle (104 R7)"
    - "reutilización del source plan_bundle para las filas de lista (evita migrar el enum)"
    - "protected set del teardown ampliado con join a plan_programs de los protectores activos/pausados"
    - "proyección de la lista + widening del guard (|| programIds.length > 0) en los 4 call sites"
key-files:
  created:
    - "el-templo-api/test/subscriptions/plan-programs-access.test.ts"
  modified:
    - "el-templo-api/src/modules/programs/enrollment-service.ts"
    - "el-templo-api/src/modules/subscriptions/service.ts"
decisions:
  - "Task 1 y Task 2 commiteados juntos (bd687b71): agregar programIds:number[] como campo REQUERIDO a EnrollFromPlanInput rompe los 4 callers en la misma unidad de compilación TS — separarlos dejaría el commit intermedio con tsc rojo. Un solo commit mantiene cada commit verde."
  - "La rama lista reutiliza source plan_bundle (no un source nuevo plan_list) — evita migrar el enum de program_enrollments.source (recomendación del PATTERNS)"
  - "Legacy fallback del teardown (subscription_id IS NULL, líneas 577-613) NO se toca — barre por grantsAllPrograms/linkedProgramId como hoy; las filas de lista siempre nacen con subscription_id (post-fase-112), así que el camino canónico (ownedEnrollments por subscription_id) ya las cubre. Bajo riesgo, sin regresión."
  - "activateScheduledSub corre sobre this.db (sin tx) — se preserva la semántica best-effort legacy; getPlanProgramIds(newPlan.id) sin tx"
  - "Guard anti-doble-bundle (963-995) intacto — no aplica a listas (dos planes con lista coexisten; el dedupe de enrollFromPlan evita duplicados)"
metrics:
  duration: ~18min
  completed: 2026-07-05
---

# Phase 156 Plan 03: Lógica de acceso multi-programa Summary

La resolución de acceso a programas de un plan pasa a un criterio único **all → lista → nada** dentro de `enrollFromPlan` + `tearDownForSubscription`: `grantsAllPrograms=true` enrola en todos los programas activos (como hoy, lista ignorada); `grantsAllPrograms=false` + lista no vacía enrola exactamente en los programas de la lista; lista vacía no enrola en ninguno. La rama lista **HEREDA el filtro anti-piratería del bundle** (`goalPlanType IS NOT NULL`, fase 104 R7): un plan NUNCA puede otorgar Foundation por lista. El teardown suma los `plan_programs` de los protectores activos/pausados al protected set, y los 4 callers de `enrollFromPlan` proyectan la lista y amplían el guard con `programIds.length > 0`. La app de miembros funciona sin cambios (consulta `program_enrollments`, no el plan).

## What Was Built

**Task 1 + Task 2 — Resolución all→lista→nada + filtro Foundation + teardown + 4 callers (commit `bd687b71`):**

- `enrollment-service.ts`:
  - `EnrollFromPlanInput` gana `programIds: number[]` (requerido) con docblock de la semántica all → lista → nada y la herencia del filtro anti-piratería.
  - `enrollFromPlan`: el `if (plan.grantsAllPrograms)` se reemplaza por la resolución única en `programsToConsider`: `all=true` → query actual (`isActive` + `goalPlanType IS NOT NULL`); `all=false` + lista no vacía → mismos filtros restringidos con `inArray(programs.id, plan.programIds)` — **el filtro `goalPlanType IS NOT NULL` se mantiene en la rama lista**; `all=false` + lista vacía → nada. Dedupe idéntico contra enrollments activos + insert con `source: "plan_bundle"` (sin migrar el enum). El log unificado reporta `grantsAllPrograms`/`listSize`/`enrolledCount`.
  - `tearDownForSubscription`: el protected set (step 2) proyecta ahora `planId` de cada protector y joina `plan_programs` de los protectores activos/pausados, sumando esos `programId` al `protectedProgramIds`. El legacy fallback (577-613) queda como está (decisión documentada arriba).
- `subscriptions/service.ts`:
  - `getPlanProgramIds(planId, tx?)`: gana `tx` opcional (`runner = tx ?? this.db`) para proyectar la lista dentro de las transacciones de assign/change/renew.
  - Los 4 callers de `enrollFromPlan` — `assignPlan` (~1421), `changePlanNow` (~3106), `renew` (~3826), `activateScheduledSub` (~4268) — proyectan `getPlanProgramIds(plan.id[, tx])`, pasan `programIds` en el input y amplían el guard `if (plan.linkedProgramId || plan.grantsAllPrograms || <lista>.length > 0)`. El guard legacy `shouldEnroll` (renew/activate, protección de progreso in-flight del linked program) se conserva. Guard anti-doble-bundle intacto.

**Task 3 — Test de acceso multi-programa (commit `65c8e465`):**

- `test/subscriptions/plan-programs-access.test.ts` (NEW, 7 casos, fixtures analog a `bundle-todos-los-programas.test.ts`, asserts directos sobre `program_enrollments`):
  1. `grantsAllPrograms=true` enrola en todos (regresión; se envía una lista para probar que se ignora) + Foundation excluida.
  2. lista no vacía enrola SOLO los programas de la lista (un p3 activo fuera de la lista NO se enrola).
  3. lista vacía (plan flex sin binding) no enrola en ninguno.
  4. Foundation (`goalPlanType IS NULL`) explícitamente listada NO se enrola (anti-piratería).
  5. idempotencia: enrollment p1 pre-existente con progreso (week 2) no se duplica ni se pisa al asignar la lista.
  6. teardown: cancelar la sub cancela los enrollments de la lista.
  7. protección: otra sub activa cuya **lista** cubre p1 lo preserva en el teardown de la sub objetivo expirada (p2/p3 cancelados). Ejercita el nuevo join de `plan_programs` de los protectores.

## Threat Model Coverage

- **T-156-07** (Elevation of Privilege — lista otorga Foundation): mitigado. La rama lista mantiene `goalPlanType IS NOT NULL` en `enrollFromPlan`; Test 4 asserta que una Foundation listada NO se enrola.
- **T-156-08** (Tampering — plan solo-lista saltea enrolamiento): mitigado. Los 4 guards amplían con `programIds.length > 0`; Test 2 asserta que un plan solo-lista enrola.
- **T-156-09** (Information Disclosure — acceso residual tras teardown): mitigado. El protected set suma los `plan_programs` de los protectores; Test 6 (limpieza) + Test 7 (protección) lo cubren.
- **T-156-SC** (installs): accept — no se instalaron paquetes.

## Deviations from Plan

**1. [Agrupación de commits] Task 1 y Task 2 en un solo commit (`bd687b71`).**

- **Motivo:** agregar `programIds: number[]` como campo REQUERIDO a `EnrollFromPlanInput` (Task 1) rompe inmediatamente los 4 callers (Task 2) en la misma unidad de compilación TypeScript. Un commit de Task 1 aislado dejaría `tsc --noEmit` rojo en ese punto del historial, violando el gate "tsc verde" de la propia Task 1.
- **Decisión:** un único commit cubre ambas tasks, manteniendo cada commit del historial con tsc verde. Sin cambio de alcance — todo el trabajo de ambas tasks está presente y verificado.

Fuera de eso, plan ejecutado exactamente como fue escrito.

## Notas de verificación

- Gate local `tsc --noEmit` (sobre `src/**`, regla de proyecto: los suites corren en CI, no localmente) **verde** tras cada task. `grep -c programIds` = 7 en enrollment-service.ts y 22 en subscriptions/service.ts; `goalPlanType` presente en enrollment-service.ts.
- El archivo de test está fuera del `include` del `tsconfig.json` de la API (`src/**` solamente), así que se typechequea en CI vía vitest. Un typecheck aislado ad-hoc reportó un falso positivo TS2769 (overload de `db.insert(programEnrollments)`) que **también aparece idéntico en el `bundle-todos-los-programas.test.ts` de referencia** (que pasa CI) bajo los mismos flags ad-hoc — artefacto de `moduleResolution bundler` en la invocación aislada, no un error real. El test replica byte-a-byte los patrones de insert del bundle test.
- La app de miembros no requiere cambios: consulta `program_enrollments`, no el plan (D-07).

## Self-Check: PASSED

Archivos verificados en disco; commits `bd687b71` (Task 1+2) y `65c8e465` (Task 3) en el historial.
