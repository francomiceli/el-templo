/**
 * Phase 119 — RED scaffold: trial-campaign email template render.
 *
 * Requirements covered (made GREEN by Plan 02):
 *   - D-16 email "bulletproof" (tablas, CSS inline, VML para Outlook)
 *   - D-23 plantilla MJML compilada a HTML server-side (sin templates de Resend)
 *
 * Pure render assertion (no DB). Once Plan 02 lands
 * src/modules/campaigns/templates.ts, replace these placeholders with:
 *
 *   import { trialCampaignHtml } from "../src/modules/campaigns/templates";
 *
 * and assert on the compiled HTML string:
 *   - a VML <v:roundrect> exists for the Outlook CTA fallback (D-16)
 *   - warm palette / NO blue (no '2c3e5c', no 'navy')
 *   - no '@font-face' and no Google Fonts CDN (self-hosted/web-safe only)
 *   - every <img> carries an alt attribute (accessibility)
 *
 * Kept RED (it.todo) until Plan 02 ships the template module.
 */
import { describe, it } from "vitest";

describe("trialCampaignHtml render (Phase 119, D-16/D-23)", () => {
  it.todo("D-16: includes a VML roundrect for the Outlook CTA fallback");
  it.todo("D-16: uses the warm palette — no blue (no '2c3e5c'/'navy')");
  it.todo("D-23: no @font-face and no Google Fonts CDN (self-hosted only)");
  it.todo("D-23: every <img> has an alt attribute");
});
