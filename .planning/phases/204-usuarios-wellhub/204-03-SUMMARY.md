---
phase: 204-usuarios-wellhub
plan: 03
subsystem: api
tags: [wellhub, bookings, webhook, subscriptions, tenancy, tests]
requires: ["204-02"]
provides:
  - "D-18 sitios #7-#11 corregidos (regla diaria 8b, limite semanal, presupuesto futuro, bonus, guard del webhook, todayBooking)"
  - "Lectura de asistencia de la suscripcion sin visitas Wellhub (uso semanal, mover inicio, compensar dias)"
affects: [204-04, 204-05]
key-files:
  modified:
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/wellhub/service.ts
    - el-templo-api/src/modules/subscriptions/service.ts
  created:
    - el-templo-api/test/wellhub/plan-separation-bookings.test.ts
    - el-templo-api/test/wellhub/plan-separation-subscriptions.test.ts
metrics:
  tasks: 3
  files: 5
  completed: 2026-10-27
---

# Phase 204 Plan 03: Reservas, webhook y suscripcion separados del plan Summary

Las reservas y visitas Wellhub dejan de tocar los contadores del plan del socio (regla diaria, limite semanal, presupuesto, bonus, uso semanal de la SubscriptionCard) y no bloquean mover el inicio ni compensar dias. El webhook compara solo contra visitas Wellhub y solo confirma la reserva Wellhub. Nada se ejecuto localmente (sin node_modules): verificacion por grep y lectura de codigo.

## Commits

- `293db1e64` fix(204-03): reservas Wellhub no consumen el plan y el webhook separa lados (D-18 #7-#11) (Task 1)
- `2a5957276` test(204-03): reservas y webhook separan plan vs Wellhub (D-18 #7-#11) (Task 2)
- `c390997e4` fix(204-03): las visitas Wellhub no cuentan en el uso semanal ni bloquean inicio/compensacion (D-18) (Task 3)

## Lo hecho

- `booking-service.ts`: `notWellhubBookingSql()` (import de `../shared/wellhub-sources`) en la regla 8b de `reserve()`, `countWeeklyBookings` (cubre `reserve` y `adminAddBooking`), `countFuturePendingBookings` y `countBonusBookings`. `countActiveBookings` sin tocar (pool de cupo compartido).
- `wellhub/service.ts`: el guard `existingToday` y el `recheck` dentro de la tx usan `isWellhubAttendanceSql()` (A1: lados separados, un socio puede tener su QR y su visita Wellhub el mismo dia). `todayBooking` filtra con `isWellhubBookingSql()`. Comentario del guard actualizado. No se toco validacion, outcomes ni el insert de la fila `wellhub`.
- `subscriptions/service.ts`: `notWellhubAttendanceSql()` en el COUNT de `getClassUsageThisWeek` y en los `attendanceConflict` de `editSubscriptionStartDate` y `compensateDays`. Mensajes de error sin cambios. Solo esos tres hunks + el import.
- Tests: 8 `it` en `plan-separation-bookings.test.ts` (los 7 pedidos + un control de la regla diaria con source NULL) y 5 en `plan-separation-subscriptions.test.ts`.

## Deviations from Plan

- **[Extra] Control de regla diaria.** Agregue `control: una reserva propia el mismo dia si dispara la regla de una reserva por dia` (409) para que el test de la regla 8b no pase por azar. Total 8 `it` en vez de 7.
- **[Decision] Alta del staff = warning.** `adminAddBooking` no rechaza por limite semanal, solo agrega el warning "Limite semanal alcanzado". El test del staff asserta que ese warning NO aparece con una reserva Wellhub y SI aparece con una propia (control incluido en el test "control: ... source NULL").
- **[Decision] Presupuesto futuro (#9) probado con el plan Invitacion.** La regla 5c solo corre para especiales o plan Invitacion (`is_trial` + `paquete`). El test usa `createTrialPlan`/`createActiveSub` de `test/invitations/_helpers.ts` con saldo exacto de 1 y una reserva Wellhub pendiente a hoy+9. No use `createWellhubSocioActivo` porque la API de asignar rechaza el plan Invitacion.
- **[Decision] `countBonusBookings` sin test propio.** Comparte el mismo predicado que los otros contadores pero requiere un plan `fixed` con `subscription_schedules`; no lo arme. Cubierto por lectura de codigo (los listados de `<behavior>` lo mencionaban junto al presupuesto, los titulos pedidos no).
- **[Decision] Tests de suscripcion sobre una sub activa.** `editSubscriptionStartDate` admite `active`; muevo el inicio +5 dias respecto del `startDate` leido de la DB (activa -> programada) en vez de armar una sub programada, para reutilizar `createWellhubSocioActivo`.
- **[Decision] Webhook en la sede 1.** Los tests del webhook mapean temporalmente `branches.wellhub_gym_id` de la sede 1 a un gym id unico y lo restauran en `afterAll`.
- Co-Authored-By con `Claude Sonnet 5.5` (modelo real), como en los planes 01-02.

## Bugs / observaciones no anticipadas

- Ninguno bloqueante. Pre-existente: `getClassUsageThisWeek` arma la semana con hora local del servidor y la convierte con `toISOString()` (UTC): no se toco.
- El unico test existente que cubre `already_checked_in` (`webhook-checkin.test.ts`, "segundo checkin del dia") sigue valido: los dos check-ins son Wellhub. Ninguno otro assert depende de que la asistencia propia bloquee el webhook (grep).

## Known Stubs

Ninguno.

## Dudas para Franco

- Decision A1 aplicada: un socio puede quedar con QR propio + visita Wellhub el mismo dia, ambas en `attendance`. Si prefieren que el webhook igual no registre cuando hay QR propio, hay que revertir el `isWellhubAttendanceSql()` de los dos guards.
- Nada se corrio: CI debe correr `plan-separation-bookings.test.ts`, `plan-separation-subscriptions.test.ts` y `webhook-checkin.test.ts`. Riesgos de test a mirar si falla: feriado en el calendario de test que caiga en "manana" (la reserva propia daria 400 "feriado"), y el tipo de `registerUser`/`createActiveSub` en el test del presupuesto.
- Los tests nuevos no estan cubiertos por `tsc`; un error de tipos solo aparece al correr vitest.
- Prettier: no pude confirmar si el hook reformateo los archivos nuevos (sin node_modules).

## Self-Check: PASSED

- Commits 293db1e64, 2a5957276, c390997e4: FOUND
- `notWellhubBookingSql()` x4 en booking-service, `isWellhubAttendanceSql()` x2 + `isWellhubBookingSql()` x1 en wellhub/service, `notWellhubAttendanceSql()` x3 en subscriptions/service
- `grep -rn "ne(schema.bookings.source" src`: vacio; sin hunks en `countActiveBookings`
- `it(`: 8 y 5; sin ids de usuario hardcodeados
