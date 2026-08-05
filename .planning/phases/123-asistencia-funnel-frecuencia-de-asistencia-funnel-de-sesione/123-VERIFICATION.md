---
phase: 123-asistencia-funnel-frecuencia-de-asistencia-funnel-de-sesione
verified: 2026-06-04T20:00:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Ejecutar la suite completa de CI en staging y confirmar que todos los tests de frequency.test.ts, trial-funnel.test.ts y golden-case.test.ts pasan contra MySQL real"
    expected: "0 tests fallando en los 3 archivos nuevos; los tests de analytics existentes también verdes"
    why_human: "Los tests solo corren en CI contra MySQL real, no localmente. El verifier puede confirmar existencia y typecheck pero no ejecución real de los assertions contra la base de datos."
  - test: "Llamar GET /api/admin/analytics/frequency con token admin (sin filtros) y verificar la forma de la respuesta"
    expected: "200 con body que contiene distribution (4 bandas), coolingDown (array), checkInAdoption (array con ratio), breakdowns (array con axis branch/country/duration/plan)"
    why_human: "Requiere servidor corriendo con datos reales; el verifier no puede arrancar el servidor"
  - test: "Llamar GET /api/admin/analytics/trial-funnel sin filtros y luego con ?window=30, verificar respuesta"
    expected: "200 con body que contiene counts (reservaron/asistieron/compraron), rates (tasaShow/tasaCierre/puntaAPunta), series (array con provisional boolean), breakdowns (axis branch/country/turno/plan), attributionWindowDays=21 y luego 30"
    why_human: "Requiere servidor corriendo; el verifier no puede arrancar el servidor"
  - test: "Verificar que el batch nightly (03:00 AR) ejecuta sin errores con el nuevo FrequencyService.coolingOrInactiveUserIds y que segmentos en_riesgo se asignan correctamente a miembros activos con 0 visitas"
    expected: "Logs sin errores del FrequencyService pre-fetch; miembros activos con 0 visitas en 28d aparecen con segmento en_riesgo en member_profiles"
    why_human: "Requiere esperar el cron o ejecutarlo manualmente y observar resultados en base de datos real"
---

# Phase 123: Asistencia + Funnel — Verificación

**Objetivo de la fase:** Entregar las dos métricas independientes del eje de vencimiento: la frecuencia de asistencia como alarma proactiva de churn (con su refactor de segmentación) y el funnel diagnóstico de sesiones de prueba reserva→asistencia→compra. End state: el gestor ve la distribución de frecuencia por bandas con la lista "enfriándose" y la adopción de check-in como condición de validez, y obtiene la cascada del funnel con las tasas de cada escalón ancladas por fecha de sesión agendada.

**Verificado:** 2026-06-04
**Status:** HUMAN_NEEDED — todos los must-haves verificados en código; 4 ítems de CI/UAT pendientes de humano
**Re-verificación:** No — verificación inicial

---

## Verificación de Truths Observables

| #   | Truth (Criteria del Roadmap)                                                                                                                                                                                                                            | Status   | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | El endpoint de frecuencia devuelve el promedio de visitas/semana por miembro sobre las últimas 4 semanas rodantes (normalizado para <4 semanas de antigüedad) y la distribución por bandas (Inactivo/Bajo/Medio/Alto), incluyendo activos con 0 visitas | VERIFIED | `frequency-service.ts:191-223` — `getFrequency` computa `activeMemberPopulation`, `visitCountsForWindow` con offset 0 y 28, `computeBands` con `normalizedWeeks` clampeando a [1,4] semanas. `classifyBand(0)→"inactivo"`. Test: `it("counts an active member with 0 visits as Inactivo")` en `frequency.test.ts:161`.                                                                                                                 |
| 2   | El endpoint devuelve la lista de "enfriándose" (miembros que bajaron ≥1 banda) con % de variación, y expone al lado el % de adopción de check-in de la sede reutilizando `checkInAdoptionByBranch`                                                      | VERIFIED | `frequency-service.ts:404-421` — `buildCoolingDown` detecta `bandRank(current) < bandRank(prior)`. `pctVariacion` es null-safe. `checkInAdoption` líneas 217-221 usa `new AttendanceMetricsService(this.db, this.log).checkInAdoptionByBranch(filters)` verbatim — no reimplementado (D-123-06). Test: `frequency.test.ts:199-219` cooling-down + pctVariacion.                                                                        |
| 3   | La frecuencia alimenta y corrige los segmentos existentes (solo caso de oro: activo con 0 visitas o enfriándose → en_riesgo) y el recálculo corre en el batch nightly existente sin crear cron nuevo                                                    | VERIFIED | `segmentation/service.ts:128-141` — override `isFrequencyGoldenCase` después del guard `nuevo`. `notification-cron.ts:227-242` — `FrequencyService.coolingOrInactiveUserIds` llamado UNA vez antes del loop; 4 `cron.schedule` en el cron (conteo sin cambio). `FREQUENCY_ZERO_VISIT_WINDOW_DAYS` en `types.ts:30` y `SEGMENT_DEFAULTS:43`.                                                                                            |
| 4   | El endpoint de funnel devuelve la cascada reservó→asistió→compró con `tasa_show = asistieron÷reservaron`, `tasa_cierre = compraron÷asistieron` (sobre asistentes), `punta_a_punta = compraron÷reservaron`, ventana configurable ~21d que madura sola    | VERIFIED | `trial-funnel-service.ts:142-158` — `ratesFromAcc`: `tasaCierre = metricShape(compraron, asistieron)` (denominador asistentes), `metricShape` div-by-zero→0. `provisionalExpr:295-297` — `DATE_ADD(bookingDate, INTERVAL windowDays DAY) > CURDATE()`. `TRIAL_ATTRIBUTION_WINDOW_DEFAULT_DAYS=21`. Test: `trial-funnel.test.ts:300-328` verifica denominador correcto y `trial-funnel.test.ts:345-365` provisional.                    |
| 5   | El funnel cuenta solo leads nuevos sin sub paga previa, ancla la cohorte por fecha de sesión agendada, cortes semanal/mensual, y se abre por sucursal/país/turno/plan-comprado                                                                          | VERIFIED | `trial-funnel-service.ts:248-252` — `newLeadCondition`: `NOT EXISTS (subscriptions WHERE start_date < bookingDate AND pricePaid > 0)`. `rangeConditions(schema.bookings.bookingDate, dateFrom, dateTo)` ancla por fecha sesión. `foldSeries` weekly+monthly. `foldBreakdown` cubre branch/country/turno/plan. `classifyTurno` línea 88-98 con constantes `TURNO_MANANA/TARDE_START/END_HOUR`. Test completo en `trial-funnel.test.ts`. |

**Puntaje:** 11/11 must-haves verificados (incluyendo FREQ-01..06 y FUNNEL-01..05)

---

## Artefactos Requeridos

| Artefacto                                                     | Esperado                                                                                                          | Status   | Detalles                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/analytics/frequency-service.ts`    | FrequencyService + classifyBand + band constants + coolingOrInactiveUserIds                                       | VERIFIED | 610 LOC. Exporta `class FrequencyService`, `classifyBand`, `BAJO_MAX_VISITS_PER_WEEK=1.5`, `MEDIO_MAX_VISITS_PER_WEEK=2.5`, `coolingOrInactiveUserIds`.                                                                                                                                                                                                                                                              |
| `el-templo-api/src/modules/analytics/trial-funnel-service.ts` | TrialFunnelService + classifyTurno + turno constants + default window                                             | VERIFIED | 482 LOC. Exporta `class TrialFunnelService`, `classifyTurno`, `TURNO_MANANA/TARDE_START/END_HOUR`, `TRIAL_ATTRIBUTION_WINDOW_DEFAULT_DAYS=21`.                                                                                                                                                                                                                                                                       |
| `el-templo-api/src/modules/segmentation/types.ts`             | FREQUENCY_ZERO_VISIT_WINDOW_DAYS en SEGMENT_SETTINGS_KEYS, SEGMENT_DEFAULTS, SegmentThresholds                    | VERIFIED | Línea 30: `FREQUENCY_ZERO_VISIT_WINDOW_DAYS: "segment.frequency_zero_visit_window_days"`. Línea 43: `FREQUENCY_ZERO_VISIT_WINDOW_DAYS: 28`. Línea 55: `frequencyZeroVisitWindowDays: number`. Sin claves de banda intermedia.                                                                                                                                                                                        |
| `el-templo-api/src/modules/segmentation/service.ts`           | Golden-case override en calculateSegment + calculateAndUpdate intacto                                             | VERIFIED | `calculateSegment` con firma `(userId, opts?)` línea 101. Override en líneas 128-141, después del guard nuevo. `calculateAndUpdate` en líneas 355-387 sin cambios al cooldown (convoca `calculateSegment` sin opts).                                                                                                                                                                                                 |
| `el-templo-api/src/jobs/notification-cron.ts`                 | FrequencyService importado, goldenCase computado antes del loop, isFrequencyGoldenCase pasado al calculateSegment | VERIFIED | Línea 25: `import { FrequencyService }`. Líneas 227-242: pre-fetch con try/catch de gracia. Línea 256: `{ isFrequencyGoldenCase: goldenCase.has(profile.userId) }`. `ghost_monthly_reattempt` intacto en línea 313.                                                                                                                                                                                                  |
| `el-templo-api/src/modules/analytics/types.ts`                | FrequencyAnalytics + TrialFunnelAnalytics + todos los tipos wire                                                  | VERIFIED | `FrequencyBand`, `FrequencyBreakdownAxis`, `FrequencyDistributionRow`, `FrequencyCoolingRow`, `FrequencySegmentRow`, `FrequencyAnalytics` (líneas 742-816). `TrialFunnelAxis`, `TrialFunnelStageCounts`, `TrialFunnelRates`, `TrialFunnelSeriesRow`, `TrialFunnelBreakdownRow`, `TrialFunnelAnalytics` (líneas 828-910).                                                                                             |
| `el-templo-api/src/modules/analytics/schemas.ts`              | frequencySchema + trialFunnelSchema con todos los campos declarados                                               | VERIFIED | `frequencySchema:692-755` — declara distribution/coolingDown/checkInAdoption/breakdowns + `pctVariacion: ["number","null"]`. `trialFunnelSchema:814-857` — declara counts/rates/series/breakdowns (turno enum)/attributionWindowDays + window bounded 1..365.                                                                                                                                                        |
| `el-templo-api/src/modules/analytics/routes.ts`               | GET /frequency + GET /trial-funnel bajo requireAdminAnalytics                                                     | VERIFIED | `/frequency` línea 574 con `requireAdminAnalytics` y `requireBranchAccess`. `/trial-funnel` línea 615 con los mismos guards. `/funnel` (Phase 118) intacto en línea 534.                                                                                                                                                                                                                                             |
| `el-templo-api/test/analytics/frequency.test.ts`              | Tests de FREQ-01..04 + authz + golden-case helper                                                                 | VERIFIED | 340 LOC. Importa `FrequencyService`. Cubre: Inactivo (0 visitas), normalization <4 semanas, cooling-down + pctVariacion, checkInAdoption array, breakdowns branch/country, coolingOrInactiveUserIds helper, 403 gestión y 200 admin.                                                                                                                                                                                 |
| `el-templo-api/test/analytics/trial-funnel.test.ts`           | Tests de FUNNEL-01..05 + authz                                                                                    | VERIFIED | 518 LOC. Importa `TrialFunnelService`. Cubre: reservó cuenta cancelado/no_show, asistió via bookings.status (sin attendance table), compró in/out-of-window, zero-price no es compra, exclusión lead nuevo vs reactivación, denominadores correctos tasaCierre sobre asistentes, div-by-zero→0, provisional/matured, turno mañana/tarde/otro, plan axis por plan comprado, window override, 403 gestión y 200 admin. |
| `el-templo-api/test/segmentation/golden-case.test.ts`         | Tests FREQ-05/06: golden-case override, gating, nuevo precedence, batch opt, threshold tuneable                   | VERIFIED | 258 LOC. Importa `SegmentationService` + `SEGMENT_SETTINGS_KEYS`. Cubre 6 casos: (a) activo 0 visitas → en_riesgo; (b) activo con visitas → no forzado; (c) sin sub activa → no forzado; (d) brand-new → nuevo gana; (e) `isFrequencyGoldenCase: true` fuerza en_riesgo; (f) threshold 7d desde system_settings.                                                                                                     |

---

## Verificación de Key Links

| From                      | To                                                 | Via                                                  | Status   | Detalles                                                                                                                                                             |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------------------------- |
| `frequency-service.ts`    | `AttendanceMetricsService.checkInAdoptionByBranch` | instantiation + delegation                           | VERIFIED | Línea 218: `await new AttendanceMetricsService(this.db, this.log).checkInAdoptionByBranch(filters)` — reutiliza, no reimplementa (D-123-06).                         |
| `routes.ts`               | `frequencyService.getFrequency`                    | GET /frequency bajo requireAdminAnalytics            | VERIFIED | Línea 574 y 590: `await frequencyService.getFrequency(filters)` con preHandler `[requireAdminAnalytics, requireBranchAccess]`.                                       |
| `notification-cron.ts`    | `FrequencyService.coolingOrInactiveUserIds`        | set computado una vez antes del loop                 | VERIFIED | Líneas 231-234: `goldenCase = await new FrequencyService(db, log).coolingOrInactiveUserIds(frequencyZeroVisitWindowDays)`. Línea 256: threading al calculateSegment. |
| `segmentation/service.ts` | `system_settings`                                  | parseOrDefault para FREQUENCY_ZERO_VISIT_WINDOW_DAYS | VERIFIED | `getThresholds:82-85` parsea la clave nueva; `isFrequencyGoldenCase:307-348` la usa para la ventana de visitas.                                                      |
| `trial-funnel-service.ts` | `bookings.status IN ('qr_escaneado','confirmado')` | asistió definition                                   | VERIFIED | Línea 162: `statusIsAsistio` — `status === "qr_escaneado"                                                                                                            |     | status === "confirmado"`. `schema.attendance` ausente (grep retorna 0). |
| `routes.ts`               | `trialFunnelService.getTrialFunnel`                | GET /trial-funnel bajo requireAdminAnalytics         | VERIFIED | Línea 615 y 632: `await trialFunnelService.getTrialFunnel(filters)` con preHandler `[requireAdminAnalytics, requireBranchAccess]`.                                   |

---

## Data-Flow Trace (Level 4)

| Artefacto                                       | Variable de datos                               | Fuente                                                                                                                  | Produce datos reales                                                                               | Status  |
| ----------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| `frequency-service.ts#getFrequency`             | `activeMembers`, `currentCounts`, `priorCounts` | `db.select(...).from(subscriptions)` + `db.select(...).from(attendance)` con scope/window real                          | Si — queries reales con `inArray(status,["active","paused"])` y `checkedInAt >= lower AND < upper` | FLOWING |
| `trial-funnel-service.ts#readCohort`            | `rows: TrialBookingRow[]`                       | `db.select(...).from(bookings).innerJoin(schedules).innerJoin(branches)` con `isTrial=1` + correlated subqueries reales | Si — bookings reales filtrados por `newLeadCondition` + `comproExpr` via `DATE_ADD`                | FLOWING |
| `segmentation/service.ts#isFrequencyGoldenCase` | `activeSub`, `attendanceResult.count`           | `db.select...from(subscriptions)` + `db.select COUNT(*) from(attendance)`                                               | Si — queries reales con `inArray(status,["active","paused"])` y ventana de tiempo                  | FLOWING |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED — los tests requieren MySQL real (CI-only, política del proyecto). Los typecheck locales ya corrieron (`pnpm tsc --noEmit` confirmado limpio por el orquestrador post-merge).

---

## Verificación de Decisiones Bloqueantes (D-123-01..14)

| Decisión                                                                                          | Status   | Evidencia en código                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-123-01: Batch nightly YA EXISTE, no cron nuevo; FrequencyService como insumo adicional          | VERIFIED | `cron.schedule` count = 4 (sin cambio). Líneas 221-242 del cron: FrequencyService pre-fetched UNA vez.                                                                                                                                              |
| D-123-02: Solo caso de oro (activo + 0 visitas o cooling → en_riesgo); sin mapeo fino multi-banda | VERIFIED | `types.ts`: `grep -ciE "bajo\|medio\|alto"` = 0. Override solo en dos condiciones.                                                                                                                                                                  |
| D-123-03: Normalization <4 semanas via `normalizedWeeks` clamped [1,4]                            | VERIFIED | `frequency-service.ts:143-148`. Test `frequency.test.ts:178-193`.                                                                                                                                                                                   |
| D-123-04: Bandas como constantes nombradas, no env vars                                           | VERIFIED | `BAJO_MAX_VISITS_PER_WEEK=1.5`, `MEDIO_MAX_VISITS_PER_WEEK=2.5`. `grep process.env` = 0.                                                                                                                                                            |
| D-123-05: Cooling-down = band drop, no % crudo; pctVariacion null-safe                            | VERIFIED | `frequency-service.ts:404-421` — `bandRank(current) < bandRank(prior)`. `pctVariacion:155-158` null cuando prior=0.                                                                                                                                 |
| D-123-06: checkInAdoptionByBranch REUTILIZADO, no reimplementado                                  | VERIFIED | `frequency-service.ts:217-221`. Sin copia de la lógica.                                                                                                                                                                                             |
| D-123-07: asistió = bookings.status IN ('qr_escaneado','confirmado'), NO tabla attendance         | VERIFIED | `trial-funnel-service.ts:162`. `grep schema.attendance` = 0 en trial-funnel-service.                                                                                                                                                                |
| D-123-08: reservó = toda fila isTrial=1 sin importar status final                                 | VERIFIED | `trial-funnel-service.ts:134-138`: `acc.reservaron += 1` siempre; asistió y compró solo en sus condiciones.                                                                                                                                         |
| D-123-09: compró = primera sub paga (pricePaid > 0 AND priceTypeApplied != 'zero') en ventana     | VERIFIED | `trial-funnel-service.ts:243`: `paidSubPredicate = sql\`s.price_paid > 0 AND s.price_type_applied <> 'zero'\``. Plan axis por plan COMPRADO.                                                                                                        |
| D-123-10: Lead nuevo = sin sub paga PREVIA antes de la sesión                                     | VERIFIED | `newLeadCondition:248-253` — `NOT EXISTS (...WHERE s.start_date < bookingDate)`.                                                                                                                                                                    |
| D-123-11: Denominadores exactos; metricShape div-by-zero→0                                        | VERIFIED | `ratesFromAcc:143-148` — `tasaCierre = metricShape(compraron, asistieron)`. Test `trial-funnel.test.ts:319-325` verifica `tasaCierre.n=2`.                                                                                                          |
| D-123-12: Ventana configurable via `filters.window`; provisional cuando aún no madura             | VERIFIED | `attributionWindowDays = filters.window ?? 21`. `provisionalExpr:295-297`.                                                                                                                                                                          |
| D-123-13: Turno por hora local del schedule; mañana 07-10, tarde 17-20, otro                      | VERIFIED | `trial-funnel-service.ts:69-72` constantes. `classifyTurno:88-98`.                                                                                                                                                                                  |
| D-123-14: applyScope + requireAdminAnalytics + needsBranchJoin (lección 121/122)                  | VERIFIED | `frequency-service.ts:316-340` conditional `.$dynamic().innerJoin(branches)`. `trial-funnel-service.ts:299-309` branches join unconditional (flavor A — necesario para seleccionar columnas de branches). Ambas rutas bajo `requireAdminAnalytics`. |
| Phase-118 funnel-service.ts NO modificado                                                         | VERIFIED | `grep -c "funnel-service" trial-funnel-service.ts` = 0. `/funnel` route intacta.                                                                                                                                                                    |
| calculateAndUpdate (login cooldown) sin cambios                                                   | VERIFIED | `service.ts:355-387` — sin modificaciones; convoca `calculateSegment` sin opts (cooldown path).                                                                                                                                                     |

---

## Cobertura de Requerimientos

| Req       | Plan   | Descripción                                                       | Status    | Evidencia                                                                    |
| --------- | ------ | ----------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| FREQ-01   | 123-01 | Visitas/semana rolling 4w normalizado para <4 semanas             | SATISFIED | `normalizedWeeks` + `visitCountsForWindow` + tests                           |
| FREQ-02   | 123-01 | Distribución bandas incl. activos con 0 visitas                   | SATISFIED | `buildDistribution` + `classifyBand(0)→inactivo` + tests                     |
| FREQ-03   | 123-01 | Lista enfriándose ≥1 banda con % variación                        | SATISFIED | `buildCoolingDown` + null-safe `pctVariacion` + tests                        |
| FREQ-04   | 123-01 | checkInAdoption al lado, reutilizando AttendanceMetricsService    | SATISFIED | `checkInAdoptionByBranch` delegado verbatim + tests                          |
| FREQ-05   | 123-03 | Frecuencia alimenta y corrige segmentos (solo caso de oro)        | SATISFIED | `isFrequencyGoldenCase` override en `calculateSegment` + golden-case.test.ts |
| FREQ-06   | 123-03 | Recálculo batch nightly usando frecuencia como insumo             | SATISFIED | `coolingOrInactiveUserIds` pre-computado en cron existente antes del loop    |
| FUNNEL-01 | 123-02 | Cascada con tasas tasa_show/tasa_cierre/punta_a_punta             | SATISFIED | `ratesFromAcc` + `metricShape` + tests denominadores                         |
| FUNNEL-02 | 123-02 | Ventana ~21d configurable; cohorte madura sola (provisional)      | SATISFIED | `TRIAL_ATTRIBUTION_WINDOW_DEFAULT_DAYS=21` + `provisionalExpr` + tests       |
| FUNNEL-03 | 123-02 | Solo leads nuevos sin sub paga previa                             | SATISFIED | `newLeadCondition` correlated NOT EXISTS + test exclusión returner           |
| FUNNEL-04 | 123-02 | Cohorte anclada por fecha sesión agendada; cortes semanal/mensual | SATISFIED | `rangeConditions(bookings.bookingDate)` + `foldSeries` weekly/monthly        |
| FUNNEL-05 | 123-02 | Breakdowns por sucursal/país/turno/plan comprado                  | SATISFIED | `foldBreakdown` 4 ejes + `classifyTurno` + plan comprado composite key       |

---

## Anti-Patterns Detectados

| Archivo                       | Línea | Patrón                                                           | Severidad | Impacto                                                                                                                          |
| ----------------------------- | ----- | ---------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `trial-funnel-service.ts:369` | 369   | `void bucketExpr;` — referencia suprimida de ts `no-unused-vars` | Info      | Intencional y bien documentado: `bucketExpr` se importa para hacer explícito el contrato SQL que se espeja en JS. No es un stub. |

Sin TBD/FIXME/XXX en ningún archivo modificado. Sin `console.log/warn/error`. Sin `process.env` en los servicios nuevos. Sin `return null/{}` como implementación vacía — todos los retornos construyen datos reales.

---

## Verificación Humana Requerida

Los checks automáticos (grep, file existence, Level 1-4) todos pasaron. Las siguientes verificaciones requieren MySQL real o servidor corriendo:

### 1. CI en staging — suite completa

**Test:** Pushear rama a staging y esperar que CI corra.
**Expected:** Los 3 archivos de test nuevos (`frequency.test.ts`, `trial-funnel.test.ts`, `golden-case.test.ts`) pasan. Los tests de analytics y segmentación existentes siguen verdes.
**Why human:** Los tests del proyecto solo corren en CI contra MySQL real (`eltemplo_test`). No se ejecutan localmente por política del proyecto.

### 2. UAT — GET /frequency endpoint en staging

**Test:** Con token admin: `GET /api/admin/analytics/frequency`. Con token gestión: mismo endpoint.
**Expected:** Admin → 200 con `{ distribution: [{band, count}x4], coolingDown: [...], checkInAdoption: [{branchId, branchName, confirmados, conCheckin, ratio}], breakdowns: [...] }`. Gestión → 403.
**Why human:** Requiere servidor staging corriendo con datos reales.

### 3. UAT — GET /trial-funnel endpoint en staging

**Test:** Con token admin: `GET /api/admin/analytics/trial-funnel` (sin params), luego `?window=30`.
**Expected:** 200 con `{ counts, rates, series, breakdowns, attributionWindowDays: 21 }` y luego `attributionWindowDays: 30`. Gestión → 403.
**Why human:** Requiere servidor staging corriendo.

### 4. UAT — Segmentación batch en staging

**Test:** Observar logs del batch nightly (03:00 AR) después de deploy, o invocarlo manualmente.
**Expected:** Sin errores de FrequencyService. Miembros activos con 0 visitas en la ventana aparecen con `segment=en_riesgo` en `member_profiles`. Conteo de `cron.schedule` no aumentó (sigue siendo 4).
**Why human:** Requiere observar logs/DB real en producción o staging; no hay un endpoint de disparo manual.

---

## Resumen de Gaps

Ningún gap. Todas las verificaciones automáticas pasaron:

- Los 11 must-haves del roadmap y los 11 requerimientos FREQ-01..06 + FUNNEL-01..05 tienen implementación completa y sustantiva en el código.
- Las 14 decisiones de diseño bloqueantes (D-123-01..14) están honradas en el código — incluyendo las lecciones críticas de 121/122 (needsBranchJoin conditional join, calificación explícita de refs en subqueries correlacionadas).
- Los 3 endpoints (`/frequency`, `/trial-funnel`) y el batch nightly están correctamente cableados con `requireAdminAnalytics` (gestión → 403).
- Los 3 archivos de test tienen cobertura de forma y lógica; usan el patrón correcto de `registerUser(app, {password:...})` (API helper, no inserción raw a DB).
- Zero deuda no rastreada (sin TBD/FIXME/XXX, sin console.log, sin process.env en constantes de negocio).
- `pnpm tsc --noEmit` limpio confirmado por el orquestrador post-merge.

El status `human_needed` refleja únicamente que CI no ha corrido en staging todavía y que los 2 endpoints y el batch no han sido ejercitados con datos reales — igual que phases 121/122.

---

_Verificado: 2026-06-04_
_Verifier: Claude (gsd-verifier)_
