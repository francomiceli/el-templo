---
phase: 151-registrar-cobro-pagos-cobros
plan: 05
subsystem: admin-finance-pos
tags:
  [
    cobro-wizard,
    sede-selector,
    branch-attribution,
    dead-end-guard,
    hygiene,
    vue,
    quasar,
    gap-closure,
  ]
requires:
  - "CobrosPage.vue wizard steps 1..4 (Plans 01-04)"
  - "CobroResumen.vue shared summary component (Plan 03)"
  - "landingForRole() single-source landing map (router/routes)"
provides:
  - "Sede (branch) selector reachable + editable for EVERY alta (existing member AND new student), not only inside the new-student mini-form"
  - "Resolved branch name surfaced read-only in CobroResumen for alta (operator awareness before Confirmar)"
  - "New-student dead-end guards: renew/misc associations disabled+hinted; canContinueStep misc requires an existing member"
  - "Dedup-adopted member (Usar ese alumno) loads autocompletar (debt banner, renew pre-fill, currency)"
  - "Idempotency key cleared on plan change (lost-success retry cannot no-op the old charge)"
  - "Voided historical rows badge 'Anulado' instead of unconditional 'Pendiente'"
  - "Role-denied router fallback delegates to landingForRole (no stale /pagos)"
affects: [152-caja, cobros-pos]
tech-stack:
  added: []
  patterns:
    - "Operator-visible branchId attribution restored (pre-151 PagosPage behavior) while server keeps deriving/validating the rest of the payload"
    - "Per-option disable helper (isAssociationDisabled) driven by a context computed (isNewStudentContext) to close wizard dead ends"
    - "Client-side landing delegated to the single landingForRole source instead of a duplicated local role→path map"
key-files:
  created: []
  modified:
    - el-templo-admin/src/pages/CobrosPage.vue
    - el-templo-admin/src/components/caja/CobroResumen.vue
    - el-templo-admin/src/router/index.ts
decisions:
  - "The single Sede q-select now lives in the step-2 alta block (mode is unknown until step 2), replacing the mini-form-only selector — exactly one v-model=sucursalId in the file"
  - "resumenSede returns the branch name for alta only (null for renew/misc, where branch is server-derived) so the CobroResumen Sede row hides itself outside alta"
  - "Validado-vs-Pendiente distinction NOT addressed (needs validationStatus on the list endpoint = backend, out of this frontend-only scope); only the worst misrepresentation (voided showing Pendiente) is fixed"
metrics:
  duration: ~10min
  completed: 2026-07-03
requirements-completed: [COBRO-01, COBRO-02, COBRO-03]
---

# Phase 151 Plan 05: Cobros gap-closure — Sede-for-every-alta + dead-end guards + hygiene Summary

Closed the two verified gaps from `151-VERIFICATION.md` (CR-01 blocker, WR-01 warning) plus the
four cheap low-risk warnings (WR-02..WR-05), frontend-only. The Sede (branch) selector — which
pre-151 `PagosPage.vue` rendered for every alta but 151-01..04 had buried inside the new-student
mini-form — is restored to the step-2 alta block, reachable and editable for both existing-member
and new-student altas, with the resolved branch surfaced read-only in `CobroResumen`. A new-student
context can no longer reach an unconfirmable dead end. No backend, schema, or migration changes;
Plans 01-04 untouched.

## What Was Built

### Task 1 — Sede for every alta + resumen surfacing + new-student dead-end guards (commit 6a295363)

- **CR-01 (blocker):** Removed the Sede `q-select` from the step-1 `showNewStudentForm` mini-form
  and rendered a single Sede `q-select` inside the step-2 `mode === 'alta'` block, before the
  plan grid, bound `v-model="sucursalId"` with `@update:model-value="onSucursalChange"`. There is
  now exactly one `v-model="sucursalId"` in the file, reachable for typeahead-selected existing
  members AND new students (both pass through step-2 alta). `sucursalId` default init,
  `loadBranches` fallback, `loadAltaPlans`, and the `FixedSchedulePicker :branch-id` binding were
  left untouched.
- **CR-01 (visibility):** Added `resumenSede` computed (branch name for alta only, else null) and
  passed `:sede="resumenSede"` to all three `CobroResumen` mounts (mobile expansion-item, step-4
  body, desktop panel). Added an optional `sede?: string | null` prop (default null) to
  `CobroResumen` with a `v-if="sede"` Sede row placed after Socio.
- **WR-01 (dead ends):** Added `isNewStudentContext` (mini-form open + no adopted member) and
  `isAssociationDisabled(value)` (true for renew/misc in a new-student context). The association
  q-item loop binds `:disable` and swaps the hint to "Solo para socios existentes" when disabled;
  `onSelectAssociation` early-returns for a disabled association so `mode` can never become
  renew/misc for a new student; `canContinueStep` case-2 misc now also requires
  `selectedMember.value != null`.

### Task 2 — Cheap hygiene: dedup autocompletar, idempotency-on-plan-change, voided badge, router fallback (commit 706dba6a)

- **WR-02:** `onUsarExistente` now calls `void loadAutocompletar(m.id)` after adopting the
  dedup-matched member, mirroring `onMemberSelected`, so debt banner / renew pre-fill / currency
  populate.
- **WR-04:** `selectPlan` now nulls `currentIdempotencyKey`, matching `onSucursalChange` /
  `resetChargeFields`, so a plan change starts a fresh idempotency attempt.
- **WR-03:** The portada listado badge is now conditional — `voidedAt != null` → `negative`
  "Anulado", else `warning` "Pendiente".
- **WR-05:** The role-denied router branch deleted its local `defaultPages` map (and the stale
  `/pagos` fallback) and now `return landingForRole()`; the `trainingOnly` bounce is untouched.

## Deviations from Plan

None — plan executed exactly as written. (Pre-commit lint-staged reformatted the touched files via
Prettier/ESLint as expected per project convention; no functional change.)

## Known Stubs

None introduced.

The Validado-vs-Pendiente badge distinction remains intentionally out of scope: the listado
endpoint does not expose `validationStatus` on `TransactionListItem`, so distinguishing "Validado"
from "Pendiente" requires a backend change. This plan only removed the worst misrepresentation (a
voided charge badged "Pendiente"). A future backend plan (or 152 Caja, which already surfaces
per-row validation state) can carry the full distinction into this listado.

## Verification

- `npx vue-tsc --noEmit` — no type errors in `CobrosPage.vue`, `CobroResumen.vue`, or
  `router/index.ts`.
- `grep -c 'v-model="sucursalId"'` = 1; `grep -c ':sede="resumenSede"'` = 3; no hard-coded hex in
  either touched .vue file.
- `grep -c defaultPages router/index.ts` = 0; `grep -c "'/pagos'" router/index.ts` = 0;
  `return landingForRole()` present.

## Self-Check: PASSED

All modified files and both task commits (6a295363, 706dba6a) verified present.
