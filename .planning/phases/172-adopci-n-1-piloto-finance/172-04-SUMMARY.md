---
phase: 172-adopci-n-1-piloto-finance
plan: 04
subsystem: coach-members-cli
tags:
  [
    tenancy,
    coach,
    members,
    cli,
    lint-tenant,
    tenantWhere,
    tenantValues,
    requireTenant,
    assertTenant,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / tenantValues / assertTenant) y src/db/scripts/require-tenant.ts (receta CLI D-06)"
  - phase: 170-sentinel-lint
    provides: "src/db/scripts/lint-tenant.ts y tenant-lint-allowlist.json (ratchet)"
  - plan: 172-01
    provides: "worktree et-172 sobre a6272df0, baseline verde, allowlist en 501 entradas"
  - plan: 172-02
    provides: "el hallazgo de que el lint razona por STATEMENT y de que las colaterales se cuentan corriendo el lint, no estimando"
  - plan: 172-03
    provides: "la convencion de tenant_id PRIMERO en el WHERE de una subconsulta con FROM propio"
provides:
  - "coach/service.ts sin un solo acceso violador: la deuda del profe filtra por tenant_id"
  - "listMembers scopeado en sus DOS accesos a balances (filtro debtorOnly + agregado de deuda total)"
  - "backfill-historical-payments.ts con la receta CLI completa: --tenant obligatorio, exit 2 fail-closed, tenantWhere en los SELECT y tenantValues en los 3 INSERT"
  - "6 entradas de allowlist muertas y probadas con el lint contra /tmp/allowlist-172-04.json (482 entradas)"
affects: [172-07, 172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El primer retrofit de la receta CLI 169 D-06 sobre un script YA EXISTENTE (el ejemplar seed-onboarding-aura.ts nacio con ella)"
    - "requireTenant DENTRO del try, para que el finally cierre la conexion cuando el flag falta"
    - "Separacion de exit codes verificada en vivo: 2 = error de uso, 1 = error de datos"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/coach/service.ts
    - el-templo-api/src/modules/coach/routes.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/scripts/backfill-historical-payments.ts

key-decisions:
  - "El tenantWhere de coach va en el .where() de la query y no en el array conds: el lint mide por statement y el array no es un acceso (misma decision que 172-02)"
  - "listMembers scopea TAMBIEN el EXISTS crudo de debtorOnly, que el plan no nombraba: sin el la entrada members/service.ts | balances no moria y el filtro 'solo deudores' seguia mirando la deuda de todos los gimnasios"
  - "requireTenant va DENTRO del try/finally y no antes: si falta el flag, el finally igual cierra la conexion en vez de dejarla colgada hasta el process.exit"
  - "ctx delante de scope en getOutstandingBalances: CoachScope responde 'que subset ve este profe', ctx responde 'de que gimnasio son los datos'; la segunda no es negociable"

patterns-established:
  - "Retrofit CLI: requireTenant como PRIMERA operacion del try, con el tenantId logueado en el arranque para que quede en el registro de la corrida"
  - "Un archivo chico y ajeno se cierra ENTERO: coach/service.ts quedo con 0 accesos violadores, incluida la tabla users que no es strict"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-07-30
---

# Phase 172 Plan 04: Los tres accesos ajenos chicos Summary

**Los dos listados de deuda que no viven en `finance` (el del profe y el del listado de socios) filtran por `tenant_id`, y el script de backfill histórico de pagos —que escribe plata en batch sin request ni JWT— dejó de poder correr sin `--tenant`: muere con exit 2 antes de leer una sola fila. 6 entradas de allowlist menos, lint verde.**

## Performance

- **Duration:** ~11 min (21:00Z → 21:11Z)
- **Completed:** 2026-07-30
- **Tasks:** 2/2 (ambas `auto`)
- **Files modified:** 5 — +124 / −40

## Task Commits

| Task | Nombre                                                | Commit     | Archivos                                                                 |
| ---- | ----------------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| 1    | `coach/service.ts` y `members/service.ts` scopeados   | `5b0db52b` | coach/service.ts, coach/routes.ts, members/service.ts, members/routes.ts |
| 2    | Retrofit del script `backfill-historical-payments.ts` | `1c7dd7d5` | src/scripts/backfill-historical-payments.ts                              |

Los dos commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `954f0235` del plan 03). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Accomplishments

- **`coach/service.ts` quedó con CERO accesos violadores** — los 3 que tiene (`balances` ×2 + `users`) están dentro del mismo statement, que ahora nombra el gimnasio. Es el archivo más chico de toda la fase y el borde más barato de atacar: el rol `coach` es el más común.
- **`listMembers` scopea sus DOS accesos a `balances`**, no uno: el agregado de deuda total que el plan nombraba **y** el `EXISTS` crudo del filtro `debtorOnly`, que el plan no había visto (ver desviación 1).
- **El backfill adopta la receta CLI completa** (169 D-06): `requireTenant(queryFnFromConnection(connection))` como primera operación, `tenantWhere` en los 2 SELECT de idempotencia, `tenantValues(ctx, …)` en los 3 INSERT, y `failTenantArg` en el `.catch` con la separación de exit codes.
- **Los tres caminos del CLI verificados EN VIVO contra la base local**, no por lectura del código:

  | Invocación        | Salida                                               | Exit  |
  | ----------------- | ---------------------------------------------------- | ----- |
  | sin `--tenant`    | "Falta el gimnasio: … y no adivina en cuál"          | **2** |
  | `--tenant=999999` | "No existe ningún gimnasio con id 999999"            | **2** |
  | `--tenant=1`      | `Tenant: 1`, sigue y falla en el pre-flight de datos | **1** |

  La tercera fila es la que prueba que la separación de códigos **no es decorativa**: el mismo script devuelve 2 cuando el operador se olvidó del flag y 1 cuando corrió de verdad y encontró un problema en los datos. Ninguna de las tres corridas escribió una fila (las dos primeras mueren antes de cualquier query; la tercera es dry-run y muere en el pre-flight).

- **Lint verde contra la allowlist filtrada:** `DISCREPANCIAS: 0` con `/tmp/allowlist-172-04.json` (**482** entradas). `tenant-lint-allowlist.json` no se tocó (`git status --porcelain` sobre ese archivo, vacío).

## Verificación

| Criterio                                                                  | Resultado                                  |
| ------------------------------------------------------------------------- | ------------------------------------------ |
| `pnpm exec tsc --noEmit`                                                  | ✅ exit 0                                  |
| `lint-tenant --allowlist=/tmp/allowlist-172-04.json`                      | ✅ exit 0, `DISCREPANCIAS: 0`              |
| Accesos violadores sobre tablas strict en los 3 archivos (motor del lint) | ✅ **0** (eran 11)                         |
| `grep -c "tenantWhere(schema.balances" coach/service.ts`                  | 1 (pedía ≥ 1)                              |
| `grep -c "tenantWhere(schema.balances" members/service.ts`                | 1 (pedía ≥ 1)                              |
| `grep -c "assertTenant(request.scope" coach/routes.ts`                    | 1 (pedía ≥ 1)                              |
| `grep -c "requireTenant(queryFnFromConnection" backfill…`                 | 1 (pedía exactamente 1)                    |
| `grep -c "tenantValues(ctx" backfill…`                                    | 3 (pedía exactamente 3)                    |
| `grep -c "failTenantArg" backfill…`                                       | 3 (pedía ≥ 2)                              |
| `grep -c "tenantWhere(" backfill…`                                        | 2 (los 2 SELECT de idempotencia)           |
| Script sin `--tenant`                                                     | ✅ exit **2**, cero escrituras             |
| `grep -nE "tenantId!\|\?\? 1"` en los 5 archivos                          | sin líneas                                 |
| `git status --porcelain el-templo-api/tenant-lint-allowlist.json`         | vacío (dueño único = 172-21)               |
| `prettier --check` sobre los 5 archivos                                   | ✅                                         |
| Inventario de exenciones `tenant-safe`                                    | **10** — el mismo de 172-01, ninguna nueva |
| `git status --porcelain` en `et-172`                                      | vacío                                      |

**No se corrió el suite de tests** (regla del proyecto: corren en CI). **No hubo que tocar ni un archivo de test**: se verificó por grep que ningún test invoca `listMembers` ni `coachService.getOutstandingBalances` directamente — los tests de `members` los ejercitan por HTTP (`members-status-filter.test.ts`, `members-leads-filter.test.ts` definen su propio helper local llamado `listMembers` que hace un `inject`, que no es el método del service).

### 📌 Entradas de allowlist que paga este plan: **6** (5 strict + 1 colateral)

```
el-templo-api/src/modules/coach/service.ts                 | balances
el-templo-api/src/modules/coach/service.ts                 | users                    ← colateral
el-templo-api/src/modules/members/service.ts               | balances
el-templo-api/src/scripts/backfill-historical-payments.ts  | balances
el-templo-api/src/scripts/backfill-historical-payments.ts  | financial_transactions
el-templo-api/src/scripts/backfill-historical-payments.ts  | transaction_links
```

La colateral es `coach/service.ts | users`: ese archivo tiene **un solo** acceso a `users` y vive dentro de la misma query que ahora nombra el gimnasio, así que su deuda se paga de arrastre (el ratchet razona por `(archivo, tabla)`, hallazgo del plan 02). Se midió con el lint, no se estimó.

Las otras 3 entradas del script (`subscriptions`, `users`, `branches`) **siguen vivas y eso está bien**: los 3 SELECT de pre-flight sobre esas tablas no se tocaron por D-07 (no son tablas strict y este archivo no es del módulo `finance`). Lo mismo con las 14 entradas restantes de `members/service.ts`.

**Cuenta acumulada para el plan 172-21 (el del switch): 9 (172-02) + 4 (172-03) + 6 (172-04) = 19 entradas a borrar de `tenant-lint-allowlist.json`.** El archivo `/tmp/allowlist-172-04.json` (482 entradas, 501 − 19) es la evidencia ejecutable: el lint sale verde contra él. El generador (`/tmp/gen-allowlist-172-04.py`) mantiene las cuatro listas separadas y comentadas (`YA_PAGADAS_02`, `YA_PAGADAS_03`, `PAGA_04_STRICT`, `PAGA_04_COLATERAL`) para que el aporte de cada plan se lea sin ambigüedad.

## Decisions Made

### 1. El `tenantWhere` de coach va en el `.where()` de la query, no en el array `conds`

El plan pedía "`tenantWhere(schema.balances, ctx)` como PRIMER elemento del array `conds`". **Con eso el lint queda rojo**, y el motivo es el hallazgo del plan 02 aplicado a este archivo: el lint mide por **statement**, y el statement `const conds: SQL[] = [gt(schema.balances.amount, 0)]` **ni siquiera cuenta como acceso** (el detector registra accesos en `.from()` / `.innerJoin()` / `.insert()`, no en un `gt(...)` suelto). O sea: poner el filtro ahí no le sirve a nadie — no vuelve compilador a la query, que es la que nombra `balances`.

El filtro se escribe entonces en `.where(and(tenantWhere(schema.balances, ctx), ...conds))`. **El SQL es idéntico** (primer término del WHERE en las dos formas) y el statement que nombra la tabla pasa a nombrar el gimnasio. Queda un comentario en el código explicando por qué está ahí y no dos líneas más arriba, para que nadie lo "ordene" después.

### 2. `ctx` delante de `scope` en `getOutstandingBalances`

La firma quedó `(ctx, filters, scope)`. `CoachScope` (rol / país / sucursales asignadas) y `TenantContext` responden preguntas distintas y conviene que se lean en ese orden: `scope` decide **qué subset del gimnasio** ve este profe, `ctx` decide **de qué gimnasio son los datos**. La segunda no es negociable ni configurable, así que va primero. El objeto de scope no se tocó (D-07).

### 3. `requireTenant` va DENTRO del `try`, no antes

El plan decía "justo después de `createSingleConnection()`". Hay dos lugares que satisfacen eso: antes del `try` o como primera línea adentro. Se eligió **adentro**, porque el `finally { await connection.end(); }` ya existe: si el operador se olvida del flag, la conexión se cierra igual en vez de quedar colgada hasta que `process.exit` la mate. No cambia ni el exit code ni el hecho de que no se escriba nada — cambia que el script se despida bien de MySQL incluso en su camino de error más común.

### 4. El `tenantId` se loguea en el arranque

`console.log(\`Tenant: ${ctx.tenantId}\`)` después de resolverlo. Es la mitigación de T-172-04-03 (repudiation) en su forma más barata: el bloque de arranque del script ya imprime modo, base y timestamp, y el gimnasio es exactamente el dato que faltaba para que la salida de una corrida sirva como registro de qué se hizo y dónde.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Fuga cross-tenant que el plan no vio] `listMembers` tiene DOS accesos a `balances`, no uno**

- **Found during:** Task 1
- **Issue:** El plan mandaba scopear "la subquery de deuda (L367)" y nada más. El inventario del motor del lint mostró **cuatro** accesos a `balances` en `members/service.ts`: tres dentro del statement del agregado de deuda (que se arreglan con un solo `tenantWhere`) y **uno aparte** en L215 — el `EXISTS (SELECT 1 FROM balances b WHERE b.member_id = users.id AND b.amount > 0)` del filtro `debtorOnly`. Sin tocarlo pasaban dos cosas, las dos malas: (a) la entrada `members/service.ts | balances` **no moría** y el Task 2 no podía dar verde; (b) el filtro "sólo deudores" del listado de socios seguía marcando como deudor a un socio que debe plata en **otro** gimnasio — la subconsulta tiene su propio `FROM`, así que el WHERE externo no la alcanza (misma trampa que el plan 03 documentó en `buildDebtOriginTxSubquery`).
- **Fix:** `WHERE b.tenant_id = ${ctx.tenantId} AND b.member_id = users.id AND b.amount > 0` — el gimnasio **primero**, antes de la correlación, que es la convención de `shared/tenant.ts:20` y la que los planes 02 y 03 ya usaron en sus `sql` crudos.
- **Files modified:** `el-templo-api/src/modules/members/service.ts`
- **Committed in:** `5b0db52b`

**2. [Rule 3 - Bloqueante] El `tenantWhere` de coach no puede vivir en el array `conds`**

- **Found during:** Task 1
- **Issue:** La forma que pedía el plan (primer elemento de `conds`) deja el statement de la query sin nombrar el gimnasio, así que el lint lo sigue contando como violación y la entrada `coach/service.ts | balances` no muere. Ver la decisión 1 para el detalle.
- **Fix:** el filtro se escribe en el `.where(and(tenantWhere(schema.balances, ctx), ...conds))`. SQL idéntico, statement compilador.
- **Consecuencia medible:** ninguna — el criterio de aceptación era `grep -c "tenantWhere(schema.balances" ≥ 1` y da 1 igual.
- **Files modified:** `el-templo-api/src/modules/coach/service.ts`
- **Committed in:** `5b0db52b`

**3. [Rule 3 - Bloqueante] La allowlist filtrada saca 19 entradas, no 5**

- **Found during:** Task 2
- **Issue:** El criterio pedía "5 entradas menos". Con esas 5 el lint sale **rojo**: por un lado faltan las **13** que los planes 02 y 03 ya dejaron muertas en esta misma rama y que nadie borró todavía (el archivo real tiene un dueño único, el plan 172-21); por otro, este plan paga **6** y no 5, porque `coach/service.ts | users` se cae de arrastre.
- **Fix:** el filtro saca 9 + 4 + 6 = 19, con las cuatro listas separadas y comentadas en el generador. Resultado: **482 entradas, lint exit 0, `DISCREPANCIAS: 0`**.
- **Por qué NO es un atajo:** no se agregó ninguna exención `tenant-safe` (el inventario sigue en **10**, las mismas de 172-01) ni se tocó el archivo real. Es deuda pagada de más, no perdonada.
- **Files modified:** ninguno versionado (los archivos viven en `/tmp`)

---

**Total deviations:** 3 auto-fixed (1 × Rule 1, 2 × Rule 3). Ninguna agranda el alcance; la #1 cierra una fuga que el plan no había visto y sin la cual el criterio de terminado del propio plan era inalcanzable.

## Issues Encountered

**El lint sigue ROJO contra la allowlist REAL en esta rama, y ahora por 19 entradas.** Es la consecuencia buscada del diseño de la fase (la allowlist tiene un dueño único, el plan 172-21), pero conviene repetirlo: quien corra `pnpm lint:tenant` sin `--allowlist` en `feat/172-adopcion-finance` va a ver `DISCREPANCIAS: 19`, todas `staleNoLongerViolating`. **No es una regresión: son 19 entradas pidiendo que las borren.** Si el merge a `staging` ocurriera antes del plan 172-21, CI estaría rojo por este motivo.

**El script de backfill es un ONE-SHOT que ya corrió (o va a correr) contra producción con datos de producción.** Su docblock dice `EXECUTED IN PROD: <FILL DATE WHEN APPLIED>` sin completar. Este plan **no** lo completó ni lo tocó: no hay forma de saberlo desde acá y llenarlo con una fecha inventada sería peor que dejarlo vacío. Si alguien va a correrlo después de esta fase, el `--tenant` ahora es obligatorio y ese es justamente el punto.

**Sin corridas del suite de tests.** Sigue en pie la bandera de 172-01 sobre `argon2` para el primer plan que corra tests reales — este plan corrió el script CLI contra la base local (que sí conectó y leyó `tenants` sin problema), pero eso no ejercita `argon2`.

## Nota para el plan 172-07 (wave 3)

Este plan tocó `members/routes.ts` en **dos** lugares y `members/service.ts` en **tres**, todos chicos y localizados:

- `members/routes.ts`: un import (`assertTenant` desde `../shared/tenant`, agregado después del import de `../shared/errors`) y el call site de L~486, que pasó de `listMembers(params)` a `listMembers(assertTenant(request.scope, "members.list"), params)`.
- `members/service.ts`: un import (`tenantWhere`, `TenantContext`), la firma de `listMembers` (que ahora recibe `ctx` PRIMERO) y los dos accesos a `balances`.

El plan 172-07 parte de esta versión. Lo único que puede sorprenderlo es la firma de `listMembers`: **el `ctx` va primero**, así que cualquier call site nuevo lo necesita.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos ni schemas. Las 2 rutas tocadas conservan sus guards (`COACH_DEBTS_ROLES` en el `onRequest` del plugin de coach; `requireBranchAccess` + el gate `ADMIN_ROLES` de `includeTotalDebt` en members) y su manejo de errores — `assertTenant` lanza `AppError(403, TENANT_UNRESOLVED)`, que `handleServiceError` ya sabe mapear.

Mitigaciones del `<threat_model>` del plan, verificadas:

| Threat      | Estado                                                                                                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-04-01 | ✅ `tenantWhere(schema.balances, ctx)` primer término del WHERE en las 2 queries agregadoras + `b.tenant_id` primero en el `EXISTS` crudo de `debtorOnly`. `ctx` desde `assertTenant` en las 2 rutas |
| T-172-04-02 | ✅ `tenantValues(ctx, …)` en los 3 INSERT (tenant después del spread); sin `--tenant` el proceso muere con exit 2 **antes** de abrir la transacción — verificado en vivo                             |
| T-172-04-03 | ✅ `requireTenant` valida contra la tabla `tenants` de ESTA base (`--tenant=999999` → exit 2, verificado) y el `tenantId` se imprime en el arranque; fail-closed, nunca default 1                    |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                         |

## Next Phase Readiness

**Listo.** Tres cosas que los planes siguientes tienen que dar por sentadas:

1. **La receta CLI de la 169 D-06 ya se probó como RETROFIT**, no sólo como script nuevo. El orden que funciona: `createSingleConnection()` → `try {` → `requireTenant(queryFnFromConnection(connection))` → loguear el `tenantId` → recién ahí cualquier query. Y el `.catch` del final va con `failTenantArg`, sin excepción: es lo único que separa "te olvidaste del flag" (2) de "corrió y los datos están mal" (1).
2. **Un archivo chico y ajeno se cierra ENTERO.** `coach/service.ts` quedó con 0 accesos violadores incluyendo `users`, que no es tabla strict. No es scope creep: la tabla estaba dentro de la misma query y no había forma de dejarla afuera. Cuando un archivo tiene 3 accesos, el criterio de terminado sensato es el archivo, no la tabla.
3. **La allowlist acumula 19 entradas muertas** (9 del 02 + 4 del 03 + 6 de este). El plan 172-21 borra las 19.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-04-SUMMARY.md`
- `FOUND` commit `5b0db52b` (Task 1) y `1c7dd7d5` (Task 2) en `feat/172-adopcion-finance`
- `FOUND` `/tmp/allowlist-172-04.json` (482 entradas) con el lint verde contra él
- `FOUND` los 5 archivos modificados en `git diff --stat 954f0235..HEAD` (+124 / −40)
- `VERIFIED` `git status --porcelain` en `et-172` vacío y `tenant-lint-allowlist.json` sin modificar
- `VERIFIED` 0 accesos violadores sobre tablas strict en los 3 archivos, según el motor del lint

**ADO-01 NO se marca completo**, misma convención que 172-01/02/03: el requisito exige `finance` migrado entero (services + sentinel + aislamiento verde) y lo citan 18 planes. Este plan cierra tres accesos **ajenos** a `finance`, no `finance`.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
