---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 16
subsystem: api
tags: [tenancy, multitenancy, drizzle, cron, jobs, mysql, vitest]

requires:
  - phase: 173-11
    provides: "resolveBranchDelGimnasio/assertBranchDelGimnasio (branch-consistency.ts)"
  - phase: 173-12
    provides: "FK compuesta users(tenant_id, branch_id) -> branches(tenant_id, id)"
provides:
  - "reassign-multibranch.ts, notification-cron.ts y expire-lost-leads.ts migrados a TenantContext (D-04)"
  - "Guarda de escritura ante el UPDATE de sede del cron de recategorización (D-07)"
  - "Test SC3: el cron nunca mueve un socio a una sede de otro gimnasio"
affects: [173-30]

tech-stack:
  added: []
  patterns:
    - "Fragmento sql crudo compartido entre statements: el filtro de tenant va INLINE en CADA statement que nombra la tabla, no en el fragmento compartido — el lint juzga por statement completo y un ${fragmento} interpolado no arrastra el texto literal de otro template"
    - "Guarda de escritura de doble capa (defensa en profundidad): filtro aguas arriba en la señal de entrada (buckets de asistencia) + resolveBranchDelGimnasio justo antes del UPDATE"
    - "Escenario de dilución para mutation-testing de un guard redundante: cuando una segunda capa de defensa protege el estado final independientemente de la primera, la mutación de la primera capa se hace visible mezclando señal ajena con una señal propia legítima que la primera capa filtraría"

key-files:
  created:
    - el-templo-api/test/tenancy/ancla-cron-reassign.test.ts
  modified:
    - el-templo-api/src/jobs/reassign-multibranch.ts
    - el-templo-api/src/jobs/notification-cron.ts
    - el-templo-api/src/jobs/expire-lost-leads.ts

key-decisions:
  - "reassignMemberBranch pasa a (ctx, db, memberId, branchId) y devuelve boolean — el llamador decide skip-and-continue con reason 'cross_tenant', nunca aborta el barrido"
  - "Los buckets de asistencia se filtran por countryByBranch.has(branchId) ANTES de calcular total/top/dominancia — la sede ajena queda excluida de la señal de entrada, no solo de la comparación de país"
  - "En expire-lost-leads.ts el filtro de tenant se duplica en el COUNT y en el UPDATE (no vive en candidateBaseConditions compartida) para que el lint vea 'tenant_id' en cada statement que nombra users"
  - "bookings/subscriptions/subscription_plans/branches/attendance/check_in_responses/programs/program_enrollments quedan sin allowlist-touch (D-02, cirugía mínima) aunque varias se filtraron igual por necesidad funcional (D-04)"

patterns-established:
  - "Ver tech-stack.patterns arriba"

requirements-completed: [ADO-02, ADO-07]

duration: ~65min
completed: 2026-08-08
---

# Phase 173 Plan 16: Guarda de crons de recategorización multisucursal Summary

**Los 3 crons que tocan `users`/`member_profiles` migran a `TenantContext`, y el cron de recategorización multisucursal gana una guarda de doble capa (filtro de entrada + validación antes del UPDATE) que cierra el criterio 3 de la fase (SC3): nunca mueve a un socio a una sede de otro gimnasio.**

## Performance

- **Duration:** ~65 min
- **Completed:** 2026-08-08
- **Tasks:** 3/3
- **Files modified:** 4 (3 modificados, 1 creado)

## Accomplishments

- `reassign-multibranch.ts`: las 4 queries de `runReassignMultibranchForTenant` nombran el gimnasio inline (candidatos vía `subscriptions`+`subscriptionPlans`, estado actual de `users`, mapa de sedes→país de `branches`, asistencias de `attendance`); los buckets de asistencia descartan las sedes ajenas antes de competir por ser "dominante"; `reassignMemberBranch` resuelve la sede con `resolveBranchDelGimnasio` justo antes del UPDATE y saltea-y-sigue si no es del gimnasio.
- `notification-cron.ts` y `expire-lost-leads.ts`: `tenantWhere` inline en los 7 statements que nombran `member_profiles`/`users` (2 queries de listado + 2 updates de tracking en notification-cron; el COUNT y el UPDATE en expire-lost-leads), sin tocar las tablas ajenas al módulo (`bookings`, `subscriptions`, `branches`, `check_in_responses`, `programs`, `program_enrollments`).
- Test SC3 nuevo (`ancla-cron-reassign.test.ts`, 5 tests): precondición de país + los 4 casos del criterio 3, con mutación de cierre verificada en vivo.

## Task Commits

1. **Task 1: reassign-multibranch.ts — las 4 queries y el UPDATE con guarda (D-04, D-07)** - `1587ccaa` (feat)
2. **Task 2: notification-cron.ts y expire-lost-leads.ts** - `9dff2449` (feat)
   - `4b4ed420` (style) — prettier --write sobre los 2 archivos de las tasks 1 y 2, detectado antes de la corrida larga de Task 3
3. **Task 3: Test SC3** - `d547c76d` (test)

**Plan metadata:** pendiente (este SUMMARY se commitea aparte por el orquestador, según las reglas de esta ejecución: NO se actualiza STATE.md ni se hacen commits en el checkout principal)

## Files Created/Modified

- `el-templo-api/src/jobs/reassign-multibranch.ts` — 4 queries con `tenantWhere`, buckets filtrados por sede propia, `reassignMemberBranch(ctx, db, memberId, branchId): Promise<boolean>` con guarda `resolveBranchDelGimnasio` antes del UPDATE, nuevo `ReassignSkip.reason: "cross_tenant"`.
- `el-templo-api/src/jobs/notification-cron.ts` — `tenantWhere` en las 5 queries/updates que nombran `member_profiles`/`users` (energía matinal, resumen semanal, recálculo de segmentos + sus 2 updates de tracking).
- `el-templo-api/src/jobs/expire-lost-leads.ts` — `u.tenant_id = ${ctx.tenantId}` inline en el COUNT y en el UPDATE (no en `candidateBaseConditions`, que queda sin ctx).
- `el-templo-api/test/tenancy/ancla-cron-reassign.test.ts` (nuevo) — batería SC3, 5 tests.

## Decisions Made

- **`reassignMemberBranch` cambia de `Promise<void>` a `Promise<boolean>`**: el llamador necesita saber si el UPDATE se hizo o si la sede resultó ajena, para decidir entre "change" y "skip" sin abortar el barrido.
- **El filtro de sede ajena vive en DOS capas independientes** (buckets filtrados en la entrada + `resolveBranchDelGimnasio` antes del UPDATE): la segunda por sí sola ya garantiza que un UPDATE cross-tenant nunca llega a la base, incluso si la primera fallara. Esto se descubrió durante el diseño del test de mutación (ver más abajo) y quedó documentado en el docblock de cabecera del archivo de test para que un lector futuro entienda por qué el escenario de "aislamiento" usa dilución en vez del escenario simple.
- **El filtro de tenant en `expire-lost-leads.ts` se duplica en cada statement SQL crudo** en vez de vivir en el fragmento compartido `candidateBaseConditions`: el lint de tenancy (CON-06) juzga por statement completo, y un `${base}` interpolado en otro `sql\`...\``no arrastra el texto literal del fragmento (mismo hallazgo que el plan 173-05 documentó para`member-search.ts`).
- **Working allowlist para verificación local**: `/tmp/allowlist-173-16.json` (copia de la real, 450→446, sin las 4 entradas objetivo: `notification-cron.ts{member_profiles,users}`, `expire-lost-leads.ts{users}`, `reassign-multibranch.ts{users}`). No se tocó `tenant-lint-allowlist.json` real (dueño 173-30).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El guardrail de país original no protegía contra una sede ajena "invisible" en el mapa filtrado**

- **Found during:** Task 1, al diseñar el filtro de la query 3.
- **Issue:** Con `countryByBranch` filtrado por `ctx` (query 3), una sede ajena queda simplemente AUSENTE del mapa. El guardrail de país original (`if (currentCountry !== null && topCountry !== null && currentCountry !== topCountry)`) usa `?? null` para lo no encontrado, así que una sede ajena con `topCountry === null` NUNCA activaba el skip (la condición exige que los DOS sean no-null) — la sede ajena podía seguir siendo "top" y llegar al `result.changes.push(...)`.
- **Fix:** Los `buckets` de asistencia se filtran por `countryByBranch.has(b.branchId)` ANTES de calcular `total`/`top`/dominancia — una sede ajena queda excluida de la señal de entrada, no solo de la comparación de país. El guardrail de país original queda intacto para su propósito original (multi-branch cross-country del MISMO gimnasio).
- **Files modified:** `el-templo-api/src/jobs/reassign-multibranch.ts`
- **Verification:** los 5 tests de `ancla-cron-reassign.test.ts` + los 10 de `reassign-multibranch.test.ts` (preexistentes) verdes.
- **Committed in:** `1587ccaa` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug de diseño encontrado antes de escribir código, no una regresión de un guard existente)
**Impact on plan:** Necesario para que el filtro de la query 3 (T-173-16-02) tenga efecto real; sin esto, la mitigación de la mina M10 dependería ÚNICAMENTE de la guarda del UPDATE (defensa en profundidad de una sola capa en vez de dos). Sin scope creep — mismo archivo, misma tarea.

## Issues Encountered

**La guarda de doble capa hace que la mutación literal del plan ("sacar el `tenantWhere` de la query 3") no altere el estado final de la base en el escenario simple descrito.** El plan pide un escenario donde "la sede ajena ganaría si no hubiera filtro" y espera que la mutación de la query 3 ponga en rojo la aserción de aislamiento. Se verificó matemáticamente (y luego empíricamente) que, con las DOS capas de defensa intactas salvo la mutada, la guarda de `reassignMemberBranch` (`resolveBranchDelGimnasio` justo antes del UPDATE, que consulta `branches` de nuevo con el `ctx` — completamente independiente de la query 3) sigue bloqueando el UPDATE cross-tenant aunque la query 3 esté rota. En el escenario simple (asistencia SOLO en la sede ajena), el resultado final en la base es IDÉNTICO con o sin la mutación: el socio nunca se mueve, en ambos casos.

Para que la mutación de cierre fuera observable en la BASE (no en el resumen del job, que el plan prohíbe para esta aserción), el `it` de "aislamiento" usa un escenario de **dilución**: el socio tiene asistencia en la sede ajena (que por sí sola "ganaría" si no hubiera filtro, 6 asistencias) Y TAMBIÉN en una sede propia legítima (5 asistencias). Con la query 3 filtrada (código correcto), la sede ajena queda excluida del cómputo y la propia domina SOLA (5/5 = 100%) — el socio SÍ se recategoriza, a su sede propia. Sin el filtro (mutado), las dos sedes compiten (6/11 = 54.5% < 60%, margen 6-5=1 < 3) — NINGUNA domina, y el socio queda SIN recategorizar. Esa diferencia de estado en la base (recategorizado a la sede propia vs. sin mover) depende EXCLUSIVAMENTE de la query 3 y no pasa por la guarda del UPDATE en absoluto.

**Mutación verificada en vivo** (revertida antes de commitear, `git status --porcelain` vacío tras revertir):

```
- Se sacó `.where(tenantWhere(schema.branches, ctx))` de la query 3.
- Corrida dirigida: `pnpm exec vitest run --no-file-parallelism -t "aislamiento" test/tenancy/ancla-cron-reassign.test.ts`
- Resultado: 1 test FALLÓ.
  AssertionError: El socio 11 no se recategorizó a su sede PROPIA dominante (10).
  Si la query 3 no está filtrada, el ruido de la sede ajena diluye la dominancia
  y el socio queda sin mover — este es el efecto observable de sacar tenantWhere
  de la query 3.
  Expected: "10"
  Received: "9"   (branch_id se quedó en la sede home, id 9, en vez de moverse a
                    la sede dominante propia, id 10)
- Revertido el cambio; `git status --porcelain` vacío; re-corrida completa:
  5/5 tests verdes.
```

Esto NO es un defecto del código de producción — es el comportamiento CORRECTO y deseado (defensa en profundidad real, no decorativa). Es una nota sobre la forma del test de mutación pedido por el plan, documentada en detalle en el docblock de cabecera de `ancla-cron-reassign.test.ts` para que un lector futuro entienda por qué el escenario de "aislamiento" no es el más simple posible.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Los 8 jobs de `src/jobs/` que corren `forEachActiveTenant` (D-01) están, con este plan, todos migrados en lo que a `users`/`member_profiles` respecta. `test/tenancy/con-04-crons-per-tenant.test.ts` (8 tests) sigue verde sin cambios — el contrato "el cuerpo corre una vez por gimnasio activo" no se tocó.
- Deuda explícita para 173-30 (el switch final): las 4 entradas de allowlist objetivo (`notification-cron.ts{member_profiles,users}`, `expire-lost-leads.ts{users}`, `reassign-multibranch.ts{users}`) más 5 entradas COLATERALES que quedaron `staleNoLongerViolating` sin que este plan las haya tocado a propósito (efecto del lint por-statement, mismo patrón que 173-04/173-09/173-10/173-11): `notification-cron.ts{check_in_responses}`, `reassign-multibranch.ts{attendance,branches,subscription_plans,subscriptions}`. Ninguna de las 9 se borró de `tenant-lint-allowlist.json` real (dueño 173-30, no tocado en este plan).
- 2 rojos esperados en `test/tenancy/con-06-lint.test.ts` (dueño 173-30) — no verificados en este plan (no forma parte de su alcance), consistentes con las 9 entradas de arriba.
- Este plan no introduce ninguna tabla nueva a `TENANT_STRICT_MODULES`; `users` sigue sin estar strict — el switch (allowlist primero, entrada strict después, en dos commits) queda para el plan de cierre.

---

## Threat Flags

Ninguno — las 6 mitigaciones del `threat_model` de este plan (T-173-16-01 a T-173-16-06) están cubiertas por el código de las tasks 1 y 2 y verificadas por el test de la task 3. No se detectó superficie de seguridad nueva fuera del `threat_model` declarado.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `el-templo-api/src/jobs/reassign-multibranch.ts` — FOUND
- `el-templo-api/src/jobs/notification-cron.ts` — FOUND
- `el-templo-api/src/jobs/expire-lost-leads.ts` — FOUND
- `el-templo-api/test/tenancy/ancla-cron-reassign.test.ts` — FOUND
- `1587ccaa` — FOUND
- `9dff2449` — FOUND
- `4b4ed420` — FOUND
- `d547c76d` — FOUND

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_
