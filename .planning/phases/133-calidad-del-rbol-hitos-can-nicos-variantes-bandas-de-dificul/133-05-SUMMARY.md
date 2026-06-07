---
phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
plan: 05
subsystem: api
tags: [tree-editor, milestones, drizzle, mysql, transactions, fastify, tdd]
requires:
  - "133-01: exercises.milestone_exercise_id + tabla exercise_milestone_proposals (migración 0145)"
  - "133-03: propuestas pending insertadas por bootstrap-milestones (consumidas acá)"
  - "133-04: backbone-scope compartido (las variantes aceptadas salen del node-set automáticamente)"
provides:
  - "acceptInTransaction(tx, id, overrides) exportado de proposal-service — accept de dimensión embebible en transacciones ajenas"
  - "TreeEditorService.acceptMilestoneReview — ÚNICO write path del truth milestone_exercise_id (una pasada del profe = una tx: dimensión + hito/variante + poda + flip)"
  - "TreeEditorService.rejectMilestoneReview — flip status-only, 404 sin pending, jamás toca exercises"
  - "TreeEditorService.listMilestoneReview / getVariants / promoteToMilestone (swap transaccional)"
  - "5 endpoints HTTP bajo guard TRAINING_ROLES: GET /milestone-review, GET /milestone/:id/variants, POST accept/reject/promote"
affects:
  - 133-06 (el drawer/panel del admin consume estos 5 contratos 1:1)
  - 133-07 (render del árbol con variantes ya filtradas)
  - 134 (dominado sobre variante — pregunta diferida de 133-04)
tech-stack:
  added: []
  patterns:
    - "Cuerpo transaccional extraído como función exportada (acceptInTransaction) para componer transacciones cross-módulo sin doble tx"
    - "Validaciones DENTRO de la tx después del primer write — un fallo tardío rollbackea todo (atomicidad observable por test de integración, sin mocks)"
    - "Poda acotada por id (inArray) con re-encadenado prev→next same-partition; source 'manual' si alguna podada era manual (preserva el lock — Pitfall 2)"
    - "Swap promote: liberar el nuevo hito PRIMERO, luego re-apuntar ex-hito/variantes/aristas con manejo de self-edges y colisiones UNIQUE(from,to)"
key-files:
  created:
    - el-templo-api/test/tree-editor/milestone-review.test.ts
  modified:
    - el-templo-api/src/modules/admin/proposal-service.ts
    - el-templo-api/src/modules/tree-editor/service.ts
    - el-templo-api/src/modules/tree-editor/routes.ts
    - el-templo-api/src/modules/tree-editor/schemas.ts
decisions:
  - "Las validaciones de variante (target existe/misma partición/es hito/sin variantes colgando) corren DENTRO de la transacción DESPUÉS del accept de dimensión: un fallo tardío demuestra el rollback completo en el test sin mocks ni inyección de fallos"
  - "Extra props en bodies se STRIPPEAN (Ajv de Fastify con removeAdditional + additionalProperties:false), no rechazan con 400 — es el contrato de plataforma de todos los endpoints existentes; el vector de inyección queda neutralizado igual (T-133-43)"
  - "Colisión UNIQUE(from,to) al promover: se borra la arista vieja en lugar de actualizarla a duplicado; arista que quedaría self-edge se borra"
  - "Re-chain multi-prev × multi-next: producto cartesiano de predecesores × sucesores same-partition (el caso real del backbone es 1×1)"
  - "getVariants devuelve [] para un id desconocido (sin 404) — el panel espeja la lista vacía"
metrics:
  duration: ~19min
  tasks: 3
  files: 5
  completed: 2026-06-07
---

# Phase 133 Plan 05: Revisión hito/variante — accept transaccional + promote + endpoints Summary

Una pasada del profe = una transacción: `acceptMilestoneReview` escribe dimensión pendiente + `milestone_exercise_id` + poda acotada de aristas (incluso en particiones locked) + flip de propuesta, todo o nada; más promote (swap hito↔variante sin referencias colgantes), lecturas para el drawer/panel y 5 endpoints bajo guard coach/owner con authz testeada endpoint por endpoint.

## What Was Built

### Task 1 — accept/reject transaccional + poda acotada (TDD: RED d909f2e8, GREEN ca7629cb)

- **proposal-service.ts:** el cuerpo de `accept()` se extrajo VERBATIM a `acceptInTransaction(tx, id, overrides)` (función exportada, con el tipo `ProposalTx` derivado de la firma de `db.transaction`); `accept()` quedó como wrapper de una línea. Cero cambio de comportamiento: `proposal-review.test.ts` verde SIN modificaciones (gate de no-regresión).
- **tree-editor/service.ts — `acceptMilestoneReview(input)`:** en UNA `db.transaction`: (a) acepta la propuesta de dimensión pending vía `acceptInTransaction` con `dimensionOverrides` mapeados (semántica `!== undefined` preservada: null = clear explícito); (b) valida el target de variante (404 inexistente / 400 otra partición / 400 es variante / 400 "tiene variantes asignadas — promové otra variante a hito primero" / 400 self-target / 400 sin milestoneExerciseId) — las validaciones corren DESPUÉS del write de dimensión, así un fallo tardío demuestra el rollback; (c) escribe el truth (NULL para hito, el id del hito para variante) — único write path de la columna; (d) si variante → `pruneDegradedVariantEdges`; (e) flipea la propuesta de hito pending si existe (ad-hoc si no).
- **`pruneDegradedVariantEdges`:** carga aristas incidentes (from + to), las borra TODAS por id con `inArray` (acotado, nunca bulk — T-128-05), y si el degradado estaba en MEDIO de una cadena same-partition re-encadena prev→next (chequeo de existencia previo por UNIQUE(from,to)); source de la nueva = 'manual' si ALGUNA podada same-partition era manual (la partición sigue locked — Pitfall 2), sino 'auto'. Aristas cross-partición mueren sin re-encadenado.
- **`rejectMilestoneReview`:** UPDATE status-only del pending → 'rejected' con `readAffectedRows`; 404 si afectó 0 filas; jamás toca `exercises`.
- Tests 1-7: accept hito (aristas intactas), atomicidad dimensión+hito con rollback forzado, poda en cadena auto (A→B 'auto'), poda en cadena LOCKED manual (A→B 'manual' + `getNeighbor(A,'up')`→B, nunca X), poda cross-partición sin re-chain, reject intacto + 404, validaciones tipadas.

### Task 2 — listMilestoneReview, getVariants, promoteToMilestone (TDD: RED 7352b722, GREEN ac2e4840)

- **`listMilestoneReview(route)`:** join plano propuestas × exercises (sin subqueries correlacionadas — Pitfall 3), solo `pending`, shape `MilestoneReviewRow` exacto del contrato del plan 06 (exerciseId/name/dl/effort/movementToken/stepRank/proposedMilestoneExerciseId/status/confidence), orden (dl, exerciseId).
- **`getVariants(hitoId)`:** SELECT del truth (`milestone_exercise_id = :id`) → `{id, name, dl}`; las propuestas no aparecen.
- **`promoteToMilestone(exerciseId)`:** una `db.transaction`: 400 si no es variante / 404 inexistente; (1) libera el nuevo hito PRIMERO (milestone→NULL), (2) el ex-hito cuelga del nuevo, (3) las demás variantes re-apuntan, (4) aristas incidentes del ex-hito se re-apuntan al nuevo — self-edges se borran y colisiones UNIQUE(from,to) borran la arista vieja en lugar de duplicar. Test de integridad: cero filas con `milestone_exercise_id` apuntando a una variante post-swap.
- Tests 8-11 + 10b (self-edge y colisión UNIQUE explícitos).

### Task 3 — Routes + schemas + authz (commit 4e5bee0a)

- 5 rutas registradas DENTRO del plugin tree-editor → heredan el hook onRequest TRAINING_ROLES (coach/owner) sin código nuevo de guard (T-133-40).
- Schemas con `additionalProperties: false` (3→9 ocurrencias en schemas.ts), enums (`role: hito|variante`, status), nullables tipados (`["number","null"]`), `mutationResultSchema`/`errorResponseSchema` reusados, responses 200/400/401/403/404.
- Requisito condicional (`role='variante'` exige `milestoneExerciseId`) validado en el handler (400) además del service.
- Tests 12-15: 401 sin token y 403 con member para los 5 endpoints (loop), happy path E2E completo por HTTP (list → accept variante con truth+dimensión verificados en DB → variants → reject → promote), y errores tipados 400/404 por HTTP (nunca 500), incluyendo querystring sin route → 400.

## Verification

- `pnpm exec vitest run test/tree-editor/milestone-review.test.ts test/exercises/proposal-review.test.ts` → 13/13 verdes tras Task 1; archivo completo 16/16 verdes tras Task 3. `proposal-review.test.ts` sin modificar (no-regresión del refactor).
- `pnpm exec tsc --noEmit -p tsconfig.json` limpio tras cada task.
- Acceptance greps: `acceptInTransaction` en proposal-service (3) y tree-editor/service (3); cada `delete(schema.exerciseProgressions)` nuevo lleva where por id (`inArray`/`eq`); `additionalProperties: false` 3→9; el set de `milestoneExerciseId` aparece solo dentro de los métodos transaccionales.
- Suite completa NO corrida localmente (regla del proyecto — corre en CI al pushear con confirmación del usuario).

## TDD Gate Compliance

Secuencia RED→GREEN verificada en git log para ambos features: `test` d909f2e8 → `feat` ca7629cb (accept/reject + poda) y `test` 7352b722 → `feat` ac2e4840 (list/variants/promote). Task 3 (routes) no es TDD por plan.

## Must-Haves Check

- [x] Aceptar escribe milestone_exercise_id Y la dimensión pendiente en UNA transacción; rechazar solo flipea status (Tests 2 y 6)
- [x] Aceptar variante poda/repara aristas en la MISMA transacción, incluso particiones locked: getNeighbor nunca vuelve a servir la variante (Test 4 — Pitfall 2)
- [x] Promote intercambia roles transaccionalmente: variantes y aristas del ex-hito apuntan al nuevo hito (Tests 10/10b + select de integridad)
- [x] Todos los endpoints nuevos exigen coach/owner: member→403, sin token→401 (Tests 12/13, los 5 endpoints)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug en assert de test] Extra props no devuelven 400 — se STRIPPEAN**

- **Found during:** Task 3
- **Issue:** el assert inicial esperaba 400 ante un body con propiedades extra, pero el Ajv de Fastify corre con `removeAdditional`: `additionalProperties: false` ELIMINA la clave desconocida en el boundary en lugar de rechazar — el mismo contrato de todos los endpoints existentes del plugin.
- **Fix:** el test ahora asserta el contrato real: 200 con la clave inyectada stripeada y el truth intacto (el vector de inyección T-133-43 queda igualmente neutralizado).
- **Files modified:** el-templo-api/test/tree-editor/milestone-review.test.ts
- **Commit:** 4e5bee0a

Sin otras desviaciones — el plan se ejecutó como estaba escrito.

## Requirements Note

El frontmatter del plan declara `requirements: [R1-REV, R1-FILTER]` (labels de fase). No existen como IDs en `.planning/REQUIREMENTS.md` (`requirements.mark-complete` → not_found), así que no hay checkbox global que marcar — la trazabilidad queda en el ROADMAP de la fase.

## Known Stubs

None — los 5 endpoints operan sobre datos reales (propuestas de 133-03 + truth column de 0145); sin placeholders ni datos mockeados.

## Threat Flags

Ninguna superficie nueva fuera del threat model del plan: T-133-40 mitigado (guard plugin-level + tests 401/403 por endpoint), T-133-41 mitigado (validaciones tipadas 400/404, asserts HTTP del Test 15), T-133-42 mitigado (truth+poda+re-apuntado en una tx, deletes por id, test de cadena locked + select de integridad), T-133-43 mitigado (additionalProperties:false — semántica de strip documentada). Cero cambios en package.json.

## Self-Check: PASSED

- Commits verificados en git log: d909f2e8, ca7629cb, 7352b722, ac2e4840, 4e5bee0a — FOUND (5/5)
- Archivos creados/modificados verificados en disco — FOUND (5/5)
- Sin archivos untracked nuevos generados por este plan
