---
phase: 194-invitaciones
plan: 11
subsystem: api
tags: [auth, register, invitations, d-26b, pitfall-9]
requires:
  - phase: 194-10
    provides: rutas de activación (la app lleva a "Activar invitación" con invitation.code)
provides:
  - POST /api/auth/register sin vínculo pending para código de socio
  - respuesta del registro con `invitation: { code }` (solo si el código resolvió a un socio del gimnasio de la sede)
affects: [194-15, 194-28]
key-files:
  modified:
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/test/auth/register.test.ts
    - el-templo-api/test/tenancy/iso-03-auth.test.ts
    - el-templo-api/test/referrals/ab-copy-test.test.ts
    - el-templo-api/test/referral-partners/registro-atribucion.test.ts
key-decisions:
  - "La resolución del código (`resolveSignupCode`) se movió ANTES del insert de `users` (necesita solo branch/ctx, que ya están resueltos); el dedupe de email/DNI/teléfono no cambió de lugar"
  - "El teléfono es obligatorio solo si el código resuelve a un socio del gimnasio de la sede; un código inexistente o de otro gimnasio se ignora como antes (graceful)"
requirements-completed: [D-26, D-05, D-06, SC-2]
completed: 2026-10-06
---

# Phase 194 Plan 11: registro sin vínculo pending Summary

**El registro con `?ref`/`code` de socio ya no escribe `referred_by` ni `referrals`: valida el teléfono (400 antes de crear la cuenta), mantiene el 409 de teléfono duplicado y devuelve `invitation.code` para que la app lleve a "Activar invitación".**

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `f1bacd9fb` | `auth/routes.ts` + `register.test.ts` + `iso-03-auth.test.ts` |
| 2 | `a063f6a0a` | `referrals/ab-copy-test.test.ts` |
| 2b (extra) | `220497230` | `referral-partners/registro-atribucion.test.ts` (ver desviación 1) |

## Qué cambió en producción (solo `auth/routes.ts`)

- Se eliminó el bloque (1) de atribución self-service (`update users.referredBy` + `insert referrals pending`). `grep -c "insert(referrals)"` = 0 (antes 1). Se quitaron los imports `referrals` y `referralCopyVariant`.
- Bloque de resolución de `code`/`ref` movido arriba del insert de `users`. Si `effectiveRef` resuelve (`resolveReferralCode(ctx, ...)`, con el tenant de la sede) -> `invitationCode` = código normalizado (trim + mayúsculas). Sin teléfono (o sin dígitos) -> 400 `"El teléfono es obligatorio para activar una invitación"` sin crear la cuenta.
- Respuesta: `...(invitationCode ? { invitation: { code } } : {})`. El 201/200 no tiene response schema, así que `schemas.ts` no cambió (el plan lo listaba, no hizo falta).
- Partner (3) y promo intactos; la generación eager del código propio (2) también.

## Tests

Tests modificados (antes -> después, por qué):

| Archivo | `it` | Antes -> después | Por qué |
| ------- | ---- | ---------------- | ------- |
| `auth/register.test.ts` | "un ?ref válido crea un vínculo pending..." | creaba `referrals` pending + `referred_by` -> no crea ninguno, `referred_by` NULL, respuesta `invitation: {code}` | D-26b |
| `tenancy/iso-03-auth.test.ts` | control positivo `?ref` del gimnasio 2 | afirmaba fila `referrals` con tenant 2 -> no hay fila y `invitation.code` se resuelve en el gimnasio de la SEDE (con teléfono) | D-26b |
| `referrals/ab-copy-test.test.ts` | "estampa referralCopyVariant(referrerId)..." | vía registro `?ref` -> vía la ruta real que sigue materializando vínculos con variante (`assignReferrerToMember`, D-17) | el registro ya no crea el vínculo |
| `referral-partners/registro-atribucion.test.ts` | back-compat `ref` + "code que resuelve a socio" | afirmaban 1 fila `referrals` -> 0 filas + `invitation.code` | D-26b (ver desviación 1) |

Tests nuevos (`register.test.ts`, +5): `code` de socio se comporta igual (normaliza `fran-a3b2` -> `FRAN-A3B2`); código de socio SIN teléfono -> 400 por `ref` y por `code` (y teléfono `---` cuenta como ausente) sin crear la cuenta; código de socio con teléfono ya registrado (formato distinto) -> 409 `PHONE_ALREADY_REGISTERED` sin crear la cuenta; sin código el teléfono sigue opcional y no hay `invitation`; `ref` inexistente sin teléfono no bloquea. `iso-03-auth.test.ts` (+1): un código del gimnasio 2 usado desde una sede de El Templo NO se reconoce (sin `invitation`, sin vínculo; si se reconociera daría 400 por falta de teléfono).

Conteos de `it(` (antes -> después): `register.test.ts` 9 -> 14, `iso-03-auth.test.ts` 12 -> 13, `ab-copy-test.test.ts` 7 -> 8 (el `it` del registro se partió en dos), `anti-fraud.test.ts` 6 -> 6, `member-endpoint.test.ts` 6 -> 6, `admin-referrals-endpoint.test.ts` 8 -> 8 (vitest reporta 10 por `it` parametrizados), `registro-atribucion.test.ts` 8 -> 8. Ningún archivo baja.

Corridas (foreground, `timeout 900`): `register.test.ts` + `iso-03-auth.test.ts` 27 verdes; `anti-fraud` + `member-endpoint` + `ab-copy-test` + `admin-referrals-endpoint` 30 verdes; `registro-atribucion` 8 verdes.

Mutation testing: desactivar el chequeo de teléfono (`if (false && invitationCode ...`) -> falla "un código de socio SIN teléfono -> 400" (1 de 14); revertido.

Gates: `tsc --noEmit` 0; `lint:tenant` DISCREPANCIAS 0; `typecheck:tests` sin errores en los archivos del plan.

## Deviations from Plan

**1. [Rule 3 - Bloqueante] `test/referral-partners/registro-atribucion.test.ts` no estaba en `files_modified`.** Dos de sus tests (back-compat `ref` y `code` -> socio) afirmaban la fila `referrals` pending que el registro dejó de crear (el de `code` -> socio lo confirmó la corrida: fallaba; el de `ref` es de la misma naturaleza). Se adaptaron en un commit APARTADO (`220497230`) para que el criterio "la Tarea 2 toca solo `test/referrals/`" siga cumpliéndose. Este archivo no figuraba en el Pitfall 9 del plan: el inventario de tests que usan `ref` en el registro tenía 7 archivos, no 6.

**2. [Interpretación] Solo 1 de los 4 tests de la Tarea 2 dependía realmente del `pending` del registro.** `anti-fraud`, `member-endpoint` y `admin-referrals-endpoint` ya usaban fixtures directos / `referredBy` del alta asistida; no se modificaron (verdes, `git show --stat` de la Tarea 2 lista solo `ab-copy-test.test.ts`).

**3. [Interpretación] `auth/schemas.ts` no se tocó.** El registro no declara schema de respuesta, así que la clave `invitation` sale sin extender nada.

**4. [Orden] La resolución del código se movió ANTES del insert de `users`, no antes del dedupe.** `resolveSignupCode`/`resolveReferralCode` necesitan la sede y el tenant, que se resuelven después del dedupe. El efecto buscado se mantiene: el 400 por teléfono falta ocurre antes de crear la cuenta, y el 409 por teléfono duplicado también. Consecuencia menor: un request con código de socio, sin teléfono y con email ya registrado devuelve 409 de email (no 400).

## Lecciones para planes siguientes

- Cualquier test que registre por `POST /api/auth/register` con `ref`/`code` de socio necesita `phone` (si no, 400) y NO tendrá fila en `referrals` (el vínculo nace al comprar, 194-15). El registro responde 200 (no 201).
- Para fixtures de vínculo con variante A/B por la ruta real: `ReferralService.assignReferrerToMember({ referredId, referrerId, createdBy, tenantId })` (admin = `admin@test.com` con `tenantWhere`).
- Un código de socio de otro gimnasio no se reconoce desde una sede ajena (ISO): mismo comportamiento que un código inexistente.
- Un archivo de integración tarda 200-570 s según carga; 4 archivos juntos ~560 s con `timeout 900` alcanzan.
- El hook del worktree rechaza comandos compuestos con varios `sed -i`/`&&`: usar Edit y llamadas simples.

## Allowlist de copy

Vacía (no se tocó copy visible con "referid" en app/admin; el único copy nuevo es el 400 de API sin esa palabra).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-194-37 (sin `referrals` pending en el registro: probado) y T-194-38 (teléfono obligatorio + 409 antes de crear la cuenta: probado, con mutation) cubiertos.

## Self-Check: PASSED
