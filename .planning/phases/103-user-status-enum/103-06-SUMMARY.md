---
phase: 103
plan: 06
subsystem: api/users + admin/usuarios
tags:
  [
    staff,
    staff_disabled,
    semantic-inversion,
    single-owner-users-service,
    integration-tests,
  ]
dependency_graph:
  requires:
    - users.staff_disabled column (Plan 01)
    - users.is_active dropped (Plan 01)
    - auth/routes.ts isActive references already removed (Plan 02 unblocker)
  provides:
    - UserService.toggleDisabled(userId, disabled, requesterId) — explicit-value setter (no server-side toggle)
    - PATCH /api/admin/users/:userId/status accepts { disabled: boolean } and writes users.staff_disabled
    - GET /api/admin/users response exposes staffDisabled per row (replaces isActive)
    - createStaff insert path writes users.status = NULL explicitly (BLOCKER 1 fix per CONTEXT.md D-12)
    - UsuariosPage staff toggle (UX wording preserved, internal booleans inverted)
    - useUsersApi.setStaffDisabled(userId, disabled) — admin-app composable wired to new payload
  affects:
    - el-templo-api/src/modules/users/service.ts (sole owner per Plan 03 handoff)
    - el-templo-api/src/modules/users/schemas.ts
    - el-templo-api/src/modules/users/routes.ts
    - el-templo-api/src/modules/users/types.ts
    - el-templo-api/test/users/users.test.ts (existing 2 deactivation cases adapted to new payload)
    - el-templo-admin/src/composables/useUsersApi.ts
    - el-templo-admin/src/pages/UsuariosPage.vue
    - downstream Plan 07 (login gate that reads staff_disabled)
tech_stack:
  added: []
  patterns:
    - "explicit-value setter (not server-side toggle): `setStaffDisabled(id, true|false)` — concurrent admin clicks converge on the requested state instead of fighting each other"
    - "schema additionalProperties: false rejects legacy { isActive: ... } payload at the AJV layer, mitigating semantic-confusion attacks (T-103-09) without needing service-layer guards"
    - "self-deactivation guard scoped to the destructive direction only (`disabled=true`); self re-enable is a no-op for an already-logged-in requester"
    - "explicit `status: null` on staff insert mirrors the explicit `status: 'freemium'`/`'prueba'` literals in Plan 03 (D-12 entry-point intent at every member-creating endpoint)"
key_files:
  created:
    - el-templo-api/test/users/staff-disabled.test.ts
  modified:
    - el-templo-api/src/modules/users/service.ts
    - el-templo-api/src/modules/users/schemas.ts
    - el-templo-api/src/modules/users/routes.ts
    - el-templo-api/src/modules/users/types.ts
    - el-templo-api/test/users/users.test.ts
    - el-templo-admin/src/composables/useUsersApi.ts
    - el-templo-admin/src/pages/UsuariosPage.vue
decisions:
  - "Final method name in users/service.ts: `toggleDisabled(userId, disabled, requesterId)` — kept the verb `toggle` from the legacy name for grep continuity, but the semantics are now an explicit setter (caller passes the desired state)."
  - "Admin-app composable function renamed to `setStaffDisabled` (not `toggleStaffDisabled`) to match the explicit-value semantics — the composable signature is the public contract for UsuariosPage."
  - "Self-deactivation guard scoped to disabled=true only — re-enabling yourself is a no-op (you're already logged in to call this), so no need to throw a 400 there."
  - "AJV `additionalProperties: false` is the entire mitigation for T-103-09 (legacy payload rejection). No service-layer fallback or compatibility shim — the SPEC's no-backwards-compat constraint applies."
  - "Existing users.test.ts:259 expectation `body.isActive` was UPDATED in this commit (not deferred to Plan 07) because the changed endpoint is the file I own — leaving it broken would have failed CI on the next push. The login-gate test continues to assert 200 since Plan 07 has not yet shipped."
metrics:
  duration: ~8min
  completed_date: 2026-04-25
  tasks_completed: 3
  commits: 3
  test_cases: 7
  test_status: all-passing (7/7 new + 10/10 existing users.test.ts)
requirements_completed: [R7-staff, R11]
---

# Phase 103 Plan 06: UsuariosPage Staff Toggle Migrated to staff_disabled + Staff Insert status: null Summary

**One-liner:** PATCH `/api/admin/users/:id/status` now accepts `{ disabled: boolean }` and writes `users.staff_disabled` (R11 semantic inversion); the staff insert path in `users/service.ts` explicitly writes `users.status = NULL` (R7 / BLOCKER 1 reassignment from Plan 03); admin app's UsuariosPage row chip + button + tooltip + column field all flip from `isActive` to `staffDisabled` while UX wording stays identical (`Activar` / `Desactivar usuario`).

## What Shipped

### Task 1 — backend migration (commit `eca7a882`)

**`el-templo-api/src/modules/users/service.ts`:**

- `listStaff` projection: `isActive: schema.users.isActive` → `staffDisabled: schema.users.staffDisabled`
- `updateStaff` returned-row projection: same swap
- **`createStaff` insert path: added `status: null` explicitly** (R7 / BLOCKER 1)
- `toggleActive(userId, requesterId)` → **`toggleDisabled(userId, disabled, requesterId)`** with new return shape `{ staffDisabled: boolean }`. The method body now writes `set({ staffDisabled: disabled })` directly (no read-then-flip — the caller passes the desired state).
- Self-deactivation guard scoped to `disabled === true` only (re-enabling is a no-op — the requester is already authenticated).

**`el-templo-api/src/modules/users/schemas.ts`:**

- `listStaffSchema` response items: `isActive` → `staffDisabled`
- **`toggleStatusSchema` adds a `body` JSON schema** with `required: ['disabled']`, `properties.disabled.type='boolean'`, and **`additionalProperties: false`** so the AJV validator rejects the legacy `{ isActive: ... }` payload with HTTP 400 (T-103-09 mitigation).
- `toggleStatusSchema` 200 response: `isActive` → `staffDisabled`

**`el-templo-api/src/modules/users/routes.ts`:**

- PATCH handler typed as `Body: { disabled: boolean }`; reads `request.body.disabled` and calls `userService.toggleDisabled(userId, body.disabled, requesterId)`.

**`el-templo-api/src/modules/users/types.ts`:**

- `StaffUser.isActive: boolean` → `staffDisabled: boolean`

**`el-templo-api/test/users/users.test.ts`:**

- Two deactivation cases updated to send `{ disabled: true }` and assert `body.staffDisabled === true`. The "deactivated user cannot login" expectation is left at HTTP 200 because Plan 07 (the staff_disabled login gate) has not yet shipped — the test name was renamed to make the deferral explicit ("…can still login (login gate added in Plan 07)").

### Task 2 — frontend migration (commit `856969a6`)

**`el-templo-admin/src/composables/useUsersApi.ts`:**

- `StaffUser.isActive` → `staffDisabled`
- `toggleUserStatus(userId)` → **`setStaffDisabled(userId: number, disabled: boolean)`** that POSTs `{ disabled }` and reads `data.staffDisabled` from the response.

**`el-templo-admin/src/pages/UsuariosPage.vue`:**

- Row chip color/label: `staffDisabled ? 'grey' : 'positive'` and `staffDisabled ? 'Inactivo' : 'Activo'`
- Toggle button icon/color/tooltip: `staffDisabled ? 'check_circle' : 'block'`, `staffDisabled ? 'positive' : 'negative'`, `staffDisabled ? 'Activar' : 'Desactivar'`
- Column def `field`: `'isActive'` → `'staffDisabled'`
- `handleToggleStatus` introduces a single `isCurrentlyActive = !user.staffDisabled` local for the dialog wording, then calls `usersApi.setStaffDisabled(user.id, !user.staffDisabled)` to POST the inverted state.

UX wording stays identical to pre-103-06 — admins see the same "Activar usuario" / "Desactivar usuario" buttons and dialog titles.

### Task 3 — integration test (commit `7774050e`)

**`el-templo-api/test/users/staff-disabled.test.ts`** — 7 cases, all passing against real MySQL (`eltemplo_test`):

```
✓ PATCH { disabled: true } sets users.staff_disabled = 1
✓ PATCH { disabled: false } reactivates a previously-disabled coach
✓ rejects PATCH with legacy { isActive: true } payload (400)
✓ rejects PATCH without auth token (401)
✓ rejects PATCH from a non-owner staff role (403)
✓ GET /api/admin/users response includes staffDisabled per row (R11 list contract)
✓ createStaff insert path leaves users.status = NULL for non-member roles (BLOCKER 1)
```

The legacy-payload-rejection test (#3) specifically proves T-103-09 is mitigated end-to-end: AJV blocks the request before any service code runs, and a follow-up DB read confirms `staff_disabled` was untouched. The list-contract test (#6) proves the `isActive` field is gone from the API response shape — no backwards-compat shim leaks. The createStaff test (#7) closes the R7 acceptance for staff role inserts (status remains NULL after a real round-trip through `POST /api/admin/users`).

## Acceptance Gate Verification

| Gate (per plan acceptance_criteria)                                                       | Result                                                                                 |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `grep -n "toggleDisabled" service.ts` ≥ 1                                                 | 1 (line 223) ✓                                                                         |
| `grep -rn "toggleActive\|users\\.isActive" src/modules/users/` returns 0 outside comments | only 2 comment-only references documenting the rename ✓                                |
| `grep -n "staffDisabled" service.ts` ≥ 1                                                  | 8 ✓                                                                                    |
| `grep -n "status: null" service.ts` ≥ 1 (BLOCKER 1)                                       | 1 (line 113, in `createStaff`) ✓                                                       |
| `grep -n "disabled" schemas.ts` (PATCH payload)                                           | line 117 `required: ["disabled"]`, line 119 `disabled: { type: "boolean" }` ✓          |
| `pnpm tsc --noEmit` 0 new errors in modified API files                                    | ✓ (10 pre-existing errors in analytics/members/import/\* unchanged; my files report 0) |
| `grep -n "staffDisabled" useUsersApi.ts` ≥ 1                                              | 7 ✓                                                                                    |
| `grep -n "user\\.isActive" UsuariosPage.vue` returns 0                                    | 0 ✓                                                                                    |
| `grep -n "staffDisabled" UsuariosPage.vue` ≥ 4                                            | 14 ✓                                                                                   |
| `grep -n "disabled:" useUsersApi.ts` (api.patch payload)                                  | line 114 `{ disabled }` ✓                                                              |
| Admin-app `pnpm tsc --noEmit` 0 new errors in modified files                              | ✓ (3 pre-existing errors in `pdf/session-pdf-builder.ts` unchanged)                    |
| `pnpm test test/users/staff-disabled.test.ts` exits 0 with all cases passing              | 7/7 ✓                                                                                  |
| Old payload rejection test specifically proves the legacy shape is blocked (400)          | ✓ (test #3)                                                                            |

## UX Wording Preservation

The admin-app dialog text is byte-for-byte preserved across this migration:

- Title: "Activar usuario" / "Desactivar usuario" (unchanged)
- Body: "El usuario {nombre} sera desactivado. Los usuarios desactivados no pueden iniciar sesion." / "El usuario {nombre} sera activado." (unchanged)
- Button: "Activar" / "Desactivar" (unchanged)
- Tooltip: "Activar" / "Desactivar" (unchanged — note the trailing "usuario" was already absent from the tooltip pre-edit, only the dialog title carries it)

The only thing that changed under the hood is which boolean drives the wording (`!user.staffDisabled` instead of `user.isActive`).

## Confirmation: Staff Insert Now Passes status: null

```bash
$ grep -n "status: null" el-templo-api/src/modules/users/service.ts
113:        status: null,
```

In context (lines 109-114 of `createStaff`):

```ts
        // Phase 103-06 (R7, D-12, BLOCKER 1 reassignment from Plan 03):
        // Staff inserts (coach/admin/owner/gestion/recepcion) explicitly
        // pass status: null. The DB default is also NULL but we set it
        // explicitly here to make the intent unmistakable: only members
        // get a lifecycle status (freemium/prueba/activo/inactivo); staff
        // rows always have status=NULL and use staff_disabled instead.
        status: null,
```

`UserService.updateStaff` (the staff edit path) does NOT touch `status` — it only updates the explicit fields the admin requested (firstName/lastName/email/role/branchId/password). A staff member promoted from `member` (the `existing.role === 'member'` branch) keeps whatever `status` was on their member row; this is acceptable because the row's `role` flips to a staff role and the lifecycle status becomes meaningless for that user — Plan 04 (members) and Plan 07 (auth) both gate their queries by `role === 'member'`. If a future plan needs to NULL the status during promotion, it can add `status: null` to the `existing` branch as a one-line change.

## Integration Test Pass Count

- **New file (`staff-disabled.test.ts`): 7/7 passing**
- **Existing `users.test.ts`: 10/10 passing** after the test-side payload migration (commit `eca7a882`).

Combined: **17/17 PATCH-status-related tests passing.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing `users.test.ts` cases referenced legacy `body.isActive` and the no-payload-toggle shape**

- **Found during:** Task 1 — once the schema added `required: ['disabled']`, the existing 2 deactivation tests at `users.test.ts:241-288` would fail with HTTP 400 instead of the expected 200, AND would assert on `body.isActive` which the response no longer contains.
- **Fix:** Inlined into the Task 1 commit (`eca7a882`). The two test cases now POST `{ disabled: true }` and assert `body.staffDisabled === true`. The "deactivated user can still login" name is preserved because Plan 07 (login gate) is the future change — for now login still succeeds for staff_disabled users.
- **Files modified:** `el-templo-api/test/users/users.test.ts`
- **Why Rule 1 not Rule 4:** mechanical adaptation directly caused by the new schema contract — leaving it broken would have failed CI on the next push. The owner of the test file is the same plan that owns the endpoint (Plan 06).

### Out-of-scope Discoveries (deferred to later plans)

The existing `el-templo-api/src/db/import-members.ts:861`, `import-vigentes.ts:527`, `analytics/service.ts:205`, and `members/service.ts:456,591` still report `isActive` TypeScript errors (the documented 10 pre-existing errors from 103-02 SUMMARY's deferred list, minus the 1 closed by Plan 03's trials-service edit). These are owned by Plan 04 (members) and a future analytics-cleanup plan. Plan 06 introduces zero new tsc errors in any file.

The 3 pre-existing tsc errors in `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` are completely unrelated to user status (they're @types/pdfmake API mismatches) and were present before Phase 103 started.

## Threat Surface Scan

No new external surface. The endpoint URL, auth gate, and target table are unchanged from pre-103-06. The migration is a tightening:

- **T-103-09 (Tampering / semantic confusion):** mitigated end-to-end. AJV blocks the legacy `{ isActive: ... }` payload at the validator layer (proven by test #3); the admin-app ships in lockstep so there is no version-skew window where two payload shapes are in flight.
- **T-103-10 (Elevation of Privilege via PATCH):** mitigated. The existing `OWNER_ROLES` `onRequest` hook still runs first; tests #4 (no auth → 401) and #5 (admin role → 403) verify the gate is intact post-migration.
- The self-deactivation guard remains in place (now scoped to `disabled=true`).

## Self-Check: PASSED

- File `el-templo-api/test/users/staff-disabled.test.ts`: FOUND
- File `el-templo-api/src/modules/users/service.ts`: FOUND (modified)
- File `el-templo-api/src/modules/users/schemas.ts`: FOUND (modified)
- File `el-templo-api/src/modules/users/routes.ts`: FOUND (modified)
- File `el-templo-api/src/modules/users/types.ts`: FOUND (modified)
- File `el-templo-api/test/users/users.test.ts`: FOUND (modified)
- File `el-templo-admin/src/composables/useUsersApi.ts`: FOUND (modified)
- File `el-templo-admin/src/pages/UsuariosPage.vue`: FOUND (modified)
- Commit `eca7a882` (Task 1 — backend): FOUND
- Commit `856969a6` (Task 2 — frontend): FOUND
- Commit `7774050e` (Task 3 — tests): FOUND
- 7/7 new tests pass: VERIFIED
- 10/10 existing users.test.ts pass: VERIFIED
- `grep -n "status: null" el-templo-api/src/modules/users/service.ts` returns 1 match (line 113): VERIFIED
- `grep -n "user\\.isActive" el-templo-admin/src/pages/UsuariosPage.vue` returns 0: VERIFIED
