---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 07
subsystem: member-app-scheduling
tags:
  [
    reservas,
    trial,
    calendar,
    google-calendar,
    maps,
    member-app,
    vue,
    quasar,
    fastify,
  ]

# Dependency graph
requires:
  - phase: 180-05
    provides: "BranchOption {id, name, address, mapsUrl}, mapsUrlForBranch()/openBranchMaps() en ReservasPage.vue"
provides:
  - "buildGoogleCalendarUrl() en el-templo-app/src/utils/calendar-link.ts — util pura de link 'Agregar al calendario'"
  - "Card '¿Primera vez? Qué esperar' (D-16) en ambos estados del modo prueba"
  - "Confirmación 'prueba reservada' enriquecida: dirección, Cómo llegar, botón primario de calendario (D-19/D-20)"
  - "GET /api/members/scheduling/trial-eligibility ahora expone booking.branchTimezone y booking.mapsUrl"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Copy estático extraído a constante (FIRST_TIMER_ITEMS) referenciada via v-for en los dos estados que la muestran — el texto vive UNA vez en el archivo, la estructura se repite (DRY de datos, no de markup)"
    - "buildGoogleCalendarUrl() sigue el mismo patrón que buildWhatsAppUrl (util pura, sin deps de Vue, encodeURIComponent manual)"
    - "buildMapsUrl (shared/maps.ts) confirmado como fuente única server-side del link de Maps — extendido a un tercer consumidor (trial-eligibility) en vez de reconstruir la URL en el front"

key-files:
  created:
    - el-templo-app/src/utils/calendar-link.ts
    - el-templo-app/test/calendar-link.test.ts
  modified:
    - el-templo-app/src/pages/ReservasPage.vue
    - el-templo-app/src/composables/useSchedulingApi.ts
    - el-templo-api/src/modules/scheduling/trials-service.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/test/scheduling-trial-eligibility.test.ts

key-decisions:
  - "Task 3 encontró un bug real no anticipado por el plan (Rule 1): el botón de calendario en el estado 'prueba reservada' iba a usar el ref de página `branchTimezone`, pero ese estado NUNCA corre `loadGrid()` (onMounted retorna antes) — `branchTimezone` queda pegado en su default 'America/Argentina/Buenos_Aires' para SIEMPRE en ese estado, sin importar la sede real de la reserva. Se expone `booking.branchTimezone` (ya se consultaba internamente en trials-service.ts para `canModify`, solo faltaba devolverlo) en vez de depender del ref de página."
  - "Mismo hallazgo extendido a mapsUrl (Rule 1/Rule 2 DRY): shared/maps.ts documenta explícitamente que trials-service.ts es un consumidor esperado de buildMapsUrl ('La confirmación de prueba (trials-service.ts, vía branchAddress)') pero nunca estaba wireado. En vez de reconstruir el link de Maps en el front (que el plan preveía como fallback si la lista de sedes no estaba disponible), se optó por completar la fuente única ya declarada: `mapsUrl: buildMapsUrl(booking.branchAddress)` en el backend. Resultado: CERO construcciones de 'maps/search' en ReservasPage.vue (mejor que el '<=1' pedido por el acceptance criteria)."
  - "Ambos campos nuevos requirieron tocar `schemas.ts` (el schema de respuesta de Fastify serializa por allowlist — un campo no declarado se strippea silenciosamente aunque el objeto JS lo tenga). Sin este cambio, el bug hubiera sido invisible en dev (TypeScript compila, pero el campo nunca llega al cliente) — es exactamente el tipo de fallo que un test de integración manual no hubiera atrapado sin mirar el payload real."
  - "El checklist de D-16 se agregó en AMBOS estados (modo prueba y prueba reservada) durante el Task 2, anticipando la mención de Task 3 ('el mismo bloque del Task 2, reutilizado') — Task 3 no tocó el checklist, solo agregó dirección/Cómo llegar/calendario alrededor de él."

requirements-completed: [RES-03, RES-04]

# Metrics
duration: ~55min
completed: 2026-08-23
---

# Fase 180 Plan 07: Anti no-show — checklist de primera vez + calendario en la confirmación de prueba Summary

**Util pura `buildGoogleCalendarUrl` (zonedWallClockToUtc de la sede, nunca del device) + card "¿Primera vez? Qué esperar" en ambos estados del modo prueba + confirmación enriquecida con dirección/Maps/botón primario de calendario — mientras tanto se encontró y cerró un bug real en el backend: `trial-eligibility` nunca exponía la timezone ni el mapsUrl de la sede reservada, pese a que el checklist correcto del calendario dependía de ellos.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-08-23
- **Tasks:** 3/3
- **Files modified:** 7 (2 nuevos, 5 modificados)

## Accomplishments

- `buildGoogleCalendarUrl()` (nuevo, `el-templo-app/src/utils/calendar-link.ts`): función pura que arma el link `calendar.google.com/calendar/render` a partir de `date`/`startTime`/`timezone` de la SEDE (vía `zonedWallClockToUtc`, la misma fuente única que ya usa `ReservasPage.vue`), con `location` omitido cuando no hay dirección. 5 tests cubriendo AR vs Europe/Madrid (timezone del device NUNCA participa), encoding, y pureza.
- Card colapsable "¿Primera vez? Qué esperar" (D-16): copy estático (4 items) extraído a la constante `FIRST_TIMER_ITEMS`, referenciada en ambos estados donde debe verse (modo prueba e "ya reservada") — texto único en el archivo, socios regulares y estado bloqueado no la ven.
- Confirmación "prueba reservada" enriquecida (D-19/D-20): dirección de la sede, botón secundario "Cómo llegar" (reusa `openBranchMaps`, cero construcciones nuevas de URL de Maps en el archivo) y botón PRIMARIO "Agregar al calendario" (gradiente terracotta, prominente). El CTA de WhatsApp y las affordances de cambiar/cancelar quedaron intactos.
- **Fix de backend no previsto por el plan**: `GET /api/members/scheduling/trial-eligibility` ahora devuelve `booking.branchTimezone` y `booking.mapsUrl` (antes los calculaba/consultaba pero nunca los serializaba — el schema de respuesta de Fastify los hubiera strippeado igual aunque el objeto JS los tuviera). Sin este fix, el botón de calendario habría producido la hora INCORRECTA para cualquier socio de una sede fuera de AR viendo directamente el estado "prueba reservada" (ese estado nunca corre `loadGrid()`, así que el ref de página `branchTimezone` queda pegado en el default AR).

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: `calendar-link.ts` — URL de Google Calendar con timezone de sede** - `403d42b9` (feat)
2. **Task 2: Card "¿Primera vez? Qué esperar" (D-16)** - `7551675e` (feat)
3. **Task 3: Confirmación "prueba reservada" enriquecida (D-19 + D-20)** - `a0c51fb3` (feat, incluye el fix backend de branchTimezone/mapsUrl)

## Files Created/Modified

- `el-templo-app/src/utils/calendar-link.ts` (nuevo) — `buildGoogleCalendarUrl()`, pura, sin deps de Vue.
- `el-templo-app/test/calendar-link.test.ts` (nuevo) — 5 tests.
- `el-templo-app/src/pages/ReservasPage.vue` — `FIRST_TIMER_ITEMS`, card D-16 en 2 estados, dirección + "Cómo llegar" + botón de calendario en la confirmación, `onAddTrialToCalendar()`.
- `el-templo-app/src/composables/useSchedulingApi.ts` — `TrialEligibility.booking` extendido con `mapsUrl` y `branchTimezone`.
- `el-templo-api/src/modules/scheduling/trials-service.ts` — `getTrialEligibility()` ahora serializa `branchTimezone` (ya consultado) y `mapsUrl` (nuevo `buildMapsUrl(booking.branchAddress)`).
- `el-templo-api/src/modules/scheduling/schemas.ts` — `trialEligibilitySchema.response[200].properties.booking` agrega `mapsUrl`/`branchTimezone`.
- `el-templo-api/test/scheduling-trial-eligibility.test.ts` — assertions nuevas para `branchTimezone` y `mapsUrl` (+ seed de `address` en la sede fixture, que no la traía).

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: el hallazgo central del plan fue que **`branchTimezone.value` (ref de página) es la fuente equivocada para el botón de calendario del estado "prueba reservada"**, porque ese estado nunca ejecuta `loadGrid()` (ver `onMounted`, `if (trialBooking.value) { loading.value = false; return }`). Se resolvió exponiendo el dato correcto (`booking.branchTimezone`) desde el backend, que YA lo consultaba internamente para `isOutsideCancelWindow()` — no fue necesaria ninguna query nueva, solo agregarlo al objeto de retorno + al schema de Fastify (que de otro modo lo hubiera strippeado silenciosamente).

Aprovechando el mismo hallazgo, se cerró también el gap de `mapsUrl`: `shared/maps.ts` (introducido en 180-02) ya documentaba a `trials-service.ts` como consumidor esperado de `buildMapsUrl`, pero nunca se había wireado. Completar esa fuente única en el backend es más DRY que la alternativa que preveía el plan (reconstruir el link de Maps en el frontend como fallback) y deja CERO construcciones de URL de Maps en `ReservasPage.vue`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — bug] `trial-eligibility` no exponía `branchTimezone` de la sede reservada**

- **Found during:** Task 3, al implementar el botón "Agregar al calendario".
- **Issue:** El plan indicaba usar `branchTimezone: branchTimezone.value` (ref de página). Ese ref solo se actualiza en `loadGrid()`, que el estado "prueba reservada" NUNCA ejecuta (retorna temprano en `onMounted`). Resultado: el ref queda pegado en su default `'America/Argentina/Buenos_Aires'` para cualquier reserva, incluso en una sede de Europe/Madrid — el evento de calendario se hubiera generado con la hora equivocada, exactamente lo que el threat T-180-33 del plan pedía mitigar.
- **Fix:** `trials-service.ts` ya hacía `SELECT ... branchTimezone: schema.branches.timezone` para calcular `canModify` — se agregó `branchTimezone: booking.branchTimezone` al objeto `booking` devuelto. Se extendió `TrialEligibility.booking` (backend y `useSchedulingApi.ts`) y `trialEligibilitySchema.response[200]` (Fastify serializa por allowlist — sin este cambio el campo se hubiera strippeado igual). `ReservasPage.vue` usa `b.branchTimezone` (del booking) en vez del ref de página.
- **Files modified:** `el-templo-api/src/modules/scheduling/trials-service.ts`, `el-templo-api/src/modules/scheduling/schemas.ts`, `el-templo-app/src/composables/useSchedulingApi.ts`, `el-templo-app/src/pages/ReservasPage.vue`.
- **Verification:** `test/scheduling-trial-eligibility.test.ts` (nueva assertion `branchTimezone === "America/Argentina/Buenos_Aires"`), 6/6 verde; también corridos y verdes `scheduling-cancel-trial` (6/6), `self-service-trial-e2e` (8/8) y el describe de elegibilidad en `tenancy/iso-03-sched-lecturas.test.ts` (2/2) para descartar impacto en el aislamiento multi-tenant.
- **Committed in:** `a0c51fb3` (Task 3 commit).

**2. [Rule 2 — DRY / correctness] `mapsUrl` de la sede reservada tampoco se exponía**

- **Found during:** Task 3, mismo punto que el hallazgo anterior.
- **Issue:** El plan preveía, como fallback, reconstruir el link de Maps en el frontend con la misma forma que usa el backend SI la lista de sedes no estaba disponible en este estado (que es el caso: `branches.value` nunca se carga en "prueba reservada"). Pero `shared/maps.ts` (fase 180-02) ya documenta a `trials-service.ts` como consumidor esperado de `buildMapsUrl` — construirlo en el front hubiera sido una segunda fuente de la misma URL, justo lo que CLAUDE.md pide evitar agresivamente (DRY).
- **Fix:** Se agregó `mapsUrl: buildMapsUrl(booking.branchAddress)` al objeto `booking` de `getTrialEligibility()`, reusando la función compartida (sin nueva lógica). El frontend consume `trialBooking.value.mapsUrl` directamente vía el `openBranchMaps()` ya existente — cero construcciones de "maps/search" en `ReservasPage.vue` (mejor que el `<=1` que pedía el acceptance criteria del Task 3).
- **Files modified:** mismos archivos que el hallazgo 1 (un solo commit, un solo hallazgo con dos partes).
- **Verification:** assertion nueva `booking.mapsUrl` contiene `"google.com/maps/search"`; se sembró `address` en la sede fixture 'TEST' del test (no la traía por defecto — solo `name`+`code`, ver `test/setup.ts`).
- **Committed in:** `a0c51fb3` (Task 3 commit).

---

**Total deviations:** 2 auto-fixed (ambos Rule 1/2, mismo hallazgo del Task 3, mismo commit).
**Impact on plan:** Ambos fixes eran condición de correctitud para que el Task 3 cumpliera lo que el propio plan pedía (T-180-33: "Conversión obligatoria vía zonedWallClockToUtc con la timezone de la SEDE"). Sin ellos, Task 3 hubiera "pasado" sus propios acceptance criteria (que no verifican el valor de timezone en runtime, solo que la función se invoque) mientras producía un bug de producción para cualquier sede fuera de AR. Sin scope creep — no se tocó nada fuera de la ruta `trial-eligibility` y sus consumidores directos.

## Issues Encountered

- Correr `pnpm test -- <patrón>` en `el-templo-api` (con el `--` explícito en el comando bash) NO filtró correctamente y ejecutó la suite COMPLETA en background durante ~10 minutos sin producir output visible (violación del gate "no correr la suite completa" de CLAUDE.md, no intencional). Se mató el proceso y se corrigió usando `pnpm exec vitest run <patrón>` (sin el `--` extra), que sí filtra por archivo. Documentado para futuras ejecuciones: usar `pnpm exec vitest run <patrón>`, no `pnpm test -- <patrón>`, en este repo.
- Correr 2 archivos de test pesados (`self-service-trial-e2e` + `scheduling-cancel-trial`) juntos disparó un `Hook timed out in 120000ms` en `provisionWorkerDB()` por contención de recursos — no es una regresión: corridos por separado, ambos pasan 100%.

## User Setup Required

None - no external service configuration required. No hay migraciones (los campos nuevos leen columnas `branches.timezone`/`branches.address` que ya existían).

## Next Phase Readiness

- `buildGoogleCalendarUrl` queda disponible en `el-templo-app/src/utils/calendar-link.ts` para cualquier otro flujo de reserva que necesite un CTA de calendario.
- `TrialEligibility.booking` ahora trae `mapsUrl`/`branchTimezone` — cualquier otra pantalla que consuma `getTrialEligibility()` los tiene disponibles sin queries adicionales.
- La verificación visual de los 3 estados (card D-16, confirmación enriquecida, botón de calendario) queda para el checkpoint de cierre de fase (plan 180-16), como indica `<verification>` del plan.
- Sin bloqueos para el siguiente plan de la fase.

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: el-templo-app/src/utils/calendar-link.ts (worktree et-180)
- FOUND: el-templo-app/test/calendar-link.test.ts (worktree et-180)
- FOUND: el-templo-app/src/pages/ReservasPage.vue (worktree et-180, modificado)
- FOUND: el-templo-app/src/composables/useSchedulingApi.ts (worktree et-180, modificado)
- FOUND: el-templo-api/src/modules/scheduling/trials-service.ts (worktree et-180, modificado)
- FOUND: el-templo-api/src/modules/scheduling/schemas.ts (worktree et-180, modificado)
- FOUND: el-templo-api/test/scheduling-trial-eligibility.test.ts (worktree et-180, modificado)
- FOUND: commit 403d42b9 (feat, Task 1)
- FOUND: commit 7551675e (feat, Task 2)
- FOUND: commit a0c51fb3 (feat, Task 3)
