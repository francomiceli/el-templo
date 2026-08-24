/**
 * Trial-campaign email template render (Phase 119 D-16/D-23; Phase 180 D-06/D-07/D-10).
 *
 * Pure function test over `trialCampaignHtml(vars)` — no DB, no `app.inject()`.
 * Fixes the contract this plan (180-09) closes:
 *   - UN solo CTA primario (el magic link de tracking del click), texto vivo.
 *   - La tabla de sedes es informativa (nombre + dirección + "Cómo llegar"),
 *     sin link de reserva por fila.
 *   - El CTA de WhatsApp sigue presente como secundario (D-10/119-D-14).
 *   - El copy del admin (headline/subheadline/body) y la dirección de sede
 *     siguen escapados antes de entrar al HTML (regresión de `esc()`).
 *
 * Nota sobre el conteo del CTA primario: `bulletproofButton()` emite DOS
 * bloques con el mismo href por diseño (D-16, patrón "bulletproof button"):
 * un `<v:roundrect href="...">` envuelto en `<!--[if mso]>` para Outlook, y
 * un `<a href="...">` real para el resto de los clientes. Contar el string
 * crudo del href da 2 ocurrencias — la aserción de "un solo CTA" se hace
 * sobre el `<a href="...">` real (lo único que un cliente no-Outlook
 * renderiza), que es exactamente 1.
 */
import { describe, expect, it } from "vitest";
import { trialCampaignHtml } from "../src/modules/campaigns/templates";
import type { TrialCampaignVars } from "../src/modules/campaigns/types";

/** Escape a literal string for safe use inside a `RegExp` constructor. */
function reEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Same HTML-attribute escaping `esc()` applies in templates.ts (& < > " ')
 * before a URL is interpolated into an `href="..."` attribute — a `mapsUrl`
 * with a `&` in its query string (e.g. `?api=1&query=...`) is rendered as
 * `&amp;`, so the expected href must be escaped the same way to match.
 */
function htmlAttrEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Count real `<a href="...">` anchor occurrences for a given URL. */
function countAnchorHref(html: string, href: string): number {
  const re = new RegExp(`<a href="${reEscape(htmlAttrEscape(href))}"`, "g");
  return [...html.matchAll(re)].length;
}

const baseVars: TrialCampaignVars = {
  headline: "Tu primera clase es gratis",
  subheadline: "Vení a probar",
  body: "Te esperamos con onda.\n\nTraé ropa cómoda.",
  trackingPixelUrl: "https://api.eltemplo.org/api/campaigns/track/open?t=TOKEN123",
  ctaAppUrl: "https://api.eltemplo.org/api/campaigns/track/click?t=TOKEN123",
  whatsappUrl: "https://wa.me/5492235820521?text=hola",
  sedes: [
    {
      name: "Constitución",
      address: "Av. Constitución 6745",
      mapsUrl:
        "https://www.google.com/maps/search/?api=1&query=Av.%20Constituci%C3%B3n%206745",
    },
    {
      name: "Barcelona Centro",
      address: "Carrer de Balmes 100",
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Carrer%20de%20Balmes%20100",
    },
  ],
  unsubscribeUrl: "https://api.eltemplo.org/api/campaigns/unsubscribe?t=TOKEN123",
};

describe("trialCampaignHtml render (Phase 180, D-06/D-07/D-10)", () => {
  it("D-06: renders exactly one <a href> anchor for the primary CTA (the magic-link click-tracking URL)", async () => {
    const html = await trialCampaignHtml(baseVars);
    expect(countAnchorHref(html, baseVars.ctaAppUrl)).toBe(1);
  });

  it("D-10: the WhatsApp CTA is still present as a secondary anchor", async () => {
    const html = await trialCampaignHtml(baseVars);
    expect(countAnchorHref(html, baseVars.whatsappUrl)).toBe(1);
  });

  it("D-06/D-07: renders exactly one row per sede provided, each with its address and Maps link", async () => {
    const html = await trialCampaignHtml(baseVars);
    for (const sede of baseVars.sedes) {
      expect(html).toContain(sede.name);
      expect(html).toContain(sede.address);
      expect(countAnchorHref(html, sede.mapsUrl!)).toBe(1);
    }
    // Exactly N sedes worth of "Cómo llegar" links — no extra reservation
    // link per row (D-06: sede selection lives in the app's popup, D-07).
    const comoLlegarCount = [...html.matchAll(/Cómo llegar/g)].length;
    expect(comoLlegarCount).toBe(baseVars.sedes.length);
  });

  it("D-06: a sede without a usable address produces no Maps href for that row", async () => {
    const vars: TrialCampaignVars = {
      ...baseVars,
      sedes: [
        ...baseVars.sedes,
        { name: "Sede sin dirección", address: "" },
      ],
    };
    const html = await trialCampaignHtml(vars);
    // Only the 2 sedes WITH a mapsUrl produce a "Cómo llegar" link; the
    // address-less sede's name still appears (informational row), but no
    // extra Maps href/link is added for it.
    const comoLlegarCount = [...html.matchAll(/Cómo llegar/g)].length;
    expect(comoLlegarCount).toBe(2);
    expect(html).toContain("Sede sin dirección");
  });

  it("D-06: no per-sede reservation link is rendered (only 'Cómo llegar' anchors point to sedes)", async () => {
    const html = await trialCampaignHtml(baseVars);
    // The only anchors pointing at Google Maps are the "Cómo llegar" links —
    // none of them carry booking/reservation semantics (no /r/trial-style
    // per-row link exists in the template).
    expect(html).not.toContain("Reservá esta sede");
    expect(html).not.toContain("Reservar sede");
  });

  it("esc(): escapes <script> and other HTML-significant characters from admin-supplied copy", async () => {
    const vars: TrialCampaignVars = {
      ...baseVars,
      headline: "<script>alert('x')</script> & Co",
      subheadline: "Sub & Co <b>bold</b>",
      body: "Cuerpo con \"comillas\" & <em>tags</em>",
    };
    const html = await trialCampaignHtml(vars);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(html).toContain("Sub &amp; Co &lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain("<em>tags</em>");
  });

  it("esc(): escapes an admin-supplied sede address before it enters the HTML", async () => {
    const vars: TrialCampaignVars = {
      ...baseVars,
      sedes: [
        {
          name: "Sede & Co <script>",
          address: 'Calle "Falsa" 123 & <b>algo</b>',
        },
      ],
    };
    const html = await trialCampaignHtml(vars);
    expect(html).not.toContain("<script>");
    expect(html).toContain("Sede &amp; Co &lt;script&gt;");
    expect(html).toContain("Calle &quot;Falsa&quot; 123 &amp; &lt;b&gt;algo&lt;/b&gt;");
  });

  it("D-16: the primary CTA label is live text, not an image, and includes a VML fallback for Outlook", async () => {
    const html = await trialCampaignHtml(baseVars);
    expect(html).toContain("Reservá en la app");
    expect(html).toContain("v:roundrect");
  });
});
