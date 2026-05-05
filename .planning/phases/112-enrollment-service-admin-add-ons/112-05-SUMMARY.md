---
phase: 112-enrollment-service-admin-add-ons
plan: 05
status: code-complete
manual_checkpoint_pending: true
date: 2026-05-05
requirements_closed:
  - ADDON-ADMIN-UI-01
  - ADDON-ADMIN-UI-02
  - ADDON-ADMIN-UI-03
  - ADDON-ADMIN-UI-04
  - ADDON-ADMIN-UI-05
---

## Summary

Plan 112-05 — Admin "Programas" surface in `el-templo-admin`. **Code complete; the
11-step manual UX walkthrough (Task 3 checkpoint) is deferred to operator
verification when staging is up.**

## What was built

### Backend (el-templo-api)

- **`programs/service.ts` — `getEnrollmentsByUser` + `getActiveEnrollment`** now
  LEFT JOIN `users assigner` (Drizzle `alias()` helper) and project
  `source`, `pricePaid`, `assignedByName` (resolved from `firstName + lastName`,
  `null` when `assigned_by IS NULL`). Existing assertions in
  `programs.test.ts` are unaffected — the response shape is a superset.
- **`programs/types.ts`** — `EnrollmentSource` union exported; `ProgramEnrollment`
  gains `source`, `pricePaid`, `assignedByName`.

### Admin frontend (el-templo-admin)

- **`types/program.ts`** — `EnrollmentSource` union added; `EnrollmentStatus`
  extended with `'paused'`; `ProgramEnrollment` gains the 3 provenance fields;
  new `ProgramOption` and `AssignAddonPayload` types.
- **`composables/useProgramsApi.ts`** — 3 new methods:
  - `listEnrollmentsForUser(userId)` (alias over the existing
    `getUserEnrollments`).
  - `listActivePrograms()` — client-side filter over `getPrograms()`; keeps
    the surface narrow until a dedicated `?isActive=true` query param is
    needed at scale.
  - `assignAddon(userId, payload)` — POST to
    `/admin/users/:userId/program-addons`.
- **`components/MemberProgramsTab.vue`** — tab body that lists enrollments
  with provenance chips (`Add-on` accent / `Incluido en plan` primary),
  shows price (`'Regalo'` when `null` or `0`, `$X` otherwise), assigned
  date (`es-AR` locale), and assigning admin name. Per-row cancel uses
  `$q.dialog` with explicit "Cancelar inscripcion" CTA + warning copy.
- **`components/AssignProgramAddonDialog.vue`** — `q-dialog` modal with
  program select (filters out `existingProgramIds`), `pricePaid` (default 0,
  hint explaining 0 = regalo and >0 emits `plan_charge`), notes textarea
  with 500-char counter. Backend errors mapped per D-22:

  | Backend code             | Status | Spanish copy                                                                             |
  | ------------------------ | ------ | ---------------------------------------------------------------------------------------- |
  | `ASSIGN_PLAN_FIRST`      | 400    | Asigna un plan al miembro antes de agregar un programa adicional.                        |
  | `PROGRAM_ALREADY_ACTIVE` | 409    | El miembro ya esta inscripto en este programa. Cancela la inscripcion existente primero. |
  | (none)                   | 403    | No tienes permisos para asignar programas.                                               |
  | (none)                   | 404    | Programa no encontrado o inactivo.                                                       |
  | (none)                   | 5xx    | Error inesperado, intenta nuevamente.                                                    |

- **`pages/AlumnoDetailPage.vue`** — 7th tab "Programas" wired between
  "Suscripcion" and "Asistencia": `<q-tab name="programas" label="Programas" />`
  - `<q-tab-panel name="programas"><MemberProgramsTab :user-id="userId" /></q-tab-panel>`
  - import.

## Verification

- `cd el-templo-api && pnpm tsc --noEmit` — clean (pre-existing baseline OK).
- `cd el-templo-admin && pnpm tsc --noEmit` — no errors in Phase 112 files
  (`useProgramsApi`, `MemberProgramsTab`, `AssignProgramAddonDialog`,
  `AlumnoDetailPage`, `types/program`). 3 baseline pdfmake errors in
  `session-pdf-builder.ts` exist pre-Phase 112 and are unrelated.
- `npx eslint -c ./eslint.config.js src/components/MemberProgramsTab.vue
src/components/AssignProgramAddonDialog.vue --max-warnings 0` — clean.
- `grep -c "MemberProgramsTab" .../AlumnoDetailPage.vue` → 2.
- `grep -c 'name="programas"' .../AlumnoDetailPage.vue` → 2.
- `grep -c "ASSIGN_PLAN_FIRST\|PROGRAM_ALREADY_ACTIVE" AssignProgramAddonDialog.vue` → 2.
- `grep -c "Add-on\|Incluido en plan" MemberProgramsTab.vue` → 2.

## Pending — Manual UX walkthrough (Task 3 checkpoint)

The 11-step manual verification flow described in Plan 112-05 Task 3 has
NOT been executed. Run when ready:

```bash
cd el-templo-admin && pnpm dev   # local dev server pointed at staging API
```

Then walk through:

1. Login as admin → `/alumnos/{userId}` for a member with active sub.
2. Confirm "Programas" tab appears between "Suscripcion" and "Asistencia".
3. List loads (rows OR empty banner); rows show provenance chip + week
   info; add-on rows show price/date/assigner.
4. Click "Asignar programa adicional" → modal opens with select + price + notes.
5. Already-enrolled programs filtered out of the dropdown.
6. Submit `pricePaid=0` → success toast, list refresh, "Regalo" price.
7. Submit `pricePaid=5000` → success; verify `financial_transactions` row
   `kind='plan_charge', direction='inflow', amount=5000`.
8. Per-row cancel → confirmation dialog → "Inscripcion cancelada." toast.
9. Negative path 1: member with no active sub → "ASSIGN_PLAN_FIRST" copy.
10. Negative path 2: duplicate program (bypass via DevTools) → 409 copy.
11. Negative path 3: coach role → 403 copy on assign mutator.

## Files created / modified

```
el-templo-api/src/modules/programs/service.ts              [modified]
el-templo-api/src/modules/programs/types.ts                [modified]
el-templo-admin/src/types/program.ts                       [modified]
el-templo-admin/src/composables/useProgramsApi.ts          [modified]
el-templo-admin/src/components/MemberProgramsTab.vue       [created]
el-templo-admin/src/components/AssignProgramAddonDialog.vue [created]
el-templo-admin/src/pages/AlumnoDetailPage.vue             [modified]
```

## Commits

```
897fa039 feat(112-05): extend getEnrollmentsByUser + admin composable for add-on UI
972c334f feat(112-05): MemberProgramsTab + AssignProgramAddonDialog components
db40efac feat(112-05): wire MemberProgramsTab into AlumnoDetailPage
```

## Self-Check: PASSED (code) — UX checkpoint pending operator approval
