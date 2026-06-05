---
phase: 125-bootstrap-llm-revisi-n-de-profes-de-la-descomposici-n
plan: 03
subsystem: admin-frontend
tags:
  - quasar
  - vue3
  - admin
  - proposals
  - skill-tree
  - review-ui
  - inline-edit

# Dependency graph
requires:
  - phase: 125-bootstrap-llm-revisi-n-de-profes-de-la-descomposici-n (plan 02)
    provides: "/admin/exercises/proposals* routes (list/bulk-accept/:id/accept/:id/reject) under TRAINING_ROLES"
provides:
  - "useProposalsApi composable (fetchProposals/acceptProposal/rejectProposal/bulkAccept) typed against the Plan 02 API"
  - "ProposalReviewPage.vue: route-grouped, filterable q-tables with inline-edit + per-row accept(overrides)/reject + group accept"
  - "/proposals route (coach/owner) + Entrenamiento nav link 'Revisión de dimensiones'"
affects: [126-graph-dag, 128-tree-editor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composable mirrors useExercisesApi: axios + extractError + Notify + createLogger error idiom, no console, no any"
    - "Route grouping done client-side on currentRoute (one q-table per route group) — backend already orders by route then name"
    - "Inline edits mutate the local row; sent as accept-overrides on individual accept. Bulk-accept-group uses proposed values as-is (no per-row override)"

key-files:
  created:
    - el-templo-admin/src/types/proposal.ts
    - el-templo-admin/src/composables/useProposalsApi.ts
    - el-templo-admin/src/pages/ProposalReviewPage.vue
  modified:
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/layouts/AdminLayout.vue

key-decisions:
  - "Frontend types track the REAL Plan 02 response (`{ proposals, total }`, item fields incl. `currentRoute`/`engine`/`confidence`), not the approximated `{ rows }`/`route` shape sketched in the plan's <interfaces>"
  - "Grouping uses the exercise's `currentRoute` (the real route, matching the backend's group/order key), so route_pending rows (empty route) cluster under '(sin ruta)' with their proposedRoute editable"
  - "Subfamily = free-text q-input (canonical name, no catalog endpoint exists yet); leverage = q-select with the D-03 vocab (tuck/adv tuck/straddle/half/full) + new-value-mode for other families + clearable (nullable); route = q-select (route codes) shown only for route_pending rows"
  - "acceptOverrides always sends proposedLeverage (incl. explicit null) so a profe can clear it; subfamily/route only sent when present (route only for route_pending)"
  - "Status filter (pending/accepted/rejected) added so accepted/rejected rows are auditable; 'Aceptar grupo' only shows in the pending view"

requirements-completed: [TREE-03]

# Metrics
duration: ~30min
completed: 2026-06-04
---

# Phase 125 Plan 03: Profe review screen (frontend) Summary

**`ProposalReviewPage.vue` + `useProposalsApi.ts` + `proposal.ts` give profes a filterable, route-grouped review UI over the Plan 02 `/admin/exercises/proposals*` endpoints: each route's pending proposals render in their own q-table with inline-editable sub-family / palanca / ruta, per-row accept (carrying the inline edits as overrides) / reject, and a group-level "Aceptar grupo" (bulk-accept) — wired into AdminLayout's Entrenamiento nav as "Revisión de dimensiones" for coach/owner.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-06-04
- **Tasks:** 2
- **Files:** 5 (3 created, 2 modified)

## Accomplishments

- `src/types/proposal.ts`: `Proposal` (id, exerciseId, exerciseName, currentRoute, routePending, proposedSubfamily/Leverage/Route, status, engine, confidence), `ProposalListResponse` ({ proposals, total }), `ProposalFilters`, `AcceptOverrides`, `BulkAcceptResponse` — mirrors the real `ProposalListItem`/`ListProposalsResult` from `proposal-service.ts`.
- `src/composables/useProposalsApi.ts`: `useProposalsApi()` returning `loading`/`error` + `fetchProposals` (omits null/undefined params → backend defaults status=pending), `acceptProposal(id, overrides?)`, `rejectProposal(id)`, `bulkAccept(ids)`. Each wraps the standard `extractError` + `Notify` + `log.error` idiom (createLogger; no console; no any) and rethrows.
- `src/pages/ProposalReviewPage.vue`: route + status filter bar; client-side grouping into one bordered q-table per `currentRoute` (sorted); inline `body-cell-*` slots — q-input for sub-family, q-select (vocab + free-typing + clearable) for palanca, q-select (route codes) for ruta shown only on route_pending rows; per-row Accept (sends `overridesFor(row)`) / Reject; per-group "Aceptar grupo" (bulkAccept) shown only in pending view; loading + empty states; `onMounted` fetch; refresh after every mutation so the row leaves the pending view.
- `src/router/routes.ts`: `{ path: 'proposals', component: ProposalReviewPage, meta: allowedRoles [coach, owner] }` sibling to `exercises`.
- `src/layouts/AdminLayout.vue`: Entrenamiento nav `q-item to="/proposals"` (icon `rule`, label "Revisión de dimensiones").

## Task Commits

1. **Task 1: useProposalsApi composable + proposal types** - `64ba0824` (feat)
2. **Task 2: ProposalReviewPage + route + nav link** - `cdc6ca30` (feat)

**Plan metadata:** _(this commit)_ `docs(125-03): complete plan`

## Files Created/Modified

- `el-templo-admin/src/types/proposal.ts` - proposal review types (created)
- `el-templo-admin/src/composables/useProposalsApi.ts` - 4-method composable over /admin/exercises/proposals\* (created)
- `el-templo-admin/src/pages/ProposalReviewPage.vue` - route-grouped review page (created)
- `el-templo-admin/src/router/routes.ts` - /proposals route (modified)
- `el-templo-admin/src/layouts/AdminLayout.vue` - nav link (modified)

## Deviations from Plan

**1. [Rule 1 - Contract correctness] Frontend types/composable track the REAL Plan 02 API, not the plan's approximated `<interfaces>`**

- **Found during:** Task 1 (reading `proposal-service.ts` + `routes.ts` for the actual shape).
- **Issue:** The plan's `<interfaces>` block sketched the list response as `{ rows, total }` with a `route` field per row. The shipped Plan 02 API returns `{ proposals, total }` and each item has `currentRoute` (the exercise's real route, used for grouping) plus `engine`/`confidence` metadata; the accept body is `{ proposedSubfamily?, proposedLeverage?: string|null, proposedRoute? }` and bulk-accept returns `{ success, acceptedCount }`.
- **Fix:** Typed `proposal.ts` and `useProposalsApi.ts` against the actual contract so the page binds to real fields (`exerciseName`, `currentRoute`, `routePending`). No backend change.
- **Files modified:** el-templo-admin/src/types/proposal.ts, el-templo-admin/src/composables/useProposalsApi.ts
- **Commit:** 64ba0824

**2. [Rule 2 - Auditability] Added a status filter (pending/accepted/rejected)**

- The plan describes "default pending"; added an explicit status select so accepted/rejected proposals can be reviewed for audit. "Aceptar grupo" is only shown when viewing pending. Minor, within the D-07 "filterable" intent.
- **Commit:** cdc6ca30

Otherwise the plan executed as written. Prettier (lint-staged) reformatted the new files on commit — no logic change.

## Local verification (CI suite deferred per project policy)

- `cd el-templo-admin && npx vue-tsc --noEmit` → **zero errors attributable to the new/modified files.** The admin app has a pre-existing non-clean typecheck baseline (10 unrelated files, all unmodified — listed in `deferred-items.md`); `vue-tsc 2>&1 | grep -i proposal` → no matches, and none of the erroring files are in this changeset (`git status --short el-templo-admin/` = only the 3 created + 2 modified proposal-review files).
- `grep -c useProposalsApi src/pages/ProposalReviewPage.vue` = 2; `grep -c ProposalReviewPage src/router/routes.ts` = 1; `grep -c /proposals src/layouts/AdminLayout.vue` = 1.
- No `console.log/warn/error` in any new file (the lone "console.log" token is inside a doc comment in the composable); no `any` (`grep -E ': any|<any>|as any'` → clean).
- The integration/UI suite was NOT run locally (project policy). Ask before pushing to staging for CI.

## Known Stubs

None. The page is fully wired to the live Plan 02 endpoints — no hardcoded/mock data. (Before any data renders, migration 0138 must be applied and `bootstrap-dimensions.ts` run by a dev — neither is in scope here; carried from Plan 01/02.)

## Threat Flags

None. No new network surface (consumes existing /admin/exercises/proposals\* under the inherited TRAINING_ROLES auth hook); route restricted to coach/owner via `allowedRoles`.

## User Setup Required

None for this plan. To exercise the screen end-to-end: apply migration 0138 (pipeline) and run `bootstrap-dimensions.ts` (dev) so there are pending proposals to review.

## Next Phase Readiness

- TREE-03 is now satisfied end-to-end (API in 125-02 + UI here). 126 (graph) / 128 (tree editor) consume only CONFIRMED dimensions — accept (from this screen) is what promotes a proposal into that confirmed state.
- Manual UAT (load /proposals, group by route, accept/reject/override, accept-group) is deferred to phase verification.

## Self-Check: PASSED

All 3 created files present on disk; both task commits (`64ba0824`, `cdc6ca30`) found in git history.

---

_Phase: 125-bootstrap-llm-revisi-n-de-profes-de-la-descomposici-n_
_Completed: 2026-06-04_
