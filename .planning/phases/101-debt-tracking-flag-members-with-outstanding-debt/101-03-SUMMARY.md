---
phase: 101-debt-tracking-flag-members-with-outstanding-debt
plan: 03
subsystem: admin/members
tags: [debt, admin, quasar, vue, ui, form-dialog, filter-bar]
dependency_graph:
  requires:
    - el-templo-admin/src/types/member.ts (extended with debt types)
    - el-templo-admin/src/composables/useMembersApi.ts (getMembers return shape)
    - Plan 02 API contract (PUT /admin/members/:userId accepts debt; GET /admin/members returns totalDebtByCurrency)
  provides:
    - ActiveDebt / DebtUpsertInput / TotalDebtRow / MembersListResponse / DEBT_CURRENCY_OPTIONS types
    - MemberFormDialog Deuda section (edit mode only)
    - AlumnosPage row-split filter bar + Solo deudores toggle + conditional banner + conditional Deuda column
  affects:
    - Any admin page that consumed the old `{ members, total }` destructure from getMembers continues to work (additive totalDebtByCurrency field)
tech_stack:
  added: []
  patterns:
    - hadDebtOnLoad ref to distinguish "omit key" vs "null cancel" on update PUT
    - visibleColumns computed that appends a column when debtorOnly toggle is on, keeping the base columns array stable
    - Client-side amount > 0 guard pattern (D-13) — server-side JSON schema remains authoritative
key_files:
  created:
    - .planning/phases/101-debt-tracking-flag-members-with-outstanding-debt/101-03-SUMMARY.md
  modified:
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/composables/useMembersApi.ts
    - el-templo-admin/src/components/MemberFormDialog.vue
    - el-templo-admin/src/pages/AlumnosPage.vue
decisions:
  - Deuda section in EDIT mode only — create-mode stepper is untouched per plan (D-12 "Add a Deuda section", shown at bottom of edit form). New members can be flagged as debtors on their next edit.
  - hadDebtOnLoad ref tracks whether to emit `debt: null` (explicit cancel) vs. omit the key entirely when toggle is off. Omitting the key preserves backward compatibility for non-admin staff editing profile fields (recepcion PUT with no `debt` key → 200; same recepcion PUT with `debt: null` → 403 per Plan 02 RBAC gate).
  - visibleColumns computed preferred over mutating the const columns array — keeps columns definition stable and readable, reverts cleanly when toggle flips.
  - Banner styling: q-banner with bg-red-1 / text-red-10, dense, rounded. Matches admin app's other alert banners and stays within Quasar's built-in palette (no custom CSS).
  - Locale for formattedTotalDebt uses `toLocaleString()` (default locale) — produces "20,000" on en-US and "20.000" on es-AR. Admins in Argentina typically run with es-AR browser locale; per D-07 the exact separator is unspecified so we accept either. The DEUDA column uses the same formatter for consistency.
  - Removed stale `MemberListItem` import from useMembersApi after the getMembers return type switched to `MembersListResponse`.
metrics:
  duration_sec: 299
  completed_date: "2026-04-22"
  tasks_completed: 4
  files_touched: 4
---

# Phase 101 Plan 03: Debt Tracking Admin UI Summary

**One-liner:** Shipped the admin frontend for debt tracking — types + composable consume Plan 02's API shape, MemberFormDialog gains a Deudor toggle + amount/currency/note fields in edit mode, and AlumnosPage's filter bar splits into two rows with a Solo deudores toggle that reveals a total-debt banner grouped by currency and a Deuda column per row.

## What Was Built

### 1. Types extension (`el-templo-admin/src/types/member.ts`)

Additive types, no removals:

- `DEBT_CURRENCIES = ['ARS', 'EUR', 'USD'] as const` + `DebtCurrency` literal union
- `DEBT_CURRENCY_OPTIONS: Array<{ label, value: DebtCurrency }>` — consumed by MemberFormDialog's q-select
- `ActiveDebt { amount: number; currency: string; note: string | null }`
- `TotalDebtRow { currency: string; amount: number }`
- `DebtUpsertInput { amount: number; currency: DebtCurrency; note?: string | null }`
- `MembersListResponse { members: MemberListItem[]; total: number; totalDebtByCurrency: TotalDebtRow[] }`
- `MemberListItem.debt: ActiveDebt | null` (propagates to MemberProfile via extension)
- `MemberListParams.debtorOnly?: boolean`
- `UpdateMemberInput.debt?: DebtUpsertInput | null` — `object` upserts, `null` cancels, omitted leaves untouched

### 2. API composable (`el-templo-admin/src/composables/useMembersApi.ts`)

- `getMembers(params?: MemberListParams): Promise<MembersListResponse>` — return type now carries `totalDebtByCurrency`. Callers that destructure only `{ members, total }` continue to work (D-17 backward compatibility).
- `updateMember` signature unchanged — `UpdateMemberInput` already carries the optional `debt` field.
- All other methods (createMember, toggleMemberStatus, notes, plans, branches, export) untouched.
- Removed the now-unused `MemberListItem` import.

### 3. MemberFormDialog Deuda section

Edit mode only. Template additions, inserted after the Contacto de Emergencia expansion-item, inside the `<q-form>` and before `</q-card-section>`:

- `q-separator` + "Deuda" subtitle heading
- `q-toggle` "Deudor" (color="negative")
- `v-if="form.isDebtor"` reveals:
  - `q-input` type="number" "Monto adeudado \*" with client-side `val > 0` rule
  - `q-select` "Moneda" bound to `debtCurrencyOptions` (emit-value, map-options)
  - `q-input` type="textarea" "Nota (opcional)" with maxlength="500" and the exact D-12 placeholder:
    `Aclarar de qué suscripción es la deuda (ej: debe $20000 de la mensualidad de abril)`

Script additions:

- Four new form fields: `isDebtor`, `debtAmount`, `debtCurrency`, `debtNote`
- `hadDebtOnLoad` ref — tracks whether the loaded member already had an active debt
- `debtCurrencyOptions` re-exports `DEBT_CURRENCY_OPTIONS` for template consumption
- `watch(() => props.modelValue)` now populates the four debt fields from `props.member.debt` in edit mode and resets them in create mode
- `onSubmit` edit branch computes `debtPayload` based on toggle + `hadDebtOnLoad`:
  - toggle on → validate amount > 0 (notify + return on 0/null), build `{ amount, currency, note: note.trim() || null }`
  - toggle off + had debt on load → `null` (explicit cancel)
  - toggle off + none on load → `undefined` (omit key; avoids triggering the 403 for non-admin callers per Plan 02 RBAC)
  - `updatePayload.debt` is only set when `debtPayload !== undefined`

Create-mode stepper is intentionally untouched (see Decisions).

### 4. AlumnosPage row-split + Solo deudores toggle + banner + column

Template:

- **Row 1** (search + actions): 8/12 or 9/12 col for search input, remaining col for Export (icon round) + Nuevo buttons
- **Row 2** (filters): Plan / Sucursal / Nivel / Estado / Segmento / Avatar + `Solo deudores` q-toggle (color negative)
- **Banner** between Row 2 and q-table, `v-if="filters.debtorOnly && totalDebtByCurrency.length > 0"` — bg-red-1 / text-red-10, dense, rounded, text `<strong>Deuda total:</strong> {{ formattedTotalDebt }}` where `formattedTotalDebt` joins `${currency} $${amount.toLocaleString()}` with `·`
- **q-table** now binds `:columns="visibleColumns"` (the computed)

Script:

- `filters.debtorOnly: boolean` (default false) added to the reactive
- `totalDebtByCurrency = ref<TotalDebtRow[]>([])` state
- `formattedTotalDebt` computed — D-07 format `ARS $X · USD $Y`
- `visibleColumns` computed spreads the base `columns` and appends a `'deuda'` column when `filters.debtorOnly` is true (right-aligned, 140px, format: `${currency} $${amount.toLocaleString()}` for non-null debts, `''` otherwise)
- `loadMembers` now passes `debtorOnly: filters.debtorOnly || undefined` and captures `result.totalDebtByCurrency ?? []`
- `onExport` is intentionally untouched — debt is out of scope for Excel export per CONTEXT.

## Quasar Component Quirks Encountered

1. **`v-model.number` on `q-input type="number"`** — works as documented, but needs the validation rule typed as `(val: number | null)` because Quasar coerces empty input back to `null` (not `''` or `NaN`). The plan's rule expression handles this correctly.
2. **`q-toggle` with `color="negative"`** — Quasar maps this to the theme's `--q-negative` (red) — consistent with the banner color. No custom CSS needed.
3. **`QTableProps['columns']` is `readonly` by default** — using `[...(columns as NonNullable<QTableProps['columns']>)]` to spread into a mutable array before `.push()` keeps vue-tsc happy.
4. **`q-banner` dense + rounded** — requires `dense` attribute (Boolean prop) plus the `rounded` attribute; `class="bg-red-1 text-red-10 q-mb-sm"` supplies the styling. No `color` prop needed.

## Banner Format Decision

**Choice:** `q-banner` with `bg-red-1` + `text-red-10`, `dense`, `rounded`. Rationale: matches Quasar's own admin conventions (used elsewhere in the admin app for payment-due alerts and low-stock warnings); visually distinguishes "debt total" from the table without competing with the segment badges (which also use color); integrates with Quasar theme tokens so it respects dark mode if ever enabled.

**Format string:** `Deuda total: ARS $X · USD $Y · EUR $Z` (middle-dot separator `·` U+00B7). One segment per currency returned by the API; hidden currencies (empty sum) are already omitted server-side. `amount.toLocaleString()` without an explicit locale — defers to the browser's locale, which in AR produces `20.000` and in the US/ES produces `20,000`. Accepted per D-07 ("exact separator unspecified").

**Opted NOT** to include a currency-coverage footnote under the banner (like "(solo Chapadmalal)"). The banner already visually updates when filters change, and the filter bar is right above it. Keeps UI lean per v1 scope.

## Deferred / Nice-to-have

**AlumnoDetailPage "DEUDOR · ARS $X" chip** — NOT included in v1, per CONTEXT Deferred section and plan `<output>` guidance. The member profile endpoint returns `debt` now (Plan 02), so any future phase can add the chip without backend work.

## Deviations from Plan

None. All three code tasks executed verbatim as specified:

- Task 1 extended types + composable exactly per the action block.
- Task 2 added the Deuda section at the specified insertion point with the exact D-12 placeholder text, wired submit with the three-case `debtPayload` and the `UpdateMemberInput` type annotation.
- Task 3 split Row 1 / Row 2 as specified, added banner with the exact format, added `visibleColumns` computed, wired `debtorOnly` into loadMembers, and left `onExport` untouched.

One minor post-Task-3 cleanup: removed the now-unused `MemberListItem` import from `useMembersApi.ts` (lint warning after refactoring `getMembers` return type). Non-functional, no behavior change.

## Auth Gates

None. All work was against local source files and local tooling (`npx vue-tsc`, `pnpm lint`).

## Task 4 — UAT Checkpoint (auto-approved per AFK chain)

**Status:** AUTO-APPROVED under AFK chain rules. Plan frontmatter has `autonomous: false` but the execution chain explicitly overrides this (`AFK chain auto-accepts`).

**What the executor verified autonomously (falsifiable proxies for each UAT step):**

1. Filter-bar layout (UAT step 1) — grep confirms `Filter bar — Row 1` and `Filter bar — Row 2` markers, plus the expected column structure (search wide on Row 1, 6 filters + toggle on Row 2). Visual rendering requires a browser.
2. Default state (step 2) — when `filters.debtorOnly === false`, `v-if="filters.debtorOnly && totalDebtByCurrency.length > 0"` on the banner is false → banner hidden; `visibleColumns` returns `[...columns]` unchanged → no Deuda column. Source-level guarantees hold.
3. Flag a member as debtor (step 3) — onSubmit builds a debt object payload when toggle is on and amount > 0; the client-side guard emits a `$q.notify` and returns early on 0/null amount. Network request wiring verified via type-check on the `UpdateMemberInput` shape matching Plan 02's PUT schema.
4. Appears in list (step 4) — loadMembers passes `debtorOnly: filters.debtorOnly || undefined`; `totalDebtByCurrency` is captured from response.
5. Upsert (step 5) — edit dialog populates form from `props.member.debt`; submit sends a fresh object, no debt-specific extra fields. Backend Plan 02 test 2 confirms upsert semantics server-side.
6. Cancel (step 6) — toggling off when `hadDebtOnLoad === true` sets `debtPayload = null`; Plan 02 test 3 confirms soft-cancel semantics server-side (`is_cancelled = 1`, row preserved).
7. Multi-currency total (step 7) — formattedTotalDebt maps over `totalDebtByCurrency` and joins with `·`. Ordering follows what the server returns; both currencies are rendered.
8. Filter scope interaction (step 8) — Plan 02 already aggregates `totalDebtByCurrency` over the same `whereClause` as the list query, so changing a branch filter propagates into both the rows and the total by construction.
9. RBAC smoke test (step 9) — cannot be verified without a live server; Plan 02 test 9 asserts the 403 response for recepcion on `debt: {...}` and `debt: null`. The admin UI will surface this via `extractError` → `$q.notify` in the existing catch block of `onSubmit` (no new code needed — the generic error path handles 403 responses).

**Open UAT items for user's next interactive session:**

1. Visual regression: confirm Row 1/Row 2 layout breathes correctly on mobile (sm-breakpoint) and desktop.
2. Open an alumno's edit dialog, toggle Deudor, enter 20000 ARS, Guardar. Verify the dialog closes, the alumno re-appears in the list when `Solo deudores` is flipped on, and the banner reads `ARS $20.000` (or `ARS $20,000` depending on locale).
3. Perform the DB checks in steps 5 and 6 (upsert: single active row; cancel: row preserved with `is_cancelled=1`).
4. Optional: log in as a `recepcion` test account and confirm a 403 toast appears when trying to Guardar with the toggle on.

## Known Stubs

None. No placeholder text, no `TODO`, no hardcoded mock data flowing to UI. `totalDebtByCurrency` defaults to `[]` and the banner's `v-if` gate ensures it never renders an empty banner. `debt` on each row is `null` when the user has no active debt (not a stub — correct business state).

## Threat Flags

No new threat surface beyond the plan's `<threat_model>`. The three frontmatter threats (T-101-20 tampering, T-101-21 info disclosure, T-101-22 EoP) are mitigated as planned:

- T-101-20: client validates amount > 0; server re-validates via JSON schema (Plan 02 tests 6-8).
- T-101-21: AlumnosPage is admin-only via existing route guard.
- T-101-22: UI does not restrict the Deuda section by role; server returns 403 on non-admin debt writes. The `$q.notify` in onSubmit's catch branch surfaces this as a Spanish error toast via the existing `extractError` utility.

T-101-23 (PII in notes) is accepted — placeholder text discourages it; no PII scrubbing in v1.

## Commits

| Task | Name                                                                                    | Commit     | Files                                                                                                     |
| ---- | --------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| 1    | Extend member types + API composable for debt tracking                                  | `0ecc3c4f` | `el-templo-admin/src/types/member.ts`, `el-templo-admin/src/composables/useMembersApi.ts`                 |
| 2    | Add Deuda section to MemberFormDialog edit mode                                         | `78f1ca48` | `el-templo-admin/src/components/MemberFormDialog.vue`                                                     |
| 3    | AlumnosPage row-split filters + Solo deudores toggle + banner + Deuda column            | `ee4d4916` | `el-templo-admin/src/pages/AlumnosPage.vue`, `el-templo-admin/src/composables/useMembersApi.ts` (cleanup) |
| 4    | UAT checkpoint (auto-approved per AFK chain; open items for user's return listed above) | n/a        | n/a                                                                                                       |

## Success Criteria

- [x] Types + composable extended without breaking existing consumers
- [x] MemberFormDialog Deuda section: toggle, amount (validated), currency select, note (placeholder + maxlength 500)
- [x] Submit distinguishes upsert / cancel / unchanged (via hadDebtOnLoad)
- [x] AlumnosPage filter bar = two rows (D-10)
- [x] Solo deudores toggle filters list and reveals banner + column (D-11)
- [x] Banner format matches D-07 (`ARS $X · USD $Y`)
- [ ] UAT checkpoint (Task 4) — auto-approved; manual verification deferred to user's next interactive session
- [x] No console.log, no any, Spanish labels, English code

## Self-Check

- FOUND: `el-templo-admin/src/types/member.ts` (modified; contains ActiveDebt, DEBT_CURRENCIES, DEBT_CURRENCY_OPTIONS, MembersListResponse, TotalDebtRow, DebtUpsertInput, debt field on MemberListItem, debtorOnly on MemberListParams, debt on UpdateMemberInput)
- FOUND: `el-templo-admin/src/composables/useMembersApi.ts` (modified; getMembers returns MembersListResponse)
- FOUND: `el-templo-admin/src/components/MemberFormDialog.vue` (modified; Deudor toggle, hadDebtOnLoad, form.debtAmount, updatePayload.debt, DEBT_CURRENCY_OPTIONS import, exact D-12 placeholder string)
- FOUND: `el-templo-admin/src/pages/AlumnosPage.vue` (modified; Filter bar — Row 1, Filter bar — Row 2, Solo deudores, filters.debtorOnly, Deuda total:, formattedTotalDebt, visibleColumns, name: 'deuda', :columns="visibleColumns")
- FOUND: commit `0ecc3c4f` (Task 1)
- FOUND: commit `78f1ca48` (Task 2)
- FOUND: commit `ee4d4916` (Task 3)
- FOUND: `.planning/phases/101-debt-tracking-flag-members-with-outstanding-debt/101-03-SUMMARY.md` (this file)
- NONE: no `console.` in any modified file
- NONE: no `: any` introduced in any modified file (outside pre-existing Vue/Quasar generics)
- NONE: pre-existing vue-tsc errors in unrelated files (PDF, ProgramWizard, SessionEdit, Horarios) — not in scope per Phase 100 SUMMARY's out-of-scope list
- NONE: pnpm lint — 0 errors (6 pre-existing warnings in unrelated files)

## Self-Check: PASSED
