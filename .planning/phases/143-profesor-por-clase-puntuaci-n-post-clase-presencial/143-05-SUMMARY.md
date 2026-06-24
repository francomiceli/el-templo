---
phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial
plan: 05
subsystem: member-app
tags: [quasar, vue, ratings, dialog, qrating, privacy, capacitor-preferences]

# Dependency graph
requires:
  - phase: 143-02
    provides: "GET /api/members/ratings/pending + POST /api/members/ratings (reglas 48h/última/one-shot/sin-profe server-side)"
provides:
  - "useRatingsApi (member) — getPendingRating + submitRating + cleanup()"
  - "RatingPromptDialog (Surface 2) — pop-up de puntuación class-framed, salteable, one-shot, montado en MainLayout"
affects: [member-app-shell, 143-UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composable member lean (api + interfaces + cleanup() no-op) replicando useAttendanceApi"
    - "One-shot client-side vía Capacitor Preferences keyado por clase (sessionDate+scheduleId), versionado (rating_resolved_v1_)"
    - "Auto-trigger por watch(authStore.isAuthenticated, {immediate:true}) replicando PushPermissionDialog"
    - "Class-framed UI: el dialog solo presenta lo que pending devuelve, nunca la identidad del profe (D-A3)"

key-files:
  created:
    - el-templo-app/src/composables/useRatingsApi.ts
    - el-templo-app/src/components/RatingPromptDialog.vue
  modified:
    - el-templo-app/src/layouts/MainLayout.vue

key-decisions:
  - "Verificación: el-templo-app no define script `typecheck`; `tsc`/`vue-tsc` no resuelven .vue ni tipos de Quasar/Vite (errores pre-existentes en routes.ts/logger.ts, fuera de scope). Se usó ESLint (config con plugin vue) como verificación canónica — EXIT 0 en los 3 archivos. Mismo criterio de adaptación de verificación que 143-02."
  - "Título class-framed usa solo activityName (copy LOCKED del UI-SPEC: '¿Cómo estuvo tu clase de {Actividad}?'); dayOfWeek del payload no se renderiza en el copy, así que no se mapea a etiqueta de día (evita variable sin uso). Fallback '¿Cómo estuvo tu clase?' si no hay actividad."
  - "comment se envía solo si no está vacío tras trim (spread condicional), respetando comment opcional del schema (Plan 02)."
  - "Estilos replican el patrón de PushPermissionDialog (charcoal+terracotta brand SCSS); estrellas Terracotta vía color=primary, sin hex hardcodeado en bindings."

requirements-completed: [PROF-RATING]

# Metrics
duration: ~6min
completed: 2026-06-24
---

# Phase 143 Plan 05: Surface 2 — Pop-up de puntuación (member app) Summary

**Pop-up de puntuación estilo Uber en la app del miembro (`RatingPromptDialog.vue`), auto-disparado al volver a la app autenticado tras una clase presencial completada con profe asignado. Estrellas 1–5 Terracotta + comentario opcional, class-framed (nunca muestra al profe, D-A3), salteable (D-P1) y one-shot por clase vía Capacitor Preferences (D-P2). El composable `useRatingsApi` consume el `GET /pending` y postea el rating; toda la lógica de elegibilidad (48h/última/sin-profe) vive server-side (Plan 02). Montado junto a `PushPermissionDialog` en `MainLayout`.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **`useRatingsApi` (member):** composable lean replicando `useAttendanceApi` — `getPendingRating(): Promise<PendingRating | null>` (GET `/members/ratings/pending`), `submitRating(input): Promise<void>` (POST `/members/ratings`), `cleanup()` no-op. `PendingRating` expone solo `{sessionDate, branchId, scheduleId, activityName, dayOfWeek}` — sin identidad del profe (D-A3).
- **`RatingPromptDialog.vue` (Surface 2):**
  - `<q-dialog>` SIN `persistent` (D-P1 salteable), patrón `QCard` de `PushPermissionDialog`.
  - `QRating` `size="2.5em"`, `color="primary"` (Terracotta), `icon="star_border"`, `icon-selected="star"`, sin medias estrellas; CTA "Enviar puntuación" `:disable="stars < 1"` + `:loading="submitting"`.
  - `QInput type="textarea" autogrow maxlength="280"` "Comentario (opcional)" + helper "Tu opinión es anónima y nos ayuda a mejorar las clases."
  - Título class-framed "¿Cómo estuvo tu clase de {Actividad}?" — nunca el profe.
  - `shouldShow()` consume `getPendingRating`, descarta si la clase ya está resuelta en `Preferences`; `evaluate()` resetea estado y abre; `watch(authStore.isAuthenticated, {immediate:true})` dispara al login/resume.
  - One-shot (D-P2): "Ahora no" y submit-OK marcan la clase resuelta (`rating_resolved_v1_{sessionDate}_{scheduleId}`).
  - Submit: success → marca resuelta + cierra + toast positivo; error (`catch err:unknown` + `instanceof Error`) → mantiene abierto + toast negativo.
- **Montaje en `MainLayout.vue`:** `<RatingPromptDialog />` junto a `<PushPermissionDialog />` + import; el dialog gestiona su propia visibilidad.

## Task Commits

1. **Task 1: composable useRatingsApi (member)** - `04314501` (feat)
2. **Task 2: RatingPromptDialog (Surface 2) + montaje en MainLayout** - `9a317adc` (feat)

## Files Created/Modified

- `el-templo-app/src/composables/useRatingsApi.ts` - Composable member: pending + submit + cleanup (sin `any`, sin `console`)
- `el-templo-app/src/components/RatingPromptDialog.vue` - Pop-up Surface 2 class-framed, salteable, one-shot, Terracotta
- `el-templo-app/src/layouts/MainLayout.vue` - Import + montaje del dialog junto a PushPermissionDialog

## Threat Model Coverage

| Threat ID                                           | Mitigación implementada                                                                                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-143-17 (pop-up filtra identidad del profe)        | El composable y el componente solo consumen `pending` (sin coachId/coachName/photoUrl); grep sobre ambos archivos = 0 campos del profe; título solo usa `activityName` |
| T-143-18 (bypass del one-shot/48h desde el cliente) | El cliente marca resuelta en Preferences pero el server revalida one-shot/48h/asistencia en submit (Plan 02); el cliente no es la frontera                             |
| T-143-19 (stars/comment manipulados)                | `:disable` del CTA es solo UX; la validación real es el JSON schema + service del endpoint (Plan 02)                                                                   |

## Decisions Made

- **Verificación adaptada:** sin script `typecheck` ni `vue-tsc` instalado; `tsc` arroja errores pre-existentes fuera de scope (resolución de `.vue`, `import.meta.env`). Se usó ESLint (plugin vue) como verificación canónica → EXIT 0 en los 3 archivos. Prettier corre vía husky/lint-staged en el commit (reformateó el helper a una línea en `RatingPromptDialog.vue`, sin cambio funcional).
- **Título:** copy LOCKED del UI-SPEC usa solo `{Actividad}`; `dayOfWeek` no se renderiza, por lo que no se agregó mapeo de día (habría dejado una constante sin uso → error de lint). Fallback genérico si falta actividad.
- **comment opcional:** se envía solo si hay texto tras `trim()` (spread condicional), evitando mandar string vacío.

## Deviations from Plan

- **[Rule 3 - Verificación bloqueante] `pnpm typecheck` no existe en el-templo-app.** El plan referenciaba `pnpm typecheck && pnpm lint`. No hay script `typecheck` ni binario `vue-tsc`; `tsc` reporta errores pre-existentes ajenos a este plan. Se sustituyó por `pnpm exec eslint` sobre los archivos del plan (EXIT 0), mismo criterio que 143-02. Sin impacto funcional.

## Known Stubs

None. El dialog se cablea contra los endpoints reales del Plan 02; no hay datos mock ni placeholders.

## Issues Encountered

- Prettier (lint-staged) reformateó el `<p>` del helper a una sola línea durante el commit de Task 2 (cambio cosmético, sin efecto funcional).

## Next Phase Readiness

- Surface 2 completa y montada. Lista para UAT visual (143-UAT): verificar disparo al volver a la app tras clase presencial con profe, estrellas Terracotta, salteable, one-shot, toasts.
- Sin blockers. Recordatorio: no se corre el suite de tests local (corre en CI al pushear a staging).

## Self-Check: PASSED

- FOUND: el-templo-app/src/composables/useRatingsApi.ts
- FOUND: el-templo-app/src/components/RatingPromptDialog.vue
- FOUND: el-templo-app/src/layouts/MainLayout.vue (modificado)
- FOUND: commit 04314501
- FOUND: commit 9a317adc
- grep "Enviar puntuación" = 1; "color=\"primary\"" en QRating = 1; q-dialog sin persistent; profe data = 0; RatingPromptDialog en MainLayout = 2

---

_Phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial_
_Completed: 2026-06-24_
