---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 01
subsystem: database
tags: [drizzle, mysql, tenancy, migrations, partners, referrals]

# Dependency graph
requires: []
provides:
  - Tablas Drizzle `referral_partners`, `partner_referrals`, `partner_commissions` (tenancy-native desde el día uno, D-20)
  - Columnas espejo `subscriptions.partner_discount_percent` / `partner_discount_amount`
  - Migración hand-written `0209_referral_partners.sql` aplicada en MySQL local
  - Las 3 tablas nuevas incorporadas a los gates de tenancy (GYM_OWNED_TABLES, TENANT_UNIQUE_ALLOWLIST, conteos de test)
affects: [179-02, 179-03, 179-04, 179-05, 179-06, 179-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tabla gym-owned nacida tenancy-native desde el arranque (tenant_id NOT NULL DEFAULT 1 + FK a tenants), calcado del patrón de 0202_session_week_regime.sql"
    - "Unique compuesta tenant-primero para código vanity (uq_referral_partners_tenant_code), calcado de promo_plans"
    - "Snapshot de beneficio en partner_referrals (benefit_type/benefit_value) independiente del beneficio vigente en referral_partners"
    - "Idempotencia por cargo vía UNIQUE(subscription_id) en partner_commissions, calcado de referral_credits"

key-files:
  created:
    - el-templo-api/src/db/schema/referral-partners.ts
    - el-templo-api/src/db/schema/partner-referrals.ts
    - el-templo-api/src/db/schema/partner-commissions.ts
    - el-templo-api/src/db/migrations/0209_referral_partners.sql
  modified:
    - el-templo-api/src/db/schema/subscriptions.ts
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts

key-decisions:
  - "Migración numerada 0209: verificado que origin/master y origin/staging topean ambas en 0208_rename_branches_short_names.sql al 2026-08-23"
  - "referral_partners.code NO entra en TENANT_UNIQUE_ALLOWLIST (unique compuesta tenant_id+code, no deriva de FK scopeada); partner_referrals_referred_id_unique y unique_partner_commission_sub SÍ entran (derivadas de FK scopeada a users/subscriptions)"
  - "Tests de tenancy corridos con MAX_TEST_WORKERS=1 y --hookTimeout=400000 localmente: el hookTimeout de 120s configurado en vitest.config.ts no alcanza para provisionar desde cero una DB de test con las 209 migraciones acumuladas del repo bajo contención de 4 workers paralelos — no es un problema introducido por este plan, es deuda de infraestructura de test que crece con el repo"

requirements-completed: [D-09, D-11, D-12, D-13, D-14, D-16, D-20]

# Metrics
duration: 55min
completed: 2026-08-23
---

# Phase 179 Plan 01: Cimiento de datos de partners Summary

**3 tablas Drizzle tenancy-native (`referral_partners`, `partner_referrals`, `partner_commissions`) + 2 columnas espejo en `subscriptions`, migración 0209 hand-written aplicada en MySQL local, y gates de tenancy (COL-01/CON-01/CON-06) verdes en 91 tablas gym-owned.**

## Performance

- **Duration:** ~55 min (reanudación desde Task 1 ya commiteada)
- **Tasks:** 3/3 (Task 1 verificada como ya hecha, Task 2 y Task 3 ejecutadas en esta sesión)
- **Files modified:** 3 (Task 2: 1 archivo nuevo; Task 3: 2 archivos modificados)

## Accomplishments

- Migración `0209_referral_partners.sql` escrita a mano y aplicada limpio en MySQL local (`pnpm db:migrate` en 0, 5 statements aplicados)
- Las 3 tablas + 2 columnas verificadas byte-a-byte contra el schema Drizzle (constraints, uniques, enums)
- `GYM_OWNED_TABLES` y `TENANT_UNIQUE_ALLOWLIST` actualizados; conteos de `test/db/tenant-tables.test.ts` bumpeados 88→91 / 92→95
- `pnpm db:verify-uniques`, `pnpm lint:tenant`, `vitest run test/db test/tenancy` (9 archivos, 143 tests) todos en verde

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`):

1. **Task 1: Declarar tablas Drizzle + columnas espejo** - `5ccd93c6` (feat) — ya commiteado antes de esta sesión, verificado íntegro (3 schemas, 2 columnas, barrel export, `tsc --noEmit` limpio)
2. **Task 2: Escribir y aplicar la migración 0209** - `c3991f5f` (feat)
3. **Task 3: Actualizar los gates de tenancy** - `1c4c7669` (feat)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor._

## Files Created/Modified

- `el-templo-api/src/db/migrations/0209_referral_partners.sql` - DDL de las 3 tablas + 2 ALTER de subscriptions, hand-written, sin `;` en comentarios
- `el-templo-api/src/db/tenant-tables.ts` - `GYM_OWNED_TABLES` +3 (posición alfabética exacta) y `TENANT_UNIQUE_ALLOWLIST` +2 entradas
- `el-templo-api/test/db/tenant-tables.test.ts` - conteos 88→91 gym-owned, 92→95 tablas de schema, título del `it` actualizado

## Decisions Made

- **Numeración 0209 confirmada**: `git ls-tree --name-only origin/master|origin/staging el-templo-api/src/db/migrations/` topean ambas en `0208_rename_branches_short_names.sql` al 2026-08-23 → 0209 es el siguiente libre real en ambas ramas.
- **Colación real de `referral_partners.code`**: `utf8mb4_0900_ai_ci` (case-insensitive) — verificado con `SHOW FULL COLUMNS`. Es `_ci`, así que la normalización upper+trim del service layer (plan 179-02) es redundante pero segura, no hay riesgo de colisión case-sensitive sin normalizar.
- **Test infra**: la base de test local `eltemplo_test_*` estaba stale en `0191_tenant_anchors.sql` (de una corrida anterior de otro worktree/fase). El `globalSetup` del repo dropea y re-provisiona esas DBs en CADA corrida de vitest, así que aplicar las 209 migraciones acumuladas desde cero con 4 workers en paralelo excede el `hookTimeout: 120000` configurado en `vitest.config.ts`. Se corrió localmente con `MAX_TEST_WORKERS=1 --hookTimeout=400000` (sin tocar el config del repo) para eliminar la contención y confirmar que las tres tablas nuevas no rompen nada — 143/143 tests verdes. Este ajuste NO se commiteó (es un flag de invocación local, no un cambio de código); queda documentado acá para quien retome la fase.

## Deviations from Plan

None - plan ejecutado tal como está escrito. La única desviación es de ejecución (no de código): correr los tests locales con `MAX_TEST_WORKERS=1` y un `--hookTimeout` más generoso por CLI, porque el `hookTimeout` global del repo no alcanza para una re-provisión completa de 209 migraciones bajo 4 workers en este entorno. No se modificó `vitest.config.ts` ni ningún otro archivo de configuración del repo — no calza en ninguna de las Reglas 1-4 (no es un bug del código de esta fase, es capacidad de la máquina local vs. el volumen acumulado de migraciones).

## Issues Encountered

- Primeros dos intentos de `vitest run test/db/tenant-tables.test.ts test/tenancy/con-01... test/tenancy/con-06...` fallaron con `Hook timed out in 120000ms` en `test/setup.ts:244` (provisión de la DB de test). Resuelto corriendo con `MAX_TEST_WORKERS=1 --hookTimeout=400000` — no requirió cambios de código, solo más tiempo/menos contención en la provisión inicial.

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- Las 3 tablas y las 2 columnas espejo están disponibles en MySQL local para que 179-02 (service layer, code-resolver, normalización de `code`) empiece a escribir/leer sobre ellas.
- Gates de tenancy (COL-01/CON-01/CON-06) verdes con las tablas nuevas — ningún plan downstream necesita retocar `tenant-tables.ts` para estas 3 tablas.
- Sin bloqueos. La deuda de infraestructura de test (hookTimeout vs. volumen de migraciones) no bloquea el trabajo de esta fase, pero conviene que quien corra la suite completa localmente sepa usar `MAX_TEST_WORKERS=1` o un hookTimeout mayor si ve el mismo timeout.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-api/src/db/migrations/0209_referral_partners.sql`
- FOUND: commit `5ccd93c6` (Task 1, ya existente)
- FOUND: commit `c3991f5f` (Task 2)
- FOUND: commit `1c4c7669` (Task 3)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
