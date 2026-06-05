---
phase: 128-editor-de-rbol-en-el-admin
plan: 02
subsystem: tree-editor (v5.1 skill-tree admin editor)
tags: [graph, manual-override, admin-api, tree-07, access-control]
requires:
  - "Phase 126: exercise_progressions (source enum auto|manual) + DAG node scope"
  - "Phase 127: tree-progress node-scope predicate + category-map (reused verbatim)"
  - "Phase 128 Plan 01: locked-partition guard (rebuild never clobbers manual chains)"
provides:
  - "TreeEditorService: buildEditableTree / reorderPartition / setPrecedenceEdge / reassignSubfamily"
  - "4 admin/coach-scoped routes under /api/admin/tree-editor (tree/reorder/precedence/regroup)"
  - "Editable-tree DTO + reorder/precedence/regroup request DTOs (the Plan 03 admin-UI contract)"
affects:
  - "Plan 03 (admin UI): consumes the editable-tree read + the 3 mutation endpoints"
  - "exercise_progressions rows authored here carry source='manual' (visible to the 126 neighbor primitive + 127 read)"
tech-stack:
  added: []
  patterns:
    - "Plugin-level TRAINING_ROLES onRequest guard (authenticate + role check), mirrors admin/routes.ts"
    - "Typed domain error (TreeEditorError extends AppError) mapped to HTTP via handleServiceError"
    - "Partition-scoped edge delete (both endpoints IN partition id set) — never an unscoped bulk DELETE"
    - "readAffectedRows() narrows mysql2 ResultSetHeader.affectedRows without any"
key-files:
  created:
    - "el-templo-api/src/modules/tree-editor/service.ts"
    - "el-templo-api/src/modules/tree-editor/schemas.ts"
    - "el-templo-api/src/modules/tree-editor/routes.ts"
    - "el-templo-api/src/modules/tree-editor/index.ts"
    - "el-templo-api/src/plugins/tree-editor.ts"
    - "el-templo-api/test/tree-editor/tree-editor.test.ts"
  modified:
    - "el-templo-api/src/app.ts"
decisions:
  - "Read groups category → subfamily → (effort) partition → ordered nodes; partition tagged overridden when it owns a same-partition manual chain; cross-partition precedence edges returned in a separate top-level array"
  - "reorder deletes ALL edges with both endpoints inside the partition (auto backbone + any prior manual chain) then writes the new manual chain — idempotent (UNIQUE(from,to) dedupes)"
  - "precedence add is idempotent if a (from,to) row exists in any source (no duplicate); remove only ever deletes a source='manual' row — never an auto edge"
  - "regroup orphan policy: only edges INCIDENT to a moved node are considered; an incident edge is pruned iff its two endpoints no longer share a (subfamily_id × effort) partition AFTER the move; edges between two non-moved nodes are never touched; no forced auto regeneration (profe re-runs reorder)"
metrics:
  duration: ~12min
  completed: 2026-06-05
requirements: [TREE-07]
---

# Phase 128 Plan 02: Tree Editor Backend Summary

Profes can now refine the auto-built skill tree through admin/coach-scoped API endpoints — reorder a partition, add/remove precedence cross-edges, and group/split subfamilies — with every override persisting in the existing `exercise_progressions` table as `source='manual'` (no new table/column/migration, D-01). Paired with Plan 01's locked-partition guard, these manual chains PREVAIL over the SPOM auto order and SURVIVE a full graph rebuild (TREE-07).

## What Was Built

### Task 1 — `TreeEditorService` + schemas (commit `cdead433`)

`el-templo-api/src/modules/tree-editor/service.ts` — an injectable `TreeEditorService` (DI of `MySql2Database<typeof schema>` + optional logger, mirroring the tree-progress read service) exposing:

- **`buildEditableTree()`** — reads the EXACT 126/127 DAG node scope (`canonical_exercise_id IS NULL AND effort IN ('CON','EXC','ISO')`, inner-join `exercise_subfamilies` enforcing non-null `subfamily_id`), copied verbatim — but WITHOUT the member `reached` branch (D-06). Returns `category → subfamily → (effort) partition → ordered nodes`. A partition is tagged `overridden:true` when it owns a same-partition manual chain (then nodes follow the manual chain order); otherwise `overridden:false` and nodes follow `dificultad_lineal` then `id` (the auto order). Each node carries `orderSource:'auto'|'manual'`. Cross-partition edges (any source) are returned in a separate `precedenceEdges[]` array so the UI can draw DAG branches. Reuses `patternToCategory` from `tree-progress/category-map`.
- **`reorderPartition(subfamilyId, effort, orderedExerciseIds)`** — validates `effort ∈ CON/EXC/ISO` and that the id set EXACTLY matches the partition's node set (no extra/missing/duplicate ids). In ONE transaction: deletes every edge whose BOTH endpoints are in the partition (the auto backbone AND any prior manual chain), then inserts the consecutive `source='manual'` chain `orderedExerciseIds[i] → [i+1]`. Idempotent (D-02/D-03).
- **`setPrecedenceEdge(from, to, op)`** — rejects `from===to`; both ids must be in-graph nodes. `add` upserts a single `source='manual'` edge, idempotent if a `(from,to)` row already exists in any source (no duplicate — UNIQUE backs the dedupe). `remove` deletes WHERE `from=? AND to=? AND source='manual'` ONLY — never an auto edge (D-04).
- **`reassignSubfamily(exerciseIds, targetSubfamilyId)`** — validates the target subfamily + every exercise id exists; in ONE transaction UPDATEs `exercises.subfamily_id` then prunes the now-inconsistent edges. **Orphan policy (documented in-code):** only edges incident to a moved node are considered; an incident edge is pruned iff its two endpoints no longer share a `(subfamily_id × effort)` partition AFTER the move; edges between two non-moved nodes are untouched; pre-existing cross-partition precedence edges survive. Bounded + reversible (D-05). No migration — pure data UPDATE.

Typed domain error `TreeEditorError extends AppError` (statusCode 400 default, 404 for missing FKs) so routes map it via `handleServiceError`. `readAffectedRows()` narrows the mysql2 delete result without `any`. No `any` anywhere; injected logger only (no console.log).

`el-templo-api/src/modules/tree-editor/schemas.ts` — Fastify JSON schemas: `editableTreeResponseSchema`, `reorderBodySchema` (`effort` enum CON/EXC/ISO), `precedenceBodySchema` (`op` enum add/remove), `regroupBodySchema`, `mutationResultSchema`, `errorResponseSchema`. Mutation bodies use `additionalProperties:false` + `required` so a malformed body is rejected at the schema boundary before any DB write.

### Task 2 — Admin/coach routes + plugin + integration tests (commit `59a454c6`)

`routes.ts` (`treeEditorRoutes`) instantiates `TreeEditorService(fastify.db)`, adds the plugin-level `onRequest` guard copied from `admin/routes.ts` (authenticate THEN reject any role ∉ `TRAINING_ROLES` with 403), and registers 4 routes wrapping each service method with `handleServiceError` in the catch:

- `GET  /api/admin/tree-editor/tree`
- `POST /api/admin/tree-editor/reorder`
- `POST /api/admin/tree-editor/precedence`
- `POST /api/admin/tree-editor/regroup`

`index.ts` barrels `treeEditorRoutes` + the service + DTO types. `plugins/tree-editor.ts` (fp, name `tree-editor-plugin`, dependencies `['database','auth']`) registers the routes under prefix `/api/admin/tree-editor`. `app.ts` imports + registers `treeEditorPlugin` immediately after `treeProgressPlugin`.

`test/tree-editor/tree-editor.test.ts` seeds a real two-partition graph (subfamily A: CON dl 1/3/5 auto chain; subfamily B: CON dl 1/5 auto chain) and covers:

- **AUTH:** no token → 401 on all 4 routes; MEMBER token → 403 on all 4 routes.
- **READ:** editable structure tagged `auto`, auto order = dl ascending, no `reached` property.
- **REORDER:** rewrites partition A as manual chain in the new order + clears its auto edges + leaves B untouched; GET then reports it `overridden`; idempotent re-apply converges; mismatched id set → 400.
- **PRECEDENCE:** add → single manual cross-edge appears; idempotent add (no dup); remove → gone; `from===to` → 400; remove of an auto edge is a no-op (auto survives); non-existent node → 404.
- **REGROUP:** moves a5 A→B, asserts `subfamily_id` changed, the now-cross-partition `a3→a5` is pruned while `a1→a3` and `b1→b5` survive; non-existent target subfamily → 404; non-existent exercise → 404.

## DTO / Endpoint Contract for Plan 03 (admin UI)

```
GET /api/admin/tree-editor/tree → 200
{
  categories: [{
    key: string, label: string,
    subfamilies: [{
      id: number, name: string, route: string,
      partitions: [{
        effort: string,              // 'CON' | 'EXC' | 'ISO'
        overridden: boolean,         // true ⇒ profe-owned manual chain (locked)
        nodes: [{ exerciseId, name, dificultadLineal, effort, orderSource }]
                                     // orderSource: 'auto' | 'manual'
      }]
    }]
  }],
  precedenceEdges: [{ fromExerciseId, toExerciseId, source }]  // cross-partition
}

POST /api/admin/tree-editor/reorder
  body { subfamilyId:number, effort:'CON'|'EXC'|'ISO', orderedExerciseIds:number[] }
POST /api/admin/tree-editor/precedence
  body { fromExerciseId:number, toExerciseId:number, op:'add'|'remove' }
POST /api/admin/tree-editor/regroup
  body { exerciseIds:number[], targetSubfamilyId:number }

All mutations → 200 { ok:true, edgesWritten:number, edgesDeleted:number }
Errors → { error:string, message:string } with 400 (bad input) / 401 (no token) /
         403 (non-coach/owner) / 404 (unknown subfamily/exercise id).
```

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface

All Plan threat-model mitigations implemented:

- **T-128-03 (EoP):** plugin onRequest guard, member→403 + no-token→401 asserted.
- **T-128-04 (Tampering):** every exercise/subfamily id FK-validated + partition-membership-checked; `from===to` rejected; schema `additionalProperties:false`; bad id → 404 (asserted, not 500).
- **T-128-05 (DoS/data-loss):** all deletes are partition/id-scoped (no unscoped DELETE); reorder + regroup wrapped in a transaction (rolls back on failure).
- **T-128-02 (Info disclosure):** read is staff-scoped, returns only catalog/graph structure, no member `reached`/PII.

No new threat surface beyond the plan's register.

## Known Stubs

None.

## Verification

- `cd el-templo-api && pnpm tsc --noEmit` exits 0 after each task (no `any`, no new column, no new migration). CI's typecheck step (`include: src/**/*`) covers the `src` module; the test file is type-checked by vitest at run time per project tooling.
- Integration tests run in CI (`pnpm vitest run test/tree-editor/tree-editor.test.ts`) per project policy — NOT run locally.
- Manual sanity contract: every override row written by the editor has `source='manual'`; regroup is a data UPDATE of `subfamily_id`; no migration added; `source` column unchanged.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/tree-editor/service.ts
- FOUND: el-templo-api/src/modules/tree-editor/schemas.ts
- FOUND: el-templo-api/src/modules/tree-editor/routes.ts
- FOUND: el-templo-api/src/modules/tree-editor/index.ts
- FOUND: el-templo-api/src/plugins/tree-editor.ts
- FOUND: el-templo-api/test/tree-editor/tree-editor.test.ts
- FOUND commit: cdead433 (feat 128-02 service + schemas)
- FOUND commit: 59a454c6 (feat 128-02 routes + plugin + tests)
