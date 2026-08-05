---
phase: 172-adopci-n-1-piloto-finance
plan: 10
subsystem: finance
tags:
  [
    tenancy,
    finance,
    transaction-service,
    escrituras,
    cobro,
    anulacion,
    validacion,
    tenantWhere,
    tenantValues,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "src/modules/shared/tenant.ts (tenantWhere / tenantValues / TenantContext)"
  - phase: 170-sentinel-lint
    provides: "src/db/scripts/lint-tenant.ts y tenant-lint-allowlist.json (ratchet)"
  - plan: 172-01
    provides: "worktree et-172 sobre a6272df0, baseline verde, allowlist en 501 entradas"
  - plan: 172-08
    provides: "las 21 firmas de TransactionService con ctx PRIMERO (este plan no cambia ninguna)"
  - plan: 172-09
    provides: "balance/cash-register/movement cerrados; el applyDelta que create() y _void() invocan ya filtra"
provides:
  - "create(): las 8 queries de validacion y re-lectura filtran por gimnasio y los 2 INSERT estampan el tenant por tenantValues"
  - "findByIdempotencyKey y getById: 5 queries filtradas — una transaccion ajena devuelve null y el handler contesta 404 (D-09)"
  - "_void/void/voidPair/voidInTx: 7 queries filtradas, incluido el UPDATE de anulacion con su propio tenantWhere"
  - "correct(): 3 lecturas filtradas + el link de procedencia por tenantValues"
  - "validate() y observe(): 9 queries filtradas, incluida la caja elegida al validar"
  - "2 entradas de allowlist muertas: transaction-service.ts | program_enrollments y | user_status_history"
affects: [172-12, 172-13, 172-21, 172-22, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Los conteos del PATTERNS son referencias `schema.X`, NO queries: sobrestiman los tenantWhere esperados (tercera vez en la fase que un criterio numerico queda alto)"
    - "Las lineas del PLAN se derivaron de origin/master: el archivo ya crecio 57 lineas con los planes 08 y 09, asi que los `sed -n 'A,Bp'` de los criterios apuntan al metodo equivocado — se re-derivan por nombre de metodo"
    - "En un `.map(...)` que alimenta `.values([...])` el tipo contextual SI se conserva: `tenantValues(ctx, {...})` con `targetKind: l.targetKind` compila sin `as const` (el caso del 172-09 era un array LITERAL)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/transaction-service.ts

key-decisions:
  - "El leftJoin de getById lleva el tenantWhere en el ON y no en el WHERE: en el WHERE lo convertiria en inner join y perderia la fila cuando no hay alumno creado (patron 172-06)"
  - "Los 3 UPDATE del archivo (anulacion, validacion, observacion) llevan tenantWhere propio aunque el SELECT de arriba ya corto: el WHERE de una escritura no se apoya en una lectura"
  - "El INSERT de user_status_history pasa por tenantValues aunque la tabla no es strict: D-06 exige que el archivo quede sin NINGUNA entrada de allowlist, no solo sin las de tablas strict"
  - "resolveCashRegister (la fachada muerta que el 172-08 y el 172-09 dejaron viva) sigue sin tocarse: no tiene queries propias, delega en cash-register-service que ya esta migrado"

patterns-established:
  - "Un criterio de aceptacion que cita numeros de linea de un archivo que otros planes ya modificaron se re-deriva por `grep -n 'async <metodo>('` antes de medir"

requirements-completed: []

# Metrics
duration: 16min
completed: 2026-07-30
---

# Phase 172 Plan 10: Los caminos de escritura del cobro, aislados Summary

**Los cinco caminos por los que `transaction-service.ts` ESCRIBE plata —cobrar, anular, corregir, validar y observar— más las dos búsquedas por id (`getById`, `findByIdempotencyKey`) quedan encerrados en el gimnasio del staff que ejecuta: 32 `tenantWhere` y 4 `tenantValues` sobre las 24 queries de esos métodos, sin cambiar una sola firma, un solo mensaje de error ni un solo orden de operaciones. Los tres UPDATE (anulación, validación, observación) llevan su propio filtro y no se apoyan en el SELECT de arriba. `validation-state` 18/18 y `validate-caja` 18/18 contra MySQL real, sin tocar una expectativa.**

## Performance

- **Duration:** ~16 min (21:00 → 21:12 -03, más 4,5 min de las dos corridas contra MySQL real)
- **Completed:** 2026-07-30
- **Tasks:** 3/3 (las tres `auto`)
- **Files modified:** 1 — +272 / −90

## Task Commits

| Task | Nombre                                                 | Commit     | Archivos               |
| ---- | ------------------------------------------------------ | ---------- | ---------------------- |
| 1    | `create`, `findByIdempotencyKey` y `getById`           | `fb3b0b62` | transaction-service.ts |
| 2    | `void` / `voidPair` / `voidInTx` / `_void` y `correct` | `cd0709c4` | transaction-service.ts |
| 3    | `validate` y `observe` + pruebas dirigidas             | `162a81cf` | transaction-service.ts |

Los tres commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `21cfbcda` del plan 09). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Accomplishments

- **`create()` — las 8 queries y los 2 INSERT.** Las cuatro sondas de `target_kind` (TXN-07, integridad referencial) eran el agujero más silencioso del método: verificaban que la suscripción, el saldo, la transacción o la inscripción **existieran**, sin preguntar de qué gimnasio. Un link a un `debt_balance` ajeno pasaba el guard y el cobro nacía imputado contra el saldo del vecino. Ahora la fila ajena no matchea y cae en el `NotFoundError` que ya existía, con el mismo texto.
- **Los dos INSERT del cobro por `tenantValues(ctx, {...})`** (T-172-10-02): la fila de `financial_transactions` y las de `transaction_links` nacen en el gimnasio del `ctx`, con el tenant **después** del spread — el body del request no puede pisarlo aunque un día llegue spreadeado hasta acá.
- **`getById` y `findByIdempotencyKey` filtradas** (T-172-10-03). Las dos devuelven `null` para una transacción ajena, así que el handler cae en su rama not-found actual: **404, nunca 403** (contrato D-09). No hizo falta tocar un solo `reply.code`.
- **El `leftJoin` del alumno creado lleva el filtro en el ON.** En el `WHERE` habría convertido el left join en inner y `getById` habría dejado de devolver las transacciones sin alumno creado —o sea, casi todas—. Es el hallazgo del 172-06 aplicado a un join que el plan no marcaba.
- **Los 3 UPDATE con `tenantWhere` propio** (T-172-10-01): anulación, validación y observación. Los tres tienen un SELECT arriba que ya cortó, así que en el flujo normal el filtro no cambia el resultado — se puso igual, con el comentario que dice por qué: **el `WHERE` de una escritura no se apoya en una lectura anterior**. El día que alguien reordene el método o cachee el SELECT, el UPDATE sigue sin poder anular la fila del vecino.
- **El cascade de alta de `_void` filtrado en las 3 patas**: el SELECT del alumno creado, el UPDATE que lo pasa a `inactivo` y el INSERT en `user_status_history` (por `tenantValues`). Sin esto, anular un cobro con un `created_member_id` de otro gimnasio desactivaba a un alumno ajeno.
- **`validate` con la caja elegida filtrada** (T-172-10-04). Es la superficie más peligrosa de las tres del task 3: el `cashRegisterId` **llega del body** de `POST /transactions/:id/validate`, y sin filtro gestión podía imputar un cobro propio contra una caja de otro gimnasio — plata que aparece en un arqueo ajeno sin que ninguna de las dos partes lo vea.
- **`correct()` cerrado en sus 4 accesos** (3 lecturas + el link de procedencia por `tenantValues`). El `create()` que dispara adentro ya viaja migrado por el Task 1, y el `_void` que lo precede por el Task 2: los tres pasos del anular-y-recrear filtran.
- **2 entradas de allowlist muertas y probadas con el lint.**
- **36 tests contra MySQL real, verdes**, sin tocar una expectativa: `validation-state.test.ts` **18/18** (129 s) y `validate-caja.test.ts` **18/18** (121 s).

## Verificación

| Criterio                                                                     | Resultado                                                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                                     | ✅ **exit 0** (después de cada task)                                      |
| `pnpm exec vitest run test/finance/validation-state.test.ts`                 | ✅ **18/18**, 129 s                                                       |
| `pnpm exec vitest run test/finance/validate-caja.test.ts`                    | ✅ **18/18**, 121 s                                                       |
| `lint-tenant --allowlist=/tmp/allowlist-172-10.json` (466 entradas)          | ✅ **exit 0**, `DISCREPANCIAS: 0`                                         |
| `unlistedViolations` con la allowlist filtrada                               | ✅ **0** — no se introdujo un acceso violador nuevo                       |
| `staleNoLongerViolating` / `staleMissingFile` / `strictWithAllowlist`        | ✅ **0 / 0 / 0**                                                          |
| `create()` (L188-450): `grep -c "tenantWhere("`                              | **8** (el plan pedía ≥ 8 — ver desviación 1)                              |
| `findByIdempotencyKey` + `getById` (L1040-1119)                              | **5** (pedía ≥ 3)                                                         |
| `void`…`_void` (L451-755)                                                    | **7** (el plan pedía ≥ 10 — ver desviación 2)                             |
| `correct()` (L950-1088)                                                      | **3** (el plan pedía ≥ 5 — ver desviación 2)                              |
| `validate` + `observe` (L756-984)                                            | **9** (pedía ≥ 8)                                                         |
| `grep -c "tenantValues(ctx"` en el archivo                                   | **4** (el plan pedía ≥ 3 al cerrar el Task 1, donde son 2 — desviación 3) |
| Queries sin filtro en los rangos migrados (`grep -c "where(eq("`)            | **0** en los tres rangos                                                  |
| Todo `.update(schema.financialTransactions)` con `tenantWhere` en su `where` | ✅ **3 de 3**                                                             |
| `git diff \| grep -c "^[-+].*throw new"`                                     | **0** — no se tocó un solo error                                          |
| `grep -nE "tenantId!\|tenantId\s*\?\?"`                                      | sin líneas                                                                |
| `prettier --check`                                                           | ✅                                                                        |
| Inventario de exenciones `tenant-safe`                                       | **10** — el mismo de 172-01, ninguna nueva                                |
| `git status --porcelain` en `et-172`                                         | vacío                                                                     |
| `tenant-lint-allowlist.json` modificado                                      | no (dueño único = 172-21)                                                 |
| Archivos de test modificados                                                 | **ninguno** (el plan no cambia firmas)                                    |

### 📌 Entradas de allowlist que paga este plan: **2**

```
el-templo-api/src/modules/finance/transaction-service.ts | program_enrollments   ← colateral (D-06)
el-templo-api/src/modules/finance/transaction-service.ts | user_status_history   ← colateral (D-06)
```

Las dos son **colaterales**: tablas no strict que el archivo toca y que D-06 obliga a limpiar igual. Son las únicas que podían morir en este plan, porque el ratchet razona por **(archivo, tabla)** y las 9 restantes de `transaction-service.ts` (`balances`, `cash_registers`, `cost_centers`, `financial_transactions`, `transaction_links`, `branches`, `subscription_plans`, `subscriptions`, `users`) siguen vivas: los métodos de LECTURA —`list`, `listPendingTray`, `listMovEgresos`, `getSummary`, `exportRowsForExcel`, `getFinancialHistory`, `getOutstandingConcepts`, `listForMember`, `listPendingMiscForMember`, `buildListConditions`— todavía no filtran. **Ese es el plan 172-12, y es el que saca al archivo entero de la allowlist.**

Que estas dos hayan muerto es información útil para el 172-12: `program_enrollments` y `user_status_history` **sólo** se tocan desde caminos de escritura, así que el plan de lecturas no las va a volver a encontrar.

**Cuenta acumulada para el plan 172-21: 9 (02) + 4 (03) + 6 (04) + 2 (06) + 0 (07) + 3 (08) + 9 (09) + 2 (10) = 35 entradas a borrar de `tenant-lint-allowlist.json`.** La evidencia ejecutable vigente pasa a ser **`/tmp/allowlist-172-10.json` (466 entradas)**, derivada de `/tmp/allowlist-172-09.json` quitándole estas 2.

## Decisions Made

### 1. El `tenantWhere` del `leftJoin` de `getById` va en el ON, no en el WHERE

`getById` hace `leftJoin` contra un alias de `users` (`created_member`) para surfacar el nombre del alumno que la carga creó. Poner el filtro del alias en el `WHERE` es el error clásico: convierte el left join en **inner** y la query deja de devolver las transacciones cuyo `created_member_id` es `NULL` — o sea todas las que no vinieron del alta de la PoS del profe, que son la enorme mayoría. `getById` habría empezado a devolver `null` para casi cualquier transacción.

Es exactamente el hallazgo que el plan 172-06 dejó escrito y que el `<action>` de este plan no menciona (habla de "cada query", no de joins). Queda con comentario en el código porque el próximo que lea ese `and(...)` dentro de un `.leftJoin()` va a querer "ordenarlo" moviéndolo al `where`.

### 2. `user_status_history` entra aunque no es una tabla strict de finance

El `<action>` del Task 2 la nombra, y está bien que lo haga: D-06 exige que el archivo termine **sin ninguna entrada de allowlist**, no sólo sin las de las 6 tablas strict. El INSERT del cascade de alta pasa por `tenantValues` y el SELECT/UPDATE de `users` del mismo bloque por `tenantWhere`. Sin eso, la entrada `transaction-service.ts | user_status_history` habría sobrevivido hasta el 172-12 sin que ningún método de lectura pudiera matarla — el 172-12 no toca ese camino.

### 3. `resolveCashRegister` (la fachada muerta) sigue sin tocarse

El 172-08 (decisión 3) y el 172-09 (decisión 2) la dejaron viva y le pasaron la decisión al plan que leyera el archivo entero. Este plan lee **la mitad** (las escrituras), así que no es ese plan — y además **no hay nada que migrar**: el método no tiene queries propias, delega verbatim en `cashRegisterService.resolveCashRegister`, que el 172-09 ya cerró. La decisión de borrarla o no sigue abierta para el 172-12, que sí lee el archivo completo.

### 4. Los criterios numéricos del plan se re-derivaron por nombre de método

Los `sed -n '158,375p'` / `'375,640p'` / `'826,955p'` / `'955,1005p'` del plan salen del PATTERNS, que se derivó sobre `origin/master` — **antes** de que los planes 172-08 y 172-09 le agregaran 57 líneas al archivo (2172 → 2229 al arrancar este plan). Aplicados tal cual, `sed -n '158,375p'` corta a mitad de `create()` y `sed -n '826,955p'` cae dentro de `observe()`, que es del Task 3. Todos los conteos de esta tabla se midieron sobre rangos re-derivados con `grep -n "async <metodo>("`. Es la segunda vez en la fase que un plan hereda números de línea rancios; la regla para los que siguen es medir por método, no por línea.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Conteo del plan] Los números de línea de los criterios apuntaban al método equivocado**

- **Found during:** Task 1
- **Issue:** los cuatro criterios con `sed -n 'A,Bp'` citan el archivo tal como estaba en `origin/master` (2172 líneas). Al arrancar este plan tenía **2229** —los planes 08 y 09 le agregaron firmas, docblocks y los `ctx` de los call sites internos— y al terminar, 2411. `sed -n '158,375p'` empieza 26 líneas **antes** de `create()` y termina 75 **antes** de que el método cierre; `sed -n '826,955p'`, que el plan asigna a `correct()`, cae entera dentro de `observe()`.
- **Fix:** ninguno en el código. Los rangos se re-derivaron con `grep -n "async <metodo>("` y se midieron los métodos completos. El criterio que sí manda —**cero queries sin filtro en los métodos del plan**— se verificó con `grep -c "where(eq("` sobre cada rango: **0** en los tres.
- **Por qué importa:** el mismo criterio, aplicado literal, habría dado números al azar y podría haber "pasado" sin haber mirado el método correcto. Es primo hermano de la desviación 4 del 172-09 (un gate que devuelve verde sin mirar nada).

**2. [Rule 1 - Conteo del plan] Los `tenantWhere` esperados del Task 2 estaban sobrestimados (7 y 3, no 10 y 5)**

- **Found during:** Task 2
- **Issue:** el criterio pedía **≥ 10** en el rango de `void`/`_void` y **≥ 5** en `correct()`. Los reales son **7** y **3**. El plan derivó los números del inventario AST-lite del PATTERNS (`void()/_void() FIN: financialTransactions×6, transactionLinks×4, users×5`), que cuenta **apariciones de `schema.X`**, no queries: una sola query nombra la tabla 2 o 3 veces (`.from()`, el `eq()` del where, la columna del select). Es la **tercera** vez en la fase que la misma sobrestimación aparece (desviaciones 2 y 3 del 172-09).
- **Fix:** ninguno en el código. Se auditó el rango completo con `grep -n "\.from(schema\.\|\.insert(schema\.\|\.update(schema\.\|where(eq("`: **12 accesos, 12 migrados, 0 sin filtro**. El criterio real —que el lint no reporte un acceso violador nuevo— se cumple: `unlistedViolations: 0`.
- **Files modified:** ninguno

**3. [Rule 1 - Conteo del plan] `tenantValues(ctx` da 2 al cerrar el Task 1, no 3**

- **Found during:** Task 1
- **Issue:** el criterio pedía **≥ 3** al terminar el Task 1. En el alcance del Task 1 hay exactamente **2** INSERT (la fila de `financial_transactions` y las de `transaction_links` de `create()`); los otros 2 del archivo —`user_status_history` en `_void` y el link de procedencia de `correct()`— son del Task 2. Al cerrar el plan el archivo tiene **4**, que es el total real.
- **Fix:** ninguno en el código; los 4 INSERT del archivo están cubiertos (`grep -c "\.insert(schema\." = 4`, `grep -c "tenantValues(ctx" = 4`).
- **Files modified:** ninguno

**4. [Rule 2 - Seguridad] El `tenantWhere` del `leftJoin` de `getById` va en el ON**

- **Found during:** Task 1 — ver decisión 1. Ponerlo donde el `<action>` sugiere ("en el `where`") habría roto `getById` para casi todas las transacciones. Es una corrección de forma que además preserva el comportamiento.
- **Files modified:** `src/modules/finance/transaction-service.ts`
- **Committed in:** `fb3b0b62`

**5. [Rule 2 - Seguridad] Los UPDATE de `validate` y `observe` también llevan `tenantWhere`**

- **Found during:** Task 3
- **Issue:** el `<action>` del Task 3 pide el filtro "en cada query … y el UPDATE de estado de validación" — o sea que `validate` sí estaba pedido, pero el de `observe` no se menciona. Los dos filtran igual, por el mismo motivo que el UPDATE de anulación del Task 2 (T-172-10-01): la escritura no se apoya en la lectura de arriba.
- **Files modified:** `src/modules/finance/transaction-service.ts`
- **Committed in:** `162a81cf`

**6. [Rule 1 - Hallazgo que matiza uno heredado] En un `.map()` el `tenantValues` NO ensancha el enum**

- **Found during:** Task 1
- **Issue:** el 172-09 (desviación 6) dejó escrito que "`tenantValues` dentro de un array literal SÍ ensancha los enums" y que hace falta `as const` por campo. El INSERT de links de `create()` es `.values(input.links.map((l) => tenantValues(ctx, {...})))` — parecía el mismo caso y **no lo es**: compiló sin un solo `as const`, porque `l.targetKind` ya llega tipado como `TargetKind` desde `CreateTransactionInput`, no como un literal que haya que preservar.
- **Fix:** ninguno. Se registra para que el 172-12 y los planes de las fases 173-175 no metan `as const` de más "por las dudas": el matiz es **de dónde sale el valor**, no de la forma sintáctica. Donde sí hizo falta fue en los 2 literales de verdad (`source: "admin"` y `targetKind: "transaction"`), que son objetos sueltos y aun así lo necesitaron por estar dentro de un `.values(...)` con firma sobrecargada.
- **Files modified:** ninguno (el `as const` de los 2 literales va en los commits de los tasks 2)

---

**Total deviations:** 6 auto-fixed (4 × Rule 1, 2 × Rule 2). Las tres primeras corrigen conteos del plan sin tocar código; la #4 evita un bug funcional que el `<action>` inducía; la #5 endurece una escritura que el plan no nombraba; la #6 matiza un hallazgo heredado que si se aplicaba a ciegas agregaba ruido.

## Issues Encountered

**El lint sigue ROJO contra la allowlist REAL en esta rama, ahora por 35 entradas.** Quien corra `pnpm lint:tenant` sin `--allowlist` en `feat/172-adopcion-finance` ve `DISCREPANCIAS: 35`, todas `staleNoLongerViolating` — **35 entradas pidiendo que las borren**, no una regresión. El dueño único del archivo es el plan 172-21. **Si la rama se mergeara a `staging` antes de ese plan, CI queda rojo por esto.**

**El archivo está migrado a la mitad y eso es visible.** `transaction-service.ts` conserva **9 entradas vivas** de allowlist y ~90 queries de lectura sin filtro. Un actor del gimnasio A que llame a `GET /transactions` sigue viendo filas del B. **No es una regresión de este plan** (era el estado heredado del 172-08/09), pero conviene decirlo con todas las letras: **este plan cierra las escrituras, no el archivo**. El 172-12 es el que lo cierra.

**El docblock de la clase quedó desactualizado a medias.** El comentario de las L25-28 dice que los `tenantWhere`/`tenantValues` "son de los planes 172-10 (escrituras) y 172-12 (lecturas)". Ahora la mitad ya está hecha, pero reescribirlo dejaría el texto mintiendo en la otra dirección hasta el 172-12 — se deja como está, con la nota de que **el 172-12 tiene que reescribirlo** cuando el archivo esté entero. Es la misma trampa que el 172-08 arregló en `cancelSubscription` (su desviación 4).

**Ningún archivo de test se tocó**, que es lo esperado: este plan no cambia una sola firma (el 172-08 ya las había cambiado todas). Por eso tampoco hizo falta el `tsconfig.test-check.json` de la receta del 172-09 ni el grep de mocks posicionales — **no hay firma nueva que un mock pueda estar imitando de más**.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas, no instala paquetes, no modifica un solo mensaje de error ni un solo código de respuesta (`git diff | grep -c "^[-+].*throw new"` = **0**).

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-10-01 | ✅ los **3** UPDATE de `financial_transactions` (anulación, validación, observación) llevan `tenantWhere` propio en su `where`, además del SELECT previo. Ídem el UPDATE de `users` del cascade de alta        |
| T-172-10-02 | ✅ los **4** INSERT del archivo pasan por `tenantValues(ctx, {...})`, con el tenant después del spread: `financial_transactions`, `transaction_links` (×2, en `create` y en `correct`) y `user_status_history` |
| T-172-10-03 | ✅ `getById` y `findByIdempotencyKey` devuelven `null` para una fila ajena y el handler cae en su rama not-found actual → **404**, sin tocar un `reply.code` (D-09)                                            |
| T-172-10-04 | ✅ `tenantWhere(schema.cashRegisters, ctx)` en la query de la caja elegida de `validate` — el `cashRegisterId` llega del body, así que era la superficie más expuesta del task 3                               |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                                   |

## Next Phase Readiness

**Listo para el 172-12** (lecturas de `transaction-service.ts`). Cinco cosas que ese plan tiene que dar por sentadas:

1. **Los métodos de escritura ya están cerrados** — `create`, `void`/`voidPair`/`voidInTx`/`_void`, `correct`, `validate`, `observe`, `getById`, `findByIdempotencyKey`. Tocarlos otra vez es re-trabajo; el 172-12 arranca en `listForMember` (L~1120 al terminar este plan).
2. **`program_enrollments` y `user_status_history` ya no están en la allowlist del archivo.** Si el 172-12 introduce un acceso nuevo a cualquiera de las dos sin filtro, el lint lo va a reportar como `unlistedViolations` (rojo duro, no ratchet).
3. **Las 9 entradas restantes de `transaction-service.ts` son todas del 172-12**: `balances`, `cash_registers`, `cost_centers`, `financial_transactions`, `transaction_links`, `branches`, `subscription_plans`, `subscriptions`, `users`. Recién con las 9 el archivo sale de la allowlist y D-06 se puede medir.
4. **El docblock de las L25-28 hay que reescribirlo en el 172-12**, no antes (issue de arriba).
5. **`buildListConditions` es el `reports/service.ts` en chiquito**: un helper privado que devuelve `SQL[]`. El riesgo 1 del PATTERNS aplica y el hallazgo de la fase vale igual — **el gimnasio y la tabla se nombran en el mismo statement**, así que el `tenantWhere` tiene que entrar en el array que el helper devuelve, no en un `const` de arriba.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-10-SUMMARY.md`
- `FOUND` commits `fb3b0b62` (T1), `cd0709c4` (T2) y `162a81cf` (T3) en `feat/172-adopcion-finance`
- `FOUND` `el-templo-api/src/modules/finance/transaction-service.ts` en `git diff --stat 21cfbcda..HEAD` (+272 / −90)
- `FOUND` `/tmp/allowlist-172-10.json` (466 entradas)
- `VERIFIED` `pnpm exec tsc --noEmit` exit 0
- `VERIFIED` `validation-state.test.ts` 18/18 y `validate-caja.test.ts` 18/18 contra MySQL real
- `VERIFIED` `lint-tenant --allowlist=/tmp/allowlist-172-10.json` exit 0, `DISCREPANCIAS: 0`, `unlistedViolations: 0`
- `VERIFIED` 0 queries sin filtro (`where(eq(`) en los rangos de los 3 tasks
- `VERIFIED` `git status --porcelain` en `et-172` vacío y `tenant-lint-allowlist.json` sin modificar

**ADO-01 NO se marca completo**, misma convención que 172-01/02/03/04/06/07/08/09: el requisito exige `finance` migrado entero (services + sentinel + aislamiento verde). Este plan cierra **la mitad de escritura del archivo más grande del módulo**; faltan sus lecturas (172-12), `routes.ts` y `coach-load-routes.ts` (172-13).

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-30_
