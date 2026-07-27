---
phase: 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id
plan: 02
subsystem: database
tags: [drizzle, schema, multi-tenancy, indexes, unique-constraints, migrations]

# Dependency graph
requires:
  - phase: 167-columnas-tenant-id
    provides: "tenant_id NOT NULL DEFAULT 1 + helper tenantIdColumn() en las 87 tablas gym-owned"
  - plan: 168-01
    provides: "migración 0196_tenant_unique_contracts.sql escrita y aplicada a la base local (untracked)"
provides:
  - "Schema Drizzle alineado byte a byte con la 0196: las 11 uniques declaradas como compuestas con tenant_id primero"
  - "Los 4 índices secundarios no-unique de D-05 declarados en el schema (Drizzle ya no ve drift)"
  - "Las 11 uniques de la lista M8 anotadas con su motivo y con puntero al registro central"
  - "El .sql de la 0196 commiteado junto al schema (Hard Rule 3) — primer commit de código de la fase"
affects:
  - "168-03 (tenant-tables.ts tiene que exportar TENANT_GLOBAL_UNIQUES: los 11 comentarios ya lo referencian por nombre)"
  - "168-04 (tests de introspección: los nombres de índice que van a assertear son los de este schema)"
  - "168-06 (rollout a staging y prod del .sql que ya quedó commiteado acá)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unique compuesta declarada en el callback de tabla con tenantId como PRIMER columna (analog: tenants.ts uq_tenant_setting)"
    - "Comentario `tenant-global (M8)` de una línea sobre cada unique que queda global, con categoría de motivo + puntero al registro central"

key-files:
  created: []
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/db/schema/branches.ts
    - el-templo-api/src/db/schema/cost-centers.ts
    - el-templo-api/src/db/schema/promo-plans.ts
    - el-templo-api/src/db/schema/campaigns.ts
    - el-templo-api/src/db/schema/notifications.ts
    - el-templo-api/src/db/schema/day-modes.ts
    - el-templo-api/src/db/schema/holidays.ts
    - el-templo-api/src/db/schema/formats.ts
    - el-templo-api/src/db/schema/wellhub.ts
    - el-templo-api/src/db/schema/refresh-tokens.ts
    - el-templo-api/src/db/schema/tv.ts
    - el-templo-api/src/db/migrations/0196_tenant_unique_contracts.sql

key-decisions:
  - "El commit del .sql se hizo ACÁ y no en 168-06: Hard Rule 3 del skill de migraciones manda el .sql en el mismo commit que el schema, y el handoff de 168-01 lo dejó explícito. El `<verification>` del plan 02 decía 'sin commit todavía, lo hace 168-06' — se tomó la instrucción del orquestador y del skill, que es la que evita el drift schema↔DDL"
  - "Los 11 comentarios M8 nombran `TENANT_GLOBAL_UNIQUES` de `src/db/tenant-tables.ts` aunque ese export TODAVÍA NO EXISTE: es el contrato que el plan 168-03 tiene que honrar con ese nombre exacto"
  - "formats no recibe índice secundario de D-05 y el comentario lo dice: formats_name_idx sobre (name) ya existe desde la 0001"
  - "Las 7 columnas que perdieron el .unique() inline llevan un comentario de una línea que dice a dónde se fue la unique — si no, la columna queda muda y la próxima persona la 'arregla'"

patterns-established:
  - "Al sacar un .unique() inline, dejar en la columna un comentario que nombra el índice del callback que lo reemplaza"
  - "Verificación cruzada schema↔migración por nombre literal: `grep -rlF <nombre> src/db/schema/` + `grep -cF <nombre> <mig>.sql` para los 15 nombres, uno por uno"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-07-27
---

# Phase 168 Plan 02: Schema Drizzle alineado con la 0196 Summary

**Las 11 uniques del doc 06 §1-D quedaron declaradas en el schema TypeScript como compuestas con `tenant_id` primero, con los 4 índices secundarios de D-05 y con los 11 nombres viejos extinguidos — más las 11 uniques de la lista M8 anotadas para que nadie las convierta por error — y el `.sql` de la 0196 viajó en el mismo commit que el schema.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-27T19:10:46Z
- **Completed:** 2026-07-27T19:16Z
- **Tasks:** 2/2
- **Files modified:** 12 schema files + 1 migración commiteada

## Accomplishments

### Task 1 — Las 11 uniques compuestas y los 4 índices secundarios

Tres formas de edición según cómo estaba cada archivo, tal como las anticipó el plan:

- **`.unique()` inline sacado de la columna** (7 columnas): `users.email`, `users.dni`, `users.referralCode`, `branches.code`, `formats.name`, `promoPlans.promoCode`, `notificationTemplates.templateKey`. Las siete conservan sus `notNull()` y sus largos originales — verificado columna por columna. Cada una quedó con un comentario de una línea que nombra el índice del callback que la reemplaza, para que la columna no quede muda.
- **Unique que ya vivía en el callback, renombrada y con `table.tenantId` antepuesto**: `cost_centers`, `campaign_unsubscribes`, `day_modes`, `holidays`.
- **Callback de tabla CREADO desde cero** (el `mysqlTable` pasó de 2 a 3 argumentos): `promo_plans` y `notification_templates`.

Los 4 índices secundarios de D-05 se declararon con `index(...)` y no con `uniqueIndex(...)`: `idx_users_email`, `idx_users_dni`, `idx_users_referral_code` (los tres en el callback de `users`) e `idx_campaign_unsubscribes_email`. Cada uno cita en su comentario el lookup por el valor pelado que lo motiva (login y registro en `src/modules/auth/routes.ts`, `resolveReferralCode` en `src/modules/referrals/service.ts`, el filtro `NOT EXISTS` de envíos de campañas).

`uniqueIndex` se importó donde faltaba (`users.ts`, `branches.ts`, `promo-plans.ts`, `notifications.ts`, `formats.ts`). No se tocó `idx_users_tenant_id`, `idx_branches_tenant_id` ni ningún `fk_*_tenant` (D-07), no se agregó ni quitó ninguna columna, y no se corrió `db:generate` ni `db:push`.

El comentario de la mina M3 en `campaigns.ts` pasó de futuro a pasado: la conversión ya ocurrió en la 0196. Se conservó la nota de que `user_id` puede ser NULL.

**Verificación cruzada de los 15 nombres, uno por uno:** los 11 uniques nuevos + los 4 secundarios aparecen literalmente en `src/db/schema/` Y en `0196_tenant_unique_contracts.sql` (1 ocurrencia en el `.sql` cada uno). Los 11 nombres viejos (`users_email_unique`, `users_dni_unique`, `users_referral_code_unique`, `branches_code_unique`, `uq_cost_centers_name_country`, `promo_plans_promo_code_unique`, `uniq_campaign_unsubscribe_email`, `notification_templates_template_key_unique`, `day_modes_day_of_week_unique`, `idx_holidays_country_date`, `formats_name_unique`) dan **0 ocurrencias** en `src/db/schema/`.

### Task 2 — Las 11 uniques M8 anotadas, sin tocar ninguna

Once comentarios de una línea, molde del comentario M7 que ya existía en `tv.ts`, repartidos en 6 archivos: `users.ts` (1), `branches.ts` (1), `wellhub.ts` (4), `refresh-tokens.ts` (1), `notifications.ts` (1), `tv.ts` (3).

Cada comentario dice exactamente tres cosas: que la unique es tenant-global **a propósito**, la categoría del motivo (id de plataforma externa —la unique global impide que dos tenants reclamen el mismo recurso— o secreto random con lookup pre-scope —componer por tenant sería circular porque el tenant se resuelve DESPUÉS de encontrar la fila—), y que el motivo está registrado en `TENANT_GLOBAL_UNIQUES` de `src/db/tenant-tables.ts` (lista M8, aprobada 2026-07-26, doc 06 §8-Q4). Todos arrancan con `tenant-global (M8) a proposito:` y todos incluyen la frase "NO es un olvido de la fase 168", que es el objetivo operativo del D-13.

Las dos uniques de `tv_pairings` complementan el comentario M7 existente en vez de duplicarlo: remiten a él ("ver la mina M7 de arriba") y agregan la pertenencia a M8.

**Prueba de que no se modificó ninguna declaración:** el `git diff` de este task fueron **11 líneas agregadas y 0 eliminadas** en los 6 archivos. Las 11 uniques siguen siendo `.unique()` inline o `uniqueIndex(...)` sobre una sola columna, sin `tenant_id`.

`idx_wellhub_classes_branch_activity` e `idx_wellhub_slots_schedule_date` NO recibieron comentario: no son M8 y su clasificación ("derivada de FK scopeada") es de la allowlist del plan 168-03.

## Task Commits

| Task | Nombre                                | Commit     | Archivos                                                                                                       |
| ---- | ------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | 11 uniques compuestas + 4 secundarios | `ec835050` | 9 schema files + `0196_tenant_unique_contracts.sql` (10 archivos, +311/-67)                                    |
| 2    | Anotar las 11 uniques M8              | `5d5c0bc7` | `users.ts`, `branches.ts`, `wellhub.ts`, `refresh-tokens.ts`, `notifications.ts`, `tv.ts` (6 archivos, +11/-0) |

Ambos commits viven en el worktree `/home/franco/projects/et-168-contratos`, rama `feat/168-contratos-sql`, sobre `68c447cf`. Nada fue pusheado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] El `<verification>` del plan decía "sin commit todavía" y contradecía al orquestador, al handoff de 168-01 y a la Hard Rule 3**

- **Found during:** Task 1, al momento de commitear
- **Issue:** el `<verification>` del 168-02 cerraba con _"Sin commit todavía: el commit de schema + migración lo hace el plan 168-06"_. Eso contradice tres fuentes que sí coinciden entre sí: la Hard Rule 3 del skill `el-templo-db-migrations` (el `.sql` va SIEMPRE en el mismo commit que el schema), el handoff explícito del 168-01 (_"el primer commit de la fase tiene que incluir el `.sql` junto a los `src/db/schema/*.ts`"_) y la instrucción del orquestador. Dejar el `.sql` untracked hasta 168-06 sería exactamente el modo de falla que la Hard Rule 3 previene: schema `.ts` commiteado y `.sql` olvidado, con la DB derivando del código.
- **Fix:** se commiteó la 0196 junto a los 9 schema files en el commit del Task 1 (`ec835050`), stageando por ruta explícita.
- **Files modified:** ninguno de más — solo cambió QUÉ commit lleva el `.sql`.
- **Commit:** `ec835050`

### Decisiones de redacción (no son desviaciones de alcance)

**2. Los 7 comentarios "a dónde se fue la unique" no estaban pedidos literalmente**

El plan pedía comentario sobre cada índice NUEVO. Se agregó además una línea sobre cada una de las 7 columnas que PERDIERON el `.unique()` inline, diciendo que la unique ahora vive en el callback y con qué nombre. Sin eso, una columna que antes decía `.unique()` y ahora no dice nada parece una unique borrada por error — que es el mismo riesgo que D-13 mitiga para las M8.

**3. `TENANT_GLOBAL_UNIQUES` es una referencia hacia adelante**

Los 11 comentarios M8 nombran un export que todavía no existe: lo crea el plan 168-03 en `src/db/tenant-tables.ts`. El plan 02 lo pedía con ese texto exacto, así que queda como **contrato para 168-03**: el export tiene que llamarse `TENANT_GLOBAL_UNIQUES` o hay que corregir 11 comentarios.

Ninguna otra desviación. No hubo `pnpm install` ni `npm install` de ningún tipo (`node_modules` sigue siendo el symlink al worktree 167), no se corrió `db:generate` ni `db:push`, y no se tocó la base de datos.

## Threat Model — resultado

| Threat ID | Resultado                                                                                                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-168-06  | Mitigada. Los 15 nombres se verificaron uno por uno con `grep -F` literal contra `src/db/schema/` y contra el `.sql` de la 0196: los 15 dan presencia en ambos lados. Los 11 nombres viejos dan 0 en el schema.                                             |
| T-168-07  | Mitigada. El diff del Task 2 son 11 líneas agregadas y **cero eliminadas** — ninguna de las 11 declaraciones M8 se tocó. `refresh_tokens.token_hash` sigue siendo unique global de una sola columna, así que el lookup pre-scope del refresh sigue intacto. |
| T-168-08  | Mitigada. Las 7 columnas que perdieron el `.unique()` inline conservan `notNull()` y largo original, verificado por grep sobre la declaración de cada una. `npx tsc --noEmit` salió 0 después de los dos tasks.                                             |
| T-168-09  | Aceptada, como estaba previsto. Los comentarios describen la categoría del motivo (secreto random, id externo) — ni un valor, ni un algoritmo de generación, ni un largo de entropía.                                                                       |
| T-168-SC  | Mitigada. Cero instalaciones de paquetes. `node_modules` del worktree sigue siendo el symlink al 167 que dejó el plan 01.                                                                                                                                   |

## Verification

- `npx tsc --noEmit` en `el-templo-api`: **exit 0** (corrido después de cada task).
- Prettier `--check` sobre los 12 schema files: **All matched files use Prettier code style** (el hook de husky NO corre en el worktree — `core.hooksPath` apunta a `.husky/_`, que solo existe en el checkout principal — así que el formato se validó a mano con el prettier del `node_modules` symlinkeado).
- 15 nombres nuevos presentes en schema Y en la 0196. 11 nombres viejos ausentes del schema.
- 11 comentarios M8 en 6 archivos, con las 11 declaraciones intactas.
- Tests: **no se corrieron** — regla del repo, la suite corre en CI. Los tests de introspección de esta fase son del plan 168-04.

## Known Stubs

Ninguno en el código. Una sola referencia hacia adelante, documentada arriba: `TENANT_GLOBAL_UNIQUES` (lo crea 168-03).

## Notas para el plan siguiente (168-03)

- **El export tiene que llamarse `TENANT_GLOBAL_UNIQUES`** y vivir en `src/db/tenant-tables.ts`: los 11 comentarios M8 del schema ya lo nombran así.
- Los pares `(tabla, índice)` de la lista M8, tal como quedaron anotados en el schema: `users.gympass_id`, `branches.wellhub_gym_id`, `wellhub_classes.idx_wellhub_classes_class_id`, `wellhub_slots.idx_wellhub_slots_slot_id`, `wellhub_bookings.idx_wellhub_bookings_number`, `wellhub_events.idx_wellhub_events_event_id`, `refresh_tokens.token_hash`, `device_tokens.token`, `tv_devices.token_hash`, `tv_pairings.user_code`, `tv_pairings.device_code_hash`. Ojo: las cuatro de `wellhub_*` y las de `users`/`branches` tienen nombre FÍSICO de índice distinto del nombre de columna — el `.unique()` inline de Drizzle genera `<tabla>_<columna>_unique`, y eso es lo que ve `INFORMATION_SCHEMA`.
- `idx_wellhub_classes_branch_activity` e `idx_wellhub_slots_schedule_date` van en la categoría "derivada de FK scopeada", no en M8.
- La base local ya tiene la 0196 aplicada desde 168-01: `pnpm db:migrate` es no-op.
- El `.sql` ya está commiteado — 168-06 solo tiene que hacer el rollout, no el commit.

## Self-Check

- `el-templo-api/src/db/migrations/0196_tenant_unique_contracts.sql` — FOUND (ahora tracked)
- `el-templo-api/src/db/schema/users.ts` — FOUND
- `el-templo-api/src/db/schema/promo-plans.ts` — FOUND
- `el-templo-api/src/db/schema/notifications.ts` — FOUND
- `el-templo-api/src/db/schema/tv.ts` — FOUND
- Commit `ec835050` — FOUND
- Commit `5d5c0bc7` — FOUND
- Checkout principal en `fix/referral-preview-y-refresh-ficha` con su working tree ajeno intacto — VERIFICADO

## Self-Check: PASSED
