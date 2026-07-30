---
phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant
plan: 01
subsystem: testing
tags: [multi-tenancy, fastify, onRoute, manifiesto, fail-closed, typescript]

# Dependency graph
requires:
  - phase: 167-columnas-tenant-id
    provides: la clasificación canónica `src/db/tenant-tables.ts`, analog exacto del manifiesto
  - phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
    provides: D-16 (baseline one-shot sin regenerador) y el estilo de gate fail-closed con mensaje accionable
provides:
  - "`BuildAppOptions.onRoute` — seam test-only en `buildApp()` que permite observar las ~370 rutas registradas"
  - "`createTestApp(opts)` que reenvía las opciones a `buildApp(opts)` sin colgar hooks"
  - "`test/tenant-manifest.ts` — tipos del manifiesto (`Categoria`, `ModuloTemplo`, `EntradaManifiesto`), `TENANT_MANIFEST` vacío, y las 3 funciones puras `clavesDeEvento` / `particionarObservadas` / `compararManifiesto`"
affects: [171-02 (volcado de las 370 entradas), 171-03 (gate ISO-01), 176 (enforcement requireModule lee la etiqueta templo-module)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Seam test-only en código de producción, inerte por default y defendido por docblock"
    - "Registro canónico + comparador puro con el registro inyectable por parámetro"

key-files:
  created:
    - el-templo-api/test/tenant-manifest.ts
  modified:
    - el-templo-api/src/app.ts
    - el-templo-api/test/helpers.ts

key-decisions:
  - "El seam vive dentro de `buildApp()` y no en `createTestApp()`: un hook `onRoute` solo ve rutas registradas después de colgarse, y después de `ready()` Fastify tira FST_ERR_INSTANCE_ALREADY_LISTENING"
  - "Superficie mínima: `BuildAppOptions` tiene un solo campo; se descartó `plugins: FastifyPluginCallback[]` por ceremoniosa (RESEARCH open question 1)"
  - "`Categoria` y `ModuloTemplo` se derivan de arrays `as const` para que el set de validación en runtime y el tipo no puedan divergir"
  - "Los HEAD sintéticos se particionan con guard de huérfanos en vez de filtrarse: un HEAD declarado a mano tiene que ponerse rojo, no colarse"
  - "`compararManifiesto` devuelve 5 listas (se sumó `categoriaInvalida` a las 4 del RESEARCH) porque nadie typechequea `test/` y una categoría basura entraría sin resistencia"

patterns-established:
  - "Seam test-only: campo opcional en el factory de producción + docblock que defiende la ubicación contra un refactor futuro (tono de `src/modules/shared/tenant.ts:39-47`)"
  - "Módulo de registro sin un solo import, typechequeable suelto con `tsc` porque `tsconfig.json` incluye solo `src/**`"

requirements-completed: [ISO-01]

# Metrics
duration: 18min
completed: 2026-07-29
---

# Phase 171 Plan 01: Seam `onRoute` y contrato del manifiesto Summary

**Seam test-only de una línea en `buildApp()` que expone las ~370 rutas registradas, más `test/tenant-manifest.ts` con los tipos del manifiesto, el registro todavía vacío y el comparador puro con manifiesto inyectable.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-29T00:00:00Z (aprox.)
- **Completed:** 2026-07-29
- **Tasks:** 2/2
- **Files modified:** 3 (1 creado, 2 modificados)

## Accomplishments

- `buildApp(opts: BuildAppOptions = {})` cuelga `onRoute` como primerísimo statement del factory, antes del parser de content-type y de los ~35 `register`. En producción el campo es `undefined` y no se agrega ningún hook: `src/index.ts` quedó con **0 líneas cambiadas** (verificado por `git diff --numstat`).
- `createTestApp(opts)` reenvía las opciones sin colgar nada, con el docblock que explica por qué colgarlas ahí vería 0 rutas.
- `test/tenant-manifest.ts` existe **sin un solo import**: tipos, `TENANT_MANIFEST` vacío a propósito, y las tres funciones puras. El docblock de cabecera nombra literalmente D-01, D-02, D-07 y el criterio 2 del ROADMAP, para que la clasificación no se pueda "limpiar" sin leer por qué existe.
- El comparador quedó con manifiesto inyectable por parámetro con default: es lo que va a permitirle al plan 171-03 demostrar el criterio 2 con fixtures sintéticos en vez de asumirlo.

## Task Commits

1. **Task 1: Seam `onRoute` en buildApp + reenvío desde createTestApp** — `9a0392ba` (feat)
2. **Task 2: Módulo `test/tenant-manifest.ts` — tipos, comparador puro y partición de HEAD** — `7df78976` (feat)

## Files Created/Modified

- `el-templo-api/src/app.ts` — `BuildAppOptions` (un campo, `onRoute?`) + la línea `if (opts.onRoute) app.addHook("onRoute", opts.onRoute);` como primer statement del factory, con docblock que declara TEST-ONLY, por qué vive ahí y quién lo consume.
- `el-templo-api/test/helpers.ts` — `createTestApp(opts: BuildAppOptions = {})` reenviando a `buildApp(opts)`.
- `el-templo-api/test/tenant-manifest.ts` **(nuevo, 306 líneas)** — contrato del manifiesto: `Categoria`, `ModuloTemplo`, `EntradaManifiesto`, `TENANT_MANIFEST` (vacío), `Particion`, `Discrepancias`, `clavesDeEvento`, `particionarObservadas`, `compararManifiesto`.

## Decisions Made

- **Quinta lista de discrepancias (`categoriaInvalida`).** El RESEARCH proponía 4 (`faltantes`/`fantasmas`/`sinMotivo`/`sinModulo`); el PLAN ya pedía 5 y se implementaron las 5. Una entrada con `categoria` fuera de las tres cae ahí y **no** se le exige además motivo ni módulo: no tiene sentido auditar la sub-regla de una categoría que no se entiende. Motivo de fondo: `test/` no lo typechequea CI (Pitfall 5), así que la validación de forma tiene que existir en runtime.
- **Tipos derivados de arrays `as const`.** `Categoria` y `ModuloTemplo` salen de `CATEGORIAS` y `MODULOS_TEMPLO`, que son también los sets de validación en runtime. El plan los especificaba como uniones literales escritas a mano; derivarlos produce exactamente la misma unión y elimina la posibilidad de que el tipo y el set se separen. Precedente del repo: `GymOwnedTable` derivado de `GYM_OWNED_TABLES`.
- **`Array.from(...)` en vez de spread de `Set`.** El criterio de aceptación corre `tsc` **suelto** sobre el archivo, y con archivos en la línea de comandos `tsc` ignora `tsconfig.json` y cae a `target: ES5`, donde el spread de un `Set` es error `TS2802`. `Array.from` compila igual en las dos configuraciones y no cambia el comportamiento.
- **`Particion` como interfaz exportada** (el plan solo especificaba la forma del retorno inline): el gate del plan 03 va a nombrar ese tipo.

## Deviations from Plan

Ninguna deviation de las reglas 1-4. Dos ajustes de redacción menores, hechos para que los criterios de aceptación mecánicos del propio plan (`grep -c`) den el valor exacto que piden, sin perder contenido:

- El docblock de `BuildAppOptions` decía "`opts.onRoute` es exactamente `undefined`" → "el campo es exactamente `undefined`", para que `grep -c "opts.onRoute" src/app.ts` sea **1** (una sola línea funcional, que es lo que el criterio quiere medir).
- El mismo docblock decía "antes del primer `addContentTypeParser`/`register`" → "antes del parser de content-type y antes del primer `register`", para que la primera línea que matchea `addContentTypeParser` sea la del código (111) y quede **después** del `addHook` (103), como pide el criterio de orden.

**Total deviations:** 0 auto-fixes. **Impacto:** ninguno sobre el comportamiento; solo redacción de comentarios.

## Issues Encountered

- **`tsc` suelto usa `target: ES5`.** El primer intento del módulo falló con 8 errores `TS2802` (spread de `Set`). Resuelto con `Array.from(...)`. Es una trampa que conviene recordar para el plan 171-02, que va a tocar el mismo archivo: **el criterio de "typechequea suelto" es más estricto que el del proyecto**, no menos.
- **Sonda de comportamiento descartable.** Como el test del comparador lo agrega el plan 171-03, se corrió una sonda `tsx` fuera del repo (en el scratchpad, no commiteada) para no dejar las funciones sin ejercitar. Verificó: expansión de `method: ["POST","PUT"]`, HEAD sintético y HEAD fantasma con barra final filtrados, HEAD huérfano detectado, y las 5 listas de discrepancias pobladas con un manifiesto sintético (motivo en blanco → `sinMotivo`, `templo-module` sin módulo → `sinModulo`, categoría basura → `categoriaInvalida` y no también `sinMotivo`).

## Verification

| Criterio del plan | Resultado |
| --- | --- |
| `pnpm exec tsc --noEmit` | 0 (`TSC_PROJECT_OK`) |
| `pnpm exec tsc --noEmit --strict --skipLibCheck test/tenant-manifest.ts` | 0 (`TSC_STANDALONE_OK`) |
| `git diff --numstat el-templo-api/src/index.ts` | vacío — producción intacta (T-171-01) |
| `git status --porcelain el-templo-api/pnpm-lock.yaml` | vacío — cero deps nuevas (T-171-SC) |
| Archivos nuevos bajo `src/db/migrations/` | ninguno |
| `grep -c "opts.onRoute" src/app.ts` | 1 |
| `addHook("onRoute")` antes del primer `addContentTypeParser` | 103 < 111 |
| `grep -c "buildApp(opts)" test/helpers.ts` | 1 |
| `grep -c "^import\|require(" test/tenant-manifest.ts` | 0 |
| `grep -c ": any" test/tenant-manifest.ts` | 0 |
| Los 3 `export function` | 3 |
| `TENANT_MANIFEST` en líneas no-comentario | 2 |
| Docblock nombra D-01 / D-02 / D-07 / criterio 2 | sí (1 / 4 / 4 / 2 apariciones) |

## Known Stubs

- `TENANT_MANIFEST = {}` está **vacío a propósito**, no es un stub olvidado: el plan 171-02 escribe las ~370 entradas y el plan 171-03 agrega el gate que las cruza. Documentado en el propio docblock del archivo. Con el registro vacío el comparador reporta las 370 rutas como `faltantes`, que es el comportamiento correcto de un registro fail-closed sin poblar.

## User Setup Required

None — no se requiere configuración externa.

## Next Phase Readiness

- El plan **171-02** puede volcar el inventario usando el seam ya commiteado (`createTestApp({ onRoute })`), sin parchear la caché de require, y escribir las entradas contra un contrato ya cerrado.
- El plan **171-03** tiene `compararManifiesto` y `particionarObservadas` listos para importar, con el segundo parámetro inyectable que el criterio 2 necesita.
- Recordatorio para el 171-02: al volver a tocar `test/tenant-manifest.ts`, mantenerlo **sin imports** y ES5-compatible (ver Issues).

## Nota sobre ISO-01

El plan declara `requirements: [ISO-01]`, pero ISO-01 lo comparten los planes **171-01, 171-02, 171-03 y 171-06** y su enunciado exige el manifiesto **con el 100% de las rutas clasificadas** más el gate fail-closed. Nada de eso existe todavía. `requirements.mark-complete ISO-01` se corrió y se **revirtió**: `REQUIREMENTS.md` queda con ISO-01 en `Pending`, que es el estado real. Lo marca el plan que efectivamente lo cierre (171-06).

## Self-Check: PASSED

Los 3 archivos de código y el SUMMARY existen en disco; los 2 commits de tarea (`9a0392ba`, `7df78976`) existen en `git log`.

---
*Phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant*
*Completed: 2026-07-29*
