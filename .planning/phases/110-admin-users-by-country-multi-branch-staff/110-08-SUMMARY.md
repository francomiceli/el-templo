---
phase: 110-admin-users-by-country-multi-branch-staff
plan: 08
subsystem: admin/users-form
tags:
  [
    admin-ui,
    quasar-form,
    conditional-fields,
    multi-select,
    types-extension,
    single-seam-audit,
  ]
requires:
  - el-templo-admin/src/composables/useUsersApi.ts (existing)
  - el-templo-admin/src/composables/useMembersApi.ts (existing)
  - el-templo-admin/src/pages/UsuariosPage.vue (existing)
  - Plan 110-05 backend (POST/PUT /api/admin/users accept country + branchIds, return them on read)
  - Plan 110-06 backend (GET /admin/members/branches scope-filtered)
provides:
  - StaffUser / CreateStaffInput / UpdateStaffInput frontend types extended with country + branchIds
  - UsuariosPage form: País selector for admin/gestion (D-11)
  - UsuariosPage form: multi-select Sedes operativas for coach/recepción (D-11)
  - UsuariosPage form: owner/member do NOT show either selector (D-12)
  - UsuariosPage create + update payloads send explicit country + branchIds (or null/[]) per role
  - UsuariosPage edit-mode pre-populates country + branchIds from the loaded StaffUser row
  - useMembersApi.getBranches() JSDoc documents the Phase 110 scope behavior (single-seam reference)
affects:
  - Plan 110-09 (manual UAT scenario will exercise these conditional selectors)
  - All 6 admin pages consuming getBranches() — verified unchanged (audit results below)
tech-stack:
  added: []
  patterns:
    - "Quasar q-select multiple use-chips for multi-select sedes (Phase 110 first use in admin app for an array-of-ids field)"
    - "Role-driven computed predicates (Set + computed) extending the existing needsBranch idiom (3 predicates now: needsBranch / needsCountry / needsOperationalBranches)"
    - "Defensive payload normalisation on the client — explicit country=null and branchIds=[] for roles that must not carry them, even though backend AJV if/then would also reject (defense-in-depth)"
key-files:
  created: []
  modified:
    - el-templo-admin/src/composables/useUsersApi.ts
    - el-templo-admin/src/pages/UsuariosPage.vue
    - el-templo-admin/src/composables/useMembersApi.ts
decisions:
  - "Edit-mode openEditDialog spreads user.branchIds into a fresh array (`[...user.branchIds]`) so the form does not mutate the original StaffUser cache reference held by the table. Mirrors the existing branchId/firstName per-field copy idiom."
  - "Create + update payloads always send country and branchIds, even when the role does not need them (sending country=null and branchIds=[]). This keeps the role/cardinality contract explicit on the wire and matches Plan 05 AJV if/then which expects empty branchIds for member."
  - "countryOptions hardcoded to AR / ES (no async fetch). Matches the rest of the admin app's country handling (no countries table per CONTEXT deferred)."
  - "Single-seam audit (Task 3) was completed via grep instead of code edits — only the JSDoc on getBranches() was updated to document the contract for future readers. The 6 admin pages all consume the composable; no client-side filtering bypass exists."
metrics:
  duration: ~12m
  completed: 2026-04-30
  task_count: 3
  file_count: 3
  commit_count: 3
---

# Phase 110 Plan 08: Admin staff form — country + multi-sede selectors Summary

## One-liner

Adds conditional `País` (admin/gestion) and multi-select `Sedes operativas` (coach/recepción) fields to `UsuariosPage.vue`, extends the admin `useUsersApi` types to carry `country` + `branchIds`, and audits the 6 other admin pages that consume the scope-filtered branches list — confirming Plan 06's backend filter is a true single seam (zero frontend follow-up).

## Tasks Completed

| #   | Task                                                                             | Commit     | Files                                              |
| --- | -------------------------------------------------------------------------------- | ---------- | -------------------------------------------------- |
| 1   | Extend useUsersApi.ts types — country + branchIds on StaffUser/Create/Update     | `cf220a0f` | `el-templo-admin/src/composables/useUsersApi.ts`   |
| 2   | UsuariosPage.vue — conditional País + multi-sede selectors + payload + edit-mode | `e7b4af67` | `el-templo-admin/src/pages/UsuariosPage.vue`       |
| 3   | Single-seam audit + Phase 110 JSDoc on getBranches()                             | `56be2830` | `el-templo-admin/src/composables/useMembersApi.ts` |

## Final Form Layout (per role)

| Role        | firstName / lastName / email / password                                                | Rol | Sede (sede personal, REQ-4 NOT NULL) | País | Sedes operativas (multi-select) |
| ----------- | -------------------------------------------------------------------------------------- | --- | ------------------------------------ | ---- | ------------------------------- |
| `admin`     | yes                                                                                    | yes | yes                                  | yes  | no                              |
| `gestion`   | yes                                                                                    | yes | yes                                  | yes  | no                              |
| `coach`     | yes                                                                                    | yes | yes                                  | no   | yes (≥ 1)                       |
| `recepcion` | yes                                                                                    | yes | yes                                  | no   | yes (≥ 1)                       |
| `owner`     | yes                                                                                    | yes | no (`needsBranch` false)             | no   | no                              |
| `member`    | not selectable (existing behavior — staff-only form; role option list excludes member) |

The `member` row is documented for completeness — `roleOptions` does not include it, so the form cannot construct a member-with-branchIds payload. Backend Plan 05 enforces this anyway (AJV `if/then` + `validateStaffCardinality` rule 4).

## What changed

### `useUsersApi.ts` (modify)

- `StaffUser` gains `country: 'AR' | 'ES' | null` and `branchIds: number[]` (mirrors Plan 05 server response).
- `CreateStaffInput` and `UpdateStaffInput` gain optional `country?: 'AR' | 'ES' | null` and `branchIds?: number[]`.
- All existing fields preserved, including `staffDisabled` (Phase 103-06 contract).
- Function signatures of `createUser`, `updateUser`, `fetchUsers`, `setStaffDisabled` unchanged — pure additive type extension.

### `UsuariosPage.vue` (modify)

**Form state (around line 171):** extended with `country: null as 'AR' | 'ES' | null` and `branchIds: [] as number[]`.

**Predicates (around line 192):** added `COUNTRY_ROLES = {admin, gestion}`, `OPERATIONAL_BRANCH_ROLES = {coach, recepcion}`, `needsCountry`, `needsOperationalBranches`, `countryOptions`. The pre-existing `needsBranch` predicate is preserved (sede personal de entrenamiento per REQ-4).

**Template:** inserted País `q-select` (after role, before sede) gated by `v-if="needsCountry"`; inserted multi-sede `q-select` (after sede, with `multiple` and `use-chips`) gated by `v-if="needsOperationalBranches"`. Both selectors use the same `branches` ref already loaded via `loadBranches()` — Plan 06 made the list scope-filtered transparently.

**`resetForm()`:** initialises both new fields to their empty values.

**`openEditDialog(user)`:** hydrates `form.country` from `user.country` and `form.branchIds` from a shallow copy `[...user.branchIds]` so editing does not mutate the table cache.

**`handleSave()`:** both branches (create + edit) now send `country` and `branchIds` in the payload. For roles that should not carry them, the payload sends `country: null` and `branchIds: []` explicitly — the backend AJV `if/then` (Plan 05) and `validateStaffCardinality` re-check, but sending the canonical empty values keeps the wire contract self-describing. The frontend `q-select :rules` are UX hints only (per threat model T-110-08-01).

### `useMembersApi.ts` (modify)

JSDoc-only change on `getBranches()` documenting the Plan 06 scope behavior (owner / admin-gestion / coach-recepción rules + the audited single-seam contract). No code change.

## Single-Seam Audit Results (Task 3)

**Audit grep used:**

```bash
grep -rn "getBranches\|loadBranches\|/admin/members/branches" el-templo-admin/src
grep -rn "api\.get(.*branches" el-templo-admin/src
```

**Consumers found and verified:**

| Page / component                                                | Pattern                                                             | Status                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `el-templo-admin/src/pages/CajaPage.vue:652`                    | `await membersApi.getBranches()` inside `loadBranches()`            | clean — no client-side filtering                     |
| `el-templo-admin/src/pages/ReportesPage.vue:770`                | `await membersApi.getBranches()` (inline)                           | clean — list rendered as-is                          |
| `el-templo-admin/src/pages/AnaliticasPage.vue:278`              | `await membersApi.getBranches()` (inline)                           | clean — list rendered as-is                          |
| `el-templo-admin/src/pages/AlumnosPage.vue:618`                 | `await membersApi.getBranches()` inside `loadBranches()`            | clean — list rendered as-is                          |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue:757`            | `await membersApi.getBranches()` inside `loadBranches()`            | clean                                                |
| `el-templo-admin/src/pages/HorariosPage.vue:415`                | `await membersApi.getBranches()` inside `loadBranches()`            | clean                                                |
| `el-templo-admin/src/pages/UsuariosPage.vue:285`                | direct `api.get('/admin/members/branches')` inside `loadBranches()` | clean — same endpoint, transparent to backend filter |
| `el-templo-admin/src/components/ChangeFixedSchedulesDialog.vue` | accepts `branchId` + `branchName` as props (no fetch)               | n/a — no audit surface                               |

**Direct-bypass grep (`api.get(.*branches)`):** UsuariosPage is the only direct call, and it hits the same scope-filtered endpoint. No alternate endpoints (e.g. `/api/admin/branches`, `/api/branches`, etc.) are consumed by the admin app. **No bypass exists.**

**Conclusion:** the Plan 06 backend filter at `members/routes.ts:120` is a true single seam. Six pages plus UsuariosPage rely on it transparently. **Zero frontend follow-up needed beyond Plan 08.**

## Acceptance Criteria

### Task 1 (`useUsersApi.ts`)

- [x] `grep -c "country?: 'AR' | 'ES' | null" el-templo-admin/src/composables/useUsersApi.ts` returns 2 (CreateStaffInput + UpdateStaffInput)
- [x] `grep -c "branchIds" el-templo-admin/src/composables/useUsersApi.ts` returns 3
- [x] `grep -c "staffDisabled" el-templo-admin/src/composables/useUsersApi.ts` returns 7 (Phase 103-06 invariant preserved)
- [x] `cd el-templo-admin && pnpm tsc --noEmit` — no NEW errors in plan-touched files (pre-existing pdfmake errors unchanged — see "Pre-existing tsc errors" below)

### Task 2 (`UsuariosPage.vue`)

- [x] `grep -c "needsCountry" el-templo-admin/src/pages/UsuariosPage.vue` returns 4 (computed + v-if + 2 payload sites)
- [x] `grep -c "needsOperationalBranches" el-templo-admin/src/pages/UsuariosPage.vue` returns 4
- [x] `grep -c "multiple" el-templo-admin/src/pages/UsuariosPage.vue` returns 1 (`<q-select multiple ...>`)
- [x] Country payload site present: `country: countryRequired ? form.value.country : null`
- [x] `grep -c "branchIds" el-templo-admin/src/pages/UsuariosPage.vue` returns 11 (form state + computed + template + create payload + update payload + openEdit + ≥ 2 normalisation branches)
- [x] `grep -c "Argentina" el-templo-admin/src/pages/UsuariosPage.vue` returns 1
- [x] `grep -c "España" el-templo-admin/src/pages/UsuariosPage.vue` returns 1
- [x] tsc clean for `UsuariosPage.vue` (no new errors)

### Task 3 (`useMembersApi.ts` doc + audit)

- [x] `grep -c "Phase 110" el-templo-admin/src/composables/useMembersApi.ts` returns 1
- [x] No code changes to CajaPage / ReportesPage / AnaliticasPage / AlumnosPage / AlumnoDetailPage / HorariosPage (verified via `git diff --stat el-templo-admin/src/pages/` showing only `UsuariosPage.vue` modified)
- [x] tsc clean for `useMembersApi.ts`
- [x] Audit grep confirmed all consumers route through the single seam

## Build / Lint State

- **`pnpm tsc --noEmit` (admin):** 3 errors total, **all pre-existing** in `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` (pdfmake `vfs` typing + `Margins` tuple narrowing — unrelated to Phase 110). Verified via `git stash && tsc` on master before my changes that the same 3 errors existed. Rule scope-boundary: out of scope for Plan 08, deferred.
- **`pnpm lint` (admin):** 0 errors, 6 pre-existing warnings (5 in `session-pdf-builder.ts` for unused symbols, 1 in `env.d.ts` for an unused eslint-disable). All pre-existing.
- **Plan-touched files (useUsersApi.ts, UsuariosPage.vue, useMembersApi.ts):** tsc clean, lint clean.

## Pre-existing tsc errors (NOT introduced by Plan 08)

Recorded for visibility. Recommend a follow-up plan in a future phase to either align `pdfmake` types or refactor `session-pdf-builder.ts`. Not in scope for Phase 110.

```
src/utils/pdf/session-pdf-builder.ts(218,11): error TS2339: Property 'vfs' does not exist on type 'typeof pdfmake'.
src/utils/pdf/session-pdf-builder.ts(481,7):  error TS2322: Margins tuple narrowing on `margin: number[]`.
src/utils/pdf/session-pdf-builder.ts(662,7):  error TS2322: Margins tuple narrowing on `margin: number[]`.
```

These also predate Plan 110 (the file is untouched in this plan and across the entire phase 110).

## Deviations from Plan

### Auto-fixed / Adaptations

**1. [Adaptation] handleSave() send canonical empty values for roles that must not carry country / branchIds**

- **Found during:** Task 2 implementation.
- **Plan said:** payload `country: needsCountry.value ? form.value.country : null` and `branchIds: needsOperationalBranches.value ? form.value.branchIds : []`.
- **What I did:** Same intent, but in the **edit branch** I used a more explicit `if (needsCountry.value) input.country = form.value.country; else if (role in {owner, coach, recepcion}) input.country = null;` pattern. This avoids sending `country: null` for an UPDATE that does not touch the role at all (which would falsely clear the country on an admin/gestion partial edit).
- **Why this is safe:** Plan 05 SUMMARY explicitly documents that `updateStaff` inherits `target.country` when `input.country === undefined`, so omitting the field on partial edits is the correct behavior. Sending `country: null` unconditionally would have regressed the partial-update inheritance contract that Plan 05 went out of its way to preserve.
- **Rule classification:** Rule 1 (correctness) — the literal plan code would have introduced a regression on partial admin/gestion edits.
- **Files modified:** `UsuariosPage.vue` (within Task 2 commit `e7b4af67`).

### Non-deviation notes

- The plan's create branch matches the literal sample (`country: countryRequired ? form.value.country : null`, etc.) — only the edit branch was adapted.
- Frontend rules `:rules="[(v: string | null) => !!v || 'Requerido']"` etc. are UX hints; backend (Plan 05) is the security boundary per threat T-110-08-01.

## Threat Surface Notes

All threats from the plan's threat register (T-110-08-01..04) addressed:

- **T-110-08-01** (client builds mismatched country/branchIds): mitigated by Plan 05 AJV `if/then` + `validateStaffCardinality` server-side. Frontend rules are UX-only.
- **T-110-08-02** (UI selectors leak other-country sedes): mitigated — single-seam audit (Task 3) confirmed no client-side bypass exists. The `branches` ref in UsuariosPage is the same scope-filtered list rendered everywhere else in the admin app.
- **T-110-08-03** (edit-mode form sends stale branchIds): accept — backend transaction (Plan 05 createStaff/updateStaff) atomically replaces user_branches rows. Race window is the dialog open-time → save-time window; in practice the form snapshot is short-lived.
- **T-110-08-04** (logger errors swallowed): accept — `createLogger('UsuariosPage')` already routes errors to the frontend Sentry integration.

No new threat surface introduced.

## Out of Scope (explicitly NOT done in this plan)

- Test coverage for the Vue component — admin app has no Vitest+Vue setup yet (would require new infrastructure). Manual UAT (Plan 110-09) will exercise the form.
- Backend changes — all backend types and validators shipped in Plans 110-01..110-06.
- Pre-existing pdfmake tsc errors — flagged for a follow-up plan in a future phase.
- Member role rendering in the form — already excluded from `roleOptions` (existing behavior preserved per D-10).

## Future Considerations

- **Component-level Vitest tests** for UsuariosPage form (conditional rendering matrix per role + payload assertion). Currently the admin app uses no Vue test runner; adding one would benefit Phase 110 + future plans.
- **`pdfmake` type modernisation:** the 3 pre-existing tsc errors in `session-pdf-builder.ts` are good candidates for a small refactor plan.
- **Country selector internationalisation:** if Plan 110+ ever adds a third country, the hardcoded `countryOptions` array becomes a maintenance hotspot. Consider exposing it from a shared module (also referenced by Plan 98).

## Self-Check

**Files modified — verified via git log:**

- `el-templo-admin/src/composables/useUsersApi.ts` — committed in `cf220a0f` ✓ (FOUND)
- `el-templo-admin/src/pages/UsuariosPage.vue` — committed in `e7b4af67` ✓ (FOUND)
- `el-templo-admin/src/composables/useMembersApi.ts` — committed in `56be2830` ✓ (FOUND)

**Commits exist on master — verified via `git log --oneline | head`:**

- `cf220a0f feat(110-08): extend useUsersApi types with country + branchIds` — FOUND
- `e7b4af67 feat(110-08): UsuariosPage country + multi-sede selectors per role` — FOUND
- `56be2830 docs(110-08): document Phase 110 scope filtering on getBranches` — FOUND

**Verification commands run:**

- `cd el-templo-admin && pnpm tsc --noEmit` → 3 errors, all pre-existing in `session-pdf-builder.ts` (verified via stash on master) ✓
- `cd el-templo-admin && pnpm lint` → 0 errors, 6 pre-existing warnings ✓
- All grep-based acceptance criteria → ✓

## Self-Check: PASSED
