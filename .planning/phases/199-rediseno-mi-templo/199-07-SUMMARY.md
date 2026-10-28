---
phase: 199-rediseno-mi-templo
plan: 07
subsystem: api-communications-app-novedades
tags: [novedades, avisos-popup, d-13, d-08, source-key]
requires: [199-06]
provides:
  - GET /communications/me/novedades con avisos pop-up activos primero (source/key)
  - PromptService.listPopupAvisosForFeed (fuente unica de "aviso vigente")
  - App: store y NovedadesCard con clave compuesta source:id
affects: [199-20]
key-files:
  created:
    - el-templo-api/test/communications/novedades-popup.test.ts
  modified:
    - el-templo-api/src/modules/communications/prompt-service.ts
    - el-templo-api/src/modules/communications/novedades-service.ts
    - el-templo-api/src/modules/communications/schemas.ts
    - el-templo-api/test/communications/novedades.test.ts
    - el-templo-app/src/stores/useNovedadesStore.ts
    - el-templo-app/src/modules/progression/components/NovedadesCard.vue
    - el-templo-app/src/stores/__tests__/novedades-store.test.ts
key-decisions:
  - "Una sola fuente: el feed lee avisos pop-up en vivo, sin filas en novedades"
  - "Vigencia/alcance del espejo = exactamente los del pop-up (loadPopupCandidates + avisoWithinVigencia + matchesScope compartidos), sin frecuencia"
  - "seen del espejo = clicked en aviso_events; shown/dismissed no apagan el NUEVO"
  - "markSeen de un aviso es solo local; markClicked postea clicked a aviso_events"
requirements-completed: [D-13, D-08]
completed: 2026-10-15
---

# Phase 199 Plan 07: Avisos pop-up como primera novedad (D-13) Summary

Un aviso pop-up activo que matchea al socio aparece tambien como primer item de Novedades (NUEVO, mismo destino), aunque haya cerrado el modal. El modal no cambia.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `e9c75dc17` feat(199-07): los avisos pop-up activos aparecen primero en Novedades (una sola fuente, D-13)
- Task 2: `4551bb20c` feat(199-07): app — novedades con clave source:id, espejo de aviso con eventos en aviso_events

## Que se implemento

API

- `prompt-service.ts`: `loadPopupCandidates(ctx)` (query de candidatos extraida, la usan `resolveAvisoVigente` y `listPopupAvisosForFeed`); `avisoWithinVigencia` exportada (reemplaza el metodo privado `withinVigencia`, tambien usada por `listTarjetas`); `listPopupAvisosForFeed(ctx, userId)` = candidatos + vigencia (`todayInTz(AR)`) + `matchesScope`, SIN `frequencyAllows` (L14). `getMemberScopeInfo` suma `branchName`.
- `novedades-service.ts`: `NovedadMemberItem` con `source`/`key`; `listForMember` = `[...espejos, ...novedades].slice(0, 3)`; `loadAvisoMirrors` (fail-open con `warn`) hace UNA query a `aviso_events` (`tenantWhere`, `clicked`, `inArray`); `toAvisoMirrorItem` (`text = title`, `branchLabel` = sede del socio solo si el aviso tiene `scopeBranchIds`, `publishedAt` = `startsOn` medianoche UTC o `createdAt`, destino resuelto igual que el pop-up). Early return solo si no hay ni novedades ni espejos.
- `schemas.ts`: `source` (enum) y `key` en el response schema del feed (L9: sin esto Fastify los recorta).

App

- `useNovedadesStore`: `Novedad` con `source`/`key`; normalizacion en `load()` (API vieja cae a `novedad:<id>`); `reportedSeen: Set<string>`; `markSeen(item)` / `markClicked(item)`; aviso => seen solo local, clicked => `POST /communications/me/avisos/:id/event`.
- `NovedadesCard.vue`: `:key="item.key"`, `newIds` por clave, `isNew(item)`, watchers por `key`. Sin cambios visuales.

## Tests

API (`novedades-popup.test.ts`, 21 `it`, NO corridos local, CI): (a) aviso primero + mismo destino que el modal; whatsapp_sales con texto por defecto; novedades con `source/key`; aviso+novedad no se pisan; (b) 3 novedades + aviso = 3 con el aviso primero; varios avisos por sortOrder con tope 3; (c) alcance de sede (otra sede no, la propia si con `branchLabel`), pais ajeno; (d) pausado/borrador/tarjeta; (e) `endsOn` ayer AR no / hoy AR si (con `addDays(todayInTz(AR))`), `startsOn` mañana no / hoy si y su `publishedAt`; (f) codes orquestados activos no aparecen; (g) frecuencia "una vez" + `shown` + `dismissed`: el modal ya no lo trae y el feed si, `seen:false`; (h) `clicked` => `seen:true`, queda en `aviso_events` y 0 filas en `novedad_views`, no afecta a otro socio ni a una novedad; (i) cross-tenant en ambos sentidos y 404 al reportar clicked sobre aviso ajeno; (j) `/me/prompt` sigue devolviendo el aviso.
`novedades.test.ts`: interfaz `MemberNovedad` con `source/key`, una asercion `toMatchObject` de `source/key`, y limpieza de avisos custom en `beforeEach` (ver desviacion 1).

App (corridos aca porque CI no corre vitest de app): `npx vitest run src/stores/__tests__/novedades-store.test.ts` => 20/20 verdes (1 fallo inicial de mi propio test, ver abajo).

## Verificaciones

- API `npx tsc --noEmit`: 0. `pnpm lint:tenant`: `DISCREPANCIAS: 0`. `typecheck:tests`: 0 lineas con `test/communications/novedades`.
- App `vue-tsc --noEmit`: 18 errores totales (base), 0 en `useNovedadesStore`/`NovedadesCard`/`novedades-store`. `pnpm lint`: 0 errores (2 warnings preexistentes ajenos).
- Greps de aceptacion: `listPopupAvisosForFeed(` en novedades-service = 1; `frequencyAllows` en novedades-service = 0; `loadPopupCandidates` en prompt-service = 3; `enum: ["novedad", "aviso"]` = 1; `dateOffsetStr|todayStr` en el test = 0; `"shown"` = 2; `ORCHESTRATED_POPUP_CODES` y `todayInTz(` presentes; app: `:key="item.key"` = 1, `:key="item.id"` = 0, `me/avisos/` en el store = 1, `Set<string>` = 1.
- Worktree limpio.

## Deviations from Plan

1. **[Menor, Rule 2] Limpieza de avisos custom en `novedades.test.ts`.** `avisos` no esta en `TABLES_TO_CLEAN`; si otro archivo deja un aviso pop-up custom activo, el feed ahora lo mezcla y rompe las aserciones de `novedades.test.ts`. Se agrego un `DELETE ... WHERE kind <> 'system'` en el `beforeEach` (mismo patron que `avisos-admin.test.ts`). El plan decia "no cambiar otras aserciones": no se toco ninguna.
2. **[Menor] Tipos del store.** Se agrego `NovedadFromServer` (source/key opcionales) para modelar la API vieja y `normalize()`; `Novedad` queda con ambos obligatorios.
3. **[Menor] Test (g):** se afirma que el modal ya no devuelve ESE aviso (`aviso.id !== avisoId`) en vez de `prompt === null`, porque con un socio nuevo puede tocar el escalon de `improvement_prompt`.
4. **[Menor] Prettier de lint-staged/manual** reformateo `sales-number.ts` al correr prettier sobre `src/modules/communications/*.ts`; se revirtio con `git checkout -- <ese archivo>` antes de commitear (no queda en el diff).
5. Un test mio del store fallo en la primera corrida (despues de `reset()` la lista esta vacia y `byKey` no encontraba el item); se corrigio recargando el feed (comportamiento de nueva sesion real).

No se encontraron bugs reales en codigo previo.

## Dudas abiertas (no bloqueantes)

- El destino `whatsapp_sales` de un espejo no trae `whatsappNumber` (el feed de novedades nunca lo trajo; el pop-up si, via `resolveSalesNumberForUser`). Hay que confirmar en UAT como resuelve el numero `navigateToAvisoDestination` para novedades de WhatsApp. Si falta, es un cambio chico en `toAvisoMirrorItem` (o un plan aparte).
- `publishedAt` del espejo es `startsOn` (medianoche UTC) o `createdAt`: el "hace N dias" de un aviso sin `startsOn` cuenta desde su creacion, no desde que se activo.
- Primera corrida en CI de `novedades-popup.test.ts`: riesgos solo de runtime (inserts de `avisos` con `scopeCountries`, `seedSecondTenant` junto con la limpieza de avisos).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-23 (alcance + `tenantWhere(avisos)` + `tenantWhere(avisoEvents)`, tests de sede ajena y cross-tenant), T-199-24 (la app solo postea `clicked` del espejo, nunca `shown`) y T-199-25 (interpolacion `{{ }}`, sin `v-html`) mitigados.

## Self-Check: PASSED

- `novedades-popup.test.ts` existe; commits `e9c75dc17` y `4551bb20c` en `git log`; `git status --porcelain` vacio en el worktree.
