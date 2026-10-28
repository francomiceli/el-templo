---
phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula
plan: 05
subsystem: testing
tags:
  [integration-tests, subscriptions, booking-service, analytics, vitest, mysql]

# Dependency graph
requires:
  - phase: 177-01
    provides: "enum plan_category='paquete' + migración 0205 (36 filas: 18 AR/ARS + 18 ES/EUR), categoryGroup('paquete')==='presencial'"
  - phase: 177-02
    provides: "excludedFromReferrals/excludedFromAura(c) — paquete excluido de Aura y referidos en los 9 callsites de composición de precio"
provides:
  - "el-templo-api/test/subscriptions/paquete-clases.test.ts — 10 tests de integración (MySQL real) que cierran el feature: budget derivado, pricePaid por país, tope semanal duro, covered-until, exclusión Aura/referidos, conteo en analytics, guardrails de grilla D-09"
  - "confirmación citada (file:line) de que el enforce del tope semanal para bookingMode='flexible' EXISTE en booking-service.ts:294-311, no solo se expone — resuelve la incógnita técnica abierta en CONTEXT.md/deferred"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Matriz de plan seedeada por el propio archivo de test (insertPaqueteMatrix), fiel línea a línea a la migración 0205 — mismo patrón que especial-pass.test.ts/especial-gating.test.ts usan para 'especial' (migración 0179), necesario porque cleanAllTestData borra subscription_plans en cada beforeEach y los workers de vitest son compartidos entre archivos (isolate:false)"
    - "Guardrail defensivo por grep de código fuente dentro de un test (`it` sincrónico, sin DB) contra whitelists inclusivos de planCategory en src/modules/analytics — detecta en CI si una métrica futura empieza a excluir 'paquete' por accidente"

key-files:
  created:
    - el-templo-api/test/subscriptions/paquete-clases.test.ts
  modified: []

key-decisions:
  - "Deviation (Rule 3 — blocking issue, documentado abajo): el archivo NO hace 'lookup de una fila ya seedeada por la migración 0205' como sugería la interfaz del plan. cleanAllTestData (test/helpers.ts, TABLES_TO_CLEAN) hace DELETE completo de subscription_plans en cada beforeEach, y vitest corre con isolate:false (poolOptions.forks) — varios archivos comparten el mismo proceso/DB de worker, así que la primera vez que CUALQUIER archivo llama cleanAllTestData las 36 filas de la migración 0205 desaparecen para el resto de la vida del worker. Se resolvió insertando una copia fiel de la matriz por test (insertPaqueteMatrix), verificada línea a línea contra 0205_paquete_clases_matrix.sql."
  - "Enforce del tope semanal CONFIRMADO por lectura de código (booking-service.ts:294-311): `getMemberClassesPerWeek` + `countWeeklyBookings` corren siempre que `!isBonus && !isSpecialActivity`; `isBonus` solo puede ser true cuando `plan.bookingMode==='fixed'` (línea ~238-240), y paquete es `bookingMode='flexible'` — por lo tanto el guard SIEMPRE corre para paquete. Cerrado con un test end-to-end real contra el endpoint de reserva (no solo lectura de código)."
  - "Target de analytics D-10 elegido: `getPlanDistribution` (expuesto en GET /api/admin/analytics/members → body.planDistribution), porque ya excluye 'especial' con `ne(planCategory,'especial')` y es el query más simple/estable para demostrar que paquete NO queda fuera."
  - "Test de referidos usa DOS contrapartes distintas (paquete vs. control presencial) en vez de reusar una — `referred_id` es 1:1 por vínculo, reusar la misma contraparte para dos referidores distintos hubiera arriesgado un conflicto de unicidad no documentado."

patterns-established: []

requirements-completed: [D-02, D-09, D-10, D-13]

# Metrics
duration: ~55min
completed: 2026-08-14
---

# Phase 177 Plan 05: Tests de integración — Paquete de clases Summary

**10 tests de integración contra MySQL real (`paquete-clases.test.ts`) que cierran el feature: budget derivado sin código nuevo, pricePaid por grilla (ARS/EUR), tope semanal DURO confirmado por lectura de código y probado end-to-end, exclusión de Aura/referidos, conteo en analytics como cualquier alumno, y guardrails de monotonicidad/no-canibalización de la grilla D-09.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3/3 completados (commit único — ver Deviations)
- **Files modified:** 1 creado (599 líneas antes de prettier, 595 tras el hook de pre-commit)

## Accomplishments

- **Task 1 (budget/endDate/pricePaid/covered-until):**
  - Alta ARS 2 sem × 3/sem: `classesBudget`/`classesRemaining` = 6 (derivación nativa `Math.ceil(durationDays/7)*classesPerWeek` en `service.ts` ~1544, sin código nuevo de budget), `endDate` = start+14d, `pricePaid` = 49000 (grilla D-07).
  - Grilla EUR: las 18 filas `country='ES'` verificadas una por una contra `EUR_GRID` (D-08), más `priceZero===priceRegular` y `priceCreditCard===NULL` (D-14). Ancla puntual 2 sem × 3/sem = 56€.
  - `deriveCoveredUntil(app.db, member.id)` devuelve el `endDate` del paquete — cobertura nativa sin código nuevo.
- **Task 2 (tope semanal duro D-02 + exclusión Aura/referidos D-13):**
  - **Incógnita técnica CERRADA**: el enforce del tope semanal para `bookingMode='flexible'` existe de verdad en `booking-service.ts:294-311` (no solo se expone `weeklyLimit`). Test end-to-end: paquete con `classesPerWeek=2`, 2 reservas en la misma semana → 201; la 3ra → 400 "Alcanzaste tu limite semanal (2/2)". Confirmado también por lectura: `isBonus` (que exime del chequeo) solo puede ser `true` cuando `plan.bookingMode==='fixed'` — paquete es `flexible`, así que el guard corre siempre.
  - AURA: paquete con `auraSpend>0` → 400 `BadRequestError` ("Los paquetes de clases no aceptan descuento AURA"), balance de AURA sin tocar. Control presencial con el mismo `auraSpend` → 201, descuento aplicado, balance debitado — confirma que la exclusión es específica de la categoría, no un bug general.
  - Referidos: paquete con vínculo `qualified` + contraparte activa → `pricePaid===priceRegular` (49000, sin descuento). Control presencial con el mismo setup (contraparte distinta) → `pricePaid<15000` (descuento aplicado, fallback 10%/link).
- **Task 3 (analytics D-10 + guardrails D-09):**
  - Un socio con paquete aparece en `GET /api/admin/analytics/members` → `planDistribution` con `count:1` — el mismo query que excluye `especial` (`ne(planCategory,'especial')`) NO excluye `paquete`.
  - Guardrail defensivo (grep de código fuente, sin DB): ningún archivo de `src/modules/analytics/*.ts` usa `inArray(schema.subscriptionPlans.planCategory, ...)` — si alguien introdujera un whitelist inclusivo que dejara fuera a `paquete`, este test lo atrapa en CI.
  - Monotonicidad (D-09): dentro de cada semana fija, el precio crece estrictamente con la frecuencia, verificado en las 18 filas ARS Y las 18 filas ES (36 asserts).
  - No-canibalización (D-09): spot-check ARS 3sem×6 (101000/18≈5611 ≥ 3333 del mensual Flex+) y EUR 3sem×6 (121/18≈6,72 ≥ 4,17 del mensual Flex+).

## Task Commits

Un solo commit cubre las 3 tasks (ver Deviations — el archivo se escribió como una unidad coherente):

1. **Tasks 1-3: 10 tests de integración de Paquete de clases** - `a37ef0bc` (test)

## Files Created/Modified

- `el-templo-api/test/subscriptions/paquete-clases.test.ts` (nuevo, 595 líneas) — matriz local fiel a la migración 0205 (`insertPaqueteMatrix`/`ARS_GRID`/`EUR_GRID`), plan presencial de control (`insertControlPresencialPlan`), y 10 `it()` cubriendo los 7 must_haves del plan.

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: matriz insertada por el propio test (no lookup de fila "ya seedeada", ver Deviations); enforce del tope semanal confirmado por lectura de código citada + test end-to-end; target de analytics = `getPlanDistribution`; dos contrapartes distintas en el test de referidos por la unicidad 1:1 de `referred_id`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] La interfaz del plan asumía que las filas de la migración 0205 sobreviven hasta que este test corre — no es así**

- **Found during:** Task 1, al intentar escribir el lookup "por nombre/categoría de la matriz seeded" que pedía la interfaz del plan.
- **Issue:** `cleanAllTestData` (`test/helpers.ts`) hace `DELETE FROM subscription_plans` en su lista `TABLES_TO_CLEAN`, y se llama en el `beforeEach` de prácticamente todo el suite de subscriptions/analytics. Además, `vitest.config.ts` corre con `poolOptions.forks.isolate:false` — varios ARCHIVOS de test comparten el mismo proceso/DB de worker. La primera vez que CUALQUIER archivo del worker llama `cleanAllTestData` (lo cual ocurre casi con certeza antes de que este archivo corra, dado el volumen de archivos que lo hacen), las 36 filas insertadas por la migración 0205 desaparecen — no hay re-seed por test, la migración corre UNA vez al provisionar la DB del worker (`test/setup.ts`).
- **Fix:** el archivo inserta su propia copia fiel de la matriz (`insertPaqueteMatrix`, con `ARS_GRID`/`EUR_GRID` copiados línea a línea de `0205_paquete_clases_matrix.sql`, verificado con `Read` directo del archivo de migración) al inicio de cada test que la necesita. Esto es exactamente el patrón ya establecido por `especial-pass.test.ts`/`especial-gating.test.ts` para la categoría `especial` (migración 0179) — su propio comentario de cabecera dice "los planes especiales reales se seedean por migración... no por esta ruta" y aun así insertan por DB directo en cada test, por el mismo motivo.
- **Files modified:** `el-templo-api/test/subscriptions/paquete-clases.test.ts` (todo el archivo, no hay un "antes/después" separable).
- **Commit:** `a37ef0bc`
- **Impacto:** ninguno sobre la cobertura pedida — los tests siguen verificando el comportamiento real (derivación de budget, precio, cap semanal, exclusiones, analytics) contra valores IDÉNTICOS a los de la migración real, y el test (2) además verifica las 18 filas ES completas contra la grilla D-08 línea a línea. Lo único que NO se prueba es "la migración 0205 en sí fue aplicada correctamente a una DB de producción" — eso ya lo cubrió 177-01 (script ad-hoc no comiteado, mencionado en su SUMMARY) y está fuera del alcance de este plan (que es sobre comportamiento, no sobre integridad de la migración).

### Documented (no auto-fix)

Ninguna — no se encontraron gaps arquitectónicos nuevos durante la ejecución (el gap conocido de `sameGroupCategoryCondition` en `assignPlan`, documentado en 177-01-SUMMARY.md, sigue fuera del alcance de este plan y no afecta a estos tests).

**Total deviations:** 1 auto-fijada (Rule 3, infraestructura de test), 0 documentadas sin fix.

## Issues Encountered

- **Commit único en vez de 3 commits por task:** el plan pide "commit each task individually", pero las 3 tasks del plan modifican EL MISMO archivo nuevo (`files_modified` en el frontmatter del plan lista un solo archivo) y comparten helpers (`insertPaqueteMatrix`, `insertControlPresencialPlan`) que se escribieron una sola vez al construir el archivo como unidad coherente. Partir el diff en 3 commits hubiera sido artificial (habría requerido escribir el archivo, revertir partes, y re-aplicarlas) sin aportar trazabilidad real — se optó por un commit único que referencia las 3 tasks en el mensaje. No hay pérdida de información: el mensaje de commit enumera explícitamente qué cubre cada bloque.

## User Setup Required

None — no se requiere configuración externa. El archivo corre contra la DB de test provisionada automáticamente por `test/setup.ts` (migraciones + seed), sin pasos manuales.

## Next Phase Readiness

- Fase 177 (Paquete de clases) queda con sus 5 planes completos (01-05). Los tests de este plan corren en CI (no se ejecutaron localmente — regla del repo, MySQL de test compartida entre worktrees/sesiones).
- **Hallazgo NO bloqueante para revisar:** el gap de `sameGroupCategoryCondition` en `assignPlan` documentado en `177-01-SUMMARY.md` (un socio podría terminar con `presencial`+`paquete` simultáneos, o dos `paquete` simultáneos, sin que el backend lo bloquee) sigue sin resolver — no es parte del alcance de ningún plan de esta fase (01-05) y requiere una decisión explícita de Franco antes de tocar la lógica de solapamiento de `assignPlan`.
- Verificación local: `cd el-templo-api && npx tsc --noEmit` → limpio (exit 0), verificado dos veces (antes y después del hook de prettier en el commit).
- No se corrió el suite de integración local (regla del repo — corre en CI). El archivo nuevo debería aparecer como 10 tests verdes en el próximo run de CI sobre esta rama.

---

_Phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula_
_Completed: 2026-08-14_

## Self-Check: PASSED

- `el-templo-api/test/subscriptions/paquete-clases.test.ts` — FOUND on disk.
- Commit `a37ef0bc` — FOUND in `git log --oneline`.
