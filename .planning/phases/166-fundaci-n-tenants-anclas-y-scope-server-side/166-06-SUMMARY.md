---
phase: 166-fundaci-n-tenants-anclas-y-scope-server-side
plan: 06
subsystem: deployment
tags: [rollout, staging-first, migrations, mysql, ci-cd, multi-tenancy, saas]

# Dependency graph
requires:
  - "166-03 (evidencia automatizada del DDL de las tandas A y B)"
  - "166-05 (regresion dirigida verde + inventario cerrado del diff en 10 archivos)"
provides:
  - "Migraciones 0190 y 0191 aplicadas en eltemplo_staging y en eltemplo (prod), una vez cada una"
  - "tenants con una unica fila (1, El Templo, el-templo, active) en las DOS bases"
  - "users y branches al 100% en tenant_id=1 en las DOS bases (5725/9 en staging, 7105/9 en prod)"
  - "Secuencia de rollout reutilizable para cuando staging esta adelantado respecto de master (rama descartable, sin arrastrar los commits de staging a prod)"
affects:
  - "167-176 (la numeracion 0190/0191 deja de estar reservada en una rama: ya vive en master y en prod)"
  - "Cualquier fase que reserve numero de migracion: el tope aplicado en prod pasa de 0189 a 0191"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cuando staging diverge de master, la rama de fase se lleva a staging por una rama DESCARTABLE basada en origin/staging — nunca mergeando staging dentro de la rama de fase, porque el push posterior a master arrastraria los commits de staging a produccion"
    - "El merge de la estrategia ort puede imprimir CONFLICT durante la construccion de la base virtual (historia criss-cross) y aun asi cerrar en exit 0 sin paths sin resolver: hay que verificar el arbol resultante archivo por archivo, no leer el exit code"
    - "Typecheck del arbol MERGEADO antes del push: esa combinacion (staging + fase) no existio nunca en CI ni en local"
    - "SELECT DATABASE() como primer statement de toda verificacion sobre el host compartido, y consulta en dos pasos (guard primero, conteos despues) para poder cortar antes de leer la base equivocada"

key-files:
  created:
    - .planning/phases/166-fundaci-n-tenants-anclas-y-scope-server-side/166-06-SUMMARY.md
  modified: []

key-decisions:
  - "Rama descartable tren/166-staging basada en origin/staging para el merge, en vez de mergear staging dentro de feat/166-tenancy-fundacion"
  - "Push a master como fast-forward de la rama de fase (5 commits / 10 archivos), NO como merge del arbol de staging: los 25 commits de CAJA/finance parados en staging no viajaron a prod"
  - "Deploy paths descubiertos con pm2 describe en vez de asumidos: staging resulto /opt/el-templo-staging/api, no /var/www/staging"
  - "MYSQL_PWD en vez de -p en la linea de comando, para no exponer la password en el argv de un host compartido"

patterns-established:
  - "Confirmar el resultado de CI a nivel de STEP (migraciones, restart, smoke, rollback skipped), no a nivel de badge ni de conclusion del run"

requirements-completed: [FUND-01, FUND-02, FUND-03, FUND-04]

# Metrics
duration: ~2h45min
completed: 2026-07-27
---

# Phase 166 Plan 06: Rollout staging-first de la fundación de tenancy Summary

**Las migraciones 0190 y 0191 corrieron verdes primero en `eltemplo_staging` y después en `eltemplo`, sin downtime y sin rollback: las dos bases tienen `tenants` con una única fila (`1 | El Templo | el-templo | active`) y el 100% de `users` y `branches` en `tenant_id = 1` (5725/9 en staging, 7105/9 en prod), con FK, índice y `NOT NULL DEFAULT 1` verificados por `information_schema` — y nada se pusheó ni se deployó sin aprobación explícita de Franco.**

## Performance

- **Duration:** ~2h45min, de los cuales ~50 min son esperas de CI/deploy (dos pipelines completos) y ~30 min una espera forzada por el rate limit de la API pública de GitHub
- **Started:** 2026-07-26T~22:45Z (gate local; primer hito con timestamp verificable: push a staging a las 23:05:44Z)
- **Completed:** 2026-07-27T01:28Z
- **Tasks:** 2 (1 auto + 1 checkpoint bloqueante con tres señales humanas)
- **Files modified:** 0 de código (plan de rollout puro); 1 artefacto de planning creado

## Task Commits

1. **Task 1: Gate local consolidado y preparación del rollout** — sin commit **por diseño del plan** (`<files>ninguno (verificacion y preparacion)</files>`)
2. **Task 2: Rollout staging-first y verificación en las dos bases** — sin commit de código; el entregable son los deploys y esta evidencia

**Commits de código desplegados:** los 5 de las waves 1-4, producidos en planes anteriores. Este plan no escribió una línea de código.

## Commits desplegados por entorno

| Entorno                          | Ref                                 | SHA        | Contenido                                                            |
| -------------------------------- | ----------------------------------- | ---------- | -------------------------------------------------------------------- |
| **staging** (`eltemplo_staging`) | `origin/staging`                    | `928b8c54` | merge `--no-ff` de la fase sobre los 25 commits que staging ya tenía |
| **producción** (`eltemplo`)      | `origin/master`                     | `e6cab5f6` | fast-forward puro: **solo** los 5 commits de la fase                 |
| rama de la fase                  | `origin/feat/166-tenancy-fundacion` | `e6cab5f6` | respaldada en origin                                                 |

Los 5 commits de la fase, presentes en los dos entornos:

```
9b27ed15 feat(166): tenants + tenant_settings (tanda A, FUND-01)
afe377ff feat(166): tenant_id en anclas users y branches (tanda B, FUND-02)
6183786c test(166): DDL de tandas A y B (tenants, tenant_settings, anclas)
f6206452 feat(166): scope.tenantId server-side + 403 TENANT_SUSPENDED (FUND-03, FUND-04)
e6cab5f6 test(166): 403 TENANT_SUSPENDED extremo a extremo en rutas admin y member
```

**Los 25 commits propios de staging (trabajo de CAJA/finance parado ahí desde antes) NO viajaron a producción.** Era el riesgo central del plan y la razón de la rama descartable — es exactamente el accidente de la fase 78 documentado en el skill de change-control.

## Conteos obtenidos en cada base

Guard del host compartido corrido **primero** en las dos, como statement separado, con corte previsto si no coincidía:

### `eltemplo_staging` (verificado 2026-07-27 ~00:21Z)

```
+------------------+          +----+-----------+-----------+--------+
| base_conectada   |          | id | name      | slug      | status |
+------------------+          +----+-----------+-----------+--------+
| eltemplo_staging |          |  1 | El Templo | el-templo | active |
+------------------+          +----+-----------+-----------+--------+

+---------------+   +----------------+-------------------+   +-------------------------+
| tenants_count |   | users_fuera_t1 | branches_fuera_t1 |   | name                    |
+---------------+   +----------------+-------------------+   +-------------------------+
|             1 |   |              0 |                 0 |   | 0190_tenants_core.sql   |
+---------------+   +----------------+-------------------+   | 0191_tenant_anchors.sql |
                                                             +-------------------------+
```

Población: **5725 users, 9 branches, 0 filas en `tenant_settings`.**

### `eltemplo` (producción, verificado 2026-07-27 ~01:27Z)

```
+----------------+            +----+-----------+-----------+--------+
| base_conectada |            | id | name      | slug      | status |
+----------------+            +----+-----------+-----------+--------+
| eltemplo       |            |  1 | El Templo | el-templo | active |
+----------------+            +----+-----------+-----------+--------+

+---------------+   +----------------+-------------------+   +-------------------------+
| tenants_count |   | users_fuera_t1 | branches_fuera_t1 |   | name                    |
+---------------+   +----------------+-------------------+   +-------------------------+
|             1 |   |              0 |                 0 |   | 0190_tenants_core.sql   |
+---------------+   +----------------+-------------------+   | 0191_tenant_anchors.sql |
                                                             +-------------------------+
```

Población: **7105 users, 9 branches, 0 filas en `tenant_settings`.**

### Verificación de forma (idéntica en las dos bases)

```
| TABLE_NAME      | COLUMN_NAME | COLUMN_TYPE | IS_NULLABLE | COLUMN_DEFAULT |
| branches        | tenant_id   | int         | NO          | 1              |
| users           | tenant_id   | int         | NO          | 1              |
| tenant_settings | tenant_id   | int         | NO          | NULL           |

FKs -> tenants:  fk_branches_tenant, fk_users_tenant, fk_tenant_settings_tenant
Índices:         idx_branches_tenant_id, idx_users_tenant_id
tenants.status:  enum('active','suspended','archived')
```

Tres cosas que esto prueba y que un `COUNT(*)` solo no probaría:

- **El `DEFAULT 1` sobrevivió al `MODIFY COLUMN`.** Era el riesgo explícito que la 0191 documenta en su comentario (MySQL pierde el DEFAULT si no se lo redeclara en el `MODIFY`). Está en la base real, no solo en el archivo.
- **Hard Rule 6 cumplida en producción:** la columna física se llama `status` y el enum tiene los tres valores en el orden del `mysqlEnum` del schema Drizzle. Los incidentes 0138/0139 fueron exactamente esto y no se repitieron.
- **`tenant_settings` nació vacía** en las dos bases, como manda D-05 (coexistencia gradual con `system_settings`, que no recibe `tenant_id` en todo el milestone).

## Verificación contra `<verification>` del plan

| Criterio                                                                                   | Resultado                                                                                            |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Gate local verde (typecheck, migraciones sanas, diff acotado, checkout compartido intacto) | OK — detalle abajo                                                                                   |
| Staging: CI verde                                                                          | OK — [run 30224509617](https://github.com/francomiceli/el-templo/actions/runs/30224509617) `success` |
| Staging: 4 consultas con los valores esperados                                             | OK — los 4 exactos                                                                                   |
| Staging: smoke funcional                                                                   | **PENDIENTE de UAT de Franco** (ver sección propia)                                                  |
| Prod: mismas 4 consultas, mismos valores                                                   | OK — los 4 exactos                                                                                   |
| Prod: smoke funcional                                                                      | **PENDIENTE de UAT de Franco**                                                                       |
| Ningún push ni SSH sin aprobación explícita                                                | OK — cuatro señales humanas separadas, detalle abajo                                                 |

### Gate local (Task 1)

| Check                                                                   | Resultado                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npx tsc --noEmit` (API, worktree de la fase)                           | limpio                                                                                                                         |
| `pnpm run build` (API)                                                  | limpio                                                                                                                         |
| `;` en líneas de comentario `--` de 0190/0191                           | cero (Hard Rule 2)                                                                                                             |
| Enum: `mysqlEnum("status", [...])` ≡ SQL                                | idéntico, mismo orden (Hard Rule 6)                                                                                            |
| Cláusula de posicionamiento en 0191                                     | 0 ocurrencias (ADD COLUMN al final = INSTANT en MySQL 8)                                                                       |
| Numeración libre en `origin/master` y `origin/staging` tras `git fetch` | tope real `0189_tv_screen.sql` en ambas, cero `019[01]_` → **no hizo falta renumerar** (T-166-27)                              |
| Diff vs `origin/master`                                                 | exactamente 10 archivos, sin `.env*`, sin `node_modules`, **sin `package.json` ni lockfile** (T-166-SC)                        |
| Checkout compartido `/home/franco/projects/el-templo`                   | intacto: cero archivos de código de la fase; lo que tiene modificado es de otra sesión (fix CR-CAJA / referidos), preexistente |
| Comando `<automated>` del plan, textual                                 | `GATE_OK`                                                                                                                      |

**Sobre el lint:** el plan pedía "el lint del repo tal como lo corre CI (`pnpm lint` si existe en el package.json del API)". **No existe**: `el-templo-api/package.json` no tiene script `lint` y el job `api-check` de `ci.yml` corre type check → security audit → build. Se sustituyó por el build, que es lo que CI efectivamente exige. Los jobs que sí lintean (app/admin/web) son `continue-on-error: true` y esta fase no toca frontend.

## Resultado de los pipelines, a nivel de step

### Staging — `Deploy Staging` [30224509618](https://github.com/francomiceli/el-templo/actions/runs/30224509618) `success`

```
Detect Changes: solo API (Build Admin/Web/App SKIPPED)
Build API:      Type check OK · Run API tests OK · Build OK · Copy migration SQL files to dist OK
Deploy:         16. Install API dependencies      success
                17. Run database migrations       success   <-- 0190 + 0191 -> eltemplo_staging
                18. Restart staging API           success
                19. Post-deploy smoke test        success
                21. Rollback staging on failure   SKIPPED
```

CI [30224509617](https://github.com/francomiceli/el-templo/actions/runs/30224509617) `success`: `API - Integration Tests` verde — **ahí corrieron por primera vez en CI los 3 archivos de test nuevos de la fase**, junto a la suite completa y a los frontends.

### Producción — `Deploy` [30227344068](https://github.com/francomiceli/el-templo/actions/runs/30227344068) `success`

```
Detect Changes: solo API (Build Web/Admin/App SKIPPED)
Build API:      Type check OK · Run API tests OK · Build OK · Copy migration SQL files to dist OK
Deploy:         10. Backup current deployment     success
                16. Install API dependencies      success
                17. Run database migrations       success   <-- 0190 + 0191 -> eltemplo
                18. Restart API                   success
                19. Post-deploy smoke test        success
                21. Rollback on failure           SKIPPED
```

CI [30227344065](https://github.com/francomiceli/el-templo/actions/runs/30227344065) `success` en los 5 jobs.

`https://api-staging.eltemplo.org/health` y `https://api.eltemplo.org/health` responden **HTTP 200** desde fuera del servidor. `pm2`: `eltemplo-staging-api` y `eltemplo-api` `online`, **0 unstable restarts** en ambos.

**Sin downtime observable.** La 0191 hace `ADD COLUMN` al final (INSTANT en MySQL 8), backfill sobre 7105 filas de `users` y 9 de `branches`, y `MODIFY ... NOT NULL` sobre tablas de ese tamaño — el paso de migraciones no retrasó el pipeline y el smoke post-deploy pasó a la primera.

## Timeline del rollout

| Hora (UTC)          | Hito                                     | Señal humana                                             |
| ------------------- | ---------------------------------------- | -------------------------------------------------------- |
| ~22:45              | Gate local (Task 1)                      | —                                                        |
| 23:05:44            | Push de la rama + merge/push a `staging` | **"aprobado staging"**                                   |
| 23:16:49 / 23:18:47 | CI staging verde / Deploy staging verde  | —                                                        |
| ~00:21              | 4 consultas contra `eltemplo_staging`    | **"te autorizo a ssh"**                                  |
| 00:23:47            | Push `feat/166-tenancy-fundacion:master` | **"aprobado prod"**                                      |
| 00:34:51 / 00:36:37 | CI master verde / Deploy prod verde      | —                                                        |
| ~01:27              | 4 consultas contra `eltemplo`            | **"hace ssh"** (autorización separada para la base real) |

## Smoke funcional: PENDIENTE de UAT

**No está confirmado y no debe darse por hecho.** Lo que sí está verificado:

- El **smoke test del pipeline** pasó en los dos entornos (step 19 de cada deploy, `success`).
- `/health` responde 200 en staging y en prod desde fuera del servidor.
- Los procesos pm2 están `online` con 0 unstable restarts.

Lo que **falta y solo puede hacer Franco por UI**:

- **Admin:** listado de socios, carga de un cobro, pantalla de reservas.
- **Member app:** que un socio vea sus planes y turnos.
- **Criterio:** ninguna pantalla debe mostrar un 403 nuevo. La capa 1 ahora corta con `403 TENANT_SUSPENDED` si el tenant no está `active`, y el tenant 1 quedó `active` en las dos bases — pero eso es la precondición, no la verificación.

Hasta que ese UAT ocurra, **el criterio de éxito 4 de la fase ("el staff no percibió ningún cambio") está respaldado por el smoke del pipeline y por los 863 tests de regresión, no por observación directa del staff.**

## Decisions Made

- **Rama descartable `tren/166-staging` basada en `origin/staging`, en vez de mergear staging dentro de la rama de fase.** Al llegar al rollout, `origin/staging` estaba **25 commits adelante** de `origin/master` y la rama de la fase estaba basada en master, así que `push feat/...:staging` habría sido rechazado por non-fast-forward. La alternativa obvia (mergear `origin/staging` dentro de `feat/166`) habría metido los 25 commits de staging en la rama, y el push posterior a master los habría llevado a **producción**. Con la rama descartable, la rama de fase quedó pura y el push a master fue un fast-forward de 5 commits.
- **Push a master como fast-forward de la rama de fase, no del árbol de staging.** Consecuencia aceptada y registrada: el árbol testeado en staging no es byte-idéntico al que aterrizó en prod (staging lleva además sus 25 commits). Los 10 archivos de la fase sí son idénticos en ambos. Es la situación normal de staging-first cuando staging está adelantado, y es preferible a shippear trabajo ajeno a medio testear.
- **Deploy paths descubiertos, no asumidos.** `pm2 describe` dio `/opt/el-templo-staging/api` para staging y `/var/www/api` para prod. **El de staging habría fallado si se adivinaba**: `/var/www/staging/` existe pero contiene solo el web, no el API.
- **`MYSQL_PWD` en vez de `-p"$DB_PASSWORD"`.** En la línea de comandos la password queda en el `argv` del proceso, visible con `ps` para cualquier otro usuario del host — y este host es compartido con varios proyectos (`sema-api`, `alpike`, `aura-web`, `olympic-academy-v2` conviven en `/var/www`).
- **Verificación en dos pasos (guard primero, conteos después)** en vez de un solo bloque. Con un bloque único, el `SELECT DATABASE()` se lee _después_ de haber leído la base equivocada. Separarlo hace que el corte sea posible de verdad.

## Deviations from Plan

### Auto-fixed Issues

**Cero desvíos de código.** Este plan no escribió ni modificó ninguna línea de código. Pero sí hubo dos hallazgos operativos que cambiaron la ejecución respecto de lo que el plan asumía:

**1. [Rule 3 - Bloqueo] `origin/staging` divergió 25 commits: el push planificado era imposible**

- **Encontrado durante:** Task 1, paso 5 (preparación de la secuencia)
- **Problema:** el plan asumía implícitamente que llevar la rama a `staging` era un push directo. `git rev-list --left-right --count origin/staging...HEAD` daba `25 9`: staging tenía 25 commits que la rama no. El push habría sido rechazado por non-fast-forward.
- **Fix:** rama descartable `tren/166-staging` basada en `origin/staging`, merge `--no-ff` de la fase, push `tren/166-staging:staging`. Antes de ejecutarlo se verificó que el merge era seguro: `origin/master` y `origin/staging` difieren en 19 archivos, y la intersección de esos 19 con los archivos tocados por ambos lados desde el merge-base es **vacía** → cero candidatos reales a conflicto.
- **Archivos modificados:** ninguno (operación de git)

**2. [Rule 3 - Bloqueo] El API no tiene script `lint`; el gate del plan pedía uno**

- **Encontrado durante:** Task 1, paso 1
- **Problema:** el plan pedía "el lint del repo tal como lo corre CI (`pnpm lint` si existe en el package.json del API)". No existe, y `ci.yml` no lintea el API.
- **Fix:** se corrió `pnpm run build`, que es el paso que CI sí exige y que el plan no pedía explícitamente. Verde.
- **Archivos modificados:** ninguno

### Hallazgo que casi pasa por verde sin serlo

**El merge imprimió `CONFLICT (content)` en `src/app.ts` y `src/db/schema/index.ts` y aun así cerró en exit 0.** Vienen de la construcción de la **base virtual** de la estrategia `ort` — la historia es criss-cross porque el mismo fix de Wellhub existe en master (`8ac9ba9f`) y en staging (`f8d3c3a4`) como commits distintos. El merge final no tuvo conflictos: cero paths sin resolver, commit creado.

Leer solo el exit code habría sido suficiente aquí, pero no es un método confiable. Se verificó el árbol resultante archivo por archivo antes de pushear:

- `app.ts` mergeado ≡ `origin/staging`
- `test/helpers.ts` mergeado ≡ `origin/staging`
- `src/db/schema/index.ts` mergeado = `origin/staging` + la única línea `export * from "./tenants";`
- diff total del árbol mergeado vs `origin/staging` = los 10 archivos de la fase + 2 de `.planning` que vienen del lado de master (idénticos a la versión de master, no deployables)
- **`npx tsc --noEmit` sobre el árbol mergeado: limpio.** Esa combinación (staging + fase) no había existido nunca ni en CI ni en local. Para correrlo se symlinkeó `node_modules` desde el otro worktree (lockfiles idénticos, **cero instalaciones**) y se borró el symlink antes del push — `.gitignore` matchea `node_modules/` como directorio y no tapaba el symlink, que aparecía como untracked.

---

**Total deviations:** 2 operativas, 0 de código. Cero dependencias nuevas (T-166-SC respetado en todo el plan).

## Threat Model — cobertura verificada

| Threat ID | Disposición | Cómo quedó cubierto                                                                                                                                                                                                                                                                                |
| --------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-166-25  | mitigate    | **Cubierto.** `SELECT DATABASE()` como statement separado y previo en las dos bases (`eltemplo_staging` y `eltemplo`), con corte previsto si no coincidía. Además se leyó el `DB_NAME` del `.env.production` de cada deploy path antes de conectar. Orden respetado: staging primero, prod después |
| T-166-26  | mitigate    | **Cubierto.** Cuatro señales humanas separadas ("aprobado staging", autorización de SSH para staging, "aprobado prod", autorización de SSH para prod). Nunca se tocó master antes de tener staging verde + las 4 consultas OK                                                                      |
| T-166-27  | mitigate    | **Cubierto.** `git fetch origin` inmediatamente antes de cada push y re-verificación de que `origin/master` y `origin/staging` seguían sin traer `019[01]_`. Antes del push a master se re-confirmó que seguía en `8ac9ba9f` y que la divergencia seguía siendo `0 5`                              |
| T-166-28  | mitigate    | **Cubierto.** Este SUMMARY registra conteos por base, commits desplegados por entorno, resultado de cada pipeline a nivel de step y el estado del smoke                                                                                                                                            |
| T-166-29  | mitigate    | **Parcial.** El smoke del pipeline pasó en los dos entornos y `/health` responde 200, pero el smoke funcional por UI sigue **pendiente de UAT de Franco** — está declarado como pendiente, no como cubierto                                                                                        |
| T-166-SC  | mitigate    | **Cubierto.** Cero comandos de instalación. El diff de la fase no toca `package.json` ni lockfiles, y el typecheck del árbol mergeado se hizo con un symlink al `node_modules` existente                                                                                                           |

## Threat Flags

Ninguno. El plan no agrega superficie: no crea rutas, ni endpoints, ni accesos a archivos. Las conexiones SSH fueron de lectura pura (`SELECT` e `information_schema`), autorizadas de a una y contra una base por vez.

## Known Stubs

Ninguno.

## Issues Encountered

- **Me comí el rate limit de la API pública de GitHub** (60 req/h por IP, sin autenticar) al seguir el CI de staging con varios pollers en paralelo. Error de método, no del pipeline: costó ~30 min de espera hasta el reset. En el seguimiento del deploy de prod se usó un solo poller a 90 s de intervalo y no volvió a pasar. `gh` no está instalado y no hay token en el entorno; el repo es público, así que `api.github.com` sin autenticar alcanza **si se la usa con moderación**.
- **Los badges públicos no sirven como prueba.** Durante la espera del rate limit, los badges de `ci.yml` y `deploy-staging.yml` decían "passing", pero un badge muestra el último run **completado** de la rama y no distingue el nuestro de el anterior. No se tomaron como evidencia; se esperó al dato a nivel de step.
- **Los jobs quedaron encolados varios minutos** antes de arrancar (los del run de staging se crearon a las 23:05:44 y arrancaron a las 23:05:47–23:08). Se confundió al principio con lentitud; el `started_at` por job lo aclaró.
- **`.env.production` no es sourceable por bash.** En los dos deploy paths, `set -a; . ./.env.production` tira `syntax error` en la línea 21 (`CAMPAIGN_EMAIL_FROM=El Templo <onboarding@resend.dev>`: valor sin comillas con `<`). No afecta a la app —Node lo parsea con dotenv, no con bash— ni a esta verificación, porque las `DB_*` están antes de esa línea y cargaron bien. **Queda anotado por si algún script de shell del server lo sourcea alguna vez: las variables posteriores a la línea 21 no se cargarían.**
- **Los dos pushes reportaron `Bypassed rule violations: Changes must be made through a pull request`.** `staging` y `master` tienen protección de PR y la cuenta de Franco la saltea. Queda registrado en el audit log del repo. No es un error, pero conviene saber que el flujo actual la evade.

## Limpieza (paso G)

- Worktree `/home/franco/projects/et-166-staging`: **removido** (el directorio ya no existe).
- Rama local `tren/166-staging`: **borrada** (era `928b8c54`, contenido a salvo en `origin/staging`).
- `tren/166-staging` **nunca se publicó** en origin — se pusheó como `tren/166-staging:staging`, así que no hay nada que borrar remoto (verificado con `git ls-remote`).
- **Se conservan** el worktree `/home/franco/projects/et-166-tenancy` y la rama `feat/166-tenancy-fundacion` (= `e6cab5f6`) hasta el cierre de fase y el UAT.

## User Setup Required

**Smoke funcional por UI, en staging y en producción** (detalle en la sección "Smoke funcional: PENDIENTE de UAT"). Es lo único que falta para cerrar el criterio de éxito 4 de la fase.

Sin builds de tienda ni bump de versión: la fase es API-only y `Detect Changes` marcó `Build App`/`Build Admin`/`Build Web` como skipped en los dos deploys.

## Next Phase Readiness

- **El tope de migración aplicado en producción pasó de `0189` a `0191`.** Cualquier fase que reserve un número tiene que partir de **0192**. Ya no hace falta consultar la rama `feat/166-tenancy-fundacion` para esto: 0190 y 0191 viven en master y en las dos bases. Sí sigue habiendo que mirar el worktree `et-164-tv` para lo que quede abierto de la 164.
- **`origin/staging` y `origin/master` siguen divergiendo** por los 25 commits de CAJA/finance que ya estaban parados en staging antes de esta fase. La 166 no los movió y **no requiere back-merge**: staging recibió el contenido de la fase en el paso B. Ese tren sigue pendiente por su propio carril.
- **La fase 167 (columnas `tenant_id` en las ~85 tablas restantes) tiene su precondición cumplida en las dos bases:** `tenants` existe con El Templo como id 1, y las dos anclas (`users`, `branches`) tienen la columna con FK e índice.
- **Recordatorio del gate del milestone (no de esta fase):** el tenant 2 no se onboardea hasta que la batería de aislamiento (ISO-03) esté verde sobre el 100% de las rutas core `tenant-scoped`.
- **Blocker suave:** el smoke funcional de UAT. No bloquea planificar la 167, pero sí bloquea declarar la 166 cerrada.

## Self-Check: PASSED

- `origin/master` = `e6cab5f6305719abdcab5a82a938a1e45d348097` — FOUND (`git ls-remote`)
- `origin/staging` = `928b8c54bfe7cef84d0d18b5b42643f42b861c71` — FOUND (`git ls-remote`)
- `origin/feat/166-tenancy-fundacion` = `e6cab5f6` — FOUND
- Runs `30224509617`, `30224509618`, `30227344065`, `30227344068` — los 4 con conclusión `success`, verificados a nivel de step
- `0190_tenants_core.sql` y `0191_tenant_anchors.sql` en `_migrations` de `eltemplo_staging` **y** de `eltemplo` — FOUND, una vez cada una
- `/home/franco/projects/et-166-staging` — ya no existe (limpieza confirmada)
- Rama `tren/166-staging` — borrada local, inexistente en origin
- `166-06-SUMMARY.md` — FOUND (checkout principal)

---

_Phase: 166-fundaci-n-tenants-anclas-y-scope-server-side_
_Completed: 2026-07-27_
