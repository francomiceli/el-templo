---
phase: 102-trial-classes-sesiones-de-prueba
plan: 05
subsystem: admin-ui
tags: [admin-ui, alumnos, leads, trial-counter, filter, phase-102]
requirements_completed: [R7, R8]
one_liner: "Admin alumno detail gets an always-visible 'Clases de prueba' counter; AlumnosPage gains a 'Tipo' filter (Todos/Alumnos/Leads) wired to the Plan 03 API."
dependency_graph:
  requires:
    - "102-03 (API: MemberListItem.hasUsedTrial, MemberProfile.hasUsedTrial, status=todos|alumnos|leads querystring)"
  provides:
    - "Visual surface for R7: trial counter in the always-rendered header of AlumnoDetailPage"
    - "Visual surface for R8: 'Tipo' select filter on AlumnosPage passing status through to GET /admin/members"
    - "Admin TS types mirror the API contract: MemberListItem.hasUsedTrial + MemberListParams.status"
  affects:
    - "Staff workflow — leads are now discoverable from the list filter and distinguishable from members who never trialed"
tech_stack:
  added: []
  patterns:
    - "q-chip in header badge row with conditional color/outline driven by a boolean (mirrors the Activo/Inactivo q-chip adjacent to it)"
    - "Filter state using `null` default so the axios param serializer omits the querystring key — same convention as level/segment/avatarType filters on this page"
    - "Independent, composable filters (Estado and Tipo coexist; server intersects them per Plan 03 tests)"
key_files:
  created:
    - .planning/phases/102-trial-classes-sesiones-de-prueba/102-05-SUMMARY.md
  modified:
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
    - el-templo-admin/src/pages/AlumnosPage.vue
decisions:
  - "Counter placed as a q-chip immediately after the Activo/Inactivo q-chip in the header badge row (NOT inside SubscriptionCard) — SubscriptionCard is hidden for sub-less leads, and R7 requires the counter visible regardless of subscription state"
  - "Used `null` default for filters.status (not `'todos'`) so the serializer omits the key — matches level/segment/avatarType convention; the server treats absent status as 'todos' (no-op)"
  - "Label 'Tipo' for the new select, not 'Estado' — 'Estado' is already in use for Activo/Inactivo; renaming would break staff muscle memory"
  - "onExport forwards `filters.status` too — `exportMembers` signature already accepts `MemberListParams`, so Task 1's type addition made the forwarding type-safe with no composable change"
  - "Did NOT modify the Activo/Inactivo filter when Leads is selected — let the two filters compose server-side per Plan 03's already-tested intersection semantics"
metrics:
  duration: "~15 min (3 task commits, no deviations, no rework)"
  tasks_completed: 3
  tasks_total: 3
  commits: 3
  files_modified: 3
  files_created: 0
  date_completed: "2026-04-22"
commits:
  - "8775c658 feat(102-05): mirror hasUsedTrial + status on admin member types"
  - "ce800f8f feat(102-05): always-visible 'Clases de prueba' counter in alumno header (R7)"
  - "7885b95d feat(102-05): 'Tipo' filter with Todos/Alumnos/Leads on AlumnosPage (R8)"
---

# Phase 102 Plan 05: Admin UI — Trial Counter + Leads Filter Summary

## One-Liner

Admin `AlumnoDetailPage` header renders a `Clases de prueba: 0/1` / `1/1 usada` chip for every alumno regardless of subscription state (R7). `AlumnosPage` filter bar gains a new `Tipo` select (Todos / Alumnos / Leads) that threads through to `GET /admin/members?status=...` (R8). Admin TS types mirror the Plan 03 API contract.

## What Shipped

### TS types (`el-templo-admin/src/types/member.ts`)

- `MemberListItem.hasUsedTrial: boolean` (non-optional, added after `debt: ActiveDebt | null`).
- `MemberProfile.hasUsedTrial` inherited via `extends MemberListItem` — no separate declaration.
- `MemberListParams.status?: 'todos' | 'alumnos' | 'leads'` (optional, added after `country?: 'AR' | 'ES'`).

### AlumnoDetailPage header counter (R7)

Placement: inside the header `<div class="q-gutter-sm row items-center">` badge row, **immediately after** the Activo/Inactivo q-chip and **before** the segment badge. The header lives in the first `<q-card-section>` so it renders for every alumno — including sub-less leads where `SubscriptionCard` is not mounted.

Exact chip markup shipped (so future visual regression tests can assert against it byte-for-byte):

```vue
<q-chip
  :color="memberProfile.hasUsedTrial ? 'grey-7' : 'primary'"
  :text-color="memberProfile.hasUsedTrial ? 'white' : 'primary'"
  :outline="!memberProfile.hasUsedTrial"
  dense
  :label="
    memberProfile.hasUsedTrial
      ? 'Clases de prueba: 1/1 usada'
      : 'Clases de prueba: 0/1'
  "
  class="text-body2"
/>
```

Literal strings surfaced:

- `Clases de prueba: 0/1` — when `hasUsedTrial === false`.
- `Clases de prueba: 1/1 usada` — when `hasUsedTrial === true`.

Styling rationale:

- Unused → `color="primary"` + `outline` — subtle brand accent, signals "trial available".
- Used → `color="grey-7"` + `text-color="white"` (solid) — desaturated, signals "consumed".
- `dense` + `text-body2` matches the adjacent Activo/Inactivo chip visual weight.
- No emoji, Spanish copy, no new icon.

Guard: the chip is only rendered once `memberProfile` has loaded (template-level `v-if="memberProfile"` still wraps the surrounding `q-card-section`). It is **not** conditioned on `memberProfile.isActive`, on `subscription`, or on `SubscriptionCard` — always visible.

### AlumnosPage Tipo filter (R8)

**Filter bar position (column index 7 of the filter grid):**

| Col   | Label         | Field                                                |
| ----- | ------------- | ---------------------------------------------------- |
| 1     | Pais          | `selectedCountry` (owner-only)                       |
| 2     | Nuevo         | `openNewMember` button                               |
| 3     | Buscar        | `filters.search`                                     |
| 4     | Solo deudores | `filters.debtorOnly`                                 |
| 5     | Plan          | `filters.planId`                                     |
| 6     | Sucursal      | `filters.branchId`                                   |
| 7     | Nivel         | `filters.level`                                      |
| 8     | Estado        | `filters.isActive` (Todos / Activos / Inactivos)     |
| **9** | **Tipo**      | **`filters.status` (Todos / Alumnos / Leads) — NEW** |
| 10    | Segmento      | `filters.segment`                                    |
| 11    | Avatar        | `filters.avatarType`                                 |

The `Tipo` select sits between `Estado` and `Segmento`. Grid sizing `col-6 col-sm-3 col-md-2` matches its neighbors.

**Options array** (`tipoFilterOptions`, declared next to `statusFilterOptions` to avoid shadowing):

```typescript
const tipoFilterOptions: Array<{
  label: string;
  value: "todos" | "alumnos" | "leads" | null;
}> = [
  { label: "Todos", value: null },
  { label: "Alumnos", value: "alumnos" },
  { label: "Leads", value: "leads" },
];
```

**Filter state** (`reactive({ ... })`):

```typescript
status: null as 'todos' | 'alumnos' | 'leads' | null,
```

Default `null`, matching the page's convention for level / segment / avatarType — the axios param serializer omits the `status` querystring key when the user has not narrowed.

**Wire-through:**

- `loadMembers()` passes `status: filters.status ?? undefined` to `membersApi.getMembers(...)`.
- `onExport()` passes the same to `membersApi.exportMembers(...)`. `exportMembers` already types its input as `MemberListParams`, so Task 1's `status` addition made the export call type-safe with no signature change in the composable.
- `@update:model-value="onFilterChange"` triggers the existing page-1 reset + refetch pipeline.

**Coexistence with Estado filter:** Both filters are independent. Selecting `Leads` does NOT auto-set `Estado=Inactivos` — the server intersects the two predicates (per Plan 03's composed-filter test). `Estado` controls `users.is_active`; `Tipo=Leads` requires `no active subscription`. These are overlapping but distinct concepts, and staff may want, e.g., `Tipo=Leads AND Estado=Activos` if they reactivate a lead user account pre-conversion.

## File-Level Changes

| File                                             | Delta     | Purpose                                                     |
| ------------------------------------------------ | --------- | ----------------------------------------------------------- |
| `el-templo-admin/src/types/member.ts`            | +2 lines  | Mirror API contract                                         |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue` | +13 lines | Header counter chip                                         |
| `el-templo-admin/src/pages/AlumnosPage.vue`      | +22 lines | Tipo select + state + wire-through (loadMembers + onExport) |

## Verification

Automated (run before checkpoint):

```bash
cd el-templo-admin
pnpm tsc --noEmit -p tsconfig.json      # → exit 0
pnpm lint                                # → clean (no new errors in AlumnoDetailPage.vue / AlumnosPage.vue / types/member.ts)
```

Acceptance greps (from the PLAN `<verify>` block), all passing:

| Check                                                               | Result |
| ------------------------------------------------------------------- | ------ |
| `hasUsedTrial: boolean` in `src/types/member.ts`                    | PASS   |
| `status?: 'todos' \| 'alumnos' \| 'leads'` in `src/types/member.ts` | PASS   |
| `Clases de prueba: 0/1` literal in `AlumnoDetailPage.vue`           | PASS   |
| `Clases de prueba: 1/1 usada` literal in `AlumnoDetailPage.vue`     | PASS   |
| `memberProfile.hasUsedTrial` referenced in `AlumnoDetailPage.vue`   | PASS   |
| Counter appears BEFORE `SubscriptionCard` in the template           | PASS   |
| `tipoFilterOptions` declared                                        | PASS   |
| `label: 'Leads'` / `label: 'Alumnos'` options present               | PASS   |
| `status: null as` initializer present                               | PASS   |
| `status: filters.status` forwarded to API                           | PASS   |
| `v-model="filters.status"` on Tipo select                           | PASS   |

**Visual checkpoint (Task 4): SKIPPED per user direction.** User approved bypass — the automated verification above (tsc exit 0, lint clean, full grep acceptance list) is treated as satisfying Task 4. No manual browser QA performed against `Clases de prueba` counter rendering or Leads filter intersection — the server-side intersection is already covered by Plan 102-03's integration tests (`members-leads-filter.test.ts`, 8/8 passing), and the chip/select markup is byte-for-byte what the plan prescribed.

## Deviations from Plan

**None.** Plan executed exactly as written, across all three auto tasks. No Rule 1/2/3 fixes, no Rule 4 escalations. The visual checkpoint (Task 4) was skipped by user direction, not due to any discovered deviation.

## Drift vs SPEC

- **R7:** The counter is always visible in the header for every alumno, regardless of subscription state, avatar, or activity flag. Literal strings `Clases de prueba: 0/1` / `Clases de prueba: 1/1 usada` match the SPEC byte-for-byte.
- **R8:** `Tipo` filter with `Todos / Alumnos / Leads` options wires through `filters.status` to `GET /admin/members?status=...` and to `membersApi.exportMembers(...)`. Composes with Estado, Segmento, branch, level, etc. via server-side AND.
- **R9 (no Convert button):** Confirmed — no "Convertir en alumno" / "Convert to member" button was added. Staff convert leads via the existing Editar + Gestionar Plan flow.
- **R10 (member app untouched):** Confirmed — `git log --oneline --all -- el-templo-app/ | grep 102-` returns empty. No file under `el-templo-app/` was modified in this plan or anywhere in Phase 102.

## Out of Scope (Not Addressed Here)

- Export .xlsx column for trial history — Plan 03's SUMMARY noted this was deferred; Plan 05 confirms it is NOT needed for R7/R8 and does not add it.
- Bulk actions on the Leads-filtered list (e.g., bulk WhatsApp outreach). Not in SPEC; handled by staff manually.
- Member-side visibility of trial status (R10 forbids).

## Self-Check: PASSED

**Files modified (present in HEAD):**

- FOUND: `el-templo-admin/src/types/member.ts` — `hasUsedTrial: boolean` on MemberListItem (L63) + `status?: 'todos' | 'alumnos' | 'leads'` on MemberListParams (L151).
- FOUND: `el-templo-admin/src/pages/AlumnoDetailPage.vue` — q-chip with `Clases de prueba` labels wired to `memberProfile.hasUsedTrial`, placed in header badge row before `SubscriptionCard`.
- FOUND: `el-templo-admin/src/pages/AlumnosPage.vue` — `tipoFilterOptions` array, `filters.status` state, `Tipo` q-select, wire-through in `loadMembers` and `onExport`.

**Commits:**

- FOUND: `8775c658 feat(102-05): mirror hasUsedTrial + status on admin member types`
- FOUND: `ce800f8f feat(102-05): always-visible 'Clases de prueba' counter in alumno header (R7)`
- FOUND: `7885b95d feat(102-05): 'Tipo' filter with Todos/Alumnos/Leads on AlumnosPage (R8)`

**Verification:**

- `pnpm tsc --noEmit -p tsconfig.json` → exit 0.
- `pnpm lint` → clean on the three modified files.
- All acceptance-criteria greps from the PLAN pass.
- Visual checkpoint: skipped per user direction.
