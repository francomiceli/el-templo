---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 05
subsystem: api-sessions
tags: [tdd, ranking, canasta, week-dates, bloque-libre]
requires: ["197-03", "197-04"]
provides:
  - free-blocks-ranking.ts (esRolDeCanasta, rangoDeRol, RANGO_ROL, limpiarNombre, claveDeDuplicado, deduplicarMasReciente, trabajadoHoy, ordenarCanasta, paginar, subtituloDeBloque, CandidatoCanasta)
  - weekDayToDate en shared/week-dates.ts
affects: [197-06, 197-07]
key-files:
  created:
    - el-templo-api/src/modules/sessions/free-blocks-ranking.ts
    - el-templo-api/test/sessions/free-blocks-ranking.test.ts
  modified:
    - el-templo-api/src/modules/shared/week-dates.ts
requirements: [D-04, D-08, D-09]
---

# Fase 197 Plan 05: Ranking puro de la canasta y weekDayToDate — Summary

Las reglas D-08 (roles), D-09 (duplicados, queda el más reciente) y D-04 (orden, filtro por grupo, "ya lo trabajaste hoy" al final) viven en funciones puras sin DB y sin imports de valor, más `weekDayToDate` (inversa de `dateToWeekNumber` + `dateToDayName`).

## Commits

- `fe62f6ea3` test(197-05): ranking de la canasta (RED)
- `9d65dcbf6` feat(197-05): ranking puro de la canasta y weekDayToDate (GREEN)

## Qué se hizo

1. **RED**: unit con un `describe` por función (8 funciones + `rangoDeRol`), fábrica `cand(over)` con los 6 `groupHits` en 0. Cubre todos los casos de `<behavior>` más bordes (rol `*_ALT`, desempate por `blockId`, partición estable, no mutación, lista vacía, `domingo`/día desconocido, tildes).
2. **GREEN**: `free-blocks-ranking.ts` según el contrato. Comparador base fecha desc → `rangoDeRol` → `blockId`; con grupo, `groupHits[grupo]` desc antes. La partición `workedToday` es de dos pasadas después del sort. `weekDayToDate` reusa `WEEK_ONE_MONDAY` y `formatLocalDate` (un solo ancla; el grep de gate da 1).

## Verificación (estática, sin node_modules)

- Scripts `<verify>` de ambas tareas: `OK`. Higiene (`console.`, `any`) sin salida. Único módulo con `import type` (sin imports de valor).
- `weekDayToDate(34, "viernes")` = 2026-10-16 verificado por cálculo aparte (python); el round-trip semanas 1/20/52 corre en CI.
- Líneas > 80: solo comentarios y el template literal de `claveDeDuplicado` (Prettier no los parte).

## Desvíos/decisiones

- `weekDayToDate` devuelve `null` también para semanas fuera de 1..52 o no enteras (el plan solo nombraba el día no entrenable); evita que `dateToWeekNumber` clampee en silencio una fecha que no corresponde a la semana pedida.
- Lookup de día con `Object.prototype.hasOwnProperty` sobre `DAY_NAME_TO_NUMBER` (un `"constructor"` o `"toString"` no debe resolver a una función). Mismo criterio en `rangoDeRol`/`esRolDeCanasta`.
- `esRolDeCanasta` excluye cualquier rol que termine en `_ALT` (también `ROM_*_ALT`), coherente con D-08. Rol desconocido en `rangoDeRol` → 99.
- `ordenarCanasta` no muta la entrada (copia antes de ordenar).
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno.

## Para el orquestador / planes siguientes

- Tests sin correr local (regla de la fase); CI confirma.
- 197-06 debe pasar `exerciseIds` ya en el orden de la sesión (solo main) a `claveDeDuplicado`, y `date` como "YYYY-MM-DD" (de `weekDayToDate`) para que la comparación de strings sea cronológica.
- `RANGO_ROL` no incluye ROM_* (se resuelve en `rangoDeRol`), tal como el contrato.

## Self-Check: PASSED

Archivos creados presentes y commits `fe62f6ea3` y `9d65dcbf6` en el log de `feat/197-entrenar`.
