---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 04
subsystem: api-sessions
tags: [zones, muscle-zones, fixtures, bloque-libre]
requires: ["197-03"]
provides:
  - zones y groups en cada bloque de /api/sessions/weekly y /daily
  - fixtures de test de la fase (seedExercise, seedSession, createPresencialMember, dayIdFor)
affects: [197-07, 197-08, 197-09, 197-13, 197-18]
key-files:
  created:
    - el-templo-api/test/sessions/_free-blocks-fixtures.ts
    - el-templo-api/test/sessions/weekly-zones.test.ts
  modified:
    - el-templo-api/src/modules/sessions/types.ts
    - el-templo-api/src/modules/sessions/service.ts
    - el-templo-api/src/modules/sessions/session-response.ts
requirements: [D-03, D-10]
---

# Fase 197 Plan 04: zones/groups por bloque y fixtures — Summary

Cada bloque del payload de `/weekly` y `/daily` trae `zones` (unión de las zonas de sus ejercicios `main`) y `groups` (chips de D-10), calculados solo en el API; más las fábricas de test que reusan los planes de la canasta.

## Qué se hizo

1. **Servicio**: `ExercisePrescription` suma `category`, `categorySecondary`, `exerciseRoute` (opcionales). `getSessionsByDayIds` y `reconstructSession` agregan las tres columnas calificadas (`schema.exercises.*`) al `leftJoin` que ya existía y las mapean (sin queries nuevas, sin N+1; T-197-10).
2. **Respuesta**: `blockToResponse` calcula `zones = zonasDelBloque(mainExercises.map(toZoneInput), block.role)` y `groups = gruposDeZonas(zones)`, al final del objeto (ninguna clave existente cambia de orden). La movilidad queda fuera porque solo se pasan los `main`. Los response schemas declaran `blocks: { type: "array" }` sin `items`, así que las claves nuevas pasan sin tocar `schemas.ts` (verificado leyéndolo).
3. **Fixtures** `_free-blocks-fixtures.ts`: contrato exacto del plan; todo insert con `tenantValues(ctx, …)` (ctx por defecto El Templo), prescripción de movilidad con `exercise_type = "mobility"` y `sort_order = 999`, `block_id = ${dayId}-${role}`, `seedSession` idempotente.
4. **Test** `weekly-zones.test.ts` (corre en CI): NUCLEUS (PULL VERTICAL + KNEE DOMINANT + movilidad PUSH HORIZONTAL) = unión ordenada sin `chest`/`deltoids`/`triceps`, grupos `espalda, piernas, brazos`; bloque sin categorías = `[]`/`[]`; ROM_CORE sin categorías = `lower-back, abs, obliques` / `espalda, core`; mismos resultados por `/daily`.

## Commits

- `536deafc8` feat(197-04): zones y groups por bloque en /weekly y /daily (D-10)
- `aabf82ac0` test(197-04): fixtures de la canasta + zones en /weekly y /daily

## Verificación (estática, sin node_modules)

- Scripts `<verify>` de ambas tareas: `OK`. Higiene (`console.`, `any`, ids/fechas hardcodeados) sin salida.
- Líneas > 80 columnas nuevas: solo comentarios y títulos de `it(...)` (Prettier no los parte).
- `git status --porcelain` vacío al cerrar.

## Desvíos/decisiones

- **ROM_CORE en la misma sesión del lunes** (el plan dejaba elegir): evita depender de la fila `day_modes` del sábado y del colapso de nivel a `delta`; el fallback depende solo del `role`, así que el caso queda igual de probado.
- `createPresencialMember` tipa `level` con el enum de `users.level` (no `string`) para que compile sin cast, y acepta `branchId` opcional (default 1) por si un test de otro gimnasio necesita una sede propia.
- `seedExercise` sin categoría usa `COORDINATIVO` + ruta `AF`, que `muscle-zones` no mapea a zonas (así "sin categoría" no es un string vacío en una columna NOT NULL).
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno.

## Para el orquestador / planes siguientes

- Los tests no se corrieron local (regla de la fase). Dos cosas que CI debería confirmar: que `day_modes` del lunes no esté en `rom` (no lo está salvo restos de otro archivo del worker) y que el insert de `subscription_plans` con los campos copiados de `sessions-gating.test.ts` no necesite columnas extra.
- 197-07/08/09 importan `CTX_TEMPLO`, `seedExercise`, `seedSession`, `createPresencialMember`, `dayIdFor` de `./_free-blocks-fixtures`.
- `dateToWeekNumber` clampa a 1-52: pasada la semana 52 los fixtures siguen alineados con la ruta porque ambos usan la misma función.

## Self-Check: PASSED

Archivos creados presentes y commits `536deafc8`, `aabf82ac0` en el log de `feat/197-entrenar`.
