# Fase 5 — Receta de adopción de un módulo (destilada del piloto de `finance`)

> **Fecha:** 2026-07-31
> **Estado: ✅ DESTILADA DEL PILOTO REAL (fase GSD 172, 23 planes, `finance` en producción de staging).**
> Este doc NO es teoría: cada regla de acá salió de algo que pasó, y donde hay un número
> es un número medido. Las fases **173** (members), **174** (subscriptions + scheduling)
> y **175** (analytics + resto del core) lo cargan como referencia canónica y **no vuelven
> a discutir el orden, la forma ni las trampas**.
> Complementa a [`03-diseno-tenant-db-layer.md`](./03-diseno-tenant-db-layer.md) (las 5 capas)
> y a [`06-estrategia-migracion.md`](./06-estrategia-migracion.md) (las 4 tandas SQL).
> **La adopción es la capa 5 sobre las 4 capas ya construidas** — no construye enforcement,
> lo enciende para un módulo.

---

## 0. Qué significa "adoptar un módulo" (definición operativa)

Un módulo está adoptado cuando se cumplen **las cinco cosas juntas**, no cuatro:

1. Todos sus services reciben `TenantContext` y **todas** sus queries usan `tenantWhere` / `tenantValues`.
2. Sus tablas están en `TENANT_STRICT_MODULES` (`el-templo-api/src/db/tenant-tables.ts`) → el sentinel **hace throw** en test y dev.
3. `tenant-lint-allowlist.json` no tiene **una sola** entrada con `file` bajo el módulo ni con `table` entre sus tablas strict.
4. Sus rutas `tenant-scoped` del manifiesto tienen caso de aislamiento **+ control positivo**, con un gate que impide que eso envejezca.
5. Los números que ve el staff son **los mismos** antes y después, verificado en staging contra una foto tomada antes.

Faltando cualquiera, el módulo **no** está adoptado: está a medio migrar, que es un estado peor que no haber empezado (el lint queda rojo y la garantía es de lectura de código).

---

## 1. Cuándo un módulo está listo para adoptarse

### 1.1 Precondiciones de plataforma (fases 166-171, todas en master)

| Capa | Artefacto | Sin esto, la adopción… |
|---|---|---|
| 1 | `scope.tenantId` en `attachScope` + `assertTenant` (`src/modules/shared/tenant.ts`) | no tiene de dónde sacar el gimnasio en un handler |
| 2 | `tenantWhere` / `tenantValues` / `TenantContext` / `forEachActiveTenant` | escribe el filtro a mano 300 veces y cada una es una oportunidad |
| 3 | Sentinel de pool (`src/db/sentinel/`) con `analyzeSql` y el canal de exención `tenant-safe:` | no tiene cómo probar el fail-closed |
| 4 | Lint CI (`pnpm lint:tenant`) + `tenant-lint-allowlist.json` como ratchet | no tiene cómo medir "terminado" |
| 5 | `test/tenant-manifest.ts` (372 rutas clasificadas) + `test/fixtures/second-tenant.ts` | no tiene contra qué probar aislamiento |

### 1.2 Precondiciones del repo

- **Nada del módulo a medio mergear.** El piloto arrancó con un gate de secuencia explícito (D-13): el fix CR-CAJA —que reescribió `finance/coach-load-routes.ts` y `subscriptions/service.ts`, **dos de los archivos que la fase migra**— tenía que estar en master **y corriendo en staging** antes de crear el worktree. La base se eligió `a6272df0` (master con CR-CAJA adentro) y no el tren anterior: partir de antes garantizaba conflicto sobre exactamente las líneas en juego.
- **Worktree propio, desde `origin/master` recién fetcheado, con `node_modules` propio** (`pnpm install --frozen-lockfile`: instala pero **falla** si el árbol de dependencias cambiaría). Y **sacarle el upstream** al branch: `git worktree add -b … origin/master` lo deja trackeando `origin/master`, y en este repo un `git push` sin argumentos a master **es un deploy a producción**.
- **Baseline verde registrada ANTES de tocar una línea**, porque es contra qué se mide el descenso: `tsc --noEmit` exit 0, `pnpm lint:tenant` exit 0 con `DISCREPANCIAS: 0`, **el conteo de entradas de la allowlist** (el piloto arrancó en **501**) y el inventario de exenciones `tenant-safe` heredadas (eran **10**, ninguna de finance — si al cerrar hay una nueva **en el módulo**, alguien tomó un atajo).

### 1.3 La foto de los números, antes de migrar

`el-templo-api/src/scripts/snapshot-finance-endpoints.ts` es reusable tal cual cambiando **una constante** (`ENDPOINTS`). Se corre contra staging **antes** del primer commit de código y el archivo va **fuera del repo** (`$HOME/.el-templo-snapshots/<fase>/antes.json`, permisos `0600`: tiene plata real y nombres de socios).

Tres cosas que el script aprendió a la mala y que hay que conservar al cambiar los endpoints:

- **Mandarle `dateFrom` a un endpoint cuyo schema no lo declara NO da 400.** Fastify compila ajv con `removeAdditional: true` y lo **strippea en silencio**: el snapshot diría "rango 2026-H1" sobre el histórico completo. Hay que mapear el rango al nombre real de cada schema.
- **Paginar hasta agotar `total`.** La adopción cambia índices, y un cambio de índice cambia *qué filas* caen en la página 1 sin que ningún número se mueva.
- **El orden de las listas NO es señal**, a propósito: MySQL devuelve los empates al revés al cambiar de índice. Un cambio de orden visible lo caza el UAT, no el diff.

### 1.4 Lo que necesita el GIMNASIO nuevo (no el módulo)

**Un gimnasio nuevo necesita su propia sede virtual "Templo Online".** No es opcional y no estaba escrito en ningún lado hasta que la batería del piloto lo destapó: `resolveUserBranchId` (`src/modules/finance/coach-load-routes.ts`) cae, cuando el socio pedido no es del gimnasio, a un fallback que busca **por nombre** la sede "Templo Online" **del propio gimnasio**. Sin esa sede el fallback tira un `Error` pelado y las rutas de carga contestan **error del servidor** en vez del payload vacío que exige el contrato. Va en el checklist de onboarding del tenant 2, no en el de adopción del módulo.

---

## 2. El orden que funciona, y por qué

Nueve pasos. El piloto los ejecutó en este orden y **cada desviación costó tiempo**.

| # | Paso | Qué produce | Planes del piloto |
|---|---|---|---|
| 1 | **Inventario** | la lista real de accesos: `pnpm lint:tenant` (por archivo+tabla) y `SENTINEL_INVENTORY=1` (por query en runtime) | 172-01 |
| 2 | **Cirugía mínima en archivos AJENOS** | los módulos que *leen* tus tablas dejan de violar, sin migrarlos enteros | 172-02/03/04 |
| 3 | **Plomería de firmas** | `ctx: TenantContext` PRIMERO en cada método público, y el compilador obliga a mirar todos los call sites | 172-07/08 |
| 4 | **Migración de queries** | `tenantWhere` / `tenantValues` en cada statement — escrituras primero, lecturas después | 172-06/09/10/11/12 |
| 5 | **Endurecimiento de tests** | la suite sobrevive al throw: fixtures, `beforeEach`, SQL crudo | 172-13/14/15/16 |
| 6 | **Batería ISO-03** | un archivo por familia de rutas, caso + control por ruta | 172-17/18/19 |
| 7 | **Gate de cobertura** | la batería no puede envejecer en silencio | 172-20 |
| 8 | **El switch** | allowlist en cero + entrada strict + demo del fail-closed | 172-21 |
| 9 | **Verificación de números** | staging, CI completo, diff contra `antes.json`, UAT del staff | 172-22 |

### Por qué el switch va ÚLTIMO

Porque el throw del sentinel es global: en cuanto una tabla entra a `TENANT_STRICT_MODULES`, **toda** query sin `tenant_id` sobre ella revienta, venga de `src/` o de un `beforeEach` de test. Si el switch fuera primero, la suite quedaría roja durante los 15 planes del medio y ningún commit intermedio sería verificable.

La medida de lo grande que es ese problema: sin el paso 5, el plan del switch no habría visto "40 archivos rojos" sino **la suite entera caída en el primer hook** — `cleanAllTestData` es un `DELETE FROM` sin filtro sobre ~70 tablas, tres de ellas strict, y corre en el `beforeEach` de decenas de archivos **por el pool que el sentinel envuelve**.

Durante los pasos 2-4 la técnica es una **allowlist de trabajo en `/tmp`**: cada plan genera `/tmp/allowlist-<fase>-<NN>.json` quitándole sus entradas al eslabón anterior y corre el lint contra ella. El archivo real tiene **un solo dueño** (el plan del switch) y queda rojo contra la rama hasta entonces — eso es esperado, no una regresión, y es lo que bloquea el merge a staging antes de tiempo.

### El orden INTERNO del switch: allowlist PRIMERO, entrada strict DESPUÉS

Es el inverso al que parece natural, y no es cosmético: con la entrada strict puesta y la allowlist todavía llena, el gate de coherencia (D-15: "ninguna tabla strict tiene entradas vivas en la allowlist") **se cae**, y el commit intermedio queda con la suite roja. Al revés, los dos commits son verdes por separado:

- `chore(NNN-XX): la allowlist se queda sin una sola excusa de <módulo>` — las stale eran discrepancia **antes** del switch, sin relación con él.
- `feat(NNN-XX): <módulo> entra a TENANT_STRICT_MODULES` — la allowlist ya está limpia, así que el `it` de coherencia nace verde.

---

## 3. Cómo romper los ciclos de dependencia entre services

El caso real: `TransactionService` (finance) tiene que llamar a `SubscriptionService` para cancelar la sub cuando se anula un cobro (el tipo `SubscriptionCanceller`), y `SubscriptionService` tiene que llamar a `TransactionService.create` para cobrar al asignar un plan. Si se intenta migrar los dos a la vez, ningún commit compila.

Se corta con **dos cortes ortogonales**:

**Corte 1 — darle `ctx` primero al llamador que NO depende del otro.** El piloto migró `subscriptions/service.ts` (7 firmas) **antes** de `transaction-service.ts` (21 firmas): así, cuando el segundo cambió sus firmas, el primero **ya tenía `ctx` a mano** en los 5 puntos donde lo llama, sin tocar una firma más.

**Corte 2 — separar "plomería de firmas" de "migración de queries".** Son dos planes distintos y dos commits distintos:

- La **plomería** cambia `create(input)` → `create(ctx, input)` en toda la clase y actualiza sus call sites. No filtra una sola query. Es mecánica, la verifica el compilador y toca decenas de archivos.
- La **migración** pone `tenantWhere` en las 90 queries del archivo. No toca una sola firma, así que **no toca ni un archivo de test**.

Tres reglas que hacen que esto funcione:

1. **El `ctx` va PRIMERO en la firma, antes del `tx` y antes de los ids.** No es estético: un call site viejo queda con los argumentos **corridos** y **no compila**. Si el parámetro fuera último u opcional, un caller olvidado seguiría compilando y escribiría el cargo sin gimnasio.
2. **Tener `ctx` ≠ estar migrado.** Hay que escribirlo arriba de la clase mientras dure el estado intermedio, y **reescribirlo cuando deje de ser cierto**: un docblock que dice "las queries todavía no filtran" sobre un archivo ya migrado es peor que no tener docblock.
3. **Un parámetro `ctx` que todavía no se usa se documenta como tal, en mayúsculas.** El piloto le dio `ctx` a `cancelSubscription` un plan antes de usarlo (para no tocar 9 call sites dos veces) y lo escribió así: *"este método ya lo RECIBE pero TODAVÍA NO LO USA … Hasta entonces, la cancelación NO está scopeada."*

**Cuando el ciclo cruza el borde del módulo, el tipo es el que lo cierra.** `SubscriptionCanceller` es la única arista que sale de `finance` hacia otro módulo: al exigirle el `ctx` en el tipo, un canceller sin gimnasio **no compila**.

---

## 4. Las trampas que costaron tiempo en el piloto

### (a) Un método con `ctx` en la firma NO está migrado

`createEfectivoCaja` (`src/modules/finance/cash-register-service.ts`) tenía el `ctx` desde la fase anterior y **no filtraba nada**: el SELECT del invariante "una caja efectivo activa por (sucursal, moneda)" no nombraba el gimnasio —así que la caja de otro gimnasio en la misma sucursal bloqueaba el alta con un 409 que además delataba su existencia— y el INSERT no pasaba por `tenantValues` (la caja nacía en el tenant 1 por el `DEFAULT` de la columna, no porque alguien lo decidiera).

**El criterio de terminado es el inventario del lint, jamás la firma.**

### (b) Los helpers privados que devuelven fragmentos `SQL` necesitan el filtro ADENTRO

`reports/service.ts` es el caso de manual: seis de sus sitios no hacen la query, **devuelven pedazos de SQL** que se componen en otra. La receta obvia ("el `ctx` entra al helper y el filtro se escribe en el fragmento devuelto") **no cierra**, porque el lint razona por **statement**: cada `conds.push(...)` es un statement propio que nombra la tabla sin nombrar el gimnasio, y `buildOutstandingOrderBy` devuelve fragmentos de **ORDER BY**, donde un predicado de tenant ni siquiera es expresable.

Las **dos** formas que sí funcionan, según el helper:

- **`buildOutstandingScope(ctx)`** — un solo statement nombra las tablas strict del bloque y estampa el `tenantWhere`; los helpers reciben **las columnas** (`cols.amount`, `cols.createdAt`) y no el schema. Consecuencia buscada: no hay forma de escribir un fragmento nuevo que se olvide del filtro, porque las columnas strict **no están a mano** adentro del helper.
- **`buildListConditions(ctx, filters)`** (`transaction-service.ts`) — el helper devuelve `SQL[]` y el `tenantWhere` es el **primer elemento del array**. `list()` y `exportRowsForExcel()` quedan scopeados de una, y la query que se escriba mañana **nace scopeada**. Y **no se duplica en el llamador**: daría el mismo SQL pero mataría la garantía (el próximo copiaría el duplicado).

Excepción obligatoria: un helper que arma una **subconsulta con FROM propio** (`buildDebtOriginTxSubquery`, o el `scopedCajas` de `listMovEgresos`) sí recibe `ctx` y lleva el filtro adentro — el WHERE de afuera no alcanza a sus filas.

### (c) Las closures de rutas también hacen queries

El punto ciego del módulo son los archivos de rutas: `resolveCajaCountry`, `enforceCajaScope` y `enforceRowScope` (`finance/routes.ts`) viven en el cuerpo del plugin, **no tienen `request` a mano** y hacen queries. Reciben `ctx` como primer parámetro y cada call site le pasa el que ya resolvió.

**La query más peligrosa de las nueve fue la que busca por NOMBRE**: el fallback "Templo Online" de `resolveUserBranchId`. Un id ajeno simplemente no matchea; un **nombre** que todo gimnasio va a tener devuelve la fila del **primer gimnasio que la tenga**, silenciosamente. Con un solo tenant es invisible.

### (d) Los tests también los juzga el sentinel — y son ~250 accesos

`tenant-lint-allowlist.json` **solo cubre `src/`**. El sentinel envuelve el **pool**, así que ve todo lo que pase por `app.dbPool` — incluidos los `beforeEach`. Cuatro planes del piloto (13→16) no bajaron **ni una** entrada de allowlist y eran imprescindibles: trabajan para el otro vigilante.

**La regla para decidir caso por caso:**

> Si el statement lee o borra **a propósito** de todos los gimnasios → **exención** con motivo. Si se puede acotar sin cambiar lo que el test prueba → **filtro**.

- `cleanAllTestData` (`test/helpers.ts`) → **exención**, y la exención va **ADENTRO DEL SQL**, entre el verbo y el `FROM`: `DELETE /* tenant-safe: limpieza global de la base de test (todos los gimnasios) */ FROM …`. Es el **único** canal que el sentinel lee; una entrada de allowlist no calla un throw de runtime (son dos canales distintos).
- Los `DELETE` de conveniencia de un `beforeEach` → **filtro** (`WHERE tenant_id = ?` parametrizado). El piloto acotó 34 sitios así en un solo plan, con **cero** exenciones.
- Las lecturas de **evidencia** (`tenantDeLaFila`, `saldoDeLaCaja`) → **exención**: leer el `tenant_id` de la fila **es** la aserción; filtrarla la volvería tautológica.
- Los statements sobre tablas que **todavía no** son strict → **no se anotan**. Anotarlas "por las dudas" deja la decisión tomada de antemano para quien migre ese módulo, que es cómo se apaga un tripwire solo.

**Tres puntos ciegos del inventario por grep**, encontrados uno por plan y siempre por la corrida en caliente, nunca por la lectura:

1. `.from(schema.X)` de Drizzle — el que todo el mundo busca.
2. **SQL crudo con el nombre de tabla entre backticks**: `conn.query("DELETE FROM \`transaction_links\`")`. 15 sitios que ninguna regex de Drizzle vio y que el sentinel cazó al primer intento (50 tests rojos de 61).
3. **Nombre de tabla que NO está en el fuente**: `sql.raw(tabla)` sobre una unión cerrada, o SQL armado por un helper de `src/`. Ninguna auditoría estática puede decidir; se marcan y se clasifican a mano contra el `.sql` que ejecutan.

Y una regla sobre la herramienta: **una auditoría de cobertura que no se probó contra un caso conocido-malo no es un gate, es un placebo.** El piloto corrió su barrido contra el árbol pre-migración (55 sitios) y contra un archivo pre-arreglo (27 sitios) **antes** de confiar en su verde final (0 sitios sobre 245 archivos).

### (e) El throw llega envuelto en `DrizzleQueryError.cause`

Un `expect(...).rejects.toBeInstanceOf(TenantSentinelError)` **no entra nunca**. Drizzle envuelve el error del driver:

```
DrizzleQueryError {
  message: "Failed query: select … from `financial_transactions` where `…`.`id` = ?",
  cause: TenantSentinelError { message, sql, tables, name }
}
```

El `TenantSentinelError` lleva `sql` y `tables` como **campos propios**, no solo en el mensaje. Hay que leerlo de la cadena de `cause`.

### (f) Las rutas públicas sin `request.scope` derivan el ctx de una fila del server

`POST /api/auth/register` (`src/modules/auth/routes.ts`) no tiene JWT ni `request.user`, así que `assertTenant` no aplica. La salida —el ejemplar para el webhook de Wellhub, el QR de asistencia y cualquier ruta pública futura— es:

1. El cliente elige una **sede**, no un gimnasio. La sede es una fila del servidor y es la que dice de qué gimnasio es.
2. Las dos ramas de resolución de sede proyectan `tenant_id` además de `id`.
3. **El `id` de la sede pedida pasa a salir de la FILA LEÍDA**, no del número del body. Es un cambio de una línea con consecuencia semántica: el payload deja de ser fuente de un dato del que depende el tenant.
4. Guard fail-closed con el mismo error que ya devolvía la rama de "sede no configurada". **Nunca** un default numérico al gimnasio 1.

### (g) Cinco trampas más, cortas, todas repetidas

- **El filtro de una tabla joineada va en el `ON`, también en los INNER JOIN.** En un LEFT JOIN, ponerlo en el `WHERE` lo convierte en INNER y **borra filas en silencio con el lint en verde**: desaparecen las cajas central/banco (`branch_id NULL`), los egresos y traspasos sin socio, los saldos libres sin suscripción y los cobros nacidos validados. En un INNER es equivalente — se usa la misma forma en los dos para que el próximo que agregue un join **no tenga que elegir**. Mordió 4 veces en el piloto.
- **El gimnasio se nombra en el statement que nombra la tabla, INLINE.** Un `const conditions = [...]` de arriba no cuenta, ni siquiera si es un ternario de una línea. Mordió 5 veces.
- **Los conteos de un doc de patterns son referencias `schema.X`, no queries.** Una sola query nombra la tabla 3-6 veces entre el `select`, el `from`, el `join` y el `where`. Todo criterio numérico de un plan hay que re-derivarlo con `grep -n "async <metodo>("` o `grep -n "fastify.db"` antes de medir. Mordió 6 veces.
- **Un gate por substring no distingue código de comentario.** Escribir en un docblock "en este archivo no hay ni un `toBe(403)`" pone en rojo el gate que cuenta `toBe(403)`. Al revés es peor: un gate de cobertura que lea el fuente crudo daría **verde midiendo los docblocks** de los archivos que audita. Describí las marcas en castellano, no las escribas.
- **`tsc --noEmit` NO typechequea `test/`** (`tsconfig.json` tiene `include: ["src/**/*"]`). Un call site de test desactualizado **no da rojo hasta que el test corre**. Para inventariarlos hace falta un `tsconfig.test-check.json` **dentro del proyecto** y con `rootDir: "."` — con el `rootDir` heredado el compilador tira `TS6059` por cada archivo de test, deja de chequearlos y devuelve un **`TS2554: 0` falso**.

### (h) 🔴 El sentinel evalúa por QUERY; el lint, por TABLA

El hallazgo más importante del piloto y salió de una demo **fallida**. Se le sacó el `tenantWhere` a `getSummary()` —la condición que comparten las 4 agregaciones del resumen de caja— y la suite dio **5/5 verde, cero throws**, con el módulo ya en modo strict.

El motivo está en `src/db/sentinel/analyze.ts`: el analizador es una **regex sobre el texto del SQL, sin parser** (decisión arquitectónica deliberada: un parser en el hot path de toda query cuesta caro). Si encuentra un `tenant_id` en la zona de predicado, marca `ok` **toda la query** — y las 4 agregaciones hacen `innerJoin` a `branches` **con su propio** `tenantWhere`.

Consecuencias, y hay que leerlas juntas:

- **El sentinel NO cubre por sí solo las queries multi-tabla.** Una tabla strict puede quedar sin filtrar y pasar, si cualquier otra tabla de la misma query lleva su filtro.
- **La lente estática del lint SÍ es por tabla**: cuenta un acceso por tabla involucrada, incluidas las joineadas.
- **El switch descansa en las DOS.** Una fase de adopción que solo mire el verde del sentinel se está mintiendo.
- **Por eso la sonda de la demo del fail-closed tiene que ir sobre una query de UNA SOLA TABLA.** Y sobre un método que **algún test ejercite**: el piloto perdió un intento sobre `getById`, que no tiene un solo call site en `src/`.

### (i) Notas de método sobre la corrida de tests

- **`--no-file-parallelism` no es una concesión: es MÁS RÁPIDO.** `test/setup.ts` provisiona una base MySQL por worker (~96 s cada una); con un worker se paga **una sola vez** y los archivos siguientes corren en centésimas. 33 archivos de `subscriptions` + `reports` entran en 418 s. Además es la única forma de que el verde signifique algo en una máquina que no aguanta el provisioning en paralelo (`test/tenancy` entero en paralelo da 7 archivos rojos por bases sin migrar y `beforeAll` timeout — ruido que se lee como un rojo del switch y hace perder una hora).
- **La limpieza de `beforeEach` con DELETEs crudos va SIEMPRE en una conexión única del pool con `FOREIGN_KEY_CHECKS = 0`** (el patrón que `coach-load.test.ts` ya tenía). El orden "que cubre las FKs" es falso en cuanto otro archivo del mismo worker deja filas hijas: `isolate: false` hace que compartan base.
- **Agregar archivos de test re-baraja qué archivos comparten base por worker en CI, y una bomba FK latente puede explotar en un archivo que nadie tocó.** Le pasó al piloto: los 4 archivos nuevos de la batería ISO-03 pusieron CI rojo con `ER_ROW_IS_REFERENCED_2` en `coach-load-pricing-gate`, que la fase no había modificado. **No era el sentinel.** Si CI se pone rojo en un archivo ajeno justo después de agregar tests, mirá el patrón de limpieza antes de sospechar de la tenancy.
- Correr `prettier --write` **ANTES** de la corrida larga, no después: ahorra la duda de si el verde sigue valiendo.
- Antes de cambiar una firma, buscar **mocks posicionales**: `grep -rn "\.<metodo> = async" test/`. Un mock `(tx, row, links, sign)` con el `ctx` agregado adelante **rompe en silencio** — el test sigue verde probando nada.

---

## 5. La forma de la batería ISO-03

**Un archivo por familia de rutas** (el piloto: cajas / transacciones / coach-load), **un `describe` por ruta cuyo nombre contiene LITERAL la clave del manifiesto** (`<MÉTODO> <url>`, con la prosa adelante separada por ` — `). El nombre del test **es** el registro de cobertura: un array `RUTAS_CUBIERTAS` paralelo se desincroniza y a partir de ahí el gate defiende la lista en vez de la batería.

**Cada `describe` lleva dos `it`:** el caso de **aislamiento** y su **control positivo**. El control existe para matar un falso verde concreto: "el caso de aislamiento pasó porque la ruta está rota para todos".

**Precondiciones al principio del archivo**, y cada una neutraliza una forma distinta de pasar en verde sin probar nada:

| Precondición | Qué falso-verde mata |
|---|---|
| Las dos sedes comparten **país** | media docena de listados filtran por país además de por gimnasio: con países distintos, el aislamiento lo da el country scope y la tenancy no se ejerce. **Es el aislador alternativo que nadie nombra.** |
| El gimnasio 1 tiene recursos vivos | sin recurso ajeno, "no ve nada ajeno" es trivialmente cierto |
| Las filas del gimnasio 2 nacieron **ahí** | si la siembra cayera en el `DEFAULT 1`, todos los controles positivos estarían mirando datos del gimnasio 1 |
| Los importes sembrados son **irrepetibles** | con importes repetidos, un total contaminado puede dar el mismo número que el correcto |

**La evidencia se lee de la BASE, no del status HTTP.** `tenantDeLaFila(tabla, id)` y `campoDeLaFila(...)` sobre las tablas strict, con exención `tenant-safe` embebida. Reglas que salieron de casos reales:

- El barrido de un listado **no** se afirma con "no aparece el id que sembré", sino leyendo el `tenant_id` de **cada fila devuelta**: así caza también las filas ajenas que el test no sembró (seeds de migraciones y de `test/setup.ts`).
- La evidencia de un intento de escritura ajena son **varias columnas juntas** en un solo `toEqual` (una `fotoDeLaTransaccion`: gimnasio, estado, anulación, caja imputada, importe). Un rechazo que ya escribió la mitad se ve igual que uno limpio si se mira una sola columna.
- Un **agregado** (`/transactions/summary` devuelve un número, no filas) se afirma con **números exactos sobre importes irrepetibles y de otro orden de magnitud**: el contaminado se va a los millones y el rojo se lee solo. Afirmar `> 0` pasa con la plata de cualquiera; calcular el esperado leyendo la base es circular.
- El **`total`** de un listado paginado se afirma **aparte** de las filas: son dos queries, y un filtro que viva en una sola deja al staff viendo 3 filas y un total de 6.
- Los **exports** se parsean con `exceljs` y se afirman **por contenido**, leyendo las columnas por índice fijo. Es la ruta que más datos entrega de una vez.
- Cuando la plata se mueve **sin socio** (egresos, traspasos: `member_id NULL`), no hay listado que mirar: la evidencia es el **saldo** de las cajas de los dos gimnasios antes y después. Y el helper que lo suma va **sin** filtro de gimnasio, a propósito: lo que hay que cazar es una fila de un gimnasio imputada a la caja del otro.
- **El MOTIVO del rechazo se afirma junto con el status.** Una ruta con dos formas de contestar "no encontrado" puede pasar el caso de aislamiento por el motivo equivocado.

**Rol mínimo real (D-10).** El actor de cada `describe` es el rol **más barato que la ruta acepta y que el fixture puede crear**, y va explícito en cada call site (no escondido en un helper): el rol es parte de lo que la batería afirma. En el piloto, las 7 rutas de `/coach-load/*` con token de **coach** fueron las que destaparon los dos hallazgos de seguridad — ninguna de las 27 rutas anteriores los podía ver.

**Contrato 404/vacío (D-09), cero `403` esperados.** Un recurso de otro gimnasio tiene que ser **indistinguible del inexistente**: un 403 confirmaría su existencia. En la práctica sale gratis — la fila ajena no matchea y cae en la rama not-found que ya existía, sin tocar un solo `reply.code`. (Un `400` también cumple si el service trata el id no-matcheado como body inválido y el mensaje es idéntico al de un id inexistente.)

**Mutation testing como cierre, y hay que leer también los negativos.** Romper a mano uno o más `tenantWhere` en `src/` y verificar que los rojos caen **exactamente** en las rutas que sirve el método mutado. Los resultados del piloto:

- 2 mutaciones en `cash-register-service.ts` → **7 rojos**, y los que NO se pusieron rojos informan igual (sus métodos no se tocaron).
- Sacarle el filtro a `buildListConditions` → **ningún rojo**: el aislamiento de `GET /transactions` está sostenido por **dos** filtros independientes (los INNER JOIN de `users`/`branches` llevan el suyo). No es que las aserciones no muerdan.
- El camino de un movimiento inter-caja necesitó **cinco mutaciones simultáneas** para cruzar de gimnasio: `resolveCajaCountry` (la caja **y** la sede en el `ON`), `loadCaja`, el chequeo de sede de `create`, y una quinta en `getBalance` para la combinación inversa.

**Un test verde no prueba qué línea lo mantiene verde.** La mutación es la única forma de saberlo, y apuntarle a un solo `tenantWhere` y no ver nada **no** significa que el test no muerda.

**Cuando la batería encuentra deuda de OTRO módulo**, se ancla con una aserción **ejecutable** marcada como fallo esperado, nunca con un comentario: hoy documenta la fuga ejecutando, y el día que el dueño la arregle el test se pone en **rojo** ("esperaba fallar y pasó") y obliga a desmarcarlo. Es autodestructivo por diseño.

**El gate de cobertura** (`test/tenancy/iso-03-cobertura.test.ts`) es la plantilla completa y se copia cambiando **una constante** (el prefijo del módulo). Cinco piezas, y las tres últimas no son obvias:

1. `RUTAS_<MODULO>` **derivadas del manifiesto** (categoría `tenant-scoped` + prefijo), no escritas a mano: así una ruta nueva entra sola al gate en cuanto el gate ISO-01 la obliga a clasificarse.
2. Chequeo **bidireccional**: `faltantes` (ruta sin caso) y `fantasmas` (caso que apunta a una ruta inexistente). Un typo enciende los dos a la vez.
3. **Borrar los comentarios antes de buscar.** Los archivos de la batería listan sus rutas en sus propios docblocks: sin esto el gate está **verde midiendo prosa** aunque no exista un solo `it`.
4. **Probar el motor con fixtures sintéticos.** Si el borrador de comentarios se rompe, los cuatro tests reales siguen verdes con la batería vacía. Cuestan 2 ms.
5. **Ponerle gate a la lista de excepciones.** Toda entrada lleva su **motivo escrito** y su dueño, y un `it` le exige seguir existiendo en el manifiesto, seguir **fuera** del prefijo del módulo y seguir con un motivo utilizable. Sin eso, la lista es la salida de una línea para apagar el rojo de `faltantes`.

Dos cierres más: `describe.skip` / `.todo` **no cuentan** como cobertura (sería una salida de una línea), y el gate **no toca la base** — lee tres archivos de texto con `readFileSync` y corre en ~10 ms. Importar los archivos de la batería los **ejecutaría** (~250 s contra MySQL) y un gate que cuesta eso deja de correr.

---

## 6. Checklist de cierre, copiable

```
ADOPCIÓN DE <módulo> — checklist de cierre

CÓDIGO
[ ] pnpm lint:tenant → exit 0, DISCREPANCIAS: 0 contra la allowlist REAL
[ ] 0 entradas de la allowlist con `file` bajo src/modules/<módulo>/
[ ] 0 entradas de la allowlist con `table` entre las tablas strict del módulo
[ ] Inventario de exenciones `tenant-safe`: ninguna NUEVA dentro del módulo
[ ] grep -nE "tenantId!|tenantId\s*\?\?" en los archivos tocados → sin líneas
[ ] pnpm exec tsc --noEmit → exit 0

EL SWITCH (dos commits, en este orden)
[ ] 1º commit: allowlist — correr el lint, LISTAR las stale reales y borrarlas TODAS
    (el criterio del plan es un PISO; borrar siempre es legal en el ratchet)
[ ] 2º commit: entrada en TENANT_STRICT_MODULES con los nombres FÍSICOS de las tablas
[ ] Gate de forma actualizado: el registro se compara contra una SEGUNDA COPIA escrita
    a mano en el test (no contra sí mismo, y no "el módulo está presente")
[ ] `it` de coherencia D-15: ninguna tabla strict con entradas vivas en la allowlist
[ ] Si un gate numérico baja, la baja queda CONTABILIZADA por una aserción nueva que
    explica cada unidad perdida — bajar el número pelado está prohibido

FAIL-CLOSED, DEMOSTRADO
[ ] Sonda sobre una query de UNA SOLA TABLA de un método que algún test ejercite
[ ] Salida real del TenantSentinelError transcrita en el SUMMARY (SQL + cadena de cause)
[ ] Sonda REVERTIDA: git status --porcelain vacío

TESTS
[ ] Barrido global sobre test/ en CERO (accesos literales), y las tablas dinámicas
    clasificadas a mano contra el .sql que ejecutan
[ ] Batería de aislamiento: caso + control positivo por ruta, cero 403 esperados
[ ] Gate de cobertura bidireccional, con el rojo encendido a propósito EN LOS DOS
    SENTIDOS y revertido
[ ] Mutation testing: los rojos caen donde tienen que caer (y anotar los que NO caen)
[ ] Suite completa verde en CI con el sentinel en throw

NÚMEROS Y GENTE
[ ] Diff del snapshot contra `antes.json`: vacío, o cada divergencia explicada
    campo por campo (el ruido típico: campos calculados contra NOW)
[ ] UAT del staff en staging: cobrar / validar / arquear, sin cambios de comportamiento

ONBOARDING DEL GIMNASIO NUEVO (no del módulo)
[ ] El gimnasio tiene su propia sede virtual "Templo Online"
[ ] Ninguna ruta del módulo depende de una fila del gimnasio 1 para funcionar
```

---

## 7. Costo real del piloto (para que 173-175 dimensionen)

| Dimensión | Real |
|---|---|
| Planes GSD | **23** |
| Commits de código | **52** en la rama (51 al mergear a staging + 1 fix FK-safe que destapó CI) |
| Archivos tocados | **88** — `+12.136 / −2.222` |
| Entradas de allowlist borradas | **51** (501 → 450) |
| Rutas con caso de aislamiento | **38** (14 + 13 + 11) |
| Migraciones aplicadas | **0** — la adopción es 100% código |
| Duración | ~5 días de trabajo agentic, ~20 h de reloj |

**Distribución del esfuerzo, medida:**

- Migración de `src/` (planes 02-12): **11 planes**. Es la parte que todo el mundo estima.
- Endurecimiento de `test/` (planes 13-16): **4 planes, ~250 min**. **Es lo que se subestimó.** El plan original la trataba como un apéndice de la migración; en la práctica es una cadena serializada (comparten una sonda temporal sobre `tenant-tables.ts` que hay que encender y apagar a mano, con pre-check obligatorio) y produjo tres hallazgos que ningún grep vio. A eso hay que sumarle los fixes de limpieza que CI destapó **después** del merge (el patrón FK-safe), que no estaban en ningún plan.
- Batería ISO-03 + gate (planes 17-20): **4 planes, ~300 min**, 5.900 líneas de test nuevas.
- Switch + verificación (planes 21-22): **2 planes**, la mitad de ese tiempo esperando a vitest.

**Las tres correcciones de estimación para 173-175:**

1. **`test/` es entre un cuarto y un tercio del trabajo, no un apéndice.** Presupuestá un plan de endurecimiento por cada 3-4 planes de migración de `src/`.
2. **Los conteos derivados de un inventario estático están sobrestimados 2-3×** (cuentan referencias `schema.X`, no queries) — **salvo la allowlist, que está subestimada**: el piloto planeó borrar 47 entradas y eran **51**. Las 4 de diferencia eran **colaterales**: tablas joineadas en queries que otro plan había scopeado, y el motor del lint las cuenta como accesos propios. Dejarlas habría dejado el lint rojo igual que agregarlas.
3. **El tiempo de reloj lo domina vitest, no el razonamiento.** Con `--no-file-parallelism` una corrida dirigida cuesta 100-420 s y hacen falta muchas. Planificá las verificaciones en lotes grandes en vez de correr de a un archivo.

---

## Registro de cambios

- **2026-07-31** — Creación al cerrar la fase 172 (plan 172-23), leyendo los 22 SUMMARY del piloto. Todo número de este doc está medido; toda trampa está fechada en el plan que la pagó. Insumos que no estaban en ningún plan previo y que entraron acá: la sede virtual propia por gimnasio (172-19), el sentinel por-query vs la lente por-tabla (172-21), el orden allowlist→strict del switch (172-21), el patrón FK-safe de la limpieza y el re-barajado de workers de CI (172-22), y la reconciliación 47 → 51 del conteo de allowlist (172-21).
