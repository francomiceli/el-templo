---
phase: 172-adopci-n-1-piloto-finance
plan: 09
subsystem: finance
tags:
  [
    tenancy,
    finance,
    balances,
    debt-management,
    cajas,
    movimientos,
    egresos,
    tenantWhere,
    tenantValues,
    assertTenant,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / tenantValues / assertTenant / TenantContext)"
  - phase: 170-sentinel-lint
    provides: "src/db/scripts/lint-tenant.ts y tenant-lint-allowlist.json (ratchet)"
  - phase: 171-backstop
    provides: "test/fixtures/second-tenant.ts (TENANT_TEMPLO)"
  - plan: 172-01
    provides: "worktree et-172 sobre a6272df0, baseline verde, allowlist en 501 entradas"
  - plan: 172-06
    provides: "el ABM de cash-register-service.ts migrado y el hallazgo del tenantWhere en el ON de un LEFT JOIN"
  - plan: 172-08
    provides: "las 21 firmas de TransactionService y los 4 metodos publicos de MovementService con ctx primero"
provides:
  - "BalanceService entero: los 5 metodos con ctx primero y las 6 tablas de sus statements filtradas"
  - "applyDelta(ctx, tx, transaction, links, sign): el write-through de saldos y deuda no puede tocar otro gimnasio ni dentro de la transaccion del cobro"
  - "resolveCashRegister y getBalance con ctx: el resolver del cobro en efectivo y el saldo de caja aislados"
  - "MovementService entero: loadCaja, registerExpense y voidMovement filtran cajas, centros de costo y links"
  - "9 entradas de allowlist muertas: balance-service.ts (4), cash-register-service.ts (2), movement-service.ts (3)"
  - "cash-register-service.ts, balance-service.ts y movement-service.ts quedan SIN una sola entrada de allowlist"
affects: [172-10, 172-12, 172-13, 172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un fragmento `sql` que nombra una tabla FUERA de la cadena de la query es un acceso propio y sin filtro: va INLINE, aunque sea condicional (ternario que devuelve undefined, `and()` lo saltea)"
    - "En un array literal de `.values([...])` el elemento pierde el tipo contextual: `tenantValues` infiere `targetKind: string` y el enum de Drizzle no compila. Un `as const` por campo de enum lo resuelve (no hace falta en el insert de un objeto suelto)"
    - 'El tsconfig temporal que incluye `test/` necesita `rootDir: "."` y vivir DENTRO del proyecto: con el rootDir heredado (`src`) el compilador tira TS6059 y el conteo de TS2554 da 0 falso'

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/balance-service.ts
    - el-templo-api/src/modules/finance/cash-register-service.ts
    - el-templo-api/src/modules/finance/movement-service.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts
    - el-templo-api/test/finance/cash-register-service.test.ts
    - el-templo-api/test/finance/movement-service.test.ts
    - el-templo-api/test/finance/transaction-service.test.ts
    - el-templo-api/test/reports/debt-management.test.ts
    - el-templo-api/test/subscriptions/impute-advance-on-assign.test.ts

key-decisions:
  - "El UPDATE de balances lleva su propio tenantWhere aunque el SELECT de arriba ya corto: el WHERE de una escritura no se apoya en una lectura (patron 172-06)"
  - "En GET /caja-efectivo el ctx se hoistea al tope del try y REEMPLAZA al que estaba despues del early return: el resolver lo necesita antes"
  - "TransactionService.resolveCashRegister se deja viva aunque no tenga callers: borrar codigo muerto no es alcance de un plan de tenancy y su delegacion queda migrada"
  - "getOutstandingTotalsByCurrency y hasOutstandingForUser tampoco tienen callers y se migran igual: el criterio de terminado del plan es allowlist vacia, no callers"
  - "subscriptions/service.ts NO se toco: el plan lo listaba como call site de applyDelta y no lo es"

patterns-established:
  - "El fragmento `sql` condicional se resuelve con un ternario INLINE dentro de `and(...)`, no con un `const` de arriba: el lint razona por statement"
  - "La equivalencia de un refactor mecanico de tests se prueba borrando el argumento agregado, colapsando TODO el espacio y las comas colgantes, y comparando contra HEAD"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-07-30
---

# Phase 172 Plan 09: Saldos, cajas y movimientos aislados por gimnasio Summary

**Los tres bloques que esperaban a que `transaction-service` tuviera `ctx` quedan cerrados enteros —firmas Y queries—: `BalanceService` (los 5 métodos, incluido el `applyDelta` que corre DENTRO de la transacción del cobro y que ahora estampa el gimnasio en el lazy seed y lo exige en cada UPDATE de `balances` y de `debt_management`), el cluster B de `cash-register-service.ts` (`resolveCashRegister`, el resolver del cobro en efectivo, y `getBalance`) y `MovementService` entero (la caja origen/destino y el centro de costo llegan del body y ahora no pueden ser de otro gimnasio). **Los tres archivos salen SIN una sola entrada de allowlist: 9 entradas muertas, probadas con el lint contra `/tmp/allowlist-172-09.json` (468 entradas).** `movement-service.test.ts` 10/10 contra MySQL real, sin tocar una expectativa.**

## Performance

- **Duration:** ~20 min (23:41Z → 00:01Z), de los cuales 2,3 min son la corrida contra MySQL real
- **Completed:** 2026-07-30
- **Tasks:** 3/3 (las tres `auto`)
- **Files modified:** 11 — +284 / −90

## Task Commits

| Task | Nombre                                                 | Commit     | Archivos                                                                                                       |
| ---- | ------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | `balance-service.ts` completo (5 métodos) + call sites | `1a88674e` | balance-service.ts, transaction-service.ts, routes.ts, coach-load-routes.ts + 3 de test                        |
| 2    | Cluster B de `cash-register-service`                   | `8c4f56f9` | cash-register-service.ts, balance-service.ts, transaction-service.ts, movement-service.ts, coach-load + 2 test |
| 3    | `movement-service.ts` completo + prueba dirigida       | `21cfbcda` | movement-service.ts                                                                                            |

Los tres commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `e0039b54` del plan 08). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Accomplishments

- **`applyDelta(ctx, tx, transaction, links, sign)`** — el `ctx` va incluso **antes del `tx`**, y el docblock nuevo de la clase explica por qué: `tenantWhere` / `tenantValues` son ortogonales al handle de transacción, así que correr dentro de la transacción del cobro **no** relaja el filtro. Al contrario: un saldo escrito en el gimnasio equivocado queda commiteado junto al cobro y la corrupción es contable y silenciosa (T-172-09-01).
- **6 `tenantWhere` sobre `balances`** (el SELECT de la clave compuesta, el UPDATE del delta y las 4 lecturas) y **2 sobre `debt_management`**: la sincronización automática `cobrada`/`activa` ya no puede mover la gestión de deuda del vecino.
- **El lazy seed pasa por `tenantValues(ctx, {...})`**: la fila nace en el gimnasio del cobro y no en el `DEFAULT` de la columna.
- **`getRowsForTransaction` nombra el gimnasio en sus 3 tablas strict.** No es cosmético: el join de `balances` con `transaction_links` es por `(targetKind, targetId)`, un par que **no es único entre gimnasios**.
- **`resolveCashRegister` con `ctx`** y filtro en sus 2 queries. La rama `transfer`/`card` es la más peligrosa: elige la caja banco de la moneda **más antigua por id**, que después de la fase 168 puede perfectamente ser de otro tenant.
- **`getBalance` con `ctx`** y filtro sobre `cash_registers` + las 3 SUM de `financial_transactions`. Cierra el **riesgo residual que el 172-06 dejó escrito**: el saldo de una caja propia se calculaba sin nombrar el gimnasio, así que una transacción ajena apuntando a esa caja sumaba.
- **`MovementService` entero**: `loadCaja` (que **es** la validación de que la caja existe, con ids que llegan del body — T-172-09-02), `registerExpense` (centro de costo, T-172-09-03), los 2 SELECT de `transaction_links` de `voidMovement` y los 3 INSERT de links por `tenantValues`.
- **9 entradas de allowlist muertas y probadas con el lint**, y con ellas **tres archivos enteros de `finance` fuera de la allowlist**.
- **`test/finance/movement-service.test.ts` 10/10 verde** (127 s) contra MySQL real, con equivalencia byte a byte probada.

## Verificación

| Criterio                                                                      | Resultado                                            |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                                      | ✅ **exit 0** (después de cada task)                 |
| `pnpm exec vitest run test/finance/movement-service.test.ts`                  | ✅ **10/10**, 127 s                                  |
| `lint-tenant --allowlist=/tmp/allowlist-172-09.json` (468 entradas)           | ✅ **exit 0**, `DISCREPANCIAS: 0`                    |
| `unlistedViolations` con la allowlist filtrada                                | ✅ **0** — no se introdujo un acceso violador nuevo  |
| `staleNoLongerViolating` / `staleMissingFile` / `strictWithAllowlist`         | ✅ **0 / 0 / 0**                                     |
| `tsc -p` con `include` de `test/` — `TS2554` en TODO `test/`                  | ✅ **0** (ver desviación 4 sobre el `rootDir`)       |
| `grep -c "tenantWhere(schema.balances" balance-service.ts`                    | **6** (pedía ≥ 6)                                    |
| `grep -c "tenantWhere(schema.debtManagement" balance-service.ts`              | **2** (pedía ≥ 2)                                    |
| `grep -c "tenantValues(ctx" balance-service.ts`                               | **1** (pedía ≥ 1)                                    |
| `grep -c "this.db" balance-service.ts` vs `HEAD` del 172-08                   | **6 = 6** — el invariante del `TxHandle` no se movió |
| `grep -c "ctx: TenantContext" balance-service.ts`                             | **6** (5 métodos + el `applyDelta`)                  |
| `grep -c "tenantWhere(schema.cashRegisters" cash-register-service.ts`         | **13** (el plan pedía ≥ 14 — ver desviación 2)       |
| `grep -c "tenantWhere(schema.financialTransactions" cash-register-service.ts` | **4** (pedía ≥ 2)                                    |
| `grep -c "tenantWhere(schema.cashRegisters" movement-service.ts`              | **1** (pedía ≥ 1)                                    |
| `grep -c "tenantWhere(schema.transactionLinks" movement-service.ts`           | **2** (el plan pedía ≥ 3 — ver desviación 3)         |
| `grep -c "tenantValues(ctx" movement-service.ts`                              | **3** (pedía ≥ 1)                                    |
| `grep -cE "applyDelta\(\s*ctx" transaction-service.ts` (key_link del plan)    | **2** — los dos call sites del write-through         |
| `grep -nE "tenantId!\|tenantId\s*\?\?"` en los 6 archivos de `src`            | sin líneas                                           |
| Equivalencia byte a byte de los 5 archivos de test                            | ✅ **IDÉNTICO** (ver abajo)                          |
| `prettier --check` sobre los 11 archivos                                      | ✅                                                   |
| Inventario de exenciones `tenant-safe`                                        | **10** — el mismo de 172-01, ninguna nueva           |
| `git status --porcelain` en `et-172`                                          | vacío                                                |
| `tenant-lint-allowlist.json` modificado                                       | no (dueño único = 172-21)                            |

### La prueba de que los tests no cambiaron de expectativa

`git diff -- test/ | grep -c "^[-+].*expect("` da **20**, y las 20 son reformateo de prettier: el argumento nuevo pasó de 80 columnas líneas del tipo `expect((await cashRegisterService.getBalance(origenId)).firmeBalance).toBe(750)`.

La prueba fuerte (misma técnica que el 172-08, endurecida): para cada archivo tocado, borrar `TEMPLO_CTX,`, **colapsar TODO el espacio en blanco** y borrar las **comas colgantes** antes de `)`/`]`/`}`, y comparar contra `HEAD`. Los dos archivos con reformateo masivo (`cash-register-service.test.ts` y `movement-service.test.ts`) dan **IDÉNTICO**. La versión "colapsar a un espacio" del 172-08 **no** alcanzaba: no normaliza la coma colgante que prettier agrega al partir una llamada en varias líneas, y daba un falso DIFIERE.

### 📌 Entradas de allowlist que paga este plan: **9**

```
el-templo-api/src/modules/finance/balance-service.ts        | balances                ← strict
el-templo-api/src/modules/finance/balance-service.ts        | debt_management         ← strict
el-templo-api/src/modules/finance/balance-service.ts        | subscriptions           ← colateral (D-06)
el-templo-api/src/modules/finance/balance-service.ts        | users                   ← colateral (D-06)
el-templo-api/src/modules/finance/cash-register-service.ts  | cash_registers          ← strict
el-templo-api/src/modules/finance/cash-register-service.ts  | financial_transactions  ← strict
el-templo-api/src/modules/finance/movement-service.ts       | cash_registers          ← strict
el-templo-api/src/modules/finance/movement-service.ts       | cost_centers            ← strict
el-templo-api/src/modules/finance/movement-service.ts       | transaction_links       ← strict
```

**7 strict + 2 colaterales.** Con las 9, **tres archivos de `finance` quedan sin una sola entrada viva**: `balance-service.ts`, `cash-register-service.ts` (el 172-06 ya había matado sus otras 2) y `movement-service.ts`. De los 6 archivos del módulo, sólo quedan con entradas `transaction-service.ts` (11), `routes.ts` (3) y `coach-load-routes.ts` (4) — los tres de los planes 172-10/12/13.

**Cuenta acumulada para el plan 172-21: 9 (02) + 4 (03) + 6 (04) + 2 (06) + 0 (07) + 3 (08) + 9 (09) = 33 entradas a borrar de `tenant-lint-allowlist.json`.** La evidencia ejecutable vigente pasa a ser **`/tmp/allowlist-172-09.json` (468 entradas)**, y su generador **`/tmp/gen-allowlist-172-09.py`** acepta un argumento (`1`/`2`/`3`) para reconstruir el estado parcial de cada task, con las 9 entradas comentadas por task.

## Decisions Made

### 1. En `GET /caja-efectivo` el `ctx` se hoistea y cambia de posición

El handler resolvía el `ctx` **después** del early return `if (override == null) return { caja: null }`, porque hasta ahora sólo lo usaba el SELECT final. `resolveCashRegister` lo necesita antes, así que el `assertTenant` pasó a ser la primera sentencia del `try` (analog B) y el de abajo se borró — un solo `assertTenant` por request, una sola etiqueta.

**Consecuencia de comportamiento, deliberada:** un request cuyo gimnasio no resuelve antes devolvía `{ caja: null }` (200) si además la caja no era resolvible; ahora devuelve **403 `TENANT_UNRESOLVED`**. Es lo correcto y lo consistente con el resto de la fase: un handler que no puede decidir de qué gimnasio es no debería contestar 200 con datos vacíos. El hoist queda **dentro** del `try` para que el 403 salga por `handleServiceError` con el formato del módulo.

### 2. `TransactionService.resolveCashRegister` se deja viva

El 172-08 (decisión 3) la registró como fachada sin un solo caller desde CR-CAJA y le pasó al 172-09 la decisión de borrarla. **No se borra.** Dos motivos: borrar código muerto es una decisión de alcance que no le toca a un plan de tenancy (mismo criterio que el 172-08 usó para no borrarla él), y su delegación ya quedó migrada — pasa el `ctx` que recibe. Queda anotado acá para que el plan que limpie `transaction-service.ts` (172-10/172-12, que van a leer el archivo entero) lo resuelva con el contexto completo.

### 3. `getOutstandingTotalsByCurrency` y `hasOutstandingForUser` tampoco tienen callers, y se migran igual

Un grep sobre todo `src/` y `test/` no devuelve **ninguna** invocación de esos dos métodos (el 105 los escribió para la reescritura de `members/service.ts`, que terminó resolviendo por otro camino). Se migran igual porque el criterio de terminado del plan es **allowlist vacía**, no callers: mientras el statement exista en el archivo, el lint lo cuenta y la entrada no muere. `getOutstandingTotalsByCurrency` además resultó ser el método que escondía los 2 accesos más difíciles del plan (desviación 1).

### 4. `subscriptions/service.ts` no se tocó

El `files_modified` del plan lo listaba y el `<action>` del Task 1 decía que había que propagar el `ctx` "en los call sites de `transaction-service.ts` y `subscriptions/service.ts`". **`subscriptions/service.ts` no llama a `BalanceService`**: un grep de `applyDelta|balanceService|BalanceService` sobre el archivo devuelve sólo comentarios que lo mencionan. El write-through le llega indirecto, por `transactionService.create` / `voidInTx`, que ya tenían el `ctx` del 172-07.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueante] `getOutstandingTotalsByCurrency` armaba sus condiciones FUERA del statement — dos veces**

- **Found during:** Task 2 (lo marcó el lint, no `tsc`)
- **Issue:** el método construía un `const conditions = [sql\`${schema.balances.amount} > 0\`]` y le empujaba condicionalmente un `sql\`${schema.users.branchId} IN ${branchIds}\``. Agregarle `tenantWhere`a la query dejaba el SQL **correcto** (el filtro siempre presente) pero el lint seguía contando **2 accesos violadores**: mide por STATEMENT, y un`sql`que nombra la tabla fuera de la cadena de la query es un statement propio, sin filtro. Sin esto, las entradas`balance-service.ts | balances`y`| users` **no morían** y el criterio de terminado del Task 2 (lint exit 0) era inalcanzable.
- **Fix:** los dos fragmentos pasan a estar **inline** en el `.where(and(...))`, y el opcional se resuelve con un **ternario que devuelve `undefined`** (`and()` lo saltea) en vez de un array condicional.
- **Por qué importa registrarlo:** es la **cuarta** vez en la fase que la misma trampa muerde (planes 02, 04, 06 y ahora 09), y acá mordió **dos veces seguidas**: el primer arreglo movió las condiciones a un `const porSucursal = ... ? sql\`...\` : undefined`fuera de la query, y el lint **siguió** reportando`users`. La regla, sin excepciones y sin variantes: **el gimnasio y la tabla se nombran en el mismo statement, y ese statement es la cadena de la query.** Un `const` de arriba nunca cuenta, ni siquiera si es un ternario de una línea.
- **Files modified:** `src/modules/finance/balance-service.ts`
- **Committed in:** `8c4f56f9`

**2. [Rule 1 - Conteo del plan] `cash-register-service.ts` tenía 2 entradas de allowlist, no 4, y su grep da 13, no 14**

- **Found during:** Task 2
- **Issue:** el `<action>` mandaba generar la allowlist filtrada "sin las **4** entradas de `src/modules/finance/cash-register-service.ts`" y el criterio pedía `grep -c "tenantWhere(schema.cashRegisters"` **≥ 14**. Las entradas vivas eran **2** (`cash_registers` y `financial_transactions`): el **172-06 ya había matado** `cost_centers` y `branches`, y su propio SUMMARY lo dice. El grep da **13** porque el archivo tiene 13 statements sobre `cash_registers`, no 14 — el plan sumó de más al estimar sobre las "12 referencias" del inventario AST-lite, que cuenta apariciones de `schema.cashRegisters`, no queries.
- **Fix:** ninguno en el código. La allowlist filtrada se generó quitando las **2** entradas reales; el criterio que sí manda —**el lint sale exit 0 con las entradas de ese archivo borradas**— se cumple.
- **Por qué el plan no lo vio:** los dos números salen del PATTERNS, que se derivó sobre `origin/master` (`29e61c8b`) — o sea **antes** del 172-06. Los planes que citen conteos del PATTERNS tienen que restarles lo que ya pagaron los planes anteriores.
- **Files modified:** ninguno

**3. [Rule 1 - Conteo del plan] `voidExpense` no tiene ninguna query, así que los `tenantWhere` sobre `transaction_links` son 2 y no 3**

- **Found during:** Task 3
- **Issue:** el `<action>` pedía `tenantWhere(schema.transactionLinks, ctx)` en `registerMovement`, `voidMovement` **y `voidExpense`**, con criterio `≥ 3`. `voidExpense` **no toca la base**: delega entero en `txnService.voidPair([id])`. Y en `registerMovement` los accesos a `transaction_links` son **INSERT**, que se cierran con `tenantValues`, no con `tenantWhere`. Los `tenantWhere` reales son los 2 SELECT de `voidMovement`; los `tenantValues` son **3**.
- **Fix:** ninguno en el código. `movement-service.ts | transaction_links` murió igual — verificado con el lint, que es lo que decide.
- **Files modified:** ninguno

**4. [Rule 1 - Bug de la técnica heredada] El tsconfig temporal que incluye `test/` da un TS2554 = 0 FALSO si no se le fija el `rootDir`**

- **Found during:** Task 1
- **Issue:** el 172-08 dejó como patrón "crear un tsconfig temporal que extienda el del repo con `include: [\"src/**/*\", \"test/**/*\"]`" y usar `grep -c "error TS2554"` como prueba positiva de que no quedan call sites de aridad vieja. La primera corrida de este plan lo hizo así (archivo en `/tmp`, `extends` por ruta absoluta) y dio **TS2554: 0**. Era mentira: con el `rootDir: "src"` heredado, el compilador tira `TS6059` por cada archivo de `test/` y **deja de chequearlos**. Al ponerlo dentro del proyecto con `"compilerOptions": { "rootDir": "." }`, el mismo comando reportó **37 errores TS2554 reales**, todos de call sites de `getBalance`/`resolveCashRegister` en dos archivos de test que el plan no listaba.
- **Fix:** `tsconfig.test-check.json` **dentro de `el-templo-api/`**, con `extends: "./tsconfig.json"` y `rootDir: "."`. Con eso el árbol de tests arroja los **182 errores preexistentes** que el 172-08 documentó (el número coincide exacto, otra señal de que la corrida rota estaba midiendo otra cosa) y **0 `TS2554`** al terminar. El archivo se borró y nunca se stageó.
- **Por qué importa:** un gate que devuelve verde sin haber mirado nada es peor que no tener gate. Si este plan se hubiera quedado con el 0 falso, habría commiteado 37 call sites rotos que sólo aparecen cuando el test corre.
- **Files modified:** ninguno versionado

**5. [Rule 3 - Bloqueante] Dos archivos de test con call sites que el plan no listaba, y un mock POSICIONAL de `applyDelta`**

- **Found during:** Tasks 1 y 2 (por el `tsc` con `rootDir` arreglado)
- **Issue:** (a) `test/finance/cash-register-service.test.ts` (**25** call sites de `resolveCashRegister`/`getBalance`) y `test/finance/movement-service.test.ts` (**12** de `getBalance`) no estaban en el `<files>` de ningún task. (b) Peor: `test/subscriptions/impute-advance-on-assign.test.ts:340` **monkeypatchea `applyDelta` con una lambda posicional** `async (tx, row, links, sign) => { if (row.kind === "plan_charge") ... }`. Con el `ctx` primero, `row` pasaba a ser el `tx` y el `if` **dejaba de disparar en silencio**: el test de atomicidad seguía en verde probando nada.
- **Fix:** los 37 call sites reciben `TEMPLO_CTX` (los dos archivos ya lo tenían declarado desde el 172-08) y el mock pasa a `(ctx, tx, row, links, sign)`, con un comentario que dice por qué es posicional y qué se rompe si alguien no corre el argumento.
- **Files modified:** los 3 archivos de test
- **Committed in:** `1a88674e` (el mock) y `8c4f56f9` (los 37 call sites)

**6. [Rule 3 - Bloqueante] `tenantValues` SÍ ensancha el enum dentro de un array literal**

- **Found during:** Task 3
- **Issue:** el hallazgo 169-07, citado por el PATTERNS, dice que "envolver el objeto en `tenantValues` NO ensancha los tipos literales … el enum de Drizzle compila sin ningún `as const`". Es cierto para `.values(tenantValues(ctx, {...}))` con un objeto suelto —el insert del link del ajuste compiló sin tocar nada— pero **falso dentro de un array literal**: `.values([tenantValues(ctx, {...}), tenantValues(ctx, {...})])` pierde el tipo contextual y `targetKind: "transaction"` se infiere como `string`, con un `TS2769` que no compila.
- **Fix:** `as const` **sólo** en los 2 `targetKind` del array, con el comentario que marca el matiz.
- **Files modified:** `src/modules/finance/movement-service.ts`
- **Committed in:** `21cfbcda`

**7. [Rule 2 - Seguridad] El UPDATE de `balances` lleva su propio `tenantWhere`**

- **Found during:** Task 1
- **Issue:** el `<action>` pedía `tenantWhere` "en los SELECT/UPDATE de `balances`" pero el UPDATE del delta filtra por `eq(balances.id, row.id)`, un id que salió del SELECT de arriba — en el flujo normal el filtro nunca cambia el resultado.
- **Fix:** se puso igual, y por el mismo motivo que el 172-06 (su desviación 3): **el WHERE de una escritura no se apoya en una lectura anterior**. El día que alguien reordene el método o cachee el SELECT, el UPDATE sigue sin poder tocar la fila del vecino. Ídem los 2 UPDATE de `debt_management`.
- **Files modified:** `src/modules/finance/balance-service.ts`
- **Committed in:** `1a88674e`

**8. [Rule 1 - Bug del plan] `subscriptions/service.ts` estaba en `files_modified` y no tenía nada que modificar**

- **Found during:** Task 1 — ver decisión 4.
- **Files modified:** ninguno

---

**Total deviations:** 8 auto-fixed (4 × Rule 1, 1 × Rule 2, 3 × Rule 3). Las #1, #5 y #6 eran bloqueantes de verdad (sin ellas el plan no cumple su propio criterio de terminado o deja tests rotos); la #4 es la más importante para los planes siguientes porque **invalida una técnica de verificación heredada**; las #2, #3 y #8 achican el alcance corrigiendo conteos del plan.

## Issues Encountered

**El lint sigue ROJO contra la allowlist REAL en esta rama, ahora por 33 entradas.** Quien corra `pnpm lint:tenant` sin `--allowlist` en `feat/172-adopcion-finance` ve `DISCREPANCIAS: 33`, todas `staleNoLongerViolating` — **33 entradas pidiendo que las borren**, no una regresión. El dueño único del archivo es el plan 172-21. **Si la rama se mergeara a `staging` antes de ese plan, CI queda rojo por esto.**

**Un cambio de comportamiento observable:** `GET /coach-load/caja-efectivo` con un gimnasio no resoluble pasa de 200 `{ caja: null }` a 403 `TENANT_UNRESOLVED` (decisión 1). Es lo buscado, pero es el único caso del plan donde una respuesta HTTP cambia de código.

**El mock posicional de `applyDelta` fue el hallazgo más caro del plan** (desviación 5b) y no lo habría encontrado ningún grep de nombres de método: el test rompía **en silencio**, siguiendo verde. Vale como advertencia para los planes 172-10 y 172-12, que cambian firmas mucho más usadas: **buscar `\.<metodo> = async` además de las llamadas.**

**Riesgo residual que este plan NO cierra:** las ~90 queries de `transaction-service.ts` **siguen sin `tenantWhere`** (planes 172-10 y 172-12), y `routes.ts` conserva sus 3 entradas (`resolveCajaCountry`/`enforceRowScope`, riesgo 2 del PATTERNS) más las 4 de `coach-load-routes.ts`. Tener `ctx` no es estar migrado.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas, no instala paquetes. Las rutas tocadas conservan sus guards y su `handleServiceError`.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-09-01 | ✅ `tenantWhere` en el SELECT y en los 3 UPDATE (1 de `balances` + 2 de `debt_management`) + `tenantValues` en el lazy seed, todo sobre el `tx` recibido (`this.db` sigue en 6 apariciones, las mismas que antes). El ctx llega del cobro, no del payload |
| T-172-09-02 | ✅ `tenantWhere(schema.cashRegisters, ctx)` en `loadCaja` y en `resolveCashRegister`: la caja ajena no matchea y el service tira su `BadRequestError`/`NotFoundError` actual, sin filtrar existencia (D-09)                                               |
| T-172-09-03 | ✅ `tenantWhere(schema.costCenters, ctx)` antes de imputar el egreso                                                                                                                                                                                      |
| T-172-09-04 | ✅ `getBalance` filtra sus 4 statements (1 de cajas + 3 SUM) y `getRowsForTransaction` sus 3 tablas strict                                                                                                                                                |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                                                                              |

## Next Phase Readiness

**Listo para el 172-10.** Seis cosas que los planes siguientes tienen que dar por sentadas:

1. **`balance-service.ts`, `cash-register-service.ts` y `movement-service.ts` están CERRADOS** — firmas y queries, cero entradas de allowlist. Un plan que agregue un método a cualquiera de los tres tiene que seguir la convención o rompe el ratchet.
2. **El tsconfig temporal para inventariar call sites de test necesita `rootDir: "."` y vivir dentro del proyecto** (desviación 4). La receta del 172-08, tal como está escrita, devuelve un 0 falso.
3. **Los mocks posicionales de método rompen en silencio.** Antes de cambiar una firma, `grep -rn "\.<metodo> = async" test/` además de las llamadas.
4. **Un fragmento `sql` fuera de la cadena de la query es un acceso sin filtro**, aunque sea un ternario de una línea en un `const`. Cuarta y quinta vez que muerde en la fase.
5. **`tenantValues` dentro de un array literal SÍ ensancha los enums** — `as const` por campo (desviación 6). El hallazgo 169-07 vale sólo para el objeto suelto.
6. **La allowlist acumula 33 entradas muertas** (9+4+6+2+0+3+9). El 172-21 borra las 33. Evidencia ejecutable: `/tmp/allowlist-172-09.json` (468 entradas) + `/tmp/gen-allowlist-172-09.py`.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-09-SUMMARY.md`
- `FOUND` commits `1a88674e` (T1), `8c4f56f9` (T2) y `21cfbcda` (T3) en `feat/172-adopcion-finance`
- `FOUND` los 11 archivos modificados en `git diff --stat e0039b54..HEAD` (+284 / −90)
- `FOUND` `/tmp/allowlist-172-09.json` (468 entradas) y `/tmp/gen-allowlist-172-09.py`
- `VERIFIED` `pnpm exec tsc --noEmit` exit 0
- `VERIFIED` `movement-service.test.ts` 10/10 contra MySQL real
- `VERIFIED` `lint-tenant --allowlist=/tmp/allowlist-172-09.json` exit 0, `DISCREPANCIAS: 0`, `unlistedViolations: 0`
- `VERIFIED` equivalencia byte a byte de los archivos de test tras quitarles el `TEMPLO_CTX`
- `VERIFIED` `git status --porcelain` en `et-172` vacío y `tenant-lint-allowlist.json` sin modificar
- `VERIFIED` `tsconfig.test-check.json` temporal borrado y nunca stageado

**ADO-01 NO se marca completo**, misma convención que 172-01/02/03/04/06/07/08: el requisito exige `finance` migrado entero (services + sentinel + aislamiento verde). Este plan cierra **tres de los seis archivos del módulo**; faltan `transaction-service.ts`, `routes.ts` y `coach-load-routes.ts`.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
