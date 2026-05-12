---
phase: 114
plan: 07
subsystem: admin/alumno-detail
tags: [leads, lead-lifecycle, admin-ui, d-38, d-39, d-34]
requires:
  - GET /admin/members/:userId returning leadStatus/leadNotes/createdBy (this plan T1)
  - PATCH /admin/leads/:userId (Plan 114-04)
  - useMembersApi.updateLead composable (Plan 114-06)
provides:
  - AlumnoDetailPage "Datos de Lead" block (visible only for status='prueba')
  - getMemberById extended with leadStatus, leadNotes, createdBy (self-JOIN)
  - memberProfileSchema declares the 3 new lead fields (Fastify serializer)
  - MemberProfile admin type extended with the 3 lead fields
affects:
  - el-templo-api/src/modules/members/service.ts
  - el-templo-api/src/modules/members/schemas.ts
  - el-templo-api/src/modules/members/types.ts
  - el-templo-api/test/members/members-trial.test.ts
  - el-templo-admin/src/types/member.ts
  - el-templo-admin/src/pages/AlumnoDetailPage.vue
tech-stack:
  added:
    - none (no new packages — reuses Plan 06's updateLead composable verbatim)
  patterns:
    - Drizzle `alias()` self-JOIN on users (creator) inside getMemberById to
      denormalize createdBy.name at the same trip — mirrors the precedent
      established by MemberService.updateLead in Plan 114-04.
    - Local draft (leadDraft) decoupled from memberProfile so an in-flight
      edit can revert cleanly on error without mutating the canonical
      profile state.
    - Watch(memberProfile, immediate:true) seeds the draft on initial load
      AND on subsequent reloads (e.g. after a profile save dialog).
    - Optimistic UI with revert-on-error pattern carried over from Plan 06's
      TrialSessionsReport inline-edit cells. Toast feedback via $q.notify
      (positive on save, negative with extracted error message on failure).
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-api/test/members/members-trial.test.ts
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
decisions:
  - "getMemberById needed a server-side extension. The pre-existing query
    used an explicit column projection (`db.select({...}).from(users)`),
    so silently relying on schema columns being projected was not an
    option. Added the 3 columns to the SELECT plus a leftJoin against
    `alias(users, 'creator')` to denormalize the admin's first/last name
    in the same trip. memberProfileSchema (Fastify response serializer)
    was updated in lockstep — fast-json-stringify silently strips
    unlisted properties, which would have made the API change a no-op
    for the wire payload (precedent: Plan 106-04 SUMMARY documents the
    same trap)."
  - "Block placement: immediately AFTER the existing 'Alumno en prueba —
    datos incompletos' banner (the soft-register conversion CTA from
    commit d9624738), BEFORE the q-tabs. Both elements share the same
    v-if gate on `memberProfile.status === 'prueba'`, so they appear as
    a coherent 'lead administration' group at the top of the page. The
    block disappears at the same instant the banner does once the lead
    converts."
  - "Used q-card with `flat bordered` for the block (matches the
    Segmentacion card visual idiom at line ~183 of the same page),
    rather than the spec snippet's `q-pa-md q-mb-md` plain card.
    Visually consistent with sibling sections on AlumnoDetailPage."
  - "Imported `LeadStatusValue` type from useMembersApi (Plan 06 already
    promoted it to module-scope export). Reused the same enum literal
    set for LEAD_STATUS_OPTIONS — no new const file, no string
    duplication risk."
metrics:
  tasks_completed: 2_of_3 (T3 is a human-verify checkpoint — see below)
  files_modified: 6
  files_created: 0
  completed_date: 2026-05-12
---

# Phase 114 Plan 07: Admin UI — Datos de Lead block in AlumnoDetailPage Summary

Ships the AlumnoDetailPage "Datos de Lead" block (D-38, D-39) that
mirrors the inline-edit pattern from Plan 06's TrialSessionsReport. The
block is conditional on `memberProfile.status === 'prueba'` and surfaces
the three lead-lifecycle fields the admin needs at-a-glance: Estado del
Lead (3-option select), Comentarios (textarea), and "Gestiona: <name>"
readonly caption. Edits round-trip through the existing PATCH
/api/admin/leads/:userId endpoint (Plan 114-04) via the
useMembersApi.updateLead composable (Plan 114-06) — zero new endpoints,
zero new composable methods.

## Tasks Completed

| Task | Name                                                          | Commit   | Files                                                                                                                                               |
| ---- | ------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | Audit + extend MemberProfile API + admin type                 | 2e3a5313 | el-templo-api/src/modules/members/{service,schemas,types}.ts, el-templo-api/test/members/members-trial.test.ts, el-templo-admin/src/types/member.ts |
| T2   | "Datos de Lead" block in AlumnoDetailPage.vue                 | ec2c53e8 | el-templo-admin/src/pages/AlumnoDetailPage.vue                                                                                                      |
| T3   | Checkpoint (human-verify) — visual verification on dev server | —        | — (pending human run; see "Checkpoint" section below)                                                                                               |

## Output Directives (per plan `<output>` block)

### 1. Did `getMemberById` need a server-side change?

**Yes — extended.** The existing query used an explicit column
projection (`db.select({ id, email, ... }).from(users)`), so simply
adding the columns to the DB schema was not enough — they had to be
added to both the SELECT and the response mapper.

The change set:

- Added `leadStatus`, `leadNotes` to the SELECT block.
- Added a `leftJoin(alias(users, 'creator'), eq(creator.id, users.createdBy))`
  to materialize the admin's first/last name in the same trip.
- Added `creatorId`, `creatorFirstName`, `creatorLastName` to the SELECT.
- Built the `createdBy: { userId, name } | null` object in the return
  mapper using the same name-composition logic as `updateLead`
  (filter Boolean, join " ", trim, fall back to "—" if both names
  happen to be NULL — though for staff rows this never occurs in practice).
- Extended `memberProfileSchema` (Fastify response serializer) to
  declare `leadStatus`, `leadNotes`, `createdBy` — without this,
  fast-json-stringify would have silently stripped the fields from the
  JSON payload (the same trap Plan 106-04's SUMMARY documents).
  `createdBy` uses `additionalProperties: true` per the Plan 106-04
  escape hatch for optional denormalized JOIN objects.
- Extended `MemberProfile` interfaces in BOTH `members/types.ts` (API)
  and `el-templo-admin/src/types/member.ts` (admin).

### 2. Exact placement of the block on the page

Inserted immediately **AFTER** the existing "Alumno en prueba — datos
incompletos" warning banner (rendered around line 132 with the same
`v-if="memberProfile.status === 'prueba'"` gate) and **BEFORE** the
q-tabs row. The two prueba-only elements appear as a contiguous
"lead administration" cluster at the top of the page; both disappear
the moment the lead converts (status flips to 'activo').

Rationale:

- The banner is an action prompt ("convertir"); the block is a data
  entry surface. Grouping them keeps related lead workflow in one
  contiguous region.
- Placing the block above the q-tabs means an admin reviewing a fresh
  lead sees the Estado/Comentarios/Gestiona context without needing to
  scroll past tabs they don't care about yet.
- The block uses `q-card flat bordered` to match the visual idiom of
  the sibling Segmentacion card lower on the same page (line ~183) for
  consistency.

### 3. Checkpoint approval signal

**Status: PENDING — not yet run.**

The autonomous run completed both code-emitting tasks (T1, T2) and all
static verification gates (tsc clean both apps modulo the pre-existing
pdf-builder baseline; tests 11/11 in members-trial.test.ts including
the new D-38 GET assertion). T3 is a `checkpoint:human-verify` task —
it requires a human to drive the browser. See "Checkpoint T3" section
below for the exact verification script.

## Verification

### Automated (PASSED)

- `cd el-templo-api && pnpm exec tsc --noEmit` — exit 0, zero errors.
- `cd el-templo-admin && pnpm exec tsc --noEmit` — only the 3
  pre-existing `session-pdf-builder.ts` baseline errors (unchanged
  from Plan 06 SUMMARY); zero new errors.
- `pnpm test test/members/members-trial.test.ts` — 11/11 pass
  (10 pre-existing + 1 new D-38 GET assertion). Wall-clock ~58s.
- `grep -c "Datos de Lead" AlumnoDetailPage.vue` → 3 (comment +
  section heading + comment).
- `grep -nE "v-if=\"memberProfile.status === 'prueba'\"" AlumnoDetailPage.vue`
  → 2 (existing banner + new q-card).
- `grep -c "updateLead" AlumnoDetailPage.vue` → 3 (import + status
  save + notes save).
- `grep -c "console\\." AlumnoDetailPage.vue` → 0 (CLAUDE.md compliant).
- `grep -nE ":\s*any\b"` in the new code → 0 occurrences.

## Checkpoint T3 — Pending Human Verification

A `checkpoint:human-verify` task requires a human to drive a browser.
The autonomous run cannot complete it. The verification script (verbatim
from the plan) is reproduced here for the operator:

1. `pnpm dev` in `el-templo-admin/`. Confirm no runtime errors on boot.
2. Log in as admin. Navigate to /alumnos.
3. Open a user with `status='prueba'` (filter by Tipo=prueba). Confirm
   the "Datos de Lead" block renders (just below the "Completar y
   convertir" banner).
4. Open a user with `status='activo'`. Confirm the block does NOT
   render.
5. On a prueba user: change Estado del Lead via the select. Confirm
   toast "Estado actualizado" + reload page → value persists.
6. Edit Comentarios. Blur. Confirm toast "Comentario guardado" +
   reload → value persists.
7. Clear Comentarios to empty + blur. Confirm DB shows NULL:
   `mysql -e "SELECT lead_notes FROM users WHERE id=<X>"`.
8. Verify "Gestiona: <name>" matches the admin who created the lead
   (per Plan 02). For a backfilled/historic user without `createdBy`,
   expect "Gestiona: —".
9. Set Estado del Lead='cerrado' on a lead with existing manual notes.
   Confirm Comentarios is UNCHANGED (D-34 invariant — server-side, but
   visible in UI too).

If any step fails, file a follow-up Rule 1 fix on this plan or open a
new Plan 114-08.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 2 — Defensive serializer declaration] `createdBy` schema
includes `additionalProperties: true`**

- **Found during:** Task 1 schema write.
- **Issue:** The plan explicitly called for `additionalProperties: true`
  on the `createdBy` object schema per the Plan 106-04 escape hatch.
  Standard practice in this codebase is `additionalProperties: false`
  (or omitted, which defaults to true). Confirmed via Plan 04 SUMMARY
  that fast-json-stringify silently strips ALL unlisted properties on
  response schemas — the escape hatch is necessary if the object's
  shape ever extends without a schema update.
- **Fix:** Declared as specified in the plan.
- **Files modified:** `el-templo-api/src/modules/members/schemas.ts`
- **Commit:** `2e3a5313`

### Auth gates encountered

None. The PATCH /admin/leads/:userId endpoint is CAJA_ROLES-gated; the
admin app's existing JWT bearer-token interceptor (boot/axios.ts) is
sufficient.

## Threat Model Verification (per plan's `<threat_model>`)

| Threat ID   | Mitigation                                                                                                                                                                                                                              | Status                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| T-114-07-01 | `onSaveLeadStatus` / `onSaveLeadNotes` capture `previous` / `memberProfile.value.leadNotes` before the PATCH; on error, `leadDraft.value.X = previous` reverts the bound input. Toast surfaces failure to the operator.                 | MITIGATED               |
| T-114-07-02 | The entire `<q-card>` and its action affordances are wrapped in `v-if="memberProfile.status === 'prueba'"` — the block (with its select / textarea / save handlers) is not even rendered for non-leads, so non-prueba users can't edit. | MITIGATED (gate exists) |

## Success Criteria

- [x] Admins viewing a trial user have all 3 lead fields visible +
      editable on the detail page (T1 surfaces the data; T2 renders + edits
      it).
- [x] The block disappears once the lead converts (status flips to
      'activo') — same v-if gate as the conversion banner; both vanish
      together.
- [x] No regressions in the alumno detail page for other user types —
      the new card is gated; the rest of the page is untouched. tsc clean,
      lint-staged passed.

## Self-Check: PASSED

- File `el-templo-api/src/modules/members/service.ts` contains the
  `creator = alias(...)` JOIN and the `leadStatus / leadNotes /
createdBy` projections in `getMemberById` (verified via grep).
- File `el-templo-api/src/modules/members/schemas.ts` declares
  `leadStatus`, `leadNotes`, `createdBy` on `memberProfileSchema`
  (line ~89–107 area).
- File `el-templo-api/src/modules/members/types.ts` extends
  `MemberProfile` with the 3 new fields (file end).
- File `el-templo-api/test/members/members-trial.test.ts` contains the
  new "GET /admin/members/:userId returns leadStatus, leadNotes,
  createdBy for a trial user" test (verified via grep — 11/11 pass).
- File `el-templo-admin/src/types/member.ts` extends `MemberProfile`
  with the 3 new fields.
- File `el-templo-admin/src/pages/AlumnoDetailPage.vue` contains the
  new `q-card v-if="memberProfile.status === 'prueba'"` block with
  q-select (LEAD_STATUS_OPTIONS), q-input (Comentarios textarea), and
  "Gestiona: <name>" caption. `onSaveLeadStatus` and `onSaveLeadNotes`
  handlers reference `membersApi.updateLead`. `watch(memberProfile,
immediate:true)` syncs `leadDraft`.
- Commits `2e3a5313` and `ec2c53e8` present in `git log --oneline -5`.
- `pnpm exec tsc --noEmit` clean (api) and baseline-only (admin).
- `pnpm test test/members/members-trial.test.ts` — 11/11 pass.
