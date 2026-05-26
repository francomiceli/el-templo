# Phase 117: Analytics — correcciones de exactitud + métrica de miembros únicos (Correctitud + Operativo) - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Hacer que los números del módulo de analytics sean **correctos** y agregar las
métricas/listas **operativas** que recepción usa día a día. Toca backend
(`el-templo-api/src/modules/analytics`) y frontend admin (`el-templo-admin`).

El alcance original (correcciones del `FINDINGS.md` + miembros únicos 7/14/30) se
**amplió** con `PROPUESTAS_ANALYTICS.md` (5 propuestas profundas). Decidimos
**partir en 2 fases**:

- **Fase 117 (esta) — Correctitud + Operativo:** todos los bug fixes, predicado
  canónico de "activo", `applyScope` + domain services para lo nuevo, tabla
  `user_status_history` (fundación, empieza a acumular acá), KPI de miembros únicos
  7/14/30, engagement real reutilizando segmentos existentes, ratio de adopción de
  check-in por sede, y panel de Vencimientos/Renovaciones (`attentionList` completo).
- **Fase 118 (siguiente, a crear) — Estratégico/Financiero:** funnel de conversión
  freemium→prueba→activo, retención por cohortes de ciclos de plan, y caja vs
  devengado + ARPU. Consumen la tabla `user_status_history` creada en 117.

**No es scope de 117:** las 3 propuestas estratégicas (van a 118), el split del
monolito `analytics/service.ts` existente (corresponde a v4.9), tracking de
"habló con coach" en renovaciones (requiere schema/UI nuevos — diferido).
</domain>

<decisions>
## Implementation Decisions

### Predicado canónico de "activo" (bugs #1/#5)

- **D-01:** Centralizar "activo" en un **helper SQL compartido** (p.ej.
  `shared/active-member.ts`) usando el predicado EXISTS de `recomputeUserStatus`
  (`subscriptions/service.ts:4115`): `EXISTS sub WHERE subscription_status IN
('active','paused') AND start_date <= CURDATE() AND (end_date IS NULL OR
end_date >= CURDATE())`. Mínima superficie nueva — reutiliza lógica existente,
  NO crea entidad nueva.
- **D-02:** Analytics **deja de leer `users.status`** y calcula en vivo con el helper
  → **excluye los ~48 fantasmas** = muestra el número real (692, no 749).
- **D-03:** **Sin cron** de reparación de `users.status`. Otros consumidores
  (`reports/service.ts`, app) migran al helper oportunísticamente, no en esta fase.
  (Nota del usuario: preferir no agregar código/entidades, usar lo que hay.)

### Bug fixes de correctitud (FINDINGS)

- **D-04:** No-show (#2): corregir `'confirmed'` → `'confirmado'` en `getNoShowRate`
  (`analytics/service.ts:731`). El enum real es `bookingStatusEnum = 'confirmado'`.
- **D-05:** Revenue (#3): **nunca sumar monedas distintas**. `sumRevenue` (`:1001`),
  `getRevenueTrend` (`:800`), `getRevenueByMethod` (`:849`), `getRevenueByBranch`
  (`:901`) deben separar por currency, siguiendo el patrón de
  `getOutstandingByCurrency` (`:929`, "Currencies are NEVER summed across").
- **D-06:** Trend de activos (#4): `newInPeriod` (`countNewMembers` `:269`) debe contar
  solo **nuevos activos** usando el predicado canónico (D-01), no todos los
  `role='member'` (que incluye freemium/prueba). Arregla el trend circular de
  `getActiveMembersKpi` (`:183`).
- **D-07:** Plan distribution (#6): filtrar `is_archived` y **agrupar por (name,
  country)** → "Flex (AR)" y "Flex (ES)" separados en vista owner (id 1 vs 105).
  `getPlanDistribution` (`:396`).
- **D-08:** Performance (#9, menor): donde se toque, reemplazar `DATE(col)` por rangos
  `>= dateFrom AND < dateTo+1` para no anular índices (`:277`, `:513`, `:1021`).

### Arquitectura

- **D-09:** Estructura: crear **domain services nuevos** para lo nuevo (Engagement /
  Finance / Attendance metrics) + extraer helper **`applyScope(query, filters)`** que
  elimina las ~15 repeticiones del bloque branchId/country + innerJoin branches. El
  split del monolito `service.ts` EXISTENTE queda para **v4.9** (ya encolado).
- **D-10:** Crear tabla **`user_status_history`** (migración nueva) en esta fase como
  fundación. Registrar transiciones **forward** vía hook en `recomputeUserStatus` +
  cambios de status del admin. **Backfill aproximado** hacia atrás desde
  `users.created_at` + primera `subscriptions.created_at` del usuario. Se consume en
  Fase 118 (funnel + retención). `users.status` enum hoy:
  `freemium/prueba/activo/inactivo`.

### Feature: miembros únicos + engagement (tab Asistencias del admin)

- **D-11:** **KPI de miembros únicos 7/14/30** (feature comprometida): extender
  `getAttendanceAnalytics` (`analytics/service.ts:109`) con `COUNT(DISTINCT
member_id)` sobre `attendance` por ventana, respetando scope branch/country. Render
  como número destacado en la tab de Asistencias.
- **D-12:** **Engagement real (#3) REUTILIZA el módulo de segmentación existente** — NO
  inventa segmentos ni umbrales nuevos. Lee `member_profiles.segment` (ya calculado por
  `segmentation/service.ts`, 6 segmentos: nuevo/espartano/intermitente/en_riesgo/
  digital_warrior/ghost, umbrales en `system_settings`). Analytics solo **agrega**:
  conteo de activos por segmento + **lista nominal** de `en_riesgo`/`ghost` con
  teléfono/acción WhatsApp (mismo patrón que `attentionList`).
- **D-13:** **Ratio de adopción de check-in por sede (#3 Parte B)**: `bookings
confirmados con check-in registrado ÷ total confirmados`, por sede. **Warning visual**
  en el frontend cuando se filtra una sede con ratio **<50%** (representatividad honesta
  sobre Chapadmalal etc.).

### Panel de Vencimientos y Renovaciones (#5 — completar `attentionList`)

- **D-14:** Completar `AttentionMember` (el tipo ya prevé `daysOverdue` en
  `analytics/types.ts:33`, hoy siempre `null`). Agregar **vencidos sin renovar** en
  buckets **1-7 / 8-14 / 15-30 días** con `daysOverdue` real.
- **D-15:** **Tasa de renovación 7/14/30**: de los que vencieron hace N días, % que
  renovó (métrica operativa, complementa la curva estratégica de 118).
- **D-16:** Flags de renovación: **`ya pagó / no pagó` derivados de
  `financial_transactions`** recientes (sin schema nuevo). **`habló con coach` se
  difiere** (no derivable sin schema/UI). Cruzar cada miembro "por vencer" con su
  **segmento de engagement** (D-12) para priorizar (ghost+por-vencer = alta prioridad).

### Multi-moneda y scope (notas transversales)

- **D-17:** Toda métrica monetaria separa por moneda (ARS/EUR nunca sumadas). Toda
  métrica nominal respeta el modelo de scope (owner global / admin-país /
  coach-recepción-sedes) igual que `attentionList` actual; para owner las listas
  pueden cruzar país pero el corte debe quedar visualmente claro.

### Tests

- **D-18:** Tests de integración **obligatorios** contra MySQL real para cada métrica
  nueva/corregida. Casos mínimos: no-show con datos reales (el bug `'confirmed'`
  sobrevivió por falta de test), revenue multi-moneda (ARS+EUR juntos), predicado de
  "activo", miembros únicos, agregación de segmentos.

### Claude's Discretion

- Nombres exactos de los domain services nuevos y firma de `applyScope`.
- Esquema exacto de `user_status_history` (columnas, índices) — el planner lo define.
- Layout fino de la tab de Asistencias (orden de KPI vs segmentos vs listas).
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Origen y propuestas de esta fase

- `.planning/phases/117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico/FINDINGS.md` — 9 bugs (validados contra prod) + feature de miembros únicos. Líneas exactas del código.
- `.planning/phases/117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico/PROPUESTAS_ANALYTICS.md` — 5 propuestas de ampliación (funnel, retención por ciclos, engagement, caja/devengado, vencimientos) + notas transversales (predicado canónico, scope/moneda, tests). Propuestas 1/2/4 → Fase 118.

### Código backend a tocar/reutilizar

- `el-templo-api/src/modules/analytics/service.ts` — 1112 LOC, todos los métodos a corregir (líneas en FINDINGS).
- `el-templo-api/src/modules/analytics/types.ts` §`AttentionMember` (`:33` `daysOverdue`) — tipo a completar.
- `el-templo-api/src/modules/subscriptions/service.ts:4115` `recomputeUserStatus` — predicado canónico de "activo" a extraer al helper.
- `el-templo-api/src/modules/segmentation/service.ts` + `segmentation/types.ts` — 6 segmentos persistidos en `member_profiles.segment`; REUTILIZAR para engagement (D-12).
- `el-templo-api/src/db/schema/users.ts:49` `userStatusEnum`, `:60` `leadStatusEnum`.
- `el-templo-api/src/db/schema/subscription-plans.ts:22` `planCategoryEnum` (para retención por categoría en 118).

### Frontend admin

- `el-templo-admin/src/pages/AlumnosPage.vue` — vista con badges de segmento (patrón a no duplicar).
- `el-templo-admin/.../MiembrosTab.vue` — donde vive `attentionList` hoy.
- Tab de Asistencias del admin — destino del KPI de únicos + engagement.
- `el-templo-admin/src/pages/ConfiguracionPage.vue` — umbrales de segmentación (no se tocan, solo se reutilizan).

### Precedente de migración de datos prod

- `el-templo-api/src/db/migrations/0127*` — corrección de `duration_days` en planes archivados (misma clase de bug que #6). Patrón staging-first + migración para datos prod.
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Módulo `segmentation`**: ya calcula y persiste 6 segmentos en
  `member_profiles.segment` con umbrales configurables. Engagement #3 lo **lee**, no
  recalcula nada. Recálculo actual: al login del miembro (cooldown 1h) — staleness
  aceptable para analytics.
- **`getOutstandingByCurrency`** (`analytics/service.ts:929`): patrón correcto de
  separación por moneda — replicar en los helpers de revenue (D-05).
- **`recomputeUserStatus`** (`subscriptions/service.ts:4115`): fuente del predicado
  canónico de "activo".
- **`attentionList` / `getAttentionList`**: patrón de lista nominal con
  teléfono/WhatsApp — extender para vencidos (D-14) y reutilizar para engagement.

### Established Patterns

- Facade pattern para servicios complejos (CLAUDE.md) → justifica D-09 (domain
  services + `applyScope`).
- Scope branch/país: owner global / admin-país / coach-sedes. Repetido ~15 veces hoy
  → extraer a `applyScope`.

### Integration Points

- Hook en `recomputeUserStatus` para alimentar `user_status_history` (D-10).
- Tab de Asistencias (admin) consume nuevos endpoints de únicos + engagement + ratio
  check-in.
  </code_context>

<specifics>
## Specific Ideas

- El usuario explícitamente pidió **reutilizar lo existente** y no agregar código/
  entidades innecesarias (motivó D-01/D-03/D-12).
- "Activo" canónico debe **excluir** los ~48 con drift = mostrar el número real.
- Contexto operativo: hay sedes que reservan pero no pasan lista (ej. Chapadmalal,
  20/22 reservan y nadie checkea) → de ahí el ratio de adopción + warning (D-13).
- Planes "Flex" existen para AR (id 1) y ES (id 105) → no fusionarlos (D-07).
  </specifics>

<deferred>
## Deferred Ideas

- **Fase 118 (Estratégico/Financiero — crear con `/gsd-phase`):**
  - Funnel de conversión freemium→prueba→activo con tiempos por etapa (PROPUESTAS #1) —
    consume `user_status_history`.
  - Retención por cohortes de **ciclos de plan** (PROPUESTAS #2): cohorte = mes de
    primera sub activa; eje X = ciclo N; gap consecutivo ≤30 días (configurable);
    filtrable por `plan_category`; + distribución de ciclos completados.
  - Caja vs Devengado + ARPU (PROPUESTAS #4): devengado prorrateado
    `price_paid/duration_days × días dentro del mes`; ARPU = devengado/activos; ambas
    series superpuestas, separadas por moneda.
- **Tracking de "habló con coach"** en renovaciones (D-16) — requiere campos/UI nuevos.
- **Cron diario de reparación de `users.status`** (D-03) — innecesario si los otros
  consumidores migran al helper; reconsiderar solo si algún consumidor no puede.
- **Split del monolito `analytics/service.ts` existente** → **v4.9** (refactor splits).
- Migrar `reports/service.ts` y la app al helper canónico de "activo" — oportunístico,
  fuera de 117.

### Reviewed Todos (not folded)

None — no hubo todos cruzados con esta fase.
</deferred>

---

_Phase: 117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico_
_Context gathered: 2026-05-26_
