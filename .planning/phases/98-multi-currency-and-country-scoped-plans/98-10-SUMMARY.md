---
phase: 98-multi-currency-and-country-scoped-plans
plan: 10
subsystem: member-app
tags: [formatPrice, multi-currency, migration, forward-compat]
requires:
  - "phase 98 plan 02 (formatPrice utility in el-templo-app/src/utils/format-price.ts)"
  - "phase 98 plan 05 (server-side country scoping of /members/subscription/plans)"
provides:
  - "Member app PlanesPage.vue rendering all prices via formatPrice with currency fallback"
  - "MemberProgramCatalogItem + inline MemberPlan extended additively with optional currency (and price for catalog items)"
affects:
  - "Phase 98 Plan 11 (integration tests — member UI surfaces now single-source for price formatting)"
tech_stack:
  added: []
  patterns:
    - "Optional `currency?: 'ARS' | 'EUR'` on every client response type, with `?? 'ARS'` fallback at call sites (D-19)"
    - "Single-pass migration of every price-toLocaleString site in the member app (D-09)"
key_files:
  created: []
  modified:
    - "el-templo-app/src/modules/plan/pages/PlanesPage.vue"
    - "el-templo-app/src/modules/programs/types.ts"
decisions:
  - 'Kept the existing `v-if="exp.price != null"` guard — server''s `getCatalog()` does not currently return `price` or `currency`, so the badge remains hidden until the server response is enriched. This preserves today''s behavior (no stale badge) while readying the client for the enriched response.'
  - "Extended `MemberProgramCatalogItem` with `price?: number` (additive) in addition to `currency?: 'ARS' | 'EUR'`. The template already accesses `exp.price` despite the type not declaring it (pre-existing latent type gap). Adding `price?: number` fixes the gap additively — no runtime behavior change (guard still hides the badge)."
  - "Propagated `currency` through `computeWeeklyPrice` → `buildWhatsAppMessage` → `openWhatsApp` / `openExperienciaWhatsApp` so the WhatsApp pre-filled message renders the weekly price in the correct currency when the server eventually includes `currency` in the plan / catalog response."
  - "Hardened `buildWhatsAppMessage` against an undefined `monthlyPrice`: the server's `/members/subscription/plans` response deliberately strips prices from regular plans (member-safe response), so `plan.priceRegular` is `undefined` at runtime. Returning a price-less message in that case is safer than formatting `NaN`."
metrics:
  duration: "~10 minutes"
  completed_date: "2026-04-21"
---

# Phase 98 Plan 10: Member App Price Migration — Summary

Member app's `PlanesPage.vue` now renders every price via `formatPrice(amount, currency ?? 'ARS')` (D-09). Fallback to `'ARS'` at every call site per D-19 for forward-compat with older cached responses. Additive-only client type extensions per D-18 (no renames, no removals).

## Price surface inventory (exhaustive)

Plan's hard enumeration confirmed by fresh grep at execution time:

```
$ grep -rn "\.toLocaleString()" el-templo-app/src --include="*.vue" --include="*.ts"
el-templo-app/src/modules/plan/pages/PlanesPage.vue:58: >${{ exp.price.toLocaleString() }}</q-badge
el-templo-app/src/modules/plan/pages/PlanesPage.vue:201: return Math.round(monthlyPrice / 4.33).toLocaleString()
```

Exactly 2 price-context sites, both in `PlanesPage.vue`. Zero other files in `el-templo-app/src` contain a price-context `.toLocaleString()` call. Supporting cross-check for price-field usage:

```
$ grep -rn "priceRegular\|priceZero\|priceCreditCard\|pricePaid" el-templo-app/src --include="*.ts" --include="*.vue"
el-templo-app/src/modules/plan/pages/PlanesPage.vue:146: priceRegular: number         ← TYPE DEFINITION (extended with currency)
el-templo-app/src/modules/plan/pages/PlanesPage.vue:198: * priceRegular is always…    ← COMMENT
el-templo-app/src/modules/plan/pages/PlanesPage.vue:227: buildWhatsAppMessage(…, plan.priceRegular, plan.currency)  ← handler, now currency-aware
el-templo-app/src/stores/useUserStore.ts:49: pricePaid: number                        ← TYPE DEFINITION, no display
```

All hits accounted for. No other module, no upsell surface, no Mi Camino screen displays a monetary amount today.

## Sites migrated

### Site 1 — Badge in "Planes Por Objetivos" list (line 58)

**Before:**

```html
<q-badge v-if="exp.price != null" outline color="primary"
  >${{ exp.price.toLocaleString() }}</q-badge
>
```

**After (prettier reformatted the multi-line braces):**

```html
<q-badge v-if="exp.price != null" outline color="primary">
  {{ formatPrice(exp.price, exp.currency ?? 'ARS') }}
</q-badge>
```

The `v-if="exp.price != null"` guard is preserved — the server `getCatalog()` currently omits `price` and `currency` from its mapping (`el-templo-api/src/modules/programs/service.ts` lines 521-541), so the badge stays hidden until the server starts sending those fields. No visible behavior change today; the page is ready for the enriched response.

### Site 2 — Weekly-price helper (line 201, originally)

**Before:**

```typescript
function computeWeeklyPrice(monthlyPrice: number): string {
  return Math.round(monthlyPrice / 4.33).toLocaleString();
}
```

**After:**

```typescript
function computeWeeklyPrice(
  monthlyPrice: number,
  currency?: "ARS" | "EUR",
): string {
  const weeklyAmount = Math.round(monthlyPrice / 4.33);
  return formatPrice(weeklyAmount, currency ?? "ARS");
}
```

`buildWhatsAppMessage` gained a `currency` parameter, `openWhatsApp` passes `plan.currency`, and `openExperienciaWhatsApp` passes `exp.currency`. A null-monthlyPrice guard was added to `buildWhatsAppMessage` — see deviations.

## Type extensions (additive, per D-18)

### `MemberProgramCatalogItem` (`el-templo-app/src/modules/programs/types.ts`)

Added two optional fields:

```typescript
price?: number
currency?: 'ARS' | 'EUR'
```

Both optional with `?` — deployed app and older cached responses remain type-compatible. Adding `price?: number` also closes a pre-existing type gap: the template accessed `exp.price` despite the type not declaring it (the `v-if` guard hid the resulting `undefined` at runtime, but TypeScript was silently `any`-ing the expression).

### `MemberPlan` (inline interface in `PlanesPage.vue`, lines 137-150)

Added:

```typescript
currency?: 'ARS' | 'EUR'
```

Optional for the same reason — server's `/members/subscription/plans` may or may not include it, and older cached responses won't.

## Deviations from Plan

### Rule 1 - Bug: `buildWhatsAppMessage` crashes on undefined `monthlyPrice`

**Found during:** Task 1 implementation — tracing `plan.priceRegular` to the server response.

**Issue:** `el-templo-api/src/modules/subscriptions/member-routes.ts` lines 124-141 explicitly strip prices from the `/members/subscription/plans` response (comment: `// Map to member-safe response (no prices)`). The client's `MemberPlan.priceRegular: number` is thus a type lie — at runtime the field is `undefined`. `computeWeeklyPrice(undefined / 4.33)` would produce `NaN` and the WhatsApp message would contain `$NaN/semana`. Pre-existing.

**Fix:** Added `if (monthlyPrice == null) return priceless message` guard in `buildWhatsAppMessage`. When `monthlyPrice` is absent, the WhatsApp message now reads "Hola! Me interesa el plan {name}. Quiero mas info." instead of embedding a bogus weekly price. When it IS present, the message uses the currency-formatted weekly price (with the `/semana` suffix preserved).

**Also changed:** Dropped the literal `$` prefix before the formatted weekly price — `formatPrice` already renders the currency symbol (e.g. `$1.500` for ARS, `€70` for EUR), so the literal `$` was redundant and wrong for EUR.

**Files:** `el-templo-app/src/modules/plan/pages/PlanesPage.vue`
**Commit:** `2697f914`

### Rule 2 - Correctness: `MemberProgramCatalogItem` missing `price` declaration

**Found during:** Planning grep of `MemberProgramCatalogItem` vs the template's `exp.price` access.

**Issue:** The `MemberProgramCatalogItem` interface declared only `id`, `name`, `description`, `durationWeeks`, `hasContent` — yet the template accessed `exp.price`. TypeScript allowed this (inferred `any`) and the `v-if` guard hid the missing field at runtime, but the type was out of sync with the template's expectations.

**Fix:** Added `price?: number` to the type (alongside the plan-mandated `currency?: 'ARS' | 'EUR'`). Both optional — zero runtime impact, purely a type-gap closure so the new `formatPrice(exp.price, exp.currency ?? 'ARS')` expression is well-typed (inside the `v-if` narrow, `exp.price` is `number`, and the fallback keeps `currency` a valid `Currency | string` argument).

**Files:** `el-templo-app/src/modules/programs/types.ts`
**Commit:** `2697f914`

### Out of scope — pre-existing typing noise

`cd el-templo-app && pnpm tsc --noEmit` produces ~22 errors, none in the files this plan touched. All are the known Quasar/Vite ambient-module gaps documented in Plan 02's `deferred-items.md`:

- `import.meta.env` not typed (`src/boot/axios.ts`, `src/boot/sentry.ts`, `src/utils/logger.ts`)
- `.vue` modules without SFC shim (`src/modules/**/*.vue`, `src/router/routes.ts`, `src/router/index.ts`)
- `#q-app/wrappers` import not resolved

None originate from `PlanesPage.vue` or `format-price.ts`. Confirmed by running the filename-filtered grep `pnpm tsc --noEmit 2>&1 | grep -E "PlanesPage\.vue|format-price\.ts|programs/types\.ts"` — zero hits. No new type errors introduced by this plan.

`pnpm lint` produces 2 pre-existing warnings in `useSessionPlayer.ts` and `useUserStore.ts` — also unrelated.

## Acceptance criteria

| Criterion                                                             | Expected     | Actual                  | Status |
| --------------------------------------------------------------------- | ------------ | ----------------------- | ------ |
| `grep -c "formatPrice" PlanesPage.vue`                                | >= 2         | 4                       | OK     |
| `grep -q "currency" PlanesPage.vue`                                   | 1            | many                    | OK     |
| `grep -q "?? 'ARS'" PlanesPage.vue`                                   | present      | present at 3 call sites | OK     |
| `grep -c "\\.toLocaleString()" PlanesPage.vue`                        | 0            | 0                       | OK     |
| `grep -rn "\\.toLocaleString()" el-templo-app/src`                    | 0 price hits | 0 hits total            | OK     |
| `grep -nE 'console\\.(log\|warn\|error)' PlanesPage.vue`              | 0            | 0                       | OK     |
| `cd el-templo-app && pnpm tsc --noEmit` — new errors in touched files | 0            | 0                       | OK     |
| `cd el-templo-app && pnpm lint` — new warnings                        | 0            | 0                       | OK     |

## Follow-ups (not in this plan's scope)

1. **Server-side enrichment of `/members/programs/catalog`** — the current service mapping omits `price` and `currency`. If the "Planes Por Objetivos" cards are supposed to show prices, the service needs to be updated to select those fields from `programs` (or from a linked plan). Today the `v-if` guard hides the badge, so no visible regression.
2. **Server-side enrichment of `/members/subscription/plans`** (regular plans) — the response explicitly strips prices (member-safe). If the WhatsApp pre-filled message should include a concrete weekly price, the server needs to start returning `priceRegular` and `currency`. Today the null-guard returns a priceless message, so no crash, no `$NaN`.
3. **Fix pre-existing Quasar/Vite typing noise** — tracked in `.planning/phases/98-multi-currency-and-country-scoped-plans/deferred-items.md` since Plan 02.

## Self-Check: PASSED

Files modified (verified via `git log -1 --stat`):

- `el-templo-app/src/modules/plan/pages/PlanesPage.vue` — FOUND (22 insertions, 8 deletions)
- `el-templo-app/src/modules/programs/types.ts` — FOUND (9 insertions, 1 deletion)

Commit (verified via `git log --oneline -1`):

- `2697f914` feat(98-10): member app — migrate price displays to formatPrice with ARS fallback — FOUND

Grep verification (verified at execution end):

- `grep -rn "\\.toLocaleString()" el-templo-app/src --include="*.vue" --include="*.ts"` returns **0 hits** — FULL TREE CLEAN.
- `grep -c "formatPrice" el-templo-app/src/modules/plan/pages/PlanesPage.vue` returns **4** (>= 2).

All acceptance criteria satisfied.
