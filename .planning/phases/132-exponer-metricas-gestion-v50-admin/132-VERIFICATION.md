---
phase: 132-exponer-metricas-gestion-v50-admin
verified: 2026-06-05T18:30:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Abrir AnaliticasPage en el admin y verificar el orden de tabs: Conversión → Retención → Asistencia → Ingresos (primero), luego Miembros/Finanzas/Programas/Retención (ciclos)"
    expected: "4 nuevos tabs aparecen al frente en ese orden; el tab de Retención (ciclos) tiene el sufijo '(ciclos)' para distinguirlo"
    why_human: "El orden de renderizado y la presencia visual no pueden verificarse con grep"
  - test: "Con scope de sucursal activo, consultar la tab Asistencia (frecuencia) y verificar que coolingDown muestra Nombre (link a perfil), Teléfono (link tel:) y que el botón 'Exportar CSV' genera un .csv con esos datos"
    expected: "Filas con nombre completo del miembro, teléfono clickeable, y CSV descargable con headers Nombre/Teléfono/Banda actual/Banda anterior/Variación"
    why_human: "Interacción de links, navegación router-link y descarga de blob no son verificables programáticamente"
  - test: "Verificar que el filtro Turno aparece SOLO en tabs Conversión y Asistencia (no en Retención ni Ingresos)"
    expected: "El select de Turno se muestra/oculta correctamente al cambiar de tab"
    why_human: "Visibilidad condicional de elementos UI no se puede verificar con grep"
  - test: "En la tab Ingresos, verificar que ARS y EUR se renderizan en bloques separados y que nunca se suman"
    expected: "Si hay datos en ambas monedas, aparecen dos cards lado a lado; si solo hay una moneda, aparece una card a ancho completo"
    why_human: "Layout responsivo y correctitud visual de per-currency isolation require verificación humana"
  - test: "Verificar que las cards eliminadas YA NO aparecen: (1) Renovación 7/14/30 no existe en MiembrosTab, (2) Tasa de retención simple no existe en MiembrosTab, (3) ARPU mensual no existe en FinanzasAvanzadasTab"
    expected: "Ninguna de esas tres cards/secciones es visible en la UI"
    why_human: "Confirmar la ausencia visual en producción/staging requiere abrir la app"
  - test: "En la tab Retención, verificar que aparece el churn de 15 días como titular, la tasa de renovación en el mismo bloque con la nota 'número vivo', y la curva mes a mes"
    expected: "Un card con dos columnas (churn negativo / renovación positiva), curva de línea debajo, tabla de desglose al fondo"
    why_human: "El layout y los colores (negativo=rojo, positivo=verde) requieren inspección visual"
  - test: "Ejecutar el suite de tests de analytics en CI (push a origin/staging) y confirmar que los 15 nuevos tests (8 en 132-01, 7 en 132-02) pasan"
    expected: "ticket.test.ts: 3 nuevos tests pass; trial-funnel.test.ts: 5 nuevos tests pass; frequency.test.ts: 7 nuevos tests pass — todos en verde"
    why_human: "Por política del proyecto, los tests de integración corren en CI sobre staging, no localmente"
---

# Phase 132: Exponer Métricas de Gestión v5.0 - Verification Report

**Phase Goal:** Las 6 métricas de gestión de v5.0 quedan visibles y consultables en el panel de Analíticas del admin, consumiendo los endpoints backend ya existentes, con scope de país/sucursal funcionando; y las métricas viejas/ARPU deprecadas quedan eliminadas físicamente del frontend.
**Verified:** 2026-06-05T18:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| #    | Truth                                                                                                                                                                  | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-1 | `useAnalyticsApi.ts` tiene los 6 métodos (`getTicket`, `getChurn`, `getRenewal`, `getLtv`, `getFrequency`, `getTrialFunnel`) con interfaces TS en `types/analytics.ts` | ✓ VERIFIED | `useAnalyticsApi.ts` lines 222–341: 6 métodos declarados y registrados en el objeto retornado. `types/analytics.ts`: `MetricShape`, `TicketAnalytics`, `ChurnAnalytics`, `RenewalAnalytics`, `LtvAnalytics`, `FrequencyAnalytics`, `TrialFunnelAnalytics` + `FrequencyCoolingRow` con `name`/`phone` todos presentes                                                                                                                                                                                             |
| SC-2 | Las 6 métricas se renderizan en `AnaliticasPage.vue` (tabs/componentes nuevos), respetando scope país/sucursal y roles admin                                           | ✓ VERIFIED | 4 tabs nuevos (`conversion`, `retencion-gestion`, `frecuencia`, `ingresos`) en `AnaliticasPage.vue` lines 171–204. Los 4 componentes importados lines 299–302. `fetchTabData` tiene 4 cases nuevos. `selectedPlanId` spread en `currentFilters`; `selectedTurno` pasado solo a funnel+frecuencia (lines 694, 729). `showTurnoFilter` computed (line 409–410) restringe el turno selector a `conversion` y `frecuencia`. El scope país/sucursal se hereda de `currentFilters` que ya incluye `branchId`/`country` |
| SC-3 | Las métricas deprecadas están eliminadas físicamente (ARPU de `FinanzasAvanzadasTab`, `renewalRate` legacy de `MiembrosTab`)                                           | ✓ VERIFIED | `FinanzasAvanzadasTab.vue`: `arpuEntries` ausente (grep retorna 0 resultados). `MiembrosTab.vue`: `renewalRateCards` ausente (grep retorna 0 resultados). `FunnelTab.vue` deleted (ls confirma que el archivo no existe). `FunnelTab` ya no está importado en `AnaliticasPage.vue` (la única referencia es un comentario en `ConversionTab.vue` y un doc comment en `types/analytics.ts`, no un import vivo)                                                                                                     |
| SC-4 | No quedan llamadas muertas ni componentes huérfanos de las métricas reemplazadas                                                                                       | ✓ VERIFIED | Grep de `FunnelTab`/`funnelEntryOrigin`/`fetchFunnelData` en `AnaliticasPage.vue` retorna solo una referencia "turno" que pertenece al comentario inline del filtro de turno (no al funnel deprecado). `renewalRateCards`/`arpuEntries` retornan 0 coincidencias en todo `src/components/analytics/`. `AsistenciaTab.vue` no está tocado (vive en `ReportesPage.vue` lines 193, 757 — D-19 CANCELADO respetado). `getMemberAnalytics` preservado en `AnaliticasPage.vue` line 625                                |

**Score:** 4/4 truths verified

---

### Guardrails de contexto verificados

| Guardrail                                               | Estado     | Evidencia                                                                                                                           |
| ------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| D-19 CANCELADO: `AsistenciaTab.vue` NO borrado          | ✓ VERIFIED | Archivo existe; importado en `ReportesPage.vue` lines 193+757; no aparece en diff de `AnaliticasPage.vue`                           |
| D-15: `getMemberAnalytics` preservado                   | ✓ VERIFIED | `AnaliticasPage.vue` line 625: call activo, feeds conserved counts en `MiembrosTab`                                                 |
| D-16: Caja vs Devengado conservado                      | ✓ VERIFIED | `FinanzasAvanzadasTab.vue`: `cashVsAccruedData`, `renderedCurrencies`, `formatPrice` presentes; ARPU eliminado                      |
| D-20: `RetencionTab.vue` conservado                     | ✓ VERIFIED | Archivo existe en `analytics/`; importado y montado en `AnaliticasPage.vue` line 276–280, relabeled "Retención (ciclos)"            |
| D-21: `FinanzasTab.vue` + counts operativos conservados | ✓ VERIFIED | Ambos archivos existen y están montados; `Nuevos`/`Bajas`/`Distribución`/lista `requieren atención` no tienen grep match de borrado |

---

### Required Artifacts

| Artifact                                                           | Expected                                                         | Status     | Details                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `el-templo-api/src/modules/analytics/expiry-cohort.ts`             | `subscriptionPlanFilter()` helper compartido                     | ✓ VERIFIED | Lines 104–114: función exportada, retorna `SQL[]` vacío cuando `planId === undefined`, spread after `...scopeConditions` en churn/renewal/ltv                                                                                           |
| `el-templo-api/src/modules/analytics/ticket-service.ts`            | planId filter appended after scope                               | ✓ VERIFIED | Lines 430–451: `applyScope` primero, luego `conditions.push(eq(...planId))` guardado por `if (filters.planId !== undefined)`                                                                                                            |
| `el-templo-api/src/modules/analytics/trial-funnel-service.ts`      | planId bought-plan + turno in-memory                             | ✓ VERIFIED | Lines 191–198: turno filter in-memory post-scope. Lines 259–267: planId restricts compró predicate                                                                                                                                      |
| `el-templo-api/src/modules/analytics/frequency-service.ts`         | name/phone enrichment + planId/turno SQL                         | ✓ VERIFIED | Lines 194–208: `firstName`/`lastName`/`phone` en `ActiveMemberRow`. Lines 282–322: `populationConditions` con scope ANTES de planId push. Lines 386–389: `turnoHourCondition` SQL en visit-window query                                 |
| `el-templo-api/src/modules/analytics/schemas.ts`                   | planId en 5 querystrings + turno en funnel/frequency             | ✓ VERIFIED | Lines 549–560 (`ticketQuerystring` local), 607 (`churn`), 704–717 (`frequency` con turno), 815–818 (`trial-funnel` con turno), 921/991 (`renewal`/`ltv`)                                                                                |
| `el-templo-api/src/modules/analytics/types.ts`                     | `FrequencyCoolingRow` con `name: string` + `phone: string        | null`      | ✓ VERIFIED                                                                                                                                                                                                                              | Lines 774–795: interfaz declarada con doc-comments de PII y null-safety |
| `el-templo-admin/src/types/analytics.ts`                           | 6 interfaces + MetricShape + FrequencyCoolingRow con name/phone  | ✓ VERIFIED | `MetricShape` (line 370), `TicketAnalytics` (451), `ChurnAnalytics` (496), `RenewalAnalytics` (521), `LtvAnalytics` (568), `FrequencyAnalytics` (627), `TrialFunnelAnalytics` (693), `FrequencyCoolingRow` (602) con `name`/`phone`     |
| `el-templo-admin/src/composables/useAnalyticsApi.ts`               | 6 métodos + buildParams con turno/window                         | ✓ VERIFIED | Lines 222–341: 6 métodos declarados. Lines 37–38: `turno` y `window` serializados en `buildParams` cuando `!== undefined`                                                                                                               |
| `el-templo-admin/src/components/analytics/ConversionTab.vue`       | Funnel con tasaCierre dominante + embudo horizontal              | ✓ VERIFIED | Lines 15–34: `tasaCierre` como `text-h3 text-primary`; `tasaShow`/`puntaAPunta` secundarios `text-h6`. Lines 116–118: computed derivados de `props.data.rates.*`                                                                        |
| `el-templo-admin/src/components/analytics/IngresosTab.vue`         | Ticket + LTV por moneda, ARS/EUR no sumados                      | ✓ VERIFIED | Lines 15–103: `v-for="cur in ticketCurrencies"` / `v-for="cur in ltvCurrencies"`. Lines 180–213: computeds leen `byCurrency[cur]` / `monetary[cur]` sin suma cruzada. `lifetimeHeadlineMonths` + `survivalMedianMonths` ambos mostrados |
| `el-templo-admin/src/components/analytics/RetencionGestionTab.vue` | Churn + Renovación en mismo bloque, nota "número vivo"           | ✓ VERIFIED | Lines 20–43: churn + renovación en `row q-col-gutter-md`. Line 43: nota "Número vivo..." exacta                                                                                                                                         |
| `el-templo-admin/src/components/analytics/FrecuenciaTab.vue`       | Bandas + lista enfriándose + tel: + /alumnos/ + CSV              | ✓ VERIFIED | Line 62: `router-link` a `/alumnos/${userId}`. Line 73: `href=\`tel:${phone}\``. Lines 230/248: `createObjectURL` + filename `frecuencia-enfriandose-${today}.csv`                                                                      |
| `el-templo-admin/src/pages/AnaliticasPage.vue`                     | 4 tabs nuevos + filtros plan/turno wired + deprecated eliminados | ✓ VERIFIED | Lines 171–204: 4 tabs en orden D-08. Lines 46–64: `selectedPlanId`/`selectedTurno` selects. Lines 372–411: refs declarados. Lines 692–745: 6 fetch calls activos                                                                        |
| `FunnelTab.vue` ELIMINADO                                          | Archivo borrado físicamente                                      | ✓ VERIFIED | `ls` confirma ausencia. Ningún `import.*FunnelTab` activo encontrado                                                                                                                                                                    |
| `el-templo-api/test/analytics/ticket.test.ts`                      | 3 nuevos tests de planId                                         | ✓ VERIFIED | Tests declarados en el archivo (planId restriction, cross-branch scope isolation, non-integer → 400). Tests no corridos localmente (política CI)                                                                                        |
| `el-templo-api/test/analytics/trial-funnel.test.ts`                | 5 nuevos tests planId/turno                                      | ✓ VERIFIED | `describe("planId + turno input filters (Phase 132 D-10)")` con 5 tests: turno restriction, planId bought-plan, scope isolation, invalid turno → 400, turno=otro → 400                                                                  |
| `el-templo-api/test/analytics/frequency.test.ts`                   | 7 nuevos tests (3 D-12 + 4 D-10)                                 | ✓ VERIFIED | Tests de name/phone enrichment + null-phone + scope isolation + planId/turno filters declarados en el archivo                                                                                                                           |

---

### Key Link Verification

| From                                        | To                              | Via                                                        | Status  | Details                                                                                                                  |
| ------------------------------------------- | ------------------------------- | ---------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ | --- | ------------------------------------------------------------------------------------------------ |
| `routes.ts /ticket handler`                 | `ticketService.getTicket`       | `planId: request.query.planId`                             | ✓ WIRED | Line 384/402: `planId?: number` en Querystring; line 402: `planId: request.query.planId` en filters                      |
| `ticket-service.ts conditions`              | `applyScope result`             | `...scopeConditions` ANTES de planId                       | ✓ WIRED | Lines 430–451: `applyScope` call → `conditions = [...scopeConditions, range...]` → luego `conditions.push(eq(planId))`   |
| `frequency-service.ts populationConditions` | `planId eq()` AFTER scope       | `planId pushed after scope spread`                         | ✓ WIRED | Lines 282–294: `populationConditions = [status, ...scopeConditions]` → push planId si defined                            |
| `trial-funnel-service.ts`                   | turno filter                    | `classifyTurno in-memory post DB fetch`                    | ✓ WIRED | Lines 191–198: `turno === undefined                                                                                      |     | turno === "otro"`→ no filter; else`.filter((r) => classifyTurno(r.startTime) === filters.turno)` |
| `useAnalyticsApi.getTrialFunnel`            | `/admin/analytics/trial-funnel` | `api.get with buildParams(filters)`                        | ✓ WIRED | Line 306–315: `api.get<TrialFunnelAnalytics>('/admin/analytics/trial-funnel', { params: buildParams(filters) })`         |
| `buildParams`                               | `turno + window serialization`  | `filters.turno !== undefined` guard                        | ✓ WIRED | Lines 37–38: `if (filters.turno !== undefined) params.turno = filters.turno`                                             |
| `AnaliticasPage fetchConversion`            | `getTrialFunnel` con turno      | `selectedTurno.value ?? undefined`                         | ✓ WIRED | Lines 692–695: `await analyticsApi.getTrialFunnel({ ...currentFilters.value, turno: selectedTurno.value ?? undefined })` |
| `AnaliticasPage`                            | `FrecuenciaTab :data`           | `frequencyData` populated por `getFrequency`               | ✓ WIRED | Lines 727–730 + line 198: fetch + prop binding                                                                           |
| `FrecuenciaTab cooling-down row`            | `/alumnos/:userId` (perfil)     | `router-link :to="\`/alumnos/${userId}\`"`                 | ✓ WIRED | Line 62                                                                                                                  |
| `FrecuenciaTab cooling-down row`            | `tel:phone` (llamar)            | `href="\`tel:${phone}\`"`                                  | ✓ WIRED | Line 73                                                                                                                  |
| `FrecuenciaTab export button`               | `downloadBlob CSV Blob`         | `URL.createObjectURL` + `frecuencia-enfriandose-` filename | ✓ WIRED | Lines 230, 248                                                                                                           |

---

### Data-Flow Trace (Level 4)

| Artifact                  | Data Variable                      | Source                                                                                                                  | Produces Real Data                                                            | Status    |
| ------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| `ConversionTab.vue`       | `props.data: TrialFunnelAnalytics` | `AnaliticasPage.fetchConversion → getTrialFunnel → /admin/analytics/trial-funnel → trial-funnel-service.getTrialFunnel` | Sí — servicio hace query real a `bookings` + `subscriptions` con cohorte      | ✓ FLOWING |
| `RetencionGestionTab.vue` | `props.churn`/`props.renewal`      | `AnaliticasPage.fetchRetencionGestion → Promise.all(getChurn, getRenewal)`                                              | Sí — services usan `expiry-cohort.ts` con queries a `subscriptions`           | ✓ FLOWING |
| `FrecuenciaTab.vue`       | `props.data: FrequencyAnalytics`   | `AnaliticasPage.fetchFrecuencia → getFrequency → frequency-service`                                                     | Sí — servicio query real a `attendance`+`users`+`schedules`                   | ✓ FLOWING |
| `IngresosTab.vue`         | `props.ticket`/`props.ltv`         | `AnaliticasPage.fetchIngresos → Promise.all(getTicket, getLtv)`                                                         | Sí — ticket-service + ltv-service queries reales a `payments`/`subscriptions` | ✓ FLOWING |

---

### Behavioral Spot-Checks

Step 7b SKIPPED: los endpoints backend son verificables solo si el servidor está corriendo y la DB de test está disponible. El proyecto establece que los tests de integración corren en CI sobre staging, no en local. Se delega a la gate de CI (ver Human Verification #7).

---

### Probe Execution

No se declararon probes en los PLAN files. No existen `scripts/*/tests/probe-*.sh` para esta fase. SKIPPED.

---

### Requirements Coverage

No hay REQ-IDs mapeados a esta fase. Las 4 success criteria del ROADMAP se verificaron directamente en la tabla de truths. Los D-01 a D-21 del CONTEXT son decisiones de implementación interna, no requisitos de REQUIREMENTS.md.

---

### Anti-Patterns Found

| File                      | Line        | Pattern                                                                                                                                                               | Severity   | Impact                                                                                                          |
| ------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| `RetencionGestionTab.vue` | 20, 144–150 | Churn label hardcodeado "15 días" puede no coincidir con el window real (WR-01/WR-02 del REVIEW)                                                                      | ⚠️ Warning | Label misleading si `window !== 15`; dato no incorrecto, solo mal etiquetado                                    |
| `IngresosTab.vue`         | 201, 207    | `ltvCurrencies`/`ticketCurrencies` fuerzan `'ARS'` fallback cuando `n === 0`; no-null assertions en `ticketBlock`/`ltvBlock` (WR-03/WR-06 del REVIEW)                 | ⚠️ Warning | Puede mostrar card ARS vacía en scope EUR-only; latent null-deref si `isEmpty` cambia                           |
| `FrecuenciaTab.vue`       | n/a         | `frequency-service` denominator de distribución no filtrado por turno (WR-04 del REVIEW) — `Inactivo` significa "sin visitas en ese turno" pero el label no lo aclara | ⚠️ Warning | Operador puede malinterpretar "Inactivo" al filtrar por turno                                                   |
| `frequency-service.ts`    | 442         | Nombre de miembro puede ser string vacío si `firstName` y `lastName` son NULL (WR-05 del REVIEW)                                                                      | ⚠️ Warning | Fila unidentificable en la lista de enfriándose; MiembrosTab tiene fallback `Miembro #${id}` pero frecuencia no |

Todos los anti-patterns fueron capturados y documentados en el `132-REVIEW.md` (0 críticos, 6 warnings). No hay `TBD`/`FIXME`/`XXX` sin referenciar en ninguno de los archivos modificados. Los 4 warnings observados arriba son correctness issues de calidad — no bloquean la entrega de la funcionalidad principal pero son recomendables de resolver antes del merge a master.

---

### Human Verification Required

#### 1. Orden visual de tabs y etiquetas

**Test:** Abrir el panel de Analíticas en el admin (staging) y verificar que los 4 nuevos tabs aparecen primero en el orden: Conversión → Retención → Asistencia → Ingresos, seguidos de los tabs conservados (Miembros, Finanzas, Programas, Retención (ciclos)).
**Expected:** El tab "Retención" sin sufijo muestra churn+renovación. El tab "Retención (ciclos)" con icono `timeline` muestra las curvas por cohorte (RetencionTab.vue conservado).
**Why human:** El orden de renderizado, la diferenciación visual y la legibilidad de las etiquetas requieren inspección directa.

#### 2. Lista de "Enfriándose" con Nombre → Perfil y Teléfono → Tel:

**Test:** Con al menos un miembro en estado "enfriándose" (bajó de banda en la ventana), abrir la tab Asistencia y verificar que la lista muestra: (a) nombre completo como link clicable que navega a `/alumnos/:userId`, (b) teléfono como link `tel:` clicable, (c) botón "Exportar CSV" que descarga un archivo `.csv` con BOM + headers + datos correctos.
**Expected:** El link de nombre abre la ficha del miembro. El link de teléfono abre el marcador. El CSV contiene nombre, teléfono, banda actual, banda anterior, variación %.
**Why human:** Interacción con router-link, navegación entre páginas, y descarga de Blob requieren verificación en el browser.

#### 3. Filtro Turno condicional por tab

**Test:** Navegar por los 4 tabs nuevos y verificar que el select "Turno" (Mañana/Tarde/Todos) aparece solo en los tabs Conversión y Asistencia, y desaparece al ir a Retención o Ingresos.
**Expected:** `v-if="showTurnoFilter"` se evalúa correctamente en runtime. Al aplicar un filtro de turno en Conversión, los datos del funnel cambian.
**Why human:** El comportamiento dinámico de la UI y la reactividad Vue no son verificables con grep.

#### 4. Aislamiento ARS/EUR en IngresosTab

**Test:** En un scope con suscripciones en ARS y EUR (o solo una moneda), verificar que IngresosTab muestra los bloques de moneda correctamente separados, que nunca muestra una suma combinada, y que el bloque "LTV" muestra tanto "Estimación simple" como "Supervivencia" en meses.
**Expected:** Dos cards en grid col-md-6 (cuando hay dos monedas), o una card col-md-12. Nunca un número que sume ARS+EUR.
**Why human:** La correctitud visual del layout per-currency y la presencia de ambos estimadores de meses requiere inspección.

#### 5. Métricas deprecadas ausentes visualmente

**Test:** En MiembrosTab verificar que NO aparecen las cards de "Renovación" (7/14/30 días) ni "Tasa de retención". En FinanzasAvanzadasTab verificar que NO aparece "ARPU mensual" pero SÍ aparece el chart "Caja vs Devengado por mes".
**Expected:** Solo los conteos operativos (Nuevos, Bajas, Distribución, Requieren atención) y el chart de Caja vs Devengado permanecen.
**Why human:** La ausencia visual de elementos UI eliminados requiere verificación directa en el browser.

#### 6. Scope país/sucursal funcionando en las 6 métricas

**Test:** Con un admin de sede (no owner), abrir los 4 nuevos tabs y verificar que los datos reflejan solo esa sede. Luego con el filtro Plan seleccionado, verificar que los datos se restringen al plan elegido sin "escaparse" a otros planes de otras sedes.
**Expected:** Los datos cambian al filtrar por plan. No aparecen datos de otras sedes aunque el planId seleccionado exista en otras sedes.
**Why human:** La correctitud del scope AND-ing planId+branch requiere verificación con datos reales de staging o tests manuales.

#### 7. Tests de integración en CI (staging push)

**Test:** Pushear la rama staging a `origin/staging` y verificar que el pipeline de CI pasa, incluyendo los 15 nuevos tests de analytics: 3 en `ticket.test.ts`, 5 en `trial-funnel.test.ts`, 7 en `frequency.test.ts`.
**Expected:** Todos los tests existentes + los 15 nuevos pasan en verde. No hay regresiones en las suites de otros módulos.
**Why human:** Los tests de integración del proyecto corren en CI sobre staging por política del proyecto (`feedback_tests_run_in_ci_not_local`). No se corrieron localmente.

---

### Gaps Summary

Ningún gap bloqueante. Los 4 success criteria del ROADMAP están verificados en el codebase. Los warnings documentados en `132-REVIEW.md` (WR-01 a WR-06) son issues de calidad post-entrega que el code review ya capturó; ninguno impide que la funcionalidad principal funcione.

Los 7 items de verificación humana son principalmente visuales/comportamentales + la gate de CI. La arquitectura, el wiring y los datos fluyen correctamente según el análisis del código.

---

_Verified: 2026-06-05T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
