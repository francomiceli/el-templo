---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
plan: 09
subsystem: testing
tags: [tenancy, lint, ast, typescript, ci, ratchet]

# Dependency graph
requires:
  - phase: 170-03
    provides: "El motor del lint y su bateria de fixtures (con-06-lint.test.ts)"
  - phase: 170-05
    provides: "Los cuatro gates del ratchet y el contrato de exit codes"
  - phase: 170-07
    provides: "El baseline one-shot de la allowlist (D-16)"
  - phase: 170-08
    provides: "El punto ciego GEMELO ya cerrado (imports profundos) y el idioma del re-baseline"
provides:
  - "El motor resuelve alias de variable local a tablas del schema (`const u = schema.users`) y `alias()` guardado en variable"
  - "Los joins (innerJoin/leftJoin/rightJoin/fullJoin) generan su propio par (archivo, tabla)"
  - "Fixture con las tres formas ciegas + asercion de regresion sobre campaigns/service.ts en el repo real"
  - "La MEDICION exacta del delta que destapa el fix: +78 pares, 0 perdidos (insumo del re-baseline del plan 10)"
affects: [170-10-re-baseline, 171-fixtures-2-tenant, 172-adopcion-finance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolver de inicializadores ACOTADO (3 formas) y distinto del resolver general: en posicion de inicializador sobre-reportar NO es gratis porque el par inventado entra al baseline congelado"
    - "Medicion del delta corriendo el motor VIEJO (extraido con git show a un scratchpad fuera del repo) contra el mismo arbol: da la fila 'entradas perdidas' sin adivinar"

key-files:
  created: []
  modified:
    - el-templo-api/src/db/scripts/lint-tenant.ts
    - el-templo-api/test/tenancy/__fixtures__/lint/accesos.ts
    - el-templo-api/test/tenancy/__fixtures__/lint/tipos.ts
    - el-templo-api/test/tenancy/con-06-lint.test.ts

key-decisions:
  - "El caso del join del fixture joinea `member_profiles` y NO `users` (el plan decia users): con users, el `it` de staleNoLongerViolating (D-14) perdia su unico par compliant-only del fixture y habia que reescribir su narrativa. Cambiar una tabla del fixture cuesta menos que degradar un gate"
  - "El re-baseline es CORRECCION del mismo baseline one-shot defectuoso, no un regenerador nuevo: el motor no veia estos pares cuando se genero"
  - "El `it` del baseline del plan 07 queda ROJO a proposito hasta que el plan 10 re-baselinee: es la consecuencia directa del fix, no una regresion"

patterns-established:
  - "Todo punto ciego cerrado del motor se registra en el docblock de cabecera con su evidencia viva y la limitacion asumida que queda (3 registrados: import profundo, alias local, join)"

requirements-completed: []

# Metrics
duration: ~45min
completed: 2026-07-29
---

# Phase 170 Plan 09: Cierre del punto ciego CR-01 (alias locales + joins) Summary

**El motor del lint dejo de ser ciego a las tres formas que dejaban un acceso sin `tenant_id` en VERDE —alias de variable local, `alias()` guardado en variable y la tabla joineada—, con fixture rojo antes del arreglo, asercion de regresion sobre `campaigns/service.ts` en el repo real, y el delta medido: +78 pares (archivo, tabla), 0 perdidos.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-07-29T01:20:00Z (aprox.)
- **Completed:** 2026-07-29T02:05:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- **El punto ciego CR-01 quedo capturado por un test ANTES de existir el arreglo.** El Task 1 se commiteo con la bateria en rojo (3 `it` fallando) y ese rojo es la evidencia de que los casos nuevos discriminan: sin el, el fixture describiria el agujero en vez de detectarlo.
- **El motor ve las tres formas.** `SchemaBindings.locals` + los cuatro metodos de join en `TABLE_METHODS`. El fixture del motor pasa entero (10/10 en la corrida filtrada) y `campaigns/service.ts` —la evidencia viva ya mergeada a staging— aparece con sus cuatro tablas sin scope.
- **El delta esta medido con el motor viejo corriendo contra el MISMO arbol, no estimado:** 423 → 501 pares violadores, **78 pares nuevos** sobre 51 archivos, **0 pares perdidos**. La atribucion es exacta: **73 pares vienen de los joins (WR-01) y 5 de los alias locales (CR-01)**, y esos 5 son, uno a uno, los de `campaigns/service.ts`.
- **Spot-check de 5 pares nuevos de 5 archivos distintos: los cinco son deuda REAL pre-existente.** Cero falsos positivos del resolver nuevo.

## Task Commits

1. **Task 1: Fixture y aserciones de las tres formas ciegas (RED)** — `8888b011` (test)
2. **Task 2: El motor resuelve alias locales y registra los joins (GREEN)** — `7979016c` (fix)
3. **Task 3: Medicion del delta que destapa el fix** — sin commit de codigo por diseno (la salida es este SUMMARY; el arbol quedo limpio)

## Files Created/Modified

- `el-templo-api/src/db/scripts/lint-tenant.ts` — `locals` en `SchemaBindings`, resolver de inicializadores acotado, joins en `TABLE_METHODS`, seccion nueva del docblock de cabecera con los tres puntos ciegos cerrados
- `el-templo-api/test/tenancy/__fixtures__/lint/accesos.ts` — 4 casos nuevos con su veredicto escrito (alias local, `alias()` en variable, join sin filtro, el mismo join con `tenantWhere`)
- `el-templo-api/test/tenancy/__fixtures__/lint/tipos.ts` — `innerJoin` / `leftJoin` en `FakeDb`
- `el-templo-api/test/tenancy/con-06-lint.test.ts` — conteos nuevos del fixture, `it` de regresion con `ALIAS LOCAL` en el nombre, y los gates del ratchet reajustados a las 8 violaciones del fixture

## El rojo literal del Task 1 (evidencia de que los casos discriminan)

Corrida filtrada `-t "fixture|ALIAS LOCAL"`, **exit 1**, 3 fallando / 7 pasando:

| `it` | Diff de la asercion |
| --- | --- |
| `clasifica las nueve formas de acceso de accesos.ts` | `expected [ …(7) ] to deeply equal [ …(11) ]` — faltaban `attendance`, `subscriptions` y las dos de `member_profiles` |
| `el fixture tiene exactamente 8 violaciones y 4 accesos eximidos` | `expected [ …(5) ] to deeply equal [ …(8) ]` |
| `ve los accesos escritos por ALIAS LOCAL de variable (punto ciego CR-01)` | `campaigns/service.ts accede a users por alias de variable local … expected false to be true` |

Ojo con el **orden** de la lista del primer `it`: lo dicta el recorrido del AST y no la lectura humana. En un encadenado, el nodo mas externo se visita ANTES que el `.from()` interno, asi que el par del **join sale primero** y el del `from` despues. Se derivo corriendo el test, no adivinando.

## La medicion del delta (Task 3)

`pnpm lint:tenant` (sin `--base`): **exit 1**, `DISCREPANCIAS: 131`, `staleMissingFile: 0`, `staleNoLongerViolating: 0`, `strictWithAllowlist: 0`.

### Lente estatica: antes / despues

| Lente estatica | Antes (motor del plan 08) | Despues (este fix) |
| --- | --- | --- |
| Entradas `(archivo,tabla)` violadoras | 423 | **501** |
| Accesos violadores | 1.727 | **2.125** |
| Archivos con deuda | 120 | **120** |
| Tablas gym-owned con deuda | 87 | **87** |
| Entradas perdidas | — | **0** |

El "antes" **no se copio del 170-08-SUMMARY**: se midio corriendo el motor VIEJO (`git show HEAD~1:…/lint-tenant.ts`, extraido a un scratchpad fuera del repo) contra este mismo arbol, y reprodujo exactamente los cuatro numeros de aquella tabla. Eso es lo que permite afirmar `PERDIDOS: 0` por comparacion de conjuntos y no por confianza.

**Archivos y tablas con deuda no se movieron**, y es lo esperado: los 78 pares nuevos caen sobre archivos y tablas que ya tenian deuda por otro acceso. Es justamente el modo de falla que WR-01 describia — deuda que crece dentro de un archivo ya listado, invisible porque la clave del ratchet es el par y no el statement.

### Por que 131 y no 78

`unlistedViolations: 131` cuenta **accesos**; los pares distintos son **78** (las lineas agrupadas del reporte). Los otros 320 accesos violadores nuevos (2.125 − 1.727 − 131 ≈ 267 mas los agrupados) caen sobre pares que la allowlist YA tolera.

### Atribucion por causa

| Causa | Pares | Accesos violadores |
| --- | --- | --- |
| Solo joins (WR-01) | 423 → 496 (**+73**) | 2.092 |
| Joins + alias locales (WR-01 + CR-01) | 496 → 501 (**+5**) | 2.125 |

Los 5 pares que aporta CR-01 son **exactamente** los de `campaigns/service.ts`. Coincide con lo que el REVIEW anticipo: los otros usos de `alias()` guardado en variable (`transaction-service.ts`, `exercise-adjustments/coach-service.ts`) ya estaban cubiertos por accesos directos del mismo archivo.

### Los pares vivos de `campaigns/service.ts`

Los cuatro que el plan pedia confirmar nominalmente estan, **y aparecio un quinto**:

| Par | Accesos | Donde |
| --- | --- | --- |
| `campaigns/service.ts` — `users` | 6 | `:73 :75 :77 :83 :90` (interpolaciones `sql` de `${u}`) y `:100` (`.from(u)`) |
| `campaigns/service.ts` — `branches` | 3 | `:100` (`.innerJoin(br, …)`), `:647`, `:653` |
| `campaigns/service.ts` — `subscriptions` | 1 | `:77` (`NOT EXISTS (SELECT 1 FROM ${s} …)`) |
| `campaigns/service.ts` — `campaign_unsubscribes` | 1 | `:90` (`NOT EXISTS (SELECT 1 FROM ${unsub} …)`) |
| `campaigns/service.ts` — `attendance` | 1 | par EXTRA que el fix destapo, no anticipado por el REVIEW |

### Spot-check de 5 pares nuevos, de 5 archivos distintos

Los cinco son deuda **pre-existente** (el acceso ya estaba, sin `tenant_id`, y el motor no lo veia), no falsos positivos del resolver nuevo:

1. **`src/db/fill-future-bookings.ts` — `branches`** (`:156`). Cadena de cuatro `innerJoin` sobre `subscription_schedules`; el `.innerJoin(branches, eq(branches.id, subscriptions.branchId))` no nombra el gimnasio en ningun lado del statement. Causa: WR-01.
2. **`src/jobs/mark-no-shows.ts` — `schedules`** (`:149`). `.from(bookings).innerJoin(schema.schedules, …)`: el par de `bookings` ya estaba listado, el de `schedules` nunca existio. Causa: WR-01, y es el caso de manual del "crece deuda en silencio".
3. **`src/modules/analytics/class-ratings-service.ts` — `branches`** (4 accesos: `:104 :134 :158 :208`). `query = query.innerJoin(schema.branches, …)` dentro de un `if (needsBranchJoin)`, o sea un statement propio y sin filtro. Causa: WR-01.
4. **`src/modules/tree-progress/service.ts` — `routes`** (`:286`). `.from(schema.exercises).innerJoin(schema.routes, …)`. Causa: WR-01.
5. **`src/modules/campaigns/service.ts` — `users`** (6 accesos). El caso CR-01 puro: `const u = schema.users` y despues `.from(u)` mas cinco interpolaciones `sql`. Es la evidencia viva del REVIEW y la que ancla el `it` de regresion.

## Para el plan 10 (re-baseline)

- **Es correccion del MISMO baseline one-shot, no un regenerador nuevo.** El motor no veia estos 78 pares cuando el plan 07 genero la allowlist: la lista de 423 entradas nunca describio la deuda real, describio la deuda VISIBLE. Corregirla ahora es lo que D-16 permite (se genera una vez, se revisa, se commitea); dejarla como esta seria congelar una foto que ya sabemos incompleta, y arreglarlo despues de mergear si seria la puerta trasera que D-16 prohibe.
- **El gate D-14 de entradas ganadas va a dar ROJO una sola vez**, en el push que lleve el re-baseline a staging: `origin/staging` ya tiene la allowlist de 423 entradas como base del evento, asi que las entradas nuevas se leen como "la allowlist CRECIO". Es el mismo movimiento aprobado por Franco en el plan 08 (opcion b: arreglar antes de pushear) y hay que anunciarlo, no descubrirlo.
- **El tamano esperado del re-baseline es 501 entradas** si se genera con el mismo criterio que hoy produce `violations`. Ojo: las 423 actuales **no** son exactamente los 423 pares violadores del motor viejo — 53 de ellas se sostienen "vivas" por accesos EXIMIDOS (los `live` de `lintTenant` incluyen los exentos a proposito). El plan 10 tiene que decidir explicitamente si el baseline nuevo se arma sobre `violations` o sobre `live`, y escribirlo en el campo `generated`.

## Decisions Made

- **El join del fixture apunta a `member_profiles` y no a `users`** (ver Deviations).
- **El resolver de inicializadores es propio y acotado a tres formas**, sin reusar el fallback generico "cualquier llamada → primer argumento" de `tableOfExpression`. En posicion de argumento de `TABLE_METHODS` sobre-reportar es gratis (termina en una violacion que alguien revisa); en un inicializador ligaria `const q = db.select().from(schema.users)` al nombre `q` y cada par inventado entraria al baseline que D-16 congela. El razonamiento quedo escrito en el docblock de `collectSchemaBindings`.
- **La limitacion asumida quedo escrita, no escondida:** el mapa de locales es por ARCHIVO y no modela scopes. Una cadena escrita al reves no resuelve (fail-closed) y una variable local que pise el nombre de un alias sobre-reporta. Sobre-reportar es recuperable; no ver un acceso, no.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] El caso del join del fixture joinea `member_profiles`, no `users`**

- **Found during:** Task 1 (fixture y aserciones)
- **Issue:** El plan pedia `.from(schema.bookings).innerJoin(schema.users, …)`. Con `users` violando en `accesos.ts`, el `it` "una entrada cuyo archivo ya NO viola cae en staleNoLongerViolating" (gate D-14) se queda **sin ningun par compliant-only en todo el fixture**: su entrada `{ accesos.ts, users }` pasaria a cubrir una violacion real y el gate del achique dejaria de tener caso de prueba. Habia que reescribir la narrativa de un gate ya shippeado para acomodar un nombre de tabla.
- **Fix:** El join usa `schema.memberProfiles` (tambien gym-owned, tambien ausente del fixture hasta hoy). El par nuevo del ratchet sigue siendo el del join, que es lo que WR-01 pide probar, y `accesos.ts users` sigue siendo compliant-only via `insertConTenantValues`.
- **Files modified:** `el-templo-api/test/tenancy/__fixtures__/lint/accesos.ts`, `el-templo-api/test/tenancy/con-06-lint.test.ts`
- **Verification:** El `it` de `staleNoLongerViolating` pasa sin tocarse; los 4 gates del ratchet pasan en la corrida completa.
- **Committed in:** `8888b011`

**2. [Rule 3 - Blocking] Los gates del ratchet tambien contaban violaciones del fixture**

- **Found during:** Task 1
- **Issue:** El plan solo mandaba actualizar dos `it` del describe "motor sobre fixtures". Pero el describe "los cuatro gates del ratchet" corre contra el MISMO fixture: `COBERTURA_COMPLETA` (3 entradas para 4 violaciones), la lista de `unlistedViolations`, `allowlistSize` y el `slice(0, 2)` del test de `gainedEntries` quedaban todos desfasados con las 8 violaciones nuevas.
- **Fix:** `COBERTURA_COMPLETA` pasa a 6 entradas (ordenadas para que `exenciones.ts users` quede ULTIMA), la lista de unlisted a 8, `allowlistSize` a 6 y la base de `gainedEntries` a `slice(0, -1)` — asi el mensaje del gate sigue nombrando la misma entrada de siempre y el test no depende de un indice literal.
- **Files modified:** `el-templo-api/test/tenancy/con-06-lint.test.ts`
- **Verification:** Corrida completa del archivo: 37 passed / 1 failed (el rojo esperado y documentado del baseline).
- **Committed in:** `8888b011`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Ninguna cambia el alcance ni afloja un gate. La primera evita degradar la narrativa de un gate ya escrito; la segunda es trabajo que el plan no habia enumerado pero que su propio criterio ("el fixture falla si el motor vuelve a quedar ciego") exigia.

## Issues Encountered

- **`unlistedViolations` cuenta accesos, no pares.** La primera lectura del reporte (131) no cerraba con los 78 pares nuevos medidos por conjunto. Se resolvio leyendo el codigo de `lintTenant`: `discrepancies` suma `unlistedViolations.length`, que es la lista de ACCESOS; la salida agrupada por `(archivo, tabla)` es la que tiene 78 lineas. Vale la pena tenerlo presente al leer el rojo de CI.
- **Correr el motor viejo fuera del repo** exigio reescribir dos imports a rutas absolutas (`../tenant-tables` y `typescript`) en la copia del scratchpad. Nada de eso toco el repo: `git status --porcelain -- el-templo-api` quedo vacio al cierre.

## Verificación

| Chequeo | Resultado |
| --- | --- |
| `pnpm exec tsc --noEmit` | ✅ exit 0 |
| `vitest -t "fixture\|ALIAS LOCAL"` ANTES del fix | ✅ exit 1 — 3 rojos, con el `it` de `ALIAS LOCAL` incluido en la corrida |
| `vitest -t "fixture\|ALIAS LOCAL"` DESPUES del fix | ✅ exit 0 — 10/10 |
| `vitest run test/tenancy/con-06-lint.test.ts` (archivo entero) | ⚠️ 37 passed / 1 failed — el unico rojo es `el repo real con el baseline del plan 07 sale 0`, ESPERADO Y DOCUMENTADO hasta el plan 10 |
| `pnpm lint:tenant` | ✅ exit 1 con 131 accesos / 78 pares no listados — es el estado esperado al cierre de este plan |
| `git status --porcelain -- el-templo-api` | ✅ vacio (ningun script auxiliar quedo en el repo) |
| Migraciones / dependencias nuevas | ✅ cero (`pnpm-lock.yaml` intacto) |
| Push | ✅ nada pusheado |

## Known Stubs

Ninguno.

## User Setup Required

None.

## Next Phase Readiness

- **El plan 10 tiene todo lo que necesita para re-baselinear con numeros:** los 78 pares nuevos, su atribucion por causa, `PERDIDOS: 0` y el racional escrito.
- **Queda un rojo vivo a proposito** (`el repo real con el baseline del plan 07 sale 0`). El plan 10 lo pone en verde re-baselineando la allowlist, **sin tocar el test**.
- **Sin cerrar de esta fase (no son de este plan):** WR-02 (el recorte de proyeccion del sentinel es ciego a un `WITH`), WR-03 (`event.before` irresoluble tras force-push), WR-04 (`isCompliantText` matchea `tenant_id` dentro de comentarios y sin word boundary) y los cuatro Info del REVIEW. WR-04 es el mas cercano a este plan: es la misma familia prosa-vs-codigo y hoy un `// TODO: falta filtrar por tenant_id` blanquea un acceso.

## Self-Check: PASSED

Los 4 archivos modificados existen en disco y los 3 commits (`8888b011`, `7979016c`, `90ca1b59`) estan en el historial de `feat/170-sentinel-lint`. `git status --porcelain` solo muestra `.planning/STATE.md`, que es del orquestador y este plan no toco.

---

_Phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci_
_Completed: 2026-07-29_
