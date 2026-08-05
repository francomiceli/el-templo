---
phase: 122-ltv-vida-del-cliente
verified: 2026-06-04T00:00:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "GET /api/admin/analytics/ltv con datos reales en staging"
    expected: "Responde 200 con lifetimeHeadlineMonths, survivalMedianMonths, monetary.{ARS,EUR}, breakdowns(branch/country/plan), n; gestión recibe 403"
    why_human: "Requiere MySQL real de staging — la suite de integración corre en CI, no localmente (política del proyecto)"
  - test: "Finanzas Avanzadas dashboard no roto tras la deprecación del ARPU (D-122-01)"
    expected: "El panel de Finanzas Avanzadas sigue mostrando la serie arpu sin errores ni campos vacíos"
    why_human: "El comportamiento runtime del dashboard (frontend consumidor) no es verificable con grep"
  - test: "El headline (1÷churn) y la mediana Kaplan-Meier difieren visiblemente cuando el churn es front-loaded"
    expected: "Ambos números aparecen en la respuesta; cuando hay más churn en los primeros meses, la mediana KM < headline"
    why_human: "Requiere datos de producción reales para confirmar la señal estadística; no comprobable en test de integración puro"
---

# Phase 122: LTV / Vida del Cliente — Verification Report

**Phase Goal:** Entregar la vida del cliente encadenada al churn de la Fase 121: headline `1÷churn` + Kaplan-Meier (mediana de supervivencia, solo mediana, con censura) + LTV monetario desde pagos reales (proyectado y observado, nunca ARPU), separado por moneda y abierto por sucursal/país/plan. Backend-only.
**Verified:** 2026-06-04
**Status:** HUMAN_NEEDED — todos los must-haves del codebase verificados; 3 ítems pendientes de UAT en staging.
**Re-verification:** No — verificación inicial.

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                              | Status                    | Evidence                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | LTV-01: headline = 1÷churn mensual reusando ChurnService de Fase 121, por breakdowns estándar                                                      | ✓ VERIFIED                | `ltv-service.ts:155` instancia `ChurnService` en el ctor; `getLtv:175` llama `lifetimeFromChurnPct(churn.window.churn.percentage)` — churn NO se recalcula. Abierto por branch/country/plan. `ltv.test.ts:259-266` lo aserta cross-service.                                                                                                                     |
| 2   | LTV-02/03: Kaplan-Meier mediana de supervivencia; clientes activos CENSURADOS, no descartados; fin de vida por churn maduro de Fase 121 encadenado | ✓ VERIFIED                | `kaplan-meier.ts`: estimador product-limit puro, ties colapsan en un step, censored = event:false, quedan en el denominador de riesgo. `classifyLives:500-514` marca `closed = matured && !retained`; censurados van con `event: false` a `kaplanMeierMedian`. Test de integración `ltv.test.ts:296-328` prueba que `ltv.n === 3` con 1 cerrado + 2 censurados. |
| 3   | LTV-04: LTV monetario desde pagos REALES (financial_transactions), proyectado Y observado; nunca ARPU snapshot ni precio de lista                  | ✓ VERIFIED                | `realPaymentsByMember:274-336`: filtro canónico `voidedAt IS NULL`, `kind IN (plan_charge, debt_settlement)`, `direction='inflow'`. Cero referencias a `priceRegular`/`listPrice` en el servicio. `ltv.test.ts:334-360` siembra pagos por debajo del precio de lista y aserta `observed === 13000 !== 30000`.                                                   |
| 4   | LTV-05: separado por moneda (ARS/EUR nunca sumados) + abierto por sucursal/país/plan                                                               | ✓ VERIFIED                | `toCurrency:120-122` rechaza monedas desconocidas. `buildMonetary:347-390` acumula en `Record<Currency, number[]>` separados. `ltvMonetarySchema` declara `{ ARS, EUR }` como bloques independientes. Test `ltv.test.ts:397-443` siembra AR+ES y aserta `.ARS.observed === 10000` y `.EUR.observed === 200` nunca iguales a 10200.                              |
| 5   | D-122-01: ARPU de Finanzas Avanzadas deprecado-pero-funcionando; no eliminado; dashboard no roto                                                   | ✓ VERIFIED (code) / ? UAT | `advanced-finance-service.ts:145-152` y `:351-357`: `@deprecated Phase 122 D-122-01` con la nota canónica D-09. Cálculo matemático intacto (`activeMembers > 0 ? Math.round(accr.ARS / activeMembers) : 0`); schema y tipos sin tocar (diff additive-only). Funcionamiento del dashboard en runtime requiere UAT.                                               |
| 6   | GET /ltv: `requireAdminAnalytics` (gestión → 403) + `requireBranchAccess`; `window` acotado 1..365                                                 | ✓ VERIFIED                | `routes.ts:492-515`: `preHandler: [requireAdminAnalytics, requireBranchAccess({from:"query.branchId",optional:true})]`. `ltvQuerystring:742-750`: `window: { type:"integer", minimum:1, maximum:365 }`. `requireAdminAnalytics:54-64` rechaza roles fuera de `ADMIN_ROLES`. Test `ltv.test.ts:490-533` aserta 403 gestión / 200 admin.                          |
| 7   | Test de integración cubre LTV-01..05 + auth; TZ-flake-safe (sin `new Date()` en seeding)                                                           | ✓ VERIFIED                | `ltv.test.ts`: 9 `it(` cases, 535 líneas (≥150). `dateOffset` usa `CURDATE()` en SQL para todas las fechas de seed. `serverNow()` lee `NOW()` de MySQL para `voidedAt` — cero `new Date()` literales (grep confirmado vacío). `tsc --noEmit` pasa sin errores.                                                                                                  |

**Score: 7/7** must-haves del codebase verificados.

---

### Required Artifacts

| Artifact                                                          | Propósito                                         | Status     | Detalles                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/analytics/kaplan-meier.ts`             | Helper puro KM survival-median                    | ✓ VERIFIED | 126 líneas (≥40), exporta `kaplanMeierMedian`, `KaplanMeierObservation`, `SURVIVAL_MEDIAN_THRESHOLD`, `MIN_COHORT_SIZE_FOR_MEDIAN`. Cero imports de drizzle/fastify/db/schema. Cero `: any`. Footer "No DB access, no logging, no any." presente. |
| `el-templo-api/test/analytics/kaplan-meier.test.ts`               | Tests unitarios KM edge-cases (D-122-06)          | ✓ VERIFIED | 9 `it(` cases cubriendo los 6 casos requeridos: eventos sin censura, censura-cambia-denominador, ties (×2), cohort vacío, un solo cliente, nunca cruza 0.5 (×2).                                                                                  |
| `el-templo-api/src/modules/analytics/types.ts`                    | Wire types LtvAnalytics + LtvSegmentRow           | ✓ VERIFIED | Declara `LtvCurrencyBlock`, `LtvMonetary`, `LtvSegmentRow`, `LtvAnalytics`; campos `projected`/`observed` presentes; `lifetimeHeadlineMonths`/`survivalMedianMonths` tipados `number \| null`; `AnalyticsFilters.window` NO duplicado.            |
| `el-templo-api/src/modules/analytics/ltv-service.ts`              | LtvService: headline + KM + monetary + breakdowns | ✓ VERIFIED | 515 líneas (≥120), `class LtvService` exportada. Importa `ChurnService`, `kaplanMeierMedian`, `expiryCohortConditions`/`lastExpiryPerPersonExpr`/`retainedExpr`/`maturedExpr`. Cero `: any`, cero `console.log`.                                  |
| `el-templo-api/src/modules/analytics/routes.ts`                   | GET /ltv registrado                               | ✓ VERIFIED | Instancia `LtvService` en línea 82, registra `"/ltv"` con `schema: ltvSchema`, `preHandler: [requireAdminAnalytics, requireBranchAccess]`, `handleServiceError`.                                                                                  |
| `el-templo-api/src/modules/analytics/schemas.ts`                  | ltvSchema (200 + 400/401/403/500)                 | ✓ VERIFIED | `ltvQuerystring` LOCAL (window 1..365), `ltvCurrencyBlockSchema`, `ltvMonetarySchema`, `ltvSchema` con 200 completo + 4 error codes. `analyticsQuerystring` NOT mutado (count=1 confirmado).                                                      |
| `el-templo-api/src/modules/analytics/advanced-finance-service.ts` | @deprecated D-122-01 en ARPU                      | ✓ VERIFIED | Dos marcadores `@deprecated Phase 122 D-122-01` en `:145` y `:351`. Cálculo ARPU sin modificar.                                                                                                                                                   |
| `el-templo-api/test/analytics/ltv.test.ts`                        | Integration test LTV-01..05 (CI-only)             | ✓ VERIFIED | 535 líneas, 9 casos de test, instancia BOTH `LtvService` y `ChurnService`, siembra `financialTransactions` con todos los campos notNull, `dateOffset` CURDATE-derived, cero `new Date()` literales de seeding.                                    |

---

### Key Link Verification

| From             | To                                          | Via                                                                      | Status  | Detalles                                                                                                                           |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ltv-service.ts` | `churn-service.ts`                          | `new ChurnService(db, log)` + `getChurn(filters)`                        | ✓ WIRED | `:148-155`: instancia en ctor; `:167`: fanout incluye `this.churnService.getChurn(filters)`.                                       |
| `ltv-service.ts` | `kaplan-meier.ts`                           | `kaplanMeierMedian(observations)`                                        | ✓ WIRED | `:60`: import; `:181-184` y `:456-460`: llamadas reales en `getLtv` y `breakdownByAxis`.                                           |
| `ltv-service.ts` | `financial_transactions`                    | Filtro canónico por `memberId`, `currency`, `voidedAt IS NULL`           | ✓ WIRED | `:284-321`: query real con `isNull(voidedAt)`, `inArray(kind,...)`, `eq(direction,"inflow")`, agrupado por `(memberId, currency)`. |
| `routes.ts`      | `ltv-service.ts`                            | `new LtvService(fastify.db, fastify.log)` + `ltvService.getLtv(filters)` | ✓ WIRED | `:82`: instancia; `:509`: llamada en el handler.                                                                                   |
| `ltv.test.ts`    | `ltv-service.ts` + `financial_transactions` | Instancia ambos servicios, siembra pagos reales, aserta cross-service    | ✓ WIRED | `:10-11`: imports; `:62-63`: ambos servicios instanciados; `:173-186`: `insertPayment` siembra en `financialTransactions`.         |

---

### Data-Flow Trace (Level 4)

| Artefacto                                   | Variable de datos                 | Fuente                                                                                                                        | ¿Produce datos reales?                                                  | Status    |
| ------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------- |
| `ltv-service.ts` → `lifetimeHeadlineMonths` | `churn.window.churn.percentage`   | `ChurnService.getChurn` → expiry-cohort SQL sobre `subscriptions`                                                             | Sí — query real a MySQL con `expiryCohortConditions`                    | ✓ FLOWING |
| `ltv-service.ts` → `survivalMedianMonths`   | `classified[]` from `cohortLives` | SQL sobre `subscriptions + branches + subscriptionPlans` con `maturedExpr/retainedExpr`                                       | Sí — query real, resultado mapeado a `{durationMonths, event}`          | ✓ FLOWING |
| `ltv-service.ts` → `monetary.*.observed`    | `paymentsByMember` Map            | SQL sobre `financial_transactions` con filtro canónico (voidedAt IS NULL, kind plan_charge/debt_settlement, direction inflow) | Sí — SUM(amount) real agrupado por memberId+currency                    | ✓ FLOWING |
| `ltv-service.ts` → `monetary.*.projected`   | `headline × monthlyRealRevenue`   | headline de ChurnService + media de (total ÷ durationMonths) sobre pagos reales                                               | Sí — compuesto sobre datos reales; null cuando cualquier factor es null | ✓ FLOWING |

---

### Behavioral Spot-Checks

Step 7b: **SKIPPED** — la suite de integración requiere MySQL real (política del proyecto: tests solo en CI). Los checks con `tsc --noEmit` y grep sobre el código fuente se realizaron en su lugar.

**TypeScript:** `pnpm exec tsc --noEmit` pasa sin errores (0 líneas de output).

---

### Probe Execution

Step 7c: **SKIPPED** — no hay probes declaradas en los PLAN files ni en los paths convencionales `scripts/*/tests/probe-*.sh` para esta fase.

---

### Requirements Coverage

| Requirement | Plan fuente              | Descripción                                                                     | Status      | Evidencia                                                                                                                    |
| ----------- | ------------------------ | ------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| LTV-01      | 122-02-PLAN              | Headline = 1 ÷ churn mensual usando churn del Bloque 1, por breakdowns estándar | ✓ SATISFIED | `LtvService:175` + test cross-service `ltv.test.ts:259-266`                                                                  |
| LTV-02      | 122-01-PLAN, 122-02-PLAN | Kaplan-Meier mediana de supervivencia; activos tratados como censurados         | ✓ SATISFIED | `kaplan-meier.ts` puro + 9 unit tests (D-122-06) + test integración `ltv.test.ts:296-328`                                    |
| LTV-03      | 122-02-PLAN              | Fin de vida = lógica de churn maduro del Bloque 1 (encadenado)                  | ✓ SATISFIED | `classifyLives:500-514` usa `matured && !retained` de `expiryCohortConditions`; D-122-02 heredado sin redefinición           |
| LTV-04      | 122-02-PLAN              | LTV monetario desde pagos reales (proyectado + observado, nunca ARPU snapshot)  | ✓ SATISFIED | `realPaymentsByMember:274` — filtro canónico; cero referencias a `priceRegular`; test siembra por debajo del precio de lista |
| LTV-05      | 122-02-PLAN              | LTV separado por moneda; abierto por sucursal/país/plan                         | ✓ SATISFIED | `LtvMonetary: {ARS, EUR}`; `toCurrency` filtra desconocidas; `LTV_AXES = [branch,country,plan]`; test ARS/EUR isolation      |

---

### Anti-Patterns Found

| Archivo          | Línea   | Patrón                                                                                                                         | Severidad                                    | Impacto                                                                                                                                                                                     |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ltv-service.ts` | 411-419 | `breakdownByAxis` llama `cohortLives` + `realPaymentsByMember` por cada eje (×3), duplicando las queries del fan-out top-level | ℹ️ Info (warning de rendimiento, no blocker) | En producción con filtros amplios = 3×2 = 6 queries extra por llamada a `getLtv` vs. 2 queries posibles si los datos se pasaran como argumento. No rompe correctness. No hay TBD/FIXME/XXX. |

No se encontraron: `TBD`, `FIXME`, `XXX`, `return null` sin guarda, `placeholder`, ni patrones de stub en ninguno de los archivos nuevos/modificados.

---

### Human Verification Required

#### 1. GET /ltv en staging con datos reales

**Test:** Pushear a origin/staging, esperar que CI pase (incluyendo la suite `ltv.test.ts` en MySQL real), luego hacer GET `/api/admin/analytics/ltv?dateFrom=...&dateTo=...` con token de admin.
**Expected:** Respuesta 200 con `lifetimeHeadlineMonths` (número o null), `survivalMedianMonths` (número o null), `monetary.ARS` y `monetary.EUR` con campos `projected`/`observed`/`monthlyRealRevenue`/`n`, `breakdowns` con ejes `branch`/`country`/`plan`, y `n` total. Mismo endpoint con token de gestión → 403.
**Why human:** La suite de integración está diseñada para CI-only (MySQL real). Los tests unitarios KM y el typecheck local son suficientes para garantizar lógica pura, pero el "last mile" de datos reales en staging requiere ejecución real.

#### 2. Finanzas Avanzadas dashboard no roto (D-122-01)

**Test:** En el admin, navegar a Finanzas Avanzadas después de que el deploy esté activo en staging. Verificar que la serie ARPU (ARS y EUR) sigue siendo visible y tiene valores.
**Expected:** Los campos `arpu` aparecen en la respuesta del endpoint de Finanzas Avanzadas con valores numéricos; el dashboard no muestra error ni campos vacíos donde antes había datos.
**Why human:** La deprecación es annotation-only y el math está intacto, pero confirmar que el frontend consumidor no rompió requiere render real del dashboard.

#### 3. Señal estadística del endpoint (diferencia headline vs. mediana KM)

**Test:** Consultar GET /ltv con un rango que tenga datos reales suficientes (ej. últimos 365 días). Comparar `lifetimeHeadlineMonths` vs. `survivalMedianMonths`.
**Expected:** Ambos valores presentes; si el churn es más alto en los primeros meses, la mediana KM debe ser < headline (señal de front-loaded churn). Si son iguales, el churn es parejo — ambos resultados son válidos.
**Why human:** Requiere datos reales de producción para validar la señal estadística. No es un error si difieren o coinciden — se verifica que ambos se retornen y tengan sentido en el contexto real.

---

### Gaps Summary

**No hay gaps**. Los 7 must-haves están verificados en el codebase. Los 3 ítems de human_verification son gates de UAT de staging (política del proyecto) y no representan defectos de implementación.

La única observación técnica es la ineficiencia de `breakdownByAxis` que re-ejecuta las queries del cohort por eje (×3), anotada como ℹ️ Info — no bloquea el objetivo de la fase.

---

_Verified: 2026-06-04_
_Verifier: Claude (gsd-verifier)_
