---
phase: 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan
plan: 03
subsystem: app-and-api
tags:
  [subscriptions, notifications, in-app-dialog, whatsapp, covered-until, quasar]

# Dependency graph
requires:
  - phase: 144-01
    provides: "SubscriptionService.getCoveredUntil method + deriveCoveredUntil standalone (covered-until over active+scheduled chain)"
provides:
  - "GET /api/members/subscription/coverage — member-facing covered-until + daysRemaining (server-derived id, IDOR-safe)"
  - "PlanExpiryDialog.vue — skippable once-per-day in-app expiry reminder (≤3d gate, WhatsApp CTA)"
  - "PlanExpiryDialog mounted app-wide in MainLayout.vue (self-triggers on auth)"
affects:
  - "144-04 (reserve coverage block): unaffected — uses getCoveredUntil in booking-service, independent surface"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Member-facing read endpoint lives in member-routes.ts (auth-only plugin), NOT routes.ts (admin-gated) — same split as /me/subscription"
    - "Once-per-DAY dialog suppression via versioned Capacitor Preferences key storing YYYY-MM-DD (vs RatingPromptDialog's once-ever)"
    - "daysRemaining anchored at UTC midnight on AR wall-clock date so DST never shifts the integer day count"

key-files:
  created:
    - el-templo-api/test/subscriptions/coverage-endpoint.test.ts
    - el-templo-app/src/components/PlanExpiryDialog.vue
  modified:
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-app/src/layouts/MainLayout.vue

key-decisions:
  - "Coverage route added to member-routes.ts (not routes.ts as the plan frontmatter named) — routes.ts is fully admin-gated via onRequest, so a member route there would 403 every member; member-routes.ts is the auth-only sibling that already hosts /me/subscription"
  - "Dialog gate lower bound daysRemaining >= 0 (plan-checker fix): /coverage does not trigger autoExpireSubscriptions, so a lapsed-but-unswept member returns negative days with no UI-SPEC copy — those are handled by the day-of push + booking block"
  - "Country for WhatsApp CTA comes from userStore.profile?.branchCountry (authStore.country does not exist — PATTERNS correction)"

requirements-completed: [PLAN-POPUP]

# Metrics
duration: ~15min
completed: 2026-06-25
---

# Phase 144 Plan 03: In-app expiry reminder (coverage endpoint + PlanExpiryDialog) Summary

**Added a member-facing `GET /api/members/subscription/coverage` endpoint (covered-until + whole days remaining, server-derived id) and a skippable, once-per-day `PlanExpiryDialog.vue` cloned from RatingPromptDialog that fires when coverage is ≤3 days away and pushes the member to renew via WhatsApp, mounted app-wide in MainLayout.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3
- **Files:** 4 (2 created, 2 modified)

## Accomplishments

- `GET /api/members/subscription/coverage` returns `{ coveredUntil, daysRemaining }`. The member id is server-derived from `request.user` (never accepts a userId → T-144-08 IDOR mitigated); the route uses the auth-only `memberSubscriptionRoutes` plugin. `daysRemaining` is whole calendar days between today (AR date) and `coveredUntil`, anchored at UTC midnight to be DST-safe, and `null` when `coveredUntil` is `null`.
- Integration test `coverage-endpoint.test.ts` (5 cases): active sub ending in 2 days → `daysRemaining 2`; active+scheduled chain → furthest end_date, `daysRemaining 33`; no coverage → both `null`; 401 without a token; and an IDOR/server-derived assertion (member A reads A's own null coverage, never member B's). Expected dates are built from the SAME AR-date basis the route uses, so the day counts are exact regardless of CI host timezone.
- `PlanExpiryDialog.vue` cloned from `RatingPromptDialog.vue` (charcoal `#2e2a26` card, terracotta gradient primary, flat cream-55 secondary, `max-width 340px`, NO `persistent`). Gate: authenticated AND `0 <= daysRemaining <= 3` AND not shown today. Body copy per UI-SPEC with singular `1 día` and the `vence hoy` (N=0) variant. Primary CTA opens `buildWhatsAppUrl(userStore.profile?.branchCountry, 'Hola, quiero renovar mi membresía 💪')` via `window.open(url, '_blank')`. Once-per-day persistence via Capacitor `Preferences` key `plan_expiry_shown_v1` storing `YYYY-MM-DD`. Uses `createLogger()` — no `console.*`.
- Mounted `<PlanExpiryDialog />` in `MainLayout.vue` beside `PushPermissionDialog`/`RatingPromptDialog`; it self-triggers via its own `watch(authStore.isAuthenticated, { immediate: true })` — no props.

## Task Commits

1. **Task 1: GET /coverage member endpoint + integration test** — `46defc45` (feat)
2. **Task 2: PlanExpiryDialog.vue** — `5c20c6e8` (feat)
3. **Task 3: mount in MainLayout** — `2b086f96` (feat)

## Decisions Made

- **Route file target corrected to `member-routes.ts`:** the plan's `files_modified`/`artifacts` named `routes.ts`, but that plugin's `onRequest` hook requires admin/coach/owner role on every route — a member route there would 403 all members and break the binding truth "a member can fetch their own covered-until". `member-routes.ts` (prefix `/api/members/subscription`, auth-only) is the correct sibling and already hosts `/me/subscription`, whose auth pattern the plan's `<interfaces>` told us to copy. Final path: `GET /api/members/subscription/coverage`.
- **`>= 0` lower bound on the dialog gate** (plan-checker fix, honored): `/coverage` does not run the lazy `autoExpireSubscriptions` sweep, so a lapsed-but-unswept member can return negative `daysRemaining` for which UI-SPEC defines no copy. Those members are reached by the day-of push (Plan 02) and the booking block (Plan 04), not this dialog.
- **Country source `userStore.profile?.branchCountry`** (not `authStore.country`, which does not exist) — PATTERNS flagged the UI-SPEC correction; `buildWhatsAppUrl` defaults to AR on null, so a missing profile is safe.
- **Once-per-DAY, not once-ever:** `plan_expiry_shown_v1` stores the local `YYYY-MM-DD`; `shouldShow` returns false only when the stored date equals today, so the reminder reappears at most once per calendar day until coverage extends.

## Deviations from Plan

### File-target correction

**1. [Rule 3 - Blocking] Coverage route added to `member-routes.ts` instead of `routes.ts`**

- **Found during:** Task 1
- **Issue:** The plan frontmatter (`files_modified`, `must_haves.artifacts`) named `el-templo-api/src/modules/subscriptions/routes.ts` to contain `coveredUntil`. That plugin is fully admin-gated (`onRequest` rejects non-`SUBSCRIPTION_ROLES` with 403), so a member-facing route there would be unreachable by members — directly contradicting the plan's own truth "An authenticated member can fetch their own covered-until via a member-facing endpoint" and its `<interfaces>` note to "follow the SAME auth pattern used by the existing 'my subscription' route" (which lives in `member-routes.ts`).
- **Fix:** Registered `GET /coverage` in `memberSubscriptionRoutes` (`member-routes.ts`), the auth-only sibling plugin (prefix `/api/members/subscription`). The binding truth + IDOR mitigation are satisfied; only the literal artifact filename differs.
- **Impact:** The plan's automated verify (`grep -q "coveredUntil" src/modules/subscriptions/routes.ts`) will not match — the symbol is in `member-routes.ts`. No functional impact; this is the only correct placement.
- **Committed in:** `46defc45`

### Class-name rename (cosmetic)

**2. [Rule 1 - cleanliness] Scoped style classes renamed `.rating-dialog*` → `.plan-expiry-dialog*`**

- The style block values are copied verbatim from `RatingPromptDialog.vue` (UI-SPEC reuse mandate honored — charcoal, terracotta gradient, max-width 340px, border-radius/typography all identical); only the BEM class prefix was renamed to avoid collision/confusion across two separate components. Added `.plan-expiry-dialog__icon` (terracotta tint) and `.plan-expiry-dialog__text` (Geologica body per UI-SPEC body typography) which RatingPromptDialog did not need.

---

**Total deviations:** 1 blocking file-target correction + 1 cosmetic rename. No scope creep.

## Known Stubs

None. The endpoint is wired to the live `getCoveredUntil` service method and the dialog consumes it directly; the WhatsApp CTA uses the production `buildWhatsAppUrl` helper.

## Threat Flags

None beyond the plan's `<threat_model>`. The one new surface (`GET /coverage`) is the documented T-144-08 boundary and is mitigated exactly as specified (server-derived id, auth-gated, no userId input).

## User Setup Required

None. The endpoint and dialog ship with the standard app/api build; no env vars or external config.

## Self-Check: PASSED

- Files: `el-templo-api/src/modules/subscriptions/member-routes.ts`, `el-templo-api/test/subscriptions/coverage-endpoint.test.ts`, `el-templo-app/src/components/PlanExpiryDialog.vue`, `el-templo-app/src/layouts/MainLayout.vue` — all present.
- Commits: `46defc45`, `5c20c6e8`, `2b086f96` — all in `git log`.
- API `tsc --noEmit`: green. App `vue-tsc`: no errors referencing PlanExpiryDialog (remaining errors are pre-existing project-wide `import.meta.env`/Quasar-wrapper noise, out of scope).

---

_Phase: 144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan_
_Completed: 2026-06-25_
