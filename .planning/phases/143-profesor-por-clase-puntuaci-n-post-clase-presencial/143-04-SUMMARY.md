---
phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial
plan: 04
subsystem: admin-ui
tags: [quasar, vue3, ratings, roster, owner-view, qrating, terracotta]

# Dependency graph
requires:
  - phase: 143-02
    provides: /api/admin/ratings endpoints (coaches, roster GET/POST, owner view)
  - phase: 110-admin-multisede
    provides: branch selector + role gating in admin
  - phase: 61-attendance-scheduling
    provides: HorariosPage weekly grid (branch selector + week nav) reused as-is
provides:
  - "useRatingsApi (admin) — getCoachesForBranch, getRosterWeek, assignCoach, getOwnerRatings"
  - "Surface 1 — roster de profe por (día, turno) dentro de HorariosPage, persistencia inmediata"
  - "Surface 3 — PuntuacionesPage owner-only (promedio por profe + recientes)"
  - "Ruta /puntuaciones owner-only + link en sidebar (v-if isOwnerRole)"
affects: [HorariosPage, AdminLayout-nav, admin-router, 143-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "QRating (primera vez en admin) readonly + color=primary (Terracotta) para promedios"
    - "Roster por (día, turno) reutilizando selector de sucursal + nav de semana existentes (sin segundo picker)"
    - "Persistencia inmediata en @update:model-value del QSelect (sin botón Save, D-A1)"
    - "Owner-only gating en dos capas: meta.allowedRoles ['owner'] en router + endpoint owner-only server-side (143-02)"

key-files:
  created:
    - el-templo-admin/src/composables/useRatingsApi.ts
    - el-templo-admin/src/pages/PuntuacionesPage.vue
  modified:
    - el-templo-admin/src/pages/HorariosPage.vue
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/layouts/AdminLayout.vue

key-decisions:
  - "El roster QSelect se etiqueta directamente Mañana/Tarde → 'morning'/'afternoon'; el split startTime<'12:00' lo aplica el backend al atribuir (143-02). La UI no re-deriva el slot porque la asignación es por turno, no por horario individual."
  - "Limpiar el QSelect (sin profe) NO escribe en la API (el endpoint no soporta DELETE; un coach por slot) — se re-sincroniza el roster y se descarta la selección vacía."
  - "Verificación local vía eslint (configurado) + tsc filtrado por archivos propios; admin no tiene script 'typecheck' ni vue-tsc instalado (mismo criterio que 143-02). El build vue-tsc real corre en CI."

requirements-completed: [PROF-ROSTER, PROF-OWNERVIEW]

# Metrics
duration: ~12min
completed: 2026-06-24
---

# Phase 143 Plan 04: UI admin del roster + vista de puntuaciones owner Summary

**Dos superficies admin de la fase 143: Surface 1 — grilla de asignación de profe por `(día, turno)` integrada en la vista semanal existente de `HorariosPage` (reusa selector de sucursal + navegación de semana, persistencia inmediata sin botón Save, toasts de confirmación); y Surface 3 — `PuntuacionesPage.vue` owner-only con promedio por profe (estrellas `QRating` read-only en Terracotta) + puntuaciones recientes con comentarios. Más el composable `useRatingsApi` y la ruta owner-only.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- **`useRatingsApi` (admin):** composable con la forma de `useCoachApi` (refs `loading`/`error`, `extractError`, `throw err` en catch, `finally`). Cuatro métodos tipados (sin `any`): `getCoachesForBranch(branchId)`, `getRosterWeek(branchId, weekStart)`, `assignCoach(payload)`, `getOwnerRatings()`. Interfaces exportadas: `CoachOption`, `RosterWeekRow`, `AssignCoachPayload`, `OwnerCoachRatingSummary`, `OwnerRecentRating`, `OwnerRatings` — alineadas a los shapes del módulo API de 143-02.
- **Surface 1 (HorariosPage extendido, NO reemplazado):**
  - Sección "Profe a cargo" debajo de la grilla semanal en desktop: grilla con columna Turno (Mañana/Tarde) × 6 días, cada celda un `QSelect` de coaches de la sucursal.
  - Mobile (`isMobile`): dos `QSelect` ("Profe — Mañana" / "Profe — Tarde") para el `selectedDay`, sobre la lista de slots.
  - Carga de coaches + roster (`loadRoster`) al cambiar sucursal o semana, reusando los watchers/`onBranchChange` existentes. Wrapper con `loadingRoster` ref + `try/catch (err: unknown)` + `log.error`.
  - `@update:model-value` → `onAssignCoach` persiste de inmediato vía `assignCoach`, actualiza el mapa local y muestra `$q.notify({type:'positive', message:'Profe asignado'})`; en error muestra el toast negativo "No se pudo asignar el profe. Reintentá." y re-sincroniza.
  - Placeholder "Sin profe asignado". Reusa `createLogger('HorariosPage')` existente, selector de sucursal y navegación de semana — sin segundo picker.
- **Surface 3 (PuntuacionesPage owner-only):**
  - Título `text-h5` "Puntuaciones de profes" + botón refresh.
  - Tabla resumen por coach: nombre + promedio como `QRating readonly color="primary"` (Terracotta) + valor numérico (`toFixed(1)`) + count; columnas "Promedio" y "Puntuaciones".
  - Lista (`QList`/`QItem`) de puntuaciones recientes: estrellas read-only, comentario opcional, clase (actividad · fecha).
  - Empty state: "Todavía no hay puntuaciones" + body copy. Loading: `QInnerLoading`/spinner. Error: banner + retry vía `reload`.
- **Ruta + nav:** ruta `puntuaciones` con `meta.allowedRoles: ['owner']` en `routes.ts`; link "Puntuaciones" (icono `star`) en el sidebar bajo `v-if="isOwnerRole"`.

## Task Commits

1. **Task 1: useRatingsApi + roster en HorariosPage (Surface 1)** - `dedcd7d5` (feat)
2. **Task 2: PuntuacionesPage owner-only (Surface 3) + ruta + nav link** - `9a5b541c` (feat)

## Files Created/Modified

- `el-templo-admin/src/composables/useRatingsApi.ts` (creado) — cliente API admin del módulo ratings (4 métodos + interfaces)
- `el-templo-admin/src/pages/HorariosPage.vue` (modificado) — grilla de roster por (día, turno) desktop + dos selects mobile; carga + persistencia inmediata
- `el-templo-admin/src/pages/PuntuacionesPage.vue` (creado) — vista owner-only de promedios + recientes
- `el-templo-admin/src/router/routes.ts` (modificado) — ruta `puntuaciones` owner-only
- `el-templo-admin/src/layouts/AdminLayout.vue` (modificado) — link "Puntuaciones" owner-only en sidebar

## Threat Model Coverage

| Threat ID | Mitigación implementada                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-143-13  | Ruta `/puntuaciones` con `meta.allowedRoles: ['owner']` + link owner-only en nav; defensa en profundidad sobre el endpoint owner-only server-side (143-02) |
| T-143-14  | El `QSelect` solo ofrece coaches de la sucursal seleccionada (`getCoachesForBranch`); el server valida con `requireBranchAccess` (143-02)                  |
| T-143-15  | No existe UI de ratings para coach; `PuntuacionesPage` es owner-only (D-M3)                                                                                |

## Decisions Made

- El roster `QSelect` se etiqueta directamente Mañana/Tarde y mapea a `'morning'`/`'afternoon'`; la UI no re-deriva el slot desde `startTime` porque la asignación es por turno (no por horario individual). El split `startTime < '12:00'` lo aplica el backend al resolver la atribución (143-02), respetando el criterio LOCKED.
- Limpiar el `QSelect` (sin profe) no escribe en la API (el endpoint POST upsert no soporta borrar; un coach por slot) — se re-sincroniza el roster para descartar la selección vacía.
- Persistencia inmediata sin botón Save (D-A1): el write se dispara en `@update:model-value`, con guarda para no reescribir si el valor no cambió.

## Deviations from Plan

Ninguna desviación de implementación — el plan se ejecutó como fue escrito.

Nota de verificación (no es desviación): el plan referenciaba `pnpm typecheck` (Task 1) y `pnpm typecheck && pnpm lint` (Task 2), pero `el-templo-admin` no define un script `typecheck` ni tiene `vue-tsc` instalado (solo `tsc` y el script `lint` de eslint). Igual criterio que 143-02: se usó `eslint` (EXIT 0 en todos los archivos tocados) como lint real, y `tsc --noEmit` filtrado por los archivos propios (sin errores en ellos; los errores de `tsc` son pre-existentes y fuera de scope, en tests de axios y `pdf/session-pdf-builder.ts`). El typecheck de SFCs `.vue` vía `vue-tsc` corre en el build de CI al pushear. Prettier reformateó archivos vía husky/lint-staged en cada commit (sin cambios funcionales).

## Known Stubs

Ninguno. Ambas superficies consumen datos reales de los endpoints de 143-02. La vista owner renderiza listas vacías solo cuando aún no hay puntuaciones (empty state intencional, no un stub).

## Issues Encountered

Ninguno. ESLint verde en todos los archivos; sin `console.*` ni `: any`.

## Next Phase Readiness

- Las dos superficies admin de la fase están completas. Falta la superficie member (Surface 2, `RatingPromptDialog` — plan 143-05 si aplica).
- UAT visual pendiente: asignar profe en Horarios (desktop + mobile) con toasts; ver `/puntuaciones` como owner (promedio + recientes + empty state); confirmar que no-owners no ven la ruta ni el link.
- Sin blockers. La API (143-02) y la migración 0152 (143-01) ya están listas localmente; en prod se aplican en el próximo deploy.

## Self-Check: PASSED

- FOUND: el-templo-admin/src/composables/useRatingsApi.ts
- FOUND: el-templo-admin/src/pages/PuntuacionesPage.vue
- FOUND: commit dedcd7d5
- FOUND: commit 9a5b541c
- grep "useRatingsApi" en useRatingsApi.ts = OK; "assignCoach" en HorariosPage = 1; "Puntuaciones de profes" + "Todavía no hay puntuaciones" en PuntuacionesPage = OK; ruta `puntuaciones` con `'owner'` = 1

---

_Phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial_
_Completed: 2026-06-24_
