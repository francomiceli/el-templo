---
phase: 172-adopci-n-1-piloto-finance
plan: 14
subsystem: testing
tags:
  [
    tenancy,
    finance,
    coach-load,
    transacciones,
    bandeja,
    movimientos,
    resumen,
    validacion,
    sentinel,
    sonda-revertida,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / tenantValues)"
  - phase: 170-sentinel-lint
    provides: "src/db/sentinel/ — analyzeSql y el throw de TenantSentinelError"
  - phase: 171-backstop
    provides: "test/fixtures/second-tenant.ts (TENANT_TEMPLO)"
  - plan: 172-01
    provides: "worktree et-172, baseline verde, base a6272df0"
  - plan: 172-08
    provides: "TEMPLO_CTX ya declarado en transaction-service / movement-service / summary-by-kind / validation-*"
  - plan: 172-13
    provides: "cleanAllTestData con exención tenant-safe, ensureEfectivoCaja filtrado, y la regla exención-vs-filtro"
provides:
  - "12 archivos de test de coach-load, transacciones, bandeja, movimientos, resumen y validación con 120 sitios migrados"
  - "HALLAZGO: el SQL crudo por `conn.query` con el nombre de tabla entre backticks es invisible al inventario por grep del PATTERNS — 15 sitios que el plan no contaba"
  - "Evidencia EN CALIENTE sobre test/finance ENTERO (20 archivos, no solo los 12): 341/343 con `finance` en TENANT_STRICT_MODULES y CERO throws del sentinel"
  - "Prueba de 3 corridas de que los 2 rojos restantes son preexistentes en origin/master, con la bandera escrita para el 172-21"
affects: [172-15, 172-16, 172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'El SQL crudo de mysql2 (`conn.query("DELETE FROM `tabla`")`) SÍ pasa por el sentinel —`app.dbPool.getConnection()` es una de las tres puertas que intercepta— pero NO lo encuentra un grep pensado para Drizzle: el nombre va entre backticks y no hay `sql``'
    - "Un DELETE crudo se acota con placeholder parametrizado (`WHERE tenant_id = ?`, `[TENANT_TEMPLO]`): `analyzeSql` lo da por `ok` igual que el literal inline, y no deja superficie de inyección"
    - "`tsc --noEmit` NO typechequea `test/` en este repo (`tsconfig.json` incluye solo `src/**/*`): el único gate real para un archivo de test es vitest"
    - "Discriminar un rojo preexistente de uno propio se hace con corridas que eliminan UNA variable por vez (sonda, archivo, `src/`), no razonando sobre el diff"

key-files:
  created: []
  modified:
    - el-templo-api/test/finance/coach-load.test.ts
    - el-templo-api/test/finance/coach-load-alta.test.ts
    - el-templo-api/test/finance/coach-load-pricing-gate.test.ts
    - el-templo-api/test/finance/transaction-service.test.ts
    - el-templo-api/test/finance/transactions-api.test.ts
    - el-templo-api/test/finance/pending-tray.test.ts
    - el-templo-api/test/finance/movement-service.test.ts
    - el-templo-api/test/finance/mov-egresos-history.test.ts
    - el-templo-api/test/finance/summary-by-kind.test.ts
    - el-templo-api/test/finance/summary-sanity.test.ts
    - el-templo-api/test/finance/validation-regression.test.ts
    - el-templo-api/test/finance/validation-state.test.ts

key-decisions:
  - "CERO exenciones `tenant-safe` en todo el plan: los 34 sitios de SQL crudo se ACOTARON con `tenant_id`, aplicando la regla del 172-13 (global a propósito → exención; acotable → filtro). Ninguno de estos 12 archivos siembra en otro gimnasio, así que ninguno tenía derecho a una exención"
  - "Los `conn.query` sobre tablas NO strict del mismo beforeEach (`audit_log`, `bookings`, `program_enrollments`, `subscriptions`) se dejaron SIN tocar: anotar de más pre-decide por el módulo que las migre (misma lógica que el 172-13 aplicó a `users`)"
  - "Los 2 rojos de `coach-load-alta.test.ts` se declararon FUERA DE ALCANCE con prueba, no con sospecha: 3 corridas que aíslan sonda / archivo / `src/` los ubican en `a6272df0` = `origin/master`"
  - "La verificación se corrió sobre `test/finance` ENTERO (20 archivos), no sobre los 12 del plan: los 6 del 172-13 y los 2 restantes comparten base por worker (`isolate: false`) y el criterio del plan pide la carpeta completa"

patterns-established:
  - "Auditoría mecánica v2 (Python): la v1 en `awk` tenía el mismo punto ciego que el ojo —solo pensaba en Drizzle— y por eso dio 'OK' sobre 15 sitios que el sentinel después cazó. La v2 matchea el nombre de tabla entre backticks, comillas o corchetes. Una herramienta de cobertura que no se prueba contra un caso conocido-malo no es un gate, es un placebo"

requirements-completed: []

# Metrics
duration: 68min
completed: 2026-07-30
---

# Phase 172 Plan 14: El grupo pesado de finance listo para el throw Summary

**Los 12 archivos de coach-load, transacciones, bandeja, movimientos, resumen y validación —120 sitios sobre las 6 tablas strict— pasan con el sentinel en modo throw, sin tocar una sola expectativa. La verificación se corrió sobre `test/finance` ENTERO: 341/343 tests, 20 archivos, con `finance` puesto a mano en `TENANT_STRICT_MODULES` y CERO throws del sentinel. El hallazgo que el plan no anticipaba: el `conn.query("DELETE FROM \`transaction_links\`")`de los`beforeEach`—SQL crudo, nombre de tabla entre backticks, sobre una conexión cruda del pool— es invisible para cualquier inventario por grep pensado en Drizzle, y son 15 sitios en 4 archivos. Los cazó la corrida en caliente, no la lectura. Los 2 rojos restantes se probaron preexistentes en`origin/master` con tres corridas que aíslan una variable cada una.**

## Performance

- **Duration:** ~68 min, de los cuales ~45 son corridas contra MySQL real (6 corridas: 3 de verificación, 2 de discriminación del rojo, 1 completa de 8,7 min)
- **Completed:** 2026-07-30
- **Tasks:** 2/2 (las dos `auto`)
- **Files modified:** 12 — +801 / −349

## Task Commits

| Task | Nombre                                                 | Commit     | Archivos                                                |
| ---- | ------------------------------------------------------ | ---------- | ------------------------------------------------------- |
| 1    | coach-load, transacciones y bandeja                    | `45eff3c8` | 6 archivos                                              |
| 2    | Movimientos, resumen y validación + strict en caliente | `f3fa12ad` | 6 archivos + los 2 de la Task 1 con SQL crudo pendiente |

Los dos commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `4a3244fe` del plan 13). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Accomplishments

- **120 sitios migrados en 12 archivos, cero expectativas tocadas.**
  `git diff 4a3244fe -- test/finance | grep -c "^[-+].*expect("` = **0** sobre el
  plan entero.

- **CERO exenciones `tenant-safe` en todo el plan.** Los 34 sitios de SQL crudo se
  **acotaron**, aplicando la regla que el 172-13 dejó escrita: global a propósito →
  exención; acotable → filtro. Ninguno de estos 12 archivos siembra en otro
  gimnasio, así que ninguno tenía derecho a una exención. El inventario de
  exenciones de la fase sigue en las 10 heredadas + la 1 del 172-13.

- **El hallazgo del plan: el SQL crudo con backticks es invisible al inventario.**
  El `<action>` dio la regex de inventario y el 172-13 dejó una auditoría mecánica
  en `awk`. **Las dos tenían el mismo punto ciego** y las dos dieron "OK" sobre
  `coach-load.test.ts`. Lo que se les escapó:

  ```js
  const conn = await app.dbPool.getConnection();
  await conn.query("DELETE FROM `transaction_links`");
  ```

  Tres razones por las que ni el ojo ni el grep lo vieron: (a) el nombre de tabla va
  **entre backticks**, y las regex esperaban `FROM transaction_links` pelado; (b) no
  es Drizzle (`.from(schema.X)`) ni ``sql`...` ``, que era donde todos miraban; (c) está
  a 200 líneas del último `import`, en un `beforeEach` cuyo comentario habla de
  `FOREIGN_KEY_CHECKS`, no de tenancy. **Pero el sentinel sí lo ve**: `conn.query`
  sobre una conexión de `app.dbPool` es la tercera de las tres puertas que
  `install.ts` intercepta. Resultado de la primera corrida en caliente: **50 tests
  rojos de 61**, todos colgando del mismo throw.

- **La corrida en caliente encontró lo que la lectura no.** Es exactamente el motivo
  por el que el plan la pide y no se conforma con la auditoría estática. El error del
  sentinel además **nombró el problema completo**, sin depurar:

  ```
  TenantSentinelError: [sentinel de tenancy] query sin tenant_id sobre transaction_links
    (módulo ya migrado, ver TENANT_STRICT_MODULES en src/db/tenant-tables.ts).
  SQL: DELETE FROM `transaction_links`
  Qué hacer: filtrá con tenantWhere(tabla, ctx) si es una lectura, estampá
    tenantValues(ctx, {...}) si es una escritura, o —si el acceso es global a
    propósito— escribí la exención con su motivo…
  ❯ test/finance/coach-load.test.ts:233:16
  ```

  El requisito D-07 de la fase 170 (que el mensaje traiga el SQL exacto) se cobró acá:
  el stack sale de adentro del driver y sin el SQL no diría qué query fue.

- **La forma del arreglo se eligió contra el clasificador real, no por intuición.**
  Se corrió `analyzeSql` —el mismo código que corre en el pool— sobre las tres
  variantes antes de tocar los 15 sitios:

  ```
  "DELETE FROM `transaction_links`"                        -> violation
  "DELETE FROM `transaction_links` WHERE tenant_id = ?"    -> ok
  "DELETE FROM `transaction_links` WHERE tenant_id = 1"    -> ok
  ```

  Se eligió el **placeholder parametrizado** (`WHERE tenant_id = ?`, `[TENANT_TEMPLO]`):
  vale lo mismo para el sentinel, es lo idiomático de mysql2 y no deja superficie de
  inyección aunque el día de mañana el valor deje de ser una constante numérica.

- **Verificación sobre `test/finance` ENTERO, no sobre los 12 del plan.** Con
  `finance` (las 6 tablas) puesto a mano en `TENANT_STRICT_MODULES`: **341/343 en 20
  archivos, 8,7 min, CERO throws del sentinel.** Se corrió la carpeta completa a
  propósito: `isolate: false` hace que los archivos compartan base por worker, así que
  verificar solo 12 de 20 deja sin probar justo la interacción que rompe.

- **Sonda revertida y verificada.** `git status --porcelain src/db/tenant-tables.ts`
  sale **vacío** y el archivo vuelve a decir `TENANT_STRICT_MODULES … = {}`. Ninguno de
  los dos commits toca `src/`.

## Verificación

| Criterio                                                        | Resultado                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                        | ✅ **exit 0** (después de cada task)                           |
| `vitest run test/finance` **con strict encendido**              | ✅ **341/343**, 20 archivos, cero throws del sentinel          |
| Throws de `TenantSentinelError` en la corrida final             | ✅ **0**                                                       |
| `git status --porcelain … src/db/tenant-tables.ts` al terminar  | ✅ **vacío** — sonda revertida                                 |
| `git diff 4a3244fe -- test/finance \| grep -c "^[-+].*expect("` | **0** — ni una expectativa modificada                          |
| Auditoría mecánica v2 sobre los 12 archivos                     | ✅ **0 accesos sin filtro/estampa**                            |
| `grep -c "TENANT_TEMPLO" test/finance/coach-load.test.ts`       | **5** (el `must_have` pedía ≥ 1)                               |
| `git status --porcelain … tenant-lint-allowlist.json`           | ✅ vacío (dueño único = 172-21)                                |
| `prettier --check` sobre los 12 archivos                        | ✅ (corrido **antes** de la corrida larga, lección del 172-13) |
| `git status --porcelain` en `et-172`                            | ✅ vacío                                                       |
| Exenciones `tenant-safe` nuevas                                 | **0**                                                          |

### Corridas contra MySQL real (con `finance` en `TENANT_STRICT_MODULES`)

| #   | Archivos                                                  | Tests       | Duración | Nota                                        |
| --- | --------------------------------------------------------- | ----------- | -------- | ------------------------------------------- |
| 1   | coach-load ×3                                             | 11/61       | 258 s    | **el rojo útil**: 50 caídos por 1 SQL crudo |
| 2   | coach-load ×3 (post-fix)                                  | 59/61       | 272 s    | quedan solo los 2 preexistentes             |
| 3   | transaction-service + transactions-api + pending-tray     | **108/108** | —        |                                             |
| 4   | movement-service + mov-egresos + summary-by-kind          | **28/28**   | —        |                                             |
| 5   | summary-sanity + validation-regression + validation-state | **27/27**   | —        |                                             |
| 6   | **`test/finance` ENTERO (20 archivos)**                   | **341/343** | 519 s    | **la que vale** — cero throws del sentinel  |

### Sitios migrados, archivo por archivo

`WHERE` = `tenantWhere(schema.X, TEMPLO_CTX)` · `VALUES` = `tenantValues(TEMPLO_CTX, {…})` · `CRUDO` = `tenant_id` en el predicado de un `sql`/`conn.query`.

**Task 1 — coach-load, transacciones y bandeja:**

| Archivo                           | WHERE | VALUES | CRUDO |  Total | Tablas strict tocadas                                                       |
| --------------------------------- | ----: | -----: | ----: | -----: | --------------------------------------------------------------------------- |
| `coach-load.test.ts`              |    16 |      8 |     3 | **27** | `financial_transactions`, `transaction_links`, `balances`, `cash_registers` |
| `transaction-service.test.ts`     |     7 |      4 |     3 | **14** | `balances`, `cash_registers`, `transaction_links`, `financial_transactions` |
| `transactions-api.test.ts`        |     0 |      6 |     3 |  **9** | `financial_transactions`, `transaction_links`, `balances`                   |
| `coach-load-alta.test.ts`         |     3 |      0 |     3 |  **6** | `financial_transactions`, `balances`, `transaction_links`                   |
| `coach-load-pricing-gate.test.ts` |     2 |      1 |     3 |  **6** | `financial_transactions`, `cash_registers`, `transaction_links`, `balances` |
| `pending-tray.test.ts`            |     1 |      2 |     2 |  **5** | `financial_transactions`, `cash_registers`, `transaction_links`             |
| **Subtotal**                      |    29 |     21 |    17 | **67** |                                                                             |

**Task 2 — movimientos, resumen y validación:**

| Archivo                         | WHERE | VALUES | CRUDO |   Total | Tablas strict tocadas                                                                       |
| ------------------------------- | ----: | -----: | ----: | ------: | ------------------------------------------------------------------------------------------- |
| `movement-service.test.ts`      |    20 |      2 |     0 |  **22** | `financial_transactions`, `transaction_links`, `cash_registers`, `cost_centers`, `balances` |
| `summary-by-kind.test.ts`       |     1 |      1 |     6 |   **8** | `balances`, `financial_transactions`, `transaction_links`                                   |
| `mov-egresos-history.test.ts`   |     2 |      3 |     2 |   **7** | `financial_transactions`, `cash_registers`, `transaction_links`                             |
| `validation-state.test.ts`      |     3 |      1 |     3 |   **7** | `financial_transactions`, `balances`, `transaction_links`                                   |
| `validation-regression.test.ts` |     1 |      1 |     3 |   **5** | `balances`, `transaction_links`, `financial_transactions`                                   |
| `summary-sanity.test.ts`        |     0 |      1 |     3 |   **4** | `financial_transactions`, `transaction_links`, `balances`                                   |
| **Subtotal**                    |    27 |      9 |    17 |  **53** |                                                                                             |
| **TOTAL DEL PLAN**              |    56 |     30 |    34 | **120** | las 5 de las 6 (`debt_management` no aparece)                                               |

**`debt_management` sigue sin aparecer**, igual que en el 172-13. Es la sexta tabla
strict y ninguno de los 18 archivos migrados entre los dos planes la toca directo: la
ejercita `balance-service` por adentro. Si el 172-15/16 tampoco la ve, **conviene que
el 172-21 lo anote**: una tabla strict sin una sola query de test directa es una tabla
cuyo aislamiento nadie está probando desde afuera.

### 📌 Entradas de allowlist que paga este plan: **0**

Igual que el 172-13, y por el mismo motivo: `tenant-lint-allowlist.json` **solo cubre
`src/`**. Este plan no toca una línea de `src/`. **La cuenta acumulada para el 172-21
sigue en 51.**

## Decisions Made

### 1. Cero exenciones: los 34 sitios crudos se acotan, no se eximen

La regla del 172-13 decidió cada caso sin discutir: _si el statement borra a propósito
de todos los gimnasios, la exención es la salida honesta; si se puede acotar sin
cambiar lo que el test prueba, se acota._ Ninguno de estos 12 archivos siembra en el
gimnasio 2, así que los 34 DELETE globales eran **comodidad, no diseño**. Acotarlos es
además **más seguro que antes**: el día que un fixture siembre en el gimnasio 2, estos
`beforeEach` ya no se lo llevan puesto.

Se resistió la tentación obvia: cuando 50 tests se pusieron rojos por un DELETE, la
salida rápida era una exención de una línea. Habría funcionado, y habría dejado un
`DELETE FROM transaction_links` global marcado como "seguro a propósito" cuando no lo
es.

### 2. Los `conn.query` sobre tablas NO strict se dejan sin tocar

El mismo `beforeEach` borra `audit_log`, `bookings`, `program_enrollments` y
`subscriptions`. Ninguna es strict hoy, así que anotarlas no cambia nada **ahora** y
cambia todo **después**: el que migre esos módulos encontraría el trabajo hecho y no
tendría que decidir si ese borrado global sigue siendo legítimo. Es literalmente el
argumento que el 172-13 usó para dejar `users` afuera, aplicado a cuatro tablas más.

### 3. La verificación se corre sobre la carpeta entera, no sobre los 12 archivos

El `<verify>` del plan dice `vitest run test/finance` y el criterio de aceptación dice
"pasa entero". Se cumplió literal en vez de correr solo los 12: con `isolate: false`
los archivos de un worker comparten base, así que **un archivo puede pasar solo y
fallar acompañado**. Correr los 12 aislados y declarar victoria habría dejado sin
probar justamente la interacción que este plan tenía que blindar.

### 4. Los 2 rojos se declararon ajenos con prueba, no con argumento

Ver "Deferred Issues". El punto metodológico: la tentación era leer el diff, no
encontrar relación con `users.status` y seguir. Se hicieron **tres corridas de ~4,5 min
cada una**, quitando una variable por vez (sonda → archivo → `src/`), hasta poder decir
"están en `origin/master`" con evidencia y no con opinión.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug del gate] El inventario del plan y la auditoría del 172-13 no veían el SQL crudo con backticks**

- **Found during:** Task 2 (primera corrida en caliente)
- **Issue:** La regex de inventario del `<action>` y el `awk` heredado del 172-13
  esperaban `FROM financial_transactions` sin comillas y `.from(schema.X)` de Drizzle.
  Los `conn.query("DELETE FROM \`transaction_links\`")`de los`beforeEach` no matchean
  ninguno de los dos, y **el sentinel sí los ve**. Las dos herramientas dijeron
  "AUDITORIA OK: 0 accesos sin filtro" sobre archivos con 3 violaciones cada uno.
- **Fix:** (a) los **15 sitios** acotados con `WHERE tenant_id = ?` en 4 archivos;
  (b) la auditoría reescrita en Python (v2), que matchea el nombre de tabla entre
  backticks, comillas o corchetes, y **se probó contra el caso conocido-malo antes de
  confiar en su verde**.
- **Files modified:** `coach-load.test.ts`, `transactions-api.test.ts`,
  `summary-by-kind.test.ts` (2 bloques), `summary-sanity.test.ts`
- **Committed in:** `f3fa12ad`

**2. [Rule 1 - Bug latente] `countMemberTx` usaba `sql` sin importarlo**

- **Found during:** Task 1
- **Issue:** `coach-load.test.ts:82` usa ``sql`COUNT(*)` `` pero el import era
  `import { eq, and } from "drizzle-orm"`. Es un `ReferenceError` esperando a que
  alguien llame a la función. Nunca saltó porque **la función está muerta** (declarada,
  jamás llamada) y porque `tsc` no mira `test/`.
- **Fix:** `sql` agregado al import; la query, migrada como las otras 23. **No se borró
  la función muerta**: es tech debt preexistente, no algo que este plan causó
  (scope boundary).
- **Files modified:** `test/finance/coach-load.test.ts`
- **Committed in:** `45eff3c8`

---

**Total deviations:** 2 auto-fixed (2 × Rule 1). La primera es la que importa: no
agrega alcance, **cierra el agujero por el que el plan se habría dado por cumplido en
falso**.

## Issues Encountered

**`pnpm exec tsc --noEmit` NO typechequea `test/` — el `<verify>` del plan es
decorativo para archivos de test.** `tsconfig.json` tiene `"include": ["src/**/*"]`. Un
typecheck que incluya `test/` levanta **cientos de errores preexistentes** (drizzle e
imports NodeNext resolviendo distinto fuera del pipeline de vitest), así que no se
puede usar como gate y **no se intentó arreglarlo** (fuera de alcance). Se corrió igual
—exit 0 después de cada task— porque prueba que no se rompió `src/`. **El único gate
real de un archivo de test en este repo es vitest**, que es la razón por la que la
corrida en caliente no es opcional. Vale para el 172-15 y el 172-16.

**El `prettier --write` se corrió ANTES de las corridas largas**, tomando la lección
que el 172-13 dejó anotada. Se ahorró la duda de si un verde vale después de un
reformateo.

**Lo que este plan NO prueba.** Los 341 tests corren con **un solo gimnasio**. Prueban
que **con el sentinel en modo throw no se rompió nada** —el objetivo del plan— pero
**no prueban aislamiento**. Que la transacción del gimnasio A no aparezca en el resumen
del B lo prueba la batería ISO-03 en el 172-22/23.

## Deferred Issues

**2 tests rojos en `coach-load-alta.test.ts` — preexistentes en `origin/master`.**
Detalle completo, tabla de las 3 corridas de discriminación y bandera para el 172-21
en **`deferred-items.md`** del directorio de la fase.

Resumen: las dos aserciones son sobre `users.status` (`'prueba'` y `'freemium'` en vez
de `'activo'`) después de un alta y de un void. **No son throws del sentinel.** Se
probó que son ajenas corriendo el archivo tres veces, quitando una variable cada vez:

| Corrida | `src/`     | archivo de test | sonda strict | Resultado          |
| ------- | ---------- | --------------- | ------------ | ------------------ |
| 1       | HEAD       | migrado (mío)   | **ON**       | mismos 2 rojos     |
| 2       | HEAD       | original        | OFF          | mismos 2 rojos     |
| 3       | `a6272df0` | original        | OFF          | **mismos 2 rojos** |

La tercera es la concluyente: `a6272df0` **es `origin/master`**, la base de la fase
según el 172-01. Con `src/` y el test sin tocar por nadie de esta fase, los dos rojos
siguen ahí. **No los rompió la fase 172 ni este plan**, y arreglarlos es trabajo del
dueño del flujo de `/alta`, no de la cadena de tenancy.

Queda una pregunta abierta y honesta que el `deferred-items.md` deja escrita: el repo
corre la suite en CI y no local. Si CI está verde sobre `a6272df0`, la diferencia es
ambiental y **hay que encontrarla antes de que el 172-21 use esa suite como gate**.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca
schemas de request, no instala paquetes, no modifica un mensaje de error y no toca una
línea de `src/`.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-14-01 | ✅ **30** `tenantValues(TEMPLO_CTX, …)` explícitos en los seeds de coach-load y transacciones; ningún INSERT sobre las 6 tablas queda dependiendo del default de columna               |
| T-172-14-02 | ✅ **56** `tenantWhere` en las lecturas de aserción: una fila del gimnasio 2 ya no puede satisfacer un `expect` del gimnasio 1. Incluye el `COUNT(*)` sin `where` de `summary-by-kind` |
| T-172-14-03 | ✅ ninguna tabla salió de la lista strict. Ante 50 rojos se arregló la query (los 15 sitios crudos), y se declararon **0 exenciones** nuevas                                           |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                           |

## Next Phase Readiness

**Listo para el 172-15.** Cinco cosas que los planes 15 y 16 tienen que dar por sentadas:

1. **El inventario por grep del PATTERNS subestima: buscá también SQL crudo con
   backticks.** `grep -n "conn.query(\|dbPool.getConnection" <archivos>` antes de
   empezar. Este plan encontró **15 sitios** que ninguna regex de Drizzle veía y que el
   sentinel sí. La auditoría v2 en Python está en el scratchpad y **hay que probarla
   contra un caso conocido-malo antes de confiar en su verde**.
2. **`tsc --noEmit` no cubre `test/`.** No sirve de gate para un archivo de test. El
   gate es vitest, y por eso la corrida en caliente no es negociable.
3. **Pre-check obligatorio de la sonda.** `git status --porcelain
el-templo-api/src/db/tenant-tables.ts` tiene que salir **vacío** antes de encenderla.
   Este plan la dejó apagada y verificada.
4. **Los 2 rojos de `coach-load-alta.test.ts` no son tuyos.** Están en `origin/master`.
   No los arregles de paso ni los uses como señal de que rompiste algo.
5. **La allowlist no se mueve con trabajo en `test/`.** La cuenta para el 172-21
   **sigue en 51**.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-14-SUMMARY.md`
- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/deferred-items.md`
- `FOUND` commits `45eff3c8` (T1) y `f3fa12ad` (T2) en `feat/172-adopcion-finance`
- `FOUND` los 12 archivos modificados en `git diff --stat 4a3244fe..HEAD` (+801 / −349)
- `VERIFIED` `pnpm exec tsc --noEmit` exit 0 después de cada task
- `VERIFIED` `analyzeSql` da `violation` sobre el DELETE crudo sin filtro y `ok` sobre las dos formas con `tenant_id` (placeholder y literal)
- `VERIFIED` **341/343** en `test/finance` ENTERO (20 archivos) **con `finance` en `TENANT_STRICT_MODULES`**, cero throws del sentinel
- `VERIFIED` los 2 rojos restantes reproducen con `src/` y test de `a6272df0` = `origin/master`
- `VERIFIED` `git status --porcelain el-templo-api/src/db/tenant-tables.ts` vacío y el archivo de vuelta en `TENANT_STRICT_MODULES … = {}`
- `VERIFIED` `git diff 4a3244fe -- test/finance | grep -c "^[-+].*expect("` = 0
- `VERIFIED` auditoría mecánica v2 sobre los 12 archivos: **0 accesos sin filtro/estampa**
- `VERIFIED` `tenant-lint-allowlist.json` sin modificar y `git status --porcelain` en `et-172` vacío

**ADO-01 NO se marca completo**, misma convención que 172-01…172-13: el requisito exige
`finance` migrado **con aislamiento verde**, y eso lo prueban el 172-22/23. Este plan
saca del camino el grupo de tests más pesado del módulo, no cierra el requisito.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
