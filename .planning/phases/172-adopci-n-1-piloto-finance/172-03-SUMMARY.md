---
phase: 172-adopci-n-1-piloto-finance
plan: 03
subsystem: reports
tags:
  [
    tenancy,
    reports,
    deudas,
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
    provides: "el hallazgo de que el lint razona por STATEMENT y que la columna tiene que viajar como parametro"
provides:
  - "Los 11 accesos de reports/service.ts a las 4 tablas strict filtran por tenant_id"
  - "buildOutstandingScope(ctx): el patron 'columna como parametro' documentado como plantilla para 173-175"
  - "6 call sites de reports/routes.ts resuelven el gimnasio con assertTenant(request.scope, ...)"
  - "4 entradas de allowlist muertas y probadas con el lint contra /tmp/allowlist-172-03.json"
affects: [172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Helper que devuelve fragmentos SQL: la COLUMNA viaja por parametro, el gimnasio se nombra una sola vez"
    - "tenantWhere de tabla LEFT JOINeada va en el ON, jamas en el WHERE (en el WHERE el LEFT se vuelve INNER)"
    - "Subconsulta con FROM propio: el filtro va ADENTRO, el WHERE externo no la alcanza"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/routes.ts

key-decisions:
  - "El filtro de balances vive en las conditions (primer termino del WHERE) y el de las tablas LEFT JOINeadas en el ON: cada tabla strict se nombra una sola vez, sin predicados duplicados"
  - "Los 4 helpers de fragmentos NO reciben ctx sino las columnas: recibir ctx no habria hecho verde al lint porque cada conds.push es su propio statement"
  - "buildDebtOriginTxSubquery SI recibe ctx: es el unico helper que arma una subconsulta con FROM propio, donde el filtro tiene que ir adentro"
  - "El sql crudo con alias fx esta en getTrialConversionReport, no en getExpiredMembers: getExpiredMembers no toca ninguna tabla strict y queda intacto por D-07"

patterns-established:
  - "buildOutstandingScope: un solo statement nombra las tablas strict del bloque y estampa tenantWhere; los helpers reciben cols.*"
  - "Cross-tenant en un PATCH = 404 por SELECT scopeado previo, nunca 403 (no filtra existencia)"

requirements-completed: []

# Metrics
duration: 13min
completed: 2026-07-30
---

# Phase 172 Plan 03: `reports/service.ts` scopeado por gimnasio Summary

**Los tres reportes de plata de `reports` (historial de cobros, Deudas y conversión de pruebas) y la gestión de deuda filtran por `tenant_id` en los 11 accesos a `financial_transactions`, `transaction_links`, `balances` y `debt_management` — incluidos los seis helpers privados que devuelven fragmentos `SQL` — con el gimnasio entrando por `assertTenant` en los 6 handlers, y con el patrón "la columna viaja como parámetro" escrito como plantilla para las fases 173-175.**

## Performance

- **Duration:** ~13 min (20:46Z → 20:59Z)
- **Completed:** 2026-07-30
- **Tasks:** 2/2 (ambas `auto`)
- **Files modified:** 2 (`reports/service.ts`, `reports/routes.ts`) — +235 / −79

## Task Commits

| Task | Nombre                                                         | Commit     | Archivos              |
| ---- | -------------------------------------------------------------- | ---------- | --------------------- |
| 1    | Reporte de Deudas: helpers de fragmentos + 4 queries + 2 rutas | `472fc7c0` | service.ts, routes.ts |
| 2    | Historial de cobros, conversión, gestión de deuda + 4 rutas    | `954f0235` | service.ts, routes.ts |

Los dos commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `6fe25129` del plan 02). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## El problema que este plan tenía que resolver, y cómo se resolvió

El PATTERNS marcó a `reports/service.ts` como "el archivo más difícil": seis de sus sitios no hacen la query, **devuelven pedazos de SQL** que se componen en otra. La receta obvia —y la que el plan escribió— era "el `ctx` entra al helper y el filtro se escribe DENTRO del fragmento devuelto". **Esa receta no cierra**, y el motivo importa para las 17 migraciones que faltan:

**El lint razona por STATEMENT** (hallazgo del plan 02). En `buildOutstandingBaseConds` cada `conds.push(...)` con un fragmento de fecha sobre `balances.created_at` es un statement propio. Poner `tenantWhere(schema.balances, ctx)` como primer elemento del array **no vuelve cumplidores a los otros nueve pushes**: cada uno sigue nombrando `balances` sin nombrar el gimnasio. Y peor: `buildOutstandingOrderBy` devuelve **fragmentos de ORDER BY**, donde un predicado de tenant no tiene ni dónde ir — un `ORDER BY balances.tenant_id = 1` no es una salida, es una mentira.

La salida real es la que el plan 02 dejó escrita: **la columna viaja como parámetro**. Se agregó `buildOutstandingScope(ctx)`, el **único** statement del bloque que nombra `balances` y `debt_management`, y que estampa el `tenantWhere`:

```ts
private buildOutstandingScope(ctx: TenantContext) {
  return {
    tenantFilter: tenantWhere(schema.balances, ctx),
    amount: schema.balances.amount,
    id: schema.balances.id,
    currency: schema.balances.currency,
    createdAt: schema.balances.createdAt,
    dmStatus: schema.debtManagement.status,
    dmPromisedPaymentDate: schema.debtManagement.promisedPaymentDate,
  };
}
```

Los cuatro helpers de fragmentos (`buildOutstandingBaseConds`, `buildOutstandingStatusConds`, `buildOutstandingOrderBy`, `effectiveDebtStatusSQL`) reciben ese objeto y arman todo con `cols.*`, sin importar el schema. Consecuencias, todas buscadas:

1. **El filtro de gimnasio existe UNA vez** — como primer elemento de `baseConds`, o sea primer término del WHERE de las 4 queries del reporte. Cero `tenant_id = 1 AND … AND tenant_id = 1`.
2. **No hay forma de escribir un fragmento nuevo que se olvide del filtro**, porque las columnas de las tablas strict no están a mano adentro de los helpers: hay que pedirlas al scope, y el scope viene con el filtro puesto.
3. El docblock de 25 líneas arriba de `buildOutstandingScope` explica el problema, la trampa del statement y la salida. **Es la plantilla que copian las fases 173-175**, que es lo que este plan tenía que producir además del código.

**El único helper que SÍ recibe `ctx` y estampa el filtro adentro es `buildDebtOriginTxSubquery`** — y es el caso donde eso es obligatorio, no opcional: arma una **subconsulta con su propio FROM/JOIN**, así que el WHERE del SELECT externo no alcanza a sus filas. Sin el filtro adentro, un `debt_balance` de otro gimnasio con el mismo `targetId` podía aportar el motivo/nota que se muestra en el tooltip de la deuda.

**El filtro de las tablas LEFT JOINeadas va en el `ON`, jamás en el `WHERE`.** No es cosmético: `debt_management` se LEFT JOINea porque la mayoría de las deudas **no tienen fila de gestión**. Un `and(tenantWhere(schema.debtManagement, ctx), …)` en el WHERE evalúa `NULL = 1` → falso para esas filas y convierte el LEFT en INNER, **borrando del reporte todas las deudas nunca gestionadas** — el caso mayoritario. Lo mismo con el `financial_transactions` del origen del `debt_balance`. Queda escrito en el código, no solo acá.

## Verificación

| Criterio                                                          | Resultado                                  |
| ----------------------------------------------------------------- | ------------------------------------------ |
| `pnpm exec tsc --noEmit`                                          | ✅ exit 0                                  |
| `lint-tenant --allowlist=/tmp/allowlist-172-03.json`              | ✅ exit 0, `DISCREPANCIAS: 0`              |
| Violaciones sobre tablas strict en `reports/` (motor del lint)    | ✅ **0** (eran 36 accesos violadores)      |
| `grep -c "tenantValues(ctx" service.ts`                           | 1 (pedía ≥ 1)                              |
| `grep -c "tenantWhere(schema.debtManagement" service.ts`          | 5 (pedía ≥ 1)                              |
| `grep -c "tenantWhere(schema.balances" service.ts`                | 2 (el plan pedía ≥ 4 — ver desviación 1)   |
| `grep -c "tenantWhere(schema.financialTransactions" service.ts`   | 3                                          |
| `grep -c "tenantWhere(schema.transactionLinks" service.ts`        | 2                                          |
| `grep -c "ctx.tenantId" service.ts`                               | 3 (pedía ≥ 1) — los 3 `sql` crudos         |
| `grep -c "assertTenant(request.scope" routes.ts`                  | 6 (pedía ≥ 6)                              |
| `grep -nE "tenantId!\|tenantId\s*\?\?"` en los 2 archivos         | sin líneas                                 |
| `git status --porcelain el-templo-api/tenant-lint-allowlist.json` | vacío (dueño único = 172-21)               |
| `prettier --check` sobre los 2 archivos                           | ✅                                         |
| Inventario de exenciones `tenant-safe`                            | **10** — el mismo de 172-01, ninguna nueva |
| `git status --porcelain` en `et-172`                              | vacío                                      |

**No se corrió el suite de tests** (regla del proyecto: corren en CI). Ningún archivo de `test/` invoca los métodos migrados — se verificó por grep sobre `src` y `test`, y los únicos call sites son los 6 de `reports/routes.ts`. A diferencia del plan 02, acá **no hubo que tocar tests**.

### 📌 Entradas de allowlist que paga este plan: **4** (sin colaterales)

Criterio (archivo, tabla), todas con prefijo `el-templo-api/src/modules/`:

```
reports/service.ts | balances
reports/service.ts | debt_management
reports/service.ts | financial_transactions
reports/service.ts | transaction_links
```

**Cero colaterales**, a diferencia del plan 02 (que pagó 3 de arrastre). El motivo es concreto y conviene entenderlo para estimar los planes que faltan: en `reports/service.ts` las tablas no-strict (`users`, `subscriptions`, `branches`, `subscription_plans`, `attendance`, `bookings`, `schedules`, `activities`, `class_coach_assignments`) **conservan accesos violadores en otras partes del archivo** —los reportes de acceso, vencimientos, inactivos y sesiones de prueba, que este plan no toca por D-07— así que sus entradas siguen vivas y correctas. Se verificó con el lint, no por estimación.

**Cuenta acumulada para el plan 172-21 (el del switch): 9 (172-02) + 4 (172-03) = 13 entradas a borrar de `tenant-lint-allowlist.json`.** El archivo `/tmp/allowlist-172-03.json` (488 entradas, 501 − 13) es la evidencia ejecutable: el lint sale verde contra él.

## Decisions Made

### 1. El filtro de `balances` en las conditions, el de las joineadas en el ON

Las 4 queries del reporte de Deudas nombran `schema.balances` en su `.from()`, así que **cada una necesita un marcador de cumplimiento en su propio statement**. Había dos formas:

- **(a)** agregar `tenantWhere(schema.balances, ctx)` a cada query, además del que ya viaja en `baseConds` → predicado duplicado en el SQL de las 4;
- **(b)** que el marcador de cada query sea el `tenantWhere` **real y necesario** de la tabla LEFT JOINeada (`debt_management`, y también `financial_transactions` en `selectOutstandingRows`).

Se eligió **(b)**: los dos filtros son reales, ninguno sobra, y el SQL final no tiene un solo predicado repetido. El costo es que `grep -c "tenantWhere(schema.balances"` da 2 y no 4 — ver desviación 1.

### 2. `getExpiredMembers` NO se tocó

El plan pedía scopearlo y ubicaba ahí el `sql` crudo del alias `fx`. **Está mal ubicado**: `getExpiredMembers` (hoy L1420-1529) consulta `subscriptions`, `users`, `branches` y `subscription_plans` y **no toca ninguna de las 6 tablas strict**. D-07 es explícito en que esta fase migra SOLO las tablas de `finance`, así que tocarlo habría sido scope creep sobre `subscriptions` — justo el archivo que la fase 172 migra en otro plan. El alias `fx` vive en `getTrialConversionReport`, que sí fue migrado (ver desviación 2).

### 3. Los filtros opcionales de `buildChargeConditions` se mudaron al array literal

`filters.dateFrom` / `dateTo` / `paymentMethod` se agregaban con `conditions.push(...)` referenciando `financial_transactions` — tres statements sin gimnasio. Se movieron al mismo array literal donde vive `tenantWhere(schema.financialTransactions, ctx)`, con spread condicional. **El orden dentro del `AND` cambia** (las de fecha suben antes que las de sucursal/país) y eso es semánticamente irrelevante: `AND` es conmutativo y los tres predicados que se mueven son sobre columnas distintas. Los `push` que quedan son de `users` y `branches`, que no son tablas strict.

### 4. Cross-tenant en el PATCH de gestión de deuda: 404, no 403

`updateDebtManagement` lee la deuda antes de escribir. Con el `tenantWhere` puesto, una `balanceId` de otro gimnasio **no matchea y cae en el `NotFoundError` que ya existía** — 404, sin filtrar existencia. Es D-09 saliendo gratis, el mismo idioma que `enforceCajaScope` en `finance/routes.ts:146-165`. Se dejó escrito en un comentario para que nadie lo "corrija" a 403 más adelante.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueante] Los helpers de fragmentos reciben las COLUMNAS, no el `ctx`**

- **Found during:** Task 1
- **Issue:** El plan (y su `must_haves.truths`) pedía que los 6 helpers privados recibieran `ctx` y estamparan el filtro dentro del fragmento devuelto. Para 4 de los 6 **eso no vuelve verde al lint y en un caso ni siquiera es expresable**: el lint mide por statement, así que poner el filtro como primer elemento del array devuelto deja violando a los ~10 `conds.push(...)` de `buildOutstandingBaseConds`; y `buildOutstandingOrderBy` devuelve fragmentos de **ORDER BY**, donde un predicado de tenant no tiene lugar. La alternativa —duplicar `tenantWhere` en cada push— produce `tenant_id = 1` diez veces en el mismo WHERE.
- **Fix:** `buildOutstandingScope(ctx)` como único statement que nombra las tablas strict del bloque (y que estampa el `tenantWhere`); los 4 helpers reciben ese objeto y usan `cols.*`. El **espíritu** del must-have se cumple —el filtro sale como primer elemento de `baseConds`, o sea primer término del WHERE— y el `ctx` sigue entrando por el borde. `buildDebtOriginTxSubquery` sí recibe `ctx` literal, porque es el único que arma una subconsulta con FROM propio.
- **Consecuencia medible:** `grep -c "tenantWhere(schema.balances"` da **2** y el criterio del plan pedía ≥ 4. El criterio era un proxy de la forma que el plan imaginó, no del resultado: el resultado real —**cero violaciones sobre tablas strict en todo el módulo**, medido con el motor del lint— es más fuerte que el proxy.
- **Files modified:** `el-templo-api/src/modules/reports/service.ts`
- **Committed in:** `472fc7c0`

**2. [Rule 1 - Bug del plan] El `sql` crudo del alias `fx` está en `getTrialConversionReport`, no en `getExpiredMembers`**

- **Found during:** Task 2
- **Issue:** El plan mandaba scopear `getExpiredMembers` y ubicaba ahí el `sql` crudo sobre `financial_transactions fx` (L1497 de la revisión base). Ese `sql` es el `SELECT SUM(fx.amount)` correlacionado del **revenue por lead** de `getTrialConversionReport`. `getExpiredMembers` no toca ninguna tabla strict. Ejecutar el plan al pie de la letra habría dejado **una fuga de plata cross-tenant viva** (el revenue de un lead sumaría cobros de todos los gimnasios) y habría agregado un `ctx` inútil a un método fuera de alcance.
- **Fix:** `getTrialConversionReport(ctx, filters)` con `WHERE fx.tenant_id = ${ctx.tenantId}` **primero** en la subconsulta (antes de la correlación, misma convención que el plan 02 usó en sus dos `sql` crudos). Su ruta (`GET /trial-conversion`) pasa `assertTenant(request.scope, "reports.trial-conversion")`. `getExpiredMembers` queda intacto.
- **Impacto en las etiquetas:** las 6 del plan incluían `reports.expired-members`; la real es `reports.trial-conversion`. El conteo de 6 `assertTenant` se cumple igual.
- **Files modified:** `el-templo-api/src/modules/reports/service.ts`, `routes.ts`
- **Committed in:** `954f0235`

**3. [Rule 3 - Bloqueante] `routes.ts` entra en el commit de la Task 1**

- **Found during:** Task 1
- **Issue:** El `<files>` de la Task 1 decía solo `service.ts`, pero su `<verify>` exige `tsc --noEmit` verde. Cambiar la firma de `getOutstandingBalances` y `exportOutstandingBalances` rompe sus 2 call sites de `routes.ts` en el acto: el commit de la Task 1 no compilaba sin ellos.
- **Fix:** los 2 call sites de Deudas (`reports.outstanding-balances`, `reports.export-outstanding`) van en el commit de la Task 1; los otros 4 en el de la Task 2. Es la consecuencia directa de la regla "el `ctx` va PRIMERO en la firma" (169-06): el compilador obliga a mirar cada call site en el mismo commit, que es exactamente para lo que está.
- **Files modified:** `el-templo-api/src/modules/reports/routes.ts`
- **Committed in:** `472fc7c0`

**4. [Rule 3 - Bloqueante] La allowlist filtrada saca 13 entradas, no 4**

- **Found during:** Task 2
- **Issue:** El criterio pedía que `/tmp/allowlist-172-03.json` tuviera "exactamente 4 entradas menos" que el archivo real. Con solo esas 4 el lint sale **rojo con `DISCREPANCIAS: 9`**: son las 9 entradas que el plan 02 ya dejó muertas en esta misma rama y que nadie borró todavía (el archivo real tiene un solo dueño, el plan 172-21).
- **Fix:** el filtro saca 9 + 4 = 13, con las dos listas **separadas y comentadas** en el script generador (`YA_PAGADAS_02` y `PAGA_03`) para que el número que este plan aporta al ratchet sea legible sin ambigüedad. Resultado: **488 entradas, lint exit 0, `DISCREPANCIAS: 0`**.
- **Por qué NO es un atajo:** no se agregó ninguna exención `tenant-safe` (el inventario sigue en **10**, las mismas de 172-01) ni se tocó el archivo real. Las 4 de este plan están probadas: con ellas puestas el lint diría `staleNoLongerViolating`, o sea "esta deuda ya está pagada, borrala".
- **Files modified:** ninguno versionado (el archivo vive en `/tmp`)

---

**Total deviations:** 4 auto-fixed (3 × Rule 3, 1 × Rule 1). Ninguna agranda el alcance; la #2 lo **achica** (un método menos del que el plan creía) y a la vez cierra una fuga que el plan no había visto.

## Issues Encountered

**El lint sigue ROJO contra la allowlist REAL en esta rama, y ahora por 13 entradas.** Es la consecuencia buscada del diseño de la fase (la allowlist tiene un dueño único), pero conviene decirlo con todas las letras: quien corra `pnpm lint:tenant` sin `--allowlist` en `feat/172-adopcion-finance` va a ver `DISCREPANCIAS: 13`, todas `staleNoLongerViolating`. **No es una regresión: son 13 entradas pidiendo que las borren.** Si el merge a `staging` ocurriera antes del plan 172-21, CI estaría rojo por este motivo.

**Sin corridas contra MySQL.** Sigue en pie la bandera de 172-01 sobre `argon2` para el primer plan que corra tests reales.

**Riesgo residual que este plan NO cierra (para la batería ISO-03 del plan 172-22):** el lint verifica **presencia**, no corrección — que un statement nombre el gimnasio no prueba que filtre la tabla correcta de un join. Los tres puntos de este archivo donde eso hay que probarlo en vivo con dos gimnasios son: (1) que el reporte de Deudas **siga mostrando las deudas sin fila de gestión** (si el `tenantWhere` de `debt_management` se hubiera colado al WHERE en vez del ON, desaparecerían y el lint no diría nada); (2) que el motivo/nota del tooltip de un `debt_balance` no venga del gimnasio equivocado (subconsulta `debt_origin_tx`); (3) que el revenue por lead de la conversión de pruebas no sume cobros ajenos.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos ni schemas, y las 6 rutas tocadas conservan sus guards (`CAJA_ROLES` a nivel plugin + `requireBranchAccess` donde aplica) y su `handleServiceError` — `assertTenant` lanza `AppError(403, TENANT_UNRESOLVED)`, que ese handler ya sabe mapear.

Mitigaciones del `<threat_model>` del plan, verificadas:

| Threat      | Estado                                                                                                                                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-03-01 | ✅ con la forma corregida: el fragmento no puede componerse sin filtro porque las columnas strict solo se consiguen vía `buildOutstandingScope`, que trae el `tenantWhere` puesto. Comentario-plantilla de 25 líneas escrito para 173-175. `buildDebtOriginTxSubquery` lleva el filtro adentro (subconsulta). |
| T-172-03-02 | ✅ `tenantValues(ctx, {...})` en el INSERT (tenant después del spread) + `tenantWhere` en la lectura previa y en la relectura: gestionar la deuda de otro gimnasio da 404 antes de escribir.                                                                                                                  |
| T-172-03-03 | ✅ `ft.tenant_id` y `tl.tenant_id` en el `sql` crudo del historial de cobros; `fx.tenant_id` **primero** en el WHERE de la subconsulta de conversión (el sitio real, ver desviación 2).                                                                                                                       |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete.                                                                                                                                                                                                                                                                 |

## Next Phase Readiness

**Listo.** Cuatro cosas que los planes siguientes tienen que dar por sentadas:

1. **La receta para helpers que devuelven `SQL` está escrita en el código**, en el docblock de `buildOutstandingScope` (`reports/service.ts`). Los planes 173-175 la copian textual: un solo statement nombra las tablas strict del bloque y estampa el `tenantWhere`; los helpers reciben columnas.
2. **`tenantWhere` de tabla LEFT JOINeada va en el `ON`.** En el WHERE convierte el LEFT en INNER y borra filas en silencio — el modo de falla más caro de esta fase, porque el lint sale verde igual.
3. **La allowlist acumula 13 entradas muertas** (9 del plan 02 + 4 de este). El plan 172-21 borra las 13.
4. **`getExpiredMembers` sigue sin `ctx` a propósito** (no toca tablas strict, D-07). Si un plan futuro migra `subscriptions`, ahí sí entra.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-03-SUMMARY.md`
- `FOUND` commit `472fc7c0` (Task 1) y `954f0235` (Task 2) en `feat/172-adopcion-finance`
- `FOUND` `/tmp/allowlist-172-03.json` (488 entradas) con el lint verde contra él
- `FOUND` los 2 archivos modificados en `git diff --stat 6fe25129..HEAD` (+235 / −79)
- `VERIFIED` `git status --porcelain` en `et-172` vacío y `tenant-lint-allowlist.json` sin modificar
- `VERIFIED` 0 violaciones sobre tablas strict en `src/modules/reports/` según el motor del lint

**ADO-01 NO se marca completo**, misma convención que 172-01 y 172-02: el requisito exige `finance` migrado entero (services + sentinel + aislamiento verde) y lo citan 18 planes. Este plan migra un módulo **ajeno**.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
