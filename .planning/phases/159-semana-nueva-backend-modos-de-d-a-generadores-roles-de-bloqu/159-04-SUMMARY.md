---
phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu
plan: 04
subsystem: api
tags: [drizzle, mysql, migrations, tenancy, corpus-ia]

# Dependency graph
requires: []
provides:
  - "Tabla session_week_regime: ancla semana→régimen, gym-owned, tenant_id desde el inicio"
  - "session_week_regime retro-etiquetada W12-W26 (30 filas, tenant 1) — corpus IA para SEM-05"
  - "Migraciones 0202 (DDL) y 0203 (@data-only backfill) numeradas y verificadas contra origin/master y origin/staging"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tabla gym-owned que nace con tenant_id desde el arranque (no un ALTER de la tanda C) — primer precedente de este patrón en el repo"
    - "Backfill @data-only con literales calculados fuera de SQL (research/CONTEXT), INSERT...SELECT...WHERE NOT EXISTS por fila"
    - "Test de migración que re-lee y re-ejecuta los statements reales del .sql (no una copia a mano) para probar idempotencia + invariancia de una tabla vecina"

key-files:
  created:
    - el-templo-api/src/db/schema/session-week-regime.ts
    - el-templo-api/src/db/migrations/0202_session_week_regime.sql
    - el-templo-api/src/db/migrations/0203_backfill_regime_w12_w26.sql
    - el-templo-api/src/db/scripts/0203_regime_dryrun.sql
    - el-templo-api/test/migrations/0202-session-week-regime.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts

key-decisions:
  - "Numeración final: 0202 (DDL) / 0203 (backfill), re-verificada contra origin/master (tope 0201, hueco en 0200 lo ocupa el tren v6.0 no mergeado) y origin/staging (tope 0200) — ninguna rama llega a 0202, confirmado antes de escribir"
  - "dayEnum NO se reusa por referencia desde weekly-rotator.ts: se declara un mysqlEnum('day', [...]) propio en session-week-regime.ts con la misma lista de 6 valores, para no compartir un builder de columna mutable de Drizzle entre dos mysqlTable distintas (sin precedente de reuso en el repo)"
  - "session_week_regime se clasifica alfabéticamente ANTES de 'sessions' (no 'entre sessions y spom_rules' como decía el plan en prosa — 'session_week_regime' < 'sessions' por el '_' vs 's', verificado con sort)"
  - "confidence queda NULL en las 30 filas: el research no da un score numérico por fila (solo % agregados como lowrep_pct), inventar un número habría sido peor que dejarlo NULL; evidence.note documenta la señal real de cada fila"
  - "Rule 1 (auto-fix, in-scope): 3 tests que hardcodeaban el conteo de GYM_OWNED_TABLES en 87 (test/db/tenant-tables.test.ts, test/migrations/0192-0195-tenant-columns.test.ts, test/migrations/0196-tenant-unique-contracts.test.ts) se actualizaron a 88 — consecuencia directa e inevitable de agregar la tabla nueva a GYM_OWNED_TABLES (must_have del plan)"

requirements-completed: [SEM-05]

# Metrics
duration: 55min
completed: 2026-08-14
---

# Phase 159 Plan 04: Ancla histórica session_week_regime (semana→régimen) Summary

**Tabla nueva `session_week_regime` (primera gym-owned que nace con `tenant_id` desde el arranque) + backfill idempotente de 30 filas W12-W26 (firmas de detección W12-20, relevamiento SSH prod W21-26) que retro-etiqueta el corpus IA de combos/técnica sin tocar ni una fila de `sessions`.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-14 (aprox.)
- **Completed:** 2026-08-14
- **Tasks:** 2/2
- **Files modified:** 10 (5 nuevos, 5 modificados — 3 de los modificados son fixes de deviation Rule 1)

## Accomplishments

- `session_week_regime` (schema Drizzle en `db/schema/session-week-regime.ts`): `id`, `tenantId` (`tenantIdColumn()`), `week`, `day` (enum de 6 días), `inferredMode` (`varchar(10)`: combos/tecnica/regular/rom), `source` (`varchar(20)`: signature/generator/manual), `confidence` (int nullable), `evidence` (json nullable), `createdAt`. Unique `uq_session_week_regime_tenant_week_day` sobre `(tenantId, week, day)` con `tenantId` primero.
- Exportada en `db/schema/index.ts`; clasificada en `GYM_OWNED_TABLES` de `db/tenant-tables.ts` (orden alfabético, inmediatamente antes de `"sessions"`).
- Migración `0202_session_week_regime.sql`: DDL hand-written, `tenant_id int NOT NULL DEFAULT 1` + `CONSTRAINT fk_session_week_regime_tenant FOREIGN KEY`, unique `(tenant_id, week, day)`. Numeración re-verificada contra `origin/master` (`git ls-tree`, tope real 0201) y `origin/staging` (tope 0200) antes de escribir — 0202 confirmado libre en ambas.
- Migración `0203_backfill_regime_w12_w26.sql` (`-- @data-only` en la primera línea): 30 `INSERT ... SELECT ... WHERE NOT EXISTS` (15 semanas W12-W26 × 2 días), sin ningún `UPDATE`/`DELETE` sobre `sessions`. W12-W20 con `source='signature'` (firmas del discovery: Complex×3/reps 1-6 = combos, complementario = técnica; anomalía W17 documentada en el `evidence` JSON). W21-W26 con `source='manual'` (relevamiento SSH prod 2026-08-13, verbatim de `159-CONTEXT.md §evidencia_prod`).
- `src/db/scripts/0203_regime_dryrun.sql`: `SELECT` read-only que agrupa `sessions`/`session_blocks` (rol NUCLEUS, W12-26, mié/jue) por formato — material de verificación humana previo al deploy, excluye Ladder/Ladder corta.
- `test/migrations/0202-session-week-regime.test.ts`: Test 1 (forma del índice único vía `INFORMATION_SCHEMA`, `tenant_id` en `SEQ_IN_INDEX=1`), Test 2 (D-18: re-lee y re-ejecuta los 30 statements REALES del `.sql` dos veces seguidas — el conteo de `sessions` no cambia, `session_week_regime` no duplica filas), Test 3 (las 12 filas W21-W26 coinciden exactamente con el CONTEXT).
- `pnpm exec tsc --noEmit` verde en `el-templo-api`.
- `pnpm lint:tenant` (`src/db/scripts/lint-tenant.ts`): **DISCREPANCIAS: 0** — la tabla nueva no genera ninguna violación de tenancy.

## Task Commits

1. **Task 1: schema session-week-regime.ts + export + clasificación tenancy + DDL 0202** - `0c68ae47` (feat)
2. **Task 2: backfill 0203 (@data-only) + dry-run + test de migración** - `ad67317b` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/session-week-regime.ts` - schema nuevo, gym-owned desde el arranque
- `el-templo-api/src/db/schema/index.ts` - `export * from "./session-week-regime"`
- `el-templo-api/src/db/tenant-tables.ts` - alta en `GYM_OWNED_TABLES` (orden alfabético) + comentario de header actualizado (87→88 gym-owned, 91→92 tablas del schema)
- `el-templo-api/src/db/migrations/0202_session_week_regime.sql` - DDL de la tabla
- `el-templo-api/src/db/migrations/0203_backfill_regime_w12_w26.sql` - backfill de 30 filas W12-W26
- `el-templo-api/src/db/scripts/0203_regime_dryrun.sql` - dry-run read-only
- `el-templo-api/test/migrations/0202-session-week-regime.test.ts` - test de migración (unique, idempotencia/invariancia, datos W21-26)
- `el-templo-api/test/db/tenant-tables.test.ts` - (deviation Rule 1) conteo hardcodeado 87→88 / 91→92
- `el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts` - (deviation Rule 1) `report.gymOwnedChecked` 87→88
- `el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts` - (deviation Rule 1) `report.gymOwnedChecked` 87→88 (Test 10)

## Decisions Made

- Numeración de migraciones: **0202/0203**, re-verificada contra `origin/master` y `origin/staging` antes de escribir SQL (ver key-decisions arriba).
- `dayEnum` de `weekly-rotator.ts` NO se reusa por referencia — se declara una instancia propia del mismo enum en `session-week-regime.ts` para no compartir un builder de columna mutable de Drizzle entre dos `mysqlTable`.
- Clasificación alfabética exacta: `session_week_regime` entra ANTES de `sessions` en `GYM_OWNED_TABLES` (verificado con `sort`, no "entre sessions y spom_rules" como decía la prosa del plan).
- `confidence` queda `NULL` en las 30 filas — el research no aporta un score numérico por fila, solo señales agregadas (`lowrep_pct`); inventar un número habría sido peor que dejarlo `NULL` con la señal real documentada en `evidence`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug directo] Conteo hardcodeado de `GYM_OWNED_TABLES` (87) en 3 suites de test**
- **Found during:** Task 1, al clasificar `session_week_regime` en `GYM_OWNED_TABLES`
- **Issue:** `test/db/tenant-tables.test.ts` (`GYM_OWNED_TABLES.length).toBe(87)` + `schemaTables.size).toBe(91)`), `test/migrations/0192-0195-tenant-columns.test.ts` (`report.gymOwnedChecked).toBe(87)`) y `test/migrations/0196-tenant-unique-contracts.test.ts` (Test 10, `report.gymOwnedChecked).toBe(87)`) fijan el conteo de tablas gym-owned como un número mágico. Sumar `session_week_regime` a `GYM_OWNED_TABLES` (must_have explícito del plan) rompe las tres asserciones de forma directa e inevitable.
- **Fix:** actualicé los tres `.toBe(87)` a `.toBe(88)`, el `.toBe(91)` a `.toBe(92)` (total de tablas del schema), y los comentarios/nombres de test adyacentes que citaban el número viejo, dejando una nota explícita de que la fase 159 sumó la tabla. Verificado el conteo real de forma programática (`tsx` + introspección de `GYM_OWNED_TABLES`/schema Drizzle, sin necesitar MySQL): `GYM_OWNED_TABLES.length === 88`, `schemaTables.size === 92`, sin huérfanas ni fantasmas.
- **Files modified:** `el-templo-api/test/db/tenant-tables.test.ts`, `el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts`, `el-templo-api/test/migrations/0196-tenant-unique-contracts.test.ts`
- **Verification:** introspección programática vía `tsx -e` (ver Testing Performed abajo) — no requiere DB. `pnpm exec tsc --noEmit` verde.
- **Committed in:** `0c68ae47` (fix de `tenant-tables.test.ts`, junto con Task 1), `ad67317b` (fix de los dos tests de migración, junto con Task 2)

**Nota (documentado, NO corregido):** varios comentarios de PROSA (no asserciones) siguen mencionando "87 tablas gym-owned" en `src/db/sentinel/analyze.ts`, `src/db/scripts/lint-tenant.ts`, `test/tenancy/con-04-crons-per-tenant.test.ts` y `test/unit/sentinel-install.test.ts` — no son código ejecutable, no rompen ningún test, y actualizarlos todos es scope creep fuera de este plan (SCOPE BOUNDARY). Quedan como deuda cosmética para quien toque esos archivos después.

---

**Total deviations:** 1 auto-fixed (Rule 1), aplicado en 3 archivos
**Impact on plan:** Consecuencia mecánica e inevitable del must_have "clasificada en GYM_OWNED_TABLES" — sin este fix el gate fail-closed de tenancy (que el propio plan pide dejar verde) se habría roto en CI.

## Testing Performed

- `pnpm exec tsc --noEmit` (el-templo-api): **verde**, corrido dos veces (después de Task 1 y después de Task 2).
- `pnpm exec tsx src/db/scripts/lint-tenant.ts` (CON-06): **DISCREPANCIAS: 0**, sin violaciones nuevas.
- `test/db/tenant-tables.test.ts` (introspección pura, sin DB): **NO se pudo correr con `vitest`** — el `globalSetup` del repo intenta conectar a MySQL incondicionalmente (incluso para archivos que no la necesitan) y este worktree no tiene credenciales reales (`.env.development`/`.env` ausentes, solo `.env.example` con placeholder; `mysql -u root` → `Access denied`, sin `sudo` disponible). **Verificado en su lugar de forma programática**, replicando exactamente la lógica del test con `pnpm exec tsx -e "..."` importando `GYM_OWNED_TABLES`/`TENANT_EXEMPT_TABLES`/el schema barrel real: `GYM_OWNED_TABLES.length === 88`, `TENANT_EXEMPT_TABLES.length === 4`, `schemaTables.size === 92`, `unclassified === []`, `ghosts === []`, `both === []`. Los 6 asserts del describe pasarían.
- `test/migrations/0202-session-week-regime.test.ts` (Task 2, requiere MySQL real vía `createTestApp()`): **NO corrido localmente** por la misma razón (sin credenciales DB). **Queda para CI.** Verificación estática hecha en su lugar: el parser de statements del test (idéntico al de `test/setup.ts`) contra el `.sql` real confirma 30 statements, todos `INSERT INTO session_week_regime`, ninguno roto por `;` dentro de un comentario.
- `grep -n -- '--.*;'` sobre los 3 archivos `.sql` nuevos: sin coincidencias en los tres.
- `grep -in "sessions"` sobre `0203_backfill_regime_w12_w26.sql`: solo prosa en comentarios (líneas 5 y 11), sin `UPDATE`/`INSERT`/`DELETE` sobre `sessions`.
- `grep -in "INSERT|UPDATE|DELETE"` sobre `0203_regime_dryrun.sql`: sin coincidencias (100% read-only, un único `SELECT`).

## Issues Encountered

MySQL local disponible como servicio (`mysqladmin ping` responde) pero sin credenciales utilizables por este worktree — `.env.development`/`.env` no existen (solo `.env.example` con placeholder `your_password_here`), y `mysql -u root` sin password da `Access denied`. Sin acceso a `sudo` interactivo para resetear la contraseña. Por instrucción explícita de la tarea ("si el DB de test NO está disponible localmente, NO lo fuerces"), no se forzó: los dos tests que requieren DB real (`test/db/tenant-tables.test.ts` vía vitest, `test/migrations/0202-session-week-regime.test.ts`) quedan para que los corra CI. Se compensó con verificación estática/programática equivalente sin DB (ver Testing Performed).

## User Setup Required

Ninguno — no requiere configuración de servicio externo. La verificación de `test/migrations/0202-session-week-regime.test.ts` y `test/db/tenant-tables.test.ts` vía `vitest` queda pendiente de CI (o de una corrida local con `.env.development` configurado contra MySQL real).

## Next Phase Readiness

El ancla `session_week_regime` existe, está clasificada y poblada W12-W26 (30 filas, tenant 1). Este plan es independiente de los generadores (Wave 1, corrido en paralelo con el plan 01) — no bloquea ni es bloqueado por `combos-generator.ts`/`tecnica-generator.ts`/`semana-nueva-pipeline.ts`. El corpus IA de SEM-05 queda disponible para quien lo consuma (fuera del alcance de esta fase, que es backend-only).

Pendiente de responsabilidad del orquestador de fase (no de este plan): confirmar en CI que `test/db/tenant-tables.test.ts` y `test/migrations/0202-session-week-regime.test.ts` pasan contra MySQL real, dado que no se pudieron correr localmente.

---
*Phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu*
*Completed: 2026-08-14*

## Self-Check: PASSED

Los 5 archivos nuevos existen en disco (schema, dos migraciones, dry-run script, test de migración); los 5 archivos modificados tienen el diff descrito; los dos commits de tarea (`0c68ae47`, `ad67317b`) existen en el historial de git de la rama `feat/159-semana-nueva-backend`.
