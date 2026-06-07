---
phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
plan: 04
subsystem: api
tags: [drizzle, mysql, skill-tree, backbone, tree-editor, tree-progress, tdd]
requires:
  - "133-01: exercises.milestone_exercise_id (INT NULL, self-FK SET NULL)"
provides:
  - "Helper compartido backboneNodeConditions() + VALID_EFFORTS en src/modules/exercises/backbone-scope.ts"
  - "Filtro milestone_exercise_id IS NULL activo en los 4 caminos de lectura (rebuild x2, admin GET /tree, member tree, getNeighbor vía aristas)"
  - "readBackboneNodes() exportado desde rebuild-progression-graph.ts (espejo crudo testeable)"
  - "GET /admin/tree-editor/tree expone subGroup (category fina dominante) por ruta"
affects:
  - 133-05 (accept transaccional consume VALID_EFFORTS/backbone-scope)
  - 133-07 (frontend consume subGroup para los sub-grupos R3)
  - 134 (dominado sobre variante vs % del miembro — pregunta diferida)
tech-stack:
  added: []
  patterns:
    - "Predicado de backbone como array de condiciones Drizzle para spread en and(...) (Pattern 4)"
    - "Espejo manual Drizzle↔SQL crudo guardado por test de consistencia de node-set (T-133-30)"
    - "Agregación dominante en memoria sobre nodos ya cargados — cero subqueries correlacionadas (Pitfall 3)"
key-files:
  created:
    - el-templo-api/src/modules/exercises/backbone-scope.ts
  modified:
    - el-templo-api/src/modules/tree-editor/service.ts
    - el-templo-api/src/modules/tree-editor/schemas.ts
    - el-templo-api/src/modules/tree-progress/service.ts
    - el-templo-api/rebuild-progression-graph.ts
    - el-templo-api/test/exercises/rebuild-progression-graph.test.ts
    - el-templo-api/test/exercises/exercise-progression-service.test.ts
    - el-templo-api/test/tree-progress/member-tree.test.ts
    - el-templo-api/test/tree-editor/tree-editor.test.ts
decisions:
  - "Tie-break de subGroup por comparación de code-points (a < b), no localeCompare — determinístico e independiente del locale (los valores DB son UPPERCASE ASCII)"
  - "Categories vacías ('') no votan para subGroup; ruta sin votos → subGroup = ''"
  - "El SELECT crudo de nodos del rebuild se extrajo a readBackboneNodes() exportado para que el test de consistencia compare el SQL REAL (no una copia) contra el helper Drizzle"
  - "subGroup declarado required en el response schema (el servicio siempre lo emite, '' como mínimo)"
metrics:
  duration: ~32min
  tasks: 2
  files: 9
  completed: 2026-06-07
---

# Phase 133 Plan 04: Filtro de variantes + subGroup Summary

Embudo de backbone de 5 condiciones con una sola fuente de verdad Drizzle (`backboneNodeConditions()`) + espejo crudo testeado por consistencia: las variantes (`milestone_exercise_id NOT NULL`) salen de admin, miembro, rebuild y player a la vez, y `GET /tree` sirve `subGroup` (category fina dominante, en memoria) por ruta.

## What Was Built

### Task 1 — Helper backbone-scope + filtro milestone en los 4 caminos (commits 4c84d678 → c15e0bb9 → 28b390a2)

Orden de refactor LOCKED respetado: extraer primero, extender después.

1. **Refactor (4c84d678):** `src/modules/exercises/backbone-scope.ts` nuevo con `VALID_EFFORTS` (movido desde tree-editor, re-exportado allí para no romper imports; `export type Effort` se mantiene) y `backboneNodeConditions()` → array de condiciones Drizzle para spread en `and(...)`. tree-editor y tree-progress reemplazan sus predicados inline VERBATIM por el helper (comentarios "copiado EXACTLY (D-06)" reemplazados por referencia al helper). El SELECT crudo de nodos del rebuild se extrajo a `readBackboneNodes()` exportado. Comportamiento sin cambios: 50/50 tests de las 4 suites verdes.
2. **RED (c15e0bb9):** 4 behaviors nuevos — variante sin aristas tras rebuild con cadena hito→hito directa; member tree sin la variante en nodos/conteos (noise (5) en seedGraph); getNeighbor nunca devuelve la variante (Test J); consistencia de node-set helper-Drizzle vs `readBackboneNodes()` sobre seed que ejercita las 5 condiciones del embudo. 6 fallos esperados, cero regresiones.
3. **GREEN (28b390a2):** 5ª condición `isNull(exercises.milestoneExerciseId)` en el helper + `AND e.milestone_exercise_id IS NULL` en el SELECT de nodos + `AND ef./et.milestone_exercise_id IS NULL` en AMBOS endpoints de `readManualEdgePartitions` (una arista manual con una variante como endpoint ya no lockea la partición). Docblocks de scope actualizados con el comentario cruzado de espejo manual. 38/38 verdes.

### Task 2 — subGroup en EditableTree (commits 84213887 → 5830a1c4)

1. **RED (84213887):** 3 tests — shape (todo route trae `subGroup` string; mayoría 3-a-1 gana), variantes no votan (2 variantes CORE ANTERIOR vs 1 hito PULL VERTICAL → gana el hito), tie-break alfabético (empate 1-1 → "CORE ANTERIOR" < "PULL VERTICAL"). `createExercise` del test gana `category` y `milestoneExerciseId` opcionales.
2. **GREEN (5830a1c4):** `loadGraphNodes` trae `exercises.category`; conteo de votos por ruta EN MEMORIA durante el bucketing (las variantes nunca llegan al loop — ya están fuera del node-set); `dominantCategory()` con tie-break por code-points; `subGroup` en el DTO `EditableRoute` y en el response schema (`required`, UPPERCASE de la DB — title-case es-AR es del frontend, UI-SPEC C3). 18/18 verdes.

## Efecto member-visible (Pitfall 5 — declarado para VERIFICATION/UAT y release notes)

**Mi Árbol del miembro pierde nodos a medida que los profes acepten variantes.** `tree-progress` comparte el predicado de backbone, así que cada accept de variante (plan 05) reduce `totalNodes` y recalcula los porcentajes del árbol del miembro. **Es el objetivo del filtro, no un bug** — el árbol queda solo con hitos canónicos. Hoy (0 filas con `milestone_exercise_id NOT NULL`) el cambio es invisible; se materializa cuando los profes empiecen a aceptar propuestas.

Deferred-item registrado para fase 134 (en `deferred-items.md`): ¿un `dominado` sobre una variante ilumina su hito en el % del miembro? Hoy un dominado de variante simplemente deja de contar (la variante no es nodo).

## Verification

- `pnpm exec vitest run` de los 4 archivos de test tocados: 41 tests del árbol verdes tras GREEN de Task 1 (38) y Task 2 (18, incluye los 15 pre-existentes). NO se corrió el suite completo local (regla del proyecto — CI).
- `pnpm exec tsc --noEmit -p tsconfig.json` limpio tras cada paso.
- Acceptance criteria: `backboneNodeConditions` presente en tree-editor (4) y tree-progress (4); `milestone_exercise_id IS NULL` en 3 líneas no-comentario del rebuild (1 SELECT de nodos + 2 endpoints); `isNull(schema.exercises.habilidad)` = 0 en tree-progress (predicado solo en el helper); `subGroup` en schemas (2); cero ``sql` ``nuevos en tree-editor/service.ts (0 totales).

## TDD Gate Compliance

Secuencia RED→GREEN verificada en git log para ambos features: `test` c15e0bb9 → `feat` 28b390a2 (filtro) y `test` 84213887 → `feat` 5830a1c4 (subGroup). El refactor de extracción (4c84d678) precede a ambos por el orden LOCKED del plan.

## Deviations from Plan

### Auto-fixed / enablers

**1. [Rule 3 - Enabler] SELECT crudo de nodos extraído a `readBackboneNodes()` exportado**

- **Found during:** Task 1 (test de consistencia de node-set)
- **Issue:** el plan pide comparar "el SELECT crudo del rebuild" contra el helper Drizzle, pero el SQL vivía inline dentro de `runRebuildProgressionGraph` — el test habría tenido que duplicar el SQL (testear una copia, no el espejo real).
- **Fix:** extracción behavior-neutral a función exportada (mismo SQL, mismo narrowing vía `readExerciseNodes`), consumida por el rebuild y por el test.
- **Files modified:** el-templo-api/rebuild-progression-graph.ts
- **Commit:** 4c84d678

Sin otras desviaciones — el resto del plan se ejecutó como estaba escrito.

## Known Stubs

None — subGroup se computa de datos reales y el filtro opera sobre la columna real; sin placeholders ni datos mockeados.

## Threat Flags

Ninguna superficie nueva fuera del threat model del plan. T-133-30 mitigado (test de consistencia + comentarios cruzados en backbone-scope.ts y rebuild-progression-graph.ts); T-133-31 mitigado (el SQL crudo solo interpola vía `${}` — sin cambios de patrón); T-133-32 aceptado (GET /tree ya requiere coach/owner). Cero instalaciones de paquetes.

## Self-Check: PASSED
