# Phase 123: Asistencia + Funnel — Frecuencia de asistencia + Funnel de sesiones de prueba - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning
**Source:** discuss-phase (4 gray areas resueltas con Franco)

<domain>
## Phase Boundary

Backend-first (servicios + endpoints + tests; **sin UI de admin** — toda la UI del panel de gestión es una fase de frontend POSTERIOR, fuera del milestone v5.0). Dos métricas **independientes del eje de vencimiento** (no dependen de 121/122; sí de los helpers/breakdowns/cohortes de 120):

1. **Frecuencia de asistencia por miembro (FREQ-01..06):** promedio de visitas/semana sobre las últimas 4 semanas rodantes (normalizado para <4 sem de antigüedad), distribución por bandas Inactivo/Bajo/Medio/Alto (incluyendo activos con 0 visitas), lista "enfriándose" (bajó ≥1 banda vs las 4 semanas previas) con % de variación, y % de adopción de check-in de la sede al lado como condición de validez. Alimenta los segmentos existentes (alcance acotado — ver decisiones).
2. **Funnel de sesiones de prueba (FUNNEL-01..05):** cascada reserva→asistencia→compra con `tasa_show`/`tasa_cierre`/`punta_a_punta`, ventana de atribución configurable (~21d que madura sola), solo leads nuevos sin sub paga previa, cohorte anclada por fecha de la sesión agendada, abierto por sucursal/país/turno/plan.

**Fuera de scope:** UI del admin (fase de frontend posterior); refactor completo del motor de segmentación (solo el "caso de oro" entra — ver D-123-02); mapeo fino multi-banda↔segmento (diferido al dueño del módulo); el funnel freemium→prueba→activo de la fase 118 (es OTRA cosa, sigue oculto en UI, NO se toca).

</domain>

<decisions>
## Implementation Decisions

### FREQ-06 — Alcance del batch de segmentación (DECISIÓN ABIERTA del ROADMAP — RESUELTA: intermedio)

- **D-123-01:** **El batch nightly YA EXISTE** (`el-templo-api/src/jobs/notification-cron.ts`, ~03:00 AR: recalcula segmentos de todos los `member_profiles` con `onboardingCompletedAt`, bypasseando el cooldown del login y llamando a `SegmentationService.calculateSegment()`). Por lo tanto el caveat #8 ("solo al login con cooldown") **ya está en gran parte corregido**. La frecuencia nueva se suma como **UN insumo más** dentro de ese batch existente. **NO se reescribe el login-recalc** (`calculateAndUpdate` con cooldown de 1h sigue conviviendo). No se introduce un cron nuevo: se extiende el job existente.

### FREQ-05 — Mapeo banda↔segmento (DECISIÓN ABIERTA del brief — RESUELTA: solo caso de oro)

- **D-123-02:** La frecuencia corrige los segmentos SOLO en el caso **inequívoco y de mayor valor** ("el dato de oro" del spec): un miembro **activo (paga) con 0 visitas en la ventana, o que se está enfriando**, recibe señal de **`en_riesgo`**. El umbral se guarda en `system_settings` (tuneable, igual que los `SEGMENT_DEFAULTS` actuales — NO env var). **El mapeo fino multi-banda (Bajo→?, Medio→intermitente, Alto→espartano, etc.) queda explícitamente DIFERIDO** a acordar con quien maneja el módulo de segmentación (los umbrales no están documentados en el brief). No inventar umbrales de bandas intermedias.

### Frecuencia — mecánica (FREQ-01..04)

- **D-123-03:** Frecuencia actual = promedio de visitas/semana por miembro sobre las **últimas 4 semanas rodantes**. Para miembros con <4 semanas de antigüedad, **normalizar por su tiempo real de membresía** (no marcarlos falsamente como bajos). Fuente de visitas: tabla `attendance` (`checkedInAt`/`sessionDate`).
- **D-123-04:** Bandas: **Inactivo** (0 visitas en la ventana) / **Bajo** (~1/sem) / **Medio** (~2/sem) / **Alto** (3+/sem). Los cortes exactos de las bandas intermedias son discreción del planner con defaults razonables (constante nombrada). La distribución cuenta cuántos miembros por banda, **incluyendo activos con 0 visitas** (Inactivo).
- **D-123-05:** Lista "enfriándose" = miembros que **bajaron ≥1 banda** entre las 4 semanas actuales y las 4 previas (Alto→Medio, Medio→Bajo, etc.), con el **% de variación** al lado (informativo). El disparador es el **cambio de banda**, no el % crudo.
- **D-123-06:** Toda vista de frecuencia expone al lado el **% de adopción de check-in de la sede** como condición de validez (caveat #6). **Reutilizar `AttendanceMetricsService.checkInAdoptionByBranch()`** (ya existe en `analytics/attendance-metrics-service.ts`), no reimplementar.

### Funnel — definición de escalones (FUNNEL-01..05)

- **D-123-07 (asistió):** "Asistió" = **`bookings.status IN ('qr_escaneado','confirmado')`**, NO la tabla `attendance`. Razón crítica: el check-in QR de `attendance` exige **suscripción activa**, y un lead de prueba tiene `status='prueba'` sin sub activa → **no genera fila en `attendance`**. `bookings.status` es la única señal fiable de asistencia para trials. `no_show`/`cancelado`/`lista_espera` NO cuentan como asistió.
- **D-123-08 (reservó):** Denominador = **toda fila `bookings.isTrial=1`** de un lead nuevo en la cohorte, **sin importar el estado final** (cancelado/no_show siguen contando como "reservó"). Anclada por la fecha de la sesión agendada (ver D-123-10).
- **D-123-09 (compró):** "Compró" = **primera suscripción paga** dentro de la ventana de atribución (~21d) desde la fecha de la sesión de prueba. Detección vía `subscriptions` (primera sub paga del lead) / `users.convertedAt`. El eje **"plan" agrupa por el plan que TERMINAN COMPRANDO** (no el de la prueba) — FUNNEL-05.
- **D-123-10 (lead nuevo + anclaje):** Solo cuentan **leads nuevos sin suscripción PAGA previa** (FUNNEL-03): quien fue freemium/prueba pero nunca pagó = cuenta como nuevo; quien ya pagó y vuelve = reactivación, **excluido**. La cohorte se ancla por la **fecha de la sesión de prueba agendada** (no por fecha de reserva ni de compra), con cortes **semanal y mensual** respetando el filtro del panel.
- **D-123-11 (tasas):** `tasa_show = asistieron ÷ reservaron`, `tasa_cierre = compraron ÷ asistieron` (sobre **asistentes**, no reservas), `punta_a_punta = compraron ÷ reservaron`. Todo guardado con `metricShape` (nominal + % + n), div-by-zero → 0 nunca NaN.
- **D-123-12 (ventana atribución):** Default **21 días, configurable** vía query param (mismo patrón que `window` en churn/renewal de 121). La cohorte **madura sola** hasta cerrar la ventana (períodos no maduros marcados provisionales, como la serie de churn).

### Funnel — eje "turno" (FUNNEL-05)

- **D-123-13:** El eje "turno/horario" bucketea por la **hora de inicio del schedule en hora LOCAL de la sede** (las sedes tienen columna `timezone`). Dos turnos reales hoy: **mañana = 07:00–10:00**, **tarde = 17:00–20:00**. Schedules fuera de esos rangos → bucket **"otro"** (fallback de seguridad). Cortes como constante nombrada (NO env var). "Funciona igual en cada timezone" = se interpreta la hora en la TZ de la sede.

### Breakdowns + scope (común a ambas métricas)

- **D-123-14:** Reutilizar los helpers de la fase 120: `applyScope` (branch/country, con `needsBranchJoin` — ver lección de 121/122), `cohorts.ts` (`rangeConditions` half-open `[from,to)`, `bucketExpr` weekly/monthly), `breakdowns.ts`, `metric-shape.ts`. Frecuencia abre por los breakdowns estándar; funnel por sucursal/país/turno/plan. Patrón `*-service.ts` + endpoint en `analytics/routes.ts` bajo `requireAdminAnalytics` (gestión → 403) + scope de sede, igual que 121/122. Tests de integración contra MySQL real, CI-only.

### Claude's Discretion

- Si frecuencia y funnel son dos servicios separados (`frequency-service.ts` + `trial-funnel-service.ts`) o uno — el planner decide; probablemente dos (métricas independientes).
- Cortes exactos de las bandas intermedias Bajo/Medio (defaults razonables sobre el spec ~1/~2/3+).
- Cómo exactamente la frecuencia se materializa como insumo del batch de segmentación (computar la frecuencia dentro del job antes de `calculateSegment`, o exponer un helper que `calculateSegment` consuma) — respetando D-123-01 (extender el job existente, no crear cron nuevo).
- SQL exacto del join `bookings`(isTrial=1) → cohorte por fecha de sesión, y de la detección de "primera sub paga ≤21d".

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec del milestone

- `ESPECIFICACION-METRICAS-GESTION.md` — §3 "Funnel de sesiones de prueba" + §4 "Frecuencia de asistencia por miembro" (mecánica, bandas, enfriándose, validez por check-in, relación con segmentos). Caveats #6 (adopción de check-in) y #8 (segmentos desactualizados).
- `.planning/REQUIREMENTS.md` — Bloque 3 (FUNNEL-01..05) y Bloque 4 (FREQ-01..06).

### Sistema de segmentación (FREQ-05/06 lo tocan — caso de oro)

- `el-templo-api/src/modules/segmentation/types.ts` — enum `MemberSegment` (novo/espartano/intermitente/en_riesgo/digital_warrior/ghost), `SEGMENT_DEFAULTS`, `SEGMENT_SETTINGS_KEYS` (umbrales en `system_settings`).
- `el-templo-api/src/modules/segmentation/service.ts` — `SegmentationService.calculateSegment()` (insumos actuales), `calculateAndUpdate()` (cooldown 1h al login, líneas ~287-290).
- `el-templo-api/src/jobs/notification-cron.ts` — batch nightly ~03:00 AR que recalcula segmentos (líneas ~202-330); aquí se EXTIENDE con la frecuencia como insumo (D-123-01). Framework: `node-cron`.
- `el-templo-api/src/db/schema/member-profiles.ts` — `segment`, `segmentUpdatedAt`.

### Asistencia / check-in (insumo de frecuencia)

- `el-templo-api/src/db/schema/attendance.ts` — `memberId`, `branchId`, `scheduleId`, `sessionDate`, `checkedInAt`, `source` (qr/manual).
- `el-templo-api/src/modules/analytics/attendance-metrics-service.ts` — `checkInAdoptionByBranch()` (REUTILIZAR para FREQ-04), `uniqueMembers()`.

### Funnel de prueba (modelo de datos)

- `el-templo-api/src/db/schema/bookings.ts` — `isTrial`, `status` (reservado/qr_escaneado/confirmado/cancelado/lista_espera/no_show), `source`.
- `el-templo-api/src/modules/scheduling/trials-service.ts` — `bookTrial()` (un trial por vida, bypassa capacidad).
- `el-templo-api/src/db/schema/users.ts` — `status` (freemium/prueba/activo/inactivo), `leadStatus`, `convertedAt` (set en primera sub si hubo booking isTrial).
- `el-templo-api/src/db/schema/schedules.ts` — hora de inicio para el eje turno (interpretar en `branches.timezone`).
- `el-templo-api/src/db/schema/subscriptions.ts` — detección de "primera sub paga" (compró) y "sin sub paga previa" (lead nuevo).

### Funnel viejo (NO confundir, NO tocar)

- `el-templo-api/src/modules/analytics/funnel-service.ts` — funnel freemium→prueba→activo de la fase 118 (otra métrica, oculta en UI). El Bloque 3 (reserva→asistencia→compra) es DISTINTO y nuevo.

### Fundación reutilizable (Fase 120)

- `el-templo-api/src/modules/analytics/scope.ts` (`applyScope` + `needsBranchJoin`), `cohorts.ts` (`rangeConditions`/`bucketExpr` half-open), `breakdowns.ts`, `metric-shape.ts`.
- `.planning/phases/120-fundaci-n-transversal-ticket-promedio/120-CONTEXT.md` — decisiones de fundación.

### Lección crítica (de 121/122 — aplicar)

- Al escribir queries con `applyScope`: si `country` está activo, `needsBranchJoin=true` y HAY que joinear `branches` (`.$dynamic()` + innerJoin condicional), si no → 500. Y calificar referencias a la tabla externa en subqueries correlacionadas con prefijo literal. Ver `.planning/phases/121-*/` y la referencia de memoria sobre Drizzle `.select()` sin calificar.

</canonical_refs>

<specifics>
## Specific Ideas

- **Frecuencia = principal predictor de churn** (alarma proactiva): la lista "enfriándose" es la salida accionable — gestión contacta a esa gente antes de perderla.
- **Adopción de check-in como gate de confianza**: donde la adopción es alta, la frecuencia es confiable; donde es baja, es referencial. SIEMPRE mostrarla al lado.
- **Turnos reales hoy**: mañana 07–10, tarde 17–20 (hora local de sede). No hay turno noche/mediodía.
- **Trials bypassean capacidad** y son uno-por-vida; el check-in de trial vive en `bookings.status`, no en `attendance`.
- Fase de **mayor riesgo del milestone** por tocar segmentación — mitigado eligiendo alcance intermedio (D-123-01) + solo caso de oro (D-123-02).

</specifics>

<deferred>
## Deferred Ideas

- Mapeo fino multi-banda↔segmento (Bajo/Medio/Alto → segmentos) → acordar con dueño del módulo de segmentación, fase futura.
- Refactor completo del motor de segmentación / eliminación del login-recalc → fase futura (hoy conviven batch + login).
- UI de admin para frecuencia y funnel (tarjetas/tabs en el panel de gestión) → fase de frontend posterior.
- Reactivación como métrica propia (quien ya pagó y vuelve) → futuro.

</deferred>

---

_Phase: 123-asistencia-funnel-frecuencia-de-asistencia-funnel-de-sesione_
_Context gathered: 2026-06-04 via discuss-phase — 4 gray areas resueltas (FREQ-06 intermedio, FREQ-05 caso de oro, asistió=bookings.status, turno mañana 07–10/tarde 17–20). Última fase del milestone v5.0; backend-first, UI diferida a fase de frontend._
