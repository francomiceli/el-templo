---
phase: 167-columnas-tenant-id-en-las-85-tablas-restantes-verificaci-n
plan: 05
subsystem: database
tags:
  [
    drizzle,
    mysql,
    multi-tenancy,
    migrations,
    saas,
    aura,
    programs,
    marketing,
    tv,
  ]

# Dependency graph
requires:
  - "167-01 (worktree et-167-columnas, numeracion 0192-0195 reservada, helper tenantIdColumn(), clasificacion GYM_OWNED_TABLES)"
  - "167-02 (tanda C1: 27 tablas del core operativo + migracion 0192, patron SQL canonico con DEFAULT desde el ADD COLUMN)"
  - "167-03 (tanda C2: 16 tablas de comunicacion/crecimiento + migracion 0193)"
  - "167-04 (tanda C3: 22 tablas del motor SPOM + migracion 0194)"
  - "166-01/166-02 (tabla tenants con El Templo id=1 + anclas users/branches)"
provides:
  - "tenant_id NOT NULL DEFAULT 1 + FK a tenants en las 20 tablas restantes de modulos Templo (AURA, wellness, programs, marketing y TV), en schema Drizzle y en la DB local"
  - "Migracion 0195_tenant_id_templo_rest.sql: 80 statements, mismo ciclo de 4 pasos por tabla que la 0192/0193/0194"
  - "CIERRE DE LA TANDA C: las 85 tablas declaradas + las 2 anclas = 87 columnas tenant_id NOT NULL DEFAULT 1 y 88 FKs hacia tenants en la DB local"
  - "Mina M7 anotada en tv.ts (tv_pairings es pre-tenant por diseno) y mina M9 anotada en blog-tags.ts (post_id/tag_id son FKs logicas sin constraint)"
  - "Verificacion de conjunto contra GYM_OWNED_TABLES con diferencia vacia en las dos direcciones, y assert explicito de que system_settings y labs_inquiries NO tienen la columna"
affects:
  - "167-06 (verificacion de las 87 tablas: el 100% ya cumple en local — el script solo tiene que probarlo de forma reproducible, y NO debe usar GROUP_CONCAT)"
  - "167-07 (medicion de volumen real en prod antes del rollout: este grupo es liviano en local, 240 filas)"
  - "168 (CON-02: los uniques globales de blog_posts/blog_tags/gladius_products, aura_config.source_type y tv_devices.token_hash ya tienen la columna que necesitan para volverse compuestas — los dos codigos de tv_pairings quedan GLOBALES para siempre por la lista M8)"
  - "169 (CON-04: el claim del TV tiene que estampar tenant_id con el scope del staff, y el sentinel necesita la exencion /* tenant-safe: pairing pre-claim */)"
  - "175 (los formularios publicos del sitio institucional derivan el tenant por host, hoy resuelven por DEFAULT 1)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verificacion de conjunto en las DOS direcciones (DB -> lista canonica y lista canonica -> DB) en vez de comparar solo conteos: un conteo igual puede esconder una tabla de mas y una de menos"
    - "El predicado correcto para 'tabla con columna de tenancy denormalizada' es `tenant_id NOT NULL DEFAULT 1`, no `existe la columna tenant_id` — tenant_settings tiene la columna sin default porque es la PK logica de la fila, no una denormalizacion"
    - "Prueba empirica de compatibilidad sobre la superficie que el threat model senala (aca tv_pairings, por T-167-22), verificando ademas que la forma pre-claim se conserva (branch_id sigue NULL)"

key-files:
  created:
    - el-templo-api/src/db/migrations/0195_tenant_id_templo_rest.sql
  modified:
    - el-templo-api/src/db/schema/aura-balances.ts
    - el-templo-api/src/db/schema/aura-transactions.ts
    - el-templo-api/src/db/schema/aura-config.ts
    - el-templo-api/src/db/schema/check-in-responses.ts
    - el-templo-api/src/db/schema/onboarding-analytics.ts
    - el-templo-api/src/db/schema/micro-programs.ts
    - el-templo-api/src/db/schema/program-enrollments.ts
    - el-templo-api/src/db/schema/plan-programs.ts
    - el-templo-api/src/db/schema/blog-posts.ts
    - el-templo-api/src/db/schema/blog-tags.ts
    - el-templo-api/src/db/schema/academy-inquiries.ts
    - el-templo-api/src/db/schema/app-waitlist.ts
    - el-templo-api/src/db/schema/franchise-applications.ts
    - el-templo-api/src/db/schema/gladius-products.ts
    - el-templo-api/src/db/schema/gladius-inquiries.ts
    - el-templo-api/src/db/schema/tv.ts

key-decisions:
  - "El criterio (d) del plan ('el set de tablas con columna tenant_id coincide con GYM_OWNED_TABLES') se verifico con el predicado NOT NULL DEFAULT 1, no con la mera existencia de la columna: `tenant_settings` tambien tiene una columna tenant_id (NOT NULL, SIN default) y es una tabla EXENTA. El propio plan lo anticipa en su criterio (b), donde las 88 FKs son 87 + fk_tenant_settings_tenant. Con el predicado correcto la diferencia es vacia en las dos direcciones (87 = 87)"
  - "El criterio de aceptacion `SELECT COUNT(*) FROM _migrations WHERE name LIKE '019[2-5]%'` devuelve 0 en MySQL: LIKE no soporta clases de caracteres. Se uso `REGEXP '^019[2-5]'`, que devuelve el 4 esperado. El literal del plan habria dado un falso negativo silencioso"
  - "El insert de prueba se hizo en DOS tablas: app_waitlist (formulario publico, T-167-23) y tv_pairings (la superficie pre-tenant que senala T-167-22). Probar solo un formulario habria dejado sin ejercitar la mina M7"
  - "El comentario de la mina M7 NO cita los nombres de las columnas unique de tv_pairings ni la palabra que los criterios grepean: el criterio de aceptacion es que el diff no toque ninguna linea con `uniqueIndex(`, `unique(` ni `slug`, y un comentario que las nombrara habria aparecido en ese grep. Misma trampa que documentaron 167-01 y 167-04"

patterns-established:
  - "Cuando un criterio de aceptacion escrito en el plan es sintacticamente valido pero semanticamente incorrecto (LIKE con clase de caracteres), se corrige el criterio y se deja escrito: un `0` que parece un fallo y un `0` que es un bug de la query se ven identicos en la salida"

# COL-01: las 85 tablas de la tanda C ya tienen la columna en local. Lo verifica
# de forma reproducible el plan 167-06 y lo lleva a prod el 167-07.
requirements-completed: []
requirements-progressed: [COL-01]

# Metrics
duration: ~10min
completed: 2026-07-27
---

# Phase 167 Plan 05: tenant_id en AURA, programs, marketing y TV (tanda C4) Summary

**Las 20 tablas restantes de módulos Templo reciben `tenant_id INT NOT NULL DEFAULT 1` con FK nombrada a `tenants`, y con eso se cierra la tanda C: la DB local tiene exactamente las 87 tablas gym-owned con la columna denormalizada y 88 FKs hacia `tenants`, el conjunto coincide byte a byte con `GYM_OWNED_TABLES` en las dos direcciones, y las 2 exclusiones de diseño (`system_settings`, `labs_inquiries`) siguen sin la columna — con `tv_pairings` conservando su forma pre-claim (`branch_id` NULL) verificada empíricamente.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2
- **Files:** 1 creado (la migración), 16 modificados (schemas, que declaran 20 tablas)
- **Commits:** 1 de código (worktree, `935e3a91`) + 1 de planning (checkout principal)

## Task 1 — los 16 schemas Drizzle (20 tablas)

Misma edición de 3 líneas por tabla que las tandas C1/C2/C3 (import una vez por archivo + comentario + columna), pero acá **tres archivos declaran más de una tabla**:

```ts
import { tenantIdColumn } from "./tenant-column";
// ...
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
```

| Subgrupo              | Tablas                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AURA (3)              | aura_balances, aura_transactions, aura_config                                                                                                                  |
| Wellness/onboarding   | check_in_responses, onboarding_analytics                                                                                                                       |
| Programs (4)          | programs, program_content_blocks (ambas en `micro-programs.ts`), program_enrollments, plan_programs                                                            |
| Marketing y marca (8) | blog_posts, blog_tags + blog_post_tags (ambas en `blog-tags.ts`), academy_inquiries, app_waitlist, franchise_applications, gladius_products, gladius_inquiries |
| TV de sucursal (3)    | tv_devices, tv_pairings, tv_class_state (las tres en `tv.ts`)                                                                                                  |

Ningún índice, ninguna relación a `tenants`, ningún reordenamiento de columnas. El diff son **264 inserciones y 0 deleciones**, y no toca **ninguna** línea con `uniqueIndex(`, `unique(` ni `slug`.

### Las dos minas quedaron escritas en el código

- **`tv_pairings` (M7):** que la tabla es pre-tenant por diseño porque la fila nace cuando un televisor sin dueño muestra su código (`branch_id` NULL hasta el claim), que sus dos códigos quedan **globales a propósito y para siempre** (lista M8 aprobada) porque el claim tiene que resolverlos sin scope, que la columna entra igual con DEFAULT 1, y que el estampado en el claim (CON-04) y la exención `/* tenant-safe: pairing pre-claim */` del sentinel los agregan las fases 169/170.
- **`blog_post_tags` (M9):** que `post_id` / `tag_id` apuntan a `blog_posts` y `blog_tags` **sin constraint de FK real**, así que la DB no puede garantizar que las tres filas compartan tenant, y que esa arista la verifica `verify-tenant-backfill.ts` con joins manuales en el plan 167-06.

### `tv.ts` no tenía conflicto con el worktree `et-164-tv`

El plan instruía detenerse ante cualquier diferencia inesperada. Se verificó **antes de editar**: `git diff origin/master -- src/db/schema/tv.ts` da vacío. El archivo en el worktree es idéntico al de `origin/master`, así que no hubo nada que resolver (T-167-24 sin materializar).

### La trampa del `$inferSelect`: había un candidato, y era inofensivo

`grep -rn '\$inferSelect' src/` da 11 líneas y una toca este grupo: `src/modules/franchise/service.ts:36`, `FranchiseApplication = typeof franchiseApplications.$inferSelect`. Siguiendo la lección del 167-04 se revisaron los **llamadores**, no solo el grep: los tres productores del tipo (`listApplications`, `getApplication` y los dos métodos que re-fetchean vía `getApplication`) alimentan el valor desde un `.select()` **completo**, no desde una proyección explícita, así que el tipo se ensancha de los dos lados a la vez. `npx tsc --noEmit` salió limpio de una — no hizo falta el fix de proyección que el 167-02 necesitó en `BalanceService`.

## Task 2 — migración 0195

`0195_tenant_id_templo_rest.sql`, hand-written, **80 statements** = 20 tablas × 4 pasos, en orden alfabético, copiando el patrón de la 0192/0193/0194 (no el de la 0191):

```sql
ALTER TABLE <t> ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE <t> SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE <t> MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE <t> ADD CONSTRAINT fk_<t>_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
```

El header especializa el argumento de WR-01 a este grupo: acá los escritores concurrentes durante el rolling deploy son **públicos y anónimos** — los formularios del sitio institucional (`academy_inquiries`, `app_waitlist`, `franchise_applications`, `gladius_inquiries`) insertan sin ninguna noción de tenant, y el TV hace pairing y poll sin sesión de staff (T-167-23). También documenta que con este archivo se completan las 85 tablas de la tanda C, que las 2 exentas siguen sin la columna a propósito, la mina M7, la mina M9, que `plan_programs` es un acople core->Templo, la lista de uniques que NO se tocan y la nota de idempotencia.

### Gate estático con el parser REAL antes de tocar la DB

El archivo se pasó por `splitSqlStatements()` **importado del propio runner**: **80 statements, 0 malformados**, 20 tablas distintas, **todas presentes en `GYM_OWNED_TABLES`**, constraint más largo `fk_franchise_applications_tenant` (32 chars, límite 64). Ninguna línea contiene `--` y `;` a la vez.

### Aplicación local

`pnpm db:migrate` → `Applying: 0195_tenant_id_templo_rest.sql (80 statements)` / `Applied successfully`, **sin una sola línea `Skipped`**: los 80 statements ejecutaron limpios de verdad, no por la heurística `alreadyApplied`. No hizo falta el procedimiento de recuperación de falla parcial.

## Verificación

| Check                                                                             | Esperado    | Resultado                                             |
| --------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------- |
| `npx tsc --noEmit`                                                                | limpio      | limpio (a la primera, sin fixes)                      |
| `grep -rho 'tenantIdColumn()' src/db/schema/ --exclude=tenant-column.ts \| wc -l` | 85          | **85** (27 + 16 + 22 + 20). Crudo da 87 (ver abajo)   |
| `grep -c 'tenantIdColumn()'` en tv.ts / micro-programs.ts / blog-tags.ts          | 3 / 2 / 2   | **3 / 2 / 2**                                         |
| Ocurrencias en los otros 13 archivos                                              | 1 cada uno  | **1** en los 13 (`sort -u` devuelve una sola línea)   |
| `git diff --name-only`                                                            | 16 rutas    | exactamente los 16 schemas, ninguna otra              |
| `grep -c 'M7' tv.ts` / `grep -c 'M9' blog-tags.ts`                                | >= 1        | **1 / 1**                                             |
| Líneas del diff con `uniqueIndex(`, `unique(` o `slug`                            | 0           | **0**                                                 |
| `: any` en las líneas agregadas                                                   | 0           | **0**                                                 |
| Deleciones en el diff de los 16 schemas                                           | 0           | **0** (`--numstat` da `N 0` en los 16)                |
| `tv.ts` vs `origin/master` ANTES de editar                                        | sin diff    | **sin diff** (no hay conflicto con `et-164-tv`)       |
| Líneas del `.sql` con `--` y `;` a la vez                                         | 0           | **0**                                                 |
| `ADD COLUMN tenant_id INT NULL DEFAULT 1` (sin comentarios)                       | 20          | **20**                                                |
| `UPDATE <t> SET tenant_id = 1 WHERE tenant_id IS NULL`                            | 20          | **20**                                                |
| `MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1`                                  | 20          | **20**                                                |
| `REFERENCES tenants(id)`                                                          | 20          | **20**                                                |
| `AFTER ` (case-insensitive, sin comentarios)                                      | 0           | **0**                                                 |
| Statements según el parser real del runner                                        | 80          | **80, 0 malformados**                                 |
| Tablas del `.sql` ausentes de `GYM_OWNED_TABLES`                                  | 0           | **0**                                                 |
| Constraint más largo                                                              | <= 64 chars | 32 (`fk_franchise_applications_tenant`)               |
| Constraints que NO siguen `fk_<tabla>_tenant` (toda la base)                      | 0           | **0**                                                 |
| **`cols_87`** (NOT NULL + DEFAULT '1', toda la base local)                        | **87**      | **87** (67 antes + 20)                                |
| **`fks_88`** (FKs hacia `tenants`, toda la base local)                            | **88**      | **88** (68 antes + 20)                                |
| **`exentas_0`** (`system_settings` / `labs_inquiries` con la columna)             | **0**       | **0** — criterio de éxito 1 de la fase                |
| Las 20 de este grupo: NOT NULL / DEFAULT '1' / `int`                              | 20          | **20**                                                |
| FKs a `tenants` de las 20 de este grupo                                           | 20          | **20**                                                |
| **Conjunto DB vs `GYM_OWNED_TABLES`**                                             | diff vacía  | **vacía en las dos direcciones, 87 = 87** (ver abajo) |
| Filas con `tenant_id <> 1 OR IS NULL`, **medido tabla por tabla en las 87**       | 0           | **0**, sobre 26.519 filas                             |
| Insert en `app_waitlist` SIN `tenant_id`                                          | queda en 1  | `tenant_id = 1`, fila borrada (vuelve a 1)            |
| Insert en `tv_pairings` SIN `tenant_id`                                           | queda en 1  | `tenant_id = 1` y `branch_id` **NULL**, fila borrada  |
| Segunda corrida de `pnpm db:migrate`                                              | sin cambios | `No new migrations to apply`, 87/88 intactos          |
| `_migrations` con `name REGEXP '^019[2-5]'`                                       | 4           | **4** (0192, 0193, 0194, 0195)                        |
| `npx vitest run test/db/tenant-tables.test.ts`                                    | verde       | **5/5** en 100 s                                      |
| DB de test provisionada de cero (`eltemplo_test_1`)                               | 87 / 88 / 0 | **87 columnas / 88 FKs / 0 exentas**                  |
| `npx prettier --check` sobre los 16 archivos                                      | limpio      | "All matched files use Prettier code style!"          |
| `git status --porcelain` del worktree post-commit                                 | vacío       | vacío                                                 |
| `git show --stat HEAD`                                                            | 17 archivos | **17 archivos, 264 inserciones, 0 deleciones**        |

**El backstop del parser se ejercitó de nuevo:** `test/setup.ts` (`provisionWorkerDB`) aplica las migraciones desde cero con el MISMO `splitSqlStatements()` que producción. La base `eltemplo_test_1` quedó con **87 columnas / 88 FKs / 0 exentas**, idéntica a la de desarrollo — o sea que el archivo de 80 statements parsea bien también por el camino de CI.

**Volumen local del grupo: 240 filas** — dos órdenes de magnitud menos que la tanda C3 (23.671). Es el grupo más liviano de la fase: en desarrollo casi ninguna tabla de marketing/AURA/TV tiene datos. **Eso NO dice nada del volumen en producción**, donde `aura_transactions` y `check_in_responses` crecen por socio y por día. La medición de volumen real antes del rollout sigue siendo el plan 167-07 (mitigación T-167-10).

### Los 16 archivos ya cumplían prettier ANTES de tocarlos

Se verificó el baseline contra `HEAD` antes del primer edit: los 16 daban "All matched files use Prettier code style!". A diferencia de la tanda C3 (10 archivos con comillas simples), **este grupo no tenía deuda de formato**, así que no hizo falta la verificación por equivalencia y `prettier --check` pasa directo después de los edits. El `.sql` no necesita prettier: el `lint-staged` de la raíz solo matchea `**/*.{ts,vue,js,json,md}`.

## Deviations from Plan

### Aclaraciones sobre criterios del plan (no son cambios de comportamiento)

**1. `LIKE '019[2-5]%'` devuelve 0 en MySQL — el criterio se verificó con `REGEXP`**

El criterio de aceptación pide `SELECT COUNT(*) FROM _migrations WHERE name LIKE '019[2-5]%'` = `4`. Corrido literalmente devuelve **`0`**: **MySQL `LIKE` no soporta clases de caracteres** (`[2-5]` se interpreta como los caracteres literales `[`, `2`, `-`, `5`, `]`). No es que falten migraciones — es que la query no puede matchear nada nunca.

Se re-corrió con `name REGEXP '^019[2-5]'` → **`4`**, y se listaron los nombres para no confiar solo en el conteo: `0192_tenant_id_core_ops.sql`, `0193_tenant_id_core_comms.sql`, `0194_tenant_id_templo_spom.sql`, `0195_tenant_id_templo_rest.sql`. Vale la pena dejarlo escrito porque **un falso negativo de este tipo es indistinguible de un fallo real** mirando solo la salida: en los dos casos se lee `0`.

**2. El conjunto se comparó con el predicado `NOT NULL DEFAULT 1`, no con la mera existencia de la columna**

El criterio (d) pide que "el set de tablas con columna `tenant_id` coincida EXACTAMENTE con `GYM_OWNED_TABLES`". Tomado al pie de la letra **no se cumple, y no puede cumplirse**: hay **88** tablas con una columna llamada `tenant_id`, y la de más es **`tenant_settings`** — que está en `TENANT_EXEMPT_TABLES`.

No es un error de la migración ni de la clasificación. `tenant_settings` es la tabla de configuración por tenant de la fase 166: su `tenant_id` es `NOT NULL` pero **sin DEFAULT** (`COLUMN_DEFAULT` es NULL) porque es la clave lógica de la fila, no una denormalización — una fila de settings tiene que nombrar su tenant explícitamente, jamás caer a 1 por default. El propio plan lo anticipa en su criterio (b), donde las **88** FKs son "87 + `fk_tenant_settings_tenant`".

Con el predicado correcto — `IS_NULLABLE='NO' AND COLUMN_DEFAULT='1' AND DATA_TYPE='int'`, que es exactamente lo que significa "tabla con la columna de tenancy denormalizada" — la comparación da:

```
db_count: 87 canon_count: 87
EN DB PERO NO EN GYM_OWNED_TABLES: []
EN GYM_OWNED_TABLES PERO NO EN DB: []
IDENTICOS: true
```

**Diferencia vacía en las dos direcciones.** La comparación se hizo iterando en TypeScript sobre las dos listas ordenadas, no con `GROUP_CONCAT` (hallazgo del 167-04).

**3. El insert de prueba se hizo en dos tablas, no en una**

El plan pedía una sola prueba (`app_waitlist` o `academy_inquiries`). Se hicieron **dos**: `app_waitlist` (el formulario público que pedía el plan, T-167-23) y **`tv_pairings`**, que es la superficie que el `<threat_model>` señala en T-167-22 y la mina M7 de este plan. Ambas quedaron en `tenant_id = 1` insertando sin la columna, y en `tv_pairings` se verificó además que **`branch_id` sigue NULL**: la forma pre-claim se conserva, que es justamente lo que la mina M7 pide no romper. Las dos filas se borraron (`app_waitlist` vuelve a 1, `tv_pairings` a 0).

**4. El grep de `tenantIdColumn()` necesita `--exclude=tenant-column.ts`, como avisaron el 167-03 y el 167-04**

El criterio pide `85`. Crudo da **`87`**: el helper vive dentro de `src/db/schema/` y aporta 2 ocurrencias propias (el ejemplo del JSDoc y la declaración). Con `--exclude=tenant-column.ts` da **85**, confirmado. La coincidencia numérica entre "87 crudo" y "87 tablas gym-owned" es **casualidad** y no debe leerse como confirmación de nada.

### Observaciones operativas (no son desviaciones)

- **Task 1 no tiene commit propio a propósito.** Hard Rule 3 del skill `el-templo-db-migrations` exige que el `.sql` viaje en el mismo commit que el cambio de schema. Un único commit `935e3a91` cubre los dos tasks.
- **El comentario de la mina M7 no nombra las columnas unique de `tv_pairings`.** El criterio de aceptación es que el diff no toque ninguna línea con `uniqueIndex(`, `unique(` ni `slug`, y ese grep corre sobre las líneas del diff — un comentario que las citara habría aparecido ahí y roto el criterio que él mismo documenta. Es la misma trampa que ya documentaron el 167-01 (helper) y el 167-04 (CHECK de `spom_config`). El contenido que el plan exige explicar quedó completo, expresado en prosa.
- **El checkout principal no se tocó para código.** Todos los edits de código fueron bajo `/home/franco/projects/et-167-columnas` (rama `feat/167-tenant-columns`, verificada como no protegida antes de commitear). El checkout principal no tiene ninguna entrada bajo `db/schema` en `git status`, y las 2 entradas bajo `db/migrations` que aparecen (`0101_...`, `0102_...`) son WIP preexistente de otra sesión, ajeno a esta fase.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. No se agregó ni modificó ningún endpoint, ninguna ruta de auth ni ningún esquema de request: `tenant_id` no aparece en ninguna superficie de entrada. Las disposiciones del registro se cumplieron como estaban escritas — T-167-22 (`accept`) verificado por el insert en `tv_pairings` que conserva `branch_id` NULL, T-167-23 (`mitigate`) por el insert en `app_waitlist`, T-167-24 (`mitigate`) por el diff vacío de `tv.ts` contra `origin/master` antes de editar, T-167-25 (`mitigate`) por la comparación de conjuntos en las dos direcciones, T-167-26 (`mitigate`) por el assert `exentas_0`, y T-167-SC (`mitigate`) sin paquetes nuevos.

## Next Phase Readiness

El plan 167-06 arranca sin bloqueos:

- Worktree `/home/franco/projects/et-167-columnas` (rama `feat/167-tenant-columns`), HEAD `935e3a91`, working tree limpio.
- **La tanda C está COMPLETA en local:** 87 columnas `tenant_id NOT NULL DEFAULT 1`, 88 FKs hacia `tenants`, 0 filas mal backfilleadas sobre 26.519, conjunto idéntico a `GYM_OWNED_TABLES` y las 2 exentas sin la columna. El 167-06 no tiene que **arreglar** nada: tiene que volver eso **reproducible y ejecutable en cualquier base** (local, test, staging, prod).
- `_migrations` local tiene 0190-0195. **El próximo número libre es 0196**, y hay que re-verificarlo contra las 4 fuentes (el 167-01 solo reservó hasta 0195).
- Trampas vigentes para el script de verificación del 167-06:
  - **No armar la query con `GROUP_CONCAT`** (trunca a 1024 chars y devuelve resultados inventados sin error — hallazgo del 167-04). Iterar en TypeScript, que es lo que se hizo acá sobre las 87 tablas.
  - **No usar `LIKE` con clases de caracteres** en MySQL (hallazgo de este plan): devuelve 0 en silencio.
  - **El predicado de "tabla tenant-aware" es `NOT NULL DEFAULT 1`**, no "existe la columna `tenant_id`" — si no, `tenant_settings` entra como falso positivo y la comparación contra `GYM_OWNED_TABLES` da 88 vs 87.
  - El grep de `tenantIdColumn()` incluye 2 ocurrencias del propio helper (`--exclude=tenant-column.ts`).
  - `npx prettier --check` a mano antes de cada commit (no hay hook en el worktree) y nunca `git add -A`.
- La mina M9 (`blog_post_tags.post_id` / `.tag_id`) y la del 167-04 (`session_prescriptions.exercise_id`) son las dos aristas sin FK real que el script del 167-06 tiene que cubrir con joins manuales.

## Self-Check: PASSED

- `el-templo-api/src/db/migrations/0195_tenant_id_templo_rest.sql` existe en el worktree y está en el commit.
- Los 16 `.ts` de schema declarados existen y están en el commit.
- El commit `935e3a91` está en el historial de `feat/167-tenant-columns` con 17 archivos, 264 inserciones y 0 deleciones.
- Este SUMMARY existe en el checkout principal.
