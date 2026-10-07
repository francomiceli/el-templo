---
phase: 194-invitaciones
plan: 09
subsystem: api
tags: [invitations, activation, locks, concurrency, subscriptions, booking, attendance]
requires:
  - phase: 194-05
    provides: findInvitationPlan (plan Invitación por país)
  - phase: 194-06
    provides: assignInvitationPlan, cierre D-07, Pitfall 10
  - phase: 194-07
    provides: días hábiles (shared/business-days.ts) y getInvitationSettings
  - phase: 194-08
    provides: reglas de cupo/elegibilidad con executor db|tx
provides:
  - InvitationService.activate (canales self_service y assisted) con locks y compensación
  - InvitationService.voidInvitation (anulación por staff, sin DELETE)
  - SubscriptionService.closeInvitationAccess (único UPDATE de cierre de accesos, compartido con D-07)
  - regla nueva de elegibilidad (sub NO-trial scheduled = ya compró)
affects: [194-10, 194-12, 194-13, 194-14]
tech-stack:
  patterns: [lock FOR UPDATE de users en orden de id antes de COUNT+INSERT, compensación a voided en vez de DELETE]
key-files:
  created:
    - el-templo-api/test/invitations/activate.test.ts
    - el-templo-api/test/invitations/void.test.ts
    - el-templo-api/test/invitations/access-usage.test.ts
  modified:
    - el-templo-api/src/modules/referrals/invitation-service.ts
    - el-templo-api/src/modules/referrals/invitation-types.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/test/invitations/_helpers.ts
    - el-templo-api/test/invitations/quota.test.ts
    - el-templo-api/test/invitations/eligibility.test.ts
key-decisions:
  - "activate en 3 transacciones: (2) lock + reglas + INSERT; (3) datos del invitado; (4) assignInvitationPlan. assignPlan maneja su propia tx, así que no entra en la del lock (mismo motivo que partner-week-service)"
  - "Una activación rota deja la fila voided/activation_failed (y cierra la sub si ya existía); nunca se borra"
  - "El canal app solo acepta code resuelto server-side; inviterId del cliente da 400 (T-194-30)"
requirements-completed: [D-01, D-02, D-04, D-06, D-10, D-14, D-15, D-18, D-26, SC-1, SC-2]
completed: 2026-10-06
---

# Phase 194 Plan 09: activación y anulación de invitaciones Summary

**`InvitationService.activate` (app y recepción) con `SELECT ... FOR UPDATE` de invitador+invitado en orden de id, datos del invitado coherentes (sede física, teléfono, `prueba` con historial `invitation`, lead `en_seguimiento`), plan Invitación $0 por país con vigencia en días hábiles y compensación a `voided`; más `voidInvitation` y la prueba de punta a punta de que los accesos sirven para reservar y hacer check-in.**

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `a35b5810f` | `activate`, `voidInvitation`, `closeInvitationAccess`, regla scheduled, tipos, helpers de test, `activate.test.ts`, concurrencia en `quota.test.ts` |
| 2 | `b76797567` | `void.test.ts` (10 casos; 14 tras el seguimiento) |
| 3 | `c86999627` | `access-usage.test.ts` (7 casos) |
| seguimiento | `7e9747996` | compensación del estado del invitado + `voidInvitation` cancela reservas futuras (ver "Límites conocidos") |

El código de `voidInvitation` entró en el commit de la Task 1 (mismo archivo que `activate`, y `closeInvitationAccess` lo necesita la compensación); la Task 2 es solo sus tests (patrón ya usado en 194-08).

## Contrato

`invitation-types.ts` agrega:

```ts
interface ActivatedInvitation { invitationId; subscriptionId; accessExpiresOn; classesBudget: number | null; branchId }
interface VoidInvitationInput { voidedBy: number; reason: string }   // reason 1..64 chars
const ACTIVATION_FAILED_REASON = "activation_failed"
```

`InvitationService` (el 3er argumento `subscriptionService` ahora es obligatorio para estos dos métodos):

```ts
activate(ctx, input: ActivateInvitationInput): Promise<ActivatedInvitation>
voidInvitation(ctx, invitationId, { voidedBy, reason }): Promise<void>
```

`SubscriptionService.closeInvitationAccess(ctx, userId, subscriptionIds, tx, { recompute })`: cierra `active|paused` como `completed`; devuelve cuántas cerró. Lo usan la compra (D-07, `recompute:false` porque el recompute corre después en la misma tx), la anulación y la compensación (`recompute:true`).

Errores: reglas rotas = `InvitationRuleError` (409, con `reason`); canal/código/DNI mal formados, sede virtual, sede de otro país, motivo de anulación vacío o > 64 = 400; invitado/sede/invitación inexistente o de otro gimnasio = 404; anular una ya anulada = 409.

## Cómo activa (resumen)

1. Resuelve invitador: canal app solo `code` (`inviterId` => 400); asistido `inviterId` o `code`. Código desconocido => `inviter_not_found`; auto-invitación => `self_invite`; teléfono vacío => `phone_required`.
2. Tx corta: `SELECT id FROM users WHERE tenant_id = ? AND id IN (lo, hi) ORDER BY id FOR UPDATE` (ninguna lectura antes, para que el snapshot nazca post-lock), invitado existente, `assertInviterCanInvite(tx)`, sede del tenant + física, `assertInviteeElegible(tx)`, vigencia = `addBusinessDays` con feriados del país de la SEDE ELEGIDA, `INSERT invitations`. Commit.
3. Tx: sede (con `branch_updated_at` + `branch_source='manual'` juntos), teléfono guardado con `sanitizePhoneForStorage`, DNI solo si no tenía, `status='prueba'` + `user_status_history(source='invitation')` solo si cambia, lead `en_seguimiento/auto/purchased_plan_id NULL` salvo `lead_status_source='manual'`.
4. `findInvitationPlan` + `assignInvitationPlan` ($0, razón `Invitación de <Nombre Apellido>`, `endDateOverride`, `adminId` = staff o el propio invitado) y `UPDATE invitations.subscription_id`.
5. Cualquier falla de 3-4: fila `voided`/`activation_failed`, sub cerrada si ya existía, error propagado.

## Tests

- `activate.test.ts`: 25 verdes (22 + 3 de compensación del estado del invitado; camino feliz completo con sub $0/3 clases/bonificada, ex socio inactivo, ya en prueba sin historial duplicado, feriado AR corre el vencimiento y feriado ES no, settings dinámicos, lead ganado -> en_seguimiento y manual respetado, DNI propio conservado, canal asistido x2, guards de canal, cupo agotado, invitador sin membresía, socio vigente / compra programada / teléfono y DNI ajenos / sin teléfono, invitado borrado, sede virtual, sede de otro gimnasio, sede ES con invitado virtual => plan ES, invitado físico AR hacia ES => 400, compensación y reactivación posterior).
- `quota.test.ts`: 19 verdes (3 nuevos de concurrencia: 1 cupo con 2 activaciones, 2 cupos con 4, mismo invitado desde 2 invitadores). Corrido 2 veces seguidas, verde las dos.
- `void.test.ts`: 14 verdes (10 + 4 de reservas futuras). `access-usage.test.ts`: 7 verdes. `eligibility.test.ts`: 33 verdes. Regresión `purchase-closes-access.test.ts` (refactor de D-07): 16 verdes.
- **Mutation testing (honesto):** (a) sacar `FOR UPDATE` => fallan los 3 tests de concurrencia (2 y 4 activaciones pasan, 2 filas activas del mismo invitado); (b) `closeInvitationAccess` con `[]` en `voidInvitation` => fallan 2 tests de void; (c) plan Invitación con `multi_branch=0` => fallan 2 tests de access-usage. Todo revertido.
- Gates: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `typecheck:tests` sin errores en archivos del plan, chequeo de copy "referid" sin líneas.
- Acceptance greps: `ORDER BY id FOR UPDATE` 1 línea; `assignInvitationPlan(` 1 línea; `.assignPlan(` 0; `.delete(` 0; `"invitation"` (source) presente; `activation_failed` presente (constante en types + comentarios/log en el servicio).

## Deviations from Plan

**1. [Interpretación] "sede de otro país" => 400 solo para invitados que ya entrenan en una sede FÍSICA de otro país.** El plan se contradice: la sección `behavior` dice que una sede ES para un invitado AR usa el plan ES, y `must_haves` dice "sede virtual o de otro país como destino => 400". Resolución: un invitado en la sede VIRTUAL (el registro sin sede, que no tiene país propio) elige libremente cualquier sede física y recibe el plan del país de esa sede (ES => plan ES, EUR); un invitado que ya entrena en una sede física de otro país no se muda de país por una invitación (400 "La sede elegida es de otro país"). Ambos casos con test. Si Franco quiere permitir también el cambio físico AR->ES, es sacar un `if` (`activate`, paso 2).

**2. [Regla extra del orquestador] Sub NO-trial `scheduled` = no elegible (`invitee_is_member`).** Implementado en `findHistoryReason` (con `end_date` nulo o >= hoy). Cambia una expectativa de 194-08: el test "sub programada no cuenta como historial" ahora espera `invitee_is_member`; más tests de que una scheduled `is_trial` o una cancelada NO bloquea. `eligibility.test.ts` no estaba en `files_modified`.

**3. [Rule 3 - DRY, archivos extra] `subscriptions/service.ts` tocado.** El UPDATE de cierre de D-07 estaba inline en `assignPlanInternal`; se extrajo a `closeInvitationAccess` público (el plan lo pedía "si quedó privado") y D-07 ahora lo llama. Regresión de D-07 verde.

**4. [Extra] `_helpers.ts`** ganó `buildInvitationServices`, `resetInvitationSettings`, `getAdminUserId`, `uniquePhone10`, `createInviterWithCode` (los usan 4 archivos de test).

**5. [Extra] `ReferralService` instanciado dentro de `resolveInviterId`** (solo para `resolveReferralCode`); no se duplicó la consulta.

## Lecciones para planes siguientes

- Para correr reservas/check-in de un día fijo sin depender de la hora real: `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(<hoy AR>T13:00:00Z)` (10:00 en Buenos Aires) ANTES de loguear; clase de las 10:10 (corte de reserva 5 min antes, check-in ±20). Timers e I/O reales. Con `setSystemTime(+n días)` se simulan días distintos. `afterEach(vi.useRealTimers)`.
- La ventana de reservas del socio es +2 días y la vigencia del acceso son ~11 días corridos: para probar el corte por cobertura hay que acortar `subscriptions.end_date` por DB (hoy+1) y reservar hoy+2.
- No existe job de no-show que descuente saldo: el saldo baja solo en el check-in (QR, coach o `POST /api/admin/attendance/force`).
- `QR check-in`: `generateQrToken(branchId)` de `shared/qr-token` + `POST /api/members/attendance/check-in`; requiere reserva `reservado` del mismo día en esa sede dentro de ±20 min.
- Predicado de "socio activo" en tests: `activeMemberExists(schema.users.id, ctx.tenant)` dentro de un `select ... where`.
- Concurrencia: el lock tiene que ser la PRIMERA sentencia de la tx (sin SELECT previo) para que el snapshot REPEATABLE READ nazca después y vea el COUNT del que lo precedió.
- `tx.execute(sql\`...\`)` con `tenant_id = ${ctx.tenantId}` inline satisface `lint:tenant` sin exención.
- Un `Promise.allSettled` de varias `activate` usa varias conexiones del pool a la vez (cada tx retiene una + lecturas por el pool): funcionó con 4 en paralelo.

## Límites conocidos

### Resueltos en el seguimiento (`7e9747996`)

1. **Estado parcial en `activate` (resuelto por compensación, no por reorden).** `assignInvitationPlan` depende de la sede física ya seteada (valida que el plan sea del país de la sede del socio y la regla "plan presencial requiere sede física"), y el `prueba` previo hace falta para que `recomputeUserStatus` no deje a un inactivo/freemium como estaba. Reordenar no era posible, así que el paso 3 devuelve un *snapshot* (status, `branch_id`, `branch_updated_at`, `branch_source`, teléfono, DNI, `lead_status`, `lead_status_source`, `purchased_plan_id`) y `compensateFailedActivation` lo restaura en la MISMA tx que deja la fila `voided`/`activation_failed` y cierra la sub. Detalles:
   - El historial es forward-only: no se borra la fila `invitation` del paso 3, se agrega la transición inversa con `source='invitation_undo'` (15 caracteres, cabe en `varchar(16)`). Un status previo NULL no tiene inversa.
   - Si `assignInvitationPlan` creó la sub y falló después sin devolver el id, se la encuentra por un "piso de id" (`MAX(subscriptions.id)` del invitado leído antes de asignar) y se cierra `completed` (solo subs Invitación `active|paused` con id mayor al piso).
   - Queda una sub `completed` del plan Invitación como rastro; no afecta membresía ni el invitado (`is_trial`).
   - `users.converted_at` nunca se toca (ni en el flujo feliz).
   - Tests (foreground): falla por falta de plan Invitación del país con un freemium virtual y un ex socio "complejo" (inactivo, teléfono propio, lead perdido/auto con plan comprado, sede `auto` con fecha vieja) => `readUser` idéntico antes/después + fila `voided` + historial con la pareja `invitation`/`invitation_undo`; falla *después* de crear la sub (spy que ejecuta el real y tira) => sub `completed`, usuario restaurado; falla *antes* (spy rechaza) => usuario intacto y el reintento activa bien.
2. **`voidInvitation` cancela las reservas futuras.** Nuevo en `BookingService`: `cancelUpcomingBookingsForMember(ctx, memberId, exec)` y `releaseCancelledSlots(ctx, slots)`.
   - Solo si la anulación efectivamente cerró los accesos (`closeInvitationAccess` > 0): si el invitado ya compró, sus reservas cuelgan de la membresía real y no se tocan.
   - Cancela `reservado` y `lista_espera` de actividades REGULARES (las especiales dependen del pase especial) con fecha posterior a hoy en la tz de la sede de la clase, o de hoy con la clase sin empezar. No toca `qr_escaneado`, `confirmado`, `no_show`, ya `cancelado`, ni pasadas.
   - Es cancelación de staff: no aplica la ventana de 20 min del socio. El UPDATE corre en la tx de la anulación (atómico con `voided`); post-commit `releaseCancelledSlots` hace lo mismo que `cancel()`: si la reserva ocupaba cupo, `promoteWaitlist` del turno (con aviso `waitlist_promoted`) y `emitOccupancyChange` (Wellhub). Un fallo post-commit se loguea sin deshacer el `voided`.
   - `InvitationService` recibe el `BookingService` como 4.º argumento del constructor y `voidInvitation` falla cerrado (Error) si falta: **194-10/12 deben inyectarlo al armar el servicio en las rutas** (en tests, `buildInvitationServices` ya devuelve el servicio completo).
   - Tests: matriz de estados (futuras reservado/lista_espera canceladas; pasada, escaneada, confirmada, especial, ya empezada hoy y reserva de otro alumno intactas), promoción de lista de espera + evento de ocupación, invitado que ya compró (no se toca) y falla cerrada sin `BookingService`.
3. **Mutation testing del seguimiento:** sin la restauración del snapshot y con `closed > 99` fallan 5 tests (3 de compensación y 2 de reservas); revertido.

### Siguen abiertos (decisión explícita de no tocarlos acá)

- **UTC en ES de madrugada (00:00-~02:00 locales):** `assignPlanInternal` decide `active|scheduled` con la fecha UTC (`todayDateString`) y la activación usa `todayInTz(sede)`; para una sede de España en esa franja la sub puede nacer `scheduled` hasta que el cron la active. Es comportamiento global de `assignPlan` (afecta todo plan), no se tocó.
- **No-show:** no existe un job de no-show que descuente saldo; el saldo baja solo en el check-in (QR, coach o forzado). Nada que implementar ni probar acá; si el negocio quiere descontar no-shows de los accesos es una decisión de producto nueva.
- **`users.converted_at`:** un ex socio que ya había convertido como lead y vuelve vía invitación conserva `converted_at`, así que el gate de `recomputeUserStatus` no lo marcará `ganado` al comprar hasta que el plan de leads (D-18, extender el gate con "invitación activada") lo contemple.
- Los tests de `activate` fijan `access_business_days` y cupo por settings, nunca con literales de calendario. Los casos "hoy ya empezada / hoy por empezar" de `void.test.ts` usan horarios 00:00 y 23:59 de la sede (un minuto de ventana de flake alrededor de esas horas).

## Allowlist de copy

Vacía: el chequeo "referid" sobre `invitation-types.ts` e `invitation-service.ts` no imprime nada.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model. T-194-29 (lock + Promise.all), T-194-30 (canal app sin `inviterId`), T-194-31 (sede del tenant y física, plan por país server-side), T-194-32 (voided_by/at/reason sin DELETE), T-194-33 (compensación) cubiertos y probados.

## Self-Check: PASSED

- Archivos creados verificados en disco (`activate.test.ts`, `void.test.ts`, `access-usage.test.ts`).
- Commits `a35b5810f`, `b76797567`, `c86999627`, `7e9747996` presentes en `git log`; worktree limpio salvo este SUMMARY.
