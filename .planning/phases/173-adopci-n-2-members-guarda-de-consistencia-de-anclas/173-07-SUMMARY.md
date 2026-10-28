---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 07
subsystem: api
tags:
  [
    tenancy,
    multitenancy,
    drizzle,
    scheduling,
    attendance,
    check-ins,
    ratings,
    ado-07,
  ]

requires:
  - phase: 173-05
    provides: "memberCoveredUntilSql(ctx) / buildMemberNameSearchCondition(ctx) — helpers ya scopeados que getSlotDetail y getSlotAttendance ya consumían"
  - phase: 173-17
    provides: "ctx primero en members/service.ts (no hay call sites cruzados desde scheduling/attendance/ratings hacia MemberService)"
provides:
  - "attendance/service.ts, scheduling/{service,trials-service,booking-service,routes}.ts, check-ins/admin-service.ts y ratings/service.ts filtran TODAS sus queries sobre users/member_profiles/user_status_history/user_branches con tenantWhere inline"
  - "Las 12 entradas de allowlist de estos 7 archivos (users/member_profiles/user_status_history/user_branches) desaparecen de la copia de trabajo /tmp/allowlist-173-07.json"
  - "schedulingMemberRoutes y attendanceMemberRoutes ahora atachan attachCountryScope — antes no lo hacían y ningún método member-facing podía resolver ctx"
affects:
  - "173-30 (el switch): estos 7 archivos ya no tienen entradas de tablas members-strict que borrar en su allowlist real"
  - "174/175: booking-service.ts/trials-service.ts quedan con ctx en su borde para cuando scheduling se adopte como módulo completo"

tech-stack:
  added: []
  patterns:
    - "Closures/private helpers llamados desde múltiples call sites (getBookingRecord, getRecordById, recordPresencialSession) reciben ctx como PRIMER parámetro y CADA call site le pasa el que ya resolvió — no hay ctx implícito"
    - "Rutas member-facing que antes no atachaban attachCountryScope (schedulingMemberRoutes, attendanceMemberRoutes) lo ganan como prerequisito para poder usar assertTenant — attachScope ya soporta cualquier rol autenticado, así que el agregado es aditivo y no rompe nada existente"
    - "SQL crudo con nombre de tabla literal (ratings/service.ts getRosterWeek: `JOIN users u`) es un punto ciego del grep por `schema.users` — se filtra con `AND u.tenant_id = ${ctx.tenantId}` inline en el JOIN"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/scheduling/trials-service.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/attendance/routes.ts
    - el-templo-api/src/modules/check-ins/admin-service.ts
    - el-templo-api/src/modules/check-ins/routes.ts
    - el-templo-api/src/modules/ratings/service.ts
    - el-templo-api/src/modules/ratings/routes.ts
    - el-templo-api/test/branch-access.test.ts

key-decisions:
  - "attachCountryScope se agregó al onRequest hook de schedulingMemberRoutes y attendanceMemberRoutes: ninguno de los dos lo llamaba, así que request.scope no existía y assertTenant hubiera explotado contra undefined en runtime. attachScope ya soporta member (rama else final de la función), así que el agregado es puramente aditivo — no cambia comportamiento de ninguna ruta existente, solo habilita el ctx que este plan necesita."
  - "El conteo real de entradas objetivo es 12, no 13 (discrepancia menor del plan, sin impacto): attendance/service.ts (3) + check-ins/admin-service.ts (1) + ratings/service.ts (2) + scheduling/booking-service.ts (1) + scheduling/routes.ts (1) + scheduling/service.ts (2) + scheduling/trials-service.ts (2) = 12. Verificado contra la allowlist real ANTES de tocar código."
  - "getRosterWeek (ratings/service.ts) no estaba en el inventario del plan: usa SQL crudo (`JOIN users u ON u.id = t.coach_id`) que ningún grep por `schema.users` cazaba. Se descubrió corriendo el motor del lint (lintTenantSources) directo contra el archivo, que dio compliant:false en esa línea aunque los otros 4 accesos por query-builder ya estaban filtrados. Se agregó `AND u.tenant_id = ${ctx.tenantId}` inline en el JOIN."
  - "recordPresencialSession (attendance/service.ts, helper privado llamado desde checkIn/forceCheckIn/coachCheckIn) tampoco estaba nombrado en el plan pero tiene una lectura propia de `users` (nivel del socio para elegir blocksCompleted) — se migró con el mismo criterio que el resto del archivo."
  - "check-ins/admin-service.ts no tiene el patrón '404 vs 403' que describe el objetivo del plan (es un dashboard agregado por país/fecha, no una resolución de socio por id que pueda dar 404). El contrato D-06 igual se cumple trivialmente: el archivo nunca tuvo un branch de 403 (grep -c '403' = 0 antes y después)."

requirements-touched: [ADO-02]
# ADO-02 no se marca completo: "members migrado al patrón completo" es cierto
# recién después del switch de 173-30. Este plan es cirugía mínima en 7 archivos
# ajenos al módulo members (D-02).

duration: ~150min
completed: 2026-08-08
---

# Phase 173 Plan 07: Scheduling, attendance, check-ins y ratings — guarda de consistencia de socios Summary

**Los 7 archivos por los que un socio entra al gimnasio (grilla, turno de prueba, reserva, check-in QR/coach, asistencia y rating) resuelven el socio SIEMPRE dentro del `ctx.tenantId` del request — incluidas dos rutas member-facing (`schedulingMemberRoutes`, `attendanceMemberRoutes`) que hasta ahora ni siquiera resolvían `request.scope`.**

## Performance

- **Duration:** ~150 min
- **Completed:** 2026-08-08
- **Tasks:** 2/2
- **Files modified:** 11 (7 del plan + 4 rutas/test companion)

## Task Commits

1. **Task 1: scheduling — service, trials-service, booking-service y routes** — `1ee3f851`
2. **Task 2: attendance, check-ins y ratings** — `c2cfcb4b`

---

## Task 1 — scheduling

### `scheduling/service.ts`

`getSlotDetail` ya tenía `ctx` (plan 173-05, solo filtraba `subscriptions` vía `memberCoveredUntilSql`). Se agregó `tenantWhere` inline en los 2 joins que le faltaban: `innerJoin(schema.users, ...)` y `leftJoin(schema.memberProfiles, ...)`. `bookings`/`schedules` no se tocaron (D-02).

### `scheduling/trials-service.ts`

Los 7 métodos públicos NO tenían `ctx` (el archivo no importaba `TenantContext` en absoluto, contrario a lo que sugería el CONTEXT — verificado que 173-17 tampoco lo tocó, solo `members/service.ts`). Se agregó `ctx: TenantContext` primero a los 7: `reserveTrialSelfService`, `getTrialEligibility`, `cancelTrialSelfService`, `bookTrial`, `rescheduleTrial`, `listEligibleTrials`, `listTrials`. Filtran `users` (7 statements) y `user_status_history` (2 inserts, vía `tenantValues`).

### `scheduling/booking-service.ts`

4 statements tocaban `users`: `reserve` (rol del actor), `getMyBookings` (join), `previewScheduleDeletion` (join) y el privado `getBookingRecord` (join, llamado desde `reserve`/`cancel`/`adminAddBooking`). Los 5 métodos + `cancel`/`adminAddBooking` (que no tocan `users` directo pero llaman a `getBookingRecord`) recibieron `ctx` primero.

### `scheduling/routes.ts` — inventario de `fastify.db` con veredicto

| Línea           | Contexto                                                                     | Toca tabla del módulo (`users`)            | Acción                   |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------------ | ------------------------ |
| 81-108, 773-801 | Inyección de dependencias en constructores (`new XService(fastify.db, ...)`) | No                                         | Ninguna                  |
| 127, 817        | `attachCountryScope(request, fastify.db)` (817 es NUEVO — plugin member)     | No es query                                | Ninguna                  |
| 833-839         | `GET /weekly` fallback: resuelve `branchId` del socio desde `users`          | Sí                                         | `tenantWhere` inline     |
| 1042-1048       | `GET /branches`: resuelve país de la sede del socio (`users` + `branches`)   | Sí (`users`); `branches` no se toca (D-02) | `tenantWhere` en `users` |
| 1062-1067       | `GET /branches`: segunda query, lista sedes activas no-virtuales             | No (solo `branches`)                       | Ninguna                  |

**Admin plugin** (`schedulingAdminRoutes`, ya tenía `attachCountryScope`): se agregó `const ctx = assertTenant(...)` a los 7 handlers cuyos services ahora piden `ctx` — `adminAddBooking`, `previewScheduleDeletion`, `bookTrial`, `rescheduleTrial`, `listEligibleTrials`, `listTrials`.

**Member plugin** (`schedulingMemberRoutes`): **no tenía `attachCountryScope`** en su `onRequest` — se agregó (aditivo, `attachScope` ya soporta cualquier rol). Se agregó `assertTenant` a los 8 handlers que ahora lo necesitan: `GET /weekly`, `POST /reserve`, `POST /reserve-trial`, `POST /cancel-trial`, `GET /trial-eligibility`, `DELETE /bookings/:bookingId`, `GET /my-bookings`, `GET /branches`.

### Verificación de Task 1

| Comando                                                                                              | Resultado                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| `pnpm exec tsc -p tsconfig.test-check.json --noEmit` (crudo)                                         | limpio en `src/`; 185 preexistentes en `test/` (ver ratchet abajo) |
| `pnpm run typecheck:tests` (ratchet)                                                                 | `DISCREPANCIAS: 0` — 185/185 baseline, 0 nuevos, `TS2554: 0`       |
| `pnpm exec tsc --noEmit` (build, `src/` solo)                                                        | limpio                                                             |
| `pnpm exec vitest run --no-file-parallelism test/scheduling`                                         | **170/170** (11 archivos)                                          |
| `grep -rnE "tenantId!                                                                                | tenantId\s\*\?\?" src/modules/scheduling/`                         | 0 líneas |
| `git diff` — `tenantWhere(schema.(bookings\|schedules\|activities\|holidays\|classCoachAssignments)` | 0 coincidencias (D-02 intacto)                                     |

---

## Task 2 — attendance, check-ins y ratings

### `attendance/service.ts`

10 statements sobre `users`/`member_profiles`/`user_branches` (más que las 3 "entradas de allowlist" porque el mismo archivo+tabla puede tener varios accesos). `ctx` primero en: `checkIn`, `coachSelfScan` (privado, `user_branches`), `getSlotAttendance` (ya tenía `ctx` desde 173-14 — se completó con `tenantWhere` en sus 2 joins a `users` + 2 a `member_profiles`), `forceCheckIn`, `coachCheckIn`, `listAttendance`/`getMemberAttendance`, `getRecordById` (privado, 4 call sites) y `recordPresencialSession` (privado, hallazgo no listado en el plan — ver Deviations).

`grep -c "tenantWhere" src/modules/attendance/service.ts` → **11** (≥ 3 pedido).

### `attendance/routes.ts`

Admin plugin (ya tenía `attachCountryScope`): `assertTenant` agregado a `GET /member/:userId`, `POST /force`, `POST /slot/:scheduleId/:date/check-in`. `DELETE /:attendanceId` (removeCheckIn) no lo necesita — no toca `users` ni llama a `getRecordById`.

Member plugin (`attendanceMemberRoutes`): **no tenía `attachCountryScope`** — se agregó. `assertTenant` en `POST /check-in` y `GET /history`.

### `check-ins/admin-service.ts`

El docblock de objetivo del plan describe "resolución del socio del check-in con contrato 404/socio-inexistente" — el archivo real es un dashboard agregado (summary + zonas del cuerpo + listado paginado por (socio, día), filtrado por país), sin resolución de un socio individual por id. Se migró con el criterio real del archivo: `ctx` primero en `getAdminCheckIns` y sus 4 helpers privados que joinean `users` (`fetchSummary`, `fetchBodyAreas`, `countDays`, `fetchDayRows`). `check_in_responses` y `branches` no son tablas del módulo `members` — no se tocan (D-02).

`grep -c "403" src/modules/check-ins/admin-service.ts` → **0** (antes y después — el contrato D-06 nunca dependió de un 403 acá).

### `ratings/service.ts`

`ctx` primero en `getCoachesForBranch` (`users` + `user_branches`), `upsertRosterAssignment` (ídem), `getOwnerRatings` (2 joins a `users`) y **`getRosterWeek`** (hallazgo — ver Deviations, SQL crudo con `JOIN users u`).

### `ratings/routes.ts`

Todos los call sites viven en el plugin admin (ya tenía `attachCountryScope`): se agregó `assertTenant` a `GET /coaches`, `GET /roster`, `POST /roster`, `GET /` (owner ratings). El plugin member (`ratingsMemberRoutes`) no se tocó — `getPendingRating`/`submitRating` no tocan `users`/`user_branches`.

### Verificación de Task 2

| Comando                                                                                  | Resultado                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run typecheck:tests` (ratchet, tras Task 2)                                        | `DISCREPANCIAS: 0`                                                                                                             |
| `pnpm exec tsc --noEmit`                                                                 | limpio                                                                                                                         |
| `pnpm exec vitest run --no-file-parallelism test/attendance test/check-ins test/ratings` | **70/70** (6 archivos: ratings 24, attendance 16, check-ins-admin 11, especial-consumption 5, check-ins 11, coach-self-scan 3) |
| `grep -c "tenantWhere" src/modules/attendance/service.ts`                                | 11                                                                                                                             |
| `grep -c "403" src/modules/check-ins/admin-service.ts`                                   | 0                                                                                                                              |

---

## Verificación conjunta (bloque `<verification>` del plan)

| Comando                                                                                                                                            | Resultado                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm lint:tenant --allowlist=/tmp/allowlist-173-07.json` (tras remover las 12 entradas objetivo de la copia de trabajo)                           | `unlistedViolations: 0` — las 12 entradas no reaparecen |
| `pnpm exec tsc -p tsconfig.test-check.json --noEmit` (vía ratchet)                                                                                 | `DISCREPANCIAS: 0`                                      |
| `pnpm exec vitest run --no-file-parallelism test/scheduling test/attendance test/check-ins test/ratings`                                           | **240/240** (170 + 70, corridos en dos tandas)          |
| `pnpm exec tsc --noEmit`                                                                                                                           | limpio                                                  |
| Motor del lint (`lintTenantSources`) corrido directo contra los 7 archivos, filtrado por `users/member_profiles/user_status_history/user_branches` | 42 accesos totales, **0 no-compliant**                  |

---

## Deviations from Plan

### [Rule 1 — hallazgo, no bug pero sí cobertura faltante] `getRosterWeek` (ratings/service.ts) usa SQL crudo, invisible al grep

- **Found during:** Task 2, verificación final con el motor del lint corrido directo (no confié solo en `grep -n "schema\.users"`).
- **Issue:** `getRosterWeek` arma el roster semanal con `this.db.execute(sql\`...JOIN users u ON u.id = t.coach_id...\`)`. Ningún grep por `schema.users`lo encuentra porque nombra la tabla por texto en un template`sql`. El lint (`kind: "sql-template"`) sí lo detectó: `compliant: false`en esa línea, y por eso`ratings/service.ts — users`no aparecía en`staleNoLongerViolating` aunque los otros 4 accesos por query-builder ya estaban filtrados.
- **Fix:** `ctx: TenantContext` primero en `getRosterWeek`, y `AND u.tenant_id = ${ctx.tenantId}` inline en el `JOIN`. Call site (`GET /roster` en `ratings/routes.ts`) actualizado con `assertTenant`.
- **Files:** `el-templo-api/src/modules/ratings/service.ts`, `el-templo-api/src/modules/ratings/routes.ts`.
- **Commit:** `c2cfcb4b`.

### [Rule 2 — funcionalidad crítica faltante] `attachCountryScope` ausente en 2 plugins member-facing

- **Found during:** Task 1, al mapear cómo `reserveTrialSelfService`/`bookingService.reserve`/`checkIn` iban a obtener `ctx` en rutas que NO son admin.
- **Issue:** `schedulingMemberRoutes` y `attendanceMemberRoutes` solo llamaban `fastify.authenticate` en su `onRequest` — nunca `attachCountryScope`. Sin eso, `request.scope` es `undefined` y `assertTenant(request.scope, ...)` hubiera lanzado un `TypeError` en runtime (no un 403 controlado) apenas se llamara cualquier ruta member-facing de estos dos módulos.
- **Fix:** se agregó `await attachCountryScope(request, fastify.db);` al hook `onRequest` de ambos plugins. `attachScope` ya resuelve el scope para cualquier rol autenticado (rama `else` final = member), así que el cambio es aditivo: ninguna ruta existente cambia de comportamiento, solo se habilita `request.scope` para las rutas que este plan necesita.
- **Files:** `el-templo-api/src/modules/scheduling/routes.ts`, `el-templo-api/src/modules/attendance/routes.ts`.
- **Commits:** `1ee3f851`, `c2cfcb4b`.

### [Rule 3 — bloqueante] `test/branch-access.test.ts` llamaba a `BookingService.reserve()` con la firma vieja

- **Found during:** Task 1, `pnpm run typecheck:tests` tras cambiar la firma de `reserve`.
- **Issue:** 2 tests (`describe("Staff multibranch bypass...")`) construyen `BookingService` directo (sin pasar por rutas) y llamaban `bookings.reserve(memberId, scheduleId, date)` — 3 args, ahora requiere 4 (`ctx` primero). El ratchet lo cazó como `TS2554: 2` (drift de firma, baseline 0).
- **Fix:** se agregó `const CTX: TenantContext = { tenantId: 1 };` (mismo idioma que `test/finance/validation-regression.test.ts`) y se pasó como primer argumento en los 2 call sites.
- **Files:** `el-templo-api/test/branch-access.test.ts`.
- **Commit:** `1ee3f851`.

### [Hallazgo de plan, no bloqueante] `recordPresencialSession` (attendance/service.ts) no estaba en el inventario

- El helper privado (llamado desde `checkIn`/`forceCheckIn`/`coachCheckIn`) lee `schema.users.level` para elegir los `blocksCompleted` de la sesión espejo. No estaba mencionado en el plan ni en el 173-02-SUMMARY, pero es una lectura real de `users` dentro del archivo objetivo — se migró con el mismo criterio (`ctx` primero, `tenantWhere` inline).

### [Hallazgo de plan, no bloqueante] Conteo real de entradas: 12, no 13

- Verificado ANTES de tocar código contra la allowlist real del repo (no la snapshot vieja de 173-06, que ya estaba desactualizada por los 6 planes que corrieron entremedio — 08, 09, 11, 13, 15, 16, 17): `attendance/service.ts` (3) + `check-ins/admin-service.ts` (1) + `ratings/service.ts` (2) + `scheduling/booking-service.ts` (1) + `scheduling/routes.ts` (1) + `scheduling/service.ts` (2) + `scheduling/trials-service.ts` (2) = **12**. Sin impacto en el criterio de aceptación real (`pnpm lint:tenant` reportando CERO entradas de estos 7 archivos), que se cumple.

---

**Total deviations:** 5 (1 Rule 1 — hallazgo SQL crudo, 1 Rule 2 — attachCountryScope faltante, 1 Rule 3 — bloqueante en test, 2 hallazgos de plan sin impacto).
**Impact on plan:** Los 3 primeros eran necesarios para que el diff compilara y para que el invariante de seguridad se sostuviera de verdad (sin `attachCountryScope` el ctx nunca hubiera llegado a las queries member-facing). Sin scope creep: ningún cambio toca `bookings`/`schedules`/`activities`/`holidays`/`class_coach_assignments`.

## Known Stubs

Ninguno. Este plan es cirugía de queries — ningún endpoint queda sirviendo datos vacíos/mock.

## Threat Flags

Ninguno nuevo — las 4 mitigaciones del `<threat_model>` del plan quedaron verificadas:

| Threat ID   | Mitigación                                                                 | Evidencia                                                                                                                             |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| T-173-07-01 | `tenantWhere` inline sobre `users` en la resolución del socio del check-in | `checkIn`/`coachCheckIn`/`forceCheckIn`/`getRecordById` filtran `users`; un socio de otro gimnasio no matchea                         |
| T-173-07-02 | 404/socio-inexistente, nunca 403                                           | `grep -c "403" check-ins/admin-service.ts` = 0 (antes y después); ningún archivo de este plan agregó una rama 403 nueva               |
| T-173-07-03 | `member_profiles` en listados de clase                                     | `tenantWhere` inline en los 2 `leftJoin(schema.memberProfiles, ...)` de `attendance/service.ts` y `scheduling/service.ts`             |
| T-173-07-04 | `user_branches` sin filtro en ratings                                      | `tenantWhere` inline en `getCoachesForBranch`/`upsertRosterAssignment` (ratings/service.ts) y `coachSelfScan` (attendance/service.ts) |

## Self-Check: PASSED

- `el-templo-api/src/modules/scheduling/service.ts` — FOUND, `tenantWhere` en los 2 joins de `getSlotDetail`
- `el-templo-api/src/modules/scheduling/trials-service.ts` — FOUND, 7 métodos con `ctx: TenantContext` primero
- `el-templo-api/src/modules/scheduling/booking-service.ts` — FOUND, `reserve`/`cancel`/`getMyBookings`/`adminAddBooking`/`previewScheduleDeletion`/`getBookingRecord` con `ctx` primero
- `el-templo-api/src/modules/scheduling/routes.ts` — FOUND, `attachCountryScope` en `schedulingMemberRoutes`, 15 `assertTenant` nuevos/existentes
- `el-templo-api/src/modules/attendance/service.ts` — FOUND, 11 `tenantWhere`
- `el-templo-api/src/modules/attendance/routes.ts` — FOUND, `attachCountryScope` en `attendanceMemberRoutes`
- `el-templo-api/src/modules/check-ins/admin-service.ts` — FOUND, `ctx` primero en los 4 helpers privados
- `el-templo-api/src/modules/ratings/service.ts` — FOUND, `ctx` primero en 4 métodos + `getRosterWeek`
- `el-templo-api/test/branch-access.test.ts` — FOUND, `CTX: TenantContext = { tenantId: 1 }`
- Commit `1ee3f851` — FOUND (`git log --oneline`)
- Commit `c2cfcb4b` — FOUND (`git log --oneline`)
- `pnpm run typecheck:tests` → `DISCREPANCIAS: 0`
- `pnpm exec vitest run --no-file-parallelism test/scheduling` → 170/170
- `pnpm exec vitest run --no-file-parallelism test/attendance test/check-ins test/ratings` → 70/70
- `pnpm lint:tenant --allowlist=/tmp/allowlist-173-07.json` (copia de trabajo, no commiteada) → `unlistedViolations: 0`, 12 entradas objetivo removidas
- `git status --porcelain` (worktree `et-173`) — vacío tras cada commit

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_
