---
phase: 213-estiramiento-post-clase
plan: 10
subsystem: app
tags: [vue, sketch, player, clock, stretch, route]
requires:
  - phase: 213
    provides: useSingleBlockPlayer (plan 08), tipos, store, composable de completado y reloj puro (plan 09)
provides:
  - sketch comparativo del reloj (A work_rest vs B por ejercicio) con decision documentada
  - StretchClock (reloj por ejercicio) y stretchClockElapsedMs (ancla al paso a playing)
  - StretchPlayer + StretchDone + ruta training/estirar (stretch-player), sin flag de build
  - prop opcional `copy` en BlockProgressionView / `doneCopy` en StoryExerciseCard
affects: [213-11 card de Mi Templo, 213-12 deep link en frio, 213-13 UAT]
tech-stack:
  added: []
  patterns: [reloj de la rutina anclado a `elapsedSeconds` del paso a playing, textos propios por prop opcional con default null]
key-files:
  created:
    - .planning/phases/213-estiramiento-post-clase/sketch-reloj/index.html
    - .planning/phases/213-estiramiento-post-clase/sketch-reloj/DECISION.md
    - el-templo-app/src/modules/training/components/player/StretchClock.vue
    - el-templo-app/src/modules/training/components/player/StretchDone.vue
    - el-templo-app/src/modules/training/pages/StretchPlayer.vue
  modified:
    - el-templo-app/src/modules/training/utils/stretchSession.ts
    - el-templo-app/src/modules/training/utils/__tests__/stretchSession.test.ts
    - el-templo-app/src/modules/training/utils/playerHeader.ts
    - el-templo-app/src/modules/training/components/BlockProgressionView.vue
    - el-templo-app/src/modules/training/components/player/StoryExerciseCard.vue
    - el-templo-app/src/modules/training/routes.ts
key-decisions:
  - "Reloj elegido: B (por ejercicio). A (work_rest 45/10) dura 7:20 contra 6:50 planificado, no nombra ejercicio ni lado y no distingue cambio de lado de descanso"
  - "BlockProgressionView SI se toca, solo con prop opcional `copy` (default null): en modo libre un bloque STRETCHING pintaba 'Bloque libre', un reloj de bloque que cuenta hacia arriba y 'Hace una elongacion antes de terminar'"
  - "La oferta vencida en el cierre se detecta por el mensaje del servidor ('venció') con una funcion pura testeada, sin tocar useStretchCompletion"
requirements-completed: [SC-3, SC-4, D-07, D-08, D-12]
completed: 2026-11-11
---

# Phase 213 Plan 10: Reloj por ejercicio y StretchPlayer Summary

**Sketch que elige el reloj por ejercicio (B) sobre el de bloque work_rest, `StretchClock` anclado al fin del 3-2-1, y `StretchPlayer` sobre `useSingleBlockPlayer` con pantalla final "Listo. X minutos de estiramiento" y ruta `training/estirar`.**

## Accomplishments

- **Sketch** (`sketch-reloj/index.html`, autocontenido, sin red, x10 para acelerar) con la rutina `W37-lunes-kairos`. Mediciones: A = 8 x 55 s = 7:20 (+30 s sobre los 410 s del servidor, porque mete 10 s tras cada lado); B = 8 x 45 s + 5 x 10 s = 6:50. `DECISION.md` puntua los 5 criterios (A 3/10, B 9/10), motivo, descartes y qué mirar en el UAT.
- **`stretchSession.ts`** (puras, con tests): `stretchClockElapsedMs` (casos a-d del plan + ancla 0 + no finitos), `stretchTotalMs`, `showSideSwitchNotice` (aviso "Cambiá de lado" los primeros 4 s del lado 2), `stretchMinutesLabel`, `stretchClosingPhrase` (3 frases con aflojar/soltar/bajar un cambio, por fecha), `isStretchExpiredMessage`.
- **`StretchClock.vue`**: presentacional; recibe `exercises` y `elapsedMs` ya anclado; nombre ("Ahora: X" en la transición), "Lado X de Y", cuenta `mm:ss` en Cinzel, aviso de cambio de lado de alto fijo, barra de la rutina y "Quedan m:ss de rutina". Emite `segment-change`. No marca ejercicios (D-08).
- **`StretchPlayer.vue`**: `useSingleBlockPlayer` con `save` que manda solo `offerId` y `exercisesCompleted` (el servidor calcula duración y AURA). `clockStartElapsed` se captura en el `@done` del `CountdownOverlay` y se anula en "Reiniciar". `?from=push` envía `push_opened`; `started` con su origen tras cargar. `done` / sin oferta / vencida / falla de carga muestran aviso y botón a Mi Templo. Salida con confirmación "¿Salir del estiramiento?", `cleanup()` de los tres composables en `onUnmounted`.
- **`StretchDone.vue`**: sobre `CelebrationFrame`; "Listo.", "{n} minutos de estiramiento", "+5 AURA" solo con `auraAwarded` de la respuesta, frase propia, botón "Volver a Mi Templo". Sin RPE ni notas.
- **Ruta** `training/estirar` (`stretch-player`, `requiresAuth`, sin flag).

## Task Commits

1. Task 1: `9d09b248f` docs(213-10): sketch del reloj del estiramiento
2. Task 2: `cb4fa27d1` feat(213-10): reloj por ejercicio del estiramiento (StretchClock)
3. Task 3a: `f62e6a611` feat(213-10): prop opcional copy en el player para textos propios del estiramiento
4. Task 3b: `c1710b1b3` feat(213-10): StretchPlayer, pantalla final y ruta training/estirar

## Decisiones del ejecutor

- **Reloj B** con la recomendación de partida del planificador; el sketch la confirmó con números (ver DECISION.md). No hubo checkpoint bloqueante.
- **Integración distinta a lo que daba por hecho el plan:** el plan decía que con `timerSpec: null` "no se pinta el reloj de bloque". Es falso: `blockTimerView(null)` cae en cronómetro (`00:00 Bloque`, cuenta hacia arriba desde el 3-2-1), la fila del formato muestra `stretch`, el encabezado dice "Bloque libre · Stretching" y al marcar todo la tarjeta dice "Bloque completo / Hacé una elongación antes de terminar / Ver resumen". Para un estiramiento eso es incorrecto, y el plan permitía tocar `BlockProgressionView` solo con prop opcional si el sketch lo exigía. Se agregó `copy?: PlayerCopyOverride | null` (kicker, nombre, textos del cierre; con `copy` se oculta la fila de formato/reloj de bloque) en `BlockProgressionView` y `doneCopy?: … | null` en `StoryExerciseCard`; el tipo vive en `playerHeader.ts`. Default `null`: `DayPlayer`, `FreeBlockPlayer` y `GoalPlanSession` no lo pasan y quedan igual.
- **Cierre del estiramiento:** textos "Rutina completa / Marcaste todos los ejercicios. / Terminar" y encabezado "Estiramiento · Post-clase".
- **Vencida en el cierre:** `useStretchCompletion` deja el mensaje del servidor en `error` (el 410 trae "Este estiramiento ya venció"); la página lo detecta con `isStretchExpiredMessage` (pura, testeada), hace `leaveWithoutSaving()` y muestra "Este estiramiento ya no está disponible…". Otra falla: `$q.notify` y el composable vuelve a `playing`. Un 404 al cerrar cae en la rama de falla genérica.
- **Falla de carga sin dato** (`loadFailed` y `today` nulo): mensaje propio "No pudimos cargar el estiramiento. Probá de nuevo en un rato." (el plan solo contemplaba el caso sin oferta).
- **`segment-change`:** no hay helper háptico en el módulo, así que la página no escucha el evento (no se agregaron plugins).
- **Layout:** `StretchClock` va arriba del player (tarjeta oscura continua con el área de video) y `BlockProgressionView` ocupa el resto. Queda la flecha atrás debajo de la tarjeta: punto 2 de la lista del UAT en `DECISION.md`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Textos de entrenamiento y reloj duplicado en el player de estiramiento**
- **Found during:** Task 3 (inspección de `BlockProgressionView` / `StoryExerciseCard` en modo libre)
- **Issue:** ver "Decisiones del ejecutor"; el plan asumía que `timerSpec: null` bastaba.
- **Fix:** prop opcional `copy` / `doneCopy` con default `null`.
- **Files modified:** `BlockProgressionView.vue`, `StoryExerciseCard.vue`, `playerHeader.ts`
- **Commit:** `f62e6a611`

**2. [Rule 2 - Missing critical] Helpers de texto/tiempo extra en `stretchSession.ts`** (`stretchTotalMs`, `showSideSwitchNotice`, `stretchMinutesLabel`, `stretchClosingPhrase`, `isStretchExpiredMessage`) para cumplir la regla del plan "lógica nueva de tiempo va a `stretchSession.ts` con test, nunca al `.vue`". Commits `cb4fa27d1` y `c1710b1b3`.

## Verificaciones

Corridas localmente (foreground):
- `vitest run src/modules/training`: 28 archivos, 396 tests verdes (incluye `stretchSession` 35 tests, `useSessionPlayer.freeBlock`, `useFreeBlockCompletion`, `useSingleBlockPlayer` y `playerHeader`).
- Mutación de sanidad: sin el `Math.max(0, …)` de `stretchClockElapsedMs` fallan exactamente (a), (b) y (d); restaurado y verde.
- `pnpm lint` app: 0 errores (2 warnings preexistentes en `axios.ts` y `useSessionPlayer.ts`).
- `vue-tsc --noEmit`: 21 errores, igual que el baseline; ninguno en archivos tocados.
- Verify automatizado de las tareas 1 y 3 (greps: ruta, `useSingleBlockPlayer`, `push_opened`, `clockStartElapsed`, textos prohibidos, `StretchClock`) OK; `DayPlayer.vue` sin cambios; sketch sin `http(s)://`.

No corridas:
- **El sketch y el player no se abrieron en un navegador**: no hay Chrome/Chromium en el entorno (el de Playwright apunta a `/opt/google/chrome`). El script del sketch se validó solo por parseo de JS; los números (410 s / 440 s) salen de las cuentas, no de una captura. Hay que mirarlo en el UAT.
- Sin test de componentes (la app no tiene entorno DOM para `.vue`): `StretchPlayer`, `StretchClock` y `StretchDone` están cubiertos por la lógica pura + typecheck + lint, no por un montaje.
- Flujo real (3-2-1 → reloj → marcar → cierre → card) contra la API: no corrido; lo cubre el UAT del plan 13.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-213-30 (`from=push` solo mide apertura), T-213-31 (la pantalla usa `minutes` y `auraAwarded` de la respuesta; el cliente no manda duración) y T-213-32 (sketch sin red, verificado con grep) quedan como en el plan.

## Notas para los planes siguientes

- La card de Mi Templo (plan 11) debe navegar a `{ name: 'stretch-player' }` (o `/training/estirar`); el push abre `/training/estirar?from=push` (plan 12 cubre el arranque en frío).
- `StretchPlayer` no usa `lastResult` más allá de la pantalla final: la card se actualiza porque `useStretchCompletion.complete` ya aplica `applyCompletion` al store.
- Pendiente de decisión para el UAT: si el reloj termina y falta marcar algún ejercicio, solo se puede salir sin guardar (el cierre exige todos marcados, como Libre).

## Self-Check: PASSED

- Archivos creados verificados: sketch `index.html`, `DECISION.md`, `StretchClock.vue`, `StretchDone.vue`, `StretchPlayer.vue`.
- Commits `9d09b248f`, `cb4fa27d1`, `f62e6a611`, `c1710b1b3` presentes en `git log`.
