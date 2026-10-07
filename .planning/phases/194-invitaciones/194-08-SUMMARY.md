---
phase: 194-invitaciones
plan: 08
subsystem: api
tags: [invitations, eligibility, quota, anti-abuse, tenancy]
requires:
  - phase: 194-03
    provides: deriveMembershipCoveredUntil (cobertura de membresía sin is_trial)
  - phase: 194-04
    provides: tabla invitations y fábrica createInvitationRow
  - phase: 194-07
    provides: getInvitationSettings (cupo, ventanas, meses)
provides:
  - InvitationService (lecturas/aserciones de cupo, membresía del invitador, elegibilidad del invitado, identificación)
  - contrato de tipos (motivos, mensajes, InvitationRuleError)
affects: [194-09, 194-10, 194-12]
tech-stack:
  patterns: [executor db|tx en toda función de regla para correr bajo el lock de la activación]
key-files:
  created:
    - el-templo-api/src/modules/referrals/invitation-types.ts
    - el-templo-api/src/modules/referrals/invitation-service.ts
    - el-templo-api/test/invitations/quota.test.ts
    - el-templo-api/test/invitations/eligibility.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/test/invitations/_helpers.ts
key-decisions:
  - "Una sola implementación de las reglas con `exec` (db o tx): la misma lógica sirve para GET .../eligibility y para correr dentro del lock de 194-09"
  - "Los parámetros (cupo, meses, días) se leen por el pool (this.db), no por el tx: son filas de tenant_settings que la activación no escribe"
  - "Orden de evaluación: self_invite -> phone_required -> phone_taken -> dni_taken -> D-11 -> D-12"
requirements-completed: [D-10, D-10d, D-11, D-12, D-26, SC-2]
completed: 2026-10-06
---

# Phase 194 Plan 08: InvitationService (cupo y elegibilidad) Summary

**Reglas anti-abuso del programa de Invitaciones como lecturas/aserciones componibles: cupo mensual del invitador, invitador con membresía vigente, elegibilidad del invitado por historial y por persona, e identificación por teléfono/DNI, con códigos de motivo estables y mensajes en español.**

## Commits

- `24ef6cc3f` feat(194-08): InvitationService con cupo del invitador y membresía vigente (Task 1; incluye el servicio completo y los tipos)
- `ba14e7e32` test(194-08): elegibilidad del invitado D-11/D-12 e identificación (Task 2; tests de elegibilidad)

## Contrato final (consumir en 194-09/10/11/12)

`el-templo-api/src/modules/referrals/invitation-types.ts`:

```ts
type InvitationIneligibleReason =
  | "inviter_not_found" | "inviter_not_member" | "inviter_quota_exhausted"
  | "self_invite" | "invitee_is_member" | "invitee_recent_member"
  | "invitee_recent_invitation" | "phone_required" | "phone_taken" | "dni_taken";
interface InviterQuota { limit: number; used: number; remaining: number; month: string }
interface EligibilityResult { eligible: boolean; reason: InvitationIneligibleReason | null; message: string | null }
interface InviteeEligibilityInput { inviterId; invitedUserId; phone: string; dni?: string | null; branchId?: number }
interface ActivateInvitationInput { inviterId?; code?; invitedUserId; branchId; phone; dni?; channel: "self_service" | "assisted"; createdBy: number | null }
const INELIGIBLE_MESSAGES: Record<InvitationIneligibleReason, string>   // voseo, sin "referido", sin datos de otra cuenta
class InvitationRuleError extends ConflictError { readonly reason: InvitationIneligibleReason }  // 409
```

`el-templo-api/src/modules/referrals/invitation-service.ts`:

```ts
type InvitationExecutor = MySql2Database<typeof schema> | TxHandle
class InvitationService {
  constructor(db, log, subscriptionService?)           // el 3º es público, lo usa 194-09
  getInviterQuota(ctx, inviterId, exec?): Promise<InviterQuota>
  assertInviterCanInvite(ctx, inviterId, exec?): Promise<InviterQuota>   // lanza inviter_not_found | inviter_not_member | inviter_quota_exhausted
  evaluateInviteeEligibility(ctx, input, exec?): Promise<EligibilityResult>
  assertInviteeEligible(ctx, input, exec?): Promise<void>               // lanza InvitationRuleError
  assertIdentityNotTaken(ctx, { invitedUserId, phone, dni? }, exec?): Promise<void>
}
function subtractMonths(dateStr, months): string        // pura, recorta al último día del mes
```

## Decisiones de implementación

- **Cupo (D-10):** `used` = COUNT de `invitations` `status='active'` con `quota_month` = mes de `todayInTz(tz de la sede del invitador)`. `remaining = max(0, limit - used)` (si gestión baja el cupo por debajo de lo usado no queda negativo).
- **Invitador (D-10d):** `deriveMembershipCoveredUntil(exec, id, ctx) >= todayInTz(tz sede)`; `null` = no socio. Solo accesos `is_trial` => `inviter_not_member`; membresía real + acceso is_trial (caso Yoga) sigue pudiendo invitar.
- **Historial (D-11):** `MAX(LEAST(COALESCE(end_date,'9999-12-31'), COALESCE(DATE(cancelled_at),'9999-12-31')))` sobre subs con plan `is_trial = 0`, `subscription_status <> 'scheduled'` y `start_date <= LEAST(...)`; resultado casteado a CHAR (evita que mysql2 devuelva Date). `>= hoy` => `invitee_is_member`; `<= hoy - N meses` => elegible; resto => `invitee_recent_member`. El "hoy" usa la tz de la sede elegida (`branchId`) o, si falta, la de la sede actual del invitado.
- **Ventana (D-12):** EXISTS sobre `invitations` `status='active'` y `activated_at >= DATE_SUB(NOW(), INTERVAL N DAY)` por `invited_user_id` OR `invited_phone_last10` OR (`invited_dni` no nulo = DNI). `reinvite_window_days = 0` desactiva la ventana. No se consulta `bookings`.
- **Identificación:** teléfono comparado con `RIGHT(REGEXP_REPLACE(phone,'[^0-9]',''),10)` contra los últimos 10 de `normalizePhone(input)`; DNI trim + igualdad; ambos contra OTROS usuarios (`id <>`) no borrados del tenant. El propio teléfono/DNI del invitado no choca.

## Tests

- `test/invitations/quota.test.ts`: 16 verdes (13 de servicio + 3 de `subtractMonths`).
- `test/invitations/eligibility.test.ts`: 31 verdes (historial, cancelled_at, cancelada antes de arrancar, scheduled, SP is_trial, bonificada, settings dinámicos, ventana por usuario/teléfono/DNI, voided, booking SP, aislamiento con gimnasio 2, identidad, orden, mensajes, tx, sede inexistente).
- Mutation testing manual (3 mutaciones simultáneas: sacar el `LEAST` con `cancelled_at`, sacar el filtro `status='active'` de D-12, sacar `is_trial = 0`): 5 tests fallaron; código revertido.
- Gates: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `typecheck:tests` sin errores en los archivos del plan.

## Deviations from Plan

### Ajustes (sin cambio de alcance)

**1. [Rule 3 - Bloqueo] `subscriptions/service.ts` tocado (no figuraba en `files_modified`).**
`deriveMembershipCoveredUntil`, `...Batch` y el impl privado recibían `MySql2Database`; un `tx` no es asignable. Se ensanchó el tipo del parámetro a `MySql2Database<typeof schema> | TxHandle` (3 firmas, cero cambio de lógica) para que el chequeo del invitador corra dentro de la transacción de 194-09.

**2. El servicio completo (incluida la elegibilidad) entró en el commit de Task 1.**
`invitation-service.ts` se escribió de una vez; el commit de Task 1 lleva servicio + tipos + tests de cupo y el de Task 2 los tests de elegibilidad. Tests nunca corrieron en rojo contra un servicio incompleto.

**3. `_helpers.ts` ampliado:** `createMemberInPhysicalBranch/VirtualBranch` aceptan `phone`/`dni`; `createActiveSub` acepta `status: "cancelled"` + `cancelledAt`; `createTrialPlan` acepta `category: "presencial"` (para la "Sesión de Prueba" is_trial).

**4. `evaluateInviteeEligibility` acepta `branchId?` opcional** (el plan no lo listaba) para fijar la tz del "hoy" en la sede elegida; sin él usa la sede actual del invitado. Una sede inexistente da 404.

**5. Un invitado inexistente da `NotFoundError` (404)** en vez de un motivo: no hay `reason` para eso en el contrato y los llamadores siempre pasan un id ya resuelto.

### Notas para planes siguientes

- Todos los `InvitationRuleError` son 409, incluido `phone_required`: la ruta puede validar el teléfono por schema (400) antes de llamar.
- `assertInviterCanInvite` cuenta como cobertura una sub `scheduled` (así lo hace `deriveMembershipCoveredUntil`: active+scheduled). Un invitador con solo una membresía futura aún no arrancada podría invitar; no se tocó la cobertura (compartida con descuento).
- Una sub `scheduled` del invitado NO cuenta como historial (RESEARCH §Patrón 4): alguien con solo una membresía programada y sin vigente figura como "nunca fue socio".
- Para correr bajo lock (194-09): `await db.transaction(async tx => { lock users FOR UPDATE; await svc.assertInviterCanInvite(ctx, id, tx); await svc.assertInviteeEligible(ctx, input, tx); ... })`. Los settings se leen por el pool.
- Teléfono corto (< 10 dígitos) no se rechaza: se compara por igualdad de los dígitos que haya (ES usa 9).

## Allowlist de copy

Vacía: el chequeo de "referid" sobre `invitation-types.ts` e `invitation-service.ts` no imprime nada.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model (T-194-25 ventana por persona, T-194-26 identidad contra otros usuarios, T-194-27 `deriveMembershipCoveredUntil`, T-194-28 mensajes genéricos: cubiertos y probados).

## Self-Check: PASSED

- Archivos creados verificados en disco; commits `24ef6cc3f` y `ba14e7e32` presentes en `git log`.
