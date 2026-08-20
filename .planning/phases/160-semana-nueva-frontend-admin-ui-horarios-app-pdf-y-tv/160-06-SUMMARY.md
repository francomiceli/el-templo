---
phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv
plan: 06
subsystem: api
tags: [drizzle, mysql, scheduling, tenancy-lint, versioning]

# Dependency graph
requires:
  - phase: 159-06
    provides: "getWeeklyGrid deriva Combos/Tecnica/General de la sesion aprobada del dia (D-15/D-16/D-17); patron modeByDay + marcador tenant-safe a replicar"
provides:
  - "Helper compartido scheduling/derived-label.ts (deriveActivityLabel + DERIVED_CLASS_LABEL), consumido por getWeeklyGrid (admin), getMyBookings y getMyWeeklyAttendance (socio) -- SEM-14 cerrado en las 3 superficies de lectura conocidas"
  - "getMyBookings y getMyWeeklyAttendance derivan Combos/Tecnica/General via el metodo privado loadModeByDay(weekStartDate), una query tenant-safe por semana (no por reserva/asistencia)"
  - "el-templo-app en 1.7.6 (version.txt + build.gradle + pbxproj via bump-version.sh) -- cierre de la fase 160 / milestone v5.6"
affects: [milestone-v56-shipping, fase-160-cierre]

tech-stack:
  added: []
  patterns:
    - "Read-model derivation compartida: helper puro (derived-label.ts) consumido por 3 call-sites en 2 archivos, en vez de logica inline duplicada (DRY, sigue el patron de 159-06)"
    - "tenant-safe block-comment exemption replicada en un archivo nuevo (booking-service.ts) que aun no adopto tenantWhere (doc 03 §3)"

key-files:
  created:
    - el-templo-api/src/modules/scheduling/derived-label.ts
    - el-templo-api/test/scheduling/my-bookings-derived-label.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-app/version.txt
    - el-templo-app/src-capacitor/android/app/build.gradle
    - el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj

key-decisions:
  - "loadModeByDay() es un metodo privado de BookingService (no una funcion mas en derived-label.ts): la query depende de this.db (instancia de conexion), mientras que deriveActivityLabel() es logica pura sin IO -- separa claramente derivacion (pura, compartida) de carga de datos (con estado, por servicio). service.ts mantiene su propia carga inline (mismo patron, no se unifico en un tercer sitio porque schedulingService y bookingService no comparten una base comun hoy)."
  - "getMyWeeklyAttendance sumo isSpecial al select existente (antes solo traia activityName crudo) -- sin este campo la guarda D-17 no se podia aplicar en esa ruta; ya traia dayOfWeek, no hizo falta agregarlo."
  - "bump-version.sh corrido (no solo editar version.txt a mano): precedente confirmado en 2 commits anteriores del repo (c3d9f51f, 88b75ac5) -- version.txt es la fuente que lee CI, pero build.gradle/pbxproj se propagan por paridad local en el mismo commit."

requirements-completed: [SEM-14, SEM-10]

duration: ~20min
completed: 2026-08-14
---

# Phase 160 Plan 06: Etiqueta de clase derivada en reservas/asistencia del socio + bump 1.7.6 Summary

**`getMyBookings` y `getMyWeeklyAttendance` (las dos fuentes de ReservasPage) derivan "Combos"/"Técnica"/"General" via un helper compartido con `getWeeklyGrid`, cerrando SEM-14 para el socio; app bumpeada a 1.7.6.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-14
- **Tasks:** 2/2
- **Files modified:** 7 (2 nuevos, 5 modificados)

## Accomplishments

- **Helper compartido `scheduling/derived-label.ts`**: extrae `DERIVED_CLASS_LABEL` y `deriveActivityLabel(activityName, isSpecial, dayMode)` (movidos desde `service.ts`, sin cambio de comportamiento) — fuente única de la regla "solo la actividad genérica 'General' no-especial se renombra, según el `sessionMode` de la sesión aprobada del día".
- **`getWeeklyGrid` (admin, 159-06) refactorizado** para consumir el helper — `derived-class-label.test.ts` sigue verde, cero regresión.
- **`getMyBookings` (reservas del socio)** ahora deriva Combos/Técnica/General: se agregó el método privado `loadModeByDay(weekStartDate)` (una `selectDistinct` sobre `sessions` por semana, marcada `/* tenant-safe: ... */`, mismo patrón no-strict que el resto de `scheduling`) y se aplicó `deriveActivityLabel` fila por fila antes de `mapBookingRow`.
- **`getMyWeeklyAttendance` (línea "Asististe", 2ª fuente de `ReservasPage`)** — el checker había marcado esta ruta como el blocker real: sin ella, un socio podía ver "Técnica" en sus próximas reservas del día pero "General" en lo que ya cursó ese mismo día. Se sumó `isSpecial` al `select` (faltaba; `dayOfWeek` ya estaba) y se aplicó la misma derivación con el mismo `loadModeByDay`.
- **Test de integración nuevo** (`my-bookings-derived-label.test.ts`, 2 casos, MySQL real): reservas (combos/técnica/general/isSpecial-no-renombrado) y asistencia (misma matriz). Usuarios por email (`sem14-derived@test.com`), sin ids hardcodeados.
- **Bump a 1.7.6**: `version.txt` + `build.gradle`/`pbxproj` vía `bump-version.sh` (mismo patrón que los 2 bumps previos del repo).

## Task Commits

1. **Task 1: Helper compartido + getMyBookings + getMyWeeklyAttendance** — `2dd1d00b` (feat)
2. **Task 2: Verificación de superficies + bump 1.7.6** — `2a98a8ca` (chore)

## Files Created/Modified

- `el-templo-api/src/modules/scheduling/derived-label.ts` — nuevo: `deriveActivityLabel` + `DERIVED_CLASS_LABEL`, docblock con los 3 consumidores.
- `el-templo-api/src/modules/scheduling/service.ts` — `getWeeklyGrid` refactor DRY (importa el helper, ya no define `DERIVED_CLASS_LABEL` local).
- `el-templo-api/src/modules/scheduling/booking-service.ts` — imports (`dateToWeekNumber`, `DAY_OF_WEEK_MAP`, `deriveActivityLabel`, `isNull`); método privado `loadModeByDay`; `getMyBookings` y `getMyWeeklyAttendance` derivan antes de devolver; `getMyWeeklyAttendance` suma `isSpecial` al select.
- `el-templo-api/test/scheduling/my-bookings-derived-label.test.ts` — nuevo, 2 tests / 8 aserciones de matriz (reservas + asistencia × combos/técnica/general/isSpecial).
- `el-templo-app/version.txt`, `src-capacitor/android/app/build.gradle`, `src-capacitor/ios/App/App.xcodeproj/project.pbxproj` — 1.7.5 → 1.7.6.

## Mapa de superficies de lectura (Task 2, verificación)

| Superficie | Endpoint | Servicio/método | Estado |
|---|---|---|---|
| Admin `HorariosPage.vue` (`slot.activityName`) | `GET /api/admin/scheduling/schedules/weekly` | `SchedulingService.getWeeklyGrid` | Derivado desde 159-06; refactor DRY de este plan no cambia comportamiento observable. |
| App `ReservasPage.vue` (`slot.activityName`, `nextBooking.activityName`, próximas reservas) | `GET /api/members/scheduling/weekly` → campo `myBookings` | `BookingService.getMyBookings` | Derivado por Task 1 de este plan. |
| App `ReservasPage.vue` (línea "Asististe", `useSessionPlayer`/historial semanal) | `GET /api/members/scheduling/weekly` → campo `myAttendance` | `BookingService.getMyWeeklyAttendance` | Derivado por Task 1 de este plan (el gap que marcó el checker). |

No se encontró ninguna otra superficie del socio con un endpoint distinto que devuelva el nombre crudo — `ReservasPage.vue` consume `useSchedulingApi().getWeeklyGrid()`, que llama a un único endpoint (`/members/scheduling/weekly`) que agrega `slots` (admin/general), `myBookings` y `myAttendance` en una sola respuesta (`Promise.all` en `routes.ts:823-833`). No se tocó ningún `.vue`; gate de `vue-tsc` no aplica a este plan.

## Decisions Made

- Ver `key-decisions` en el frontmatter: `loadModeByDay` como método privado (no función pura compartida) porque necesita `this.db`; `isSpecial` agregado al select de `getMyWeeklyAttendance` porque faltaba para aplicar la guarda D-17; `bump-version.sh` corrido en vez de editar `version.txt` a mano, siguiendo el precedente confirmado en el historial de git (`c3d9f51f`, `88b75ac5`).

## Deviations from Plan

None — plan ejecutado tal como estaba escrito. La única extensión fue correr `bump-version.sh` en vez de editar `version.txt` solo (el plan dejaba ambas opciones abiertas: "usar bump-version.sh si el flujo del repo lo requiere"; se confirmó que sí, por precedente de git log).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification Results

- `pnpm exec tsc --noEmit` (el-templo-api): **verde**, sin `any` nuevos.
- `VITEST_POOL_ID=et159 pnpm vitest run test/scheduling/my-bookings-derived-label.test.ts test/scheduling/derived-class-label.test.ts --hookTimeout=480000` (foreground, MySQL real): **4/4 verde** (2 tests nuevos + 2 tests de regresión de 159-06), sin colisión con otros worktrees en esta corrida (~211s total). Sin procesos vitest huérfanos al finalizar (verificado con `pgrep -af vitest`).
- `pnpm exec tsx src/db/scripts/lint-tenant.ts`: **DISCREPANCIAS: 0**. El nuevo sitio (`booking-service.ts:546`, ahora línea real tras el diff) aparece en el inventario de exenciones `tenant-safe`, no como violación no listada.
- `el-templo-app/version.txt` == `1.7.6` (junto con `build.gradle`/`pbxproj`).
- Sin migraciones nuevas (se reusa la 0204 de 159-06, confirmado — `git status` no muestra cambios en `db/migrations/`).

## Next Phase Readiness

- SEM-14 cerrado en las 3 superficies de lectura del read-model de horarios (`getWeeklyGrid`, `getMyBookings`, `getMyWeeklyAttendance`) que existían al momento de este relevamiento. La fase 160 queda completa (159+160 se shippean juntas, decisión de Franco) — pendiente: verificación final del checker de la fase y el tren a staging/master.
- Nada bloqueante para próximas fases; el helper `derived-label.ts` queda disponible para cualquier superficie de lectura futura que necesite la misma regla.

## Self-Check: PASSED

- `el-templo-api/src/modules/scheduling/derived-label.ts`: FOUND
- `el-templo-api/test/scheduling/my-bookings-derived-label.test.ts`: FOUND
- Commit `2dd1d00b`: FOUND en `git log`
- Commit `2a98a8ca`: FOUND en `git log`

---
*Phase: 160-semana-nueva-frontend-admin-ui-horarios-app-pdf-y-tv*
*Completed: 2026-08-14*
