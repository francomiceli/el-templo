---
phase: 199-rediseno-mi-templo
plan: 10
subsystem: admin-sponsors
tags: [sponsors, admin, partners, reorder, limit, metrics]
requires: [199-08, 199-09]
provides:
  - SponsorsTab (lista por país, orden, activo, vigencia, métricas, límite, alta/edición/borrado)
  - Pestaña "Patrocinadores" en PartnersPage (owner/admin) + atajo "Crear card para Mi Templo" por fila
affects: [199-21]
key-files:
  created:
    - el-templo-admin/src/components/sponsors/SponsorsTab.vue
  modified:
    - el-templo-admin/src/pages/PartnersPage.vue
key-decisions:
  - "El orden se calcula con planReorder (reparte los sortOrder existentes, estrictamente crecientes) en vez de un swap simple: funciona aunque dos marcas empaten sortOrder"
  - "Toggle de activo CONTROLADO (:model-value): si el server rechaza, el interruptor no se mueve (L17)"
  - "Falla de reorden: allSettled + devolver lo ya guardado + recarga del server siempre (L22)"
  - "Sin helper 'solo El Templo' en el admin: visibilidad por rol owner/admin y 403 del API como estado vacío (L21)"
requirements-completed: [D-24, D-25, D-26, D-17]
completed: 2026-10-15
---

# Phase 199 Plan 10: Patrocinadores en Partners Summary

Pestaña "Patrocinadores" en Partners con la lista ordenable por país (AR/ES), activar/desactivar con el mensaje del server si se pasa del límite, vigencia, métricas de socios únicos, límite editable y el editor del plan 09; más el atajo `add_card` en cada fila de partner.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `9ac5a50d6` feat(199-10): admin — SponsorsTab con lista por país, orden, límite, métricas y alta/edición
- Task 2: `dc8e8b12c` feat(199-10): admin — pestaña Patrocinadores en Partners con orden, límite y métricas + atajo desde el partner

## Resultados de verificación

- Task 1: `vue-tsc --noEmit` = 21 errores totales (línea base), 0 en SponsorsTab. Greps: `isForbidden` 2, `arrow_upward|arrow_downward` 2, `updateSettings(` 1, texto "Solo disponible para el equipo de El Templo" 1. PASS.
- Task 2: `vue-tsc` = 21 totales, 0 en PartnersPage/SponsorsTab. `pnpm lint`: 0 errores (8 warnings preexistentes CobrosPage / session-pdf-builder). Greps: `name="patrocinadores"` 2, `add_card` 1, "Crear card para Mi Templo" 1, `canManageSponsors` 4, `activeTab !== 'patrocinadores'` 1. Prettier OK. PASS.
- No se hizo recorrido visual (admin sin runner, sin dev server): queda para el UAT (plan 21).

## Decisiones de implementación

- **Orden (L22):** `move()` arma el nuevo orden del país visible y `planReorder` reparte los valores de `sortOrder` ya existentes sobre él, forzándolos estrictamente crecientes. Con valores distintos equivale al swap con el vecino (2 updates); con empates (dos marcas con el mismo `sortOrder`, que el swap simple no movería) renumera lo mínimo. Se usa `Promise.allSettled`; si alguno falla, se devuelven a su valor anterior los que sí se guardaron (best-effort), se avisa con el mensaje del server y en `finally` siempre se recarga la lista desde el server.
- **Toggle (L17):** `q-toggle` con `:model-value` (no `v-model`) y recarga tras éxito; ante rechazo (límite, contraste, etc.) notify negativo con el mensaje del server y el interruptor queda donde estaba. `togglingId` deshabilita los toggles mientras hay uno en vuelo.
- **Prefill:** el tab guarda una copia local `activePrefill` (se limpia al cerrar el editor) porque el padre anula `sponsorPrefill` al consumirse, antes de que el editor lea `props.prefill` en su watch de apertura.
- **L21:** el admin no tiene helper de "solo El Templo" (búsqueda sin resultados), así que la pestaña se muestra por rol owner/admin y el 403 del API se ve como estado vacío con el texto pedido, sin notify.

## Deviations from Plan

1. **[Menor] Dos commits (uno por task)** en lugar de uno al final de Task 2, para atomicidad por task.
2. **[Menor] `planReorder` en vez de swap literal** del molde de TarjetasTab (ver arriba); misma operación en el caso normal. Cumple `sortOrder` del key_link.
3. **[Menor] `SponsorPrefill` se importa desde `SponsorEditorDialog.vue`** (donde ya se exporta); no se re-exporta desde el tab.
4. **[Menor] Chequeo extra de rango del límite** en el cliente (entero 1-50, botón Guardar deshabilitado si es inválido o no cambió); el server revalida.
5. **Hook de lint-staged:** el hook de husky hizo su backup interno con `git stash` (automático, no manual). Worktree limpio al terminar.

No se encontraron bugs reales en código previo.

## Dudas abiertas (no bloqueantes)

- Reordenar una marca que está en AR y ES cambia su `sortOrder` global, por lo que puede mover su posición también en la otra lista (el `sortOrder` es único por marca, no por país). Si se quiere orden independiente por país, haría falta un campo por país en el API (decisión de modelo, no hecha).
- Un admin de otro tenant ve la pestaña (rol admin) y recién al abrirla el estado "Solo disponible…". Si molesta, ocultar la pestaña requeriría exponer el tenant al admin.
- Sin pre-chequeo de límite en cliente al activar: depende del 400 del server (mostrado al usuario). Se puede agregar un aviso previo con el conteo "Activas AR n/max".

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-31 (`v-if canManageSponsors` + 403 → estado vacío), T-199-32 (el server rechaza, toggle controlado revierte y muestra el mensaje) y T-199-33 (confirmación "Se pierden sus métricas") cubiertos.

## Self-Check: PASSED

- Archivos existen: `SponsorsTab.vue` (creado), `PartnersPage.vue` (modificado).
- Commits `9ac5a50d6` y `dc8e8b12c` presentes; `git status --porcelain` vacío en el worktree.
