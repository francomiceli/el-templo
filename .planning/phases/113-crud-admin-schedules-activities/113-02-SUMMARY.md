---
phase: 113
plan: 02
subsystem: scheduling-admin-ui
tags: [frontend, admin, scheduling, activities, ux, error-handling]
dependency-graph:
  requires:
    - 113-01 (backend 409 contract with affectedSchedules payload)
  provides:
    - CreateSlotDialog component (admin can create new slots from UI)
    - HorariosPage tabbed layout (Horarios | Actividades)
    - Cascade-error toast UX surfacing affected schedules
    - Inline 4xx error rendering on slot creation form
  affects:
    - el-templo-admin/src/components/scheduling/CreateSlotDialog.vue (new)
    - el-templo-admin/src/components/scheduling/ActivitiesDialog.vue (refactored: dialog → embedded panel)
    - el-templo-admin/src/pages/HorariosPage.vue (tabs + Crear horario button + cascade handler)
    - el-templo-admin/src/types/scheduling.ts (AffectedScheduleRef export)
tech-stack:
  added: []
  patterns:
    - Quasar q-tabs / q-tab-panels for in-page section switching (no new
      sidebar route per D-18)
    - Embedded panel pattern: refactored a q-dialog component into a plain
      panel with `:active` prop, file kept by name to preserve git history;
      parent imports under alias `ActivitiesPanel`
    - Inline error rendering on q-form (errorMessage ref + text-negative
      caption block) instead of toast — keeps form context for correction
      after backend 4xx
    - Cascade-error event bubble: child component detects `axios.isAxiosError
      && status === 409 && Array.isArray(data.affectedSchedules)` and emits
      a typed payload; parent renders Spanish toast with truncated list
      (slice(0,5) + "y N más" overflow)
    - Backend message pass-through via `extractError` so 409 uniqueness
      strings ("Ya existe una actividad activa con ese nombre") reach the
      user verbatim instead of generic fallbacks
key-files:
  created:
    - el-templo-admin/src/components/scheduling/CreateSlotDialog.vue
  modified:
    - el-templo-admin/src/components/scheduling/ActivitiesDialog.vue (panel refactor + cascade UX)
    - el-templo-admin/src/pages/HorariosPage.vue (tabs + Crear horario + cascade handler)
    - el-templo-admin/src/types/scheduling.ts (AffectedScheduleRef)
decisions:
  - File kept as `ActivitiesDialog.vue` (NOT renamed to ActivitiesPanel.vue)
    despite no longer being a dialog. Rationale: minimize git history churn;
    parent imports under alias. Documented with header comment in the file.
  - Crear horario button moved into header (not floating action button) and
    gated by `v-if="activeTab === 'horarios'"` so it only appears in the
    relevant tab. `:disable="!selectedBranchId"` keeps the existing branch
    selector as the implicit pre-condition (D-17 default branch pre-selected).
  - Slot creation 4xx errors render INLINE in the form (text-negative caption
    below the activity select) rather than as a toast. UX rationale: admin
    keeps the form open and can correct the time/branch immediately. Toast
    would require re-opening the modal. Cascade error from activity
    deactivation DOES use a toast — that flow has no form to preserve.
  - DAY_SHORT_LABELS reused from types/scheduling.ts for the cascade toast
    list ("Lun 10:00-11:00 (Constitución)") — same labels admin already sees
    in the weekly grid, no new copy.
metrics:
  duration: ~7min
  tasks_completed: 3/3
  files_modified: 3
  files_created: 1
  tests_added: 0
  completed_date: 2026-05-08
---

# Phase 113 Plan 02: Frontend admin CRUD UI Summary

Frontend admin UX to close the loop on Phase 113: admins can now create
new slots (`CreateSlotDialog`), manage activities inside the same page
via tabs (`HorariosPage` + embedded `ActivitiesPanel`), and receive
actionable Spanish toasts when the backend rejects an activity
deactivation due to active referencing schedules. The new admin flow
eliminates the need for one-off SQL migrations to toggle slots —
the Constitución 10am case that motivated this phase is now solvable
end-to-end from the UI.

## What was built

### Task 1: CreateSlotDialog.vue + AffectedScheduleRef type

**Files:**

- `el-templo-admin/src/types/scheduling.ts` — exported new
  `AffectedScheduleRef` interface (`id`, `dayOfWeek`, `startTime`,
  `endTime`, `branchName`) matching the Plan 113-01 backend 409
  cascade-block contract.
- `el-templo-admin/src/components/scheduling/CreateSlotDialog.vue` —
  new 232-line component. Accepts `:show`, `:branches`, and
  `:default-branch-id` props; emits `update:show` and `created`. Form
  fields: branch select, day select (Lunes–Sábado), start/end HH:MM
  inputs with mask + range validator, activity select (filtered to
  active activities loaded on dialog open via
  `schedulingApi.listActivities`).

  Submit calls `schedulingApi.createSchedule` and renders backend 4xx
  inline via `extractError(err, 'Error creando horario')`. Backend
  Plan 01 surfaces accionable Spanish messages ("Ya existe un horario
  activo HH:MM-HH:MM que se solapa…", "La hora de fin debe ser posterior
  al inicio") so the admin sees what to correct without leaving the form.

  Logger uses `createLogger('CreateSlotDialog')`. No `any`, no
  `console.*`. The `loadActivities` call is wrapped in `try/catch (err:
unknown)` with `instanceof Error` narrowing per CLAUDE.md.

  **Commit:** `5b409160`

### Task 2: HorariosPage tabs + Crear horario button

**File:** `el-templo-admin/src/pages/HorariosPage.vue`

- Added `q-tabs` ("Horarios" | "Actividades") + `q-tab-panels` wrapping
  the existing weekly grid (lines ~80–246 after prettier formatting).
- Removed legacy "Actividades" header button (was opening a floating
  dialog) — replaced by the tab. Removed `showActivitiesDialog` ref.
- Added "Crear horario" header button gated by
  `v-if="activeTab === 'horarios'"` and
  `:disable="!selectedBranchId"`; mounts the new `CreateSlotDialog` with
  `branchesRaw` (newly stored alongside `branchOptions`) and
  `selectedBranchId` as defaults. `@created="loadWeeklyGrid"` refreshes
  the grid after success.
- Imported `ActivitiesPanel` from
  `src/components/scheduling/ActivitiesDialog.vue` (alias only — file
  kept by name) and embedded inside the second tab panel. Wired
  `@cascade-error="onCascadeError"`.
- New `onCascadeError(payload)` builds a Spanish toast listing the first
  5 affected schedules using `DAY_SHORT_LABELS[dow] startTime-endTime
(branchName)` plus "y N más" overflow when `affectedSchedules.length > 5`.

  **Commit:** `72e89180` (combined with Task 3)

### Task 3: ActivitiesDialog → embedded panel + cascade UX

**File:** `el-templo-admin/src/components/scheduling/ActivitiesDialog.vue`

- Removed `<q-dialog>` wrapper, `<q-card-actions>` close button, and the
  `'update:show'` emit. Content lives in a plain `<div class="q-pa-md">`
  with a `q-card flat bordered` for the list+form area.
- Props changed from `{ show: boolean }` to `{ active: boolean }`. New
  emits: `'cascade-error': [{ message, affectedSchedules:
AffectedScheduleRef[] }]`.
- Lifecycle: `onMounted` loads activities if `active` is already true;
  `watch(() => props.active)` reloads on each subsequent activation so
  admins see fresh state when switching back from the Horarios tab.
- `onToggleActivity` catch branch updated: detects
  `axios.isAxiosError(err) && err.response?.status === 409 &&
Array.isArray(data.affectedSchedules)` and emits `cascade-error`
  upward — no generic toast in that branch. Other 4xx/5xx fall through
  to `$q.notify({type:'negative', message: extractError(err, …)})`.
- `onSaveActivity` catch swapped from hardcoded "Error guardando
  actividad" to `extractError(err, fallback)` so the backend
  uniqueness 409 message ("Ya existe una actividad activa con ese
  nombre") reaches the user verbatim.
- `confirmDeactivate` copy updated to reflect cascade-block: "Si hay
  horarios activos usandola, vas a tener que cambiarles la actividad o
  desactivarlos primero."
- Header HTML comment documents the file-name-vs-import-alias decision.

  **Commit:** `72e89180` (combined with Task 2)

## Decision: filename of ActivitiesDialog.vue

Kept as `ActivitiesDialog.vue` despite no longer being a dialog. The
parent imports it under alias `ActivitiesPanel`. Rationale: a `git mv`
would break tools that key off the path, and the change is purely
nominal — the file content is the embedded panel. The HTML header
comment + the import-alias name make the intent obvious to future
readers. If/when the file gains substantial new responsibilities, a
clean rename can be done in a separate housekeeping plan.

## Combined commit for Tasks 2+3

Tasks 2 and 3 committed together (`72e89180`) instead of separately.
Rationale: Task 3 changed the props/emit contract of `ActivitiesDialog`
from `(:show, @update:show)` to `(:active, @cascade-error)`. If
committed alone, the intermediate state would leave `HorariosPage` (a
separate file) consuming the old API and `tsc --noEmit` would fail.
Per executor Rule 3, blocking type errors that span files are fixed
inline; the cleanest expression of that here is one atomic commit
across both files. The plan output is identical.

## Deviations from Plan

1. **[Rule 3 - Blocking] Combined Tasks 2+3 into one commit.** Tasks
   were inseparable due to the ActivitiesDialog props/emit contract
   change spanning HorariosPage. Documented above; no functional
   deviation from the plan, only commit granularity.

2. **[Rule 3 - Out of scope] Pre-existing tsc errors in pdfmake
   typings.** 3 errors in `src/utils/pdf/session-pdf-builder.ts`
   present on `master` before this plan's changes; verified by
   stashing and re-running `pnpm tsc --noEmit`. Logged to
   `.planning/phases/113-crud-admin-schedules-activities/deferred-items.md`.
   Recommend a future housekeeping plan to bump or widen
   `@types/pdfmake`. Build (`pnpm build`) passes regardless.

## Verification run

- `cd el-templo-admin && pnpm tsc --noEmit` → 3 errors, all in
  pre-existing pdfmake typings (out of scope, see Deferred). No new
  errors introduced.
- `cd el-templo-admin && pnpm build` → succeeds (Build mode spa, all
  templates+imports valid).
- `grep -cE "console\." src/components/scheduling/CreateSlotDialog.vue
src/components/scheduling/ActivitiesDialog.vue
src/pages/HorariosPage.vue` → 0 / 0 / 0.
- `grep -nE ":\s*any[\s,;)]"` over the 3 files → 0 hits.
- `git diff --stat -- el-templo-admin/src/components/scheduling/SlotDetailDialog.vue`
  → empty (D-19 invariant: file unchanged).
- `wc -l CreateSlotDialog.vue` → 232 (≥120 plan minimum).
- Husky + lint-staged ran on both commits (Prettier + ESLint) — no
  manual `--no-verify` used.

## Authentication Gates

None — admin app is browser-only with existing JWT cookie auth; no
new auth surface.

## Out of Scope / Deferred

- **Manual smoke test** in admin browser — deferred to user (autonomous
  execution mode, no checkpoints requested).
- **Pre-existing pdfmake tsc errors** (3) — see deferred-items.md.
- **`commit-to-subrepo`** — N/A; project does not declare `sub_repos` in
  the executor init context.
- **Tests for the new components** — no admin-side unit/E2E test
  framework is in scope for this phase; backend Plan 01 already covers
  the 409 contract via integration tests, and the frontend logic is
  deterministic glue (extract message, render toast).

## Self-Check: PASSED

- `5b409160 feat(113-02): add CreateSlotDialog + AffectedScheduleRef type` — present in `git log`.
- `72e89180 feat(113-02): tabs Horarios/Actividades + cascade-error UX` — present in `git log`.
- `el-templo-admin/src/components/scheduling/CreateSlotDialog.vue` — exists (232 lines, ≥120).
- `el-templo-admin/src/components/scheduling/ActivitiesDialog.vue` — exists, refactored.
- `el-templo-admin/src/pages/HorariosPage.vue` — exists, tabs+button+handler wired.
- `el-templo-admin/src/types/scheduling.ts` — `AffectedScheduleRef` exported.
- `el-templo-admin/src/components/scheduling/SlotDetailDialog.vue` — unchanged (D-19).
- `pnpm build` exit 0; `pnpm tsc --noEmit` no new errors.
