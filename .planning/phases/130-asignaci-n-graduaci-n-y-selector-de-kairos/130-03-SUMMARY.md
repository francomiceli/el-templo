---
phase: 130-asignaci-n-graduaci-n-y-selector-de-kairos
plan: 03
subsystem: admin
tags: [kairos, levels, selector, admin, quasar, vue, member-views]

# Dependency graph
requires:
  - phase: 130-01
    provides: "users.level DEFAULT kairos + level_override — backend now creates kairos members, so the admin must render/filter/assign the level"
provides:
  - "Kairos as the FIRST level option in the admin member edit dialog selector (MemberFormDialog levelOptions, both create + edit q-selects)"
  - "Admin create-member form defaults level to kairos (both form-state initializers), matching the API default (D-01)"
  - "Kairos in the alumnos list level filter (levelFilterOptions, first after 'Todos')"
  - "Kairos glyph (α) + name (Kairos) + warm color (amber-6) on the alumnos table cell and the alumno detail page — no raw 'kairos' string rendered"
affects:
  - "130-04 (app selector): admin half of KAIROS-07 done; the member-app 6th tile is the remaining selector surface"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Kairos placed FIRST in every admin level option array (kairos→alfa→delta→sigma→omega→spartan), matching the canonical LEVEL_ORDER from constants/levels.ts and D-04"
    - "Glyph/name kept byte-consistent with the member app (kairos → 'α' glyph reusing Alfa's, display name 'Kairos') for cross-app parity"
    - "Warm brand token reuse: kairos → amber-6 (lighter than alfa's amber-8, entry-tier), staying in the existing warm amber/orange/brown/red/grey family — no blue, no hardcoded hex"

key-files:
  created: []
  modified:
    - el-templo-admin/src/components/MemberFormDialog.vue
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/pages/AlumnoDetailPage.vue

key-decisions:
  - "Kairos color token chosen as amber-6 — a lighter warm hue distinct from alfa's amber-8, signalling the entry tier while staying inside the established warm palette (no blue)"
  - "No markup change needed: both q-select instances already bind :options=levelOptions, and q-select is a dropdown (6 entries scroll/stack natively, no horizontal layout break)"
  - "Glyph/name mirror el-templo-app/src/modules/training/utils/levelDisplay.ts exactly (kairos → 'α' / 'Kairos') so the two apps never disagree on Kairos display"

requirements-completed: [KAIROS-07]

# Metrics
duration: ~2m
completed: 2026-06-05
---

# Phase 130 Plan 03: Admin Kairos Level Selector Summary

**Kairos (the 6th level) is now selectable, filterable, and correctly rendered across every admin member surface: it is the FIRST option in the edit-dialog level selector and the alumnos list filter, the new-member form defaults to it, and the alumnos table + alumno detail page render it with the Greek glyph 'α', name 'Kairos', and a warm amber-6 color instead of a raw "kairos" string — byte-consistent with the member app.**

## Performance

- **Duration:** ~2 min
- **Completed:** 2026-06-05
- **Tasks:** 2 auto (Task 3 human-verify checkpoint DEFERRED — overnight run)
- **Files modified:** 3 (0 created, 3 modified)

## Accomplishments

- **MemberFormDialog.vue** — added `{ label: 'Kairos', value: 'kairos' }` as the FIRST entry in `levelOptions` (order now kairos→alfa→delta→sigma→omega→spartan, matching `LEVEL_ORDER` / D-04). Both form-state initializers (initial `form` ref and the dialog-reset block) changed `level: 'alfa'` → `level: 'kairos'`, so a freshly-created member defaults to kairos consistently with the API default (D-01). Both `<q-select v-model="form.level" :options="levelOptions">` instances (create + edit modes) already bind the array — no markup change, dropdown shows 6 options cleanly.
- **AlumnosPage.vue** — `levelFilterOptions` now offers "Kairos" (first after "Todos"); `LEVEL_GREEK_MAP` gained `kairos: 'α'` (reuses Alfa's glyph per the Phase 129 member-app decision); the `levelColor` switch gained `case 'kairos': return 'amber-6'` (warm, lighter entry-tier token). The `body-cell-nivel` table cell now renders the glyph + warm color for kairos members instead of the raw string.
- **AlumnoDetailPage.vue** — `LEVEL_GREEK_MAP` gained `kairos: 'α'`, `LEVEL_NAMES` gained `kairos: 'Kairos'`, and the `levelColor` switch gained `case 'kairos': return 'amber-6'`. The detail page now renders a kairos member as "Kairos" with the warm glyph/color.
- Glyph (`α`) and name (`Kairos`) chosen to exactly mirror `el-templo-app/src/modules/training/utils/levelDisplay.ts` for cross-app parity.

## Task Commits

1. **Task 1: Add Kairos to MemberFormDialog selector + default** — `347091bd` (feat)
2. **Task 2: Add Kairos to AlumnosPage + AlumnoDetailPage display maps and filter** — `e2a92cb1` (feat)

**Plan metadata:** committed with this SUMMARY + STATE/ROADMAP/REQUIREMENTS update.

## Files Modified

- `el-templo-admin/src/components/MemberFormDialog.vue` — Kairos first in `levelOptions`; both form defaults `alfa`→`kairos`.
- `el-templo-admin/src/pages/AlumnosPage.vue` — Kairos in `levelFilterOptions` + `LEVEL_GREEK_MAP` (`α`) + `levelColor` (`amber-6`).
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` — Kairos in `LEVEL_GREEK_MAP` (`α`) + `LEVEL_NAMES` (`Kairos`) + `levelColor` (`amber-6`).

## Decisions Made

- **amber-6 for kairos** — a lighter warm hue distinct from alfa's `amber-8`, signalling the entry tier while staying inside the established warm amber/orange/brown/red/grey palette (no blue, no hardcoded hex).
- **No markup change** — both q-selects already bind `:options="levelOptions"`; a 6-entry dropdown scrolls/stacks natively, so there is no horizontal layout break (the human-verify checkpoint will confirm visually).
- **Member-app parity** — glyph `α` (Alfa's, reused) and name `Kairos` copied verbatim from the member app's `levelDisplay.ts`.

## Deviations from Plan

None - plan executed exactly as written. Both auto tasks completed as specified at the documented line locations; all chosen tokens are warm and match the brand.

## Checkpoint Status

- **Task 3 (checkpoint:human-verify, gate=blocking) — DEFERRED.** This is an unattended overnight run; per the execution directive the full implementation was completed and the local admin gate run, with visual UAT deferred. **Pending manual visual verification (`cd el-templo-admin && pnpm dev`):**
  1. Alumnos level filter offers "Kairos" and filters correctly.
  2. "Nivel" column shows glyph `α` + warm color for a kairos member (not raw "kairos").
  3. Edit dialog selector lists Kairos FIRST, dropdown not broken with 6 entries, new member defaults to Kairos.
  4. Alumno detail page renders a kairos member as "Kairos" with the warm glyph/color.

## Threat Surface

All plan `<threat_model>` dispositions respected:

- **T-130-07 (Information Disclosure / level display):** accept — level is non-sensitive display data already shown to staff; adding kairos exposes nothing new.
- **T-130-08 (Elevation of Privilege / level select):** mitigate — the selector only populates a form; the actual level write stays behind the gated `PUT /members/:userId` from Plan 01. No client-side authority change in this plan.
- **T-130-SC:** no new packages installed.

No new security surface introduced.

## Verification

- `grep -c "value: 'kairos'" MemberFormDialog.vue` → 1; `grep -c "level: 'alfa'" MemberFormDialog.vue` → 0 (both defaults are kairos).
- `grep -c kairos` → 3 in both AlumnosPage.vue and AlumnoDetailPage.vue (filter/option + glyph + color, name where applicable).
- Color tokens are warm (`amber-6`); glyph `α` and name `Kairos` match the member app.
- `pnpm run lint` (admin) → 0 errors (6 pre-existing warnings in unrelated files, out of scope).
- `pnpm run build` (admin) → **Build succeeded** (Quasar build includes vue-tsc type-check; no `any`, no console.log introduced).
- Human-verify checkpoint deferred (overnight); visual UAT pending.

## Next Phase Readiness

- KAIROS-07 admin half realized: Kairos is selectable, filterable, and correctly rendered across all admin member surfaces without breaking layout (D-04).
- Remaining selector surface: 130-04 (member-app 6th tile).
- Nothing pushed; all work on `staging`, master untouched. CI + visual UAT pending per the milestone workflow.

## Self-Check: PASSED

---

_Phase: 130-asignaci-n-graduaci-n-y-selector-de-kairos_
_Completed: 2026-06-05_
