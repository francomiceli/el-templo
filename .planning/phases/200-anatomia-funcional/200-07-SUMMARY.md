---
phase: 200-anatomia-funcional
plan: 07
subsystem: api
tags: [anatomia, tv, zonas, zone-hits, consumidores]
requires: ["200-06"]
provides:
  - "TV (recorrido), /weekly, /daily, /:id y canasta calculan zonas con anatomy/projection.ts; tv/muscle-zones.ts borrado (D20)"
  - "blockToResponse trae zoneHits (zona a musculos fuerte/sostiene/estira) por bloque (D17)"
  - "Un solo conversor prescripcion a insumo de zonas (zonaInputDe), sin categoria secundaria"
affects: [200-08, 200-11, 200-12]
tech-stack:
  added: []
  patterns:
    - "TvZonaMuscular = TvZonaSlug (derivado de REGIONES.enTv); la canasta tipa con ZonaSlug (16, con tibialis)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/tv/recorrido.ts
    - el-templo-api/src/modules/tv/types.ts
    - el-templo-api/src/modules/tv/class-day.ts
    - el-templo-api/src/modules/sessions/session-response.ts
    - el-templo-api/src/modules/sessions/free-blocks-service.ts
    - el-templo-api/src/modules/sessions/free-blocks-ranking.ts
    - el-templo-api/src/modules/anatomy/content/regiones.ts
    - el-templo-api/test/sessions/block-zones.test.ts
    - el-templo-api/test/sessions/free-blocks-ranking.test.ts
    - el-templo-api/test/anatomy/content-coverage.test.ts
    - el-templo-admin/src/tv/poll.ts
  deleted:
    - el-templo-api/src/modules/tv/muscle-zones.ts
    - el-templo-api/test/tv/tv-muscle-zones.test.ts
key-decisions:
  - "Recorrido: FB = [...ZONAS_TV] y el resto soloTv(zonasDelGrupo(...)): el contrato del poll (15 zonas ordenadas) no cambia"
  - "La columna exerciseCategorySecondary queda en el select de class-day (no se usa para zonas; sacarla tocaria tests sin beneficio)"
requirements-completed: [D17, D20, P3, SC2, SC5]
duration: ~25min
completed: 2026-10-21
---

# Phase 200 Plan 07: Consumidores al modelo de anatomia Summary

**La TV, /weekly, /daily, /:id y la canasta pasan a `anatomy/projection.ts`, cada bloque suma `zoneHits` y `tv/muscle-zones.ts` desaparece.**

## Task Commits

1. **Task 1: TV (recorrido + types + class-day + comentario del admin)** - `b1a2d7439` (refactor)
2. **Task 2: /weekly, /daily y canasta + zoneHits** - `8b50e7b36` (feat)
3. **Task 3: borrar muscle-zones.ts y adaptar tests unitarios** - `1a66366e1` (refactor)

## Que cambio

- `recorrido.ts`: insumo `{ route, category }` (sin secundaria); `zonas` = `[...ZONAS_TV]` para Full Body, si no `soloTv(zonasDelGrupo(ejercicios, roles))`. Tibialis no viaja a la TV (T-200-15).
- `tv/types.ts`: `TvZonaMuscular = TvZonaSlug` con `import type` (se borra al compilar; el archivo sigue sin imports de runtime). El tipo del admin (15 zonas) no cambia.
- `session-response.ts`: borrado `toZoneInput`; `insumos = mainExercises.map(zonaInputDe)`; `zones`, `groups` y nuevo `zoneHits: zoneHitsDelBloque(insumos, block.role)`. El schema de bloques no declara `items`, asi que el campo nuevo pasa (T-200-16).
- `free-blocks-service.ts`: borrado `aEjercicioZona` (usa `zonaInputDe`); `todayZones`/`weekWorkedZones`/`zonasDeSesion`/`ordenarZonas` tipados con `ZonaSlug` (la canasta si recibe tibialis, D4); sin import de `../tv/types`.
- `free-blocks-ranking.ts`: `import type { GrupoZona }` desde `anatomy/projection`.
- Tests: `block-zones.test.ts` reescrito sobre rutas (`zonasDeRuta`: union OAP+SS, SS con cuadriceps, dominancia vs union, fallback PLYO, fallback ROM, `ejerciciosPorGrupo`, tibialis a piernas); `tv-muscle-zones.test.ts` borrado (sus casos viven en `test/anatomy/projection.test.ts`).

## Verificacion

- Los tres `<automated>` imprimen `OK`. `git grep -n "muscle-zones" -- el-templo-api/src el-templo-api/test` vacio. Higiene (`console`, `any`) limpia en lo tocado. `prettier --write` antes de cada commit. `git status --porcelain` vacio.
- Chequeo extra (scratchpad, no commiteado): `projection.ts` y `zone-hits.ts` compilados con `tsc --strict` (OK) y ejecutados para confirmar todos los literales de `block-zones.test.ts` (OAP = chest, biceps, forearm, trapezius, upper-back; SS = quadriceps; `ejerciciosPorGrupo([OAP,SS,SS])` = pecho 1, espalda 1, piernas 2, brazos 1; fallbacks PLYO y ROM_CORE; INITIUM = `{}`; QC con `soloTv` = quadriceps).
- NO se pudo typechequear `session-response.ts`, `free-blocks-service.ts` ni `recorrido.ts` (necesitan `node_modules`): lo hace CI / el orquestador. Los tipos se razonaron a mano (`ExercisePrescription` ya trae `category` y `exerciseRoute`, que es lo que lee `zonaInputDe`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `content-coverage.test.ts` comparaba las regiones `enTv` contra `ZONAS_ORDEN`**

- **Found during:** Task 3 (limpieza del import pedida por la leccion de 200-06)
- **Issue:** `ZONAS_ORDEN` de `projection.ts` tiene 16 zonas (con tibialis); el viejo tenia 15. Apuntar el import tal cual hacia fallar el test "regiones enTv = las 15 del poll".
- **Fix:** importar `ZONAS_TV` y comparar contra eso.
- **Files modified:** `el-templo-api/test/anatomy/content-coverage.test.ts`
- **Commit:** `1a66366e1`

**2. [Formato] Prettier reformateo dos lineas no relacionadas** (un `import` de `free-blocks-service.ts` y un `expect` de `free-blocks-ranking.test.ts`), que ya estaban fuera de formato. Es lo que haria husky.

## Notas para el plan 08 (y siguientes)

- **CI queda rojo entre 07 y 08** (esperado). Tests de integracion que dependen del mapeo anterior por categoria y hay que ajustar en el 08: `test/sessions/weekly-zones.test.ts`, `test/sessions/free-blocks-list.test.ts`, `test/sessions/_free-blocks-fixtures.ts`, `test/tv/tv-recorrido-*.test.ts`, `test/tv/tv-class-day.test.ts` (las zonas ahora salen de la RUTA del ejercicio, no de la categoria; la categoria solo cuenta sin ruta). Ya no existe la secundaria.
- **Payload nuevo:** cada bloque de `/weekly`, `/daily` y `/:id` trae `zoneHits` (Partial por zona, ver `HitsZona` en `zone-hits.ts`, con `movilidad?`/`sinDetalle?`). Un test de integracion deberia fijarlo.
- **Comentario pendiente fuera de alcance:** `el-templo-app/src/components/anatomy/zones.ts:5` todavia nombra `tv/muscle-zones.ts` (lo toca el plan del app).
- **Deploy:** hay cambios de codigo de produccion del API y un comentario del admin; el push dispara el deploy del API (no es un fix solo de tests).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-200-15 mitigado (`soloTv` y `ZONAS_TV` en el recorrido), T-200-16 mitigado (campo nuevo aditivo), T-200-17 aceptado (`zoneHits` solo trae ids de musculos).

## Self-Check: PASSED

Commits `b1a2d7439`, `8b50e7b36` y `1a66366e1` presentes en `feat/200-anatomia`; `muscle-zones.ts` y su test borrados.
