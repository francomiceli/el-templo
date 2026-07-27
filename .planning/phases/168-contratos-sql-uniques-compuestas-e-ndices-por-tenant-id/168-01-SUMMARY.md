---
phase: 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id
plan: 01
subsystem: database
tags: [mysql, drizzle, migrations, multi-tenancy, indexes, unique-constraints]

# Dependency graph
requires:
  - phase: 166-tenancy-fundacion
    provides: "tablas tenants/tenant_settings y El Templo sembrado como tenant id=1"
  - phase: 167-tenant-columns
    provides: "tenant_id NOT NULL DEFAULT 1 + FK fk_<tabla>_tenant en las 87 tablas gym-owned, y src/db/tenant-tables.ts"
provides:
  - "Worktree et-168-contratos en la rama feat/168-contratos-sql, basado en origin/master (68c447cf)"
  - "Migración 0196_tenant_unique_contracts.sql: 11 uniques globales convertidas a UNIQUE (tenant_id, ...)"
  - "4 índices secundarios no-unique que reponen los lookups por valor pelado (D-05)"
  - "Base local eltemplo con los 11 contratos compuestos vivos, verificados por INFORMATION_SCHEMA"
  - "Evidencia empírica de que las 9 tablas admiten DROP+ADD atómico en un solo ALTER (sin errno 150)"
affects:
  - "168-02 (schema Drizzle byte-for-byte con la 0196 + commit del .sql)"
  - "168-03/04 (allowlist en tenant-tables.ts y tests de introspección)"
  - "168-06 (rollout a staging y prod)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ALTER TABLE con DROP INDEX + ADD UNIQUE INDEX en un solo statement (primer precedente del repo)"
    - "node_modules por symlink entre worktrees tras verificar pnpm-lock.yaml byte-idéntico (cero installs)"

key-files:
  created:
    - el-templo-api/src/db/migrations/0196_tenant_unique_contracts.sql
  modified: []

key-decisions:
  - "El número 0196 quedó reservado: el tope en origin/master es 0195 y la base local no tenía ninguna fila 0196% en _migrations"
  - "Las 9 tablas quedaron atómicas (DROP+ADD en un solo ALTER TABLE): ninguna FK depende de los 11 índices dropeados, verificado por KEY_COLUMN_USAGE antes de aplicar. D-08 se cumplió sin excepciones"
  - "Cero DDL de INDEX(tenant_id) en la 0196 (D-07): las FK de las migraciones 0192-0195 ya dejaron su índice auto-creado y las anclas tienen el explícito de la 0191"
  - "formats no recibe índice secundario: ya tiene formats_name_idx sobre (name) desde la 0001"
  - "El .sql NO se commitea en este plan — va junto al schema Drizzle en 168-02 (Hard Rule 3 del skill de migraciones)"

patterns-established:
  - "Verificación de migraciones de índices contra INFORMATION_SCHEMA.STATISTICS con TABLE_SCHEMA = DATABASE(), nunca contra _migrations"
  - "Credenciales de MySQL siempre por MYSQL_PWD, jamás en la línea de comandos"

requirements-completed: [CON-01, CON-02]

# Metrics
duration: 6min
completed: 2026-07-27
---

# Phase 168 Plan 01: Contratos SQL — migración 0196 Summary

**Las 11 uniques globales del doc 06 §1-D pasaron a ser `UNIQUE (tenant_id, ...)` en una sola migración hand-written con DROP+ADD atómico por tabla, más los 4 índices secundarios que reponen los lookups por valor pelado — aplicada y verificada contra la base local por introspección de `INFORMATION_SCHEMA`.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-27T19:03:08Z
- **Completed:** 2026-07-27T19:09Z
- **Tasks:** 3/3
- **Files modified:** 1 creado (`0196_tenant_unique_contracts.sql`)

## Accomplishments

### Task 1 — Worktree de la fase y reserva del 0196

- `git fetch origin` + `git worktree add -b feat/168-contratos-sql /home/franco/projects/et-168-contratos origin/master`. Tip de master: `68c447cf` (fase 167 ya mergeada).
- Las tres verificaciones previas pasaron: el tope de migraciones en el worktree es `0195_tenant_id_templo_rest.sql`, `src/db/tenant-tables.ts` ya existe con `GYM_OWNED_TABLES` (la 168 lo EXTIENDE, no lo crea) y `_migrations` de la base local no tenía ninguna fila `0196%` (tope aplicado local: 0195, igual que prod).
- `node_modules` resuelto por **symlink** a `/home/franco/projects/et-167-columnas/el-templo-api/node_modules` tras confirmar con `cmp` que los `pnpm-lock.yaml` son byte-idénticos. **Cero `pnpm install` / `npm install`** (mitigación T-168-SC).
- El checkout principal quedó intacto: sigue en `fix/referral-preview-y-refresh-ficha` con sus 102 archivos sin commitear sin tocar.

### Task 2 — La migración 0196

`el-templo-api/src/db/migrations/0196_tenant_unique_contracts.sql`, hand-written (nunca `db:generate`), con cabecera-narrativa en castellano al estilo de la 0192 y **sin un solo `;` dentro de ninguna línea `--`**.

La cabecera documenta: que es la tanda D de la fase 168 (CON-01, CON-02) del doc 06 §1-D; los 11 contratos que dejan de ser globales y por qué un segundo gimnasio los colisionaría; que la lista **M8** (ids de plataforma externa Wellhub/Gympass y secretos random con lookup pre-scope) queda GLOBAL a propósito y este archivo no la toca; que **no se crea ningún `INDEX(tenant_id)`** porque las FK de las migraciones 0192-0195 ya dejaron el índice auto-creado `fk_<tabla>_tenant` y las anclas tienen además el explícito de la 0191 (D-07); por qué vuelven 4 índices no-unique con el sitio de código que motiva cada uno; la atomicidad D-08 y qué se habría hecho ante un errno 150; que es hand-written por el drift de `sessions.goal_plan_type`; y la trampa de la heurística `alreadyApplied` del runner (más el `"Can't DROP"` que tolera `test/setup.ts`), por la que la verificación va contra `INFORMATION_SCHEMA` y nunca contra `_migrations`.

Cuerpo: 9 statements `ALTER TABLE`, uno por tabla, cada uno precedido de un comentario que dice qué contrato queda. Conteos fuera de comentarios: **11 `DROP INDEX`, 11 `ADD UNIQUE INDEX`, 4 `ADD INDEX`**, y 0 coincidencias de `INDEX(tenant_id)` / `ADD INDEX idx_*_tenant_id`. Los 22 nombres (11 viejos + 11 nuevos) se verificaron uno por uno, con `tenant_id` como primera columna en los 11 nuevos.

### Task 3 — Aplicación y verificación contra la base local

- `pnpm db:migrate` → `Applying: 0196_tenant_unique_contracts.sql (9 statements) / Applied successfully`. **Ningún errno 150**: las 9 tablas aceptaron el `DROP INDEX` + `ADD UNIQUE INDEX` combinado, así que **la atomicidad de D-08 se cumplió en las 9 tablas sin excepción** y nunca hubo ventana sin contrato de unicidad.
- Antes de aplicar se descartó el riesgo por introspección de `KEY_COLUMN_USAGE`: ninguna FK del schema referencia `users.email/dni/referral_code`, `branches.code`, `cost_centers.(name, country)`, `formats.name` ni `promo_plans.promo_code`, o sea que ninguno de los 11 índices dropeados sostenía una FK.
- Verificación contra `INFORMATION_SCHEMA.STATISTICS` (nunca contra `_migrations`): la query del plan devolvió exactamente **`11 0 4`** — 11 uniques nuevas con `NON_UNIQUE=0` y `tenant_id` en `SEQ_IN_INDEX=1`, cero supervivientes de los 11 nombres viejos, 4 secundarios no-unique.
- Orden de columnas de las compuestas de 3: `uq_cost_centers_tenant_name_country` = `tenant_id,name,country` y `uq_holidays_tenant_country_date` = `tenant_id,country,date`.
- `_migrations` contiene exactamente **1** fila `0196_tenant_unique_contracts.sql`.
- Los índices de la fase 167 siguen vivos: 80 índices distintos entre `idx_users_tenant_id`, `idx_branches_tenant_id` y los `fk_*_tenant`. No se dropeó nada de la 167.

## Task Commits

| Task | Nombre                          | Commit | Archivos                                                         |
| ---- | ------------------------------- | ------ | ---------------------------------------------------------------- |
| 1    | Worktree y reserva del 0196     | —      | (sin archivos de código)                                         |
| 2    | Escribir la 0196                | —      | `0196_tenant_unique_contracts.sql` (sin commitear, va en 168-02) |
| 3    | Aplicar la 0196 a la base local | —      | (sin cambios de archivo)                                         |

**No hay commits de código en este plan y es intencional.** El propio `<verification>` del plan lo dice: _"Nada fue commiteado todavía: el commit va junto al schema Drizzle (Hard Rule 3, plan 168-02)"_. El `.sql` queda como archivo untracked en el worktree `et-168-contratos` hasta que 168-02 lo stagee junto a los `src/db/schema/*.ts`. Este SUMMARY sí se commitea en el checkout principal, stageando solo su ruta.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Faltaban los archivos de entorno en el worktree nuevo**

- **Found during:** Task 1 (preparación previa a Task 3)
- **Issue:** `.env.development` y `.env` están gitignorados, así que un worktree recién creado no los tiene y `pnpm db:migrate` no habría podido conectarse a la base local.
- **Fix:** se copiaron ambos desde `/home/franco/projects/et-167-columnas/el-templo-api/` (misma base local `eltemplo` en `localhost`). No se creó ningún archivo de entorno nuevo ni se inventó ninguna credencial, y no quedaron secretos en la línea de comandos (se usó `MYSQL_PWD`).
- **Files modified:** `el-templo-api/.env`, `el-templo-api/.env.development` en el worktree (ambos gitignorados, no entran a ningún commit).
- **Commit:** —

Ninguna otra desviación: el plan se ejecutó tal como estaba escrito. En particular, **no** hizo falta el plan de contingencia de errno 150 del Task 3.

## Threat Model — resultado

| Threat ID | Resultado                                                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-168-01  | Mitigada. Los 11 nombres físicos existían en la base local antes del DROP (verificado por introspección) y el assert final exige `viejas = 0` contra `INFORMATION_SCHEMA`.              |
| T-168-02  | Mitigada, sin ventana: los 9 `ALTER TABLE` fueron atómicos. No hubo que separar ningún statement.                                                                                       |
| T-168-03  | Aceptada, como estaba previsto. Un solo rebuild por tabla, probado local antes de cualquier entorno compartido.                                                                         |
| T-168-04  | Mitigada. El único destino de este plan fue `localhost/eltemplo` vía `.env.development`. Staging y prod son del plan 168-06.                                                            |
| T-168-05  | Mitigada. Worktree creado desde `origin/master` tras `git fetch`, cero `checkout`/`stash`/`reset` en el checkout principal, y su rama y sus 102 archivos sin commitear siguen intactos. |
| T-168-SC  | Mitigada. `pnpm-lock.yaml` byte-idéntico verificado con `cmp` → symlink a los `node_modules` del worktree 167. Cero installs.                                                           |

## Known Stubs

Ninguno. La migración es DDL completo — lo que falta (schema Drizzle, allowlist, tests, verificador CLI, rollout) es alcance explícito de los planes 168-02 a 168-06.

## Notas para el plan siguiente (168-02)

- El worktree vive en `/home/franco/projects/et-168-contratos`, rama `feat/168-contratos-sql`, con `node_modules` por symlink y los `.env` copiados. **No correr ningún install ahí.**
- El primer commit de la fase tiene que incluir `src/db/migrations/0196_tenant_unique_contracts.sql` junto a los `src/db/schema/*.ts` (Hard Rule 3), stageando por ruta explícita.
- 6 de las 11 uniques están hoy como `.unique()` inline sobre la columna y hay que moverlas al callback de tabla como `uniqueIndex(...)`. En `promo_plans` y `notification_templates` el callback ni siquiera existe (`mysqlTable` de 2 argumentos) — hay que agregarlo.
- Los 4 índices secundarios (`idx_users_email`, `idx_users_dni`, `idx_users_referral_code`, `idx_campaign_unsubscribes_email`) también tienen que declararse en el schema para que Drizzle no vea drift.
- La base local ya está migrada: un `pnpm db:migrate` en 168-02 será no-op para la 0196.

## Self-Check

- `el-templo-api/src/db/migrations/0196_tenant_unique_contracts.sql` — FOUND (en `/home/franco/projects/et-168-contratos`)
- Worktree `feat/168-contratos-sql` — FOUND
- `_migrations` con 1 fila `0196_tenant_unique_contracts.sql` — FOUND
- Query de verificación `11 0 4` — PASSED
- Commits de código: ninguno esperado en este plan (por diseño del plan) — N/A

## Self-Check: PASSED
