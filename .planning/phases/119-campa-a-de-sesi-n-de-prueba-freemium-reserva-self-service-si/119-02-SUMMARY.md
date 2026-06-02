---
phase: 119-campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
plan: 02
subsystem: campaigns + email (campaign send infrastructure)
tags: [email, mjml, resend, campaigns, freemium-trial, bulletproof-html]
requires:
  - branches.address column (D-24, from Plan 01)
  - campaign tables (from Plan 01)
provides:
  - EmailService.sendCampaignBatch (Resend batch + idempotencyKey, D-12)
  - trialCampaignHtml(vars) MJML→HTML renderer (D-13/D-14/D-16/D-23)
  - TRIAL_CAMPAIGN_SUBJECT
  - BranchAddress / TrialCampaignVars types
  - CAMPAIGN_EMAIL_FROM env var (TBD placeholder, D-17)
  - el-templo-web/public/email/ self-hosted image dir (D-27)
affects:
  - el-templo-api/src/modules/email/service.ts
  - el-templo-api/src/modules/campaigns
  - el-templo-api/package.json
tech-stack:
  added:
    - "mjml@5.2.2 (D-23, the one approved Phase 119 dependency — async MJML→HTML compiler)"
  patterns:
    - "Extend EmailService with batch method (Pitfall 3 — never `new Resend()` in the campaigns module)"
    - "MJML document built as a template string with server-side merge-var interpolation (no Resend-hosted templates), HTML-escaped"
    - "Bulletproof CTA: MSO-conditional VML <v:roundrect> for Outlook + HTML/CSS anchor for the rest; live text, never an image"
    - "Minimal local module declaration (src/types/mjml.d.ts) for a dep with no bundled types"
key-files:
  created:
    - el-templo-api/src/types/mjml.d.ts
    - el-templo-api/src/modules/campaigns/templates.ts
    - el-templo-api/src/modules/campaigns/types.ts
    - el-templo-web/public/email/.gitkeep
  modified:
    - el-templo-api/src/modules/email/service.ts
    - el-templo-api/package.json
    - el-templo-api/pnpm-lock.yaml
    - el-templo-api/.env.example
decisions:
  - "mjml v5 is asynchronous (v4 was sync) — trialCampaignHtml returns Promise<string> and sendCampaignBatch stays sync-signature (it sends pre-rendered HTML)."
  - "mjml ships no bundled types and there is no @types/mjml for v5; added a minimal local src/types/mjml.d.ts (no extra dep) covering only mjml2html's async signature."
  - "CAMPAIGN_FROM falls back to the transactional noreply@ sender when CAMPAIGN_EMAIL_FROM is unset, so the real sending subdomain can be deferred to Plan 07 without breaking dev."
  - "Merge vars (headline/body/addresses/URLs) are HTML-escaped before interpolation (Rule 2 — injection hardening at the email trust boundary)."
metrics:
  duration: ~12min
  completed: 2026-06-02
---

# Phase 119 Plan 02: Campaign Email Infrastructure Summary

Builds the reusable campaign-send infrastructure: installs MJML (D-23, the one approved Phase 119 dep), extends `EmailService` with an idempotent `sendCampaignBatch` (D-12), and authors the bulletproof, images-off-safe trial-campaign MJML template per the UI-SPEC Email Layout Contract (D-13/D-14/D-16/D-27). Wave 4 (campaign send) renders this template and calls this batch method.

## Checkpoint Resolution

The blocking human checkpoint (Task 0) was **approved** before any install:

1. **MJML approved** — installed `mjml@5.2.2` only; no other package added or bumped.
2. **`CAMPAIGN_EMAIL_FROM`** added to `.env.example` as a clearly-marked TBD placeholder (`TODO(119-07)`); no real sender hardcoded. Service degrades silently when env/API key is absent.
3. **Prod Resend setup** (RESEND_API_KEY + SPF/DKIM domain verification) **deferred to Plan 07** — not attempted here.

## What Was Built

### Task 1 — MJML install + EmailService.sendCampaignBatch (commit f0333454)

- Installed `mjml@5.2.2` (D-23). It is the only dependency added.
- `src/types/mjml.d.ts` (NEW): minimal `declare module "mjml"` covering the v5 **async** `mjml2html(doc, opts): Promise<MJMLParseResults>` signature — the package ships no types and there is no `@types/mjml` v5.
- `EmailService.sendCampaignBatch(messages, idempotencyKey)`:
  - Reuses the existing `if (!apiKey) { log; return }` degradation guard — silent skip without `RESEND_API_KEY` (no accidental dev sends).
  - `resend.batch.send(messages.map(m => ({ from: CAMPAIGN_FROM, ...m })), { idempotencyKey })` — idempotency guards duplicate sends on retry (T-119-02-01, D-12).
  - `CAMPAIGN_FROM = process.env.CAMPAIGN_EMAIL_FROM || EMAIL_FROM` (transactional fallback).
  - `catch (err: unknown)` with `instanceof Error`, Pino `this.log.error` (no console.log, no `any`), re-throws so the caller can mark the send failed.
  - Early-returns on empty `messages`.
- `.env.example`: `CAMPAIGN_EMAIL_FROM=""` TBD placeholder with `TODO(119-07)` note.

### Task 2 — MJML campaign template + self-hosted image dir (commit aec22757)

- `src/modules/campaigns/templates.ts` (NEW): `TRIAL_CAMPAIGN_SUBJECT` + `async trialCampaignHtml(vars)` compiling an MJML document to bulletproof table HTML. Vertical structure per UI-SPEC:
  1. Tracking pixel first (1×1 GIF, `alt=""`, `display:block`).
  2. Hero — self-hosted `logo.png` + `hero.png` from `https://eltemplo.org/email/` (NO CDN, D-27), alt text on both.
  3. Headline (Georgia 28/700 `#3D3732`) + subheadline + Terracotta divider.
  4. Body (Arial 16/1.5) — plain-text → `<p>` blocks.
  5. Dual CTA — Terracotta `#C07A56` primary "Reservá en la app" + WhatsApp `#25D366` "Agendá por WhatsApp", each a bulletproof button (MSO `<v:roundrect>` Outlook fallback + HTML anchor; live text, never an image).
  6. Sedes table — iterates `sedes` (name + address + optional "Cómo llegar" → mapsUrl).
  7. Footer (Olive Stone 12px) + unsubscribe link → `unsubscribeUrl`.
  - Web-safe fonts only (Georgia/Arial); no `@font-face`, no Google Fonts; mobile `@media` + dark-mode media query with solid fallbacks. All merge vars HTML-escaped.
- `src/modules/campaigns/types.ts` (NEW): `BranchAddress` + `TrialCampaignVars`.
- `el-templo-web/public/email/.gitkeep` (NEW): self-hosted image dir placeholder (logo/hero are user-supplied art).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `src/types/mjml.d.ts` (not in plan's `files_modified`)**

- **Found during:** Task 1
- **Issue:** `mjml@5` ships no bundled `.d.ts` and there is no `@types/mjml` for v5, so `import mjml2html from "mjml"` failed typecheck under `strict` + NodeNext.
- **Fix:** Added a minimal local module declaration covering only `mjml2html`'s async signature. No extra dependency (honors the install-only-mjml constraint).
- **Files modified:** `el-templo-api/src/types/mjml.d.ts`
- **Commit:** f0333454

**2. [Rule 2 - Security] HTML-escape merge vars in the template**

- **Found during:** Task 2
- **Issue:** Merge vars (headline/body/branch addresses/URLs) come from the DB and admin input and were interpolated raw into HTML — a markup-break / HTML-injection risk at the email trust boundary.
- **Fix:** Added an `esc()` helper applied to every interpolated value (text and `href`/attribute contexts).
- **Files modified:** `el-templo-api/src/modules/campaigns/templates.ts`
- **Commit:** aec22757

### Notes

- **mjml v5 is async.** The plan/PATTERNS examples assumed v4's synchronous `mjml(doc).html`. v5 returns a Promise, so `trialCampaignHtml` is `async` → `Promise<string>`. `sendCampaignBatch` is unaffected (it sends already-rendered HTML).
- No `pnpm typecheck` script exists in `el-templo-api`; used `npx tsc --noEmit` (green) per CLAUDE.md.
- Per the project rule, the full test suite was **not** run locally. `campaigns-template.test.ts` (the Plan 01 RED scaffold) is made GREEN by this template in CI; a local render harness confirmed the rendered HTML (see Verification).

## Known Stubs

- `el-templo-web/public/email/logo.png` and `hero.png` are **not yet present** — they are user-supplied brand art. The template references the canonical `eltemplo.org/email/...` paths and the `.gitkeep` documents the expected filenames. With images off the email is fully actionable (alt text + live-text CTAs), so this does not block the campaign; the art is dropped in before the prod send (Plan 07 territory).

## Verification

- `npx tsc --noEmit` green after both tasks.
- Local render harness (tsx) compiled `trialCampaignHtml(...)` with sample vars: 20 KB HTML, 3 images all with `alt`, and asserted PASS on: `v:roundrect` present, `C07A56` + `25D366` CTAs, tracking pixel, sedes rows, unsubscribe, **no blue/navy**, **no `@font-face`/Google Fonts**, **self-hosted `eltemplo.org/email`** image base.
- Acceptance greps pass: `sendCampaignBatch` + `idempotencyKey` in service.ts; `mjml` in package.json (124 lock refs); `CAMPAIGN_EMAIL_FROM` in .env.example; `trialCampaignHtml`/`TRIAL_CAMPAIGN_SUBJECT`/`roundrect`/`25D366`/`C07A56` in templates.ts; `BranchAddress` in types.ts; negative grep clean; `.gitkeep` exists.

## Self-Check: PASSED

All created/modified files exist on disk and both task commits (f0333454, aec22757) are present in git history (`git log --grep="119-02"`).
