---
phase: 172-adopci-n-1-piloto-finance
plan: 06
subsystem: finance
tags:
  [
    tenancy,
    finance,
    cajas,
    cuentas-bancarias,
    centros-de-costo,
    lint-tenant,
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
  - plan: 172-01
    provides: "worktree et-172 sobre a6272df0, baseline verde, allowlist en 501 entradas"
  - plan: 172-02
    provides: "el hallazgo de que el lint razona por STATEMENT y que las colaterales se cuentan corriendo el lint"
  - plan: 172-03
    provides: "el tenantWhere de una tabla LEFT JOINeada va en el ON, jamas en el WHERE"
provides:
  - "El ABM de centros de costo, cuentas bancarias y cajas de efectivo aislado por gimnasio (18 metodos con ctx primero)"
  - "createEfectivoCaja migrado DE VERDAD: el SELECT de cash_registers y el INSERT dejaron de estar sin filtro (riesgo 3 del PATTERNS cerrado)"
  - "listActiveCajasWithBalance y getPeriodMovement scopeados, probados contra test/finance/cash-balances.test.ts"
  - "2 entradas de allowlist muertas y probadas con el lint contra /tmp/allowlist-172-06.json (480 entradas)"
affects: [172-09, 172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "En un LEFT JOIN, el tenantWhere de la tabla joineada va en el ON (en el WHERE el LEFT se vuelve INNER y borra filas en silencio)"
    - "Los UPDATE tambien llevan tenantWhere: el WHERE de una escritura no se apoya en el SELECT previo"
    - "El tenantWhere va INLINE en el statement de la query, nunca como primer elemento del array de conditions"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/cash-register-service.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts

key-decisions:
  - "Los 6 UPDATE del ABM tambien llevan tenantWhere aunque el SELECT previo ya cortaria con 404: defensa en profundidad, el plan solo pedia SELECT e INSERT"
  - "validateBankAccountForCharge (closure del plugin, sin request a mano) recibe el ctx PRIMERO y sus 4 call sites lo resuelven con assertTenant"
  - "listAllCostCenters perdio su WHERE condicional: la rama sin .where() era exactamente la forma en que un listado se escapa del gimnasio"
  - "getPeriodMovement se migro en este plan aunque el <objective> lo listaba en el cluster B: su unico caller es listActiveCajasWithBalance, asi que no arrastra a transaction-service"
  - "Cero archivos de test tocados: los 4 que el plan nombraba ejercitan estas rutas por HTTP, no llaman al service"

patterns-established:
  - "El criterio de terminado de un metodo es el inventario del lint, no la firma: createEfectivoCaja tenia ctx desde antes y estaba sin migrar"
  - "Un ABM se cierra entero (SELECT + INSERT + UPDATE + guard de unicidad), no solo sus lecturas"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-07-30
---

# Phase 172 Plan 06: El ABM de cajas, cuentas y centros de costo Summary

**Los 18 métodos del cluster ABM de `cash-register-service.ts` reciben el gimnasio por parámetro y lo nombran en sus 17 queries — incluidos los 6 UPDATE que el plan no pedía y el guard de unicidad de nombre, que ahora compara por gimnasio en vez de filtrar los nombres del vecino por el 409 — y la trampa documentada de `createEfectivoCaja` (ctx en la firma desde la fase 168, SELECT e INSERT sin filtro) queda cerrada. Los saldos por caja siguen dando los mismos números: `cash-balances.test.ts` verde, 8/8, sin tocar una expectativa.**

## Performance

- **Duration:** ~25 min (21:03Z → 21:28Z)
- **Completed:** 2026-07-30
- **Tasks:** 3/3 (las tres `auto`)
- **Files modified:** 3 — +315 / −97

## Task Commits

| Task | Nombre                                                      | Commit     | Archivos                                                  |
| ---- | ----------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| 1    | Centros de costo (8 métodos) con ctx y helpers              | `361f3eae` | cash-register-service.ts, routes.ts                       |
| 2    | Cuentas bancarias y cajas de efectivo                       | `6d261929` | cash-register-service.ts, routes.ts, coach-load-routes.ts |
| 3    | `listActiveCajasWithBalance` + `getPeriodMovement` + prueba | `49bac06d` | cash-register-service.ts, routes.ts                       |

Los tres commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `1c7dd7d5` del plan 04). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Accomplishments

- **18 métodos con `ctx: TenantContext` como PRIMER parámetro**: los 8 del ABM de centros de costo, los 8 del ABM bancario (incluido el privado `getBankAccountRow`) y los 2 de saldos. `createEfectivoCaja` ya lo tenía y ahora además lo usa.
- **17 `tenantWhere` nuevos** en el archivo: 7 sobre `cost_centers`, 8 sobre `cash_registers` (los 10 que cuenta el grep incluyen los 2 preexistentes del método ya migrado), 1 sobre `financial_transactions` y 1 sobre `branches`.
- **`assertUniqueName` compara por gimnasio.** Es la mitigación de T-172-06-04 y no es teórica: sin el filtro, el gimnasio B que intenta crear "Alquiler" recibe un 409 que sólo puede significar "el gimnasio A ya tiene un centro con ese nombre". La unique compuesta de la fase 168 ya lleva `tenant_id`, así que el guard y el índice vuelven a decir lo mismo (antes de este cambio decían cosas distintas: el índice permitía el alta y el guard la rechazaba).
- **Los 2 INSERT pasan por `tenantValues`** (`createCostCenter` y `createEfectivoCaja`; `createBankAccount` también). El gimnasio se estampa DESPUÉS del literal, así que un `tenantId` que llegara por el body no puede ganar — T-172-06-03. Sin un solo `as const`: los enums de Drizzle (`type: "banco"`, `type: "efectivo"`) compilan igual (hallazgo 169-07, confirmado acá).
- **11 `assertTenant(request.scope, …)` nuevos**: 6 en el ABM de cost-centers de `routes.ts`, 6 en el bancario/cajas + 2 en los saldos (total 12 en el archivo, contando el preexistente de `createEfectivoCaja`), y 5 en `coach-load-routes.ts` (4 en el guard compartido de cuenta banco + el de `GET /bank-accounts`).
- **`test/finance/cash-balances.test.ts` verde: 8/8 en 116 s**, sin haber cambiado ninguna expectativa. Ese archivo prueba justo lo que el cambio podía romper: que un `gestion` no-owner NO vea las cajas central/banco branch-less y que un owner SÍ.
- **Lint verde contra la allowlist filtrada**: `DISCREPANCIAS: 0` con `/tmp/allowlist-172-06.json` (**480** entradas). `tenant-lint-allowlist.json` no se tocó.

## La trampa de `createEfectivoCaja`, cerrada

El PATTERNS la marcaba como riesgo 3 y el `<important_context>` de este plan la repetía: **"el método tiene `ctx`" ≠ "el método está migrado"**. El estado real al arrancar era exactamente ese: el `ctx` estaba en la firma desde que se migró el SELECT de `branches`, pero

- el SELECT que hace cumplir el invariante "una caja efectivo activa por (sucursal, moneda)" **no filtraba por gimnasio**, así que la caja de otro gimnasio en la misma sucursal bloqueaba el alta con un 409 que además delataba su existencia; y
- el INSERT **no pasaba por `tenantValues`**: la caja nueva nacía en el tenant 1 por el `DEFAULT` de la columna, no porque alguien lo hubiera decidido.

Las dos cosas están cerradas y el motivo quedó escrito en el código, arriba del SELECT, nombrando el riesgo 3 para que se lea como contraejemplo y no como comentario decorativo.

## El LEFT JOIN de `listActiveCajasWithBalance`

`cash_registers LEFT JOIN branches` es LEFT porque las cajas central y banco tienen `branch_id NULL`. El `tenantWhere(schema.branches, ctx)` va **en el `ON`**, y eso no es estilo:

- En el `WHERE`, `branches.tenant_id = 1` evalúa `NULL = 1` → falso para toda caja branch-less, el LEFT se comporta como INNER y **las cajas central/banco desaparecen del listado de saldos**. Es el modo de falla que el plan 03 documentó y el más caro de la fase, porque **el lint sale verde igual** (el statement nombra el gimnasio: no tiene forma de saber que lo nombra en el lugar equivocado).
- El test dirigido lo cubre desde el otro lado: hay un caso que exige que el **owner SÍ vea** la caja branch-less. Si el filtro se hubiera colado al WHERE, ese caso se caía. Salió verde.

`branches` no es tabla strict y D-07 la deja fuera de alcance, pero acá se scopea igual porque el país de la sucursal es lo que decide qué ve un no-owner: dejarla sin filtro sería resolver la visibilidad de un gimnasio con datos de otro.

## Verificación

| Criterio                                                              | Resultado                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                              | ✅ exit 0 (después de cada task)                                    |
| `pnpm exec vitest run test/finance/cash-balances.test.ts`             | ✅ **8/8 verdes**, 116 s, sin tocar expectativas                    |
| `lint-tenant --allowlist=/tmp/allowlist-172-06.json`                  | ✅ exit 0, `DISCREPANCIAS: 0`                                       |
| `grep -c "tenantWhere(schema.costCenters"`                            | 7 (pedía ≥ 7)                                                       |
| `grep -c "tenantWhere(schema.cashRegisters"`                          | 10 (pedía ≥ 8)                                                      |
| `grep -c "tenantWhere(schema.branches"`                               | 2 (pedía ≥ 2)                                                       |
| `grep -c "tenantValues(ctx"`                                          | 3 (pedía ≥ 1)                                                       |
| `grep -c "assertTenant(request.scope" routes.ts`                      | 12                                                                  |
| `grep -c "assertTenant(request.scope" coach-load-routes.ts`           | 7 (pedía ≥ 3)                                                       |
| `grep -nE "tenantId!\|\?\? 1"` en los 3 archivos                      | sin líneas                                                          |
| Accesos violadores sobre `cost_centers` en `cash-register-service.ts` | ✅ **0** (motor del lint)                                           |
| `git status --porcelain el-templo-api/tenant-lint-allowlist.json`     | vacío (dueño único = 172-21)                                        |
| `prettier --check` sobre los 3 archivos                               | ✅                                                                  |
| Inventario de exenciones `tenant-safe`                                | **10** — el mismo de 172-01, **ninguna nueva y ninguna de finance** |
| `git status --porcelain` en `et-172`                                  | vacío                                                               |

**Se corrió UN archivo de test, no el suite.** Está explícitamente permitido por el `<action>` de la Task 3 y es verificación dirigida: el riesgo que cierra (que los saldos cambien de número) no es detectable por `tsc` ni por el lint. El `argon2` que 172-01 dejó como bandera **no dio problema**: el archivo crea staff y socios reales y pasó entero.

### 📌 Entradas de allowlist que paga este plan: **2** (1 strict + 1 colateral)

```
el-templo-api/src/modules/finance/cash-register-service.ts | cost_centers   ← strict
el-templo-api/src/modules/finance/cash-register-service.ts | branches       ← colateral
```

Medidas con el lint, no estimadas: el archivo pasó de 2 entradas vivas más a las que conserva. **`cash_registers` y `financial_transactions` siguen vivas y eso es lo esperado** — el plan lo anticipa en su `<context>` ("`cash-register-service.ts` queda con entradas vivas hasta el plan 172-09"). Los 9 accesos violadores que quedan en el archivo son todos del cluster B: `resolveCashRegister` (2) y `getBalance` (7). No hay ninguno del ABM.

**Cuenta acumulada para el plan 172-21: 9 (172-02) + 4 (172-03) + 6 (172-04) + 2 (172-06) = 21 entradas a borrar de `tenant-lint-allowlist.json`.** El archivo `/tmp/allowlist-172-06.json` (480 entradas, 501 − 21) es la evidencia ejecutable, y su generador `/tmp/gen-allowlist-172-06.py` mantiene las cinco listas separadas y comentadas (`YA_PAGADAS_02/03/04`, `PAGA_06_STRICT`, `PAGA_06_COLATERAL`).

## Decisions Made

### 1. Los UPDATE también llevan `tenantWhere`

El plan pedía el filtro en los SELECT y `tenantValues` en los INSERT, sin mencionar los UPDATE. Los 6 (rename/deactivate/reactivate de centros de costo, update/close/reactivate de cuentas) lo llevan igual. El SELECT previo ya corta con 404 sobre una fila ajena, así que en el flujo normal el filtro del UPDATE nunca cambia el resultado — y por eso mismo vale ponerlo: **el WHERE de una escritura no debe apoyarse en una lectura anterior**. El día que alguien reordene el método, agregue un camino que saltee el guard o convierta el SELECT en cacheado, el UPDATE sigue sin poder tocar la fila del vecino. Es T-172-06-02 escrito en el statement que escribe, no en el que lee.

### 2. `validateBankAccountForCharge` recibe el `ctx` primero

Ese closure de `coach-load-routes.ts` es el choke-point que valida la cuenta bancaria elegida en la PoS antes de imputarle un cobro. No es un handler: vive en el cuerpo del plugin y **no tiene `request` a mano**. Se le agregó `ctx: TenantContext` como primer parámetro y cada uno de sus 4 call sites (pay-plan, renovación, cobro suelto y alta) lo resuelve con su propio `assertTenant`. El compilador obligó a mirar los cuatro, que es exactamente para lo que sirve la regla "ctx primero" (169-06).

### 3. `getPeriodMovement` entra en este plan

El `<objective>` lo listaba en el cluster B (plan 172-09) junto a `resolveCashRegister` y `getBalance`, pero la Task 3 lo pedía por nombre. Se siguió la task, y el motivo por el que no genera el problema que el cluster B busca evitar: **su único caller es `listActiveCajasWithBalance`** (verificado por grep sobre `src` y `test`), así que cambiarle la firma no toca `transaction-service` ni `movement-service`. `getBalance`, que sí tiene callers de los dos lados, quedó intacto.

### 4. Cero archivos de test tocados

El plan pedía agregar `{ tenantId: TENANT_TEMPLO }` a los call sites directos de cuatro archivos de test. **Esos call sites no existen** (ver desviación 1). Los cuatro ejercitan estas rutas por HTTP.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug del plan] Los 4 archivos de test no llaman al service directamente**

- **Found during:** Tasks 1, 2 y 3
- **Issue:** El plan mandaba agregar el ctx a los "call sites directos al service" de `cost-centers.test.ts`, `cost-centers-abm.test.ts`, `bank-accounts.test.ts` y `cash-balances.test.ts`, importando `TENANT_TEMPLO` de `../fixtures/second-tenant`. Un grep de los 15 nombres de método migrados sobre todo `test/` devuelve **cero** resultados: los cuatro archivos ejercitan las rutas por `app.inject`. `cost-centers.test.ts` sí construye un `CashRegisterService`, pero sólo para inyectarlo en el constructor de `TransactionService`.
- **Fix:** no se tocó ningún archivo de test. Si se hubieran agregado los argumentos que el plan pedía, habrían sido a métodos que nadie invoca desde ahí.
- **Verificación de que no es un descuido:** `tsc` no mira `test/**` (el modo de falla del plan 02), así que se comprobó por grep explícito y además corriendo un archivo de test real contra MySQL, que pasó entero.
- **Files modified:** ninguno

**2. [Rule 3 - Bloqueante] En `listAllCostCenters` el `tenantWhere` tenía que ir INLINE en la query**

- **Found during:** Task 3 (verificación con el lint)
- **Issue:** Ese método tenía un `.where()` **condicional** (con país filtraba, sin país no había WHERE). La primera escritura lo unificó poniendo `tenantWhere` como primer elemento del array `conditions` y componiendo con `and(...conditions)`. El SQL resultante era correcto —el filtro de gimnasio siempre presente— pero **el lint lo seguía contando como violación**: mide por statement, y el statement que nombra `cost_centers` es el de la query, no el `const conditions` de arriba. Sin esto, la entrada `cash-register-service.ts | cost_centers` **no moría** y el criterio de terminado del propio plan quedaba inalcanzable.
- **Fix:** `.where(and(tenantWhere(schema.costCenters, ctx), ...conditions))`, con `conditions` conteniendo sólo el filtro de país. Es la misma forma que ya usan `listActiveCostCenters` y `listActiveBankAccounts`, y el motivo quedó comentado en el código.
- **Por qué importa registrarlo:** es la tercera vez en la fase que la misma trampa muerde (planes 02, 04 y ahora 06) y las tres con una forma distinta del mismo error. **La regla, sin excepciones: el gimnasio se nombra en el statement que nombra la tabla.**
- **Files modified:** `el-templo-api/src/modules/finance/cash-register-service.ts`
- **Committed in:** `49bac06d`

**3. [Rule 2 - Seguridad] Los 6 UPDATE llevan `tenantWhere` (el plan sólo pedía SELECT e INSERT)**

- **Found during:** Tasks 1 y 2
- **Issue:** El `<action>` de las dos tasks hablaba de "cada SELECT" y de "los INSERT/UPDATE pasan por `tenantValues`" — pero `tenantValues` es para los VALUES de un INSERT o el SET de un UPDATE, no para su WHERE. Un UPDATE con `WHERE id = ?` y sin gimnasio depende enteramente de que el SELECT previo haya cortado.
- **Fix:** los 6 UPDATE del ABM llevan `and(tenantWhere(...), eq(id))`, con el motivo comentado en dos de ellos.
- **Files modified:** `el-templo-api/src/modules/finance/cash-register-service.ts`
- **Committed in:** `361f3eae` y `6d261929`

**4. [Rule 1 - Conteo del plan] Los call sites de `routes.ts` son 6 + 6, no 7 + 7**

- **Found during:** Tasks 1 y 2
- **Issue:** El plan hablaba de "los 7 call sites del ABM de cost-centers" y "los 7 del ABM bancario/cajas". Los reales son **6** de cost-centers (list, create, rename, deactivate, reactivate, list-all) y **6** nuevos del bancario/cajas (create, update, close, list dentro del close, reactivate, list) — el séptimo del segundo bloque es el `createEfectivoCaja` que **ya tenía** su `assertTenant` desde la fase anterior. Los totales del archivo cierran igual.
- **Fix:** ninguno necesario; los conteos finales (12 en `routes.ts`, 7 en `coach-load-routes.ts`) superan los criterios de aceptación.
- **Files modified:** ninguno

---

**Total deviations:** 4 auto-fixed (2 × Rule 1, 1 × Rule 2, 1 × Rule 3). Ninguna agranda el alcance; la #1 lo achica (cuatro archivos que el plan creía que había que tocar y no) y la #3 lo endurece dentro de los mismos métodos.

## Issues Encountered

**El lint sigue ROJO contra la allowlist REAL en esta rama, ahora por 21 entradas.** Consecuencia buscada del diseño de la fase (la allowlist tiene un dueño único, el plan 172-21): quien corra `pnpm lint:tenant` sin `--allowlist` en `feat/172-adopcion-finance` ve `DISCREPANCIAS: 21`, todas `staleNoLongerViolating`. **No es una regresión: son 21 entradas pidiendo que las borren.** Si la rama se mergeara a `staging` antes del 172-21, CI quedaría rojo por esto.

**Riesgo residual que este plan NO cierra, para el plan 172-09 y para la batería ISO-03 (172-22):** `getBalance` sigue **sin `ctx`**, y es el que calcula el saldo firme y el pendiente sumando `financial_transactions` por `cash_register_id` **sin filtro de gimnasio**. Los tres call sites internos (`getBankAccountRow`, `listActiveCajasWithBalance`, `createEfectivoCaja`) le pasan ids de caja que **ya salieron de una query scopeada**, así que hoy no hay un camino por el que un actor del gimnasio A obtenga el saldo de una caja del B. Pero el saldo de una caja propia se sigue calculando sin nombrar el gimnasio: si existiera una transacción de otro gimnasio apuntando a esta caja, sumaría. Eso no debería poder pasar con datos sanos y **no está probado** — lo cierra el plan 172-09, que migra el cluster B.

**El movimiento del período de una caja ajena da 404 y no 403** (`NotFoundError`, "No existe la caja N"), igual que el resto del ABM. Es D-09 y es deliberado: un 403 confirmaría la existencia del recurso. Quedó escrito en el docblock de `getCostCenterRow` para que nadie lo "corrija".

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos ni schemas. Las 13 rutas tocadas conservan sus guards (`ADMIN_ROLES` en-handler para todo el ABM, `FINANCE_VOID_ROLES` para el selector de centros de costo, `FINANCE_LOAD_ROLES` a nivel plugin en coach-load) y su `handleServiceError` — `assertTenant` lanza `AppError(403, TENANT_UNRESOLVED)`, que ese handler ya sabe mapear.

Mitigaciones del `<threat_model>` del plan, verificadas:

| Threat      | Estado                                                                                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-06-01 | ✅ `tenantWhere` primer término en los 17 SELECT/UPDATE del cluster; el listado de saldos además lleva el filtro de `branches` en el ON. Cross-tenant cae en la rama not-found existente (404/vacío, nunca 403) |
| T-172-06-02 | ✅ el SELECT previo corta con 404 **y** los 6 UPDATE llevan su propio `tenantWhere` (desviación 3): la escritura no se apoya en la lectura                                                                      |
| T-172-06-03 | ✅ `tenantValues(ctx, {...})` en los 3 INSERT (cost center, cuenta banco, caja efectivo), con el tenant después del literal                                                                                     |
| T-172-06-04 | ✅ `assertUniqueName(ctx, …)` filtra por gimnasio antes de comparar el nombre; el guard vuelve a coincidir con la unique compuesta de la fase 168                                                               |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                                    |

## Next Phase Readiness

**Listo.** Cinco cosas que los planes siguientes tienen que dar por sentadas:

1. **Las firmas del ABM cambiaron y el `ctx` va PRIMERO** en los 18 métodos. El plan **172-09** parte de esta versión de `cash-register-service.ts`: le quedan `resolveCashRegister`, `getBalance` y sus 9 accesos violadores, todos en la mitad superior del archivo.
2. **`getBalance` es el próximo eslabón y tiene 3 callers internos en este mismo archivo** (`getBankAccountRow`, `listActiveCajasWithBalance`, `createEfectivoCaja`), los tres ya con `ctx` disponible: agregarle el parámetro no obliga a cambiar ninguna firma más de este archivo.
3. **`validateBankAccountForCharge` ya recibe `ctx`** en `coach-load-routes.ts`. El plan que migre el resto de ese archivo hereda la firma y los 4 call sites resueltos.
4. **La allowlist acumula 21 entradas muertas** (9 + 4 + 6 + 2). El plan 172-21 borra las 21.
5. **La batería ISO-03 (172-22) tiene dos casos que este plan hace verificables y que el lint NO puede probar:** (a) que el listado de saldos siga mostrando las cajas central/banco branch-less (si el `tenantWhere` de `branches` se colara al WHERE, desaparecerían y el lint saldría verde), y (b) que dos gimnasios puedan tener un centro de costo con el mismo nombre sin que el alta del segundo dé 409.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-06-SUMMARY.md`
- `FOUND` commits `361f3eae` (Task 1), `6d261929` (Task 2) y `49bac06d` (Task 3) en `feat/172-adopcion-finance`
- `FOUND` `/tmp/allowlist-172-06.json` (480 entradas) con el lint verde contra él, y `/tmp/gen-allowlist-172-06.py`
- `FOUND` los 3 archivos modificados en `git diff --stat 1c7dd7d5..HEAD` (+315 / −97)
- `VERIFIED` `git status --porcelain` en `et-172` vacío y `tenant-lint-allowlist.json` sin modificar
- `VERIFIED` 0 accesos violadores sobre `cost_centers` en `cash-register-service.ts` según el motor del lint
- `VERIFIED` `test/finance/cash-balances.test.ts` 8/8 verde contra MySQL real

**ADO-01 NO se marca completo**, misma convención que 172-01/02/03/04: el requisito exige `finance` migrado entero (services + sentinel + aislamiento verde) y lo citan 18 de los 23 planes. Este plan cierra **la mitad** de un archivo de `finance`; la otra mitad es el plan 172-09.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
