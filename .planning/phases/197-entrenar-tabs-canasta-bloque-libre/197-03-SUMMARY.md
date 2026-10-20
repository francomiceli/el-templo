---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 03
subsystem: api-sessions
tags: [refactor, muscle-zones, bloque-libre]
requires: ["197-02"]
provides:
  - session-view.ts (resolveSessionView, buildDayIdCandidates, levelToLevelGroup, effectiveLevelForDay)
  - session-response.ts (sessionToResponse, blockToResponse, SessionBlockResponse)
  - grupos de zona D-10 y zonas por bloque en tv/muscle-zones.ts
affects: [197-04, 197-05, 197-06, 197-07, 197-08]
key-files:
  created:
    - el-templo-api/src/modules/sessions/session-view.ts
    - el-templo-api/src/modules/sessions/session-response.ts
    - el-templo-api/test/sessions/block-zones.test.ts
  modified:
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/modules/tv/muscle-zones.ts
requirements: [D-10, D-14]
---

# Fase 197 Plan 03: Base compartida de vista/respuesta y grupos de zona — Summary

Refactor mecánico de `sessions/routes.ts` (la resolución de vista y el mapeo de respuesta pasan a módulos reutilizables) más las funciones puras de grupos de zona de D-10.

## Qué se hizo

1. **Refactor** (`a6cca5043`): `levelToLevelGroup`, `buildDayIdCandidates` y `resolveSessionView` + `ResolveViewResult` movidos tal cual a `session-view.ts` (solo se les antepuso `export`). `sessionToResponse` a `session-response.ts`, con el cuerpo del `.map` de bloques en `blockToResponse(block, idx, formatDescriptions)` y `SessionBlockResponse`. `effectiveLevelForDay(memberLevel, isRomDay)` reemplaza los dos ternarios ROM de `/daily` y `/weekly`. `routes.ts` queda con 13 inserciones y 365 borrados; se limpiaron los imports sin uso.
2. **Grupos de zona** (`8072c186d`): `GrupoZona`, `GRUPOS_ORDEN`, `GRUPOS_ZONA`, `grupoDeZona`, `gruposDeZonas`, `zonasDelBloque` (unión + fallback ROM por rol) y `ejerciciosPorGrupo`, solo agregados al final de `muscle-zones.ts`. Índice inverso derivado de `GRUPOS_ZONA` (no se duplica la tabla). Unit puro `test/sessions/block-zones.test.ts`.

## Commits

- `a6cca5043` refactor(197-03): session-view y session-response fuera de sessions/routes
- `8072c186d` feat(197-03): grupos de zona y zonas por bloque (D-10)

## Verificación (estática, sin node_modules)

- Script de la tarea 1: `OK`. Además se comprobó por script que los tres bloques movidos (l.48-68, 70-112, 192-388 de `fd0aefe4b`) están contenidos textualmente en `session-view.ts` (con `export`), y que el resto de `routes.ts` (handlers `/daily`, `/weekly`, `/generate`, `/:id`, `/complete`...) es idéntico a `fd0aefe4b` salvo los dos reemplazos por `effectiveLevelForDay` y los imports (diff línea a línea).
- Cada import eliminado de `routes.ts` se verificó sin uso (`or`, `inArray`, `MySql2Database`, `PRESENCIAL_GROUP_CATEGORIES`, `assembleVideoUrl`, `LevelGroup`, `DaySession`, `ALTERNATIVE_BLOCK_ROLES`, `isKairos`, `TenantContext`); `sql`, `gte`, `lte`, `and`, `eq`, `tenantWhere` siguen usados.
- Script de la tarea 2: `OK` (7 exports, diff de `muscle-zones.ts` contra `fd0aefe4b` sin líneas borradas).
- Higiene (`console.`, `any`) sin salida. Líneas > 80 columnas: solo comentarios/títulos de `it(...)`.
- `git status --porcelain` vacío al cerrar (tras commitear este SUMMARY).

## Desvíos/decisiones

- `blockToResponse`: el único cambio de formato respecto al cuerpo original es la indentación (Prettier re-ajusta el wrap de `formatDescriptions.get(...) ?? null` a una línea menos). Mismo objeto, mismas claves y orden.
- `effectiveLevelForDay`: en `/daily` se llama con `true` dentro del `if (dayModeRow?.sessionMode === "rom")` existente, para no cambiar la consulta ni el flujo.
- `grupoDeZona` lanza `Error` si recibe una zona sin grupo (inalcanzable por tipos; el test recorre las 15 zonas de `ZONAS_ORDEN`).
- Trailer de commits: `Claude Opus 5.5` según el orquestador (las reglas decían Sonnet 5.5).

## Bugs encontrados

Ninguno.

## Para el orquestador / planes siguientes

- Los tests `sessions-gating.test.ts` y `goal-plan-foundation-fallback.test.ts` cubren el movimiento en CI (mitigación T-197-07); no se corrieron local.
- 197-04/06 importan de `./session-view` y `./session-response`; `blockToResponse` devuelve `format` como `string | FormatObj` (igual que antes), no tocado a propósito.

## Self-Check: PASSED

Archivos creados presentes y commits `a6cca5043`, `8072c186d` en el log de `feat/197-entrenar`.
