---
phase: 135-rbol-del-admin-jerarqu-a-visual-de-hitos-y-variantes-en-tree
plan: 03
subsystem: api
tags: [tree-editor, drizzle, milestone-variants, fastify-schema, backbone]

# Dependency graph
requires:
  - phase: 133-calidad-del-rbol
    provides: "milestone_exercise_id TRUTH column + backboneNodeConditions() (milestone_exercise_id IS NULL) shared predicate"
provides:
  - "GET /admin/tree-editor/tree now embeds variants[] under each hito node (separate batched query, grouped in JS, dl asc)"
  - "EditableNode.variants: MilestoneVariant[] DTO field (shape {id,name,dl})"
  - "editableNodeSchema variants array on the /tree response contract"
  - "Regression-guarded integration test: variantes never leak into the backbone node-set"
affects:
  [
    135-04 frontend tree render,
    tree-editor canvas,
    member-tree,
    getNeighbor,
    rebuild-progression-graph,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "load-all-and-group-in-JS for the variants Map (mirrors loadGraphNodes/loadAllEdges) — avoids correlated subqueries (Pitfall 3)"
    - "variants query is the EXACT complement of the backbone predicate (isNotNull vs isNull on milestone_exercise_id) — backbone predicate never touched"

key-files:
  created:
    - el-templo-api/test/tree-editor/tree-variants.test.ts
  modified:
    - el-templo-api/src/modules/tree-editor/service.ts
    - el-templo-api/src/modules/tree-editor/schemas.ts

key-decisions:
  - "variants[] loaded via a SEPARATE loadVariantsByMilestone() query (isNotNull(milestoneExerciseId)) added to buildEditableTree's Promise.all — backboneNodeConditions() byte-for-byte unchanged (B-NOREGRESION)"
  - "variants ordered by dl ascending then id (mirrors getVariants); variant-less hito -> []"
  - "GET /tree handler + editableTreeResponseSchema unchanged; the response schema grows in place via editableNodeSchema; no new endpoint"

patterns-established:
  - "Pattern: embed per-node child collections via one batched complement query + JS grouping rather than N on-demand round-trips"

requirements-completed: [B-ENDPOINT, B-NOREGRESION]

# Metrics
duration: ~8min
completed: 2026-06-08
---

# Phase 135 Plan 03: variants[] embedded per hito in /tree Summary

**GET /admin/tree-editor/tree now carries `variants[]` ({id,name,dl}, dl asc) under each hito node via a separate batched `isNotNull(milestone_exercise_id)` query grouped in JS — the backbone predicate is untouched so member-tree/getNeighbor/rebuild still see only hitos.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-08
- **Completed:** 2026-06-08
- **Tasks:** 3
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments

- `loadVariantsByMilestone()` — one select of every variante (`isNotNull(milestoneExerciseId)`), grouped in JS into `Map<milestoneExerciseId, MilestoneVariant[]>`, ordered dl asc; wired into `buildEditableTree`'s existing `Promise.all`.
- `EditableNode` gains `variants: MilestoneVariant[]`, populated in `toEditable` via `variantsByMilestone.get(exerciseId) ?? []`.
- `editableNodeSchema` gains a `variants` array whose item shape is verbatim from `milestoneVariantsResponseSchema` ({id,name,dl}).
- Integration test asserts grouping (dl asc), variant-less hito → [], member→403, and — load-bearing — that variantes never appear in the backbone node-set (both the /tree payload and the shared `backboneNodeConditions()` selection).

## Task Commits

1. **Task 1: loadVariantsByMilestone() + embed variants[] in EditableNode (D-11)** - `10d0cd73` (feat)
2. **Task 2: Add variants[] to editableNodeSchema (B2)** - `b228c589` (feat)
3. **Task 3: Integration test — variants grouped under hitos + backbone no-regression** - `e734e533` (test)

_TDD note: implementation (Tasks 1-2) landed before the test (Task 3); typecheck clean for all three. Suite run deferred to CI per project rule (no local test runs)._

## Files Created/Modified

- `el-templo-api/src/modules/tree-editor/service.ts` - `isNotNull` import; `EditableNode.variants`; `loadVariantsByMilestone()`; Promise.all + `toEditable` wiring.
- `el-templo-api/src/modules/tree-editor/schemas.ts` - `variants` array on `editableNodeSchema`.
- `el-templo-api/test/tree-editor/tree-variants.test.ts` - grouping/ordering, variant-less hito, member→403, backbone no-regression cross-check.

## Decisions Made

- variants loaded via a SEPARATE complement query so `backboneNodeConditions()` stays byte-for-byte unchanged (verified: `git diff` shows no edit to `backbone-scope.ts`).
- Ordered by dl ascending (then id) to satisfy the plan's discretion decision and mirror `getVariants`.
- No new endpoint and no handler change — the response schema grows in place via the node schema.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- First draft of the backbone cross-check query in the test had a malformed `innerJoin` argument (placeholder ternary). Corrected to a clean `innerJoin(routes, eq(exercises.route, routes.code))` mirroring `loadGraphNodes`, since `backboneNodeConditions()` references `routes.*`. Typecheck then clean.

## Contract for Plan 04 (frontend)

The `variants[]` field shape to mirror 1:1 in the frontend types:

```ts
variants: Array<{ id: number; name: string; dl: number }>;
```

- Embedded under each hito node inside `categories[].routes[].partitions[].nodes[]`.
- Ordered by `dl` ascending; a variant-less hito carries `[]`.
- Variantes are NOT top-level backbone nodes — they exist only inside `variants[]`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 (frontend render of the collapsible hito→variantes hierarchy) can consume `variants[]` directly from /tree with no extra round-trips.
- DB migration 0140/0141/0142 (kairos/adjustments) unaffected; no schema migration in this plan.

## Self-Check: PASSED

All created/modified files exist; all task commits (10d0cd73, b228c589, e734e533) present in git history.

---

_Phase: 135-rbol-del-admin-jerarqu-a-visual-de-hitos-y-variantes-en-tree_
_Completed: 2026-06-08_
