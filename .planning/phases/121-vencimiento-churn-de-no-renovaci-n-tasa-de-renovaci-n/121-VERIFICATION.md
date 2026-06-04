---
phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n
verified: 2026-06-04T05:30:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Ejecutar CI en staging (push de la rama) y confirmar que churn.test.ts, renewal.test.ts y expiry-cohort.test.ts pasan en verde"
    expected: "Suite completa pasa contra MySQL real; los 3 archivos de test no reportan ningún fallo"
    why_human: "Por política del proyecto los tests de integración no se corren localmente (real MySQL en CI únicamente). tsc --noEmit pasa limpio, pero la ejecución real del SQL — incluyendo las fixes CR-01/CR-02 de retainedExpr — solo se puede validar en el pipeline de staging."
  - test: "Llamar GET /api/admin/analytics/churn con token admin en staging y verificar shape de respuesta"
    expected: "JSON con campos window (windowDays + churn MetricShape), comparison (array de 3 elementos a 5/10/15 días), enGracia (integer), series (array mensual con provisional boolean), breakdowns (4 ejes: branch/country/duration/plan)"
    why_human: "Requiere server corriendo y datos reales de suscripciones. No se puede verificar programáticamente sin levantar el servidor."
  - test: "Llamar GET /api/admin/analytics/renewal con token admin en staging y verificar shape de respuesta"
    expected: "JSON con campos windowDays (integer), renewal (MetricShape), enGracia (integer), breakdowns (4 ejes)"
    why_human: "Mismo motivo que /churn — requiere servidor corriendo con datos reales."
  - test: "Verificar que renewal.renewal.n == churn.window.churn.n para el mismo rango de fechas en staging"
    expected: "El denominador compartido (RENOV-01) se cumple: ambos endpoints reportan el mismo tamaño de cohorte madurada para los mismos filtros"
    why_human: "Requiere comparar dos llamadas a la API con datos reales de producción/staging para confirmar que el motor de cohorte es realmente el mismo."
---

# Phase 121: Verificacion de Vencimiento, Churn y Tasa de Renovacion

**Phase Goal:** Bloque 1 — churn person-based sobre cohorte por `end_date ∈ [from,to)`, churn maduro con ventana configurable / multi-N (5/10/15), serie historica con marca de provisorios. Bloque 2 — renovacion = renovados / vencidos sobre la MISMA cohorte (denominador compartido), corte 15d configurable, numero vivo (enGracia). Motor compartido `expiry-cohort.ts`. Endpoints GET /churn y GET /renewal bajo guard ADMIN.

**Verified:** 2026-06-04T05:30:00Z
**Status:** human_needed (todos los checks automaticos pasan; 4 items requieren CI real y server)
**Re-verification:** No — verificacion inicial

---

## Goal Achievement

### Verdades Observables

| #   | Verdad                                                                                                                                                                                              | Status                                     | Evidencia                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Motor expiry-cohort compartido (expiry-cohort.ts) con predicados injection-safe para cohort membership (D-01/D-03), last-expiry-per-person (D-04), retention (D-05/D-06), maturity (D-08)           | VERIFIED                                   | El archivo existe (202 LOC), exporta los 6 simbolos requeridos, usa `sql` parametrizado para from/to y `sql.raw(String(n))` unicamente para el integer controlado por el servicio. Sin DB access, sin logging, sin `any`.                                                                             |
| 2   | CR-01 corregido: `retainedExpr` tiene la continuidad gate `s_next.end_date > E` para que el ciclo anterior del propio miembro no lo marque como retained                                            | VERIFIED                                   | Linea 180: `AND s_next.end_date > ${schema.subscriptions.endDate}` presente en el codigo post-commit 70967c7d. El docstring en linea 156-159 documenta el fix explicitamente.                                                                                                                         |
| 3   | CR-02 corregido: ambas subqueries correlacionadas (`lastExpiryPerPersonExpr` y `retainedExpr`) incluyen `branch_id = E.branch_id` para evitar scope leak cross-sede                                 | VERIFIED                                   | Linea 136: `AND s2.branch_id = ${schema.subscriptions.branchId}` en `lastExpiryPerPersonExpr`. Linea 179: `AND s_next.branch_id = ${schema.subscriptions.branchId}` en `retainedExpr`.                                                                                                                |
| 4   | GET /api/admin/analytics/churn registrado bajo `requireAdminAnalytics` + `requireBranchAccess` con `churnSchema` (window 1..365, respuesta completa declarada)                                      | VERIFIED                                   | routes.ts lineas 402-433. Schema tiene window/comparison/enGracia/series (con provisional)/breakdowns con 4 ejes. errorSchema para 400/401/403/500.                                                                                                                                                   |
| 5   | ChurnService.getChurn() retorna churn person-based con multi-N comparison (5/10/15), churn maduro + enGracia, serie mensual provisional, breakdowns por branch/country/duration/plan                | VERIFIED                                   | churn-service.ts 414 LOC. Importa todos los predicados de expiry-cohort.ts. Promise.all sobre officialAndGrace + multiNComparison + monthlySeries + allBreakdowns. `metricShape` guarda toda division. Sin `any`, sin `console.*`.                                                                    |
| 6   | GET /api/admin/analytics/renewal registrado bajo `requireAdminAnalytics` + `requireBranchAccess` con `renewalSchema` (window 1..365, respuesta completa con windowDays/renewal/enGracia/breakdowns) | VERIFIED                                   | routes.ts lineas 440-471. renewalSchema declara todos los campos de RenewalAnalytics.                                                                                                                                                                                                                 |
| 7   | RenewalService.getRenewal() usa los MISMOS predicados que ChurnService sobre la MISMA cohorte (RENOV-01), con enGracia como numero vivo (RENOV-03) y breakdowns por los 4 ejes (RENOV-04)           | VERIFIED                                   | renewal-service.ts 271 LOC. Importa expiryCohortConditions, lastExpiryPerPersonExpr, retainedExpr, maturedExpr desde expiry-cohort.ts. Estructura identical a ChurnService para garantizar mismo denominador.                                                                                         |
| 8   | Tipos wire ChurnAnalytics y RenewalAnalytics definidos en types.ts + AnalyticsFilters.window opcional                                                                                               | VERIFIED                                   | types.ts exporta ChurnAnalytics (linea 568), RenewalAnalytics (linea 611), ChurnWindowResult, ChurnSeriesPoint, ChurnSegmentRow, RenewalSegmentRow, ChurnRenewalAxis. AnalyticsFilters tiene `window?: number` (linea 700).                                                                           |
| 9   | Legacy countChurnedMembers, computeRetentionRate y getRenewalRate anotadas `@deprecated Phase 121 D-09` apuntando a /churn y /renewal (sin remover behavior ni callers)                             | VERIFIED                                   | service.ts tiene 3 marcadores: linea 330/339 para countChurnedMembers, linea 372/381 para computeRetentionRate, linea 698/708 para getRenewalRate. Callers en lineas 108/109/112/195 intactos.                                                                                                        |
| 10  | Tests de integracion para los 3 modulos (expiry-cohort.test.ts, churn.test.ts, renewal.test.ts) cubren todos los requisitos CHURN-01..06 y RENOV-01..04 y type-check sin errores                    | VERIFIED (codigo) / PENDING (ejecucion CI) | Los 3 archivos existen (344 + 436 + 455 LOC respectivamente). `tsc --noEmit` pasa limpio (sin output de error). La cobertura incluye CHURN-01..06 y RENOV-01..04 incluyendo el caso 403 de gestion, DISTINCT persons, provisional flag, shared denominator assertion. Ejecucion real = CI en staging. |

**Score:** 10/10 verdades verificadas en codigo (4 items de ejecucion real requieren human/CI)

---

### Artefactos Requeridos

| Artefacto                                                | Descripcion esperada                                        | Status          | Detalle                                                                                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/analytics/expiry-cohort.ts`   | Motor compartido con 6 exports                              | VERIFIED        | 202 LOC. Exports: RENOVATION_WINDOW_DEFAULT_DAYS, CHURN_COMPARISON_WINDOWS, expiryCohortConditions, lastExpiryPerPersonExpr, retainedExpr, maturedExpr. |
| `el-templo-api/src/modules/analytics/types.ts`           | ChurnAnalytics + RenewalAnalytics + AnalyticsFilters.window | VERIFIED        | ChurnAnalytics en linea 568, RenewalAnalytics en linea 611, window?: number en linea 700. Todos usan MetricShape; sin `any`.                            |
| `el-templo-api/src/modules/analytics/churn-service.ts`   | ChurnService con getChurn()                                 | VERIFIED        | 414 LOC. Exporta ChurnService. Usa todos los predicados del motor.                                                                                      |
| `el-templo-api/src/modules/analytics/renewal-service.ts` | RenewalService con getRenewal()                             | VERIFIED        | 271 LOC. Exporta RenewalService. Mismo patron que ChurnService.                                                                                         |
| `el-templo-api/src/modules/analytics/schemas.ts`         | churnSchema + renewalSchema                                 | VERIFIED        | churnSchema (lineas 619-663) y renewalSchema (lineas 701-731). Window 1..365. Todos los campos declarados.                                              |
| `el-templo-api/src/modules/analytics/routes.ts`          | GET /churn y GET /renewal bajo ADMIN guard                  | VERIFIED        | Ambas rutas registradas (lineas 410, 448). requireAdminAnalytics + requireBranchAccess en ambas.                                                        |
| `el-templo-api/test/analytics/expiry-cohort.test.ts`     | Tests del motor de cohorte                                  | VERIFIED (tipo) | 344 LOC. Cubre half-open boundary, paused exclusion, last-expiry-per-person, retention, maturity. tsc limpio.                                           |
| `el-templo-api/test/analytics/churn.test.ts`             | Tests de GET /churn y ChurnService                          | VERIFIED (tipo) | 436 LOC. Cubre CHURN-01..06 + 403 case. tsc limpio.                                                                                                     |
| `el-templo-api/test/analytics/renewal.test.ts`           | Tests de GET /renewal y RenewalService                      | VERIFIED (tipo) | 455 LOC. Cubre RENOV-01..04 + 403 case + shared denominator assertion. tsc limpio.                                                                      |

### Key Links Verificados

| Desde                | Hacia                | Via                                      | Status | Detalle                                                                                                                                                    |
| -------------------- | -------------------- | ---------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `churn-service.ts`   | `expiry-cohort.ts`   | import de predicados                     | WIRED  | Lineas 59-65: importa expiryCohortConditions, lastExpiryPerPersonExpr, retainedExpr, maturedExpr, RENOVATION_WINDOW_DEFAULT_DAYS, CHURN_COMPARISON_WINDOWS |
| `renewal-service.ts` | `expiry-cohort.ts`   | import de predicados                     | WIRED  | Lineas 52-57: mismos predicados que churn-service                                                                                                          |
| `churn-service.ts`   | `scope.ts`           | applyScope en subscriptions.branchId     | WIRED  | Linea 53: `import { applyScope } from "./scope"`. Usado en cada query del servicio.                                                                        |
| `renewal-service.ts` | `scope.ts`           | applyScope en subscriptions.branchId     | WIRED  | Linea 47: `import { applyScope } from "./scope"`. Usado en cada query.                                                                                     |
| `routes.ts`          | `churn-service.ts`   | new ChurnService().getChurn              | WIRED  | Lineas 17, 78, 427: importado, instanciado, llamado.                                                                                                       |
| `routes.ts`          | `renewal-service.ts` | new RenewalService().getRenewal          | WIRED  | Lineas 18, 79, 465: importado, instanciado, llamado.                                                                                                       |
| `expiry-cohort.ts`   | `cohorts.ts`         | rangeConditions en subscriptions.endDate | WIRED  | Linea 50: `import { rangeConditions } from "./cohorts"`. Usado en expiryCohortConditions.                                                                  |

### Data-Flow Trace (Level 4)

| Artefacto            | Variable de datos    | Fuente                                                                                          | Produce datos reales                          | Status  |
| -------------------- | -------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------- | ------- |
| `churn-service.ts`   | `rows` (cohort rows) | `this.db.select().from(schema.subscriptions).where(...)` con predicados reales de expiry-cohort | Si — query Drizzle contra tabla subscriptions | FLOWING |
| `renewal-service.ts` | `rows` (cohort rows) | Identica composicion de predicados que churn-service                                            | Si — misma tabla, mismos predicados           | FLOWING |
| `routes.ts /churn`   | `result`             | `churnService.getChurn(filters)`                                                                | Si — resultado real del servicio              | FLOWING |
| `routes.ts /renewal` | `result`             | `renewalService.getRenewal(filters)`                                                            | Si — resultado real del servicio              | FLOWING |

### Verificaciones CR-01 y CR-02 (Fixes del Code Review)

Estas dos correcciones eran BLOCKER en el review (commit 70967c7d). Se verifica su presencia:

**CR-01 — `retainedExpr` continuidad gate:**

- El codigo en `expiry-cohort.ts:180` incluye `AND s_next.end_date > ${schema.subscriptions.endDate}`
- El docstring (lineas 156-159) documenta el razonamiento: "a prior cycle ends on or before E, so it can never satisfy the gate"
- VERIFICADO PRESENTE

**CR-02 — Scope de subqueries correlacionadas:**

- `lastExpiryPerPersonExpr` (linea 136): `AND s2.branch_id = ${schema.subscriptions.branchId}`
- `retainedExpr` (linea 179): `AND s_next.branch_id = ${schema.subscriptions.branchId}`
- VERIFICADO PRESENTE EN AMBAS SUBQUERIES

### Behavioral Spot-Checks

Step 7b: SKIPPED — los tests de integracion requieren MySQL real (CI-only por politica del proyecto). El servidor no esta disponible para pruebas en este contexto.

### Probe Execution

Step 7c: SKIPPED — no hay probes declarados en los PLANs ni scripts convencionales `scripts/*/tests/probe-*.sh` para esta fase. La verificacion de comportamiento delegada a CI.

### Coverage de Requisitos

| Requisito | Plan   | Descripcion                                                                                         | Status    | Evidencia                                                                                                                                                                   |
| --------- | ------ | --------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CHURN-01  | 01, 02 | Churn como DISTINCT persons con sub vencida en [from,to) sin nueva sub dentro de N dias             | SATISFIED | ChurnService cuenta user_id DISTINCT via lastExpiryPerPersonExpr. Test linea 171 cubre el caso base.                                                                        |
| CHURN-02  | 02     | N configurable; comparison con 5/10/15 simultaneos                                                  | SATISFIED | churnQuerystring valida window 1..365. multiNComparison usa CHURN_COMPARISON_WINDOWS=[5,10,15]. Test linea 212.                                                             |
| CHURN-03  | 02     | Churn maduro: solo entran personas vencidas >= N dias ago                                           | SATISFIED | maturedExpr y foldChurn excluyen personas en grace. enGracia las cuenta. Test linea 230.                                                                                    |
| CHURN-04  | 01, 02 | Renovacion anticipada y cambio de duracion cuentan como retencion; pausa no cuenta como vencimiento | SATISFIED | retainedExpr no filtra planId (plan change OK). s_next.start_date sin floor (early renewal OK). expiryCohortConditions excluye status='paused'. Tests lineas 257, 280, 305. |
| CHURN-05  | 02     | Serie historica mensual con flag provisional para cohortes inmaduras                                | SATISFIED | monthlySeries buckea por bucketExpr(endDate,"monthly"). Bucket marcado provisional si cualquier persona no ha madurado. Test linea 325.                                     |
| CHURN-06  | 02     | Churn abierto por branch/country/duration/plan con nominal+%+n                                      | SATISFIED | allBreakdowns corre los 4 ejes. breakdownSegmentKey genera la clave. deriveDurationTier para duration axis. Test linea 357.                                                 |
| RENOV-01  | 01, 03 | Renovacion = renovados / vencidos sobre LA MISMA cohorte que churn                                  | SATISFIED | RenewalService usa predicados identicos a ChurnService. Test linea 175 aserta `renewal.renewal.n === churn.window.churn.n`.                                                 |
| RENOV-02  | 03     | Corte renovacion configurable, default 15 dias                                                      | SATISFIED | RENOVATION_WINDOW_DEFAULT_DAYS=15. filters.window ?? RENOVATION_WINDOW_DEFAULT_DAYS. renewalQuerystring valida window 1..365. Test linea 284.                               |
| RENOV-03  | 03     | Numero vivo: renov%+churn% no forzado a 100; enGracia expuesto                                      | SATISFIED | foldRenewal excluye in-grace de num+den. enGracia retornado. Test linea 304 aserta suma != 100 cuando enGracia > 0, == 100 cuando enGracia == 0.                            |
| RENOV-04  | 03     | Renovacion comparable por segmento (branch/country/duration/plan)                                   | SATISFIED | allBreakdowns en RenewalService corre 4 ejes. RenewalSegmentRow con renewal MetricShape. Test linea 371.                                                                    |

Todos los requisitos de la fase (CHURN-01..06, RENOV-01..04) estan SATISFIED en codigo.

### Anti-Patterns Detectados

| Archivo                              | Linea     | Pattern                                                                                 | Severidad | Impacto                                                                                    |
| ------------------------------------ | --------- | --------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| churn-service.ts                     | 173, 189  | `userId` seleccionado pero no usado en el loop JS (WR-02 del review — warning abierto)  | INFO      | Confusion de lectura; el DISTINCT garantizado en SQL. No afecta correctitud.               |
| churn-service.ts, renewal-service.ts | multiples | `Number(r.matured) === 1` asume coercion de mysql2 (WR-03 del review — warning abierto) | WARNING   | Fragil si el driver retorna boolean/string; funciona en mysql2 actual. No bloquea el goal. |

No se encontraron: TBD/FIXME/XXX sin referencia de seguimiento, `any` types, `console.*`, return null/stub patterns, datos hardcodeados como estados finales.

### Human Verification Required

**4 items requieren verificacion humana/CI:**

#### 1. CI Pass en staging — suite de tests de integracion

**Test:** Pushear la rama a staging y esperar que el pipeline corra churn.test.ts, renewal.test.ts y expiry-cohort.test.ts contra MySQL real.
**Expected:** Los 3 archivos pasan verde. Las fixes CR-01 (continuidad gate) y CR-02 (branch_id scope) son validadas por los test cases D-04, D-05/D-06 de expiry-cohort.test.ts y los casos CHURN-01/CHURN-04/RENOV-01 de churn.test.ts/renewal.test.ts.
**Why human:** Por politica del proyecto, los tests de integracion son CI-only (MySQL real). `tsc --noEmit` pasa limpio localmente pero no ejecuta los queries.

#### 2. GET /churn — shape de respuesta en staging

**Test:** Con token admin, `GET /api/admin/analytics/churn?dateFrom=2026-01-01&dateTo=2026-06-01` en staging.
**Expected:** JSON con `window` (windowDays=15, churn MetricShape), `comparison` (array con windowDays 5/10/15), `enGracia` (integer), `series` (array mensual con provisional boolean), `breakdowns` (4 items de axis: branch/country/duration/plan).
**Why human:** Requiere servidor corriendo con datos reales.

#### 3. GET /renewal — shape de respuesta en staging

**Test:** Con token admin, `GET /api/admin/analytics/renewal?dateFrom=2026-01-01&dateTo=2026-06-01` en staging.
**Expected:** JSON con `windowDays` (15), `renewal` (MetricShape), `enGracia` (integer), `breakdowns` (4 ejes).
**Why human:** Requiere servidor corriendo.

#### 4. Denominador compartido RENOV-01 en datos reales

**Test:** Comparar `renewal.renewal.n` de GET /renewal con `churn.window.churn.n` de GET /churn usando los mismos filtros en staging.
**Expected:** Ambos valores son iguales (la cohorte madurada es la misma).
**Why human:** La assertion del test cubre esto en MySQL real pero solo se ejecuta en CI.

---

## Resumen de Gaps

No hay gaps. Todos los must-haves del plan estan verificados en el codigo:

- El motor `expiry-cohort.ts` existe, es sustantivo, esta conectado a ambos servicios.
- Las fixes CR-01 y CR-02 del code review estan presentes en el archivo (commit 70967c7d verificado).
- Los endpoints GET /churn y GET /renewal estan registrados bajo el guard ADMIN correcto.
- Los schemas declaran todos los campos de ChurnAnalytics y RenewalAnalytics.
- Los 3 archivos de test type-check sin errores y cubren CHURN-01..06 y RENOV-01..04.
- Los metodos legacy tienen anotaciones @deprecated D-09 sin cambios de behavior.
- `tsc --noEmit` pasa limpio.

El status es `human_needed` (no `passed`) porque la ejecucion real de los tests de integracion contra MySQL es un gate de CI que no puede sustituirse con inspeccion de codigo.

---

_Verified: 2026-06-04T05:30:00Z_
_Verifier: Claude (gsd-verifier)_
