---
phase: 119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
plan: 07
subsystem: campaigns (production infra + first send — human-gated)
tags:
  [
    resend,
    dns,
    spf,
    dkim,
    deep-links,
    well-known,
    freemium-trial,
    campaign-send,
    human-gate,
  ]
status: human-gate-pending
requires:
  - EmailService.sendCampaignBatch + trialCampaignHtml + CAMPAIGN_EMAIL_FROM (Plan 02)
  - CampaignService create/listEligible/send/funnel + admin routes (Plan 04)
  - member-app .well-known deep-link files (Plan 05)
  - admin Campañas section + send confirmation dialog (Plan 06)
provides:
  - finalized .env.example documentation for the prod campaign sender (D-17)
  - recorded .well-known reachability result on app.eltemplo.org (D-25)
  - ordered human-step checklist for the prod cutover + first send (D-17/D-13/D-11)
affects:
  - el-templo-api/.env.example
tech-stack:
  added: []
  patterns:
    - "Prod cutover env documented in .env.example (var names only, secret never committed — T-119-07-03 accept)"
key-files:
  created: []
  modified:
    - el-templo-api/.env.example
decisions:
  - "Plan 07 is non-autonomous: only Task 1 (env doc) was automatable now; Tasks 2-4 are blocking human gates the user performs externally (Resend dashboard + DNS, copy/image assets, the irreversible first send)."
  - ".well-known deep-link files are NOT correctly served yet on app.eltemplo.org — both paths return the SPA index.html (HTTP 200 but content-type text/html), not the JSON. Recorded as a DEPLOY-DEPENDENT follow-up; no unsolicited deploy performed (MEMORY)."
metrics:
  duration: ~6min
  completed: 2026-06-02
---

# Phase 119 Plan 07: Production Infra + First Campaign Send Summary

Final plan of Phase 119. Lands the production cutover and fires the campaign. Almost all of it is human-required external setup (Resend dashboard + DNS, user-supplied copy/images, the irreversible first send). Claude automated the one automatable task (finalize the prod env documentation) and verified `.well-known` reachability; everything else is returned as an ordered human checklist below.

## Execution Status: HUMAN-GATE-PENDING

| Task | Type                    | Status                                                                 |
| ---- | ----------------------- | ---------------------------------------------------------------------- |
| 1    | auto                    | ✅ DONE — committed `2a9dcbc4`                                         |
| 2    | checkpoint:human-action | ⏸ PENDING — Resend domain verify (DNS) + prod RESEND_API_KEY           |
| 3    | checkpoint:human-action | ⏸ PENDING — user-supplied email copy + image assets + WhatsApp nums    |
| 4    | checkpoint:human-verify | ⏸ PENDING — create campaign + cross-client preview + irreversible send |

## What Was Built (Task 1 — commit 2a9dcbc4)

`el-templo-api/.env.example` finalized for the prod campaign sender (D-17):

- `RESEND_API_KEY` — added a note that it is **prod-required** and that all email (transactional + campaigns) degrades silently with no delivery and no error if absent; the real key lives in the prod secret store and is never committed (T-119-07-03 accept — var name only documented).
- `CAMPAIGN_EMAIL_FROM` — documents the `send.eltemplo.org` subdomain sender and the full human-only Resend dashboard + DNS verification steps (SPF TXT, DKIM CNAME/TXT, Envelope-From TXT, bounce MX) that coexist with Google Workspace because the subdomain carries its own SPF (DMARC: strict DKIM / relaxed SPF aligns with Workspace). Placeholder left empty with the verified-sender example inline.

Acceptance grep passes: `CAMPAIGN_EMAIL_FROM` + `resend` present in `.env.example`.

## .well-known Reachability Check (D-25) — DEPLOY-DEPENDENT FOLLOW-UP

Checked both deep-link files on the deployed web app at `app.eltemplo.org`:

| File                                      | HTTP | content-type | Verdict                                           |
| ----------------------------------------- | ---- | ------------ | ------------------------------------------------- |
| `/.well-known/assetlinks.json`            | 200  | `text/html`  | ❌ wrong — returns SPA `index.html`, not the JSON |
| `/.well-known/apple-app-site-association` | 200  | `text/html`  | ❌ wrong — returns SPA `index.html`, not the JSON |

Both paths resolve to the El Templo SPA fallback (`<!doctype html><html>...<title>El Templo</title>`), not the actual Plan 05 deep-link JSON. App Links / Universal Links require the real file content served as `application/json` with no redirect. This means the Plan 05 `public/.well-known/` files are **not yet correctly served in prod** — either the el-templo-app web build carrying them hasn't been deployed, or the host's SPA catch-all is intercepting `/.well-known/*` before the static files.

**No unsolicited deploy was performed (per MEMORY).** This is recorded as a deploy-dependent follow-up — see human step D below. Until fixed, the email deep links fall back to opening the web app instead of the native app; the campaign can still send (live-text CTAs work), but native deep-linking won't verify.

## Deviations from Plan

None for the automated portion — Task 1 executed exactly as written. The remaining tasks are human gates by design (non-autonomous plan); they are not deviations.

## Remaining Human Steps (ordered — to run tomorrow)

These are the blocking gates for Tasks 2–4 plus the deploy-dependent `.well-known` follow-up. Do them in order; B/C can be prepared in parallel but the **send (E) is irreversible** and must come last.

### A. Verify the Resend sending subdomain (Task 2 — DNS, human-only)

1. Resend dashboard → Domains → Add domain → `send.eltemplo.org`.
2. On the **eltemplo.org** DNS zone, create every record Resend lists:
   - SPF `TXT` (scoped to the subdomain)
   - DKIM `CNAME`/`TXT`
   - Envelope-From / Return-Path `TXT`
   - bounce `MX`
     (These coexist with Google Workspace because the subdomain carries its own SPF.)
3. Wait until Resend reports the domain **Verified**.
4. Send a single Resend test email (or a 1-recipient test campaign to your own inbox) and confirm it lands in the **inbox, not spam**, with SPF/DKIM/DMARC aligned.

### B. Set prod secrets (Task 2 — human-only, no SSH by Claude)

1. In the prod environment / secret store set:
   - `RESEND_API_KEY=<real key>`
   - `CAMPAIGN_EMAIL_FROM="El Templo <hola@send.eltemplo.org>"` (the verified sender)
2. Restart the API so it picks up the new env. (`.env.example` already documents both — commit `2a9dcbc4`.)

### C. Supply email copy + image assets (Task 3 — user content, D-13/D-27)

1. Provide the email **subject + headline + subheadline + body** copy (or hand over raw info — Claude shapes it into brand voice; structure is fixed by the UI-SPEC, only the text is needed). This becomes the campaign `copySlots`.
2. Drop `logo.png` + the hero image into `el-templo-web/public/email/` (self-hosted, NO CDN) and deploy el-templo-web so `https://eltemplo.org/email/logo.png` and `https://eltemplo.org/email/hero.png` resolve (D-27 — email images stay on eltemplo.org).
3. Confirm or override the WhatsApp CTA numbers + preloaded message (known: AR `5492235820521`, ES `34680774331`). NOTE: Plan 04 left a placeholder WhatsApp number (`wa.me/5492234567890`) in `CampaignService.buildTemplateVars` — confirm the real per-country numbers so that gets wired before the send.

### D. Fix + verify .well-known deep-link serving (D-25 — deploy-dependent)

1. Ensure the el-templo-app **web build** (Plan 05, carrying `public/.well-known/assetlinks.json` + `apple-app-site-association`) is deployed to `app.eltemplo.org`, and that the host serves `/.well-known/*` as **static files with `Content-Type: application/json`, no redirect, bypassing the SPA catch-all**.
2. Re-verify:
   ```
   curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" https://app.eltemplo.org/.well-known/assetlinks.json
   curl -sS -o /dev/null -w "%{http_code} %{content_type}\n" https://app.eltemplo.org/.well-known/apple-app-site-association
   ```
   Both must return `200 application/json` and the real file body (NOT the `<!doctype html>` SPA shell).
3. Follow-up (do NOT do unsolicited per MEMORY): the **member-app store rebuild (minor bump)** carries the native deep-link config to the stores — surface as a separate store-release task, not part of this send.

### E. Create + preview + fire the first campaign (Task 4 — irreversible, human-verify, D-11)

1. In `/campanias` (admin), create the campaign with the final subject + copy from step C.
2. Check the **eligible recipient count** via the dialog / `GET /api/campaigns/admin/eligible-count` — sanity-check it against expectations (freemium, no active/paused/scheduled sub, no trial booking, not unsubscribed, registered > 3 days).
3. Send a **test/preview to your own inbox first**. Confirm across **Gmail + Apple Mail** (ideally Outlook too): renders correctly, fully readable **with images off**, both CTAs work (app deep link `app.eltemplo.org/r/trial` + WhatsApp), sedes addresses show, unsubscribe link works.
4. Only then click **"Enviar campaña"** and confirm the recipient-count dialog ("no se puede deshacer") before firing. **This is irreversible (D-11).**
5. After send, confirm the funnel begins populating (`enviado` first, then opens/clicks over time).

## Self-Check: PASSED

- `el-templo-api/.env.example` exists and contains `CAMPAIGN_EMAIL_FROM` (verified by acceptance grep).
- Task 1 commit `2a9dcbc4` present in git history on `staging`.
- No real campaign was sent; nothing was pushed; no SSH/prod change attempted.
