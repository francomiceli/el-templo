---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 01
subsystem: auth
tags: [hmac, magic-link, jwt-secret, campaigns, vitest]

# Dependency graph
requires:
  - phase: 119-freemium-trial-campaign
    provides: "token-service.ts (HMAC de tracking base) y campaign-token.test.ts baseline"
provides:
  - "signCampaignToken/validateCampaignToken/validateMagicLinkToken con purpose + doble expiración (exp 30d tracking, loginExp 7d login)"
  - "Base de fase 180 confirmada como el tren v6.0 en staging (8d0feea7), NO origin/master"
  - "Worktree et-180 con .env local copiado (gitignored) para correr tests contra eltemplo_test"
affects: [180-02, 180-03, 180-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Token HMAC con purpose opcional: tracking (compat byte-a-byte) vs login (payload aditivo con loginExp)"
    - "validateMagicLinkToken reusa validateCampaignToken (DRY) y agrega el chequeo de purpose+loginExp por encima, fail closed"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/campaigns/token-service.ts
    - el-templo-api/test/campaign-token.test.ts
    - el-templo-api/.env.example

key-decisions:
  - "purpose==='login' agrega loginExp (7d, D-02) al payload; purpose omitido/'tracking' no agrega campos (compat con tokens ya emitidos en prod)"
  - "validateCampaignToken NO cambia de semántica (sigue validando solo firma+exp) pero ahora surface purpose/loginExp cuando están presentes, para que validateMagicLinkToken los reuse sin re-parsear"
  - "Base real de la fase 180 NO es origin/master sino el tren v6.0 en staging (commit 8d0feea7) — aprobado por Franco en el checkpoint del Task 1 (resuelto por el orquestador antes de este SUMMARY)"
  - "Siguiente número de migración libre: 0210 (más alta en la base es 0209). Colisión conocida: la fase 179 (sin pushear) también reclama 0210 — se renumerará la que llegue segunda al integrar"

patterns-established:
  - "Doble expiración en un mismo HMAC (exp amplio para tracking + loginExp acotado para autorización) sin tabla nueva ni segundo secreto"

requirements-completed: [ML-01, GOV-01]

# Metrics
duration: ~25min
completed: 2026-08-23
---

# Fase 180 Plan 01: Doble expiración y purpose en el token HMAC de campañas Summary

**El HMAC de tracking de campañas (fase 119) ahora soporta un `purpose:'login'` con `loginExp` propio (7 días, D-02) sobre el mismo `exp` de tracking (30 días), habilitando el futuro canje del magic link sin tabla nueva ni segundo secreto.**

## Performance

- **Duration:** ~25 min (Tasks 2 y 3; el Task 1 —checkpoint humano de base + worktree— fue resuelto por el orquestador antes de este agente)
- **Completed:** 2026-08-23T23:36:07Z
- **Tasks:** 2 (Task 2 y Task 3 de este plan; Task 1 ya resuelto)
- **Files modified:** 3

## Accomplishments

- `CAMPAIGN_LOGIN_TTL_SECONDS` (7d, D-02) agregado junto a `CAMPAIGN_TOKEN_TTL_SECONDS` (30d, sin cambios).
- `validateMagicLinkToken` nuevo: único punto del módulo que puede autorizar el canje del magic link (T-180-01); fail closed ante cualquier ausencia de `purpose`/`loginExp`, nunca lanza.
- `validateCampaignToken` mantiene su semántica exacta (firma + `exp`) — el tracking de 30 días sigue funcionando igual para tokens de ambos propósitos.
- Docblock de cabecera revisado: D-21 (fase 119, "el token NUNCA autoriza") queda matizado por D-01 (fase 180): tracking nunca autoriza, login autoriza SOLO hasta `loginExp`.
- 7 tests nuevos cubriendo los 5 comportamientos del plan (login recién firmado, día 8 con `loginExp` vencido, token de tracking sin `purpose`, firma alterada, `purpose:'login'` sin `loginExp` manipulado a mano) más 2 tests de forma (loginExp ~7d, malformed inputs).
- `PUBLIC_API_BASE_URL` documentado en `.env.example` (deuda pre-existente de la fase 119, saldada per regla de CLAUDE.md).

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 2: Doble expiración y propósito en el token HMAC de campañas** - `1b93523a` (feat)
2. **Task 3: Tests del token de doble propósito + deuda de `.env.example`** - `2a52ebec` (test)

**Plan metadata:** pendiente — este SUMMARY se escribe en el checkout principal y NO se commitea (lo commitea el orquestador junto con STATE.md/ROADMAP.md).

## Files Created/Modified

- `el-templo-api/src/modules/campaigns/token-service.ts` - `CAMPAIGN_LOGIN_TTL_SECONDS`, `CampaignTokenPurpose`, `purpose`/`loginExp` opcionales en payload+input, `validateMagicLinkToken`, docblocks revisados (D-01/D-21)
- `el-templo-api/test/campaign-token.test.ts` - `describe("magic link (D-01/D-02)")` con 7 tests nuevos (baseline 6 → 13 tests)
- `el-templo-api/.env.example` - `PUBLIC_API_BASE_URL` documentado

## Decisions Made

- **Compat byte-a-byte para tracking:** `signCampaignToken` solo agrega `purpose`/`loginExp` al payload firmado cuando `purpose === 'login'` explícitamente. Los tokens de tracking (sin `purpose`, el caso por defecto y el único usado hoy en prod por `/track/open`, `/track/click`, `/unsubscribe`) quedan byte-a-byte idénticos a los emitidos pre-fase-180 — ningún token de tracking ya enviado deja de validar.
- **`validateCampaignToken` surface `purpose`/`loginExp` condicionalmente:** solo cuando están presentes en el payload parseado, para que `validateMagicLinkToken` los reutilice sin reparsear (DRY) y sin romper el test existente que exige exactamente 4 keys (`campaignId`, `exp`, `sendId`, `userId`) en un token de tracking puro.
- **`.env` local copiado al worktree (gitignored, no commiteado):** necesario para correr `vitest` contra `eltemplo_test` real (regla de CLAUDE.md — tests corren contra MySQL real, no mocks). Se copió desde `/home/franco/projects/el-templo/el-templo-api/.env` (mismas credenciales de dev local que ya usa el checkout principal).

## Deviations from Plan

**1. [Setup, no-Rule — infraestructura del worktree] `pnpm install --frozen-lockfile` en `el-templo-api` del worktree**

- **Found during:** antes del Task 2, al intentar correr `tsc --noEmit`
- **Issue:** el worktree `et-180` fue creado limpio por el Task 1 (checkpoint humano) sin `node_modules`; `tsc`/`vitest` no existían
- **Fix:** `pnpm install --frozen-lockfile` dentro de `el-templo-api/` — reproduce exactamente el lockfile existente, no agrega ni actualiza ningún paquete (verificado: `pnpm-lock.yaml` no cambió, `git status` no lo reporta)
- **Files modified:** ninguno trackeado (node_modules está gitignored)
- **Verificación:** `tsc --noEmit` exit 0; no aparece en `git diff --name-only`

**2. [Setup, no-Rule] `.env` local copiado al worktree para correr tests**

- **Found during:** Task 3, al correr `vitest` — el `setup-global.ts` intenta conectar a MySQL con `root`/sin password si no hay `.env`
- **Issue:** el worktree no traía `.env` (gitignored, nunca viaja con `git worktree add`)
- **Fix:** copiado desde el checkout principal (`el-templo-api/.env`, mismas credenciales dev locales)
- **Files modified:** `el-templo-api/.env` en el worktree (no trackeado, no commiteado)

---

**Total deviations:** 2, ambas de infraestructura de ejecución (no tocan código de producto), sin impacto en el alcance del plan.

## Issues Encountered

None — ambos tasks se ejecutaron según lo especificado en el plan, sin necesidad de deviation rules 1-4 sobre el código de producto.

## Contexto de base (heredado del Task 1, resuelto por el orquestador)

- **Worktree de la fase:** `/home/franco/projects/et-180`, rama `feat/180-campanas-etapa-2`.
- **DESVIACIÓN APROBADA POR FRANCO:** la base NO es `origin/master` — es el tren v6.0 en staging, commit `8d0feea7` (`merge: fase 177 (paquete de clases) de master al tren v6.0`). Contiene master actual + tenancy v6.0 + fase 176 (módulos) + fase 177 (reconciliada). Verificado: `listEligible(ctx: TenantContext, country?)` presente en la base.
- **Número de migración más alto en la base:** `0209`. **Siguiente libre: `0210`** — lo consume el plan 180-03.
- **⚠️ Colisión conocida:** la fase 179 (sin pushear todavía) también reclama `0210`. Se renumerará la que llegue segunda al momento de integrar — no bloquea la ejecución de esta fase, solo hay que resolverlo antes del merge final.

## User Setup Required

None - no requiere configuración de servicios externos. Esta fase no instaló ningún paquete nuevo (`pnpm-lock.yaml` sin cambios) y no rotó `JWT_SECRET` (Pitfall 7 del research, respetado).

## Next Phase Readiness

- `validateMagicLinkToken` y `CAMPAIGN_LOGIN_TTL_SECONDS` están listos para que el plan 180-02 implemente `POST /api/campaigns/exchange` (ML-01) sobre esta base.
- El worktree `et-180` tiene `node_modules` instalado y `.env` local (gitignored) — los siguientes planes de la fase pueden correr `tsc`/`vitest` directamente sin repetir este setup.
- Sin bloqueos. La colisión de migración 0210 con la fase 179 queda anotada para cuando corresponda integrar (no afecta el trabajo local de la 180).

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/campaigns/token-service.ts (worktree et-180)
- FOUND: el-templo-api/test/campaign-token.test.ts (worktree et-180)
- FOUND: el-templo-api/.env.example (worktree et-180)
- FOUND: commit 1b93523a (feat, Task 2)
- FOUND: commit 2a52ebec (test, Task 3)
- FOUND: este SUMMARY.md en el checkout principal
