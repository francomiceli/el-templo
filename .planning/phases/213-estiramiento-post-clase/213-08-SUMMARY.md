---
phase: 213-estiramiento-post-clase
plan: 08
subsystem: app
tags: [refactor, characterization-tests, composables, vitest, free-block, player]
requires:
  - phase: 197
    provides: FreeBlockPlayer, useSessionPlayer en modo freeBlock, useFreeBlockCompletion
provides:
  - useSingleBlockPlayer (D-07): etapas, puente player->vista, 3-2-1, marcado, reinicio, cierre con rollback, salida sin guardar, cleanup()
  - 34 tests de Vitest (entorno node, sin dependencias nuevas) que fijan el comportamiento de Libre
  - FreeBlockPlayer migrado al composable (439 -> 368 lineas)
affects: [213-10 StretchPlayer reusa useSingleBlockPlayer, 213-09 Session sintetica de estiramiento]
tech-stack:
  added: []
  patterns: [caracterizacion antes de extraer, guardado y hasSavedRun inyectados (la pagina pone endpoint y textos), player falso con refs + vi.fn para testear el composable sin Pinia/Capacitor]
key-files:
  created:
    - el-templo-app/src/modules/training/composables/useSingleBlockPlayer.ts
    - el-templo-app/src/modules/training/composables/__tests__/useSingleBlockPlayer.test.ts
    - el-templo-app/src/modules/training/composables/__tests__/useSessionPlayer.freeBlock.test.ts
    - el-templo-app/src/modules/training/composables/__tests__/useFreeBlockCompletion.test.ts
  modified:
    - el-templo-app/src/modules/training/pages/FreeBlockPlayer.vue
key-decisions:
  - "Orden de la regla de oro respetado: commit de caracterizacion (1e292b4a3) con produccion intacta, despues el composable, despues la pagina; los 2 archivos de caracterizacion no cambiaron ni una asercion en la migracion"
  - "El aviso negativo 'No pudimos guardar el bloque. Probá de nuevo.' vive en el save de la pagina (con chequeo isDisposed) y no en el composable: asi completeBlock() devuelve null tambien para los no-op (ya guardando, sin player) sin avisos falsos"
  - "La etapa 'loading'->'countdown' la maneja load(): una sola autopartida por instancia, igual que el flag autoStarted original"
requirements-completed: [SC-4, D-07]
duration: 30min
completed: 2026-11-11
---

# Phase 213 Plan 08: useSingleBlockPlayer extraido de FreeBlockPlayer Summary

**Abstraccion `useSingleBlockPlayer` (D-07) extraida de `FreeBlockPlayer.vue` con red de seguridad: 18 tests de caracterizacion escritos y en verde contra el codigo anterior, 16 tests del composable y la pagina migrada con los mismos textos, destinos y payload de guardado.**

## Performance

- **Tasks:** 3/3
- **Files:** 4 creados, 1 modificado
- Tests de la app: 34 en los 3 archivos de la tarea, todos verdes (corridos local, foreground)

## Commits

| Tarea | Commit | Mensaje |
| ----- | ------ | ------- |
| 1 | `1e292b4a3` | test(213-08): caracterización de useSessionPlayer freeBlock y useFreeBlockCompletion |
| 2 | `b1ac9ae52` | feat(213-08): useSingleBlockPlayer, abstracción compartida del player de un bloque (D-07) |
| 3 | `f054d2196` | refactor(213-08): FreeBlockPlayer usa useSingleBlockPlayer sin cambiar Libre |

## Que quedo en cada lado

- **Composable:** `stage`, Session de 1 bloque + `useSessionPlayer(s, { freeBlock: true })` (inyectable con `createPlayer`), puente `playableBlocks`/`activeBlockIndex`/`completedBlocks`/`elapsedSeconds`/`allCompletedExercises`, `needsExitConfirm`, `load`, `beginBlock`, `onCountdownDone`, `toggleExercise`, `restart`, `completeBlock` (con rollback a `playing` y reloj relanzado), `keepTraining`, `leaveWithoutSaving`, `confirmExit`, `markMissing`, `setStage`, `isDisposed`, `cleanup`. Sin `onUnmounted`, router ni Quasar.
- **Pagina:** origen del bloque y `buildSyntheticSession`, `saveBlock` (POST a `/sessions/free-blocks/complete` por `useFreeBlockCompletion`, con `completionId`, `lastResult`, `savedExerciseIds`, `awardedInRun` y el `$q.notify`), diálogos (`exitDialogOpts`, reiniciar), `onBeforeRouteLeave`, `goToLibre`, `wakeLock.initialize/cleanup`, `completion.cleanup`.
- `FreeBlockPlayer.vue`: 439 -> 368 lineas (el `<template>` y los estilos no se tocaron).

## Caracterizacion: lo que quedo fijado del codigo ACTUAL

- `useSessionPlayer({ freeBlock: true })`: 1 bloque jugable aunque sea DEUTEROS, sin eleccion ni con progreso en indice 2 (contraste: sin la opcion pide eleccion y no hay nada jugable).
- `startAnotherRound`: reinicia indice, bloques completados y ejercicios (memoria y store) pero CONSERVA el reloj y lo deja corriendo.
- `clearProgress` pausa el reloj y pone `elapsedSeconds` en 0; `initialize` sobre progreso guardado lo recupera (por eso la pagina llama `clearProgress` antes) e `initialize` es idempotente.
- `completeBlock` con 1 bloque: agrega el rol, no avanza el indice y pausa el reloj (`isSessionComplete`).
- `useFreeBlockCompletion`: exito, nivel del store solo si el pedido no trae uno, 4xx esperado -> `warn`, 5xx/red -> `error`, segundo envio en vuelo -> `null` sin pegarle a la API, `cleanup`.

## Deviations from Plan

### Hallazgos menores (sin cambio de comportamiento)

**1. [Tarea 3] El log `Bloque libre listo` ahora sale despues del arranque, no antes**
- En el original salia entre `initialize` y `beginBlock`; ahora `load()` hace las tres cosas y la pagina loguea al volver. Es solo un log `info`; sin efecto funcional.

**2. [Tarea 2] El test del composable necesito que `hasSavedRun` lea un `ref`**
- `needsExitConfirm` es un `computed`: en la pagina `hasSavedRun` lee `completionId.value` (reactivo); el primer intento del test usaba un objeto plano y el computed quedaba cacheado. Fue un error del test, no del codigo; el harness ahora usa `ref`.

**3. [Tarea 1] `Block.mobilityExercise` es obligatorio en el tipo**
- `vue-tsc` lo marco en el primer fixture del test; se agrego `mobilityExercise: null`. Total de errores de `vue-tsc` quedo en la baseline (21).

Ninguna regla de desvio 1-3 sobre codigo de produccion: el plan se ejecuto como estaba escrito.

## Decisiones tomadas en ejecucion

- `completeBlock()` toma el rol de `session.blocks[0]` (la Session de Libre/estiramiento siempre es de un solo bloque) en vez de recibir el bloque de la pagina.
- Se mantuvo la guarda de doble cierre solo por `stage === 'saving'` (igual que el original): hay una ventana minima durante el `await` de `player.completeBlock()` en la que un segundo toque pasaria; no se agrego un flag nuevo para no cambiar el comportamiento de Libre. Anotado por si el player de estiramiento lo quiere endurecer.
- Si el composable se destruye mientras guarda, `completeBlock()` devuelve `null` sin tocar la etapa ni el wake lock; la pagina tampoco muestra aviso (`isDisposed()` en `saveBlock`).

## Verificaciones

| Verificacion | Resultado |
| ------------ | --------- |
| vitest: 3 archivos (`useSessionPlayer.freeBlock`, `useFreeBlockCompletion`, `useSingleBlockPlayer`), 34 tests | verde, foreground |
| Archivos de caracterizacion sin cambios entre tarea 1 y tarea 3 (`git diff` vacio) | OK |
| Produccion intacta tras la tarea 1 (`useSessionPlayer.ts`, `useFreeBlockCompletion.ts`, `FreeBlockPlayer.vue`) | OK |
| `pnpm lint` app | 0 errores (2 warnings preexistentes: `Capacitor` en `boot/axios.ts`, `watch` en `useSessionPlayer.ts`) |
| `vue-tsc --noEmit` app | 21 errores = baseline; 0 en `FreeBlockPlayer.vue`, `useSingleBlockPlayer.ts` y los 3 tests |
| grep: sin `onUnmounted`/`onBeforeRouteLeave`/`useRoute(`/`useQuasar`/`console.`/`any` en el composable (sin comentarios) | OK |
| Textos de Libre en la pagina ("No pudimos guardar el bloque. Probá de nuevo.", "¿Salir del bloque libre?", `goToLibre`) | presentes |
| `useSessionPlayer(` en `FreeBlockPlayer.vue` | 0 |
| Recorrido real de Libre en dispositivo (3-2-1, guardar, seguir entrenando, salir) | NO corrido: Libre esta apagado por `FREE_BLOCKS_ENABLED`; lo cubren los tests de composable + `vue-tsc` + el UAT del plan 13 |

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: refactor de cliente, mismo endpoint y mismo payload (T-213-26 mitigada por caracterizacion antes y despues; T-213-SC sin dependencias nuevas).

## Lecciones para los planes siguientes

- Para testear un composable que importa `useSessionPlayer`, hay que `vi.mock('../useSessionPlayer')` o el import arrastra Pinia/`@capacitor/preferences` al entorno node. Para testear `useSessionPlayer` mismo, mockear el modulo del store (`../../stores/sessionPlayerStore`) con un fake en memoria (`vi.hoisted` + `vi.fn`).
- `needsExitConfirm` es un `computed`: lo que le pasen como `hasSavedRun` tiene que leer un `ref`, o el computed no se entera.
- `useWakeLock().requestWakeLock` devuelve `Promise<boolean>`: un wake lock falso tiene que devolver `true` o `vue-tsc` falla.
- Plan 10 (`StretchPlayer`): llamar `useSingleBlockPlayer<R>({ wakeLock, save, hasSavedRun })`; `createPlayer` es opcional (por defecto modo bloque libre del `useSessionPlayer`); el aviso de error de guardado va dentro del `save` de la pagina; `cleanup()` en el `onUnmounted` de la pagina.

## Self-Check: PASSED

Archivos y commits verificados (ver abajo).
