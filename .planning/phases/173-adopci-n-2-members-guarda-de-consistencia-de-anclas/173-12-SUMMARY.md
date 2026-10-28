---
phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
plan: 12
subsystem: database
tags: [drizzle, mysql, foreign-key, tenancy, migrations]

# Dependency graph
requires:
  - phase: 173-11
    provides: "resolvedor único de sede validada por gimnasio (branch-consistency.ts) — capa 1 (app) del invariante ADO-07"
provides:
  - "unique compuesta (tenant_id, id) en branches"
  - "FK compuesta fk_users_tenant_branch (tenant_id, branch_id) -> branches(tenant_id, id), ON DELETE/UPDATE RESTRICT"
  - "migración 0200_anclas_tenant_branch.sql aplicada en la base local de desarrollo y de test"
  - "test/db/anclas-fk-compuesta.test.ts probando el rechazo contra la base viva"
affects: [173-13, 174, 175, "cualquier plan futuro que escriba users.branch_id"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FK compuesta MySQL vía foreignKey({ columns, foreignColumns }).onDelete().onUpdate() de drizzle-orm/mysql-core, en vez de dos .references() simples"
    - "capa 2 (DB) del invariante ADO-07: la capa 1 (helper de app, 173-11) protege caminos que pasan por la aplicación; la FK compuesta protege SQL crudo, scripts y backfills"

key-files:
  created:
    - el-templo-api/src/db/migrations/0200_anclas_tenant_branch.sql
    - el-templo-api/test/db/anclas-fk-compuesta.test.ts
  modified:
    - el-templo-api/src/db/schema/branches.ts
    - el-templo-api/src/db/schema/users.ts

key-decisions:
  - "Migración en un solo archivo (0200) con dos ALTER en orden obligatorio (unique de branches antes que FK de users), no dos migraciones separadas — son las dos mitades de un solo cambio semántico"
  - "La FK simple preexistente users_branch_id_branches_id_fk NO se borra: queda conviviendo con la compuesta (redundante pero inofensiva) y sigue siendo la arista que src/db/scripts/verify-tenant-backfill.ts usa para medir la divergencia de anclas hoy (la FK compuesta queda fuera de ese chequeo automatizado por ser multi-columna)"
  - "ON DELETE RESTRICT / ON UPDATE RESTRICT — el default seguro; un CASCADE sobre tenant_id borraría en cascada todos los usuarios de un gimnasio"
  - "Verificación de 0 divergencias antes del ALTER reusa el script existente src/db/scripts/verify-tenant-backfill.ts (arista users.branch_id -> branches.id en su reporte fkMismatches) en vez de escribir un script nuevo — ya hace exactamente esa consulta"

patterns-established:
  - "Documentar en el schema Drizzle y en el .sql el porqué de MATCH SIMPLE (semántica no configurable de MySQL para FKs compuestas) incluso cuando una constraint distinta (NOT NULL) hace esa rama inalcanzable hoy — deja escrita la garantía para el día en que esa invariante cambie"

requirements-completed: [ADO-07]

# Metrics
duration: ~35min
completed: 2026-08-08
---

# Phase 173 Plan 12: Guarda de consistencia de anclas — FK compuesta (tenant_id, branch_id) Summary

**FK compuesta `fk_users_tenant_branch` en `users(tenant_id, branch_id) -> branches(tenant_id, id)` (migración 0200), probada contra la base viva con dos gimnasios: la mina M10 ya no es una fila posible en esta base de datos.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2/2 completados
- **Files modified:** 4 (2 schema, 1 migración nueva, 1 test nuevo)

## Accomplishments

- `branches` tiene ahora `uniqueIndex uq_branches_tenant_id_id (tenant_id, id)`, el destino que la FK compuesta necesita.
- `users` tiene la FK compuesta `fk_users_tenant_branch (tenant_id, branch_id) -> branches(tenant_id, id)` con `ON DELETE RESTRICT` / `ON UPDATE RESTRICT`, aplicada y verificada contra la base MySQL viva (no solo contra los tipos de TypeScript).
- `test/db/anclas-fk-compuesta.test.ts` prueba con dos gimnasios (`TENANT_DOS = 90671` vs `TENANT_TEMPLO = 1`, mismo país AR) que: (a) un usuario apuntando a una sede propia pasa, (b) apuntar a una sede de otro gimnasio es rechazado por la FK (motivo afirmado por `errno`/`code` en la cadena de `cause`, no "falló por lo que sea"), y (c) el caso `branch_id NULL` — documentado con la desviación de abajo.

## Task Commits

Cada task se commiteó atómicamente en el worktree `/home/franco/projects/et-173` (rama `feat/173-adopcion-members`):

1. **Task 1: Verificar 0 divergencias y escribir el schema + la migración 0200** - `9f7bd368` (feat)
2. **Task 2: [BLOCKING] Aplicar la migración con pnpm db:migrate y probar que la base rechaza** - `a0635226` (feat)

_Sin plan metadata commit en el worktree: por instrucción explícita, este SUMMARY se escribe en el checkout principal y STATE.md no se toca desde acá._

## Files Created/Modified

- `el-templo-api/src/db/schema/branches.ts` — `uniqueIndex("uq_branches_tenant_id_id").on(table.tenantId, table.id)`, junto a los índices existentes.
- `el-templo-api/src/db/schema/users.ts` — import de `foreignKey`; `index("idx_users_tenant_id_branch_id")` + `foreignKey({ name: "fk_users_tenant_branch", columns: [tenantId, branchId], foreignColumns: [branches.tenantId, branches.id] }).onDelete("restrict").onUpdate("restrict")`.
- `el-templo-api/src/db/migrations/0200_anclas_tenant_branch.sql` — hand-written, prosa QUÉ ARREGLA/POR QUÉ/ALCANCE, orden obligatorio (unique de `branches` antes que FK de `users`), sin `;` en comentarios.
- `el-templo-api/test/db/anclas-fk-compuesta.test.ts` — 3 tests contra la base viva con `seedSecondTenant`/`limpiarSegundoGimnasio`.

## Verificación de 0 divergencias (D-18)

Consulta (la misma que ya corre `pnpm exec tsx src/db/scripts/verify-tenant-backfill.ts` en su reporte `fkMismatches`, arista `users.branch_id -> branches.id`):

```sql
SELECT COUNT(*) AS divergencias
  FROM users u
  JOIN branches b ON b.id = u.branch_id
 WHERE u.tenant_id <> b.tenant_id
```

Medido en la base de desarrollo local (`eltemplo`) antes del ALTER: **0 divergencias** (confirmado también corriendo `verify-tenant-backfill.ts`, sección "Aristas de FK con tenant inconsistente (fkMismatches): 0"). Es lo esperado hoy — todo el sistema es gimnasio 1 — y la consulta queda documentada en la cabecera del `.sql` para el día del segundo gimnasio.

## Verificación contra la base viva (Task 2, [BLOCKING])

`pnpm db:migrate` corrido en el worktree, exit code 0:

```
Applying: 0200_anclas_tenant_branch.sql (3 statements)
  Applied successfully
Applied 1 migration(s)
```

Fila en `_migrations`:

```json
[
  {
    "id": 206,
    "name": "0200_anclas_tenant_branch.sql",
    "applied_at": "2026-08-08T07:52:17.000Z"
  }
]
```

`SHOW INDEX FROM branches` — `uq_branches_tenant_id_id` presente (2 columnas, `Non_unique: 0`):

```json
[
  {
    "Key_name": "uq_branches_tenant_id_id",
    "Seq_in_index": 1,
    "Column_name": "tenant_id",
    "Non_unique": 0
  },
  {
    "Key_name": "uq_branches_tenant_id_id",
    "Seq_in_index": 2,
    "Column_name": "id",
    "Non_unique": 0
  }
]
```

`information_schema.REFERENTIAL_CONSTRAINTS` — `fk_users_tenant_branch` presente:

```json
[
  {
    "CONSTRAINT_NAME": "fk_users_tenant_branch",
    "UNIQUE_CONSTRAINT_NAME": "uq_branches_tenant_id_id",
    "MATCH_OPTION": "NONE",
    "UPDATE_RULE": "RESTRICT",
    "DELETE_RULE": "RESTRICT",
    "TABLE_NAME": "users",
    "REFERENCED_TABLE_NAME": "branches"
  }
]
```

No se ejecutó `drizzle-kit migrate` ni `drizzle-kit push` en ningún momento — solo `pnpm db:migrate` (el runner propio `src/db/run-migrations.ts`).

## Comandos y exit codes

| Comando                                                                          | Exit code                                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm exec tsc --noEmit` (Task 1)                                                | 0                                                                |
| `node -e` verificación "sin `;` en comentarios del .sql"                         | 0 (tras el fix, ver Deviations)                                  |
| `grep -c "uq_branches_tenant_id_id" src/db/schema/branches.ts`                   | `1`                                                              |
| `grep -c "fk_users_tenant_branch" src/db/schema/users.ts`                        | `1`                                                              |
| `test -f src/db/migrations/0200_anclas_tenant_branch.sql` (y `0200_*` único)     | 0, único archivo                                                 |
| `pnpm db:migrate`                                                                | 0                                                                |
| `pnpm exec vitest run --no-file-parallelism test/db/anclas-fk-compuesta.test.ts` | 0 (3/3 tests)                                                    |
| `pnpm exec vitest run --no-file-parallelism test/db`                             | 0 (21/21 tests, incluye `tenant-tables.test.ts` 18 + el nuevo 3) |
| `pnpm typecheck:tests` (ratchet)                                                 | 0 discrepancias (185 baseline, 0 nuevos, 0 empeorados)           |
| `pnpm exec tsc --noEmit` (final, tras Task 2)                                    | 0                                                                |

Verificación de orphaned vitest (`pgrep -fa vitest`) corrida antes de cada tanda de tests: ninguna encontrada en ningún momento.

## Decisions Made

- **Un solo archivo de migración, dos ALTER en orden obligatorio** (unique de `branches` primero): son las dos mitades de un solo cambio semántico; no hay ningún escenario de deploy donde convenga aplicar una sin la otra.
- **La FK simple `users_branch_id_branches_id_fk` no se toca.** Queda conviviendo con la compuesta. Motivo dual: (1) borrarla no estaba en el alcance del plan y remover constraints existentes es cirugía adicional no pedida; (2) `src/db/scripts/verify-tenant-backfill.ts` la usa HOY como la arista de FK declarada para medir la divergencia de anclas en su reporte `fkMismatches` — una FK compuesta queda excluida de ese chequeo automatizado (el script la reporta como "FK compuesta no verificada (necesita join multi-columna)"), así que remover la simple habría apagado esa verificación existente sin reemplazo.
- **`ON DELETE RESTRICT` / `ON UPDATE RESTRICT`** — ver justificación en la cabecera del `.sql`: un `CASCADE` sobre `tenant_id` sería un borrado masivo silencioso de todos los usuarios de un gimnasio.
- **La verificación de 0 divergencias reusa `verify-tenant-backfill.ts`** en vez de crear un script nuevo (`src/db/scripts/verify-tenant-backfill.ts` ya corre exactamente esa consulta vía su paso C de aristas de FK declaradas). El plan daba la opción de reusar o escribir nuevo; reusar es más DRY y el script ya corre en CI/deploy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Punto y coma dentro de un comentario del propio .sql, en la línea que explica la regla de "sin `;` en comentarios"**

- **Found during:** Task 1, verificación automatizada del plan (`node -e` que grepea comentarios buscando `;`)
- **Issue:** Al documentar en la cabecera por qué el archivo no puede tener `;` dentro de un comentario, la propia frase explicativa usaba el carácter literal `;`, violando la regla que describía.
- **Fix:** Reescribí esas dos líneas sin el carácter literal (dice "caracter de punto y coma" en vez de usarlo).
- **Files modified:** `el-templo-api/src/db/migrations/0200_anclas_tenant_branch.sql`
- **Verification:** El `node -e` de la verificación automatizada del plan pasa (exit 0, "sin ; en comentarios").
- **Committed in:** `9f7bd368` (Task 1 commit — el archivo se corrigió antes del commit, no hubo un commit adicional)

### Ajustes documentados (no son bugs de código, son desajustes entre el texto del plan y una invariante ya existente del schema)

**2. El caso "branch_id NULL: insertar un usuario sin sede → pasa (MATCH SIMPLE)" no se puede ejecutar tal como lo describe el plan**

- **Found during:** Task 2, al diseñar el tercer caso del test
- **Issue:** El plan asume que `users.branch_id` puede ser `NULL`. Verificado contra `information_schema.COLUMNS` (`IS_NULLABLE = 'NO'`) y contra el propio comentario de `src/db/schema/users.ts` ("Stays NOT NULL for ALL roles (REQ-4)"): la columna es NOT NULL para TODOS los roles, sin excepción, por diseño. Un INSERT con `branch_id: NULL` es rechazado por esa constraint ANTES de que el motor llegue a evaluar la FK compuesta — el escenario "pasa por MATCH SIMPLE" es hoy inalcanzable en la práctica.
- **Resolución:** No se relajó `branch_id` a nullable (sería un cambio arquitectónico fuera de alcance de este plan y contradice REQ-4 y D-08 explícitamente). El tercer test de `anclas-fk-compuesta.test.ts` prueba en cambio la realidad exacta: el INSERT con `branch_id: NULL` es rechazado, el motivo es `ER_BAD_NULL_ERROR`/errno 1048 (NOT NULL), explícitamente NO por la FK (`ER_NO_REFERENCED_ROW_2`/errno 1452) — con un docblock extenso en el propio archivo de test explicando el porqué, para que nadie lo lea como un olvido.
- **Files modified:** `el-templo-api/test/db/anclas-fk-compuesta.test.ts` (docblock de cabecera + tercer `it`); comentario en `el-templo-api/src/db/schema/users.ts` junto a la FK, documentando la semántica MATCH SIMPLE y por qué es hoy inalcanzable.
- **Verification:** El test pasa afirmando ambas cosas: que el rechazo ocurre (`ER_BAD_NULL_ERROR`) y que NO es por la FK compuesta.
- **Impacto:** Ninguno sobre el objetivo del plan — la FK compuesta sigue existiendo, documentada y probada en los otros dos casos (control positivo y rechazo cross-tenant). Este ajuste solo evita afirmar en un test algo que la base de datos no hace.

---

**Total deviations:** 1 auto-fix (Rule 1, cosmético en comentario del .sql) + 1 ajuste documentado (desajuste plan/schema en un caso de test, sin impacto en el objetivo del plan).
**Impact on plan:** Ninguno sobre el criterio de éxito (`Un usuario apuntando a una sede de otro gimnasio deja de ser una fila posible en esta base de datos`) — verificado y probado contra la base viva.

## Issues Encountered

Ninguno más allá de lo documentado en Deviations. La base de datos de desarrollo local (`eltemplo`) tenía 0 filas divergentes antes del ALTER, como se esperaba (todo el sistema es gimnasio 1 hoy).

## User Setup Required

None - no external service configuration required. La migración se aplicó únicamente a la base local de desarrollo/test (`eltemplo` y los `eltemplo_test_N` por worker de vitest). **No se tocó staging ni prod** — eso lo hace el pipeline de deploy en el plan 173-31, según la instrucción explícita de esta ejecución.

## Next Phase Readiness

- La capa 2 (DB) de ADO-07 está completa y probada: junto con la capa 1 (helper de app, 173-11), el invariante `user.tenant_id === branch.tenant_id` queda protegido tanto para caminos de aplicación como para SQL crudo/scripts/backfills.
- `src/db/scripts/verify-tenant-backfill.ts` sigue siendo la herramienta de verificación pre-deploy para la divergencia de anclas (vía la FK simple preexistente, que se mantuvo a propósito).
- Ningún bloqueo para los planes siguientes de la fase 173 (cirugía mínima en los 50 archivos ajenos, batería ISO-03, etc.) — este plan no tocó ningún archivo de `src/modules/`.
- Pendiente (fuera de este plan, dueño 173-30/173-31): correr `verify-tenant-backfill.ts`/la consulta de divergencias contra staging y prod ANTES de que el deploy aplique la migración 0200 ahí.

---

_Phase: 173-adopci-n-2-members-guarda-de-consistencia-de-anclas_
_Completed: 2026-08-08_
