---
phase: 193-comunicaciones
plan: 02
subsystem: api
tags: [communications, drizzle, migration, tenancy, mysql, tv, avisos]

# Dependency graph
requires: ["193-01"]
provides:
  - "avisos (Drizzle + tabla física): pop-ups/tarjetas de sistema o custom, destino, alcance, vigencia, frecuencia, estado (D-11..D-15)"
  - "aviso_events (Drizzle + tabla física): un evento por (aviso, socio, tipo), base de frecuencia y métricas de socios únicos (D-11, D-17)"
  - "tv_avisos (Drizzle + tabla física): entidad de avisos de TV con sedes, modo y activo/inactivo (D-24)"
  - "tv_class_state.tv_aviso_id: referencia al aviso de TV en pantalla (D-25)"
  - "migración 0216_communications.sql aplicada en local, idempotente"
  - "las 3 tablas clasificadas en GYM_OWNED_TABLES / TENANT_UNIQUE_ALLOWLIST / TENANT_STRICT_MODULES"
affects: [193-03, 193-04, 193-05, 193-06, 193-08, 193-09, 193-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tabla gym-owned que nace con tenantIdColumn() desde el día uno (mismo criterio que referral_partners, D-20 fase 179)"
    - "Unique compuesta (tenant_id, code) que tolera N filas con code NULL — código de sistema opcional, no todo aviso lo necesita"
    - "Tabla de eventos por (entidad, socio, tipo) con unique compuesta para contar socios ÚNICOS por COUNT(*), en vez de contadores acumulativos tipo notification_templates.sent_count"
    - "Módulo de tenancy que nace strict (TENANT_STRICT_MODULES) sin deuda previa que tolerar, porque las tablas son nuevas"

key-files:
  created:
    - el-templo-api/src/db/schema/communications.ts
    - el-templo-api/src/db/migrations/0216_communications.sql
  modified:
    - el-templo-api/src/db/schema/tv.ts
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/test/db/tenant-tables.test.ts

key-decisions:
  - "0216 confirmado como el siguiente número libre en origin/master y origin/staging (ambas topan en 0215_referral_partners.sql), verificado 2026-09-02. No colisiona con 0216_platform_core.sql/0217_gym_catalog.sql de la rama v6.1 (otro worktree, otro nombre de archivo, _migrations trackea por nombre)."
  - "No se usó ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 al final de los CREATE TABLE: aunque el plan lo pedía 'como el 0215', el 0215 real (y ninguna migración reciente revisada) lleva esa cláusula — se siguió la convención real del repo en vez del texto literal del plan."
  - "Los símbolos de enum se nombraron con prefijo (avisoStatusEnum, avisoKindEnum, tvAvisoModeEnum, etc.) para evitar colisión de exports en el barrel schema/index.ts, ya que varias tablas del repo ya usan la columna física 'status' con su propio símbolo TS distinto (debtManagementStatusEnum, partnerReferralStatusEnum, etc.)."

requirements-completed: [COM-02, COM-04]

# Metrics
duration: ~50min
completed: 2026-09-02
---

# Phase 193 Plan 02: Modelo de datos de Comunicaciones Summary

**Tres tablas nuevas (`avisos`, `aviso_events`, `tv_avisos`) gym-owned desde el día uno + columna `tv_class_state.tv_aviso_id`, migración 0216 escrita a mano y aplicada en local, con las tres tablas clasificadas fail-closed en los tres registros de tenancy.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 3/3
- **Files modified:** 6 (2 nuevos + 4 modificados)

## Accomplishments

- `communications.ts`: `avisos` (kind/placement/destino/frecuencia/vigencia/alcance/estado, D-11..D-15), `aviso_events` (evento por aviso+socio+tipo, D-11/D-17), `tv_avisos` (sedes/modo/activo, D-24), relations de `aviso_events` → `avisos`/`users`
- `tv.ts`: `tvClassState.tvAvisoId` referencia el aviso de TV en pantalla (D-25), sin tocar la columna `screen` existente
- `0216_communications.sql`: 3 `CREATE TABLE` + 1 `ALTER TABLE tv_class_state`, enums byte a byte con el schema TS, cero `;` en comentarios, cero datos de prueba, numeración verificada contra `origin/master` y `origin/staging` (ambas topan en 0215)
- Migración aplicada en local (`pnpm db:migrate`) y confirmada idempotente al re-correr
- `tenant-tables.ts`: `GYM_OWNED_TABLES` 91→94 (orden alfabético), `TENANT_UNIQUE_ALLOWLIST` con `aviso_events.uq_aviso_events_aviso_user_type`, `TENANT_STRICT_MODULES.communications` nace strict
- `test/db/tenant-tables.test.ts`: conteos actualizados 91/4/95 → 94/4/98, `MODULOS_DECLARADOS` actualizado con `communications`
- Verificación: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS: 0, `test/db/tenant-tables.test.ts` 18/18 verde, `pnpm db:migrate` idempotente

## Task Commits

Each task was committed atomically on `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Schema Drizzle de avisos, aviso_events y tv_avisos** - `a5d733c6` (feat)
2. **Task 2: Migración 0216 escrita a mano** - `f687cff3` (feat)
3. **Task 3: [BLOCKING] Aplicar 0216 en local + clasificar tablas en tenancy** - `2116f897` (feat)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal sin commitear (lo commitea el orquestador). Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-api/src/db/schema/communications.ts` - las 3 tablas nuevas del modelo de Comunicaciones
- `el-templo-api/src/db/schema/tv.ts` - `tvClassState.tvAvisoId` + import de `tvAvisos`
- `el-templo-api/src/db/schema/index.ts` - `export * from "./communications"`
- `el-templo-api/src/db/migrations/0216_communications.sql` - migración hand-written aplicada en local
- `el-templo-api/src/db/tenant-tables.ts` - clasificación en `GYM_OWNED_TABLES`, `TENANT_UNIQUE_ALLOWLIST`, `TENANT_STRICT_MODULES`
- `el-templo-api/test/db/tenant-tables.test.ts` - conteos 94/4/98 y `MODULOS_DECLARADOS.communications`

## Decisions Made

- Ver `key-decisions` en el frontmatter (numeración 0216, sin cláusula ENGINE, nombres de símbolos de enum prefijados).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `TENANT_STRICT_MODULES.communications` requería actualizar también `MODULOS_DECLARADOS` en el test**

- **Found during:** Task 3, primera corrida de `test/db/tenant-tables.test.ts`
- **Issue:** El plan solo mencionaba agregar la clave `communications` a `TENANT_STRICT_MODULES` en `src/db/tenant-tables.ts`, pero el test trae un segundo registro espejo (`MODULOS_DECLARADOS`, un `it` fail-closed dedicado) que exige declarar explícitamente cada módulo strict adoptado — sin esto el test fallaba con un mensaje extenso explicando que agregar un módulo strict es una decisión de diseño que debe quedar declarada a propósito.
- **Fix:** Se agregó `communications: ["aviso_events", "avisos", "tv_avisos"]` a `MODULOS_DECLARADOS` con un comentario docblock explicando que el módulo nace strict sin deuda previa (tablas nuevas, sin entradas preexistentes en `tenant-lint-allowlist.json` que vaciar — verificado por grep, cero resultados).
- **Files modified:** `el-templo-api/test/db/tenant-tables.test.ts`
- **Verification:** los 18 tests de `tenant-tables.test.ts` pasan en verde.
- **Committed in:** `2116f897` (Task 3 commit)

**2. [Rule 1 - Bug propio] Orden alfabético incorrecto al insertar `aviso_events`/`avisos` en `GYM_OWNED_TABLES`**

- **Found during:** Task 3, primer intento de edición
- **Issue:** Inserté `aviso_events`/`avisos` inmediatamente después de `audit_log` y antes de `aura_balances`, pero alfabéticamente `aura_*` precede a `aviso_*` (`'u' < 'v'` en la tercera posición). Detectado por inspección visual antes de correr el test (el test de "toda tabla clasificada" no valida orden, solo pertenencia).
- **Fix:** Reordenado: `audit_log`, `aura_balances`, `aura_config`, `aura_transactions`, `aviso_events`, `avisos`, `balances`.
- **Files modified:** `el-templo-api/src/db/tenant-tables.ts`
- **Verification:** conteo `GYM_OWNED_TABLES.length` = 94 confirmado con grep antes de correr el test completo.
- **Committed in:** `2116f897` (Task 3 commit, ya con el orden correcto — no generó un commit adicional)

**3. [Rule 1 - Bug propio] `;` real dentro de un comentario de la migración 0216**

- **Found during:** Task 2, verificación con el grep de la regla dura 4/skill (`^--.*;`)
- **Issue:** El header de la migración tenía la frase "...dentro de un\n-- tenant; los avisos custom dejan..." con un `;` literal después de "tenant", violando la regla dura 2 del skill `el-templo-db-migrations` (el runner parte por `;` antes de borrar comentarios).
- **Fix:** Reemplazado el `;` por `--` (separador de guion doble, sin cambiar el sentido de la frase).
- **Files modified:** `el-templo-api/src/db/migrations/0216_communications.sql`
- **Verification:** `grep -n '^--.*;'` y `grep -nE '^\s*--.*;'` sobre el archivo completo, ambos sin resultados, antes de aplicar la migración.
- **Committed in:** `f687cff3` (Task 2 commit, corregido antes del commit — no generó un commit adicional)

---

**Total deviations:** 3 (2 auto-fijadas antes de commitear, sin generar commits extra; 1 requirió tocar un archivo fuera de `files_modified` original del plan pero dentro del mismo archivo ya listado — `test/db/tenant-tables.test.ts` — así que no amplió el scope real)
**Impact on plan:** Sin impacto en el objetivo del plan. Las tres tablas quedaron clasificadas correctamente y el gate fail-closed de módulos strict quedó satisfecho con la intención original del plan (D-149 del plan: "el módulo nace strict, no hay deuda previa que tolerar").

## Issues Encountered

Ninguno bloqueante. `test/db/tenant-tables.test.ts` tardó ~113-121s en cada corrida (provisión del DB de test), dentro del `--hookTimeout=300000` indicado en las reglas duras del prompt — corrido en foreground con `timeout: 580000` en la herramienta Bash, sin backgrounding.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `avisos`, `aviso_events`, `tv_avisos` y `tv_class_state.tv_aviso_id` quedan listos como cimiento de datos para los planes que exponen rutas HTTP y consumo (03 en adelante: seeds de sistema, endpoint "qué pop-up toca hoy", CRUD admin, editor de tarjetas, avisos de TV).
- Nada bloquea el plan 03: worktree limpio, `feat/193-comunicaciones` con 6 commits nuevos sobre `origin/master` `7c273a15` (3 de la 01 + 3 de esta).
- Deuda anotada (no bloqueante): ninguna ruta HTTP consume todavía estas tablas — las rutas y el service layer son responsabilidad de los planes siguientes según `193-PATTERNS.md` (`modules/communications/routes.ts`, `service.ts`).
- Nota para planes siguientes: la DB local `eltemplo` de este worktree convive con `0216_platform_core.sql`/`0217_gym_catalog.sql` de la rama v6.1 (otro worktree `et-182`/`et-185`), aplicadas ahí por error de numeración compartida de host local — no son parte de este checkout ni de este árbol de commits, no tocar.

---

## Self-Check: PASSED

- `el-templo-api/src/db/schema/communications.ts` — FOUND
- `el-templo-api/src/db/migrations/0216_communications.sql` — FOUND
- Commit `a5d733c6` — FOUND
- Commit `f687cff3` — FOUND
- Commit `2116f897` — FOUND
- `.planning/phases/193-comunicaciones/193-02-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
