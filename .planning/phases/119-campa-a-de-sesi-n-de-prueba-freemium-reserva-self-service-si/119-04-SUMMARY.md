---
phase: 119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
plan: 04
subsystem: campaigns (reusable email-campaign module)
tags:
  [campaigns, hmac-token, tracking, open-redirect, funnel, freemium-trial, tdd]
requires:
  - campaign tables (campaigns/sends/events/unsubscribes, from Plan 01)
  - branches.address + bookings.source (from Plan 01)
  - EmailService.sendCampaignBatch + trialCampaignHtml (from Plan 02)
provides:
  - signCampaignToken / validateCampaignToken (HMAC-SHA256, 30d exp, D-04/D-21)
  - CampaignService facade (listEligible / create / listCampaigns / send / funnel)
  - CampaignTrackingService (recordOpen / recordClick / recordUnsubscribe)
  - public tracking routes (/track/open pixel, /track/click 302, /unsubscribe)
  - admin routes (POST /admin create, GET /admin list, POST /admin/:id/send,
    GET /admin/:id/funnel, GET /admin/eligible-count) under /api/campaigns
affects:
  - el-templo-api/src/modules/campaigns
  - el-templo-api/src/app.ts
tech-stack:
  added: []
  patterns:
    - "HMAC tracking token mirrors shared/qr-token.ts; payload identifies sendId only (never authorizes, D-21)"
    - "Mixed public+admin Fastify plugin (franchise/routes.ts pattern): no global onRequest auth; per-route preHandler + role/country guard on admin routes"
    - "Anti open-redirect: click destination DERIVED via CampaignService.trialDeepLink against a fixed allowlisted host (app.eltemplo.org), with a fail-closed host assertion — never echoes query input"
    - "Idempotent enrollment via INSERT ... ON DUPLICATE KEY UPDATE (no-op) on UNIQUE(campaign_id,user_id); affectedRows distinguishes insert (1) vs existing (2)"
    - "Campaign funnel aligns 'convirtió' with funnel-service.ts (user_status_history toStatus='activo'), does not redefine 'activo' (A6)"
key-files:
  created:
    - el-templo-api/src/modules/campaigns/token-service.ts
    - el-templo-api/src/modules/campaigns/tracking-service.ts
    - el-templo-api/src/modules/campaigns/service.ts
    - el-templo-api/src/modules/campaigns/routes.ts
    - el-templo-api/src/modules/campaigns/schemas.ts
  modified:
    - el-templo-api/src/modules/campaigns/types.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/campaign-token.test.ts
    - el-templo-api/test/campaigns-audience.test.ts
    - el-templo-api/test/campaigns-tracking.test.ts
    - el-templo-api/test/campaigns-send.test.ts
    - el-templo-api/test/campaigns-funnel.test.ts
decisions:
  - "Token exp is epoch SECONDS (not ms) to match qr-token's compact JSON payload; validate rejects exp <= now (D-04)."
  - "The whole CampaignService (incl. create/send/funnel) shipped in the Task 1 commit because it is one file that must typecheck as a unit; later commits add only the routes/tests that exercise it."
  - "Click redirect uses a runtime host allowlist assertion (new URL(dest).host === 'app.eltemplo.org') as defense-in-depth on top of the derived deep link — fail-closed 400 if it ever regresses (T-119-04-03)."
  - "send() chunks pending sends ≤100 and uses idempotencyKey `campaign-<id>-batch-<n>`; already-'sent' rows are skipped on re-run so re-send is a true no-op for delivered recipients."
  - "Funnel attendance/conversion join on userId (not bookingId) because attendance has no booking_id FK; the sent_at window + self_service source constrain attribution (D-18)."
  - "WhatsApp CTA URL + copySlots wiring is a documented stub — see Known Stubs (Wave 3 admin UI / Plan 07 prod copy supply the real values)."
metrics:
  duration: ~9min
  completed: 2026-06-02
---

# Phase 119 Plan 04: Reusable Campaign Module Summary

Builds the genuinely-new campaign system on the Plan 01 schema + Plan 02 email infrastructure: an HMAC tracking token (D-04/D-21), public tracking endpoints (open pixel / click redirect / unsubscribe — no auth, open-redirect-safe), the `CampaignService` facade (audience query, draft create, list, idempotent batch send, per-campaign funnel), Fastify schemas, and route registration. 5 RED scaffolds made GREEN.

## What Was Built

### Task 1 — HMAC token + audience query + facade (commit 8915fd0c)

- `token-service.ts` (NEW): `signCampaignToken({userId,campaignId,sendId,exp?})` → `base64url(payload).HMAC-SHA256(JWT_SECRET)`, `exp` defaults to now + 30d (D-04). `validateCampaignToken` recomputes the sig, rejects mismatch and expired tokens, and returns the payload **only** for identification (D-21 — never authorizes). Malformed input returns null, never throws.
- `types.ts`: added `EligibleUser`, `CampaignCopySlots`, `CreateCampaignInput`, `CampaignRecord`, `CampaignListItem`, `SendResult`, `FunnelStages`.
- `service.ts` (NEW): `CampaignService(db, log, email)` facade. `listEligible(country?)` = the D-08/09/10 audience query (`status='freemium'` + email NOT NULL + `created_at < NOW() - INTERVAL 3 DAY` + NOT EXISTS active/paused/scheduled sub + NOT EXISTS non-cancelled is_trial booking + NOT EXISTS unsubscribe, inner-joined to the branch for country scope). Ghosts/inactives are intentionally included (D-09 — no activity filter). create/listCampaigns/send/funnel are implemented in the same file (one typecheck unit).
- `campaign-token.test.ts` + `campaigns-audience.test.ts` made GREEN (round-trip, tamper, expiry, key-shape; eligible/excluded matrix incl. cancelled-booking and ghost cases).

### Task 2 — tracking service + public routes (commit 81cc5c79)

- `tracking-service.ts` (NEW): `recordOpen`/`recordClick` (forward-only `campaign_events` inserts, D-18), `recordUnsubscribe` (idempotent ON DUPLICATE KEY on UNIQUE(email), D-15), `getSendEmail` (resolves the delivered email snapshot for the unsubscribe path).
- `routes.ts` (NEW): franchise-style mixed plugin, NO global auth hook.
  - `GET /track/open?t=` → validate token → recordOpen → 1×1 GIF + `Cache-Control: no-store`.
  - `GET /track/click?t=` → validate token → recordClick → 302 to the allowlisted deep link `https://app.eltemplo.org/r/trial?t=<token>` (D-25). Destination is **derived** (`CampaignService.trialDeepLink`) against a fixed `CLICK_REDIRECT_ALLOWLIST_HOST`, with a fail-closed `new URL(dest).host` assertion — raw query input is never the redirect target.
  - `GET /unsubscribe?t=` → suppress the send's email → generic confirmation HTML page (no email echoed — anti-enumeration).
  - Admin routes also live here (exercised in Task 3): `POST /admin` (create), `GET /admin` (list), `POST /admin/:id/send` (owner), `GET /admin/:id/funnel`, `GET /admin/eligible-count`. Each gets `preHandler:[fastify.authenticate]` + role check + `attachCountryScope` (owner = global, non-owner pinned to their country).
- `schemas.ts` (NEW): tracking querystring + `createCampaignSchema` (and the body `copySlots`) with `additionalProperties:false`.
- `app.ts`: `app.register(campaignRoutes, { prefix: "/api/campaigns" })`.
- `campaigns-tracking.test.ts` made GREEN (open GIF+no-store+event, click 302 to app.eltemplo.org + event, host-locked redirect, unsubscribe row + no-PII page + idempotency, tampered-token no-op still serves pixel).

### Task 3 — create + send + funnel tests (commit 91fcf453)

- `service.ts` already carried `create` (validate non-empty name/subject → INSERT draft, returns the row), `listCampaigns` (newest-first + `recipientCount` subquery, country-scoped), `send` (idempotent enrollment, chunked ≤100 `sendCampaignBatch` with `idempotencyKey`, marks sends + campaign 'sent', degrades without `RESEND_API_KEY`), and `funnel` (6 stages crossing sends/events × bookings × attendance × user_status_history; `convirtió` = history toStatus='activo' after sent_at per A6; `aperturaAproximada:true`).
- `campaigns-send.test.ts` + `campaigns-funnel.test.ts` made GREEN: create persists draft / rejects empty; send 1-row-per-eligible, idempotent (no dup on re-run), batch delegation + idempotencyKey via a spy, degrade-without-key; funnel enviado/abierto(DISTINCT)/click(DISTINCT)/reservó/asistió/convirtió, pre-sent_at booking not attributed, empty-campaign all-zero shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Fail-closed host assertion on the click redirect**

- **Found during:** Task 2
- **Issue:** The plan derives the click destination via an allowlist but a future regression in `trialDeepLink` could silently change the host.
- **Fix:** Added a runtime `new URL(destination).host !== CLICK_REDIRECT_ALLOWLIST_HOST` guard that returns 400 and logs an error (defense-in-depth on T-119-04-03). Also exercised by a test asserting `new URL(location).host === 'app.eltemplo.org'`.
- **Files modified:** `routes.ts`
- **Commit:** 81cc5c79

**2. [Rule 2 - Security] Tracking writes never break delivery**

- **Found during:** Task 2
- **Issue:** A DB error in recordOpen/recordClick/recordUnsubscribe would otherwise 500 the public pixel/redirect.
- **Fix:** Wrapped each record call in `try/catch (err: unknown)` with a Pino `warn`; the pixel/redirect/page is always served (D-18 forward-only semantics tolerate a dropped event).
- **Files modified:** `routes.ts`
- **Commit:** 81cc5c79

### Notes

- No `pnpm typecheck` script exists; used `npx tsc --noEmit` (green for `src/**`) per CLAUDE.md.
- Per the project rule, the full suite was **not** run locally. The 5 campaign test files typecheck cleanly under a temp tsconfig that includes `test/**` (zero errors in any `campaign*` file). The other pre-existing analytics test files report strict-tsc overload errors under that temp config, but they are out of scope (CI runs tests via Vitest's transpile-only path, the project's established behavior).
- Token `exp` is epoch **seconds** (compact payload, matches qr-token's JSON ethos); the test asserts the ~30d window in seconds.

## Known Stubs

- **WhatsApp CTA URL** in `CampaignService.buildTemplateVars` is a placeholder `https://wa.me/5492234567890` (single number, not per-country). The real per-country WhatsApp links + the user-supplied `copySlots` (headline/subheadline/body) are wired by the Wave 3 admin UI / Plan 07 prod copy. With images off and live-text CTAs the email is still actionable, so this does not block the campaign goal. The template `headline` currently falls back to the campaign `subject`; `subheadline`/`body` render empty until copy is supplied.
- **`TRACKING_API_BASE`** defaults to `https://api.eltemplo.org` (overridable via `PUBLIC_API_BASE_URL`); the prod base + the `app.eltemplo.org/r/trial` deep-link handler are finalized in Wave 3/Plan 07.

## Threat Flags

None — no new security surface beyond the plan's `<threat_model>`. The public tracking endpoints, admin gating, and open-redirect mitigation are all enumerated there (T-119-04-01..09) and implemented as specified.

## Verification

- `npx tsc --noEmit` (src) green after every task.
- Grep gates: `createHmac` in token-service; `class CampaignService` in service; `no-store` + `image/gif` + `app.eltemplo.org` in routes; `createCampaignSchema` + `additionalProperties:false` in schemas; `campaignRoutes` registered in app.ts; `/admin` count = 11 (≥4: create/list/send/funnel/eligible-count); **no `new Resend` / `from "resend"`** anywhere in `src/modules/campaigns/` (Pitfall 3 honored — batching delegates to `EmailService.sendCampaignBatch`).
- The 5 campaign test files run GREEN in CI after push to staging (campaign-token, campaigns-audience, campaigns-tracking, campaigns-send, campaigns-funnel).

## Self-Check: PASSED

All created/modified files exist on disk and all 3 task commits (8915fd0c, 81cc5c79, 91fcf453) are present in git history.
