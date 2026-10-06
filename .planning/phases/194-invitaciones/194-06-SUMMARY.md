---
phase: 194-invitaciones
plan: 06
subsystem: api
tags: [subscriptions, booking, invitations, guards]
requires: ["194-03", "194-05"]
provides:
  - "SubscriptionService.assignInvitationPlan (interno, sin ruta) + assignPlanInternal"
  - "D-07: compra con accesos vigentes cierra el remanente como completed en la tx de assignPlan"
  - "guards: renewSubscription y changePlan rechazan subs de plan Invitación; assignPlan rechaza el plan Invitación"
  - "Pitfall 10: reservas pendientes cuentan contra el saldo para subs de invitación"
affects: [194-09, 194-25]
key-files:
  created:
    - el-templo-api/test/invitations/purchase-closes-access.test.ts
    - el-templo-api/test/invitations/invitation-plan-guard-http.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
key-decisions:
  - "Cierre D-07 con status `completed` (existe en el enum), nunca cancelled/changed"
  - "Sin flag en AssignPlanInput ni en el schema: types.ts y schemas.ts NO se tocaron"
requirements-completed: [D-07, D-02, SC-1, SC-3]
duration: ~1.5 h
completed: 2026-10-06
---

# Phase 194 Plan 06: accesos de invitación vs ciclo de vida de suscripciones Summary

Comprar un plan real con accesos de invitación vigentes ya no da 409: los accesos se cierran como `completed` en la misma transacción. Los accesos no se renuevan, no se cambian de plan y no se asignan a mano, y un invitado no puede tener reservadas más clases que accesos restantes.

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `032c3efa0` | D-07 + guards (assignPlanInternal / assignPlan / assignInvitationPlan, renew, changePlan) + 2 archivos de test |
| 2 | `e2e1167a8` | Pitfall 10 en `booking-service.ts` + describe de reservas pendientes |

## Qué se hizo

- **assignPlan** (firma pública sin cambios) delega en `private assignPlanInternal(..., opts)`. `assignPlan` pasa `invitationPlanAllowed: false` y lanza 400 "El plan Invitación se asigna solo activando una invitación" si el plan es Invitación. `assignInvitationPlan` (público, sin ninguna ruta que lo importe) pasa `invitationPlanAllowed: true` + `requireInvitationPlan: true` (400 si el plan NO es Invitación). `AssignPlanInput` y `schemas.ts` sin cambios: el body no puede habilitar nada.
- **D-07:** el chequeo de grupo ahora trae `status`, `isTrial` y categoría del plan de cada sub solapada. Las subs Invitación `active`/`paused` se excluyen del conflicto (solo cuando lo que se asigna NO es Invitación) y sus ids se cierran con `UPDATE ... status='completed'` (tenantWhere + userId + `inArray(id)` + guard de status) dentro de la tx, antes de `recomputeUserStatus`. `end_date` y `classes_remaining` quedan intactos. Una sub Invitación `scheduled` sigue dando 409.
- **renewSubscription:** 400 "Los accesos de invitación no se renuevan" tras resolver el plan.
- **changePlan:** el origen se resuelve en el dispatcher `changePlan` (antes de que cualquier rama cancele subs programadas) y si es plan Invitación da 400 "...asigná el plan nuevo (los accesos se cierran solos)" para `now` y `after_current`.
- **Pitfall 10:** `countFuturePendingSpecialBookings` pasó a `countFuturePendingBookings(ctx, memberId, fromDate, isSpecial, specialLine)`; el paso 5c corre si la actividad es especial O el plan de la sub es Invitación (mismo conteo y mismo mensaje). El `getPlanById` se movió antes del 5c para reusarlo (misma llamada, no hay query nueva).

## Tests

- `test/invitations/purchase-closes-access.test.ts`: 16 tests verdes (6 D-07, 6 guards, 4 Pitfall 10).
- `test/invitations/invitation-plan-guard-http.test.ts`: 5 tests verdes (body pelado, override 0, `viaInvitation`, `allowInvitationPlan`, ambos + override; verifica además que no queda ninguna sub).
- Regresión: `test/subscriptions/dual-subscription.test.ts` 10 verdes, `test/subscriptions/especial-pass.test.ts` 6 verdes.
- Mutation testing: (a) umbral `> 99` en el cierre D-07 -> fallan "comprar un plan real" y "pausados"; (b) cerrar con `this.db` en vez de `tx` -> falla "rollback"; (c) quitar la cláusula `isInvitationPlan` del 5c -> fallan los 2 tests de pendientes rechazadas. Revertidas las tres.
- Gates: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `typecheck:tests` sin errores en los archivos tocados, prettier OK.
- Criterios de aceptación por grep: `Fase 194 D-07` x3, `viaInvitation|invitationPlanAllowed` en types/schemas 0 líneas, los 2 métodos presentes, `assignInvitationPlan` en `*routes.ts` 0 archivos, `cancelled` en el bloque D-07 0, `isInvitationPlan` y `Fase 194 Pitfall 10` presentes en booking-service.

## Deviations from Plan

**1. [Menor] `types.ts` no se modificó.** El plan lo listaba en `files_modified`, pero la decisión de no tocar `AssignPlanInput` lo deja sin cambios.

**2. [Menor] Prettier reformateó una línea ajena en `booking-service.ts`** (`getScheduleSlotRaw(...)` en el flujo de cancelación, 4 líneas): lint-staged lo habría hecho igual al commitear.

**3. [Decisión] Tests de Pitfall 10 con reservas pendientes sembradas por DB.** La regla de un turno por día y la ventana de +2 días impiden hacer 4 reservas reales; se siembran pendientes lejanas (hoy+9, hoy+10) y se hacen reservas reales HTTP en hoy+1/hoy+2, con fechas relativas a `todayInTz(sede)`.

## Decisiones / limitaciones

- Si el plan nuevo es `scheduled` (startDate futura) y pisa a los accesos, igual se cierran los accesos al comprar (D-07 literal). Es un caso raro (el invitado compra "para más adelante") y deja sin acceso hasta que arranque el plan.
- `changePlan` hace una lectura extra (`getMemberSubscription` + `getPlanById`) por llamada; ruta admin de baja frecuencia.
- `getRenewalPreview` NO tiene el guard (solo `renewSubscription`): el preview de una sub Invitación devuelve datos pero renovar da 400. Lo cubre 194-18/25 si hace falta ocultar el botón.

## Lecciones para planes siguientes

- Quien llame `assignInvitationPlan` (194-09) debe pasar `priceOverrideAmount: 0` **y `priceOverrideReason`** (si no, 400 "Se requiere una razon para el precio personalizado"), y un `adminId` que sea un `users.id` REAL: `assignPlan` escribe `audit_log` con FK `actor_id -> users`. En el canal self-service usar el id del propio invitado o del invitador, nunca 0/1 inventado. En tests, `adminId` = id de `admin@test.com` (no hardcodear 1).
- Con precio 0, `recordAssignmentCharge` no crea transacción: un `SubscriptionService` sin `TransactionService` alcanza para `assignInvitationPlan` (necesita `EnrollmentService`).
- Para tests de reserva real: `registerUser` + `getAuthToken` (los socios de `createMemberInPhysicalBranch` tienen `passwordHash: "x"` y no loguean) y `createActiveSub` con `branchId` + `UPDATE classes_remaining`. `cleanAllTestData` vacía actividades y feriados; sembrar un horario por día ISO en `beforeEach`.
- Un archivo de integración ~170-230 s; tres juntos ~330 s.
- El plan Invitación sigue visible en "Vender otro pase" del admin pero `assignPlan` ya lo rechaza (400): 194-25 debe ocultarlo.

## Auth gates / Threat flags / Stubs

Ninguno. Mitigaciones T-194-17..20 implementadas y cubiertas por tests.

## Self-Check: PASSED

Archivos creados presentes (`purchase-closes-access.test.ts`, `invitation-plan-guard-http.test.ts`); commits `032c3efa0` y `e2e1167a8` en el log de la rama; worktree limpio salvo este SUMMARY.
