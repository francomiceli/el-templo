# Phase 98: Multi-currency and country-scoped plans - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 98-multi-currency-and-country-scoped-plans
**Areas discussed:** Server enforcement pattern, Plan-listing API shape, Price formatter shape, Reports UI for two currencies, Migration granularity, Cross-country error UX, Backward-compat API shape specifics

---

## Server enforcement pattern

### Q1: Where does the country-scope-for-non-owners logic live on the server?

| Option                                 | Description                                                        | Selected |
| -------------------------------------- | ------------------------------------------------------------------ | -------- |
| Fastify preHandler hook per plugin     | Hook registered on each module's plugin, decorates `request.scope` | ✓        |
| Service-layer helper called per method | Helper called at the top of every controller method                |          |
| Drizzle query helper (addCountryScope) | Function mutates each Drizzle select/update/delete                 |          |

**User's choice:** Fastify preHandler hook per plugin

### Q2: How does an owner temporarily filter to one country?

| Option                                                         | Description                                                          | Selected |
| -------------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| Owner sends `?country=AR\|ES` query; non-owner's query ignored | Non-owners always filter by branch country; owners honored via query | ✓        |
| Separate /admin/plans and /plans endpoints                     | Owner-only routes duplicated                                         |          |
| Owner gets `country` via body/header, always                   | No 'all countries' mode                                              |          |

**User's choice:** Owner sends `?country=AR|ES` query; non-owner's query ignored

### Q3: Where does cross-country write validation live?

| Option                                            | Description                                                   | Selected |
| ------------------------------------------------- | ------------------------------------------------------------- | -------- |
| Service method, alongside existing business rules | In assignPlan/changePlan/recordPayment, throw 400 on mismatch | ✓        |
| DB-level check constraints                        | MySQL CHECK constraints                                       |          |
| Cross-cutting validator middleware                | Shared validator before controller logic                      |          |

**User's choice:** Service method, alongside existing business rules

---

## Plan-listing API shape

### Q1: Member app endpoint — how does server determine country?

| Option                                                | Description                                                | Selected |
| ----------------------------------------------------- | ---------------------------------------------------------- | -------- |
| Derive from member's branch.country                   | Server reads authenticated member's branch, no query param | ✓        |
| Accept ?country= and validate against member's branch | Client sends country, server 400s if mismatch              |          |

**User's choice:** Derive from member's branch.country

### Q2: Admin member-creation plan list — how does it know what to show?

| Option                                                           | Description                                 | Selected |
| ---------------------------------------------------------------- | ------------------------------------------- | -------- |
| Pass selected branchId to `GET /api/admin/plans?branchId=X`      | Server resolves branch → country internally | ✓        |
| Admin UI infers country from branch object and sends `?country=` | Frontend does the lookup                    |          |
| Server accepts both branchId and memberId, derives accordingly   | One smart endpoint for all contexts         |          |

**User's choice:** Pass selected branchId to `GET /api/admin/plans?branchId=X`

### Q3: When owner is on PlanesPage and toggles Todos, what does server return?

| Option                                            | Description                  | Selected |
| ------------------------------------------------- | ---------------------------- | -------- |
| All plans, `country` field on each row            | Both AR+ES in one mixed list |          |
| Require owner to pick a country (no Todos)        | No mixed view                |          |
| Todos = two parallel requests, merged client-side | Avoid special server mode    |          |

**User's choice:** Other — "owners in planes page should have a select with dropdown, options Argentina and España, default to Argentina"
**Notes:** User rejected the "Todos" premise entirely. Owner always picks one country at a time. SPEC.md Requirement 7 refined to match. Applies to reports pages too.

---

## Price formatter shape

### Q1: Where does the shared currency formatter live?

| Option                                      | Description                                | Selected |
| ------------------------------------------- | ------------------------------------------ | -------- |
| Duplicate tiny file in each app             | Same ~30-line utility in each app's utils/ | ✓        |
| Introduce a shared packages/ workspace      | pnpm workspace setup                       |          |
| Single location, imported via relative path | Cross-app coupling via ../../              |          |

**User's choice:** Duplicate tiny file in each app

### Q2: Function signature?

| Option                                                       | Description                   | Selected |
| ------------------------------------------------------------ | ----------------------------- | -------- |
| `formatPrice(amount, currency)` returning string             | Pure function                 | ✓        |
| `formatPrice(amount, context)` deriving currency from object | Less repetitive at call sites |          |
| Composable `usePriceFormatter(currency)`                     | Vue composable returning fn   |          |

**User's choice:** `formatPrice(amount, currency)` returning string

### Q3: Migration strategy for existing inline expressions?

| Option                                                 | Description           | Selected |
| ------------------------------------------------------ | --------------------- | -------- |
| Replace every call site in this phase                  | Single-pass migration | ✓        |
| Replace only member-facing surfaces, leave admin alone | Partial migration     |          |
| Hybrid: keep inline fallback for .toLocaleString()     | Defer full migration  |          |

**User's choice:** Replace every call site in this phase

---

## Reports UI for two currencies

### Q1: How should reports display ARS and EUR totals for owner?

| Option                                           | Description                | Selected |
| ------------------------------------------------ | -------------------------- | -------- |
| Same dropdown as PlanesPage: owner picks country | Consistent UX across admin | ✓        |
| Stacked summary cards — both always visible      | KPI cards per currency     |          |
| Tabbed per-currency views                        | Tab bar                    |          |

**User's choice:** Same dropdown as PlanesPage: owner picks country

### Q2: Row-level display for list views?

| Option                                                | Description                   | Selected |
| ----------------------------------------------------- | ----------------------------- | -------- |
| Currency inferred from branch column, no extra column | Single-currency filtered view | ✓        |
| Add currency badge column in every table              | Clutter for safety            |          |
| Amount column shows symbol, no extra column           | Same as recommended           |          |

**User's choice:** Currency inferred from branch column, no extra column

### Q3: How should exports handle currency?

| Option                                                        | Description                 | Selected |
| ------------------------------------------------------------- | --------------------------- | -------- |
| Always include `currency` column; file reflects active filter | Consistent export shape     | ✓        |
| Two separate files per export (AR.csv + ES.csv)               | Zip per currency            |          |
| Single file, totals per currency in footer                    | Keep current footer pattern |          |

**User's choice:** Always include `currency` column; file reflects active filter

---

## Migration granularity

### Q1: How do we structure the SQL migration files?

| Option                                                | Description                       | Selected |
| ----------------------------------------------------- | --------------------------------- | -------- |
| Single migration file, three statements               | Atomic all-or-nothing in one file | ✓        |
| Split into three files: schema, backfill, seed        | Granular rollback                 |          |
| Two files: schema+backfill together, ES seed separate | Intermediate split                |          |

**User's choice:** Single migration file, three statements

### Q2: How is the migration SQL produced?

| Option                                   | Description                         | Selected |
| ---------------------------------------- | ----------------------------------- | -------- |
| Manual SQL file, no drizzle-kit generate | Matches Phase 86 precedent          | ✓        |
| Run `pnpm db:generate` + manual edits    | Canonical path, interactive prompts |          |

**User's choice:** Manual SQL file, no drizzle-kit generate

---

## Cross-country error UX

### Q1: Client-side block or rely on server 400?

| Option                                                          | Description                       | Selected |
| --------------------------------------------------------------- | --------------------------------- | -------- |
| Client blocks via filtered plan list, server is final authority | Dual-layer defense                | ✓        |
| Client runs validator before submit, shows inline error         | Redundant with filtered dropdowns |          |
| Server-only, no client guard                                    | Bad UX                            |          |

**User's choice:** Client blocks via filtered plan list, server is final authority

### Q2: How does admin UI show a 400?

| Option                                  | Description                         | Selected |
| --------------------------------------- | ----------------------------------- | -------- |
| Toast + keep dialog open for correction | q-notify + log.warn (not log.error) | ✓        |
| Inline field error                      | Under the plan dropdown             |          |
| Full dialog with dismissal confirmation | Blocking modal                      |          |

**User's choice:** Toast + keep dialog open for correction

---

## Backward-compat API shape specifics

### Q1: How are new fields added to existing responses?

| Option                                                            | Description                        | Selected |
| ----------------------------------------------------------------- | ---------------------------------- | -------- |
| Additive optional on all responses; old clients ignore            | JSON clients ignore unknown fields | ✓        |
| Nested `pricing: { amount, currency }` alongside existing `price` | Preserve old + add new object      |          |
| API version bump (v2 routes)                                      | Mount new routes at /api/v2/\*     |          |

**User's choice:** Additive optional on all responses; old clients ignore
**Notes:** "make sure this works with ios and android apps too" — both currently-deployed mobile builds must be verified on staging before master promotion.

### Q2: How should deployed app behave when receiving `currency`?

| Option                                                       | Description                | Selected |
| ------------------------------------------------------------ | -------------------------- | -------- |
| Current app ignores field; new app reads with 'ARS' fallback | No blocking gate           | ✓        |
| Block ES signups until app update ships                      | Explicit go-live gate      |          |
| Server-side opt-in header for new schema                     | Version header negotiation |          |

**User's choice:** Current app ignores field; new app reads with 'ARS' fallback

---

## Claude's Discretion

- Owner country selector persistence across sessions (defaults to "reset to Argentina each visit"; localStorage not requested)
- Integration test layout and per-endpoint breadth (planner decides during plan-phase)
- Gladius products admin UI details (country column added; no dedicated UI redesign)
- Exact Spanish wording of new error messages (planner picks consistent with existing admin copy)

## Deferred Ideas

- Owner country selector localStorage persistence — future polish pass
- Live FX rate feed or admin-editable FX table — explicitly out of phase scope
- Consolidated base-currency reporting — out of scope per SPEC
- Payment gateway integration (Stripe / Mercado Pago) — ecosystem roadmap phase 7
- Dedicated gladius products country redesign — only column + scope in this phase
