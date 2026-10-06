---
phase: 194-invitaciones
plan: 12
subsystem: api
tags: [invitations, assisted-channel, members, admin, d-16, d-24, d-17, tenancy]
requires:
  - phase: 194-09
    provides: InvitationService.activate / voidInvitation
  - phase: 194-10
    provides: sendInvitationError, rejectUnknownBodyKeys
provides:
  - POST /api/admin/members/:userId/invitations
  - POST /api/admin/members/:userId/invitations/:invitationId/void
  - POST /api/admin/members/trial con `inviterId` ("Lo invita")
  - AssistedInvitations (referrals/invitation-assisted.ts) y buildInvitationService (referrals/invitation-factory.ts)
affects: [194-22, 194-24]
tech-stack:
  patterns: [canal asistido compone InvitationService sin engordarlo, factory compartida entre canal app y admin, closure de scope generalizada con roles por parámetro]
key-files:
  created:
    - el-templo-api/src/modules/referrals/invitation-assisted.ts
    - el-templo-api/src/modules/referrals/invitation-factory.ts
    - el-templo-api/test/invitations/assisted.test.ts
  modified:
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/src/modules/referrals/invitation-schemas.ts
    - el-templo-api/src/modules/referrals/routes.ts
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura-members.test.ts
    - el-templo-api/test/tenancy/iso-03-members-ficha.test.ts
key-decisions:
  - "invitation-service.ts NO se tocó (regla de 194-32): el canal asistido vive en invitation-assisted.ts y compone InvitationService"
  - "El invitador del canal asistido se valida en el gimnasio (assertInviterCanInvite) Y en el scope de país del staff (isMemberInScope): uno fuera de alcance es inviter_not_found (404)"
  - "Las claves extra del body (createdBy, voidedBy, tenantId) dan 400 explícito con rejectUnknownBodyKeys, no se ignoran en silencio"
  - "Alta con invitador: si la activación falla DESPUÉS de crear el lead, 201 con invitation null + invitationError (el lead vale por sí mismo)"
requirements-completed: [D-16, D-24, D-17, D-06, SC-2]
completed: 2026-10-06
---

# Phase 194 Plan 12: canal asistido de invitaciones Summary

**Recepción y gestión invitan en nombre de un socio con las mismas reglas que la app (un solo `InvitationService.activate`), el alta "Nuevo en Prueba" acepta `inviterId` ("Lo invita") y valida al invitador antes de crear el lead, y la anulación es de gestión con rastro; "Referido por" y "¿Quién lo trajo?" siguen siendo vínculos de descuento sin accesos ni cupo.**

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1+2 (código) | `0deffabd2` | rutas, `AssistedInvitations`, factory, schemas, permisos, manifiesto 453, `CASOS_BASELINE` 35, 2 casos ISO-03 |
| 1+2 (tests) | `41f099d25` | `test/invitations/assisted.test.ts` (22 casos) |

Las dos tareas del plan comparten `members/routes.ts` y `AssistedInvitations`; se commitearon juntas (código + gates) y aparte (tests), no una por tarea.

## Contrato HTTP (para el admin, 194-24)

Prefijo `/api/admin/members`, `Authorization: Bearer <token>`. Errores de reglas: `{ error, message, reason }` (mismos `reason` que la app: `inviter_not_found` 404, `phone_required` 400, el resto 409; ver `invitation-types.ts`).

### POST `/:userId/invitations`

- Roles: `INVITATION_ASSISTED_ROLES` = owner, admin, gestion, admin_sede, recepcion. coach/socio => 403, sin token => 401.
- Body: `{ inviterId: int >= 1, branchId: int >= 1, phone?: string 6..30, dni?: string|null <= 20 }`. Cualquier otra clave (`createdBy`, `tenantId`...) => 400 `Campos no permitidos`.
- `phone` ausente => usa el teléfono guardado del alumno; sin ninguno => 400 `phone_required`. `branchId` pasa por `requireBranchAccess` (403 si el staff no tiene esa sede).
- 201: `{ invitationId, subscriptionId, accessExpiresOn: 'YYYY-MM-DD', classesBudget, branchId }`. Efectos de `activate`: canal `assisted`, `created_by` = staff del JWT, alumno en `prueba` con plan Invitación $0.
- 404: `:userId` inexistente / de otro gimnasio / de otro país del staff no-owner, o `inviterId` en esas condiciones (`reason: inviter_not_found`). 409: cupo (`inviter_quota_exhausted`), invitador sin membresía, alumno socio/reciente, teléfono o DNI ajenos.
- No se crea ninguna cuenta: sirve para el lead de recepción sin email ni contraseña (D-06).

### POST `/:userId/invitations/:invitationId/void`

- Roles: `MEMBER_LIFECYCLE_ROLES` (owner, admin, gestion, admin_sede). recepcion/coach => 403.
- Body: `{ reason: string 3..64 }` (otras claves => 400, `voidedBy` sale del JWT). 200: `{ invitationId, status: "voided" }`.
- La invitación tiene que ser de ESE alumno y del gimnasio, si no 404; ya anulada => 409. Libera el cupo, cierra los accesos y cancela reservas futuras (comportamiento de `voidInvitation`, 194-09).

### POST `/trial` con `inviterId` (D-24 "Lo invita")

- Body de siempre + `inviterId?: int >= 1`. Con `inviterId` el rol tiene que estar en `INVITATION_ASSISTED_ROLES` (coach => 403) y el invitador se valida ANTES de crear el lead: sin membresía/cupo => 409 con `reason`, inexistente o fuera de alcance => 404, y NO queda ningún lead.
- 201: el perfil del lead (como hoy) + `invitation: { invitationId, subscriptionId, accessExpiresOn, classesBudget, branchId } | null` + `invitationError: { reason, message } | null`. Si la activación falla después de crear el lead (p. ej. sin plan Invitación del país o sede virtual): `invitation: null` e `invitationError` con el motivo; el lead queda y el cupo no se consume (la fila de la activación rota queda `voided`/`activation_failed`).
- Sin `inviterId`: respuesta idéntica a hoy (sin esas dos claves). Teléfono duplicado => 409 del dedupe del alta, sin consumir cupo.

### D-17 (sin cambios de código)

`POST /api/admin/members` con `referredBy` y `POST /:userId/referrals` siguen creando el vínculo de descuento `assisted` SIN fila en `invitations` y sin tocar el cupo del referidor (tests). Las reglas nuevas de D-17 (flag por plan, tope en dinero) se aplican al cobrar vía el árbitro (194-14..18), no acá.

## Cómo está armado

- `referrals/invitation-assisted.ts` (`AssistedInvitations`): `activateForMember` (resuelve el teléfono guardado), `voidForMember` (verifica pertenencia invitación-alumno-gimnasio antes de delegar) y `createLeadWithInvitation` (assertInviterCanInvite -> `createLead` callback -> activate con captura de error). Sin reglas propias.
- `referrals/invitation-factory.ts` (`buildInvitationService`): único armado de `InvitationService` + `SubscriptionService` + `BookingService` (4.º argumento). `referrals/routes.ts` ahora lo usa (se quitaron 4 imports y ~20 líneas duplicables).
- `members/routes.ts`: `assertReferralTargetInScope` se generalizó con `opts.allowedRoles/deniedMessage` (default = comportamiento de referidos intacto) y se extrajo `isMemberInScope` (lo reusa el `inviterId`). `assistedInvitationsFor(log)` arma el canal por request.
- `shared/permissions.ts`: `INVITATION_ASSISTED_ROLES`.

## Tests

- `assisted.test.ts`: 22 verdes (foreground, ~176 s): lead de `/trial` activado desde la ficha sin cuenta duplicada, teléfono guardado vs body vs `phone_required`, cupo agotado, socio vigente, invitador sin membresía, matriz de roles (recepcion/gestion/admin pueden; coach, socio y sin token no), invitador inexistente, alcance de país (gestion ES vs alumno e invitador AR), claves extra 400, void (rastro, cupo liberado, sub `completed`; recepcion/coach 403; invitación de otro alumno 404; doble anulación 409; motivo corto 400; `voidedBy` 400), alta con invitador (éxito, sin inviterId igual que hoy, sin cupo/sin membresía/inexistente/coach => sin lead, teléfono duplicado, falla de activación posterior) y D-17 por `POST /members` y por `/:userId/referrals`.
- ISO: `iso-03-members-ficha.test.ts` +4 `it` (2 describe nuevos con aislamiento + control); `iso-03-cobertura-members.test.ts` `CASOS_BASELINE` 33 -> 35; `iso-01-manifiesto.test.ts` `ENTRADAS_BASELINE` 451 -> 453. Corrida de los 3 archivos: 57 verdes.
- Regresión: `admin-assign-referrer.test.ts` + `members-trial.test.ts`: 28 verdes.
- **Mutation testing:** anular la validación de país del invitador (`isMemberInScope` del `inviterId`, en las dos rutas) => falla "alcance de país..." (1 de 22); revertido. El test ISO de invitador ajeno no la detecta porque `assertInviterCanInvite` ya filtra por gimnasio: la capa de país solo la prueba el caso de gestion ES.
- Gates: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `typecheck:tests` sin errores en archivos del plan.

## Deviations from Plan

**1. [Interpretación] Se extendió `invitation-schemas.ts` (referrals) en vez de `members/schemas.ts` para los schemas nuevos.** Los dos schemas de las rutas nuevas, sus bodies y los fragmentos de respuesta viven en `referrals/invitation-schemas.ts` (junto a `rejectUnknownBodyKeys`); `members/schemas.ts` solo agrega `inviterId` y la respuesta extendida de `/trial`. `permissions.ts` y `types.ts` según plan.

**2. [Interpretación] `channel: "assisted"` está en `invitation-assisted.ts`, no en `members/routes.ts`/`service.ts`.** El criterio de aceptación literal (`grep` en esos dos archivos) da 0; la línea existe (1) en el archivo propio por la regla de 194-32 (no engordar servicios). `members/service.ts` no se tocó.

**3. [Endurecimiento] 400 explícito para claves extra del body** (`createdBy`, `voidedBy`, `tenantId`) con `rejectUnknownBodyKeys`, en vez del descarte silencioso de `additionalProperties:false` que decía el plan (lección de 194-10). `/trial` conserva el descarte silencioso (comportamiento previo).

**4. [Extra] Factory `buildInvitationService`** (no listada): evita copiar por tercera vez el armado con `BookingService`; `referrals/routes.ts` quedó usándola.

**5. [Extra] Validación de país del invitador** (T-194-41 la pide; el plan no detallaba cómo): `isMemberInScope` aplicada al `inviterId`.

**6. [Agrupación] Una sola pasada de commits para las dos tareas** (ver tabla), por el código compartido.

## Lecciones para planes siguientes

- El `copy` "No tienes permiso para ver los referidos" (default de `assertReferralTargetInScope`) y los comentarios "referidos" de `members/routes.ts` son copy preexistente: el rebrand es 194-22.
- `members/schemas.ts` ahora importa de `referrals/invitation-schemas.ts` (sin ciclo: ese archivo solo importa tipos de fastify).
- Un `describe` nuevo de aislamiento por ruta alcanza para `CASOS_BASELINE` (cuenta describes con clave de ruta, no `it`); la clave es el primer `METODO /ruta` del nombre del `describe`.
- Para sembrar una invitación asistida de punta a punta en tests: staff con `createStaffUser` + `getAuthToken`, invitador con `createInviterWithCode`, plan Invitación con `createTrialPlan` (creado DESPUÉS de `cleanAllTestData`). `createInviterWithCode(ctx, { country: "ES" })` necesita una sede física ES (la crea `ensurePhysicalBranch`).
- `requireBranchAccess({ from: "body.branchId" })` responde 403 si el staff no tiene la sede: es previo al guard de rol del handler (un coach con sede válida recibe el 403 del handler).
- Hook del worktree: scripts python y comandos con heredocs conviene escribirlos con Write y ejecutarlos con `python3 -I archivo`.

## Allowlist de copy

Vacía para los archivos nuevos (`invitation-assisted.ts`, `invitation-factory.ts`, `invitation-schemas.ts`: el chequeo canónico no imprime nada). `members/routes.ts` conserva copy "referidos" preexistente (fuera de alcance, 194-22).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model. T-194-39 (coach 403), T-194-40 (recepción no anula), T-194-41 (404 en gimnasio y país; ISO-03 con control), T-194-42 (mismo `activate`), T-194-43 (`createdBy` del JWT, claves extra 400) cubiertos y probados.

## Self-Check: PASSED
