---
phase: 194-invitaciones
plan: 10
subsystem: api
tags: [invitations, member-routes, idor, tenancy, eligibility, activation]
requires:
  - phase: 194-08
    provides: reglas de cupo/elegibilidad (InvitationService, INELIGIBLE_MESSAGES)
  - phase: 194-09
    provides: InvitationService.activate y BookingService como 4.º argumento
provides:
  - GET /api/members/referrals/invitations/eligibility
  - POST /api/members/referrals/invitations/activate
  - InvitationService.previewActivation
  - sendInvitationError (mapeo de errores reutilizable por 194-12)
affects: [194-11, 194-12, 194-27, 194-28]
tech-stack:
  patterns: [preValidation que rechaza claves extra con 400 (ajv las descarta), errores de reglas con reason estable]
key-files:
  created:
    - el-templo-api/src/modules/referrals/invitation-schemas.ts
    - el-templo-api/src/modules/referrals/invitation-errors.ts
    - el-templo-api/test/invitations/member-routes.test.ts
  modified:
    - el-templo-api/src/modules/referrals/routes.ts
    - el-templo-api/src/modules/referrals/invitation-service.ts
    - el-templo-api/src/modules/referrals/invitation-types.ts
    - el-templo-api/test/tenancy/iso-03-referrals.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura-analytics-resto.test.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "La consulta previa vive en el servicio (previewActivation), no en la ruta: mismas reglas y mismo orden que activate"
  - "Claves extra en el body => 400 explícito por preValidation (ajv las descarta en silencio y daría 201)"
  - "El selector de sedes se limita al país del socio si ya entrena en una sede física (activate rechaza otro país)"
requirements-completed: [D-06, SC-1, SC-2]
completed: 2026-10-06
---

# Phase 194 Plan 10: rutas de app de invitaciones Summary

**La app tiene dos rutas autenticadas, aisladas por tenant y sin IDOR: consultar la elegibilidad de un código (con sedes, cupo de accesos y vigencia en días hábiles) y activar la invitación para el usuario del token, ambas corriendo las reglas del `InvitationService`.**

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `66d6f6081` | rutas, schemas, `previewActivation`, `sendInvitationError`, tests HTTP, manifiesto y gates ISO |

## Contrato HTTP (para 194-27/28)

Ambas rutas: prefijo `/api/members/referrals`, header `Authorization: Bearer <token>`. Sin token => 401. El invitado es SIEMPRE el usuario del token.

### GET `/invitations/eligibility?code=X[&branchId=N]`

- `code`: 1..24, `[A-Za-z0-9-]`. `branchId` (opcional, entero >= 1): sede destino elegida en el selector.
- 200:

```ts
{
  inviterFirstName: string | null   // solo nombre de pila (sin apellido ni id)
  eligible: boolean
  reason: InvitationIneligibleReason | null   // estable, ver invitation-types.ts
  message: string | null                      // copy en español, listo para mostrar
  branches: { id: number; name: string; country: string }[]   // sedes FÍSICAS activas
  accessesBudget: number | null     // classes_per_week del plan Invitación del país de referencia
  accessBusinessDays: number        // vigencia en días hábiles (parámetro del gimnasio)
}
```

- `reason` posibles con 200: `self_invite`, `inviter_not_member`, `inviter_quota_exhausted`, `invitee_is_member`, `invitee_recent_member`, `invitee_recent_invitation`. La identidad (`phone_required`/`phone_taken`/`dni_taken`) NO se evalúa acá: se valida al activar, porque el socio todavía no tipeó el teléfono.
- País de referencia: el de la sede FÍSICA actual del socio; si está en la sede virtual, el de `branchId`; sin ninguna, `accessesBudget = null` (copy genérico hasta elegir sede) y `branches` trae las sedes físicas de todos los países. Si el socio ya entrena en una sede física, `branches` trae solo las de su país (porque `activate` rechaza otro país con 400).
- `accessesBudget = null` también si el país no tiene plan Invitación configurado.
- 404 `{ error, message, reason: "inviter_not_found" }` si el código no existe en el gimnasio del socio (un código de otro gimnasio es indistinguible de uno inexistente).
- 400: `code` ausente/inválido, `branchId` de sede virtual, o de otro país para quien ya entrena en una física. 404: `branchId` inexistente o de otro gimnasio.

### POST `/invitations/activate`

- Body: `{ code, branchId: integer >= 1, phone: string 6..30, dni?: string | null (<= 20) }`. Cualquier otra clave (`invitedUserId`, `inviterId`, `userId`...) => 400 `Campos no permitidos: ...`.
- 201: `{ invitationId, subscriptionId, accessExpiresOn: 'YYYY-MM-DD', classesBudget: number | null, branchId }`.
- Errores con body `{ error, message, reason }`:
  - 404 `inviter_not_found`.
  - 400 `phone_required` (teléfono sin dígitos), o sede virtual / sede de otro país (sin `reason`).
  - 404 sede inexistente o de otro gimnasio.
  - 409 con `reason`: `inviter_not_member`, `inviter_quota_exhausted`, `self_invite`, `invitee_is_member`, `invitee_recent_member`, `invitee_recent_invitation`, `phone_taken`, `dni_taken`.
- Efectos del 201 (de 194-09): sede física asignada, teléfono/DNI guardados, `users.status = prueba`, lead `en_seguimiento`, sub plan Invitación $0 con `endDateOverride`.

## Cómo está armado

- `routes.ts` arma `SubscriptionService` + `BookingService` (enlazados con `setBookingService`) e `InvitationService` con el `BookingService` como 4.º argumento (lección de 194-09).
- `InvitationService.previewActivation(ctx, { code, invitedUserId, branchId? })`: resuelve el invitador por código, y evalúa en el mismo orden que `activate`: `self_invite` -> invitador (`assertInviterCanInvite`) -> invitado (D-11/D-12, con `skipIdentity`). Un invitador que no puede invitar no lanza: devuelve `eligible:false` con el motivo para que la pantalla lo explique.
- `sendInvitationError(err, reply, log, context)` (en `invitation-errors.ts`): `InvitationRuleError` => 404 (`inviter_not_found`), 400 (`phone_required`) o 409; el resto pasa por `handleServiceError`. 194-12 lo reusa.
- `rejectUnknownBodyKeys(allowed)` (en `invitation-schemas.ts`): `preValidation` reutilizable.

## Tests

- `member-routes.test.ts`: 26 verdes (14 de GET y 12 de POST, con IDOR y validación del body; incluye "lo que dice el GET es lo que hace el POST").
- `iso-03-referrals.test.ts`: 14 verdes (+6: elegibilidad 404 en ambos sentidos + control con sedes propias; activación 404 por código ajeno y por sede ajena sin escribir filas en NINGÚN gimnasio + control 201 con fila `TENANT_TEMPLO`).
- `iso-03-cobertura-analytics-resto.test.ts`: 8 verdes con `CASOS_BASELINE` 57 -> 59. `iso-01-manifiesto.test.ts`: 13 verdes con `ENTRADAS_BASELINE` 449 -> 451.
- Regresión de lo que se tocó en el servicio: `eligibility.test.ts` 33 verdes.
- **Mutation testing:** sacar el filtro de sedes virtuales y de país del selector => fallan 2 tests (`200 elegible...` y `socio en sede física...`); revertido. Antes de agregar el `preValidation`, el test de IDOR (`invitedUserId` en el body) falló con 201 (ver desviación 1): confirma que el test detecta la regresión.
- Gates: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `typecheck:tests` sin errores en archivos del plan, chequeo de copy "referid" sobre los 4 archivos de `referrals/invitation-*` sin líneas.
- Acceptance: manifiesto 2 claves, `request.body.invitedUserId|body.userId` en routes 0 líneas, `additionalProperties: false` x2 en schemas.

## Deviations from Plan

**1. [Rule 1/2 - Bug de seguridad] `additionalProperties:false` no devuelve 400.** Fastify (ajv `removeAdditional`) descarta las claves extra en silencio: un `invitedUserId` ajeno daba 201 (ignorado, activaba al del token, pero el plan exige 400). Se agregó el `preValidation` `rejectUnknownBodyKeys` (las claves permitidas salen del propio schema) y el 400 explícito. El schema conserva `additionalProperties:false`.

**2. [Archivo extra] `invitation-service.ts` e `invitation-types.ts` tocados (no estaban en `files_modified`).** `previewActivation` y los tipos `ActivationPreview*` viven en el servicio para que el GET use exactamente las reglas del servicio (el plan lo exige) y 194-12/UI no dupliquen lógica. Cambios laterales mínimos: `findIneligibleReason` acepta `{ skipIdentity }` y `hasRecentInvitation` no compara teléfono si viene vacío.

**3. [Interpretación] `branches` filtra por país cuando el socio ya está en una sede física.** El plan dice "sedes físicas activas del tenant"; `activate` rechaza (400) otro país para quien ya entrena en una física, así que el selector no ofrece opciones que van a fallar. Un socio en la sede virtual ve todas las sedes físicas activas.

**4. [Interpretación] El GET devuelve `eligible:false` (200) cuando el invitador no puede invitar** (`inviter_not_member`, `inviter_quota_exhausted`), en vez de un error, para que la app muestre el motivo en la misma pantalla. Solo un código inexistente da 404.

**5. [Test] Control positivo ISO del POST con 201 real** (plan Invitación + invitador con membresía sembrados en El Templo); para el gimnasio 2 el control es el GET con su propio código (sembrar plan Invitación + sub en el gimnasio 2 no aportaba aislamiento extra).

## Lecciones para planes siguientes

- Fastify con `additionalProperties:false` NO rechaza claves extra: para un 400 explícito hace falta un `preValidation` (usar `rejectUnknownBodyKeys`). Ya estaba en las lecciones de 194-07 para el body; acá se confirma para el IDOR.
- El fixture `sembrarReferralsTemplo` usa la primera sede de El Templo por id, que es física pero INACTIVA: no asumir que `templo.branchId` aparece en listados de sedes activas (comparar pertenencia al tenant, no presencia).
- Un 409 de regla del invitador (`inviter_not_member`) se evalúa ANTES de resolver la sede en `activate`: un test de "sede ajena => 404" necesita un invitador con membresía vigente.
- Los archivos de tenancy tardan 270-400 s cuando corren 3 juntos; 2 archivos de integración ~280 s. Con `timeout 590` (límite de la herramienta es 600 s) conviene correr como máximo 3.
- Un `prettier --write src/modules/referrals/*.ts` reformatea archivos ajenos (`service.ts`, `invitation-settings.ts`): pasar siempre rutas explícitas.
- Heredocs con python en Bash los rechaza el hook del worktree: escribir el script con Write y ejecutarlo en una llamada aparte.

## Allowlist de copy

Vacía.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model. T-194-34 (IDOR: invitado = token, claves extra => 400, probado), T-194-35 (solo autenticado, nombre de pila, sin apellido ni id, probado), T-194-36 (`assertTenant` + casos ISO-03 404 en ambos sentidos, sede ajena 404) cubiertos.

## Self-Check: PASSED

- Archivos creados verificados en disco; commit `66d6f6081` presente en `git log`; worktree limpio salvo este SUMMARY.
