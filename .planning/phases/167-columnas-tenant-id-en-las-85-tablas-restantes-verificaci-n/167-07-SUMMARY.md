---
phase: 167-columnas-tenant-id-en-las-85-tablas-restantes-verificaci-n
plan: 07
subsystem: deployment
tags:
  [
    rollout,
    staging-first,
    migrations,
    mysql,
    ci-cd,
    multi-tenancy,
    saas,
    information-schema,
  ]

# Dependency graph
requires:
  - "167-01 (worktree et-167-columnas, numeros 0192-0195 reservados, clasificacion canonica de las 91 tablas)"
  - "167-02/03/04/05 (las 4 migraciones de la tanda C: 85 tablas + las 2 anclas = 87 columnas)"
  - "167-06 (verify-tenant-backfill.ts + su gate de CI: el contrato de exit codes 0/1/2 es lo que consume este plan)"
  - "166-06 (secuencia de rollout probada: rama descartable cuando staging diverge, deploy paths reales, trampas de la API de GitHub)"
provides:
  - "Migraciones 0192-0195 aplicadas en eltemplo_staging y en eltemplo, una vez cada una, sin downtime y sin rollback"
  - "87 columnas tenant_id NOT NULL DEFAULT 1 + 88 FKs a tenants verificadas por information_schema en las DOS bases"
  - "verify-tenant-backfill.js con 0 discrepancias y exit 0 en las DOS bases (COL-02 cerrado en produccion)"
  - "Hallazgo abierto: la arista logica completed_sessions.day_id -> sessions.day_id no cubre el 98,8% de las filas en prod"
affects:
  - "168 (CON-02: los uniques compuestos se construyen sobre estas 87 columnas, ya vivas en prod)"
  - "169/170 (la capa de escritura y el sentinel asumen que toda tabla gym-owned tiene la columna en las dos bases)"
  - "171/ISO-03 (la arista completed_sessions.day_id necesita revision antes de que exista un tenant 2)"
  - "Cualquier fase que reserve numero de migracion: el tope aplicado en produccion pasa de 0191 a 0195"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rama descartable basada en origin/staging para llevar la fase a staging, y merge --no-ff de origin/master dentro de la rama de fase antes del push a prod: la fase viaja a master sin arrastrar los commits propios de staging"
    - "Verificar el ARBOL post-merge (comm -3 contra el diff de fase, migraciones agregadas, deleciones) en vez de leer el exit code del merge"
    - "Typecheck + build del arbol mergeado antes de cada push: esa combinacion no existio nunca en CI ni en local"
    - "SELECT DATABASE() como statement separado y previo en cada base del host compartido, con corte previsto"
    - "En information_schema, filtrar COLUMN_DEFAULT con IS NULL explicito: COLUMN_DEFAULT = '1' sobre un NULL da NULL y el NOT lo descarta, produciendo un falso negativo silencioso"

key-files:
  created:
    - .planning/phases/167-columnas-tenant-id-en-las-85-tablas-restantes-verificaci-n/167-07-SUMMARY.md
  modified: []

key-decisions:
  - "Etapa D por opcion A: merge --no-ff de origin/master DENTRO de feat/167-tenant-columns antes del push a master, en vez de rebase. Motivo: preservar los SHAs de los 6 commits de fase, que son la evidencia citada en los SUMMARY de los planes 01-06"
  - "Push a master de la rama de FASE (feat/167-tenant-columns:master), nunca de la rama descartable: los 28 commits de CAJA/finance parados en staging no viajaron a produccion (verificado con merge-base --is-ancestor)"
  - "Deploy paths descubiertos con pm2 describe, no asumidos: /opt/el-templo-staging/api y /var/www/api"
  - "MYSQL_PWD en vez de -p en la linea de comandos: el host EC2 es compartido con academy-api, asupca-api y sema-api"
  - "Cerrar el plan con el smoke funcional por UI (etapa F) PENDIENTE, por decision explicita de Franco, igual que en la 166"

patterns-established:
  - "Un warning del verificador que aparece en prod y no en staging merece cuantificarse antes de reportarlo: 'informativo' y 'la arista no cubre nada' se ven iguales en la salida"

requirements-completed: [COL-01, COL-02]

# Metrics
duration: ~50min (rollout Task 2, del push a staging al cierre de la limpieza)
completed: 2026-07-27
---

# Phase 167 Plan 07: Rollout staging-first de la tanda C Summary

**Las 4 migraciones de la tanda C (0192-0195) corrieron verdes primero en `eltemplo_staging` y después en `eltemplo`, sin downtime y sin rollback: las dos bases tienen las 87 columnas `tenant_id NOT NULL DEFAULT 1` con sus 88 FKs a `tenants`, `system_settings` y `labs_inquiries` siguen deliberadamente sin la columna, y `verify-tenant-backfill.js` reporta 0 discrepancias con exit 0 en ambas — con las cuatro señales humanas respetadas y sin que los 28 commits de staging tocaran producción.**

## Performance

- **Duration:** ~50 min de rollout (primer hito con timestamp verificable: push a staging 16:05:36Z; último: limpieza ~16:53Z). El Task 1 (gate local) se ejecutó antes, en la misma sesión, sin timestamp registrado.
- **Completed:** 2026-07-27
- **Tasks:** 2 (1 auto + 1 checkpoint bloqueante con cuatro señales humanas)
- **Files modified:** 0 de código. Este plan no escribió una línea; el entregable son los dos deploys y esta evidencia.

## Commits desplegados por entorno

| Entorno                          | Ref                              | SHA        | Contenido                                                                           |
| -------------------------------- | -------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| **staging** (`eltemplo_staging`) | `origin/staging`                 | `6ef6acb5` | merge `--no-ff` de la fase sobre los 28 commits que staging ya tenía                |
| **producción** (`eltemplo`)      | `origin/master`                  | `68c447cf` | los 6 commits de la fase + el merge de `origin/master`; **cero commits de staging** |
| rama de la fase                  | `origin/feat/167-tenant-columns` | `68c447cf` | respaldada en origin                                                                |

Los 6 commits de la fase, presentes en los dos entornos:

```
5bfa5f66 feat(167): helper tenantIdColumn + clasificacion canonica de tablas gym-owned (COL-01)
994b7d2f feat(167): tenant_id en las 27 tablas del core operativo (tanda C1, COL-01)
1c65bb0b feat(167): tenant_id en comunicacion, crecimiento e integraciones (tanda C2, COL-01)
d86969c0 feat(167): tenant_id en el motor SPOM (tanda C3, COL-01)
935e3a91 feat(167): tenant_id en AURA, programs, marketing y TV (tanda C4, COL-01)
1c15b300 test(167): verificacion de backfill de tenant_id sobre las 87 tablas (COL-02)
68c447cf Merge origin/master en la rama de fase 167 antes del push a prod
```

**Los 28 commits propios de staging (CAJA/finance) NO viajaron a producción.** Verificado con `git merge-base --is-ancestor origin/staging HEAD`, que falla: `origin/staging` no es ancestro de lo que se pusheó a master. Era el riesgo central del plan (T-167-32) y es exactamente el accidente de la fase 78.

## Las cuatro señales humanas

| Momento (UTC) | Señal                                | Alcance habilitado                                                                                                        |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| ~16:04        | **"aprobado staging"**               | Etapas A y B: push de la rama + rama descartable a staging, y la espera de CI/deploy. Explícitamente sin SSH y sin master |
| ~16:20        | **"autorizado SSH para staging"**    | Etapa C: solo lectura contra `eltemplo_staging`. Prod excluido                                                            |
| ~16:29        | **"aprobado prod"**                  | Etapa D: merge + push a master, y la espera de CI/deploy de producción                                                    |
| ~16:46        | **"autorizado SSH para producción"** | Etapa E: solo lectura contra `eltemplo`. Vino junto con la etapa G                                                        |

**Aprobación extra:** en la misma señal de la etapa E, Franco aprobó actualizar el respaldo remoto de la rama (`git push origin feat/167-tenant-columns`, `1c15b300..68c447cf`), que solo mueve su propio ref y no toca staging ni master.

Ningún push ni acceso SSH ocurrió sin su señal correspondiente.

## Etapa A — push de la rama y merge a staging

Re-verificación con `git fetch` inmediatamente antes: `origin/master` = `1af01b9a` y `origin/staging` = `82309b11`, ambos idénticos a lo que registró el Task 1, y **ninguno contenía `0192_`-`0195_`** (el tope en las dos era `0191_tenant_anchors.sql`). No hizo falta renumerar.

`origin/staging` estaba **28 commits adelante** de master, así que el push directo era imposible y se usó la rama descartable `tren/167-staging` basada en `origin/staging`, con merge `--no-ff` de la fase. Antes de ejecutarlo se comprobó que el merge era seguro: los 17 archivos que difieren entre master y staging (todos de CAJA/finance) **no intersectan** con los 83 de la fase.

Verificaciones del árbol resultante, sin leer el exit code del merge:

| Check                                      | Resultado                                                             |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `git status --short`                       | vacío                                                                 |
| Diff vs `origin/staging`                   | 83 archivos                                                           |
| `comm -3` contra el diff de fase           | **vacío** — ni un archivo de más ni de menos                          |
| Migraciones agregadas                      | solo 0192, 0193, 0194, 0195                                           |
| Deleciones                                 | cero                                                                  |
| `CONFLICT` impresos                        | ninguno (a diferencia de la 166, coherente con la intersección vacía) |
| `npx tsc --noEmit` sobre el árbol mergeado | limpio (12 s)                                                         |

Para el typecheck se symlinkeó `node_modules` desde `et-167-columnas/el-templo-api` — `el-templo-api/pnpm-lock.yaml` es byte-idéntico entre los dos worktrees, así que **cero instalaciones** (T-167-SC). El symlink se borró antes del push.

Push: `82309b11..6ef6acb5` a las **16:05:36Z**.

## Etapa B — CI y deploy de staging

Seguidos con **un solo poller cada 90 s** (9 requests), la lección de la 166 sobre el rate limit de la API pública de GitHub.

### CI — run [30283119722](https://github.com/francomiceli/el-templo/actions/runs/30283119722) `success` (16:05:39Z → 16:16:59Z)

Los 5 jobs verdes y **cero steps no-success en todo el run**: `API - Type Check & Build`, `API - Integration Tests`, `Web`, `Admin`, `App`. Ahí corrieron por primera vez en CI los dos archivos de test nuevos de la fase.

### Deploy Staging — run [30283119297](https://github.com/francomiceli/el-templo/actions/runs/30283119297) `success` (16:05:39Z → 16:18:39Z)

```
Detect Changes: solo API (Build Admin/Web/App SKIPPED)
Build API:      Type check OK · Run API tests OK · Build OK · Copy migration SQL files to dist OK
Deploy:         10. Backup current staging deployment    success
                16. Install API dependencies on staging  success   16:17:39 -> 16:17:42
                17. Run database migrations (staging)    success   16:17:42 -> 16:18:25  (43s)
                18. Restart staging API                  success
                19. Post-deploy smoke test               success
                21. Rollback staging on failure          SKIPPED
```

## Etapa C — verificación en `eltemplo_staging`

**Deploy path descubierto con `pm2 describe eltemplo-staging-api`:** `exec cwd = /opt/el-templo-staging/api`, confirmando el hallazgo de la 166 (`/var/www/staging` habría sido el path equivocado). `DB_NAME` del `.env.production` de ese path: `eltemplo_staging`. Password vía `MYSQL_PWD`, nunca en el argv.

Guard corrido **primero**, como statement separado, con corte previsto:

```
+------------------+-----------------+
| base_conectada   | host            |
+------------------+-----------------+
| eltemplo_staging | ip-172-31-22-53 |
+------------------+-----------------+
```

### Las 4 consultas

```
+----------------------+     +------------------+     +--------------------+
| q1_cols_notnull_def1 |     | q2_fks_a_tenants |     | q3_cols_en_exentas |
+----------------------+     +------------------+     +--------------------+
|                   87 |     |               88 |     |                  0 |
+----------------------+     +------------------+     +--------------------+

+--------------------------------+-------+
| name                           | veces |
+--------------------------------+-------+
| 0192_tenant_id_core_ops.sql    |     1 |
| 0193_tenant_id_core_comms.sql  |     1 |
| 0194_tenant_id_templo_spom.sql |     1 |
| 0195_tenant_id_templo_rest.sql |     1 |
+--------------------------------+-------+
```

Los 4 valores son los esperados: 87 columnas con `IS_NULLABLE='NO'` y `COLUMN_DEFAULT='1'`, 88 FKs a `tenants`, 0 columnas en las exentas, y las 4 migraciones una sola vez cada una (con `REGEXP '^019[2-5]_'`, no `LIKE`). `users`: 0 filas fuera de `tenant_id=1`.

### El falso negativo ternario que casi pasa por verde

El total de columnas `tenant_id` es **88**, no 87 — un delta de 1 contra el conteo que cumple `NOT NULL DEFAULT 1`. La primera consulta de detalle, escrita como `NOT (IS_NULLABLE='NO' AND COLUMN_DEFAULT='1')`, **devolvió vacío**, lo que se lee como "no hay nada raro". Era un falso negativo: `COLUMN_DEFAULT = '1'` sobre un `NULL` da `NULL`, `'NO' AND NULL` da `NULL`, y `NOT NULL` no matchea ninguna fila. Re-corrida con `COLUMN_DEFAULT IS NULL` explícito, la columna 88 aparece:

```
+-----------------+-------------+-------------+-------------+
| TABLE_NAME      | IS_NULLABLE | col_default | COLUMN_TYPE |
+-----------------+-------------+-------------+-------------+
| tenant_settings | NO          | (NULL)      | int         |
+-----------------+-------------+-------------+-------------+
```

`tenant_settings` es tabla de tenancy, no gym-owned: su `tenant_id` es clave hacia `tenants` sin default, creada por la fase 166. La aritmética cierra en 87 gym-owned + 1 = 88 columnas y 88 FKs. **Ninguna tabla gym-owned quedó nullable ni sin el default.**

### Verificador de COL-02 — `eltemplo_staging`, exit code 0

```
Base de datos: eltemplo_staging
========================================================================
Tablas gym-owned verificadas:   87
Aristas de FK declaradas:       122
Aristas logicas M9:             15 verificadas (9 declaradas, las heterogeneas se expanden por target_kind)
Cadenas hasta un ancla:         53

DDL incompleto (ddlMissing): 0
Exclusiones de diseno violadas (exemptViolations): 0
Tablas con filas apuntando a un tenant inexistente (badRows): 0
Aristas de FK con tenant inconsistente (fkMismatches): 0
Aristas logicas M9 con tenant inconsistente (logicalMismatches): 0
Cadenas donde el tenant derivado no coincide (derivationMismatches): 0

DISCREPANCIAS: 0

--- Casos legitimos e informativo (NO son discrepancias) ---

Tablas [SIN-ANCLA] (backfill directo = 1, es la verdad): 32
  academy_inquiries, activities, app_waitlist, aura_config, blog_post_tags, blog_posts,
  blog_tags, contraction_rules, cost_centers, day_modes, exercise_dimension_proposals,
  exercise_milestone_proposals, exercise_progressions, exercises, format_compatibility,
  formats, franchise_applications, gladius_inquiries, gladius_products, holidays,
  intensity_rules, notification_templates, plan_programs, program_content_blocks,
  programs, promo_plans, routes, spom_config, spom_rules, subscription_plans,
  weekly_rotator, wellhub_events

Filas parciales de la mina M4: 4 tabla(s)
  - cash_registers WHERE branch_id IS NULL: 6 fila(s)
  - financial_transactions WHERE member_id IS NULL AND branch_id IS NULL: 10 fila(s)
  - campaign_unsubscribes WHERE user_id IS NULL: 0 fila(s)
  - tv_pairings WHERE branch_id IS NULL: 2 fila(s)

Tablas con filas de tenant <> 1: 0

Warnings: 2
  - audit_log.target_id -> users.id [target_kind='member']: 1 fila huerfana
  - audit_log.target_id -> subscriptions.id [target_kind='subscription']: 1 fila huerfana
```

`https://api-staging.eltemplo.org/health` → **HTTP 200** desde fuera del servidor.

## Etapa D — push a producción (opción A)

`origin/master` seguía en `1af01b9a` y sin `019[2-5]_`. Sus 3 commits que la rama no tenía son fixes ajenos a la fase — `1af01b9a` (pase especial vs membresía en `/me/subscription`), `b3dd71ab` (regla de un turno/día por categoría), `e9104d2f` (firma hex en mayúsculas de Wellhub) — que tocan 8 archivos, **sin intersección** con los 83 de la fase.

**Decisión de la etapa D: opción A, merge `--no-ff` de `origin/master` dentro de la rama de fase.** El motivo es preservar los SHAs de los 6 commits de fase: un rebase los habría reescrito y habría invalidado todas las referencias cruzadas de los SUMMARY de los planes 01-06, que citan esos hashes como evidencia. El costo aceptado es un merge commit extra en master.

Verificaciones del árbol mergeado:

| Check                                          | Resultado                                               |
| ---------------------------------------------- | ------------------------------------------------------- |
| `git status --short`                           | vacío                                                   |
| Diff vs `origin/master`                        | 83 archivos, `comm -3` contra el diff de fase **vacío** |
| Migraciones agregadas                          | solo 0192-0195                                          |
| Deleciones                                     | cero                                                    |
| `merge-base --is-ancestor origin/master HEAD`  | sí → push fast-forward                                  |
| `merge-base --is-ancestor origin/staging HEAD` | **falla** → los 28 commits de staging no viajan         |
| `npx tsc --noEmit` + `pnpm run build`          | ambos limpios                                           |

Push `feat/167-tenant-columns:master`: `1af01b9a..68c447cf` a las **16:30:15Z**.

### CI — run [30285003319](https://github.com/francomiceli/el-templo/actions/runs/30285003319) `success` (16:30:17Z → 16:41:26Z)

Los 5 jobs verdes, cero steps no-success.

### Deploy — run [30285003332](https://github.com/francomiceli/el-templo/actions/runs/30285003332) `success` (16:30:17Z → 16:44:42Z)

```
Detect Changes: solo API (Build Web/Admin/App SKIPPED)
Build API:      Type check OK · Run API tests OK · Build OK · Copy migration SQL files to dist OK
Deploy:         10. Backup current deployment            success   16:42:24 -> 16:43:14  (50s)
                16. Install API dependencies on server   success   16:43:19 -> 16:43:22
                17. Run database migrations              success   16:43:22 -> 16:44:26  (64s)
                18. Restart API                          success
                19. Post-deploy smoke test               success
                21. Rollback on failure                  SKIPPED
```

### Duración del step de migraciones

| Entorno    | Duración | Contexto            |
| ---------- | -------- | ------------------- |
| local      | 67 s     | medición del Task 1 |
| staging    | **43 s** | 5725 users          |
| producción | **64 s** | 7131 users          |

Las tres mediciones están en el mismo orden de magnitud y muy por debajo del umbral de alarma de ~10 min que fijaba el plan. Que prod tarde ~50% más que staging es coherente con el volumen. **Esto dice que los ALTER tardaron lo previsto, no que hayan hecho lo correcto** — eso lo prueban las consultas y el verificador, no el reloj. Sin downtime observable: el `ADD COLUMN` sin `AFTER` es INSTANT en MySQL 8 y el smoke post-deploy pasó a la primera en los dos entornos.

## Etapa E — verificación en `eltemplo` (producción)

**Deploy path descubierto con `pm2 describe eltemplo-api`:** `exec cwd = /var/www/api`. `DB_NAME`: `eltemplo`. Guard primero, como statement separado:

```
+----------------+-----------------+
| base_conectada | host            |
+----------------+-----------------+
| eltemplo       | ip-172-31-22-53 |
+----------------+-----------------+
```

### Las 4 consultas — idénticas a staging

```
+----------------------+     +------------------+     +--------------------+
| q1_cols_notnull_def1 |     | q2_fks_a_tenants |     | q3_cols_en_exentas |
+----------------------+     +------------------+     +--------------------+
|                   87 |     |               88 |     |                  0 |
+----------------------+     +------------------+     +--------------------+

+--------------------------------+-------+       +-----------------+-------------+-------------+
| name                           | veces |       | TABLE_NAME      | IS_NULLABLE | col_default |
+--------------------------------+-------+       +-----------------+-------------+-------------+
| 0192_tenant_id_core_ops.sql    |     1 |       | tenant_settings | NO          | (NULL)      |
| 0193_tenant_id_core_comms.sql  |     1 |       +-----------------+-------------+-------------+
| 0194_tenant_id_templo_spom.sql |     1 |         (la columna 88, con COLUMN_DEFAULT IS NULL explicito)
| 0195_tenant_id_templo_rest.sql |     1 |
+--------------------------------+-------+
```

Población de producción: **7131 users y 9 branches, ninguno fuera de `tenant_id=1`.**

### Verificador de COL-02 — `eltemplo`, exit code 0

```
Base de datos: eltemplo
========================================================================
Tablas gym-owned verificadas:   87
Aristas de FK declaradas:       122
Aristas logicas M9:             15 verificadas
Cadenas hasta un ancla:         53

DDL incompleto (ddlMissing): 0
Exclusiones de diseno violadas (exemptViolations): 0
Tablas con filas apuntando a un tenant inexistente (badRows): 0
Aristas de FK con tenant inconsistente (fkMismatches): 0
Aristas logicas M9 con tenant inconsistente (logicalMismatches): 0
Cadenas donde el tenant derivado no coincide (derivationMismatches): 0

DISCREPANCIAS: 0

--- Casos legitimos e informativo (NO son discrepancias) ---

Tablas [SIN-ANCLA]: 32   (el mismo conjunto exacto que en staging)

Filas parciales de la mina M4: 4 tabla(s)
  - cash_registers WHERE branch_id IS NULL: 5 fila(s)
  - financial_transactions WHERE member_id IS NULL AND branch_id IS NULL: 0 fila(s)
  - campaign_unsubscribes WHERE user_id IS NULL: 0 fila(s)
  - tv_pairings WHERE branch_id IS NULL: 0 fila(s)

Tablas con filas de tenant <> 1: 0

Warnings: 2
  - completed_sessions.day_id -> sessions.day_id: 15449 fila(s) huerfana(s)
  - audit_log.target_id -> subscriptions.id [target_kind='subscription']: 1 fila huerfana
```

Nota: `badRows` (filas apuntando a un tenant inexistente) da 0 en las dos bases **porque el tenant 1 es el único que existe**. Es un 0 informativo: recién pasa a ser un dato útil cuando exista un tenant 2.

### Procesos y salud

```
│ 1 │ eltemplo-api         │ online │ uptime 13m │ 188.5mb │ unstable restarts: 0
│ 2 │ eltemplo-staging-api │ online │ uptime 39m │ 173.5mb │ unstable restarts: 0
```

Los uptimes son coherentes con los restarts de cada deploy (16:44:29Z prod, 16:18:27Z staging). `https://api.eltemplo.org/health` y `https://api-staging.eltemplo.org/health`: **HTTP 200** los dos desde fuera del servidor.

## Hallazgo abierto: la arista `completed_sessions.day_id`

El verificador de producción tiró 2 warnings, pero **no son los mismos dos de staging**. Uno es nuevo y grande:

```
Arista logica M9 con 15449 fila(s) huerfana(s): completed_sessions.day_id -> sessions.day_id
```

Cuantificado con consultas de solo lectura antes de reportarlo:

| Dato                                         | Valor              |
| -------------------------------------------- | ------------------ |
| `completed_sessions` total                   | 15.631 filas       |
| huérfanas (`day_id` sin match en `sessions`) | **15.449 = 98,8%** |
| filas con `day_id` NULL                      | 0                  |
| `day_id` distintos                           | 193                |
| `sessions` total                             | 1.730 filas        |
| `completed_sessions` con `tenant_id <> 1`    | **0**              |

**Qué NO es:** no es una discrepancia, no incumple ningún criterio de aceptación y no bloquea nada. El verificador da exit 0 y las 87 tablas están bien formadas. Todas esas filas están en `tenant_id = 1`, que hoy es correcto porque el tenant 1 es el único que existe.

**Qué sí es:** la arista lógica que el verificador usa para _derivar_ el tenant de `completed_sessions` no cubre casi nada en producción — el 98,8% de las filas apunta a un `day_id` inexistente en `sessions`. Para esa tabla, la verificación por derivación es efectivamente vacía en prod, y hoy queda respaldada solo por el backfill directo a 1. En staging el warning no aparece porque su `completed_sessions` no tiene ese histórico, lo que significa que **staging no habría detectado esto nunca**.

**Hipótesis NO verificada:** que la semántica de `day_id` difiera entre las dos tablas (en `completed_sessions` sería el identificador del día del programa, no una FK real a `sessions`). No se comprobó contra el modelo y **no debe darse por cierta**. Hay que mirar el modelo antes de decidir si la arista está mal declarada en la lista M9 o si la tabla necesita otra estrategia de derivación.

**Queda derivado a la fase de aislamiento (ISO-03 / fase 171):** cuando exista el tenant 2, esta arista no podrá validar la coherencia de tenant del grueso de `completed_sessions`. No se improvisó ningún fix sobre producción.

## Verificación contra `<verification>` del plan

| Criterio                                                                                          | Resultado                                                                              |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Gate local verde (typecheck, build, higiene de las 4 migraciones, verificador en 0, tests nuevos) | OK (Task 1, con 2 desvíos aceptados — abajo)                                           |
| Números de migración libres en `origin/master` y `origin/staging` al momento del push             | OK — tope `0191_` en las dos, cero `019[2-5]_`                                         |
| Staging: CI y deploy verdes a nivel de step                                                       | OK — los 5 steps exigidos                                                              |
| Staging: 4 consultas con los valores esperados                                                    | OK — 87 / 88 / 0 / 4×1                                                                 |
| Staging: verificador en 0                                                                         | OK — exit 0                                                                            |
| Prod: mismas consultas, mismos valores                                                            | OK — idénticos                                                                         |
| Prod: verificador en 0                                                                            | OK — exit 0                                                                            |
| `/health` 200 en los dos entornos y pm2 online sin unstable restarts                              | OK                                                                                     |
| Ningún push ni SSH sin aprobación explícita                                                       | OK — cuatro señales registradas                                                        |
| Smoke funcional por UI                                                                            | **PENDIENTE de UAT de Franco** (decisión explícita de cerrar el plan con esto abierto) |

## Deviations from Plan

**Cero desvíos de código.** Este plan no escribió ni modificó una línea. Los desvíos son del gate del Task 1 y de la mecánica del rollout.

**1. [Rule 3 - Bloqueo] `vitest` necesitó `--no-file-parallelism` para correr los dos archivos de test del gate**

- **Encontrado durante:** Task 1, paso 4
- **Problema:** el comando del plan corría `test/db/tenant-tables.test.ts` y `test/migrations/0192-0195-tenant-columns.test.ts` en paralelo; ambos golpean la misma base de test y se pisaban.
- **Fix:** se agregó `--no-file-parallelism` a la invocación local. **No afecta a CI**, que corre la suite completa con su propio provisioning — y de hecho los dos archivos pasaron verdes en los dos runs de CI de este plan.
- **Archivos modificados:** ninguno (cambio de invocación, no de código).

**2. [Rule 1 - Conteo] El diff de la fase son 83 archivos, no los 82 que predecía el plan**

- **Encontrado durante:** Task 1, paso 7
- **Problema:** el plan estimaba `3 + 28 + 8 + 23 + 17 + 3 = 82`. El real es 83.
- **Causa, verificada commit por commit:** el commit de la tanda C1 (`994b7d2f`) trae **29** archivos, no 28 — 27 schemas + la migración 0192 + `el-templo-api/src/modules/finance/balance-service.ts`, un ajuste de código que el plan 167-02 documentó como su propio desvío y que la estimación del 167-07 no incorporó. Ningún archivo aparece en más de un commit (`uniq -d` vacío), así que 83 es la suma exacta sin solapamiento.
- **Resolución:** desvío aceptado por Franco. El conteo 83 se usó como valor de referencia en todas las verificaciones de árbol posteriores (`comm -3` contra el diff de fase, en los dos merges).
- **Archivos modificados:** ninguno.

**3. [Decisión] Etapa D resuelta por opción A (merge `--no-ff`) en vez de rebase**

- Registrada arriba, en la etapa D. Motivo: preservar los SHAs que los SUMMARY 01-06 citan como evidencia.

### Hallazgos operativos que conviene no perder

- **El filtro `?branch=master` de la API de GitHub devolvió caché de julio 10** justo después del push a master: los runs recién creados no aparecían. El listado sin filtro (`/actions/runs?per_page=8`) sí los mostraba de inmediato. Si un run "no existe" tras un push, probar sin el filtro de rama antes de asumir que el pipeline no arrancó.
- **Los dos pushes reportaron `Bypassed rule violations: Changes must be made through a pull request`.** `staging` y `master` tienen protección de PR y la cuenta de Franco la saltea; queda en el audit log del repo. No es un error, pero el flujo actual la evade.
- **El fix de CI pre-autorizado (`MAX_TEST_WORKERS: 2` ante un `Hook timed out in 120000ms`) nunca se activó:** cero steps rojos en los cuatro runs. No se commiteó ni re-pusheó nada por ese motivo.

## Threat Model — cobertura verificada

| Threat ID | Disposición | Cómo quedó cubierto                                                                                                                                                                                                                        |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-167-32  | mitigate    | **Cubierto.** Rama descartable para staging + push de la rama de fase a master. `merge-base --is-ancestor origin/staging HEAD` falla: los 28 commits de staging no llegaron a prod. Árbol verificado archivo por archivo en los dos merges |
| T-167-33  | mitigate    | **Cubierto.** `SELECT DATABASE()` como statement separado y previo en las dos bases, con corte previsto, más el `DB_NAME` leído del `.env.production` de cada deploy path antes de conectar. Orden respetado: staging primero              |
| T-167-34  | mitigate    | **Cubierto.** Cuatro señales humanas separadas y registradas, más una quinta para el push del respaldo. Nunca se tocó master antes de tener staging verde y sus 4 consultas OK                                                             |
| T-167-35  | mitigate    | **Cubierto.** Medición local (67 s), medición en staging antes de prod (43 s) y medición en prod (64 s), todas muy por debajo del umbral de ~10 min. `ADD COLUMN` sin `AFTER`                                                              |
| T-167-36  | mitigate    | **Cubierto.** Este SUMMARY registra commits por entorno, resultado por step, conteos por base y salida completa del verificador en cada una                                                                                                |
| T-167-37  | mitigate    | **Cubierto.** `MYSQL_PWD` en vez de `-p` en las dos bases. El host aloja además `academy-api`, `asupca-api` y `sema-api`                                                                                                                   |
| T-167-SC  | mitigate    | **Cubierto.** Cero instalaciones. El typecheck del árbol mergeado se hizo con symlink al `node_modules` existente (lockfiles byte-idénticos)                                                                                               |

## Threat Flags

Ninguno. El plan no agrega superficie: no crea rutas, ni endpoints, ni accesos a archivos. Las conexiones SSH fueron de lectura pura (`SELECT` e `information_schema`), autorizadas de a una y contra una base por vez.

## Known Stubs

Ninguno.

## Etapa G — limpieza

- Antes de borrar nada se confirmó que el contenido estaba a salvo: `tren/167-staging` era `6ef6acb5`, exactamente `origin/staging`.
- Worktree `/home/franco/projects/et-167-staging`: **removido**.
- Rama local `tren/167-staging`: **borrada**. No queda ninguna rama `tren/*` local.
- `git ls-remote origin 'refs/heads/tren/*'`: **vacío** — la rama descartable nunca se publicó en origin (su contenido viajó como `tren/167-staging:staging`).
- **Conservados hasta el cierre de fase y el UAT:** worktree `/home/franco/projects/et-167-columnas` y rama `feat/167-tenant-columns` = `68c447cf`.
- Checkout compartido `/home/franco/projects/el-templo`: intacto durante todo el plan, sin un solo archivo de código de la fase.

## Etapa F — smoke funcional: PENDIENTE de UAT

**Franco decidió explícitamente cerrar el plan con esto pendiente**, igual que en la 166.

Lo que sí está verificado:

- El **smoke test del pipeline** pasó en los dos entornos (step 19 de cada deploy, `success`).
- `/health` responde 200 en staging y en prod desde fuera del servidor.
- Los procesos pm2 están `online` con 0 unstable restarts.
- La suite completa de CI corrió verde sobre el árbol de cada entorno.

Lo que falta y **solo puede hacer Franco por UI**:

- **Admin:** listado de socios, carga de un cobro, pantalla de reservas, reporte de deuda.
- **Member app:** que un socio vea sus planes y sus turnos.
- **Criterio:** ninguna pantalla muestra un error nuevo y los números son los mismos que ayer.

Hasta que ese UAT ocurra, el criterio de éxito 4 de la fase ("el staff no percibió ningún cambio") **está respaldado por el smoke del pipeline y por los tests de CI, no por observación directa del staff.**

## Next Phase Readiness

- **El tope de migración aplicado en producción pasó de `0191` a `0195`.** Cualquier fase que reserve un número tiene que partir de **0196**. Ya no hace falta consultar la rama `feat/167-tenant-columns`: las 4 migraciones viven en master y en las dos bases.
- **La fase 168 (uniques compuestas e índices por `tenant_id`) tiene su precondición cumplida en las dos bases:** las 87 columnas existen con FK, y el verificador de COL-02 corre contra cualquiera de ellas como red de seguridad de las conversiones de unique.
- **`origin/staging` y `origin/master` siguen divergiendo** por los 28 commits de CAJA/finance parados en staging desde antes. La 167 no los movió y **no requiere back-merge**: staging recibió el contenido de la fase en la etapa A. Ese tren sigue por su propio carril.
- **Deuda anotada para ISO-03:** la arista `completed_sessions.day_id -> sessions.day_id` (sección propia arriba).
- **Recordatorio del gate del milestone (no de esta fase):** el tenant 2 no se onboardea hasta que la batería de aislamiento (ISO-03) esté verde sobre el 100% de las rutas core `tenant-scoped`.
- **Blocker suave:** el smoke funcional de UAT. No bloquea planificar la 168, pero sí bloquea declarar la 167 cerrada.

## Self-Check: PASSED

- `origin/master` = `68c447cf33e1d32709796cac798a2fca0b321eba` — FOUND (`git ls-remote`)
- `origin/staging` = `6ef6acb538532b209d8fd3790a7533b68831d603` — FOUND
- `origin/feat/167-tenant-columns` = `68c447cf` — FOUND
- Runs `30283119722`, `30283119297`, `30285003319`, `30285003332` — los 4 con conclusión `success`, verificados a nivel de step
- `0192`-`0195` en `_migrations` de `eltemplo_staging` **y** de `eltemplo` — FOUND, una vez cada una
- `verify-tenant-backfill.js` exit 0 y 0 discrepancias en las dos bases — verificado en vivo
- `/home/franco/projects/et-167-staging` — ya no existe (limpieza confirmada)
- Rama `tren/167-staging` — borrada local, inexistente en origin
- Worktree `/home/franco/projects/et-167-columnas` y rama `feat/167-tenant-columns` — conservados

---

_Phase: 167-columnas-tenant-id-en-las-85-tablas-restantes-verificaci-n_
_Completed: 2026-07-27_
