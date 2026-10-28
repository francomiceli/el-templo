---
phase: 203-carga-sin-parpadeos
plan: 10
subsystem: app-progression-today-card
status: complete
completed: 2026-10-28
requirements: [SC-2, D-01, D-05, D-06, D-07, D-08, D-18, D-17]
commits: [4cdb0587c, 48cbf5acf]
key-files:
  modified:
    - el-templo-app/src/modules/progression/utils/today-card.ts
    - el-templo-app/src/modules/progression/utils/__tests__/today-card.test.ts
    - el-templo-app/src/modules/progression/components/TodayCard.vue
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
---

# Phase 203 Plan 10: la card de hoy sabe cuando no sabe (SUMMARY)

`resolveTodayCard` (pura) recibe 10 entradas nuevas ("todavía no sé", fallas y tope) y devuelve un kind nuevo `neutral` (D-18). El template de los estados existentes no cambió.

## Qué quedó

- `TodayCardKind` suma `'neutral'`. `TodayCardInput` suma `profileLoading`, `weekLoading`, `programLoading`, `trialLoading`, `statsLoading`, `planFailed`, `bookingsFailed`, `programFailed`, `statsFailed`, `deadlinePassed`, cada una con su docblock.
- `neutral(input)`: kicker `Hoy`, título `Tu entrenamiento`, meta = `formatLongDate(todayStr)`, sin pill, primario `Entrenar -> /training`, sin secundaria. `withLibreLink` y `withExtraPrograms` lo dejan intacto (caen en `default`).
- Precedencia en `resolveBaseCard` (documentada en el docblock del archivo):
  - G-1: `profileLoading` -> `cargando` SIEMPRE (D-08 manda sobre D-07/D-18; `neutral` solo se alcanza con perfil).
  - G0: sin plan y `planFailed` -> `neutral` al instante; sin plan y `planLoading` -> `cargando` hasta el tope y `neutral` después.
  - G1 (sin plan): virtual espera `weekLoading`; no virtual "nunca tuvo plan" espera `trialLoading` (vencido el tope, `sinPlanNunca` sale con `trialEligible: false`).
  - G1.5 (con plan): `waiting = weekLoading || statsLoading || programLoading || waitingBookings`, solo banderas `*Loading`; `waitingBookings = !isVirtual && bookingsLoading && booking === null && !todayCompleted`.
  - G2: `completada` solo con `!statsLoading && !statsFailed`.
  - G3 virtual: programa conocido -> `online-programa`; programa desconocido (`programLoading` tras el tope, o `programFailed` sin programa) -> `neutral`.
  - G4 presencial: `bookingsLoading` sin turno vigente -> `cargando` (tras el tope `neutral`); `bookingsFailed` sin turno vigente -> `neutral` al instante.
- `TodayCard.vue`: solo ramifica por `kind === 'cargando'`, así que `neutral` se pinta con el modelo genérico (mismo marco y alto de 4 filas). Se agregó una línea de comentario en la cabecera; sin cambios de estilos.

## Revisión a mano de los casos existentes (acceptance)

Fixture con las 10 banderas en `false`, así que G-1/G0/G1.5 no aplican y G2-G4 son idénticos a antes salvo por los dos `||` agregados, que con banderas en false no cambian nada. Casos que el plan pidió revisar:
- `today-card.test.ts` "con reserva ya en memoria la clase gana aunque bookingsLoading siga true": `booking` presente -> `waitingBookings` false -> G4 `activeBooking` -> `presencial-turno`.
- "no afecta al virtual ni a la sesión completada": virtual -> `waitingBookings` false; `todayCompleted` -> `waitingBookings` false y G2 -> `completada`.
- "clase pasada + reservas cargando -> cargando": `booking` presente (no entra a `waitingBookings`), G4 `missedToday` -> `activeBooking` null -> `bookingsLoading` sin tope -> `cargando`.
- Ninguna línea `expect(` existente se modificó: el diff del test es solo de líneas agregadas (`git diff --numstat` = 0 borradas).

## Commits

- `4cdb0587c` fix(203-10): card de hoy espera todos sus datos y usa estado neutral tras el tope (D-05/D-07/D-18)
- `48cbf5acf` fix(203-10): TodayCard documenta el estado neutral

## Tests escritos, pendientes de correr (D-17)

- `el-templo-app/src/modules/progression/utils/__tests__/today-card.test.ts`: `baseInput()` con las 10 banderas en false y un `describe('resolveTodayCard — carga y tope (fase 203)')` con 37 bloques `it` (el `it.each` expande a 3 casos; 39 casos en total). Cubre cada ítem de `<behavior>`, incluidos "sin perfil y con el tope vencido -> cargando", "suscripción 204 + plan-status caído -> neutral", las tres fallas sin dato -> `neutral` con `deadlinePassed: false`, las mismas con dato previo, el modelo exacto de `neutral` (`toEqual`), "vuelve sola al modelo completo" y una matriz de fallas x tope que afirma con `allCopy()` que no aparecen "Arrancá tu plan", "Renová", "Ver planes", "Clase de prueba gratis", "Reservá" ni "Sesión libre". Solo usa `resolveTodayCard`, `formatLongDate` y tipos exportados por `today-card.ts`.
- Prettier y eslint pasaron sobre los 4 archivos tocados. `vue-tsc` no está disponible en el `node_modules` prestado (no hay binario): tipado no verificado por compilador.

## Deviations from Plan

**1. [Rule 3 - Blocking] `MiTemplo.vue` pasa las entradas nuevas en `false`.**
- El plan no lista `MiTemplo.vue`, pero las 10 entradas nuevas son requeridas en `TodayCardInput`, así que el único llamador dejaba de tipar. Se agregaron con `false` (comportamiento idéntico al de antes) y un comentario que remite al plan 11, que las cablea a las fuentes reales. Es el único cambio en esa página.

**2. [Diseño] `sin-plan-vencio` no espera `trialLoading`.**
- El plan decía que todo "no virtual sin plan" espera la prueba gratis. La elegibilidad solo alimenta la secundaria "Clase de prueba gratis" de `sin-plan-nunca`; `sin-plan-vencio` tiene "Ver otros planes" fija. Esperar sería un esqueleto sin motivo, así que solo "nunca tuvo plan" espera. Cubierto por un test propio.

**3. [Diseño] G3 prioriza el programa conocido.**
- El plan definía `programUnknown = isVirtual && (programLoading || (programFailed && !program))`, que dejaría en `neutral` a un virtual con programa ya conocido si `programLoading` o `programFailed` quedara en true. Se ordenó: `if (input.program) return onlinePrograma(...)` primero; luego `programLoading || programFailed` -> `neutral`. Para los casos del `<behavior>` (programa nulo) el resultado es el mismo; con dato conocido nunca se esconde.

**4. [Plan] Verify automático del plan con un falso negativo.**
- El `grep` `! ... axios` de `<verify>` matchea el docblock preexistente ("sin stores, sin axios, sin reloj"). El archivo no importa nada de stores, boot ni axios; no se tocó esa frase. El resto de los greps del verify pasan.

## Riesgos antes del plan 11

- **Plan 11 debe cablear las 10 banderas** (hoy todas `false` en `MiTemplo.vue`). Semántica que no se puede equivocar: `*Loading` = "todavía no llegó por primera vez"; `*Failed` = falló Y no hay dato previo (si el store conservó el último bueno, `bookingsFailed`/`programFailed` deben ir en false o el dato igual gana, pero `statsFailed`/`planFailed` sin dato previo sí deben ir en true).
- **`useTodayBookingStore`:** `loadFailed` -> `bookingsFailed` solo "sin turno conocido" (el gate ya lo respeta: con `booking` gana el dato). Si `loadedTz !== tz` actual de la sede hay que recargar, y mientras tanto `bookingsLoading` debe ser true (no mostrar "sin turno" con la zona vieja). Una carga fallida fija `loadedTz`, así que un reintento con la misma zona hay que pedirlo explícitamente.
- **`weekLoading`:** `useWeekData().loaded` es `true` también tras error y por instancia: sirve para "ya terminó de intentar", no como señal de contenido. El flag "tuvo contenido" (plan 07) se graba con `record()` solo tras 2xx, nunca tras error ni tras un fail-open que devolvió null.
- **`deadlinePassed`:** `start()` de `useLoadDeadline` una sola vez (al montar), nunca dentro de un `watch` que dispare varias veces (cada `start()` vuelve `passed` a false). `CardSkeleton` depende de ganarle por especificidad al alto de `q-skeleton`; `TodayCard` sigue usando `q-skeleton` propio para su `cargando`.
- **Perfil tardío:** con `profileLoading` la card queda en esqueleto indefinidamente (D-08); depende de que `retryProfileLoad` efectivamente exista y reintente. Sin eso, un perfil que nunca llega deja la card en esqueleto sin salida.
- **Neutral en el wiring:** `todayStr` debe venir de la zona real de la sede cuando se alcanza `neutral`; si el plan 11 calcula `todayStr` con `DEFAULT_BRANCH_TZ` antes del perfil, la fecha del neutral mentiría (hoy G-1 lo impide mientras `profileLoading` sea correcto).
- Tipado sin compilador (`vue-tsc` ausente en el entorno prestado) y tests sin correr (D-17): primera corrida real en CI.

## Known Stubs

Ninguno (las 10 banderas en `false` de `MiTemplo.vue` son el comportamiento previo, a cablear en el plan 11).
