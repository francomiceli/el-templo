---
phase: 172-adopci-n-1-piloto-finance
plan: 16
subsystem: testing
tags:
  [
    tenancy,
    finance,
    analytics,
    scheduling,
    asistencia,
    migraciones,
    wellhub,
    sentinel,
    barrido-global,
    sonda-revertida,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / tenantValues)"
  - phase: 170-sentinel-lint
    provides: "src/db/sentinel/ — analyzeSql, el canal de exención `tenant-safe:` y el throw"
  - phase: 171-backstop
    provides: "test/fixtures/second-tenant.ts (TENANT_TEMPLO) y la batería iso-02"
  - plan: 172-13
    provides: "regla exención-vs-filtro (global a propósito → exención; acotable → filtro)"
  - plan: 172-14
    provides: "auditoría mecánica en Python y el hallazgo del SQL crudo con backticks"
  - plan: 172-15
    provides: "los módulos consumidores de finance ya verdes — este plan cierra la cola larga"
provides:
  - "15 archivos de analytics, scheduling, asistencia, Wellhub, migraciones y tenancy listos para el throw: 58 sitios migrados, cero expectativas tocadas"
  - "BARRIDO GLOBAL sobre TODO test/ (245 archivos) con salida VACÍA: no queda una sola query literal sobre las 6 tablas strict sin tenant ni exención"
  - "HALLAZGO: el statement con NOMBRE DE TABLA DINÁMICO (`sql.raw(tabla)` / SQL armado en un helper de `src/`) es el tercer punto ciego del inventario por grep — 3 sitios que ninguna regex vio y que la corrida en caliente sí"
  - "HALLAZGO: 2 rojos de la fase que nadie había visto — el gate `iso-02 Test 13` estaba rojo desde el 172-13, y el barrido de integridad de `verifyTenantBackfill` hacía throw"
  - "Evidencia en caliente: 52 archivos / 649 de 652 tests verdes con `finance` en TENANT_STRICT_MODULES y CERO throws del sentinel"
affects: [172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tercer punto ciego del inventario por grep: el nombre de tabla que NO está escrito en el fuente (`sql.raw(tabla)` sobre una unión cerrada, o SQL armado por un helper de `src/`). La auditoría se parte en dos barridos: accesos literales (veredicto) y statements de tabla dinámica (triage manual)"
    - "La exención de un SQL que viene de afuera del test (migración histórica, script de `src/`) se antepone EN EL PUNTO DE APLICACIÓN del test, no en el archivo de origen: el `.sql` de una migración aplicada es inmutable y el script de `src/` no pasa por el pool que el sentinel intercepta"
    - "Un gate que busca marcas por substring no distingue código de comentario: explicar en un comentario por qué NO se usa una marca pone el gate en rojo igual (`test/setup.ts` vs `iso-02 Test 13`)"

key-files:
  created: []
  modified:
    - el-templo-api/test/analytics/analytics.test.ts
    - el-templo-api/test/analytics/advanced-finance.test.ts
    - el-templo-api/test/analytics/breakdowns-cohorts.test.ts
    - el-templo-api/test/analytics/especial-exclusion.test.ts
    - el-templo-api/test/analytics/ltv.test.ts
    - el-templo-api/test/analytics/ticket.test.ts
    - el-templo-api/test/scheduling/scheduling.test.ts
    - el-templo-api/test/scheduling/155-horarios.test.ts
    - el-templo-api/test/scheduling/schedule-exceptions.test.ts
    - el-templo-api/test/attendance/attendance.test.ts
    - el-templo-api/test/wellhub/webhook-booking.test.ts
    - el-templo-api/test/migrations/0109_reconcile_soledad.test.ts
    - el-templo-api/test/tenancy/con-01-uniques-cross-tenant.test.ts
    - el-templo-api/test/tenancy/con-03-write-paths-tenant-id.test.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
    - el-templo-api/test/setup.ts

key-decisions:
  - "5 exenciones `tenant-safe` nuevas, todas por la MISMA regla del 172-13 y ninguna por comodidad: la migración histórica 0109 (inmutable), el COUNT y la limpieza cross-tenant de con-01, el `tenantDeLaFila` de con-03 (filtrarlo volvería la aserción tautológica) y la auditoría de las 87 tablas de `verifyTenantBackfill`"
  - "La exención de la 0109 se antepone en `applyMigration()` del TEST y NO en `src/db/migrations/0109_*.sql`: el archivo de una migración ya aplicada es inmutable (el `_migrations` de la base es la fuente de verdad) y en producción las migraciones no corren por el pool que el sentinel intercepta"
  - "En las 4 archivos de analytics que ya tenían un `CTX: TenantContext` declarado por planes anteriores se REUSÓ esa constante en vez de sumar un `TEMPLO_CTX` paralelo — la regla del threat model era completar, no rediseñar"
  - "La auditoría mecánica se partió en dos barridos con criterios distintos: el de accesos LITERALES es el veredicto (salida vacía = criterio de aceptación) y el de TABLA DINÁMICA es un flag de triage cuyos 4 sobrevivientes se clasificaron uno por uno contra el .sql que ejecutan"
  - "Los 2 rojos nuevos que destapó la corrida (setup.ts y 0192-0195) se arreglaron en la rama: son de la fase, no del plan, pero el 172-21 se los habría comido al encender el throw de verdad"

patterns-established:
  - "Auditoría mecánica v5: dos barridos (literal + dinámico), con reconocimiento de payload-builders (el tenant estampado un nivel más abajo) y de constantes de exención. Probada contra el caso conocido-malo del 172-14 (27 sitios en `coach-load.test.ts` pre-migración) ANTES de confiar en su verde, y contra el árbol pre-plan (55 sitios) para probar que el verde final no es un placebo"

requirements-completed: []

# Metrics
duration: ~95min
completed: 2026-07-31
---

# Phase 172 Plan 16: La cola larga de tests lista para el throw Summary

**Los 15 archivos de analytics, scheduling, asistencia, Wellhub, migraciones y tenancy —58 sitios sobre las 6 tablas strict— pasan con el sentinel en modo throw, sin tocar una sola expectativa. El barrido global sobre TODO `test/` (245 archivos) sale VACÍO: cierra el objetivo del plan. La corrida en caliente sobre los 6 directorios dio 649/652 con CERO throws del sentinel, y destapó tres cosas que ninguna lectura ni ningún grep habían visto: (1) el tercer punto ciego del inventario —el statement cuyo nombre de tabla NO está escrito en el fuente (`sql.raw(tabla)` sobre una unión cerrada, o SQL armado por un helper de `src/`)—, (2) que el gate `iso-02 Test 13` estaba ROJO desde el 172-13 porque un comentario de `test/setup.ts` nombraba el módulo del fixture, y (3) que el barrido de integridad de `verifyTenantBackfill` cruza tres tablas strict y hacía throw. Los tres rojos restantes son de `con-06-lint` y le pertenecen al 172-21: dos son la deuda de allowlist de la fase y el tercero es el gate que afirma que `TENANT_STRICT_MODULES` está vacía.**

## Performance

- **Duration:** ~95 min, de los cuales ~55 son corridas contra MySQL real (3 corridas completas de ~7,5 min + 2 de discriminación + 1 de re-verificación puntual)
- **Completed:** 2026-07-31
- **Tasks:** 2/2 (las dos `auto`) + 1 commit de deviación
- **Files modified:** 16 (los 15 del plan + `test/setup.ts`) — +563 / −314 en el commit de la Task 1 y 2

## Task Commits

| Task | Nombre                                            | Commit     | Archivos                                    |
| ---- | ------------------------------------------------- | ---------- | ------------------------------------------- |
| 1    | analytics, scheduling, asistencia y Wellhub       | `220f6fa3` | 11 archivos                                 |
| 2    | migraciones y tenancy + barrido global            | `fad65596` | 3 con cambios (`0196` ya estaba limpio = 4) |
| dev  | 2 rojos de la fase que la corrida en caliente vio | `6c34d948` | `test/setup.ts`, `0192-0195-*.test.ts`      |

Los tres commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `4c252510` del plan 15). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Inventario de sitios migrados por archivo

`WHERE` = `tenantWhere(tabla, ctx)` · `VALUES` = `tenantValues(ctx, {…})` · `CRUDO` = `tenant_id` en el predicado de un `conn.query` / `sql` · `EX` = exención `tenant-safe:` anotada en el SQL.

**Task 1 — analytics, scheduling, asistencia y Wellhub (`220f6fa3`):**

| Archivo                                       | WHERE | VALUES | CRUDO |  EX |  Total | Tablas strict tocadas                         |
| --------------------------------------------- | ----: | -----: | ----: | --: | -----: | --------------------------------------------- |
| `test/analytics/analytics.test.ts`            |     0 |      7 |     0 |   0 |  **7** | `financial_transactions`, `transaction_links` |
| `test/analytics/breakdowns-cohorts.test.ts`   |     4 |      1 |     0 |   0 |  **5** | `financial_transactions`                      |
| `test/analytics/ticket.test.ts`               |     0 |      4 |     0 |   0 |  **4** | `financial_transactions`, `transaction_links` |
| `test/analytics/especial-exclusion.test.ts`   |     0 |      2 |     0 |   0 |  **2** | `financial_transactions`, `transaction_links` |
| `test/analytics/ltv.test.ts`                  |     0 |      2 |     0 |   0 |  **2** | `financial_transactions`                      |
| `test/analytics/advanced-finance.test.ts`     |     0 |      1 |     0 |   0 |  **1** | `financial_transactions`                      |
| `test/scheduling/scheduling.test.ts`          |     0 |      2 |     0 |   0 |  **2** | `financial_transactions`, `transaction_links` |
| `test/scheduling/155-horarios.test.ts`        |     0 |      2 |     0 |   0 |  **2** | `financial_transactions`, `transaction_links` |
| `test/scheduling/schedule-exceptions.test.ts` |     0 |      2 |     0 |   0 |  **2** | `financial_transactions`, `transaction_links` |
| `test/attendance/attendance.test.ts`          |     0 |      2 |     0 |   0 |  **2** | `financial_transactions`, `transaction_links` |
| `test/wellhub/webhook-booking.test.ts`        |     1 |      0 |     0 |   0 |  **1** | `cash_registers`                              |
| **Subtotal**                                  |     5 |     25 |     0 |   0 | **30** |                                               |

**Task 2 — migraciones y tenancy (`fad65596`):**

| Archivo                                                | WHERE | VALUES | CRUDO |  EX |  Total | Tablas strict tocadas                                                       |
| ------------------------------------------------------ | ----: | -----: | ----: | --: | -----: | --------------------------------------------------------------------------- |
| `test/migrations/0109_reconcile_soledad.test.ts`       |     8 |      0 |    15 |   1 | **24** | `financial_transactions`, `transaction_links`, `balances`                   |
| `test/tenancy/con-01-uniques-cross-tenant.test.ts`     |     0 |      0 |     0 |   2 |  **2** | `cost_centers`                                                              |
| `test/tenancy/con-03-write-paths-tenant-id.test.ts`    |     0 |      0 |     0 |   1 |  **1** | `financial_transactions`                                                    |
| `test/migrations/0196-tenant-unique-contracts.test.ts` |     0 |      0 |     0 |   0 |  **0** | ninguna (`cost_centers` solo en un `ALTER TABLE`, que el sentinel `skip`ea) |
| **Subtotal**                                           |     8 |      0 |    15 |   4 | **27** |                                                                             |

**Deviación (`6c34d948`):**

| Archivo                                            | WHERE | VALUES | CRUDO |  EX |  Total | Nota                                          |
| -------------------------------------------------- | ----: | -----: | ----: | --: | -----: | --------------------------------------------- |
| `test/migrations/0192-0195-tenant-columns.test.ts` |     0 |      0 |     0 |   1 |  **1** | auditoría global de las 87 tablas gym-owned   |
| `test/setup.ts`                                    |     0 |      0 |     0 |   0 |  **0** | comentario: rompía el gate `iso-02 Test 13`   |
| **TOTAL DEL PLAN**                                 |    13 |     25 |    15 |   5 | **58** | las 4 de las 6 (`debt_management` no aparece) |

**`debt_management` sigue sin aparecer**, tercera vez consecutiva (172-13, 172-14, 172-15, 172-16). Es la sexta tabla strict y en los **53 archivos de test migrados por los cuatro planes** no hay una sola query directa contra ella: la ejercita `balance-service` por adentro. **El 172-21 tiene que anotarlo**: una tabla strict sin una sola query de test directa es una tabla cuyo aislamiento nadie está probando desde afuera. La batería ISO-03 del 172-22/23 es la última chance de cubrirla.

## Barrido global (criterio de aceptación del plan)

La auditoría se partió en **dos barridos con criterios distintos**, porque uno solo no puede dar veredicto sobre las dos formas.

### Barrido A — accesos LITERALES a las 6 tablas strict (el veredicto)

Detecta `.insert/.from/.update/.delete/.into(X)` de Drizzle (con `schema.` o import desnudo) y SQL crudo con el nombre de tabla entre backticks, comillas, corchetes o pelado. Un sitio está cubierto si el statement lleva `tenantWhere` / `tenantValues` / `tenantId` / `tenant_id`, si llama a un payload-builder del propio archivo que estampa el tenant, o si lleva la exención `tenant-safe:`.

```
$ python3 audit_v5.py $(find test -name '*.ts' | sort)     # 245 archivos
AUDITORIA OK: 0 accesos sin tenant ni exencion
```

**Prueba de que el verde no es un placebo** (lección del 172-14):

| Corpus                                          | Resultado                                              |
| ----------------------------------------------- | ------------------------------------------------------ |
| `coach-load.test.ts` **pre-172-14** (caso malo) | **27 sitios** — el número exacto que reportó el 172-14 |
| `test/` entero en `4c252510` (pre-plan)         | **55 sitios** — = 30 (Task 1) + 25 (Task 2)            |
| `test/` entero en `6c34d948` (post-plan)        | **0 sitios** ✅                                        |

### Barrido B — statements con NOMBRE DE TABLA DINÁMICO (triage)

`sql.raw(<expr>)`: la tabla no está escrita en el fuente, así que **ninguna regex puede decidir**. El barrido los marca y cada uno se clasifica a mano contra el `.sql` que ejecuta:

```
$ python3 audit_v5.py --dinamicas $(find test -name '*.ts' | sort)
test/backfill-lost-leads.test.ts:140                          sql.raw(reclassifyStmt)
test/migrations/0111-program-enrollments-addon-columns.test.ts:503  sql.raw(stmt)
test/migrations/0196-tenant-unique-contracts.test.ts:230       sql.raw(statement)
test/subscriptions/bookings-reactivation.test.ts:321           sql.raw(migrationSql)
AUDITORIA: 4 sitios sin cobertura
```

Clasificación objetiva (grep de las 6 tablas strict sobre el `.sql` que cada uno lee):

| Sitio                       | Migración que ejecuta                          | Tablas strict | Veredicto                                                                                                      |
| --------------------------- | ---------------------------------------------- | ------------: | -------------------------------------------------------------------------------------------------------------- |
| `backfill-lost-leads:140`   | `0183_backfill_lost_leads.sql`                 |         **0** | limpio (UPDATE sobre `users`)                                                                                  |
| `0111-...:503`              | `0111_program_enrollments_addon_columns.sql`   |         **0** | limpio                                                                                                         |
| `0196-...:230`              | `0196_tenant_unique_contracts.sql`             |         **3** | los 3 son `ALTER TABLE cost_centers` / comentarios → el sentinel los `skip`ea (no hay `from/join/into/update`) |
| `bookings-reactivation:321` | `0122_reactivate_stale_cancelled_bookings.sql` |         **0** | limpio                                                                                                         |

Los cuatro corrieron además **en verde con la sonda encendida** (`test/migrations` y `test/subscriptions`, este plan y el 172-15).

## Verificación en caliente (criterio de aceptación)

Comando del plan, con `finance` (las 6 tablas) puesto a mano en `TENANT_STRICT_MODULES`:

```
pnpm exec vitest run test/analytics test/scheduling test/attendance \
  test/migrations test/wellhub test/tenancy --hookTimeout=900000

 Test Files  1 failed | 51 passed (52)
      Tests  3 failed | 649 passed (652)
   Duration  447.90s
```

- **CERO throws de `TenantSentinelError` en toda la corrida** (`grep -c TenantSentinelError` = 0).
- **Los 15 archivos del plan: los 15 verdes.**
- Los 3 rojos son los tres `it` de `con-06-lint.test.ts` — ver "Deferred Issues".

### Las 3 corridas y qué encontró cada una

| #   | Estado del código                         | Resultado   | Qué destapó                                                                                               |
| --- | ----------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Tasks 1+2 migradas, sonda ON              | 640/652     | los 2 rojos de `con-03` (`tenantDeLaFila`), `iso-02 Test 13`, el suite de `0192-0195` y los 3 de `con-06` |
| 2   | + exención de `con-03`, sonda ON          | 642/652     | `con-03` verde; quedaban `iso-02 Test 13` (mi propio comentario nombraba las marcas) y `0192-0195`        |
| 3   | + `setup.ts` y `0192-0195` arreglados, ON | **649/652** | **la que vale** — solo quedan los 3 de `con-06`, que son del 172-21                                       |

Más 1 corrida de **discriminación con la sonda APAGADA** sobre `con-06-lint.test.ts`: 2 de sus 3 rojos siguen ahí (⇒ no los causa la sonda), el tercero desaparece (⇒ ese sí es de la sonda).

| Criterio                                                       | Resultado                                     |
| -------------------------------------------------------------- | --------------------------------------------- |
| `pnpm exec tsc --noEmit`                                       | ✅ **exit 0** (después de cada task)          |
| Throws de `TenantSentinelError` en la corrida final            | ✅ **0**                                      |
| Barrido A sobre `test/` entero (245 archivos)                  | ✅ **vacío**                                  |
| `git status --porcelain … src/db/tenant-tables.ts` al terminar | ✅ **vacío** — sonda revertida y verificada   |
| `git status --porcelain` en `et-172`                           | ✅ **vacío**                                  |
| `git status --porcelain … tenant-lint-allowlist.json`          | ✅ vacío (dueño único = 172-21)               |
| `prettier --check` sobre los 16 archivos                       | ✅ (corrido **antes** de las corridas largas) |
| Exenciones `tenant-safe` nuevas                                | **5**, cada una con motivo escrito            |

### Sobre "cero expectativas tocadas"

`git diff 4c252510 -- el-templo-api/test | grep -c "^[-+].*expect("` da **4**, y los 4 son **reflow de Prettier en `con-03-write-paths-tenant-id.test.ts`**, un archivo que ya estaba con drift de formato antes del plan. Prueba: se corrió el Prettier del repo sobre la versión de `4c252510` de ese archivo y se diffeó contra la actual —

```
$ diff <(prettier 4c252510:con-03) con-03-actual | grep -c "^[<>].*expect("
0
```

— el diff son exactamente 2 hunks: el docblock nuevo y la exención en el SQL. **Ninguna aserción cambió de semántica en ningún archivo del plan.**

### 📌 Entradas de allowlist que paga este plan: **0**

Igual que el 172-13/14/15 y por el mismo motivo: `tenant-lint-allowlist.json` **solo cubre `src/`** y este plan no toca una línea de `src/`. **La cuenta acumulada para el 172-21 sigue en 51.**

## Accomplishments

- **58 sitios migrados en 16 archivos, cero expectativas tocadas, y el objetivo del plan cumplido:** el barrido global sobre `test/` sale en **cero**.

- **El tercer punto ciego del inventario por grep.** El 172-14 encontró el segundo (SQL crudo con backticks). Este plan encontró el tercero y es peor: **el nombre de la tabla no está en el fuente**.

  ```ts
  // con-03-write-paths-tenant-id.test.ts:305 — TablaInspeccionada incluye financial_transactions
  sql`SELECT tenant_id AS tenantId FROM ${sql.raw(tabla)} WHERE id = ${filaId}`;
  ```

  Ninguna regex sobre el fuente puede saber qué tabla es. Y hay una variante todavía más escondida: `0192-0195-tenant-columns.test.ts` ejecuta SQL **armado por un helper de `src/`** (`verifyTenantBackfill`), así que el fuente del test no contiene ni siquiera un `FROM`. Los cazó la corrida en caliente, no la lectura — por tercer plan consecutivo.

- **El rojo que estaba escondido desde el 172-13.** `iso-02-fixtures.test.ts` Test 13 prueba que la siembra del gimnasio 2 es OPT-IN buscando tres marcas **por substring** en `test/setup.ts`. El 172-13 agregó ahí un docblock que decía `test/fixtures/second-tenant.ts` para explicar por qué NO importaba el fixture, y el gate no distingue código de comentario. **El 172-14 y el 172-15 no corrieron `test/tenancy`, así que nadie lo vio durante dos planes.** La primera versión del arreglo cayó en la misma trampa —la advertencia que escribí nombraba las tres marcas— y hubo que reescribirla describiéndolas sin nombrarlas.

- **El barrido de integridad que hacía throw.** `verifyTenantBackfill` audita el backfill de `tenant_id` en las 87 tablas gym-owned de toda la base y cruza `transaction_links`, `balances` y `financial_transactions` buscando huérfanos de FK. Es **global a propósito**: un huérfano del gimnasio 2 que no viera sería exactamente el bug que existe para cazar. Exención, no filtro.

- **Cinco exenciones, todas por la misma regla y ninguna por comodidad.** El 172-14 cerró con cero porque ninguno de sus 12 archivos sembraba en otro gimnasio. Este plan es el opuesto: es el que toca la batería de tenancy y los tests de migraciones históricas, donde el acceso global **es el punto**. La regla del 172-13 decidió las cinco sin discutir.

- **La sonda quedó apagada y verificada.** `git status --porcelain src/db/tenant-tables.ts` sale **vacío** y `TENANT_STRICT_MODULES` vuelve a decir `= {}`. Ninguno de los tres commits toca `src/`.

## Decisions Made

### 1. La exención de la 0109 va en el TEST, no en el `.sql`

`0109_reconcile_soledad_mailland.sql` es un data-fix de una sola vez de 2026-04: sus `WHERE` apuntan a ids literales de producción (tx 34, balances 14/16/20/21) y fue escrito cuando `tenant_id` no existía. Cuatro de sus seis statements tocan tablas strict sin la columna, y con la sonda encendida el test que lo aplica revienta.

Tres opciones y por qué gana la tercera:

- **Editar el `.sql`** — prohibido: una migración ya aplicada es inmutable (el `_migrations` de la base es la fuente de verdad, no `meta/_journal.json`), y en producción la 0109 ya corrió.
- **Acotar los `WHERE`** — imposible sin reescribir historia: el test existe justamente para probar que la migración hace lo que hizo en producción.
- **Anteponer la exención en `applyMigration()` del test** ✅ — el `.sql` queda intacto, la anotación queda donde se ejercita, y el motivo escrito dice por qué. En producción las migraciones **no corren por el pool que el sentinel intercepta**, así que la exención no le hace falta a nadie más.

Se verificó contra `analyzeSql` —el mismo código que corre en el pool— antes de tocar nada: los 6 statements dan `violation` pelados y `exempt` con el comentario antepuesto.

### 2. El `tenantDeLaFila` de con-03 se exime, no se filtra

```
SELECT tenant_id AS tenantId FROM financial_transactions WHERE id = ?
```

Es la **aserción de evidencia** de la batería D-09: pregunta "¿en qué gimnasio nació esta fila?". Agregarle `AND tenant_id = 1` la volvería **tautológica** — la query pasaría a asumir la respuesta que el test tiene que descubrir. Es el caso de manual de "global a propósito": el acceso no está scopeado porque el scope es lo que se está midiendo.

Vale la pena notar **por qué el sentinel lo caza**: el `tenant_id` está en la PROYECCIÓN, no en el predicado, y `analyzeSql` recorta la proyección de todo `SELECT` antes de buscar la columna (etapa 4). El vigilante tiene razón: una columna en el `SELECT` no aísla nada.

### 3. En con-01 y con-03 se completó, no se rediseñó

El threat model del plan (T-172-16-01) protege los tests de las fases 169-171. Se respetó literal:

- Los 4 `INSERT` de `cost_centers` de con-01 **ya estaban bien**: el payload sale de `centroDeCosto(tenantId, …)`. La primera versión de la auditoría los marcó como violación —el tenant está estampado **un nivel más abajo** que el statement— y la respuesta correcta fue arreglar la herramienta, no el test.
- No se tocó un solo id de tenant ad-hoc (90168, 90169, 90269, 90369, 90418, 90469, 90569, 90671, 90940 siguen intactos), ni un fixture, ni una aserción.
- En los 4 archivos de analytics que ya traían un `CTX: TenantContext` de planes anteriores se **reusó esa constante** en vez de sumar un `TEMPLO_CTX` paralelo.

### 4. Los 2 rojos de la fase se arreglan acá y no se difieren

`setup.ts` y `0192-0195` no son de este plan: el primero lo rompió el 172-13 y el segundo lleva roto desde que la fase migró `src/`. Pero los dos son **rojos que el 172-21 se come al encender el throw de verdad**, los dos se arreglan en menos de 20 líneas, y los dos ya estaban probados en verde en la misma corrida. Diferirlos habría sido dejarle al plan del interruptor un trabajo de diagnóstico que este plan ya tenía hecho y caliente. Van en su **commit propio** (`6c34d948`) para que la separación quede en el historial.

### 5. La auditoría se parte en dos barridos

Un único barrido tendría que elegir entre dar falsos verdes (ignorando `sql.raw`) o falsos rojos (marcando todo `sql.raw` como violación). Partirlo hace que **el barrido A pueda ser un veredicto** (salida vacía = criterio cumplido) y que **el B sea un flag de triage** con 4 sobrevivientes clasificados uno por uno contra el `.sql` que ejecutan. Un gate que no puede decidir tiene que decir que no puede decidir, no adivinar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El gate `iso-02 Test 13` estaba rojo desde el 172-13**

- **Found during:** Task 2, primera corrida en caliente
- **Issue:** `test/setup.ts` nombraba `test/fixtures/second-tenant.ts` en un docblock que el 172-13 agregó. El Test 13 de `iso-02-fixtures.test.ts` busca tres marcas **por substring** para probar que la siembra del gimnasio 2 no está enchufada al setup global, y no distingue código de comentario. Ni el 172-14 ni el 172-15 corrieron `test/tenancy`, así que el rojo sobrevivió dos planes.
- **Fix:** el docblock se reescribe sin las tres marcas y se deja una advertencia —que también las describe sin nombrarlas— para el próximo que lo edite.
- **Files modified:** `test/setup.ts`
- **Committed in:** `6c34d948`

**2. [Rule 3 - Blocker] El barrido de integridad de `verifyTenantBackfill` hacía throw**

- **Found during:** Task 2, segunda corrida en caliente
- **Issue:** `0192-0195-tenant-columns.test.ts` ejecuta el script de verificación del backfill, que cruza `transaction_links`, `balances` y `financial_transactions` buscando huérfanos de FK. Con la sonda encendida el `beforeAll` entero se cae y el archivo no corre. **El SQL lo arma un helper de `src/`, así que el fuente del test no tiene ni un `FROM`**: ninguna auditoría estática sobre `test/` podía verlo.
- **Fix:** el adaptador `makeQueryFn` antepone la exención `tenant-safe:` a cada statement. Va en el test y no en `src/db/scripts/verify-tenant-backfill.ts` porque el sentinel solo intercepta el pool de la app y este test es el único call site que lo enchufa ahí; si mañana lo llama una ruta o un job, la exención se muda al script (queda escrito en el docblock).
- **Files modified:** `test/migrations/0192-0195-tenant-columns.test.ts`
- **Committed in:** `6c34d948`

**3. [Rule 1 - Bug del gate] La auditoría heredada daba falsos rojos y falsos verdes**

- **Found during:** Task 1 y Task 2
- **Issue:** tres defectos. (a) `"... from balances ..."` dentro del TÍTULO de un test entraba como violación; (b) `.values(centroDeCosto(TENANT_TEMPLO, …))` figuraba como violación aunque el tenant está estampado un nivel más abajo; (c) los statements de tabla dinámica no se veían.
- **Fix:** auditoría v5 — keyword SQL en mayúscula o tabla delimitada, reconocimiento de payload-builders y de constantes de exención, y el barrido B separado. **Probada contra el caso conocido-malo del 172-14 (27 sitios) y contra el árbol pre-plan (55 sitios) antes de confiar en su verde.**
- **Files modified:** ninguno del repo (herramienta de scratchpad)

---

**Total deviations:** 3 auto-fixed (2 × Rule 1, 1 × Rule 3). Ninguna agrega alcance: las tres son la diferencia entre el plan cumplido y el plan dado por cumplido en falso.

## Issues Encountered

**`tsc --noEmit` sigue sin cubrir `test/`** (lección del 172-14, confirmada otra vez). Se corrió igual después de cada task —exit 0— porque prueba que no se rompió `src/`, pero el único gate real de un archivo de test es vitest.

**El `prettier --write` se corrió ANTES de las corridas largas**, tomando la lección del 172-13. Descubrió de paso que `con-03-write-paths-tenant-id.test.ts` tenía drift de formato preexistente, que es de dónde salen los 4 `expect` del diff (ver arriba).

**Lo que este plan NO prueba.** Los 649 tests corren con **un solo gimnasio** en casi todos los archivos. Prueban que **con el sentinel en modo throw no se rompió nada** —el objetivo— pero **no prueban aislamiento**. Eso lo prueba la batería ISO-03 del 172-22/23.

## Deferred Issues

**3 tests rojos en `test/tenancy/con-06-lint.test.ts` — le pertenecen al 172-21.** Discriminados con una corrida extra con la sonda APAGADA:

| `it`                                                              | ¿Rojo con la sonda apagada? | Causa                                                                                               |
| ----------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| "ve los archivos que importan el schema EN PROFUNDIDAD"           | **SÍ**                      | la lente estática ve 81 tablas con deuda y el gate exige ≥ 87: bajó porque la fase **migró `src/`** |
| "el repo real con el baseline del plan 07 sale 0"                 | **SÍ**                      | `lint:tenant` sale 1: son las **51 entradas stale** de la fase esperando que el 172-21 las borre    |
| "una tabla de la lista strict con entradas vivas es discrepancia" | **NO**                      | artefacto de la sonda: el gate afirma que `TENANT_STRICT_MODULES` sigue vacía (D-15)                |

Los dos primeros **no los causa este plan**: `git diff 4c252510..HEAD --name-only` no toca ni un archivo de `src/` ni la allowlist (verificado: 0 coincidencias). Son la consecuencia esperada de que los planes 172-02…172-12 migraran el módulo, y el **172-21 es el dueño único** de `tenant-lint-allowlist.json` y el plan que reescribe estos gates. El tercero desaparece solo cuando la entrada `finance` se escriba de verdad.

**Los 2 rojos ambientales de `coach-load-alta.test.ts`** siguen anotados en `deferred-items.md` desde el 172-14 y no están en el alcance de este plan (no se tocó ese archivo).

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas de request, no instala paquetes y no modifica una línea de `src/`.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-172-16-01 | ✅ con-01 y con-03 solo se **completaron**: 0 ids de tenant ad-hoc tocados, 0 fixtures rediseñadas, 0 aserciones modificadas. Los 4 INSERT que ya estaban bien se dejaron como estaban y se arregló la herramienta |
| T-172-16-02 | ✅ el barrido global está en el SUMMARY con **comando, corpus (245 archivos), salida vacía y la prueba de que da 55 sobre el árbol pre-plan** — no es un "confiá en mí"                                            |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                                       |

## Next Phase Readiness

**La cadena serializada 13→14→15→16 quedó CERRADA.** La suite entera está preparada para el throw. Seis cosas que el 172-21 tiene que dar por sentadas:

1. **El barrido de test/ está en cero.** El switch no debería encontrar sorpresas de fixtures. Si aparece una, es de la clase "tabla dinámica" — corré el barrido B, no el A.
2. **Los 3 rojos de `con-06-lint` son tuyos.** Dos se apagan borrando las 51 entradas de allowlist; el tercero es el gate D-15 que hay que reescribir al poner la entrada `finance`.
3. **`test/db/tenant-tables.test.ts:351` también se va a poner rojo** (`expect(modulos.length).toBe(0)`) — está anunciado en el PATTERNS §7 y su propio mensaje dice qué hacer.
4. **La allowlist sigue en 51 entradas por pagar.** Ninguno de los cuatro planes de tests la movió.
5. **`debt_management` no tiene una sola query de test directa** en los 53 archivos migrados. Anotalo: es la única de las 6 cuyo aislamiento nadie prueba desde afuera. La ISO-03 del 172-22/23 es la última chance.
6. **La sonda quedó apagada.** El pre-check (`git status --porcelain el-templo-api/src/db/tenant-tables.ts` vacío) ya no hace falta para el 172-21 porque ese plan la enciende **de verdad y para siempre** — pero conviene verificarlo igual antes de escribir la entrada, para no commitear la sonda de otro.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-16-SUMMARY.md`
- `FOUND` commits `220f6fa3` (T1), `fad65596` (T2) y `6c34d948` (dev) en `feat/172-adopcion-finance`
- `FOUND` los 16 archivos modificados en `git diff --stat 4c252510..HEAD`
- `VERIFIED` `pnpm exec tsc --noEmit` exit 0 después de cada task
- `VERIFIED` `analyzeSql` da `violation` sobre los 6 statements pelados de la 0109 y `exempt` con la anotación antepuesta
- `VERIFIED` **649/652** en los 6 directorios del plan **con `finance` en `TENANT_STRICT_MODULES`**, y `grep -c TenantSentinelError` = **0**
- `VERIFIED` los 15 archivos del plan pasan; los 3 rojos son `con-06-lint` y 2 de ellos reproducen con la sonda APAGADA
- `VERIFIED` barrido A sobre `test/` entero (245 archivos) = **0 sitios**; el mismo barrido sobre `4c252510` = **55 sitios**; sobre el caso conocido-malo del 172-14 = **27 sitios**
- `VERIFIED` los 4 sobrevivientes del barrido B clasificados contra el `.sql` que ejecutan (0/0/3-DDL/0 tablas strict)
- `VERIFIED` `git status --porcelain el-templo-api/src/db/tenant-tables.ts` vacío y el archivo de vuelta en `TENANT_STRICT_MODULES … = {}`
- `VERIFIED` los 4 `expect` del diff son reflow de Prettier: `diff prettier(4c252510:con-03) con-03-actual | grep -c "expect("` = **0**
- `VERIFIED` `tenant-lint-allowlist.json` sin modificar, 0 archivos de `src/` tocados y `git status --porcelain` en `et-172` vacío

**ADO-01 NO se marca completo**, misma convención que 172-01…172-15: el requisito exige `finance` migrado **con aislamiento verde**, y eso lo prueban el 172-22/23. Este plan cierra el endurecimiento de tests, no el requisito.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-31_
