---
phase: 132-exponer-metricas-gestion-v50-admin
reviewed: 2026-06-05T16:36:33Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - el-templo-admin/src/components/analytics/ConversionTab.vue
  - el-templo-admin/src/components/analytics/FinanzasAvanzadasTab.vue
  - el-templo-admin/src/components/analytics/FrecuenciaTab.vue
  - el-templo-admin/src/components/analytics/IngresosTab.vue
  - el-templo-admin/src/components/analytics/MiembrosTab.vue
  - el-templo-admin/src/components/analytics/RetencionGestionTab.vue
  - el-templo-admin/src/composables/useAnalyticsApi.ts
  - el-templo-admin/src/pages/AnaliticasPage.vue
  - el-templo-admin/src/types/analytics.ts
  - el-templo-api/src/modules/analytics/churn-service.ts
  - el-templo-api/src/modules/analytics/expiry-cohort.ts
  - el-templo-api/src/modules/analytics/frequency-service.ts
  - el-templo-api/src/modules/analytics/ltv-service.ts
  - el-templo-api/src/modules/analytics/renewal-service.ts
  - el-templo-api/src/modules/analytics/routes.ts
  - el-templo-api/src/modules/analytics/schemas.ts
  - el-templo-api/src/modules/analytics/ticket-service.ts
  - el-templo-api/src/modules/analytics/trial-funnel-service.ts
  - el-templo-api/src/modules/analytics/types.ts
  - el-templo-api/test/analytics/frequency.test.ts
  - el-templo-api/test/analytics/ticket.test.ts
  - el-templo-api/test/analytics/trial-funnel.test.ts
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 132: Code Review Report

**Reviewed:** 2026-06-05T16:36:33Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Reviewed the Phase 132 analytics-exposure work: 9 backend files (the 6 v5.0 metric
services + routes + schemas + types + shared expiry-cohort helper) and 9 admin
frontend files (4 new thematic tabs, the API composable, the page, and the types).

**Security verdict on the stated focus areas is positive.** The new `planId`/`turno`
input filters are correctly AND-ed AFTER `applyScope(...).conditions` in every
service (`subscriptionPlanFilter` spreads after `...scopeConditions`;
`frequency-service` pushes `eq(planId)`/`turnoCondition` after the scope spread;
`ticket-service`/`trial-funnel-service` append plan predicates to the already-scoped
WHERE). No filter param can relax country/branch scope — confirmed by reading each
query builder and corroborated by `frequency.test.ts` T-132-04/T-132-05. PII on the
frequency cooling-down list flows through the same scoped population query and is
ADMIN_ROLES-gated. The CSV builder in `FrecuenciaTab` correctly neutralizes
spreadsheet formula injection (`=+-@` prefix) and RFC-4180 quotes. Currencies are
isolated per-block throughout (no cross-currency summation found).

No BLOCKER-class defects found. The findings below are correctness/robustness
WARNINGs and quality INFO items. The most material are: a hard-coded "15 días" churn
label that can mismatch the value actually rendered (WR-01), a churn headline that
silently falls back to a non-15 window without disclosure (WR-02), and a
cross-currency LTV fallback that can show one currency's "$ por cliente" under the
other currency's card (WR-03).

## Warnings

### WR-01: Hard-coded "15 días" churn label can mismatch the rendered value

**File:** `el-templo-admin/src/components/analytics/RetencionGestionTab.vue:20`, `144-150`
**Issue:** The headline caption is the literal string `Churn de no-renovación (15
días)`, but `churnHeadline` does NOT guarantee a 15-day value: it returns the 15-day
comparison entry only `if (fifteen)`, otherwise falls back to
`props.churn.window.churn.percentage` — which is whatever `filters.window` the user
configured (the schema allows 1..365). If an operator ever passes `window=30`, the
card displays the 30-day churn under a label that claims "15 días", silently
misreporting the metric. The `window` filter is wired into `AnalyticsFilters` and
serialized by `buildParams`, so this is reachable, not theoretical.
**Fix:** Derive the label from the actual window backing the headline:

```ts
const headlineWindow = computed(
  () =>
    props.churn?.comparison.find((c) => c.windowDays === 15)?.windowDays ??
    props.churn?.window.windowDays ??
    15,
);
// template: `Churn de no-renovación ({{ headlineWindow }} días)`
```

### WR-02: Churn headline falls through three branches with no disclosure when 15d is absent

**File:** `el-templo-admin/src/components/analytics/RetencionGestionTab.vue:144-150`
**Issue:** The second and third `return` of `churnHeadline` are identical
(`return props.churn.window.churn.percentage;`), so the `if (props.churn.window.windowDays === 15)`
check is dead code — both branches do the same thing. Beyond being unreachable logic,
this means that when neither the comparison set nor the official window is 15 days, the
component shows the official window value with no visual signal that it is NOT the
intended 15-day metric. Combined with WR-01 this compounds the mislabeling risk.
**Fix:** Collapse the dead branch and make the non-15 case explicit (e.g. surface the
actual `windowDays` per WR-01, or guard the card). At minimum:

```ts
const churnHeadline = computed<number>(() => {
  if (!props.churn) return 0;
  const fifteen = props.churn.comparison.find((c) => c.windowDays === 15);
  return fifteen
    ? fifteen.churn.percentage
    : props.churn.window.churn.percentage;
});
```

### WR-03: LTV "$ por cliente" falls back across currency blocks, mixing ARS/EUR semantics

**File:** `el-templo-admin/src/components/analytics/IngresosTab.vue:119`
**Issue:** The dominant `$ por cliente` figure is
`money(ltvBlock(cur).observed ?? ltvBlock(cur).projected, cur)`. When a currency's
block has `observed === null` (no closed lives) but `projected` is non-null, the card
shows the projected value. That is acceptable within one currency — but the
`ltvCurrencies` fallback (`if (out.length === 0) out.push('ARS')`) forces an ARS card
even when ARS `n === 0`. In a pure-EUR scope the panel renders an ARS card whose
`observed`/`projected` are null → shows "—" (fine), but if ARS has stale
`projected` from a non-empty cohort while EUR is the real data, the operator sees an
ARS-labelled number while the actual revenue is EUR. The currency label is correct,
but the headline "Meses de vida" / "$ por cliente" sit side by side and invite the
reader to combine a global month figure with a single-currency money figure.
**Fix:** Gate the money headline on the block actually having data, and prefer not to
force an ARS fallback card when the other currency is the populated one:

```ts
const ltvCurrencies = computed<CurrencyCode[]>(() => {
  const out = ALL_CURRENCIES.filter(ltvCurrencyHasData);
  if (out.length === 0) out.push(displayCurrency.value); // scoped currency, not hard ARS
  return out;
});
```

(Requires passing the page's `displayCurrency` down, or reading scope.) At minimum,
document that the forced-ARS card is intentional and render "—" when `n === 0`.

### WR-04: Frequency turno filter changes the band denominator inconsistently vs the breakdowns

**File:** `el-templo-api/src/modules/analytics/frequency-service.ts:232-259`, `505-567`
**Issue:** Under a `turno` filter, `visitCountsForWindow` restricts the visit counts
(numerator) to mañana/tarde attendance, but `activeMemberPopulation` (the distribution
denominator) and `buildBreakdowns` are computed over the FULL active population
regardless of turno. The result: with `turno=manana`, a member with only tarde visits
is counted as `inactivo` in BOTH the top-line distribution AND every breakdown segment.
The frequency.test.ts `turno=manana` case asserts the member "is still in the
population, just in a lower band" — so this is the intended design — but it means the
turno filter silently reinterprets "Inactivo" as "no mañana visits", which the UI label
("Inactivo") does not convey. An operator filtering by mañana will over-count Inactivo
and mis-read retention risk.
**Fix:** Either (a) document this explicitly in the tab (a caption: "Inactivo bajo
filtro de turno = sin visitas en ese turno"), or (b) restrict the active population to
members who have ANY booking in that turno when a turno filter is active, so the
denominator matches the numerator's universe. Decide deliberately; the current behavior
is defensible but undocumented on the wire.

### WR-05: Frequency cooling-down `name` can render an empty string for NULL-named members

**File:** `el-templo-api/src/modules/analytics/frequency-service.ts:442`
**Issue:** `name: \`${m.firstName} ${m.lastName}\`.trim()` where `firstName`/`lastName`
are `String(r.firstName ?? "")`. A member with both name fields NULL yields `name: ""`.
The schema declares `name: { type: "string" }` (not nullable), so the empty string
passes, and `FrecuenciaTab` renders an empty router-link cell (a clickable blank).
`MiembrosTab` handles the analogous case with a `Miembro #${userId}` fallback
(MiembrosTab.vue:341-344) — frequency does not, so the two lists are inconsistent and
the cooling-down row becomes unidentifiable.
**Fix:** Mirror the MiembrosTab fallback at composition time:

```ts
const full = `${m.firstName} ${m.lastName}`.trim();
name: full.length > 0 ? full : `Miembro #${m.userId}`,
```

### WR-06: `ticketBlock`/`ltvBlock` use non-null assertions reachable via the forced-currency fallback

**File:** `el-templo-admin/src/components/analytics/IngresosTab.vue:180-188`, `198-209`
**Issue:** `ticketBlock`/`ltvBlock` dereference `props.ticket!`/`props.ltv!`. The
comment asserts they are "only called inside the v-for over ticketCurrencies, which is
derived from props.ticket being present" — but `ticketCurrencies`/`ltvCurrencies`
unconditionally push `'ARS'` when empty (lines 201, 207), and that computed does NOT
short-circuit on `props.ticket === null`. The `isEmpty` guard wraps the template, so in
practice `props.ticket`/`props.ltv` are non-null whenever the `v-for` renders — but the
safety depends on `isEmpty` correctly returning true for BOTH null props. It does today
(`!props.ticket || ...`), so this is not a live crash, but the non-null assertions are a
latent footgun: any future change to `isEmpty` (e.g. showing the panel when only one of
ticket/ltv is present) would dereference null. CLAUDE.md bans `any`; non-null `!` on
nullable props is the same class of unsafe escape hatch.
**Fix:** Make the accessors null-safe and drop the assertions:

```ts
function ltvBlock(cur: CurrencyCode): LtvCurrencyBlock | null {
  return props.ltv?.monetary[cur] ?? null;
}
```

and null-guard at each call site, or split the `isEmpty` into independent ticket/ltv
guards so each sub-panel only renders when its own prop is present.

## Info

### IN-01: `ConversionTab` declares `BranchRow` interface after first use

**File:** `el-templo-admin/src/components/analytics/ConversionTab.vue:164`, `172-178`
**Issue:** `branchColumns: QTableColumn<BranchRow>[]` (line 164) references the
`BranchRow` interface that is only declared at line 172. TS hoists interface
declarations so this compiles, but reading top-to-bottom the type is used before it is
defined — minor readability cost.
**Fix:** Move the `interface BranchRow` block above `branchColumns`.

### IN-02: Duplicated null-safe percent/money formatters across tabs

**File:** `el-templo-admin/src/components/analytics/IngresosTab.vue:220-240`, `ConversionTab.vue:111-114`, `RetencionGestionTab.vue:131-133`
**Issue:** `money`/`months`/`discountPct`/`wholePct`/`pct`/`formatPct` are
re-implemented per component with slightly different null/NaN handling (e.g.
`RetencionGestionTab.formatPct` does NOT guard null — it assumes a number, while
ConversionTab's `pct` does). The inconsistency is benign today because
`RetencionGestionTab` only formats `MetricShape.percentage` (always a number), but the
divergence is exactly the kind CLAUDE.md flags ("DRY: flag repetition aggressively").
**Fix:** Extract a shared `src/utils/analytics-format.ts` with `formatPct(value, {nullable})`,
`money(amount, cur)`, `months(value)` and import across the four tabs.

### IN-03: `void bucketExpr;` is a no-op kept only to document intent

**File:** `el-templo-api/src/modules/analytics/trial-funnel-service.ts:395`
**Issue:** `void bucketExpr;` exists solely to reference the import so the JS bucketing
(`monthKey`/`isoWeekKey`) "mirrors" the SQL contract. It is dead at runtime and relies
on a comment to justify the unused import. A future reader may delete the import and
break the documentation link silently.
**Fix:** Drop the `void` statement and the `bucketExpr` import; reference the contract in
the JSDoc of `isoWeekKey`/`monthKey` instead (the functions already document the
`%x-W%v` / `%Y-%m` formats).

### IN-04: `MiembrosTab` Extender dialog is permanently disabled placeholder UI

**File:** `el-templo-admin/src/components/analytics/MiembrosTab.vue:150-176`
**Issue:** The Extender dialog's confirm button is hard-`disabled` and the body reads
"Proximamente: esta funcionalidad estara disponible pronto." `extendDays` is a bound
`ref` that is never consumed. This is shipped non-functional UI (an enabled "Extender"
button on each row that opens a dead dialog), which can confuse operators into thinking
the action exists.
**Fix:** Either hide the Extender button until the feature lands, or remove the dialog
state (`showExtendDialog`/`extendDays`/`extendMemberName`) and the row button. If kept
intentionally as a teaser, disable the row-level "Extender" button too for consistency.

### IN-05: Trial-funnel `breakdownKey` returns the em-dash sentinel "—" that can collide with a real key

**File:** `el-templo-api/src/modules/analytics/trial-funnel-service.ts:474-482`
**Issue:** Branch/country axes use `r.branchName ?? "—"` as the segment key and the plan
axis uses `(${r.boughtPlanCountry ?? "—"})`. If a real branch/country were ever named
"—" (unlikely but unconstrained) it would merge with the null bucket. More practically,
"—" is a display string leaking into a data key; the frontend `ConversionTab` renders it
verbatim as a sucursal name, which reads as a glitch rather than "sin sucursal".
**Fix:** Use a non-display sentinel (e.g. `null`-keyed bucket dropped, or `"(sin sucursal)"`)
and let the frontend localize, consistent with how `breakdownSegmentKey` handles nulls
elsewhere.

---

_Reviewed: 2026-06-05T16:36:33Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
