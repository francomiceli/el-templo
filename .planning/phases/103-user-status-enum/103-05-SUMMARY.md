---
phase: 103
plan: 05
subsystem: admin-app
tags: [admin, ui, refactor, user-status]
requires:
  - 103-01 (users.status enum + migration)
  - 103-04 (members API + admin types migrated)
provides:
  - 4-state user lifecycle badge in admin AlumnosPage + AlumnoDetailPage
  - Single Estado dropdown filter (replaces dual isActive + leadsOnly toggles)
  - Shared useStatusBadge composable for color/label mapping
affects:
  - el-templo-admin/src/pages/AlumnosPage.vue
  - el-templo-admin/src/pages/AlumnoDetailPage.vue
tech-stack:
  added: []
  patterns:
    - Shared composable for cross-page color/label mapping (DRY)
key-files:
  created:
    - el-templo-admin/src/composables/useStatusBadge.ts
  modified:
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
decisions:
  - "useStatusBadge composable named-exports getColor/getLabel; default null branch returns grey + em-dash for type-safe staff rows"
  - "Renamed local destructured names to getStatusColor/getStatusLabel inside pages so the call sites stay self-explanatory at the chip level"
  - "Trial counter v-if uses status !== 'activo' (preserves original semantic — counter visible for freemium/prueba/inactivo) instead of the more restrictive status === 'prueba'"
  - "API call sites collapsed: removed isActive + leadsOnly?'leads':undefined dual logic, kept single status: filters.status ?? undefined"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  tasks_total: 3
  files_changed: 3
  completed_date: "2026-04-25"
status: code-complete-ux-pending
---

# Phase 103 Plan 05: AlumnosPage + AlumnoDetailPage UI refactor — Summary

Replaced the legacy binary `isActive` + `leadsOnly` admin filter and badge surface with a single 4-state lifecycle UI driven by `users.status`, materializing the enum that Plans 103-01..04 introduced underneath. Both list and detail pages now share a `useStatusBadge` composable so colors and labels can never drift apart.

## What shipped

### New composable: `useStatusBadge`

Location: `el-templo-admin/src/composables/useStatusBadge.ts`

```ts
const { getColor, getLabel } = useStatusBadge();
getColor("freemium"); // 'info'
getLabel("prueba"); // 'En Prueba'
getColor(null); // 'grey'  (defensive: staff rows are NULL by design)
getLabel(undefined); // '—'
```

Color map per CONTEXT D-10:

| Status     | Color      | Label     |
| ---------- | ---------- | --------- |
| `freemium` | `info`     | Freemium  |
| `prueba`   | `warning`  | En Prueba |
| `activo`   | `positive` | Activo    |
| `inactivo` | `grey`     | Inactivo  |
| `null`     | `grey`     | `—`       |

### AlumnosPage — D-15 8 edits applied

| #   | D-15 edit                                                            | Status | Notes                                                                 |
| --- | -------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| 1   | q-select v-model `filters.isActive` -> `filters.status`              | done   | line 113                                                              |
| 2   | `statusFilterOptions` -> 5 options                                   | done   | typed `Array<{label,value:UserStatus\|null}>`                         |
| 3   | other q-select props unchanged                                       | done   | `dense outlined emit-value map-options @update:model-value` preserved |
| 4   | DELETE `Solo Leads` q-toggle wrapper (lines 61-68)                   | done   | full `<div>` removed, debtor toggle preserved                         |
| 5   | filters reactive object: drop `isActive` + `leadsOnly`, add `status` | done   | typed `UserStatus \| null`                                            |
| 6   | API call sites: collapse to `status: filters.status ?? undefined`    | done   | both `loadMembers` (line 676) and `onExport` (line 717)               |
| 7   | Row chip: render via `useStatusBadge` from `props.row.status`        | done   | lines 242-243                                                         |
| 8   | Column def: `field: 'isActive'` -> `field: 'status'`                 | done   | column index unchanged                                                |

Grep confirmation:

```bash
grep -n "isActive\|leadsOnly" src/pages/AlumnosPage.vue
# 339:  // Phase 103 R10: replaces previous boolean isActive + leadsOnly toggles.
# (only the historical doc comment remains; no live references)
```

### AlumnoDetailPage — header badge + trial counter migration

- Header chip (lines ~52-57): now reads `getColor(memberProfile.status)` / `getLabel(memberProfile.status)` instead of the binary `isActive` ternary.
- Trial counter `v-if` flipped from `!memberProfile.isActive` to `memberProfile.status !== 'activo'` — preserves the original semantic (counter visible for non-active users) while pivoting onto the first-class status field.
- Composable imported and instantiated alongside the existing API composables.

Grep confirmation:

```bash
grep -n "memberProfile\.isActive" src/pages/AlumnoDetailPage.vue
# (no matches)
```

## Verification

### Automated (passed)

| Check                        | Command                                                                                                               | Result                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| TypeScript (admin)           | `cd el-templo-admin && pnpm tsc --noEmit`                                                                             | passes (only the 3 pre-existing pdfmake baseline errors remain — no new errors introduced) |
| Quasar build                 | `cd el-templo-admin && pnpm build`                                                                                    | passes — built to `dist/spa`                                                               |
| Grep gate (AlumnosPage)      | `grep -n 'filters\.isActive\|leadsOnly' src/pages/AlumnosPage.vue`                                                    | only doc comment remains                                                                   |
| Grep gate (AlumnoDetailPage) | `grep -n 'memberProfile\.isActive' src/pages/AlumnoDetailPage.vue`                                                    | 0 matches                                                                                  |
| Composable presence          | `grep -n 'useStatusBadge' src/pages/AlumnosPage.vue src/pages/AlumnoDetailPage.vue src/composables/useStatusBadge.ts` | 5+ matches across all three files                                                          |

### Manual UX verification — PENDING USER

The plan declares `autonomous: false` because the visual outcome (colors, labels, filter behavior) is best confirmed by a human in the dev server. Code is complete and the build is clean; the user runs the checklist below to close the loop.

**To verify (user runs):**

```bash
cd el-templo-admin && pnpm dev
```

Then login as admin and check the following 11 items:

1. AlumnosPage filter row contains a dropdown labeled **"Estado"** with 5 options when opened: Todos, Freemium, En Prueba, Activos, Inactivos.
2. The previous **"Solo Leads"** toggle is GONE from the filter row (debtor toggle still present).
3. Selecting **"Activos"** -> only members with active subscription show; badge **green**, labeled "Activo".
4. Selecting **"En Prueba"** -> only members with trial booking and no sub show; badge **orange/yellow**, labeled "En Prueba".
5. Selecting **"Freemium"** -> only ONLINE-branch self-registered members with no sub show; badge **blue/cyan**, labeled "Freemium".
6. Selecting **"Inactivos"** -> only ex-members (cancelled subs) show; badge **grey**, labeled "Inactivo".
7. Selecting **"Todos"** -> all 4 badge colors mix in the same list.
8. Click on any member row -> AlumnoDetailPage opens; header chip uses the same 4-state badge styling (matches the row chip color/label).
9. For a non-active member (Freemium / En Prueba / Inactivo), the trial counter chip ("Clases de prueba: 0/1" or "1/1 usada") shows in the header.
10. For an Active member, the trial counter chip is HIDDEN.
11. Click **"Exportar"** -> the resulting Excel has an `Estado` column showing the 4 possible labels (not just Activo/Inactivo).

Reply with **`approved`** if all 11 pass, or describe any miss (e.g., "freemium badge is grey not blue" -> color mapping bug).

## Deviations from Plan

None — all 8 D-15 edits applied exactly as specified, plus the 2-edit AlumnoDetailPage migration. No auto-fixes or scope expansion. The pdfmake TS errors are pre-existing baseline noise (Phase 100 era), unrelated to this plan.

### Auth gates

None.

## Commits

| Task | Hash       | Message                                                                 |
| ---- | ---------- | ----------------------------------------------------------------------- |
| 1    | `70d4668f` | feat(103-05): refactor AlumnosPage filter + chip to 4-state user status |
| 2    | `327fea5a` | feat(103-05): migrate AlumnoDetailPage header badge to 4-state status   |

## TDD Gate Compliance

N/A — plan type is `execute` (not `tdd`); no test gate required.

## Self-Check: PASSED

- File `el-templo-admin/src/composables/useStatusBadge.ts` — FOUND
- File `el-templo-admin/src/pages/AlumnosPage.vue` — FOUND (modified)
- File `el-templo-admin/src/pages/AlumnoDetailPage.vue` — FOUND (modified)
- Commit `70d4668f` — FOUND in git log
- Commit `327fea5a` — FOUND in git log
