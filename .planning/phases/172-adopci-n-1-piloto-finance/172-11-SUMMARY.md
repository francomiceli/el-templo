---
phase: 172-adopci-n-1-piloto-finance
plan: 11
subsystem: finance
tags:
  [
    tenancy,
    finance,
    routes,
    coach-load,
    closures,
    country-scope,
    caja,
    tenantWhere,
    assertTenant,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / assertTenant / TenantContext)"
  - phase: 170-sentinel-lint
    provides: "src/db/scripts/lint-tenant.ts y tenant-lint-allowlist.json (ratchet)"
  - plan: 172-01
    provides: "worktree et-172 sobre a6272df0, baseline verde, allowlist en 501 entradas"
  - plan: 172-09
    provides: "MovementService/CashRegisterService/BalanceService cerrados; el hallazgo del tenantWhere en el ON de un LEFT JOIN"
  - plan: 172-10
    provides: "las escrituras de transaction-service migradas; los handlers de routes.ts ya llamaban a services con ctx"
provides:
  - "Las 3 closures de scope de finance/routes.ts (resolveCajaCountry, enforceCajaScope, enforceRowScope) con ctx PRIMERO y sus 3 tablas filtradas"
  - "Las 2 queries directas de los handlers de routes.ts (guard de sede del create, guard de pais del void) filtradas"
  - "finance/routes.ts SIN un solo acceso a base sin gimnasio (4 de 4)"
  - "Las 4 closures de resolucion de coach-load-routes.ts (sede del socio, fallback Templo Online, moneda de renovacion, moneda del plan) con ctx PRIMERO y filtradas"
  - "coach-load-routes.ts SIN un solo acceso a base sin gimnasio (5 de 5)"
  - "7 entradas de allowlist muertas: routes.ts (3) y coach-load-routes.ts (4) — los DOS archivos de rutas del modulo salen de la allowlist"
affects: [172-12, 172-13, 172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Una closure de plugin (sin `request` a mano) recibe el `ctx` como PRIMER parametro y el compilador obliga a mirar todos sus call sites"
    - "El filtro de un leftJoin va en el ON; el de un innerJoin puede ir en el ON sin cambiar la forma del resultado"
    - "Una query que busca por NOMBRE (no por id) es la mas peligrosa de olvidar: sin tenant devuelve la fila del PRIMER gimnasio que tenga ese nombre"
    - "Un criterio `grep -A8` se rompe con los comentarios que documentan el propio filtro: se re-mide con ventana mas grande, no se afloja el filtro"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts

key-decisions:
  - "El tenantWhere de branches en el leftJoin de resolveCajaCountry va en el ON: en el WHERE convertia el left join en inner y la caja SIN sede (efectivo/banco central) dejaba de resolver, cambiandole la respuesta al guard"
  - "El fallback 'Templo Online' de coach-load tambien filtra: la sede virtual es POR gimnasio y la query busca por nombre, no por id"
  - "Cero 403 nuevos en las closures de scope: la caja/fila ajena sale por la rama 404 que ya existia (D-09)"
  - "Los 6 handlers tocados hoistean UN solo assertTenant al tope del try y lo reusan; dos etiquetas de 403 cambian de texto como consecuencia (convencion 172-09)"
  - "GET /autocompletar hoistea un ctx que antes se resolvia inline en el getRow de mas abajo"

patterns-established:
  - "Un plan que migra rutas empieza midiendo `grep -n 'fastify.db'`: los accesos directos son pocos y contables, y los conteos del PATTERNS (referencias `schema.X`) los sobrestiman siempre"

requirements-completed: []

# Metrics
duration: 18min
completed: 2026-07-30
---

# Phase 172 Plan 11: El punto ciego del módulo — los dos archivos de rutas Summary

**Los 9 accesos a base que viven en los DOS archivos de rutas de `finance` —y no en un service— quedan filtrados por gimnasio: las 3 closures de scope del plugin (`resolveCajaCountry`, `enforceCajaScope`, `enforceRowScope`), las 2 queries directas de los handlers de `routes.ts` (el guard de sede del cobro y el guard de país de la anulación) y las 4 resoluciones de la PoS del profe (sede del socio, fallback "Templo Online", moneda de renovación, moneda del plan). El contrato de respuesta NO se movió: cero `code: 403` nuevos, cero `throw new` tocados — la caja o la fila de otro gimnasio sale por la MISMA rama 404 que ya existía, que es exactamente el contrato D-09. `coach-load.test.ts` 48/48 contra MySQL real, sin tocar una expectativa. **7 entradas de allowlist muertas: los dos archivos de rutas del módulo salen enteros de la allowlist.\*\*

## Performance

- **Duration:** ~18 min (00:14Z → 00:32Z), de los cuales 2,2 min son la corrida contra MySQL real
- **Completed:** 2026-07-30
- **Tasks:** 3/3 (las tres `auto`)
- **Files modified:** 2 — +154 / −29

## Task Commits

| Task | Nombre                                                   | Commit     | Archivos             |
| ---- | -------------------------------------------------------- | ---------- | -------------------- |
| 1    | Las 3 closures de scope de `routes.ts` con ctx explícito | `f99549e1` | routes.ts            |
| 2    | Las queries directas de los handlers de `routes.ts`      | `7a8e4931` | routes.ts            |
| 3    | `coach-load-routes.ts` + lint de los dos archivos        | `c473ee3c` | coach-load-routes.ts |

Los tres commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `162a81cf` del plan 10). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Accomplishments

- **Las 3 closures de scope con `ctx` PRIMERO.** Eran el punto ciego que nombra el objetivo del plan: viven en el cuerpo del plugin, no en un handler, así que **no tienen `request` a mano** y no había de dónde sacarles el gimnasio. Ahora cada uno de sus 4 call sites le pasa el ctx que ya resolvió, y el compilador obligó a mirarlos todos.
- **El contrato D-09 queda garantizado desde el guardián del módulo, no desde el service.** `enforceCajaScope` decide el 404 de "caja de otro país"; con el filtro adentro el orden pasa a ser **tenant → país**: la caja de otro gimnasio **no llega ni a la comparación de país**, sale por la rama "no encontrada" con el mismo 404. **Cero `code: 403` nuevos** (`git diff | grep -c "^+.*code: 403"` = 0) — un 403 acá distinguiría "existe pero no es tuya" de "no existe", que es justo lo que este guard no puede filtrar.
- **`enforceRowScope` filtra `financial_transactions` antes de derivar la caja.** Es el guard de las dos rutas de anulación (`/movements/:id/void` y `/expenses/:id/void`): sin filtro, la fila ajena resolvía su `cash_register_id` y de ahí en más el guard razonaba sobre una caja de otro gimnasio.
- **El guard de sede del `POST /transactions` (T-172-11-03).** La sede **llega del body**. Sin el gimnasio en el filtro, una sede ajena del mismo país pasaba el chequeo de país y el cobro nacía imputado contra ella. Es la superficie más expuesta de `routes.ts`.
- **El guard de país del `POST /transactions/:id/void`**, con las **dos** tablas del join nombrando el gimnasio.
- **La PoS del profe cerrada en sus 4 resoluciones (T-172-11-02).** El coach es el rol **menos privilegiado** con acceso a plata, así que es el borde más barato de atacar: `resolveUserBranchId` (socio → sede), el fallback "Templo Online", `resolveRenewCurrency` (suscripción) y `resolvePlanCurrency` (plan del alta). Los tres ids que alimentan estas queries —`userId`, `memberId`, `planId`— llegan del body o de los params.
- **El fallback "Templo Online" también filtra**, y es el hallazgo del plan (ver decisión 2): es la única query del módulo que busca **por nombre y no por id**.
- **`GET /autocompletar` hoistea su ctx.** Era el único handler de `coach-load` que todavía resolvía el gimnasio inline, en el `getRow` de más abajo — el resolver de sede lo necesita antes.
- **7 entradas de allowlist muertas y probadas con el lint**, y con ellas **los dos archivos de rutas del módulo enteros fuera de la allowlist**.
- **`test/finance/coach-load.test.ts` 48/48 verde** (134 s) contra MySQL real, **sin tocar una expectativa** — incluidos los 6 escenarios cross-sede de CR-CAJA (profe de sede A cobrándole a socio de sede B), que son justo los que el filtro nuevo podía haber roto.

## Verificación

| Criterio                                                                      | Resultado                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                                      | ✅ **exit 0** (después de cada task)                    |
| `pnpm exec vitest run test/finance/coach-load.test.ts`                        | ✅ **48/48**, 134 s                                     |
| `lint-tenant --allowlist=/tmp/allowlist-172-11.json` (459 entradas)           | ✅ **exit 0**, `DISCREPANCIAS: 0`                       |
| `unlistedViolations` con la allowlist filtrada                                | ✅ **0** — no se introdujo un acceso violador nuevo     |
| `staleNoLongerViolating` / `staleMissingFile` / `strictWithAllowlist`         | ✅ **0 / 0 / 0**                                        |
| Rango de las closures: `grep -c "tenantWhere("`                               | **3** (pedía ≥ 3)                                       |
| Rango de las closures: `grep -c "code: 403"`                                  | **0** (pedía 0)                                         |
| `grep -c "tenantWhere(schema.branches" routes.ts`                             | **3** (pedía ≥ 3)                                       |
| `grep -c "tenantWhere(schema.financialTransactions" routes.ts`                | **2** (pedía ≥ 2)                                       |
| `grep -c "tenantWhere(schema.cashRegisters" routes.ts` (must_have `contains`) | **1**                                                   |
| Cada `await fastify.db` de `routes.ts` con `tenantWhere`                      | ✅ **4 de 4** (ventana de 20 líneas — ver desviación 1) |
| Cada `await fastify.db` de `coach-load-routes.ts` con `tenantWhere`           | ✅ **5 de 5**                                           |
| `grep -c "tenantWhere(schema.users" coach-load-routes.ts`                     | **1** (pedía ≥ 1)                                       |
| `grep -c "tenantWhere(schema.subscriptions" coach-load-routes.ts`             | **1** (el plan pedía ≥ 3 — ver desviación 2)            |
| `grep -cE "resolveCajaCountry\(\s*ctx" routes.ts` (key_link del plan)         | **1** — el único call site de la closure                |
| `git diff \| grep -c "^+.*code: 403"`                                         | **0** — ningún 403 nuevo                                |
| `git diff \| grep -cE "^[-+].*throw new"`                                     | **0** — no se tocó un solo error                        |
| `grep -nE "tenantId!\|tenantId\s*\?\?\|\?\? 1"` en los 2 archivos             | sin líneas                                              |
| `prettier --check` sobre los 2 archivos                                       | ✅                                                      |
| Inventario de exenciones `tenant-safe`                                        | **10** — el mismo de 172-01, ninguna nueva              |
| `git status --porcelain` en `et-172`                                          | vacío                                                   |
| `git status --porcelain el-templo-api/tenant-lint-allowlist.json`             | vacío (dueño único = 172-21)                            |
| Archivos de test modificados                                                  | **ninguno** (no cambia ninguna firma exportada)         |

### 📌 Entradas de allowlist que paga este plan: **7**

```
el-templo-api/src/modules/finance/routes.ts             | cash_registers          ← strict
el-templo-api/src/modules/finance/routes.ts             | financial_transactions  ← strict
el-templo-api/src/modules/finance/routes.ts             | branches                ← colateral (D-06)
el-templo-api/src/modules/finance/coach-load-routes.ts  | branches                ← colateral (D-06)
el-templo-api/src/modules/finance/coach-load-routes.ts  | subscription_plans      ← colateral (D-06)
el-templo-api/src/modules/finance/coach-load-routes.ts  | subscriptions           ← colateral (D-06)
el-templo-api/src/modules/finance/coach-load-routes.ts  | users                   ← colateral (D-06)
```

**2 strict + 5 colaterales.** Con las 7, **los DOS archivos de rutas de `finance` quedan sin una sola entrada viva**. De los 6 archivos del módulo, el único que conserva entradas es **`transaction-service.ts` (9)** — todas del plan 172-12, el de las lecturas. Cuando ese plan cierre, `finance` no tiene una sola entrada de allowlist y D-06 se puede medir.

**Cuenta acumulada para el plan 172-21: 9 (02) + 4 (03) + 6 (04) + 2 (06) + 0 (07) + 3 (08) + 9 (09) + 2 (10) + 7 (11) = 42 entradas a borrar de `tenant-lint-allowlist.json`.** La evidencia ejecutable vigente pasa a ser **`/tmp/allowlist-172-11.json` (459 entradas)**, derivada de `/tmp/allowlist-172-10.json` quitándole estas 7.

## Decisions Made

### 1. El `tenantWhere` de `branches` en el `leftJoin` de `resolveCajaCountry` va en el ON

El `<action>` del Task 1 pide `tenantWhere` "como primer término en las queries sobre `schema.cashRegisters`, `schema.financialTransactions` y `schema.branches`". Aplicado literal al `where`, ese filtro **convierte el left join en inner** y la caja **sin sede** —la efectivo/banco central, que es exactamente el caso que la closure documenta como "country-agnostic → owner-only"— deja de resolver. `resolveCajaCountry` devolvería `undefined` y `enforceCajaScope` pasaría de "404 porque es branch-less" a "404 porque no existe": mismo código HTTP, pero por el camino equivocado y con la lógica de país cortocircuitada.

Es el hallazgo del 172-06, reaplicado por tercera vez en la fase (172-10 lo usó en `getById`). Queda con comentario en el código porque el próximo que lea ese `and(...)` dentro de un `.leftJoin()` va a querer "ordenarlo" moviéndolo al `where`.

El `innerJoin` del guard de país del `void` es el caso contrario y también está anotado: ahí el filtro **puede** ir en el ON sin cambiar la forma del resultado, porque un inner join ya descarta las filas sin match.

### 2. El fallback "Templo Online" también filtra — y es la query más peligrosa de las nueve

`resolveUserBranchId` tiene dos queries: el socio (`users.id = ?`) y, si el socio no tiene sede, la sede virtual **buscada por NOMBRE** (`branches.name = 'Templo Online'`). Las ocho queries restantes del plan buscan por **id**, y un id ajeno simplemente no matchea. Un **nombre** no: "Templo Online" es un nombre que **todo** gimnasio va a tener, así que sin filtro esta query devuelve la sede virtual del **primer gimnasio que la tenga por id**, no la del cobro. Con un solo tenant activo es invisible; con dos, el cobro de un socio sin sede nace en la sede virtual del vecino.

El plan la cubría por tabla (`schema.branches` está en su lista), pero vale escribir el matiz aparte: **una query que filtra por nombre y no por id es la que peor falla cuando se olvida el gimnasio**, porque no falla — devuelve la fila equivocada, silenciosamente.

### 3. Cero 403 nuevos, y el 404 se mantiene por construcción

El plan es explícito ("no agregar ningún 403 nuevo") y el código lo cumple por **omisión, no por un `if` nuevo**: las tres closures conservan sus ramas de "no encontrado" intactas y lo único que cambió es que la fila ajena ya no llega a ellas con datos. `git diff | grep -c "^+.*code: 403"` da **0** y `grep -cE "^[-+].*throw new"` da **0**.

### 4. Un solo `assertTenant` por handler — y dos etiquetas de 403 cambian de texto

Los 6 handlers tocados (`POST /transactions`, `POST /transactions/:id/void`, `POST /movements`, `POST /expenses`, los dos `/void` de movimientos y egresos, más `GET /autocompletar`) pasan a hoistear **un** `const ctx = assertTenant(...)` al tope del `try` y a reusarlo. Es la convención que fijó el 172-09 (decisión 1) y que el propio `coach-load-routes.ts` ya usaba en sus tres handlers de cobro.

**Consecuencia visible, chica y deliberada:** dos llamadas que resolvían su propio ctx con etiqueta propia ahora reusan la del handler, así que el **texto** del 403 `TENANT_UNRESOLVED` cambia:

- `finance.balances.for-transaction` → `finance.transactions.create`
- `finance.balances.autocompletar` → `coach-load.autocompletar`

La etiqueta sólo aparece dentro del mensaje (`No se pudo resolver el gimnasio (<etiqueta>)`), no en el `code`, que sigue siendo `TENANT_UNRESOLVED`. Nombrar el handler y no el método interno es mejor para debuggear: dice qué ruta falló, que es lo que va a estar en el ticket.

### 5. Los rangos de línea del plan se re-derivaron por nombre

`L126-197`, `L290-420`, `L249-460` y `L974-1003` salen del PATTERNS, derivado de `origin/master`. `coach-load-routes.ts` fue **reescrito por CR-CAJA** después (aparecieron `resolveUserBranchId`/`resolveMemberBranchId`, el `/caja-efectivo` con `branchId` de query, y desapareció `resolveSuggestedCaja`), y `routes.ts` ya se había movido con los planes 08-10. Todos los rangos se re-derivaron con `grep -n` sobre el nombre de la closure o del handler antes de medir — la regla que el 172-10 dejó escrita (su decisión 4).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Criterio del plan] El criterio `grep -A8` da 1 de 4, y no porque falte un filtro**

- **Found during:** Task 2
- **Issue:** el criterio pedía que "cada línea con `fastify.db` tenga un `tenantWhere(` dentro de las 8 líneas siguientes". Medido literal da **1 de 4**. La causa no es un acceso sin filtro: son **los comentarios que documentan el propio filtro** los que empujan el `tenantWhere` más allá de la línea 8 (el bloque de 3 líneas que explica por qué el ON y no el WHERE, el de T-172-11-03 sobre la sede que llega del body, el del inner join). El criterio se rompe justo cuando el código está mejor documentado.
- **Fix:** ninguno en el código — **aflojar el filtro para satisfacer el grep habría sido exactamente el error**. Se re-midió con `grep -n -A20`, que muestra los 4 accesos de `routes.ts` y los 5 de `coach-load-routes.ts` con su `tenantWhere` a la vista, uno por uno. El criterio que sí manda —el lint sale exit 0 con las 7 entradas borradas— se cumple.
- **Files modified:** ninguno

**2. [Rule 1 - Conteo del plan] `tenantWhere(schema.subscriptions` da 1, no ≥ 3**

- **Found during:** Task 3
- **Issue:** el criterio pedía **≥ 3**. El archivo tiene **una sola** query sobre `subscriptions` (`resolveRenewCurrency`), y `grep` no cuenta de más: `tenantWhere(schema.subscriptionPlans` **no** matchea el patrón `tenantWhere(schema.subscriptions` (`subscriptionPlans` no tiene la `s` final). El número del plan sale del inventario AST-lite del PATTERNS ("7 accesos a subscriptions"), que cuenta **apariciones de `schema.X`** — y esa única query nombra la tabla 6 veces (`currency`, `userId`, `status` ×2 en el `or`, el `CASE` del `orderBy`, `createdAt`).
- **Fix:** ninguno en el código. Es la **quinta** vez en la fase que la misma sobrestimación aparece (172-09 ×2, 172-10 ×2). La regla para los planes 172-12 en adelante y para las fases 173-175: **los conteos del PATTERNS son referencias, no queries — se dividen por 2 o 3 antes de escribirlos como criterio.**
- **Files modified:** ninguno

**3. [Rule 2 - Seguridad] El filtro de `branches` va en el ON del `leftJoin`, no en el WHERE**

- **Found during:** Task 1 — ver decisión 1. Aplicar el `<action>` literal habría cambiado el resultado del guard para la caja sin sede. Es una corrección de forma que además preserva el comportamiento.
- **Files modified:** `src/modules/finance/routes.ts`
- **Committed in:** `f99549e1`

**4. [Rule 3 - Bloqueante] `GET /autocompletar` no tenía un ctx que reusar**

- **Found during:** Task 3
- **Issue:** el `<action>` dice "reusar el `const ctx = assertTenant(...)` de cada handler; no resolver el ctx dos veces en el mismo handler". `GET /autocompletar/:userId` **no tenía uno**: resolvía el gimnasio inline dentro del `getRow` de más abajo, y `resolveMemberBranchId` —que ahora pide ctx— corre **antes** de eso. Sin hoistear, no había ctx que pasarle.
- **Fix:** el `assertTenant` pasa a ser la primera sentencia del `try` (el plan lo previó: "si un handler todavía no lo resuelve, agregar `const ctx = ...`") y el inline de abajo se borró. Queda **dentro** del `try` para que el 403 salga por `handleServiceError` con el formato del módulo.
- **Files modified:** `src/modules/finance/coach-load-routes.ts`
- **Committed in:** `c473ee3c`

**5. [Rule 1 - Conteo del plan] `routes.ts` tiene 4 accesos directos, no los ~16 que sugieren los `<read_first>`**

- **Found during:** Task 2
- **Issue:** el `<read_first>` habla de "POST /transactions con **5** accesos a `branches`" y "POST /transactions/:id/void con **4** a `financial_transactions` y **4** a `branches`". Los reales son **una** query de `branches` en el create y **una** query (con join) en el void. Misma causa que la desviación 2: el PATTERNS cuenta referencias `schema.X`, y una sola query las nombra 3-5 veces entre el `select`, el `from`, el `join` y el `where`.
- **Fix:** ninguno en el código. El inventario real se obtuvo con `grep -n "fastify.db"`, que en este archivo devuelve **4** accesos (2 en las closures + 2 en handlers) — todos migrados.
- **Files modified:** ninguno

**6. [Rule 1 - Bug del plan] Los rangos de línea eran de otra versión de los archivos**

- **Found during:** Tasks 1 y 3 — ver decisión 5. `coach-load-routes.ts` fue reescrito por CR-CAJA después del PATTERNS: `L974-1003` (el bloque "ya migrado") vive hoy en `L1002-1049`, y las closures que el plan describe en `L249-460` arrancan en `L286`. Ningún `sed -n 'A,Bp'` del plan apunta a lo que dice apuntar.
- **Fix:** ninguno en el código; todo se re-derivó por nombre antes de medir.
- **Files modified:** ninguno

---

**Total deviations:** 6 auto-fixed (4 × Rule 1, 1 × Rule 2, 1 × Rule 3). La #4 era bloqueante de verdad (sin ella el Task 3 no compila); la #3 evita un bug funcional que el `<action>` inducía; la #1 es la más importante para los planes siguientes porque **un criterio de grep se rompió por documentar bien el código, y aflojar el código para satisfacerlo habría sido el error**; las #2, #5 y #6 corrigen conteos y rangos del plan sin tocar una línea.

## Issues Encountered

**El lint sigue ROJO contra la allowlist REAL en esta rama, ahora por 42 entradas.** Quien corra `pnpm lint:tenant` sin `--allowlist` en `feat/172-adopcion-finance` ve `DISCREPANCIAS: 42`, todas `staleNoLongerViolating` — **42 entradas pidiendo que las borren**, no una regresión. El dueño único del archivo es el plan 172-21. **Si la rama se mergeara a `staging` antes de ese plan, CI queda rojo por esto.**

**Un cambio de precedencia de errores, chico y deliberado.** En los 6 handlers tocados el `assertTenant` se ejecuta **antes** del guard de país/sede (antes corría después, dentro de la llamada al service). Para un request cuyo gimnasio **no resuelve** y que además pide un recurso cross-country, la respuesta pasa de **404** a **403 `TENANT_UNRESOLVED`**. En la práctica es inalcanzable —`scope.tenantId` sólo puede ser `null` con la FK `fk_users_tenant` rota— pero queda escrito porque es la única diferencia observable de comportamiento del plan, junto con las dos etiquetas de la decisión 4.

**Ningún archivo de test se tocó.** Este plan no cambia una sola firma **exportada**: las 7 closures que ganaron un parámetro viven dentro del cuerpo de su plugin y no son visibles desde `test/`. Un `grep -rn` de sus nombres sobre `test/` no devuelve nada, así que tampoco aplicaba el chequeo de mocks posicionales que el 172-09 dejó como advertencia (su desviación 5b) ni el `tsconfig.test-check.json` de esa receta.

**`resolveCajaCountry` sigue sin filtrar para el owner**, y está bien: `enforceCajaScope` devuelve `null` antes de tocar la base cuando `isOwner`. El "owner" acá es el rol de **country-scope** (ve todos los países), no un permiso cross-tenant — todo lo que ese owner haga después pasa igual por los services, que ya filtran. Se anota para que nadie lea el `if (isOwner) return null;` como un bypass de tenancy.

**Riesgo residual que este plan NO cierra:** las ~90 queries de LECTURA de `transaction-service.ts` siguen sin `tenantWhere` (plan 172-12), con sus **9** entradas de allowlist vivas. Un actor del gimnasio A que llame a `GET /transactions` sigue viendo filas del B — el handler ya está migrado, el service todavía no.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas, no instala paquetes, no modifica un solo código de respuesta ni un solo `throw`.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-11-01 | ✅ el filtro de tenant entra ANTES de la decisión de país en las 3 closures (`cash_registers` + `branches` en `resolveCajaCountry`, `financial_transactions` en `enforceRowScope`); la respuesta sigue siendo **404**, sin 403 nuevos |
| T-172-11-02 | ✅ `tenantWhere` sobre `users`, `branches` (id **y** nombre), `subscriptions` y `subscription_plans`: el coach no puede autocompletar sede, moneda ni plan de un socio de otro gimnasio                                               |
| T-172-11-03 | ✅ `tenantWhere(schema.branches, ctx)` en el guard de sede del `POST /transactions`, donde el `branchId` llega del body                                                                                                               |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                                                          |

## Next Phase Readiness

**Listo para el 172-12** (lecturas de `transaction-service.ts`). Cinco cosas que los planes siguientes tienen que dar por sentadas:

1. **`finance/routes.ts` y `finance/coach-load-routes.ts` están CERRADOS** — closures y handlers, cero entradas de allowlist. Un plan que agregue una ruta o una closure a cualquiera de los dos tiene que pasarle el ctx o rompe el ratchet (y el lint lo va a reportar como `unlistedViolations`, rojo duro, no ratchet).
2. **Las 9 entradas restantes de `finance` son TODAS de `transaction-service.ts`** y todas del 172-12: `balances`, `cash_registers`, `cost_centers`, `financial_transactions`, `transaction_links`, `branches`, `subscription_plans`, `subscriptions`, `users`. Con esas 9, el módulo entero sale de la allowlist.
3. **El docblock de las L25-28 de `transaction-service.ts` sigue pendiente de reescritura** (issue heredado del 172-10). Le toca al 172-12.
4. **Los conteos del PATTERNS son referencias `schema.X`, no queries.** Quinta vez que muerde. Antes de escribir un criterio numérico: `grep -n "fastify.db"` o `grep -n "\.from(schema\."`, no el inventario.
5. **La allowlist acumula 42 entradas muertas** (9+4+6+2+0+3+9+2+7). El 172-21 borra las 42. Evidencia ejecutable: `/tmp/allowlist-172-11.json` (459 entradas).

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-11-SUMMARY.md`
- `FOUND` commits `f99549e1` (T1), `7a8e4931` (T2) y `c473ee3c` (T3) en `feat/172-adopcion-finance`
- `FOUND` los 2 archivos modificados en `git diff --stat 162a81cf..HEAD` (+154 / −29)
- `FOUND` `/tmp/allowlist-172-11.json` (459 entradas)
- `VERIFIED` `pnpm exec tsc --noEmit` exit 0 después de cada task
- `VERIFIED` `coach-load.test.ts` 48/48 contra MySQL real
- `VERIFIED` `lint-tenant --allowlist=/tmp/allowlist-172-11.json` exit 0, `DISCREPANCIAS: 0`, `unlistedViolations: 0`
- `VERIFIED` 4 de 4 accesos directos de `routes.ts` y 5 de 5 de `coach-load-routes.ts` con `tenantWhere`
- `VERIFIED` cero `code: 403` nuevos y cero `throw new` tocados en el diff
- `VERIFIED` `git status --porcelain` en `et-172` vacío y `tenant-lint-allowlist.json` sin modificar

**ADO-01 NO se marca completo**, misma convención que 172-01/02/03/04/06/07/08/09/10: el requisito exige `finance` migrado entero (services + sentinel + aislamiento verde). Este plan cierra **los dos archivos de rutas del módulo**; falta la mitad de lectura de `transaction-service.ts` (172-12) y los gates consolidados del final de la fase.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
