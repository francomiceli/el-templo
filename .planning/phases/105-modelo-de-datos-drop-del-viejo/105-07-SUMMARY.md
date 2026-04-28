---
phase: 105-modelo-de-datos-drop-del-viejo
plan: 07
subsystem: admin-frontend
tags: [refactor, frontend, admin, members, debt, txn-04, d-11]

# Dependency graph
requires:
  - plan: 105-05
    provides: MemberListItem.debt removed from API response; PATCH /api/admin/members/:userId schema closed via additionalProperties:false (rejects legacy debt fields with 400)
  - plan: 105-06
    provides: payments + debts backend modules dropped (usePaymentsApi.ts in admin still consumes the dropped routes — deferred to this plan)
provides:
  - MemberFormDialog.vue without Phase 101 Deuda section (toggle + amount/currency/note inputs gone; isDebtor/debtAmount/debtCurrency/debtNote stripped from form state, defaults, edit-mode populate, and submit payload)
  - types/member.ts without DebtUpsertInput / ActiveDebt / DebtCurrency / DEBT_CURRENCIES / DEBT_CURRENCY_OPTIONS; MemberListItem.debt and UpdateMemberInput.debt fields removed; TotalDebtRow preserved
  - AlumnosPage.vue with the per-row Deuda column dropped; "Solo deudores" filter + "Deuda total" banner preserved (sourced from totalDebtByCurrency aggregate)
affects: [105-08, 106]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Surface deletion via type contract first: removing the `debt` field from MemberListItem forced TypeScript to flag every consumer site (AlumnosPage column projection, MemberFormDialog populate watcher) — no grep sweep needed once member.ts was edited. Pattern documented in 105-05-SUMMARY for downstream consumers, validated end-to-end here."
    - "Banner aggregate vs per-row detail split: the Phase 101 design conflated 'total outstanding by currency' (a list-level aggregate) with 'this member owes X' (a per-row enrichment). Plan 05 backend kept the aggregate (TotalDebtRow[]) and dropped the per-row enrichment. Plan 07 frontend matches: the Deuda total banner stays, the per-row Deuda column goes. Phase 108 will reintroduce per-member detail through a dedicated /financial-history endpoint, not via list-row enrichment."
    - "Deferred composable cleanup: usePaymentsApi.ts has 0 incoming calls from members/admin frontend after this plan, but CajaPage.vue still consumes it. Decision: leave it alone (Option A from the plan brief). Phase 106 will ship POST /api/admin/transactions and migrate CajaPage to a useTransactionsApi composable in lockstep; deleting the file now would force CajaPage into a stub state for the duration of Phase 106."

key-files:
  created: []
  modified:
    - el-templo-admin/src/components/MemberFormDialog.vue
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/pages/AlumnosPage.vue
  deleted: []

key-decisions:
  - "Plan 105-07: AlumnosPage per-row 'Deuda' column DELETED (not stubbed with placeholder dashes). Reason: the column relied on MemberListItem.debt which Plan 05 backend removed; rendering a placeholder would be a UX lie (we have no source for per-row outstanding amount until Phase 108 ships /api/admin/users/:id/financial-history). The 'Solo deudores' filter + 'Deuda total' banner above the table still surface aggregate insight, so admins keep the prioritization signal at the list level."
  - "Plan 105-07: usePaymentsApi.ts NOT deleted — Option A (leave it alone for Phase 106 transition) selected over Option B (stub CajaPage). Reason: deleting the composable forces CajaPage.vue:368/385 to either compile-error or get stubbed mid-phase; Phase 106 owns the cash-box UI migration to /api/admin/transactions and will do the swap in one coherent edit. The runtime cost during the gap is that CajaPage's GETs to /api/admin/payments/* return 404 (Plan 06 dropped paymentRoutes registration), surfacing as an empty list + error banner — but that page is staging-only until Phase 106 anyway, so no production users are affected."
  - "Plan 105-07: No Vue template-binding renames performed. AlumnosPage 'Solo deudores' filter still emits filters.debtorOnly=true to GET /admin/members, and the backend (Plan 05) resolves the same query param against balances.amount > 0. The 'Deuda total' banner still reads totalDebtByCurrency from MembersListResponse — Plan 05 preserved that field name and TotalDebtRow[] shape end-to-end. Pattern: API contract preservation across schema migrations is cheaper than coordinating frontend+backend rename."
  - "Plan 105-07: types/member.ts kept TotalDebtRow but rewrote the docstring to document the new 'outstanding balance' source (balances.amount > 0 vs the old debts.is_cancelled = false). Type itself unchanged at the field level — admins reading the type get the same {currency, amount} shape but a clearer mental model of where the number comes from."
  - "Plan 105-07: MemberFormDialog.vue's hadDebtOnLoad ref + 3-case debt payload assembly (toggle on / toggle off + had / toggle off + none) deleted in one block, not preserved as 'always omit'. Reason: per Plan 05, the API now rejects ANY debt field on PATCH (additionalProperties:false). Even sending `debt: undefined` is fine because axios omits undefined keys, but keeping the toggle-state branching code as 'always undefined' would be dead-code clutter."

patterns-established:
  - "Frontend cleanup of a deleted backend field: the cheapest order is (1) delete the field from the shared type, (2) let TypeScript flag every consumer, (3) edit consumers one-by-one. No upfront grep sweep needed because the type system is the source of truth. Validates the Plan 05 SUMMARY's 'pattern-established' note that DELETING a field is preferable to NULLing it for migration ergonomics."
  - "Two-tab finance migration: when one admin page (CajaPage) lags behind the rest of the migration, do NOT block the rest of the cleanup waiting for it. Leave the dead composable in place, deny it new callers, document the deferral. The cost is a single 404 banner on a single page in staging; the alternative (stub-and-rewrite-twice) is much worse."

requirements-completed:
  - TXN-04

# Metrics
duration: ~5min
completed: 2026-04-28
tasks: 2
files-modified: 3
files-deleted: 0
---

# Phase 105 Plan 07: Admin Frontend — Drop Phase 101 Debt UI

Surgical removal of the Phase 101 "Deuda" UI from the admin app: the Deuda section in MemberFormDialog (q-toggle "Deudor" + amount/currency/note inputs), the per-row Deuda column in AlumnosPage's QTable, and every Debt-related TypeScript type that backed those bindings (DebtUpsertInput, ActiveDebt, DebtCurrency, DEBT_CURRENCIES, DEBT_CURRENCY_OPTIONS) — plus the `debt` fields on MemberListItem and UpdateMemberInput. The "Solo deudores" filter toggle and the "Deuda total" banner are preserved; both already source from server-side aggregates that Plan 05 rewrote against `balances.amount > 0` while keeping the wire shape (TotalDebtRow[]) intact. SPEC §AC #6 grep gate (`isDebtor|debtAmount|debtCurrency|debtNote` in admin/src) returns 0 matches.

## Tasks Executed

| Task | Name                                                             | Commit     | Files                                                                              |
| ---- | ---------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| 1    | Delete Deuda section + form fields from MemberFormDialog.vue     | `365151cf` | `el-templo-admin/src/components/MemberFormDialog.vue`                              |
| 2    | Drop debt types + AlumnosPage Deuda column; verify useMembersApi | `ae049ae6` | `el-templo-admin/src/types/member.ts`, `el-templo-admin/src/pages/AlumnosPage.vue` |

## What Changed

### `MemberFormDialog.vue`

- **Template (edit mode):** removed the `<!-- ─── Deuda (Phase 101) -->` block — q-separator, "Deuda" subtitle, `<q-toggle v-model="form.isDebtor">`, and the conditional `<div v-if="form.isDebtor">` containing `<q-input v-model.number="form.debtAmount">`, `<q-select v-model="form.debtCurrency">`, and `<q-input v-model="form.debtNote">`.
- **Imports:** removed `import { DEBT_CURRENCY_OPTIONS } from 'src/types/member'`. The `UpdateMemberInput` import is still used by the submit payload.
- **Form ref:** dropped 4 keys from `const form = ref({...})`: `isDebtor`, `debtAmount`, `debtCurrency`, `debtNote`. Also removed the `hadDebtOnLoad` ref and the `debtCurrencyOptions` constant.
- **Watcher (open/edit-mode populate):** dropped 4 keys from the `props.member` populate branch and from the create-mode reset branch. Removed the `hadDebtOnLoad.value = props.member.debt != null` assignment.
- **`onSubmit`:** deleted the entire 3-case debt payload assembly (toggle on → upsert / toggle off + had → null / toggle off + none → undefined). The `updatePayload: UpdateMemberInput` body now contains only the legitimate member fields. The `if (debtPayload !== undefined) updatePayload.debt = debtPayload` line is gone.
- **Logging:** preserved — `createLogger('MemberFormDialog')` calls in the catch block stay. No `console.*` introduced.

### `types/member.ts`

- Removed `MemberListItem.debt: ActiveDebt | null`.
- Removed `UpdateMemberInput.debt?: DebtUpsertInput | null`.
- Removed the entire "Debt Tracking (Phase 101)" block: `DEBT_CURRENCIES`, `DebtCurrency`, `DEBT_CURRENCY_OPTIONS`, `ActiveDebt` interface, `DebtUpsertInput` interface.
- Preserved `TotalDebtRow` with an updated section heading ("Outstanding Balances (Phase 105 Plan 05)") and a docstring explaining the new server-side source (`balances.amount > 0`).
- `MembersListResponse.totalDebtByCurrency: TotalDebtRow[]` unchanged — this is the banner contract that AlumnosPage reads.

### `AlumnosPage.vue`

- Removed `ActiveDebt` from the `import type { ... } from 'src/types/member'` block.
- Replaced the `visibleColumns` computed body. Was:
  ```ts
  if (filters.debtorOnly) {
    base.push({ name: 'deuda', label: 'Deuda', field: (row) => row.debt, format: (val: ActiveDebt | null) => ... });
  }
  ```
  Now: just `() => columns` — no per-row Deuda column. A comment documents the rationale and points at Phase 108 for per-member saldo detail reintroduction.
- Preserved unchanged: `filters.debtorOnly` toggle (line ~55, still posts `?debtorOnly=true` to GET /admin/members), `totalDebtByCurrency` ref (line ~365, still reads from `MembersListResponse.totalDebtByCurrency`), and the `<q-banner v-if="filters.debtorOnly && totalDebtByCurrency.length > 0">` aggregate banner (line ~150).

### `useMembersApi.ts`

No changes. Verified per PATTERNS.md: the composable is generic over `MembersListResponse` and `UpdateMemberInput`; both types just shed a field, so the composable adapts at the type level with zero source edits. The `updateMember(userId, input: UpdateMemberInput)` signature now structurally rejects callers passing `debt`, but the only caller (MemberFormDialog) was edited in Task 1 to drop the field from its payload.

## Composable Deferral: `usePaymentsApi.ts`

Plan 06 left `el-templo-admin/src/composables/usePaymentsApi.ts` in place because `CajaPage.vue:368,385` still consumes it. Plan 07 brief offered two options:

- **(A)** Leave the dead composable + dead routes in place. CajaPage's GETs hit Plan-06-deleted `/api/admin/payments/*` and return 404 → empty list + error banner on that page. Phase 106 fixes by introducing `/api/admin/transactions` + a new `useTransactionsApi` composable.
- **(B)** Stub CajaPage's payments-fetching with a placeholder + TODO comment now.

**Decision: A.** Reasons:

1. CajaPage is admin-staging-only; no end users see the broken page during the v4.8 → Phase 106 gap.
2. Stubbing now means rewriting CajaPage twice (once to stub, once to wire to /transactions). Phase 106 will do the migration in one atomic edit when the new endpoint exists.
3. Plan 06 SUMMARY explicitly documented this hand-off; Phase 106 already owns the rewrite.

Document for Phase 106: open `el-templo-admin/src/pages/CajaPage.vue` lines ~368-385, replace `usePaymentsApi()` with the new `useTransactionsApi()`, then delete `el-templo-admin/src/composables/usePaymentsApi.ts` + `el-templo-admin/src/types/payment.ts` if no other consumers remain.

## Verification

```bash
# SPEC §Acceptance Criteria #6:
$ grep -rE "isDebtor|debtAmount|debtCurrency|debtNote" el-templo-admin/src
(0 matches)

# Debt types fully purged:
$ grep -rE "DebtUpsertInput|ActiveDebt|DebtCurrency|DEBT_CURRENCIES|DEBT_CURRENCY_OPTIONS" el-templo-admin/src
(0 matches)

# MemberFormDialog visual gates:
$ grep -c "Deuda" el-templo-admin/src/components/MemberFormDialog.vue          # 0
$ grep -cE "isDebtor|debtAmount|debtCurrency|debtNote" el-templo-admin/src/components/MemberFormDialog.vue  # 0
$ grep -c "console\." el-templo-admin/src/components/MemberFormDialog.vue       # 0
$ grep -c "hadDebtOnLoad" el-templo-admin/src/components/MemberFormDialog.vue   # 0

# AlumnosPage banner + filter still bound:
$ grep -c "filters.debtorOnly" el-templo-admin/src/pages/AlumnosPage.vue        # 4 (toggle, banner v-if, filter reactive default, no others)
$ grep -c "totalDebtByCurrency" el-templo-admin/src/pages/AlumnosPage.vue       # 4 (ref decl, formattedTotalDebt, banner v-if, banner content)

# types/member.ts: TotalDebtRow preserved, Debt* types gone:
$ grep -c "TotalDebtRow" el-templo-admin/src/types/member.ts                    # 2 (interface decl + MembersListResponse field)
$ grep -cE "DebtUpsertInput|ActiveDebt|DebtCurrency" el-templo-admin/src/types/member.ts  # 0

# Typecheck — no new errors in modified files (pre-existing pdfmake errors in session-pdf-builder.ts are out of scope, predate this plan):
$ cd el-templo-admin && pnpm tsc --noEmit 2>&1 | grep "error TS" | grep -v "session-pdf-builder.ts" | wc -l
0

# Lint — 0 errors (only pre-existing warnings in session-pdf-builder.ts and env.d.ts):
$ cd el-templo-admin && pnpm lint
✖ 6 problems (0 errors, 6 warnings)
```

## Deviations from Plan

### Auto-fixed Issues

None. The plan executed exactly as written. The only sub-decision delegated to the executor was the usePaymentsApi.ts question (Option A vs B), and Option A was selected per the plan brief's recommendation.

### Out-of-scope discoveries

**1. `session-pdf-builder.ts` pre-existing typecheck errors**

- **Discovered when:** Running `pnpm tsc --noEmit` for the verification gate.
- **Issue:** 3 `error TS` blocks in `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` (pdfmake `vfs` property, Content type incompatibility on `margin` arrays).
- **Action taken:** None — these errors predate this plan (last touched commit `d0bf51ac feat(100-05): PDF customTitle subtitle + Spanish route labels`). Filed for future cleanup; out of scope per executor SCOPE BOUNDARY rule.

## Threat Flags

None — no new attack surface introduced. The threat register entries are all mitigated as planned:

- **T-105-24** (stale form bundle on user's browser): **accept** — admin app is push-deployed; backend `additionalProperties:false` (Plan 05) rejects legacy payloads with HTTP 400 in the meantime.
- **T-105-25** (per-row debt detail removed from AlumnosPage): **accept** — banner aggregate still shows total debt by currency. Phase 108 will add per-member saldo detail through a dedicated endpoint, not list-row enrichment.
- **T-105-26** (XSS in any new template binding): **mitigate** — no new template bindings added; only deletions. Vue's interpolation is safe by default for the unchanged bindings.

## Self-Check: PASSED

- [x] `el-templo-admin/src/components/MemberFormDialog.vue` — modified, no Deuda section, no debt fields
- [x] `el-templo-admin/src/types/member.ts` — modified, Debt\* types deleted, TotalDebtRow preserved
- [x] `el-templo-admin/src/pages/AlumnosPage.vue` — modified, ActiveDebt import + Deuda column gone, filter+banner preserved
- [x] Commit `365151cf` exists in git log
- [x] Commit `ae049ae6` exists in git log
- [x] `grep -rE "isDebtor|debtAmount|debtCurrency|debtNote" el-templo-admin/src` returns 0 matches (SPEC AC #6)
- [x] `grep -rE "DebtUpsertInput|ActiveDebt|DebtCurrency" el-templo-admin/src` returns 0 matches
- [x] `cd el-templo-admin && pnpm tsc --noEmit` produces 0 errors in plan-modified files (3 pre-existing errors in `session-pdf-builder.ts` are out of scope)
- [x] `cd el-templo-admin && pnpm lint` exits with 0 errors (6 pre-existing warnings in unrelated files)
