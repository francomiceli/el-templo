---
phase: 213-estiramiento-post-clase
plan: 03
subsystem: api
tags: [sessions, stretch, pure-function, tdd, vitest, push, experiment]
requires:
  - phase: 213-01
    provides: tipo StretchArm (schema stretch.ts)
provides:
  - stretchBucket, stretchArm (grupo fijo por crc32, D-16)
  - computeStretchPushAt (momento del push con tope 21:30 y silencio, D-10)
  - isWithinPushWindow (ventana fin <= ahora < fin + 120 min, D-10)
  - decideFrequencyBlock (tope 3 en 7 dias + pausa de 14 dias, D-11)
  - tipo StretchPushDecision y las 9 constantes STRETCH_* de tiempo y frecuencia
affects: [213-06 admin rule-triggers, 213-07 job del push, 213-13 gates finales]
tech-stack:
  added: []
  patterns: [funcion pura con reloj por parametro, tests de reloj armados desde todayInTz + buildClassDateTime en dos zonas]
key-files:
  created:
    - el-templo-api/src/modules/sessions/stretch-timing.ts
    - el-templo-api/test/sessions/stretch-timing.test.ts
  modified: []
key-decisions:
  - "Clase que termina antes de las 08:00: el push se corre a las 08:00 si cae dentro de fin + 120 min, si no no se manda (borde no especificado en D-10, decision del planificador)"
  - "decideFrequencyBlock cuenta solo filas con pushQueuedAt no nulo (control y sin token no cuentan); la fila de hoy la excluye el job"
patterns-established:
  - "Fechas de tests de reloj: todayInTz(tz) + buildClassDateTime(hoy, 'HH:MM', tz), historial con shiftDate(hoy, -n); sin fechas de calendario fijas"
requirements-completed: [SC-5, SC-7, D-10, D-11, D-16]
duration: 15min
completed: 2026-11-11
---

# Phase 213 Plan 03: Reglas puras de grupo, momento del push y tope de frecuencia Summary

**Grupo fijo por crc32("stretch-v1:" + userId) % 100 (20/40/40), momento del push con tope 21:30 hora de la sede, ventana de 120 min y tope de 3 en 7 dias con pausa de 14 dias, todo como funciones puras probadas en Buenos Aires y Madrid.**

## Performance

- **Tasks:** 2/2 (RED y GREEN)
- **Files:** 2 creados

## Accomplishments

- `stretch-timing.ts` sin `db`, sin leer el reloj (`now` entra por parametro) e importando `crc32` de `node:zlib`; exporta las 9 constantes con los valores del plan.
- `computeStretchPushAt` cubre los casos borde: adelanto a 21:30 solo si quedan 15 min desde el fin, `null` si no, nunca a la manana siguiente, y silencio de la manana (08:00) para clases muy tempranas.
- Test de 71 casos (Vitest): los 8 ids de crc32 fijos, bordes 19/20/59/60 de los grupos, proporcion 20/40/40 +-3 sobre 1..10000, tabla de momento del push en las dos zonas, ventana (4 bordes, dos zonas) y tope/pausa (borde hoy-6, hoy-7, pausa vencida, orden de entrada, filas sin `pushQueuedAt`, abierto anterior a los ultimos 4).
- Sin fechas de calendario fijas en el test: vale cualquier dia.

## Task Commits

1. **Task 1 (RED): test de grupos, momento, ventana y tope** - `ca0539c7a` (test)
2. **Task 2 (GREEN): stretch-timing.ts** - `7de41ce1b` (feat)

## Verificaciones

- `tsc --noEmit` de la API: solo los 3 errores preexistentes de `src/app.ts` (`@fastify/rate-limit`); ninguno nuevo.
- `pnpm typecheck:tests`: sin errores en `stretch-timing` (las ~20 discrepancias preexistentes contra el baseline no se tocaron).
- Vitest del archivo con la config minima del scratchpad (sin setupFiles, test puro): 71/71 en verde. Con la config del repo no se corrio localmente (exige MySQL): lo cubre CI.
- Chequeo de pureza del modulo (sin `Date.now`, `new Date()` sin argumentos, `any` ni `console`): OK.
- Prettier aplicado a ambos archivos.

## Decisions Made / Decisiones tomadas en ejecucion

- Pausa de 14 dias medida contra el `pushQueuedAt` mas reciente de los ultimos 4 encolados (`now - pushQueuedAt < 14 dias`), tal como indica el plan; el tope semanal se evalua primero y tiene prioridad.
- En el tope semanal solo hay cota inferior (`localDate >= hoy-6`) porque la historia no incluye hoy.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None (funciones puras; T-213-06 y T-213-07 mitigadas por construccion y por test).

## Next Phase Readiness

El job del push (plan 07) y las reglas del admin (plan 06) pueden importar las constantes y funciones de `stretch-timing.ts`.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/sessions/stretch-timing.ts
- FOUND: el-templo-api/test/sessions/stretch-timing.test.ts
- FOUND commits: ca0539c7a, 7de41ce1b
