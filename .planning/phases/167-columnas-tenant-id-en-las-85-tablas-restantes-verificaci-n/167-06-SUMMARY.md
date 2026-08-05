---
phase: 167-columnas-tenant-id-en-las-85-tablas-restantes-verificaci-n
plan: 06
subsystem: database
tags:
  [multi-tenancy, saas, verificacion, ci, mysql, information-schema, drizzle]

# Dependency graph
requires:
  - "167-01 (worktree et-167-columnas, clasificacion canonica GYM_OWNED_TABLES / TENANT_EXEMPT_TABLES)"
  - "167-02/03/04/05 (la tanda C completa: 85 tablas + las 2 anclas = 87 columnas tenant_id en la DB local)"
  - "166-01/166-02 (tabla tenants con El Templo id=1 + anclas users/branches)"
provides:
  - "src/db/scripts/verify-tenant-backfill.ts: verificacion COL-02 ejecutable por CLI (local, staging, prod) y por test, con exports verifyTenantBackfill/formatReport/QueryFn"
  - "Script npm db:verify-tenant + version compilada en dist/db/scripts/verify-tenant-backfill.js"
  - "test/migrations/0192-0195-tenant-columns.test.ts: gate de CI de 6 bloques sobre el DDL de las 87 tablas y las 2 exclusiones"
  - "Evidencia empirica de que el gate se pone ROJO de verdad (3 pruebas negativas, T-167-29)"
  - "Hallazgo operativo: setup-global.ts DROPEA todas las bases eltemplo_test_* al inicio de cada corrida — adulterar la base de test ANTES de vitest no prueba nada"
affects:
  - "167-07 (gate local consolidado + rollout staging-first: corre ESTE script contra eltemplo_staging y eltemplo; el contrato de exit codes 0/1/2 y el SELECT DATABASE() son lo que consume su checkpoint)"
  - "168 (CON-02: los uniques compuestos no deben romper ninguna de las 125 aristas de FK que el script ya verifica)"
  - "169/170 (el script es el molde de auditoria cuando exista un tenant 2: foreignTenantRows deja de ser 0 y pasa a ser el dato util)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verificacion por LOTES de UNION ALL con indice explicito como columna (idx) y assert de cardinalidad: si el server devuelve menos filas que consultas, se lanza en vez de leer resultados corridos — la contramedida directa al truncamiento silencioso que documento el 167-04"
    - "El grafo de FKs se LEE de INFORMATION_SCHEMA en runtime en vez de hardcodearse: sigue siendo cierto cuando el schema cambie, y las 9 aristas logicas sin constraint (mina M9) se enumeran a mano porque la DB no las conoce"
    - "Prueba negativa que ejercita el WIRING del test, no solo la funcion: cuando la adulteracion externa no puede sobrevivir al provisioning, se adultera DENTRO del proceso y se afirma sobre el mismo dato que asevera el test committeado"

key-files:
  created:
    - el-templo-api/src/db/scripts/verify-tenant-backfill.ts
    - el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts
  modified:
    - el-templo-api/package.json

key-decisions:
  - "La prueba negativa 3 del plan (adulterar eltemplo_test_1 y despues correr vitest) es IMPOSIBLE de ejecutar como esta escrita: test/setup-global.ts dropea todas las bases eltemplo_test_* al inicio de cada corrida y el provisioning las recrea desde los .sql. Se corrio tal cual, dio VERDE, y ese verde era un falso verde DE LA PRUEBA (no del gate). Se reemplazo por dos pruebas que si demuestran lo que el plan queria"
  - "EXPECTED_ANCHORLESS quedo en 32 y se contrasto contra doc 05 comparando CONJUNTOS DE NOMBRES, no totales: el '37 + 3 parciales' del resumen del doc no decompone (incluye las 2 exentas y NO incluye las 8 tablas de §2.7, que el doc marca en el titulo de la seccion y no fila por fila). El comentario del script que derivaba 32 como '37 -1 -4' no reproducia y se reescribio"
  - "Las 4 tablas de la familia sessions que el doc marca [SIN-ANCLA] pero el script SI ancla no son un error de ninguno de los dos: el doc mide 'conceptualmente no deriva de un tenant' y el script mide 'existe camino de FKs declaradas'. sessions.approved_by -> users existe (NULLABLE) y las otras tres cuelgan de ella — verificado contra INFORMATION_SCHEMA"
  - "Un unico commit para los 3 tasks (precedente 167-04/167-05): el criterio de aceptacion del Task 3 exige que `git show --stat HEAD` liste los 3 archivos del plan, y los tasks 1 y 2 escriben el MISMO archivo"

patterns-established:
  - "Una prueba negativa que pasa en verde hay que leerla con sospecha: 'el gate no se puso rojo' y 'la adulteracion nunca llego a existir' se ven identicos desde afuera. Antes de aceptar el resultado hay que probar que la adulteracion seguia viva en el momento de la medicion"

# COL-02 completo (script + gate de CI + 3 pruebas negativas).
# COL-01 sigue progressed: las 87 columnas estan verificadas en LOCAL y en la
# base de test, pero el rollout a staging y prod es el plan 167-07.
requirements-completed: [COL-02]
requirements-progressed: [COL-01]

# Metrics
duration: ~30min
completed: 2026-07-27
---

# Phase 167 Plan 06: verificación del backfill de `tenant_id` (COL-02) Summary

**Existe un script versionado y de solo lectura que demuestra —contra el grafo REAL de FKs leído de `INFORMATION_SCHEMA`, no contra `_migrations`— que las 87 columnas `tenant_id` están bien formadas y que el backfill coincide con el valor derivado por cadena de FK, con 0 discrepancias sobre 125 aristas declaradas, 14 aristas lógicas de la mina M9 y 53 cadenas hasta un ancla; el gate corre en CI en cada push y quedó probado que se pone ROJO de verdad — incluyendo el descubrimiento de que la prueba negativa que pedía el plan era inejecutable y daba un falso verde.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 3 (un solo commit de código, `1c15b300`)
- **Files:** 2 creados (script + test), 1 modificado (`package.json`, una línea)

## Lo primero: el trabajo parcial NO se dio por bueno

El ejecutor anterior dejó los 3 archivos sin commitear. **No se asumieron completos**: se revisaron contra el plan y se verificaron corriéndolos de verdad. El veredicto fue que el contenido era correcto y completo, con **una excepción real** (el comentario de `EXPECTED_ANCHORLESS`, abajo). Lo que se verificó antes de aceptarlos:

| Chequeo del contenido heredado                                       | Resultado                                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `TARGET_KIND_TABLES` vs el `switch` real de `transaction-service.ts` | **coincide**: subscription/debt_balance/transaction/enrollment          |
| `member -> users` vs `AuditTargetKind` de `audit-log.ts`             | **coincide** (`"subscription" \| "transaction" \| "member"`)            |
| Valores del enum vs `mysqlEnum` de transaction-links / balances      | **coinciden** (4 y 2 valores) — el script igual los lee del COLUMN_TYPE |
| `EXPECTED_ANCHORLESS` vs lo que descubre el script                   | **32 = 32**, sin warnings en ninguna dirección                          |
| `EXPECTED_ANCHORLESS` vs doc 05                                      | **la derivación del comentario NO reproducía** → corregida              |
| `package.json`                                                       | una sola línea, dentro de `scripts`, cero paquetes nuevos (T-167-SC)    |

## Salida completa de `pnpm db:verify-tenant` en local

```
========================================================================
Base de datos: eltemplo
========================================================================
Tablas gym-owned verificadas:   87
Aristas de FK declaradas:       125
Aristas logicas M9:             14 verificadas (9 declaradas, las heterogeneas se expanden por target_kind)
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
  - academy_inquiries
  - activities
  - app_waitlist
  - aura_config
  - blog_post_tags
  - blog_posts
  - blog_tags
  - contraction_rules
  - cost_centers
  - day_modes
  - exercise_dimension_proposals
  - exercise_milestone_proposals
  - exercise_progressions
  - exercises
  - format_compatibility
  - formats
  - franchise_applications
  - gladius_inquiries
  - gladius_products
  - holidays
  - intensity_rules
  - notification_templates
  - plan_programs
  - program_content_blocks
  - programs
  - promo_plans
  - routes
  - spom_config
  - spom_rules
  - subscription_plans
  - weekly_rotator
  - wellhub_events

Filas parciales de la mina M4: 4 tabla(s)
  - cash_registers WHERE branch_id IS NULL: 5 fila(s) — cajas centrales y de banco: no pertenecen a ninguna sede
  - financial_transactions WHERE member_id IS NULL AND branch_id IS NULL: 0 fila(s) — egresos y movimientos: los rescata recorded_by NOT NULL
  - campaign_unsubscribes WHERE user_id IS NULL: 0 fila(s) — bajas solo-email, sin usuario asociado
  - tv_pairings WHERE branch_id IS NULL: 0 fila(s) — pairings pre-claim: el TV no pertenece a nadie hasta que el staff lo reclama (mina M7)

Tablas con filas de tenant <> 1: 0

Warnings: 2
  - Arista logica M9 con 1 fila(s) huerfana(s) (el target no existe): audit_log.target_id -> users.id [c.`target_kind` = 'member']
  - Arista logica M9 con 1 fila(s) huerfana(s) (el target no existe): audit_log.target_id -> subscriptions.id [c.`target_kind` = 'subscription']
```

**Exit code 0.** Los 2 warnings son filas de `audit_log` cuyo target ya no existe (borrado histórico): T-167-31 los clasifica como información, no discrepancia.

## Las tres pruebas negativas (T-167-29)

Un gate que nunca se pone rojo no vale nada. Las tres se ejercitaron **de verdad** y las tres adulteraciones se revirtieron.

### 1. DDL — quitar el DEFAULT de `routes`

`ALTER TABLE routes MODIFY COLUMN tenant_id INT NOT NULL` (local) → **exit 1**:

```
DDL incompleto (ddlMissing): 1
  - routes: tenant_id no tiene DEFAULT 1 (COLUMN_DEFAULT=NULL)
DISCREPANCIAS: 1
```

Restaurado con `... NOT NULL DEFAULT 1` → `COLUMN_DEFAULT = 1`, **exit 0**, 0 discrepancias.

### 2. Consistencia — forzar un tenant inconsistente

Con `FOREIGN_KEY_CHECKS=0`, `UPDATE bookings SET tenant_id=2 WHERE id=(SELECT MIN(id) ...)` → **exit 1**, y lo cazaron **cuatro gates independientes a la vez**:

```
Tablas con filas apuntando a un tenant inexistente (badRows): 1
  - bookings: 1 fila(s)
Aristas de FK con tenant inconsistente (fkMismatches): 2
  - bookings.member_id -> users.id: 1 fila(s)
  - bookings.schedule_id -> schedules.id: 1 fila(s)
Cadenas donde el tenant derivado no coincide (derivationMismatches): 1
  - bookings -> users (ancla users): 1 fila(s)
DISCREPANCIAS: 4
```

Esto es lo que prueba que los pasos **B, C y E** están vivos y no son decorativos. Revertido a `tenant_id=1`, `FOREIGN_KEY_CHECKS` de vuelta en 1, filas con tenant ≠ 1 = **0**, **exit 0**.

### 3. FK dropeada — acá el plan pedía algo imposible

El plan pedía: `ALTER TABLE routes DROP FOREIGN KEY fk_routes_tenant` **en `eltemplo_test_1`** y después correr el test, esperando rojo.

Se corrió **exactamente así** y el test dio **6/6 VERDE**. Eso no era el gate fallando: era la prueba que no existía. `test/setup-global.ts` **dropea todas las bases `eltemplo_test_*` al inicio de cada corrida** de vitest, y el provisioning de `test/setup.ts` las recrea desde los `.sql`. La FK estaba de vuelta antes de que corriera la primera aserción (verificado después: `fk_routes_tenant` presente en `eltemplo_test_1`). **Ninguna adulteración externa a la base de test puede sobrevivir al arranque de vitest.**

Se reemplazó por dos pruebas que sí demuestran lo que el plan quería:

**3a — que el chequeo de FK existe.** Drop de `fk_routes_tenant` en la base **local** → **exit 1**:

```
DDL incompleto (ddlMissing): 1
  - routes: no tiene FK de tenant_id hacia tenants
DISCREPANCIAS: 1
```

Restaurada la constraint → **exit 0**.

**3b — que el _wiring del test_ no es vacuo.** Un archivo de test **descartable** (creado, corrido y borrado, nunca commiteado) que adultera **dentro del proceso**, después del provisioning, y afirma sobre el mismo dato que asevera el test committeado. Pasó, probando las cuatro cosas a la vez:

- `before.ddlMissing` estaba **vacío** (verde antes de adulterar — si no, la prueba no diría nada),
- `before.database` era **`eltemplo_test_1`** (el adaptador `makeQueryFn` lee la base per-worker de verdad, no otra),
- tras el `DROP FOREIGN KEY`, `ddlMissing` era **exactamente** `[{ table: "routes", reason: "no tiene FK de tenant_id hacia tenants" }]`,
- `discrepancies` era **1**.

O sea: el `expect(report.ddlMissing).toEqual([])` del test committeado **habría fallado nombrando `routes`**, que es literalmente lo que el criterio de aceptación pedía demostrar. La FK se restauró en el `afterAll` y el archivo se borró.

## Verificación

| Check                                                             | Esperado   | Resultado                                                                              |
| ----------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                                | limpio     | **limpio**                                                                             |
| `pnpm run build` + `dist/db/scripts/verify-tenant-backfill.js`    | existe     | **build OK, artefacto presente**                                                       |
| `pnpm db:verify-tenant`                                           | exit 0     | **exit 0, DISCREPANCIAS: 0**                                                           |
| Primera línea útil = nombre de la base                            | sí         | **`Base de datos: eltemplo`**                                                          |
| Tablas gym-owned verificadas                                      | 87         | **87**                                                                                 |
| `ddlMissing` / `exemptViolations`                                 | vacíos     | **0 / 0**                                                                              |
| Aristas de FK del paso C                                          | >= 60      | **125**                                                                                |
| Aristas lógicas M9 declaradas / verificadas                       | 9 / >0     | **9 declaradas, 14 verificadas**                                                       |
| Sección de [SIN-ANCLA] con su conteo                              | presente   | **32 tablas listadas**                                                                 |
| Sección de parciales con las 4 tablas M4 nombradas                | presente   | **las 4** (cash_registers, financial_transactions, campaign_unsubscribes, tv_pairings) |
| `grep -nE ':\s*any\b'` sobre el script                            | vacío      | **vacío**                                                                              |
| `grep -c 'SELECT DATABASE()'`                                     | >= 1       | **3**                                                                                  |
| `grep -c 'M9'`                                                    | >= 1       | **13**                                                                                 |
| Las 6 aristas simples por nombre de columna                       | presentes  | **subscription_plan_id, post_id, tag_id, exercise_id, day_id (×4)**                    |
| `console.*` fuera del bloque CLI                                  | 0          | **0** (solo líneas 1291 y 1305, dentro del CLI)                                        |
| `git diff -- package.json`                                        | 1 línea    | **1 línea, en `scripts`**; nada en (dev)dependencies                                   |
| `npx vitest run test/migrations/0192-0195-tenant-columns.test.ts` | verde      | **6/6 en ~99 s** (corrido 3 veces, siempre verde)                                      |
| `_migrations` con las 4 de la tanda C, una vez cada una           | 4          | **4** (assert dentro del test, con lista explícita)                                    |
| Round-trip Drizzle sin `tenantId`                                 | lee 1      | **`tenantId === 1`**, fila borrada en el `finally`                                     |
| Prueba negativa 1 (DEFAULT)                                       | rojo→verde | **exit 1 nombrando `routes` → exit 0**                                                 |
| Prueba negativa 2 (tenant inconsistente)                          | rojo→verde | **exit 1, 4 gates, → exit 0**                                                          |
| Prueba negativa 3 (FK)                                            | rojo→verde | **ver arriba: la del plan es inejecutable; 3a y 3b sí**                                |
| `npx prettier --check` sobre los 3 archivos                       | limpio     | **"All matched files use Prettier code style!"**                                       |
| Estado de la DB local y de test tras las adulteraciones           | restaurado | **FK y DEFAULT de `routes` OK en ambas; `bookings` en 1**                              |
| `git status --short` del worktree post-commit                     | vacío      | **vacío**                                                                              |
| `git show --stat HEAD`                                            | 3 archivos | **3 archivos, 1537 inserciones, 0 deleciones**                                         |

## Deviations from Plan

### Ajustes automáticos

**1. [Rule 1 - Bug] El comentario de `EXPECTED_ANCHORLESS` documentaba una derivación que no reproduce**

- **Encontrado en:** Task 2, al contrastar la constante contra doc 05 como pide el plan.
- **Problema:** el comentario heredado derivaba el 32 como `37 (marcas [SIN-ANCLA] en doc 05) − 1 (system_settings) − 4 (familia sessions)`. Esa cuenta **no se puede reproducir**. El `37` del resumen del doc es un total que no decompone: incluye las 2 tablas EXENTAS y **no** incluye las 8 tablas de **§2.7**, que el doc marca en el **título de la sección** ("todas [SIN-ANCLA]") y no fila por fila. Un comentario que dice "la cuenta cierra exacta" y no cierra es peor que no tener comentario: manda a la próxima fase a re-derivar mal.
- **Fix:** se reescribió con la derivación **verificada programáticamente**, comparando conjuntos de nombres:

  ```
   28  marcadas fila por fila en §1 y §2, sin las 3 parciales M4 ni las 2 exentas
   +8  las de §2.7 (marketing/marca), marcadas en el título de la sección
  ----
   36  gym-owned [SIN-ANCLA] según el doc
   -4  sessions, session_blocks, session_prescriptions, session_traces
  ----
   32  las que descubre el script
  ```

  El diff de conjuntos da **exactamente esas 4 en una sola dirección** y **nada** en la otra.

- **Archivos:** `el-templo-api/src/db/scripts/verify-tenant-backfill.ts` (solo el comentario).

**La resta de 4 no es un error de nadie**, y se verificó contra `INFORMATION_SCHEMA` en vez de razonarlo: `sessions.approved_by → users` **existe y es NULLABLE** (por eso el doc anota `sessions` con asterisco), y las otras tres cuelgan de ella (`session_blocks.session_id → sessions`, `session_prescriptions.block_id → session_blocks`, `session_traces.session_id → sessions`, las tres NOT NULL). El doc mide "conceptualmente esto no deriva de un tenant"; el script mide "existe camino de FKs declaradas". El paso E les deriva tenant solo para las filas cuya sesión tiene `approved_by` cargado.

**2. [Rule 3 - Blocking] La prueba negativa 3 del plan es inejecutable como está escrita**

Detallada arriba. Se corrió literalmente, dio verde, y ese verde era un **falso verde de la prueba, no del gate**. Se sustituyó por 3a (drop de FK en local → rojo) y 3b (adulteración in-process contra la base de test → la aserción del test committeado falla nombrando `routes`). El requisito de fondo de T-167-29 —"el gate tiene que ponerse rojo de verdad"— quedó **cumplido y con más evidencia** que la que pedía el plan, porque 3b además prueba que el adaptador `makeQueryFn` lee `eltemplo_test_1` y no otra base.

Esto es la misma clase de hallazgo que ya viene documentando la fase (el `GROUP_CONCAT` del 167-04, el `LIKE '019[2-5]%'` del 167-05): **una verificación sintácticamente válida que mide otra cosa que la que se cree**. Y como en esos dos casos, el síntoma es indistinguible del éxito mirando solo la salida.

### Aclaraciones (no son cambios de comportamiento)

**1. Un solo commit para los 3 tasks.** El criterio de aceptación del Task 3 exige que `git show --stat HEAD` liste los **3 archivos del plan**, y los tasks 1 y 2 escriben el **mismo** archivo. Commitear el Task 1 aparte habría dejado el HEAD final con un solo archivo. Es el mismo precedente que documentaron el 167-04 y el 167-05.

**2. `prettier --write` sobre el script, no verificación por equivalencia.** El procedimiento por equivalencia del 167-04 aplica a archivos que **ya violaban** prettier antes de tocarlos. `verify-tenant-backfill.ts` es un archivo **nuevo** (sin baseline en `HEAD`), así que se formateó directo. Se revisó el diff antes de aplicarlo: **puras roturas de línea a 80 columnas, cero cambios semánticos**. `tsc --noEmit` siguió limpio después.

**3. `logicalEdgesChecked` es 14 y varía por base, a propósito.** 6 simples + 4 de `transaction_links` + 2 de `balances` + 2 de `audit_log`. Las de `audit_log` salen de un `SELECT DISTINCT` (la columna es `varchar` libre, no enum), así que en una base sin filas de audit hay menos aristas. Por eso el test afirma sobre `logicalEdgesDeclared` (**9**, constante del código) y no sobre las verificadas: si alguien borra las aristas de la mina M9, el reporte daría 0 discrepancias sin haber mirado nada.

## Threat Flags

Ninguna superficie de seguridad nueva. El script es **solo lectura** (únicamente `SELECT`, T-167-30) y no se agregó ningún endpoint, ruta de auth ni esquema de request. Las disposiciones del registro se cumplieron como estaban escritas:

- **T-167-27** (`mitigate`) — la verificación **no consulta `_migrations`** para decidir: interroga `INFORMATION_SCHEMA` tabla por tabla y cuenta filas reales. El único uso de `_migrations` es un assert adicional dentro del test.
- **T-167-28** (`mitigate`) — `SELECT DATABASE()` es el primer statement y su resultado es la primera línea del reporte. Ejercitado: en local imprime `eltemplo`, y la prueba 3b confirmó que desde la suite imprime `eltemplo_test_1`.
- **T-167-29** (`mitigate`) — las tres pruebas negativas, con la corrección de la tercera.
- **T-167-30** (`mitigate`) — solo `SELECT`; las adulteraciones fueron manuales, en local, y revertidas en el mismo paso (estado final verificado).
- **T-167-31** (`accept`) — los `target_kind` sin mapeo van a `warnings` con su conteo. Hoy no hay ninguno sin mapear; los 2 warnings vivos son filas huérfanas, también aceptadas.
- **T-167-SC** (`mitigate`) — cero paquetes nuevos: `mysql2` y `dotenv` ya estaban. El diff de `package.json` es **una línea, dentro de `scripts`**.

## Next Phase Readiness

El plan 167-07 arranca sin bloqueos:

- Worktree `/home/franco/projects/et-167-columnas` (rama `feat/167-tenant-columns`), HEAD **`1c15b300`**, working tree limpio.
- **El gate ya existe y está probado en los dos sentidos.** El 167-07 no tiene que construir verificación: tiene que **correr esta** contra `eltemplo_staging` y `eltemplo` y leer el `Base de datos:` de la primera línea antes de creerle al resto.
- **Contrato para el checkpoint del 167-07:** en el servidor se corre la versión compilada, `NODE_ENV=production node dist/db/scripts/verify-tenant-backfill.js`. Exit **0** = sin discrepancias, **1** = con discrepancias, **2** = error de conexión o de uso. El `2` hay que distinguirlo del `1`: un error de conexión no es un backfill sano.
- **Ojo con `foreignTenantRows` en prod:** hoy da 0 porque solo existe el tenant 1. Es informativo, no un gate — no leerlo como fallo el día que haya un tenant 2.
- **`EXPECTED_ANCHORLESS` es de 32 y está atada al grafo de FKs, no al doc.** Si la fase 168 agrega FKs (o la 169/170 cambian el schema), tablas hoy [SIN-ANCLA] pueden pasar a tener cadena: eso sale como **warning**, no como discrepancia, y hay que actualizar la constante en vez de silenciarla.
- **Trampas vigentes acumuladas por la fase, todas con víctima real:**
  - No armar queries con `GROUP_CONCAT` (trunca a 1024 y devuelve SQL cortado que corre igual) — 167-04.
  - No usar `LIKE` con clases de caracteres en MySQL (`'019[2-5]%'` matchea 0 siempre) — 167-05.
  - El predicado de "tabla tenant-aware" es `NOT NULL DEFAULT 1`, no "existe la columna" (`tenant_settings` es el falso positivo) — 167-05.
  - **NUEVA:** adulterar una base `eltemplo_test_*` **antes** de correr vitest no prueba nada — `setup-global.ts` la dropea al arrancar. Si hay que ejercitar un gate de la suite, la adulteración va **dentro** del proceso de test.
  - `npx prettier --check` a mano antes de cada commit (no hay hook en el worktree) y nunca `git add -A`.

## Self-Check: PASSED

- `el-templo-api/src/db/scripts/verify-tenant-backfill.ts` existe en el worktree y está en el commit `1c15b300`.
- `el-templo-api/test/migrations/0192-0195-tenant-columns.test.ts` existe en el worktree y está en el commit.
- `el-templo-api/package.json` modificado en el commit (una línea).
- El commit `1c15b300` está en el historial de `feat/167-tenant-columns` con 3 archivos, 1537 inserciones y 0 deleciones.
- El archivo de prueba descartable **no** está en el commit ni en el working tree (borrado y verificado con `git status --short`, que da vacío).
- Este SUMMARY existe en el checkout principal.
