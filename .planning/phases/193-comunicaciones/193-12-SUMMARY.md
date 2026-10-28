---
phase: 193-comunicaciones
plan: 12
subsystem: app
tags: [communications, avisos, prompt-store, pinia, vue-router, vitest, dialogs]

# Dependency graph
requires:
  - phase: 193-05
    provides: "GET /me/prompt (PromptResult union por kind), POST /me/avisos/:id/event — contrato EXACTO consumido acá"
  - phase: 193-09
    provides: "useCommunicationsStore (número de ventas), resolveTapRoute, CONTACT_SALES_ROUTE/APP_SECTIONS en config/destinations.ts"
provides:
  - "useAvisosStore (el-templo-app/src/stores/useAvisosStore.ts): evaluate()/reset()/reportDismissed()/reportClicked() + getters isPlanExpiry/isAviso/isRating/isImprovement — única fuente de verdad de 'qué pop-up toca hoy' en la app"
  - "AvisoPromptDialog.vue: pop-up genérico de aviso (título/mensaje/botón/destino) con el estilo de RatingPromptDialog"
  - "MainLayout.vue: watch(authStore.isAuthenticated) → avisosStore.evaluate()/reset(), 5 diálogos montados (PushPermissionDialog queda fuera de esta lógica)"
affects: [193-15]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "evaluated.value = true ANTES del primer await en evaluate(): garantiza una sola llamada HTTP por apertura incluso ante invocaciones concurrentes/repetidas dentro del mismo tick"
    - "Los 4 diálogos globales dejan de tener su propio watch(authStore.isAuthenticated) — pasan a reaccionar al getter correspondiente de useAvisosStore (isPlanExpiry/isAviso/isRating/isImprovement), que solo se vuelve true después de que MainLayout dispara evaluate() una vez por sesión"
    - "Sustitución de tokens de copy editable en el cliente (PlanExpiryDialog: {dias} → daysRemaining con singular/plural y caso 0) — el servidor manda el texto con el placeholder literal, la app hace el reemplazo final"

key-files:
  created:
    - el-templo-app/src/stores/useAvisosStore.ts
    - el-templo-app/src/stores/__tests__/avisos-store.test.ts
    - el-templo-app/src/components/AvisoPromptDialog.vue
  modified:
    - el-templo-app/src/components/RatingPromptDialog.vue
    - el-templo-app/src/components/ImprovementPromptDialog.vue
    - el-templo-app/src/components/PlanExpiryDialog.vue
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/src/composables/useImprovementProposalsApi.ts

key-decisions:
  - "El evento 'shown' se reporta desde useAvisosStore.evaluate() (apenas llega la respuesta con un aviso), NO desde cada diálogo al montarse — evita que la guarda local de RatingPromptDialog (rating_resolved_v1_*, que puede bloquear el show) deje un 'shown' sin registrar o, al revés, que un diálogo reporte 'shown' sin que el servidor lo sepa (L3 de las lecciones acumuladas)."
  - "PlanExpiryDialog y AvisoPromptDialog navegan al destino con la misma lógica inline (whatsapp_sales → destination.route + ?text=; app_section → destination.route) en vez de extraer un helper compartido — 2 sitios, ~4 líneas cada uno, no ameritaba tocar un archivo fuera del <files> declarado de la task (useAvisosStore.ts) solo para DRY."
  - "useImprovementProposalsApi.ts quedó reducido a solo submitProposal/cleanup: evaluateProposalPrompt/markProposalPromptShown/resetProposalPromptEvaluation/proposalPromptWillShow eran los decisores client-side que la task 3 instruye retirar explícitamente ('si esas funciones quedan sin uso, borrarlas... y confirmarlo con grep') — grep confirmó cero usos fuera de su propia definición antes de borrarlas."
  - "ImprovementPromptDialog ahora renderiza title/body/buttonText desde avisosStore.prompt.aviso con fallback al hardcode viejo (L4) — RatingPromptDialog mantiene su título class-framed hardcodeado (¿Cómo estuvo tu clase de X?) porque UI-SPEC/D-A3 exige ese formato específico con el nombre de la actividad, que el copy editable del servidor no puede expresar sin plantillas; el resto de su copy (helper text) queda igual porque la task no pidió sustituirlo y el aviso rating_prompt no lo expone en un campo separado."

patterns-established:
  - "avisosStore.prompt (unión discriminada por kind) se consume en los 4 diálogos vía un computed local que narrowea con `p.kind === '...'` — mismo criterio en los 3 componentes, listo para que el plan 15 (carrusel) siga el mismo patrón de consumo de datos server-arbitrados."

requirements-completed: [COM-02]

# Metrics
duration: ~90min
completed: 2026-09-02
---

# Phase 193 Plan 12: Un endpoint, un pop-up por apertura (app) Summary

**La app de socios deja de arbitrar pop-ups: `useAvisosStore.evaluate()` pide `GET /communications/me/prompt` UNA vez por apertura y los 4 diálogos globales de `MainLayout` (permiso push queda fuera) se alimentan de ahí — el aviso genérico nuevo (`AvisoPromptDialog`) y los 3 diálogos existentes convertidos en vistas puras del servidor, con reporte `shown`/`dismissed`/`clicked` server-side.**

## Performance

- **Duration:** ~90 min
- **Tasks:** 3/3
- **Files modified:** 8 (3 nuevos + 5 modificados)

## Accomplishments

- `useAvisosStore.ts` (Pinia setup): `evaluate()` marca `evaluated` de forma síncrona ANTES del primer `await` (garantiza una sola llamada HTTP aunque se invoque varias veces en el mismo tick), reporta `shown` de inmediato si vino un aviso, y traga cualquier error de red dejando `prompt` en `null` (D-06/D-07/D-11). Getters `isPlanExpiry`/`isAviso`/`isRating`/`isImprovement` derivados del `kind` de la unión discriminada. `reportDismissed`/`reportClicked`/`reset()` completan la API.
- 6 tests en `avisos-store.test.ts`: una sola llamada HTTP con 3 invocaciones concurrentes, getters por `kind` (rating → los otros 3 en false), evento `shown` reportado una vez, 500 del endpoint sin lanzar, `reportDismissed`/`reportClicked` con el tipo correcto, `reset()` habilita re-evaluar.
- `AvisoPromptDialog.vue`: pop-up genérico salteable, estilo copiado 1:1 de `RatingPromptDialog.vue` (card charcoal, primario terracotta, secundario "Ahora no", max-width 340px). Primario reporta `clicked` y navega (WhatsApp → `CONTACT_SALES_ROUTE + ?text=`; sección → `destination.route`); secundario y `@hide` (backdrop/Esc) reportan `dismissed` una sola vez. Sin `v-html` (interpolación `{{ }}`).
- `MainLayout.vue`: un único `watch(authStore.isAuthenticated)` llama `avisosStore.evaluate()` al loguear y `avisosStore.reset()` al desloguear; monta `<AvisoPromptDialog />` junto a los 3 existentes. `PushPermissionDialog` queda exactamente igual (fuera de esta lógica, D-07).
- `RatingPromptDialog.vue`: retira `shouldShow()`/`evaluate()` propio, la llamada a `getPendingRating` y la cesión de turno `proposalPromptWillShow()` — los datos de la clase pendiente vienen de `avisosStore.prompt.pending`. Conserva `rating_resolved_v1_*` como guarda local por clase (fase 143 D-P2, el servidor no la trackea).
- `ImprovementPromptDialog.vue`: retira `evaluateProposalPrompt`/`markProposalPromptShown` como decisores; título/cuerpo/botón vienen del copy editable del servidor (`avisosStore.prompt.aviso`) con fallback al hardcode viejo si el prompt no trae copy (L4). El envío de la sugerencia no cambia.
- `PlanExpiryDialog.vue`: retira el fetch propio a `GET /members/subscription/coverage`. Título/botón del aviso `plan_expiry`; el cuerpo sustituye el token literal `{dias}` (que el servidor manda tal cual) por el `daysRemaining` resuelto ahí mismo, respetando singular/plural y el caso "vence hoy" (n=0). El botón navega al destino del aviso (WhatsApp de ventas por defecto). `plan_expiry_shown_v1` se conserva solo como cache local, ya no gatea el `show`.
- `useImprovementProposalsApi.ts`: se retiraron los 4 decisores client-side (`evaluateProposalPrompt`, `markProposalPromptShown`, `resetProposalPromptEvaluation`, `proposalPromptWillShow`) tras confirmar por grep que quedaban sin ningún uso fuera de su propia definición — solo queda `submitProposal`/`cleanup`.
- Verificación: `pnpm -C el-templo-app lint` 0 errores (2 warnings preexistentes ajenos, `boot/axios.ts` y `useSessionPlayer.ts`); `pnpm -C el-templo-app test` 159/161 verdes — los 2 fallos son `test/level-display.test.ts` (nivel `kairos`), preexistentes y documentados en `deferred-items.md` de la fase, sin relación con este plan; `pnpm -C el-templo-app build` (`quasar build`) exitoso, `dist/` no se agregó al commit.
- `grep -rn "proposalPromptWillShow" src` → 0. `grep -n "v-html" AvisoPromptDialog.vue` → vacío. `git diff --name-only` de las 3 tasks no lista `PushPermissionDialog.vue`. Ninguno de los 3 diálogos llama ya a `getPendingRating`, `evaluateProposalPrompt` ni `/members/subscription/coverage` (grep en los tres archivos, vacío).

## Task Commits

Cada task se commiteó atómicamente en `feat/193-comunicaciones`, worktree `~/projects/et-193`:

1. **Task 1: Store de pop-up por apertura + registro de eventos** - `ba87588a` (feat)
2. **Task 2: Pop-up genérico de aviso** - `4360563b` (feat)
3. **Task 3: Los 3 diálogos existentes pasan a ser vistas del endpoint único** - `3882039f` (feat)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal sin commitear (lo commitea el orquestador). Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-app/src/stores/useAvisosStore.ts` (nuevo) — `evaluate`/`reset`/`reportDismissed`/`reportClicked` + 4 getters
- `el-templo-app/src/stores/__tests__/avisos-store.test.ts` (nuevo) — 6 tests
- `el-templo-app/src/components/AvisoPromptDialog.vue` (nuevo) — pop-up genérico
- `el-templo-app/src/components/RatingPromptDialog.vue` — vista pura del prompt server-arbitrado, guarda local por clase intacta
- `el-templo-app/src/components/ImprovementPromptDialog.vue` — vista pura, copy del servidor con fallback
- `el-templo-app/src/components/PlanExpiryDialog.vue` — vista pura, sustitución de `{dias}`, destino del aviso
- `el-templo-app/src/layouts/MainLayout.vue` — watcher `avisosStore.evaluate()/reset()`, monta `AvisoPromptDialog`
- `el-templo-app/src/composables/useImprovementProposalsApi.ts` — reducido a `submitProposal`/`cleanup`

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: `shown` se reporta desde el store (no desde cada diálogo) para no desincronizar frecuencia server-side de la guarda local de calificación; navegación al destino duplicada inline en 2 componentes (no ameritaba extraer un helper fuera del `<files>` de la task); `useImprovementProposalsApi.ts` limpiado de decisores muertos por instrucción explícita del plan; `RatingPromptDialog` mantiene su título class-framed hardcodeado porque el copy editable del servidor no puede expresar interpolación por actividad.

## Deviations from Plan

Ninguna Rule 1-4. Un archivo tocado fuera del `<files>` literal de la Task 3 (`useImprovementProposalsApi.ts`), pero explícitamente instruido por el propio texto de la task ("Si esas funciones quedan sin uso, borrarlas del composable y confirmarlo con grep") — mismo criterio que la 193-09 documentó para `MainLayout.vue`: no es una desviación de las reglas 1-4, es la instrucción explícita del plan.

## Issues Encountered

Ninguno bloqueante. Los tests corrieron en foreground sin necesitar `timeout` extendido (unitarios, sin DB); `quasar build` corrió en foreground con `timeout: 600000` (~40s reales). Los 2 fallos preexistentes de `test/level-display.test.ts` (nivel `kairos`) se re-verificaron sin diff en los archivos que este plan toca — mismo origen documentado ya en `deferred-items.md` de la fase (commit `a669156e`, ajeno a esta rama de trabajo).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Para el plan 15 (carrusel del servidor en Mi Templo):** reusa `useAvisosStore.ts` como referencia de patrón (mismo shape Pinia setup + getters por `kind`/`placement`), aunque probablemente necesite su propio state para `GET /me/tarjetas` (sin frecuencia, D-15b) en vez de extender este store 1-a-1 (este store es específicamente "un pop-up por apertura", no una lista). El cliente de API (`api.get`/`api.post` de `src/boot/axios`), la resolución de destino (`config/destinations.ts` — `CONTACT_SALES_ROUTE`, `resolveDestinationRoute`, `APP_SECTIONS`) y el patrón de registro de eventos (`POST /communications/me/avisos/:id/event` con `type: 'shown'|'dismissed'|'clicked'`) quedan probados end-to-end y listos para reusarse tal cual en las tarjetas del carrusel (D-19: las tarjetas miden solo clics, así que solo necesitarán `reportClicked`).
- Nada bloquea el siguiente plan de la fase: worktree limpio, `feat/193-comunicaciones` con 3 commits nuevos sobre el HEAD `aed7ed13` de los planes 01-11.

---

## Self-Check: PASSED

- `el-templo-app/src/stores/useAvisosStore.ts` — FOUND
- `el-templo-app/src/stores/__tests__/avisos-store.test.ts` — FOUND
- `el-templo-app/src/components/AvisoPromptDialog.vue` — FOUND
- `el-templo-app/src/components/RatingPromptDialog.vue` — FOUND
- `el-templo-app/src/components/ImprovementPromptDialog.vue` — FOUND
- `el-templo-app/src/components/PlanExpiryDialog.vue` — FOUND
- `el-templo-app/src/layouts/MainLayout.vue` — FOUND
- `el-templo-app/src/composables/useImprovementProposalsApi.ts` — FOUND
- Commit `ba87588a` — FOUND
- Commit `4360563b` — FOUND
- Commit `3882039f` — FOUND
- `.planning/phases/193-comunicaciones/193-12-SUMMARY.md` — FOUND (este archivo)

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
