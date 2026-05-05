---
phase: 112-enrollment-service-admin-add-ons
plan: 06
status: code-complete
manual_checkpoint_pending: true
date: 2026-05-05
requirements_closed:
  - ADDON-MEMBER-UI-01
  - ADDON-MEMBER-UI-02
---

## Summary

Plan 112-06 — Verified that the member-app program selector built in
phase 104 already surfaces `admin_addon` enrollments alongside
`plan_linked` and `plan_bundle` rows. Per D-21 the expected outcome was
**zero frontend code change** — confirmed.

The deferred deliverable is the manual staging walkthrough (Task 3) —
that requires staging deploy of Plan 112-05 admin UI + the API/migrations,
which has not happened yet.

## What was built

### Backend integration test (`el-templo-api`)

`test/programs/member-app-enrollment-dropdown.test.ts` — 4 passing tests
covering all three sources end-to-end against real MySQL:

| Test | Asserts                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| 1    | `plan_linked` enrollment surfaces in `/me/enrollments` for a member with a linked plan.                            |
| 2    | After admin POST add-on, `/me/enrollments` returns BOTH rows; DB cross-check confirms `source` provenance per row. |
| 3    | Bundle plan (`grants_all_programs=true`) auto-enrolls plan_bundle rows; admin add-on assigned afterwards survives. |
| 4    | Cross-member isolation — member B's token never returns member A's enrollments (defense-in-depth scoping).         |

```
✓ test/programs/member-app-enrollment-dropdown.test.ts (4 tests | 4 passed) 30151ms
```

### Frontend audit (zero patch needed)

- **`el-templo-app/src/modules/training/composables/useCurrentProgram.ts`** —
  audited. No `source` references, no source-based filtering. Composable
  delegates to `useUserStore.allActiveEnrollments`, which itself just
  passes through `list.data.enrollments` from the API. Source-agnostic
  end-to-end.
- **`el-templo-app/src/modules/programs/components/ProgramProgressCard.vue`** —
  audited. No `source` / `Add-on` / `Incluido en plan` references; the
  `q-menu` dropdown iterates `enrollments` without inspecting source.
  Per D-21 the member UI MUST NOT discriminate by source — added an
  inline comment near the dropdown render block to lock the rule in
  for future readers.

No member-app composable or component code was changed.

## Verification

- `cd el-templo-api && pnpm test test/programs/member-app-enrollment-dropdown.test.ts` →
  4 passed, 0 failed (30s with real DB).
- `cd el-templo-app && pnpm tsc --noEmit` → no errors introduced; the 23
  baseline TS errors (q-app/wrappers, page module imports, ImportMeta.env)
  pre-date Phase 112 and are unrelated to this plan.
- `grep -c "Add-on\|Incluido en plan" .../ProgramProgressCard.vue` → 0
  (no member-facing source distinction).
- `grep -nE "source|admin_addon|plan_linked|plan_bundle|filter\("
.../useCurrentProgram.ts` → 0 matches.

## Pending — Staging walkthrough (Task 3 checkpoint)

The 11-step manual end-to-end walkthrough has NOT been executed because
it requires staging deploy of:

- API migrations 0111 (program_enrollments addon columns) + 0112
  (transaction_links target_kind=enrollment) — committed locally, not
  deployed.
- Plan 112-04 admin add-on POST endpoint — committed.
- Plan 112-05 admin "Programas" tab — committed (this plan).

Walkthrough steps when staging is ready:

1. Admin → `/alumnos/{test-member-id}` → "Programas" tab.
2. "Asignar programa adicional" → select a non-enrolled program,
   `pricePaid=0`, submit → confirm row with "Add-on" badge.
3. Member app login as the same member.
4. Mi Templo / home — confirm program dropdown now shows N+1 entries.
5. Confirm NO visual distinction between sources in the member dropdown
   (D-21).
6. Select the add-on entry → weekly view re-renders with that program's
   week 1 content.
7. Repeat with `pricePaid=5000` → admin sees `$5.000`, member sees no
   visual difference, `financial_transactions` has the row.

If anything fails, drop back to Task 2 to patch.

## Files created / modified

```
el-templo-api/test/programs/member-app-enrollment-dropdown.test.ts  [created]
el-templo-app/src/modules/programs/components/ProgramProgressCard.vue [modified — comment only]
```

## Commits

```
a3b66261 test(112-06): /me/enrollments surfaces admin_addon alongside plan_linked
ac86a361 docs(112-06): document zero-code D-21 outcome in ProgramProgressCard
```

## End-of-phase requirements rollup

All 24 Phase 112 requirements have working code; staging walkthrough is
the only outstanding human gate (covers ADDON-ADMIN-UI-_ + ADDON-MEMBER-UI-_).

| Group           | IDs                    | Status                         |
| --------------- | ---------------------- | ------------------------------ |
| ENROLL          | ENROLL-01..05          | closed in Plan 02              |
| ADDON-SCHEMA    | ADDON-SCHEMA-01..05    | closed in Plan 01              |
| ADDON-API       | ADDON-API-01..06       | closed in Plan 04              |
| ADDON-LIFE      | ADDON-LIFE-01..04      | closed in Plan 03              |
| ADDON-ADMIN-UI  | ADDON-ADMIN-UI-01..05  | closed in Plan 05 (UX pending) |
| ADDON-MEMBER-UI | ADDON-MEMBER-UI-01..02 | closed in Plan 06 (UX pending) |

## Self-Check: PASSED (code + automated tests) — staging UAT pending operator
