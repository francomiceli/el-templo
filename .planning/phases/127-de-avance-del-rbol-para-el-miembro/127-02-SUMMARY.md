---
phase: 127-de-avance-del-rbol-para-el-miembro
plan: 02
subsystem: el-templo-app / progression
tags: [skill-tree, progression, member-app, frontend, TREE-06, mi-arbol]
requires:
  - "127-01: GET /api/tree-progress/me + authoritative MemberTree DTO"
  - "progression module conventions (composable/setup-store/route patterns)"
  - "quasar.variables.scss warm brand tokens"
provides:
  - "/mi-arbol member route + MiArbol.vue view"
  - "TreeProgressResponse + nested client interfaces"
  - "treeProgressStore (Pinia setup store, render-only)"
  - "useTreeProgressApi().fetchTree() consuming GET /tree-progress/me"
  - "TreeCategorySection + SubfamilyProgressRow presentational components"
affects:
  - "phase 131 (in-session difficulty adjustment feeds the same % surface)"
tech-stack:
  added: []
  patterns:
    - "Pinia setup store + composable with cleanup() (no lifecycle hooks inside composable)"
    - "Presentational SFCs bind server percentages verbatim (no client arithmetic, D-05)"
    - "Warm brand SCSS tokens only; Quasar q-linear-progress / q-circular-progress for the % visual"
key-files:
  created:
    - el-templo-app/src/modules/progression/composables/useTreeProgressApi.ts
    - el-templo-app/src/modules/progression/stores/treeProgressStore.ts
    - el-templo-app/src/modules/progression/components/TreeCategorySection.vue
    - el-templo-app/src/modules/progression/components/SubfamilyProgressRow.vue
    - el-templo-app/src/modules/progression/pages/MiArbol.vue
  modified:
    - el-templo-app/src/modules/progression/types.ts
    - el-templo-app/src/modules/progression/routes.ts
decisions:
  - "Local gate = pnpm run lint + pnpm run build (quasar build); vue-tsc is NOT installed in this app — build is the authoritative SFC type gate (matches CI app-check job)"
  - "Dropped track-color props: cream-dark is only a SCSS var, not a registered Quasar color name, so it would not render the intended warm track — used Quasar's default faded-primary track instead (still warm, on-palette)"
  - "Page (MiArbol.vue) owns the lifecycle: onMounted→fetchTree, onUnmounted→composable.cleanup(); the composable itself registers no lifecycle hooks (CLAUDE.md)"
metrics:
  duration: ~25min
  completed: 2026-06-05
---

# Phase 127 Plan 02: Mi Árbol (member-app view) Summary

Thin, render-only member-app view that consumes `GET /api/tree-progress/me` (built in 127-01) and renders the skill tree: 5 thematic category sections (Tracción → Empuje → Piernas → Core → Movilidad), each with a server-computed % and its subfamilies as rows showing per-family % and per-node reached state. The client computes nothing — every percentage comes straight from the backend (D-05) — so the view reflects the real phase-126 DAG verbatim.

## Route + component tree

- **Route:** `path: 'mi-arbol'`, `name: 'mi-arbol'`, `meta: { requiresAuth: true }`, registered under the `layout` parent via the existing progression module manifest → reachable at `/mi-arbol`.
- **Component tree:**
  - `MiArbol.vue` (page) — fetches on mount, renders loading / error / empty / content states.
    - `TreeCategorySection.vue` ×5 (v-for over `treeProgressStore.categories`, backend order) — category header (label + `category.percent` as a `q-circular-progress` ring) + body.
      - `SubfamilyProgressRow.vue` ×N (v-for over `category.subfamilies`) — family name + `subfamily.percent` as a `q-linear-progress` bar + `reachedNodes/totalNodes` count + node list where each `node.reached` drives a check/unchecked icon and dimmed/active styling.

## How the view consumes the DTO

1. `MiArbol.vue` calls `useTreeProgressApi().fetchTree()` in `onMounted`.
2. `fetchTree()` does `api.get<TreeProgressResponse>('/tree-progress/me')` (the axios boot `baseURL` already includes `/api`), then `treeProgressStore.setTree(response.data)`. On failure it sets store error + fires a `Notify` toast via `extractError`.
3. The page renders `treeProgressStore.categories` **in the order the backend returns** (CATEGORY_ORDER is a server guarantee from 127-01 — no client sorting).
4. Components bind `category.percent`, `subfamily.percent`, `subfamily.reachedNodes/totalNodes`, and `node.reached` **directly**. The only numeric transform is `subfamily.percent / 100` to map the integer percent onto `q-linear-progress`'s 0..1 `value` — presentation scaling, not a progress computation (D-05 preserved).
5. `onUnmounted` calls the composable's `cleanup()` to reset its local refs. The composable registers no lifecycle hooks itself (CLAUDE.md).

## Convention compliance

- **Setup store:** `useTreeProgressStore` is `defineStore('treeProgress', () => { ... })` with `categories/loading/error` refs + `setTree/setLoading/setError/reset` actions — mirrors `progressionStore`.
- **Composable:** exposes `fetchTree` + `cleanup`; `grep -c onUnmounted` on it = 0; `cleanup` present.
- **No `any`, no `console.log`** in any of the 7 files (asserted via grep).
- **Warm palette only:** components use `$primary` (terracotta), `$secondary` (clay), `$accent` (charcoal), `$cream`, `$positive` (warm green) tokens from `quasar.variables.scss`; `grep -riE "#[0-9a-f]{6}|blue"` over the three SFCs returns nothing. No new colors introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `track-color="cream-dark"` would not render the intended warm track**

- **Found during:** Task 2 (writing the progress components).
- **Issue:** The plan/interfaces suggested reusing brand tokens for the progress visuals. I initially set `track-color="cream-dark"` on `q-linear-progress` / `q-circular-progress`. But `cream-dark` is only a SCSS variable (`$cream-dark`), NOT a registered Quasar color name — Quasar resolves `track-color="x"` to the `text-x`/`bg-x` class, and no `text-cream-dark` class exists in the app (only `text-cream` is hand-defined in RegisterPage). The track would silently fall back to the default, not the warm stone intended.
- **Fix:** Removed the `track-color` props; Quasar's built-in default track is a faded version of the bar color (`primary` terracotta), which is on-palette and warm. No grey/blue introduced.
- **Files modified:** `TreeCategorySection.vue`, `SubfamilyProgressRow.vue`.
- **Commit:** `3b8e1851`.

**2. [Rule 3 — Tooling] Plan's local gate command (`pnpm exec vue-tsc --noEmit`) is not available in this app**

- **Found during:** Task 1 verification.
- **Issue:** `vue-tsc` is not installed in `el-templo-app` (only plain `tsc` is). The plan's `pnpm exec vue-tsc --noEmit | grep ...` invocations were silently failing ("Command vue-tsc not found"), and the piped grep made the failure look "clean". Plain `tsc --noEmit` cannot resolve `.vue` SFC types, so it reports false positives on every `.vue` import (32 pre-existing, including the new `MiArbol.vue` import).
- **Fix:** Used the app's actual CI gate as the authoritative check: `pnpm run lint` (eslint, the member app's CI `app-check` step) + `pnpm run build` (`quasar build`, which performs full SFC type resolution). Both pass clean (lint exit 0 on all 7 files; build "Build succeeded", exit 0). This is exactly what CI runs for the app.
- **No package installs were attempted** (per project policy: never install/update deps without asking).

## Checkpoint outcome (Task 3 — human-verify)

**DEFERRED.** This was an unattended overnight run with no human available for the visual UAT. The implementation work (types, store, composable, two presentational components, page, route) is complete and the authoritative local gate (lint + build) passes. The visual verification — 5 sections in order, per-family %/reached state matching the real catalog, higher-level member shows higher %, warm palette, loading/error states — remains **pending HUMAN-UAT**. It must be done against an API where the 127-01 endpoint is live (staging or local with the tree-progress plugin), logged in as a member with a level set:

1. `cd el-templo-app && pnpm dev`, log in as a leveled member (e.g. delta/sigma), navigate to `/mi-arbol`.
2. Confirm: (a) 5 sections in order Tracción→Empuje→Piernas→Core→Movilidad; (b) each shows a % + subfamily rows with their own %/reached; (c) families/nodes match the real catalog (a higher-level member shows more reached nodes & higher overall %); (d) warm palette, no blue; (e) loading + error states behave.

## Verification

- `pnpm run lint` over the 7 new/modified files → exit 0 (no warnings/errors).
- `pnpm run build` (`quasar build`) → "Build succeeded", exit 0 (full SFC type resolution incl. `MiArbol.vue` import, typed props, store bindings).
- `grep -c onUnmounted useTreeProgressApi.ts` = 0; `grep -c cleanup useTreeProgressApi.ts` ≥ 1.
- `grep -rn console.log` over the 5 code/SFC files → nothing.
- `grep -rnE ': any|<any>|as any'` over the 5 files → nothing.
- `grep -riE "#[0-9a-f]{6}|blue|#2c3e5c|#b8956c"` over the 3 SFCs → nothing (no hardcoded/blue colors).
- Percent arithmetic: only `subfamily.percent / 100` for the 0..1 progress-bar scale; all displayed %/reached bound verbatim from the store.

## Test status (action needed)

No automated tests in this plan (thin render-only view; the data contract is covered by 127-01's integration test, which runs in CI). The remaining gate is the **HUMAN-UAT** visual verification above. Nothing pushed by this plan — stays on local `staging` per project policy.

## Self-Check: PASSED

All 5 created source files + the SUMMARY exist on disk; both task commits (`39ffdb88`, `3b8e1851`) are present in git history.
