---
phase: 203-carga-sin-parpadeos
plan: 11
subsystem: app-progression-mi-templo
status: complete
completed: 2026-10-28
requirements: [SC-2, SC-4, D-01, D-05, D-06, D-07, D-08, D-15, D-17]
commits: [220e55a8b, 534d49421]
key-files:
  modified:
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
    - el-templo-app/src/layouts/MainLayout.vue
---

# Phase 203 Plan 11: Mi Templo en paralelo, sin duplicados, con la card cableada (SUMMARY)

Mi Templo ya no pide por su cuenta my-progress, current-program, enrollments, plan-status ni trial-eligibility: todo sale de `userStore.ensureMemberState()` (promesa compartida con el boot y con el layout). `/sessions/weekly` sale en el mismo tick que el resto apenas hay perfil, deduplicado por clave. La card de hoy recibe sus 10 banderas reales. El layout muestra esqueleto en el saludo sin perfil y recarga los turnos con la zona real.

## Qué quedó

### MiTemplo.vue (`220e55a8b`)
- Quitados: `useProgramsApi`/`getMyProgress`, `useSchedulingApi`/`schedulingApi` (y su `cleanup()`), `createLogger`/`log` (quedó sin uso), refs `programProgress` y `trialEligible`, `loadProgramProgress()`, `loadTrialEligibility()` y el `watch` de plan-status/trial (con el `loadPlanStatus()` de ~:325).
- `programProgress = computed(() => userStore.myProgress)`; `showProgramProgress`/`programProgressCard`/`showProgramCta` y `<ProgramSheet :progress>` siguen igual leyéndolo.
- `onMounted` ya no es `async` ni tiene ningún `await`: `deadline.start()`, `fetchStats()`, `fetchTodayCheckIns()`, `loadTarjetas()`, `novedadesStore.load()`, `sponsorsStore.load()`, `ensureMemberState({ maxAgeMs: MEMBER_STATE_MAX_AGE_MS })`, `if (profile) requestWeeks()`, deep link. `onUnmounted`: `deadline.cleanup()`.
- `onProgramChanged`: `Promise.all([ensureMemberState({ force: true }), requestWeeks({ force: true })])`.
- Dedupe de `/weekly`: `weeksKey()` (zona|nivel|lunes), `weeksInFlight`, `weeksLoadedKey`, `startOrShareWeeks(key)`, `requestWeeks({ force? })` y el watch sobre `[tz, level]`. Nadie llama a `loadWeeks()` fuera de `startOrShareWeeks`.
- `todayCard`: `profileLoading`, `weekLoading`, `programLoading`, `trialLoading`, `statsLoading`, `planFailed`, `bookingsFailed`, `programFailed`, `statsFailed`, `deadlinePassed` cableados; `trialEligible: userStore.trialEligible`; `bookingsLoading: !loaded || loadedTz !== tz`. Los dos `TODO(203-12)` (stats) están donde el plan los pidió. Sin atajo que saque la card del esqueleto sin perfil (lo decide `resolveTodayCard`, G-1).

### MainLayout.vue (`534d49421`)
- Watch de `authStore.isAuthenticated`: `void userStore.ensureMemberState()` reemplaza a `loadPlanStatus()` suelto; `grep -rn loadPlanStatus src --include=*.vue` sin resultados.
- `profileReady`; los dos saludos (desktop y mobile) muestran `q-skeleton` (nombre 160 px, fecha 200 px, sin animación, sin tope) mientras no hay perfil; `memberName` ya no devuelve "Atleta" por falta de perfil.
- Watch nuevo sobre `profile.branchTimezone`: recarga los turnos si `loadedTz !== tz` (con la salvedad de abajo).
- `onVisibilityChange`: además de `load()`, `retryProfileLoad()` si `profileStale`.
- `showPlanBadge` intacto.

## Perfil tardío -> hydrateSelection -> nivel: un solo `/weekly`

Escenario: boot optimista, perfil nulo, el socio ya está en Mi Templo (`onMounted` no pidió la semana: `if (profile)` falso).
1. `retryProfileLoad` hace `setProfile(...)`: la zona pasa de `null` a `X`. Se encola el watch (`prevTz === null`).
2. Sin esperar, `retryProfileLoad` llama `await hydrateSelection()` (lectura local); el watch corre su callback y también hace `await userStore.hydrateSelection()` (lectura idempotente, misma que la otra).
3. Al terminar la primera lectura `selectedLevel` queda en su valor final. Eso dispara el watch por segunda vez (cambió el nivel; `prevTz` ya no es null): llama `requestWeeks()` con la clave final `X|nivel|lunes`: no hay nada en vuelo ni cargado -> `startOrShareWeeks` arranca el UNICO pedido.
4. La primera callback (la de `prevTz === null`) retoma tras su `await`, también llama `requestWeeks()`: misma clave y hay un pedido en vuelo -> comparte la promesa. Si ya terminó, `weeksLoadedKey === key` -> `Promise.resolve()`.
5. Sin override de nivel: el nivel no cambia, el watch dispara una sola vez y pide una sola vez.
Resultado: 1 pedido. Verificarlo en el UAT R-1/C-7 con el log `dev request`.

## Semántica de `force`

`requestWeeks({ force: true })` con un pedido en vuelo NO lo comparte (pudo salir antes del cambio en el server): `weeksInFlight.promise.catch(...).then(() => startOrShareWeeks(weeksKey()))`, o sea espera y encadena UNA recarga. Dos `force` simultáneos: el segundo encuentra la recarga del primero ya en vuelo con la misma clave y la comparte. Sin pedido en vuelo arranca en el acto ignorando `weeksLoadedKey`. Igual que `ensureMemberState({ force: true })` del plan 04 (`forceFullLoad`: espera con `waitInFlight` y encadena una carga completa).

## Conteo de pedidos al arranque en frío, socio con plan activo (presencial), DESPUÉS del plan 11

Base: 19. Después: **16**.

1. `GET /auth/me` - boot (`boot/auth.ts`)
2. `GET /members/subscription/me/subscription` - `ensureMemberState` (boot; el layout y Mi Templo comparten la promesa)
3. `GET /members/subscription/me/plan-status` - idem (un solo plan-status; antes eran dos sueltos: layout + Mi Templo sin plan)
4. `GET /members/scheduling/trial-eligibility` - idem (NUEVO para socios con plan, D-15 del plan 04; sede virtual no lo pide)
5. `GET /members/programs/my-progress` - idem (antes x2)
6. `GET /members/me/enrollments` - idem (antes x2)
7. `GET /members/me/current-program` - idem (antes x2)
8. `GET /communications/me/config` - `MainLayout` (`loadConfig`)
9. `GET /communications/me/prompt` - `MainLayout` (`avisosStore.evaluate`)
10. `GET /members/scheduling/my-bookings?weeks=2` - `MainLayout` (`todayBookingStore.load`, un pedido desde el plan 05; antes x2)
11. `GET /progression/stats` - Mi Templo (`fetchStats`)
12. `GET /check-ins/today` - Mi Templo (`fetchTodayCheckIns`)
13. `GET /communications/me/tarjetas` - Mi Templo (`avisosStore.loadTarjetas`)
14. `GET /communications/me/novedades` - Mi Templo (`novedadesStore.load`)
15. `GET /members/sponsors` - Mi Templo (`sponsorsStore.load`)
16. `GET /sessions/weekly` - Mi Templo (`requestWeeks`, en el montaje, en paralelo)

Cuentas: 19 - 3 (my-progress, current-program y enrollments ya no se repiten) - 1 (my-bookings: 2 -> 1 por el plan 05) + 1 (trial-eligibility ahora también con plan) = 16. El plan decía 17 porque no contaba la baja de my-bookings del plan 05. Socio virtual: 15 (sin trial-eligibility). Los 19 de la base se reconstruyeron del HALLAZGOS (18) + el plan-status del layout; mi lista de 19 coincide en total pero reparte distinto entre "boot/layout" y "Mi Templo" que la tabla del HALLAZGOS (10/8). No incluye `POST /auth/refresh`, ni los POST `seen`/`event`, ni lo que el socio toque en los primeros segundos. Meta de la fase (< 18): cumplida.

## Verificación

- Los greps de `<verify>` de ambas tareas dan OK salvo UNO que falla por formato, no por contenido: el literal `planFailed: userStore.planStatus === null && (userStore.subscriptionFailed || userStore.planStatusFailed)` en una línea. Prettier parte la expresión en dos líneas (supera 100 columnas): `planFailed:` / `userStore.planStatus === null && (userStore.subscriptionFailed || userStore.planStatusFailed),`. Mismo contenido.
- `grep -c 'TODO(203-12)'` = 2; `awk '/onMounted\(/,/^}\)/' | grep await` sin `await` de código (solo aparece la palabra en un comentario); sin `any` ni `console.*`.
- Prettier y eslint (`-c ./eslint.config.js`) pasaron sobre los dos archivos. `vue-tsc` no se corrió (lo hace el orquestador).
- Tests: NO se escribió ninguno. Es cableado (la lógica pura ya está cubierta por `today-card.test.ts`, `user-store-member-state.test.ts` y `today-booking-store.test.ts`) y no hay infraestructura para montar `MiTemplo.vue`/`MainLayout.vue`. La lógica de `requestWeeks` (clave, force que encadena, serialización) vive dentro del SFC por exigencia del criterio de aceptación del plan, así que queda SIN test automático: se cubre en el UAT R-1/C-7. Extraerla a una util con test es la forma de cubrirla si se quiere (cambia el criterio de grep del plan).

## Deviations from Plan

**1. [Rule 1 - Bug, endurecimiento] `requestWeeks` serializa pedidos de claves distintas.**
- `fetchWeekSessions` escribe lo último que llega; con dos pedidos de claves distintas en vuelo, el viejo podía terminar después y pisar la semana con parámetros viejos (p. ej. cambio de nivel durante un pedido). `startOrShareWeeks` ahora, si hay uno en vuelo de otra clave, espera a que termine antes de salir. Misma clave sigue compartiendo la promesa.

**2. [Rule 1 - Bug, endurecimiento] `weeksLoadedKey` solo se fija si la carga no falló** (`weekError.value === null`). `useWeekData.fetchWeekSessions` traga el error y resuelve; sin esto una semana fallida quedaba "cargada" y no se reintentaba al pedir de nuevo la misma clave.

**3. [Rule 2 - hardening] Guarda `disposed` en el watch de la semana.** Tras el `await hydrateSelection()` la página puede haberse desmontado; no se pide la semana de una página muerta. Se fija en `onUnmounted`.

**4. [Rule 1 - Bug] Watch de zona del layout no repite el pedido en vuelo.** El plan decía `loadedTz !== tz` a secas. Con perfil tardío y zona igual a la por defecto (el caso común, Buenos Aires), el watch corre mientras el `load()` del arranque sigue en vuelo (`loadedTz` todavía `null`) y disparaba un segundo my-bookings idéntico. Se salta si `loadedTz === null && tz === (prevTz ?? DEFAULT_BRANCH_TZ)`. Una zona distinta o una carga ya terminada con otra zona sí recarga (la generación del store descarta la respuesta vieja). Conserva el literal `todayBookingStore.loadedTz !== tz`.

**5. [Diseño] Esqueletos del saludo con `tag="span"` + `display: block`, y `line-height: 1.2` explícito en la fecha.** Un `div` dentro de `h1`/`p` no es HTML válido. El alto del esqueleto `type="text"` es `1.2em`; para que el texto real no mueva el layout al llegar se fijó `line-height: 1.2` en `.header-greeting__date` (antes `normal`, diferencia de ~1 px). No se midió contra el navegador.

**6. [Diseño] `bookingsFailed`/`programFailed` se pasan tal cual (`loadFailed`, `programFailed` del store), sin filtrar por "no hay dato previo".** El plan lo pide así y `resolveTodayCard` ya hace ganar al dato conocido (`booking` presente, `program` presente). Consecuencia conservadora: un refresco fallido sobre una lista de reservas vacía pero cargada antes también cae en `neutral` (no afirma "sin turno").

**7. [Diseño] Sin `createLogger` en `MiTemplo.vue`:** quedó sin uso al eliminar `loadProgramProgress`/`loadTrialEligibility`.

## Riesgos antes del plan 12

- **Plan 12 debe reemplazar los 2 `TODO(203-12)`** por `!progressionStore.statsLoaded` y `progressionStore.statsFailed`. La aproximación actual usa `progressionStore.error`, que hoy solo escribe `fetchStats` (`setError`), pero no se limpia al empezar un nuevo `fetchStats`: tras un error previo y con `stats` todavía nulo, `statsFailed` sigue en true hasta que el pedido nuevo responde. Además el template de Mi Templo todavía reemplaza TODA la página por el bloque "Error" cuando `progressionStore.error` es truthy y por el loader cuando `progressionStore.loading` (plan 13): hoy `statsFailed` casi no llega a verse porque la card ni se renderiza en ese caso.
- **`useWeekData.fetchWeekSessions` hace `sessions.value.clear()` al empezar:** en `onProgramChanged` o en un cambio de nivel/zona, `todayRoute` pasa a `null` un instante mientras recarga (titulo de la card con `activityName`). Es del plan 09 y no se tocó; si molesta, conservar el dato previo hasta que llegue el nuevo. No hay bandera `weekFailed` en la card: con `/weekly` caído la card sale sin nombre de rutina (queda lo demás).
- **Otros llamadores de `loadSubscription()` (ahora 6 GET + `force`):** `ReservasPage.vue:2172`, `ReservasPage.vue:2327`, `ProfilePage.vue:259`, `TrainingIndex.vue:45` y `ActivarInvitacionPage.vue:290` (+ `ReservasPageLegacy.vue:778`). Los de montaje (`ProfilePage`, `TrainingIndex`, `ReservasPage:2327`) son de los planes 14/15 y tienen que pasar a `ensureMemberState()`; hasta entonces un socio sin suscripción que entra a esas pantallas dispara 6 GET.
- **`showProgramCta` ("Para vos") sigue usando `programProgress` sin bandera de carga:** la `ProgramCtaCard` aparece y desaparece cuando llega my-progress (candidato 5 del HALLAZGOS). Es del plan 13.
- **Perfil que no llega:** el saludo y la card quedan en esqueleto SIN tope (D-08). Se reintenta en cada navegación (router) y ahora al volver de segundo plano, pero un socio quieto en Mi Templo con la red caída no reintenta solo. Si se quiere, un reintento por evento `online` o por timer en el layout (no está en ningún plan).
- **`bookingsLoading` depende del watch de zona del layout:** si la zona del perfil difiere de `loadedTz` y el watch no corre (p. ej. el layout no está montado), la card de un socio presencial sin turno queda en esqueleto hasta el tope y luego `neutral`. `load()` siempre fija `loadedTz` aunque falle, así que no queda trabada.
- **Orden de arranque con perfil tardío:** `ensureMemberState()` del layout/boot puede salir con `profile === null` y pedir trial-eligibility de un socio virtual (un GET de más solo en ese caso).
- Tipado sin compilador y tests de la fase sin correr (D-17): primera corrida real en CI/typecheck del orquestador. `const promise: Promise<void> = run.then(...).finally(() => ... promise ...)` es una autorreferencia diferida (válida en TS, anotar si el typecheck la marca).

## Known Stubs

Los dos `TODO(203-12)` de `statsLoading`/`statsFailed` en `MiTemplo.vue` son aproximaciones intencionales que el plan 12 reemplaza.

## Threat Flags

Ninguno (sin superficie nueva; T-203-25 mitigado: esqueleto en lugar de "Atleta" y de presencial/virtual adivinado; T-203-26: `retryProfileLoad` es no-op sin necesidad o con un intento en vuelo).

## Self-Check: PASSED

- `MiTemplo.vue` y `MainLayout.vue` modificados y commiteados; commits `220e55a8b` y `534d49421` presentes en `feat/203-carga-sin-parpadeos`.
- Sin cambios en `.planning/STATE.md` ni `.planning/ROADMAP.md`; nada commiteado en el checkout principal.
