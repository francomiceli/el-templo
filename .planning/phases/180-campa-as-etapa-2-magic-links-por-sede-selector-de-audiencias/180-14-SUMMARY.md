---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 14
subsystem: ui
tags: [campaigns, audience, quasar, vue3, admin]
status: completed

# Dependency graph
requires:
  - phase: 180-08
    provides: "CreateCampaignInput.segment/CampaignRecord.segment persistidos + GET /campaigns/admin/eligible-count?segment= con COUNT(*) real por segmento"
  - phase: 180-04
    provides: "los 5 segmentos canónicos (CAMPAIGN_SEGMENTS): freemium_elegibles | bajas | prueba_no_convertida | alerta_ausente | referidos_pendientes"
provides:
  - "CampaignSegment (tipo) + CAMPAIGN_SEGMENT_LABELS (etiquetas legibles, definidas una sola vez) en el admin"
  - "useCampaignsApi().getEligibleCount(country?, segment?) — el segmento viaja como query param"
  - "q-select de segmento (single-select, D-14) en el diálogo de creación de campaña, default freemium_elegibles"
  - "columna 'Segmento' en el listado de campañas (chip con la etiqueta legible)"
  - "el diálogo de envío consulta el conteo del segmento PERSISTIDO de la campaña (no el del form sin guardar) y lo presenta como estimación con hora"
affects: ["180-16"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Etiquetas legibles de un enum cerrado definidas UNA vez en types.ts (CAMPAIGN_SEGMENT_LABELS) y derivadas con Object.entries() para las opciones del q-select — mismo patrón que evita duplicar el texto entre el form y el listado"
    - "q-select de un único valor cerrado: dense outlined emit-value map-options, sin 'multiple' — mismo patrón que el q-select de país ya existente en CampaniasPage.vue"

key-files:
  created: []
  modified:
    - el-templo-admin/src/types/campaign.ts
    - el-templo-admin/src/composables/useCampaignsApi.ts
    - el-templo-admin/src/pages/CampaniasPage.vue

key-decisions:
  - "CampaignRecord.segment tipado como CampaignSegment (union de 5 literales) en el admin, más estricto que el 'string' soft-enum de la API (types.ts del backend) — el admin conoce y controla exhaustivamente los 5 valores para el switch de etiquetas, no necesita el soft-enum de la API pensado para no acoplar tipos públicos"
  - "El copy del diálogo de envío agrega segmento + hora de estimación ('estimado a las HH:MM') sobre el texto exacto que ya exigía el UI-SPEC anterior — se mantiene el disclaimer 'no se puede deshacer. ¿Continuar?' intacto y se antepone '~' al número para reforzar que es estimación, no promesa (T-180-63)"

requirements-completed: [AUD-02]

# Metrics
duration: ~25min
completed: 2026-08-24
---

# Fase 180 Plan 14: Selector de audiencias en el admin (D-11/D-14) Summary

**El admin elige un segmento cerrado al crear una campaña (q-select single-select, default freemium_elegibles), lo ve como chip en el listado, y el diálogo de envío calcula el conteo sobre el segmento PERSISTIDO de esa campaña presentándolo explícitamente como estimación con hora.**

## Performance

- **Duration:** ~25 min (2 tasks)
- **Completed:** 2026-08-24
- **Tasks:** 2/2 ejecutados
- **Files modified:** 3 (0 nuevos, 3 modificados)

## Accomplishments

- `CampaignSegment` (union de los 5 literales, espejo de `CAMPAIGN_SEGMENTS` del backend) + `CAMPAIGN_SEGMENT_LABELS` (Record con las 5 etiquetas legibles en español, definido una sola vez) en `types/campaign.ts`. `CreateCampaignInput.segment?` y `CampaignRecord.segment: CampaignSegment` — este último no-opcional porque toda campaña persistida ya trae el segmento del backend (default `freemium_elegibles` cuando no se especifica al crear).
- `useCampaignsApi().getEligibleCount(country?, segment?)` suma el segmento a los query params, manteniendo el patrón `loading`/`error`/`try-finally` existente sin tocarlo.
- Diálogo de creación: `q-select` de segmento (dense outlined emit-value map-options, sin `multiple` — D-14 fija un único segmento por campaña), opciones derivadas de `CAMPAIGN_SEGMENT_LABELS` vía `Object.entries()`, default `freemium_elegibles` en `emptyForm()`. `confirmCreate()` incluye `segment` en el payload.
- Listado: nueva columna "Segmento" con un chip que muestra la etiqueta legible de `CAMPAIGN_SEGMENT_LABELS[props.row.segment]`.
- `openSendDialog(campaign)` pasa `campaign.segment` (el segmento PERSISTIDO que devuelve la API en el listado) a `getEligibleCount`, nunca el valor del formulario sin guardar (Pitfall 8 del plan 180-08).
- `sendConfirmMessage` ahora menciona el segmento y la hora en que se calculó el conteo ("Vas a enviar este email a ~N personas del segmento «X» (estimado a las HH:MM). Esta acción no se puede deshacer. ¿Continuar?"), dejando explícito que el número es una estimación — la audiencia real se recalcula en `send()` (fix de 180-08).

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: Tipo `CampaignSegment` + composable con segmento** - `7181bee2` (feat)
2. **Task 2: Selector en el form, segmento en el listado y preview en el envío** - `19c374ea` (feat)

**Plan metadata:** este SUMMARY se escribe en el checkout principal y NO se commitea (lo commitea el orquestador junto con STATE.md/ROADMAP.md).

## Files Created/Modified

- `el-templo-admin/src/types/campaign.ts` - `CampaignSegment`, `CAMPAIGN_SEGMENT_LABELS`, `CreateCampaignInput.segment?`, `CampaignRecord.segment: CampaignSegment`
- `el-templo-admin/src/composables/useCampaignsApi.ts` - `getEligibleCount(country?, segment?)` suma el `segment` a los params
- `el-templo-admin/src/pages/CampaniasPage.vue` - `q-select` de segmento en el form de creación, columna+chip "Segmento" en el listado, `openSendDialog` pasa el segmento persistido, `sendConfirmMessage` menciona segmento + hora de estimación

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para quien retome: `CampaignRecord.segment` en el admin es `CampaignSegment` (tipado estricto), no el `string` soft-enum que usa `types.ts` de la API — es una divergencia intencional documentada (el admin es un consumidor cerrado de los 5 valores, no necesita la flexibilidad de no-acoplamiento que sí necesita el tipo público de la API).

## Deviations from Plan

None - plan ejecutado exactamente como estaba escrito. No hubo necesidad de fixes de Rule 1/2/3 ni decisiones arquitecturales (Rule 4).

## Issues Encountered

**`el-templo-admin` no tenía `node_modules`** al empezar la ejecución — se corrió `pnpm install --frozen-lockfile` según lo indicado en el contexto de base (`api`/`app` ya listos). No hubo cambios de lockfile.

**`vue-tsc` no está en `pnpm exec`** (no es dependencia del proyecto) — se usó `pnpm dlx --package vue-tsc@3.2.5 --package typescript@5.9.3 vue-tsc --noEmit`, el mismo comando validado en la fase 160 (memoria del proyecto), pineando también `typescript@5.9.3` (la versión real del devDependency del admin) porque `dlx vue-tsc@3.2.5` solo, sin pinear `typescript`, resuelve una versión de `typescript` (7.0.2) incompatible con el binario de `vue-tsc` y falla con `ERR_PACKAGE_PATH_NOT_EXPORTED` antes de poder typechequear nada.

## Verification

- `pnpm dlx --package vue-tsc@3.2.5 --package typescript@5.9.3 vue-tsc --noEmit` corrido tras cada task: **20 errores en 14 archivos**, exactamente el baseline documentado en el contexto de base — ninguno de los 3 archivos tocados (`types/campaign.ts`, `useCampaignsApi.ts`, `CampaniasPage.vue`) aparece en la lista de errores, en ninguna de las dos corridas.
- Acceptance criteria de las 2 tasks verificados con los greps exactos que pide el plan:
  - Task 1: `CampaignSegment` en `types/campaign.ts` = 4 (≥2); `CAMPAIGN_SEGMENT_LABELS` en `types/campaign.ts` = 1 (==1); `segment` en `useCampaignsApi.ts` = 2 (≥2); `"Freemium elegibles"` en `CampaniasPage.vue` = 0 (==0, antes de Task 2).
  - Task 2: `CAMPAIGN_SEGMENT_LABELS` en `CampaniasPage.vue` = 4 (≥2); `multiple` dentro del `q-select` de segmento = 0 (==0, D-14); `campaign.segment`/`campaignToSend...segment` = 2 (≥1); `estimad` (case-insensitive) = 1 (≥1); `console.` = 0 (==0).
- `git status --short` vacío tras cada commit; solo 2 commits creados, ambos con `git add` por ruta explícita.

## User Setup Required

None — no se instaló ningún paquete nuevo en el proyecto (el `pnpm install --frozen-lockfile` inicial solo materializó `node_modules` desde el lockfile existente, sin cambios), no hay variables de entorno nuevas, no hay migración nueva.

## Next Phase Readiness

- La punta de admin de las audiencias queda completa: crear campaña elige segmento → listado lo muestra → diálogo de envío calcula el conteo sobre el segmento real y lo presenta como estimación con hora. Conecta con el pipeline de envío del plan 180-08 sin fricciones — no quedó ningún endpoint o tipo del backend sin consumir.
- Verificación funcional real (crear una campaña con cada segmento, click en enviar, comparar el conteo mostrado contra `recipientCount` del resultado) queda para el checkpoint humano del plan 180-16, tal como indica el `<verification>` de este plan.
- Sin bloqueos. El worktree `et-180` sigue con `node_modules`/`.env` operativos (ahora también en `el-templo-admin`).

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-24_

## Self-Check: PASSED

- FOUND: el-templo-admin/src/types/campaign.ts (worktree et-180)
- FOUND: el-templo-admin/src/composables/useCampaignsApi.ts (worktree et-180)
- FOUND: el-templo-admin/src/pages/CampaniasPage.vue (worktree et-180)
- FOUND: commit 7181bee2 (feat, Task 1)
- FOUND: commit 19c374ea (feat, Task 2)
- FOUND: este SUMMARY.md en el checkout principal
