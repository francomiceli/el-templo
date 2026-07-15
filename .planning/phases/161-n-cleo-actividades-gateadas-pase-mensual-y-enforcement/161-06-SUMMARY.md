---
phase: 161-n-cleo-actividades-gateadas-pase-mensual-y-enforcement
plan: 06
subsystem: scheduling
tags: [gating, reserve, especial-pass, enforcement, pass-required, staff-bypass]
requires:
  - PassRequiredError + pickSubscriptionForActivity (Plan 01)
  - getScheduleSlotRaw.isSpecial (Plan 05)
provides:
  - Gating duro server-side de actividades especiales en reserve() (GATE-01/03/04)
  - Ventana de anticipación extendida al período del pase (D-06)
  - Conteo de reservas futuras pendientes contra el budget del pase (D-04)
  - Staff bypass con aviso en adminAddBooking (D-07)
  - code PASS_REQUIRED surfaced en la ruta /reserve
affects:
  - el-templo-api/src/modules/scheduling/booking-service.ts
  - el-templo-api/src/modules/scheduling/routes.ts
tech-stack:
  added: []
  patterns:
    - Gating resuelto server-side por scheduleId→activity.isSpecial (JOIN), nunca por flags del cliente
    - Rol del actor server-derived (users.role) para bypass staff; nunca del body
    - Surface explícito del code de error tipado en la ruta (espejo de COVERAGE_EXPIRED)
    - Ventana de reserva parametrizada por windowDays (reuso de assertDateWithinWindow)
    - Conteo de compromiso futuro vía JOIN a activities.is_special (no confiar solo en classesRemaining)
key-files:
  created:
    - el-templo-api/test/scheduling/especial-gating.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/scheduling/routes.ts
decisions:
  - "actorRole se carga temprano (tras getScheduleSlotRaw) para el gating; la carga duplicada previa se elimina y se reutiliza abajo"
  - "Ventana regular intacta en su orden (window→sub→...); para especiales la ventana se valida tras cargar la sub del pase (D-06 depende de sub.endDate)"
  - "D-04 cuenta status ('reservado','lista_espera') y excluye qr_escaneado/confirmado (ya descontaron classesRemaining en el check-in) para no doble-contar"
  - "D-04 es una regla de budget pura (no gateada por rol), consistente con el check existente classesRemaining<=0"
  - "El endpoint admin /bookings NO surface PASS_REQUIRED: adminAddBooking solo agrega warnings (bypass), nunca lanza el error"
metrics:
  duration: ~9min
  completed: 2026-07-15
---

# Phase 161 Plan 06: Núcleo del enforcement — gating de actividades especiales Summary

Enforcement duro server-side del pase "Actividades con Aura" en `BookingService.reserve()` y el booking manual del admin: un member sin pase no puede reservar una especial (GATE-01/03, `PassRequiredError` → code `PASS_REQUIRED`), un externo-solo-pase no puede reservar regulares (GATE-04), la ventana de anticipación se extiende al período del pase para poder planificar los sábados (D-06), la reserva valida el budget contando las reservas futuras pendientes (D-04, cancelar libera cupo), y el staff conserva el bypass con aviso (D-07). El gating se resuelve por `scheduleId → activity.isSpecial` (JOIN) y el rol del actor por `users.role`, nunca por flags del cliente.

## What Was Built

**Task 1 — Gating en reserve() (GATE-01/03/04, ventana D-06, budget D-04)** (`b93e962b`):

- `booking-service.ts`: `isSpecialActivity = scheduleRow.isSpecial` leído tras `getScheduleSlotRaw`. `actorRole` (server-derived de `users.role`) se carga temprano y se elimina la carga duplicada previa.
- Reemplazo de `getMemberSubscription(memberId)` por `pickSubscriptionForActivity(memberId, isSpecialActivity)` — rutea la sub por actividad e incluye status `scheduled` (no rompe el bloque coverage-from).
- **GATE-01/03:** especial + member + `!sub` → `PassRequiredError`.
- **GATE-04:** regular + member + `!sub` con SOLO pase (via `getMemberSubscriptions`: hay especial y no hay presencial/online) → `BadRequestError("Tu pase solo habilita las actividades especiales")`; si no hay ninguna sub, cae al genérico "No tenés suscripción activa".
- **D-06:** para especiales, la ventana estándar (+2d) se reemplaza por `computeSpecialWindowDays(sub.endDate, today)` = días hasta el fin del pase (nunca más corta que la estándar; fallback 30d sin `endDate`). La ventana regular conserva su posición y orden intactos.
- **D-04:** para especiales, además de `classesRemaining <= 0`, `countFuturePendingSpecialBookings(memberId, today)` cuenta reservas futuras pendientes (`reservado`/`lista_espera`, fecha ≥ hoy, JOIN a `activities.is_special`) y bloquea si `count >= classesRemaining`. Cancelar baja el conteo y libera el cupo.

**Task 2 — Staff bypass (D-07) + surface PASS_REQUIRED** (`90426810`):

- `booking-service.ts` `adminAddBooking`: rutea la sub por actividad (`pickSubscriptionForActivity`), y ante una especial sin pase solo agrega el aviso "El alumno no tiene un pase de actividades activo" — nunca lanza (bypass staff; la confirmación es UI del Plan 07).
- `routes.ts`: branch `PassRequiredError` en el catch de `/reserve` (espejo exacto del de `CoverageExpiredError`) → `400 { code: "PASS_REQUIRED" }`. El endpoint admin no lo necesita (adminAddBooking no lanza).

**Task 3 — Tests de integración** (`61ce9e30`):

- `test/scheduling/especial-gating.test.ts`: 8 casos contra MySQL real (pin del reloj a miércoles 2026-03-11; actividades/horarios por la API admin ejercitando el wiring de `isSpecial`; subs por inserción directa para tunear estado/vencimiento/saldo). Cubre GATE-01/03, acceso regular intacto, GATE-04, D-04 (con liberación por cancelación), D-06, D-07, regresión sub `scheduled` (coverage-from) y D-05 mezclable (2 especiales distintas contra el mismo budget).

## Verification

- `npx tsc --noEmit` verde tras cada tarea.
- `npx vitest run test/scheduling/especial-gating.test.ts`: 8/8 pasan.
- Greps de aceptación: `PassRequiredError`/`pickSubscriptionForActivity`/`isSpecial` presentes en `reserve()`; `PASS_REQUIRED` en `routes.ts`; staff bypass condicionado en `adminAddBooking`.
- No-regresión del flujo regular: la ventana y el orden de validación de actividades regulares quedan intactos (window→sub→coverage→cross-country→budget); el gating nuevo solo entra en la rama `isSpecialActivity`.

## Deviations from Plan

Ninguna desviación de comportamiento. Decisiones de implementación dentro del alcance del plan:

- **D-04 como regla de budget pura (no gateada por rol):** consistente con el check existente `classesRemaining <= 0`, que tampoco se gatea por rol. Un staff con pase reservando especiales via member app queda sujeto al mismo budget; el bypass duro (PassRequiredError) sí es member-only.
- **Orden de la ventana para especiales:** `assertDateWithinWindow` se llama tras cargar la sub del pase (la ventana D-06 deriva de `sub.endDate`). El orden de validación de las actividades **regulares** no se toca (window primero, como siempre) — el plan exige explícitamente no alterarlo.

## Known Stubs

Ninguno. El enforcement está wireado y ejercitado por tests. La refinación del gate frontend (member app: grilla, contador, mensajes) es alcance de la fase 162 por diseño; el backend queda correcto (el externo-solo-pase ya no puede reservar regulares aunque la UI llegue después).

## Threat Flags

Ninguno nuevo. Las mitigaciones del threat register del plan quedan cubiertas: `isSpecial` y `actorRole` resueltos server-side (T-161-12/13/15), D-04 cuenta en la query sin confiar en `classesRemaining` sola (T-161-14), sin paquetes nuevos (T-161-SC).

## Self-Check: PASSED

- Archivo creado: `test/scheduling/especial-gating.test.ts` FOUND.
- Archivos modificados: `booking-service.ts`, `routes.ts` FOUND.
- Commits: `b93e962b`, `90426810`, `61ce9e30` FOUND en git log.
- Test suite del plan: 8/8 verde.
