---
phase: 114
plan: 06
subsystem: admin/reports
tags: [reports, trial-sessions, leads, inline-edit, d-35, d-37, d-39, d-44]
requires:
  - GET /admin/reports/trial-sessions + /export endpoints (Plan 05)
  - PATCH /admin/leads/:userId endpoint (Plan 04)
  - GET /admin/users owner-only endpoint (pre-existing in users module)
provides:
  - Sesiones de Prueba tab in admin Reportes module
  - TrialSessionsReport.vue self-contained component (filters + table +
    inline edit + CSV export)
  - useReportsApi.fetchTrialSessions / exportTrialSessions
  - useMembersApi.updateLead
  - useUsersApi.fetchStaff (owner-only thin wrapper)
affects:
  - el-templo-admin/src/composables/useReportsApi.ts
  - el-templo-admin/src/composables/useMembersApi.ts
  - el-templo-admin/src/composables/useUsersApi.ts
  - el-templo-admin/src/pages/ReportesPage.vue
  - el-templo-admin/src/components/reports/TrialSessionsReport.vue
tech-stack:
  added:
    - none (no new packages — VueUse explicitly avoided per
      feedback_no_auto_install_deps; inline debounce verbatim per plan)
  patterns:
    - Self-contained component owns its load lifecycle (mirrors
      DeudasReport pattern noted in STATE.md for Plan 109-04)
    - axios `paramsSerializer: { indexes: null }` for multi-value
      leadStatus query params (server expects repeated keys
      `?leadStatus=a&leadStatus=b`, not bracketed `key[]=...`)
    - Inline edit via Quasar q-chip + q-menu (status) and q-input
      type=textarea autogrow (notes); optimistic UI with revert on error
    - Server-side download via Blob → object URL (same pattern as
      DeudasReport's onExport; CSV BOM from Plan 05 keeps Excel happy)
    - D-44 client-side owner-only guard: `v-if="isOwner"` wraps the
      Gestiona <q-select>. Server-side strip (Plan 05 T3) is defense in
      depth — the client never sends gestionaUserId unless owner.
key-files:
  created:
    - el-templo-admin/src/components/reports/TrialSessionsReport.vue
  modified:
    - el-templo-admin/src/composables/useReportsApi.ts
    - el-templo-admin/src/composables/useMembersApi.ts
    - el-templo-admin/src/composables/useUsersApi.ts
    - el-templo-admin/src/pages/ReportesPage.vue
decisions:
  - "URL slug: /reportes?tab=sesiones-de-prueba (Claude's Discretion in
    CONTEXT). Chose the descriptive Spanish slug to match the user-facing
    tab label and stay readable in the URL bar — `trials` would have
    saved bytes but ReportesPage already uses Spanish slugs (`conversion`,
    `inactivos`, `deudas`)."
  - "fetchStaff() in useUsersApi.ts was NEWLY ADDED by T1 (the pre-existing
    fetchUsers() method mutates a shared `users` ref used by UsuariosPage;
    a thin wrapper that returns data directly keeps the report state
    decoupled from the users-page state). The backend endpoint at
    /admin/users is owner-only — fetchStaff does NOT widen that gate."
  - "Gestiona dropdown is filtered client-side to roles {admin, gestion,
    owner}. Reason: although the backend endpoint only returns owner-
    callable users, the response includes coach/recepcion (created via
    /admin/users) who don't manage leads. Filtering keeps the dropdown
    semantically correct (only people who can be in users.created_by for
    a lead). Sort order: Spanish locale collation by full name."
  - "Inline debounce verbatim per plan spec (300ms setTimeout/clearTimeout).
    Search input uses Quasar's native `debounce=\"300\"`; outer watcher
    debounce is harmless duplicate-fire guard. No VueUse dependency added
    (CLAUDE.md / feedback_no_auto_install_deps)."
  - "Pagination resets to page=1 on filter change (UX expectation — filter
    change is conceptually a new query)."
  - "Export URL strips page/limit from filters before calling the export
    endpoint (Plan 05 ignores pagination on export, but a clean query
    string makes the request inspector readable)."
metrics:
  tasks_completed: 3
  files_created: 1
  files_modified: 4
  completed_date: 2026-05-12
---

# Phase 114 Plan 06: Admin UI — Sesiones de Prueba tab Summary

Ships the admin UI tab that consumes the API surface from Plans 04 and 05.
A new "Sesiones de Prueba" tab is wired into ReportesPage, hosting a
self-contained `TrialSessionsReport.vue` component that renders the 11
columns (D-01), 8 filters (D-36, with Gestiona owner-only per D-44),
inline-edits leadStatus / leadNotes (D-37) via PATCH `/admin/leads/:userId`,
and exports CSV. Each table row represents one lead (row-key=userId)
matching the one-row-per-lead invariant established in Plan 05.

## Tasks Completed

| Task | Name                                                                            | Commit   | Files                                                                              |
| ---- | ------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| T1   | Composables: fetchTrialSessions / exportTrialSessions / updateLead / fetchStaff | 32348947 | el-templo-admin/src/composables/useReportsApi.ts, useMembersApi.ts, useUsersApi.ts |
| T2   | TrialSessionsReport.vue component                                               | 21574fc9 | el-templo-admin/src/components/reports/TrialSessionsReport.vue                     |
| T3   | Wire new tab into ReportesPage.vue                                              | 146b5968 | el-templo-admin/src/pages/ReportesPage.vue                                         |
| T4   | Checkpoint (human-verify) — see below                                           | -        | -                                                                                  |

## Output Directives (per plan `<output>` block)

### 1. Gestiona is owner-only end-to-end (D-44)

- **UI layer:** The `<q-select label="Gestiona">` is wrapped in a parent
  `<div v-if="isOwner">` (line 75 of TrialSessionsReport.vue). For
  non-owner roles (admin/gestion) the element is structurally absent from
  the rendered DOM — there is no fallback element, no numeric input, no
  free-form text input. `isOwner` is computed from
  `authStore.user?.role === 'owner'` (same pattern ReportesPage uses for
  the country selector).
- **Composable layer:** `buildServerFilters()` in TrialSessionsReport.vue
  only sets `gestionaUserId` when `isOwner.value && filters.gestionaUserId
!== null`. Non-owners never ship the parameter to the server.
- **Staff list fetch:** `loadGestionaOptionsIfOwner()` returns immediately
  for non-owners — they never invoke GET /admin/users at all.
- **Server-side defense in depth:** Plan 05 T3 silently strips
  `gestionaUserId` for non-owners with a `request.log.warn` (no 403). If
  a hand-crafted URL with `?gestionaUserId=N` is sent by a non-owner, the
  server returns the full unfiltered result set (Plan 05 SUMMARY Test 15
  asserts this end-to-end).

### 2. Each table row represents one lead (D-03 / D-42)

- `row-key="userId"` on the `<q-table>` (line 134 of
  TrialSessionsReport.vue). The server-side query (Plan 05) collapses
  multiple trial bookings per user via the `latest_trial` derived
  subquery, and the `total` field reflects deduplicated leads.
- The pagination footer's "Mostrando X de Y" counter and Quasar's
  rows-per-page picker both operate on leads, not bookings.
- For a user with cancelled + active trial bookings, exactly one row
  appears (verified by Plan 05 Tests 3 and 4 server-side; T4 below
  enumerates the matching manual visual verification).

### 3. Tab slug / route URL

- Tab name: `sesiones-de-prueba`
- Deep-link URL: `/reportes?tab=sesiones-de-prueba`
- Display label: "Sesiones de Prueba"
- Icon: `how_to_reg` (Material Icons — fits the "marked attendance for a
  trial" semantic)

Chose the descriptive Spanish slug (over the shorter `trials`) for
consistency with the rest of the Reportes tabs (`conversion`, `inactivos`,
`deudas` all use Spanish slugs).

### 4. fetchStaff in useUsersApi

`fetchStaff()` was **newly added by T1**. The pre-existing `fetchUsers()`
method on the composable mutates a shared `users` ref consumed by
UsuariosPage; reusing it from TrialSessionsReport would cause a
side-effectful mutation of state another page owns. `fetchStaff()` is a
thin wrapper that returns the response data directly, keeping the
trial-sessions component's gestiona-options list decoupled from
UsuariosPage's user-list state. Both call the same owner-only backend
endpoint at GET /admin/users — no change to the backend role gate (the
endpoint stays exactly as defined at
`el-templo-api/src/modules/users/routes.ts:24-28`).

### 5. Visual deviations from DeudasReport's pattern

The component mirrors DeudasReport's high-level pattern (self-contained,
own load lifecycle, watch-based reload on filter change, Blob export). A
few intentional shape differences:

- **q-table pagination is server-side** (DeudasReport uses a "Cargar más"
  button for cursor-style append). Trial sessions data is more table-y
  and the user expects standard page navigation.
- **Inline-edit cells** are new — DeudasReport is read-only.
- **Filter row is wider** (9 filters including Gestiona vs DeudasReport's 3) so columns scale across `col-12 col-sm-X col-md-Y` breakpoints
  rather than a single flat row.

## Checkpoint T4 — Human Verification

**Status: READY FOR REVIEW (autonomous run — no human present at runtime
to drive the browser)**

Every check that can be done statically passed. The checks below require a
running dev server + browser + DB inspection and are flagged for the human
operator to complete.

### Automatic checks (PASSED)

- [x] `pnpm exec tsc --noEmit` reports zero new errors. (Pre-existing
      `session-pdf-builder.ts` errors are unchanged baseline.)
- [x] `pnpm exec eslint` clean on all 5 touched files.
- [x] `grep -c "sesiones-de-prueba" ReportesPage.vue` → 3 (tab name, panel
      name, VALID_TABS entry).
- [x] `grep -c "TrialSessionsReport" ReportesPage.vue` → 2 (import + usage).
- [x] `grep -c "console\\." TrialSessionsReport.vue` → 0.
- [x] `grep -nE ":\\s*any\\b"` in any new file → 0 occurrences.
- [x] All 11 column labels present in TrialSessionsReport.vue.
- [x] `v-if="isOwner"` wraps the Gestiona `<q-select>` (line 75).
- [x] Inline debounce verbatim: `debounceTimer` + `debouncedReload`
      present (2 occurrences each).
- [x] `fetchTrialSessions`, `updateLead`, `exportTrialSessions`,
      `fetchStaff` all wired through to the component.

### Pending human verification (please run manually)

1. **Dev server boot.** From `el-templo-admin/`, run `pnpm dev`. Confirm
   no runtime errors.
2. **Owner role:** Log in as an OWNER. Navigate to Reportes > Sesiones de
   Prueba.
   - Confirm the 11 columns appear in this exact order: Lead, Fecha, Hora,
     Sucursal, Asistió, Estado del Lead, Gestiona, Comentarios, Turno,
     Periodo, Semana.
   - Confirm the "Gestiona" filter is visible and the `<q-select>` is
     populated with admin/gestion/owner staff names (sorted alphabetically
     by full name).
   - Apply each filter one at a time (Sede, Desde, Hasta, Estado del Lead
     multi, Asistió, Turno, Gestiona, Días sin convertir, Buscar) and
     confirm the table refreshes after the 300ms debounce.
   - Click a lead's Estado del Lead chip → select a different value →
     confirm chip color changes, spinner shows briefly, toast "Estado
     actualizado" appears, and DB updated:
     `mysql -e "SELECT lead_status FROM users WHERE id=<X>"`.
   - Click a Comentarios cell → type a note → click outside (blur) →
     confirm save + toast. Verify DB: `SELECT lead_notes FROM users WHERE
id=<X>`.
   - Try saving an empty Comentarios (clear the textarea then blur) →
     confirm DB shows NULL.
   - Try saving a 2001-char Comentarios → confirm error toast (backend
     returns 400 per D-28).
   - Click "Exportar CSV" → confirm a CSV downloads as
     `sesiones-de-prueba-YYYY-MM-DD.csv`, opens in Excel WITHOUT mojibake
     on accents (Plan 05's BOM byte is doing its job).
   - Switch pages via Quasar's pagination footer → confirm page navigation
     works (page-size selector includes 25/50/100/200).

3. **D-44 owner-only verification:** Log out, log in as an ADMIN
   (non-owner) user. Navigate to Reportes > Sesiones de Prueba. Confirm:
   - The Gestiona filter is NOT rendered (no element, no label visible
     anywhere on the page).
   - The remaining 8 filters work normally.
   - Open DevTools → manually fire a request with
     `?gestionaUserId=N` appended to the trial-sessions URL → confirm
     the response is the FULL unfiltered result set (Plan 05 silently
     strips the filter server-side, no 403).

4. **D-03 / D-42 verification:** In the DB, ensure there is a user with
   both a cancelled trial booking and an active trial booking. Confirm
   that user appears EXACTLY ONCE in the table — the row should reflect
   the active booking's fecha / hora / sucursal / attended, not the
   cancelled one.

5. **Empty cells:** Confirm that:
   - A lead with `users.created_by IS NULL` renders the Gestiona column
     cell as "—" (em dash, D-39).
   - A lead whose trial is in the future renders the Asistió cell as "—"
     (D-08 pending case).
   - A lead with `lead_notes IS NULL` renders the Comentarios cell as "—"
     and clicking it opens an empty textarea.

If any check fails, file the deviation as a follow-up Rule 1 fix on this
plan or a new Plan 114-07.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 2 — Missing critical functionality] `LeadStatusValue` /
`UpdateLeadPayload` / `LeadSnapshot` types moved to module level**

- **Found during:** T1, mid-edit.
- **Issue:** The plan's action snippet declared these types inside the
  `useMembersApi()` factory function body, which is not valid TypeScript
  (`export type` is not allowed inside a function scope; `interface` is
  technically allowed but useless from outside the function).
- **Fix:** Promoted all three declarations to module scope at the top of
  `useMembersApi.ts`, with explicit `export` markers so external consumers
  (the new TrialSessionsReport, plus any future component that wants to
  type-narrow lead snapshots) can import them. The function-internal
  `updateLead` method signature now references the module-level types.
  No behavioral change.
- **Files modified:** `el-templo-admin/src/composables/useMembersApi.ts`
- **Commit:** `32348947` (bundled with T1)

### Auth gates encountered

None. Both Plan 04 PATCH and Plan 05 GET endpoints are CAJA_ROLES-gated;
the admin app's existing JWT bearer-token interceptor (boot/axios.ts) is
sufficient.

## Threat Model Verification (per plan's `<threat_model>`)

| Threat ID   | Mitigation                                                                                                                                                                                                                                     | Status    |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| T-114-06-01 | Optimistic update saves `prevLeadStatus` / `prevLeadStatusEffective` before PATCH and reverts on error. Toast surface via `$q.notify`. Server validates per Plan 04 (400 / 409 / 403).                                                         | MITIGATED |
| T-114-06-02 | Export URL inherits the same CAJA_ROLES + country-scope guards as the listing (Plan 05). `gestionaUserId` is silently stripped server-side for non-owners (Plan 05 T3) — client also gates with `isOwner` before sending.                      | MITIGATED |
| T-114-06-03 | Acknowledged — D-30 defers audit log to a future phase. Toast is the only confirmation.                                                                                                                                                        | ACCEPTED  |
| T-114-06-04 | UI calls GET /admin/users only when `isOwner.value === true` (`loadGestionaOptionsIfOwner` returns early otherwise). Non-owner UI never invokes the endpoint and never renders the SELECT. Plan 05 server-side D-44 strip is defense in depth. | MITIGATED |

## Self-Check: PASSED

- File `el-templo-admin/src/components/reports/TrialSessionsReport.vue`
  exists.
- File `el-templo-admin/src/composables/useReportsApi.ts` exports
  `fetchTrialSessions`, `exportTrialSessions`, plus types
  `TrialSessionsFiltersClient`, `TrialSessionsRowClient`,
  `TrialSessionsResult`.
- File `el-templo-admin/src/composables/useMembersApi.ts` exports
  `updateLead` from the composable + module-level types
  `LeadStatusValue`, `UpdateLeadPayload`, `LeadSnapshot`.
- File `el-templo-admin/src/composables/useUsersApi.ts` exports
  `fetchStaff` from the composable.
- File `el-templo-admin/src/pages/ReportesPage.vue` registers the
  `sesiones-de-prueba` tab + panel and imports `TrialSessionsReport`.
- Commits `32348947`, `21574fc9`, `146b5968` present in `git log
--oneline -5`.
- `pnpm exec tsc --noEmit` reports zero new errors (only pre-existing
  `session-pdf-builder.ts` baseline remains).
- `pnpm exec eslint` clean on all 5 touched files.
