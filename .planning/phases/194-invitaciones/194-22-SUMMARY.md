---
phase: 194-invitaciones
plan: 22
subsystem: api
tags: [rebrand, copy, campaigns, audience, invitations, d-26, d-26b, sc-5, tenancy]
requires:
  - phase: 194-21
    provides: seeds y migracion 0261 con el copy nuevo de la notificacion y del aviso
  - phase: 194-13
    provides: converted_at en invitations y registro que ya no crea referrals.pending
provides:
  - copy visible de la API en terminos de invitado/invitador/invitacion
  - segmento de campanas referidos_pendientes alimentado por invitaciones activas sin convertir
affects: [194-26, 194-27]
tech-stack:
  patterns: [builder de segmento con ctx para filtrar tenant inline en un EXISTS correlacionado]
key-files:
  modified:
    - el-templo-api/src/modules/campaigns/audience-service.ts
    - el-templo-api/src/modules/referrals/service.ts
    - el-templo-api/src/modules/referrals/invitation-link.ts
    - el-templo-api/src/modules/communications/destinations.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/referral-partners/service.ts
    - el-templo-api/test/campaigns-audience.test.ts
    - el-templo-api/test/referrals/activation-notification.test.ts
    - el-templo-api/test/referrals/admin-assign-referrer.test.ts
    - el-templo-api/test/referrals/aura-annotation.test.ts
key-decisions:
  - "SEGMENT_BUILDERS pasa a (ctx) => SQL[]: el EXISTS contra invitations lleva `invitations.tenant_id = ctx.tenantId` inline (T-194-75). Los otros 4 segmentos ignoran el parametro"
  - "La regla de frescura D-10 (alta de mas de 3 dias) se mantiene para TODO el segmento: un invitado nuevo entra recien a partir del dia 4 de su ventana de 6 dias, justo cuando conviene empujarlo a comprar"
  - "Las filas viejas de aura_transactions con 'Descuento por referido' NO se tocan, solo la descripcion de las anotaciones nuevas"
requirements-completed: [D-26, D-05, SC-5]
completed: 2026-10-07
---

# Phase 194 Plan 22: copy de la API + segmento remapeado Summary

**Toda cadena visible de la API dice invitador/invitado/invitacion (errores de asignacion retroactiva, descripcion AURA, label del destino, aviso al invitador) con las claves internas y rutas intactas para las builds publicadas, y el segmento `referidos_pendientes` incluye invitaciones activas sin convertir (el registro ya no crea `referrals.pending`).**

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `87674983d` | copy de la API, segmento remapeado, tests |

## Inventario de strings (antes -> despues)

| Archivo | Antes | Despues |
| ------- | ----- | ------- |
| `referrals/service.ts` (assignReferrerToMember, BadRequest) | Un socio no puede figurar como su propio referidor | ... su propio invitador |
| `referrals/service.ts` (NotFound) | El socio que figura como referidor no existe | ... figura como invitador no existe |
| `referrals/service.ts` (2 ConflictError, check previo y carrera UNIQUE) | Este socio ya tiene un referidor asignado | Este socio ya tiene un invitador asignado |
| `referrals/service.ts` (descripcion AURA, `recordReferralCredit`) | Descuento por referido: N% | Descuento por invitación: N% |
| `referrals/invitation-link.ts` (`bodyOverride` del aviso al invitador) | {Nombre} pagó su primer plan. Ya tenés tu descuento activo. | ... Ya tenés tu descuento por invitación activo. (igual al seed de 0261) |
| `communications/destinations.ts` (label del destino `referidos`) | Referidos | Invitaciones |
| `members/routes.ts` (deniedMessage por defecto del guard de ficha) | No tienes permiso para ver los referidos | No tienes permiso para ver las invitaciones |
| `referral-partners/service.ts` (409 de origen de socio) | Este socio ya tiene un referidor de socio asignado | ... un invitador de socio asignado |

`subscriptions/service.ts:~730`: el `bodyOverride` ya no vive ahi (se movio a `referrals/invitation-link.ts` en 194-14), se cambio en su lugar nuevo. En `referral-partners/service.ts` solo se cambio el mensaje del origen "de socio"; el copy de "partner" no dice "referido" y queda.

## Segmento `referidos_pendientes`

`referidosPendientesConditions(ctx)`: `FRESHNESS AND (EXISTS vinculo referrals pending heredado OR EXISTS invitations active, converted_at IS NULL, access_expires_on >= CURDATE(), invited_user_id = users.id, tenant_id = ctx.tenantId)`. Excluye convertidas, anuladas, con ventana vencida y las de otro gimnasio. Docblock explica el porque (D-26b).

## Allowlist de copy

El chequeo canonico de "referid" sobre los archivos del plan deja 2 lineas, ambas identificadores/comentarios internos legitimos:

- `src/modules/campaigns/audience-service.ts:85` — continuacion de un comentario de bloque (`freemiumElegiblesConditions/referidosPendientesConditions y viaja ANDed con`), no empieza con `*`.
- `src/modules/campaigns/audience-service.ts:206` — `function referidosPendientesConditions(ctx: TenantContext): SQL[] {` — nombre de funcion interno ligado al segmento `referidos_pendientes` (clave persistida en campanas).

Fuera de los archivos del plan (strings no visibles al usuario, no tocados): `db/tenant-tables.ts:352,354` (descripciones tecnicas de tablas), `notifications/service.ts:257` (clave de categoria `referidos`), `destinations.ts` claves `referidos` y ruta `/mis-referidos`.

## Tests

- `campaigns-audience.test.ts` 34 (7 nuevos: invitacion activa sin fila en referrals, convertida, anulada, ventana vencida, frescura D-10, pending heredado conviviendo, invitacion de otro gimnasio), `activation-notification.test.ts` 3 (afirma el body exacto nuevo), `admin-assign-referrer.test.ts` 17 (400/409/404 afirman "invitador" y ausencia de "referid"): 3 archivos verdes en una corrida (~275 s). `aura-annotation.test.ts` 2 verdes en corrida aparte (afirma la descripcion nueva).
- Mutation testing: reemplazar por `1 = 1` las condiciones de tenant, status, converted_at y access_expires_on de la subquery -> fallan exactamente los 4 casos correspondientes (convertida, anulada, vencida, otro gimnasio). Restaurado.
- Gates: `tsc --noEmit` 0, `lint:tenant` 0 (DISCREPANCIAS 0), `typecheck:tests` sin errores nuevos (un cast en aura-annotation se paso por `unknown` para no sumar a la deuda previa de ese archivo).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical] `invitation-link.ts` (fuera de `files_modified`)**
- **Found during:** inventario de copy
- **Issue:** el `bodyOverride` real de la notificacion al invitador vive ahi (movido por 194-14) y seguia en "descuento activo", distinto del seed rebrandeado por 0261.
- **Fix:** mismo texto que el seed. Test de activation-notification afirma el texto exacto.
- **Commit:** `87674983d`

**2. [Test extra] `aura-annotation.test.ts`** y asserts de copy en admin-assign-referrer: no estaban en `<verify>` pero sin ellos el cambio de copy no tenia cobertura.

## Lecciones

- El copy "referido" de la API ya estaba casi todo en un solo servicio (`referrals/service.ts`); el resto eran 4 strings sueltos. Para el barrido: `grep -nE "[Rr]eferid"` sin comentarios da el inventario completo en un comando.
- `typecheck:tests` compara contra una linea base por archivo ("5 -> 6"): un `as Array<...>` de `db.execute` suma a la deuda aunque el patron ya exista, usar `as unknown as`.
- `fixtureCtx(app, tenantId)` + `createInvitationRow` sirven para sembrar invitaciones desde tests ajenos a `test/invitations` (reuso, no duplicar).

## Self-Check: PASSED

- Commit `87674983d` en el log, worktree limpio, 194-21-SUMMARY.md y este SUMMARY presentes.
