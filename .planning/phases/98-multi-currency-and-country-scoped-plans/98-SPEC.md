# Phase 98: Multi-currency and country-scoped plans — Specification

**Created:** 2026-04-21
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 11 locked

## Goal

El Templo supports independent Argentina (ARS) and Spain (EUR) subscription plans with country- and currency-aware behavior across schema, server validation, admin UI, member app, and reports — such that owners can manage both countries, non-owner staff see only their country's data, and no cross-country or cross-currency assignment is possible.

## Background

- **Schema today:** `branches.country` exists (AR default, ES possible) and is already used for holiday filtering. `subscription_plans`, `subscriptions`, `payments`, `promo_plans`, and `gladius_products` have amount columns as bare `int` with an implicit ARS currency. No `currency` concept exists anywhere in the codebase.
- **RBAC today:** roles are `owner > admin > coach = gestion = recepcion (parallel)`. Branch-level scoping is NOT enforced at the server for members/subscriptions/payments — clients currently filter by `branchId` client-side. This is a new enforcement layer.
- **Production state:** BCN branch exists (`country='ES'`), zero ES subscriptions/payments/members exist, so migration only touches AR data.
- **App deployment constraint:** mobile app builds (Android + iOS via Play/App Store) ship significantly slower than API deploys. API responses shipped with this phase must remain readable by currently-deployed app versions until users update.

## Requirements

1. **Currency columns on pricing-owning tables**: A `currency` column stores the ISO currency code on every row that holds a monetary amount the member pays.
   - Current: `subscription_plans`, `subscriptions`, `payments` have no `currency` column; amounts are bare `int` implicitly ARS.
   - Target: Add `currency VARCHAR(3) NOT NULL DEFAULT 'ARS'` to `subscription_plans`, `subscriptions`, and `payments`. Subscriptions inherit currency from plan at assignment time; payments inherit from subscription at recording time (locked, never recomputed).
   - Acceptance: A new subscription created from an EUR plan has `currency='EUR'`; a payment on that subscription has `currency='EUR'`; changing the plan's currency later does not retroactively change existing subscriptions or payments.

2. **Country columns on country-scoped tables**: A `country` column ties the row to a specific country.
   - Current: `subscription_plans`, `promo_plans`, `gladius_products` have no `country` column.
   - Target: Add `country VARCHAR(2) NOT NULL DEFAULT 'AR'` to `subscription_plans`, `promo_plans`, `gladius_products`. (Subscriptions/payments derive country via `branch_id → branches.country`, no new column needed on them.)
   - Acceptance: `SELECT DISTINCT country FROM subscription_plans` returns `{'AR', 'ES'}` after migration + seed; promo and gladius tables are either `AR` (backfilled) or `ES` (only if seeded).

3. **Historical data backfill**: Every pre-existing row in production ends the migration tagged as AR/ARS with no behavior change.
   - Current: No country/currency data exists on any row.
   - Target: Migration script sets `country='AR'` on all existing plans/promos/gladius rows and `currency='ARS'` on all existing plans/subs/payments in the same transaction as the schema change.
   - Acceptance: Post-migration, `SELECT COUNT(*) FROM subscription_plans WHERE country IS NULL OR currency IS NULL` returns 0; same for `subscriptions.currency`, `payments.currency`, `promo_plans.country`, `gladius_products.country`.

4. **ES plan seeding**: Spain plans exist at migration time with exact EUR prices supplied by the user.
   - Current: No ES subscription plans exist.
   - Target: Migration seeds the following ES/EUR plans (all with `country='ES', currency='EUR'`):
     - **Presenciales**: Flex €70, Flex+ €90, Foundation €210, Foundation+ €300, Performance €500, Sesión de Prueba €0
     - **Online**: 30 Días Online €20, Cero a Atleta €30, Foundation Online €30, Piernas y Glúteos €30, Promo Gratuito 30 Días €0, Tu Primer Front Lever €30
   - Acceptance: `SELECT name, price_regular, currency, country FROM subscription_plans WHERE country='ES' ORDER BY name` returns the 12 plans above with prices matching (in cents: 7000, 9000, 21000, 30000, 50000, 0, 2000, 3000, 3000, 3000, 0, 3000).

5. **Server-side country scoping for non-owners**: Branch-scoped staff cannot see or act on the other country's data.
   - Current: Non-owner staff can see all branches' data by choosing `branchId` client-side; no server enforcement.
   - Target: On every list/read endpoint for plans, members, subscriptions, payments, promos, and reports, the server derives `request.user.branchId → branches.country` and filters results to that country when `role !== 'owner'`. Owners are unfiltered.
   - Acceptance: An integration test with an AR admin user calling `GET /api/admin/members`, `GET /api/admin/plans`, `GET /api/admin/payments`, `GET /api/admin/reports/*` returns only AR rows; same test with an ES admin returns only ES rows; same test with an owner returns both.

6. **Cross-country/currency write validation**: The server rejects any write that would mix countries or currencies.
   - Current: No validation — client can assign an AR plan to an ES branch member.
   - Target: API returns HTTP 400 when (a) assigning a plan whose `country` does not match the member's branch country; (b) recording a payment whose `currency` does not match the parent subscription's currency; (c) a non-owner attempts to read or write a row whose country does not match their branch country.
   - Acceptance: Integration tests cover each of (a)(b)(c) and confirm 400 response with a user-readable error message.

7. **Owner country toggle on PlanesPage**: Owners can filter the plans list by country.
   - Current: `PlanesPage.vue` shows all plans; no country UI.
   - Target: Owners see an AR/ES/Todos segmented selector at the top of the plans page. Non-owners see no selector (list is already filtered server-side by their branch country).
   - Acceptance: Logged in as owner, toggling to AR shows only AR plans; toggling to ES shows only ES plans; toggling to Todos shows both. Logged in as AR admin, no selector is visible, list shows only AR plans.

8. **Country-aware plan selection in member flows**: Plan pickers in admin flows only offer plans matching the target member's branch country.
   - Current: `MemberFormDialog` plan dropdown shows all plans regardless of branch.
   - Target: When creating or changing a member's plan, the plan dropdown filters to plans where `country = member.branch.country`. Same behavior in subscription assign / plan change flows.
   - Acceptance: Creating a new member in a BCN branch only shows 12 EUR plans in the plan dropdown; creating one in an AR branch shows only AR plans.

9. **Currency-aware price formatting**: Every UI surface showing a monetary amount respects its currency.
   - Current: Price display hardcodes Argentina formatting (no symbol or `$` prefix), ignores currency.
   - Target: A shared price formatter in admin and member app renders `$1.500` for `ARS` and `€15` for `EUR` (Spanish locale rules for each). All existing price displays — PlanesPage, MemberFormDialog, payment forms, subscription summary, member app plan catalog, upsell screens, reports — route through this formatter.
   - Acceptance: Visual inspection of each surface shows the correct currency symbol and formatting for an EUR plan vs an ARS plan; zero hardcoded `$` remain in displayed price templates.

10. **Segmented currency reporting**: Financial reports never sum across currencies.
    - Current: Reports sum `amount` and `pricePaid` columns with no currency awareness.
    - Target: Every financial report/export/dashboard (caja, payments list, revenue analytics, exports) groups totals by currency and displays them as separate lines ("ARS $128.400" / "EUR €540"). Export files include a `currency` column on each row.
    - Acceptance: Owner-facing revenue report with mixed-currency seed data shows two distinct totals, never a single summed figure; CSV/Excel exports have a `currency` column populated on every row.

11. **App backward compatibility**: The currently-deployed mobile app keeps working during and after deploy.
    - Current: Deployed mobile apps query endpoints that return plan/subscription/payment shapes without `currency`.
    - Target: API responses remain a superset of today's shapes. New `currency` and `country` fields are additive only; no existing field is renamed, typed differently, or removed. Mobile app uses `currency` when present and falls back to ARS formatting when absent so that older builds in the field continue rendering prices without crashing.
    - Acceptance: Running the current production app build (pre-phase-98) against the new API does not crash on any screen that displays a price; a test against `GET /api/members/me/subscription` with the old app's expected schema passes.

## Boundaries

**In scope:**

- Schema migration: add `country` (plans, promos, gladius) and `currency` (plans, subs, payments) columns with AR/ARS backfill
- Seed: 12 ES plans with exact EUR prices listed in Requirement 4
- Server-side country scoping middleware/filter for non-owner roles on members, plans, subscriptions, payments, promos, reports
- Server-side validation rejecting cross-country plan assignment, cross-currency payments, and cross-country reads/writes for non-owners
- Admin UI: owner country toggle on PlanesPage; plan pickers in member/subscription flows filter by branch country
- Member app: own-country plans/upsells only; currency-aware price display
- Shared currency-aware price formatter across admin and member app
- Currency-segmented financial reports, analytics, caja, and exports
- Multi-branch plans (`multi_branch=true`) scoped to a single country
- Integration tests covering RBAC (AR user, ES user, owner), cross-country validation (400 cases), and AR regression

**Out of scope:**

- Live FX rate API or automatic price re-pricing — user supplied exact EUR prices manually (Round 1)
- Consolidated/base-currency reporting (converting everything to one currency for a single total) — Round 2 confirmed segmentation is the only aggregation model
- Mercado Pago / Stripe payment gateway integration — ecosystem roadmap phase 7 covers this
- Cross-country member transfers or multi-country member accounts — Round 1 locked: a member belongs to exactly one country; moving countries means closing the account and creating a new one
- Training programs (`micro-programs`) country scoping — training programs are country-agnostic per user's clarification
- AURA economy country scoping — AURA stays global (Round 2)
- Holidays table changes — already country-aware, no work needed
- New BCN branches or BCN-specific scheduling — BCN branch exists; scheduling/schedules are branch-scoped already
- Reassigning any existing members to different currencies — zero ES members exist in production, so no reassignment scope
- Feature flag gating the rollout — Round 4 chose one-shot PR, no runtime flag

## Constraints

- **Staging-first, no merges to master:** per project convention (memory: staging-first-strict). All work on a local branch, goes through staging deploy first, promoted to master only after user-confirmed soak.
- **Forward-compatible API:** Requirement 11 — endpoints must remain readable by currently-deployed mobile apps. No renamed/removed fields, only additive `currency`/`country`. This is the critical constraint because app builds ship significantly slower than API.
- **Migration atomicity:** schema change, backfill, and ES plan seed land in a single migration (following the project's `drizzle-kit generate` → manual migration SQL → `db:migrate` pattern, and committed SQL per memory: `always_commit_migration_sql`).
- **No prod data changes outside migrations:** per memory (`feedback_prod_data_via_migrations`), the ES plan seed lives inside the numbered migration file, not a re-run of `seed-production.ts`.
- **No dependency installs:** per memory (`feedback_no_auto_install_deps`), any new library (e.g., currency formatting) requires explicit user approval before install.
- **One-shot deploy:** Round 4 chose one-shot feature PR + migration (not two-stage, not feature-flagged). Rollback plan must be viable in a single revert.
- **TypeScript strict + no `any`:** per CLAUDE.md, currency and country values are typed as string literal unions (`'ARS' | 'EUR'`, `'AR' | 'ES'`), not plain strings.

## Acceptance Criteria

- [ ] Schema migration adds `country` to `subscription_plans`, `promo_plans`, `gladius_products` and `currency` to `subscription_plans`, `subscriptions`, `payments` — all NOT NULL with sensible defaults
- [ ] Post-migration, 0 rows in any of the above tables have NULL in the new columns
- [ ] 12 ES plans exist with exact prices from Requirement 4
- [ ] Owner logged into PlanesPage sees an AR/ES/Todos toggle that filters the list correctly
- [ ] AR admin logged into PlanesPage sees no toggle and only AR plans; same test for ES admin returns only ES plans
- [ ] Creating a member in a BCN branch only shows ES plans in the plan dropdown
- [ ] API returns HTTP 400 when assigning an AR plan to an ES-branch member (integration test)
- [ ] API returns HTTP 400 when recording an EUR payment against an ARS subscription (integration test)
- [ ] Non-owner cannot read the other country's members/plans/payments (integration test returns empty or 403)
- [ ] Every price display in admin and member app renders the correct currency symbol and locale formatting for EUR plans
- [ ] Financial reports / caja / exports show ARS and EUR as separate totals; exports have a `currency` column
- [ ] Currently-deployed production app build does not crash when run against the new API (manual verification on staging)
- [ ] All existing AR integration tests pass post-migration with no changes beyond type annotations for new columns

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                             |
| ------------------- | ----- | ----- | ------ | ----------------------------------------------------------------- |
| Goal Clarity        | 0.90  | 0.75  | ✓      | Currency location, country scope, member-country rule locked      |
| Boundary Clarity    | 0.85  | 0.70  | ✓      | Explicit in/out lists; adjacent tables (AURA, programs) ruled out |
| Constraint Clarity  | 0.80  | 0.65  | ✓      | Forward-compat app constraint captured; migration atomicity       |
| Acceptance Criteria | 0.80  | 0.70  | ✓      | 13 pass/fail criteria, each verifiable                            |
| **Ambiguity**       | 0.15  | ≤0.20 | ✓      |                                                                   |

## Interview Log

| Round | Perspective     | Question summary                              | Decision locked                                                                    |
| ----- | --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1     | Researcher      | Where does `currency` live?                   | On plans, subs, payments (all three), inherited down the chain                     |
| 1     | Researcher      | Member moves AR → ES branch mid-subscription? | Impossible by policy — old account closed, new account created in new country      |
| 1     | Researcher      | FX conversion strategy?                       | No FX table; user supplied exact EUR prices manually                               |
| 2     | Simplifier      | Member app currency display?                  | Member sees only their own country's plans and prices                              |
| 2     | Simplifier      | Which adjacent tables also country-scoped?    | `promo_plans` and `gladius_products` in; AURA stays global                         |
| 2     | Simplifier      | Report aggregation across currencies?         | Segmented per currency, never summed                                               |
| 3     | Boundary Keeper | Multi-branch plans across countries?          | Multi-branch within a single country only; no cross-country multi-branch plans     |
| 3     | Boundary Keeper | Server enforcement of country scoping?        | Derive country from `request.user.branchId → branch.country` for non-owners        |
| 3     | Boundary Keeper | Migration treatment of existing data?         | Backfill AR/ARS on all existing rows in the same migration transaction             |
| 4     | Failure Analyst | BCN production state today?                   | BCN branch exists, zero ES members/payments/subs — clean slate for ES seed         |
| 4     | Failure Analyst | Which acceptance criteria must all pass?      | UX, server validation, reports, and AR regression — all four groups mandatory      |
| 4     | Failure Analyst | Rollout strategy given staging-first?         | One-shot feature PR + migration; no two-stage; no feature flag                     |
| 4     | Failure Analyst | Additional constraint surfaced                | App builds ship slower than API → API must be forward-compatible with deployed app |

---

_Phase: 98-multi-currency-and-country-scoped-plans_
_Spec created: 2026-04-21_
_Next step: /gsd-discuss-phase 98 — implementation decisions (middleware structure, UI component reuse, plan picker pattern, etc.)_
