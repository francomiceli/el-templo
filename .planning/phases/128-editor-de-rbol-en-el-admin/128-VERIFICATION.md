---
phase: 128-editor-de-rbol-en-el-admin
verified: 2026-06-05T00:00:00Z
status: human_needed
score: 9/9
overrides_applied: 0
human_verification:
  - test: "Sidebar visibility by role"
    expected: "'Editor de árbol' appears in the training block for coach/owner; it is absent for member, gestion, and recepcion roles."
    why_human: "Client-side route guard and sidebar v-if can only be confirmed by logging in with each role and observing the rendered nav."
  - test: "Reorder persistence + Manual badge"
    expected: "Moving a node up/down with the arrow buttons POSTs reorder; after reload the partition shows 'Manual' badge and the new order is preserved."
    why_human: "Requires a live API + admin app; the correct POST is fired and the subsequent GET reflects the change."
  - test: "Precedence add/remove"
    expected: "Opening the Precedencia dialog, selecting two cross-partition nodes, and adding shows the edge as 'Manual' in the cross-edges panel; removing it makes it disappear."
    why_human: "End-to-end UI flow through dialog; requires a live API."
  - test: "Reagrupar dialog"
    expected: "Moving an exercise to another subfamily re-buckets it in the tree on reload; the orphaned incident edge is pruned."
    why_human: "End-to-end UI flow through dialog; requires a live API."
  - test: "Brand palette and layout"
    expected: "No blue, no hardcoded hex; only warm named color tokens (primary/secondary/grey-*/positive/negative/info). No broken layout."
    why_human: "Visual inspection only."
---

# Phase 128: Editor de árbol en el admin — Verification Report

**Phase Goal:** Los profes pueden ajustar el árbol auto-construido (reordenar ejercicios, agrupar/separar sub-familias, ajustar precedencias) desde una sección nueva del admin; los cambios persisten y prevalecen sobre el orden auto del SPOM y sobreviven a una reconstrucción del grafo.
**Verified:** 2026-06-05
**Status:** human_needed — all automated checks VERIFIED; 5 human UAT items remain (visual/live-app behavior)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                   | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | D-02 locked-partition guard: a `(subfamily×effort)` partition owning a same-partition `manual` edge is NOT regenerated (no auto delete, no auto insert) | VERIFIED | `readManualEdgePartitions()` at lines 185-202 of `rebuild-progression-graph.ts` joins both endpoints and filters to same `subfamily_id AND effort`; `buildBackboneEdges` skips locked keys; scoped DELETE excludes locked node ids                                                                                                                                              |
| 2   | Unlocked partitions still regenerate their full auto backbone on rebuild                                                                                | VERIFIED | Unlocked nodes list built at line 120-122; scoped `DELETE WHERE source='auto' AND from_exercise_id IN (<unlocked>)` + INSERT loop runs for them                                                                                                                                                                                                                                 |
| 3   | Manual edges in a locked partition survive a rebuild byte-for-byte                                                                                      | VERIFIED | Locked partitions never appear in the unlocked-node IN-list; no delete or insert touches them                                                                                                                                                                                                                                                                                   |
| 4   | Rebuild idempotency for unlocked partitions preserved                                                                                                   | VERIFIED | UNIQUE(from,to) on `exercise_progressions` prevents duplicates; scoped delete+reinsert converges                                                                                                                                                                                                                                                                                |
| 5   | Dedicated integration test for the locked-partition guard exists                                                                                        | VERIFIED | Test `"locked partition — a (subfamily×effort) partition with a manual edge is NOT regenerated; untouched partitions still regenerate (D-02)"` at line 296 of `rebuild-progression-graph.test.ts`; asserts exact edge sets for both X (manual, locked) and Y (auto, unlocked), plus a second-run regression                                                                     |
| 6   | Admin/coach-scoped endpoints exist (`/api/admin/tree-editor/tree`, `/reorder`, `/precedence`, `/regroup`); member token → 403, no token → 401           | VERIFIED | Plugin-level `onRequest` hook in `routes.ts:31-38` authenticates then rejects non-`TRAINING_ROLES`; test at line 213 asserts member→403 on all 4 routes; test at line 188 asserts 401 on all 4 routes                                                                                                                                                                           |
| 7   | `setPrecedenceEdge('add')` rejects a same-partition edge (WR-01 post-review fix)                                                                        | VERIFIED | Lines 579-586 of `service.ts` check `fromNode.subfamilyId === toNode.subfamilyId && fromNode.effort === toNode.effort` and throw 400; test at line 477 of `tree-editor.test.ts` asserts 400 AND verifies no edge was written                                                                                                                                                    |
| 8   | Reorder/precedence/regroup persist `source='manual'`; no new table/column/migration (D-01)                                                              | VERIFIED | `reorderPartition` inserts with `source: "manual"` (line 524); `setPrecedenceEdge` inserts with `source: "manual"` (line 602-606); reassign does a data UPDATE of `exercises.subfamily_id` only; no schema file touched                                                                                                                                                         |
| 9   | Admin "Editor de árbol" section exists in the admin app, is reachable from coach/owner nav, and consumes the endpoints                                  | VERIFIED | `routes.ts` line 46-49: child route `tree-editor` with `allowedRoles: ['coach','owner']`; `AdminLayout.vue` line 49-54: `<q-item to="/tree-editor">` inside `v-if="isCoachRole"` block; `useTreeEditorApi.ts` calls `/admin/tree-editor/tree`, `/reorder`, `/precedence`, `/regroup`; `TreeEditorPage.vue` consumes the composable exclusively (526 LOC, no direct `api` calls) |

**Score: 9/9 truths verified (automated)**

---

### Required Artifacts

| Artifact                                                         | Expected                                                                           | Status   | Details                                                                                                                                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/rebuild-progression-graph.ts`                     | Locked-partition guard: skip auto regeneration for partitions owning a manual edge | VERIFIED | 340 lines; `readManualEdgePartitions`, `buildBackboneEdges(nodes, lockedPartitions)`, scoped delete all present                                                                  |
| `el-templo-api/test/exercises/rebuild-progression-graph.test.ts` | Dedicated integration test for D-02 with "locked" in its name                      | VERIFIED | Test at line 296 named "locked partition —…"; asserts exact edge sets + idempotency regression                                                                                   |
| `el-templo-api/src/modules/tree-editor/service.ts`               | `buildEditableTree / reorderPartition / setPrecedenceEdge / reassignSubfamily`     | VERIFIED | 741 lines; all four methods present and substantive                                                                                                                              |
| `el-templo-api/src/modules/tree-editor/routes.ts`                | 4 routes + `TRAINING_ROLES` guard                                                  | VERIFIED | `TRAINING_ROLES` referenced at line 33; 4 routes registered (GET /tree, POST /reorder, POST /precedence, POST /regroup)                                                          |
| `el-templo-api/src/plugins/tree-editor.ts`                       | Fastify plugin registering routes under `/api/admin/tree-editor`                   | VERIFIED | `fp` plugin with `dependencies ['database','auth']`; prefix `/api/admin/tree-editor`                                                                                             |
| `el-templo-api/test/tree-editor/tree-editor.test.ts`             | Integration tests: read, reorder, precedence, regroup, auth 403/401, bad-id 4xx    | VERIFIED | 588 lines; full coverage including WR-01 same-partition rejection test                                                                                                           |
| `el-templo-admin/src/composables/useTreeEditorApi.ts`            | Composable calling `/admin/tree-editor/*`                                          | VERIFIED | Calls all 4 endpoints; `createLogger` used; `cleanup()` exposed; no `onUnmounted` inside; no `console.log`                                                                       |
| `el-templo-admin/src/pages/TreeEditorPage.vue`                   | Editable tree view with up/down reorder, auto/manual badges, precedence + regroup  | VERIFIED | 526 lines; `q-expansion-item` hierarchy; `keyboard_arrow_up/down` buttons; `q-badge` per partition/node/edge; Precedencia dialog (`setPrecedence`); Reagrupar dialog (`regroup`) |
| `el-templo-admin/src/router/routes.ts`                           | Route `/tree-editor` gated `allowedRoles ['coach','owner']`                        | VERIFIED | Lines 46-49                                                                                                                                                                      |
| `el-templo-admin/src/types/tree-editor.ts`                       | TS types mirroring DTO contract                                                    | VERIFIED | 82 lines; `EditableTree`, `TreePartition`, `TreeNode`, `PrecedenceEdge`, `ReorderBody`, `PrecedenceBody`, `RegroupBody`, `MutationResult` — no `any`                             |

---

### Key Link Verification

| From                                      | To                                        | Via                                                                              | Status   | Details                                                                                               |
| ----------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| `rebuild-progression-graph.ts` WRITE step | `exercise_progressions (source='manual')` | `readManualEdgePartitions` pre-read → lock set → scoped delete + skip            | VERIFIED | `source = 'manual'` literal at line 193 of query; `lockedPartitions` Set gates both delete and insert |
| `tree-editor/routes.ts`                   | `TRAINING_ROLES` guard                    | plugin `onRequest` hook (authenticate + role check)                              | VERIFIED | `TRAINING_ROLES` at line 33; `request.user.role` checked against it                                   |
| `tree-editor/service.ts reorderPartition` | `exercise_progressions (source='manual')` | delete partition auto+manual edges + insert manual chain                         | VERIFIED | `source: "manual"` in insert at line 524; scoped delete uses both-endpoints-in-partition IN-list      |
| `el-templo-api/src/app.ts`                | `tree-editor plugin`                      | `app.register(treeEditorPlugin)`                                                 | VERIFIED | Line 120 of `app.ts`                                                                                  |
| `TreeEditorPage.vue`                      | `useTreeEditorApi`                        | composable methods (`fetchTree`, `reorderPartition`, `setPrecedence`, `regroup`) | VERIFIED | `useTreeEditorApi()` called in `<script setup>`; all mutations route through the composable           |
| `useTreeEditorApi.ts`                     | `/api/admin/tree-editor/*`                | axios `api` instance                                                             | VERIFIED | All four calls use `api.get`/`api.post` with the correct paths                                        |
| `AdminLayout.vue`                         | `/tree-editor` route                      | `<q-item to="/tree-editor">` inside `isCoachRole` block                          | VERIFIED | Lines 49-54 of `AdminLayout.vue`                                                                      |

---

### Data-Flow Trace (Level 4)

| Artifact             | Data Variable                   | Source                                                                                                                                                          | Produces Real Data                                                          | Status  |
| -------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------- |
| `TreeEditorPage.vue` | `categories`, `precedenceEdges` | `fetchTree()` → `GET /api/admin/tree-editor/tree` → `buildEditableTree()` → Drizzle SELECT from `exercises` JOIN `exerciseSubfamilies` + `exerciseProgressions` | Yes — DB queries present in `service.ts:154-193` and `loadAllEdges:196-208` | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for the backend endpoints — integration suite runs in CI against MySQL, not locally (project policy). Local gate is `tsc`, confirmed clean per SUMMARY/REVIEW reports. Frontend build confirmed by executor (`pnpm run build` succeeded per 128-03-SUMMARY).

---

### Probe Execution

No probe scripts declared or conventionally present for this phase. SKIPPED.

---

### Requirements Coverage

| Requirement | Source Plan            | Description                                                                                                                                                          | Status    | Evidence                                                                                                             |
| ----------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| TREE-07     | 128-01, 128-02, 128-03 | Los profes editan el árbol desde una sección nueva del admin: reordenan ejercicios, agrupan/separan sub-familias y ajustan precedencias sobre el grafo ya construido | SATISFIED | All three plans executed: rebuild guard (D-02), backend editor endpoints (D-03/D-04/D-05), admin UI page + nav entry |

---

### Anti-Patterns Found

| File                           | Line         | Pattern       | Severity | Impact                                                                                                                                                     |
| ------------------------------ | ------------ | ------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rebuild-progression-graph.ts` | 124-133, 163 | `console.log` | INFO     | Acceptable: this is a standalone CLI maintenance tool explicitly exempted in the file header and CLAUDE.md; the server and frontend use structured logging |

No `TBD`, `FIXME`, or `XXX` markers found in any file modified by this phase. No stubs, no placeholder returns, no hardcoded empty data that flows to user-visible output.

---

### Human Verification Required

#### 1. Sidebar visibility by role

**Test:** Log into the admin app as coach/owner and confirm "Editor de árbol" appears in the Entrenamiento training block. Then log in as a member, gestion, or recepcion role and confirm the entry is absent and the route is unreachable.
**Expected:** Only coach/owner sees the sidebar entry; all other roles are excluded by the `isCoachRole` guard.
**Why human:** Client-side `v-if` rendering and route meta guard require a live session per role to observe.

#### 2. Reorder persistence and Manual badge

**Test:** Expand a category → subfamily → effort partition with at least two nodes. Click the down arrow on the first node. Reload the page.
**Expected:** The partition now shows a "Manual" badge (primary color) instead of "Auto" (grey); the new node order is preserved after reload.
**Why human:** End-to-end: requires a live API serving real data, a live admin app, and visual confirmation of badge/order.

#### 3. Precedence add and remove

**Test:** Open the Precedencia dialog for any partition, select a node from a different subfamily as destination, and submit. Confirm the cross-edge appears in the "Precedencias entre ramas" panel tagged "Manual". Then use the per-edge remove button and confirm the edge disappears.
**Expected:** Add → manual edge appears; remove → it disappears.
**Why human:** Dialog UX and conditional rendering of the remove button (only for `source==='manual'` edges) require live interaction.

#### 4. Reagrupar dialog

**Test:** Open the Reagrupar dialog for an exercise in partition A, select a different subfamily as the target, submit. Reload the page.
**Expected:** The exercise no longer appears in its original partition; it appears in the target subfamily. Any incident edge that crossed the new partition boundary is gone.
**Why human:** Requires a live API and visual confirmation that the tree re-buckets correctly.

#### 5. Brand palette and layout

**Test:** Navigate through all states of the Editor de árbol page (loading, populated, dialogs open). Inspect for any blue tones or hardcoded hex colors.
**Expected:** Only warm palette tokens (primary/secondary/grey-\*/positive/negative/info); no blue, no hardcoded hex; layout not broken on typical admin viewport.
**Why human:** Visual inspection only; grep for hardcoded hex passed the code but visual appearance requires rendering.

---

### Gaps Summary

No automated gaps. All 9 observable truths are VERIFIED by source inspection:

- D-02 locked-partition guard is present and correctly scoped in `rebuild-progression-graph.ts`, with a dedicated integration test encoding the exact contract (locked partition keeps manual edges + zero auto edges; unlocked partition regenerates; second-run idempotency).
- The same-partition precedence rejection (post-review fix WR-01, commit `6028bc7b`) is in `service.ts:579-586` and covered by a test.
- All four `/api/admin/tree-editor/*` endpoints are coach/owner-gated (`TRAINING_ROLES` plugin hook), persist `source='manual'` correctly, and are covered by integration tests (member→403, no-token→401, bad-id→4xx).
- The admin UI section (`TreeEditorPage.vue`) is wired to the composable, reachable at `/tree-editor` with `allowedRoles: ['coach','owner']`, and included in the `isCoachRole` sidebar block.
- No new DB columns, no migrations, no `any`, no debt markers.

The 5 remaining items are all **visual / live-app behaviors** that cannot be verified by grep or static analysis: sidebar rendering by role, reorder/badge persistence on reload, dialog flows for precedence and regroup, and brand palette correctness.

---

_Verified: 2026-06-05_
_Verifier: Claude (gsd-verifier)_
