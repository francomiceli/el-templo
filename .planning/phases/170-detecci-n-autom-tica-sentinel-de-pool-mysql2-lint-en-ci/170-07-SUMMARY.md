---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
plan: 07
subsystem: database
tags:
  [
    multi-tenancy,
    tenant-id,
    lint,
    allowlist,
    baseline,
    ratchet,
    ci,
    github-actions,
    fail-closed,
  ]

# Dependency graph
requires:
  - phase: 170-05
    provides: "lintTenant / runLint / la allowlist vacía y sus cuatro gates — el gate que este plan puebla y enchufa"
  - phase: 170-03
    provides: "lintTenantSources / buildSchemaTableMap — el motor del que sale el baseline"
provides:
  - "tenant-lint-allowlist.json con el baseline one-shot: 389 entradas (file, table) sobre 108 archivos y 78 tablas"
  - "El lint sale 0 sobre el repo tal como está hoy: toda la deuda existente inventariada y nada de más"
  - "Step bloqueante `Tenant lint (CON-06)` en el job api-check de CI, con fetch-depth: 0"
  - "Evidencia en vivo de los tres rojos: acceso nuevo, allowlist agrandada y base irresoluble"
affects: [170-08, 171-fixtures-2-tenant, 172-adopcion-finance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Baseline generado con un snippet DESCARTABLE fuera del repo: la ausencia de regenerador es la propiedad de seguridad, no un olvido"
    - "El comentario del fetch-depth explica el modo de falla (gate decorativo), no la sintaxis"
    - "Un test que codifica el estado PREVIO de un gate se actualiza al poblarlo, y se agrega el `it` del estado nuevo — no se borra el viejo"

key-files:
  created: []
  modified:
    - el-templo-api/tenant-lint-allowlist.json
    - .github/workflows/ci.yml
    - el-templo-api/test/tenancy/con-06-lint.test.ts

key-decisions:
  - "El baseline agrupa por par (file, table) y NO por acceso: 1.597 accesos violadores colapsan en 389 entradas revisables. Una lista de 1.597 renglones no la revisa nadie, y una allowlist que nadie revisa es una allowlist que nadie achica"
  - "Los 33 accesos con exención anclada NO entran a la allowlist: son el otro canal (D-12/D-17). Mezclarlos haría que pagar una deuda por exención obligara a tocar dos archivos"
  - "El step de CI va DESPUÉS del Type check: un repo que no compila no tiene por qué llegar a un análisis de AST, y el orden hace que el primer rojo sea el más barato de leer"
  - "LINT_BASE sale de un ternario sobre github.event_name en vez de confiar en un solo campo: en pull_request el `before` viene vacío y en el primer push de una rama el `before` es el SHA nulo"

patterns-established:
  - "Los tres rojos del gate demostrados en vivo y revertidos sin commitear (idioma 168-05 / 169-04 / 170-02 / 170-04 / 170-05 / 170-06)"

requirements-completed: [CON-06]

# Metrics
duration: 55min
completed: 2026-07-28
---

# Phase 170 Plan 07: Baseline de la allowlist y step bloqueante en CI Summary

**El lint de tenancy dejó de ser un comando que sale rojo: la deuda existente quedó inventariada en 389 entradas revisables, el repo sale verde, y desde ahora el que agrega un acceso sin `tenant_id` —o el que intenta agrandar la lista para taparlo— se lleva el build rojo. Demostrado en vivo, no asumido.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3/3
- **Diff:** 3 archivos, +1632/-10
- **Costo del step en CI:** el pase completo sobre 429 archivos mide **~2,3 s** (contra los ~40 s del `tsc --noEmit` del mismo job)

## Accomplishments

- **El baseline colapsa 1.597 accesos violadores en 389 entradas.** Ese colapso es la decisión que hace la lista revisable: la unidad es el par `(archivo, tabla)` de D-13, así que `src/modules/users/service.ts` con 10 accesos sin filtro a `users` es **una** entrada, no diez. 108 archivos, 78 tablas gym-owned distintas.
- **El repo sale en verde sin haber perdonado nada.** `pnpm lint:tenant` pasó de **exit 1 con 1.597 violaciones** a **exit 0 con 0 discrepancias**, y las 1.597 siguen ahí: ahora están _toleradas y escritas_, que es lo contrario de estar ignoradas. Cada entrada es un renglón que una fase de adopción va a tener que borrar.
- **No quedó comando que regenere la lista (D-16).** El baseline lo produjo un snippet de 90 líneas escrito en el scratchpad de la sesión, **fuera del repo**, que importó `lintTenantSources` y `buildSchemaTableMap` del script real. `git status` no muestra ningún archivo nuevo fuera de la allowlist. La ausencia del regenerador es la propiedad de seguridad: con uno, cualquier PR podría volver a poner en verde la deuda que acaba de introducir.
- **El step de CI rompe el build, y el archivo lo dice en dos idiomas.** `Tenant lint (CON-06)` no lleva `|| true` ni `continue-on-error`, en contraste deliberado con el `Security audit` de la línea siguiente y con los `Lint` de los tres frontends. El comentario inline lo explica arriba del step.
- **`fetch-depth: 0` solo en `api-check`,** con el comentario diciendo el modo de falla y no la sintaxis: sin historia, el ratchet no resuelve la base y **el lint sale 2**, no 0. Sacar esa línea deja el build rojo en vez de dejarlo pasar en falso — la mitigación de T-170-04 está en el código, no en la costumbre.
- **Los tres rojos están demostrados con salida literal** (abajo): acceso nuevo por query-builder **y** por `sql` crudo, allowlist agrandada en una entrada, y base irresoluble. El criterio 4 del ROADMAP queda con evidencia.

## Task Commits

1. **Task 1: Baseline one-shot de la allowlist (D-16)** — `3372b255` (chore)
2. **Task 2: Step bloqueante en CI + fetch-depth 0** — `eb4a86ab` (ci)
3. **Task 3: Demostración en vivo + los `it` que asumían la lista vacía** — `aa862e1e` (test)

## Files Created/Modified

- `el-templo-api/tenant-lint-allowlist.json` — **+1559/-2**. `entries` pasa de `[]` a **389 pares** ordenados por `file` y después por `table`, sin números de línea. `note` (7 párrafos) y `scope` quedaron **intactos**: el snippet solo tocó `entries` y `generated`. `generated` ahora dice: _"2026-07-28 — fase 170, one-shot (D-16): esta lista no se regenera; achicar es borrar entradas a mano al migrar cada modulo."_
- `.github/workflows/ci.yml` — **+22**. Bloque de comentario sobre el `Checkout code` de `api-check` + `with: fetch-depth: 0`, y el step `Tenant lint (CON-06)` entre `Type check` y `Security audit`, con `LINT_BASE` por `env:`. **Ningún otro job cambió** (verificado con el parser YAML) y `deploy.yml` quedó sin tocar.
- `el-templo-api/test/tenancy/con-06-lint.test.ts` — **+51/-8**, **36 tests** (35 + 1). Ver desvío 1.

## El baseline en números

| Métrica                            | Valor                                                          |
| ---------------------------------- | -------------------------------------------------------------- |
| Entradas `(archivo, tabla)`        | **389**                                                        |
| Accesos violadores que cubren      | **1.597**                                                      |
| Archivos distintos                 | **108**                                                        |
| Tablas gym-owned distintas         | **78** (de las 87 de `GYM_OWNED_TABLES`)                       |
| Archivos analizados                | 429                                                            |
| Accesos totales detectados         | 1.640 (1.597 violadores + 33 exentos + 10 ya cumplidores)      |
| Entradas bajo `test/`              | **0** (alarma de Pitfall 9 no disparó)                         |
| Entradas duplicadas                | 0                                                              |
| Entradas fuera del alcance de D-16 | 0 (todas bajo `el-templo-api/src/` o `el-templo-api/scripts/`) |

**Top 5 de tablas por entradas** (o sea, por cantidad de archivos que las tocan mal):

| Tabla                | Entradas | Accesos |
| -------------------- | -------- | ------- |
| `users`              | 41       | 161     |
| `subscriptions`      | 40       | 220     |
| `branches`           | 33       | 62      |
| `subscription_plans` | 19       | 41      |
| `bookings`           | 17       | 152     |

Los tres primeros son exactamente los que hay que esperar: son las tablas que toca todo el sistema. `subscriptions` con 220 accesos sobre 40 archivos anticipa el tamaño de la fase de adopción de finanzas.

**Spot-check de 5 entradas** (una cada 78, sobre la lista ordenada), abriendo el archivo y confirmando que hay un acceso real sin filtro de gimnasio:

| Entrada                                                   | Sitio confirmado                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/db/import-members.ts` → `subscriptions`              | `:1009` `.from(subscriptions).where(and(eq(userId), eq(planId)))` — sin `tenant_id` |
| `src/modules/analytics/frequency-service.ts` → `branches` | `:319` join contra `schema.branches` sin filtro de gimnasio                         |
| `src/modules/finance/transaction-service.ts` → `balances` | `:227` `.from(schema.balances).where(eq(schema.balances.id, link.targetId))`        |
| `src/modules/reports/service.ts` → `branches`             | `:370` join `eq(schema.branches.id, schema.attendance.branchId)`                    |
| `src/modules/spom/service.ts` → `spom_config`             | `:31` `.from(schema.spomConfig).where(eq(schema.spomConfig.id, 1))`                 |

### Inventario de exenciones: **10**, no 9

El plan esperaba **9** (los sitios conocidos de la fase 169) y salieron **10**. La diferencia es explicable y correcta: la décima es **`el-templo-api/src/db/scripts/lint-tenant.ts:143`**, la exención de archivo entero que el **plan 03 de esta misma fase** le escribió al propio lint (_"tooling de plataforma: analiza el fuente por AST y no ejecuta una sola query"_). Las otras 9 son las de la 169, sin cambios ni de motivo ni de alcance:

- **Archivo entero (6):** `src/db/run-migrations.ts`, `src/db/scripts/verify-tenant-backfill.ts`, `src/db/scripts/verify-tenant-uniques.ts`, `src/db/seed-spom.ts` (cubre 25), `src/db/seed.ts` (cubre 6), `scripts/wellhub-sandbox.ts`.
- **Sitio (3):** `src/jobs/notification-cron.ts:754`, `src/modules/tv/pairing.ts:145` (cubre 1), `src/modules/wellhub/service.ts:135` (cubre 1).

Los **33 accesos cubiertos** por esas exenciones **no entraron a la allowlist**: son el otro canal (D-12/D-17) y mezclarlos habría hecho que pagar una deuda por exención obligara a tocar dos archivos.

## Demostración en vivo del rojo (criterio 4 del ROADMAP)

### Sonda A — acceso nuevo sin scope: **exit 1**, las dos formas detectadas

Archivo temporal `el-templo-api/src/modules/__probe-tenant-lint.ts`, primero con un solo acceso por query-builder:

```
Archivos analizados:            430
Violaciones NO listadas en la allowlist (unlistedViolations): 1
  - el-templo-api/src/modules/__probe-tenant-lint.ts — attendance (1 acceso)
DISCREPANCIAS: 1
EXIT=1
```

Agregando al mismo archivo un `sql` crudo (`sql\`SELECT id FROM bookings WHERE booking_status = 'confirmed'\``) sobre otra tabla gym-owned:

```
Violaciones NO listadas en la allowlist (unlistedViolations): 2
  - el-templo-api/src/modules/__probe-tenant-lint.ts — attendance (1 acceso)
  - el-templo-api/src/modules/__probe-tenant-lint.ts — bookings (1 acceso)
DISCREPANCIAS: 2
EXIT=1
```

Las **dos formas de acceso** que existen en este repo quedan cubiertas: el query-builder (`kind: query-builder`) y el template crudo (`kind: sql-template`, detectado por el nombre de tabla en el texto literal). Borrado el archivo:

```
Archivos analizados:            429
Violaciones NO listadas en la allowlist (unlistedViolations): 0
DISCREPANCIAS: 0
EXIT_TRAS_BORRAR=0
```

### Sonda B — allowlist agrandada: **exit 1**, la entrada listada como GANADA

Con el estado limpio ya commiteado, se agregó **a mano** una entrada que hoy no está: `el-templo-api/src/db/seed.ts` + `users`. La elección no es casual — `seed.ts` tiene exención de archivo, así que sus accesos están **vivos pero no son violaciones**, y por lo tanto la entrada sale **solo** como ganada y no también como podrida. `pnpm lint:tenant --base=HEAD`:

```
Entradas de la allowlist:       390
Entradas GANADAS respecto de la rama base (gainedEntries): 1
  - el-templo-api/src/db/seed.ts — users
      Que hacer: la allowlist CRECIO, y solo puede achicarse (D-14). Saca la entrada y resolve el acceso: migralo al patron de la fase 169 o escribile la exencion con motivo. La allowlist no es una alfombra.
DISCREPANCIAS: 1
EXIT=1
```

Revertida con `git checkout -- el-templo-api/tenant-lint-allowlist.json`:

```
Entradas de la allowlist:       389
DISCREPANCIAS: 0
EXIT_TRAS_REVERTIR=0
```

### Sonda C — base irresoluble: **exit 2**, y el mensaje nombra `fetch-depth: 0`

`--root` a un directorio con la allowlist copiada pero **sin repo git** (`fatal: not a git repository`), y `--base` con el SHA nulo de 40 ceros, o sea el caso que produce sola la CI en el primer push de una rama:

```
lint-tenant fallo: --base vino con el SHA nulo (primer push de la rama) y el fallback `git merge-base origin/master HEAD` fallo. Si esto pasa en CI, el checkout del job necesita `fetch-depth: 0`: el default es 1 y con un clon shallow la rama base NO esta en el repo. El lint sale 2 a proposito en vez de asumir 'sin cambios': un gate que pasa en verde por no haber podido mirar es peor que no tenerlo (T-170-04).
EXIT=2
```

Es la prueba de que el gate **no puede pasar en verde por no haber podido mirar**, que es el modo de falla que convierte cualquier ratchet en decoración.

**Ninguna sonda quedó commiteada ni en el árbol:** `git status --porcelain` (sin `.planning`) da **0 líneas** al cierre, y ninguna entrada de sonda quedó dentro de `tenant-lint-allowlist.json`.

## Decisions Made

- **El baseline agrupa por par, no por acceso.** 1.597 renglones no los revisa nadie; 389 sí. Y el formato de D-13 ya lo exigía: la entrada es `(archivo, tabla)` y punto. La contracara aceptada sigue escrita en el `note`: un acceso nuevo a **otra** tabla en el **mismo** archivo es entrada nueva, o sea rojo.
- **Los exentos no van a la allowlist.** Los 33 accesos cubiertos por una exención anclada quedaron afuera a propósito: si entraran, migrar un acceso por la vía de la exención obligaría a tocar también la allowlist, y la deuda tolerada dejaría de distinguirse de la deuda justificada.
- **El step va después del `Type check` y antes del `Security audit`.** Un repo que no compila no tiene por qué llegar a un pase de AST, y el `Security audit` inmediatamente debajo es el contraste visible: el de al lado tolera el fallo, éste no.
- **`LINT_BASE` sale de un ternario sobre `github.event_name`.** En `pull_request` se usa `github.event.pull_request.base.sha`, que siempre existe; en `push`, `github.event.before`, que en el primer push de una rama viene con el SHA nulo — y ese caso lo normaliza el script cayendo a `merge-base origin/master HEAD`. Confiar en un solo campo dejaría uno de los dos eventos corriendo el ratchet contra nada.
- **`fetch-depth: 0` solo en `api-check`.** Los otros cuatro jobs no corren el lint; darles historia completa sería pagar el clone entero cinco veces por push sin ganar nada. Verificado con el parser YAML: los checkouts de `api-test`, `app-check`, `web-check` y `admin-check` siguen sin bloque `with`.

## Deviations from Plan

### 1. [Rule 1 - Bug] Dos `it` del plan 05 codificaban el estado PREVIO al baseline y quedaban rojos

- **Found during:** Task 3 (corrida de la batería después de commitear el baseline)
- **Issue:** `test/tenancy/con-06-lint.test.ts` traía dos `it` escritos cuando la allowlist estaba vacía, y el Task 1 los rompió a los dos:
  1. **"un árbol sin violaciones y con la allowlist vacía sale 0"** le pasaba la allowlist **real** a un árbol temporal que solo tiene el schema copiado. Con la lista vacía daba 0; con el baseline, las 389 entradas apuntan a archivos que ese árbol no tiene → **389 `staleMissingFile`** → exit 1. El `it` se habría puesto rojo por el motivo equivocado.
  2. **"el repo real con la allowlist todavía vacía sale 1"** afirmaba literalmente el estado que este plan viene a cambiar (su propio mensaje decía _"el baseline lo puebla el plan 07"_): ahora el repo real sale **0**.
- **Fix:** Se creó una allowlist **vacía de verdad** dentro del árbol temporal, en `el-templo-api/tenant-lint-allowlist.json`, o sea **el lugar donde el lint la busca por default** — así el primer `it` corre además sin `--allowlist` y ejercita el camino de resolución que usa CI. El segundo `it` pasó a correr contra esa lista vacía, conservando intacto lo que probaba (_"si esto diera 0, el motor dejó de ver el repo"_). Y se **agregó** un tercer `it` para el estado nuevo: **"el repo real con el baseline del plan 07 sale 0"**, que es el que se pondrá rojo el día que alguien agregue un acceso sin `tenant_id` sin migrarlo ni eximirlo. Ninguno de los dos viejos se borró: el que afirmaba "el motor ve la deuda" es lo que impide que el verde del nuevo sea el verde de un lint ciego.
- **Files modified:** `el-templo-api/test/tenancy/con-06-lint.test.ts`
- **Verification:** `pnpm exec vitest run test/tenancy/con-06-lint.test.ts` → **36 tests passed** (35 antes).
- **Committed in:** `aa862e1e`

### 2. [Rule 3 - Blocking] El worktree es `et-170-sentinel`, no `et-170-deteccion`

- **Found during:** arranque
- **Issue:** El `<context>` del plan y sus tres bloques `<verify>` referencian `/home/franco/projects/et-170-deteccion`, que no existe.
- **Fix:** Se trabajó en `/home/franco/projects/et-170-sentinel` (rama `feat/170-sentinel-lint`), el worktree real de la fase — mismo desvío ya registrado en los SUMMARY 01 a 06. Cero worktrees nuevos.
- **Files modified:** ninguno
- **Committed in:** n/a

---

**Total deviations:** 2 (1 × Rule 1 — tests que congelaban el estado anterior del gate; 1 × Rule 3 — entorno, heredado). **Cero desvíos de Rule 2 y Rule 4:** el contrato del plan alcanzó tal cual.
**Impact on plan:** Ninguno. La allowlist, el step de CI y las tres sondas salieron exactamente como los especifica el plan. Cero dependencias, cero migraciones, cero cambios en `package.json` / `pnpm-lock.yaml`, `deploy.yml` intacto.

## Issues Encountered

- **La cuenta de exenciones no era 9 sino 10**, y el plan pedía explicar cualquier diferencia. Es la exención que el plan 03 le escribió al **propio `lint-tenant.ts`** — o sea, la fase se eximió a sí misma, correctamente y con motivo escrito. Ninguna de las 9 de la 169 cambió.
- **Los hooks de husky no corren en este worktree** (`core.hooksPath` apunta a `.husky/_`, inexistente en el checkout linkeado). Se corrió `prettier --write` a mano sobre los dos archivos que `lint-staged` cubre (`*.json` y `*.ts`); los dos salieron `unchanged`. **`.yml` no está en la config de `lint-staged`**, así que `ci.yml` no lo toca Prettier ni acá ni en el checkout principal.
- **La corrida del archivo de tests sigue costando ~102 s** de los cuales los 36 tests son ~1 s: el resto es el `setupFiles` provisionando MySQL para un archivo que no toca la base. Quinta fase consecutiva que reconfirma el hallazgo 169-07, y la razón de D-09 de que el lint sea un step propio de CI y no un gate de Vitest.
- El pase completo del lint mide **~2,3 s** sobre 429 archivos, contra el número de referencia del threat model (606 ms sobre 382 archivos, medido en el plan 03 sobre el motor pelado, sin la carga de `tsx` ni la construcción del mapa de schema). T-170-20 sigue en `accept` con margen de sobra: es un orden de magnitud menos que el `tsc --noEmit` del mismo job.

## Verification Results

| Verificación                                                                                                | Resultado                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm lint:tenant` (sin `--base`) sobre el repo con el baseline commiteado                                  | ✅ **exit 0**, `DISCREPANCIAS: 0`                             |
| `BASELINE_OK` (0 entradas bajo `test/`, 0 duplicadas, orden `file`+`table`)                                 | ✅ `entries=389 files=108 tables=78`                          |
| Entradas fuera de `el-templo-api/src` + `el-templo-api/scripts`                                             | ✅ 0                                                          |
| `note` (7 párrafos) y `scope` preservados; `generated` actualizado                                          | ✅                                                            |
| Snippet generador dentro del repo                                                                           | ✅ ninguno — `git status --porcelain` sin archivos nuevos     |
| `git diff` del Task 1 toca un solo archivo                                                                  | ✅                                                            |
| Parseo YAML: `fetch-depth: 0` en el checkout de `api-check`                                                 | ✅ `CI_OK`                                                    |
| Parseo YAML: exactamente **un** step con `lint:tenant`, después de `Type check` y antes de `Security audit` | ✅                                                            |
| Parseo YAML: el step **no** tiene `\|\| true` ni `continue-on-error`                                        | ✅                                                            |
| Parseo YAML: `LINT_BASE` con `pull_request.base.sha` **y** `event.before`                                   | ✅                                                            |
| Parseo YAML: los otros 4 jobs sin `with` en su checkout y sin el lint                                       | ✅                                                            |
| `.github/workflows/deploy.yml`                                                                              | ✅ 0 líneas de diff                                           |
| Sonda A (acceso nuevo, query-builder + `sql` crudo)                                                         | ✅ **exit 1**, archivo y tablas nombrados; **0** al borrarla  |
| Sonda B (allowlist agrandada, `--base=HEAD`)                                                                | ✅ **exit 1**, entrada listada como GANADA; **0** al revertir |
| Sonda C (base irresoluble, SHA nulo sin repo git)                                                           | ✅ **exit 2**, el mensaje nombra `fetch-depth: 0`             |
| `git status --porcelain` (sin `.planning`) al cierre                                                        | ✅ **0 líneas**                                               |
| `pnpm exec tsc --noEmit`                                                                                    | ✅ exit 0                                                     |
| `pnpm exec vitest run test/tenancy/con-06-lint.test.ts`                                                     | ✅ **36 tests passed**                                        |
| `package.json` / `pnpm-lock.yaml`                                                                           | ✅ 0 líneas de diff — cero paquetes instalados (T-170-SC)     |
| Migraciones de DB                                                                                           | ✅ ninguna (la numeración sigue reservada desde 0197)         |
| Diff acotado                                                                                                | ✅ 3 archivos, +1632/-10                                      |
| `STATE.md` / `ROADMAP.md`                                                                                   | ✅ NO modificados por este ejecutor                           |

## User Setup Required

Ninguna. Cero variables de entorno, cero secrets, cero configuración manual en GitHub. El step usa `tsx`, que ya está en `devDependencies`, y `fetch-depth: 0` no requiere permisos extra.

**Lo único que cambia para el equipo:** desde el merge de esta rama, un PR que agregue un acceso a una tabla gym-owned sin `tenant_id` deja el job **API - Type Check & Build** en rojo. Las dos salidas válidas están escritas en el propio mensaje de error y en el `note` de la allowlist: migrar el acceso a `tenantWhere` / `tenantValues` (fase 169) o escribirle la exención `/* tenant-safe: <motivo> */` como comentario de bloque pegado al sitio. Agregar la entrada a la allowlist **no** es una salida válida y el gate lo verifica.

## Next Phase Readiness

**Listo para el plan 08 (cierre de la fase):**

- El gate está completo y demostrado. Lo que queda del plan 08 es documentación y cierre, no funcionalidad.
- **Dato para el primer push de esta rama:** el step va a correr con la allowlist **ausente en la base** (`origin/master` todavía no la tiene), así que va a emitir la advertencia ruidosa de la excepción única del plan 05 —_"ATENCION: … NO EXISTE en la rama base … Esto es correcto UNA sola vez"_— y saltear el gate de entradas ganadas. **Es el comportamiento esperado y correcto en ese único push.** A partir del siguiente, cualquier aparición de ese texto significa que alguien borró el archivo.
- **Ojo con la trampa de `paths-filter`** (memoria del repo): esta rama toca `.github/workflows/ci.yml` y `el-templo-api/**`, así que el deploy va a reconstruir el API. Si un push muere en CI, el siguiente tiene que tocar los mismos paths o usar `workflow_dispatch`.

**Para las fases de adopción (172+):**

- El número a mirar es **389**, y solo puede bajar. Migrar `finance` significa borrar sus entradas **en el mismo PR** que activa la tabla en `TENANT_STRICT_MODULES`, y el gate D-15 lo obliga: tabla strict con entradas vivas = rojo.
- El **top 5** de arriba es el mapa de esfuerzo: `users` (41 archivos), `subscriptions` (40), `branches` (33). Las tres las toca medio sistema, así que ninguna fase de módulo las va a vaciar sola.
- Las **10 exenciones** son el otro registro a revisar en cada adopción; las 6 de archivo entero son las de alcance mayor y hay que releerlas cuando el archivo crece (T-170-06).

**Sin blockers.** Nada se pusheó, nada se mergeó a `staging` ni a `master`: los tres commits viven en la rama local `feat/170-sentinel-lint` del worktree.

## Threat Flags

Ninguna superficie nueva de la aplicación: cero endpoints, cero rutas de auth, cero cambios de schema, cero dependencias. El plan **mitiga**:

- **T-170-04** (el step pasa siempre en verde): `fetch-depth: 0` en `api-check`, step sin `|| true` ni `continue-on-error`, y **sonda C** con la salida literal del exit 2.
- **T-170-05** (baseline inflado con `test/**`): alcance fijado antes de generar, verificación programática de **0 entradas bajo `test/`** y de que todas caen dentro de `src/` o `scripts/`, más el spot-check manual de 5 entradas contra el fuente.
- **T-170-15** (queda un regenerador): el snippet vivió en el scratchpad de la sesión y `git status` confirma que no entró nada más que la allowlist. El `note` del JSON ya dice que no existe tal comando.
- **T-170-01** (acceso nuevo sin `tenant_id` mergeado sin que nadie lo vea): **sonda A**, con las dos formas de acceso.
- **T-170-20** (costo del step): `accept`, con el número medido arriba (~2,3 s).
- **T-170-SC** (instalación de paquetes): cero deps nuevas, `pnpm-lock.yaml` con 0 líneas de diff.

Una nota de superficie, no un flag: el step de CI ahora clona la **historia completa** del repo en el job del API. Es historia pública del mismo repo que el job ya checkouteaba; el costo es tiempo de clone, no exposición.

## Self-Check: PASSED

- Archivos: `el-templo-api/tenant-lint-allowlist.json`, `.github/workflows/ci.yml`, `el-templo-api/test/tenancy/con-06-lint.test.ts` y este SUMMARY existen en disco.
- Commits: `3372b255`, `eb4a86ab` y `aa862e1e` existen en `feat/170-sentinel-lint`.
- `STATE.md` y `ROADMAP.md` NO fueron modificados por este ejecutor (los escribe el orquestador).

---

_Phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci_
_Plan: 07_
_Completed: 2026-07-28_
