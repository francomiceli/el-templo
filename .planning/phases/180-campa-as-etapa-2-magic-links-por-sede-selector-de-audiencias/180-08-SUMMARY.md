---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 08
subsystem: campaigns
tags: [campaigns, audience, magic-link, tenancy, vitest]
status: completed

# Dependency graph
requires:
  - phase: 180-04
    provides: "campaigns.segment (mig 0210) + AudienceService.resolveAudience/countAudience con los 5 segmentos de D-12"
  - phase: 180-06
    provides: "segment-destinations.ts (deepLinkForSegment/destinationForSegment, D-13) + magic-link-service.ts + POST /api/campaigns/exchange + tokens purpose:'login'"
provides:
  - "CreateCampaignInput.segment / CampaignRecord.segment — el segmento viaja del admin a la base y vuelve en el listado"
  - "CampaignService.send() resuelve la audiencia del segmento PERSISTIDO vía AudienceService.resolveAudience, firma tokens purpose:'login'"
  - "CampaignService.deepLinkForToken() — el destino del click de /track/click se deriva del segmento real de la campaña, no hardcodeado a freemium_elegibles"
  - "GET /admin/eligible-count?segment=<seg> — COUNT(*) por segmento, nunca trae la audiencia completa"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exención tenant-safe DUPLICADA (comentario TS + embebida en el SQL) para todo lookup pre-scope nuevo en rutas públicas — mismo idioma que magic-link-service.ts#exchange/tracking-service.ts#getSendEmail; el lint (isCompliantText) NO reconoce el comentario embebido dentro de un template `sql` como exención por sí solo, necesita el comentario TS real (MultiLineCommentTrivia) inmediatamente antes del statement"
    - "CreateCampaignInput.segment opcional: cuando no viene, el INSERT omite la key por completo (spread condicional) para que el DEFAULT de la columna aplique — nunca escribir `segment: undefined` explícito"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/campaigns/types.ts
    - el-templo-api/src/modules/campaigns/service.ts
    - el-templo-api/src/modules/campaigns/routes.ts
    - el-templo-api/src/modules/campaigns/schemas.ts
    - el-templo-api/test/campaigns-send.test.ts

key-decisions:
  - "El fix de /track/click (CampaignService.deepLinkForToken) NO estaba en el files_modified per-task de Task 2's read_first, pero SÍ en el files_modified del frontmatter del plan (routes.ts) — sin él, el <behavior> central de Task 2 ('el destino derivado corresponde al segmento') quedaba falso: antes de este plan, /track/click SIEMPRE resolvía el destino de 'freemium_elegibles' (CampaignService.trialDeepLink hardcodeado), sin importar el segmento real de la campaña. Se resolvió con un lookup pre-scope por campaignId (mismo idioma T-175-02/T-180-23 que magic-link-service.ts#exchange), token inválido cae al fallback freemium anterior"
  - "CampaignRecord.segment tipado 'string' (soft-enum), misma convención que 'status' — no CampaignSegment, para no acoplar el tipo público a la lista cerrada interna"
  - "toRecord() usa row.segment ?? 'freemium_elegibles' como fallback defensivo — en la práctica todos los SELECT que alimentan toRecord() traen la columna completa (full-row select), el fallback solo cubre selects futuros más angostos"
  - "eligible-count instancia su PROPIO AudienceService en routes.ts (paralelo al que ya usa CampaignService internamente) en vez de exponer un getter — mismo patrón de instanciación independiente que tracking/service/magicLink en el mismo archivo"

requirements-completed: [AUD-02, AUD-03, ML-01]

# Metrics
duration: ~90min
completed: 2026-08-23
---

# Fase 180 Plan 08: Segmento persistido enganchado al pipeline de envío Summary

**El admin elige y persiste el segmento al crear una campaña; `send()` resuelve esa audiencia (no la default), firma tokens `purpose:'login'` canjeables 7 días, y tanto el destino del click como el conteo de audiencia (`COUNT(*)`) respetan el segmento real — incluyendo un fix real de un bug pre-existente donde `/track/click` siempre redirigía al destino freemium sin importar la campaña.**

## Performance

- **Duration:** ~90 min (3 tasks)
- **Completed:** 2026-08-23
- **Tasks:** 3/3 ejecutados
- **Files modified:** 5 (0 nuevos, 5 modificados)

## Accomplishments

- `CreateCampaignInput.segment?: CampaignSegment` + `CampaignRecord.segment: string` — `create()` solo escribe la columna cuando el admin eligió un segmento explícito (si no, el `DEFAULT 'freemium_elegibles'` de la mig 0210 aplica byte-por-byte igual que antes de este plan); `listCampaigns()` devuelve `segment` por campaña (Pitfall 8: el preview del admin lee el segmento PERSISTIDO, nunca el del form sin guardar).
- `createCampaignSchema`/`eligibleCountSchema` validan `segment` con un `enum` DERIVADO de `CAMPAIGN_SEGMENTS` (T-180-34) — nunca copiado a mano, así el schema y el dispatcher cerrado de `audience-service.ts` no pueden divergir.
- `send()` lee `campaigns.segment` de la campaña ya cargada y resuelve la audiencia con `AudienceService.resolveAudience(ctx, segment, country)` en vez de `listEligible` fijo a freemium — la audiencia se recalcula EN EL MOMENTO DEL ENVÍO (Pitfall 8: el preview es solo una estimación, `recipientCount` es la verdad).
- Cada token firmado en el loop de envío lleva `purpose: 'login'` — canjeable 7 días (`loginExp`) vía `POST /api/campaigns/exchange`, y sigue identificando el send para tracking 30 días (`exp`), sin cambiar el TTL de tracking.
- **Bug real encontrado y corregido** (no estaba en el plan explícitamente, pero era necesario para que el `<behavior>` de Task 2 fuera cierto): `/track/click` (routes.ts) resolvía el destino del redirect llamando SIEMPRE a `CampaignService.trialDeepLink(token)`, hardcodeado al segmento `freemium_elegibles` — una campaña `'bajas'` terminaba redirigiendo a `reservas-prueba` en vez de `volver`. Se agregó `CampaignService.deepLinkForToken(campaignId, token)`: lookup pre-scope (sin `ctx`, ruta pública) del `segment` de la campaña por `campaignId` (que sale del payload del token YA validado, nunca de query input crudo), compone con `deepLinkForSegment`. Un token inválido (`payload` null) sigue cayendo al fallback `trialDeepLink` de siempre. `TRIAL_DEEP_LINK_BASE`/`CLICK_REDIRECT_ALLOWLIST_HOST` intactos.
- `GET /admin/eligible-count` suma `segment` opcional (default `'freemium_elegibles'`) y pasa de `service.listEligible(...).length` (traía TODA la audiencia solo para contar) a `AudienceService.countAudience(ctx, segment, country)` — `COUNT(*)` real en SQL (T-180-17/Pitfall 8: "bajas" puede ser miles de filas).
- `campaigns-send.test.ts` extendido con un nuevo `describe` (4 tests): campaña `'bajas'` encola SOLO esos usuarios (no los freemium sembrados en el mismo test); campaña sin segmento explícito preserva el comportamiento heredado; el token firmado en un envío real es canjeable end-to-end en `POST /api/campaigns/exchange`; `eligible-count?segment=bajas` coincide exactamente con las filas `campaign_sends` que produce el envío real de ese segmento.

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 1: Segmento en creación, edición y listado de campañas** - `1cb64fe0` (feat)
2. **Task 2: `send()` usa el segmento persistido y firma tokens de login** - `69dc5a07` (feat)
3. **Task 3: `eligible-count` por segmento con COUNT(\*) + tests de envío** - `5236c9a0` (test)

**Plan metadata:** pendiente — este SUMMARY se escribe en el checkout principal y NO se commitea (lo commitea el orquestador junto con STATE.md/ROADMAP.md).

## Files Created/Modified

- `el-templo-api/src/modules/campaigns/types.ts` - `CreateCampaignInput.segment?`, `CampaignRecord.segment: string`
- `el-templo-api/src/modules/campaigns/service.ts` - `create()` escribe `segment` condicionalmente, `listCampaigns()`/`toRecord()` devuelven `segment`, `send()` resuelve audiencia por segmento persistido + tokens `purpose:'login'`, `deepLinkForToken()` nuevo (fix del click por segmento)
- `el-templo-api/src/modules/campaigns/routes.ts` - `/track/click` usa `deepLinkForToken` para un token válido; `GET /admin/eligible-count` acepta `segment` y usa `countAudience`
- `el-templo-api/src/modules/campaigns/schemas.ts` - `createCampaignSchema`/`eligibleCountSchema` suman `segment` con enum derivado de `CAMPAIGN_SEGMENTS`
- `el-templo-api/test/campaigns-send.test.ts` - helper local `createBajaUser`, `describe("campaign send by segment (Fase 180, D-11/D-12/D-14)")` con 4 tests nuevos (12 tests totales en el archivo, baseline 8)

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para quien retome: el fix de `/track/click` (`deepLinkForToken`) corrige un bug de comportamiento real que antes de este plan hacía que TODAS las campañas (sin importar su segmento) redirigieran al destino freemium — el `<behavior>` de Task 2 lo exigía explícitamente ("su destino derivado corresponde al segmento (`volver` para bajas...)") aunque el `<read_first>` de la task no listaba `routes.ts`. Se documenta acá con detalle porque es el cambio de mayor superficie del plan.

## Deviations from Plan

**1. [Rule 2 - funcionalidad crítica faltante] `/track/click` no resolvía el destino por segmento**

- **Found during:** Task 2, al releer el `<behavior>` completo tras implementar el resto de la task
- **Issue:** el plan pide explícitamente que "su destino derivado corresponde al segmento (`volver` para bajas, `reservas-prueba` para freemium, etc.)" pero el código de `routes.ts` anterior a este plan llamaba SIEMPRE a `CampaignService.trialDeepLink(token)` — un método estático hardcodeado a `'freemium_elegibles'`, sin ninguna forma de conocer el segmento real de la campaña del token. Sin tocar esto, el comportamiento central que Task 2 promete quedaba falso para cualquier campaña no-freemium.
- **Fix:** se agregó `CampaignService.deepLinkForToken(campaignId, token)` — lookup pre-scope (mismo idioma T-175-02/T-180-23 que `magic-link-service.ts#exchange`) del `segment` de la campaña por `campaignId` (que sale del payload YA VALIDADO del token, nunca de query input crudo), compuesto con `deepLinkForSegment`. `routes.ts` lo usa cuando `payload` es válido; un token inválido/garbage sigue cayendo al `trialDeepLink` de siempre (mismo comportamiento de degradación que antes).
- **Files modified:** `el-templo-api/src/modules/campaigns/service.ts`, `el-templo-api/src/modules/campaigns/routes.ts`
- **Verificación:** `test/campaigns-magic-link.test.ts` ("D-13: el destino devuelto se deriva del segmento persistido de la campaña") y `test/campaigns-tracking.test.ts` (6/6, comportamiento freemium por defecto intacto) corridos en foreground tras el cambio; `tsc --noEmit` 0; `lint:tenant` DISCREPANCIAS 0
- **Commit:** incluido en `69dc5a07` (Task 2)

**2. [Rule 3 - bloqueante de verificación] El primer borrador de `deepLinkForToken` rompía `pnpm lint:tenant` (2 discrepancias)**

- **Found during:** Task 2, primera corrida de `pnpm lint:tenant` tras escribir el método
- **Issue:** el primer borrador solo llevaba el comentario `/* tenant-safe: ... */` EMBEBIDO dentro del template `sql\`...\``(mismo texto que`tracking-service.ts#getSendEmail`) — pero el lint (`isCompliantText`) NO reconoce ese comentario embebido como exención por sí solo: la razón por la que `tracking-service.ts#getSendEmail`pasa el lint sin un comentario TS real es que su`SELECT`proyecta`tenantId: schema.campaignSends.tenantId`, y el texto literal `.tenantId`es uno de los`COMPLIANCE_MARKERS`que el lint reconoce por presencia de substring. Mi`SELECT`solo proyectaba`segment`, sin ningún marker de compliance — 2 accesos (`.from()`+ referencia en el`sql` template) quedaban sin exención.
- **Fix:** se agregó el comentario TS REAL `/* tenant-safe: ... */` (MultiLineCommentTrivia, no dentro de ningún string) inmediatamente antes del statement `const [row] = await this.db...`, exactamente el mismo idioma DUPLICADO (TS + embebido en SQL) que `magic-link-service.ts#exchange` documenta explícitamente para el mismo tipo de lookup pre-scope.
- **Files modified:** `el-templo-api/src/modules/campaigns/service.ts`
- **Verificación:** `pnpm lint:tenant` pasó de 2 discrepancias a 0 (exit 0); `tenant-lint-allowlist.json` nunca se tocó
- **Commit:** incluido en `69dc5a07` (Task 2, corregido antes de commitear)

**3. [Rule 1 - bug de fixture] `createBajaUser()` duplicaba el nombre de `subscription_plans` entre llamadas del mismo test**

- **Found during:** Task 3, primera corrida de `test/campaigns-send.test.ts` con el nuevo test de `eligible-count`
- **Issue:** el helper local `createBajaUser` usaba un nombre de plan fijo (`"Send Test Plan (bajas)"`), y el test de `eligible-count` llama al helper dos veces en el mismo `it()` — violó `uq_subscription_plans_tenant_name_country` (`ER_DUP_ENTRY`)
- **Fix:** el nombre del plan incorpora el mismo `uniqueSuffix` que ya se usa para el email del usuario
- **Files modified:** `el-templo-api/test/campaigns-send.test.ts`
- **Verificación:** `pnpm exec vitest run --no-file-parallelism test/campaigns-send.test.ts` pasó de 1 fallo (11/12) a 12/12 verde

---

**Total deviations:** 3. La primera (Rule 2) es la de mayor impacto de producto — un bug real de comportamiento que el propio `<behavior>` del plan exigía cerrar. Las otras dos son de infraestructura de verificación (lint de tenancy, fixture de test). Ninguna requirió una decisión arquitectural (Rule 4); ninguna tocó `tenant-manifest.ts` ni `iso-01-manifiesto.test.ts` (no se agregó ninguna ruta nueva, per el `<execution_context>` del plan).

## Issues Encountered

Ninguno bloqueante fuera de lo documentado en Deviations.

## Verification

- `pnpm exec tsc --noEmit` → exit 0 (corrido después de cada task y al cierre del plan).
- `pnpm lint:tenant` → **DISCREPANCIAS: 0** (corrido después de cada task; `tenant-lint-allowlist.json` nunca se tocó).
- `pnpm exec vitest run --no-file-parallelism test/campaigns-send.test.ts test/campaigns-audience.test.ts test/campaigns-magic-link.test.ts` → **53/53 tests verdes** (118.66s) — el `<verification>` completo del plan.
- `pnpm exec vitest run --no-file-parallelism test/campaigns-tracking.test.ts test/campaigns-send.test.ts test/campaigns-magic-link.test.ts` → **28/28 tests verdes** corrida adicional tras el Task 2, para confirmar que el fix de `/track/click` no rompió el comportamiento freemium por defecto.
- Acceptance criteria de las 3 tasks verificados con los greps/comandos exactos que pide el plan: `CAMPAIGN_SEGMENTS` en `schemas.ts` (4 apariciones), `segment` en `types.ts` (6), `resolveAudience`/`purpose`/`deepLinkForSegment` en `service.ts` (>=1 cada uno), `git diff` de `service.ts` sin tocar `TRIAL_DEEP_LINK_BASE`/`CLICK_REDIRECT_ALLOWLIST_HOST`, `countAudience` en `routes.ts` (1) y `eligible.length` (0), `git diff --name-only` sin `tenant-manifest.ts`/`iso-01-manifiesto.test.ts`, tests con "bajas" y "/exchange" en el nombre presentes.
- `git status --short` vacío tras cada commit; solo 3 commits creados, todos con `git add` por ruta explícita.

## User Setup Required

None — no se instaló ningún paquete nuevo, no hay variables de entorno nuevas, no hay migración nueva (la columna `campaigns.segment` ya existía desde el plan 180-04).

## Next Phase Readiness

- El pipeline de envío por segmento está completo: crear → persistir segmento → enviar → audiencia correcta → token de login → destino correcto por click → canje real → conteo eficiente. No queda ningún cabo suelto de los planes 180-04/180-06 sin conectar al flujo real.
- `CampaignService.deepLinkForToken` es ahora el único camino correcto para resolver el destino de un click con un token VALIDADO; `CampaignService.trialDeepLink` queda como fallback explícito para tokens inválidos — documentado en el docblock de ambos métodos para que un plan futuro no reintroduzca el hardcode a freemium.
- Sin bloqueos. El worktree `et-180` sigue con `node_modules`/`.env` local operativos.

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/campaigns/types.ts (worktree et-180)
- FOUND: el-templo-api/src/modules/campaigns/service.ts (worktree et-180)
- FOUND: el-templo-api/src/modules/campaigns/routes.ts (worktree et-180)
- FOUND: el-templo-api/src/modules/campaigns/schemas.ts (worktree et-180)
- FOUND: el-templo-api/test/campaigns-send.test.ts (worktree et-180)
- FOUND: commit 1cb64fe0 (feat, Task 1)
- FOUND: commit 69dc5a07 (feat, Task 2)
- FOUND: commit 5236c9a0 (test, Task 3)
- FOUND: este SUMMARY.md en el checkout principal
