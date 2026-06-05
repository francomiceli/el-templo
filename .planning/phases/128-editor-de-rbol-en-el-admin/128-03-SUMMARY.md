---
phase: 128-editor-de-rbol-en-el-admin
plan: 03
subsystem: tree-editor (v5.1 skill-tree admin UI)
tags: [admin-ui, quasar, vue3, tree-07, manual-override, coach-only]
requires:
  - "Phase 128 Plan 02: /api/admin/tree-editor endpoints + editable-tree DTO contract"
provides:
  - "Admin 'Editor de árbol' page (TreeEditorPage.vue) — expandable tree, up/down reorder, auto/manual badges, precedence + regroup dialogs"
  - "useTreeEditorApi composable (fetchTree/reorderPartition/setPrecedence/regroup) + tree-editor.ts types"
  - "Route /tree-editor + sidebar link gated to coach/owner"
affects:
  - "Closes TREE-07 end-to-end: profe-facing surface that refines the auto-built tree"
tech-stack:
  added: []
  patterns:
    - "Pinia-free page using a composable (useTreeEditorApi) for all I/O (mirrors useProposalsApi)"
    - "Composable exposes cleanup(), no onUnmounted inside; the page's onUnmounted calls cleanup() (CLAUDE.md)"
    - "Refetch-on-success after every mutation (robust over optimistic) for consistency"
    - "Warm-palette named color tokens only (primary/secondary/grey/positive/negative/info) — no blue, no hardcoded hex"
key-files:
  created:
    - "el-templo-admin/src/types/tree-editor.ts"
    - "el-templo-admin/src/composables/useTreeEditorApi.ts"
    - "el-templo-admin/src/pages/TreeEditorPage.vue"
  modified:
    - "el-templo-admin/src/router/routes.ts"
    - "el-templo-admin/src/layouts/AdminLayout.vue"
decisions:
  - "Up/down reorder buttons (not drag-and-drop) per plan — simple + robust; refetch after each reorder so the Manual badge + new order reflect server truth"
  - "Auto vs Manual badged in three places: per partition (overridden), per node (orderSource), per cross-edge (source)"
  - "Precedence remove button only shown for source==='manual' edges (the backend only deletes manual rows; never an auto edge)"
  - "Regroup dialog seeds its exercise options from the source partition's nodes; target subfamily picked from a flat all-subfamily list"
metrics:
  duration: ~15min
  completed: 2026-06-05
requirements: [TREE-07]
---

# Phase 128 Plan 03: Editor de árbol (Admin UI) Summary

Profes now have a coach/owner-only admin section, **Editor de árbol**, that consumes the Plan-02 endpoints to refine the auto-built skill tree: expand categories → subfamilies → effort partitions, reorder exercises with up/down buttons (persisted via `/admin/tree-editor/reorder`), add/remove cross-partition precedence edges, and regroup exercises into another subfamily — with every order and edge badged **Auto** (SPOM default) vs **Manual** (profe override) so the profe always sees what they are overriding. Closes TREE-07 end-to-end.

## What Was Built

### Task 1 — Types + composable + route + sidebar link (commit `b9018713`)

- **`src/types/tree-editor.ts`** — TS mirror of the Plan-02 DTO contract, verbatim field names: `EditableTree` (`categories[]` → `subfamilies[]` → `partitions[]` with `overridden` + `nodes[]` carrying `orderSource:'auto'|'manual'`, plus a top-level `precedenceEdges[]`), and request bodies `ReorderBody` / `PrecedenceBody` / `RegroupBody` + a shared `MutationResult` (`ok`, `edgesWritten`, `edgesDeleted`). `Effort = 'CON'|'EXC'|'ISO'`, `OrderSource = 'auto'|'manual'`. No `any`.
- **`src/composables/useTreeEditorApi.ts`** — `useTreeEditorApi()` with `loading`/`error` refs and `fetchTree()`, `reorderPartition()`, `setPrecedence()`, `regroup()`, each calling the matching `/admin/tree-editor/*` endpoint via the `api` axios instance (baseURL already ends in `/api`), wrapped in `extractError` + `Notify({type:'negative'})` + `createLogger('useTreeEditorApi').error(...)` + rethrow (mirrors `useProposalsApi`). Exposes a no-op-safe `cleanup()` that resets transient state; **does not** call `onUnmounted` internally (CLAUDE.md). No `console.log`.
- **`src/router/routes.ts`** — added a `/tree-editor` child of `AdminLayout` with `meta.allowedRoles: ['coach','owner'] as AdminRole[]` (matching the other training pages).
- **`src/layouts/AdminLayout.vue`** — added a `<q-item to="/tree-editor">` (icon `account_tree`, label "Editor de árbol") inside the existing `isCoachRole` training block, next to "Revisión de dimensiones".

### Task 2 — TreeEditorPage.vue (commit `a7587efd`)

`src/pages/TreeEditorPage.vue` — Quasar `q-page`, `<script setup lang="ts">`. On mount calls `fetchTree()` and renders nested `q-expansion-item`s (category → subfamily → effort partition). Per partition:

- An ordered `q-list` of node rows with up/down `q-btn`s (disabled at the ends and while the partition is busy). Up/down builds the new id order locally and POSTs `reorderPartition`, then **refetches** the tree (robust over optimistic) so the new order + Manual badge reflect server truth.
- A **q-badge** per partition (`overridden` ⇒ "Manual" primary / "Auto" grey-6), per node (`orderSource`), and per cross-edge (`source`).
- A **"Precedencia"** action opening a `q-dialog` to add a manual cross-edge (origin from this partition, destination from any node) via `setPrecedence({op:'add'})`; cross-edges are also listed in a "Precedencias entre ramas" panel with a per-edge remove button shown only for `source==='manual'` edges (`setPrecedence({op:'remove'})`).
- A **"Reagrupar"** action opening a `q-dialog` to move selected exercise(s) from the partition to another subfamily via `regroup`.

After any successful mutation: `Notify` positive/info + refetch. Loading uses `q-skeleton`; empty uses a `q-banner`. All data flows through `useTreeEditorApi` — no direct `api` calls, no member endpoints. No `any`; the page's `onUnmounted` calls `treeApi.cleanup()`. Only warm-palette named color tokens (`primary`, `secondary`, `grey-*`, `positive`, `negative`, `info`) — no blue, no hardcoded hex.

## Deviations from Plan

None — plan executed as written. (The plan's `vue-tsc --noEmit` verify step is unavailable: `vue-tsc` is not installed in `el-templo-admin` and there is no `typecheck` script. Per the run policy the local gate used was `pnpm run lint` (0 errors on the new files; 6 pre-existing warnings in unrelated files are out of scope) and `pnpm run build` (succeeded). CI's own type gate runs server-side; not run locally per project policy.)

## Checkpoint Status

Task 3 is `checkpoint:human-verify` (visual/role UAT). This was an **unattended overnight run** — no human available. The checkpoint is **DEFERRED**: full implementation done, local gate green. Pending manual UAT (to run with the API + admin app live, logged in as coach/owner):

1. Sidebar shows "Editor de árbol"; a member/gestion/recepcion role does NOT see/reach it.
2. Expand category → subfamily → partition; reorder two exercises with up/down — partition shows "Manual" and the order persists after reload.
3. Precedencia dialog adds a cross-edge (appears Manual); per-edge remove deletes it.
4. Reagrupar dialog moves an exercise to another subfamily; it re-buckets and persists on reload.
5. Colors warm/brand (no blue), layout not broken.

## Known Stubs

None. All data is wired to live `/api/admin/tree-editor` endpoints.

## Threat Flags

None. No new security surface — the page only calls the staff-scoped Plan-02 editor endpoints; the client route guard (`allowedRoles ['coach','owner']` + `isCoachRole` sidebar block) is defense-in-depth, with the server-side `TRAINING_ROLES` guard as the real authority (T-128-06).

## Verification

- `cd el-templo-admin && pnpm run lint` → 0 errors on the new files (6 pre-existing warnings in unrelated files, out of scope).
- `cd el-templo-admin && pnpm run build` → Build succeeded (SPA, quasar v2.18.6 / vite v7.3.1).
- Composable: exposes `cleanup()`, no `onUnmounted` inside; page `onUnmounted` calls it. No `console.log`, no `any`, no hardcoded colors.

## Self-Check: PASSED

- FOUND: el-templo-admin/src/types/tree-editor.ts
- FOUND: el-templo-admin/src/composables/useTreeEditorApi.ts
- FOUND: el-templo-admin/src/pages/TreeEditorPage.vue
- FOUND: /tree-editor route in router/routes.ts + /tree-editor q-item in AdminLayout.vue
- FOUND commit: b9018713 (feat 128-03 types + composable + route + sidebar)
- FOUND commit: a7587efd (feat 128-03 TreeEditorPage)
