---
phase: 172-adopci-n-1-piloto-finance
plan: 08
subsystem: finance
tags:
  [
    tenancy,
    finance,
    transaction-service,
    movement-service,
    assertTenant,
    tenantWhere,
    firmas,
    call-sites,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / assertTenant / TenantContext)"
  - phase: 170-sentinel-lint
    provides: "src/db/scripts/lint-tenant.ts y tenant-lint-allowlist.json (ratchet)"
  - phase: 171-backstop
    provides: "test/fixtures/second-tenant.ts (TENANT_TEMPLO)"
  - plan: 172-01
    provides: "worktree et-172 sobre a6272df0, baseline verde, allowlist en 501 entradas"
  - plan: 172-04
    provides: "members/routes.ts con assertTenant ya importado"
  - plan: 172-06
    provides: "validateBankAccountForCharge con ctx y los assertTenant de coach-load-routes.ts"
  - plan: 172-07
    provides: "las 7 firmas de suscripciones con ctx primero y cancelSubscription recibiendolo sin usarlo"
provides:
  - "Los 21 metodos de TransactionService exigen TenantContext como PRIMER parametro"
  - "El tipo SubscriptionCanceller exige el ctx: un canceller sin gimnasio no compila"
  - "_cancelSubscription recibe el ctx del void y sus 2 queries de finance lo nombran"
  - "Los 4 metodos publicos de MovementService reciben ctx primero (no estaba en el plan)"
  - "37 call sites de produccion y 192 de test entregando un gimnasio de fuente legitima"
  - "3 entradas de allowlist muertas (subscriptions/service.ts: balances, financial_transactions, transaction_links)"
affects: [172-09, 172-10, 172-12, 172-13, 172-14, 172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El ctx va PRIMERO en la firma: un call site viejo queda con los argumentos CORRIDOS y no compila"
    - "Un handler con varias llamadas al service resuelve el ctx UNA vez, ANTES del try si el catch tambien lo necesita (no es el caso: el catch lo resuelve inline)"
    - "En los tests, una constante TEMPLO_CTX por archivo en vez del literal repetido en cada llamada"
    - "tsc -p con include de test/ es el inventario real de call sites de test; el tsconfig del repo NO mira test/"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts
    - el-templo-api/src/modules/finance/movement-service.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/programs/enrollment-service.ts
    - el-templo-api/src/modules/programs/routes.ts
    - el-templo-api/test/finance/transaction-service.test.ts
    - el-templo-api/test/finance/validate-caja.test.ts
    - el-templo-api/test/finance/validation-state.test.ts
    - el-templo-api/test/finance/validation-regression.test.ts
    - el-templo-api/test/finance/summary-by-kind.test.ts
    - el-templo-api/test/finance/movement-service.test.ts
    - el-templo-api/test/finance/cash-register-service.test.ts
    - el-templo-api/test/finance/cost-centers.test.ts

key-decisions:
  - "MovementService entra al plan aunque su archivo no estaba en el <files>: sus 4 metodos publicos son los unicos duenos de 4 create y 2 voidPair, y sin ellos el codigo de produccion no compila"
  - "En coach-load, el ctx se hoistea al tope del try y REEMPLAZA los assertTenant inline del mismo handler (analog B); los re-reads del catch lo resuelven inline con etiqueta .replay porque el hoist vive dentro del try"
  - "En los tests, TEMPLO_CTX (una constante por archivo) en vez del literal { tenantId: TENANT_TEMPLO } repetido 103 veces en un solo archivo"
  - "La equivalencia de los tests se probo con una normalizacion byte a byte, no con el grep de expect( que el plan proponia (da 8 falsos positivos de reformateo)"
  - "TransactionService.resolveCashRegister quedo sin un solo call site tras CR-CAJA: se le agrego el ctx igual (esta en los 21 del plan) pero se registra como fachada muerta para el 172-09"

patterns-established:
  - "El grep `\\?\\? 1` como gate tiene falsos positivos estructurales: `filters.page ?? 1` es paginacion. El gate correcto es `tenantId!|tenantId\\s*\\?\\?`"
  - "Para probar que un refactor mecanico de tests no toco expectativas: normalizar espacios y comas colgantes, borrar el argumento agregado y comparar contra HEAD~1"

requirements-completed: []

# Metrics
duration: 55min
completed: 2026-07-30
---

# Phase 172 Plan 08: `TenantContext` de punta a punta en TransactionService Summary

**Los 21 métodos de `TransactionService` —crear, anular, validar, observar, corregir, listar, exportar y resumir— reciben el gimnasio como PRIMER parámetro, y con ellos el tipo `SubscriptionCanceller`, los 4 métodos públicos de `MovementService` y `enrollAddon`. El compilador obligó a mirar los 37 call sites de producción y los 192 de test, y encontró un archivo que el plan no listaba (`movement-service.ts`, dueño de 4 `create` y 2 `voidPair`). El camino de cancelación disparado por un void dejó de poder tocar filas ajenas: sus 2 queries de finance ahora nombran el gimnasio, y con eso mueren las 3 últimas entradas de allowlist de `subscriptions/service.ts`. `transaction-service.test.ts` 43/43 y `movement-service.test.ts` 10/10, sin una sola expectativa tocada — probado byte a byte, no por grep.**

## Performance

- **Duration:** ~55 min (22:40Z → 23:35Z), de los cuales ~4,5 min son las dos corridas contra MySQL real
- **Completed:** 2026-07-30
- **Tasks:** 4/4 (las cuatro `auto`)
- **Files modified:** 16 — +526 / −157

## Task Commits

| Task | Nombre                                                  | Commit     | Archivos                                                                                         |
| ---- | ------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| 1    | Las 21 firmas + `SubscriptionCanceller` + las 2 queries | `176c9fa4` | transaction-service.ts, subscriptions/service.ts                                                 |
| 2    | Call sites de finance/routes y coach-load-routes        | `bf8d87a5` | finance/routes.ts, coach-load-routes.ts                                                          |
| 3    | Call sites de producción ajenos (+ movement-service)    | `3f2efd18` | members/routes.ts, programs ×2, subscriptions/service.ts, movement-service.ts, finance/routes.ts |
| 4    | Call sites de test                                      | `e0039b54` | 8 archivos de test de finance                                                                    |

Los cuatro commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `334d6e96` del plan 07). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Accomplishments

- **21 métodos con `ctx: TenantContext` como PRIMER parámetro**, antes del `tx` y antes de los ids: `resolveCashRegister`, `create`, `void`, `voidPair`, `voidInTx`, `_void`, `validate`, `observe`, `correct`, `findByIdempotencyKey`, `getById`, `listForMember`, `listPendingMiscForMember`, `list`, `listPendingTray`, `listMovEgresos`, `buildListConditions`, `getFinancialHistory`, `getOutstandingConcepts`, `getSummary`, `exportRowsForExcel`. El motivo de la posición quedó escrito arriba de la clase, junto con la advertencia de que **`ctx` en la firma todavía NO significa query filtrada** (eso lo cierran el 172-10 y el 172-12) — la trampa exacta que el 172-06 encontró en `createEfectivoCaja`.
- **El tipo `SubscriptionCanceller` exige el gimnasio.** Es la única arista que sale de `finance` hacia otro módulo (un void cancela una suscripción), y ahora un canceller que no reciba el ctx no compila (T-172-08-02).
- **`_cancelSubscription` recibe el ctx del `_void` que la invoca** y sus 2 accesos a tablas strict lo nombran: `tenantWhere(schema.transactionLinks, ctx)` como primer término del guard de cobros vivos, y `tenantWhere(schema.balances, ctx)` en el `where` del UPDATE que colapsa la deuda fantasma. El docblock que el 172-07 dejó diciendo "el ctx TODAVÍA NO se usa" se reescribió: ahora baja, y decirlo mal era peor que no decirlo.
- **`MovementService` migrado entero** (4 métodos públicos + 6 llamadas internas), que el plan no había inventariado. Ver la desviación 1.
- **37 call sites de producción actualizados**, 33 de ellos con `assertTenant(request.scope, "<etiqueta que nombra la ruta>")` (T-172-08-03) y 4 pasando el ctx que el método ya tenía.
- **192 call sites de test** en 8 archivos, con `TEMPLO_CTX` derivado del fixture `TENANT_TEMPLO` — nunca un `1` a mano.
- **3 entradas de allowlist muertas y probadas con el lint.**
- **Dos archivos de test contra MySQL real, verdes:** `transaction-service.test.ts` **43/43** (142 s) y `movement-service.test.ts` **10/10** (133 s).

## Verificación

| Criterio                                                                 | Resultado                                                         |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                                 | ✅ **exit 0**                                                     |
| `tsc --noEmit \| grep -v "^test/" \| grep -c "error TS"` (tras Task 3)   | ✅ **0**                                                          |
| `tsc -p` con `include` de `test/` — errores en los 8 archivos tocados    | ✅ **0**                                                          |
| `tsc -p` con `include` de `test/` — errores `TS2554` en TODO `test/`     | ✅ **0** (cero call sites de aridad vieja en el árbol de tests)   |
| `vitest run test/finance/transaction-service.test.ts`                    | ✅ **43/43**, 142 s                                               |
| `vitest run test/finance/movement-service.test.ts`                       | ✅ **10/10**, 133 s (extra, por la desviación 1)                  |
| `grep -c "ctx: TenantContext" transaction-service.ts`                    | **23** (pedía ≥ 21)                                               |
| `grep -c "tenantWhere(schema.transactionLinks" subscriptions/service.ts` | **1** (pedía ≥ 1)                                                 |
| `grep -c "tenantWhere(schema.balances" subscriptions/service.ts`         | **1** (pedía ≥ 1)                                                 |
| `grep -c "assertTenant(request.scope" finance/routes.ts`                 | **31** (pedía ≥ 20)                                               |
| `grep -c "assertTenant(request.scope" coach-load-routes.ts`              | **10** (pedía ≥ 8)                                                |
| `grep -c "assertTenant(request.scope" members/routes.ts`                 | **6** (pedía ≥ 2)                                                 |
| `grep -c "ctx: TenantContext" programs/enrollment-service.ts`            | **1** (pedía ≥ 1)                                                 |
| `grep -nE "tenantId!\|tenantId\s*\?\?"` en los 8 archivos de `src`       | sin líneas (ver desviación 3 sobre el regex del plan)             |
| `git diff` de `finance/routes.ts`: status y mensajes de error            | ✅ sin una sola línea de `reply.code` / `error:` / `message:`     |
| Equivalencia byte a byte de los 8 archivos de test                       | ✅ **IDÉNTICO** en los 8 (ver abajo)                              |
| `grep -rn "TENANT_TEMPLO" test/finance/transaction-service.test.ts`      | 2 líneas (pedía ≥ 1)                                              |
| `lint-tenant --allowlist=/tmp/allowlist-172-08.json`                     | ✅ exit 0, `DISCREPANCIAS: 0`, 477 entradas                       |
| `unlistedViolations` con la allowlist filtrada                           | ✅ **0** — el plan no introdujo un acceso violador nuevo          |
| `pnpm lint:tenant` (allowlist real)                                      | `DISCREPANCIAS: 24` — las 21 heredadas + las 3 que paga este plan |
| `prettier --check` sobre los 16 archivos                                 | ✅                                                                |
| Inventario de exenciones `tenant-safe`                                   | **10** — el mismo de 172-01, ninguna nueva                        |
| `git status --porcelain` en `et-172`                                     | vacío                                                             |
| `tenant-lint-allowlist.json` modificado                                  | no (dueño único = 172-21)                                         |

### La prueba de que los tests no cambiaron de expectativa

El criterio del plan era `git diff -- el-templo-api/test | grep -c "^[-+].*expect("` **= 0**. Dio **8**, y las 8 son falsos positivos: prettier reenvolvió líneas del tipo `await expect(txService.validate(tx.id, adminId)).rejects.toThrow(BadRequestError)` porque el argumento nuevo las pasó de 80 columnas. El matcher es idéntico en las 8.

Como ese grep no prueba lo que importa, se hizo la prueba fuerte: para cada uno de los 8 archivos, tomar la versión nueva, **borrarle el import del fixture, el bloque de `TEMPLO_CTX` y todas las apariciones de `TEMPLO_CTX,`**, normalizar espacios y comas colgantes, y compararla contra `HEAD~1`. Los 8 dan **IDÉNTICO**. O sea: lo único que cambió en el árbol de tests es el argumento de gimnasio. Ni una expectativa, ni un dato de fixture, ni un id.

### Call sites actualizados, archivo por archivo

**Producción — 37 call sites en 8 archivos:**

| Archivo                                      | Call sites | Detalle                                                                                    |
| -------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `src/modules/finance/routes.ts`              | **17**     | 13 de `transactionService` + 4 de `movementService` (desviación 1)                         |
| `src/modules/finance/coach-load-routes.ts`   | **9**      | 2 `create` + 6 `findByIdempotencyKey` + 1 `list`; 3 ctx hoisteados + 3 inline en los catch |
| `src/modules/finance/movement-service.ts`    | **6**      | 4 `txnService.create` + 2 `txnService.voidPair` (desviación 1)                             |
| `src/modules/subscriptions/service.ts`       | **2**      | `create` y `voidInTx`, con el ctx que esos métodos ya tenían del 172-07                    |
| `src/modules/members/routes.ts`              | **2**      | `financial-history` y `outstanding-concepts`                                               |
| `src/modules/programs/enrollment-service.ts` | **1**      | `transactionService.create` dentro de `enrollAddon`                                        |
| `src/modules/programs/routes.ts`             | **1**      | `enrollmentService.enrollAddon`                                                            |
| `src/modules/finance/transaction-service.ts` | **8**      | internos: 4 `_void`, 1 `create`, 2 `buildListConditions`, 1 `_cancelSubscription`          |

**Test — 192 call sites en 8 archivos:**

| Archivo                                      | Call sites | En el `<files>` del plan |
| -------------------------------------------- | ---------- | ------------------------ |
| `test/finance/transaction-service.test.ts`   | **103**    | sí                       |
| `test/finance/validate-caja.test.ts`         | **33**     | sí                       |
| `test/finance/validation-state.test.ts`      | **28**     | sí                       |
| `test/finance/movement-service.test.ts`      | **12**     | sí                       |
| `test/finance/validation-regression.test.ts` | **10**     | sí                       |
| `test/finance/cash-register-service.test.ts` | **3**      | **no** (desviación 2)    |
| `test/finance/summary-by-kind.test.ts`       | **2**      | sí                       |
| `test/finance/cost-centers.test.ts`          | **1**      | **no** (desviación 2)    |
| `test/branch-access.test.ts`                 | **0**      | sí — no tiene ninguno    |
| `test/programs/admin-addons.test.ts`         | **0**      | sí — ejercita por HTTP   |

`branch-access.test.ts` construye un `TransactionService` (línea 735) pero **sólo para inyectarlo en el constructor de `SubscriptionService`**; lo que ejercita es `bookings.reserve`. `admin-addons.test.ts` no toca `EnrollmentService`: usa `app.inject`. Los dos quedaron sin modificar, con el cero medido y no supuesto.

### 📌 Entradas de allowlist que paga este plan: **3**

```
el-templo-api/src/modules/subscriptions/service.ts | balances
el-templo-api/src/modules/subscriptions/service.ts | financial_transactions
el-templo-api/src/modules/subscriptions/service.ts | transaction_links
```

Las tres son de **finance dentro de suscripciones** y las tres murieron por el mismo cambio: el `tenantWhere` del guard de cobros vivos (que joinea `transaction_links` con `financial_transactions` en un solo statement) y el del UPDATE de `balances`. Es el complemento exacto de lo que el 172-07 no pudo pagar: aquel plan migró 2 accesos y el archivo conservó las 18 entradas porque el ratchet razona por `(archivo, tabla)` y `_cancelSubscription` seguía violando esas 3 tablas. **`subscriptions/service.ts` baja de 18 a 15 entradas vivas** — las 15 restantes son de las tablas de suscripciones, que migran las fases 173-175.

**Cuenta acumulada para el plan 172-21: 9 (02) + 4 (03) + 6 (04) + 2 (06) + 0 (07) + 3 (08) = 24 entradas a borrar de `tenant-lint-allowlist.json`.** La evidencia ejecutable vigente pasa a ser **`/tmp/allowlist-172-08.json` (477 entradas)**, derivado de `/tmp/allowlist-172-06.json` quitándole estas 3. El lint sale `DISCREPANCIAS: 0` contra él con este plan adentro, y `unlistedViolations: 0` — o sea que el plan tampoco introdujo un acceso violador nuevo, que era el otro riesgo de tocar 16 archivos.

## Decisions Made

### 1. En `coach-load-routes.ts` el ctx se hoistea y REEMPLAZA los `assertTenant` inline del mismo handler

Los tres handlers de la PoS del profe (`/pay-plan`, `/misc`, `/alta`) llaman a varios métodos del service **y además** a `validateBankAccountForCharge` y a `assignPlan`, que ya recibían su propio `assertTenant` inline de los planes 172-06 y 172-07. Dejar el hoist Y los inline habría significado resolver el mismo gimnasio hasta tres veces por request, con tres etiquetas distintas para un único 403 posible. Se hoisteó `const ctx = assertTenant(request.scope, "coach-load.<ruta>")` como primera sentencia del `try` y los inline del mismo handler pasaron a ser `ctx`.

**Lo que NO se pudo unificar, y por qué:** los tres `findByIdempotencyKey` que viven en el `catch` de idempotencia. El hoist está dentro del `try`, así que no es visible desde el `catch` — y **sacarlo afuera del `try` cambiaría el manejo del error**: un `TENANT_UNRESOLVED` lanzado antes del `try` no pasaría por `handleServiceError` y saldría con el formato de error por default de Fastify en vez del del módulo. Esos 3 resuelven el ctx inline con etiqueta `.replay`, que además hace distinguible en el log si el 403 salió del camino normal o del replay.

### 2. En los tests, una constante por archivo en vez del literal repetido

El `<action>` del Task 4 pedía `{ tenantId: TENANT_TEMPLO }` como primer argumento de cada llamada. En `transaction-service.test.ts` eso son **103 copias del mismo literal**. Se declaró un `const TEMPLO_CTX = { tenantId: TENANT_TEMPLO };` por archivo, con el comentario que explica de dónde sale el gimnasio. Es la regla DRY del `CLAUDE.md` ("flag repetition aggressively") aplicada a un refactor mecánico, y tiene una consecuencia práctica: el día que un caso de la batería ISO-03 tenga que ejercitar **dos** gimnasios, el segundo se agrega al lado del primero y la diferencia se ve, en vez de esconderse entre 103 literales iguales. El criterio de aceptación (`grep -rn "TENANT_TEMPLO"` ≥ 1 línea) se cumple igual.

### 3. `TransactionService.resolveCashRegister` se migró aunque ya no tiene un solo caller

El plan lo lista entre los 21 y ahí quedó, pero conviene registrar el estado real: **CR-CAJA (la base `a6272df0` de esta fase) borró su último call site.** Era una fachada que existía para que `SubscriptionService.renewSubscription` pre-resolviera la caja sugerida; la reescritura de `coach-load-routes.ts` eliminó `resolveSuggestedCaja` y con él la llamada. Hoy `grep -rn "transactionService.resolveCashRegister" src/ test/` no devuelve nada. **No se borró** —es código muerto, no un bug, y borrarlo es una decisión de alcance que no le toca a este plan—, pero el 172-09, que migra `cashRegisterService.resolveCashRegister`, debería decidir si la fachada sigue teniendo sentido.

### 4. El gate `?? 1` del plan tiene falsos positivos estructurales

`grep -nE "tenantId!|\?\? 1"` sobre `transaction-service.ts` devuelve 4 líneas: son `const page = Math.max(1, filters.page ?? 1)` en los cuatro métodos paginados, preexistentes y sin relación con tenancy. El regex correcto para lo que el gate quiere prohibir es **`tenantId!|tenantId\s*\?\?`**, y con ese los 8 archivos de `src` salen limpios. Se documenta porque es la segunda vez en la fase que este gate muerde por su redacción (el 172-07 tuvo que reescribir un comentario que citaba la regla) y porque los planes 172-09 en adelante lo copian.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueante] `movement-service.ts` no estaba en el plan y sin él el código de producción no compila**

- **Found during:** Task 3 (lo marcó `tsc` apenas cambiaron las firmas del Task 1)
- **Issue:** el `<files>` del plan no incluye `src/modules/finance/movement-service.ts`, pero ese archivo es el **único dueño** de 4 llamadas a `transactionService.create` (las dos patas de un movimiento inter-caja, el ajuste de arqueo y el egreso) y de 2 a `voidPair` (anular movimiento, anular egreso). Son 6 de los caminos de escritura de plata del módulo. `tsc` reportó 6 errores ahí que ningún otro task del plan podía cerrar, y el criterio de aceptación del Task 3 pide **cero** errores fuera de `test/`.
- **Fix:** `ctx: TenantContext` como primer parámetro de `registerMovement`, `registerExpense`, `voidMovement` y `voidExpense`; el ctx baja a las 6 llamadas internas; los 4 call sites de `finance/routes.ts` lo resuelven con `assertTenant` (`finance.movements.create`, `finance.expenses.create`, `finance.movements.void`, `finance.expenses.void`).
- **Verificación que este plan pagó de su bolsillo:** `test/finance/movement-service.test.ts` **10/10 verde** contra MySQL real. El plan sólo pedía `transaction-service.test.ts`, que no ejercita ni un movimiento ni un egreso — la desviación habría quedado sin probar.
- **Por qué el plan no lo vio:** el `<read_first>` del Task 3 enumera los call sites de `subscriptions/service.ts` por número de línea (L558, L1557, L1786, L4288), o sea que el inventario se hizo por lectura dirigida y no por un grep de `transactionService\.` sobre todo `src/`. `movement-service.ts` llama al service por el campo `this.txnService`, con **otro nombre**, así que un grep del nombre de la variable tampoco lo habría encontrado.
- **Files modified:** `src/modules/finance/movement-service.ts`, `src/modules/finance/routes.ts`
- **Committed in:** `3f2efd18`

**2. [Rule 1 - Bug del plan] El inventario de call sites de test del plan estaba incompleto en los dos sentidos**

- **Found during:** Task 4
- **Issue:** el `<files>` del Task 4 nombra 8 archivos. Dos de ellos (`test/branch-access.test.ts` y `test/programs/admin-addons.test.ts`) **no tienen un solo call site** —el primero construye el service sólo para inyectarlo, el segundo ejercita por HTTP—, y dos que **sí los tienen** no están listados: `test/finance/cash-register-service.test.ts` (3) y `test/finance/cost-centers.test.ts` (1). Los cuatro que sí estaban bien concentran el 98% del trabajo.
- **Fix:** se tocaron los 6 archivos con call sites reales del plan + los 2 que faltaban = 8 archivos, 192 call sites. Los 2 sin call sites no se tocaron.
- **Cómo se armó el inventario correcto, que es lo reutilizable:** el `<read_first>` del Task 4 decía que "la salida de `pnpm exec tsc --noEmit` al terminar el Task 3 es el inventario exacto" — y el 172-07 ya había documentado que **`tsc` no mira `test/`** (`include: ["src/**/*"]`). En vez de volver al grep, se creó un `tsconfig.test-check.json` temporal que extiende el del repo con `include: ["src/**/*", "test/**/*"]`. Con eso el compilador SÍ ve los tests, y el filtro `grep -c "error TS2554"` (aridad incorrecta) sobre **todo** `test/` dio **0** al terminar: prueba positiva de que no queda un solo call site de aridad vieja en el árbol de tests, que es infinitamente más fuerte que un grep de nombres de método. El archivo temporal se borró (`git status` vacío) y **nunca se stageó**.
- **Files modified:** los 2 que faltaban; los 2 sin call sites, ninguno
- **Committed in:** `e0039b54`

**3. [Rule 1 - Bug propio] El docblock nuevo hacía fallar el grep de `?? 1`**

- **Found during:** Task 1
- **Issue:** el comentario que se agregó arriba de la clase citaba literalmente `` `tenantId!` ni `?? 1` `` y el criterio de aceptación es un grep sin líneas. Es exactamente la trampa que el 172-07 documentó en su decisión 4 y que su propio plan volvió a pisar.
- **Fix:** reescrito como "Prohibido narrowear el `tenantId` con un non-null assertion o con un default numérico al gimnasio 1".
- **Files modified:** `src/modules/finance/transaction-service.ts`
- **Committed in:** `176c9fa4` (antes del commit, no hubo commit sucio)

**4. [Rule 2 - Documentación que miente] El docblock de `cancelSubscription` decía que el ctx no se usa**

- **Found during:** Task 1
- **Issue:** el 172-07 dejó escrito en mayúsculas _"este método ya lo RECIBE pero TODAVÍA NO LO USA … Hasta entonces, la cancelación NO está scopeada"_. Este plan es el "entonces": el ctx ahora baja a `_cancelSubscription` y las 2 queries lo nombran. Un docblock que afirma lo contrario de lo que hace el código es peor que no tener docblock — el próximo lector habría asumido que la cancelación sigue sin scopear y podría haber "arreglado" algo que ya está bien.
- **Fix:** reescrito para decir qué pasa hoy: el ctx baja, y las dos queries de tablas strict del camino (el guard sobre `transaction_links` y el colapso sobre `balances`) lo nombran.
- **Files modified:** `src/modules/subscriptions/service.ts`
- **Committed in:** `176c9fa4`

---

**Total deviations:** 4 auto-fixed (2 × Rule 1, 1 × Rule 2, 1 × Rule 3). La #1 agranda el alcance en un archivo de producción **porque sin él el plan no cumple su propio criterio de terminado**; la #2 lo corrige en las dos direcciones (2 archivos menos, 2 más); las #3 y #4 son higiene del gate y de la documentación.

## Issues Encountered

**El lint sigue ROJO contra la allowlist REAL en esta rama, ahora por 24 entradas.** Quien corra `pnpm lint:tenant` sin `--allowlist` en `feat/172-adopcion-finance` ve `DISCREPANCIAS: 24`, todas `staleNoLongerViolating`. **Son 24 entradas pidiendo que las borren**, no una regresión. El dueño único del archivo es el plan 172-21. **Si la rama se mergeara a `staging` antes de ese plan, CI queda rojo por esto.**

**Los commits del Task 1 y del Task 2 no compilan por separado.** Es el diseño del plan (Task 1 cambia firmas, Tasks 2 y 3 los call sites) y su propio criterio de aceptación lo dice ("al terminar el Task 4, `tsc` sale con código 0"). En la práctica `tsc` llegó a **exit 0** un task antes, al cerrar el Task 3. Consecuencia: **`git bisect` sobre `176c9fa4` y `bf8d87a5` no compila**; los cuatro commits viajan juntos al merge de la fase, así que en `staging`/`master` no hay ventana rota.

**`tsc` no typechequea `test/` — pero se le puede pedir que lo haga, y conviene.** El `tsconfig.json` del repo tiene `include: ["src/**/*"]`. Corriendo `tsc -p` con un config temporal que incluya `test/**/*`, el árbol de tests arroja **182 errores de tipos preexistentes** (inserts de Drizzle a los que les faltan columnas obligatorias, `moduleResolution` en un par de archivos, casts de `ResultSetHeader`). **Ninguno es de este plan** —los 8 archivos tocados dan 0 errores y los `TS2554` de todo `test/` son 0— pero el número vale registrarlo: hoy un call site de test desactualizado **no da rojo en CI hasta que el test corre**, y limpiar esos 182 sería lo que permitiría convertir esto en un gate. No es trabajo de esta fase.

**Riesgo residual que este plan NO cierra, para los planes 172-10 y 172-12:** las ~90 queries de `transaction-service.ts` **siguen sin `tenantWhere`**. El `ctx` llega a todas las firmas, pero el archivo conserva sus entradas de allowlist enteras y un actor del gimnasio A que pase un id de transacción del B sigue leyéndolo. Está escrito arriba de la clase con esas palabras para que nadie confunda "tiene ctx" con "está migrado" — la trampa exacta de `createEfectivoCaja` que el 172-06 documentó.

**Riesgo residual heredado, sin cambios:** `cashRegisterService.getBalance` sigue sin `ctx` (172-06, plan 172-09).

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas, no instala paquetes. Las rutas tocadas conservan sus guards (`FINANCE_READ_ROLES` a nivel plugin + los checks en-handler de `FINANCE_VOID_ROLES`/`ADMIN_ROLES`, `FINANCE_LOAD_ROLES` en coach-load, `requireBranchAccess` donde ya estaba) y su `handleServiceError`. El `git diff` de `finance/routes.ts` **no contiene una sola línea con `reply.code`, `error:` ni `message:`**, verificado.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-08-01 | ✅ los 33 narrowings de `request.scope` pasan por `assertTenant`; `grep -nE "tenantId!\|tenantId\s*\?\?"` sin líneas en los 8 archivos de `src` (ver decisión 4 sobre el regex del plan) |
| T-172-08-02 | ✅ el tipo `SubscriptionCanceller` exige el ctx, y `_cancelSubscription` lo usa en sus 2 queries de tablas strict — no es sólo un parámetro que viaja                                    |
| T-172-08-03 | ✅ cada call site pasa una etiqueta que nombra la ruta (`finance.transactions.void`, `coach-load.alta`, `members.outstanding-concepts`, …), incluidas las `.replay` de los catch         |
| T-172-08-04 | ✅ `TENANT_TEMPLO` importado del fixture en los 8 archivos, ni un `1` a mano; no se agregó ningún id de `users` hardcodeado (los archivos resuelven `admin@test.com` como ya hacían)     |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                             |

## Next Phase Readiness

**Listo para el 172-09.** Seis cosas que los planes siguientes tienen que dar por sentadas:

1. **Las 21 firmas de `TransactionService` cambiaron y el `ctx` va PRIMERO.** Cualquier plan que agregue un método a esa clase tiene que seguir la convención o el docblock de arriba de la clase queda mintiendo.
2. **Tener `ctx` ≠ estar migrado.** Las ~90 queries del archivo siguen sin filtro; los planes **172-10** (escrituras) y **172-12** (lecturas) son los que las cierran, y son los que hacen morir las entradas de allowlist de `transaction-service.ts`.
3. **`movement-service.ts` ya tiene `ctx` en sus 4 métodos públicos** (desviación 1). El plan que migre sus queries hereda las firmas y los 4 call sites de ruta resueltos.
4. **`TransactionService.resolveCashRegister` es una fachada sin callers** desde CR-CAJA (decisión 3). El 172-09 decide si la borra.
5. **El inventario de call sites de test se saca con `tsc -p` y un config temporal que incluya `test/**/\*`**, no con grep: `TS2554`sobre todo`test/` es la prueba positiva de que no quedó ninguno. Ojo con los 182 errores de tipos preexistentes del árbol de tests, que son ruido de fondo y no de la fase.
6. **La allowlist acumula 24 entradas muertas** (9 + 4 + 6 + 2 + 0 + 3). El plan 172-21 borra las 24. La evidencia ejecutable vigente es `/tmp/allowlist-172-08.json` (477 entradas).

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-08-SUMMARY.md`
- `FOUND` commits `176c9fa4` (T1), `bf8d87a5` (T2), `3f2efd18` (T3) y `e0039b54` (T4) en `feat/172-adopcion-finance`
- `FOUND` los 16 archivos modificados en `git diff --stat 334d6e96..HEAD` (+526 / −157)
- `VERIFIED` `pnpm exec tsc --noEmit` exit 0
- `VERIFIED` `transaction-service.test.ts` 43/43 y `movement-service.test.ts` 10/10 contra MySQL real
- `VERIFIED` equivalencia byte a byte de los 8 archivos de test tras quitarles el `TEMPLO_CTX`
- `VERIFIED` `lint-tenant --allowlist=/tmp/allowlist-172-08.json` exit 0, `DISCREPANCIAS: 0`, `unlistedViolations: 0`
- `VERIFIED` `git status --porcelain` en `et-172` vacío y `tenant-lint-allowlist.json` sin modificar
- `VERIFIED` `tsconfig.test-check.json` temporal borrado y nunca stageado

**ADO-01 NO se marca completo**, misma convención que 172-01/02/03/04/06/07: el requisito exige `finance` migrado entero (services + sentinel + aislamiento verde) y lo citan 18 de los 23 planes. Este plan cierra **la plomería** de `TransactionService`, no sus queries.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
