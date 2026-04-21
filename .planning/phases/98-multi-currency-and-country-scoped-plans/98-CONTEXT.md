# Phase 98: Multi-currency and country-scoped plans - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement country- and currency-aware behavior across schema, server validation, admin + member app UI, and reports, so that Argentina (ARS) and Spain (EUR) plans exist side-by-side with branch-scoped visibility for non-owner staff and owner-controlled country selection on plans and reports pages.

</domain>

<spec_lock>

## Requirements (locked via SPEC.md)

**11 requirements are locked.** See `98-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `98-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**

- Schema migration: `country` (plans, promos, gladius) + `currency` (plans, subs, payments) with AR/ARS backfill
- Seed: 12 ES plans with exact EUR prices (Requirement 4)
- Server-side country scoping for non-owner roles on members, plans, subs, payments, promos, reports
- Server-side validation rejecting cross-country plan assignment, cross-currency payments, cross-country reads/writes
- Admin UI: owner country dropdown on PlanesPage and reports pages; plan pickers filter by branch country
- Member app: own-country plans/upsells only; currency-aware price display
- Shared currency-aware price formatter in both apps
- Currency-segmented financial reports, analytics, caja, exports
- Multi-branch plans scoped to a single country
- Integration tests covering RBAC, cross-country validation, AR regression

**Out of scope (from SPEC.md):**

- Live FX rate API or automatic re-pricing
- Consolidated/base-currency reporting
- Mercado Pago / Stripe integration
- Cross-country member transfers
- Training programs / AURA / holidays country scoping
- New BCN branches or BCN-specific scheduling
- Feature flag rollout
- Reassigning existing members

**Spec refinement during discuss-phase:** Requirement 7's "AR/ES/Todos segmented selector" is refined to "Argentina/España QSelect dropdown, default Argentina, no Todos mode" (per Area 2 discussion). SPEC.md Requirement 7 and Acceptance Criterion #4 updated to match.

</spec_lock>

<decisions>
## Implementation Decisions

### Server Enforcement

- **D-01:** Country-scope enforcement is a Fastify `attachCountryScope` preHandler registered on each module's plugin (members, plans, subscriptions, payments, promos, reports). The hook reads `request.user.branchId`, queries `branches.country`, and decorates `request.scope = { country, isOwner }`. Services accept the scope as a parameter.
- **D-02:** Owners may send `?country=AR|ES` as a query parameter; the preHandler honors it. Non-owners' client-provided `country` is ignored — the hook always derives from their branch (defense in depth, prevents lateral escalation).
- **D-03:** Cross-country write validation lives inside service methods (`assignPlan`, `changePlan`, `recordPayment`, etc.), not in middleware. Returns HTTP 400 with a Spanish error message via the existing `{ error, message }` error shape. Same pattern as the duplicate-DNI check already in members/routes.ts.

### Plan-listing API

- **D-04:** Member-app endpoint `GET /api/members/plans/catalog` derives country from the authenticated member's branch. No country query parameter is accepted or required.
- **D-05:** Admin endpoint `GET /api/admin/plans?branchId=X` resolves the passed branch → country server-side and returns country-matching plans. Used by `MemberFormDialog` during create (selected branch drives the query), `AssignPlanDialog` and `MemberSubscriptionTab` during edit/assign (use the member's existing `branchId`). Dialog refreshes the plan list when the branch field changes.
- **D-06:** PlanesPage owners see a `QSelect` dropdown with options **Argentina** and **España**, defaulting to **Argentina**. There is no "Todos" option. Owner always picks one country at a time; server returns that country's plans. Non-owners see no dropdown — list is scoped automatically by their branch's country.

### Price Formatter

- **D-07:** No pnpm workspace. The formatter is a standalone ~30-line utility duplicated in each app: `el-templo-admin/src/utils/format-price.ts` and `el-templo-app/src/utils/format-price.ts`. Same pattern used for `extract-error.ts` earlier this session.
- **D-08:** Function signature: `formatPrice(amount: number, currency: 'ARS' | 'EUR'): string`. Amount is in whole currency units (matching the existing `int` storage). ARS uses `es-AR` locale formatting (e.g., `$1.500`); EUR uses `es-ES` locale formatting (e.g., `€70`).
- **D-09:** Every existing inline `${price.toLocaleString()}` template expression is migrated to `formatPrice(amount, currency)` in this phase — ~10+ files across admin + member app, including PlanesPage, MemberFormDialog, MemberSubscriptionTab, SubscriptionCard, AssignPlanDialog, PlanFormDialog, FinanzasTab, CajaPage, ReportesPage, AnaliticasPage, and the member app's plan catalog and upsell surfaces. Single-pass migration; no hybrid fallback.

### Reports UI

- **D-10:** CajaPage, ReportesPage, AnaliticasPage, and FinanzasTab each get the same Argentina/España `QSelect` at the top for owners (default Argentina). Data and totals are single-currency per view — driven by the selector's value.
- **D-11:** Non-owner staff see no selector on any report page. Server automatically scopes reports to their branch's country.
- **D-12:** List views do not need a currency badge column (each filtered view is single-currency by construction). Amount cells use `formatPrice(amount, currency)` where currency comes from the row's own `currency` field.
- **D-13:** CSV and Excel exports always include a `currency` column on every row. Export file content reflects the active country filter — no zipped multi-file exports.

### Migration

- **D-14:** Single migration file (`el-templo-api/src/db/migrations/0069_multi_currency_and_country_scope.sql`) containing schema ALTER TABLEs, AR/ARS backfill UPDATEs, and ES plan INSERTs in one transaction. Atomic all-or-nothing. Matches Phase 86 precedent in STATE.md ("Manual migration SQL instead of drizzle-kit generate").
- **D-15:** Manual SQL — do not run `pnpm db:generate`. Update the Drizzle schema definition files (`subscription-plans.ts`, `subscriptions.ts`, `payments.ts`, `promo-plans.ts`, `gladius-products.ts`) in the same PR so they match the DB. Migration SQL committed alongside schema changes per memory `always_commit_migration_sql`.

### Cross-country Error UX

- **D-16:** Client UI prevents cross-country submissions at the source — plan dropdowns only show plans matching the target branch's country (already enforced by D-05). Server 400 is final authority for API-direct clients and race conditions.
- **D-17:** When the server returns 400 for a cross-country/currency violation, admin UI shows the message via `$q.notify({ type: 'negative', message, timeout: 5000 })` and keeps the dialog open so the admin can correct. Per the Sentry-noise pattern we applied earlier this session, use `log.warn` (not `log.error`) for expected 4xx client errors — they don't belong in Sentry. Reuse `isExpectedClientError(err)` helper in `src/utils/extract-error.ts`.

### Backward Compatibility

- **D-18:** New `currency` and `country` fields are added additively to existing response shapes. No endpoint renames, no field removals, no response-type version bumps. Responses remain a strict superset of today's shapes — deployed iOS and Android apps ignore unknown fields and continue working.
- **D-19:** New app releases read `plan.currency ?? 'ARS'` as a safety fallback for any edge case where the field is missing. Both currently-deployed iOS and Android production builds must be verified against staging (running the new API) before master is promoted.

### Claude's Discretion

- Owner country persistence across sessions (localStorage vs reset): defer to Claude. Default is "reset to Argentina on each visit" since session memory wasn't requested.
- Integration test structure and coverage breadth: planner decides concrete test count and layout, as long as Acceptance Criteria from SPEC.md are covered (RBAC matrix, cross-country 400s, AR regression).
- Gladius products admin UI: table gets `country` column; admin CRUD respects country scoping via the same preHandler. No dedicated redesign unless existing UI breaks.
- Spanish wording of the error messages ("El plan no corresponde al país de la sucursal", etc.) — planner picks exact phrasing consistent with existing Spanish UI copy.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase artifacts

- `.planning/phases/98-multi-currency-and-country-scoped-plans/98-SPEC.md` — Locked requirements (MUST read before planning)

### Project conventions

- `CLAUDE.md` — Logging (Pino on API, createLogger on frontends), no `any`, TypeScript strict, migration workflow (`db:generate` canonical but manual SQL used per precedent), pre-commit hooks
- `.planning/STATE.md` — Accumulated decisions (see Phase 86 manual SQL precedent, Phase 66 role registry pattern, duplicate-key detection in err.cause from Phase 82)

### Role & permission infrastructure

- `el-templo-api/src/modules/shared/permissions.ts` — Single source of truth for `OWNER_ROLES`, `ADMIN_ROLES`, `COACH_ROLES`, etc. Import role groups rather than defining them locally (Phase 66 convention).

### Existing country-filter precedent

- `el-templo-api/src/modules/scheduling/holiday-service.ts` — Existing pattern for filtering by `branches.country`. Model the new `attachCountryScope` preHandler on this.
- `el-templo-api/src/modules/subscriptions/booking-population.ts` §74-140 — Another `branches.country` consumer, useful as a reference for handling country-derived data.

### Schema files being altered

- `el-templo-api/src/db/schema/branches.ts` — Existing `country` column (AR default, ES possible)
- `el-templo-api/src/db/schema/subscription-plans.ts` — Add `country`, `currency`
- `el-templo-api/src/db/schema/subscriptions.ts` — Add `currency`
- `el-templo-api/src/db/schema/payments.ts` — Add `currency`
- `el-templo-api/src/db/schema/promo-plans.ts` — Add `country`
- `el-templo-api/src/db/schema/gladius-products.ts` — Add `country`

### Service-layer integration points

- `el-templo-api/src/modules/subscriptions/service.ts` — `assignPlan`, `changePlan`, `renewSubscription`; add cross-country guards here (D-03)
- `el-templo-api/src/modules/members/service.ts` — Member queries (scoped by preHandler)
- `el-templo-api/src/modules/members/routes.ts` — Add `attachCountryScope` preHandler; existing duplicate-DNI 409 pattern at ~line 363 is the template for cross-country 400 errors
- `el-templo-api/src/modules/payments/service.ts` / routes.ts — Payment currency validation (D-03), scoped reads
- `el-templo-api/src/modules/reports/service.ts` — Scope filtering at ~lines 225/266/372/407/440 where `filters.branchId` is checked; add country filter alongside
- `el-templo-api/src/modules/analytics/service.ts` — Similar scope filter layer

### Admin UI integration points

- `el-templo-admin/src/pages/PlanesPage.vue` — QSelect dropdown (owner-only) at top
- `el-templo-admin/src/components/MemberFormDialog.vue` — Plan dropdown scoped by selected `branchId`
- `el-templo-admin/src/components/AssignPlanDialog.vue`, `PlanFormDialog.vue`, `MemberSubscriptionTab.vue` — Plan pickers scoped by member's branch
- `el-templo-admin/src/components/SubscriptionCard.vue` — Price display via `formatPrice`
- `el-templo-admin/src/pages/CajaPage.vue`, `ReportesPage.vue`, `AnaliticasPage.vue`, `el-templo-admin/src/components/analytics/FinanzasTab.vue` — Country dropdown (owner-only) + `formatPrice` across amounts
- `el-templo-admin/src/utils/extract-error.ts` — Reuse `isExpectedClientError` (added earlier this session) for 4xx Sentry-noise pattern
- `el-templo-admin/src/utils/format-price.ts` — NEW (D-07/08)

### Member app integration points

- `el-templo-app/src/utils/extract-error.ts` — Reuse `isExpectedClientError` (added earlier this session)
- `el-templo-app/src/utils/format-price.ts` — NEW (D-07/08), duplicate of admin file
- `el-templo-app/src/pages/PlanesPage.vue`, plan catalog, upsell surfaces — All price displays via `formatPrice`

### Database migration conventions

- `el-templo-api/src/db/migrations/0068_*.sql` — Most recent manual SQL migration (Phase 90), template for 0069
- `el-templo-api/src/db/run-migrations.ts` — Custom migration runner (the `_migrations` table is the source of truth, not drizzle-kit's `meta/_journal.json`)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`extract-error.ts` + `isExpectedClientError`** (both apps): Use the helper added earlier this session in every new catch block that surfaces a cross-country 400 — keeps Sentry clean.
- **`branches.country` + holiday-service country filter**: Blueprint for the `attachCountryScope` preHandler and service-layer country filters. Literally the same SQL shape (`WHERE country = ?`).
- **Existing role groups in `permissions.ts`**: Reuse `OWNER_ROLES` for the country-toggle visibility check. No new role constants needed.
- **Existing error-response shape** (`{ error: "Conflicto", message: "..." }`): Reuse for cross-country 400s. Admin frontends already parse this via `extractError`.
- **Quasar `QSelect`**: Widely used in admin forms (see `MemberFormDialog` documentType/gender/level selects, payment method selectors). Country dropdown is a trivial addition.
- **`usePersonalizedApi`-style scoped composables**: Pattern for wrapping API calls with error handling that we can mirror for the currency-aware plan list hook.

### Established Patterns

- **Modular monolith** (`src/modules/<domain>/{routes,service,schemas,types}.ts`): Each module registers as a Fastify plugin — the preHandler registration naturally lives at plugin top-level.
- **Constructor DI** for services (Phase 56 convention): `MemberService` takes `db` + related services in constructor. No new DI changes needed; pass country scope as a method argument, not an instance field.
- **Manual SQL migrations** (Phase 86 precedent): Avoid `drizzle-kit generate` interactive prompts; write SQL by hand alongside updated Drizzle schema files.
- **Spanish UI copy, English code**: All user-facing strings in Spanish. Variable names, types, comments in English.
- **Atomic commits per plan**: Plans will produce one commit each; keep plan boundaries aligned to schema, server, admin UI, member UI.

### Integration Points

- Every existing plugin (`membersRoutes`, `plansRoutes`, `subscriptionRoutes`, `paymentsRoutes`, `reportsRoutes`, `analyticsRoutes`, `promoRoutes`, `gladiusRoutes`) receives a `fastify.addHook('preHandler', attachCountryScope)` registration.
- Each service method that writes plans, subs, or payments grows a country/currency consistency check (one new `if` per method, typically).
- Every admin form dialog that embeds a plan list takes a `branchId` (already present in most cases) and passes it to the new scoped endpoint.
- `extract-error.ts` in both apps gets no code change — just imports of the existing helper into new catch blocks.

</code_context>

<specifics>
## Specific Ideas

- **Owner country selector UX**: `QSelect` with `options={[{ label: 'Argentina', value: 'AR' }, { label: 'España', value: 'ES' }]}`, `emit-value map-options`, default `modelValue = 'AR'`. Same component reused across PlanesPage, CajaPage, ReportesPage, AnaliticasPage, FinanzasTab.
- **Exact EUR prices locked in SPEC.md Requirement 4** (in cents): Flex 7000, Flex+ 9000, Foundation 21000, Foundation+ 30000, Performance 50000, Sesión de Prueba 0, 30 Días Online 2000, Cero a Atleta 3000, Foundation Online 3000, Piernas y Glúteos 3000, Promo Gratuito 3000, Tu Primer Front Lever 3000. Migration INSERTs these verbatim.
- **Error message copy** (Spanish, terse, matches existing admin style): "El plan no corresponde al país de la sucursal", "No puedes registrar un pago en una moneda distinta a la suscripción", "No tienes permiso para ver datos de otro país". Planner to confirm final wording with existing copy conventions.
- **App compat verification**: Before promoting to master, run both currently-deployed iOS and Android builds against staging API and confirm no price screen crashes. Non-negotiable per D-19.

</specifics>

<deferred>
## Deferred Ideas

- **Owner country persistence across sessions** (localStorage-backed selector memory) — not requested, defaults to "reset to Argentina each visit." Can be added in a later polish pass.
- **Integration test strategy specifics** (which exact endpoints to cover, fixture layout) — planner's call during plan-phase.
- **Gladius products country-aware UI** — country column tagged, CRUD respects scope, but dedicated UI redesign not in this phase.
- **Live FX rate feed / admin-editable FX rate table** — explicitly out-of-scope per SPEC. User chose manual EUR prices for this phase; revisit if BCN scales enough to warrant consolidated reporting.
- **Consolidated base-currency reporting** — out-of-scope per SPEC (segmentation only).
- **Payment gateway integration (Stripe/Mercado Pago)** — out-of-scope per SPEC; covered by ecosystem roadmap phase 7.

</deferred>

---

_Phase: 98-multi-currency-and-country-scoped-plans_
_Context gathered: 2026-04-21_
