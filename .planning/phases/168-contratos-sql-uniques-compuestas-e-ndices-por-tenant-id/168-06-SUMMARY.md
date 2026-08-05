---
phase: 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id
plan: 06
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
    unique-constraints,
  ]

# Dependency graph
requires:
  - "168-01 (worktree et-168-contratos y la migración 0196 escrita y aplicada en la base local)"
  - "168-02 (schema Drizzle alineado byte a byte con la 0196, con el .sql commiteado junto al schema)"
  - "168-03 (registro canónico de uniques, verificador fail-closed verify-tenant-uniques.ts y el 12º contrato)"
  - "168-04 (CON-01 probado por comportamiento cross-tenant en la base de test)"
  - "168-05 (los 12 contratos y el verificador convertidos en gate de CI)"
  - "167-07 (secuencia de rollout probada: etapas A-E, deploy paths reales, poller de 90 s, cuatro señales)"
provides:
  - "Migración 0196 aplicada exactamente una vez en eltemplo_staging y una vez en eltemplo, sin downtime y sin rollback"
  - "12 contratos de unicidad compuestos con tenant_id en SEQ_IN_INDEX=1 y los 12 nombres viejos ausentes, verificados por INFORMATION_SCHEMA en las DOS bases"
  - "4 índices secundarios NON_UNIQUE=1 en las dos bases"
  - "verify-tenant-uniques.js con 0 discrepancias y exit 0 en las DOS bases (CON-01 y CON-02 cerrados en producción)"
affects:
  - "169/170/171 (el gate fail-closed queda vivo en CI: toda unique global nueva sobre tabla gym-owned sin clasificar deja CI en rojo)"
  - "Cualquier fase que reserve número de migración: el tope aplicado en producción pasa de 0195 a 0196, y las fases siguientes reservan desde 0197"
  - "171/ISO-03 (el alta del tenant 2 ya no choca contra los 12 contratos que eran globales)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Push fast-forward de la rama de fase a master cuando master no se movió: preserva los SHAs de los commits que los SUMMARY citan como evidencia, sin merge commit y sin rebase"
    - "Verificación de contratos de índice en dos afirmaciones separadas contra la base real: presentes los 12 nuevos Y ausentes los 12 viejos"
    - "Los nombres de índice a verificar se extraen del .sql de la migración, no se tipean de memoria"

key-files:
  created:
    - .planning/phases/168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id/168-06-SUMMARY.md
  modified: []

key-decisions:
  - "El Task 1 NO armó el commit único que pedía el plan: los planes 01-05 ya habían commiteado todo atómicamente en 10 commits. Squashearlos habría reescrito SHAs que los cinco SUMMARY citan como evidencia — el mismo motivo por el que la 167 eligió merge --no-ff en vez de rebase. Se verificaron los invariantes reales del gate en vez de la forma del historial"
  - "Etapa D resuelta sin merge: origin/master seguía en 68c447cf, así que el push salió fast-forward y la rama de fase conserva sus 10 SHAs originales"
  - "Push a master de la RAMA DE FASE, nunca de la descartable tren/168-staging: los 29 commits de CAJA/finance parados en staging no viajaron a producción (verificado con merge-base --is-ancestor)"
  - "Deploy paths descubiertos con pm2 describe, no asumidos: /opt/el-templo-staging/api y /var/www/api"
  - "MYSQL_PWD como variable de entorno en las dos bases: el host EC2 aloja además academy-api, asupca-api y sema-api"
  - "El smoke funcional por UI queda PENDIENTE de UAT de Franco, igual que en las fases 166 y 167"

patterns-established:
  - "Un step de migración de 4 segundos no prueba nada: la heurística alreadyApplied del runner tolera 'Can't DROP', así que un DROP INDEX con el nombre equivocado sale verde en el deploy. Lo que prueba es la ausencia de los nombres viejos en INFORMATION_SCHEMA de la base real"

requirements-completed: [CON-01, CON-02]

# Metrics
duration: ~53min (Task 1 gate local ~8min + rollout ~45min, del push a staging al cierre de la limpieza)
completed: 2026-07-27
---

# Phase 168 Plan 06: Rollout staging-first de la tanda D Summary

**Los 12 contratos de unicidad de tablas gym-owned pasaron a `UNIQUE (tenant_id, ...)` primero en `eltemplo_staging` y después en `eltemplo`, sin downtime y sin rollback: las dos bases tienen los 12 compuestos con `tenant_id` en `SEQ_IN_INDEX = 1`, los 12 nombres viejos extinguidos y los 4 índices secundarios vivos, con `verify-tenant-uniques.js` en 0 discrepancias y exit 0 en ambas — respetando las cuatro señales humanas y sin que los 29 commits parados en staging tocaran producción.**

## Performance

- **Duration:** ~53 min. Task 1 (gate local) 20:54:23Z → 21:02:38Z. Rollout: push a staging 21:10:01Z → limpieza ~21:55Z.
- **Completed:** 2026-07-27
- **Tasks:** 2 (1 auto + 1 checkpoint bloqueante con cuatro señales humanas)
- **Files modified:** 0 de código. Este plan no escribió una línea: el entregable son los dos deploys y esta evidencia.

## Commits desplegados por entorno

| Entorno                          | Ref                             | SHA        | Contenido                                                                    |
| -------------------------------- | ------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| **staging** (`eltemplo_staging`) | `origin/staging`                | `f934693c` | merge `--no-ff` de la fase sobre los 29 commits que staging ya tenía         |
| **producción** (`eltemplo`)      | `origin/master`                 | `1200b8af` | los 10 commits de la fase, fast-forward. **Cero commits propios de staging** |
| rama de la fase                  | `origin/feat/168-contratos-sql` | `1200b8af` | respaldada en origin                                                         |

Los 10 commits de la fase, presentes en los dos entornos:

```
ec835050 feat(168-02): uniques compuestas por tenant en el schema Drizzle + migración 0196
5d5c0bc7 docs(168-02): anotar las 11 uniques que quedan tenant-globales (lista M8)
758f2aa3 feat(168-03): registro canónico de uniques globales con motivo obligatorio
44618ca2 feat(168-03): verificador fail-closed de uniques e índices por tenant_id
ba37a148 feat(168-03): 12º contrato — subscription_plans (tenant_id, name, country)
2c1af25f test(168-04): CON-01 por comportamiento — users y branches cross-tenant
a0216641 test(168-04): los 8 contratos restantes de CON-01, con la mina M3 y el 12º
55c4059f test(168-05): introspección de la 0196 — los 12 contratos compuestos
dbff616f test(168-05): el verificador de uniques como gate fail-closed de CI
1200b8af test(168-05): gate anti-podredumbre de los registros de uniques
```

**Los 29 commits propios de staging (CAJA/finance) NO viajaron a producción.** Verificado con `git merge-base --is-ancestor origin/staging HEAD`, que falla. Era el riesgo central del plan (T-168-24) y es exactamente el accidente de la fase 78.

## Las cuatro señales humanas

| Momento (UTC) | Señal                                | Alcance habilitado                                                                                                                         |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ~21:07        | **"aprobado staging"**               | Etapas A y B: push de la rama a `origin` y a `staging` vía rama descartable, y la espera de CI/deploy. Explícitamente sin SSH y sin master |
| ~21:26        | **"autorizado SSH para staging"**    | Etapa C: solo lectura contra `eltemplo_staging`. Prod excluido                                                                             |
| ~21:32        | **"aprobado prod"**                  | Etapa D: push a master y la espera de CI/deploy de producción. El listado de los 10 commits se mostró antes                                |
| ~21:48        | **"autorizado SSH para producción"** | Etapa E: solo lectura contra `eltemplo`, más el cierre del plan                                                                            |

Ningún push ni acceso SSH ocurrió sin su señal correspondiente.

## Task 1 — gate local (sin push)

`git fetch` previo: `origin/master` = `68c447cf` y `origin/staging` = `6ef6acb5`, con tope `0195_` en las dos y **cero `0196_` en ninguna rama remota** (barrido completo de `refs/remotes/origin/`, no solo las dos ramas de deploy). No hizo falta renumerar.

| Check                                           | Resultado                                                      |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `tsc --noEmit` (binario local del proyecto)     | exit 0                                                         |
| `verify-tenant-uniques` contra `eltemplo` local | exit 0, `DISCREPANCIAS: 0`, M8 11/11                           |
| `test/migrations/0196-tenant-unique-contracts`  | 12/12 (`--no-file-parallelism`, 105 s)                         |
| `test/db/tenant-tables.test.ts`                 | 12/12 (100 s), con los 5 tests de la 167 intactos              |
| `test/tenancy/con-01-uniques-cross-tenant`      | 14/14 (104 s)                                                  |
| Contaminación en `eltemplo_test_1`              | `tenants` = 1, 0 filas del tenant 90168                        |
| `git status --short`                            | vacío                                                          |
| Diff vs `origin/master`                         | 20 archivos, `comm -3` contra la unión de los 10 commits vacío |
| Migraciones agregadas / deleciones              | exactamente 1 / cero                                           |
| `package.json` / `pnpm-lock.yaml`               | +1 línea (`db:verify-uniques`) / sin tocar. Cero installs      |

Los tres archivos se corrieron **de a uno**: correr más de uno a la vez revienta el timeout de 120 s del provisioning en esta máquina (condición preexistente documentada en 168-05).

## Etapa A — push de la rama y merge a staging

Re-verificación con `git fetch` inmediatamente antes: los dos SHAs idénticos a los del Task 1 y cero `0196_` ajena.

`origin/staging` estaba **29 commits adelante** de master, así que el push directo era imposible y se usó la rama descartable `tren/168-staging` en el worktree aislado `/home/franco/projects/et-168-staging`, basada en `origin/staging`, con merge `--no-ff`. Antes del merge se comprobó que era seguro: los **24 archivos** que difieren entre master y staging (todos CAJA/finance/wellhub) **no intersectan** con los 20 de la fase.

| Check                                  | Resultado                                    |
| -------------------------------------- | -------------------------------------------- |
| `CONFLICT` impresos                    | ninguno, coherente con la intersección vacía |
| `git status --short`                   | vacío                                        |
| Diff vs `origin/staging`               | 20 archivos                                  |
| `comm -3` contra el diff de fase       | **vacío**                                    |
| Migraciones agregadas                  | solo la 0196                                 |
| Deleciones                             | cero                                         |
| `tsc --noEmit` sobre el árbol mergeado | exit 0                                       |

Para el typecheck se symlinkeó `node_modules` desde `et-167-columnas` tras verificar con `cmp` que el `pnpm-lock.yaml` es byte-idéntico **y** que `package.json` no difiere entre master y staging. **Cero instalaciones.** El symlink se borró antes del push.

Push a staging **21:10:01Z**: `6ef6acb5..f934693c`. Respaldo de la rama en `origin/feat/168-contratos-sql`.

**Qué más viajó a staging, dicho explícitamente:** además de los 10 commits de la fase, el merge llevó `68c447cf` —el tip de master, base de la rama de fase— con los 3 fixes que ya estaban en producción y staging no tenía (pase especial vs membresía, regla de un turno/día por categoría, firma hex de Wellhub). Es el **back-merge master→staging que el skill de change-control declara obligatorio**: staging se acerca a prod, no se aleja.

## Etapa B — CI y deploy de staging

Seguidos con **un solo poller cada 90 s** (10 polls), sin el filtro `?branch=` (lección de la 167: devuelve caché).

### CI — run [30305699087](https://github.com/francomiceli/el-templo/actions/runs/30305699087) `success` (21:10:34Z → ~21:22Z)

Los 5 jobs verdes y cero steps no-success: `API - Integration Tests`, `API - Type Check & Build`, `Web`, `Admin`, `App`. Ahí corrieron por primera vez en CI los tres archivos de test de la fase.

### Deploy Staging — run [30305699098](https://github.com/francomiceli/el-templo/actions/runs/30305699098) `success` (21:10:34Z → 21:24Z)

```
Detect Changes: solo API (Build Web/Admin/App SKIPPED)
Build API:      Install deps OK · Run API tests OK (10m18s) · Build OK · Copy migration SQL to dist OK
Deploy:         10. Backup current staging deployment    success   21:22:23 -> 21:22:52
                16. Install API dependencies on staging  success   21:22:56 -> 21:23:00
                17. Run database migrations (staging)    success   21:23:00 -> 21:23:04  (4s)
                18. Restart staging API                  success
                19. Post-deploy smoke test               success
                21. Rollback staging on failure          SKIPPED
```

## Etapa C — verificación en `eltemplo_staging`

**Deploy path descubierto con `pm2 describe eltemplo-staging-api`:** `exec cwd = /opt/el-templo-staging/api`. `DB_NAME` leído del `.env.production` de ese path: `eltemplo_staging`, con corte previsto si daba otra cosa. Password vía `MYSQL_PWD`, nunca en el argv.

Guard corrido **primero y como statement separado**:

```
base_conectada     host
eltemplo_staging   ip-172-31-22-53
```

### Las consultas

```
name                               veces          nuevos_con_tenant_primero  viejos_sobrevivientes  secundarios_no_unique
0196_tenant_unique_contracts.sql   1              12                         0                      4
```

Los 12 contratos, todos con `NON_UNIQUE = 0` y `tenant_id` en `SEQ_IN_INDEX = 1`:

```
uq_branches_tenant_code (2)                 uq_notification_templates_tenant_key (2)
uq_campaign_unsubscribes_tenant_email (2)   uq_promo_plans_tenant_promo_code (2)
uq_cost_centers_tenant_name_country (3)     uq_subscription_plans_tenant_name_country (3)
uq_day_modes_tenant_day_of_week (2)         uq_users_tenant_dni (2)
uq_formats_tenant_name (2)                  uq_users_tenant_email (2)
uq_holidays_tenant_country_date (3)         uq_users_tenant_referral_code (2)
```

Los 3 contratos de tres columnas, columna por columna: `cost_centers` = `tenant_id, name, country`; `holidays` = `tenant_id, country, date`; `subscription_plans` = `tenant_id, name, country`. Verificar solo la primera columna habría dejado pasar una unique degradada a `(tenant_id, name)`, más restrictiva que el contrato.

Los nombres de índice se extrajeron del `.sql` de la 0196, no se tipearon de memoria.

### CON-02 en `subscription_plans` — pasó lo previsto

```
INDEX_NAME                                 NON_UNIQUE      CONSTRAINT_NAME                REFERENCED_TABLE_NAME
uq_subscription_plans_tenant_name_country  0               fk_subscription_plans_tenant   tenants
```

InnoDB dropeó solo el índice auto-creado `fk_subscription_plans_tenant` porque la unique compuesta nueva ya sirve a la FK. **La FK sigue viva** y el prefijo `tenant_id` queda cubierto: `tablesWithoutTenantIndex` da 0. Exactamente lo que el 168-03 registró en local y anticipó para los dos entornos.

### Verificador — `eltemplo_staging`, exit 0

```
Base de datos: eltemplo_staging
Tablas gym-owned verificadas:   87
Uniques gym-owned evaluadas:    60

uniquesMissingTenantPrefix: 0
tablesWithoutTenantIndex:   0
unclassifiedTables:         0
staleClassifications:       0
missingConvertedContracts:  0

DISCREPANCIAS: 0

Advertencias (NO son discrepancias):
  - Tablas de backup: exercises_video_backup_20260725, session_blocks_backup_20260327,
    session_prescriptions_backup_20260327, sessions_backup_20260327, users_lead_backup_0170,
    users_lead_backup_0183, weekly_rotator_backup_20260327
  - Uniques M8 correctamente clasificadas como globales: 11 de 11
```

Corrido sobre la build compilada (`dist/db/scripts/verify-tenant-uniques.js`, con fecha del deploy), o sea el **mismo código** que corre en CI.

## Etapa D — push a producción (fast-forward, sin merge)

`git fetch` fresco: **`origin/master` seguía exactamente en `68c447cf`**, así que no hizo falta ningún merge. El push salió fast-forward y la rama de fase **conserva sus 10 SHAs originales**, los mismos que citan como evidencia los SUMMARY de los planes 01-05. Cero `0196_` ajena.

Los commits que viajaron son **exactamente los 10 mostrados a Franco antes de aprobar** — verificado con `comm -3` contra la lista aprobada, resultado vacío.

| Check                                          | Resultado                                           |
| ---------------------------------------------- | --------------------------------------------------- |
| `git status --short`                           | vacío                                               |
| Diff vs `origin/master`                        | 20 archivos, `comm -3` contra el diff de fase vacío |
| Migraciones agregadas / deleciones             | solo la 0196 / cero                                 |
| `tsc --noEmit`                                 | exit 0 (symlink tras `cmp`, borrado antes del push) |
| `merge-base --is-ancestor origin/master HEAD`  | sí → fast-forward                                   |
| `merge-base --is-ancestor origin/staging HEAD` | **falla** → los 29 commits de staging no viajan     |

Push `feat/168-contratos-sql:master` **21:33:16Z**: `68c447cf..1200b8af`.

### CI — run [30307350316](https://github.com/francomiceli/el-templo/actions/runs/30307350316) `success`

Los 5 jobs verdes, cero steps no-success.

### Deploy — run [30307350305](https://github.com/francomiceli/el-templo/actions/runs/30307350305) `success` (21:33:30Z → 21:47Z)

```
Detect Changes: solo API (Build Web/Admin/App SKIPPED)
Build API:      Install deps OK · Run API tests OK (10m02s) · Build OK · Copy migration SQL to dist OK
Deploy:         10. Backup current deployment           success   21:45:29 -> 21:46:17  (48s)
                16. Install API dependencies on server  success   21:46:21 -> 21:46:25
                17. Run database migrations             success   21:46:25 -> 21:46:29  (4s)
                18. Restart API                         success   21:46:29 -> 21:46:31
                19. Post-deploy smoke test              success   21:46:31 -> 21:46:42
                21. Rollback on failure                 SKIPPED
```

### Duración del step de migraciones, y por qué no prueba nada

| Entorno    | Duración |
| ---------- | -------- |
| staging    | **4 s**  |
| producción | **4 s**  |

Comparado con los 43 s / 64 s de la 167 (que eran `ADD COLUMN` sobre 87 tablas), 4 s es coherente con 10 `ALTER` de índices. Pero **el reloj no dice que hayan hecho lo correcto**: la heurística `alreadyApplied` del runner tolera `"Can't DROP"`, así que un `DROP INDEX` con el nombre equivocado habría dejado el deploy en verde, la fila igual en `_migrations` y la unique vieja —global— viva rechazando el alta del segundo gimnasio. Lo que sí lo prueba es `viejos_sobrevivientes = 0` contra `INFORMATION_SCHEMA` de cada base real.

## Etapa E — verificación en `eltemplo` (producción)

**Deploy path descubierto con `pm2 describe eltemplo-api`:** `exec cwd = /var/www/api`. `DB_NAME`: `eltemplo`. Guard primero, como statement separado:

```
base_conectada   host
eltemplo         ip-172-31-22-53
```

### Las consultas — idénticas a staging

```
name                               veces          nuevos_con_tenant_primero  viejos_sobrevivientes  secundarios_no_unique
0196_tenant_unique_contracts.sql   1              12                         0                      4
```

Los 12 contratos con el mismo `NON_UNIQUE = 0` y `tenant_id` primero, los 3 de tres columnas en el orden exacto, y `subscription_plans` con la unique compuesta cubriendo el prefijo y `fk_subscription_plans_tenant` viva apuntando a `tenants`.

Población de producción: **7135 users, 130 planes de suscripción, 1 tenant, y ninguna fila fuera de `tenant_id = 1`.**

### Verificador — `eltemplo`, exit 0

```
Base de datos: eltemplo
Tablas gym-owned verificadas:   87
Uniques gym-owned evaluadas:    60

uniquesMissingTenantPrefix: 0
tablesWithoutTenantIndex:   0
unclassifiedTables:         0
staleClassifications:       0
missingConvertedContracts:  0

DISCREPANCIAS: 0

Advertencias (NO son discrepancias):
  - Tablas de backup: session_blocks_backup_20260327, session_prescriptions_backup_20260327,
    sessions_backup_20260327, users_lead_backup_0170, users_lead_backup_0183,
    weekly_rotator_backup_20260327
  - Uniques M8 correctamente clasificadas como globales: 11 de 11
```

El conjunto de tablas de backup difiere entre bases (staging tiene además `exercises_video_backup_20260725`) y **no es un problema**: es exactamente la categoría que el 168-03 diseñó como warning por patrón de nombre para que la asimetría entre bases no bloqueara un rollout.

### Procesos y salud

```
│ 1 │ eltemplo-api         │ online │ uptime 12m │ 202.4mb │ unstable restarts: 0
│ 2 │ eltemplo-staging-api │ online │ uptime 36m │ 171.8mb │ unstable restarts: 0
```

Los uptimes son coherentes con los restarts de cada deploy (21:46:31Z prod, 21:23:07Z staging). `https://api.eltemplo.org/health` y `https://api-staging.eltemplo.org/health`: **HTTP 200** los dos desde fuera del servidor.

## Verificación contra `<verification>` del plan

| Criterio                                                                        | Resultado                                                         |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `_migrations` con una sola fila de la 0196 en las dos bases                     | OK — 1 y 1                                                        |
| Verificador con exit 0 y 0 discrepancias en las dos bases                       | OK — con el nombre de la base en la primera línea de cada reporte |
| Los 12 compuestos con `tenant_id` en `SEQ_IN_INDEX = 1`, los 12 viejos ausentes | OK — 12 / 0 en las dos bases                                      |
| Los 4 índices secundarios con `NON_UNIQUE = 1`                                  | OK — 4 en las dos bases                                           |
| `merge-base --is-ancestor origin/staging HEAD` falla antes del push a master    | OK                                                                |
| CI verde en staging, con integration tests incluido                             | OK — 5 jobs, cero steps no-success                                |
| Deploy de producción sin rollback y smoke verde                                 | OK — step 21 SKIPPED                                              |
| Cada push y cada SSH precedido por su señal, registrada con hora y alcance      | OK — cuatro señales                                               |
| Ningún commit ajeno a la fase 168 en el push a master                           | OK — los 10 aprobados, `comm -3` vacío                            |
| Smoke funcional por UI                                                          | **PENDIENTE de UAT de Franco** (mismo criterio que 166 y 167)     |

## Deviations from Plan

**Cero desvíos de código.** Este plan no escribió ni modificó una línea de código. Los desvíos son del gate del Task 1 y de la mecánica del rollout.

**1. [Rule 3 - Bloqueo] El Task 1 no armó el commit único que pedía el plan**

- **Encontrado durante:** Task 1, antes de stagear nada.
- **Problema:** el Task 1 asume que los artefactos de los planes 01-05 están sin commitear y pide "armar UN solo commit". La realidad es que los cinco planes ya commitearon todo atómicamente en **10 commits** sobre `origin/master`. Cumplir la letra del plan exigía squashear, y eso reescribe SHAs que los cinco SUMMARY citan como evidencia — el mismo motivo por el que la 167 eligió merge `--no-ff` en vez de rebase en su etapa D.
- **Fix:** no se reescribió historia. Se verificaron los **invariantes reales** del gate, que son los que la instrucción protege: working tree limpio, diff contra `origin/master` con exactamente los archivos de los planes 01-05 y ninguno más (`comm -3` contra la unión de los 10 commits, vacío), exactamente una migración agregada, cero deleciones, y ningún commit ajeno a la fase entre `origin/master` y HEAD.
- **Archivos modificados:** ninguno.

**2. [Rule 1 - Conteo] El diff de la fase son 20 archivos, no los 19 que predecía el plan**

- **Encontrado durante:** Task 1, verificación del diff.
- **Problema:** el plan enumera migración + **12** schema files + `tenant-tables.ts` + verificador + `package.json` + 3 tests = 19. El real es 20.
- **Causa, verificada commit por commit:** los schema files tocados son **13**, no 12 — los 12 del plan 168-02 más `subscription-plans.ts`, que sumó el 168-03 al convertir el 12º contrato descubierto por el gate fail-closed. La estimación del plan 06 se escribió antes de ese hallazgo.
- **Resolución:** el conteo 20 se usó como valor de referencia en todas las verificaciones de árbol posteriores (`comm -3` en el merge a staging y antes del push a master, ambos vacíos).
- **Archivos modificados:** ninguno.

**3. [Rule 3 - Bloqueo] El symlink de `node_modules` ensuciaba `git status`**

- **Encontrado durante:** Task 1, primera lectura del estado del worktree.
- **Problema:** la regla de `.gitignore` es `node_modules/` con barra, que matchea directorios; el `node_modules` del worktree es un **symlink**, así que git lo veía untracked y `git status --short` nunca daba vacío. El criterio de aceptación del Task 1 y su comando automatizado exigen árbol limpio.
- **Fix:** se borró el symlink al cerrar el gate (`rm` sobre el link, sin `-r` y sin barra final, así que el target del worktree 167 quedó intacto) y se recreó exactamente cuando hizo falta para cada typecheck del árbol mergeado, siempre tras `cmp` del lockfile, borrándolo de nuevo antes de cada push. Cero instalaciones en toda la fase.
- **Archivos modificados:** ninguno del repo.

**4. [Decisión] Etapa D sin merge**

`origin/master` no se movió entre el Task 1 y la señal 3, así que el push salió fast-forward. Es el mejor caso de la opción A de la 167: se preservan los SHAs sin siquiera pagar el merge commit.

### Hallazgos operativos que conviene no perder

- **Los dos pushes reportaron `Bypassed rule violations: Changes must be made through a pull request`.** `staging` y `master` tienen protección de PR y la cuenta de Franco la saltea, quedando en el audit log del repo. Mismo comportamiento que en la 167.
- **El step de migraciones tardó lo mismo (4 s) en las dos bases** pese a que prod tiene 7135 users y staging 5725: el costo lo domina el rebuild de índices de tablas chicas, no el volumen de `users`.
- **El conjunto de tablas de backup difiere entre bases** (7 en staging, 6 en prod, 2 en local). El diseño del verificador —warning por patrón de nombre, nunca discrepancia— fue lo que evitó que esa asimetría frenara el rollout.

## Threat Model — cobertura verificada

| Threat ID | Disposición | Cómo quedó cubierto                                                                                                                                                                                                                                    |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-168-24  | mitigate    | **Cubierto.** Rama descartable para staging y push de la RAMA DE FASE a master. `merge-base --is-ancestor origin/staging HEAD` falla: los 29 commits de staging no llegaron a prod. Árbol verificado archivo por archivo en los dos destinos           |
| T-168-25  | mitigate    | **Cubierto.** `SELECT DATABASE()` como statement separado y previo en las dos bases, con corte previsto, más el `DB_NAME` leído del `.env.production` de cada deploy path antes de conectar. Orden respetado: staging primero                          |
| T-168-26  | mitigate    | **Cubierto.** Cuatro señales humanas separadas, cada una habilitando solo su etapa, registradas arriba con hora y alcance. Ningún push ni SSH sin la suya                                                                                              |
| T-168-27  | mitigate    | **Cubierto.** `MYSQL_PWD` como variable de entorno en las dos bases, nunca `-p` en el argv. El host aloja además `academy-api`, `asupca-api` y `sema-api`                                                                                              |
| T-168-28  | accept      | **Sin incidente.** Un solo `ALTER` por tabla, probado en local y en staging antes de prod. 4 s en cada entorno, sin downtime observable y con smoke post-deploy verde a la primera                                                                     |
| T-168-29  | mitigate    | **Cubierto.** `git fetch` y barrido de `0196_` sobre TODAS las ramas remotas en el Task 1 y otra vez antes de cada push. Nunca apareció una ajena                                                                                                      |
| T-168-30  | mitigate    | **Cubierto y es el corazón de esta evidencia.** El verificador corrió contra cada base real DESPUÉS de su deploy, y las consultas exigen presentes los 12 nuevos **y ausentes los 12 viejos** — dos afirmaciones distintas, porque la suite no alcanza |
| T-168-SC  | mitigate    | **Cubierto.** Cero instalaciones. Los typechecks usaron symlink al `node_modules` del worktree 167 tras verificar el lockfile byte-idéntico con `cmp`, y el symlink se borró antes de cada push                                                        |

## Threat Flags

Ninguno. El plan no agrega superficie: no crea rutas, ni endpoints, ni accesos a archivos. Las conexiones SSH fueron de lectura pura (`SELECT` e `information_schema`), autorizadas de a una y contra una base por vez.

## Known Stubs

Ninguno.

## Limpieza

- Antes de borrar nada se confirmó que el contenido estaba a salvo: `tren/168-staging` era `f934693c`, exactamente `origin/staging`.
- Worktree `/home/franco/projects/et-168-staging`: **removido**.
- Rama local `tren/168-staging`: **borrada**. No queda ninguna rama `tren/*` local.
- `git ls-remote origin 'refs/heads/tren/*'`: **vacío** — la rama descartable nunca se publicó en origin.
- **Conservados hasta el cierre de fase y el UAT:** worktree `/home/franco/projects/et-168-contratos` y rama `feat/168-contratos-sql` = `1200b8af`.
- Checkout compartido `/home/franco/projects/el-templo`: intacto durante todo el plan, en `fix/referral-preview-y-refresh-ficha` y sin un solo archivo de código de la fase. Solo recibió los docs de planning.

## Smoke funcional por UI: PENDIENTE de UAT

**Franco decidió cerrar el plan con esto pendiente**, igual que en las fases 166 y 167.

Lo que sí está verificado:

- El **smoke test del pipeline** pasó en los dos entornos (step 19 de cada deploy).
- `/health` responde 200 en staging y en prod desde fuera del servidor.
- Los procesos pm2 están `online` con 0 unstable restarts.
- La suite completa de CI corrió verde sobre el árbol de cada entorno, incluidos los 38 tests nuevos de la fase.
- **CON-01 está probado por comportamiento** en la base de test: los mismos valores se aceptan cross-tenant y se siguen rechazando con `ER_DUP_ENTRY` dentro del mismo tenant.

Lo que falta y **solo puede hacer Franco por UI**, para el criterio 5 del ROADMAP (cero cambio de comportamiento para el staff):

- Dar de alta un socio con un **DNI que ya exista** y ver que lo sigue rechazando.
- Crear una **sede con un código repetido** y ver lo mismo.
- Que el listado de socios, la carga de un cobro y el reporte de deuda no muestren ningún error nuevo.

## Next Phase Readiness

- **El tope de migración aplicado en producción pasó de `0195` a `0196`.** Las fases 169 en adelante reservan desde **0197**. Ya no hace falta consultar la rama de la fase: la 0196 vive en master y en las dos bases.
- **CON-01 y CON-02 quedan cerrados contra las dos bases reales**, que era la condición que los planes 01-05 dejaron explícitamente pendiente para este momento.
- **El gate fail-closed queda vivo en CI después de la fase:** cualquier fase futura (169, 170, 171, módulos) que agregue una unique global sobre una tabla gym-owned sin clasificarla deja CI en rojo, con el mensaje que explica las dos salidas.
- **`origin/staging` y `origin/master` siguen divergiendo** por los 29 commits de CAJA/finance parados en staging. La 168 no los movió y **no requiere back-merge**: staging recibió el contenido de la fase en la etapa A.
- **Deuda heredada de la 167, sin cambios:** la arista lógica `completed_sessions.day_id -> sessions.day_id` no cubre el 98,8% de las filas en producción. Sigue derivada a ISO-03 / fase 171.
- **Blocker suave:** el smoke funcional de UAT. No bloquea planificar la 169, pero sí bloquea declarar la 168 cerrada.

## Self-Check: PASSED

- `origin/master` = `1200b8af2a632396416572ccd40cebeb39f504fd` — FOUND (`git ls-remote`)
- `origin/staging` = `f934693c7f7ad60a69b82721ee0c95ed9d8ad4e7` — FOUND
- `origin/feat/168-contratos-sql` = `1200b8af` — FOUND
- Runs `30305699087`, `30305699098`, `30307350316`, `30307350305` — los 4 con conclusión `success`, verificados a nivel de job y de step
- `0196_tenant_unique_contracts.sql` en `_migrations` de `eltemplo_staging` **y** de `eltemplo` — FOUND, una vez en cada una
- 12 contratos presentes / 12 nombres viejos ausentes / 4 secundarios — verificado por `INFORMATION_SCHEMA` en las dos bases
- `verify-tenant-uniques.js` exit 0 y 0 discrepancias en las dos bases — verificado en vivo
- `/home/franco/projects/et-168-staging` — ya no existe (limpieza confirmada)
- Rama `tren/168-staging` — borrada local, inexistente en origin
- Worktree `/home/franco/projects/et-168-contratos` y rama `feat/168-contratos-sql` — conservados

---

_Phase: 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id_
_Completed: 2026-07-27_
