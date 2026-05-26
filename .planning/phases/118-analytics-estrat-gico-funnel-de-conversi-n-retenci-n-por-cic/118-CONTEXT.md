# Phase 118: Analytics estratégico — funnel de conversión + retención por ciclos + caja vs devengado - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Tres tableros estratégicos/financieros (admin-only) en el módulo de analytics — segunda
mitad del split de la Fase 117. Implementa las propuestas #1, #2 y #4 de
`PROPUESTAS_ANALYTICS.md`:

1. **Funnel de conversión** `freemium → prueba → activo` con tiempos por etapa.
2. **Retención por cohortes de ciclos de plan** (cohorte = mes de primera sub activa; eje X
   = ciclo N; filtrable por `plan_category`; + distribución de ciclos completados).
3. **Caja vs Devengado + ARPU** (devengado prorrateado, ambas series superpuestas, separadas
   por moneda).

**Primera tarea técnica obligatoria (de NOTES-FROM-117):** cablear los hooks de
`user_status_history` en los sitios que hoy NO se registran, o el funnel queda ciego en el
medio. Sin esto, las propuestas #1 y #2 no se pueden medir de punta a punta.

**Fuera de alcance (explícito):**

- Split del monolito `analytics/service.ts` → es v4.9. Crear domain services NUEVOS.
- Rediseño de la segmentación de engagement (sesgo Digital/online) → se BORRA del frontend,
  no se rediseña (ver D-09).
- Exponer estos endpoints al set operacional → quedan en `ADMIN_ROLES`.
  </domain>

<decisions>
## Implementation Decisions

### Funnel de conversión (PROPUESTA #1)

- **D-01:** **Funnel completo + caveat visual.** Mostrar el funnel completo aproximando la
  etapa `activo` histórica con `MIN(subscriptions.created_at)` por usuario, PERO con un
  banner/caveat claro en el frontend: las transiciones `prueba`/`inactivo` precisas sólo
  existen forward-only desde 2026-05-26 (deploy del hook de 117). Las cohortes nuevas se
  vuelven 100% confiables con el tiempo (período de ramp-up). Data histórica = aproximada;
  data confiable = forward-only.
- **D-02:** **Cablear hooks de `user_status_history` ANTES de construir el funnel** (primera
  tarea). Sitios que hoy NO registran transiciones (ver NOTES-FROM-117 §CRÍTICO):
  - `status='prueba'` (conversión lead/sesión de prueba) en `members/service.ts` (~líneas
    537/615/708, verificar números actuales).
  - `status='inactivo'` en `members/routes.ts` (~líneas 814/862, verificar).
  - Flips manuales de status del admin → cablear con `source='admin'` (hoy reservado pero NO
    usado).
  - El hook existente (`SubscriptionService.recomputeUserStatus`, `source='recompute'`) ya
    cubre los flips a `activo`/`inactivo` que pasan por ahí — NO duplicar.
- **D-03:** Cohorte del funnel = mes de alta (`users.created_at`). Por cada cohorte:
  % que pasó a `prueba`, % que pasó a `activo`, y mediana de días `freemium→prueba` y
  `prueba→activo`. Corte por sede y país (vía `applyScope`).

### Retención por cohortes de ciclos (PROPUESTA #2)

- **D-04:** **Gap de "ciclo consecutivo" = 30 días, configurable como constante exportada del
  domain service** (NO env var — overkill; NO columna DB). Dos subs del mismo miembro son
  ciclos consecutivos si `siguiente.start_date − anterior.end_date ≤ 30 días`.
- **D-05:** **Reactivación (gap >30d): corta la racha, NO reinicia cohorte.** El gap >30d
  termina la racha de ciclos consecutivos — el miembro sale de la curva de su cohorte
  original en ese ciclo. Si vuelve, cuenta como reactivación aparte y NO infla la retención
  de la cohorte original. Lectura honesta de "aguantó N renovaciones seguidas".
- **D-06:** Cohorte = mes de **primera suscripción activa** (NO `created_at`, que incluye
  freemium). Vista principal: % que llegó al ciclo 2, 3, 4... Vista secundaria filtrable por
  `plan_category` (presencial/online_regular/online_goal/online_coach) o bucket de duración.
  Métrica derivada: distribución de ciclos completados entre los activos actuales (ciclo 1 vs
  2 vs 3+) como proxy de madurez de base.

### Caja vs Devengado + ARPU (PROPUESTA #4)

- **D-07:** **Devengado prorrateado sobre la ventana real `start_date..end_date`** de cada
  sub: `price_paid × (días-de-la-sub-dentro-del-mes ÷ días-totales-start..end)`. Captura
  cancelaciones/ajustes que acortan `end_date` → más honesto que `duration_days` fijo.
  **Researcher debe confirmar si cancelar/refund actualiza `end_date`**; si no lo hace,
  reevaluar. Validar nulls/0 en la duración antes de dividir — subs con ventana inválida
  (null/0/end<start) se EXCLUYEN del devengado con caveat (nunca dividir por 0).
- **D-08:** **Caja** = lo que ya calcula `revenueTrend` (mantener, sirve para tesorería).
  Mostrar **ambas series superpuestas** en el mismo gráfico (la diferencia visual es el
  efecto "prepago largo"). **ARPU mensual** = `devengado del mes ÷ activos del mes`, donde
  "activos" usa el predicado canónico `activeMemberExists` (NUNCA `users.status`). **Todo
  separado por moneda** (ARS/EUR jamás sumadas) — patrón `getOutstandingByCurrency` /
  `RevenueByCurrency` / `MonetaryKpiByCurrency`.

### Presentación / Frontend (admin-only)

- **D-09:** **Tarea decidida (de NOTES-FROM-117 §🗑️): BORRAR del frontend 2 cards de
  engagement por segmento** de `el-templo-admin/src/components/analytics/AsistenciaTab.vue`,
  porque mezclan poblaciones (online no hace check-in presencial → cae en "Digital" e infla
  el segmento). Alcance EXACTO (solo frontend):
  - Quitar del template: card "Activos por segmento de engagement" + worklist nominal
    en_riesgo/ghost con botón WhatsApp.
  - Quitar código muerto que queda: `segmentCountCards`, `engagementColumns`,
    `formatMemberName`, `contactMember`, `segmentLabel`/`segmentColor`, imports
    `SEGMENT_*`/`EngagementMember`/`EngagementAnalytics` sin uso, y la prop `engagement`.
  - En `ReportesPage.vue`: sacar `analyticsApi.getEngagement` del `Promise.all` de
    `fetchAttendanceData`, quitar `engagementData` y la prop `:engagement`.
  - **NO tocar (conservar):** backend `GET /api/admin/analytics/engagement`,
    `EngagementService`, `engagement.test.ts`, tipos, método `getEngagement` del composable
    `useAnalyticsApi`, módulo `segmentation` (lo usan AlumnosPage/NotificacionesPage), y el
    resto de AsistenciaTab (únicos 7/14/30, ratio check-in + warning <50%, no-show, heatmap,
    ocupación).
- **D-10:** **3 tabs nuevas separadas** en `AnaliticasPage.vue` (admin-only): una por tablero
  (Funnel / Retención / Finanzas avanzadas). Cada uno con su espacio. Charts con `chart.js` +
  `vue-chartjs` (ya instalados). Sugerencia de viz (el planner/UI afinan): funnel = barras
  apiladas o embudo; retención = curva de líneas multi-cohorte; caja-vs-devengado = doble
  serie por moneda. Filtros sede/país. NO engordar FinanzasTab/MiembrosTab existentes.

### Autorización

- **D-11:** Endpoints de 118 (caja, devengado, ARPU, retención, funnel) son SENSIBLES →
  `ADMIN_ROLES` (admin/owner) con `requireAdminAnalytics` per-route. NO exponer al set
  operacional `ANALYTICS_OPERATIONAL_ROLES`. Patrón en `analytics/routes.ts`.

### Claude's Discretion

- Forma de los endpoints (1 por tablero vs agrupados), shape de los tipos de respuesta,
  estructura interna de los domain services nuevos, queries SQL concretas (respetando
  `applyScope` + `activeMemberExists` + half-open windows), y detalles finos de viz.

### Tests

- **D-12:** Tests de integración obligatorios para cada métrica nueva, contra MySQL real
  (lección de FINDINGS #2: el bug `'confirmed'` vs `'confirmado'` sobrevivió por falta de
  test con datos reales). Los tests limpian `financial_transactions`/`transaction_links`/
  `balances`.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Hallazgos y propuestas (LECTURA OBLIGATORIA)

- `.planning/phases/118-analytics-estrat-gico-funnel-de-conversi-n-retenci-n-por-cic/118-NOTES-FROM-117.md`
  — hallazgos de cierre de 117: tarea decidida de borrar engagement display, hooks de
  `user_status_history` faltantes (CRÍTICO), backfill 0129 aproximado, helpers a reutilizar,
  autorización sensible, detalles de schema y prorrateo.
- `.planning/phases/117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico/PROPUESTAS_ANALYTICS.md`
  — propuestas #1 (funnel), #2 (retención por ciclos), #4 (caja vs devengado + ARPU). Incluye
  §"Notas transversales": predicado canónico de activo, scope/moneda, tests.
- `.planning/phases/117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico/117-CONTEXT.md`
  §Deferred Ideas — decisiones arrastradas que definen el alcance de 118.

### Código a reutilizar (de la 117)

- `el-templo-api/src/modules/shared/active-member.ts` — `activeMemberExists(userIdColumn)`,
  predicado canónico de "activo". Denominador de ARPU. NUNCA `users.status`.
- `el-templo-api/src/modules/analytics/scope.ts` — `applyScope(query, filters)`, scope
  sede/país. Usar en TODA query nueva.
- `el-templo-api/src/modules/analytics/service.ts` — `getOutstandingByCurrency` + tipos
  `RevenueByCurrency`/`MonetaryKpiByCurrency` (patrón multi-moneda). NO splittear este
  monolito (v4.9). `revenueTrend` = serie de caja a mantener.
- `el-templo-api/src/modules/analytics/attendance-metrics-service.ts` y
  `engagement-service.ts` — patrón de domain service NUEVO a imitar.
- `el-templo-api/src/db/schema/user-status-history.ts` — columnas `from_status` (nullable),
  `to_status`, `source` ('recompute'|'backfill'|'admin'), `changed_at`; índice
  `(user_id, changed_at)` ya creado para queries de cohorte/retención.
- `el-templo-api/src/modules/analytics/routes.ts` — patrón `requireAdminAnalytics` per-route.

### Frontend

- `el-templo-admin/src/pages/AnaliticasPage.vue` — donde van las 3 tabs nuevas.
- `el-templo-admin/src/components/analytics/AsistenciaTab.vue` — de donde se borran las 2
  cards de engagement (D-09).
- `el-templo-admin/src/pages/ReportesPage.vue` — quitar `getEngagement` del Promise.all (D-09).
- `el-templo-admin/src/components/analytics/FinanzasTab.vue` / `MiembrosTab.vue` — referencia
  de estilo; NO modificar para meter lo nuevo (van en tabs separadas).
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `activeMemberExists` (shared/active-member.ts): denominador único de ARPU y de "activos
  del mes". Resuelve de paso el drift de `users.status`.
- `applyScope` (analytics/scope.ts): scope owner-global / admin-país / coach-recepción-sedes.
- Patrón multi-moneda `getOutstandingByCurrency` + tipos `*ByCurrency`: extender a caja,
  devengado y ARPU.
- `chart.js` + `vue-chartjs` ya en `el-templo-admin/package.json` — sin dependencias nuevas.

### Established Patterns

- Domain service nuevo por feature (AttendanceMetricsService/EngagementService), nunca tocar
  el monolito `analytics/service.ts`.
- Ventanas half-open para conteos por fecha (de 117); evitar `DATE()` que anula índices.
- Hook de status en `SubscriptionService.recomputeUserStatus` (`source='recompute'`) ya
  registra transiciones que pasan por ahí — los hooks nuevos (D-02) cubren los huecos.

### Integration Points

- Nuevos endpoints bajo `/api/admin/analytics/*` con `requireAdminAnalytics` (ADMIN_ROLES).
- Hooks de `user_status_history` en `members/service.ts` (prueba) y `members/routes.ts`
  (inactivo) + flips de admin (`source='admin'`).
- 3 tabs nuevas en `AnaliticasPage.vue`, cliente vía composable `useAnalyticsApi`.
  </code_context>

<specifics>
## Specific Ideas

- Caveat del funnel: el frontend debe comunicar explícitamente que la data intermedia
  (prueba/inactivo) es confiable sólo forward-only desde 2026-05-26 — "representatividad
  honesta > número bonito" (filosofía heredada de la 117, igual que el warning <50% de
  check-in).
- Distribución de ciclos completados como "métrica de salud de base": si el ~80% está en
  ciclo 1 = negocio que captura y pierde; masa en ciclo 3+ = base leal.
- Caja vs devengado: la diferencia visual entre las dos curvas ES el insight (efecto
  "prepago largo" de planes 120/240 días).
  </specifics>

<deferred>
## Deferred Ideas

- **Propuestas #3 y #5 de PROPUESTAS_ANALYTICS.md** ya implementadas en 117 (engagement real
  - ratio check-in, panel de vencimientos/renovaciones). No re-hacer.
- **Tracking de "habló con coach"** en renovaciones (117 D-16) — requiere campos/UI nuevos.
  Futuro.
- **Cron diario de reparación de `users.status`** (117 D-03) — innecesario si los consumidores
  migran al helper canónico. Reconsiderar sólo si alguno no puede.
- **Split del monolito `analytics/service.ts`** → v4.9 (refactor splits).
- **Clasificador de segmentación plan-aware** para AlumnosPage/NotificacionesPage (el sesgo
  Digital/online sigue ahí en esos consumidores) — deuda no bloqueante, decidir más adelante.
- **Reconstrucción precisa de historial pre-2026-05-26** (prueba/inactivo/múltiples ciclos):
  no factible con el backfill mínimo actual; sólo el caveat de ramp-up lo mitiga.

### Reviewed Todos (not folded)

None — no hubo todos cruzados con esta fase.
</deferred>

---

_Phase: 118-analytics-estrat-gico-funnel-de-conversi-n-retenci-n-por-cic_
_Context gathered: 2026-05-26_
