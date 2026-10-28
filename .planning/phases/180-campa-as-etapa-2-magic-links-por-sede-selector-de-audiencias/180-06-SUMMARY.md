---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 06
subsystem: campaigns
tags: [magic-link, jwt, refresh-token, campaigns, tenancy, vitest]
status: completed

# Dependency graph
requires:
  - phase: 180-01
    provides: "validateMagicLinkToken (purpose:'login' + loginExp 7d) sobre el HMAC de tracking existente"
  - phase: 180-04
    provides: "campaigns.segment + CAMPAIGN_SEGMENTS/CampaignSegment (campaigns/types.ts)"
provides:
  - "segment-destinations.ts: MAGIC_LINK_DESTINATIONS + destinationForSegment + deepLinkForSegment (D-13), fuente unica de destino por segmento"
  - "magic-link-service.ts: MagicLinkService.exchange(token) — canje token->sesion completa por el camino canonico del login"
  - "POST /api/campaigns/exchange — endpoint publico de canje, 401 generico uniforme, Referrer-Policy: no-referrer"
  - "Los 3 gates de tenancy actualizados con la ruta nueva (manifest + iso-01 baseline 371 + iso-03 aislamiento)"
affects: [180-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Import ciclico deliberado entre service.ts y segment-destinations.ts (TRIAL_DEEP_LINK_BASE exportado desde service.ts, deepLinkForSegment importado hacia service.ts): seguro porque ambos usos son perezosos (dentro de function bodies, nunca en top-level de modulo) — verificado en runtime corriendo campaigns-tracking.test.ts"
    - "Exencion tenant-safe DUPLICADA (TS + embebida en SQL) para el lookup pre-scope de campaign_sends, mismo idioma que tracking-service.ts#getSendEmail — pero en magic-link-service.ts el token SI autoriza (D-01 revisa D-21 solo para purpose:'login')"
    - 'MagicLinkService recibe jwt: FastifyInstance["jwt"] + accessTokenExpiresIn: string por constructor (en vez de un objeto fastify completo) para mantener el patron `constructor(db, log, ...deps)` de CLAUDE.md testeable sin mockear todo fastify'

key-files:
  created:
    - el-templo-api/src/modules/campaigns/segment-destinations.ts
    - el-templo-api/src/modules/campaigns/magic-link-service.ts
    - el-templo-api/test/campaigns-magic-link.test.ts
  modified:
    - el-templo-api/src/modules/campaigns/service.ts
    - el-templo-api/src/modules/campaigns/routes.ts
    - el-templo-api/src/modules/campaigns/schemas.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-campaigns.test.ts

key-decisions:
  - "TRIAL_DEEP_LINK_BASE se exporta desde service.ts (unica declaracion) e importa en segment-destinations.ts, en vez de duplicar el literal https://app.eltemplo.org/r/trial — satisface el acceptance criteria de Task 1 (0 hosts literales nuevos en el archivo de destinos) a costa de un import ciclico entre los dos modulos, verificado seguro (ver tech-stack.patterns)"
  - "trialDeepLink (service.ts) ahora delega en deepLinkForSegment('freemium_elegibles', token) — mismo host/path observable, unico cambio es que el deep link del click-tracking de la campana freemium ahora agrega &d=reservas-prueba al final; solo test existente que mira esa URL usa startsWith, no rompe nada"
  - "referidos_pendientes -> reservas-prueba (destinationForSegment): D-13 no menciona este quinto segmento; se documenta como decision de planificacion en el docblock de segment-destinations.ts, no como Rule 4 (no es un cambio arquitectural, es llenar un hueco explicito del spec)"
  - "MagicLinkService.exchange() devuelve SIEMPRE null para cualquier fallo (T-180-25 anti-enumeracion) — el caller (routes.ts) traduce a un unico 401 con el mismo mensaje generico, nunca distingue token de tracking / vencido / firma alterada / sendId inexistente / userId no coincide / usuario borrado / staff deshabilitado"
  - "POST /exchange es POST y no GET a proposito (T-180-24): documentado en un comentario extenso en routes.ts — los escaneres de correo (Defender/Safe Links, Proofpoint) y el prefetch disparan GET/HEAD sobre todos los links de un email antes de que el humano llegue a clickear"
  - "El caso de aislamiento de iso-03-campaigns.test.ts no depende de una colision literal de userId entre tenants (los ids son un unico autoincrement global) — prueba en cambio que el canje de un token del gimnasio 2 devuelve el email/branchId DEL PROPIO gimnasio 2, nunca los de El Templo, que es la propiedad que el tenantWhere real protege"

requirements-completed: [ML-01, ML-04, AUD-03]

# Metrics
duration: ~2h10min
completed: 2026-08-23
---

# Fase 180 Plan 06: `POST /api/campaigns/exchange` — canje de magic-link por sesión Summary

**El endpoint público que convierte un click en el email en una sesión logueada real (access 30m + refresh 30d) por el mismo camino que el login canónico, con el destino post-canje derivado del segmento persistido de la campaña (D-13) y los 3 gates de tenancy verdes con la ruta nueva adentro.**

## Performance

- **Duration:** ~2h10min (3 tasks, incluyendo exploración de contexto extensa: login canónico, refresh-token-service, tenant-manifest, fixtures de ISO-03)
- **Completed:** 2026-08-23
- **Tasks:** 3/3 ejecutados
- **Files modified:** 9 (3 nuevos, 6 modificados)

## Accomplishments

- `segment-destinations.ts`: mapa cerrado `destinationForSegment` exhaustivo sobre los 5 segmentos de D-12 (freemium_elegibles/bajas/prueba_no_convertida/alerta_ausente → D-13; referidos_pendientes → decisión de planificación) + `deepLinkForSegment` compuesto sobre `TRIAL_DEEP_LINK_BASE` (mismo host `app.eltemplo.org`, mismo path `/r/trial`, sin relajar la allowlist de `/track/click`).
- `magic-link-service.ts` (`MagicLinkService.exchange`): valida el token, resuelve el tenant PRE-SCOPE desde `campaign_sends` (exención tenant-safe duplicada), cruza `userId` contra el dueño real del send, replica los gates del login (`deletedAt`, `staffDisabled`), arma el mismo shape de `user` que `POST /auth/login`, y emite la sesión con `RefreshTokenService.issue` (nunca reinventa el refresh a mano).
- `POST /api/campaigns/exchange`: ruta pública sin `preHandler`, POST-only (anti-escáner, T-180-24), 401 genérico uniforme para todo fallo (T-180-25), `Referrer-Policy: no-referrer`.
- Los 3 gates de tenancy: `TENANT_MANIFEST` clasifica la ruta `tenant-scoped` (mismo precedente que las 3 rutas públicas de tracking); `ENTRADAS_BASELINE` 370→371 en `iso-01-manifiesto.test.ts`; `iso-03-campaigns.test.ts` suma el caso de aislamiento del canje (11 rutas cubiertas).
- `test/campaigns-magic-link.test.ts`: 14 tests cubriendo los 7+ comportamientos del canje (login válido + refresh funcional, multi-uso D-02, tracking-only, `loginExp` vencido, firma alterada, `sendId` inexistente, `userId` no coincide, `deletedAt`, `staffDisabled`, destino por segmento D-13, validación de schema, sin filas huérfanas de `refresh_tokens` en un 401).

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: Mapa cerrado de destinos por segmento (D-13)** - `fcdf1ca6` (feat)
2. **Task 2: `magic-link-service.ts` — canje token→sesión** - `1e71b3a3` (feat)
3. **Task 3: `POST /api/campaigns/exchange` + los 3 gates de tenancy + tests de integración** - `71f090e3` (feat)

**Plan metadata:** pendiente — este SUMMARY se escribe en el checkout principal y NO se commitea (lo commitea el orquestador junto con STATE.md/ROADMAP.md).

## Files Created/Modified

- `el-templo-api/src/modules/campaigns/segment-destinations.ts` (nuevo) - `MAGIC_LINK_DESTINATIONS`, `destinationForSegment`, `deepLinkForSegment`, `trialDeepLink` (compat)
- `el-templo-api/src/modules/campaigns/magic-link-service.ts` (nuevo) - `MagicLinkService.exchange(token)` completo
- `el-templo-api/src/modules/campaigns/service.ts` - `TRIAL_DEEP_LINK_BASE` exportado; `trialDeepLink` delegado en `deepLinkForSegment` (**fuera del `files_modified` declarado en el frontmatter del plan** — ver Deviations)
- `el-templo-api/src/modules/campaigns/routes.ts` - `POST /exchange`, docblock de cabecera revisado (D-01 revisa D-21 solo para `purpose:'login'`), import de `MagicLinkService`
- `el-templo-api/src/modules/campaigns/schemas.ts` - `exchangeSchema` (token 1..2048 chars, `additionalProperties: false`)
- `el-templo-api/test/campaigns-magic-link.test.ts` (nuevo) - 14 tests
- `el-templo-api/test/tenant-manifest.ts` - `"POST /api/campaigns/exchange": { categoria: "tenant-scoped" }`
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` - `ENTRADAS_BASELINE` 370→371 + entrada narrativa dateada + título del `it`
- `el-templo-api/test/tenancy/iso-03-campaigns.test.ts` - docblock revisado (11 rutas), `RUTAS_MANIFIESTO` +1, describe `"canje de magic-link — POST /api/campaigns/exchange"` con 3 tests (aislamiento + control + tracking-token-no-autoriza)

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para quien retome: el import cíclico entre `service.ts` y `segment-destinations.ts` (`TRIAL_DEEP_LINK_BASE` va de service→destinations, `deepLinkForSegment` va de destinations→service) es intencional y se verificó seguro corriendo `campaigns-tracking.test.ts` completo (que ejercita `trialDeepLink` en runtime vía `GET /track/click`) — ambos usos son perezosos (dentro de cuerpos de función, nunca evaluados en el top-level del módulo), así que no hay problema de inicialización parcial ni en ESM ni en la transpilación CJS de ts-node/vitest.

## Deviations from Plan

**1. [Fuera de Rule — completar la acción explícita del plan] `service.ts` modificado, aunque no está en `files_modified` del frontmatter**

- **Found during:** Task 1
- **Issue:** el acceptance criteria de Task 1 exige `grep -cE "https?://" segment-destinations.ts == 0` (ningún host literal nuevo) Y `grep -c "TRIAL_DEEP_LINK_BASE" ... >= 1`. Cumplir ambos a la vez solo es posible IMPORTANDO la constante desde `service.ts` (que ya la declara), no redeclarándola. El propio Task 1 además pide explícitamente "`trialDeepLink(token)` se conserva delegando en `deepLinkForSegment('freemium_elegibles', token)`" — eso exige tocar `service.ts`.
- **Fix:** se exportó `TRIAL_DEEP_LINK_BASE` desde `service.ts` (única declaración) y se cambió el método estático `trialDeepLink` para delegar en `deepLinkForSegment`. Verificado que el único test existente que mira esa URL (`campaigns-tracking.test.ts`) usa `startsWith`, no comparación exacta — no se rompió nada.
- **Files modified:** `el-templo-api/src/modules/campaigns/service.ts`
- **Verificación:** `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `campaigns-tracking.test.ts` 6/6 verde (corrido en foreground tras el cambio, antes de commitear Task 1)
- **Commit:** incluido en `fcdf1ca6` (Task 1)

**2. [Rule 1 - Bug bloqueante, descubierto en verificación] Escrituras directas del test file sobre tablas tenant-strict sin `tenantWhere`**

- **Found during:** Task 3, primera corrida de `test/campaigns-magic-link.test.ts`
- **Issue:** 4 `UPDATE`/`DELETE` directos del test (marcar `deletedAt`, `staffDisabled`, `campaigns.segment`, borrar un `campaign_sends`) usaban `eq(tabla.id, ...)` sin `tenantWhere(tabla, ctx)` — el sentinel de runtime (`TenantSentinelError`) los rechazó porque `users`/`campaigns`/`campaign_sends` ya son tablas STRICT (v6.0)
- **Fix:** se agregó `and(tenantWhere(tabla, CTX), eq(tabla.id, ...))` a los 4 sitios, mismo criterio que el resto de la batería de tenancy
- **Files modified:** `el-templo-api/test/campaigns-magic-link.test.ts`
- **Verificación:** `pnpm exec vitest run --no-file-parallelism test/campaigns-magic-link.test.ts` pasó de 5 fallos a 14/14 verde

**3. [Rule 1 - Bug de expectativa, descubierto en verificación] `additionalProperties:false` no devuelve 400 — Fastify corre con `removeAdditional: true`**

- **Found during:** Task 3, mismo test run
- **Issue:** el test original esperaba 400 al mandar un campo extra en el body; Fastify/AJV por default PODA (`removeAdditional`) el campo desconocido en vez de rechazar la request — mismo comportamiento ya documentado en `scheduling-reserve-trial.test.ts` y `exercise-adjustments.test.ts` (precedente existente en el repo, no un bug nuevo de esta ruta)
- **Fix:** se reescribió el test para afirmar el comportamiento REAL (el campo se descarta, el request sigue evaluando solo `token`) en vez de un 400 que nunca iba a ocurrir
- **Files modified:** `el-templo-api/test/campaigns-magic-link.test.ts`
- **Commit:** ambos fixes (2 y 3) incluidos en `71f090e3` (Task 3), corregidos antes de commitear — no generaron un commit separado

**4. [Fuera de Rule — deuda TDD del propio plan] Task 2 (`tdd="true"`) no siguió el ciclo RED→GREEN clásico**

- **Found during:** Task 2
- **Issue:** el Task 2 del plan lleva `tdd="true"` y un bloque `<behavior>` con 7 comportamientos, pero su `<action>` solo crea `magic-link-service.ts` — el archivo de test real (`campaigns-magic-link.test.ts`) es una entrega explícita del Task 3, que ADEMÁS crea la ruta HTTP (`POST /exchange`) necesaria para probar el servicio vía `app.inject()`. No hay forma de escribir un RED significativo en el Task 2 sin la ruta del Task 3.
- **Resolución:** se siguió la instrucción literal del plan (implementación en Task 2, test en Task 3) en vez de forzar un test unitario intermedio fuera de scope. El Task 2 se verificó con su propio `<verify>` (`tsc` + `lint:tenant`); la cobertura de comportamiento llegó íntegra con los 14 tests del Task 3.
- **Impacto:** ninguno en el resultado final — los 7 comportamientos del `<behavior>` de Task 2 están cubiertos 1:1 por tests del Task 3 (ver lista en Accomplishments). Documentado para que el TDD Gate Compliance de abajo no se lea como un olvido.

---

**Total deviations:** 4. Dos de infraestructura de verificación (test file, sin tocar producto), una de alcance de archivo (necesaria para cumplir el propio acceptance criteria del plan) y una de proceso TDD (deuda del propio plan, sin impacto en cobertura final). Ninguna requirió una decisión arquitectural (Rule 4).

## TDD Gate Compliance

Task 2 está marcado `tdd="true"` pero no generó una secuencia `test(...)` → `feat(...)` propia — ver Deviation 4. Los comportamientos que su `<behavior>` describe SÍ están probados, pero por los 14 tests commiteados junto con la ruta en el Task 3 (`71f090e3`, tipo `feat`), no por un commit `test(...)` previo dedicado a `magic-link-service.ts` en aislamiento.

## Issues Encountered

Ninguno bloqueante fuera de lo documentado en Deviations. La exploración de contexto (login canónico, `refresh-token-service.ts`, fixtures de `campaigns-gimnasio-dos.ts`, docblocks de `iso-01`/`iso-03`) fue el grueso del tiempo — el código en sí siguió el spec del plan sin sorpresas de diseño.

## Verification

- `pnpm exec tsc --noEmit` → exit 0 (corrido después de cada task y al cierre del plan).
- `pnpm lint:tenant` → **DISCREPANCIAS: 0** en las 3 corridas (Task 1, Task 2, Task 3); `test/tenant-lint-allowlist.json` nunca se tocó.
- `pnpm exec vitest run --no-file-parallelism test/campaigns-magic-link.test.ts test/campaigns-tracking.test.ts test/tenancy/iso-01-manifiesto.test.ts test/tenancy/iso-03-campaigns.test.ts` → **59/59 tests verdes** (167s), corrida completa del `<verification>` del plan.
- Acceptance criteria de los 3 tasks verificados con los greps/comandos exactos que pide el plan (citados en la ejecución de este agente): `TRIAL_DEEP_LINK_BASE` count, cero hosts literales nuevos, cobertura de los 5 segmentos, exenciones `tenant-safe` duplicadas idénticas, `RefreshTokenService` presente / `randomBytes` ausente, `payload.tenantId` ausente, `log.error` ausente en caminos de fallo, token nunca logueado, entrada del manifiesto, diff del baseline de `iso-01`, `Referrer-Policy` presente, `additionalProperties:false` +1 real (7, tras reescribir el docblock para que no se auto-matchee), test con "multi-uso"/"D-02" en el nombre.
- Worktree limpio tras cada commit (`git status --short` vacío).

## User Setup Required

None — no se instaló ningún paquete nuevo, no hay variables de entorno nuevas, no hay migración (la columna `campaigns.segment` ya existe desde el plan 180-04).

## Next Phase Readiness

- `POST /api/campaigns/exchange` está listo para que el plan 180-11 (cliente: `logout()` antes de `setTokens`, D-04) lo consuma desde la app.
- `destinationForSegment`/`deepLinkForSegment` (`segment-destinations.ts`) son el contrato que cualquier plan futuro de emisión de emails debe usar para el `?d=` del deep link — nunca construir una URL a mano.
- `MagicLinkService` queda disponible para que un futuro plan de "reenvío de magic link" o similar lo reuse sin duplicar la lógica de resolución de tenant/gates.
- Sin bloqueos. El worktree `et-180` sigue con `node_modules`/`.env` local operativos.

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/campaigns/segment-destinations.ts (worktree et-180)
- FOUND: el-templo-api/src/modules/campaigns/magic-link-service.ts (worktree et-180)
- FOUND: el-templo-api/src/modules/campaigns/service.ts modificado (worktree et-180)
- FOUND: el-templo-api/src/modules/campaigns/routes.ts modificado (worktree et-180)
- FOUND: el-templo-api/src/modules/campaigns/schemas.ts modificado (worktree et-180)
- FOUND: el-templo-api/test/campaigns-magic-link.test.ts (worktree et-180)
- FOUND: el-templo-api/test/tenant-manifest.ts modificado (worktree et-180)
- FOUND: el-templo-api/test/tenancy/iso-01-manifiesto.test.ts modificado (worktree et-180)
- FOUND: el-templo-api/test/tenancy/iso-03-campaigns.test.ts modificado (worktree et-180)
- FOUND: commit fcdf1ca6 (feat, Task 1)
- FOUND: commit 1e71b3a3 (feat, Task 2)
- FOUND: commit 71f090e3 (feat, Task 3)
- FOUND: este SUMMARY.md en el checkout principal
