---
phase: 203-carga-sin-parpadeos
plan: 12
subsystem: app-progression-mi-templo
status: complete
completed: 2026-10-28
requirements: [SC-2, D-01, D-02, D-07, D-16, D-17]
commits: [2052c35da, 3d64a2082]
key-files:
  modified:
    - el-templo-app/src/stores/useNovedadesStore.ts
    - el-templo-app/src/stores/useSponsorsStore.ts
    - el-templo-app/src/stores/useAvisosStore.ts
    - el-templo-app/src/modules/progression/stores/progressionStore.ts
    - el-templo-app/src/modules/progression/composables/useProgressionApi.ts
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
    - el-templo-app/src/layouts/MainLayout.vue
  created:
    - el-templo-app/src/modules/progression/stores/__tests__/progression-store-loaded.test.ts
    - el-templo-app/src/modules/progression/composables/__tests__/progression-api-stats.test.ts
  tests-extended:
    - el-templo-app/src/stores/__tests__/novedades-store.test.ts
    - el-templo-app/src/stores/__tests__/sponsors-store.test.ts
    - el-templo-app/src/stores/__tests__/avisos-store.test.ts
---

# Phase 203 Plan 12: banderas "respondió" / "respondió bien" en las fuentes de Mi Templo (SUMMARY)

Novedades, patrocinadores, tarjetas de "Para vos", stats y check-ins ahora dicen cuándo respondieron por primera vez (aun con error, fail-open) y si respondieron bien (para distinguir vacío de falló). Los dos `TODO(203-12)` de `MiTemplo.vue` quedaron reemplazados por `!progressionStore.statsLoaded` y `progressionStore.statsFailed`. El toast de stats (D-16) sigue intacto.

## Qué quedó

### Task 1 (`2052c35da`): novedades, sponsors, tarjetas
- `useNovedadesStore` y `useSponsorsStore`: `loaded` (sube en el `finally` si `mine === generation`, nunca vuelve a false salvo `reset()`) y `lastLoadOk` (`true` tras el 2xx, `false` en el catch de la generación vigente, `null` al inicio y tras `reset()`). Una respuesta o error de una generación vieja (logout a mitad, `load()` superado) no los toca (T-203-27). `loading`, `generation` y el resto del return siguen igual.
- `useAvisosStore`: `tarjetasSettled` y `tarjetasOk`. `tarjetasLoaded` queda con su semántica y valores de siempre (se prende antes del `await`; el diff no lo cambia). `loadTarjetas()` marca `ok` y, después del try/catch, `tarjetasOk`/`tarjetasSettled`. `reset()` los baja.

### Task 2 (`3d64a2082`): progressionStore
- Estado nuevo: `statsLoaded`, `statsOk`, `checkInSettled`, `checkInOk`; computed `statsFailed = statsOk === false && stats === null`; acción `markStatsSettled(ok)`. Todo exportado y bajado en `reset()`.
- `setCheckInState` -> `checkInSettled = true`, `checkInOk = true`. `setCheckInError(msg)` con `msg !== null` -> `checkInSettled = true`, `checkInOk = false` (`setCheckInError(null)` solo limpia el mensaje y no cuenta como respuesta).
- `useProgressionApi.fetchStats()`: `markStatsSettled(true)` tras `setProgressionData`; `markStatsSettled(false)` en el catch, que conserva `setError` + `Notify.create({ type: 'negative' })` (D-16) y NO borra `stats`/`todaySession` (ya no lo hacía). `useCheckInApi` sin cambios (ya pasaba el mensaje a `setCheckInError`).
- `MiTemplo.vue`: `statsLoading: !progressionStore.statsLoaded`, `statsFailed: progressionStore.statsFailed`. `grep -c 'TODO(203-12)'` = 0.

## Tests escritos SIN correr (D-17) — los corre el orquestador

1. `el-templo-app/src/stores/__tests__/novedades-store.test.ts` (describe nuevo: loaded/lastLoadOk, durante el pedido, vacío vs error, refresco, reset a mitad con éxito y con error, load superado, reset)
2. `el-templo-app/src/stores/__tests__/sponsors-store.test.ts` (mismo bloque)
3. `el-templo-app/src/stores/__tests__/avisos-store.test.ts` (describe nuevo: tarjetasSettled/tarjetasOk, "pedido" vs "respondió", vacío vs error, una llamada por apertura, reset, reset a mitad)
4. `el-templo-app/src/modules/progression/stores/__tests__/progression-store-loaded.test.ts` (NUEVO, 15 casos, Pinia sin mocks: primera carga fallida, refresco fallido con stats previas, éxito posterior, reset, check-ins)
5. `el-templo-app/src/modules/progression/composables/__tests__/progression-api-stats.test.ts` (NUEVO, no pedido por el plan: mockea `quasar` y `src/boot/axios`; fija que el toast negativo sigue en el catch, que el refresco fallido conserva las stats y que `loading` sube sin tocar `statsLoaded`)

Los tests leen solo lo que cada store devuelve en su `return` (lección del plan 04). Prettier y eslint pasaron sobre todos los archivos tocados. `vue-tsc` no se corrió.

## Deviations from Plan

**1. [Rule 2 - bug] `progressionStore.reset()` nunca se llamaba (ni en el logout).** Con `statsLoaded` esto pasaba de "datos viejos del socio anterior" a "banderas de otro socio": el segundo socio de la misma sesión entraría con `statsLoaded = true` y las stats del anterior. Se agregó `progressionStore.reset()` en la rama de logout del watch de `MainLayout.vue` (junto a `avisosStore.reset()`, `novedadesStore.reset()`, etc.). Archivo fuera de `files_modified` del plan. Limitación: no hay guard de generación en `fetchStats`/`fetchTodayCheckIns`; una respuesta en vuelo durante el logout podría repoblar el store tras el reset (ventana mínima, no se tocó).

**2. [Diseño] Guard de generación en `loadTarjetas` solo para las banderas nuevas.** `useAvisosStore` no tenía guard. Se agregó un contador local `tarjetasGeneration` que `reset()` incrementa: una respuesta anterior al reset no marca `tarjetasSettled`/`tarjetasOk`. NO se guardó la escritura de `tarjetas` (comportamiento existente, aditivo según las reglas del plan): una respuesta tardía tras logout aún puede escribir `tarjetas` del socio anterior. Bug preexistente, fuera de alcance.

**3. [Extra] Test de composables `progression-api-stats.test.ts`** no figura en el plan; cubre D-16 y "refresco fallido conserva stats", que el test del store no puede ver.

## Riesgos antes del plan 13

- **`statsOk` es el resultado de la ÚLTIMA respuesta**, no de "alguna vez bien". Tras un refresco fallido con stats previas, `statsOk === false` aunque `stats` sea válido (por eso `statsFailed` mira también `stats === null`). Para el `record()` del flag D-02 ("tuvo contenido", solo tras 2xx) hay que usar el valor justo después de la respuesta: `*Ok === true` (`lastLoadOk`, `tarjetasOk`, `statsOk`, `checkInOk`), nunca solo `*Loaded/*Settled`, y nunca tras un fail-open que devolvió null.
- **El template de `MiTemplo.vue` sigue reemplazando TODA la página** por el loader cuando `progressionStore.loading` y por el bloque "Error" cuando `progressionStore.error` (líneas 4 y 10). `loading` arranca en false y se prende en cada visita (contenido -> loader -> contenido, C-6) y `error` no se limpia al empezar un `fetchStats`; además un refresco fallido con stats buenas deja `error` seteado y tapa la página. Es del plan 13: pasar el template a `statsLoaded` y que el error de stats no oculte el resto de la página (la card ya tiene `statsFailed`).
- **`checkInOk` también refleja la última respuesta:** tras un refresco fallido queda `false` con `checkInState` previo intacto (el store no lo borra). `setCheckInError` es llamado hoy solo por `fetchTodayCheckIns`.
- **`SessionSummaryPage.vue` usa `progressionStore.loading` y `stats`** (y MainLayout `evaluationEligible`): no se tocó nada, el cambio es aditivo.
- **`tarjetas` con fail-open:** las 4 fijas tienen copy hardcodeado de fallback, así que `tarjetasOk === false` no implica carrusel vacío; el plan 13 decide si cuenta como "tuvo contenido" (no debería escribir el flag tras un error).
- Tipado sin compilador y tests sin correr (D-17): primera corrida real en el orquestador. En los tests, `mockReturnValue(promise as never)` evita el tipo de `api.get`; si el typecheck lo marca, cambiar por `mockImplementation(() => promise as never)`.

## Known Stubs

Ninguno (los dos `TODO(203-12)` del plan 11 quedaron resueltos).

## Threat Flags

Ninguno. T-203-27 mitigado (guard de generación protege `loaded`/`lastLoadOk`/`tarjetas*`; `reset()` los baja; el progressionStore ahora se resetea al logout). T-203-28 mitigado (las banderas suben siempre en `finally`/catch/ambas ramas de `fetchStats`).

## Self-Check: PASSED

- Commits `2052c35da` y `3d64a2082` presentes en `feat/203-carga-sin-parpadeos`; nada commiteado en el checkout principal; `.planning/STATE.md` y `ROADMAP.md` sin tocar.
- Greps de `<verify>` de ambas tareas OK; `grep -nE 'stats\.value = null|setProgressionData\(null'` sobre `useProgressionApi.ts` sin resultados; sin `any` ni `console.*`.
