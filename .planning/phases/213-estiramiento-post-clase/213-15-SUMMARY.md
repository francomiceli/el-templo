---
phase: 213-estiramiento-post-clase
plan: 15
subsystem: app
tags: [stretch, player, vue, quasar, aura, composable]
requires:
  - phase: 213-14
    provides: contrato nuevo de la API (dosis por ejercicio, cierre con solo offerId, AURA por 180 s del servidor)
provides:
  - player de estiramiento propio y simple (video, minutero que solo avanza, lista, Anterior / Siguiente, Terminar)
  - useStretchPlayer (estado y minutero) y startedConfirmedAt en useStretchCompletion
  - stretchDoseLabel, stretchAuraReady, stretchDoneMinutesLabel
affects: []
tech-stack:
  added: []
  patterns: ["minutero calculado contra Date.now() en cada tick", "el aviso de AURA cuenta desde la confirmacion del servidor"]
key-files:
  created:
    - el-templo-app/src/modules/training/composables/useStretchPlayer.ts
    - el-templo-app/src/modules/training/composables/__tests__/useStretchPlayer.test.ts
  modified:
    - el-templo-app/src/modules/training/pages/StretchPlayer.vue
    - el-templo-app/src/modules/training/components/player/StretchDone.vue
    - el-templo-app/src/modules/training/types/stretch.ts
    - el-templo-app/src/modules/training/utils/stretchSession.ts
    - el-templo-app/src/modules/training/composables/useStretchCompletion.ts
    - el-templo-app/src/stores/useStretchStore.ts
    - el-templo-app/src/modules/progression/utils/today-card.ts
  deleted:
    - el-templo-app/src/modules/training/components/player/StretchClock.vue
  reverted_to_bc231c4de:
    - el-templo-app/src/modules/training/components/BlockProgressionView.vue
    - el-templo-app/src/modules/training/components/player/StoryExerciseCard.vue
    - el-templo-app/src/modules/training/utils/playerHeader.ts
key-decisions:
  - "Sin 3-2-1: el minutero arranca al entrar"
  - "Terminar antes de los 3 minutos pide confirmacion"
  - "Sin duracion medida el cierre dice Listo. sin cifra de minutos"
requirements-completed: [D-05, D-08, SC-2, SC-3]
completed: 2026-11-12
---

# Phase 213 Plan 15: Player de estiramiento simple (app) Summary

**El player nuevo es una pagina propia (video arriba, minutero chico que solo avanza, lista con dosis, Anterior / Siguiente y Terminar siempre disponible) y ya no queda codigo del reloj por ejercicio, los lados ni el marcado.**

## Commits

| Commit | Titulo |
| ------ | ------ |
| `2ef63d034` | test(213-15): add failing tests for stretch player state, dose label and AURA readiness (RED) |
| `5dbcf9016` | feat(213-15): stretch player state, dose label and server-confirmed AURA clock (GREEN) |
| `863737d22` | feat(213-15): simple stretch player with video, timer and manual navigation |

## Que se hizo

- **Tipos**: `StretchDose`, `StretchExercise { exerciseId, name, family, dose, videoUrl }`, `StretchTodayResponse` sin `minutes` ni `plannedSeconds`, cierre `{ offerId }`, respuesta sin `allDone`.
- **`stretchSession.ts`**: se fue toda la logica del reloj por ejercicio (`buildStretchSession`, `stretchTimeline`, `stretchPhaseAt`, `stretchClockElapsedMs`, `stretchTotalMs`, `showSideSwitchNotice`). Entran `stretchDoseLabel`, `stretchAuraReady` (180 s + 2 s de margen) y `stretchDoneMinutesLabel`. Se quedan `stretchMinutesLabel`, las frases de cierre e `isStretchExpiredMessage`.
- **`useStretchPlayer`**: indice con `next/prev/goTo` acotados, minutero con `Date.now()`, `start()` idempotente, `stop()`, `cleanup()`. Sin `onUnmounted` y sin medir layout.
- **`useStretchCompletion`**: `complete({ offerId })`, `startedConfirmedAt` (se fija solo con un `started` aceptado por el servidor; null con 4xx, falla, `sendStarted` nuevo y `cleanup`). Corregido el comentario de `STARTED_MAX_ATTEMPTS`.
- **Store y card**: `cardInput` pasa a `{ status }`; `applyCompletion` ya no escribe `minutes`. `MiTemplo.vue` no necesito cambios (pasa `stretchStore.cardInput` tal cual).
- **`StretchPlayer.vue`**: etapas `loading / missing / playing / saving / celebration`. Wake lock, mensajes `MSG_*`, 410/vencido, `from` push/card, `push_opened` y `sendStarted` se conservaron. Salir pide confirmacion (texto de siempre) y no cierra la oferta. Terminar: directo si `stretchAuraReady`; si no, dialogo "Todavia no llegaste a los 3 minutos" con "Seguir estirando" / "Terminar igual".
- **Limpieza**: `StretchClock.vue` borrado. `BlockProgressionView.vue`, `StoryExerciseCard.vue` y `playerHeader.ts` restaurados a `bc231c4de` (todo su diff era de la prop `copy`: `git diff bc231c4de` de los 3 queda vacio).
- **Agregado del plan 14**: `StretchDone.vue` recibe `minutesLabel: string | null`; con `durationSeconds: null` el player pasa null y la pantalla dice solo "Listo." (sin la linea de minutos). Testeado en `stretchDoneMinutesLabel`.

## Decisiones del ejecutor

1. **Reloj en formato `MM:SS` con `formatElapsedTime`** (ya existe en `utils/formatTime.ts`, DRY) en vez de crear `formatStretchClock`. Se ve "00:07" en vez de "0:07" del sketch. Si Franco prefiere "0:07", es un cambio de una linea con un helper nuevo.
2. **StretchDone cambia de `minutes: number` a `minutesLabel: string | null`** (en vez de `minutes: number | null`) para que el texto del caso "sin duracion" quede en una funcion pura testeable (`stretchDoneMinutesLabel`); el repo no tiene `@vue/test-utils`, no se pueden montar componentes en tests.
3. **`stretchDoneMinutes` del plan -> `stretchDoneMinutesLabel`** por lo mismo. No esta en el plan original.
4. **Terminar con `started` sin confirmar** (`startedConfirmedAt` null, p. ej. red caida todo el rato) cuenta como "no llegaste a los 3 minutos": pide confirmacion, porque no se puede prometer AURA sin que el servidor haya aceptado el inicio.
5. **El aviso "Ya sumas +5 AURA" se recalcula cada segundo** a partir de `elapsedSeconds` (solo como disparador de reactividad), pero mide contra `Date.now() - startedConfirmedAt`, no contra el minutero.
6. **Fondo de la pagina `$cream`** (como el player anterior) y el hint "ya sumas AURA" en `$pd-terra-ink` (terracota) en vez del verde `--sage` del sketch: la paleta de la app no tiene ese verde como variable y el plan pide solo paleta calida.
7. **Ruta de `BlockProgressionView.vue`**: esta en `components/`, no en `components/player/` como dice el plan. Se uso la ruta real.
8. **`VideoPlaceholder` con `:key` por `exerciseId`**: remonta al cambiar de ejercicio (estado de error/carga limpio y autoplay nuevo).
9. **Wake lock**: como `useSingleBlockPlayer` ya no lo maneja, la pagina llama `requestWakeLock()` al arrancar y `releaseWakeLock()` al cerrar o vencer; `cleanup()` al desmontar.
10. **Cierre con error de red**: vuelve a `playing` con el aviso negativo de siempre (reintentar es tocar Terminar otra vez); el minutero sigue.

## Verificacion

- vitest con los 5 archivos del plan: 290/290 verdes (antes del Task 2). `src/modules/training` + store + today-card: 638/638 verdes. Suite completa: 2042 pasan, 2 fallan, ambas en `test/level-display.test.ts` (linea de base).
- `pnpm lint`: 0 errores, 2 warnings que ya estaban (`boot/axios.ts`, `useSessionPlayer.ts`).
- vue-tsc: 21 errores antes y 21 despues, lista identica (sin numeros de linea); ninguno en archivos tocados. En el commit del Task 1 `StretchPlayer.vue` todavia usaba el modelo viejo (anotado como el plan permite); el Task 2 lo arregla.
- Greps del plan: sin `StretchClock|PlayerCopyOverride|doneCopy|done-copy|buildStretchSession` en `src`; sin `secondsPerSide|transitionSeconds|stretchTimeline|stretchPhaseAt|exercisesCompleted` en tipos, utils, completion y store.
- `useSingleBlockPlayer.ts`, `FreeBlockPlayer.vue`, `DayPlayer.vue`, `GoalPlanSession.vue`: sin diferencias contra `c972f7d7a`.

## Lo que NO se pudo verificar

- **Nadie vio el player en un telefono ni en un navegador.** Layout, alturas (`clamp(180px, 28vh, 260px)` para el video), scroll de la lista, safe area arriba (el encabezado sobre el video no agrega `env(safe-area-inset-top)`: depende de lo que ya haga el layout) y abajo (si lo agrega el boton) estan sin ver.
- **Video**: autoplay, cambio de video al pasar de ejercicio y el fondo oscuro sin URL. Depende de `R2_PUBLIC_URL` en el API.
- **Wake lock** en iOS/Android reales.
- **Los dialogos** (salir, terminar antes de los 3 minutos) y el guard de ruta con el boton atras del telefono.
- **El flujo contra la API real**: el plan 14 tampoco corrio sus tests de integracion (sin MySQL). Nada de la pareja app + API se probo junta.
- **El texto de "Listo." sin cifra** se testeo como funcion pura; el render de `StretchDone.vue` no.

## Pasos de prueba manual para Franco

Con una oferta disponible (asistir a una clase, o sembrarla en la base de pruebas):

1. Mi Templo -> card "Estirar". Entra directo (sin 3-2-1): se ve el video del primer ejercicio, el nombre, "Ejercicio 1 de N" y la dosis ("30 s", "10 repeticiones" o "20 a 30 s"). El minutero arranca en 00:00 y sube.
2. Tocar Siguiente / Anterior (se deshabilitan en los extremos) y tocar filas de la lista: cambia el ejercicio y el video, el minutero NO se reinicia. No hay tildes ni lados.
3. Tocar Terminar antes de los 3 minutos: dialogo "Todavia no llegaste a los 3 minutos". "Seguir estirando" vuelve; "Terminar igual" cierra con "Listo." y minutos, SIN +5 AURA. La card de Mi Templo queda en "hecho".
4. Repetir otro dia (o con otra cuenta) y esperar mas de 3 minutos (182 s): el texto de abajo pasa a "Ya sumas +5 AURA al terminar"; Terminar cierra directo y la pantalla final muestra +5 AURA.
5. Flecha atras (y boton atras del telefono) en medio de la rutina: "Salir del estiramiento?". Salir no cierra la oferta: se puede volver a entrar y el minutero arranca de cero.
6. Con el telefono en modo avion al entrar y volver la red despues: el aviso de AURA no debe aparecer hasta que el servidor acepte el inicio.
7. Minutero en segundo plano: minimizar la app 1 minuto y volver; el minutero debe mostrar el tiempo real, no quedarse en el que tenia.
8. Abrir desde la notificacion (`?from=push`): igual que desde la card, y el evento `push_opened` queda registrado.
9. (Opcional) Completar sin que el `started` llegue (cortar la red desde el principio hasta cerrar): la pantalla final dice solo "Listo." sin cifra de minutos.

## Deviations from Plan

None - plan executed as written, salvo las decisiones del ejecutor de arriba (1 a 3 son cambios de forma respecto de lo que nombra el plan).

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

- Creados: `useStretchPlayer.ts`, `useStretchPlayer.test.ts`, este SUMMARY.
- Commits existen: `2ef63d034`, `5dbcf9016`, `863737d22`.
