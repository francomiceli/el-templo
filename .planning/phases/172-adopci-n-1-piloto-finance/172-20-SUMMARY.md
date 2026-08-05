---
phase: 172-adopci-n-1-piloto-finance
plan: 20
subsystem: testing
tags:
  [
    tenancy,
    finance,
    iso-03,
    gate,
    fail-closed,
    cobertura,
    manifiesto,
    bidireccional,
    baseline,
    excepciones-nombradas,
  ]

# Dependency graph
requires:
  - plan: 172-17
    provides: "iso-03-finance-cajas.test.ts — 14 rutas, y la plantilla de la bateria"
  - plan: 172-18
    provides: "iso-03-finance-transacciones.test.ts — 13 rutas"
  - plan: 172-19
    provides: "iso-03-finance-coach-load.test.ts — 11 rutas, y la tabla ruta->archivo de las 38 en formato clave del manifiesto"
  - phase: 171-backstop
    provides: "test/tenant-manifest.ts (TENANT_MANIFEST, 372 rutas clasificadas) y el gate iso-01-manifiesto.test.ts como analog exacto"
provides:
  - "test/tenancy/iso-03-cobertura.test.ts — el gate fail-closed BIDIRECCIONAL de la bateria ISO-03: 8 tests (4 contra el manifiesto real + 4 de motor con fixtures sinteticos)"
  - "RUTAS_FINANCE derivadas del TENANT_MANIFEST por prefijo /api/admin/finance/ — el criterio NO es una lista escrita a mano, asi que una ruta finance nueva entra sola al gate en cuanto el gate ISO-01 la obliga a clasificarse"
  - "EXCEPCIONES_NOMBRADAS (exportada): GET /api/admin/analytics/advanced-finance, con el motivo escrito y el dueño (fase 175). La consumen la receta del 172-23 y las fases 173-175"
  - "CASOS_BASELINE = 38 con docblock de que bajarlo es una decision de diseño, no un ajuste"
  - "Los 39 describes de ruta de los 3 archivos normalizados a la clave LITERAL del manifiesto: el nombre del test ES el registro de cobertura, sin lista paralela que se desincronice"
  - "clavesDeLosDescribe / sinComentarios exportadas y probadas con fixtures sinteticos — un describe.skip NO cuenta como cobertura, y una ruta nombrada solo en un comentario tampoco"
  - "ISO-03 CERRADO: 38/38 rutas finance tenant-scoped con caso, y el gate que impide que eso envejezca en silencio"
affects: [172-21, 172-22, 172-23, 173, 174, 175]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El nombre del `describe` ES el registro de cobertura: contiene LITERAL la clave del manifiesto (`<MÉTODO> <url>`), con la prosa adelante separada por ` — `. La alternativa (un array RUTAS_CUBIERTAS escrito a mano) es una segunda lista que se desincroniza de la primera, y entonces el gate defiende la lista en vez de la bateria"
    - "Un gate que lee tests por texto tiene que BORRAR LOS COMENTARIOS primero: los 3 archivos de la bateria listan sus 38 rutas en sus docblocks, asi que sin eso el gate da verde midiendo prosa (es el 172-16 al reves: alla el substring ponia rojo de mas, aca pondria verde de mas)"
    - "Se lee el FUENTE con readFileSync en vez de importar los archivos: importarlos los EJECUTA (~250 s contra MySQL) y un gate que tarda eso no corre siempre"
    - "Un `describe.skip` no cuenta como cobertura: si contara, la salida facil para el rojo seria apagar el test en vez de escribirlo"
    - "Una lista de excepciones necesita su propio gate: que la ruta siga existiendo, que siga fuera del criterio automatico y que siga con motivo utilizable — si no, la exencion se pudre igual que cualquier lista escrita a mano"
    - "El baseline no solo cuenta lo esperado: tambien exige que CADA fuente aporte (> 0), porque un total correcto puede esconder que una de las tres lecturas se rompio"

key-files:
  created:
    - el-templo-api/test/tenancy/iso-03-cobertura.test.ts
  modified:
    - el-templo-api/test/tenancy/iso-03-finance-coach-load.test.ts
    - el-templo-api/test/tenancy/iso-03-finance-cajas.test.ts

key-decisions:
  - "El criterio de 'que es una ruta finance' se DERIVA del manifiesto (categoria tenant-scoped + prefijo /api/admin/finance/) y no se escribe a mano: es lo unico que hace que una ruta nueva entre sola al gate. Con la lista escrita a mano habria dos registros que se desincronizan y el gate defenderia el suyo"
  - "EXCEPCIONES_NOMBRADAS lleva el MOTIVO en texto (no un set de claves peladas), misma forma que TENANT_GLOBAL_UNIQUES y que los `motivo` del manifiesto: la unica forma de eximir algo es escribir por que. Y tiene su propio test, que le exige seguir existiendo en el manifiesto, seguir FUERA del prefijo y seguir con un motivo utilizable — asi la lista no puede convertirse en la puerta para apagar el rojo de faltantes"
  - "GET /api/admin/analytics/advanced-finance queda AFUERA de la bateria: se llama finance pero vive en src/modules/analytics/routes.ts y su adopcion es de la fase 175. Meterla adentro habria atado el cierre de ISO-03 —el gate para onboardear el gimnasio 2— a un modulo que esta fase no migra"
  - "Se agrego un bloque de 4 fixtures sinteticos (motor) que el plan no pedia: sin el, el verde del gate podria ser prosa. Los 3 headers de la bateria listan entre los tres las 38 rutas, asi que el modo de falla 'sinComentarios deja de funcionar y el gate queda verde con la bateria vacia' es real y silencioso"
  - "describe.skip y describe.todo NO cuentan como cobertura (no estaba en el plan): un caso apagado no prueba aislamiento, y si contara existiria una salida de una linea para el rojo"
  - "El gate no toca la base a proposito: ni un request, ni buildApp, ni una fila. Su valor es correr SIEMPRE, y para eso tiene que ser barato"

patterns-established:
  - "Gate de cobertura de una bateria de aislamiento: criterio derivado del manifiesto + excepciones nombradas con motivo + bidireccionalidad (faltantes/fantasmas) + baseline con docblock + motor probado con fixtures. Es la plantilla que copian las fases 173-175 cuando cierren su propia bateria"

requirements-completed: [ISO-03]

# Metrics
duration: ~30min
completed: 2026-07-31
---

# Phase 172 Plan 20: El gate que impide que la batería envejezca en silencio Summary

**La batería ISO-03 pasó de "está completa hoy" a "no puede dejar de estarlo": `iso-03-cobertura.test.ts` cruza las 38 rutas finance `tenant-scoped` del manifiesto contra las que los 98 tests de los planes 17/18/19 dicen cubrir, en las dos direcciones, y deriva el criterio del `TENANT_MANIFEST` en vez de una lista escrita a mano — así una ruta finance nueva entra sola al gate en cuanto el gate ISO-01 la obliga a clasificarse. Se probó encendiendo el rojo a propósito en los dos sentidos: comentar un `describe` deja el CI rojo NOMBRANDO `POST /api/admin/finance/cost-centers/:id/reactivate`, y renombrar una ruta a una inexistente lo deja rojo por `fantasmas` nombrando `/expensas-que-no-existen`. Las dos mutaciones quedaron revertidas. El hallazgo de diseño del plan es el que casi lo rompe: los tres archivos de la batería listan sus 38 rutas en sus propios docblocks, así que un gate que lea el fuente crudo daría verde **midiendo prosa** aunque no existiera un solo `it` — por eso `sinComentarios()` corre primero y por eso hay cuatro fixtures sintéticos que lo demuestran. Con esto **ISO-03 queda cerrado**: 38/38 con gate propio.**

## Performance

- **Duration:** ~30 min (de los cuales ~11 son corridas de vitest: 3 del gate a ~98 s + la de los 3 archivos iso-03 en un worker a 256 s)
- **Completed:** 2026-07-31
- **Tasks:** 2/2 (las dos `auto`)
- **Files:** 1 creado (**470 líneas**, de las cuales ~100 son el docblock que explica por qué existe) + 2 modificados (24 líneas, todas de `describe`); **cero archivos de `src/`**

## Task Commits

| Task | Nombre                                           | Commit     | Archivos                                                                     |
| ---- | ------------------------------------------------ | ---------- | ---------------------------------------------------------------------------- |
| 1    | los describes son la clave del manifiesto        | `e34ca6ff` | `iso-03-finance-coach-load.test.ts` (11), `iso-03-finance-cajas.test.ts` (1) |
| 2    | el gate bidireccional `iso-03-cobertura.test.ts` | `543e0ab3` | `test/tenancy/iso-03-cobertura.test.ts` (nuevo)                              |

Los dos commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `ed12efa9` del plan 19).

## Task 1: por qué el nombre del test es el registro de cobertura

La decisión de fondo la tomó el plan y vale la pena dejarla escrita: la alternativa obvia era un array `RUTAS_CUBIERTAS` al lado de cada archivo de la batería. Se descartó por lo mismo que existe el manifiesto — **una segunda lista escrita a mano se desincroniza de la primera**, y a partir de ahí el gate defiende la lista en vez de la batería. El nombre del `describe` no puede mentir sin que el rojo lo diga.

Los cambios fueron **24 líneas, todas de `describe`**, `git diff | grep -c "expect("` = **0**:

- **11 en `iso-03-finance-coach-load.test.ts`:** las rutas estaban escritas con la url **corta** (`GET /coach-load/autocompletar/:userId`, `POST /movements`, `POST /expenses`), que es como se registran dentro del plugin pero **no** es la clave del manifiesto. Pasan a `/api/admin/finance/...` completo, manteniendo la prosa adelante y el actor atrás (`(actor: COACH, rol minimo real)`), que el 172-19 dejó ahí a propósito.
- **1 en `iso-03-finance-cajas.test.ts`:** el `describe` del rango de fechas nombraba la ruta con **query string** (`…/balances?dateFrom&dateTo`). Fastify registra **paths**, no query strings, así que esa clave no existe en el manifiesto y habría entrado como fantasma. Ahora es `saldos por caja CON rango de fechas (dateFrom/dateTo) — GET /api/admin/finance/cash-registers/balances`, y la ruta queda cubierta por dos bloques (que es correcto: el rango dispara `getPeriodMovement`, otra agregación).
- **0 en `iso-03-finance-transacciones.test.ts`:** ya cumplía. El plan lo listaba como modificado; no hizo falta tocarlo.

Resultado verificado por script contra `test/tenant-manifest.ts`: **39 `describe` de ruta → 38 claves únicas, todas existentes textualmente en el manifiesto**; los 3 bloques de "precondiciones de la bateria" no nombran ruta y se ignoran.

## Task 2: el gate, y las tres cosas que no estaban en el plan

### Lo que el plan pedía

| Pieza                   | Cómo quedó                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `RUTAS_FINANCE`         | `Object.entries(TENANT_MANIFEST)` filtrado por `categoria === "tenant-scoped"` + prefijo `/api/admin/finance/` → **38** |
| `EXCEPCIONES_NOMBRADAS` | exportada, `Record<clave, motivo>`, hoy con una entrada y su comentario de por qué                                      |
| `CASOS_ESCRITOS`        | `fs.readFileSync` de los 3 archivos (**no** se importan) → claves de sus `describe`                                     |
| `faltantes`             | `toEqual([])` con mensaje que nombra, dice qué hacer (caso **+ control positivo**, en qué archivo) y por qué importa    |
| `fantasmas`             | `toEqual([])` con las tres causas (typo / rename / ruta borrada) y qué hacer con cada una                               |
| `CASOS_BASELINE = 38`   | con docblock: **sube** con ruta + caso, **baja SOLO** si la ruta deja de existir en el API                              |
| No toca la base         | ni un request, ni `buildApp`, ni una fila — solo texto                                                                  |

### Lo que se agregó, y por qué (las tres desviaciones que importan)

**1. Se borran los comentarios antes de buscar — y hay fixtures que lo prueban.**

Es el hallazgo del plan. Los tres archivos de la batería abren con un docblock que **lista sus rutas, una por línea, en el formato exacto de la clave**. Entre los tres headers están las 38. Un gate que buscara por substring sobre el fuente crudo daría **verde por los comentarios**, aunque la batería estuviera vacía. Es la lección del 172-16 exactamente al revés: allá un gate por substring ponía **rojo de más** (un comentario de `test/setup.ts` nombraba el fixture); acá pondría **verde de más**, que es infinitamente peor porque nadie lo mira.

Por eso `sinComentarios()` corre primero, y por eso se agregó un segundo bloque de **4 fixtures sintéticos** (mismo patrón que el motor de `iso-01-manifiesto.test.ts` y que `con-06-lint.test.ts`, que corre sobre fixtures y sobre el repo real):

| Fixture                                        | Qué mata                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| ruta nombrada SOLO en un docblock y en un `//` | el verde por prosa — **el modo de falla que más importa de este archivo** |
| `describe` bien formado con prosa adelante     | que el extractor deje de extraer (rojo ruidoso pero honesto)              |
| `describe.skip` con la clave                   | que apagar un test cuente como cobertura                                  |
| `describe` sin ruta (precondiciones)           | que un bloque sin ruta se reporte como fantasma y llene el gate de ruido  |

**2. `describe.skip` / `describe.todo` no cuentan como cobertura.** No estaba en el plan. Si contaran, existiría una salida de **una línea** para el rojo de `faltantes`: apagar el test en vez de escribirlo. Un caso apagado no prueba aislamiento.

**3. La lista de excepciones tiene su propio gate.** Un cuarto `it` le exige a cada entrada de `EXCEPCIONES_NOMBRADAS` tres cosas:

- **seguir existiendo en el manifiesto** — si la ruta se borró o renombró, la exención quedó huérfana y nadie se enteró;
- **seguir FUERA del prefijo `/api/admin/finance/`** — esta es la importante: sin ella, el rojo de `faltantes` se apagaría escribiendo una línea en la lista en vez de un test, y el archivo entero dejaría de significar algo;
- **seguir con un motivo utilizable** (≥ 20 caracteres, sin `TODO`/`FIXME`/`TBD`/`XXX`/`pendiente`), mismo criterio que D-02 le aplica a las entradas `global` del manifiesto.

**4. El baseline exige además que CADA archivo aporte** (`claves.length > 0`). Un total correcto puede esconder que una de las tres lecturas se rompió y otra compensó; y si las tres se rompen, el conteo de `cubiertas` cae a 0 y el mensaje manda a revisar **la derivación, no la cobertura**.

### La excepción de hoy, con nombre y dueño

```ts
"GET /api/admin/analytics/advanced-finance":
  "Ruta del módulo analytics (no de finance): la adopta y la aísla la fase 175, con la batería de métricas."
```

Se llama "finance" pero vive en `src/modules/analytics/routes.ts` (es la vista Caja vs Devengado + ARPU, que **lee** de finanzas en vez de escribirlas) y no matchea el prefijo. Meterla adentro habría atado el cierre de ISO-03 —el gate para onboardear el gimnasio 2— a un módulo que esta fase no migra. **Dueño: fase 175 (Adopción 4 — analytics + resto del core).**

## El rojo, demostrado en las DOS direcciones y revertido

### Dirección 1 — ruta sin caso (`faltantes`)

Se comentó con `//` el **bloque entero** del último `describe` de `iso-03-finance-cajas.test.ts` (`reactivacion de centro de costo`, línea 1100 → EOF). El gate:

```
× toda ruta finance tenant-scoped tiene caso de aislamiento
× la batería cubre exactamente las 38 rutas finance del baseline
✓ todo caso de la batería apunta a una ruta que existe en el manifiesto
  (+ los 4 del motor y el de excepciones, verdes)

AssertionError: Rutas finance "tenant-scoped" del manifiesto que NO tienen caso
en la batería ISO-03: POST /api/admin/finance/cost-centers/:id/reactivate.
QUÉ HACER: … Y el caso son DOS its, no uno: el de aislamiento … y su CONTROL
POSITIVO … LO QUE NO ES UNA SALIDA: renombrar el describe sin escribir el test,
apagarlo con .skip (no cuenta, a propósito), o meter la ruta en
EXCEPCIONES_NOMBRADAS …

AssertionError: La batería declara 37 rutas finance cubiertas y el baseline dice 38.
```

**El comentado con `//` es la prueba directa de que `sinComentarios()` funciona:** el bloque sigue en el archivo, palabra por palabra, y el gate no lo cuenta.

### Dirección 2 — caso que apunta a una ruta que no existe (`fantasmas`)

Se renombró `POST /api/admin/finance/expenses` a `POST /api/admin/finance/expensas-que-no-existen` en el `describe` de `iso-03-finance-coach-load.test.ts`:

```
× toda ruta finance tenant-scoped tiene caso de aislamiento
× todo caso de la batería apunta a una ruta que existe en el manifiesto
× la batería cubre exactamente las 38 rutas finance del baseline

AssertionError: Casos de la batería cuyo describe nombra una ruta que NO existe
entre las rutas finance del manifiesto:
POST /api/admin/finance/expensas-que-no-existen. Las causas son tres … (1) un
TYPO … (2) un RENAME … (3) un caso que quedó cubriendo una ruta BORRADA …

AssertionError: Rutas finance … que NO tienen caso …: POST /api/admin/finance/expenses.
```

Un typo enciende **los dos lados a la vez**, que es exactamente lo que se quiere: la ruta real queda sin cubrir **y** el caso apunta a la nada.

### Reversión verificada

```
git checkout -- <cada archivo mutado>
git status --porcelain el-templo-api/test/tenancy
  → ?? el-templo-api/test/tenancy/iso-03-cobertura.test.ts   (solo el archivo nuevo, antes de commitearlo)
git diff --stat  → vacío
```

## Verificación

| Criterio                                                                              | Resultado                                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm exec vitest run test/tenancy/iso-03-cobertura.test.ts`                          | ✅ **8/8** (98 s, de los cuales ~95 son provisioning)         |
| Rutas finance reportadas cubiertas                                                    | ✅ **38** (= `CASOS_BASELINE`)                                |
| Rojo por `faltantes`, nombrando la ruta                                               | ✅ demostrado y revertido                                     |
| Rojo por `fantasmas`, nombrando la clave inventada                                    | ✅ demostrado y revertido                                     |
| Los 3 archivos iso-03 en UN worker **después** del renombre de Task 1                 | ✅ **98/98** en 256 s (`--no-file-parallelism`)               |
| `pnpm exec tsc --noEmit`                                                              | ✅ exit 0 después de cada task                                |
| `git diff -- el-templo-api/test/tenancy \| grep -c "^[-+].*expect("` (Task 1)         | ✅ **0**                                                      |
| Líneas cambiadas en Task 1 que NO son `describe(`                                     | ✅ **0** (24 de 24 son `describe`)                            |
| `grep -c "EXCEPCIONES_NOMBRADAS" test/tenancy/iso-03-cobertura.test.ts`               | ✅ **6** (criterio: ≥ 1)                                      |
| Cada `describe` de ruta contiene una clave textual del manifiesto                     | ✅ **39 describes → 38 claves únicas**, verificado por script |
| `git status --porcelain el-templo-api/test/tenancy` sin restos de las pruebas de rojo | ✅ vacío                                                      |
| `prettier --write` sobre los 3 archivos tocados                                       | ✅                                                            |
| Archivos de `src/` tocados                                                            | ✅ **0**                                                      |

### 📌 Entradas de allowlist que paga este plan: **0**

Igual que los planes 13→19 y por el mismo motivo: `tenant-lint-allowlist.json` solo cubre `src/` y este plan no toca una línea de `src/`. **La cuenta acumulada para el 172-21 sigue en 51.**

## Accomplishments

- **ISO-03 cerrado.** 38/38 rutas finance `tenant-scoped` con caso de aislamiento + control positivo, y un gate que hace imposible que ese número baje en silencio. Es el requisito que el milestone usa como puerta para onboardear el segundo gimnasio.

- **El criterio se deriva, no se escribe.** El día que alguien registre `POST /api/admin/finance/lo-que-sea` en la fase 174, el gate ISO-01 lo obliga a clasificarla en el manifiesto, y con esa línea puesta el gate de cobertura la reclama sola. Nadie tiene que acordarse de nada — que es la única forma en que estas cosas sobreviven tres fases.

- **El gate es barato a propósito.** No manda un request, no construye el app, no lee una fila: lee tres archivos de texto. Importar los archivos de la batería los **ejecutaría** (~250 s contra MySQL) y un gate que cuesta eso deja de correr. Precedente en la misma carpeta: `iso-02-fixtures.test.ts` lee `test/setup.ts` con `readFileSync`.

- **Las tres salidas fáciles quedaron cerradas, cada una con su test:** renombrar el `describe` sin escribir el test (lo mata el control positivo que el caso ya exige), apagarlo con `.skip` (no cuenta), y meter la ruta en la lista de excepciones (el cuarto test le exige estar fuera del prefijo).

- **El modo de falla silencioso quedó probado.** Sin `sinComentarios()`, este gate estaría **verde midiendo los docblocks** de los archivos que audita. Es el tipo de falla que no se descubre nunca porque nadie mira un test verde.

## Decisions Made

### 1. Prefijo derivado del manifiesto + excepciones nombradas, y no un set explícito de 38+1

Tres opciones (`172-PATTERNS.md` §10 recomendaba la tercera):

- **Set explícito de las 39 claves** — el gate diría exactamente lo que hay hoy, y una ruta finance nueva **no rompería nada**: habría que acordarse de agregarla al set. Es el registro paralelo que este archivo existe para no tener.
- **Solo prefijo, sin excepciones** — simple, pero deja `advanced-finance` sin nombrar en ningún lado: en un año nadie sabe si quedó afuera por decisión o por descuido.
- **Prefijo + lista de excepciones con motivo** ✅ — la ruta nueva entra sola (fail-closed) y lo que queda afuera está escrito con su razón y su dueño. La forma —clave + motivo— es la de `TENANT_GLOBAL_UNIQUES` y la de los `motivo` del manifiesto: la única manera de eximir algo es escribir por qué.

### 2. La lista de excepciones no puede ser la puerta de escape

Una lista de exenciones sin gate propio es una invitación: el rojo de `faltantes` nombra una ruta, y agregarla a `EXCEPCIONES_NOMBRADAS` es una línea contra escribir un test que tarda una hora. Por eso el cuarto `it` exige que toda excepción esté **fuera del prefijo `/api/admin/finance/`**. Una ruta del módulo finance metida ahí deja el gate rojo igual, y el mensaje lo dice con todas las letras.

### 3. El motor se prueba con fixtures, aunque el plan no lo pidiera

Los cuatro tests de arriba prueban que **hoy** la batería y el manifiesto coinciden. Ninguno prueba que el extractor **sepa distinguir un test de un comentario** — y si `sinComentarios()` se rompiera, los cuatro seguirían verdes con la batería vacía. Es el mismo argumento por el que `iso-01` tiene su bloque sintético y por el que `con-06-lint` corre el linter dos veces. El costo son 4 `it` que corren en 2 ms.

### 4. Un `describe` de precondiciones se ignora en silencio, no se reporta

Los tres archivos abren con un bloque `precondiciones de la bateria` que no cubre ninguna ruta. Tratarlo como fantasma llenaría el gate de ruido permanente y entrenaría a leer los rojos por encima — que es cómo mueren los gates.

## Deviations from Plan

### Auto-fixed Issues

**Ninguno.** No hubo que tocar `src/` ni ningún fixture.

### Desviaciones de alcance (5, ninguna relaja una aserción; cuatro AGREGAN gate)

**1. `iso-03-finance-transacciones.test.ts` no se tocó.** El plan lo listaba en `files_modified` y en la `<files>` de la Task 1; sus 13 `describe` ya contenían la clave completa del manifiesto. Modificarlo para cumplir la letra del plan habría sido churn.

**2. El `describe` del rango de fechas de cajas tenía QUERY STRING, no solo url corta.** El plan asumía que el trabajo de Task 1 era prefijar urls. `…/balances?dateFrom&dateTo` no es una clave del manifiesto (Fastify registra paths), así que habría entrado como **fantasma**. Se movió el detalle del rango a la prosa.

**3. `describe.skip` / `.todo` no cuentan como cobertura** (+1 fixture). No estaba en el plan; cierra una salida de una línea.

**4. Bloque de 4 fixtures sintéticos del motor.** No estaba en el plan. Justificación completa en la decisión 3 — sin él el gate puede estar verde midiendo prosa.

**5. Dos aserciones extra de anti-vacuidad:** el gate de la lista de excepciones (existe / fuera del prefijo / con motivo) y el `> 0` por archivo dentro del test de baseline.

---

**Total deviations:** 0 auto-fixed + 5 de alcance. Dos son hallazgos sobre el estado real de los archivos (1 y 2) y tres agregan defensa que el plan no había previsto.

## Issues Encountered

**El gate tarda ~98 s aunque no toque la base.** No es el gate: son ~95 s de provisioning del worker, que `test/setup.ts` cobra como `setupFiles` de **todos** los archivos, estén en la carpeta que estén (hallazgo 169-07, y la misma nota que tiene `iso-01-manifiesto.test.ts` en su docblock). El gate en sí corre en **~10 ms** — los 8 tests suman 9 ms de trabajo real. No hay nada que arreglar en este plan; queda anotado para quien alguna vez quiera una carpeta sin `setupFiles`.

**`tsc --noEmit` sigue sin cubrir `test/`** (`tsconfig.json` incluye solo `src/**/*`). Se corrió igual después de cada task —exit 0— porque prueba que no se rompió `src/`. El único gate real de un archivo de test sigue siendo vitest, y por eso las validaciones de forma de este archivo (motivo de las excepciones, categoría) son de **runtime**, igual que las de `iso-01`.

**No hay ESLint en `el-templo-api`.** Se corrió `prettier --write` sobre los 3 archivos tocados (lección del 172-13).

**Este plan NO corrió con la sonda strict encendida**, por regla explícita del plan. El gate nuevo no ejecuta una sola query, así que es strict-safe por construcción; los 3 archivos de la batería ya venían verificados por sus planes.

## Deferred Issues

**Los 2 rojos de `test/tenancy/con-06-lint.test.ts`** siguen siendo del **172-21** (51 entradas stale de allowlist + la lente estática). En `deferred-items.md` desde el 172-16.

**Los 2 rojos ambientales de `coach-load-alta.test.ts`** siguen en `deferred-items.md` desde el 172-14; fuera de alcance.

**Las dos deudas de `subscriptions` del 172-19** (la fuga de `getMemberSubscription` y el bloqueo de `POST /coach-load/alta`) siguen siendo de la **fase 173**, ancladas con aserciones ejecutables.

**`test/tenancy` entero en paralelo no entra en esta máquina** (del 172-18). El gate nuevo **sí** corre solo sin problema, y es el único archivo de la carpeta del que eso se puede decir sin asteriscos.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas de request, no instala paquetes, no modifica una línea de `src/` y su único archivo nuevo no abre una conexión.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-20-01 | ✅ gate fail-closed derivado del manifiesto, con el rojo **encendido a propósito** y nombrando la ruta (`POST /api/admin/finance/cost-centers/:id/reactivate`), revertido después                                            |
| T-172-20-02 | ✅ `CASOS_BASELINE = 38` con docblock que declara que moverlo es una decisión de diseño (sube con ruta + caso, baja SOLO si la ruta deja de existir), igual que `ENTRADAS_BASELINE` de iso-01                                |
| T-172-20-03 | ✅ chequeo bidireccional de fantasmas, demostrado renombrando una ruta a una inexistente. **Además** se cerró un vector que el threat model no listaba: la lista de excepciones como puerta para apagar el rojo de faltantes |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                                                 |

## Next Phase Readiness

**El 172-21 (EL SWITCH) no tiene nada que esperar de este plan.** El gate no toca `src/`, no toca `tenant-lint-allowlist.json` y no enciende la sonda. La cuenta de allowlist sigue en **51** y el 172-21 sigue siendo su único dueño. Una nota útil para esa corrida: el archivo nuevo **no necesita base**, así que si la suite completa con el sentinel en throw se pone ruidosa, éste es un archivo del que se puede descartar el ruido ambiental de entrada.

**El 172-23 (receta de adopción) tiene dos entradas nuevas:**

1. **`EXCEPCIONES_NOMBRADAS` es citable**, está exportada a propósito: la receta no tiene que redescubrir por qué `advanced-finance` no está en la batería.
2. **La receta de "cómo se cierra una batería de aislamiento"** es este archivo: criterio derivado del manifiesto + excepciones con motivo + bidireccionalidad + baseline con docblock + motor probado con fixtures. La cabecera del gate ya apunta a `.docs/saas-multitenancy/07-receta-adopcion.md` (⚠️ `.docs/` no está versionado: vive solo en el checkout principal).

**Las fases 173-175 heredan la plantilla completa.** Cuando `members`, `subscriptions`/`scheduling` y `analytics` escriban su batería, copian esto cambiando **una constante** (`PREFIJO_FINANCE`) y la lista de archivos. Tres cosas que no son obvias y hay que copiar sí o sí:

1. **Borrar los comentarios antes de buscar**, porque los headers de las baterías listan sus rutas.
2. **Probar el motor con fixtures**, porque el verde de un gate de texto puede ser prosa.
3. **Ponerle gate a la lista de excepciones**, o se convierte en la salida fácil.

**Sin blockers para el 172-21.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-20-SUMMARY.md`
- `FOUND` commits `e34ca6ff` (T1) y `543e0ab3` (T2) en `feat/172-adopcion-finance`
- `FOUND` `el-templo-api/test/tenancy/iso-03-cobertura.test.ts`
- `VERIFIED` **8/8** verdes con la batería actual, reportando **38** rutas cubiertas
- `VERIFIED` rojo en las DOS direcciones (`faltantes` con el nombre de la ruta, `fantasmas` con la clave inventada) y **revertido**: `git status --porcelain el-templo-api/test/tenancy` sin restos
- `VERIFIED` **98/98** con los 3 archivos iso-03 en UN worker **después** del renombre de Task 1
- `VERIFIED` `tsc --noEmit` exit 0 después de cada task
- `VERIFIED` Task 1: **0** líneas con `expect(` en el diff, **24/24** líneas cambiadas son `describe(`
- `VERIFIED` por script contra `test/tenant-manifest.ts`: **39 describes de ruta → 38 claves únicas**, todas presentes textualmente
- `VERIFIED` `grep -c "EXCEPCIONES_NOMBRADAS"` = **6**
- `VERIFIED` `git diff ed12efa9..HEAD --stat` = 3 archivos, **0 de `src/`**; `tenant-lint-allowlist.json` y `src/db/tenant-tables.ts` sin tocar

**ISO-03 queda FUNCIONALMENTE cerrado, con una salvedad escrita.** Las 38 rutas finance tienen caso (172-17/18/19) y este plan agrega el gate que impide que eso se degrade. La salvedad: el texto del requisito dice "no expone ni escribe datos del tenant B", y hoy **`GET /coach-load/autocompletar/:userId` sí expone** el plan de un socio ajeno — por deuda de `subscriptions`, fuera de alcance por D-07, anclada con una aserción ejecutable y con dueño (fase 173). La batería no falla: **la encontró**. Quien cierre el milestone tiene que decidir si ISO-03 se marca con esa fuga viva o después de la 173.

**`REQUIREMENTS.md` NO se tocó**, siguiendo la convención real del proyecto: ISO-01 e ISO-02 también siguen en `Pending` en la tabla de trazabilidad aunque la fase 171 los entregó, y ningún `docs(172-XX)` de esta fase la modificó. Queda anotado en `deferred-items.md` como tarea de cierre de milestone, no de este plan.

**ADO-01 sigue SIN marcarse**: exige `finance` adoptable por un gimnasio nuevo, y `POST /coach-load/alta` todavía no lo es por la deuda de `subscriptions` (fase 173), además del switch que falta encender (172-21).

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-31_
