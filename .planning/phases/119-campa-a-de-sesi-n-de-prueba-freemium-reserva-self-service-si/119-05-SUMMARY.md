---
phase: 119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
plan: 05
subsystem: member-app (self-service trial reservation + deep linking)
tags:
  [
    scheduling,
    trials,
    freemium,
    reservas,
    deep-links,
    app-links,
    universal-links,
    checkpoint-pending,
  ]
status: checkpoint-pending
requires:
  - 119-03 (GET /trial-eligibility + POST /reserve-trial backend endpoints)
provides:
  - useSchedulingApi.getTrialEligibility / reserveTrial (app composable)
  - ReservasPage 3-state UI (muro / modo reservar prueba / prueba reservada)
  - boot/deep-links.ts appUrlOpen listener (app.eltemplo.org/r/trial -> /reservas?trial=1)
  - Android App Links (autoVerify intent-filter) + iOS Universal Links (associated-domains)
  - public/.well-known/assetlinks.json + apple-app-site-association (served at app.eltemplo.org)
affects:
  - el-templo-app/src/pages/ReservasPage.vue
  - el-templo-app/src/composables/useSchedulingApi.ts
  - el-templo-app/src/boot/deep-links.ts
  - el-templo-app/quasar.config.js
  - el-templo-app/src-capacitor (android + ios native config)
tech-stack:
  added: []
  patterns:
    - "Eligibility gates the 3 ReservasPage states server-side (D-20/D-22); the campaign email token never authorizes (D-21)"
    - "Branch-first selector ALWAYS shown in trial mode (freemium lives in virtual Templo Online -> must pick a physical sede before any slot is visible, D-06)"
    - "30-day forward bound on the trial grid via canGoForward computed disabling chevron_right (D-05)"
    - "No-cancel: trial mode renders no per-slot/next-class cancel control and uses a dedicated reserve dialog with explicit 'no se puede cancelar ni cambiar' copy (D-03)"
    - "Deep link reuses the existing useNotificationStore.pendingRoute intended-route pattern (consumed post-login in MiTemplo) for the logged-out case"
    - "App Links/Universal Links bound to app.eltemplo.org (the el-templo-app WEB build), NOT eltemplo.org (the landing), so .well-known files ship in el-templo-app/public (D-25)"
key-files:
  created:
    - el-templo-app/src/boot/deep-links.ts
    - el-templo-app/public/.well-known/assetlinks.json
    - el-templo-app/public/.well-known/apple-app-site-association
  modified:
    - el-templo-app/src/composables/useSchedulingApi.ts
    - el-templo-app/src/pages/ReservasPage.vue
    - el-templo-app/quasar.config.js
    - el-templo-app/src-capacitor/android/app/src/main/AndroidManifest.xml
    - el-templo-app/src-capacitor/ios/App/App/App.entitlements
decisions:
  - "Eligibility is fetched FIRST on mount (loadTrialEligibility before the presencial/multi-branch branching) so the 3 states resolve before any grid load; trialEligible/trialBooking computeds key off the backend { eligible, alreadyBooked, booking } shape verbatim (no client-side authorization)."
  - "Trial mode uses a SEPARATE reserve dialog (trialDialog) and slot-tap handler (onTrialSlotTap) rather than reusing the presencial reserveDialog/onSlotTap, so the no-cancel + 'única sesión de prueba' copy and the reserveTrial(scheduleId,date,branchId) call stay isolated from the regular booking flow (which has change-horario/lista-espera branches that do not apply to trials)."
  - "State 3 (alreadyBooked) renders a standalone confirmation card (reuses next-class-card visual family with a $positive left border) inside the reservas__empty wrapper, with NO reserve/cancel controls and only an optional WhatsApp 'cambiar' link — it does not load the weekly grid at all."
  - "The 30-day forward bound (canGoForward) is computed from today+30d vs the Monday of the NEXT week; the chevron_right is disabled (not hidden) when navigating further would exceed the window. changeWeek itself is reused unchanged."
  - "The blocked-muro v-if was tightened from !hasPresencialPlan to (!hasPresencialPlan && !trialEligible) so a trial-eligible freemium (who has no presencial plan) is routed to trial mode instead of the muro."
  - "assetlinks.json SHA-256 fingerprints are TODO placeholders: App Links verification uses the Play App Signing certificate (Google re-signs uploaded AABs), which is only obtainable from the Play Console — NOT the password-protected upload keystore in the repo. Both prod (com.eltemplo.app) and staging (com.eltemplo.app.staging) entries are present with distinct clearly-marked TODOs."
  - "apple-app-site-association uses appID 6D9R97DGAK.com.eltemplo.app (TeamID read from the Xcode pbxproj DEVELOPMENT_TEAM, bundle id from PRODUCT_BUNDLE_IDENTIFIER) with paths /r/trial and /r/trial*."
metrics:
  duration: ~18min
  completed: 2026-06-02
---

# Phase 119 Plan 05: Member-App Trial Reservation + Deep Linking Summary

The member-facing reservation flow the campaign email drives: `ReservasPage.vue` now branches into three eligibility-gated states (existing muro / "modo reservar prueba" / "prueba reservada" confirmation), `useSchedulingApi` wires `getTrialEligibility` + `reserveTrial`, and deep linking is configured greenfield — an `appUrlOpen` boot listener routing `app.eltemplo.org/r/trial?t=…` to `/reservas?trial=1`, plus Android App Links + iOS Universal Links + the two `.well-known` association files shipped in the el-templo-app web build. The email token never authorizes (D-21); eligibility is purely server-side.

## What Was Built

### Task 1 — Composable + 3-state ReservasPage (commit f3abcbb9)

- **useSchedulingApi.ts**: added `getTrialEligibility()` (`GET /members/scheduling/trial-eligibility`), `reserveTrial(scheduleId, date, branchId)` (`POST /members/scheduling/reserve-trial`), and the exported `TrialEligibility` type mirroring the backend `{ eligible, alreadyBooked, booking? }` shape. The `getSignal()`/`cleanup()` AbortController convention is preserved; both are returned from the composable.
- **ReservasPage.vue** — 3-state branching keyed on `trialEligibility` (D-22):
  - **State 1 (muro)** UNCHANGED, except the `v-if` was tightened to `!hasPresencialPlan && !trialEligible` so an eligible freemium is not trapped in the muro.
  - **State 2 (modo reservar prueba)** — `trialEligible` (`eligible && !alreadyBooked`): a Sandy Beige trial banner ("Tu sesión de prueba gratis" + body copy) with a `$primary` left border; the branch selector ALWAYS shown (D-06) with the "Elegí una sede para ver los horarios" placeholder; the grid hidden until a sede is chosen; the 30-day day-strip/slot-card grid reused with `chevron_right` disabled past +30d (`canGoForward`); a dedicated trial reserve dialog with the exact "Es tu única sesión de prueba, no se puede cancelar ni cambiar" copy → on confirm calls `reserveTrial`; the trial-mode policy line; and NO cancel affordance anywhere (D-03).
  - **State 3 (prueba reservada)** — `trialBooking` (`alreadyBooked`): a centered confirmation card ("Tu sesión de prueba está reservada" + "Te esperamos el {día} {fecha} en {sede} ({dirección}). ¡Llegá unos minutos antes!"), `check_circle` in `$positive`, no reserve/cancel controls, optional WhatsApp "¿Necesitás cambiarla? Escribinos" link.
- All copy is verbatim from the UI-SPEC Copywriting Contract. Warm palette only (Sandy Beige `#E5D9C8`, Olive Stone `#8A8472`, `$primary` terracotta, `$positive` check); NO blue.

### Task 2 — Deep links boot + native config + .well-known (commit cc0a015a)

- **boot/deep-links.ts** (new): `boot(async ({ router }))` mirroring push-notifications.ts — `if (!Capacitor.isNativePlatform()) return`, `App.addListener('appUrlOpen', …)` parsing the URL path (`/r/trial`) and pushing `/reservas?trial=1`. The token is ignored for authorization (D-21). Logged-out (via `useAuthStore.isAuthenticated`) stashes the intended route in `useNotificationStore.pendingRoute` (the existing intended-route pattern, consumed post-login in MiTemplo) and pushes `/login`. `createLogger()`, no `console.log`, no `any`.
- **quasar.config.js**: `'deep-links'` appended to the boot array.
- **AndroidManifest.xml**: a SECOND `<intent-filter android:autoVerify="true">` inside the existing MainActivity — VIEW + DEFAULT + BROWSABLE + `<data scheme="https" host="app.eltemplo.org" pathPrefix="/r/trial"/>`.
- **App.entitlements**: `com.apple.developer.associated-domains` = `[applinks:app.eltemplo.org]`.
- **public/.well-known/assetlinks.json**: prod `com.eltemplo.app` + staging `com.eltemplo.app.staging` entries (distinct SHA-256 TODOs — see Known Stubs).
- **public/.well-known/apple-app-site-association**: `appID 6D9R97DGAK.com.eltemplo.app`, paths `["/r/trial", "/r/trial*"]`. Both are valid JSON (the node parse gate printed "valid json").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tightened the muro `v-if` so a trial-eligible freemium is not trapped in the muro**

- **Found during:** Task 1.
- **Issue:** A trial-eligible freemium has no presencial plan, so the existing `v-else-if="!hasPresencialPlan"` would have caught them BEFORE the new trial-mode branch, rendering the "Activá tu plan" muro instead of the trial flow.
- **Fix:** Changed the muro condition to `!hasPresencialPlan && !trialEligible`, and ordered the trial-mode `v-else-if="trialEligible"` and state-3 `v-else-if="trialBooking"` correctly in the chain.
- **Files modified:** el-templo-app/src/pages/ReservasPage.vue
- **Commit:** f3abcbb9

No architectural changes (Rule 4) were needed. No auth gates. No package installs (`@capacitor/app` already in deps, T-119-05-SC accept).

## Manual-Review Notes (acceptance criteria)

- **NO cancel affordance in trial mode or state 3 (D-03):** verified by review — the trial-mode slot cards omit the `slot-card__badge--positive` + cancel `q-btn` branch entirely (a freemium has no prior booking to show as "Reservado"); the state-3 confirmation card has only a WhatsApp link, no reserve/cancel `q-btn`. The dedicated `trialDialog` has no cancel-first/lista-espera branches.
- **Copy verbatim:** banner heading/body, branch placeholder, reserve dialog title/body/confirm, trial policy line, state-3 heading/body, and the two error states all match the UI-SPEC Copywriting Contract.

## Deployer Note (T-119-05-05 — SPA fallback exclusion)

el-templo-app is a Quasar SPA. The web hosting / history-mode rewrite for `app.eltemplo.org` MUST exclude `/.well-known/*` from the `index.html` catch-all so that `assetlinks.json` and `apple-app-site-association` resolve as static files with `Content-Type: application/json` and NO redirect. Quasar copies `public/` verbatim to the build root; confirm the web server (nginx/rsync target) serves `/.well-known/*` directly and does not route it through the SPA fallback. No CDN.

## Known Stubs

| Stub                                      | File                                             | Reason                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sha256_cert_fingerprints` TODO (prod)    | el-templo-app/public/.well-known/assetlinks.json | App Links verification requires the **Play App Signing** certificate SHA-256 (Google re-signs uploaded AABs), obtainable only from the Play Console > App integrity > App signing key certificate. The repo's upload keystore is password-protected (CI env var) and is NOT the authoritative cert. Must be filled before Android App Links verify in production. |
| `sha256_cert_fingerprints` TODO (staging) | el-templo-app/public/.well-known/assetlinks.json | Distinct staging fingerprint for `com.eltemplo.app.staging`; fill from the staging signing key.                                                                                                                                                                                                                                                                   |

These stubs do not block the checkpoint's app-render verification (states 1-3 + reserve flow render without them). They DO gate Android App Links auto-verification in production — the WhatsApp CTA remains the robust fallback, and the deep link still opens the web app regardless.

## Threat Surface

No new security surface beyond the plan's threat register. T-119-05-01 (token never authorizes) is satisfied: deep-links.ts ignores `?t=` entirely and the page fetches eligibility server-side. T-119-05-02 (domain association) configured via autoVerify + .well-known (pending the real SHA-256). T-119-05-03 (no cancel) enforced in the UI. T-119-05-05 (SPA fallback) recorded as a deployer note above.

## Verification

- `getTrialEligibility` + `reserveTrial` present in useSchedulingApi.ts; `trialEligibility` present in ReservasPage.vue; `TRIAL_WINDOW_DAYS` (30-day bound) present.
- `appUrlOpen` + `app.eltemplo.org` present in deep-links.ts; `deep-links` in quasar.config.js; `autoVerify` + `app.eltemplo.org` in AndroidManifest.xml; `associated-domains` + `applinks:app.eltemplo.org` in App.entitlements; both .well-known files exist and parse as valid JSON.
- `npx vue-tsc --noEmit`: zero errors in the touched files (`ReservasPage.vue`, `useSchedulingApi.ts`, `deep-links.ts`); total project error count unchanged at the pre-existing baseline of 24 (out-of-scope `import.meta.env`/`$router`/test-typing noise) — no regression introduced (verified by stashing the changes: 24 before and after).

## Checkpoint Status

**Task 3 is a `checkpoint:human-verify` with `gate="blocking"` — NOT auto-approved.** Execution stopped here per the non-autonomous plan. The three states + reserve flow + deep link require human verification on a device/emulator (eligible freemium fixture + native build). See the orchestrator-returned checkpoint message for exact verification steps. This SUMMARY will be finalized (self-check, metrics, state advance) after the checkpoint is approved and any follow-up adjustments land.

## Self-Check: PASSED

- Created files exist on disk: `el-templo-app/src/boot/deep-links.ts`, `el-templo-app/public/.well-known/assetlinks.json`, `el-templo-app/public/.well-known/apple-app-site-association`.
- Both task commits present in git history: f3abcbb9 (Task 1), cc0a015a (Task 2).
