---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 17
subsystem: app-training
tags: [player, bloque-libre, pagina, ruta]
requires: ["197-16"]
provides:
  - ruta free-block-player (training/libre/:blockId)
  - pages/FreeBlockPlayer.vue (orquestador del modo bloque libre)
affects: [197-18, 197-20]
key-files:
  created:
    - el-templo-app/src/modules/training/pages/FreeBlockPlayer.vue
  modified:
    - el-templo-app/src/modules/training/routes.ts
requirements: [D-12, D-13, D-15]
---

# Fase 197 Plan 17: Página del bloque libre — Summary

`FreeBlockPlayer.vue` une el player en modo libre (197-15), las tres pantallas propias (197-16) y el store/composable de cierre (197-14): carga → inicio → 3-2-1 → en curso → guardado → celebración → resumen, con "Seguir entrenando" actualizando la misma fila (`completionId`). Ruta `training/libre/:blockId` (`free-block-player`).

## Commits

- `30df6a130` feat(197-17): ruta y player del bloque libre (inicio, en curso, salida sin guardar)
- `99e7e8d49` feat(197-17): cierre, celebración y resumen del bloque libre (D-12)

## Qué se hizo

- Estados explícitos `loading | missing | splash | countdown | playing | saving | celebration | summary`. `fetchBlock` null → "Este bloque ya no está disponible." + "Volver a Libre".
- Session sintética `XB-{blockId}` (`blocks: [{ ...item, sortOrder: 0 }]`), `useSessionPlayer(s, { freeBlock: true })`, `clearProgress()` + `initialize()` al entrar (cada entrada empieza de cero).
- Salida (botón atrás, Splash "Volver", `onBeforeRouteLeave`): confirmación "¿Salir del bloque libre?" / "Si salís ahora, el bloque no se guarda." solo en `countdown`/`playing` sin `completionId`; con fila guardada o en pantallas previas sale directo. Siempre `pauseTimer` + `clearProgress` + liberar wake lock. `saving` bloquea la salida.
- Cierre: `completeBlock()` (pausa) → `saving` → `completion.complete({ blockId, startedAt, exercisesCompleted, completionId? })`. Error → notify negativo "No pudimos guardar el bloque. Probá de nuevo.", el reloj sigue y vuelve a `playing`. Éxito → celebración con `lastResult.auraAwarded` (T-197-39), resumen con `durationSeconds` del servidor, `awardedInRun`, `canEarnAura` (`auraAvailableToday && !awardedInRun && duración < 600`) y `dayLabel = dayKicker(hoy, '')` (hoy en la zona de la sede).
- "Seguir entrenando" → `startAnotherRound()` + wake lock → `playing` (sin 3-2-1, el reloj sigue). "Listo" / "Elegir otro bloque" (`setGroup(null)`) → `router.push({ name: 'training', query: { tab: 'libre' } })`.
- Barrita de AURA: `auraGoalSeconds = auraAvailableToday ? 600 : null`. Sin `weekStore`, `useSessionCompletion`, `useExerciseAdjustment`, `registerMidSessionGuard`, RPE, notas ni "Repetir".
- `onUnmounted` de la PÁGINA llama `player.cleanup()`, `wakeLock.cleanup()`, `completion.cleanup()`.

## Verificación (estática)

Ambos `<verify>` del plan imprimen `OK` (el de la tarea 2 se corrió a mano por la lista de tokens). Higiene limpia: sin `console.`, `any`, `color: rgba(`/`$grey` y sin `??` mezclado con `||`/`&&`; ninguna línea > 100 columnas; llaves y paréntesis del `<script>` balanceados. Sin typecheck/tests locales.

## Desvíos/decisiones

- **`startedAt` derivado del reloj**: se manda `now - elapsedSeconds` en el momento de guardar (en vez de la hora del tap en el Splash) para que la duración del servidor (`now - startedAt`) coincida con el reloj/barrita que ve el socio y no cuente el 3-2-1 ni pausas. En la vuelta con `completionId` el servidor usa el `startedAt` guardado (por diseño del 197-05/14), así que ahí la duración incluye el tiempo en celebración/resumen — ver "Para el orquestador".
- **"Reiniciar"** (no está en el plan): sin fila guardada recrea el player (porque `clearProgress` no pone en cero `accumulatedSeconds`, ver abajo) y vuelve al Splash; con fila guardada reinicia la vuelta con `startAnotherRound()`.
- **Ejercicios en el resumen**: `savedExerciseIds` une los de todas las vueltas guardadas (el servidor también los une), así el tildado no se pierde tras "Seguir entrenando".
- Error de red de `fetchBlock` (no 404) también cae en el estado "missing".
- Token de texto del mensaje "missing": `$pd-ink` (import de `premium-card`, solo variables/mixins).

## Bugs encontrados

- **(preexistente, no tocado)** `useSessionPlayer.clearProgress()` pone `elapsedSeconds = 0` pero NO reinicia `accumulatedSeconds`: tras un `clearProgress` con el reloj corrido, el siguiente `startTimer()` retoma desde el valor viejo. Afecta "Reiniciar sesión" de `DayPlayer.vue` (lo reinicia con `isInitialized=false`, pero `initialize()` del player sale temprano). La página libre lo esquiva recreando el player. Sugerido: `accumulatedSeconds = 0` en `clearProgress` (fuera del alcance de este plan).

## Para el orquestador

- `vue-tsc` en el checkout con node_modules: `Session.blocks` recibe `{ ...FreeBlockItem, sortOrder: 0 }` (extiende `Block`), `route.params.blockId` string|string[], `...(cond ? { completionId } : {})` en el request.
- Server-side (197-05): en la 2ª vuelta con `completionId` la duración = `now - startedAt` guardado, o sea incluye el tiempo parado en celebración/resumen; el cliente muestra `res.durationSeconds`. Si importa que coincida con el reloj, habría que aceptar `startedAt`/duración del cliente acotada en la continuación.
- La tab Libre (197-18) debe leer `query.tab === 'libre'`; hoy `TrainingIndex.vue` no lo procesa.
- Falta UAT de la tarea de back físico (Capacitor) durante `playing`: el guard cubre la navegación del router.

## Known Stubs

Ninguno.

## Self-Check: PASSED

`FreeBlockPlayer.vue` y el cambio de `routes.ts` existen; commits `30df6a130` y `99e7e8d49` en `feat/197-entrenar`.
