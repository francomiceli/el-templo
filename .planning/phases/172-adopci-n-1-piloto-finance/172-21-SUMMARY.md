---
phase: 172-adopci-n-1-piloto-finance
plan: 21
subsystem: tenancy
tags:
  [
    tenancy,
    finance,
    sentinel,
    strict,
    allowlist,
    ratchet,
    fail-closed,
    switch,
    d-15,
    demo-en-vivo,
  ]

# Dependency graph
requires:
  - plan: 172-12
    provides: "el modulo finance entero fuera de la allowlist (ultima query de lectura migrada)"
  - plan: 172-16
    provides: "el cierre de la cadena 13->16: cero queries de test sobre las 6 tablas strict sin tenant, y la deteccion de los 3 rojos de con-06-lint que este plan resuelve"
  - plan: 172-20
    provides: "ISO-03 cerrado con su gate — la bateria que corre con el sentinel ya en throw"
  - phase: 170-deteccion
    provides: "TENANT_STRICT_MODULES (vacia), el sentinel de pool, el lint y el contrato del ratchet de allowlist (D-13/D-14/D-15)"
provides:
  - "TENANT_STRICT_MODULES.finance con las 6 tablas fisicas del ROADMAP — la PRIMERA entrada strict del milestone v6.0: el sentinel hace THROW en test/dev sobre toda query sin tenant_id a esas tablas"
  - "tenant-lint-allowlist.json de 501 -> 450 entradas: cero sobre tablas strict, cero con file bajo src/modules/finance/. `pnpm lint:tenant` sale 0 con DISCREPANCIAS: 0"
  - "gate de forma reescrito en test/db/tenant-tables.test.ts: MODULOS_DECLARADOS como segunda copia escrita a mano + el `it` de coherencia D-15 contra la allowlist"
  - "los 3 rojos diferidos de con-06-lint.test.ts en verde (38/38), con la baja de la lente estatica 87 -> 81 CONTABILIZADA tabla por tabla en vez de simplemente bajada"
  - "evidencia en vivo del TenantSentinelError con el SQL adentro, leido de la cadena de cause"
affects: [172-22, 172-23, 173, 174, 175]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El interruptor va al FINAL de la fase de adopcion (D-03) y es atomico con el vaciado de la allowlist: declarar migrado un modulo y perdonarle accesos sin gimnasio son las dos mitades de una contradiccion (D-15)"
    - "El orden real del switch es allowlist PRIMERO y entrada strict DESPUES: al reves hay un commit intermedio con la suite roja, porque el gate D-15 se cae mientras conviven"
    - "Un registro critico se prueba contra una SEGUNDA COPIA escrita a mano en el test (MODULOS_DECLARADOS), no contra si mismo: es lo unico que obliga a que sumar un modulo sea un diff en dos archivos"
    - "El gate del CLI (lint) se duplica como `it` de la suite cuando su rojo es la unica defensa: el step de CI que corre el CLI esta detras del paths-filter, la suite no"
    - "Bajar un piso numerico de un gate solo es legitimo si la baja queda CONTABILIZADA por una asercion nueva que explica cada unidad perdida (87 -> 81 = las 6 tablas que entraron a strict)"
    - "El sentinel de RUNTIME evalua por QUERY, no por tabla: un solo `tenant_id` en la zona de predicado marca ok toda la query, aunque la tabla strict no sea la filtrada. La lente estatica del lint SI es por tabla"

key-files:
  created: []
  modified:
    - el-templo-api/src/db/tenant-tables.ts
    - el-templo-api/tenant-lint-allowlist.json
    - el-templo-api/test/db/tenant-tables.test.ts
    - el-templo-api/test/tenancy/con-06-lint.test.ts

key-decisions:
  - "Se borraron 51 entradas y no 47: el plan y el PATTERNS contaban por criterio (33 sobre tablas strict + 14 no-finance en archivos del modulo), pero el lint reporta 51 stale. Las 4 de diferencia son colaterales de los planes 172-02 y 172-04 (users, subscriptions, subscription_plans JOINEADAS en la misma query que se scopeo). Dejarlas habria dejado el lint ROJO: una entrada stale es discrepancia igual que una ganada (D-14). Borrar siempre es legal"
  - "El orden de los commits es el inverso al de las tasks del plan: allowlist (Task 2) primero, entrada strict + gates (Task 1) despues. Con el orden del plan, el commit intermedio deja la suite ROJA — el `it` nuevo de coherencia D-15 y el gate de con-06 se caen mientras la lista strict y la allowlist conviven"
  - "El `it` de forma no afirma `finance esta presente`: compara el registro ENTERO contra MODULOS_DECLARADOS, escrito a mano en el test. Afirmar solo la presencia dejaria pasar un modulo nuevo agregado sin decidirlo, que es justo lo que el gate existe para impedir"
  - "El gate de la lente estatica de con-06 (87 tablas con deuda) baja a 81, pero se le agrego ANTES una asercion que exige que ninguna tabla strict tenga violaciones vivas: la baja queda explicada por las 6 que se migraron y no puede volver a bajar en silencio. Bajar el numero pelado era exactamente lo que el mensaje del gate prohibia"
  - "El `it` de D-15 de con-06 ya no puede afirmar `strictTablesSet().size === 0`; pasa a afirmar que `bookings` (la tabla que el fixture inyecta) NO esta en la lista real, que es lo que de verdad prueba que el parametro manda sobre el registro (D-07)"
  - "La sonda del fail-closed NO se puso en `getById` como sugeria el plan: `getById` no tiene un solo call site en `src/`, asi que ningun test la ejercita. Se uso el primer SELECT de `validate()`, que es de UNA sola tabla"
  - "Las 8 corridas se hicieron con `--no-file-parallelism` (deferred del 172-18): es mas rapido y es la unica forma de que el verde signifique algo en esta maquina"

patterns-established:
  - "Receta del switch para las fases 173-175, en este orden exacto: (1) correr el lint y LISTAR las stale reales —no confiar en el conteo del plan—, (2) borrar TODAS las stale (el criterio del plan es un piso, no un techo), (3) escribir la entrada strict + la copia a mano en el gate de forma + el `it` de coherencia D-15, (4) demo en vivo con sonda sobre una query de UNA SOLA TABLA, (5) suites dirigidas con --no-file-parallelism"

requirements-completed: [CON-05, CON-06]

# Metrics
duration: ~40min
completed: 2026-07-31
---

# Phase 172 Plan 21: El switch — `finance` entra en modo throw Summary

**`finance` es el primer módulo del milestone v6.0 en `TENANT_STRICT_MODULES`: desde este commit, toda query sin `tenant_id` sobre `balances`, `cash_registers`, `cost_centers`, `debt_management`, `financial_transactions` o `transaction_links` **revienta** en test y dev, y la allowlist del lint no tiene una sola excusa viva para ninguna de las seis (501 → 450 entradas, `DISCREPANCIAS: 0`). El fail-closed no se afirma: se demostró sacándole el `tenantWhere` a `validate()` y capturando el `TenantSentinelError` con el SQL adentro, leído de la cadena de `cause` — sonda revertida sin commitear. **El plan decía 47 entradas a borrar y eran 51**, y la diferencia importa: las 4 extra son colaterales de los planes 02 y 04 y dejarlas habría dejado el lint rojo igual que agregarlas. **El otro hallazgo es del primer intento fallido de la demo**, que resultó más valioso que el éxito: el sentinel de runtime evalúa **por query**, no por tabla — un solo `tenant_id` en la zona de predicado (el de un `innerJoin` a `branches`) marca toda la query como cumplidora aunque la tabla strict no esté filtrada. La lente estática del lint sí es por tabla, y por eso el switch descansa en las dos.**

## Performance

- **Duration:** ~40 min (de los cuales ~30 son vitest: 5 corridas dirigidas de 272 s a 418 s, más 3 de un archivo a ~100 s)
- **Completed:** 2026-07-31
- **Tasks:** 3/3 (las tres `auto`; la 3 no produce commit por diseño — la sonda se revierte)
- **Files:** 4 modificados, 0 creados. `tenant-tables.ts` +23/−7, `tenant-lint-allowlist.json` **+0/−204**, los dos de test +85/−28

## Task Commits

| Task | Nombre                                               | Commit     | Archivos                                                                                       |
| ---- | ---------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| 2    | la allowlist se queda sin una sola excusa de finance | `b9190867` | `tenant-lint-allowlist.json` (51 entradas menos)                                               |
| 1    | `finance` entra a `TENANT_STRICT_MODULES`            | `100ddb97` | `src/db/tenant-tables.ts`, `test/db/tenant-tables.test.ts`, `test/tenancy/con-06-lint.test.ts` |
| 3    | demo del fail-closed + suites dirigidas              | —          | ninguno (sonda revertida sin commitear)                                                        |

Los dos commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `543e0ab3` del plan 20).

### Por qué el orden está invertido respecto del plan

El plan pedía Task 1 (entrada strict) y después Task 2 (allowlist). Ese orden **deja un commit intermedio con la suite roja**: en cuanto la entrada `finance` existe y las 33 entradas sobre sus tablas siguen vivas, se caen el `it` nuevo de coherencia D-15 y el gate homólogo de `con-06-lint.test.ts`. Es literalmente la contradicción que D-15 existe para detectar, así que el gate estaría funcionando — pero el commit quedaría rojo, contra la regla de la fase.

Invertido, los dos commits son verdes por separado:

- **`b9190867`** (allowlist sola): el árbol tiene la lista strict todavía vacía y las 51 stale borradas → `lint:tenant` sale **0** (las stale eran discrepancia **antes** del switch, sin relación con él) y el gate de forma viejo (`modulos.length === 0`) sigue verde.
- **`100ddb97`** (entrada strict + gates): la allowlist ya está limpia, así que el `it` de coherencia nace verde.

## Task 2: la reconciliación 47 vs 51 (el número del plan estaba corto)

El plan y el `172-PATTERNS.md` §"Allowlist: las entradas exactas a borrar" contaban **47** por criterio: 33 con `table` entre las 6 strict + 14 no-finance con `file` bajo `src/modules/finance/`. Medido sobre el árbol, ese criterio da exactamente 47 — el PATTERNS no se equivocó en lo que contó:

```
total 501  strict-table 33  finance-file 29  union 47
```

Pero `pnpm lint:tenant` reportaba **51** `staleNoLongerViolating`. **No se asumió ninguno de los dos números: se corrió el lint y se cruzó entrada por entrada.** Las 4 de diferencia:

| Entrada stale                                        | Por qué no está en las 47        | Quién pagó la deuda |
| ---------------------------------------------------- | -------------------------------- | ------------------- |
| `analytics/ltv-service.ts` — `users`                 | tabla no-strict en archivo ajeno | `6fe25129` (172-02) |
| `analytics/ticket-service.ts` — `subscription_plans` | ídem                             | `6fe25129` (172-02) |
| `analytics/ticket-service.ts` — `subscriptions`      | ídem                             | `6fe25129` (172-02) |
| `coach/service.ts` — `users`                         | ídem                             | `5b0db52b` (172-04) |

Son **colaterales de la cirugía mínima (D-07)**: la query que se scopeó por su tabla strict **joineaba** esas otras tablas, y el motor del lint cuenta las tablas joineadas como accesos propios (hallazgo WR-01 de la 170). Al ponerle `tenantWhere` a la query, los accesos joineados dejaron de violar en el mismo statement.

**Se borraron las 51.** El criterio del plan es un **piso, no un techo**: dejar una entrada stale es discrepancia igual que agregar una ganada ("tampoco alcanza con dejarla quieta", header del JSON, D-14), así que las 4 extra habrían dejado el lint rojo. Y borrar **siempre** es legal en el ratchet.

**Resultado: 501 → 450** (el plan esperaba 454; la diferencia son esas 4). El diff es puro borrado, verificado:

```
$ git diff --numstat el-templo-api/tenant-lint-allowlist.json
0	204	el-templo-api/tenant-lint-allowlist.json
$ git diff -U0 ... | grep -c '^+[^+]'
0
```

### Las 51, listadas

**Las 29 de `src/modules/finance/`** (D-06, cero entradas con `file` en el módulo):

```
balance-service.ts        | balances, debt_management, subscriptions, users
cash-register-service.ts  | branches, cash_registers, cost_centers, financial_transactions
coach-load-routes.ts      | branches, subscription_plans, subscriptions, users
movement-service.ts       | cash_registers, cost_centers, transaction_links
routes.ts                 | branches, cash_registers, financial_transactions
transaction-service.ts    | balances, branches, cash_registers, cost_centers,
                            financial_transactions, program_enrollments, subscription_plans,
                            subscriptions, transaction_links, user_status_history, users
```

**Las 22 de archivos ajenos** (18 sobre tablas strict por D-01 + las 4 colaterales):

```
analytics/advanced-finance-service.ts | financial_transactions
analytics/ltv-service.ts              | financial_transactions, users*
analytics/service.ts                  | balances, financial_transactions
analytics/ticket-service.ts           | financial_transactions, transaction_links,
                                        subscription_plans*, subscriptions*
coach/service.ts                      | balances, users*
members/service.ts                    | balances
reports/service.ts                    | balances, debt_management, financial_transactions,
                                        transaction_links
subscriptions/service.ts              | balances, financial_transactions, transaction_links
src/scripts/backfill-historical-payments.ts | balances, financial_transactions, transaction_links
```

`*` = las 4 colaterales fuera del criterio del plan.

### Verificación

```
$ pnpm lint:tenant
Entradas de la allowlist:       450
Violaciones NO listadas en la allowlist (unlistedViolations): 0
Entradas cuyo archivo ya NO existe (staleMissingFile): 0
Entradas que ya NO corresponden a una violacion (staleNoLongerViolating): 0
Entradas GANADAS respecto de la rama base (gainedEntries): 0
Tablas de modulos migrados con entradas vivas (strictWithAllowlist): 0

DISCREPANCIAS: 0
```

**Cero violaciones nuevas: no hizo falta arreglar ni una query.** (Si hubiera aparecido una, la salida era migrarla — devolver la entrada o sacar la tabla de la lista strict están prohibidos por D-14/D-15.)

## Task 1: la primera entrada strict del milestone

```typescript
export const TENANT_STRICT_MODULES: Record<string, readonly string[]> = {
  finance: [
    "balances",
    "cash_registers",
    "cost_centers",
    "debt_management",
    "financial_transactions",
    "transaction_links",
  ],
};
```

Los 6 nombres son los **físicos** (los de `getTableName()`), verificados contra `GYM_OWNED_TABLES`. `aura_balances` y `aura_transactions` quedan **fuera** (D-05) y el docblock ahora lo dice con su motivo, para que el próximo lector no lo lea como un olvido: _"una tabla entra a esta lista cuando su módulo dueño la migra entera, no cuando su nombre encaja en un rubro"_.

El docblock también reemplaza la sección "POR QUÉ ARRANCA VACÍA" —que ya no describe la realidad— por la historia del switch: por qué va al final de la fase (D-03) y por qué el alcance del throw es **por tabla y no por directorio** (D-01).

### El gate de forma: contra una segunda copia, no contra sí mismo

El `it` de L351 afirmaba `modulos.length === 0`. La reescritura **no** lo cambió por "`finance` está presente": compara el registro entero contra `MODULOS_DECLARADOS`, una copia escrita a mano **en el test**.

La diferencia es la que importa. Un `expect(TENANT_STRICT_MODULES.finance).toEqual([...6])` dejaría pasar que alguien agregue `members: [...]` sin decidirlo en ningún lado — y agregar un módulo es exactamente lo que este gate existe para volver visible. Con la copia a mano, **tocar `src/db/tenant-tables.ts` sin tocar el test es rojo**, en los dos sentidos (módulo de más, módulo de menos, tabla de más, tabla de menos).

El mensaje de rojo nombra la fase de adopción, las dos consecuencias que van juntas (throw + vaciado de allowlist) y cierra la salida fácil:

> Si llegaste a este rojo SACANDO una tabla para apagar un throw: eso apaga el gate de todo el módulo, que es exactamente lo que el mensaje del sentinel prohíbe. La salida es migrar la query, no achicar la lista.

Los otros 4 gates del `describe` pasaron a verde solos, sin tocarlos. **El anti-tautología de `isStrictTable("bookings") === false` quedó intacto**: `bookings` sigue sin migrar, así que el ejemplo sigue siendo válido.

### El `it` nuevo (D-15 como test, no solo como CLI)

`ninguna tabla strict tiene entradas vivas en tenant-lint-allowlist.json (D-15)` lee el JSON con `readFileSync` y cruza `table` contra `isStrictTable`. Es el mismo gate que corre `pnpm lint:tenant` (`strictWithAllowlist`), duplicado a propósito: **el CLI es un step de CI detrás del `paths-filter`** (la trampa de `event.before` está documentada en MEMORY), y la suite no. El `it` viaja con los tests y se cae en el mismo commit que declara migrado un módulo sin vaciar su deuda perdonada.

## Los 3 rojos diferidos de `con-06-lint.test.ts`, resueltos

`test/tenancy/con-06-lint.test.ts` pasa de **35/38 a 38/38**. Los tres estaban anotados en `deferred-items.md` como propiedad de este plan:

| `it`                                                              | Cómo se resolvió                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "el repo real con el baseline del plan 07 sale 0"                 | solo, con el borrado de las 51 stale (`b9190867`) — no se tocó una línea del test                         |
| "una tabla de la lista strict con entradas vivas es discrepancia" | reescrito: `strictTablesSet().size === 0` → `strictTablesSet().has("bookings") === false`                 |
| "ve los archivos que importan el schema EN PROFUNDIDAD"           | el piso baja de 87 a 81 tablas con deuda, **pero con una aserción nueva delante que contabiliza la baja** |

### La lente estática: bajar el número sin que sea una rendición

El mensaje viejo decía _"Si este número baja, alguna forma de import volvió a quedar afuera. El arreglo es `isSchemaModule()`, no bajar esta aserción"_. Bajarlo a 81 y seguir de largo habría sido exactamente lo que prohibía. Lo que se hizo:

```typescript
const tablasConDeuda = new Set(REAL_RESULT.violations.map((v) => v.table));

expect(
  [...strictTablesSet()].filter((tabla) => tablasConDeuda.has(tabla)).sort(),
  "una tabla de un módulo declarado migrado no puede seguir teniendo accesos que violan…",
).toEqual([]);

expect(tablasConDeuda.size, "…").toBeGreaterThanOrEqual(81);
```

**87 − 6 = 81, y las 6 que faltan son exactamente las strict** — medido, no supuesto: la lista de las 81 no contiene ninguna de las seis. La aserción nueva es más fuerte que el número, porque ata la baja a una causa verificable y **no puede volver a bajar en silencio**: la próxima fase de adopción tendrá que bajar el piso otra vez y su propia aserción de contabilidad le exigirá que las tablas que faltan sean las suyas.

## Task 3: el fail-closed, demostrado

### El primer intento falló, y ese es el hallazgo del plan

La sonda inicial fue la que sugería el plan por el lado de las lecturas grandes: se le sacó el `tenantWhere(schema.financialTransactions, ctx)` al array `conds` de `getSummary()` — la condición que comparten las **cuatro** agregaciones del resumen de caja. `test/finance/summary-sanity.test.ts` dio **5/5 verde y cero throws.**

El motivo está en `src/db/sentinel/analyze.ts:240-247`, etapa 4:

```typescript
return TENANT_ID.test(predicado)
  ? verdict("ok", "menciona tenant_id en el predicado", involucradas)
  : verdict("violation", `sin tenant_id sobre ${involucradas.join(", ")}`, ...);
```

**El sentinel de runtime evalúa la query como un todo, no tabla por tabla.** Las 4 agregaciones de `getSummary` hacen `innerJoin` a `branches` con su propio `tenantWhere`, así que el SQL sigue mencionando `tenant_id` en la zona de predicado y el veredicto es `ok` — aunque `financial_transactions`, que es la tabla strict, haya quedado sin filtrar.

Esto **no es un bug del switch**, es el diseño del analizador de runtime (regex sobre texto de SQL, sin parser). Pero sí es una limitación que ninguna fase había escrito y que cambia cómo hay que leer el verde: **el sentinel no cubre por sí solo las queries multi-tabla.** Quien sí cubre por tabla es la **lente estática del lint**, que cuenta un acceso por tabla involucrada (incluidas las joineadas, WR-01). Queda anotado en `deferred-items.md` para las fases 173-175 y para el doc de la receta (172-23).

### La sonda que sí demuestra: una query de UNA sola tabla

El plan sugería `getById`. **No sirve: `getById` no tiene un solo call site en `src/`** (`grep -rn "getById" src/` devuelve únicamente su declaración), así que ningún test la ejercita. Se usó el primer SELECT de `validate()` (`transaction-service.ts:775`), que es de una sola tabla y lo ejercitan 4 tests de `test/finance/validation-state.test.ts`:

```diff
       const [existing] = await tx
         .select()
         .from(schema.financialTransactions)
-        .where(
-          and(
-            tenantWhere(schema.financialTransactions, ctx),
-            eq(schema.financialTransactions.id, id),
-          ),
-        );
+        .where(and(eq(schema.financialTransactions.id, id)));
```

**Salida real (4 tests rojos, `[1/4]` transcrito completo):**

```
❯ TransactionService.validate src/modules/finance/transaction-service.ts:774:12
❯ test/finance/validation-state.test.ts:292:20

Caused by: TenantSentinelError: [sentinel de tenancy] query sin tenant_id sobre
financial_transactions (módulo ya migrado, ver TENANT_STRICT_MODULES en
src/db/tenant-tables.ts).
SQL: select `id`, `tenant_id`, `member_id`, `kind`, `direction`, `amount`, `currency`,
`payment_method`, `transaction_date`, `effective_date`, `branch_id`, `cash_register_id`,
`cost_center_id`, `recorded_by`, `voided_at`, `voided_by`, `void_reason`,
`validation_status`, `validated_by`, `validated_at`, `notes`, `misc_reason`,
`idempotency_key`, `created_member_id`, `created_at`, `updated_at`
from `financial_transactions` where `financial_transactions`.`id` = ?
Qué hacer: filtrá con tenantWhere(tabla, ctx) si es una lectura, estampá
tenantValues(ctx, {...}) si es una escritura, o —si el acceso es global a propósito—
escribí la exención con su motivo en un comentario de bloque "tenant-safe: <motivo>"
en el sitio del acceso. NO saques la tabla de TENANT_STRICT_MODULES: eso apaga el gate
de todo el módulo.
  ❯ evaluar src/db/sentinel/install.ts:360:15
  ❯ inspect src/db/sentinel/install.ts:389:7
  ❯ PromisePoolConnection.wrapped [as query] src/db/sentinel/install.ts:276:30
```

Y el envoltorio, que confirma el hallazgo de la 170 (**un `instanceof TenantSentinelError` directo no entra nunca**):

```
AssertionError: expected error to be instance of BadRequestError
+ Received:
DrizzleQueryError {
  "message": "Failed query: select … from `financial_transactions` where `…`.`id` = ?\nparams: 5",
  "cause": TenantSentinelError {
    "message": "[sentinel de tenancy] query sin tenant_id sobre financial_transactions …",
    "sql": "select … from `financial_transactions` where `financial_transactions`.`id` = ?",
    "tables": [ "financial_transactions" ],
    "name": "TenantSentinelError",
  },
  "params": [ 5 ],
}
```

Dos detalles que valen para el 172-23: el `tenant_id` aparece en la **proyección** del SELECT y aun así el veredicto es `violation` — es el recorte de la proyección (mitigación T-170-01) funcionando; y el error lleva `sql` y `tables` como campos propios, no solo en el mensaje.

**Sonda revertida** con `git checkout -- src/modules/finance/transaction-service.ts`; `git status --porcelain` del archivo sale **vacío** y el worktree entero quedó limpio.

## Las suites, con el throw encendido de verdad

Todas con `--no-file-parallelism` (ver más abajo). **100 archivos, 1394 tests, 0 fallos, 0 throws del sentinel.**

| Corrida                                                | Archivos | Tests  | Duración |
| ------------------------------------------------------ | -------- | ------ | -------- |
| `test/db/tenant-tables.test.ts`                        | 1        | 18 ✅  | 102 s    |
| `test/tenancy/con-06-lint.test.ts`                     | 1        | 38 ✅  | 100 s    |
| `test/tenancy`                                         | 12       | 233 ✅ | 272 s    |
| `test/finance`                                         | 20       | 343 ✅ | 348 s    |
| `test/subscriptions test/reports`                      | 33       | 354 ✅ | 418 s    |
| `test/analytics test/members test/coach test/programs` | 35       | 464 ✅ | 355 s    |

`pnpm exec tsc --noEmit` sale **0**.

### Los 2 rojos ambientales del `deferred-items` **también pasaron**

`test/finance/coach-load-alta.test.ts` da **20/20** dentro de los 343. Los 2 `it` que el 172-14 documentó como rojos preexistentes (`alta crear-nuevo: … esperaba activo, recibió prueba` y `void→cascade: … esperaba activo, recibió freemium`) **pasan con un solo worker**.

Eso confirma el diagnóstico que el 172-14 dejó como sospecha sin verificar: **son ambientales, no un bug de producción tapado.** Las tres corridas que los reprodujeron —incluida la que corrió sobre `a6272df0` con `src/` y el test sin tocar— usaban el paralelismo por defecto. Con `--no-file-parallelism` la base es una sola y compartida, y las dos aserciones sobre `users.status` dan lo esperado. La causa exacta (seed compartido, recategorización, o el estado `prueba` de v5.8 interactuando entre archivos) **no se investigó** — está fuera de alcance y CI está verde sobre esa base.

### Nota de método: `--no-file-parallelism` no es una concesión, es más rápido

El `deferred-items` del 172-18 lo pedía como mitigación del ruido de provisioning por worker. En la práctica también **acorta el reloj**: `test/setup.ts` provisiona una base por worker (~96 s cada una), así que con un worker se paga una sola vez y los archivos siguientes corren en centésimas. Los 33 archivos de `subscriptions` + `reports` entran en 418 s.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El conteo de la allowlist del plan estaba corto: 47 vs 51 reales**

- **Found during:** Task 2
- **Issue:** el plan y el PATTERNS mandaban borrar 47 entradas (501 → 454). `pnpm lint:tenant` reportaba 51 `staleNoLongerViolating`. Dejar las 4 de diferencia habría dejado el lint **rojo** (`DISCREPANCIAS: 4`) y con él el `it` "el repo real con el baseline del plan 07 sale 0".
- **Fix:** se corrió el lint, se listaron las 51 reales y se cruzaron una por una contra la lista del PATTERNS. Las 4 extra se rastrearon con `git log` hasta los commits `6fe25129` (172-02) y `5b0db52b` (172-04): son tablas **joineadas** en las mismas queries que se scopearon. Se borraron las 51. Resultado 501 → **450**.
- **Files modified:** `el-templo-api/tenant-lint-allowlist.json`
- **Commit:** `b9190867`

**2. [Rule 3 - Blocking] `test/tenancy/con-06-lint.test.ts` no estaba en `files_modified` y tiene 2 gates que asumen la lista strict vacía**

- **Found during:** Task 1
- **Issue:** el plan solo listaba `tenant-tables.ts` y su test. Pero `con-06-lint.test.ts` tiene su propio gate D-15 (`strictTablesSet().size === 0`) y el de la lente estática (≥ 87 tablas con deuda). Los dos se caen con el switch; `deferred-items.md` ya se los había asignado a este plan.
- **Fix:** el D-15 pasa a afirmar `strictTablesSet().has("bookings") === false` (lo que de verdad prueba la inyección por parámetro de D-07); el de la lente baja a 81 **con una aserción nueva delante** que exige que ninguna tabla strict tenga violaciones vivas, o sea que contabiliza la baja en vez de aceptarla.
- **Files modified:** `el-templo-api/test/tenancy/con-06-lint.test.ts`
- **Commit:** `100ddb97`

**3. [Rule 3 - Blocking] El orden de tasks del plan produce un commit rojo**

- **Found during:** Task 1
- **Issue:** con Task 1 (entrada strict) antes de Task 2 (allowlist), el commit intermedio tiene el `it` de coherencia D-15 y el gate de `con-06` en rojo por definición.
- **Fix:** se invirtió el orden de los commits. Cada uno queda verde por separado (ver arriba).
- **Files modified:** ninguno adicional
- **Commit:** —

**4. [Rule 1 - Bug] La sonda que el plan sugería no la ejercita ningún test**

- **Found during:** Task 3
- **Issue:** el plan proponía `getById` de `transaction-service.ts`. `grep -rn "getById" src/` devuelve **solo su declaración**: no tiene call sites, así que ninguna ruta ni ningún test la ejecuta y la sonda no habría demostrado nada.
- **Fix:** se usó el primer SELECT de `validate()`. Antes se probó con `getSummary()` y **tampoco sirvió**, por un motivo distinto y más interesante (el analizador es por query, no por tabla) — documentado arriba y en `deferred-items.md`.
- **Files modified:** ninguno (sonda revertida)
- **Commit:** —

### Deferred Issues

- **El sentinel de runtime no verifica por tabla en queries multi-tabla.** Un `tenant_id` de cualquier tabla en la zona de predicado marca `ok` toda la query. Arreglarlo requiere un parser de SQL en el hot path del pool (decisión arquitectónica, T-170-03 lo evitó a propósito). Anotado en `deferred-items.md` para las fases 173-175 y para la receta del 172-23: **el verde del sentinel no reemplaza al del lint**.
- **La causa exacta de los 2 rojos de `coach-load-alta` en paralelo** sigue sin investigarse. Ya no bloquean: pasan en un worker y CI está verde.

## Authentication Gates

Ninguno.

## Threat Flags

Ninguno. Los 4 threats del plan quedaron cubiertos:

| Threat      | Cómo quedó                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| T-172-21-01 | el `it` de forma compara contra `MODULOS_DECLARADOS`: sacar una tabla es rojo en dos archivos, y el mensaje lo nombra |
| T-172-21-02 | diff verificado **+0/−204**; y el `it` de coherencia D-15 pone rojo cualquier entrada devuelta sobre una tabla strict |
| T-172-21-03 | salida real del `TenantSentinelError` transcrita arriba, con SQL y cadena de `cause`                                  |
| T-172-21-04 | sin acción: la matriz de severidad ya garantiza que en `mode: "log"` (prod/staging) el sentinel **nunca** hace throw  |

## Para el 172-22

- El switch está adentro de la rama pero **nadie lo corrió en CI todavía**: el gate D-14 del lint necesita `--base` y solo corre allá. Un push que **solo borra** entradas es verde por construcción (`gainedEntries` = 0).
- La suite **completa** no se corrió local (regla del repo). Lo corrido son los 8 directorios de mayor superficie finance: 1394 tests.
- El diff de números contra la baseline D-12 (`~/.el-templo-snapshots/172/antes.json`) sigue pendiente y **necesita un JWT de staging nuevo** — no se tocó el rango de fechas.

## Self-Check: PASSED

Archivos:

```
FOUND: el-templo-api/src/db/tenant-tables.ts
FOUND: el-templo-api/tenant-lint-allowlist.json
FOUND: el-templo-api/test/db/tenant-tables.test.ts
FOUND: el-templo-api/test/tenancy/con-06-lint.test.ts
```

Commits (en `/home/franco/projects/et-172`):

```
FOUND: b9190867  chore(172-21): la allowlist se queda sin una sola excusa de finance
FOUND: 100ddb97  feat(172-21): finance entra a TENANT_STRICT_MODULES — el sentinel pasa a throw
```

Estado del worktree: `git status --porcelain` **vacío**.
