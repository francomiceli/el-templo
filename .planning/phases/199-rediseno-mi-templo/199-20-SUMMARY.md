---
phase: 199-rediseno-mi-templo
plan: 20
subsystem: app-mi-templo-stack
tags:
  [
    mi-templo,
    stack-order,
    fab-space,
    dead-code,
    today-card,
    d-01,
    d-02,
    d-06,
    d-08,
    d-14,
    d-15,
  ]
requires: [199-19]
provides:
  - Pila final de Mi Templo en el orden fijo de D-02
  - Espacio inferior del botón QR reservado solo con fabVisible
  - Gate `bookingsLoading` en resolveTodayCard (A1)
  - Recarga de suscripción si no hay plan activo (A2)
  - 7 componentes de la pila vieja borrados
affects: [199-21]
key-files:
  modified:
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
    - el-templo-app/src/modules/progression/utils/today-card.ts
    - el-templo-app/src/modules/progression/utils/__tests__/today-card.test.ts
  deleted:
    - el-templo-app/src/modules/progression/components/SessionCtaCard.vue
    - el-templo-app/src/modules/progression/components/BookingStatusCard.vue
    - el-templo-app/src/modules/progression/components/RestDayCard.vue
    - el-templo-app/src/modules/progression/components/WeeklySummaryCard.vue
    - el-templo-app/src/modules/progression/components/CheckInCard.vue
    - el-templo-app/src/modules/progression/components/ImprovementCtaCard.vue
    - el-templo-app/src/modules/progression/components/RpeTrendChart.vue
requirements-completed: [D-01, D-02, D-08, D-14, D-15, D-06]
completed: 2026-10-15
---

# Phase 199 Plan 20: Pila final de Mi Templo y limpieza Summary

Mi Templo queda en el orden de D-02 (banner, card de hoy, Novedades, Registro del día, Patrocinadores, Tu semana con la evaluación, Para vos, frase del día), el espacio del botón QR se reserva solo cuando el botón se ve, los textos de carga/error son sólidos y las 7 cards viejas se borraron. Además se cerraron los dos arreglos del orquestador (A1 y A2).

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Arreglos A1 + A2: `38031df01` fix(199-20): la card de hoy espera las reservas de hoy y Mi Templo recarga la suscripción si no hay plan activo
- Task 1: `815960d1d` feat(199-20): pila final de Mi Templo en el orden de D-02 y espacio del botón QR solo cuando aparece
- Task 2: `90e68d50c` refactor(199-20): borrar las 7 cards de Mi Templo reemplazadas, sin consumidores

## Qué se hizo

- **A1 (`bookingsLoading`)**: pasar solo `!todayBookingStore.loaded` como `planLoading` NO alcanza, porque `resolveTodayCard` solo usa `planLoading` cuando NO hay plan (`!hasPlan && planLoading`); el flash "No tenés turno hoy" le pasa al presencial CON plan. Se agregó el input `bookingsLoading: boolean` al modelo: en el camino presencial, tras `if (input.booking)` y antes de descanso/sin turno, devuelve `cargando` (skeleton). Cubre también el domingo (podría tener turno). No afecta a virtual, a `completada` ni a sin plan. `todayBookingStore.loaded` ya existía y es fail-open (`loaded = true` también tras error; `load()` corre en `MainLayout` al autenticar), así que la card no se traba. `MiTemplo.vue` pasa `bookingsLoading: !todayBookingStore.loaded`.
- **A2**: la guarda de `onMounted` pasó de `!userStore.subscription` a `!userStore.hasActiveSubscription` (con `!subscriptionLoading`). Una suscripción `expired` vieja en memoria ya no impide recargar; mientras recarga, `planStateLoading` es true y la card muestra el skeleton (no "Renová tu plan" por una carrera). `PlanesPage`/`TrainingIndex` no se tocaron.
- **Task 1**: template reordenado según D-02 con un comentario por bloque que cita su decisión. `GeneralContent` va justo después de `WeekStrip` (D-09) y luego el bloque Mi Árbol (flag `MEMBER_TREE_ENABLED` intacto). Diálogos (`ProgramSheet`, `SponsorSheet`, `MemberCard`) siguen al final, fuera del flujo. `mi-templo__content--fab` con `padding-bottom: 88px` ligado a `todayBookingStore.fabVisible` (L28), con `transition: padding-bottom .2s` solo bajo `prefers-reduced-motion: no-preference` (con reduced-motion cambia de golpe). Textos: `__loading-text` `#6b6459`, `__error-text` `#2c2318`. Se actualizó el docstring del script y el comentario de Novedades (que decían "antes del carrusel premium"). La condición del loader no se tocó.
- **Task 2**: borrado de los 7 componentes con `git rm` (ver grep abajo).

## Componentes borrados (L45) y grep que lo justifica

Comando: `grep -rn "SessionCtaCard\|BookingStatusCard\|RestDayCard\|WeeklySummaryCard\|CheckInCard\|ImprovementCtaCard\|RpeTrendChart" el-templo-app/src` (sin diferenciar mayúsculas para las variantes kebab-case, más búsqueda en `__tests__`, `import(` dinámicos y rutas/quasar.config).

| Componente               | Resultado del grep                                                            | Acción  |
| ------------------------ | ----------------------------------------------------------------------------- | ------- |
| `SessionCtaCard.vue`     | 0 coincidencias fuera de su archivo (sin imports, template ni tests)          | borrado |
| `BookingStatusCard.vue`  | 0 fuera de su archivo                                                         | borrado |
| `RestDayCard.vue`        | 0 fuera de su archivo                                                         | borrado |
| `WeeklySummaryCard.vue`  | 0 coincidencias en todo `src`                                                 | borrado |
| `CheckInCard.vue`        | 0 fuera de su archivo (el kebab `check-in-card` solo eran clases CSS propias) | borrado |
| `ImprovementCtaCard.vue` | 0 coincidencias en todo `src`                                                 | borrado |
| `RpeTrendChart.vue`      | solo su propio comentario de cabecera (`RpeTrendChart.vue:9`)                 | borrado |

- Ningún test importaba los componentes borrados: no se borró ningún test.
- Ningún comentario de otros archivos nombraba los componentes (el grep ya no mostraba menciones en `AvisoCard`/`BarChallengeCard`), así que no hubo que reescribir comentarios.
- Post-borrado: `grep -rln "import .*\(...7 nombres...\)" src` = 0.
- **`chart.js`**: tras borrar `RpeTrendChart.vue` ya nada en `el-templo-app/src` importa `chart.js` (`package.json` lo sigue declarando, `^4.5.1`). NO se desinstaló. Posible limpieza futura (consultar antes; ver si algún otro paquete lo necesita).

## Verificación

- Task 1 `<verify>`: `vue-tsc` sin matches en `MiTemplo`. Orden de aparición (grep con números de línea): `PermissionBanner` 25 < `TodayCard` 29 < `NovedadesCard` 33 < `CheckInPanel` 37 < `SponsorsCarousel` 46 < `WeekStrip` 50 < `GeneralContent` 58 < `for-you` 77 < `DailyQuote` 96, estrictamente crecientes. `padding-bottom: 88px` = 1. `color: rgba($primary, 0.7|0.8)` = 0. `MEMBER_TREE_ENABLED` presente (>= 1). **`mi-templo__content--fab` aparece 2 veces** (clase en el template y el comentario del SCSS; el modificador SCSS se escribe `&--fab`).
- Task 2 `<verify>`: `vue-tsc` = 18 errores totales (límite 18; son los preexistentes, ninguno en archivos del plan; borrar los componentes no hizo desaparecer ninguno, el número sigue en 18); `pnpm lint` = 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`); imports de los 7 = 0; los 7 archivos ya no existen.
- **Tests de app corridos** (foreground): `npx vitest run src/modules/progression/utils/__tests__/today-card.test.ts` = 79/79 verdes (6 casos nuevos del gate A1). Mutación comprobada: desactivar `if (input.bookingsLoading)` hace fallar 2 casos ("presencial con plan... bookingsLoading → cargando" y "domingo con bookingsLoading"); archivo restaurado. No se tocó ningún otro archivo con test.
- Worktree limpio (`git status --porcelain` vacío) tras los 3 commits.

## Estilos con `color: rgba(` que quedan en la página

Solo los de `.mi-arbol-card` (`rgba($secondary, 0.06)` en hover, `rgba($accent, 0.7)` en el subtítulo, `rgba($secondary, 0.6)` en el chevron): el bloque está apagado por `MEMBER_TREE_ENABLED`. Se dejaron a propósito; si el flag se enciende hay que tokenizarlos (D-15). No quedaban estilos huérfanos de los bloques viejos (`__section-title`, `__check-ins*`, `.scroll-arrow`, `.premium-carousel*` ya los habían quitado los planes 16 y 17).

## Deviations from Plan

1. **[Rule 1 - A1 no se resuelve con `planLoading` solo]** Ver arriba: hizo falta un input nuevo (`bookingsLoading`) en `resolveTodayCard`, y un test nuevo. `today-card.ts` y su test no estaban en `files_modified`.
2. **[Menor] Tres commits** (A1+A2, Task 1, Task 2) en vez de uno.
3. **[Menor] Orden dentro de Tu semana**: `WeekStrip`, luego `GeneralContent` y después el bloque Mi Árbol (el plan nombraba la evaluación antes que el árbol; el árbol está apagado, no cambia nada visible).
4. **[Menor] Comentarios actualizados** en `MiTemplo.vue` (docstring del script y comentario de Novedades) porque describían la pila vieja.
5. El hook lint-staged hizo su backup interno con `git stash` en los commits (automático, no manual).

## Bugs reales encontrados

- El flash "No tenés turno hoy" / "Reservá tu turno" (A1) existía de verdad y además NO se arreglaba con la sugerencia del orquestador (`planLoading` ignora a los socios con plan). Corregido con `bookingsLoading`.
- Sin otros bugs en código previo.

## Known Stubs

Ninguno.

## Dudas abiertas (no bloqueantes)

- **`PlanesPage` / `TrainingIndex`** conservan la guarda `!userStore.subscription` para cargar la suscripción: con una `expired` vieja en memoria no recargan tras renovar en la misma sesión. Fuera de alcance, se dejaron igual.
- **`card_improvement`** (aviso de sistema editable en Comunicaciones): con `ImprovementCtaCard` borrado queda sin consumidor en la app; editar su copy desde el admin no tiene efecto visible. No se tocó la API (duda abierta de 199-17).
- **`chart.js`** quedó sin importadores en `el-templo-app/src` (no se desinstaló).
- **`progressionStore.weeklySummary*` / `rpeTrend`** y `fetchWeeklySummary` quedaron sin consumidor en la página (duda de 199-16); podría limpiarse en una fase posterior.
- **Skeleton más largo para el presencial con plan**: ahora la card queda en `cargando` hasta que responda `my-bookings` (dos requests en paralelo, esta semana y la siguiente). En red lenta se ve el skeleton más tiempo; es el trade-off de no mostrar un estado falso. Verificar en el UAT.
- **Doble `loadPlanStatus()`** para un socio sin plan con estado ya cargado (watch inmediato + al terminar `loadSubscription`), ahora también cuando hay una `expired` en memoria; inofensivo (duda de 199-15).
- Validación visual de la pila completa (orden, espacio del FAB sin salto, contraste de los textos de carga/error): plan 21.

## Threat Flags

Ninguno fuera del threat_model. T-199-54 mitigado (los 7 borrados solo tras grep con 0 consumidores; `vue-tsc` y `eslint` como red de seguridad, sin errores nuevos).

## Self-Check: PASSED

- Commits `38031df01`, `815960d1d` y `90e68d50c` presentes en el worktree; los 7 archivos borrados no existen; `git status --porcelain` del worktree vacío; nada commiteado ni tocado en `/home/franco/projects/el-templo` salvo este SUMMARY sin commitear.
