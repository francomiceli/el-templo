/**
 * Trial-campaign email template (Phase 119, D-13/D-14/D-16/D-23/D-27).
 *
 * Authored in MJML (the one approved Phase 119 dependency, D-23) and compiled
 * to bulletproof, table-based HTML at render time. Merge variables are
 * interpolated server-side — we do NOT use Resend-hosted templates.
 *
 * Structural authority: 119-UI-SPEC §"Email Layout Contract". Web-safe fonts
 * only (Georgia/Arial), all images self-hosted under eltemplo.org/email/
 * (NO CDN, D-27), warm brand palette (NO blue), and the email is fully
 * actionable with images OFF — both CTAs are live VML/HTML buttons, never
 * images.
 *
 * mjml v5 is asynchronous, so the render function returns a Promise.
 */

import mjml2html from "mjml";
import type { TrialCampaignVars } from "./types";

/** Subject line — copy is user-supplied (UI-SPEC). Placeholder until provided. */
export const TRIAL_CAMPAIGN_SUBJECT =
  "Tu primera sesión en El Templo es gratis";

// --- Warm brand palette (UI-SPEC, NO blue) ---
const MARBLE_CREAM = "#F2EDE5";
const SANDY_BEIGE = "#E5D9C8";
const WARM_STONE = "#D9CFC1";
const TERRACOTTA = "#C07A56";
const DEEP_CHARCOAL = "#3D3732";
const OLIVE_STONE = "#8A8472";
const WHATSAPP_GREEN = "#25D366";

// --- Self-hosted image base (D-27, NO CDN) ---
const EMAIL_IMAGE_BASE = "https://eltemplo.org/email";

// Web-safe font stacks only — no custom web fonts, no Google Fonts CDN.
const SERIF_STACK = "Georgia, 'Times New Roman', serif";
const SANS_STACK = "Arial, Helvetica, sans-serif";

/**
 * Escape a string for safe interpolation into HTML/attribute context.
 * Merge vars (headline/body/addresses/URLs) originate from the DB and admin
 * input — escaping prevents broken markup and HTML injection in the email.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Convert plain-text body (with blank-line paragraphs) into <p> blocks. */
function bodyToParagraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map(
      (p) =>
        `<p style="margin: 0 0 16px 0;">${esc(p).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

/** Render one sede row for the "Nuestras sedes" table. */
function sedeRow(sede: {
  name: string;
  address: string;
  mapsUrl?: string;
}): string {
  const mapsLink = sede.mapsUrl
    ? `<br /><a href="${esc(sede.mapsUrl)}" style="color: ${TERRACOTTA}; font-family: ${SANS_STACK}; font-size: 14px; text-decoration: underline;">Cómo llegar</a>`
    : "";
  return `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid ${WARM_STONE};">
        <span style="font-family: ${SERIF_STACK}; font-size: 16px; font-weight: 700; color: ${DEEP_CHARCOAL};">${esc(sede.name)}</span><br />
        <span style="font-family: ${SANS_STACK}; font-size: 14px; color: ${OLIVE_STONE};">${esc(sede.address)}</span>
        ${mapsLink}
      </td>
    </tr>`;
}

/**
 * Build a bulletproof CTA button: a VML <v:roundrect> for Outlook (Word
 * engine, MSO conditional) plus an HTML/CSS anchor for every other client.
 * Live text label — never an image — so it survives images-off (D-16).
 */
function bulletproofButton(opts: {
  href: string;
  label: string;
  bgColor: string;
  textColor: string;
}): string {
  const { href, label, bgColor, textColor } = opts;
  const safeHref = esc(href);
  const safeLabel = esc(label);
  return `
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeHref}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="9%" strokecolor="${bgColor}" fillcolor="${bgColor}">
      <w:anchorlock/>
      <center style="color:${textColor};font-family:${SANS_STACK};font-size:16px;font-weight:bold;">${safeLabel}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <a href="${safeHref}" target="_blank" style="background-color:${bgColor};border-radius:4px;color:${textColor};display:inline-block;font-family:${SANS_STACK};font-size:16px;font-weight:700;line-height:48px;text-align:center;text-decoration:none;width:280px;-webkit-text-size-adjust:none;">${safeLabel}</a>
    <!--<![endif]-->`;
}

/**
 * Compile the trial-campaign MJML document to bulletproof HTML.
 * Returns the rendered HTML string (mjml v5 is async).
 */
export async function trialCampaignHtml(
  vars: TrialCampaignVars,
): Promise<string> {
  const {
    headline,
    subheadline,
    body,
    heroImageUrl,
    trackingPixelUrl,
    ctaAppUrl,
    whatsappUrl,
    sedes,
    unsubscribeUrl,
  } = vars;

  // CR-02: use the admin-supplied hero when present; otherwise the default
  // self-hosted asset (D-27 — no CDN, the URL is escaped before interpolation).
  const heroSrc = heroImageUrl
    ? esc(heroImageUrl)
    : `${EMAIL_IMAGE_BASE}/hero.png`;

  const sedeRows = sedes.map(sedeRow).join("");

  const primaryCta = bulletproofButton({
    href: ctaAppUrl,
    label: "Reservá en la app",
    bgColor: TERRACOTTA,
    textColor: MARBLE_CREAM,
  });

  const whatsappCta = bulletproofButton({
    href: whatsappUrl,
    label: "Agendá por WhatsApp",
    bgColor: WHATSAPP_GREEN,
    textColor: "#FFFFFF",
  });

  const mjmlDocument = `
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="${SANS_STACK}" />
      <mj-text color="${DEEP_CHARCOAL}" font-size="16px" line-height="1.5" />
    </mj-attributes>
    <mj-style>
      @media screen and (max-width:600px) {
        .et-cta a { width: 100% !important; }
      }
      @media (prefers-color-scheme: dark) {
        .et-body { background-color: ${MARBLE_CREAM} !important; }
        .et-panel { background-color: #FFFFFF !important; }
        .et-text { color: ${DEEP_CHARCOAL} !important; }
      }
    </mj-style>
  </mj-head>
  <mj-body background-color="${MARBLE_CREAM}" css-class="et-body" width="600px">

    <!-- 1. Tracking pixel (first element) -->
    <mj-raw>
      <img src="${esc(trackingPixelUrl)}" alt="" width="1" height="1" style="display:block;border:0;outline:none;text-decoration:none;height:1px;width:1px;" />
    </mj-raw>

    <!-- 2. Hero: self-hosted logo + hero image (NO CDN, D-27) -->
    <mj-section background-color="${MARBLE_CREAM}" padding="32px 24px 16px 24px">
      <mj-column>
        <mj-image src="${EMAIL_IMAGE_BASE}/logo.png" alt="El Templo" width="160px" align="center" padding="0 0 24px 0" />
        <mj-image src="${heroSrc}" alt="Entrenamiento en El Templo" width="552px" padding="0" />
      </mj-column>
    </mj-section>

    <!-- 3. Offer headline + subheadline + terracotta divider -->
    <mj-section background-color="${MARBLE_CREAM}" padding="16px 24px 0 24px">
      <mj-column>
        <mj-text css-class="et-text" font-family="${SERIF_STACK}" font-size="28px" font-weight="700" line-height="1.25" color="${DEEP_CHARCOAL}" align="center">
          ${esc(headline)}
        </mj-text>
        <mj-text css-class="et-text" font-family="${SERIF_STACK}" font-size="20px" font-weight="400" line-height="1.3" color="${DEEP_CHARCOAL}" align="center" padding="8px 0 0 0">
          ${esc(subheadline)}
        </mj-text>
        <mj-divider border-color="${TERRACOTTA}" border-width="2px" width="64px" padding="16px 0 0 0" />
      </mj-column>
    </mj-section>

    <!-- 4. Body copy -->
    <mj-section background-color="${MARBLE_CREAM}" padding="16px 24px">
      <mj-column>
        <mj-text css-class="et-text" font-family="${SANS_STACK}" font-size="16px" line-height="1.5" color="${DEEP_CHARCOAL}">
          ${bodyToParagraphs(body)}
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- 5. Dual CTA (bulletproof, VML for Outlook) -->
    <mj-section background-color="${MARBLE_CREAM}" padding="8px 24px 24px 24px">
      <mj-column>
        <mj-raw>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
            <tr><td class="et-cta" align="center" style="padding:0 0 16px 0;">${primaryCta}</td></tr>
            <tr><td class="et-cta" align="center" style="padding:0;">${whatsappCta}</td></tr>
          </table>
        </mj-raw>
      </mj-column>
    </mj-section>

    <!-- 6. Sedes table -->
    <mj-section background-color="${SANDY_BEIGE}" css-class="et-panel" padding="24px">
      <mj-column>
        <mj-text font-family="${SERIF_STACK}" font-size="20px" font-weight="700" color="${DEEP_CHARCOAL}" padding="0 0 12px 0">
          Nuestras sedes
        </mj-text>
        <mj-raw>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
            ${sedeRows}
          </table>
        </mj-raw>
      </mj-column>
    </mj-section>

    <!-- 7. Footer + unsubscribe -->
    <mj-section background-color="${MARBLE_CREAM}" padding="24px">
      <mj-column>
        <mj-text font-family="${SANS_STACK}" font-size="12px" line-height="1.4" color="${OLIVE_STONE}" align="center">
          El Templo — Mar del Plata, Argentina · Barcelona, España.<br />
          Recibís este correo porque sos parte de la comunidad de El Templo.<br />
          <a href="${esc(unsubscribeUrl)}" style="color:${OLIVE_STONE};text-decoration:underline;">¿No querés recibir más novedades? Darte de baja</a>
        </mj-text>
      </mj-column>
    </mj-section>

  </mj-body>
</mjml>`;

  const { html, errors } = await mjml2html(mjmlDocument, {
    validationLevel: "soft",
  });

  if (errors.length > 0) {
    // Surface compile errors to the caller; the campaign service logs/handles.
    throw new Error(
      `MJML compile errors: ${errors.map((e) => e.formattedMessage).join("; ")}`,
    );
  }

  return html;
}
