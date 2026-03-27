# Phase 86: QR Promo — Free Month Campaign - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a QR-based promo code system for time-limited free month campaigns. Two initial codes (TEMPLOPASSBCN for BCN branch inauguration, AURACLUB1 for Aura Club first event) auto-assign an online-only free subscription on registration. Includes admin promo management UI, registration page changes, member app adjustments for online promo users, and QR image generation.

</domain>

<decisions>
## Implementation Decisions

### QR & URL Strategy

- **D-01:** Each promo gets a unique URL: `eltemplo.org/qr/bcn`, `eltemplo.org/qr/aura-club`. These redirect to `app.eltemplo.org/register?promo=TEMPLOPASSBCN` (or `AURACLUB1`).
- **D-02:** Two initial promo codes: `TEMPLOPASSBCN` (BCN branch inauguration) and `AURACLUB1` (Aura Club event series launch).
- **D-03:** QR images generated as raw PNG files named after the promo codes (e.g., `TEMPLOPASSBCN.png`, `AURACLUB1.png`). No design — designer will incorporate into flyers.

### Promo Plan & Subscription

- **D-04:** Promo plans are a new concept: online-only (`isOnline=true`), free (`pricePaid=0, priceTypeApplied="zero"`), with validity windows (start date + expiry date). They differ from regular plans.
- **D-05:** Two types of promo plans: **QR auto-assigned** (promo code in URL triggers auto-assignment on registration) and **admin-assignable** (admin manually assigns from the admin panel).
- **D-06:** Promo plan duration: 30 days from registration date.
- **D-07:** Migration seeds two initial promo plans with their codes, start/expiry dates.
- **D-08:** Validity window for initial promos: Sunday 2026-03-29 00:01 to Monday 2026-03-30 12:00 (UTC-3 / America/Argentina/Buenos_Aires).

### Redemption Flow

- **D-09:** Auto-assign on registration: user registers via promo URL → free month subscription created automatically. No extra step.
- **D-10:** New users only. One redemption per user. Unlimited total redemptions per code.
- **D-11:** Promo code is NOT typed in by the user — it's embedded in the URL and auto-applied. Registration page shows a promo badge with the code name.
- **D-12:** If a user who already has an account scans the QR → show "Ya tenés cuenta" message with login link.

### Registration Page Changes

- **D-13:** Change registration page title from "Registrarse" to "Bienvenido al Templo" for ALL users (not just promo).
- **D-14:** When promo code is present in URL, show a promo badge on registration form (e.g., "TEMPLOPASSBCN — 1 Mes Gratis").

### Member App — Online Promo Users

- **D-15:** Reservas tab: currently hidden for online users → make it visible. Show "Activá tu plan" empty state (same pattern as Entrenar without subscription). This applies to all online users, not just promo.
- **D-16:** "Hoy es tu día de descanso" card in Mi Templo: hide for online users without a subscription (no promo code).
- **D-17:** Entrenar: already works correctly — shows "Activá tu plan" without subscription, shows regular algorithm-generated sessions with promo subscription.
- **D-18:** Upsell badge: always visible in Mi Templo for promo users, encouraging them to visit physical branches and start a subscription. Copy at Claude's discretion, brand-aligned Spanish.

### Admin Panel — Promos Section

- **D-19:** New "Promos" section in the Planes page (separate from regular plans and micro-programs).
- **D-20:** Promo plan form fields: name, promo code, plan duration (days), start date, expiry date, type (QR auto-assign / admin-assignable), redemption count (read-only).
- **D-21:** Admins can create, view, and disable promo plans. See redemption count per code.

### Post-Promo Expiry

- **D-22:** No push notifications (app not on stores yet). Email campaigns handled separately by another project.
- **D-23:** Upsell badge in Mi Templo serves as the in-app conversion mechanism during and after promo period.

### Claude's Discretion

- Upsell badge copy and visual styling (D-18)
- Promo badge design on registration page (D-14)
- "Ya tenés cuenta" page layout and messaging (D-12)
- Database table structure for promo plans/codes (new table vs extending subscription_plans)
- QR redirect implementation (Nuxt route rule vs server route)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Templo Online Infrastructure

- `el-templo-api/src/db/schema/branches.ts` — isVirtual column, ONLINE branch
- `el-templo-api/src/db/schema/subscription-plans.ts` — isOnline column
- `el-templo-api/src/modules/auth/routes.ts` — Registration defaults to ONLINE branch (line 67-96)
- `el-templo-api/src/modules/subscriptions/service.ts` — assignPlan logic, boarding pass pattern (priceZero), branch migration

### Member App Tab Gating

- `el-templo-app/src/layouts/MainLayout.vue` — branchIsVirtual tab visibility
- `el-templo-app/src/modules/plan/pages/PlanesPage.vue` — Online/presencial plan split

### Admin Plan Management

- `el-templo-admin/src/components/PlanFormDialog.vue` — isOnline toggle
- `el-templo-admin/src/pages/PlanesPage.vue` — Plans + micro-programs sections

### Registration

- `el-templo-app/src/pages/RegisterPage.vue` — Current registration form
- `el-templo-api/src/modules/auth/routes.ts` — POST /auth/register endpoint

### QR Redirect

- `el-templo-web/nuxt.config.ts` — routeRules for redirects (see /curso-entrenadores pattern)

### Prior Phase Context

- `.planning/phases/45-architecture-foundation/45-CONTEXT.md` — Virtual branch architecture decisions

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Boarding pass pattern** in SubscriptionService: one-time free subscription logic (`priceZero`, `priceTypeApplied="zero"`) — model for promo auto-assignment
- **Nuxt routeRules**: existing redirect pattern (`/curso-entrenadores` → `/academy`) for QR URL redirects
- **PlanesPage tabs**: already has sections for plans and micro-programs — third section for promos follows the pattern
- **"Activá tu plan" empty state**: already exists in Entrenar — reuse for Reservas tab
- **Push notification infrastructure** (Phase 84): available for future promo notifications

### Established Patterns

- Subscription assignment via `SubscriptionService.assignPlan()` with flexible pricing inputs
- Online user detection via `userStore.profile.branchIsVirtual`
- Plan creation/editing via `PlanFormDialog` component with Quasar form
- Migration-based schema changes with drizzle-kit

### Integration Points

- Registration endpoint (`POST /auth/register`) — extend to accept promo code, auto-assign subscription
- Nuxt config routeRules — add QR redirect rules
- MainLayout.vue — adjust tab visibility for online users
- PlanesPage.vue — add Promos section/tab
- Mi Templo page — add upsell badge component, hide rest day card for online no-subscription

</code_context>

<specifics>
## Specific Ideas

- BCN branch inaugurates this Sunday — TEMPLOPASSBCN code for attendees
- Aura Club is a new event series, first event this Sunday broadcasting BCN aperture — AURACLUB1 code
- No app stores yet — all mobile access is via web (app.eltemplo.org)
- Email campaigns for conversion handled by separate project, not this phase
- Regular algorithm-generated sessions work for promo users (same as physical branch members)

</specifics>

<deferred>
## Deferred Ideas

- Deep linking in mobile app (Capacitor URL schemes) — needed when app is on stores
- Push notification campaigns for promo expiry reminders — when app is on Play Store / App Store
- Payment gateway integration for online plan monetization (v6.0+)
- Promo analytics dashboard (conversion rate, retention after promo)

</deferred>

---

_Phase: 86-qr-promo-free-month-campaign_
_Context gathered: 2026-03-27_
