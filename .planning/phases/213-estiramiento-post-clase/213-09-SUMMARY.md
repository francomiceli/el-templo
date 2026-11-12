---
phase: 213-estiramiento-post-clase
plan: 09
subsystem: app
tags: [pinia, composables, pure-functions, vitest, fail-open, stretch]
requires:
  - phase: 213
    provides: rutas GET /sessions/stretch/today, POST /stretch/events y /stretch/complete (planes 04-05), useSingleBlockPlayer (plan 08)
provides:
  - tipos de las 3 rutas del estiramiento, alineados con stretch-service.ts / stretch-schemas.ts
  - buildStretchSession (Session sintetica pura), stretchTimeline y stretchPhaseAt (reloj puro de la rutina)
  - useStretchStore (oferta de hoy, fail-open, fuente de la card y del player)
  - useStretchCompletion (complete, sendEvent fire-and-forget, cleanup)
affects: [213-10 StretchPlayer, 213-11 card de Mi Templo y layout]
tech-stack:
  added: []
  patterns: [funciones puras sin reloj (el tiempo transcurrido lo pasa quien llama), store fail-open con generation anti-carrera, evento del embudo fire-and-forget con warn para 4xx y error para el resto]
key-files:
  created:
    - el-templo-app/src/modules/training/types/stretch.ts
    - el-templo-app/src/modules/training/utils/stretchSession.ts
    - el-templo-app/src/modules/training/utils/__tests__/stretchSession.test.ts
    - el-templo-app/src/stores/useStretchStore.ts
    - el-templo-app/src/stores/__tests__/stretch-store.test.ts
    - el-templo-app/src/modules/training/composables/useStretchCompletion.ts
    - el-templo-app/src/modules/training/composables/__tests__/useStretchCompletion.test.ts
  modified: []
key-decisions:
  - "Los tipos salen del contrato real de la API (family tipada LS|MN|FL|TTB|TS; sides como number, no 1|2, porque asi lo declara StretchTodayExercise); el plan decia sides 1|2 y se uso el del contrato"
  - "El reloj usa secondsPerSide y transitionSeconds de CADA ejercicio (el servidor hoy manda 45/10), no constantes: el total siempre coincide con plannedSeconds"
  - "Descarte de datos de otro dia: el store compara el localDate guardado contra todayInTz(zona de la sede) (mismo criterio que useTodayBookingStore); se descarta al empezar load() y en el catch. Asi ni una falla ni una recarga muestran el estiramiento de ayer"
requirements-completed: [SC-2, SC-3, SC-7, D-07, D-08, D-09, D-15]
duration: 25min
completed: 2026-11-11
---

# Phase 213 Plan 09: Capa de datos del estiramiento en la app Summary

**Tipos alineados con la API, Session sintetica y reloj de la rutina como funciones puras, store Pinia fail-open de la oferta de hoy y composable de completado/eventos del embudo, con 52 tests en node.**

## Performance

- **Tasks:** 2/2 (cada una con RED y GREEN en commits separados)
- **Tests nuevos:** 20 (stretchSession) + 19 (store) + 13 (composable) = 52, todos verdes

## Accomplishments

- `types/stretch.ts`: `StretchStatus`, `StretchFamily`, `StretchExercise`, `StretchTodayResponse`, `StretchEventType/From/Request`, `StretchCompleteRequest/Response`, con los nombres exactos de `stretch-service.ts` y `stretch-schemas.ts`.
- `utils/stretchSession.ts` (sin stores, sin Vue, sin reloj): `buildStretchSession` arma la Session de un bloque `STRETCHING` solo con lo que devuelve el servidor (T-213-27); `stretchTimeline` genera transicion -> lado 1 -> lado 2 (solo si 2 lados) por ejercicio y omite tramos de 0 s; `stretchPhaseAt` devuelve ejercicio, lado, total de lados, fase y restante. Test de la rutina de 5 ejercicios = 410 s.
- `useStretchStore` (`defineStore('stretch', () => ...)`): `today`, `loaded`, `loadFailed`, `cardInput`, `load`, `markCardSeen`, `applyCompletion`, `reset`. `generation` descarta respuestas de loads viejos o posteriores al logout. `markCardSeen` manda `card_seen` una vez por `localDate` y solo con `available`, marcando antes del await (llamadas simultaneas = un solo POST).
- `useStretchCompletion`: `complete` (guarda de doble toque con `isSubmitting`, aplica al store, 410 con mensaje del servidor o "Este estiramiento ya venció", 4xx a warn, resto a error), `sendEvent` que nunca lanza, `cleanup()` sin `onUnmounted`.

## Task Commits

1. Task 1 RED: `3970ae726` test(213-09): tipos y test de Session sintetica y reloj
2. Task 1 GREEN: `47a3763ae` feat(213-09): buildStretchSession, stretchTimeline, stretchPhaseAt
3. Task 2 RED: `549c35197` test(213-09): tests del store y del composable
4. Task 2 GREEN: `d899c40a7` feat(213-09): useStretchStore y useStretchCompletion

## Decisiones del ejecutor

- **Contrato real manda:** `sides` queda `number` (la API lo declara `number`, no `1 | 2`); `family` se tipo con el union real de `db/schema/stretch.ts`. La respuesta de errores de la API usa `{ error }`; el composable acepta `error` y `message`.
- **"El store no calcula fechas" vs. "descartar datos de otro dia":** para poder descartar sin inventar un reloj propio se compara el `localDate` guardado con `todayInTz(branchTimezone ?? DEFAULT_BRANCH_TZ)`, igual que `useTodayBookingStore`. Todo lo demas (id de la Session, `card_seen`) usa el `localDate` del servidor. Descarte al inicio de `load()` (sin dato de ayer mientras recarga) y en el catch.
- **`cardInput` tras una falla con dato del mismo dia:** sirve el dato conservado (sin parpadeo); sin dato, `none`.
- **`applyCompletion` sin dato cargado:** no inventa estado (no hay `localDate` ni ejercicios que mostrar). Ademas de `status/completedAt/auraAwarded` actualiza `minutes` con el de la respuesta.
- **`card_seen` fallido no se reintenta ese dia:** el flag queda marcado (un 404 repetido no debe generar bucles); se loguea en warn para no mandar ruido de red a Sentry.
- **`stretchPhaseAt` en `done`:** `exerciseIndex` = ultimo ejercicio, `side` null; timeline vacio = `done` con `totalSides` 0. Limite entre tramos pertenece al siguiente.
- **Tipos extra exportados** (`StretchSegment`, `StretchPhase`) para que el plan 10 los use sin redefinirlos.

## Deviations from Plan

None - el plan se ejecuto como estaba escrito; las diferencias de contrato (sides number) estan en "Decisiones del ejecutor".

Incidente propio sin consecuencias: durante una mutacion de sanidad (apagar el descarte de otro dia, confirmando que 2 tests fallan) intente restaurar con `git checkout` sobre un archivo aun sin trackear; la restauracion se hizo a mano con `sed` y se re-corrieron los 32 tests verdes antes del commit.

## Verificaciones

Corridas (foreground, local):
- `vitest run` de los 3 archivos: 52/52 verdes.
- Mutacion: sin `dropIfFromAnotherDay` fallan exactamente los 2 tests de dato de otro dia.
- `pnpm lint` app: 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`).
- `vue-tsc --noEmit -p tsconfig.json`: 21 errores = baseline; ninguno en los archivos del plan.
- Greps de higiene (sin `Date.now`/`useStore`/`any`/`console` en `stretchSession.ts`; sin `onUnmounted`/`console`/`any` en store y composable): limpios.

No corridas: nada pendiente (el plan es solo de app, sin MySQL).

## Known Stubs

Ninguno. El store y el composable todavia no estan consumidos por UI: los conectan los planes 10 (player) y 11 (card/layout/logout, incluyendo llamar `reset()` en logout y `load()` en el layout).

## Threat Flags

Ninguno (la app solo manda tipo de evento, `offerId` y ids marcados; T-213-27/28/29 mitigados como pedia el plan).

## Lecciones para los planes siguientes

- (09) Plan 10: `import { buildStretchSession, stretchTimeline, stretchPhaseAt } from 'src/modules/training/utils/stretchSession'`; `stretchPhaseAt(elapsedMs, timeline)` es pura, el player aporta el reloj (y la pausa). `timerSpec` de la Session sintetica es `null`.
- (09) Plan 11: `useStretchStore().load()` lo dispara la pagina/layout, `reset()` en logout (junto al resto de stores), `markCardSeen()` al renderizar la card disponible; `cardInput` es lo unico que lee la card.
- (09) `useStretchCompletion().complete({ offerId, exercisesCompleted })` ya aplica `applyCompletion` al store; el player no debe hacerlo de nuevo. `sendEvent('started', 'card' | 'push')` y `sendEvent('push_opened')` son fire-and-forget.
- (09) Un archivo sin trackear no se restaura con `git checkout`: para mutaciones de sanidad, hacer copia antes.

## Self-Check: PASSED

Archivos y commits verificados (ver comandos al cierre).
