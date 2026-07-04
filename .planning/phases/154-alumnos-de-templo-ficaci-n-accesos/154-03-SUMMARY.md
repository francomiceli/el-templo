---
phase: 154-alumnos-de-templo-ficaci-n-accesos
plan: 03
subsystem: admin
tags: [quasar, vue3, composable, rbac, pricing, feature-flag, nav]

# Dependency graph
requires:
  - phase: 154-01
    provides: endpoints GET (staff) / PUT (owner-only) /api/admin/settings/pricing/card-surcharge
provides:
  - "Flag de superficie TEMPLO_GREEK_LEVELS en templo-config.ts (contrato para el plan 05)"
  - "Composable usePricingSettingsApi: get/setCardSurchargeEnabled tipados (consumido por el plan 04)"
  - "Página owner-only ConfiguracionPreciosPage con toggle del recargo por tarjeta"
  - "Ruta + entrada de nav owner-only /configuracion/precios"
affects: [154-04-ui-cobro, 154-05-gating-niveles-griegos]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composable useXxxApi para settings admin (refs loading/error, api boot/axios, extractError, cleanup, sin onUnmounted)"
    - "Flag de superficie por instalación hermano de TEMPLO_ENABLED (NO canAccessTraining, que es por-persona)"

key-files:
  created:
    - el-templo-admin/src/composables/usePricingSettingsApi.ts
    - el-templo-admin/src/pages/ConfiguracionPreciosPage.vue
  modified:
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/router/routes.ts

key-decisions:
  - "TEMPLO_GREEK_LEVELS = TEMPLO_ENABLED: hereda el default de la capa Templo pero queda como knob independiente para futuros tenants white-label (D-08)"
  - "Toggle con guardado inmediato (sin botón Guardar) + revert optimista en error: UX más simple para un único switch"

patterns-established:
  - "Página de settings key-value owner-only: q-toggle + composable + $q.notify (no había analog 1:1 en el admin)"

requirements-completed: [ALUM-03, ALUM-05]

# Metrics
duration: ~12min
completed: 2026-07-04
---

# Phase 154 Plan 03: Superficie de configuración de precios + flag de niveles griegos Summary

**Composable tipado de la setting de recargo por tarjeta, página owner-only con toggle, su ruta/nav, y el flag de superficie `TEMPLO_GREEK_LEVELS` que consume el plan 05 — todo "interface-first": los contratos existen antes que sus consumidores.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-04
- **Tasks:** 2
- **Files modified:** 4 (2 creados, 2 modificados)

## Accomplishments

- El owner ve en la categoría Configuración una entrada "Reglas de precio" y puede prender/apagar el recargo por tarjeta desde una página propia; un empleado no ve la entrada ni la ruta (owner-only en nav + route meta; el PUT ya es owner-only server-side por el plan 01).
- `TEMPLO_GREEK_LEVELS` declarado como contrato de superficie para que el plan 05 gatee los niveles griegos por instalación (no por usuario — D-08, no reusa `canAccessTraining`).
- Composable `usePricingSettingsApi` disponible para el plan 04 (CobrosPage/AssignPlanDialog/PlanFormDialog): lectura staff + escritura owner tipadas, siguiendo el patrón de `useFinanceLoadApi`.

## Task Commits

1. **Task 1: Flag TEMPLO_GREEK_LEVELS + entrada de nav de config + composable de settings** - `07ce2fd9` (feat)
2. **Task 2: Página ConfiguracionPreciosPage (toggle owner-only) + ruta** - `01f02272` (feat)

## Files Created/Modified

- `el-templo-admin/src/config/templo-config.ts` - Nuevo `export const TEMPLO_GREEK_LEVELS = TEMPLO_ENABLED` (flag de superficie por instalación, D-08) + `NavItem` owner-only `/configuracion/precios` "Reglas de precio" en la categoría Configuración.
- `el-templo-admin/src/composables/usePricingSettingsApi.ts` - `getCardSurchargeEnabled()` (GET staff-readable, devuelve `data.enabled`) + `setCardSurchargeEnabled(enabled)` (PUT owner-only), refs `loading`/`error`, `extractError`, `cleanup()`, sin `onUnmounted`, sin `console`/`any`.
- `el-templo-admin/src/pages/ConfiguracionPreciosPage.vue` - Página owner-only: `q-toggle` bindeado a un ref, `onMounted` inicializa vía el composable, guardado inmediato al cambiar con `$q.notify` positivo/negativo + `createLogger` para errores + revert optimista si falla; `q-banner` explica que con la regla apagada todos los medios cobran precio regular.
- `el-templo-admin/src/router/routes.ts` - Child route owner-only `configuracion/precios` → `ConfiguracionPreciosPage.vue` (`allowedRoles: ['owner']`), matchea el path de la entrada de nav.

## Decisions Made

- **`TEMPLO_GREEK_LEVELS = TEMPLO_ENABLED`** (D-08): hereda el default de la capa Templo (visible en El Templo) pero queda como constante independiente para que un white-label nuevo la ponga en `false` sin tocar el resto de la superficie. NO reusa `canAccessTraining` porque ese es un gate por-persona.
- **Toggle con guardado inmediato (sin botón "Guardar")** (discreción autorizada en el plan): un único switch → UX más directa; en caso de error se revierte el valor optimista al último estado bueno y se notifica.

## Deviations from Plan

None - plan executed exactly as written.

(Higiene, no desviación de scope: el pre-commit de lint-staged reformateó el `q-banner` de la página — sin cambio de comportamiento.)

## Issues Encountered

None.

## User Setup Required

None - sin configuración de servicios externos. La página consume endpoints ya existentes del plan 01.

## Next Phase Readiness

- El **plan 04** puede importar `usePricingSettingsApi` para gatear la opción de precio tarjeta en CobrosPage/AssignPlanDialog/PlanFormDialog (la UI esconde; el gate real es server-side, plan 02).
- El **plan 05** puede importar `TEMPLO_GREEK_LEVELS` para condicionar la columna/filtro/badges de nivel en AlumnosPage/AlumnoDetailPage.
- Sin blockers.

## Self-Check: PASSED

- Archivos creados: `usePricingSettingsApi.ts` y `ConfiguracionPreciosPage.vue` verificados presentes.
- Commits `07ce2fd9`, `01f02272` presentes en git log.
- `pnpm lint` verde (0 errores; los 9 warnings son pre-existentes en archivos ajenos al plan).

---

_Phase: 154-alumnos-de-templo-ficaci-n-accesos_
_Completed: 2026-07-04_
