---
phase: 172-adopci-n-1-piloto-finance
plan: 07
subsystem: subscriptions
tags:
  [
    tenancy,
    subscriptions,
    finance,
    charge-path,
    tenantWhere,
    tenantValues,
    assertTenant,
    ruta-publica,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / tenantValues / assertTenant / TenantContext)"
  - phase: 171-backstop
    provides: "test/fixtures/second-tenant.ts (TENANT_TEMPLO)"
  - plan: 172-01
    provides: "worktree et-172 sobre a6272df0, baseline verde, allowlist en 501 entradas"
  - plan: 172-04
    provides: "la version de members/routes.ts con listMembers(ctx, params) y assertTenant ya importado"
  - plan: 172-06
    provides: "validateBankAccountForCharge con ctx y los 7 assertTenant de coach-load-routes.ts"
provides:
  - "Las 7 firmas de suscripciones que escriben plata reciben TenantContext PRIMERO (antes del tx)"
  - "El INSERT en balances de recordAssignmentCharge estampa el tenant del servidor (tenantValues)"
  - "El SELECT del anticipo sobre financial_transactions filtra por gimnasio (tenantWhere)"
  - "El autorregistro publico deriva el ctx de la fila de branches: precedente para los caminos sin JWT"
  - "El ciclo transaction-service <-> subscriptions roto: 172-08 ya tiene de donde sacar el ctx"
affects: [172-08, 172-09, 172-15, 172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "En una ruta PUBLICA el ctx se deriva de la fila de branches leida por el server, no de request.scope (que no existe)"
    - "El id de la sede sale de la FILA leida, no del numero del body, cuando de ese id depende el tenant"
    - "Un parametro ctx que todavia no se usa se documenta como tal: cancelSubscription lo recibe y lo dice"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/test/subscriptions/charge-on-assign.test.ts
    - el-templo-api/test/subscriptions/impute-advance-on-assign.test.ts
    - el-templo-api/test/subscriptions/user-status-history.test.ts
    - el-templo-api/test/users/user-status-transitions.test.ts

key-decisions:
  - "cancelSubscription recibe el ctx AHORA aunque todavia no lo use: los call sites de ruta se tocan una sola vez y 172-08 solo tiene que bajarlo un nivel a _cancelSubscription"
  - "El Task 4 (auth) se ejecuto ANTES del Task 3 (tests): sin el, tsc no llegaba a cero y no tenia sentido correr un test contra un src que no compila"
  - "Los 2 jobs del plan no tienen call sites: llaman a autoResume/activateDue/autoExpire/pickSubscription, ninguno de los metodos migrados"
  - "4 de los 8 archivos de test del plan no tienen call sites directos: usan el helper HTTP assignPlan de _helpers.ts"
  - "Este plan paga CERO entradas de allowlist y eso es lo correcto: subscriptions/service.ts conserva 18 entradas vivas porque solo 2 de sus decenas de accesos se migraron"

patterns-established:
  - "Ruta publica: SELECT de la sede con tenantId proyectado + guard fail-closed + ctx construido a mano, con el motivo escrito arriba"
  - "tsc NO typechequea test/ en este repo (tsconfig include: src/**/*): el inventario de call sites de test se saca por grep, nunca del compilador"

requirements-completed: []

# Metrics
duration: 40min
completed: 2026-07-30
---

# Phase 172 Plan 07: `TenantContext` en los caminos de plata de suscripciones Summary

**Las 7 firmas por las que pasa toda escritura de plata que arranca en suscripciones —`recordAssignmentCharge`, `assignPlan`, `changePlan`, `changePlanNow`, `changePlanAfterCurrent`, `renewSubscription` y el wrapper público `cancelSubscription`— reciben el gimnasio como PRIMER parámetro, antes del `tx`, y sus 2 accesos directos a tablas strict lo nombran: el saldo que nace de un cobro parcial se estampa con `tenantValues` y el anticipo que se imputa al alta se lee con `tenantWhere`. El autorregistro público, que no tiene JWT ni `request.scope`, deriva el gimnasio de la fila de `branches` que ya leía. `charge-on-assign` 14/14 y `user-status-transitions` 9/9 verdes sin tocar una sola expectativa.**

## Performance

- **Duration:** ~40 min (22:32Z → 23:12Z), de los cuales ~5 min son las dos corridas de test contra MySQL real
- **Completed:** 2026-07-30
- **Tasks:** 4/4 (las cuatro `auto`)
- **Files modified:** 9 — +149 / −23

## Task Commits

| Task | Nombre                                          | Commit     | Archivos                                                                 |
| ---- | ----------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| 1    | ctx en las 7 firmas + las 2 queries finance     | `234b42a5` | subscriptions/service.ts                                                 |
| 2    | Call sites de producción (rutas de admin)       | `0deb4e10` | subscriptions/routes.ts, members/routes.ts, finance/coach-load-routes.ts |
| 4    | Autorregistro público — ctx derivado de la sede | `d73748d6` | auth/routes.ts                                                           |
| 3    | Call sites de test                              | `334d6e96` | 4 archivos de test                                                       |

Los cuatro commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `173e2127` del plan 05). El SUMMARY + STATE + ROADMAP van en el checkout principal.

**El Task 4 se ejecutó antes del Task 3, a propósito.** Ver la desviación 3.

## Accomplishments

- **7 métodos con `ctx: TenantContext` como PRIMER parámetro**, antes del `tx`. La posición no es estética: un call site viejo queda con los argumentos CORRIDOS y **no compila**. Si el parámetro fuera último u opcional, un caller olvidado seguiría compilando y escribiría el cargo sin gimnasio. Quedó escrito en el docblock de `recordAssignmentCharge` para que nadie lo "ordene" alfabéticamente después.
- **2 queries de finance migradas** en `subscriptions/service.ts`, que son las dos únicas que el archivo tiene sobre tablas strict fuera de `_cancelSubscription`:
  - el `INSERT` en `balances` que siembra la deuda cuando `amountReceived === 0` pasa por `tenantValues(ctx, {…})` — el tenant va después del literal (T-172-07-02);
  - el `SELECT` del anticipo sobre `financial_transactions` lleva `tenantWhere` como **primer término** del `and(...)` (T-172-07-03).
- **10 call sites de producción actualizados** (9 con `assertTenant(request.scope, …)` + 1 con el ctx derivado de la sede).
- **El autorregistro público resuelve el gimnasio server-side.** Las dos ramas de resolución de sede (la pedida y el default `ONLINE`) proyectan `tenant_id`, y el id de la sede pedida ahora sale de **la fila leída**, no del número del body. Ver la sección dedicada.
- **`_cancelSubscription` intacto**, como el plan exige: su firma la cambia el 172-08 junto con el tipo `SubscriptionCanceller` de `transaction-service.ts`.
- **Dos archivos de test corridos contra MySQL real, verdes**, sin cambiar una expectativa: `charge-on-assign` 14/14 (143 s) y `user-status-transitions` 9/9 (127 s).

## El autorregistro público, que es el caso interesante

`POST /api/auth/register` no tiene JWT, no tiene `request.user` y por lo tanto **no tiene `request.scope`**: `assertTenant` no aplica y no había una quinta fuente de tenant que inventar sin violar `shared/tenant.ts:23-38`. La salida es la que el plan pedía y vale escribirla porque las fases 173-175 la van a copiar:

1. El cliente elige una **sede**, no un gimnasio. La sede —una fila del servidor— es la que dice de qué gimnasio es.
2. Las dos ramas de resolución (`branchId` del body / default `code = "ONLINE"`) proyectan `tenantId` además de `id`.
3. **El id de la sede pedida pasó a salir de la fila leída** (`branch[0].id`) en vez de `requestedBranchId`. Antes se validaba la existencia y después se usaba el número del body igual: funcionaba, pero dejaba al payload como fuente de un dato del que ahora depende el tenant. Es un cambio de una línea con consecuencia semántica.
4. Guard fail-closed: si el `tenantId` no es un entero, se corta con el **mismo 500** que ya devolvía la rama de "sede predeterminada no configurada", con un `log.error` que nombra el `branchId`. Nunca un default al tenant 1.
5. `const ctx: TenantContext = { tenantId: branchTenantId }` como primer argumento de `assignPlan`, con el motivo comentado arriba.

**Honestidad sobre el guard del punto 4:** `branches.tenant_id` es `NOT NULL` con FK a `tenants` (`tenant-column.ts`), así que en una base sana **esa rama no dispara nunca** y el compilador lo sabe. Está por defensa en profundidad contra drift de schema, y el comentario lo dice con esas palabras — no es una validación que esté atajando un caso real.

## Verificación

| Criterio                                                                      | Resultado                                                 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                                      | ✅ exit 0                                                 |
| `tsc --noEmit \| grep -v "^test/" \| grep -c "error TS"`                      | ✅ **0** (tras el Task 4 — ver desviación 3)              |
| `pnpm exec vitest run test/subscriptions/charge-on-assign.test.ts`            | ✅ **14/14**, 143 s, sin tocar expectativas               |
| `pnpm exec vitest run test/users/user-status-transitions.test.ts`             | ✅ **9/9**, 127 s (extra, ver desviación 1)               |
| `grep -c "tenantValues(ctx" subscriptions/service.ts`                         | 1 (pedía ≥ 1)                                             |
| `grep -c "tenantWhere(schema.financialTransactions" subscriptions/service.ts` | 1 (pedía ≥ 1)                                             |
| `_cancelSubscription` sin `ctx` en la firma                                   | ✅ (`tx, userId, actorId, notes, subscriptionId, opts`)   |
| `grep -nE "tenantId!\|\?\? 1"` en los 5 archivos de `src`                     | sin líneas                                                |
| `grep -c "assertTenant(request.scope"` en los 3 archivos de rutas             | 4 / 4 / 9 (pedía ≥ 1 en cada uno)                         |
| `grep -c "tenantId: branch" auth/routes.ts`                                   | 3 (pedía ≥ 1)                                             |
| Los jobs no construyen ctx propio                                             | ✅ (el único match es un campo de log del ctx del sweep)  |
| `git diff -- el-templo-api/test \| grep -c "^[-+].*expect("`                  | **0**                                                     |
| `lint-tenant --allowlist=/tmp/allowlist-172-06.json`                          | ✅ exit 0, `DISCREPANCIAS: 0`                             |
| `pnpm lint:tenant` (allowlist real)                                           | `DISCREPANCIAS: 21` — las mismas de 172-06, ninguna nueva |
| `prettier --check` sobre los 9 archivos                                       | ✅                                                        |
| Inventario de exenciones `tenant-safe`                                        | **10** — el mismo de 172-01, ninguna nueva                |
| `git status --porcelain` en `et-172`                                          | vacío                                                     |
| `tenant-lint-allowlist.json` modificado                                       | no (dueño único = 172-21)                                 |

### Call sites actualizados, archivo por archivo

**Producción (6 archivos del plan, 10 call sites):**

| Archivo                                    | Call sites | Detalle                                                                                                     |
| ------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------- |
| `src/modules/subscriptions/routes.ts`      | **4**      | assign, change-plan, cancel, renew                                                                          |
| `src/modules/members/routes.ts`            | **3**      | assignPlan del alta + 2 cancelSubscription (conversión y borrado)                                           |
| `src/modules/finance/coach-load-routes.ts` | **2**      | renovación y alta de la PoS del profe                                                                       |
| `src/modules/auth/routes.ts`               | **1**      | assignPlan de la promo (Task 4, ctx derivado de la sede)                                                    |
| `src/jobs/auto-resume-pauses.ts`           | **0**      | llama a `autoResumeDuePauses` / `activateDueScheduledSubs` / `autoExpireDueSubscriptions` — ninguno migrado |
| `src/jobs/mark-no-shows.ts`                | **0**      | llama a `pickSubscriptionForActivity` — no migrado                                                          |

**Test (8 archivos del plan, 8 call sites):**

| Archivo                                               | Call sites | Detalle                                          |
| ----------------------------------------------------- | ---------- | ------------------------------------------------ |
| `test/subscriptions/charge-on-assign.test.ts`         | **1**      | `subSvc.assignPlan`                              |
| `test/subscriptions/impute-advance-on-assign.test.ts` | **1**      | `subSvc.assignPlan`                              |
| `test/subscriptions/user-status-history.test.ts`      | **1**      | `svc.assignPlan`                                 |
| `test/users/user-status-transitions.test.ts`          | **5**      | 1 `assignPlan` + 4 `cancelSubscription`          |
| `test/subscriptions/lifecycle.test.ts`                | **0**      | usa el helper HTTP `assignPlan` de `_helpers.ts` |
| `test/subscriptions/change-plan.test.ts`              | **0**      | idem                                             |
| `test/subscriptions/renewal.test.ts`                  | **0**      | idem                                             |
| `test/subscriptions-conversion-hook.test.ts`          | **0**      | helper local `assignPlanViaHttp`                 |

Los cuatro archivos con `0` **no se tocaron**: sus `assignPlan(...)` son una función local que hace `app.inject`, no el método del service.

### 📌 Entradas de allowlist que paga este plan: **0**

Y es el resultado correcto, no un fracaso. `subscriptions/service.ts` conserva sus **18** entradas —`balances` y `financial_transactions` incluidas— porque el ratchet razona por `(archivo, tabla)` (hallazgo del plan 02) y este plan migró **2** de las decenas de accesos del archivo: las otras lecturas de `balances` viven en `_cancelSubscription`, que el plan deja explícitamente fuera. `auth/routes.ts` tampoco baja: el `SELECT` de `branches` que se tocó no es de tabla strict y el archivo conserva sus 5 entradas.

**Cuenta acumulada para el plan 172-21: 9 (02) + 4 (03) + 6 (04) + 2 (06) + 0 (07) = 21 entradas a borrar de `tenant-lint-allowlist.json`.** `/tmp/allowlist-172-06.json` (480 entradas) sigue siendo la evidencia ejecutable vigente y el lint sale verde contra él **con este plan adentro** — o sea que el plan tampoco introdujo un acceso violador nuevo, que era el otro riesgo.

## Decisions Made

### 1. `cancelSubscription` recibe el `ctx` ahora, aunque todavía no lo use

El `<action>` del Task 1 no lo nombra; el `<must_haves>` del plan sí ("recordAssignmentCharge/assignPlan/changePlan\*/renewSubscription/**cancelSubscription** con ctx primero"). Se resolvió a favor del `must_haves` por una razón operativa: las queries de plata del camino de cancelación viven en `_cancelSubscription`, cuya firma la cambia el 172-08 junto con el tipo `SubscriptionCanceller`. Si el `ctx` entrara recién ahí, **los 5 call sites de ruta (3 en `members/routes.ts` y `subscriptions/routes.ts`, 4 en test) habría que tocarlos dos veces**, una por plan. Poniéndolo ahora, el 172-08 sólo baja el `ctx` un nivel.

**El riesgo de esta decisión —y cómo se mitigó.** Un parámetro `ctx` sin usar en un método cuyo camino toca `balances` puede leerse, dentro de tres semanas, como "la cancelación ya está scopeada". No lo está. El docblock lo dice con esas palabras, en mayúsculas y arriba de todo: _"LEER ANTES DE CONFIAR EN EL `ctx`: este método ya lo RECIBE pero TODAVÍA NO LO USA … Hasta entonces, la cancelación NO está scopeada."_ Un comentario no es un gate, pero un parámetro mudo sin comentario es peor que las dos cosas.

### 2. `tsc` no typechequea `test/` en este repo — el inventario de call sites de test salió de `grep`

`tsconfig.json` tiene `"include": ["src/**/*"]`. El `<action>` del Task 3 decía que "la salida de `pnpm exec tsc --noEmit` al terminar el Task 2 es el inventario exacto de call sites de test pendientes": **es exactamente al revés**, el compilador no ve un solo archivo de `test/`. Es el mismo modo de falla que el plan 02 documentó y que el 172-06 volvió a encontrar.

Consecuencia práctica que los planes siguientes tienen que dar por sentada: **un call site de test desactualizado no da rojo en `tsc` ni en CI hasta que el test corre**, y ahí revienta en runtime con un objeto en la posición de un `number`. El inventario se saca con `grep -rn "\.assignPlan(\|\.changePlan(\|…" test/`, filtrando los helpers HTTP homónimos.

### 3. El Task 4 se ejecutó antes del Task 3

Ver desviación 3. En dos palabras: el `<verify>` del Task 2 pide **cero** errores fuera de `test/`, y el único que quedaba era el `assignPlan` de `auth/routes.ts` que cierra el Task 4. Correr un test contra un `src` que no compila no prueba nada.

### 4. El comentario del guard fail-closed no puede contener la cadena `?? 1`

La primera redacción decía "jamás `?? 1`" citando la regla. El criterio de aceptación del propio plan es `grep -nE "tenantId!|\?\? 1"` **sin líneas**, y un comentario que cita la regla la hace fallar. Se reescribió como "nunca un default numérico al tenant 1". Es una trampa boba pero real: el gate es un grep, no un parser, y los planes 173-175 van a escribir comentarios parecidos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Cobertura] `cancelSubscription` migrado y su archivo de test corrido**

- **Found during:** Task 1
- **Issue:** el `<action>` enumera 6 métodos y omite `cancelSubscription`; el `<must_haves>` del mismo plan lo exige. Ver la decisión 1 para el porqué de resolverlo a favor del `must_haves`.
- **Fix:** `ctx` como primer parámetro de `cancelSubscription` + los 3 call sites de ruta + los 4 de test, con el docblock que aclara que el parámetro todavía no se usa.
- **Verificación extra que este plan pagó de su bolsillo:** `test/users/user-status-transitions.test.ts` **9/9 verde** contra MySQL real. El plan sólo pedía `charge-on-assign`; ese archivo no ejercita `cancelSubscription` y la desviación habría quedado sin probar.
- **Files modified:** `subscriptions/service.ts`, `subscriptions/routes.ts`, `members/routes.ts`, `test/users/user-status-transitions.test.ts`
- **Committed in:** `234b42a5`, `0deb4e10`, `334d6e96`

**2. [Rule 1 - Bug del plan] Los jobs y 4 de los 8 archivos de test no tienen call sites que tocar**

- **Found during:** Tasks 2 y 3
- **Issue:** el `<files>` del Task 2 incluye `src/jobs/auto-resume-pauses.ts` y `src/jobs/mark-no-shows.ts`, y el del Task 3 incluye `lifecycle`, `change-plan`, `renewal` y `subscriptions-conversion-hook`. Ninguno de los seis invoca un método migrado: los jobs llaman a `autoResumeDuePauses` / `activateDueScheduledSubs` / `autoExpireDueSubscriptions` / `pickSubscriptionForActivity`, y los cuatro tests usan un helper **homónimo** (`assignPlan` de `test/subscriptions/_helpers.ts`) que hace `app.inject`. `tsc` confirma lo primero (no marcó una sola línea de los jobs); el grep confirma lo segundo.
- **Fix:** no se tocó ninguno de los seis. Agregarles un `ctx` habría sido pasárselo a métodos que no lo reciben, o peor, a una función de test que no es la del service.
- **Por qué NO es un descuido:** es la misma trampa que el 172-06 documentó (su desviación 1), y acá el riesgo de equivocarse era mayor porque el helper de test **se llama igual** que el método. El criterio del `<verification>` del plan pedía "13 filas: 5 de producción + 8 de test" — las tablas de arriba tienen **14** (6 de producción + 8 de test), con los ceros explícitos, porque un cero medido es información y una fila ausente no.
- **Files modified:** ninguno

**3. [Rule 3 - Bloqueante de verificación] El Task 4 se ejecutó antes del Task 3**

- **Found during:** Task 2
- **Issue:** el `<verify>` del Task 2 exige `tsc --noEmit | grep -v "^test/" | grep -c "error TS"` **= 0**, pero el `assignPlan` de `auth/routes.ts` —que cierra el **Task 4**— es código de producción y quedaba rojo. Con el orden del plan (2 → 3 → 4), el criterio del Task 2 era inalcanzable en su propio commit y el Task 3 iba a correr tests contra un `src` que no compila.
- **Fix:** orden de ejecución 1 → 2 → **4** → 3. Ningún contenido cambió y cada task conserva su commit atómico; sólo se permutaron dos commits que no dependen entre sí.
- **Consecuencia medible:** tras `d73748d6` (Task 4), `tsc --noEmit` sale **exit 0** — el criterio del Task 2 se cumple, un commit más tarde de lo que el plan imaginaba.
- **Files modified:** ninguno (cambio de secuencia)

**4. [Rule 1 - Bug propio] El comentario del guard hacía fallar el grep de `?? 1`**

- **Found during:** Task 4
- **Issue:** el comentario del fail-closed citaba literalmente la regla prohibida, y `grep -nE "tenantId!|\?\? 1" src/modules/auth/routes.ts` devolvía esa línea. El criterio de aceptación pide **sin líneas**.
- **Fix:** reescrito como "nunca un default numérico al tenant 1". Ver la decisión 4.
- **Files modified:** `src/modules/auth/routes.ts`
- **Committed in:** `d73748d6` (antes del commit, no hubo commit sucio)

---

**Total deviations:** 4 auto-fixed (2 × Rule 1, 1 × Rule 2, 1 × Rule 3). La #1 agranda levemente el alcance —una firma más y su verificación— para que el plan siguiente no toque dos veces los mismos call sites; la #2 lo achica; las #3 y #4 son de secuencia y de higiene del gate.

## Issues Encountered

**El lint sigue ROJO contra la allowlist REAL en esta rama, por las mismas 21 entradas.** Este plan no suma ni resta: quien corra `pnpm lint:tenant` sin `--allowlist` en `feat/172-adopcion-finance` ve `DISCREPANCIAS: 21`, todas `staleNoLongerViolating`, y son las de los planes 02/03/04/06. El dueño único del archivo es el plan 172-21. **Si la rama se mergeara a `staging` antes de ese plan, CI queda rojo por esto.**

**Los commits del Task 1 y del Task 2 no compilan por separado.** Es el diseño del plan (Task 1 cambia firmas, Task 2 los call sites de producción, Task 4 el último), y está documentado en su propio criterio de aceptación ("`tsc` sale con código 0 **después** de actualizar los call sites de los Tasks 2 y 3"). Consecuencia práctica: **`git bisect` sobre `234b42a5` y `0deb4e10` no compila**. Los cuatro commits viajan juntos al merge de la fase, así que en `staging`/`master` no hay ventana rota — pero conviene saberlo antes de bisecar dentro de la rama.

**`test/users/user-status-transitions.test.ts` hardcodea `/* adminId */ 2`.** Es preexistente (no lo introdujo este plan) y viola la regla del proyecto de no hardcodear ids de `users` en tests: la base de CI no garantiza el id 2. No se tocó — está fuera del alcance de este plan y arreglarlo bien exige resolver `admin@test.com` como hacen los otros archivos. **Queda anotado para el plan 172-15**, que es el que vuelve a entrar a los tests de suscripciones.

**Riesgo residual que este plan NO cierra, para el 172-08:** el camino de cancelación (`_cancelSubscription`, con el colapso de deuda fantasma sobre `balances`) sigue **sin filtro de gimnasio**, y ahora además su wrapper público recibe un `ctx` que no baja. El docblock lo dice, pero el gate real es el plan 172-08.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos ni schemas, no instala paquetes. Las 10 rutas tocadas conservan sus guards (`ADMIN_ROLES` / `requireBranchAccess` en admin, `FINANCE_LOAD_ROLES` a nivel plugin en coach-load, y `/register` sigue siendo pública por diseño) y su `handleServiceError` — `assertTenant` lanza `AppError(403, TENANT_UNRESOLVED)`, que ese handler ya mapea.

Mitigaciones del `<threat_model>` del plan, verificadas:

| Threat      | Estado                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-07-01 | ✅ el ctx sale del `tenant_id` de la fila de `branches` leída por el server; la sede pedida se valida contra la base **y su `id` se toma de la fila**; guard fail-closed con 500, sin default al tenant 1 |
| T-172-07-02 | ✅ `tenantValues(ctx, {…})` en el INSERT de `balances`, con el tenant después del literal                                                                                                                 |
| T-172-07-03 | ✅ `tenantWhere(schema.financialTransactions, ctx)` primer término del `and(...)` del SELECT del anticipo                                                                                                 |
| T-172-07-04 | ✅ los 2 jobs no tienen call sites afectados y no construyen ningún ctx nuevo (el único `tenantId:` que aparece es un campo de log del ctx que ya provee `forEachActiveTenant`)                           |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                              |

## Next Phase Readiness

**Listo para el 172-08**, que era el punto entero de este plan. Cinco cosas que los planes siguientes tienen que dar por sentadas:

1. **El ciclo está roto.** `subscriptions/service.ts` tiene `ctx` disponible en los 5 puntos donde llama a `this.transactionService.*` (los 5 `recordAssignmentCharge` internos) y en `voidInTx`. Cuando el 172-08 le agregue `ctx` a `transactionService.create`, hay de dónde sacarlo sin tocar una firma más de este archivo.
2. **`_cancelSubscription` sigue sin `ctx` y su wrapper YA lo recibe.** El 172-08 sólo tiene que bajarlo un nivel y migrar las 2 queries del colapso de deuda fantasma; **ningún call site de ruta ni de test hay que volver a tocarlo**.
3. **`tsc` no mira `test/`.** El inventario de call sites de test se saca por `grep`, y el grep tiene que filtrar los helpers HTTP homónimos de `test/subscriptions/_helpers.ts` (`assignPlan`) y los locales de `segmentation`, `scheduling`, `attendance` y `subscriptions-conversion-hook`.
4. **Precedente para los caminos sin JWT** (webhook de Wellhub, QR de asistencia, cualquier ruta pública futura): `auth/routes.ts` L135-200 es el ejemplar. Proyectar `tenant_id` en el SELECT de la entidad que el server ya lee, tomar también su `id` de la fila, guard fail-closed, y el motivo escrito arriba.
5. **La allowlist acumula 21 entradas muertas** (9 + 4 + 6 + 2 + 0). El plan 172-21 borra las 21.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-07-SUMMARY.md`
- `FOUND` commits `234b42a5` (T1), `0deb4e10` (T2), `d73748d6` (T4) y `334d6e96` (T3) en `feat/172-adopcion-finance`
- `FOUND` los 9 archivos modificados en `git diff --stat 173e2127..HEAD` (+149 / −23)
- `VERIFIED` `pnpm exec tsc --noEmit` exit 0
- `VERIFIED` `charge-on-assign.test.ts` 14/14 y `user-status-transitions.test.ts` 9/9 contra MySQL real
- `VERIFIED` `lint-tenant --allowlist=/tmp/allowlist-172-06.json` exit 0, `DISCREPANCIAS: 0`
- `VERIFIED` `git status --porcelain` en `et-172` vacío y `tenant-lint-allowlist.json` sin modificar
- `VERIFIED` `git diff -- el-templo-api/test | grep -c "^[-+].*expect("` = **0**

**ADO-01 NO se marca completo**, misma convención que 172-01/02/03/04/06: el requisito exige `finance` migrado entero (services + sentinel + aislamiento verde) y lo citan 18 de los 23 planes. Este plan migra la **plomería** que le da gimnasio a `finance` desde suscripciones, no `finance`.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
