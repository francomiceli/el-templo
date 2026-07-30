---
phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant
plan: 03
subsystem: testing
tags: [multi-tenancy, fastify, onRoute, manifiesto, fail-closed, gate, ISO-01]

# Dependency graph
requires:
  - phase: 171-01
    provides: el seam `BuildAppOptions.onRoute` en `buildApp()`, `createTestApp(opts)` y las 3 funciones puras (`clavesDeEvento` / `particionarObservadas` / `compararManifiesto`)
  - phase: 171-02
    provides: "`TENANT_MANIFEST` con las 370 entradas — el baseline contra el que este gate compara"
provides:
  - "`test/tenancy/iso-01-manifiesto.test.ts` — gate fail-closed bidireccional del manifiesto contra el app real (4 tests) + el motor probado con fixtures sintéticos (5 tests)"
  - "Evidencia literal del criterio 2 del ROADMAP demostrado en vivo con una sonda en `src/app.ts`"
affects:
  [
    171-06 (checkpoint humano — el gate ya está puesto cuando Franco decide),
    172-175 (toda ruta nueva de esas fases pasa por este gate),
    176 (requireModule lee la etiqueta templo-module que este gate obliga a declarar),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate en dos `describe`: contra lo real (un solo `beforeAll` con el app) + motor sobre fixtures sintéticos con el registro inyectado por parámetro"
    - "Sonda en vivo descartable en código de producción: se agrega, se ve el rojo, se revierte con `git checkout --` sin commitear jamás el estado roto"

key-files:
  created:
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
  modified: []

key-decisions:
  - "El conteo exacto se afirma DOS veces (entradas del manifiesto y rutas observadas): sin la segunda, un seam roto dejaría el gate verde por vacuidad"
  - "Los fixtures sintéticos usan un manifiesto mínimo propio en vez del real: la aserción dice qué detecta el motor, no qué contiene el registro de hoy"
  - "El test de `categoriaInvalida` afirma además que `sinMotivo` queda vacío: reportar la misma entrada en dos listas escondería el problema real"
  - "La sonda no se commitea ni siquiera en un commit de ida y vuelta (T-171-09): una ruta pública sin auth en `src/app.ts` no puede existir ni por un commit"

patterns-established:
  - "Mensaje de rojo con cuatro partes obligatorias: qué falló nombrando el archivo del registro, la lista de incumplidores, qué hacer, y por qué importa — más la salida falsa cerrada explícitamente"

requirements-completed: []

# Metrics
duration: ~25min
completed: 2026-07-29
---

# Phase 171 Plan 03: El gate fail-closed del manifiesto (ISO-01) Summary

**`test/tenancy/iso-01-manifiesto.test.ts` cruza el manifiesto contra las 370 rutas que el hook `onRoute` observa en el app real y deja CI en rojo nombrando la ruta sin clasificar — demostrado con 5 fixtures sintéticos que quedan corriendo en CI para siempre y con una sonda en vivo que se agregó, se vio caer y se borró sin commitear.**

## Performance

- **Duration:** ~25 min (3 corridas MySQL-backed de ~90-130 s cada una)
- **Completed:** 2026-07-29
- **Tasks:** 2/2
- **Files modified:** 1 creado, 0 modificados (la sonda del task 2 se revirtió dentro del mismo task)

## Accomplishments

- **9 tests verdes** en 1 archivo: 4 contra el app real (`faltantes`, `fantasmas`, guard de HEAD, conteo exacto) y 5 sobre el motor con fixtures sintéticos (las 5 formas de discrepancia).
- **El criterio 2 del ROADMAP quedó demostrado de las dos maneras que el plan exige**, no afirmado: la sonda `GET /api/_probe-171` puso el gate en rojo con el mensaje que la nombra, y los fixtures dejan esa misma capacidad probada en CI para siempre.
- **El gate no puede pasar por vacuidad.** El cuarto test afirma el conteo dos veces: `Object.keys(TENANT_MANIFEST).length === 370` y `particion.rutas.length === 370`. La sonda hizo caer la segunda (371 vs 370) además de la primera — evidencia de que la afirmación es viva y no decorativa.
- **D-02 y D-07 se validan en RUNTIME.** Los fixtures cubren `motivo: ""`, `motivo: "TODO"`, `templo-module` sin módulo y una categoría inventada. Es la única red que existe: `tsconfig.json` incluye solo `src/**`, el `tsc --noEmit` de CI no mira `test/` y Vitest usa esbuild (borra tipos sin chequearlos).
- **Cero `any`, cero `console.`, 13 `expect` y los 13 con mensaje accionable.** Un `expected [ '…' ] to equal []` pelado no cumple el criterio 2 (Pitfall 4).
- **El árbol quedó exactamente como estaba:** `git status --porcelain el-templo-api/src/app.ts` vacío, `git diff --numstat` sin salida, `grep -c "_probe-171" src/app.ts` = 0, `pnpm exec tsc --noEmit` = `TSC_PROJECT_OK`.

## Task Commits

1. **Task 1: El gate `test/tenancy/iso-01-manifiesto.test.ts`** — `0a9def15` (test)
2. **Task 2: Sonda en vivo** — sin commit **a propósito** (T-171-09: el estado roto nunca se commitea; su producto es la evidencia de abajo)

## Files Created/Modified

- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` **(nuevo, 378 líneas)** — docblock de cabecera con `POR QUÉ EXISTE ESTE ARCHIVO` / `LO QUE SE AFIRMA` / `QUÉ NO ES ESTE ARCHIVO` / `QUÉ HACER CUANDO SE CAIGA` / `CÓMO CORRERLO`, y la sección que explica **por qué este archivo SÍ necesita `createTestApp()`** —`src/modules/sessions/routes.ts` hace un `SELECT` sobre `formats` durante el registro del plugin— para que nadie lo "optimice" moviéndolo a `test/unit/` (donde además no ahorraría nada: `setupFiles` provisiona la base para todos los archivos).

## Evidencia del criterio 2 — sonda en vivo

### 1. Rojo con la sonda puesta (`app.get("/api/_probe-171", …)` en `src/app.ts`)

```
❯ test/tenancy/iso-01-manifiesto.test.ts (9 tests | 2 failed) 92475ms
  × toda ruta registrada por el app tiene entrada en el manifiesto 5ms
  ✓ toda entrada del manifiesto corresponde a una ruta que existe (atrapa typos, renames y rutas borradas)
  ✓ todo HEAD observado se explica por un GET hermano (un HEAD declarado a mano no se cuela)
  × el manifiesto tiene exactamente las 370 entradas del baseline 1ms
  ✓ una ruta observada sin entrada cae en faltantes y sale nombrada
  ✓ una entrada que ya no corresponde a ninguna ruta cae en fantasmas y sale nombrada
  ✓ una entrada global sin motivo utilizable cae en sinMotivo (D-02, validado en runtime)
  ✓ una entrada templo-module sin módulo cae en sinModulo (D-07, validado en runtime)
  ✓ una entrada con categoría fuera de las tres cae en categoriaInvalida

FAIL test/tenancy/iso-01-manifiesto.test.ts > manifiesto de rutas — contra el app real (ISO-01) > toda ruta registrada por el app tiene entrada en el manifiesto
AssertionError: Rutas que el app REGISTRA y que NO están clasificadas en test/tenant-manifest.ts: GET /api/_probe-171. QUÉ HACER: agregá una línea por cada una en TENANT_MANIFEST, con la clave exacta "<MÉTODO> <url>" tal cual aparece acá arriba, en la categoría que corresponda — "tenant-scoped" si la ruta ve datos de UN gimnasio (el caso normal), "templo-module" con su módulo si es un feature exclusivo de El Templo (D-07), "global" SOLO si de verdad ve datos de todos los gimnasios. OJO: mandarla a "global" para que este test se calle NO ES UNA SALIDA VÁLIDA SIN MOTIVO ESCRITO (D-02): la validación de runtime la reporta en sinMotivo y el gate sigue rojo igual. POR QUÉ IMPORTA: esto es el criterio 2 del ROADMAP de la fase 171 —una ruta nueva sin clasificar tiene que romper CI— y es lo que impide que las fases 172-175 construyan el aislamiento sobre una lista incompleta. Una ruta sin entrada no la mira nadie: ni la revisión humana, ni el enforcement de requireModule de la fase 176.: expected [ 'GET /api/_probe-171' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "GET /api/_probe-171",
+ ]

FAIL test/tenancy/iso-01-manifiesto.test.ts > manifiesto de rutas — contra el app real (ISO-01) > el manifiesto tiene exactamente las 370 entradas del baseline
AssertionError: El app registró 371 rutas (sin contar los HEAD sintéticos) y el manifiesto tiene 370. Si este número es 0, el seam onRoute dejó de funcionar y ningún gate de este archivo está probando nada: revisá BuildAppOptions en src/app.ts antes que el manifiesto.: expected 371 to be 370 // Object.is equality

- Expected
+ Received

- 370
+ 371

 Test Files  1 failed (1)
      Tests  2 failed | 7 passed (9)
```

El mensaje cumple las tres cosas que el criterio pide: **nombra la ruta** (`GET /api/_probe-171`), **dice qué hacer** (agregar la línea a `TENANT_MANIFEST` en la categoría que corresponda) y **cierra la salida falsa** (mandarla a `global` sin motivo escrito no calla el gate). El segundo rojo es el bonus: el conteo también se movió, o sea que el gate de vacuidad está vivo.

### 2. Revert y verde posterior

```
$ git checkout -- el-templo-api/src/app.ts
porcelain:[]
numstat:[]
grep -c "_probe-171" el-templo-api/src/app.ts → 0
```

```
 ✓ test/tenancy/iso-01-manifiesto.test.ts (9 tests) 81739ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  87.44s
```

## Decisions Made

- **El conteo exacto se afirma dos veces.** El plan pedía "el manifiesto tiene el número de entradas del baseline". Se agregó una segunda aserción sobre `particion.rutas.length`: si el seam `onRoute` se rompiera —alguien "limpia" `BuildAppOptions`, o el hook se cuelga después del primer `register`— las listas de discrepancias quedarían vacías contra un manifiesto que también se observaría vacío, y los dos gates bidireccionales pasarían en verde sin probar nada (T-171-10). Con la segunda aserción, 0 rutas observadas se pone tan rojo como 371.
- **Los fixtures sintéticos usan un manifiesto mínimo propio** (`MANIFIESTO_OK`, una sola entrada) en vez de inyectar el real. Con el real, cualquier fixture de `faltantes` arrastraría 369 `fantasmas` de ruido y la aserción diría más sobre el contenido de hoy que sobre lo que el motor detecta. Cada fixture afirma exactamente una capacidad del comparador.
- **El test de `categoriaInvalida` afirma también que `sinMotivo` queda vacío.** Es la contraparte de la decisión del plan 171-01 (a una entrada cuya categoría no se entiende no se le exige además motivo ni módulo). Sin esta aserción, alguien podría "arreglar" el comparador reportando la entrada en las cinco listas y nadie se enteraría de que el mensaje pasó a ser ruido.
- **La sonda no pasó ni por un commit intermedio.** El precedente del 169-04 (`src/jobs/__gate-probe.ts`) se siguió al pie: agregar, correr, capturar, `git checkout --`. Commitear el estado roto —aunque fuera para revertirlo en el commit siguiente— dejaría en la historia de la rama una ruta pública sin auth en `src/app.ts` (T-171-09), y las ramas se cherry-pickean.

## Deviations from Plan

Ninguna. No hubo bug que arreglar (Regla 1), funcionalidad crítica faltante (Regla 2), bloqueante (Regla 3) ni decisión arquitectónica (Regla 4). Las dos aserciones extra descritas arriba son refuerzos del gate dentro de lo que el plan especifica, no cambios de alcance: el plan pedía ≥ 9 tests y quedaron 9 tests con 13 `expect`.

## Issues Encountered

- **Ninguno nuevo.** Las tres trampas conocidas se esquivaron por adelantado: (1) el archivo vive en `test/tenancy/` porque `buildApp()` necesita MySQL (Pitfall 2) y ubicarlo en `test/unit/` no ahorraría nada; (2) el conteo se hace por **runtime** (`Object.keys(...).length`) y no por `grep`, como advirtió el 171-02 —Prettier parte las entradas largas en multilínea y cualquier contador textual sería frágil—; (3) `prettier --write` se corrió **antes** del commit, así que lint-staged no rebotó (el archivo salió `unchanged`).
- **Costo real de la verificación:** 3 corridas MySQL-backed × ~90-130 s. El archivo en sí tarda menos de 6 s de aserciones: el resto es el provisioning del worker (hallazgo 169-07) más los ~35 `register` de `buildApp()`.

## Verification

| Criterio del plan                                                        | Resultado                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------- |
| `vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=250000` | exit 0, **9 tests** verdes (mínimo pedido: 9)         |
| `grep -c "expect("`                                                      | **13** ≥ 9, y los 13 con segundo argumento (revisado) |
| `grep -c "createTestApp({"`                                              | **1** — un solo `beforeAll`                           |
| `grep -c ": any\|console\."`                                             | **0**                                                 |
| Mensaje del test 1 con la frase sobre `global`                           | sí — literal en la evidencia de arriba                |
| Líneas del archivo                                                       | 378 (mínimo pedido: 180)                              |
| `contains: compararManifiesto`                                           | 8 apariciones                                         |
| Sonda: rojo capturado nombrando `GET /api/_probe-171`                    | sí — bloque literal pegado arriba                     |
| Sonda: `git status --porcelain src/app.ts` tras revertir                 | vacío                                                 |
| Sonda: `git diff --numstat src/app.ts` tras revertir                     | sin salida                                            |
| Re-corrida posterior al revert                                           | exit 0, 9/9 verdes                                    |
| `pnpm exec tsc --noEmit` (proyecto)                                      | 0 (`TSC_PROJECT_OK`)                                  |
| `git status --porcelain el-templo-api/pnpm-lock.yaml`                    | vacío — cero deps nuevas (T-171-SC)                   |
| Archivos nuevos bajo `src/db/migrations/`                                | ninguno — cero migraciones                            |

## Known Stubs

Ninguno. El gate está completo y corriendo: no hay ninguna aserción comentada, con `skip` ni condicionada a una fase futura.

Lo que sí queda abierto por diseño son las **14 marcas `D-04 dudosa:`** que dejó el plan 171-02 dentro del manifiesto. No afectan a este gate (pasa verde con ellas: son recomendaciones de categoría, no entradas faltantes); las cierra el checkpoint humano del plan 171-06.

## Threat Flags

Ninguno. El plan no creó endpoints, rutas de auth, accesos a archivos ni cambios de schema. La única ruta que existió —la sonda `GET /api/_probe-171`— vivió menos de dos minutos en el working tree y nunca entró a un commit (verificado por `git status --porcelain` y `git diff --numstat`).

## User Setup Required

None.

## Next Phase Readiness

- **ISO-01 tiene ahora sus dos mitades:** el manifiesto con el 100% de las rutas clasificadas (plan 171-02) y el gate fail-closed que lo cruza contra la realidad (este plan). Falta la decisión humana sobre las dudosas para poder marcarlo completo.
- **El plan 171-06** puede correr el checkpoint sabiendo que cualquier corrección que Franco pida sobre una entrada la verifica este mismo archivo: cambiar una categoría no rompe el gate, pero mandar algo a `global` sin motivo o a `templo-module` sin módulo sí.
- **Las fases 172-175** heredan el backstop: toda ruta que agreguen tiene que traer su línea de clasificación o CI queda en rojo nombrándola.
- **Recordatorio para quien toque el conteo:** `ENTRADAS_BASELINE = 370` está en una sola constante del test y su mensaje explica cuándo se mueve. No es un número mágico para ajustar hasta que pase.

## Nota sobre ISO-01

`requirements-completed` va **vacío**, igual que en los planes 171-01 y 171-02. ISO-01 lo comparten cuatro planes (01, 02, 03 y 06) y su enunciado exige el manifiesto con el 100% clasificado **más** el gate fail-closed: las dos piezas técnicas ya están, pero la clasificación tiene 14 grupos marcados `D-04 dudosa:` esperando la decisión del checkpoint. Lo cierra el plan **171-06**, que aplica esa decisión.

## Self-Check: PASSED

- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` — existe (378 líneas).
- `.planning/phases/171-…/171-03-SUMMARY.md` — existe.
- Commit `0a9def15` — presente en `git log` de `feat/170-sentinel-lint`.
- `el-templo-api/src/app.ts` — sin modificaciones respecto de `HEAD` (la sonda no dejó rastro).

---

_Phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant_
_Completed: 2026-07-29_
