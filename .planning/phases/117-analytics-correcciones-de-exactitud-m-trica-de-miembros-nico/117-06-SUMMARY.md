---
phase: 117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico
plan: 06
subsystem: ui
tags: [vue, quasar, analytics, admin, multi-currency, whatsapp, rbac]

# Dependency graph
requires:
  - phase: 117-01
    provides: revenue por moneda (ARS/EUR nunca sumados) + applyScope canónico
  - phase: 117-03
    provides: AttendanceMetricsService — uniqueMembers 7/14/30 + checkInAdoptionByBranch
  - phase: 117-04
    provides: EngagementService — countActiveBySegment + nominalList en_riesgo/ghost con phone
  - phase: 117-05
    provides: attentionList (overdue buckets + daysOverdue real + yaPago + segment) + renewalRate
provides:
  - "AsistenciaTab: KPI miembros únicos 7/14/30 + conteo por segmento + listas engagement con WhatsApp + warning de ratio <50%"
  - "MiembrosTab: vencidos con buckets + daysOverdue real + tasa de renovación 7/14/30 + flag ya pagó + priorización por segmento"
  - "FinanzasTab: revenue separado por moneda (ARS/EUR)"
  - "Tab Asistencia accesible al rol gestion (movida a ReportesPage); endpoints operacionales de analytics abiertos a gestion+admin+owner"
affects: [phase-118, analytics, reportes, rbac]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ANALYTICS_OPERATIONAL_ROLES (gestion+admin+owner) vs requireAdminAnalytics per-route guard para endpoints admin-only"
    - "Reuso de openWhatsApp (wa.me) y patrón stat-card destacada entre tabs de analytics"

key-files:
  created: []
  modified:
    - el-templo-admin/src/types/analytics.ts
    - el-templo-admin/src/composables/useAnalyticsApi.ts
    - el-templo-admin/src/components/analytics/AsistenciaTab.vue
    - el-templo-admin/src/components/analytics/MiembrosTab.vue
    - el-templo-admin/src/components/analytics/FinanzasTab.vue
    - el-templo-admin/src/pages/AnaliticasPage.vue
    - el-templo-admin/src/pages/ReportesPage.vue
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/pages/NotificacionesPage.vue
    - el-templo-admin/src/pages/ConfiguracionPage.vue
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/test/analytics/analytics.test.ts

key-decisions:
  - "Tab Asistencia movida de AnaliticasPage a ReportesPage para que el rol gestion la pueda usar (Reportes permite gestion; Analiticas es admin/owner)"
  - "Backend: nuevo ANALYTICS_OPERATIONAL_ROLES (gestion+admin+owner); el onRequest hook del plugin gatea al set operacional; los 3 endpoints admin-only (/, /members, /financial) reciben guard per-route requireAdminAnalytics"
  - "Bucket 'Sin segmento' oculto; descripciones de segmento movidas a tooltip junto al chip (leyenda removida)"
  - "Rename display-only de segmentos: Digital Warrior→Digital, Ghost→Fantasma (claves de DB sin cambios)"

patterns-established:
  - "Operational-vs-admin analytics split: hook al set operacional + guard per-route para los 3 endpoints sensibles"
  - "Rename de labels de segmento centralizado en SEGMENT_LABELS (member.ts) consumido por AlumnosPage/NotificacionesPage/ConfiguracionPage/MiembrosTab"

requirements-completed: [D-11, D-12, D-13, D-14, D-15, D-16, D-17]

# Metrics
duration: ~40min
completed: 2026-05-26
---

# Phase 117 Plan 06: Frontend admin de analytics Summary

**Tabs de analytics del admin renderizando los números correctos: miembros únicos 7/14/30, segmentos + worklists engagement con WhatsApp, warning de ratio <50%, vencidos con buckets + renovación + flags, y revenue por moneda — más apertura de los endpoints operacionales al rol gestion.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-05-26
- **Tasks:** 3 auto + 1 checkpoint visual (aprobado) + 3 follow-ups
- **Files modified:** 14

## Accomplishments

- **AsistenciaTab (D-11/D-12/D-13):** stat cards destacadas de miembros únicos 7/14/30, conteo de activos por segmento, listas nominales en_riesgo/ghost con teléfono + botón WhatsApp, y warning visual de representatividad cuando la sede filtrada tiene ratio de check-in <50%.
- **MiembrosTab (D-14/D-15/D-16/D-17):** vencidos con buckets 1-7/8-14/15-30 usando `daysOverdue` real, tasa de renovación 7/14/30, flag ya pagó/no pagó por miembro, y priorización visual de ghost/en_riesgo por-vencer. "Habló con coach" (D-16) diferido según plan.
- **FinanzasTab:** revenue separado por moneda (ARS/EUR nunca sumados), alineado al contrato backend del Plan 01.
- **Tipos + composable:** `analytics.ts` espeja UniqueMembersMetric, CheckInAdoptionRow, SegmentCounts, EngagementMember, RenewalRate, AttentionMember extendido y revenue por moneda; `useAnalyticsApi.ts` expone getters para los endpoints nuevos. Sin `any`, sin console.log (createLogger).
- **Acceso por rol gestion:** tab Asistencia movida a ReportesPage + apertura de endpoints operacionales de analytics a gestion+admin+owner, con guard admin-only preservado en los 3 endpoints sensibles.

## Task Commits

1. **Task 1: Tipos espejo + composable** — `ef0ea266` (feat)
2. **Task 2: AsistenciaTab — únicos 7/14/30 + segmentos + worklist + warning ratio** — `dca7ffac` (feat)
3. **Task 3: MiembrosTab vencidos/renovación/flags/prioridad + FinanzasTab por moneda** — `dfa3102f` (feat)
4. **Checkpoint visual (human-verify)** — APROBADO por el usuario tras verificación de las 3 tabs + scope por sede.

**Follow-ups (post-plan, misma fase):**

5. **Endpoints operacionales para gestion** — `73193740` (feat)
6. **Mover tab Asistencia de Analiticas a Reportes** — `376251db` (feat)
7. **Ajustes tab Asistencia + rename segmentos** — `63707e2e` (refactor)

## Files Created/Modified

- `el-templo-admin/src/types/analytics.ts` — tipos espejo: únicos, ratio, segmentos, engagement, renewalRate, AttentionMember extendido, revenue por moneda
- `el-templo-admin/src/composables/useAnalyticsApi.ts` — getters para endpoints nuevos (únicos/ratio/engagement)
- `el-templo-admin/src/components/analytics/AsistenciaTab.vue` — KPI únicos + segmentos + listas engagement + warning ratio
- `el-templo-admin/src/components/analytics/MiembrosTab.vue` — vencidos buckets + renewal + flags + priorización
- `el-templo-admin/src/components/analytics/FinanzasTab.vue` — revenue por moneda (ARS/EUR)
- `el-templo-admin/src/pages/AnaliticasPage.vue` — tab Asistencia removida (movida a Reportes)
- `el-templo-admin/src/pages/ReportesPage.vue` — tab Asistencia montada para acceso de gestion
- `el-templo-admin/src/types/member.ts` — SEGMENT_LABELS rename Digital Warrior→Digital, Ghost→Fantasma
- `el-templo-admin/src/pages/{AlumnosPage,NotificacionesPage,ConfiguracionPage}.vue` — consumo del rename de labels
- `el-templo-api/src/modules/shared/permissions.ts` — nuevo ANALYTICS_OPERATIONAL_ROLES (gestion+admin+owner)
- `el-templo-api/src/modules/analytics/routes.ts` — hook gatea al set operacional; guard per-route requireAdminAnalytics en /, /members, /financial
- `el-templo-api/test/analytics/analytics.test.ts` — gestion recibe 200 en operacionales, 403 en admin-only

## Decisions Made

- **Tab Asistencia → ReportesPage:** Analiticas es admin/owner, pero recepción/gestion necesita las worklists operativas (únicos, engagement, vencidos). Mover la tab a Reportes (que permite gestion) habilitó el caso de uso sin exponer los tableros estratégicos/financieros.
- **Split operacional vs admin en el backend:** en vez de abrir todo el plugin a gestion, se introdujo `ANALYTICS_OPERATIONAL_ROLES` para el hook + `requireAdminAnalytics` per-route en los 3 endpoints sensibles (`/`, `/members`, `/financial`). Mantiene el principio de mínimo privilegio.
- **Rename display-only de segmentos:** Digital Warrior→Digital, Ghost→Fantasma en SEGMENT_LABELS. Solo labels de UI; las claves de DB no cambian, así que no hay migración ni riesgo de desincronización con segmentación backend.
- **"Sin segmento" oculto + tooltip:** el bucket sinSegmento no aporta señal operativa, se ocultó; las descripciones de segmento pasaron a un tooltip junto a cada chip (leyenda removida) para reducir ruido visual.

## Deviations from Plan

### Additions (misma fase, post-plan)

**1. [Rule 2 — Missing Critical] Apertura de endpoints operacionales al rol gestion + reubicación de la tab Asistencia**

- **Found during:** verificación del checkpoint visual — la worklist operativa no era usable por el rol gestion (Analiticas es admin/owner).
- **Fix:** tab Asistencia movida de AnaliticasPage a ReportesPage; backend `ANALYTICS_OPERATIONAL_ROLES` (gestion+admin+owner) en el onRequest hook + `requireAdminAnalytics` per-route en `/`, `/members`, `/financial`; nuevo test de integración (gestion 200 en operacionales, 403 en admin-only).
- **Files modified:** AsistenciaTab.vue, AnaliticasPage.vue, ReportesPage.vue, member.ts, analytics/routes.ts, permissions.ts, analytics.test.ts
- **Verification:** admin `pnpm run build` OK; tests de analytics backend 56/56 verdes (incluye el test nuevo).
- **Committed in:** `73193740`, `376251db`

**2. [Rule 1 — UX] Ajustes de AsistenciaTab: ocultar "Sin segmento" + tooltips de segmento**

- **Found during:** revisión visual del checkpoint.
- **Fix:** bucket sinSegmento oculto; descripciones de segmento movidas a tooltip junto al chip dentro de las count cards (leyenda removida).
- **Files modified:** AsistenciaTab.vue, ReportesPage.vue
- **Committed in:** `63707e2e`

**3. [Rule 1 — UX] Rename display-only de segmentos**

- **Found during:** revisión de copy.
- **Fix:** "Digital Warrior"→"Digital", "Ghost"→"Fantasma" en SEGMENT_LABELS (member.ts) + consumo en AlumnosPage, NotificacionesPage, ConfiguracionPage y prosa de MiembrosTab. Claves de DB sin cambios.
- **Files modified:** member.ts, AlumnosPage.vue, NotificacionesPage.vue, ConfiguracionPage.vue, MiembrosTab.vue
- **Committed in:** `63707e2e`

---

**Total deviations:** 3 additions (1 missing-critical RBAC, 2 UX) — todas dentro del alcance de la fase, ninguna requirió dependencias nuevas (T-117-SC respetado).
**Impact on plan:** Las adiciones extienden el alcance original (acceso de gestion) sin scope creep fuera de analytics. Todos los must_haves del plan se cumplieron.

## Issues Encountered

None — los 3 tasks ejecutaron según el plan; las adiciones surgieron de la verificación visual y se resolvieron por reglas de desviación.

## Verification

- admin `pnpm run build` exitoso; `pnpm lint` limpio en los archivos tocados.
- Sin `any`, sin console.log (createLogger usado).
- Backend analytics tests 56/56 verdes (incluye el test nuevo de RBAC gestion).
- Suite API completa 1325 verdes antes de los tweaks; el tweak backend agregó 1 test.
- Checkpoint visual humano: **APROBADO** (KPI únicos, segmentos, listas WhatsApp, warning <50%, vencidos/renewal/flags, revenue por moneda, scope por sede).

## must_haves — Estado

- D-11 (KPI únicos 7/14/30 en Asistencias) — **CUMPLIDO**
- D-12 (segmentos + listas engagement con WhatsApp) — **CUMPLIDO**
- D-13 (warning de ratio <50%) — **CUMPLIDO**
- D-14/D-15/D-16/D-17 (vencidos buckets + renewal + flags + priorización; "habló con coach" diferido) — **CUMPLIDO** (D-16 habló-con-coach diferido por diseño)
- Tipos del frontend con revenue por moneda (ARS/EUR nunca sumados) — **CUMPLIDO**

## User Setup Required

None — sin configuración de servicios externos.

## Next Phase Readiness

- Fase 117 completamente ejecutada (6/6 planes). Tableros operativos del módulo de analytics listos.
- **Pendiente de operador:** migraciones 0128/0129 (Plan 117-02) aprobadas y aplicadas LOCALMENTE; aplicación en staging+prod pendiente vía pipeline (staging-first STRICT, sin merge a master ni push sin confirmación).
- Fase 118 (analytics estratégico — funnel/retención/caja-vs-devengado) consume `user_status_history` + helper canónico de "activo" + applyScope de esta fase.

## Self-Check: PASSED

---

_Phase: 117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico_
_Completed: 2026-05-26_
