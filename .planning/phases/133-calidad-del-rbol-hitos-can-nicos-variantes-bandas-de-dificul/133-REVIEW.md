---
phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
reviewed: 2026-06-07T00:00:00Z
depth: standard
files_reviewed: 37
files_reviewed_list:
  - el-templo-admin/src/components/sessions/EditableBlockCard.vue
  - el-templo-admin/src/components/treemap/ExerciseFlowNode.vue
  - el-templo-admin/src/components/treemap/MilestoneReviewList.vue
  - el-templo-admin/src/components/treemap/RouteFlowNode.vue
  - el-templo-admin/src/components/treemap/SubgroupFlowNode.vue
  - el-templo-admin/src/composables/useTreeEditorApi.ts
  - el-templo-admin/src/constants/levels.ts
  - el-templo-admin/src/pages/AlumnoDetailPage.vue
  - el-templo-admin/src/pages/AlumnosPage.vue
  - el-templo-admin/src/pages/SessionsPage.vue
  - el-templo-admin/src/pages/TreeMapPage.vue
  - el-templo-admin/src/types/tree-editor.ts
  - el-templo-api/bootstrap-elite-prereqs.ts
  - el-templo-api/bootstrap-milestones.ts
  - el-templo-api/rebuild-progression-graph.ts
  - el-templo-api/src/db/migrations/0145_milestone_exercise_id.sql
  - el-templo-api/src/db/schema/exercise-milestone-proposals.ts
  - el-templo-api/src/db/schema/exercises.ts
  - el-templo-api/src/db/schema/index.ts
  - el-templo-api/src/modules/admin/proposal-service.ts
  - el-templo-api/src/modules/exercises/backbone-scope.ts
  - el-templo-api/src/modules/exercises/milestone-heuristic.ts
  - el-templo-api/src/modules/exercises/route-progression-map.ts
  - el-templo-api/src/modules/tree-editor/routes.ts
  - el-templo-api/src/modules/tree-editor/schemas.ts
  - el-templo-api/src/modules/tree-editor/service.ts
  - el-templo-api/src/modules/tree-progress/service.ts
  - el-templo-api/test/exercises/bootstrap-milestones.test.ts
  - el-templo-api/test/exercises/exercise-progression-service.test.ts
  - el-templo-api/test/exercises/milestone-heuristic.test.ts
  - el-templo-api/test/exercises/rebuild-progression-graph.test.ts
  - el-templo-api/test/migrations/0145-milestone-exercise-id.test.ts
  - el-templo-api/test/tree-editor/milestone-review.test.ts
  - el-templo-api/test/tree-editor/tree-editor.test.ts
  - el-templo-api/test/tree-progress/member-tree.test.ts
findings:
  critical: 1
  warning: 8
  info: 6
  total: 15
status: issues_found
---

# Phase 133: Code Review Report

**Reviewed:** 2026-06-07
**Depth:** standard
**Files Reviewed:** 37
**Status:** issues_found

## Summary

Reviewed the full phase-133 surface: migration 0145 + new proposals schema, the
deterministic milestone heuristic and the two bootstrap CLIs, the shared
backbone predicate and its raw-SQL mirror in the rebuild, the transactional
milestone-review endpoints (accept/reject/promote/variants/list), the
tree-progress member read, and the admin UI (difficulty bands, review drawer,
side panel, sub-groups, cross-route edges, levelColor DRY extraction).

Strong points verified against the project's known pitfalls: the migration has
no `;` inside comments and matches the Drizzle schema column-for-column
(including `mysqlEnum("status", ...)` physical name); no bare `${table.col}`
inside `sql\`\``selects (all raw SQL uses explicit`e.`/`r.` aliases); all
mutating review paths are genuinely transactional and the test suite proves
rollback, edge pruning in locked partitions, promote integrity and the
401/403 surface. The node-set consistency test (T-133-30) really does pin the
manual mirror. The levelColor extraction is clean (all 4 duplicates removed,
imports correct).

The findings below are real defects, mostly at invariant boundaries the happy
path doesn't exercise: the editor read orders auto partitions by `dl` while the
rebuild chains by `progression_step` (CR-01 — and this phase's own accept flow
is what starts populating steps, so the divergence goes live as profes review);
several write paths can break the hito/variante and backbone-edge invariants
that the accept endpoint carefully enforces.

## Critical Issues

### CR-01: Editor/canvas auto order ignores `progression_step` and contradicts the persisted auto chain

**File:** `el-templo-api/src/modules/tree-editor/service.ts:228-242, 435-443`
**Issue:** `buildEditableTree`'s own docblock (lines 277-279 and 418-420) says
non-overridden partitions are ordered "by progression_step then
dificultad_lineal then id (the auto order)". The code does not: `loadGraphNodes`
never selects `progressionStep`, and the auto branch of `orderNodes` sorts by
`dificultadLineal` then `exerciseId` only. The rebuild
(`rebuild-progression-graph.ts:258-268`) chains partitions by
`(progression_step, dl, id)`. Whenever step order ≠ dl order (exactly the
scenario test H of the rebuild suite pins: dl 9 at step 1 → dl 1 at step 2),
GET /tree and the /tree-map canvas render a chain that contradicts the
persisted `exercise_progressions` backbone that `getNeighbor` serves to
members. Until now `progression_step` had 0 populated rows so the two orders
coincided — but this phase's one-pass accept **writes** `progression_step`
(via `acceptInTransaction`), so as profes review, the divergence becomes live.
Worst case: a profe sees a "wrong" order on the canvas, drags to fix it, and
`reorderPartition` replaces a correct auto chain with a manual chain that locks
the partition — display bug converted into persistent data damage.
**Fix:**

```ts
// loadGraphNodes: add the column
progressionStep: schema.exercises.progressionStep,

// orderNodes, auto branch — mirror the rebuild's comparator:
return partNodes.slice().sort((a, b) => {
  if (
    a.progressionStep !== null &&
    b.progressionStep !== null &&
    a.progressionStep !== b.progressionStep
  ) {
    return a.progressionStep - b.progressionStep;
  }
  return (
    a.dificultadLineal - b.dificultadLineal || a.exerciseId - b.exerciseId
  );
});
```

Add a test seeding a partition where step order opposes dl order and assert
GET /tree returns the step order (the inverse of rebuild test H).

## Warnings

### WR-01: Accepting with a non-null `habilidad` override pushes an exercise off-backbone WITHOUT pruning its edges

**File:** `el-templo-api/src/modules/tree-editor/service.ts:923-933, 981-987`; `el-templo-api/src/modules/admin/proposal-service.ts:149-152`
**Issue:** `pruneDegradedVariantEdges` runs only when `role === 'variante'`.
But step (a) of `acceptMilestoneReview` can set `exercises.habilidad` to a
non-null value (proposal value or override) while `role === 'hito'` — the
exercise leaves the backbone via funnel condition 3 (`habilidad IS NULL`) yet
keeps all incident `exercise_progressions` edges. The same hole exists in the
standalone dimension accept (`acceptInTransaction` writes `habilidad` and never
touches edges). Consequences: `getNeighbor` keeps serving the now-off-backbone
exercise (membership in the player primitive is by persisted edges, as test G
of the progression suite documents — that test only passes because the
constructor never wired the variant; here the edges pre-exist); the rebuild's
DELETE is scoped to `from_exercise_id IN (unlockedNodeIds)` so it never cleans
edges whose from-node already left the node set; and `buildEditableTree`
reclassifies these stale edges as phantom "precedence" edges (off-graph
endpoint → precedence bucket, service.ts:299-326).
**Fix:** In `acceptMilestoneReview`, run the same bounded prune whenever the
final written `habilidad` transitions NULL → NOT NULL (not only for
role='variante'). For the standalone `ProposalService.accept` path, either
apply the same prune or document/guard that habilidad-setting accepts must go
through the tree-editor pass.

### WR-02: `reassignRoute` / `promoteToMilestone` can silently break the "variante same partition as its hito" invariant

**File:** `el-templo-api/src/modules/tree-editor/service.ts:731-848, 1079-1187`
**Issue:** `acceptMilestoneReview` enforces that a variante's hito lives in the
same `(route × effort)` partition (400 otherwise). But `reassignRoute` updates
`exercises.route` with no check on `milestone_exercise_id` in either direction:
moving a hito strands its variantes pointing at a hito in another route; the
UI even makes this easy (only backbone nodes are selectable, so hitos are the
natural drag target). `promoteToMilestone` also never validates partitions, so
once the invariant is broken, promote re-points the ex-hito's incident edges
to an exercise in a different route — manufacturing cross-route edges that no
profe authored and that the R4 UI then renders as "prerequisitos".
**Fix:** In `reassignRoute`, inside the transaction: (a) detect moved hitos
that have variantes (`milestone_exercise_id IN (moved ids)` among non-moved
rows) and either move the variantes along or reject with a typed 400 telling
the profe to resolve variantes first; (b) detect moved variantes whose hito
stays behind and null/reject likewise. In `promoteToMilestone`, validate the
variante and its hito still share `(route, effort)` before swapping (400 with
a "reasigná la ruta primero" message).

### WR-03: Accepting `role='hito'` on a truth-variante restores it to the backbone with zero edges and no re-chain

**File:** `el-templo-api/src/modules/tree-editor/service.ts:975-979`
**Issue:** Step (c) writes `milestoneExerciseId = null` unconditionally for
role='hito'. If the exercise was already a variante (truth set — e.g., a
bootstrap re-run created a fresh pending proposal for it, see WR-04, and the
profe accepts it as hito), it re-enters the backbone but: its neighbors were
re-chained around it at degrade time and nothing undoes that. In an UNLOCKED
partition the next rebuild repairs it; in a LOCKED partition the rebuild never
enters (D-02) and the manual chain never includes it — the node floats
disconnected forever (`getNeighbor` → null both directions, editor shows it as
a leftover appended by dl). The codebase's intended inverse is
`promoteToMilestone`, which DOES re-point edges — this accept path bypasses it.
**Fix:** In step (c), when role='hito' and the previous truth value was NOT
NULL, either reject with 400 ("usá promover a hito") or splice the node back
into its partition chain (insert between the dl/step neighbors, mirroring
`pruneDegradedVariantEdges` in reverse) inside the same transaction.

### WR-04: Bootstrap re-proposes exercises that are already truth-variantes (and can nominate a variante as a group milestone)

**File:** `el-templo-api/bootstrap-milestones.ts:61-76`
**Issue:** The candidate SELECT intentionally omits the
`milestone_exercise_id IS NULL` condition ("we are proposing it"). That is
correct for unclassified rows, but exercises classified AD-HOC from the side
panel (truth written, NO proposal row — the accept explicitly supports this,
service.ts step (e)) re-enter the scope on a re-run: (1) they get a fresh
`pending` proposal that re-opens an already-settled decision in the drawer —
accepting it as 'hito' silently un-degrades the variante (compounding WR-03);
(2) a truth-variante can WIN `moreCanonical` and be proposed as the milestone
of its group, so every other member's proposal points at a target the accept
endpoint will reject with 400 ("el hito destino es a su vez una variante"),
dead-ending the whole group in the drawer.
**Fix:** Add `AND e.milestone_exercise_id IS NULL` to the candidate scope in
`runBootstrapMilestones` (already-confirmed variantes are settled truth, not
candidates), and add a regression test: seed a truth-variante with no proposal
row, run the bootstrap, assert no proposal is created for it and that it never
appears as a `proposedMilestoneExerciseId` target.

### WR-05: Non-transitive sort comparator when `progression_step` mixes NULL and non-NULL in one partition

**File:** `el-templo-api/rebuild-progression-graph.ts:258-268`
**Issue:** The comparator only compares steps when BOTH are non-null, else
falls to dl. The inline comment claims a partition is "all-NULL or all-int",
but that is false: in token-strategy routes, `classify()` returns step=null
for unmatched names ("unknown", left pending) while accepted siblings get
ints — the schema comment on `progression_step` says exactly this ("NULL …
para ejercicios sin escalón resuelto"). With a mix, the comparator is
non-transitive (e.g., a(step1,dl9), b(step2,dl1), c(null,dl5): a<b by step,
b<c by dl, c<a by dl — a cycle), so `Array.sort` produces an
implementation-defined order and the chain can interleave pending rows
incoherently between stepped ones.
**Fix:** Make the order total — e.g., treat NULL as +Infinity (pending rows
sink to the chain tail) or partition NULL/non-NULL explicitly:

```ts
const stepOf = (n: ExerciseNode) =>
  n.progressionStep === null ? Number.POSITIVE_INFINITY : n.progressionStep;
bucket.sort((a, b) => stepOf(a) - stepOf(b) || a.dl - b.dl || a.id - b.id);
```

Mirror the same rule in the CR-01 fix so editor and rebuild agree.

### WR-06: Milestone heuristic classifies on `name` only, breaking the `position || name` convention

**File:** `el-templo-api/src/modules/exercises/milestone-heuristic.ts:165`; `el-templo-api/bootstrap-milestones.ts:62-76`
**Issue:** `classify()`'s contract (route-progression-map.ts:407-419) states
"The bootstrap calls this with `position || name`" — the dimension bootstrap
derives steps from the `position` column first because that's where the
catalog stores step tokens for several routes (the FL/PL note even says "Pocos
datos en position"→pending, i.e., position is the primary carrier). The
milestone bootstrap SELECTs only `e.exercise AS name` and the engine calls
`classify(row.name, row.route)`, so any exercise whose step token lives only
in `position` gets step=null and is mis-grouped into the `"none"` step bucket
of its movement — distorting group composition and milestone selection for
exactly the long partitions this phase targets.
**Fix:** Add `e.position` to the bootstrap SELECT, extend `CatalogRow` with
`position: string | null`, and classify with
`classify(row.position && row.position.trim() !== "" ? row.position : row.name, row.route)`
— or better, expose a shared `classifyInput(position, name)` helper so both
bootstraps use one rule.

### WR-07: Duplicate Vue Flow node ids and broken reorder when a route's nodes span multiple categories

**File:** `el-templo-admin/src/pages/TreeMapPage.vue:198-206, 299-313`; `el-templo-api/src/modules/tree-editor/service.ts:343-395`
**Issue:** `buildEditableTree` buckets per-NODE via `patternToCategory`, so a
route whose exercises carry different patterns appears under MULTIPLE
categories, each copy holding only that category's subset of the partition.
Nothing in the schema prevents mixed patterns per route, and `/regroup` makes
it trivial to create (move a PUSH-pattern exercise into a PULL route). The
page then: (1) emits two nodes with the same id `route-${code}` (and duplicate
`start-${code}` edge ids when both are expanded) — undefined Vue Flow behavior;
(2) `findChainOf` (line 198) returns the FIRST category's partial partition, so
a drag-reorder posts an id set smaller than the real `(route × effort)`
partition and `reorderPartition` rejects with 400 ("no coincide con el
conjunto de nodos") — the profe gets an unexplained error.
**Fix:** Either make the backend group a route under its own dominant category
(one route → one category, it already computes `categoryVotes`), or namespace
the frontend ids (`route-${cat.key}-${rt.route}`) AND make `findChainOf`
aggregate the partition across all categories before reordering. The backend
change is smaller and removes the class of bugs.

### WR-08: `bulkAccept` violates its documented contract — one failure aborts the loop and loses the count

**File:** `el-templo-api/src/modules/admin/proposal-service.ts:256-266`
**Issue:** The docblock promises "Each accept runs its own transaction (one
bad proposal does not roll back the others). Returns the count successfully
accepted." The loop has no try/catch: the first throwing `accept(id)` aborts
the remaining ids AND the partial `acceptedCount` is lost (the function
throws). The /tree-map "Aceptar todas" flow consumes this (TreeMapPage.vue
`bulkAcceptRoute`): on a partial failure the user sees only the generic error,
never how many dimension-only proposals actually landed.
**Fix:**

```ts
for (const id of ids) {
  try {
    await this.accept(id, overridesById?.[id]);
    acceptedCount += 1;
  } catch (err: unknown) {
    // log + continue: one bad proposal must not block the rest (docblock contract)
  }
}
return acceptedCount;
```

(or change the docblock and make the caller send ids one-by-one — but the
current state where doc and behavior disagree is the bug).

## Info

### IN-01: `setPrecedenceEdge` add has a check-then-insert race

**File:** `el-templo-api/src/modules/tree-editor/service.ts:681-700`
**Issue:** SELECT-then-INSERT outside a transaction: two concurrent adds of the
same edge → the second hits UNIQUE(from,to) and surfaces as 500 instead of the
documented idempotent 200.
**Fix:** Use `INSERT IGNORE`/`ON DUPLICATE KEY UPDATE id=id`, or catch the
duplicate-key error and return `{ ok: true, edgesWritten: 0, edgesDeleted: 0 }`.

### IN-02: Review drawer race when switching routes quickly

**File:** `el-templo-admin/src/pages/TreeMapPage.vue:694-717`
**Issue:** `loadMilestoneReview(code)` does not verify `reviewRoute.value ===
code` before assigning `milestoneRows.value`; clicking route A's badge then
route B's lets A's slower response overwrite B's rows.
**Fix:** Guard the assignment: `if (reviewRoute.value === code) milestoneRows.value = ...`.

### IN-03: Accepted milestone proposal rows are not updated with the profe's final decision

**File:** `el-templo-api/src/modules/tree-editor/service.ts:990-998`
**Issue:** Step (e) flips status to `accepted` but leaves
`proposed_milestone_exercise_id` as the heuristic's value even when the profe
toggled role or chose a different hito — the audit trail records an "accepted"
proposal whose content was not what was accepted. The truth column is correct;
only auditability suffers.
**Fix:** Also write the final `proposedMilestoneExerciseId` (the truth value)
when flipping, or add a comment stating the proposals table is not an audit
log post-accept.

### IN-04: Side panel shows stale `stepIndex`/`orderSource` after a move

**File:** `el-templo-admin/src/pages/TreeMapPage.vue:517-543, 1454-1467`
**Issue:** After `moveSelected` → `loadTree()`, `selectedExercise` still points
at the pre-move `ExerciseNodeData` object: the panel keeps showing the old
"escalón N" and Auto/Manual badge until the user re-clicks the node.
**Fix:** After `loadTree()`, re-resolve `selectedExercise` from the rebuilt
`nodes` by `exerciseId` (or clear it).

### IN-05: Backbone-scope docblock/mirror nits

**File:** `el-templo-api/src/modules/exercises/backbone-scope.ts:29`; `el-templo-api/rebuild-progression-graph.ts:178-198`
**Issue:** (a) The usage note says "condition 4 references routes.\*" — it is
condition 5. (b) `readManualEdgePartitions` mirrors four of the five funnel
conditions but not `routes.excluded_from_tree`; harmless today (an excluded
route has no backbone nodes to lock) but the asymmetry is undocumented and the
consistency test does not cover the locked-partition read.
**Fix:** Correct the comment; document the deliberate omission (or add the
join) in `readManualEdgePartitions`.

### IN-06: Bootstrap test runs over the whole per-worker catalog and only cleans its own rows

**File:** `el-templo-api/test/exercises/bootstrap-milestones.test.ts:116-134`
**Issue:** `runBootstrapMilestones` inserts pending proposals for EVERY
in-scope exercise present in the worker DB at run time, but `afterEach` deletes
only proposals for `seededIds`. If another suite in the same worker leaves
catalog exercises behind, this test pollutes `exercise_milestone_proposals`
for them (mitigated today because the review/editor suites wipe the table in
`beforeEach`, but the coupling is implicit).
**Fix:** Capture the pre-run proposal id max and delete everything above it in
`afterEach`, or wipe the proposals table like the milestone-review suite does.

---

_Reviewed: 2026-06-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
