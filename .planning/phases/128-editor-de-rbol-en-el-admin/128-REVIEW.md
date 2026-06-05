---
phase: 128-editor-de-rbol-en-el-admin
reviewed: 2026-06-05T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - el-templo-api/rebuild-progression-graph.ts
  - el-templo-api/src/modules/tree-editor/service.ts
  - el-templo-api/src/modules/tree-editor/routes.ts
  - el-templo-api/src/modules/tree-editor/schemas.ts
  - el-templo-api/src/modules/tree-editor/index.ts
  - el-templo-api/src/plugins/tree-editor.ts
  - el-templo-api/test/exercises/rebuild-progression-graph.test.ts
  - el-templo-api/test/tree-editor/tree-editor.test.ts
  - el-templo-admin/src/composables/useTreeEditorApi.ts
  - el-templo-admin/src/types/tree-editor.ts
  - el-templo-admin/src/router/routes.ts
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: clean
fix_iteration: 1
fixed:
  - WR-01
  - WR-03
  - WR-04
closed_by_other:
  - WR-02 # closed by WR-01 (same-partition precedence edge now rejected)
info_accepted:
  - IN-01
  - IN-02
  - IN-03
  - IN-04
---

# Phase 128: Code Review Report

**Reviewed:** 2026-06-05
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 128 ships the locked-partition guard in the (formerly 126) rebuild constructor plus a new admin/coach tree-editor module (service + routes + schemas + plugin) and the admin UI. The backend is the load-bearing part and was reviewed in depth.

The work is, on the whole, careful: no `any`, Drizzle-parameterized queries (no SQL injection surface), partition/id-scoped deletes wrapped in transactions, the `source` column name is used consistently with no enum drift, and authorization is correctly gated through a plugin-level `onRequest` guard (member → 403, no token → 401, both asserted).

However, the central abstraction of the milestone — "a same-partition manual edge LOCKS a partition" — is **derived from edge data that the editor itself does not constrain to match that intent**. The `precedence` endpoint can write a `manual` edge whose two endpoints sit in the _same_ partition, which the lock-derivation logic in BOTH the rebuild constructor and `buildEditableTree` will then misread as a full manual-chain override. This is the most consequential finding (WR-01) and undermines the D-02/D-04 boundary the whole design rests on. It is classified WARNING rather than BLOCKER because it requires a profe to deliberately add an intra-partition precedence edge and does not corrupt member data or escalate privilege — but it can silently freeze a partition's auto backbone and produce a malformed "chain."

No Critical issues were found.

## Warnings

### WR-01: `setPrecedenceEdge(add)` can write a same-partition manual edge that silently locks/overrides the partition

**File:** `el-templo-api/src/modules/tree-editor/service.ts:505-550`
**Issue:**
The whole D-02/D-04 boundary is: a _same-partition_ manual edge = a chain rewrite that LOCKS the partition; a _cross-partition_ manual edge = a precedence/branch edge that locks nothing. `reorderPartition` produces the former, `setPrecedenceEdge` is supposed to produce only the latter (D-04).

But `setPrecedenceEdge('add')` validates only that both ids are in-graph nodes and that `from !== to`. It does NOT verify the two endpoints live in _different_ partitions. A profe (or the admin UI's "Precedencia" dialog, which lets you pick any two exercises) can therefore add a `manual` edge between two nodes inside the same `(subfamily × effort)` partition.

Once such a row exists, both lock-derivation sites treat it as a same-partition manual chain:

- `rebuild-progression-graph.ts:185-203` (`readManualEdgePartitions`) returns that partition as LOCKED → the rebuild stops regenerating the auto backbone for an entire partition the profe never meant to override.
- `service.ts:236-250` (`buildEditableTree`) flags the partition `overridden:true` and then walks `manualChainNext` as if it were a full chain — with a single edge and no other manual links it produces a degenerate "manual chain" plus dl/id leftovers (the `orderNodes` fallback at lines 352-361), so the displayed order silently diverges from both the auto order and any coherent manual order.

This is a correctness + data-integrity defect in the load-bearing abstraction of the milestone. The integration test only ever exercises `precedence` with a _cross-partition_ pair (`a5 → b1`), so this path is untested.

**Fix:** In `setPrecedenceEdge('add')`, after resolving both nodes, reject (or explicitly route through the reorder path) when both endpoints share `(subfamilyId, effort)`:

```ts
const fromNode = nodes.find((n) => n.exerciseId === fromExerciseId)!;
const toNode = nodes.find((n) => n.exerciseId === toExerciseId)!;
if (
  fromNode.subfamilyId === toNode.subfamilyId &&
  fromNode.effort === toNode.effort
) {
  throw new TreeEditorError(
    "Una arista de precedencia debe cruzar particiones; " +
      "use reordenar para cambiar el orden dentro de una particion",
  );
}
```

Add a test asserting a same-partition `add` returns 400 and does NOT lock the partition.

### WR-02: `getNeighbor` ambiguity when a same-partition manual edge coexists with the auto backbone

**File:** `el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts:124-193` (consumer of edges written here)
**Issue:**
This is the downstream consequence of WR-01 for the _unlocked_ case. `getNeighbor` reads BOTH `auto` and `manual` edges (line 122-137) and, when multiple candidates exist in a direction, picks "closest by dl, then smallest id" (lines 187-193). The phase doc claims the auto backbone has at most one neighbor per direction, so the multi-candidate path is "128 manual cross-edges."

If WR-01 is not fixed, a same-partition manual edge added via `precedence` adds a _second_ in-partition neighbor that did not come from a chain rewrite. Because it is same-partition and same-effort, it survives the effort filter (line 163) and competes with the auto backbone edge. The in-session adjustment can then jump to a non-adjacent node (e.g. dl 1 → dl 5 directly) that the profe never intended as a progression step, because the "closest by dl" tiebreak only kicks in among the candidate edges that exist — it does not re-derive adjacency.

**Fix:** Fixing WR-01 (rejecting same-partition precedence edges) closes this. Independently, consider documenting/asserting in `getNeighbor` that same-partition multi-candidate sets are not expected, and add a regression test for the in-session primitive over a partition that owns a manual chain.

### WR-03: `buildEditableTree` silently drops nodes whose `pattern` maps to a category outside `CATEGORY_ORDER`

**File:** `el-templo-api/src/modules/tree-editor/service.ts:281-301`
**Issue:**
For each node, `const category = patternToCategory(node.pattern)` then `const subfamilies = byCategory.get(category); if (!subfamilies) continue;`. `byCategory` is pre-seeded only for `CATEGORY_ORDER` (line 270-271). If `patternToCategory` can ever return a `Category` value not present in `CATEGORY_ORDER` (or a fallback category that was not seeded), the node is silently dropped from the editable tree — the profe never sees it and cannot edit it, with no warning logged (the `warn` at 274-280 only fires for _unmapped patterns_, not for a mapped-but-unseeded category).

This is likely safe today if `patternToCategory` is total over `CATEGORY_ORDER`, but it is a silent-data-loss-in-the-view trap: a future category-map change drops exercises with no signal.

**Fix:** Either assert the invariant or log when a node's category is missing from the seeded map:

```ts
const subfamilies = byCategory.get(category);
if (!subfamilies) {
  this.log?.warn(
    { pattern: node.pattern, category, exerciseId: node.exerciseId },
    "tree-editor: node category absent from CATEGORY_ORDER — node hidden",
  );
  continue;
}
```

### WR-04: `reorderPartition` accepts (and locks) a single-node partition, writing zero edges but leaving the partition flagged `overridden`

**File:** `el-templo-api/src/modules/tree-editor/service.ts:412-495`
**Issue:**
For a partition with exactly one node, a valid reorder request (`orderedExerciseIds:[onlyId]`) passes all validation, the delete loop deletes nothing, and the insert loop (`i < length - 1`) writes zero edges. Result: `{ ok:true, edgesWritten:0, edgesDeleted:0 }` and NO manual edge exists. The partition therefore is NOT locked (correct, since no manual edge), yet the profe believes they have "overridden" it. More subtly, the inverse also holds: there is no way for a profe to lock/override a single-node partition (there is nothing to chain), so the UI's "overridden" badge will never light up for it even after a reorder — a confusing no-op.

This is not data corruption, but it is a silent no-op that returns success and will confuse the UI's auto/manual badge logic for single-node partitions.

**Fix:** Either reject a reorder of a single-node partition with a clear message ("la particion tiene un solo nodo, nada que reordenar"), or document that single-node partitions cannot be overridden. Prefer the explicit rejection so the UI can disable reorder controls for such partitions.

## Info

### IN-01: `loadAllEdges` casts `r.source as EdgeSource` without validating against the enum set

**File:** `el-templo-api/src/modules/tree-editor/service.ts:194-198`
**Issue:** `source: r.source as EdgeSource` trusts the DB enum. It is in practice safe (the column is a MySQL ENUM constrained to `auto|manual`), and `getNeighbor`/rebuild make the same assumption, so this is informational. The narrowing helpers in `rebuild-progression-graph.ts` are stricter (they validate). Consider a small guard for consistency, but not required.

### IN-02: `reorderPartition` and `setPrecedenceEdge` re-`loadGraphNodes()` (full graph scan) on every mutation

**File:** `el-templo-api/src/modules/tree-editor/service.ts:423, 514`
**Issue:** Each mutation loads the entire DAG node set to validate a handful of ids. Out of scope for v1 (performance), noted only because the catalog could grow; a targeted `SELECT ... WHERE id IN (...)` validation would be cheaper. No correctness impact.

### IN-03: `reassignSubfamily` issues two separate incident-edge SELECTs that could be one OR query

**File:** `el-templo-api/src/modules/tree-editor/service.ts:633-657`
**Issue:** `incident` (from IN moved) and `incidentTo` (to IN moved) are two queries merged via a Map. A single `where(or(inArray(from, ids), inArray(to, ids)))` would be equivalent and is the pattern already used in the rebuild test (`import { ... or } from "drizzle-orm"`). Purely a tidiness note; the current code is correct.

### IN-04: Plugin-level guard duplicated as inline `onRequest` rather than reusing a shared role-guard helper

**File:** `el-templo-api/src/modules/tree-editor/routes.ts:31-38`
**Issue:** The authenticate-then-role-check hook is copied from `admin/routes.ts`. It is correct and the dependency on the `auth` plugin is declared. A shared `requireRoles(TRAINING_ROLES)` hook factory would DRY this across modules (CLAUDE.md flags repetition aggressively), but this is a pre-existing pattern, not introduced here. Informational.

---

## Fix Resolution (iteration 1, 2026-06-05)

All warnings resolved on branch `staging` (atomic commits, not pushed):

- **WR-01** — FIXED (`6028bc7b`). `setPrecedenceEdge('add')` now rejects a
  same-partition `(subfamily × effort)` edge with a 400; integration test
  asserts the rejection writes nothing.
- **WR-02** — CLOSED by WR-01. With same-partition precedence edges rejected, no
  manual edge can coexist with the auto backbone inside a partition, so the
  `getNeighbor` multi-candidate ambiguity for same-partition sets cannot arise
  via the editor. (The independent `getNeighbor` assertion/regression test
  suggested in WR-02 is downstream of phase 128 and left as an Info-level
  follow-up.)
- **WR-03** — FIXED (`ff22c380`). `buildEditableTree` routes a node whose mapped
  category is absent from `CATEGORY_ORDER` into `FALLBACK_CATEGORY` and warns,
  instead of silently dropping it. No in-scope node disappears from the view.
- **WR-04** — FIXED (`4605092a`). A single-node-partition reorder returns an
  explicit `{ singleNode: true, message }` no-op and touches nothing (no
  half-locked state); fields added to `mutationResultSchema`; integration test
  added.

**Info items IN-01..IN-04 accepted as-is** (no action): all are correctness-safe
tidiness/perf notes on pre-existing patterns (DB-enum trust, full-graph reload
on mutation, two-query incident lookup, inline role-guard duplication). Tracked
for a future DRY/perf pass, not blocking phase 128.

Local gate `pnpm tsc --noEmit` (api) exits 0. Vitest runs in CI per project
policy (not locally).

---

_Reviewed: 2026-06-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
