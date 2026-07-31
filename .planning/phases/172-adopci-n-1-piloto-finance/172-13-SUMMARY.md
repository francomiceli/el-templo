---
phase: 172-adopci-n-1-piloto-finance
plan: 13
subsystem: testing
tags:
  [
    tenancy,
    finance,
    test-harness,
    sentinel,
    tenant-safe,
    cleanAllTestData,
    cajas,
    centros-de-costo,
    sonda-revertida,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / tenantValues)"
  - phase: 170-sentinel-lint
    provides: "src/db/sentinel/ — el canal de exención `tenant-safe:` embebido en el SQL"
  - phase: 171-backstop
    provides: "test/fixtures/second-tenant.ts (TENANT_TEMPLO) y el precedente de DELETEs crudos con tenant_id"
  - plan: 172-01
    provides: "worktree et-172, baseline verde"
  - plan: 172-11
    provides: "las rutas de finance cerradas"
  - plan: 172-12
    provides: "finance sin una sola entrada viva de allowlist; 51 entradas acumuladas para el 172-21"
provides:
  - "cleanAllTestData con la exención `tenant-safe:` ESCRITA EN EL SQL: el beforeEach de decenas de archivos deja de ser el bloqueante #1 del switch"
  - "ensureEfectivoCaja con su sonda de idempotencia filtrada por gimnasio + el 4º argumento documentado como obligatorio fuera de El Templo"
  - "test/setup.ts: los 4 seeds de cash_registers estampan tenant_id explícito y sus NOT EXISTS filtran por gimnasio"
  - "6 archivos de test de cajas/cuentas/centros de costo con 80 queries directas migradas"
  - "Evidencia EN CALIENTE: 93/93 tests verdes con `finance` puesto a mano en TENANT_STRICT_MODULES, sonda revertida"
affects: [172-14, 172-15, 172-16, 172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El canal de exención del SENTINEL es el TEXTO SQL: el comentario de bloque va entre el verbo y el FROM, dentro del template string, no en un comentario TypeScript"
    - "Una exención se declara donde el acceso global es DELIBERADO; donde el acceso es acotable, se filtra. cleanAllTestData es el primer caso; todo lo demás del plan, el segundo"
    - "`tenantValues` en un insert multi-fila envuelve CADA fila del array, no el array"
    - "El sentinel NO ve las conexiones mysql2 propias de test/setup.ts (no pasan por app.dbPool): ahí la estampa explícita se hace por el riesgo real, no porque haya un vigilante"

key-files:
  created: []
  modified:
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/setup.ts
    - el-templo-api/test/finance/cash-register-service.test.ts
    - el-templo-api/test/finance/cost-centers.test.ts
    - el-templo-api/test/finance/cost-centers-abm.test.ts
    - el-templo-api/test/finance/bank-accounts.test.ts
    - el-templo-api/test/finance/cash-balances.test.ts
    - el-templo-api/test/finance/validate-caja.test.ts

key-decisions:
  - "La exención `tenant-safe` se declara SOLO en el DELETE del loop de cleanAllTestData (el que toca tablas strict). Los dos statements sobre `users` NO se anotan: `users` no es strict hoy y anotar de más apaga el tripwire del que migre ese módulo"
  - "Los 3 `sql` crudos del beforeEach de validate-caja pasan a `WHERE tenant_id = ${TENANT_TEMPLO}` en vez de llevar exención: el borrado ahí NO es global a propósito, es un DELETE de conveniencia que se puede acotar"
  - "`ensureEfectivoCaja` conserva firma y default (los ~40 call sites de El Templo no cambian), pero su SELECT sobre `cash_registers` —tabla strict— ahora filtra: sin eso hacía throw"
  - "test/setup.ts se migra aunque el sentinel NO lo vea (usa conexiones mysql2 propias): el riesgo de una caja estampada en el gimnasio equivocado no depende de que haya un vigilante mirando"

patterns-established:
  - "Auditoría mecánica de cobertura: un `awk` que, para cada acceso a una de las 6 tablas strict, exige `tenantWhere`/`tenantValues`/`tenant_id` en la ventana de líneas del statement. Encuentra lo que el ojo saltea en un archivo de 900 líneas"

requirements-completed: []

# Metrics
duration: 32min
completed: 2026-07-30
---

# Phase 172 Plan 13: La infraestructura de test lista para el throw Summary

**`cleanAllTestData` —el `beforeEach` de decenas de archivos, un `DELETE FROM` sin filtro sobre ~70 tablas— deja de ser el bloqueante #1 del switch: su statement lleva ahora la exención `tenant-safe: limpieza global de la base de test (todos los gimnasios)` ESCRITA ADENTRO DEL SQL, que es el único canal que el sentinel lee. Con eso más 80 queries directas migradas en los 6 archivos de cajas, cuentas y centros de costo, la verificación en caliente —`finance` puesto a mano en `TENANT_STRICT_MODULES` con sus 6 tablas— da **93/93 tests verdes contra MySQL real**, sin tocar una sola expectativa. La sonda se revirtió: `src/db/tenant-tables.ts` no viaja en ningún commit de este plan.**

## Performance

- **Duration:** ~32 min (21:50 → 22:22 -03), de los cuales ~13 min son las tres corridas contra MySQL real
- **Completed:** 2026-07-30
- **Tasks:** 2/2 (las dos `auto`)
- **Files modified:** 8 — +664 / −275

## Task Commits

| Task | Nombre                                                              | Commit     | Archivos                     |
| ---- | ------------------------------------------------------------------- | ---------- | ---------------------------- |
| 1    | `helpers.ts` y `setup.ts` listos para el throw                      | `e3092ea6` | helpers.ts, setup.ts         |
| 2    | Los 6 archivos de cajas y centros de costo, verificados en caliente | `4a3244fe` | 6 archivos de `test/finance` |

Los dos commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `9e9846a6` del plan 12). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Accomplishments

- **La exención está donde el sentinel la lee: adentro del SQL.** El statement quedó
  `DELETE /* tenant-safe: limpieza global de la base de test (todos los gimnasios) */ FROM \`<tabla>\``.
Verificado ejecutando el clasificador real (`analyzeSql`de`src/db/sentinel/analyze.ts`) sobre el texto exacto que se manda al driver:

  ```
  con exención:  {"kind":"exempt","reason":"anotado en el SQL: limpieza global de la base de test (todos los gimnasios)","tables":[]}
  sin exención:  {"kind":"violation","reason":"sin tenant_id sobre financial_transactions","tables":["financial_transactions"]}
  ```

  No es una prueba por lectura: es el mismo código que corre en el pool, dando `exempt` de un lado y `violation` del otro.

- **Por qué esto era el bloqueante #1.** `TABLES_TO_CLEAN` incluye `transaction_links`, `balances` y `financial_transactions` —tres de las seis tablas strict— y `cleanAllTestData` corre en el `beforeEach` de decenas de archivos, **por el pool que el sentinel envuelve** (usa `app.dbPool.getConnection()`, que es justo la tercera de las tres puertas que `install.ts` intercepta). Sin este trabajo, el plan del switch (172-21) no habría visto "40 archivos rojos": habría visto **la suite entera caída en el primer hook**.

- **La exención es única y acotada, y está argumentada arriba de la función.** El comentario explica (a) que el borrado global es deliberado —filtrarlo por El Templo dejaría vivas las filas del gimnasio 2 entre archivos, porque `isolate: false` hace que compartan base por worker—, y (b) **por qué la allowlist del lint no es una salida**: son dos canales distintos (D-17 de la fase 170), la allowlist solo mira `src/` y una entrada suya no calla un throw de runtime.

- **Los dos statements sobre `users` NO se anotaron, a propósito.** `users` no es strict hoy. Anotarlo "por las dudas" habría dejado la decisión tomada de antemano para el que migre ese módulo, que es exactamente el modo en que un tripwire se apaga solo con el tiempo. Queda escrito en el comentario.

- **`ensureEfectivoCaja` tenía un throw esperándolo y nadie lo había visto.** Su sonda de idempotencia es un `SELECT … FROM cash_registers WHERE type='efectivo' AND branch_id=?` **sin gimnasio** — tabla strict, throw seguro. Ahora filtra con el `tenantId` que ya recibía. Firma y default intactos (los ~40 call sites de El Templo no cambian), pero el docblock ahora dice qué pasa si se omite el 4º argumento fuera de El Templo: no falla, **siembra en el gimnasio equivocado en silencio** — y desde que la sonda filtra, cada llamada crearía una caja nueva.

- **`test/setup.ts`: los 4 seeds de `cash_registers` estampan `tenant_id` explícito** (`b.tenant_id` por sede; El Templo en la central y los dos bancos) **y sus sondas `NOT EXISTS` filtran por gimnasio**. Sin el filtro en la sonda, una caja del gimnasio 2 de una corrida anterior haría creer que la de El Templo ya existe y el seed se saltearía en silencio.

- **80 queries directas migradas en los 6 archivos**, con la evidencia por archivo en la tabla de abajo, y **cero expectativas tocadas** (`git diff | grep -c "^[-+].*expect("` = **0**).

- **Verificación EN CALIENTE, que es la que vale.** Con la entrada `finance` (las 6 tablas) puesta a mano en `TENANT_STRICT_MODULES`, los 6 archivos corrieron enteros contra MySQL real: **93/93**. Y la sonda se revirtió: `git status --porcelain el-templo-api/src/db/tenant-tables.ts` sale **vacío** y el archivo vuelve a decir `TENANT_STRICT_MODULES … = {}`.

## Verificación

| Criterio                                                             | Resultado                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm exec tsc --noEmit`                                             | ✅ **exit 0** (después de cada task)                               |
| `grep -c "tenant-safe:" test/helpers.ts`                             | **2** (pedía ≥ 1): 1 en el SQL + 1 en el comentario que lo explica |
| Motivo de la exención, no vacío                                      | ✅ `analyzeSql` devuelve `exempt` con el motivo completo           |
| La exención vive DENTRO del string SQL                               | ✅ visible en la línea del `DELETE`, entre el verbo y el `FROM`    |
| Accesos a tablas strict sin filtro en `helpers.ts` / `setup.ts`      | **0** (auditoría mecánica, ver abajo)                              |
| `vitest run` de los 6 archivos **con strict encendido**              | ✅ **93/93** — 30 + 37 + 26 en tres corridas                       |
| `git status --porcelain … src/db/tenant-tables.ts` al terminar       | ✅ **vacío** — la sonda fue revertida                              |
| `git diff -- test/finance \| grep -c "^[-+].*expect("`               | **0** — ni una expectativa modificada                              |
| `grep -c "TENANT_TEMPLO" test/finance/cash-register-service.test.ts` | **2** (pedía ≥ 1)                                                  |
| `git status --porcelain … tenant-lint-allowlist.json`                | ✅ vacío (dueño único = 172-21)                                    |
| `prettier --check` sobre los 8 archivos                              | ✅                                                                 |
| `git status --porcelain` en `et-172`                                 | ✅ vacío                                                           |

### Corridas contra MySQL real (con `finance` en `TENANT_STRICT_MODULES`)

| Corrida | Archivos                                 | Tests     | Duración |
| ------- | ---------------------------------------- | --------- | -------- |
| 1       | `cash-register-service` + `cost-centers` | **30/30** | 232 s    |
| 2       | `cost-centers-abm` + `bank-accounts`     | **37/37** | 252 s    |
| 3       | `cash-balances` + `validate-caja`        | **26/26** | 305 s    |
| —       | **Total**                                | **93/93** | ~13 min  |

### Sitios migrados, archivo por archivo

**Task 1 — infraestructura (2 archivos):**

| Archivo      | Sitios migrados                                                                           | Exenciones `tenant-safe` declaradas              |
| ------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `helpers.ts` | **1** (el SELECT de `ensureEfectivoCaja`; su INSERT ya usaba `tenantValues` desde la 171) | **1** (el DELETE del loop de `cleanAllTestData`) |
| `setup.ts`   | **4** (los 4 seeds de `cash_registers`: columna `tenant_id` + `NOT EXISTS` filtrado)      | **0**                                            |

**Task 2 — los 6 archivos de cajas y centros de costo:**

| Archivo                         | Queries migradas | Tablas strict tocadas                                                           |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `cash-register-service.test.ts` | **35**           | `cash_registers`, `financial_transactions`, `balances`                          |
| `cash-balances.test.ts`         | **13**           | `cash_registers`, `financial_transactions`, `transaction_links`                 |
| `cost-centers.test.ts`          | **12**           | `cost_centers`, `cash_registers`, `financial_transactions`, `transaction_links` |
| `validate-caja.test.ts`         | **11**           | `financial_transactions`, `transaction_links`, `balances`, `cash_registers`     |
| `cost-centers-abm.test.ts`      | **6**            | `cash_registers`, `financial_transactions`, `transaction_links`, `cost_centers` |
| `bank-accounts.test.ts`         | **3**            | `cash_registers`, `cost_centers`                                                |
| **Total**                       | **80**           | las 5 de las 6 (`debt_management` no aparece en estos archivos)                 |

### 📌 Entradas de allowlist que paga este plan: **0**

Y es lo correcto: **`tenant-lint-allowlist.json` solo cubre `src/`**, no `test/`. Este plan no toca una línea de `src/`, así que el lint no se mueve. **La cuenta acumulada para el 172-21 sigue en 51.** Que un plan de esta fase pague 0 entradas y aun así sea imprescindible es justamente el punto: el lint y el sentinel son **dos vigilantes distintos**, y este plan trabaja para el segundo.

## Decisions Made

### 1. Exención SOLO donde el acceso global es deliberado; en todo el resto, filtro

El plan pedía "una exención" y el threat register (T-172-13-01) la quería única. La regla que se aplicó para decidir caso por caso es simple y queda escrita para los planes 14/15/16:

> Si el statement borra/lee a propósito **de todos los gimnasios**, la exención es la salida honesta. Si el statement puede acotarse sin cambiar lo que el test prueba, se acota.

- `cleanAllTestData` → **exención**. Vacía la base de test entera; filtrarla por El Templo dejaría filas del gimnasio 2 vivas entre archivos (`isolate: false`), o sea cambiaría el comportamiento del helper para hacer feliz a un vigilante.
- Los 3 `sql` crudos del `beforeEach` de `validate-caja.test.ts` → **filtro** (`WHERE tenant_id = ${TENANT_TEMPLO}`). Ese archivo no siembra en otro gimnasio; el DELETE global era comodidad, no diseño. Acotarlo es además **más seguro** que antes: el día que un fixture siembre en el gimnasio 2, este `beforeEach` ya no se lo lleva puesto. Es el mismo idioma que la fase 171 dejó escrito en `second-tenant.ts:367-371`, anticipando exactamente esta fase.

### 2. Los statements sobre `users` de `cleanAllTestData` NO se anotan

`users` no es strict hoy, así que anotarlos no cambia nada **ahora**. Cambia todo **después**: el que migre el módulo dueño de `users` encontraría la exención ya puesta y no tendría que decidir si ese borrado global sigue siendo legítimo. Una exención heredada sin dueño es cómo se apaga un tripwire sin que nadie lo apague. Queda escrito en el comentario de la función, con nombre y apellido de lo que hay que revisar ese día.

### 3. `ensureEfectivoCaja` conserva firma y default, pero el docblock ahora dice qué se rompe si se omite el tenant

El plan pedía explícitamente no tocar la firma. Se respetó. Pero el cambio del SELECT tiene una consecuencia nueva que había que escribir: **antes**, omitir el 4º argumento para una sede del gimnasio 2 estampaba mal la caja pero la sonda de idempotencia la encontraba igual (era global); **ahora** la sonda filtra por gimnasio, así que además de estampar mal, cada llamada crearía **otra** caja. La regla quedó en una línea: si el `branchId` no es de El Templo, pasá su `tenantId`.

### 4. `test/setup.ts` se migra aunque el sentinel no lo vea

Hallazgo que el plan no anticipaba y que importa para los planes siguientes: **`test/setup.ts` no usa `app.dbPool`**. Crea sus propias conexiones con `mysql.createConnection` (tiene que hacerlo: corre antes de que exista una app y es quien fija `process.env.DB_NAME`). El sentinel envuelve **el pool**, así que esas queries **nunca** habrían hecho throw. Se migraron igual, y el motivo está escrito arriba del bloque: el riesgo real —una caja estampada en el gimnasio equivocado (T-168-15)— no depende de que haya un vigilante mirando. Lo contrario ("no lo ve nadie, lo dejo") es cómo se llega a un fixture que miente.

### 5. La cobertura se auditó con una herramienta, no con el ojo

`cash-register-service.test.ts` tiene 858 líneas y 35 accesos a tablas strict repartidos en 9 `describe`. Revisarlo leyendo es cómo se saltea uno. Se escribió un `awk` que, para **cada** línea con `.from/.insert/.update/.delete(schema.<tabla strict>)`, exige `tenantWhere(` / `tenantValues(` / `tenant_id` en la ventana del statement (−2 / +9 líneas) y **lista la línea exacta** de los que no. Sobre los 6 archivos finales devuelve **vacío**. Es la misma idea que el gate `faltantes`/`fantasmas` de `iso-01`: que el rojo NOMBRE lo que falta.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctitud] `ensureEfectivoCaja` necesitaba `tenantWhere`, no solo un docblock**

- **Found during:** Task 1
- **Issue:** El `<action>` dice de `ensureEfectivoCaja` "no cambiar su firma ni su default, **solo documentar** en su docblock". Pero su SELECT sobre `cash_registers` —tabla **strict**— no tenía filtro de gimnasio: con la sonda encendida hace **throw**, y `ensureEfectivoCaja` la llaman los fixtures de finance. Documentarlo y no arreglarlo habría dejado el bloqueante en pie con un cartel al lado.
- **Fix:** `tenantWhere(schema.cashRegisters, { tenantId })` en el `and(...)` del SELECT, usando el `tenantId` que el helper **ya recibía**. Firma y default intactos, que es lo que el plan sí pedía; el docblock se escribió además.
- **Files modified:** `test/helpers.ts`
- **Committed in:** `e3092ea6`

**2. [Rule 2 - Correctitud] Las sondas `NOT EXISTS` de `setup.ts` también necesitaban el gimnasio**

- **Found during:** Task 1
- **Issue:** El `<action>` pide `tenant_id` "en el predicado" de los `sql` crudos. Aplicado solo a la columna del INSERT, los cuatro seeds habrían quedado a medias: las sondas `SELECT 1 FROM cash_registers cr WHERE cr.type=… AND cr.branch_id=b.id` siguen siendo globales, así que una caja del gimnasio 2 sobreviviente de otra corrida haría creer que la de El Templo ya existe y **el seed se saltearía en silencio** — dejando a decenas de tests sin caja y con el hard-throw "No existe caja efectivo para la sucursal X".
- **Fix:** `cr.tenant_id = b.tenant_id` en la sonda por sede y `cr.tenant_id = ${TENANT_TEMPLO}` en las tres centrales.
- **Files modified:** `test/setup.ts`
- **Committed in:** `e3092ea6`

**3. [Rule 3 - Alcance] `TENANT_TEMPLO` se declara local en `setup.ts` en vez de importarse del fixture**

- **Found during:** Task 1
- **Issue:** El PATTERNS pide que el gimnasio salga del fixture y no de un `1` mágico. Pero `test/fixtures/second-tenant.ts` importa `test/helpers.ts`, que importa `buildApp`: importarlo desde `setup.ts` arrastraría la cadena entera del app a `setupFiles`, que corre **antes** de que exista una app y cuyo trabajo es fijar `process.env.DB_NAME` en el load del módulo.
- **Fix:** `const TENANT_TEMPLO = 1;` local con un docblock que dice de dónde sale y por qué no se importa. Es el mismo camino que ya toman otros 7 archivos de test del repo (`con-01`, `con-03`, `con-04`, `tenant-helpers`, `tv-pairing-tenant`, `advanced-finance`, `webhook-tenant-derivation`).
- **Files modified:** `test/setup.ts`
- **Committed in:** `e3092ea6`

**4. [Rule 1 - Conteo del plan] "~35 queries en cash-register-service" era, por una vez, exacto**

- **Found during:** Task 2
- **Issue:** Ninguno, y se anota porque es la excepción: las cinco veces anteriores de esta fase el conteo del PATTERNS estaba sobrestimado (contaba referencias `schema.X`, no queries). Acá el archivo tiene **35** accesos y el plan decía "~35".
- **Fix:** ninguno.
- **Files modified:** ninguno

---

**Total deviations:** 3 auto-fixed (3 × Rule 2/3, las tres endurecimientos) + 1 nota de conteo. Ninguna agrega alcance: las tres refuerzan lo que el propio plan pedía (que la infraestructura de test sobreviva al throw).

## Issues Encountered

**`debt_management` no aparece en ninguno de los 6 archivos.** Es la sexta tabla strict y estos tests no la tocan: la ejercita `balance-service` (`applyDelta`) por adentro. Su cobertura de test cae en los planes 172-14/15/16, no acá.

**La sonda hay que encenderla y apagarla a mano, y son 4 planes seguidos.** El `<context>` del plan lo dice y se cumplió al pie: pre-check de `git status --porcelain el-templo-api/src/db/tenant-tables.ts` **vacío** antes de encender, y `git checkout --` antes de commitear. **Para el 172-14:** volvé a hacer el pre-check. Si sale algo, hay otra sonda viva y hay que frenar — no revertir a ciegas, porque el revert de uno pisa la sonda del otro y las corridas dan falsos verdes.

**Prettier corrió DESPUÉS de las corridas de test en `cost-centers.test.ts`.** El reformateo es puramente de espacios (el `tsc --noEmit` posterior sale 0 y el diff no toca un identificador), así que el verde de la corrida sigue valiendo. Vale como recordatorio para los planes siguientes: correr `prettier --write` **antes** de la corrida larga ahorra la duda.

**Lo que este plan NO prueba.** Los 93 tests corren con **un solo gimnasio**. Prueban que **con el sentinel en modo throw no se rompió nada** — que es exactamente el objetivo del plan— pero **no prueban aislamiento**. Que la caja del gimnasio A no aparezca en el arqueo del B lo prueba la batería ISO-03 en el 172-22/23.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas de request, no instala paquetes y no modifica un solo mensaje de error.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-13-01 | ✅ **una sola** exención en todo el plan, con motivo explícito, sobre un DELETE que solo corre en test, con el argumento escrito arriba de la función y con el `users` deliberadamente afuera         |
| T-172-13-02 | ✅ `TENANT_TEMPLO` importado del fixture en los 6 archivos de test (y declarado con su porqué en `setup.ts`); el 4º argumento de `ensureEfectivoCaja` documentado como obligatorio fuera de El Templo |
| T-172-13-03 | ✅ sonda revertida y verificada con `git status --porcelain`, que sale vacío; los dos commits del plan no tocan `src/`                                                                                |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                          |

## Next Phase Readiness

**Listo para el 172-14.** Cinco cosas que los planes 14/15/16 tienen que dar por sentadas:

1. **`cleanAllTestData` ya no es un bloqueante.** Su exención está declarada y probada contra el clasificador real. **No hace falta tocarla de nuevo** — y si alguien encuentra otro `DELETE` global en un fixture, la regla para decidir está en la decisión 1 de este SUMMARY (global a propósito → exención; acotable → filtro).
2. **Pre-check obligatorio de la sonda.** `git status --porcelain el-templo-api/src/db/tenant-tables.ts` tiene que salir **vacío** antes de encenderla. Este plan la dejó apagada y verificada.
3. **La allowlist no se mueve con trabajo en `test/`.** La cuenta para el 172-21 **sigue en 51**. Un plan de esta cadena que "no baje el número" está bien: trabaja para el sentinel, no para el lint.
4. **`test/setup.ts` no pasa por el pool** y por lo tanto el sentinel no lo ve. Si un plan siguiente encuentra ahí una query sin gimnasio, no es un throw en potencia — pero sigue siendo un fixture que puede mentir.
5. **La auditoría mecánica está escrita** (el `awk` de la decisión 5). Un archivo de 900 líneas con 35 accesos no se revisa a ojo: para los planes 14/15/16 conviene volver a correrla en vez de confiar en la lectura.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-13-SUMMARY.md`
- `FOUND` commits `e3092ea6` (T1) y `4a3244fe` (T2) en `feat/172-adopcion-finance`
- `FOUND` los 8 archivos modificados en `git diff --stat 9e9846a6..HEAD` (+664 / −275)
- `VERIFIED` `pnpm exec tsc --noEmit` exit 0 después de cada task
- `VERIFIED` `analyzeSql` devuelve `exempt` con motivo sobre el DELETE anotado y `violation` sobre el mismo DELETE sin anotar
- `VERIFIED` 93/93 tests verdes contra MySQL real **con `finance` en `TENANT_STRICT_MODULES`** (30 + 37 + 26)
- `VERIFIED` `git status --porcelain el-templo-api/src/db/tenant-tables.ts` vacío y el archivo de vuelta en `TENANT_STRICT_MODULES … = {}`
- `VERIFIED` `git diff -- test/finance | grep -c "^[-+].*expect("` = 0
- `VERIFIED` auditoría mecánica de cobertura sobre los 8 archivos: **0 accesos sin filtro/estampa**
- `VERIFIED` `tenant-lint-allowlist.json` sin modificar y `git status --porcelain` en `et-172` vacío

**ADO-01 NO se marca completo**, misma convención que 172-01…172-12: el requisito exige `finance` migrado **con aislamiento verde**, y eso lo prueban el 172-22/23. Este plan saca del camino el bloqueante de infraestructura, no cierra el requisito.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
