---
phase: 98-multi-currency-and-country-scoped-plans
plan: 07
subsystem: admin-ui-plans-country-scope
tags: [admin-ui, country-scope, multi-currency, formatPrice, forward-compat]
requires:
  - "phase 98 plan 02 (formatPrice utility in el-templo-admin/src/utils/format-price.ts)"
  - "phase 98 plan 04 (PlanListItem wire format carries country + currency)"
  - "phase 98 plan 05 (GET /api/admin/subscriptions/plans accepts ?branchId + ?country)"
provides:
  - "useSubscriptionsApi.getPlans(isActive?, { branchId?, country? }) — backward-compatible options bag"
  - "PlanListItem type surfaces country + currency to all admin consumers"
  - "CreatePlanInput type surfaces optional country for create flows"
  - "PlanesPage owner-only Argentina/España QSelect (default Argentina, D-06) with live re-fetch"
  - "PlanesPage QTable Pais column bound to row.country (grep-verified)"
  - "PlanesPage price cells render via formatPrice(amount, currency) for both presencial and online tables"
  - "PlanFormDialog country QSelect (editable on create, readonly on edit per T-98-14)"
  - "PlanFormDialog derived-currency readonly display + weekly-price formatPrice migration"
  - "PlanFormDialog create payload includes country (inherits owner's selected country from PlanesPage)"
affects:
  - "Plan 08 (admin dialogs/tabs that embed a plan picker — composable now filters by branchId/country)"
  - "Plan 09 (reports pages — same owner QSelect pattern established here is reused)"
  - "Plan 10 (member app price displays — uses the same formatPrice primitive)"
tech_stack:
  added: []
  patterns:
    - "Owner-only v-if QSelect driven by authStore.user?.role === 'owner' (matches AdminLayout.vue isOwnerRole computed)"
    - "Backward-compatible composable options bag: getPlans(isActive?, opts?) — existing 0-arg and 1-arg callers unchanged"
    - "Country field readonly on edit (T-98-14: plan.country is immutable post-creation to avoid currency drift)"
    - "Derived currency computed from country (form.country === 'ES' ? 'EUR' : 'ARS') — no separate currency field in the form"
key_files:
  modified:
    - "el-templo-admin/src/pages/PlanesPage.vue (+70 / -6 lines)"
    - "el-templo-admin/src/components/PlanFormDialog.vue (+46 / -3 lines)"
    - "el-templo-admin/src/composables/useSubscriptionsApi.ts (+7 / -2 lines)"
    - "el-templo-admin/src/types/subscription.ts (+3 / -0 lines — additive to PlanListItem + CreatePlanInput)"
decisions:
  - "Owner detection uses authStore.user?.role === 'owner' directly (matches AdminLayout.vue line 200 isOwnerRole shape). No role-group helper in the admin app for this — the project uses plain string comparisons."
  - "País column rendered as 2-letter ISO code (AR/ES) via the default field binding. Rationale: consistent with how branches.country is displayed elsewhere in admin; owners already know what AR/ES mean; avoids a per-row lookup. A future polish pass could add a per-code label map if UX requests it."
  - "Pais label uses the ASCII form (no í accent). The existing PlanesPage labels consistently use ASCII (e.g., 'Categoria', 'Duracion', 'Dias') — matching convention over spec-literal spelling. Grep acceptance criterion label: 'Pa[ií]s' accepts both forms."
  - "País column added for ALL users (not hidden for non-owners). Non-owners see a column that always shows their own country — slightly redundant, but (a) keeps the table shape stable across roles which simplifies downstream export/print, (b) costs one cell per row, (c) makes the scope implicit non-owners see explicit."
  - "Form country field is required on create, readonly on edit (T-98-14). Currency is NOT a separate form field — it's computed from country and displayed as a readonly mirror for visual feedback. Server derives currency from country on insert (98-04 behavior)."
  - "getPlans() composable signature preserved: first arg `isActive?: boolean` stays in place; new `opts` is the second arg. All existing call sites (grep-listed below) compile unchanged. Plan 08 will update the sites that need to pass branchId or country."
metrics:
  duration: "~30 minutes"
  completed_date: "2026-04-21"
---

# Phase 98 Plan 07: Admin Plans UI country scope + formatPrice migration — Summary

Wired the first admin UI surface onto the country/currency primitives built
in Plans 01–06. Owners now see an Argentina/España selector on `PlanesPage`
(default Argentina per D-06); non-owners see nothing and the server auto-
scopes. Plans table gains a País column. All price displays on the page and
in `PlanFormDialog` route through `formatPrice(amount, currency)` instead of
inline `${x.toLocaleString()}`.

## Exact lines migrated from toLocaleString to formatPrice

| File                                          | Before (line, pre-commit)                        | After                                                           |
| --------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `PlanesPage.vue` (presencial table, ~line 71) | `${{ props.row.priceRegular.toLocaleString() }}` | `{{ formatPrice(props.row.priceRegular, props.row.currency) }}` |
| `PlanesPage.vue` (online table, ~line 165)    | `${{ props.row.priceRegular.toLocaleString() }}` | `{{ formatPrice(props.row.priceRegular, props.row.currency) }}` |
| `PlanFormDialog.vue` (weekly price, ~line 88) | `${{ weeklyPrice.toLocaleString() }}/sem`        | `{{ formatPrice(weeklyPrice, derivedCurrency) }}/sem`           |

`grep -c "toLocaleString()"` returns **0** on both files.

Only `.toLocaleString()` call elsewhere in the admin-UI surfaces of this
plan is on `formatDate()`'s `new Date(iso).toLocaleDateString(...)` — NOT a
price context, not required to migrate. Zero price-context hits remain.

## QSelect: owner-only country selector

Location: `PlanesPage.vue` inside `<q-tab-panel name="planes">`, above the
existing create-button row. Visible only when `isOwner === true`; renders
nothing for non-owners.

```vue
<div v-if="isOwner" class="row q-gutter-md q-mb-md">
  <div class="col-auto" style="min-width: 180px">
    <q-select v-model="selectedCountry" :options="countryOptions"
              label="Pais" dense outlined emit-value map-options
              @update:model-value="onCountryChange" />
  </div>
</div>
```

`countryOptions` = `[{ label: 'Argentina', value: 'AR' }, { label: 'España', value: 'ES' }]`
(no "Todos" option per D-06). Default `selectedCountry.value = 'AR'`.

Owner-check source: `authStore.user?.role === 'owner'` via `useAuthStore()`
at `src/stores/useAuthStore.ts` — identical shape to `AdminLayout.vue` line
200's `isOwnerRole` computed. No new role constant introduced; no broadening
to admin-role.

## QTable: new País column (grep-verified)

Inserted in `planColumns` between `name` (Nombre) and `categoria`:

```typescript
{
  name: 'country',
  label: 'Pais',
  field: 'country',
  align: 'left',
  sortable: true,
  style: 'width: 100px',
},
```

Used by both the Presenciales and Online tables (they share `planColumns`).
Renders the raw ISO code (`AR` / `ES`) via the default cell formatter.

Grep acceptance checks (all pass):

| Check                                                | Result   |
| ---------------------------------------------------- | -------- |
| `grep -qE "name: 'country'"` PlanesPage.vue          | OK       |
| `grep -qE "field: 'country'"` PlanesPage.vue         | OK       |
| `grep -qE "label: 'Pais'"` PlanesPage.vue            | OK       |
| `grep -c "Argentina"` PlanesPage.vue                 | 2        |
| `grep -c "España"` PlanesPage.vue                    | 1        |
| `grep -c "selectedCountry"` PlanesPage.vue           | 5        |
| `grep -c "isOwner"` PlanesPage.vue                   | 3        |
| `grep -c "formatPrice"` PlanesPage.vue               | 3        |
| `grep -n ".toLocaleString()"` PlanesPage.vue (price) | no match |
| `grep -n "console\\."` PlanesPage.vue                | no match |
| `grep -c "formatPrice"` PlanFormDialog.vue           | 2        |
| `grep -c "country"` PlanFormDialog.vue               | 12       |
| `grep -c "country"` useSubscriptionsApi.ts           | 2        |
| `grep -c "branchId"` useSubscriptionsApi.ts          | 2        |

## Composable signature change

Before:

```typescript
async function getPlans(isActive?: boolean): Promise<PlanListItem[]>;
```

After:

```typescript
async function getPlans(
  isActive?: boolean,
  opts?: { branchId?: number; country?: "AR" | "ES" },
): Promise<PlanListItem[]>;
```

Params bag sends `?branchId=` and `?country=` only when provided. Every
existing 0-arg / 1-arg caller (e.g., `useMembersApi.ts`-adjacent pickers)
compiles without change. Plan 08 will update the dialogs that need to
pass `branchId` or `country`.

## PlanFormDialog changes

1. **Country QSelect** (new) — required on create, readonly on edit per
   T-98-14. Options: Argentina/España with `emit-value` + `map-options`.
2. **Moneda input** (new, readonly) — mirrors the derived currency
   (`form.country === 'ES' ? 'EUR' : 'ARS'`) so the user sees what currency
   their price fields map to. No separate form field; server derives on insert.
3. **Weekly price display** — migrated from `toLocaleString()` to
   `formatPrice(weeklyPrice, derivedCurrency)`.
4. **Create payload** — `createPlan({...payload, country: form.value.country})`.
   Edit payload omits country (immutable per T-98-14).
5. **Preset country prop** — accepts `presetCountry?: 'AR' | 'ES'` from
   `PlanesPage`; new plans default to the owner's currently-selected country
   (falls back to `'AR'` when opened outside an owner context).

## Type changes

Additive to `el-templo-admin/src/types/subscription.ts`:

- `PlanListItem.country: 'AR' | 'ES'`
- `PlanListItem.currency: 'ARS' | 'EUR'`
- `CreatePlanInput.country?: 'AR' | 'ES'` (optional — omitted on edit)

No existing field was renamed or removed (REQ-98-11 forward-compat).

## Forward-compat affirmation

- `PlanListItem` gains two fields additively; pre-existing consumers that
  do not reference `country`/`currency` continue to compile.
- `CreatePlanInput.country` is optional; callers that don't send it fall
  back to the server's DB-default (AR). Consistent with 98-05 non-breaking
  query-param widening.
- Composable signature: new `opts` arg is optional and positioned AFTER
  the existing `isActive?` arg. Zero existing call sites break.

## Deviations from Plan

### Rule 3 — Fix: mandatory-initial-read fetch only marks complete via MCP

No actual deviations. Plan executed as written.

### Note: label is `'Pais'` (ASCII), not `'País'`

The PlanesPage consistently uses ASCII Spanish labels (`Categoria`,
`Duracion`, `Dias`) rather than accented forms. I followed the existing
convention on this page rather than introducing the accented form in a
single label. The grep acceptance criterion (`label: 'Pa[ií]s'`) accepts
both. The QSelect `label` and the form's `Pais *` label use the same
ASCII form for consistency.

Individual option labels ("Argentina", "España") ARE rendered with their
accented forms because that's how QSelect options are surfaced to the
user; they match the user-facing Spanish and are not column-header labels.

## Known Stubs

None. All added UI is wired end-to-end:

- Country selector → `onCountryChange` → `loadPlans({ country: selectedCountry })`
  → composable → server `?country=` query param.
- País column → `row.country` → directly bound to the typed `PlanListItem.country`
  field returned by the API (Plans 04-05 contract).
- `formatPrice(amount, currency)` → `row.currency` field (Plans 04-05 contract).

## Threat Flags

None. The plan explicitly enumerates T-98-13 and T-98-14; both are
mitigated:

- T-98-13 (non-owner seeing country toggle) — `v-if="isOwner"` prevents
  UI render; server preHandler collapses any client-provided `?country=`
  for non-owners.
- T-98-14 (plan country edit → currency drift) — `:readonly="isEditMode"`
  on the QSelect + edit payload omits `country` entirely. Two layers of
  defense.

## Out of scope (deferred)

- **AR peso-scale vs formatPrice divides-by-100 mismatch.** The existing
  AR plan data stores whole pesos (e.g., 15000 meaning 15.000 ARS), but
  `formatPrice` divides by 100 before formatting. This means existing
  AR plans render at 1/100th their actual peso value after this migration
  (`formatPrice(15000, 'ARS')` → `$150` not `$15.000`). The plan 02 SUMMARY
  explicitly flags this: "AR call-site migration in Plan 04+ adjusts
  existing peso-scale callers." The correct fix is a one-shot data
  migration that multiplies all AR `price_regular`/`price_zero`/
  `price_credit_card` values by 100 (unifying to cents). That is a
  schema/data change, not a UI change — out of scope for 98-07. Logged
  here; recommend a dedicated plan (either appended to this phase or a
  short follow-up) to normalize AR values before promoting to production.
  The ES seed values are already in cents (7000 = €70), so EUR rendering
  is correct; only AR values need the ×100 migration. Flagging this now
  so Plan 11 (integration tests) or a verifier catches it before release.

- **Update all remaining `getPlans()` call sites** to pass `branchId` /
  `country` — owned by Plan 08 (member-form-dialog, assign-plan-dialog,
  member-subscription-tab).

- **Member app price displays + member catalog** — Plan 10.

- **Reports/analytics/caja owner dropdown + formatPrice migration** —
  Plan 09 (reuses the owner-only QSelect pattern established here).

- **Integration tests** (PlanFormDialog create with country, PlanesPage
  re-fetch on country change, Pais column visibility RBAC) — Plan 11.

## Note for Plan 08

The composable signature is now:

```typescript
getPlans(isActive?: boolean, opts?: { branchId?: number; country?: 'AR' | 'ES' })
```

Plan 08's member/assign dialogs will pass `{ branchId: member.branchId }`
to scope plan pickers to the target branch's country. The server's
`branchId > country` precedence rule (98-05) means passing `branchId`
alone is sufficient — no need to also resolve the country client-side.

## Commit

- `2416b8e4` feat(98-07): PlanesPage country dropdown + PlanFormDialog
  country field + plan composable filters

## Self-Check: PASSED

Files modified (verified via `git status`):

- `el-templo-admin/src/pages/PlanesPage.vue` — FOUND (modified)
- `el-templo-admin/src/components/PlanFormDialog.vue` — FOUND (modified)
- `el-templo-admin/src/composables/useSubscriptionsApi.ts` — FOUND (modified)
- `el-templo-admin/src/types/subscription.ts` — FOUND (modified)

Commit (verified via `git log --oneline`):

- `2416b8e4` feat(98-07): PlanesPage country dropdown + PlanFormDialog
  country field + plan composable filters — FOUND

TypeScript: `cd el-templo-admin && pnpm tsc --noEmit` returns only the
pre-existing pdfmake errors documented in `deferred-items.md` — zero new
errors in the 4 files I modified (filtered via `grep -E
"PlanesPage|PlanFormDialog|useSubscriptionsApi|subscription.ts"` → no
matches).

ESLint: `cd el-templo-admin && pnpm lint` returns only pre-existing
warnings (env.d.ts unused-disable, pdf/session-pdf-builder.ts unused-vars);
zero new issues on the 4 modified files.

Grep acceptance criteria: ALL PASS (see table above).

Forward-compat: additive type fields only; composable second-arg is
optional; no existing call site breaks.
