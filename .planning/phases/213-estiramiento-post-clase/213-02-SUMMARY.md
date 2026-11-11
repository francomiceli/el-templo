---
phase: 213-estiramiento-post-clase
plan: 02
subsystem: api
tags: [sessions, stretch, pure-function, tdd, vitest]
requires:
  - phase: 213-01
    provides: tipo StretchFamily (schema stretch.ts) y semilla de la lista curada (0331)
provides:
  - seleccionarEstiramientos, modoOfreceEstiramiento, duracionRutina, normalizarNombre
  - constantes de la regla (STRETCH_*, FAMILIA_DE_BASE, RUTAS_TREN_SUPERIOR, DIAS_SEMANA)
  - tipos EntradaSeleccion, EntradaCatalogo, PrescritoMovilidad, EstiramientoElegido, ResultadoSeleccion
affects: [213-04 StretchService, 213-07 push, 213-13 gates finales]
tech-stack:
  added: []
  patterns: [funcion pura con constantes Readonly arriba, port 1 a 1 de un script Python de referencia]
key-files:
  created:
    - el-templo-api/src/modules/sessions/stretch-selection.ts
    - el-templo-api/test/sessions/stretch-selection.test.ts
  modified: []
key-decisions:
  - "Comparacion prescrito-catalogo por nombre normalizado (trim + mayusculas)"
  - "Lista de base derivada del catalogo recibido (ordenBase no nulo), no hardcodeada"
patterns-established:
  - "Test de tabla fija: fixtures transcriptas del TSV por script, esperado generado con regla_simulacion.py"
requirements-completed: [SC-1, D-01, D-03, D-04, D-05, D-06]
duration: 25min
completed: 2026-11-11
---

# Phase 213 Plan 02: Regla pura de seleccion de estiramientos Summary

**Port a TypeScript de `regla_simulacion.py` como funcion pura: reproduce exactamente las 11 sesiones de la tabla de referencia del SPEC 4.1 (estiramientos, orden, familias y duracion).**

## Performance

- **Tasks:** 2/2 (RED y GREEN)
- **Files:** 2 creados

## Accomplishments

- `seleccionarEstiramientos` sin lectura de base, reloj ni azar, sin imports de valores de `db` (solo `import type { StretchFamily }`).
- Constantes de una sola fuente: 5 estiramientos, 45 s por lado, 10 s de transicion, 300-480 s, `PL` cuenta como `FL`, 9 rutas de tren superior.
- Test de 43 casos: 11 sesiones con oferta, ROM sin oferta, sin familias, TTB de un solo ejercicio, recorte > 8 min (500 a 400 s), relleno < 5 min (275 a 330 s), catalogo agotado y vacio, determinismo con entradas congeladas, rotacion por semana y por dia.

## Task Commits

1. **Task 1 (RED): test con la tabla de referencia** - `65cf31086` (test)
2. **Task 2 (GREEN): stretch-selection.ts pura** - `97a4f70fa` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueo] `vitest run` con el setup de la API cuelga sin MySQL**
- **Found during:** Task 2
- **Issue:** `test/setup.ts` provisiona una base por worker y no hay MySQL accesible local (`Access denied`, `.env.development` sin variables). El run quedo colgado y lo mate.
- **Fix:** corri el mismo archivo con una config minima de Vitest (en el scratchpad, sin `setupFiles` ni `globalSetup`; solo `include` del archivo): 43/43 verdes. El test es puro, asi que el resultado es el mismo que dara CI. No se toco la config del repo.
- **Files modified:** ninguno del repo.

**2. [Observacion] `RUTAS_TREN_SUPERIOR` en varias lineas**
- El plan pedia una linea; Prettier (hook de pre-commit) la parte en 9 lineas. Se acepto el formato de Prettier; el comentario D-03 va en el docblock de la constante y el test fija exactamente las 9 rutas.

## Decisiones del ejecutor

- La comparacion por nombre normalizado tambien resuelve prescritos con distinta capitalizacion o espacios (el port Python era sensible a mayusculas). No cambia ninguna de las 11 sesiones de referencia.
- La lista de base sale de las filas del catalogo con `ordenBase` no nulo, ordenadas por `ordenBase` (el catalogo ya es por tenant y activo): asi un segundo gimnasio con otra base funciona sin tocar la regla.
- `familias` devuelve `[]` cuando se uso la rutina de base (lo pide el plan).

## Verificaciones

Corridas:
- `vitest` del archivo con config pura: 43/43 verdes.
- Mutaciones a mano sobre `stretch-selection.ts` (restaurado despues, `cmp` identico): sin rotacion (10 tests fallan), `PL` a MN (3), techo 600 s (1). Los tres detectados.
- `tsc --noEmit`: solo los 3 errores preexistentes de `src/app.ts` (`@fastify/rate-limit`).
- `pnpm typecheck:tests`: las 20 discrepancias son las preexistentes; ninguna es de `stretch-selection`. No se regenero el baseline.
- grep de prohibidos (`Date.now`, `Math.random`, imports de valores de `db`, `any`, `console`): sin coincidencias.

No corridas localmente:
- `vitest` con el setup real del repo (necesita MySQL): lo cubre CI.
- ESLint: la API no tiene config de ESLint v9 en el repo (CLAUDE.md: solo Prettier via lint-staged, que paso en ambos commits).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: funcion pura sin I/O. T-213-04 y T-213-05 mitigadas por la tabla fija y el test de catalogo chico y vacio.

## Self-Check: PASSED

- `el-templo-api/src/modules/sessions/stretch-selection.ts` y `el-templo-api/test/sessions/stretch-selection.test.ts` existen.
- Commits `65cf31086` y `97a4f70fa` existen en `feat/estiramiento-post-clase`.
