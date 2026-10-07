---
phase: 194-invitaciones
plan: 28
subsystem: app
tags: [invitations, activation, landing, register, login, version, d-06, d-26, sc-1, sc-2]
requires:
  - phase: 194-10
    provides: GET eligibility y POST activate
  - phase: 194-11
    provides: registro con codigo de socio (invitation.code, telefono obligatorio)
  - phase: 194-27
    provides: Mis invitados (destino tras activar) y rebrand de la app
provides:
  - "/invitacion/:code: landing publica (auth-agnostica) sin nombre del invitador ni numeros"
  - "/activar-invitacion: elegibilidad + sede + telefono + DNI opcional + activacion, con los valores del servidor"
  - "utils/pending-invitation.ts: codigo pendiente con TTL 7 dias sobre storage inyectable"
  - "Registro con codigo de invitacion (telefono obligatorio, 409 con caminos de login y recepcion) y login con ?invitacion="
  - "App 1.8.2"
affects: []
key-files:
  created:
    - el-templo-app/src/pages/InvitacionLandingPage.vue
    - el-templo-app/src/pages/ActivarInvitacionPage.vue
    - el-templo-app/src/utils/pending-invitation.ts
    - el-templo-app/src/utils/__tests__/pending-invitation.test.ts
  modified:
    - el-templo-app/src/router/routes.ts
    - el-templo-app/src/router/guards.ts
    - el-templo-app/src/pages/RegisterPage.vue
    - el-templo-app/src/pages/LoginPage.vue
    - el-templo-app/src/stores/useAuthStore.ts
    - el-templo-app/src/utils/signup-code.ts
    - el-templo-app/src/utils/invitation-view.ts
    - el-templo-app/test/router-guard.test.ts
    - el-templo-app/test/signup-code.test.ts
    - el-templo-app/version.txt
    - el-templo-app/package.json
    - el-templo-app/src-capacitor/android/app/build.gradle
    - el-templo-app/src-capacitor/ios/App/App.xcodeproj/project.pbxproj
key-decisions:
  - "La landing sin sesion no consulta nada del invitador (T-194-86): copy generico fijo; nombre, accesos y dias habiles solo aparecen en 'Activar invitacion' ya autenticado, con accessesBudget/accessBusinessDays del servidor"
  - "El codigo pendiente se limpia al activar, al ver un motivo definitivo (invitee_is_member, invitee_recent_member, invitee_recent_invitation, self_invite, inviter_not_found) y al tocar 'Ir al inicio' en cualquier rechazo (descartar es explicito); los motivos del lado del invitador no lo limpian solos"
  - "El telefono tipeado en el registro viaja a la activacion SOLO por memoria (rememberPhoneForActivation), nunca por storage persistente"
requirements-completed: [D-06, D-26, SC-1, SC-2, D-27]
completed: 2026-10-07
---

# Phase 194 Plan 28: Activar invitacion (app) y version 1.8.2 Summary

**El link `/invitacion/:code` (o el viejo `/register?ref=`) lleva a registro o login y de ahi a "Activar invitacion": la app consulta la elegibilidad, pide sede fisica y telefono, activa y muestra "Tenes N accesos hasta <fecha>" con los numeros que manda el servidor; el codigo pendiente sobrevive al paso por registro/login y la app queda en 1.8.2.**

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `fa2749c6b` | `pending-invitation.ts` + 9 casos, landing, `ActivarInvitacionPage`, rutas `invitacion`/`activar-invitacion`, guard (`authAgnosticRoutes` + `onboardingExemptRoutes`) + 6 casos, `formatLongDate` |
| fix | `c253edcd6` | `normalizeSignupCode` conserva el guion de los codigos de socio (ver desviacion 1) |
| 2 | `a1d1c58c8` | Registro (CODIGO DE INVITACION, telefono obligatorio con codigo, 409 con caminos), login con `?invitacion=`, store devuelve `invitationCode` |
| 2 | `a5ff93582` | version 1.8.2: `version.txt`, `bump-version.sh` (build.gradle, project.pbxproj), `package.json` |

## Verificacion

- `pnpm lint`: 0 errores (2 warnings preexistentes). `pnpm build`: OK. `pnpm test`: 298 verdes, 2 rojos PREEXISTENTES en `test/level-display.test.ts` (kairos, ver `deferred-items.md`); ningun fallo nuevo.
- `version.txt` = 1.8.2; `grep 1.8.1` en package/gradle/pbxproj = 0; `git status` limpio (`dist/` ignorado).
- Mutation testing (de a uno, revertidos): sacar `activar-invitacion` de `onboardingExemptRoutes` rompe el caso del guard; `<=` -> `<` en el TTL rompe el caso de expiracion; sumar `inviter_quota_exhausted` a los motivos definitivos rompe el caso de motivos.
- Criterios de aceptacion: `'invitacion'` en `guards.ts` (authAgnosticRoutes), `activar-invitacion` en guards + routes + Register + Login, `invitations/activate` en la pantalla de activacion, `[^0-9](3|10) (accesos|dias)` en las dos paginas = 0, `eligibility` en la landing = 0, `CÓDIGO DE REFERIDO` = 0.
- Copy: chequeo canonico sobre los archivos de la tarea sin salida; barrido sin exclusiones de toda la app revisado a mano: restan solo la clave/ruta interna (`referidos`, `mis-referidos`) en `destinations.ts`/`routes.ts`, los tests de esas claves y los tests que afirman que el copy NO dice "referido".
- No se pudo probar en navegador (sin `vue-tsc`, sin dispositivo): las paginas se verificaron por lint + build y revision de la logica; la logica pura (codigo pendiente, guard, normalizacion, fechas) esta cubierta por tests.

## Deviations from Plan

**1. [Rule 1 - Bug] `normalizeSignupCode` sacaba el guion del codigo de socio.** El codigo de socio es `PREFIJO-XXXX` y el servidor lo resuelve por igualdad exacta (`resolveSignupCode`, rama socio: solo trim + upper). El campo unificado del registro lo normalizaba a `[A-Z0-9]` y se mandaba como `code`, que GANA sobre `ref` en el servidor: un codigo de socio llegaba como `FRANA3B2` y nunca se reconocia (rompia el requisito "los links viejos `/register?ref=` siguen funcionando" y tambien el link nuevo). Se cambio a `[A-Z0-9-]` (las ramas partner/promo del servidor re-normalizan y quitan el guion, no cambia nada para ellas) y se actualizo `test/signup-code.test.ts` (el caso `cafe-x` pasa a `cafe x!`; caso nuevo del guion). Commit `c253edcd6`. Archivos fuera de `files_modified`: `signup-code.ts` y su test.

**2. [Rule 3 - Archivos extra] `useAuthStore.ts`.** `register()` descartaba `invitation.code` de la respuesta; ahora devuelve `invitationCode` (necesario para llevar a "Activar invitacion", D-26b). No esta en `files_modified`. Tambien `utils/invitation-view.ts` (+ `formatLongDate` para "hasta el viernes 30 de octubre") y `test/router-guard.test.ts` (+6 casos del guard).

**3. [Interpretacion] Telefono "precargado del perfil".** `GET /auth/me` no devuelve telefono (el tipo `UserProfile` tampoco), asi que no hay perfil del cual precargar. Se resolvio con `rememberPhoneForActivation`: el telefono que el socio acaba de tipear en el registro pasa a la pantalla de activacion por memoria (sin storage persistente). Quien llega por login lo tipea una vez en la activacion.

**4. [Interpretacion] Limpieza del pendiente con motivos del lado del invitador.** El plan limpia el pendiente solo con motivos definitivos. Para que `inviter_not_member`/`inviter_quota_exhausted` no secuestren cada login durante 7 dias, "Ir al inicio" limpia el pendiente en cualquier rechazo (descartar es una accion explicita); la persona vuelve a abrir el link cuando quiera y la landing lo guarda de nuevo.

**5. [Menor] Login solo redirige a "Activar invitacion" para socios.** Un rol coach/admin con codigo pendiente sigue el flujo normal (la activacion es para el `member`).

**6. [Menor] Elegibilidad se reconsulta al elegir sede.** El servidor ya soporta `branchId` y devuelve los accesos del pais de esa sede; sin sede (socio en sede virtual) el copy es generico ("Elegi tu sede para ver cuantos").

**7. [Entorno] `node_modules` de la app re-apuntado** (ver 194-27, desviacion 3).

## Allowlist de copy

Vacia.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model. T-194-86 (la landing no consulta eligibility ni muestra nombre, grep = 0), T-194-87 (storage solo guarda el codigo, TTL 7 dias, valor manipulado se descarta con test), T-194-88 (telefono obligatorio con codigo + 409 con caminos de login/recepcion) cubiertos.

## Pendientes humanos

- **Builds de tienda 1.8.2 PENDIENTES (gate humano).** No se disparo ningun build ni push.
- Verificar en dispositivo: link nuevo sin sesion, con sesion, `?ref=` viejo, 409 por cuenta existente, activacion y "Reservar mi primera clase".
- Los symlinks `node_modules` de admin y API del worktree siguen apuntando a un checkout borrado (no se usaron aca).

## Lecciones para planes siguientes

- Antes de enviar un codigo al registro: el servidor resuelve `code` ANTES que `ref`, y el codigo de socio lleva guion. Cualquier normalizacion de cliente debe conservarlo.
- `GET /auth/me` NO trae telefono ni DNI del usuario: si una pantalla necesita precargarlos, hay que agregarlos a la API.
- Sin `vue-tsc` los tipos de las paginas `.vue` no se chequean: grepear consumidores a mano al cambiar el retorno de un store (`authStore.register` solo lo consume `RegisterPage.vue`).
- El hook del harness rechaza heredocs largos (incluso python con `-I -`): escribir con Write/Edit y ejecutar en llamadas aparte.
- `destinations.ts`: ningun comentario dentro de la tupla key/label/route (ver 194-27).

## Self-Check: PASSED
