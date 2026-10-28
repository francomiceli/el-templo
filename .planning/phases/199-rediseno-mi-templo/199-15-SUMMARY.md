---
phase: 199-rediseno-mi-templo
plan: 15
subsystem: app-today-card-view
tags: [today-card, program-sheet, mi-templo, d-01, d-03, d-04, d-05, d-14, d-15]
requires: [199-12, 199-14]
provides:
  - TodayCard.vue (card de hoy A', pinta un TodayCardModel; skeleton `cargando`)
  - ProgramSheet.vue (hoja inferior "Tu programa" con ProgramProgressCard)
  - ProgramProgressCard en superficie clara con texto sólido (D-15)
  - MiTemplo cableado: resolveTodayCard + useTodayBookingStore + zona de la sede
affects: [199-16, 199-20, 199-21]
key-files:
  created:
    - el-templo-app/src/modules/progression/components/TodayCard.vue
    - el-templo-app/src/modules/progression/components/ProgramSheet.vue
  modified:
    - el-templo-app/src/modules/programs/components/ProgramProgressCard.vue
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
requirements-completed: [D-01, D-03, D-04, D-05, D-14, D-15]
completed: 2026-10-15
---

# Phase 199 Plan 15: card de hoy A' en Mi Templo Summary

Mi Templo muestra una sola card de hoy oscura (A') que pinta el modelo de `resolveTodayCard`, con el turno real del socio y los gates "Arrancá/Renová tu plan". "Hoy", el día de la semana y la semana actual salen de la zona de la sede. "Mi programa" pasó a una hoja inferior blanca con `ProgramProgressCard` tokenizado a texto sólido.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `6117826b1` feat(199-15): TodayCard A', hoja ProgramSheet y ProgramProgressCard en superficie clara (D-03, D-15)
- Task 2: `9369c710d` feat(199-15): card de hoy A' con turno real, gates sin plan y zona de la sede en Mi Templo (D-03, D-04, D-05)

(Dos commits, uno por task. El plan hablaba de un único commit al final.)

## Qué se hizo

- **`TodayCard.vue`**: prop `model`, emit `open-program`. Estilos del sketch al pie de la letra (fondo `#2c2318`, texto `#f0e6d6`, kicker `#e3c9a8`, barra `#4a3f33`/`#e3c9a8`, chip ok `#2f4a35`/`#d9efdc`, botón 48 px crema, links subrayados con área táctil >= 44). Sin dorado, sin pastilla, ningún `color: rgba`. Meta y gancho en tramos (`<b>` para `strong`), sin `v-html`. Barra con `role="progressbar"` y `aria-valuenow`. Acciones con `to` hacen `router.push`; `open-program` se delega al padre. **Estado `cargando`** (L38): `<section aria-busy="true" aria-label="Cargando tu día">` con `q-skeleton` (kicker, título, meta, botón 48x140), `min-height: 180px`; el pulso solo corre bajo `prefers-reduced-motion: no-preference` (`q-skeleton animation="none"` + keyframes propios).
- **`ProgramSheet.vue`**: `q-dialog position="bottom"`, hoja blanca radio 20, agarradera `#d9cfc1`, título "Tu programa". L40: en plataforma nativa registra `App.addListener('backButton')` solo mientras está abierta (se remueve al cerrar o desmontar, con token anti-carrera) y se cierra si cambia la ruta, así el body no queda bloqueado.
- **`ProgramProgressCard`**: tokenizada sin tocar script, props, emits ni textos. Mapa color viejo -> nuevo:
  - fondo gradiente `#1a1612 -> #2c2318 -> #1e1914` -> `#ffffff` con borde `1px #e5dbcd`, radio 16; menú de programas igual (blanco, borde `#e5dbcd`)
  - borde animado dorado `rgba(180,140,80..220,190,130)` + shimmer -> eliminados
  - `radial-gradient` dorado, 3 sparkles y línea inferior dorada (y sus keyframes `shimmer`, `pulseGlow`, `sparkle1-3`) -> eliminados
  - título/ítems `#f0e6d6` -> `#2c2318`
  - secundario `rgba(240,230,214,.5/.65/.8)` (nombre de barra, caption del menú, chevron, título de bloque) -> `#6b6459` (los bloques pasan a `#2c2318`)
  - acentos `#c4956a` (badge, valores, header del menú, ítem activo, ícono de bloque) -> `#96593a`
  - CTA flecha `linear-gradient(#c4956a, #a07850)` -> `#96593a` sólido (texto `#fff`)
  - relleno de barra `linear-gradient(#c4956a, #dcbe82)` -> `#96593a`; riel `rgba(196,149,106,.12)` -> `#e5dbcd`
  - positivo `#8bc34a` -> `#3b7249`
  - aviso de renovación `#ffb74d` sobre `rgba(255,183,77,.1)` -> texto `#96593a` sobre `rgba(150,89,58,.08)`, borde `#e5dbcd`
  - fondos translúcidos dorados de chips/hover `rgba(196,149,106,.08/.18)` -> `rgba(150,89,58,.08/.14)`
  - template: estrella del badge `fill="#C4956A" opacity=".9"` -> `fill="#96593a"`; botón expandir `color="white"` -> `color="primary"`
- **`MiTemplo.vue`**: `<TodayCard>` justo debajo de `PermissionBanner`, `<ProgramSheet>` fuera del contenido. Quitados `SessionCtaCard`, `BookingStatusCard`, `RestDayCard`, `ProgramProgressCard` suelto, `cardOrder`/`CardId`, `showReservaCta`, `isGoalPlan`, `isRestDay`, `showRestDay`. D-04: `tz`, `todayStr`, `dow`, `tomorrowStr` en la zona de la sede; `currentWeekDates()`/`nextWeekDates()` con `weekStartsFor` + `addDaysStr`. Mañana: `tomorrowRoute` desde la semana actual o, si `dow === 7`, desde `nextWeek` (segunda instancia de `useWeekData`, cargada solo los domingos). `weekLoaded` = `weekError === null` tras el fetch (`useWeekData` no lanza, deja `error`).
- **L37 (carga de suscripción/plan-status)**: en `onMounted`, después de los fetch existentes y sin `await`: `if (!userStore.subscription && !userStore.subscriptionLoading) void userStore.loadSubscription()`. Un `watch` inmediato sobre `subscriptionLoaded && !subscriptionLoading` dispara `loadPlanStatus()` (y `getTrialEligibility()` si no es virtual) solo si la suscripción terminó sin plan activo. `planLoading: userStore.planStateLoading` alimenta el skeleton. `onUnmounted(() => schedulingApi.cleanup())`.
- **Puntos de entrada a Mi Templo auditados**: no hay `keep-alive` ni `onActivated` en `src`, y la página no tiene pull-to-refresh (lo dice su propio comentario): toda entrada (montaje inicial, re-login que navega a `/mi-templo`, volver a la pestaña) remonta la página y pasa por `onMounted` + el watch inmediato. `clearProfile()` resetea `subscriptionLoaded`/`planStatusLoaded`, así que tras un re-login el socio sin plan no hereda estado viejo. No hay camino que deje la card en `cargando` para siempre.

## Verificación

- `npx vue-tsc --noEmit`: 18 errores totales (límite 18, el de `displayName` en `MainLayout.vue` es preexistente); 0 en `TodayCard`, `ProgramSheet`, `ProgramProgressCard`, `MiTemplo`.
- `pnpm lint`: 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`). Prettier de lint-staged aplicado en ambos commits.
- Greps de aceptación Task 1 (`TodayCard.vue`): `#2c2318`=2, `#f0e6d6`=7, `#e3c9a8`=3, `#2f4a35`=1, `#4a3f33`=3, `color: rgba(`=0, `shimmer|gold`=0, `v-html`=0, `height: 48px`=2, `border-radius: 20px`=1, `cargando`=3, `aria-busy="true"`=1, `q-skeleton`=4. `ProgramProgressCard`: `color: rgba(`=0, colores viejos prohibidos=0, `#2c2318`/`#6b6459`/`#96593a` presentes, `color="white"`=0, diff sin `defineProps|defineEmits|import`=0.
- Greps de aceptación Task 2 (`MiTemplo.vue`): `<TodayCard`=1, cards viejas=0, `:has-booking="false"`=0, `getDay()/getFullYear()/getMonth()/getDate()`=0, `loadPlanStatus()`=1, `<ProgramSheet`=1, `void userStore.loadSubscription()`=1, `await userStore.loadSubscription()`=0, `!userStore.subscriptionLoading`=2, `weekLoaded`=4, `planLoading: userStore.planStateLoading`=1, `subscriptionLoaded`=1, comentario viejo=0, `resolveTodayCard(`=1.
- **Tests de app**: no se corrió ninguno. Este plan no crea ni modifica archivos de test, no toca `today-card.ts` (el modelo), y el repo no tiene `@vue/test-utils` ni tests de componentes, así que no hay test que cubra estos 4 archivos. Validación visual pendiente del plan 21 (capturas + `contrast.py`).

## Deviations from Plan

1. **[Menor] Dos commits** (uno por task).
2. **[Menor] Capas decorativas del template de `ProgramProgressCard` eliminadas** (`prog-radial-glow`, 3 `prog-sparkle`, `prog-bottom-line`): el plan decía no tocar la estructura, pero sin CSS quedaban divs vacíos sin función y D-03/D-15 piden quitar los brillos. Es la única edición de estructura; no afecta lógica ni textos.
3. **[Menor] Borde del badge y del aviso de renovación** pasan a `#e5dbcd` (el plan solo especificaba fondos/colores); sin borde dorado/ámbar.
4. **[Menor] Meta renderizada en un solo `<span class="today-card__meta-text">`** dentro del `<p>` flex: los tramos son parte de una misma frase ("Tu turno: **19:00** · Alem"); como flex items separados el `gap: 4px 10px` los habría partido. El contenedor sigue siendo `display:flex; flex-wrap` como pide el sketch.
5. **[Menor] Skeleton `min-height: 180px`** estimado desde las medidas del sketch (no medido en dispositivo); la altura real de la card varía con chips/gancho. Verificar en capturas del plan 21.
6. **[Decisión] `ProgramSheet` usa `@capacitor/app` `backButton`** (la app no usa `Platform.is.cordova`, por lo que QDialog no engancha el historial por sí solo en Capacitor). Solo en nativo y solo mientras está abierta. Un `q-dialog` anidado dentro de `ProgramProgressCard` (texto de bloque) NO se cierra con atrás: primero cierra la hoja entera. Caso raro.
7. **[Interpretación] `loadWeeks()` sin `await` en `onMounted`**, igual que el original (`fetchWeekSessions(...)` sin await), para no retrasar el consumo del deep link pendiente.

## Bugs reales encontrados

Ninguno en código previo.

## Dudas abiertas (no bloqueantes)

- **Guarda de suscripción literal del plan**: `!userStore.subscription` no recarga si hay una suscripción `expired` vieja en memoria y el socio acaba de renovar en la misma sesión (el plan-status sí se refresca por el watch). `PlanesPage`/`TrainingIndex` tienen la misma guarda; si molesta, ampliar a `!hasActiveSubscription`.
- Si el socio vuelve a Mi Templo sin plan con el estado ya cargado, el watch dispara `loadPlanStatus()` dos veces seguidas (inmediato + cuando `loadSubscription` termina). Inofensivo; se puede deduplicar en el store.
- `MainLayout` hace `todayBookingStore.load()` al entrar a `/mi-templo` (plan 12): hasta que responda, un presencial con turno ve brevemente "No tenés turno hoy"/"Reservá tu turno" (el store no expone un flag de "cargando" que entre en `planLoading`). Si en las capturas/UAT se nota, ampliar `planLoading` con `!todayBookingStore.loaded`.
- El orden final de la pila lo cierra el plan 20; los archivos de las cards viejas no se borraron (los consumidores se verifican ahí).
- `showUpsellBadge` pasó a depender de `isVirtual` (mismo valor que antes).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-41 mitigado (interpolación `{{ }}`, `<b>` para tramos `strong`, sin `v-html`). T-199-42 mitigado (bookings/plan-status/trial fail-open con `log.warn`; la card muestra `cargando` mientras la suscripción o el plan-status están pendientes, nunca un gate de "sin plan" por carrera).

## Self-Check: PASSED

- Archivos creados existen (`TodayCard.vue`, `ProgramSheet.vue`); commits `6117826b1` y `9369c710d` presentes en el worktree; `git status --porcelain` del worktree vacío; nada commiteado ni tocado en `/home/franco/projects/el-templo` (salvo este SUMMARY sin commitear).
