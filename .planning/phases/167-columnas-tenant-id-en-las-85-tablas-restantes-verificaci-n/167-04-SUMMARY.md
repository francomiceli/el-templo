---
phase: 167-columnas-tenant-id-en-las-85-tablas-restantes-verificaci-n
plan: 04
subsystem: database
tags:
  [drizzle, mysql, multi-tenancy, migrations, saas, spom, sessions, exercises]

# Dependency graph
requires:
  - "167-01 (worktree et-167-columnas, numeracion 0192-0195 reservada, helper tenantIdColumn(), clasificacion GYM_OWNED_TABLES)"
  - "167-02 (tanda C1: 27 tablas del core operativo + migracion 0192, patron SQL canonico con DEFAULT desde el ADD COLUMN)"
  - "167-03 (tanda C2: 16 tablas de comunicacion/crecimiento + migracion 0193)"
  - "166-01/166-02 (tabla tenants con El Templo id=1 + anclas users/branches)"
provides:
  - "tenant_id NOT NULL DEFAULT 1 + FK a tenants en las 22 tablas del motor SPOM, en schema Drizzle y en la DB local"
  - "Migracion 0194_tenant_id_templo_spom.sql: 88 statements, mismo ciclo de 4 pasos por tabla que la 0192/0193"
  - "Mina M1 anotada en spom-config.ts (el CHECK de fila unica queda intacto en v6.0) y mina M9 anotada en session-prescriptions.ts (exercise_id es FK logica sin constraint)"
  - "Trampa de verificacion documentada: GROUP_CONCAT trunca a 1024 chars y produce falsos positivos al armar UNIONs sobre muchas tablas"
affects:
  - "167-05 (las 20 tablas restantes de la tanda C: el numero 0195 sigue libre)"
  - "167-06 (verificacion de las 87 tablas: 67 de las 87 ya cumplen — 65 de la tanda C + las 2 anclas; el script NO debe usar GROUP_CONCAT para armar la query)"
  - "168 (CON-02: los uniques globales del motor SPOM — sessions.day_id, formats.name, day_modes.day_of_week, routes.code — ya tienen la columna que necesitan para volverse compuestas)"
  - "170 (ISO: el sentinel de pool ya puede tratar las 22 tablas del motor SPOM como gym-owned)"
  - "176 (MOD: el mecanismo de modulos gobierna el scoping real de estas tablas, que ya tienen la columna)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verificacion de formato por EQUIVALENCIA cuando el archivo ya viola prettier antes de tocarlo: se compara la salida de prettier del archivo en HEAD contra la del archivo editado, y el diff tiene que contener SOLO las lineas agregadas"
    - "Prueba empirica de compatibilidad sobre la superficie que el threat model senala como escritora concurrente (aca sessions, por el generador de T-167-21), no solo sobre la tabla mas comoda"
    - "Gate estatico del .sql corrido con el parser REAL (splitSqlStatements importado del runner) antes de tocar la DB, en vez de confiar en un grep de statements"

key-files:
  created:
    - el-templo-api/src/db/migrations/0194_tenant_id_templo_spom.sql
  modified:
    - el-templo-api/src/db/schema/routes.ts
    - el-templo-api/src/db/schema/spom-rules.ts
    - el-templo-api/src/db/schema/intensity-rules.ts
    - el-templo-api/src/db/schema/contraction-rules.ts
    - el-templo-api/src/db/schema/weekly-rotator.ts
    - el-templo-api/src/db/schema/formats.ts
    - el-templo-api/src/db/schema/format-compatibility.ts
    - el-templo-api/src/db/schema/spom-config.ts
    - el-templo-api/src/db/schema/day-modes.ts
    - el-templo-api/src/db/schema/exercises.ts
    - el-templo-api/src/db/schema/exercise-dimension-proposals.ts
    - el-templo-api/src/db/schema/exercise-milestone-proposals.ts
    - el-templo-api/src/db/schema/exercise-progressions.ts
    - el-templo-api/src/db/schema/exercise-adjustments.ts
    - el-templo-api/src/db/schema/sessions.ts
    - el-templo-api/src/db/schema/session-blocks.ts
    - el-templo-api/src/db/schema/session-prescriptions.ts
    - el-templo-api/src/db/schema/session-traces.ts
    - el-templo-api/src/db/schema/session-edit-logs.ts
    - el-templo-api/src/db/schema/completed-sessions.ts
    - el-templo-api/src/db/schema/saved-blocks.ts
    - el-templo-api/src/db/schema/evaluation-requests.ts

key-decisions:
  - "El comentario de la mina M1 NO nombra el literal `spom_config_single_row`: citarlo rompia el criterio de aceptacion `grep -c 'spom_config_single_row' = 1`, que es justamente el gate de que el CHECK no se toco. Es la misma trampa que el 167-01 documento con el helper"
  - "Los 10 archivos con comillas simples se dejaron con comillas simples (el plan lo pide explicitamente) aunque eso los mantiene fuera del estilo prettier del repo: ya fallaban `prettier --check` ANTES de tocarlos, y reformatearlos habria reescrito las lineas de uniques, violando el criterio de que el diff no toca ninguna unique"
  - "El insert de prueba se hizo en DOS tablas (routes y sessions) en vez de una: `sessions` es la superficie concreta que T-167-21 senala (el generador escribe fuera de un request durante el rolling deploy), asi que probar solo un catalogo SIN-ANCLA habria dejado sin ejercitar el riesgo real"
  - "El `1` que devolvio la primera medicion de filas mal backfilleadas se investigo hasta la causa raiz en vez de asumirlo artefacto: era GROUP_CONCAT truncando a 1024 chars"

patterns-established:
  - "Cuando una verificacion agregada y una desagregada se contradicen, gana la desagregada y la discrepancia se explica hasta la causa raiz antes de seguir — una de las dos mediciones esta rota y hay que saber cual"

# COL-01 sigue Pending: acumulado 65 de las 85 tablas de la tanda C.
# Lo completa 167-05 (20 restantes) y lo verifica 167-06.
requirements-completed: []
requirements-progressed: [COL-01]

# Metrics
duration: ~10min
completed: 2026-07-27
---

# Phase 167 Plan 04: tenant_id en el motor SPOM (tanda C3) Summary

**Las 22 tablas del motor SPOM (reglas y catálogos de la metodología, árbol de ejercicios y sesiones) tienen `tenant_id INT NOT NULL DEFAULT 1` con FK nombrada a `tenants` y el 100% de sus 23.671 filas en 1, con el singleton duro `spom_config` conservando su CHECK de fila única (mina M1) y sin que el diff toque un solo unique global — la deuda de `sessions.day_id`, `formats.name`, `day_modes.day_of_week` y `routes.code` queda intacta y explícita para la fase 168.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2
- **Files:** 1 creado (la migración), 22 modificados (schemas)
- **Commits:** 1 de código (worktree, `d86969c0`) + 1 de planning (checkout principal)

## Task 1 — los 22 schemas Drizzle

Misma edición de 3 líneas por archivo que los planes 167-02 y 167-03 (import + comentario + columna), **una tabla por archivo** en este grupo (a diferencia de la tanda C2, donde 3 archivos concentraban 12 tablas):

```ts
import { tenantIdColumn } from "./tenant-column";
// ...
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
```

| Subgrupo            | Tablas                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Reglas y catálogos  | routes, spom_rules, intensity_rules, contraction_rules, weekly_rotator, formats, format_compatibility, spom_config, day_modes             |
| Árbol de ejercicios | exercises, exercise_dimension_proposals, exercise_milestone_proposals, exercise_progressions, exercise_adjustments                        |
| Sesiones            | sessions, session_blocks, session_prescriptions, session_traces, session_edit_logs, completed_sessions, saved_blocks, evaluation_requests |

Ningún índice, ninguna relación a `tenants`, ningún reordenamiento de columnas. `git diff` no toca **ninguna** línea con `uniqueIndex(` ni `unique(`.

### Las dos minas quedaron escritas en el código

- **`spom_config` (M1):** cinco líneas sobre la tabla explicando que el CHECK de fila única hace que `current_week` sea global y no por gimnasio, que queda INTACTO en v6.0 porque solo el tenant 1 corre SPOM, y que el día que otro tenant lo use eso migra a un unique por `tenant_id` — el mismo movimiento que ya hizo `tv_class_state` con `branch_id`.
- **`session_prescriptions` (M9):** tres líneas sobre `exercise_id` explicando que apunta a `exercises.id` **sin FK real**, así que la DB no puede garantizar que ambas filas compartan tenant, y que esa arista la verifica `verify-tenant-backfill.ts` con un join manual en el plan 167-06.

### La trampa del `$inferSelect`: revisada, y esta vez había un candidato

`grep -rn '\$inferSelect' src/` da 11 líneas y una **sí** toca este grupo: `src/modules/sessions/service.ts:773`, `reconstructSession(session: typeof schema.sessions.$inferSelect)`. Se revisaron sus dos únicos llamadores (líneas 597 y 763): ambos alimentan el parámetro desde un `.select()` **completo**, no desde una proyección explícita, así que el tipo se ensancha de los dos lados a la vez y no hay incompatibilidad. `npx tsc --noEmit` salió limpio de una — **no hizo falta el fix de proyección que el 167-02 necesitó en `BalanceService`**.

## Task 2 — migración 0194

`0194_tenant_id_templo_spom.sql`, hand-written, **88 statements** = 22 tablas × 4 pasos, en orden alfabético, copiando el patrón de la 0192/0193 (no el de la 0191):

```sql
ALTER TABLE <t> ADD COLUMN tenant_id INT NULL DEFAULT 1;
UPDATE <t> SET tenant_id = 1 WHERE tenant_id IS NULL;
ALTER TABLE <t> MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1;
ALTER TABLE <t> ADD CONSTRAINT fk_<t>_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);
```

El header especializa el argumento de WR-01 a este grupo: el escritor concurrente concreto durante el rolling deploy es el **generador de sesiones** (T-167-21), que inserta en `sessions`, `session_blocks` y `session_prescriptions` fuera de un request y sin coordinación con el deploy, más los check-in escribiendo `completed_sessions` y `exercise_adjustments`. También documenta por qué la denormalización es universal aunque el scoping lo gobierne la fase 176, que la mayoría del grupo es [SIN-ANCLA] (backfill directo, no derivado), que el CHECK de `spom_config` no se toca, la lista de uniques que quedan como deuda de la fase 168 y la mina M9.

### Gate estático corrido con el parser REAL antes de tocar la DB

En vez de confiar solo en greps, el archivo se pasó por `splitSqlStatements()` **importado del propio runner**: **88 statements, 0 malformados**. Esto ejercita el camino exacto que rompió CI en la 0119. Ninguna línea del archivo contiene `--` y `;` a la vez.

### Aplicación local

`pnpm db:migrate` → `Applying: 0194_tenant_id_templo_spom.sql (88 statements)` / `Applied successfully`, **sin una sola línea `Skipped`**: los 88 statements ejecutaron limpios de verdad, no por la heurística `alreadyApplied`. No hizo falta el procedimiento de recuperación de falla parcial.

## Verificación

| Check                                                                             | Esperado      | Resultado                                            |
| --------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------- |
| `npx tsc --noEmit`                                                                | limpio        | limpio (a la primera, sin fixes)                     |
| `grep -rho 'tenantIdColumn()' src/db/schema/ --exclude=tenant-column.ts \| wc -l` | 65            | **65** (27 + 16 + 22)                                |
| Ocurrencias por archivo en los 22                                                 | 1 cada uno    | **1** en los 22 (`sort -u` devuelve una sola línea)  |
| `grep -c 'spom_config_single_row' src/db/schema/spom-config.ts`                   | 1             | **1** (ver Desviación 1)                             |
| `grep -c 'M1' spom-config.ts` / `grep -c 'M9' session-prescriptions.ts`           | >= 1          | **1 / 1**                                            |
| `git diff --name-only`                                                            | 22 rutas      | exactamente los 22 schemas, ninguna otra             |
| Líneas del diff con `uniqueIndex(` o `unique(`                                    | 0             | **0**                                                |
| `grep -nE ':\s*any\b'` sobre las líneas agregadas                                 | 0             | **0**                                                |
| Líneas del `.sql` con `--` y `;` a la vez                                         | 0             | **0**                                                |
| `ADD COLUMN tenant_id INT NULL DEFAULT 1` (sin comentarios)                       | 22            | **22**                                               |
| `UPDATE <t> SET tenant_id = 1 WHERE tenant_id IS NULL`                            | 22            | **22**                                               |
| `MODIFY COLUMN tenant_id INT NOT NULL DEFAULT 1`                                  | 22            | **22**                                               |
| `REFERENCES tenants(id)`                                                          | 22            | **22**                                               |
| `AFTER ` (case-insensitive, sin comentarios)                                      | 0             | **0**                                                |
| Statements según el parser real del runner                                        | 88            | **88, 0 malformados**                                |
| Constraint más largo                                                              | <= 64 chars   | 38 (`fk_exercise_milestone_proposals_tenant`)        |
| Constraints que NO siguen `fk_<tabla>_tenant`                                     | 0             | **0** (query sobre `INFORMATION_SCHEMA`)             |
| `INFORMATION_SCHEMA.COLUMNS`: NOT NULL / DEFAULT '1' / `int` en las 22            | 22            | **22**                                               |
| FKs a `tenants` de las 22 tablas de este plan                                     | 22            | **22**                                               |
| FKs a `tenants` en toda la base local                                             | 68            | **68** (46 previas + 22)                             |
| Filas con `tenant_id <> 1 OR IS NULL`, **medido tabla por tabla**                 | 0             | **0 en las 22**, sobre 23.671 filas                  |
| `SHOW CREATE TABLE spom_config` conserva el CHECK                                 | sí            | **sí** (+ confirmado en `CHECK_CONSTRAINTS`)         |
| `SELECT COUNT(*) FROM spom_config`                                                | <= 1          | **1**                                                |
| Insert en `routes` SIN `tenant_id`                                                | queda en 1    | `tenant_id = 1`, fila borrada (vuelve a 31)          |
| Insert en `sessions` SIN `tenant_id`                                              | queda en 1    | `tenant_id = 1`, fila borrada (vuelve a 648)         |
| Segunda corrida de `pnpm db:migrate`                                              | sin cambios   | `No new migrations to apply`, FKs siguen en 68       |
| `SELECT COUNT(*) FROM _migrations WHERE name='0194_...'`                          | 1             | **1**                                                |
| `npx vitest run test/db/tenant-tables.test.ts`                                    | verde         | **5/5** en 91 s                                      |
| DB de test provisionada por el worker (`eltemplo_test_1`)                         | 68 / 68       | **68 columnas `tenant_id` / 68 FKs a tenants**       |
| Formato de los 12 archivos ya prettier-compliant                                  | limpio        | "All matched files use Prettier code style!"         |
| Formato de los 10 archivos con comillas simples                                   | sin regresión | diff de salidas de prettier = solo las líneas nuevas |
| Deleciones en el commit                                                           | ninguna       | ninguna                                              |
| `git status --porcelain` del worktree post-commit                                 | vacío         | vacío                                                |
| `git show --stat HEAD`                                                            | 23 archivos   | **23 archivos, 293 inserciones, 0 deleciones**       |

**El backstop del parser se ejercitó de verdad:** `test/setup.ts` (`provisionWorkerDB`) aplica las migraciones desde cero con el MISMO `splitSqlStatements()` que producción. La base `eltemplo_test_1` quedó con **68 columnas `tenant_id` y 68 FKs a `tenants`**, idéntico a la DB de desarrollo, o sea que el archivo de 88 statements parsea bien también por ese camino.

**Volumen local del grupo: 23.671 filas** — un orden de magnitud más que las tandas C1/C2 en desarrollo. Las pesadas son `session_prescriptions` (12.871), `session_blocks` (3.221), `exercises` (1.493), `format_compatibility` (1.487) y `spom_rules` (1.248). En producción `session_prescriptions` y `completed_sessions` son bastante más grandes: la medición de volumen real antes del rollout sigue siendo el plan 167-07 (mitigación T-167-10).

## Deviations from Plan

### Ajustes automáticos

**1. [Rule 1 - Bug] El comentario de la mina M1 rompía el criterio de aceptación que él mismo debía respetar**

- **Encontrado en:** Task 1, verificación.
- **Problema:** la primera versión del comentario de `spom-config.ts` citaba el literal `` `spom_config_single_row` ``. El criterio de aceptación del plan es `grep -c 'spom_config_single_row' src/db/schema/spom-config.ts` = `1`, y ese grep es **precisamente el gate de que el CHECK no se tocó**. Con el literal en el comentario devolvía `2`, y el gate dejaba de ser verificable: a partir de ahí un `2` podría significar "hay un comentario" o "alguien duplicó/modificó el CHECK".
- **Fix:** se reescribió la frase a "el CHECK de fila unica de mas abajo", conservando el contenido que el plan exige explicar. El grep volvió a `1`. Es la misma clase de trampa que el 167-01 documentó con el helper.
- **Archivos:** `el-templo-api/src/db/schema/spom-config.ts`.

### Aclaraciones sobre criterios del plan (no son cambios de comportamiento)

**1. El grep de `tenantIdColumn()` necesita `--exclude=tenant-column.ts`, como avisó el 167-03**

El criterio pide `65`. Crudo da `67`: el helper vive dentro de `src/db/schema/` y aporta 2 ocurrencias propias (el ejemplo del JSDoc y la declaración). Con `--exclude=tenant-column.ts` da **65**, confirmado. El plan 167-05 tiene la misma trampa (esperar `85 + 2` al cerrar la tanda C).

**2. Son 10 archivos con comillas simples, no 9**

El plan enumera nueve (spom-rules, intensity-rules, contraction-rules, weekly-rotator, format-compatibility, spom-config, session-edit-logs, saved-blocks, evaluation-requests). **`session-traces.ts` también usa comillas simples** y no estaba en la lista. Se respetó su estilo igual que el de los otros nueve, según la instrucción general del plan ("respetar el estilo de cada archivo, no mezclar").

**3. El insert de prueba se hizo en dos tablas, no en una**

El plan pedía una sola prueba, con `routes`, `intensity_rules` o `formats` como candidatas. Se hicieron **dos**: `routes` (el catálogo [SIN-ANCLA] que pedía el plan) y **`sessions`**, que es la superficie que el `<threat_model>` señala en T-167-21 — el generador de sesiones inserta ahí fuera de un request y sin coordinación con el deploy. Probar solo un catálogo habría dejado sin ejercitar el riesgo real. Ambas quedaron en `tenant_id = 1` y ambas filas se borraron (`routes` vuelve a 31, `sessions` a 648).

### Hallazgo de verificación que vale para el plan 167-06

**`GROUP_CONCAT` trunca a 1024 chars y produce un falso positivo silencioso.**

La primera medición de "filas con `tenant_id <> 1 OR IS NULL`" se armó generando un `UNION ALL` con `GROUP_CONCAT` sobre `INFORMATION_SCHEMA.TABLES`, y devolvió **`1`** — o sea, una fila mal backfilleada. La medición tabla por tabla devolvió **0 en las 22**. En vez de asumir cuál estaba bien, se buscó la causa raíz:

- `@@group_concat_max_len` es **1024**, y el texto generado medía exactamente 1025 chars → truncado.
- Sobrevivieron solo 9 de los 22 `SELECT`, y el último quedó cortado en `SELECT 'exercises' t, COUNT(*) n` — **sin cláusula `FROM`**.
- Un `COUNT(*)` sin `FROM` devuelve una fila con valor `1`. Ese era el `1`.

O sea: la query agregada no encontró una fila mala, se contó a sí misma. **El script `verify-tenant-backfill.ts` del plan 167-06 va a recorrer 87 tablas** — cuatro veces más texto — así que si arma la query con `GROUP_CONCAT` va a truncar y dar resultados inventados, y peor, va a hacerlo sin error. Debe iterar en TypeScript tabla por tabla, o subir `group_concat_max_len` explícitamente y verificar el largo del resultado.

### Observaciones operativas (no son desviaciones)

- **Task 1 no tiene commit propio a propósito.** Hard Rule 3 del skill `el-templo-db-migrations` exige que el `.sql` viaje en el mismo commit que el cambio de schema. Un único commit `d86969c0` cubre los dos tasks.
- **Los 10 archivos con comillas simples ya violaban prettier ANTES de tocarlos** (verificado como baseline contra `HEAD`, antes del primer edit: los 10 daban `[warn]`, los otros 12 daban "All matched files use Prettier code style!"). El repo no tiene `.prettierrc`, así que el default es comillas dobles y esos archivos nunca pasaron por el hook de lint-staged. Correr `prettier --write` los habría reescrito enteros, incluidas las líneas de `uniqueIndex(...)`, violando el criterio de aceptación de que el diff no toca ningún unique. En su lugar se verificó **por equivalencia**: se corrió prettier sobre la versión en `HEAD` y sobre la versión editada de cada uno, y el diff entre ambas salidas contiene **solo las líneas que agregué**. Cero regresión de formato introducida. Los 12 archivos que sí cumplían siguen cumpliendo.
- **El `.sql` no necesita prettier:** el `lint-staged` de la raíz solo matchea `**/*.{ts,vue,js,json,md}`.
- **El checkout principal no se tocó para código.** Todos los edits de código fueron bajo `/home/franco/projects/et-167-columnas` (rama `feat/167-tenant-columns`, verificada como no protegida antes de commitear).

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. No se agregó ni modificó ningún endpoint, ninguna ruta de auth ni ningún esquema de request: `tenant_id` no aparece en ninguna superficie de entrada. Las disposiciones del registro se cumplieron como estaban escritas — T-167-17 (`accept`) verificado por `SHOW CREATE TABLE`, T-167-19 (`accept`) verificado por el diff sin uniques, T-167-21 (`mitigate`) verificado por el insert de prueba en `sessions`.

## Next Phase Readiness

El plan 167-05 arranca sin bloqueos:

- Worktree `/home/franco/projects/et-167-columnas` (rama `feat/167-tenant-columns`), HEAD `d86969c0`, working tree limpio.
- Número libre: **0195**. `_migrations` local tiene ya 0192, 0193 y 0194.
- **Copiar el patrón SQL de 0192/0193/0194, no el de 0191.**
- Acumulado: **65** de las 85 tablas de la tanda C. Con las 2 anclas, **67 de las 87** gym-owned ya tienen la columna. Faltan **20**.
- Trampas vigentes: el grep de `tenantIdColumn()` incluye 2 del propio helper (usar `--exclude=tenant-column.ts`), `npx prettier --check` a mano (no hay hook en el worktree) y **verificar el baseline de prettier ANTES de editar** — hay más archivos viejos con comillas simples de los que los planes enumeran, nunca `git add -A`, y verificar la migración contra `INFORMATION_SCHEMA` en vez de contra `_migrations`.
- Antes de editar, repetir `grep -rn '\$inferSelect' src/` — en este grupo había un candidato (`sessions`) que resultó inofensivo porque sus llamadores usan `.select()` completo, pero hay que mirar los llamadores, no solo el grep.
- **Para el 167-06: no armar la query de verificación con `GROUP_CONCAT`** (ver el hallazgo de arriba).

## Self-Check: PASSED

- `el-templo-api/src/db/migrations/0194_tenant_id_templo_spom.sql` existe en el worktree y está en el commit.
- Los 22 `.ts` de schema declarados existen y están en el commit.
- El commit `d86969c0` está en el historial de `feat/167-tenant-columns` con 23 archivos, 293 inserciones y 0 deleciones.
- Este SUMMARY existe en el checkout principal.
