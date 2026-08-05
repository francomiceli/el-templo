---
phase: 172-adopci-n-1-piloto-finance
plan: 02
subsystem: analytics
tags: [tenancy, analytics, finance, lint-tenant, tenantWhere, assertTenant]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / assertTenant / TenantContext)"
  - phase: 170-sentinel-lint
    provides: "src/db/scripts/lint-tenant.ts y tenant-lint-allowlist.json (ratchet)"
  - plan: 172-01
    provides: "worktree et-172 sobre a6272df0, baseline verde, allowlist en 501 entradas"
provides:
  - "Los 4 services de analytics que leen tablas strict de finance filtran por tenant_id"
  - "6 call sites de analytics/routes.ts resuelven el gimnasio con assertTenant(request.scope, ...)"
  - "9 entradas de allowlist muertas y probadas con el lint contra /tmp/allowlist-172-02.json"
  - "inclusiveRangeConditions() en analytics/cohorts.ts (rango cerrado [from, to])"
affects: [172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El lint razona por STATEMENT: el statement que nombra la tabla strict tiene que nombrar el gimnasio"
    - "$dynamic() de Drizzle: el where puede encadenarse antes del join condicional y el SQL sale igual"
    - "Un tenantWhere por CADA tabla strict presente en un join (financial_transactions x transaction_links)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/src/modules/analytics/advanced-finance-service.ts
    - el-templo-api/src/modules/analytics/ltv-service.ts
    - el-templo-api/src/modules/analytics/ticket-service.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/analytics/cohorts.ts
    - el-templo-api/test/analytics/advanced-finance.test.ts
    - el-templo-api/test/analytics/ltv.test.ts
    - el-templo-api/test/analytics/ticket.test.ts
    - el-templo-api/test/analytics/especial-exclusion.test.ts
    - el-templo-api/test/finance/validation-regression.test.ts

key-decisions:
  - "El tenantWhere va en el statement de la QUERY, no en el array de condiciones: el lint mide por statement y poner el filtro en los dos lugares habria duplicado el WHERE"
  - "getMemberAnalytics tambien recibe ctx: el flag yaPago de getAttentionList lee financial_transactions con un EXISTS crudo, y sin el la entrada service.ts | financial_transactions no moria"
  - "La allowlist filtrada saca 9 entradas y no 6: scopear un statement paga la deuda de TODAS las tablas que ese statement joinea, y el ratchet razona por (archivo, tabla)"
  - "inclusiveRangeConditions vive en cohorts.ts, al lado de su gemelo semiabierto: el par >= / <= estaba repetido 5 veces y con la columna como parametro el gimnasio se nombra una sola vez por statement"

patterns-established:
  - "Un tenantWhere por tabla strict del statement, todos como primeros terminos del and(...)"
  - "En sql crudo, tenant_id = ${ctx.tenantId} PRIMERO en el WHERE de la subconsulta, antes de la correlacion"

requirements-completed: []

# Metrics
duration: 55min
completed: 2026-07-30
---

# Phase 172 Plan 02: Cirugía mínima de tenancy en analytics Summary

**Los cuatro services de analytics que suman plata (`service`, `advanced-finance`, `ltv`, `ticket`) filtran por `tenant_id` en las 24 consultas que tocan `financial_transactions`, `transaction_links` y `balances`, con el gimnasio resuelto por `assertTenant(request.scope, …)` en los 6 handlers — y el lint lo prueba con 9 entradas de allowlist menos.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-07-30
- **Tasks:** 2/2 (ambas `auto`)
- **Files modified:** 11 (6 de `src`, 5 de `test`)

## Task Commits

| Task | Nombre                                                   | Commit     | Archivos                                                                |
| ---- | -------------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| 1    | `analytics/service.ts` + `advanced-finance` scopeados    | `2733915e` | service.ts, advanced-finance-service.ts, routes.ts, cohorts.ts, 2 tests |
| 2    | `ltv` + `ticket` scopeados y lint verde sin sus entradas | `6fe25129` | ltv-service.ts, ticket-service.ts, routes.ts, 3 tests                   |

Los dos commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, base `a6272df0`). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Accomplishments

- **24 accesos a tablas strict, 0 violaciones.** El inventario del propio motor del lint (`lintTenantSources`) sobre los 4 archivos daba **36 accesos violadores** al arrancar; ahora los 24 que quedan (los otros 12 desaparecieron al mover fragmentos de fecha a helpers con la columna como parámetro) están **todos** marcados como cumplidores.
- **`tenantWhere` como primer término de todo `and(...)`**: 4 en `service.ts` sobre `financial_transactions` + 1 sobre `balances`, 1 en `advanced-finance-service.ts`, 1 en `ltv-service.ts`, 2 + 1 en `ticket-service.ts` (`financial_transactions` ×2 y `transaction_links` ×1).
- **Dos `sql` crudos scopeados a mano** con la convención lockeada (`shared/tenant.ts:20`): el `EXISTS` de `yaPago` en `getAttentionList` (`ft.tenant_id`) y el `NOT EXISTS` del universo de ticket (`tl.tenant_id`). En los dos el filtro va **primero**, antes de la correlación.
- **6 `assertTenant(request.scope, "…")`** en `analytics/routes.ts`: `analytics.kpis`, `analytics.members`, `analytics.financial`, `analytics.advanced-finance`, `analytics.ticket`, `analytics.ltv`. Cero `tenantId!` y cero default numérico en los archivos tocados.
- **Lint verde contra la allowlist filtrada**: `DISCREPANCIAS: 0` con `/tmp/allowlist-172-02.json` (492 entradas, 9 menos que las 501 del baseline). `tenant-lint-allowlist.json` **no se tocó** (`git status --porcelain` sobre ese archivo devuelve vacío).

## Verificación

| Criterio                                                              | Resultado                                  |
| --------------------------------------------------------------------- | ------------------------------------------ |
| `pnpm exec tsc --noEmit`                                              | ✅ exit 0                                  |
| `lint-tenant --allowlist=/tmp/allowlist-172-02.json`                  | ✅ exit 0, `DISCREPANCIAS: 0`              |
| `grep -c "tenantWhere(schema.financialTransactions" service.ts`       | 4 (pedía ≥ 4)                              |
| `grep -c "tenantWhere(schema.balances" service.ts`                    | 1 (pedía ≥ 1)                              |
| `grep -c "tenantWhere(schema.financialTransactions" advanced-finance` | 1 (pedía ≥ 1)                              |
| `grep -c "tenantWhere(schema.financialTransactions" ltv-service.ts`   | 1 (pedía ≥ 1)                              |
| `grep -c "tenantWhere(schema.transactionLinks" ticket-service.ts`     | 1 (pedía ≥ 1)                              |
| `grep -c "assertTenant(request.scope" routes.ts`                      | 6 (pedía ≥ 5)                              |
| `grep -nE "tenantId!\|\?\? 1"` en los 5 archivos de `src`             | sin líneas                                 |
| `git status --porcelain el-templo-api/tenant-lint-allowlist.json`     | vacío                                      |
| `prettier --check` sobre los 11 archivos                              | ✅                                         |
| Entradas de `/tmp/allowlist-172-02.json`                              | 492 (**9** menos, no 6 — ver desviación 2) |

**No se corrió el suite de tests** (regla del proyecto: corren en CI; el plan sólo pide `tsc` + lint). Los 5 archivos de test tocados son cambios de firma mecánicos.

## Decisions Made

### 1. El `tenantWhere` va en el statement de la query, no en el arreglo de condiciones

El plan admitía las dos formas ("PRIMER término del `and(...)` **o** primer elemento del array de condiciones"). No son equivalentes, y el motivo importa para todos los planes que vienen:

**El lint mide por STATEMENT** (`lint-tenant.ts`, `enclosingStatement` + `isCompliantText`). Un `const conditions: SQL[] = [ …, sql\`${schema.financialTransactions.transactionDate} >= ${dateFrom}\` ]`es un statement que **nombra la tabla**, y el`const rows = await this.db.select(…).from(schema.financialTransactions)…`es **otro**. Poner el filtro sólo en el arreglo dejaba el segundo violando; ponerlo sólo en el`and(...)`dejaba violando el primero; ponerlo en los dos generaba`WHERE tenant_id = 1 AND tenant_id = 1`.

La salida elegida: **el gimnasio se nombra una sola vez, en el statement de la query**, y los fragmentos de fecha que interpolaban una columna de tabla strict se mudaron a helpers que reciben la columna **como parámetro** (`inclusiveRangeConditions` / `rangeConditions`, en `cohorts.ts`). Con eso el arreglo de condiciones deja de nombrar la tabla y no necesita nombrar el gimnasio.

### 2. `getMemberAnalytics` también recibe `ctx`

El plan nombraba `getKpis` y `getFinancialAnalytics`. El inventario mostró un tercer acceso a `financial_transactions` en `service.ts`, en la línea 555: el `EXISTS` crudo del flag **`yaPago`** de `getAttentionList`, que cuelga de `getMemberAnalytics` y no del bloque financiero. Sin scopearlo, la entrada `service.ts | financial_transactions` **no moría** y el Task 2 no podía dar verde. Es la trampa que el PATTERNS ya anticipaba en otro contexto: el criterio de terminado es la allowlist vacía, no la lista de métodos que uno se imaginó.

### 3. `universeCountByCurrency`: el `where` se encadena antes del join condicional

Ese método arma la query en tres statements (`select…from…$dynamic()`, el `if (needsBranchJoin) query = query.innerJoin(…)`, y el `await query.where(…)`). El que nombra `financial_transactions` es el **primero**, así que el filtro tenía que entrar ahí. Se movió el `.where(...)` junto al `.from(...)`, antes del `$dynamic()`.

Eso **no** es un detalle cosmético y por eso se verificó en vivo con `toSQL()` sobre un pool que no conecta: el SQL resultante conserva el `inner join branches …` y el `where (financial_transactions.tenant_id = ? and …)` en sus lugares. Drizzle ensambla desde la config, no desde el orden de encadenado.

### 4. `inclusiveRangeConditions` en `cohorts.ts`

`cohorts.ts` ya exportaba `rangeConditions` con borde superior **exclusivo** (`< to`), que es lo que usan las métricas de cohorte — y lo que `realPaymentsByMember` ya hacía a mano, así que ahí el reemplazo es literal. Pero `service.ts` (×4) y `cashTrend` usan el rango **cerrado** (`<= to`) del filtro financiero legacy, y confundirlos cambia la plata de un día entero. Se agregó el gemelo inclusivo, con el nombre diciendo cuál es cuál y un docblock que explica que conviven a propósito. De paso mata 5 copias del mismo par de fragmentos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueante] Las firmas nuevas rompían 5 archivos de test**

- **Found during:** Tasks 1 y 2
- **Issue:** `tsc` sólo mira `src/**` (`tsconfig.json`), así que el typecheck salía verde igual — pero 5 archivos de test invocan estos services **directamente** (`svc.getAdvancedFinance({})`, `svc.getTicket(RANGE)`, `ltvSvc.getLtv(filters)`, 22 call sites en total). Con `ctx` como primer parámetro, el objeto de filtros pasaba a ocupar el lugar del contexto y `filters` llegaba `undefined`: **rojo en CI**, no en local. Es exactamente el modo de falla que la regla "ctx PRIMERO" busca hacer visible, sólo que el compilador no mira los tests.
- **Fix:** un `const CTX: TenantContext = { tenantId: 1 }` por archivo, con docblock que dice de dónde sale el contexto en producción. El literal `1` es correcto y no es un hardcodeo frágil: `tenant_id` lleva **DEFAULT 1** (`src/db/schema/tenant-column.ts`), así que las filas que siembran los fixtures sin la columna caen en El Templo y las aserciones existentes siguen valiendo. Mismo idioma que `test/tv/tv-pairing-tenant.test.ts` y `test/tenancy/con-01-*`.
- **Files modified:** `test/analytics/advanced-finance.test.ts`, `test/analytics/ltv.test.ts`, `test/analytics/ticket.test.ts`, `test/analytics/especial-exclusion.test.ts`, `test/finance/validation-regression.test.ts`
- **Committed in:** `2733915e` (2 archivos) y `6fe25129` (3 archivos)

**2. [Rule 3 - Bloqueante] La allowlist filtrada tiene 9 entradas menos, no 6**

- **Found during:** Task 2
- **Issue:** El criterio del plan pedía **exactamente 6** entradas menos. Con esas 6, el lint salió **rojo** con `DISCREPANCIAS: 3` — no por violaciones (`unlistedViolations: 0`) sino por `staleNoLongerViolating`: `ltv-service.ts | users`, `ticket-service.ts | subscriptions` y `ticket-service.ts | subscription_plans`. **El ratchet razona por (archivo, tabla), no por statement**: cuando el `and(...)` de una query nombra el gimnasio, el lint marca como cumplidores **todos** los accesos de ese statement, incluidas las tablas joineadas. Esas 3 tenían su ÚNICO acceso adentro de una query que este plan scopeó, así que su deuda se pagó de arrastre.
- **Fix:** las 3 se sacan también de `/tmp/allowlist-172-02.json`, en una lista `COLATERALES` explícita y comentada (no por regla genérica, para que se vean). Resultado: **492 entradas, lint exit 0, `DISCREPANCIAS: 0`**.
- **Por qué NO es un atajo:** no se agregó ninguna exención `tenant-safe` (el inventario sigue en 10, las mismas de siempre, ninguna en `finance` ni en `analytics`) ni se tocó la allowlist real. Es deuda pagada de más, no perdonada.
- **📌 Consecuencia para el plan 172-21 (el del switch):** tiene que borrar **9** entradas de `tenant-lint-allowlist.json`, no 6. La lista exacta está más abajo.
- **Files modified:** ninguno versionado (el archivo vive en `/tmp`)

**3. [Rule 2 - DRY] `inclusiveRangeConditions` nuevo en `cohorts.ts`**

- **Found during:** Task 1
- **Issue:** `cohorts.ts` no está en el `files_modified` del plan. Sin el helper, cada uno de los 5 sitios necesitaba un spread ternario a mano dentro del `and(...)` para no dejar el fragmento de fecha en un statement sin gimnasio — 5 copias de la misma lógica, cada una con su oportunidad de escribir `<` donde va `<=`.
- **Fix:** un helper aditivo de 12 líneas al lado de su gemelo semiabierto. **No cambia el comportamiento de ningún caller existente** (`rangeConditions` queda intacto) y preserva byte a byte la semántica de los 5 sitios migrados: `>= from` y `<= to`, cada borde omitido si el argumento es `undefined`.
- **Files modified:** `el-templo-api/src/modules/analytics/cohorts.ts`
- **Committed in:** `2733915e`

---

**Total deviations:** 3 auto-fixed (2 × Rule 3, 1 × Rule 2). Ninguna agranda el alcance: las tres son consecuencia mecánica de scopear lo que el plan pidió scopear.

## Las 9 entradas que el plan 172-21 tiene que borrar

Todas con prefijo `el-templo-api/src/modules/analytics/`:

```
advanced-finance-service.ts | financial_transactions
ltv-service.ts              | financial_transactions
ltv-service.ts              | users                    ← colateral
service.ts                  | balances
service.ts                  | financial_transactions
ticket-service.ts           | financial_transactions
ticket-service.ts           | subscription_plans       ← colateral
ticket-service.ts           | subscriptions            ← colateral
ticket-service.ts           | transaction_links
```

**501 → 492.** Las entradas de `branches` de los 4 archivos **siguen vivas** y eso está bien: los joins contra `users` y `branches` no se tocan en esta fase (D-07), y cada uno de esos archivos conserva accesos a `branches` fuera de las queries migradas.

## Issues Encountered

**El lint queda ROJO contra la allowlist REAL hasta el plan 172-21.** Es la consecuencia buscada del diseño del plan (la allowlist tiene un solo dueño), pero conviene decirlo con todas las letras: si alguien corre `pnpm lint:tenant` sin `--allowlist` en esta rama, va a ver `DISCREPANCIAS: 9` (todas `staleNoLongerViolating`). **No es una regresión: son las 9 entradas de arriba pidiendo que las borren.** El rojo desaparece cuando 172-21 las borre; si el merge a `staging` ocurriera antes de ese plan, CI estaría rojo por este motivo.

**Sin corridas contra MySQL.** No se ejecutó ningún test (regla del proyecto + el plan sólo pide `tsc` y lint). Sigue en pie la bandera de 172-01 sobre `argon2` para el primer plan que corra tests reales.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos ni schemas, y las 6 rutas tocadas conservan sus guards (`requireAdminAnalytics` + `requireBranchAccess`) y su `handleServiceError` — `assertTenant` lanza `AppError(403, TENANT_UNRESOLVED)`, que ese handler ya sabe mapear.

Mitigaciones del `<threat_model>` del plan, verificadas:

| Threat      | Estado                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| T-172-02-01 | ✅ `tenantWhere` primero en las 4 queries agregadoras + los 2 `sql` crudos con `tenant_id` primero en su WHERE |
| T-172-02-02 | ✅ 6 `assertTenant(request.scope, …)`; grep de `tenantId!` y del default numérico sin resultados               |
| T-172-02-03 | ✅ `linkedCharges` lleva `tenantWhere` sobre `financial_transactions` **y** sobre `transaction_links`          |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                   |

## Next Phase Readiness

**Listo.** Tres cosas que los planes siguientes tienen que dar por sentadas:

1. **La receta que funciona** (y que conviene copiar en los 17 planes que quedan): el gimnasio se nombra en el **statement que nombra la tabla**, una sola vez, como primer término del `and(...)`. Si un fragmento `sql` de otro statement interpola una columna de tabla strict, la salida NO es duplicar el filtro: es que la columna viaje **como parámetro** a un helper.
2. **`reports/service.ts` va a chocar con esto en grande.** El PATTERNS ya lo marca (6 de sus 10 sitios son helpers privados que devuelven `SQL[]`). Lo que esta plan agrega al diagnóstico: esos helpers no sólo necesitan el `ctx`, necesitan que el `tenantWhere` termine en el statement de la QUERY, no en el del helper.
3. **La cuenta del ratchet baja de a más de lo que uno cuenta.** Cualquier plan que estime "esta migración mata N entradas" tiene que correr el lint para saber el número real: scopear un statement paga la deuda de todo lo que ese statement joinea.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-02-SUMMARY.md`
- `FOUND` commit `2733915e` (Task 1) y `6fe25129` (Task 2) en `feat/172-adopcion-finance`
- `FOUND` `/tmp/allowlist-172-02.json` (492 entradas)
- `FOUND` los 6 archivos de `src` y los 5 de `test` modificados en `git diff --stat a6272df0..HEAD` (11 archivos, +338/−98)
- `VERIFIED` `git status --porcelain` en `et-172` vacío y `tenant-lint-allowlist.json` sin modificar

**ADO-01 NO se marca completo**, misma convención que 172-01: el requisito exige `finance` migrado entero (services + sentinel + aislamiento verde) y lo citan 18 planes. Este plan migra un módulo **ajeno**, no `finance`.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
