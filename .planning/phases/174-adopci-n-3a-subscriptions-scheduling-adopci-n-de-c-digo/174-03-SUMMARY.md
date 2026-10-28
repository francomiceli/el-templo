---
phase: 174-adopci-n-3a-subscriptions-scheduling-adopci-n-de-c-digo
plan: 03
subsystem: api
tags: [tenancy, multi-tenant, scheduling, bookings, drizzle, mysql]

# Dependency graph
requires:
  - phase: 174-01
    provides: patrón tenantWhere/tenantValues ya aplicado en subscriptions/service.ts (ctx disponible en assignPlan/changeFixedSchedules/editSubscriptionStartDate/pauseSubscription/cancelSubscription/changePlanNow/changePlanAfterCurrent/renewSubscription)
provides:
  - "booking-service.ts: 15/15 sitios de bookings, 3/3 branches (reserve), 1/1 attendance, 1/1 subscriptionSchedules, 1/1 subscriptions, 1/1 schedules filtrados por tenantWhere"
  - "holidays (3 sitios) y scheduleExceptions (2 sitios) con tenantWhere junto al filtro de country/fecha existente (D-02)"
  - "3 inserts de bookings con tenantValues(ctx, {...})"
  - "ctx threading requerido en 7 métodos antes sin ctx: getMyWeeklyAttendance, adminRemoveBooking, cancelBookingsFromDateAndGrantCredits, findNextAvailableDate, generateFixedBookings, cancelFutureBookings, countWeeklyBookings"
  - "ctx opcional (Pattern A + fallback isNotNull) en assertDateWithinWindow, promoteWaitlist, countActiveBookings — comparten callers fuera de scope de este plan (trials-service.ts, wellhub/*)"
affects:
  [
    174-04,
    174-05,
    174-06,
    trials-service.ts (validateTrialBookingDate sigue sin ctx),
    wellhub (promoteWaitlist/countActiveBookings sin ctx en ese camino),
  ]

tech-stack:
  added: []
  patterns:
    - "ctx opcional al final de la firma (en vez de ctx PRIMERO) cuando un método tiene callers fuera del scope del plan actual que todavía no resuelven TenantContext — Pattern A si ctx está presente, fallback isNotNull(table.tenantId) si no. Evita romper tsc en archivos no tocados por este plan sin dejar el read completamente crudo."

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/subscriptions/service.ts

key-decisions:
  - "Tasks 1 y 2 del plan se commitearon juntas en un solo commit atómico: el threading de ctx entrelaza reads e inserts dentro de los mismos métodos (reserve/adminAddBooking/generateFixedBookings mezclan ambos); separar hubiera dejado un commit intermedio sin compilar."
  - "assertDateWithinWindow/promoteWaitlist/countActiveBookings reciben ctx OPCIONAL (no 'ctx PRIMERO' como el resto del archivo) porque tienen callers en trials-service.ts y wellhub/*, archivos NO listados en files_modified de este plan ni en el file classification de 174-PATTERNS.md. Threading obligatorio ahí hubiera roto tsc en archivos de otro plan/módulo o forzado tocarlos fuera de scope."
  - "generateFixedBookings y cancelFutureBookings SÍ se threadearon con ctx obligatorio (PRIMERO) pese a tener 7 y 5 call sites externos respectivamente, porque los 13 call sites en subscriptions/service.ts YA tenían ctx en scope (asignado por 174-01) — era plumbing mecánico, no cambio arquitectónico."
  - "getMyWeeklyAttendance/adminRemoveBooking/cancelBookingsFromDateAndGrantCredits/findNextAvailableDate se threadearon con ctx obligatorio porque su único caller externo es scheduling/routes.ts, que ya importa y usa assertTenant(request.scope, ...) en el mismo archivo — mismo patrón, sin tocar módulos ajenos."

requirements-completed: [ADO-04]

duration: ~70min
completed: 2026-08-09
---

# Phase 174 Plan 03: Tenancy en scheduling/booking-service.ts Summary

**booking-service.ts migrado a tenantWhere/tenantValues (16 reads de bookings, 5 de branches, 1 de attendance, 1 de subscriptionSchedules, 1 de subscriptions, 1 de schedules, 3 de holidays con D-02, 2 de scheduleExceptions, 3 inserts), con ctx threading obligatorio en 7 métodos previamente sin ctx y ctx opcional con fallback en 3 métodos compartidos con módulos fuera de scope.**

## Performance

- **Duration:** ~70 min
- **Tasks:** 2 (commiteadas juntas, ver Decisiones)
- **Files modified:** 3 (`booking-service.ts`, `scheduling/routes.ts`, `subscriptions/service.ts`)

## Accomplishments

- Cerrada la deuda cruda del booking de admin, el check-in por QR (vía capacidad) y la generación de bookings: los ~16 `.from(schema.bookings)` que faltaban ahora filtran por `tenantWhere(schema.bookings, ctx)`.
- `holidays`/`scheduleExceptions` (D-02) ya no filtran solo por `country`/fecha: agregan `tenantWhere` conservando los filtros existentes, en los 3+2 sitios listados por el plan (`findNextAvailableDate`, `generateFixedBookings`, `assertDateWithinWindow`).
- Los 3 inserts de `bookings` (`reserve`, `adminAddBooking`, `generateFixedBookings`) usan `tenantValues(ctx, {...})` — ya no nacen con `tenant_id` DEFAULT 1.
- Threading de `ctx` necesario (mecánico, sin cambio de comportamiento) en 7 métodos que no lo tenían, más 13 call sites en `subscriptions/service.ts` (ya tenían `ctx` en scope desde 174-01) y 5 call sites en `scheduling/routes.ts` (ya importaba `assertTenant`).

## Task Commits

Ambas tasks del plan quedaron en un único commit atómico (ver Decisiones/Deviations):

1. **Tasks 1+2: Pattern A en reads + holidays D-02 + Pattern B en inserts** - `07c2397b` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/scheduling/booking-service.ts` — foco del plan: reads/inserts migrados, ctx threading.
- `el-templo-api/src/modules/scheduling/routes.ts` — 5 call sites actualizados para pasar `ctx` (vía `assertTenant`, patrón ya existente en el archivo).
- `el-templo-api/src/modules/subscriptions/service.ts` — 13 call sites de `generateFixedBookings`/`cancelFutureBookings` actualizados para pasar el `ctx` que ya tenían en scope (plumbing, sin lógica nueva).

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen:

1. **Commit único para Task 1+2** — el threading de ctx entrelaza reads (Task 1) e inserts (Task 2) dentro de los mismos métodos.
2. **ctx opcional (al final) en `assertDateWithinWindow`/`promoteWaitlist`/`countActiveBookings`** — tienen callers en `trials-service.ts` (`validateTrialBookingDate`) y `wellhub/service.ts` + `wellhub/sync-service.ts`, ninguno de esos archivos está en `files_modified` de 174-03 ni en la clasificación de archivos de `174-PATTERNS.md` para este plan. Threading obligatorio ahí hubiera exigido tocar módulos fuera de scope (wellhub no está en ningún plan de la fase 174) o roto `tsc` en un archivo que otro plan de la fase (trials-service.ts) va a migrar por su cuenta.
3. **ctx obligatorio en `generateFixedBookings`/`cancelFutureBookings`** pese a múltiples call sites externos — verificado que los 13 call sites en `subscriptions/service.ts` YA tenían `ctx: TenantContext` en scope (assignPlan, changeFixedSchedules, editSubscriptionStartDate, pauseSubscription, cancelSubscription, changePlanNow, changePlanAfterCurrent, renewSubscription — todos ya migrados por 174-01/174-02), así que threadear era plumbing mecánico y no una decisión arquitectónica.
4. **ctx obligatorio en `getMyWeeklyAttendance`/`adminRemoveBooking`/`cancelBookingsFromDateAndGrantCredits`/`findNextAvailableDate`** — único caller externo es `scheduling/routes.ts`, que ya usa `assertTenant(request.scope, ...)` en el mismo archivo para otros handlers (ej. `previewScheduleDeletion`). Se replicó el mismo patrón para los 5 handlers que llamaban a estos métodos sin ctx.

## Deviations from Plan

### Auto-fixed Issues (Rule 3 — blocking issue, mecánico)

**1. [Rule 3] Threading de `ctx` en 7 métodos de `booking-service.ts` sin ctx previo**

- **Found during:** Task 1 — al aplicar Pattern A a `.from(schema.bookings)`/`.from(schema.attendance)`/`.from(schema.branches)`/`.from(schema.schedules)`/`.from(schema.subscriptions)`/`.from(schema.subscriptionSchedules)` en los sitios listados por las `interfaces` del plan (líneas :620/:826/:1089-1118/:1327/:1408-1417-1493-1540/:1585-1595), varios de esos `.from()` viven en métodos SIN parámetro `ctx` (`getMyWeeklyAttendance`, `adminRemoveBooking`, `cancelBookingsFromDateAndGrantCredits`, `findNextAvailableDate`, `generateFixedBookings`, `cancelFutureBookings`, `countWeeklyBookings`). `tenantWhere(table, ctx)` no compila sin un `ctx: TenantContext` real.
- **Fix:** se agregó `ctx: TenantContext` como PRIMER parámetro (convención del archivo) a los 7 métodos, y se actualizaron sus call sites: 5 en `scheduling/routes.ts` (usando `assertTenant(request.scope, "scheduling.<handler>")`, patrón ya presente en el mismo archivo) y 13 en `subscriptions/service.ts` (pasando el `ctx` que esos métodos ya recibían desde 174-01/174-02).
- **Files modified:** `el-templo-api/src/modules/scheduling/booking-service.ts`, `el-templo-api/src/modules/scheduling/routes.ts`, `el-templo-api/src/modules/subscriptions/service.ts`.
- **Verification:** `tsc --noEmit` limpio; `vitest run test/scheduling test/check-ins` 192/192 verde.
- **Committed in:** `07c2397b`.

**2. [Rule 3] ctx opcional + fallback `isNotNull` en `assertDateWithinWindow`/`promoteWaitlist`/`countActiveBookings`**

- **Found during:** Task 1/2 — estos 3 métodos también tienen `.from()` en la lista del plan (`:1710` branches/holidays, `:1790`/`:1815` bookings, `:1873` bookings), pero sus OTROS callers (`validateTrialBookingDate` en el mismo archivo, llamado desde `trials-service.ts:323`; `wellhub/service.ts` y `wellhub/sync-service.ts`) no están en `files_modified` de 174-03 ni en la lista de 10 archivos del Pattern Map de la fase 174. Threading obligatorio hubiera exigido modificar esos archivos (fuera de scope, riesgo de conflicto con otro plan/módulo) o roto `tsc` en ellos.
- **Fix:** se agregó `ctx?: TenantContext` OPCIONAL al final de cada firma. Cuando `ctx` está presente (todos los callers internos de `booking-service.ts` ya migrados: `reserve`, `cancel`, `adminRemoveBooking`, `adminAddBooking`, `findNextAvailableDate`, `generateFixedBookings`) se aplica `tenantWhere`; cuando no (callers de `trials-service.ts`/`wellhub/*`, sin `ctx` resuelto en ese camino) se aplica el fallback provisional `isNotNull(table.tenantId)` (Pattern D).
- **Files modified:** `el-templo-api/src/modules/scheduling/booking-service.ts`.
- **Verification:** `tsc --noEmit` limpio; `vitest run test/scheduling test/check-ins` 192/192 verde (con un solo tenant activo, `isNotNull` y `tenantWhere` producen el mismo resultado hoy).
- **Committed in:** `07c2397b`.

---

**Total deviations:** 2 auto-fixed (ambas Rule 3, mecánicas — plumbing de `ctx` necesario para que `tenantWhere` compile; ninguna cambia comportamiento con un solo tenant activo).
**Impact on plan:** Necesarias para que el plan compile y sea correcto; no hay scope creep de lógica de negocio — solo pasaje de un parámetro ya disponible o fallback explícito y documentado donde no lo está.

## Issues Encountered

None más allá de las deviations documentadas arriba.

## Residual / Known Gaps (para 174.1 o migraciones futuras)

- **`validateTrialBookingDate` (booking-service.ts, público, llamado por `trials-service.ts:323`)** sigue sin `ctx` — su propia migración es dueña de `trials-service.ts`, fuera de `files_modified` de 174-03. Mientras tanto, `assertDateWithinWindow` cae al fallback `isNotNull` en ese camino.
- **`wellhub/service.ts` (`handleBookingRequested` SÍ resuelve `ctx` vía `resolverTenant`/CON-04, pero no se lo pasa a `countActiveBookings` en este plan; `handleBookingCanceled` NO resuelve `ctx` en absoluto)** y **`wellhub/sync-service.ts`** siguen llamando a `countActiveBookings`/`promoteWaitlist` sin `ctx` — caen al fallback `isNotNull`. `handleBookingRequested` es candidato barato para completar en el futuro (ya tiene `ctx` en scope); `handleBookingCanceled` necesitaría primero un `resolverTenant` propio, que es una unidad de trabajo mayor. Wellhub no está en el Pattern Map de la fase 174.
- **`countFuturePendingSpecialBookings`, `countBonusBookings`, `getFixedScheduleIdsForSubscription`** (helpers privados de `booking-service.ts`) leen `bookings`/`subscriptionSchedules` sin `tenantWhere` — NO estaban en la lista explícita de `interfaces` del plan (el conteo de sitios a fixear en las `interfaces` — 16 bookings / 5 branches / 1 subscriptionSchedules / 1 subscriptions / 1 schedules — coincide exactamente con lo migrado, confirmando que estos 3 helpers quedaron deliberadamente fuera del scope de 174-03). Ambos filtran por `memberId`/`subscriptionId` ya resueltos por un caller con `ctx` válido (`reserve`, `getBonusUsage`), así que el riesgo práctico es bajo (memberId/subscriptionId no cruzan tenant hoy), pero no tienen defensa en profundidad. Candidato para un futuro pase de hardening si se decide.

## Threat Flags

| Flag                             | File                                                                                                                                                        | Description                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| threat_flag: residual-crude-read | `el-templo-api/src/modules/scheduling/booking-service.ts` (`countFuturePendingSpecialBookings`, `countBonusBookings`, `getFixedScheduleIdsForSubscription`) | Reads de `bookings`/`subscriptionSchedules` sin `tenantWhere` directo, fuera de la lista explícita de `interfaces` de 174-03 (ver Residual). Mitigados indirectamente por `memberId`/`subscriptionId` ya validados por el caller.                                                                     |
| threat_flag: provisional-guard   | `el-templo-api/src/modules/scheduling/booking-service.ts` (`assertDateWithinWindow`, `promoteWaitlist`, `countActiveBookings`)                              | Fallback `isNotNull(table.tenantId)` cuando `ctx` no está disponible (callers en `trials-service.ts`/`wellhub/*`, fuera de scope). Con un solo tenant activo el comportamiento es idéntico al `tenantWhere`; deja de serlo cuando se active un segundo tenant sin que esos módulos se migren primero. |

## Self-Check: PASSED

- FOUND: `el-templo-api/src/modules/scheduling/booking-service.ts` (existe, contiene `tenantWhere(schema.bookings` ×15, `tenantValues(ctx` ×3, `tenantWhere(schema.holidays` ×3, `tenantWhere(schema.scheduleExceptions` ×2 — verificado con `grep -c`).
- FOUND: commit `07c2397b` en `git log --oneline --all` de `/home/franco/projects/et-173`.
- `tsc --noEmit`: 0 errores (verificado post-edición, antes del commit).
- `vitest run --no-file-parallelism test/scheduling test/check-ins`: 13 test files, 192/192 tests passed, 0 ajustados.
- `git status --short` en et-173 tras el commit: working tree limpio, sin `.planning` staged en ningún momento.

## Next Phase Readiness

- `booking-service.ts` listo para que 174-06 actualice el call site :137 (`getMemberSubscriptions(memberId)` → firma con `ctx`, D-07) sin fricción adicional de tenancy en este archivo.
- Los residuales documentados (`trials-service.ts`, `wellhub/*`, 3 helpers privados) no bloquean 174.1 con un solo tenant activo, pero son debt explícito para antes de activar un segundo tenant (gate del milestone, no de esta fase).

---

_Phase: 174-adopci-n-3a-subscriptions-scheduling-adopci-n-de-c-digo_
_Completed: 2026-08-09_
