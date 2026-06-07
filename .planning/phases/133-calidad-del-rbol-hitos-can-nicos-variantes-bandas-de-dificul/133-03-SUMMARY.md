---
phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
plan: 03
subsystem: api
tags: [heuristic, milestones, bootstrap-cli, exercises, drizzle, tdd]
requires:
  - "133-01: tabla exercise_milestone_proposals + exercises.milestone_exercise_id (migración 0145)"
provides:
  - "proposeMilestones() — motor puro determinístico de agrupamiento (movimiento × escalón) por partición (ruta × esfuerzo)"
  - "MOVEMENT_VOCAB declarativo por ruta (TTB/FL/OAP/OAPU seed, orden declarado = prioridad)"
  - "runBootstrapMilestones(db) — CLI idempotente que inserta SOLO propuestas pending"
  - "runBootstrapElitePrereqs(db) — CLI idempotente que seedea las aristas manual cross-ruta FLR→FL y PLPU→PL"
  - "phraseAppears exportada desde route-progression-map.ts"
affects:
  - 133-04 (accept transaccional consume las propuestas pending)
  - 133-05 (backbone filtra variantes aceptadas)
  - 133-07 (render R4 de las aristas cross-ruta seedeadas)
tech-stack:
  added: []
  patterns:
    - "Heurística propone / profe confirma (frontera fase 125: el CLI nunca escribe truth)"
    - "CLI standalone genérico runBootstrap<TSchema>(db) + guard de entrypoint + narrowers sin any (analog bootstrap-dimensions.ts)"
    - "INSERT idempotente WHERE NOT EXISTS respaldado por UNIQUE a nivel DB"
key-files:
  created:
    - el-templo-api/src/modules/exercises/milestone-heuristic.ts
    - el-templo-api/bootstrap-milestones.ts
    - el-templo-api/bootstrap-elite-prereqs.ts
    - el-templo-api/test/exercises/milestone-heuristic.test.ts
    - el-templo-api/test/exercises/bootstrap-milestones.test.ts
  modified:
    - el-templo-api/src/modules/exercises/route-progression-map.ts
decisions:
  - "Matching de movimiento en ORDEN DECLARADO del vocab (no bySpecificity por longitud): OA debe ganarle a TTB en nombres 'OA TTB ...' aunque TTB sea token más largo — el orden declarado ES la prioridad most-specific-first"
  - "proposeMilestones particiona (ruta × esfuerzo) INTERNAMENTE: el CLI le pasa el catálogo completo y la composición de grupos queda determinística entre corridas (no se excluyen ejercicios ya propuestos del input de la heurística — solo del INSERT)"
  - "Ejercicios sin movimiento detectado NO se agrupan entre sí: cada uno se propone como hito con confidence 40 (el profe decide en el drawer)"
  - "bootstrap-elite-prereqs cuenta inserted vía affectedRows del ResultSetHeader (no a ciegas): el NOT EXISTS puede insertar 0 filas"
metrics:
  duration: ~20min
  tasks: 3
  files: 6
  completed: 2026-06-07
---

# Phase 133 Plan 03: Heurística de hitos + CLIs bootstrap (R1-HEUR, R4-XRUTA) Summary

Motor puro determinístico que agrupa cada partición (ruta × esfuerzo) por (movimiento × escalón) y propone UN hito canónico por grupo, más dos CLIs idempotentes (propuestas pending de hito; aristas manual cross-ruta de élite) que jamás escriben truth ni pisan criterio humano.

## What Was Built

### Task 1 — milestone-heuristic.ts (TDD: RED 226318c6, GREEN 9e6af7a0)

- **RED:** `test/exercises/milestone-heuristic.test.ts` con los 6 behaviors del plan sobre un seed TTB CON de 20 nombres reales (familias ATW/WINDSHIELD/BENT ARM/OA/90/TTB × escalones TUCK/STRADDLE/FULL) + skeleton tipado. 5/6 fallaron (el de determinismo pasa vacuamente sobre `[]`).
- **GREEN:** `proposeMilestones(rows)` pura: particiona (ruta × esfuerzo), detecta movimiento como PRIMER token declarado de `MOVEMENT_VOCAB[route]` que aparece como frase whole-word en `normalizeWords(name)` (reusa `normalizeWords`/`phraseAppears`/`classify` del route-progression-map — `phraseAppears` se exportó, cambio mínimo), escalón = `acceptedStep ?? classify(name, route).step` EN VIVO (Pitfall 6: truth `progression_step` vacío), agrupa por (movimiento, escalón), hito = menos tokens normalizados → menor dl → menor id (orden total → determinístico ante cualquier orden de input; output ordenado por exerciseId). Confidence 80 grupo>1 / 60 singleton con movimiento / 40 sin movimiento (sin agrupar, propuesto como hito).
- `MOVEMENT_VOCAB` seed: TTB `[ATW, WINDSHIELD, BENT ARM, OA, 90, TTB]`, FL, OAP, OAPU. Docblock documenta que ampliar el vocab es barato y esperado; ruta sin vocab → movement null para todos.
- 6/6 verdes; el seed produce exactamente 13 hitos (cota ≤13 ✓). Módulo sin imports de drizzle ni db (grep = 0).

### Task 2 — bootstrap-milestones.ts (commit e73bb8e5)

- Estructura completa del analog `bootstrap-dimensions.ts`: READ del scope candidato a hito (`canonical_exercise_id IS NULL AND effort IN (CON,EXC,ISO) AND habilidad IS NULL AND routes.excluded_from_tree = 0`) con LEFT JOIN a `exercise_dimension_proposals` filtrado `status='accepted'` → `acceptedStep`; TRANSFORM con `proposeMilestones()` sobre el catálogo COMPLETO (agregación en memoria, sin subqueries correlacionadas — Pitfall 3); WRITE de a una fila con `WHERE NOT EXISTS` (UNIQUE(exercise_id) de 0145 lo respalda a nivel DB), `engine='milestone-heuristic-v1'`, status siempre `'pending'`. PROHIBIDO tocar `exercises` (grep UPDATE = 0).
- `runBootstrapMilestones<TSchema>(db)` genérica retorna `{ proposed, skipped }`; guard de entrypoint; narrowers sin `any`; console.log documentado como legítimo (CLI standalone).
- 5 tests de integración (A-E): agrupamiento con particiones que no se mezclan, idempotencia (2ª corrida proposed=0, sin duplicados), truth de exercises intacto, propuesta preexistente se saltea sin sobreescribir, acceptedStep accepted pisa a classify() y pending NO.

### Task 3 — bootstrap-elite-prereqs.ts (commit a06516cf)

- `ELITE_PREREQS = [{elite:'FLR', base:'FL'}, {elite:'PLPU', base:'PL'}]`, effort CON. Regla determinística: target = primer backbone de la élite por (dl ASC, id ASC) en scope backbone (canonical/habilidad/milestone NULL, ruta no excluida); source = backbone de la base con el MAYOR dl estrictamente menor al del target (tie id ASC). Respeta los pisos verificados (FLR dl 5, PLPU dl 4) sin hardcodearlos.
- Curation-safe: si ya existe CUALQUIER arista manual entrante cross-ruta hacia la élite → skip del par entero (T-133-22); INSERT `'manual'` con NOT EXISTS sobre (from,to); cero DELETE/UPDATE (grep = 0); rutas/scope faltantes → skip con log, nunca throw.
- 3 tests (F-H): arista exacta FL(dl4)→FLR(dl5) con par PLPU skippeado sin throw; 2ª corrida inserta 0; arista manual preexistente del profe → par skippeado y la arista intacta.

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` limpio (corrido tras cada task).
- `pnpm exec vitest run test/exercises/milestone-heuristic.test.ts` → 6/6 verdes.
- `pnpm exec vitest run test/exercises/bootstrap-milestones.test.ts` → 8/8 verdes (5 milestones + 3 elite prereqs).
- Greps de acceptance criteria de las 3 tasks verificados (import del map=1, proposeMilestones=1, drizzle/db en el motor=0, NOT EXISTS≥1 en ambos CLIs, UPDATE exercises=0, 'manual'≥1, DELETE/UPDATE de aristas=0).
- Suite completa NO corrida localmente (regla del proyecto — corre en CI al pushear con confirmación del usuario).
- Ejecución real de los CLIs contra la DB local de staging: NO corrida en este plan (opcional según el plan; ver "Post-deploy manual" abajo).

## Post-deploy manual (documentado, fuera de este plan)

La ejecución en prod de ambos CLIs es un paso MANUAL post-deploy (patrón fases 125/126 — open question 2 del RESEARCH resuelta así):

```bash
cd el-templo-api
npx tsx bootstrap-milestones.ts      # inserta propuestas pending (idempotente)
npx tsx bootstrap-elite-prereqs.ts   # seedea aristas FLR/PLPU (idempotente)
```

Ambos son re-corribles sin efectos: NOT EXISTS + UNIQUE respaldan la idempotencia, y elite-prereqs se saltea si los profes ya autoraron aristas. La revisión de las propuestas la hacen los profes async en el drawer (plan 133-04/05).

## Must-Haves Check

- [x] La heurística agrupa una partición (ruta × esfuerzo) por (movimiento × escalón) determinísticamente y propone UN hito por grupo; el seed TTB-like produce 13 hitos (≤13)
- [x] bootstrap-milestones inserta SOLO propuestas pending (test C verifica exercises intacto) y es idempotente (test B: 2 corridas, sin duplicados)
- [x] bootstrap-elite-prereqs inserta las aristas manual cross-ruta FLR→FL (test F) en forma idempotente (test G); PLPU→PL usa la misma maquinaria (par skippeado en tests por rutas ausentes, mismo code path); ejecución en prod queda manual post-deploy

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Conteo de inserted vía affectedRows en bootstrap-elite-prereqs**

- **Found during:** Task 3
- **Issue:** El analog (bootstrap-dimensions) incrementa el contador a ciegas tras el INSERT, pero con NOT EXISTS el INSERT puede afectar 0 filas — el retorno `{ inserted }` mentiría en re-corridas parciales.
- **Fix:** Narrower `readAffectedRows()` sobre el ResultSetHeader de mysql2; solo cuenta inserted cuando affectedRows > 0, sino skipped.
- **Files modified:** el-templo-api/bootstrap-elite-prereqs.ts
- **Commit:** a06516cf

Sin otras desviaciones — el matching por orden declarado del vocab (en vez de sort por longitud) es la lectura correcta del "most-specific-first" del plan (un sort por longitud haría que TTB le gane a OA en "OA TTB Tuck"), registrado como decisión.

## Known Stubs

None — motor + CLIs + tests, sin superficies de UI. `MOVEMENT_VOCAB` cubre TTB/FL/OAP/OAPU (las particiones largas del RESEARCH) por diseño, no por omisión: rutas sin vocab caen al camino "sin movimiento" (hito con confidence 40, profe decide) y ampliar el vocab está documentado como evolución esperada.

## Threat Flags

Ninguna superficie nueva fuera del threat model del plan: T-133-20 mitigado (solo INSERT pending, grep gate UPDATE exercises=0), T-133-21 mitigado (interpolación solo vía `${}` parametrizado, agregación en memoria), T-133-22 mitigado (skip por arista manual preexistente + NOT EXISTS + cero DELETE/UPDATE). Cero cambios en package.json. Los CLIs no exponen red — corren solo por operador.

## Self-Check: PASSED
