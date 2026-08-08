---
phase: 172-adopci-n-1-piloto-finance
plan: 12
subsystem: finance
tags:
  [
    tenancy,
    finance,
    transaction-service,
    lecturas,
    listados,
    bandeja,
    resumen,
    export,
    tenantWhere,
    allowlist,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / TenantContext)"
  - phase: 170-sentinel-lint
    provides: "src/db/scripts/lint-tenant.ts y tenant-lint-allowlist.json (ratchet)"
  - plan: 172-01
    provides: "worktree et-172 sobre a6272df0, baseline verde, allowlist en 501 entradas"
  - plan: 172-08
    provides: "las 21 firmas de TransactionService con ctx PRIMERO (este plan no cambia ninguna)"
  - plan: 172-10
    provides: "las escrituras del archivo cerradas + el hallazgo del tenantWhere en el ON de un LEFT JOIN"
  - plan: 172-11
    provides: "los dos archivos de rutas de finance cerrados: los handlers ya entregan el ctx"
provides:
  - "buildListConditions estampa el tenantWhere de financial_transactions DENTRO del SQL[] que devuelve: list() y exportRowsForExcel() quedan scopeados de una"
  - "list / listForMember / listPendingMiscForMember: 12 tenantWhere sobre financial_transactions, transaction_links, users, branches y los alias recorder/validator"
  - "listPendingTray y listMovEgresos: 22 tenantWhere, con el subquery de cajas por pais filtrado por dentro"
  - "getSummary: el gimnasio en el conds[] que comparten las 4 agregaciones de la CajaPage"
  - "getFinancialHistory / getOutstandingConcepts / exportRowsForExcel: 12 tenantWhere, incluidos balances, subscriptions y subscription_plans"
  - "transaction-service.ts SIN una sola entrada viva de allowlist (D-06): 9 entradas muertas"
  - "finance ENTERO sin entradas de allowlist: 0 de los 6 archivos del modulo"
  - "el docblock de la clase (L25-28) reescrito: el archivo ya no promete trabajo futuro"
affects: [172-13, 172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un helper que devuelve SQL[] lleva el tenantWhere DENTRO del array: el llamador no puede olvidarlo y una query nueva nace scopeada"
    - "tenantWhere acepta un alias de drizzle (`alias(schema.users, 'recorder')`) sin gimnasia de tipos: `T extends { tenantId: AnyMySqlColumn }` lo satisface"
    - "El lint razona por STATEMENT y por presencia textual: un filtro que vive en otra funcion NO hace cumplidor al statement — la compliance de list() la dan los tenantWhere de sus joins, la correccion la da el helper"
    - "Los conteos del PLAN vuelven a estar sobrestimados (sexta vez en la fase): son referencias `schema.X`, no queries"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/transaction-service.ts

key-decisions:
  - "El filtro de TODA tabla joineada va en el ON, tambien en los INNER JOIN: en un LEFT JOIN es obligatorio (en el WHERE se vuelve INNER) y en un INNER es equivalente, asi que una sola forma para las dos evita que el proximo lector tenga que decidir"
  - "El subquery de cajas por pais de listMovEgresos lleva su propio tenantWhere en sus dos tablas: arma su propio predicado y el IN de afuera no lo cubre"
  - "El tenantWhere de financial_transactions de list()/export vive DENTRO de buildListConditions y NO se duplica en el llamador: duplicarlo daria el mismo SQL pero mataria la garantia (el que agregue una query nueva se apoyaria en el duplicado)"
  - "/tmp/allowlist-172-12.json se derivo de /tmp/allowlist-172-11.json (cadena de la fase) y no de la allowlist real: partir de la real dejaria vivas las 42 entradas ya pagadas y el lint saldria rojo por deuda ajena"

patterns-established:
  - "Cuando dos statements del mismo metodo comparten un array de conditions (COUNT + filas), el tenantWhere va en el ARRAY y no en cada query: los dos numeros tienen que salir del mismo universo o la paginacion miente"

requirements-completed: []

# Metrics
duration: 19min
completed: 2026-07-30
---

# Phase 172 Plan 12: Las lecturas de transaction-service — el archivo entero cerrado Summary

**Los diez caminos por los que `transaction-service.ts` LEE plata —`list`, `buildListConditions`, `listForMember`, `listPendingMiscForMember`, `listPendingTray`, `listMovEgresos`, `getSummary`, `getFinancialHistory`, `getOutstandingConcepts` y `exportRowsForExcel`— quedan encerrados en el gimnasio del staff que consulta: 52 `tenantWhere` nuevos sobre las 33 queries de esos métodos, sin mover una firma, una paginación, un orden ni un filtro de negocio. El helper `buildListConditions` devuelve el filtro DENTRO de su `SQL[]`, así que toda query que componga ese fragmento —hoy la lista y el export, mañana la que se escriba— nace scopeada. `pending-tray` 6/6 y `summary-by-kind` 10/10 contra MySQL real, sin tocar una expectativa. **Con las 9 entradas que paga este plan, `transaction-service.ts` sale entero de la allowlist y `finance` queda sin una sola entrada viva.\*\*

## Performance

- **Duration:** ~19 min (21:31 → 21:50 -03), de los cuales ~5,2 min son las dos corridas contra MySQL real
- **Completed:** 2026-07-30
- **Tasks:** 3/3 (las tres `auto`)
- **Files modified:** 1 — +275 / −62

## Task Commits

| Task | Nombre                                                      | Commit     | Archivos               |
| ---- | ----------------------------------------------------------- | ---------- | ---------------------- |
| 1    | `list`, `buildListConditions` y los listados por socio      | `57729cd7` | transaction-service.ts |
| 2    | Bandeja de pendientes, movimientos/egresos y resumen        | `03c66158` | transaction-service.ts |
| 3    | Historial, conceptos adeudados, export y cierre del archivo | `9e9846a6` | transaction-service.ts |

Los tres commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `c473ee3c` del plan 11). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Accomplishments

- **`buildListConditions` devuelve el filtro adentro** (T-172-12-02, y es lo más importante del plan). El helper es privado y devuelve `SQL[]`; el `tenantWhere(schema.financialTransactions, ctx)` es el **primer elemento del array**, no algo que cada llamador agregue. Sus dos consumidores actuales —`list()` y `exportRowsForExcel()`— quedan scopeados **de una**, y el que mañana escriba una tercera query sobre ese fragmento **no puede olvidarse**: no hay nada que recordar. Un `tenantWhere` en el llamador se olvida; uno acá adentro es imposible de saltear.
- **Los agregadores que el staff mira todo el día quedan aislados sin cambiar un número:** la bandeja de pendientes (`/pending-tray`), el historial de movimientos (`/movements-history`) y el resumen de la CajaPage (`/transactions/summary`). Los tres son los que compara el script de snapshot D-12, así que cualquier corrimiento acá habría sido un bug, no una migración.
- **El `COUNT` y la query de filas comparten el mismo array de condiciones, y el gimnasio va ahí adentro.** En `listPendingTray`, `listMovEgresos`, `list` y `getSummary` el filtro se escribió **una vez, en el array**, y no en cada query: si el total se contara sobre un universo y las filas sobre otro, la paginación mostraría "142 resultados" y devolvería 30. Es la clase de bug que se ve en producción tres semanas después.
- **El subquery de cajas por país de `listMovEgresos` filtra por dentro.** Arma su propio predicado (`cash_registers` innerJoin `branches` WHERE country) y el `IN` de afuera no lo cubre: sin filtro, el conjunto de "cajas de Argentina" incluía las del gimnasio vecino y el arqueo dejaba entrar sus filas. Las **dos** tablas del subquery nombran el gimnasio.
- **El export a Excel filtra igual que la lista en pantalla** (T-172-12-03). Es el vector más silencioso de fuga masiva del módulo: una planilla se manda por mail y nadie la lee fila por fila.
- **`getOutstandingConcepts` y `getFinancialHistory` con el filtro en el ON de sus LEFT JOIN.** En `getOutstandingConcepts` el LEFT JOIN es **obligatorio por diseño** (`target_kind='debt_balance'` no tiene FK a `subscriptions`, y el propio docblock lo dice en mayúsculas): moverlo al WHERE lo habría vuelto INNER y habría borrado en silencio **justo los saldos libres que el método existe para listar**.
- **`tenantWhere` acepta los alias de drizzle sin gimnasia de tipos.** `recorder`, `validator` y `created_member` son `alias(schema.users, …)` y el lint los resuelve a `users` (los cuenta como acceso), así que había que filtrarlos. `tenantWhere(recorder, ctx)` compila directo: la firma pide `T extends { tenantId: AnyMySqlColumn }` y un alias lo satisface.
- **El docblock de la clase reescrito** (deuda que el 172-10 dejó anotada y el 172-11 repitió). Ya no dice "las queries de este archivo **todavía no** filtran": dice que el archivo está migrado entero, que no tiene entradas de allowlist, y deja escritas **las dos formas** que hay que respetar al agregar una query (el filtro de una joineada va en el ON; a `buildListConditions` no se le agrega el filtro por afuera).
- **9 entradas de allowlist muertas y probadas con el lint** — y con ellas **`finance` entero fuera de la allowlist**.
- **16 tests contra MySQL real, verdes**, sin tocar una expectativa: `pending-tray.test.ts` **6/6** (139 s) y `summary-by-kind.test.ts` **10/10** (154 s).

## Verificación

| Criterio                                                                | Resultado                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                                | ✅ **exit 0** (después de cada task)                            |
| `pnpm exec vitest run test/finance/pending-tray.test.ts`                | ✅ **6/6**, 139 s                                               |
| `pnpm exec vitest run test/finance/summary-by-kind.test.ts`             | ✅ **10/10**, 154 s                                             |
| `lint-tenant --allowlist=/tmp/allowlist-172-12.json` (450 entradas)     | ✅ **exit 0**, `DISCREPANCIAS: 0`                               |
| `unlistedViolations` con la allowlist filtrada                          | ✅ **0** — no se introdujo un acceso violador nuevo             |
| `staleNoLongerViolating` / `staleMissingFile` / `strictWithAllowlist`   | ✅ **0 / 0 / 0**                                                |
| Entradas de `finance/` en la allowlist filtrada                         | ✅ **0** de 6 archivos                                          |
| `buildListConditions`: `grep -c "tenantWhere("`                         | **1** (pedía ≥ 1)                                               |
| `listForMember` + `listPendingMiscForMember` + `list`                   | **12** (pedía ≥ 6)                                              |
| `listPendingTray` + `listMovEgresos`                                    | **22** (pedía ≥ 12)                                             |
| `getSummary`                                                            | **5** (pedía ≥ 4)                                               |
| `getFinancialHistory` + `getOutstandingConcepts` + `exportRowsForExcel` | **12**                                                          |
| `grep -c "tenantWhere("` en el archivo entero                           | **84** (pedía ≥ 45)                                             |
| `git diff \| grep -cE "^[-+].*(limit\|offset\|orderBy)\("`              | **0** — no se tocó una paginación ni un orden                   |
| `git diff \| grep -cE "^[-+].*(throw new\|code: 403)"`                  | **0** — no se tocó un error ni un código de respuesta           |
| `grep -nE "tenantId!\|tenantId\s*\?\?"`                                 | sin líneas (ver desviación 3)                                   |
| `prettier --check`                                                      | ✅                                                              |
| Inventario de exenciones `tenant-safe`                                  | **10** — el mismo de 172-01, ninguna nueva; **0** en el archivo |
| `git status --porcelain` en `et-172`                                    | vacío                                                           |
| `git status --porcelain … tenant-lint-allowlist.json`                   | vacío (dueño único = 172-21)                                    |
| Archivos de test modificados                                            | **ninguno** (el plan no cambia ninguna firma)                   |

### 📌 Entradas de allowlist que paga este plan: **9**

```
el-templo-api/src/modules/finance/transaction-service.ts | financial_transactions  ← strict
el-templo-api/src/modules/finance/transaction-service.ts | transaction_links       ← strict
el-templo-api/src/modules/finance/transaction-service.ts | balances                ← strict
el-templo-api/src/modules/finance/transaction-service.ts | cash_registers          ← strict
el-templo-api/src/modules/finance/transaction-service.ts | cost_centers            ← strict
el-templo-api/src/modules/finance/transaction-service.ts | branches                ← colateral (D-06)
el-templo-api/src/modules/finance/transaction-service.ts | subscription_plans      ← colateral (D-06)
el-templo-api/src/modules/finance/transaction-service.ts | subscriptions           ← colateral (D-06)
el-templo-api/src/modules/finance/transaction-service.ts | users                   ← colateral (D-06)
```

**5 strict + 4 colaterales.** Con estas 9, `transaction-service.ts` —el archivo más grande y más caliente del módulo, 2624 líneas— **queda sin una sola entrada viva**, y con él **los 6 archivos de `finance` (`balance-service`, `cash-register-service`, `movement-service`, `transaction-service`, `routes`, `coach-load-routes`) están limpios**. `strictWithAllowlist: 0` lo confirma desde el otro lado: no queda una tabla de módulo migrado con entradas vivas.

**Cuenta acumulada para el plan 172-21: 9 (02) + 4 (03) + 6 (04) + 2 (06) + 0 (07) + 3 (08) + 9 (09) + 2 (10) + 7 (11) + 9 (12) = 51 entradas a borrar de `tenant-lint-allowlist.json`.** La evidencia ejecutable vigente pasa a ser **`/tmp/allowlist-172-12.json` (450 entradas)**, derivada de `/tmp/allowlist-172-11.json` quitándole estas 9.

## Decisions Made

### 1. El filtro de una tabla joineada va SIEMPRE en el ON, también en los INNER JOIN

El `<action>` pide `tenantWhere` "primer término" en cada query. Aplicado literal al `where`, en los **LEFT JOIN** es un bug: convierte el join en INNER y borra las filas sin match. En este archivo eso se traduce en cosas concretas y visibles:

- `listMovEgresos` / `listPendingTray`: los **egresos y traspasos sin socio y sin sede** (la caja central, el banco) desaparecerían del arqueo. Es exactamente el caso que el docblock del método llama "the 139 flag".
- `list()`: el `validator` es LEFT JOIN porque `validated_by` es nullable — se irían **todas las filas nacidas validadas**, que son la mayoría.
- `getOutstandingConcepts`: se irían los **saldos libres** (`debt_balance` no tiene FK a `subscriptions`), que son la mitad de lo que el método existe para devolver.

En los **INNER JOIN** (los de `list`, `exportRowsForExcel` y las 4 agregaciones de `getSummary`) da lo mismo ON o WHERE: una fila sin match ya está descartada. Se eligió **el ON también ahí** por una sola razón: que haya **una** forma y no dos. Un lector que ve `and(tenantWhere(...), eq(...))` dentro de todos los `.innerJoin()` y `.leftJoin()` del archivo no tiene que decidir nada; si la mitad estuviera en el `where`, el próximo que agregue un join tendría que razonar cuál copiar — y la mitad de las veces va a copiar la equivocada.

Es el hallazgo del 172-06 aplicado por **cuarta** vez en la fase (172-10 en `getById`, 172-11 en `resolveCajaCountry`), ahora en 13 joins de una.

### 2. El `tenantWhere` de `financial_transactions` de `list()` NO se duplica en el llamador

`list()` y `exportRowsForExcel()` componen `buildListConditions(ctx, filters)`, que ya trae el filtro adentro. Duplicarlo en el `where` del llamador produciría **el mismo SQL** (`tenant_id = 1 AND tenant_id = 1`) y habría hecho más obvio el filtro leyendo el método suelto. Se decidió que no, y el motivo es de garantía, no de estética: si el filtro aparece en los dos lados, el próximo que escriba una query nueva con el helper **se va a apoyar en el duplicado del llamador de al lado** y lo va a copiar; el día que se copie mal, no hay red. Con el filtro en un solo lugar —adentro— el helper **es** la red, y el comentario que lo anuncia está arriba del `return` y arriba del docblock de la clase.

El costo declarado: `conditions.length > 0` ahora es **siempre** verdadero, así que la rama `: undefined` de los dos `.where(...)` quedó muerta. Se dejó en pie a propósito — borrarla es ruido en un diff cuyo punto es otro, y el ternario sigue siendo correcto.

### 3. `/tmp/allowlist-172-12.json` se derivó de la CADENA, no de la allowlist real

El criterio del plan dice "exactamente 11 entradas menos que `tenant-lint-allowlist.json`". Leído literal, el archivo a generar sería `501 − 11 = 490` entradas — y **el lint contra ese archivo sale ROJO**, con `DISCREPANCIAS: 42`, porque las 42 entradas que pagaron los planes 172-02…172-11 seguirían adentro y el ratchet las reportaría como `staleNoLongerViolating`. El rojo no diría nada sobre este plan: sería deuda ajena, ya pagada.

El archivo correcto es el eslabón siguiente de la cadena que la fase viene armando desde el 172-02: `/tmp/allowlist-172-11.json` (459) **menos las 9 restantes de `transaction-service.ts`** = **450**. Contra ese archivo el lint sale **exit 0**, y el criterio real del plan —"las 11 entradas del archivo, fuera"— se cumple mejor que en su forma literal: **quedan 0 entradas de `transaction-service.ts`**, no 11 menos de un total.

### 4. Los conteos y los rangos del plan se re-derivaron por nombre de método

Sexta vez en la fase. Los `sed -n 'A,Bp'` del plan salen del PATTERNS, derivado de `origin/master` (2172 líneas); el archivo arrancó este plan en **2411** (los planes 08, 09 y 10 le sumaron 239) y terminó en **2624**. `sed -n '1005,1091p'`, que el plan asigna a `listForMember`, hoy cae dentro de `correct()`. Todos los conteos de la tabla de arriba se midieron sobre rangos obtenidos con `grep -n "async <metodo>("`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Seguridad] Los filtros de las tablas joineadas van en el ON y no en el `where`**

- **Found during:** Tasks 1, 2 y 3 — ver decisión 1.
- **Issue:** el `<action>` de los tres tasks pide el `tenantWhere` "como primer término" de la query, sin distinguir joins. Aplicado literal a los **9 LEFT JOIN** del alcance (`validator` en `list`; `users`/`branches`/`cash_registers`/`recorder`/`created_member` en la bandeja; `cost_centers` en movimientos; `subscriptions`/`subscription_plans` en historial y conceptos), habría convertido cada uno en INNER y borrado filas que los métodos existen para devolver.
- **Fix:** el filtro va en el ON de los 13 joins (los 9 LEFT y los 4 INNER), con comentario en cada método explicando por qué.
- **Files modified:** `src/modules/finance/transaction-service.ts`
- **Committed in:** `57729cd7`, `03c66158`, `9e9846a6`

**2. [Rule 2 - Seguridad] El subquery de cajas por país de `listMovEgresos` lleva su propio filtro**

- **Found during:** Task 2
- **Issue:** el `<action>` lo previó en general ("si algún subquery o `sql` crudo arma su propio predicado, el filtro se escribe adentro") pero no lo nombra. `scopedCajas` es un `select … from(cashRegisters).innerJoin(branches).where(country)` que alimenta un `inArray(financial_transactions.cashRegisterId, scopedCajas)`: el filtro del `IN` de afuera **no** alcanza a las filas del subquery. Sin `tenantWhere` adentro, el conjunto de "cajas del país X" incluía las del gimnasio vecino.
- **Fix:** `tenantWhere` sobre `cash_registers` (en el `where`) y sobre `branches` (en el ON del innerJoin) dentro del subquery.
- **Files modified:** `src/modules/finance/transaction-service.ts`
- **Committed in:** `03c66158`

**3. [Rule 1 - Criterio del plan] El gate `grep -nE "…\?\? 1"` tiene 4 falsos positivos estructurales**

- **Found during:** Task 3
- **Issue:** el patrón heredado de la fase incluye `\?\? 1`, que matchea las **4** líneas `const page = Math.max(1, filters.page ?? 1)` — paginación, no tenancy. Ya está anotado en STATE.md desde el 172-08 y vuelve a aparecer porque este plan toca justo los 4 métodos paginados.
- **Fix:** ninguno en el código. Se midió con el regex correcto (`tenantId!|tenantId\s*\?\?`), que devuelve **0 líneas**.
- **Files modified:** ninguno

**4. [Rule 1 - Criterio del plan] El criterio del `/tmp/allowlist-172-12.json` es incumplible en su forma literal**

- **Found during:** Task 3 — ver decisión 3. Generar el archivo desde la allowlist real habría dado un lint rojo por deuda de otros planes. Se derivó de la cadena (`/tmp/allowlist-172-11.json` − 9 = 450), que cumple el criterio real: **0 entradas de `transaction-service.ts`**.
- **Files modified:** ninguno

**5. [Rule 1 - Conteo del plan] Los conteos y rangos del plan estaban rancios otra vez**

- **Found during:** Tasks 1, 2 y 3 — ver decisión 4. Los `sed -n 'A,Bp'` apuntan a un archivo 213 líneas más corto y los "N accesos a tabla X" son referencias `schema.X`, no queries (`listPendingTray: 31 accesos a financial_transactions` son **2** queries). Sexta aparición de la misma sobrestimación en la fase.
- **Fix:** ninguno en el código; todo se re-derivó por nombre de método antes de medir. Los conteos reales quedaron **por encima** de todos los mínimos del plan igual.
- **Files modified:** ninguno

**6. [Rule 2 - Deuda heredada] El docblock de la clase (L25-28) reescrito**

- **Found during:** Task 3
- **Issue:** el `<action>` del Task 3 no lo pide; lo pidieron el 172-10 (su issue "docblock desactualizado a medias") y el 172-11 (punto 3 de su Next Phase Readiness), los dos apuntando a este plan. El texto decía que las queries del archivo "**todavía no** filtran por gimnasio" — con el archivo cerrado, eso pasó de ser una advertencia útil a ser una mentira peligrosa: el próximo lector podría creer que puede agregar una query sin filtro porque "el archivo no está migrado".
- **Fix:** reescrito. Dice qué planes cerraron qué, que el archivo no tiene entradas de allowlist (o sea: un acceso nuevo sin filtro sale **rojo duro** en el lint, sin ratchet que lo amortigüe) y deja las dos formas que hay que respetar al escribir una query nueva.
- **Files modified:** `src/modules/finance/transaction-service.ts`
- **Committed in:** `9e9846a6`

---

**Total deviations:** 6 auto-fixed (4 × Rule 1, 2 × Rule 2). Las #1 y #2 evitan bugs funcionales que el `<action>` inducía o no nombraba; la #6 paga una deuda que dos planes anteriores dejaron anotada; las #3, #4 y #5 corrigen criterios del plan sin tocar una línea de código.

## Issues Encountered

**El lint sigue ROJO contra la allowlist REAL en esta rama, ahora por 51 entradas.** Quien corra `pnpm lint:tenant` sin `--allowlist` en `feat/172-adopcion-finance` ve `DISCREPANCIAS: 51`, todas `staleNoLongerViolating` — **51 entradas pidiendo que las borren**, no una regresión. El dueño único del archivo es el plan **172-21**. **Si la rama se mergeara a `staging` antes de ese plan, CI queda rojo por esto.**

**El módulo `finance` está cerrado, pero la fase no.** Con este plan los 6 archivos del módulo no tienen una sola entrada viva de allowlist y `strictWithAllowlist` da 0. Lo que falta para que **ADO-01** se pueda marcar no es más migración de queries: es el aislamiento verde (172-22/172-23), el borrado de las 51 entradas (172-21) y el diff del snapshot D-12 contra el `antes.json` del 172-05.

**`resolveCashRegister` sigue viva y sigue sin caller.** El 172-08 (decisión 3), el 172-09 (decisión 2) y el 172-10 (decisión 3) la fueron pateando "al plan que lea el archivo entero" — **este plan es ese plan**. No se borró igual, y el motivo es de alcance: el `<files>` de los tres tasks es el mismo archivo pero el objetivo es "migrar las lecturas", y borrar un método público es un cambio de superficie de API que un plan de tenancy no debería colar en un commit de tenancy. **No tiene queries propias** (delega verbatim en `cashRegisterService.resolveCashRegister`, migrado por el 172-09), así que **no afecta a D-06 ni al lint**. Queda como ítem de limpieza para el 172-21 o para quien pase después.

**Ningún archivo de test se tocó**, que es lo esperado: este plan no cambia una sola firma (el 172-08 ya las había cambiado todas). Por eso tampoco aplicaba el `tsconfig.test-check.json` de la receta del 172-09 ni el grep de mocks posicionales.

**Lo que este plan NO prueba.** Los dos tests que corrieron (`pending-tray`, `summary-by-kind`) corren con **un solo gimnasio**, así que prueban que **no se rompió nada** — no prueban aislamiento. Que una lista del gimnasio A no devuelva filas del B lo prueba la batería ISO-03 de la fase 171 corriendo en el 172-22/23, y hasta entonces la garantía es de lectura de código y de lint, no de test.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas, no instala paquetes, no modifica un solo mensaje de error ni un solo código de respuesta (`git diff | grep -cE "^[-+].*(throw new|code: 403)"` = **0**).

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-12-01 | ✅ `tenantWhere` por cada tabla de cada statement en `list` / `listPendingTray` / `listMovEgresos` / `getSummary` / `exportRowsForExcel`; una lista cross-tenant devuelve **vacío**, sin 403 nuevo (D-09) |
| T-172-12-02 | ✅ el filtro sale DENTRO del `SQL[]` de `buildListConditions`, no del llamador: una query nueva que use el helper nace scopeada                                                                           |
| T-172-12-03 | ✅ `exportRowsForExcel` comparte el mismo fragmento que la lista en pantalla, más `tenantWhere` en sus 3 joins y en la query de links                                                                     |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                              |

## Next Phase Readiness

**Listo para el 172-13** (lo que quede de rutas/servicios del módulo) y para los gates del final de fase. Cinco cosas que los planes siguientes tienen que dar por sentadas:

1. **`finance` está CERRADO: los 6 archivos del módulo, sin una sola entrada de allowlist.** Un plan que agregue una query a cualquiera de ellos sin `tenantWhere`/`tenantValues` no crece deuda en silencio: sale **`unlistedViolations`, rojo duro**, sin ratchet.
2. **El 172-21 borra 51 entradas** (9+4+6+2+0+3+9+2+7+9). Evidencia ejecutable: **`/tmp/allowlist-172-12.json` (450 entradas)**, lint `exit 0`, `DISCREPANCIAS: 0`.
3. **`buildListConditions` ya trae el filtro adentro.** No agregarle un `tenantWhere(schema.financialTransactions, ctx)` por afuera al escribir una query nueva: no hace falta y rompe la garantía (ver decisión 2).
4. **El docblock del archivo ya no promete trabajo futuro** — la deuda que el 172-10 y el 172-11 se pasaron entre sí está saldada.
5. **`TransactionService.resolveCashRegister` sigue sin caller y sigue viva.** No afecta al lint ni a D-06; es limpieza pendiente, no bloqueo.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-12-SUMMARY.md`
- `FOUND` commits `57729cd7` (T1), `03c66158` (T2) y `9e9846a6` (T3) en `feat/172-adopcion-finance`
- `FOUND` `el-templo-api/src/modules/finance/transaction-service.ts` en `git diff --stat c473ee3c..HEAD` (+275 / −62)
- `FOUND` `/tmp/allowlist-172-12.json` (450 entradas, 0 de `finance/`)
- `VERIFIED` `pnpm exec tsc --noEmit` exit 0 después de cada task
- `VERIFIED` `pending-tray.test.ts` 6/6 y `summary-by-kind.test.ts` 10/10 contra MySQL real
- `VERIFIED` `lint-tenant --allowlist=/tmp/allowlist-172-12.json` exit 0, `DISCREPANCIAS: 0`, `unlistedViolations: 0`, `strictWithAllowlist: 0`
- `VERIFIED` 84 `tenantWhere(` en el archivo y 0 líneas con `tenantId!` / `tenantId ??`
- `VERIFIED` 0 líneas de paginación, orden, `throw new` o `code: 403` en el diff
- `VERIFIED` `git status --porcelain` en `et-172` vacío y `tenant-lint-allowlist.json` sin modificar

**ADO-01 NO se marca completo**, misma convención que 172-01/02/03/04/06/07/08/09/10/11: el requisito exige `finance` migrado al patrón completo **con aislamiento verde**. Este plan cierra la última query sin gimnasio del módulo, pero el aislamiento lo prueban el 172-22/172-23 y las 51 entradas las borra el 172-21.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
