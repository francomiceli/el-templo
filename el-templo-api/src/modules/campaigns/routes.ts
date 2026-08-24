/**
 * Campaign routes (Phase 119) — mixed public + admin plugin.
 *
 * Mirrors franchise/routes.ts: NO global onRequest auth hook. The public
 * tracking endpoints (open pixel / click redirect / unsubscribe) are plain; the
 * admin endpoints get a per-route `preHandler: [fastify.authenticate]` plus an
 * OWNER/ADMIN role + country-scope guard.
 *
 * Security invariants:
 *   - The HMAC token only IDENTIFIES a sendId (D-21) for `/track/*` and
 *     `/unsubscribe` — it NEVER authorizes those three. Phase 180 (D-01)
 *     REVISES this per-PURPOSE, not globally: a token signed with
 *     `purpose:'login'` ADDITIONALLY authorizes `POST /exchange`, but ONLY
 *     for 7 days (`loginExp`, D-02) — validated exclusively by
 *     `validateMagicLinkToken` (`token-service.ts`), never by
 *     `validateCampaignToken` (the one `/track/*`/`/unsubscribe` use).
 *   - The /track/click redirect target is DERIVED from an internal allowlist
 *     (host app.eltemplo.org, D-25) — never echoed from query input (Pitfall 4
 *     open-redirect).
 *   - /unsubscribe shows a generic confirmation page (no email echoed) to avoid
 *     enumeration (D-15).
 *   - POST /exchange (Phase 180, D-01) returns the SAME generic 401 for every
 *     failure path (anti-enumeration, T-180-25) and is POST-only on purpose:
 *     email scanners (Defender/Safe Links, Proofpoint) and client prefetch do
 *     GET/HEAD, so a GET that logs someone in would fire itself the moment the
 *     scanner visits the link, before the human ever clicks (T-180-24).
 */

import type { FastifyPluginAsync } from "fastify";
import { CampaignService } from "./service";
import { CampaignTrackingService } from "./tracking-service";
import { MagicLinkService } from "./magic-link-service";
import { EmailService } from "../email/service";
import { validateCampaignToken } from "./token-service";
import { ADMIN_ROLES, OWNER_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import {
  trackingQuerySchema,
  createCampaignSchema,
  listCampaignsSchema,
  campaignIdSchema,
  testCampaignSchema,
  eligibleCountSchema,
  exchangeSchema,
} from "./schemas";
import type { CreateCampaignInput } from "./types";

/**
 * Allowlisted redirect host for /track/click (D-25, anti open-redirect).
 * The click destination is DERIVED (CampaignService.trialDeepLink) against this
 * single host — the raw query token is the click payload, never the redirect
 * target. Any destination not on `app.eltemplo.org` is impossible by
 * construction.
 */
const CLICK_REDIRECT_ALLOWLIST_HOST = "app.eltemplo.org";

/** 1×1 transparent GIF (base64) returned by the open-tracking pixel. */
const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/** Generic unsubscribe confirmation page — NO PII / email echoed (D-15). */
const UNSUBSCRIBE_CONFIRMATION_HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Suscripción actualizada</title>
<style>
  body { margin:0; background:#F2EDE5; font-family: Georgia, 'Times New Roman', serif; color:#3D3732; }
  .wrap { max-width:520px; margin:64px auto; padding:32px 24px; text-align:center; }
  h1 { font-size:24px; margin:0 0 12px; }
  p { font-family: Arial, Helvetica, sans-serif; font-size:16px; line-height:1.5; color:#8A8472; }
</style></head>
<body><div class="wrap">
  <h1>Listo</h1>
  <p>Tu preferencia fue actualizada. No vas a recibir más correos de novedades de El Templo.</p>
  <p>Si fue un error, escribinos y lo revertimos.</p>
</div></body></html>`;

export const campaignRoutes: FastifyPluginAsync = async (fastify) => {
  const tracking = new CampaignTrackingService(fastify.db, fastify.log);
  const service = new CampaignService(
    fastify.db,
    fastify.log,
    new EmailService(fastify.log),
  );
  const magicLink = new MagicLinkService(
    fastify.db,
    fastify.log,
    fastify.jwt,
    fastify.accessTokenExpiresIn,
  );

  // ===========================================================================
  // Public tracking routes (NO auth — D-15 / D-18)
  // ===========================================================================

  // GET /track/open?t= — record an open + return a 1×1 GIF (no-store).
  fastify.get<{ Querystring: { t: string } }>(
    "/track/open",
    { schema: trackingQuerySchema },
    async (request, reply) => {
      const payload = validateCampaignToken(request.query.t);
      if (payload) {
        try {
          await tracking.recordOpen(payload.sendId);
        } catch (err: unknown) {
          // Never let a tracking write break pixel delivery (degrade silently).
          const message = err instanceof Error ? err.message : String(err);
          request.log.warn({ err: message }, "recordOpen failed");
        }
      }
      return reply
        .header("Content-Type", "image/gif")
        .header("Cache-Control", "no-store")
        .send(PIXEL_GIF);
    },
  );

  // GET /track/click?t= — record a click + 302 to the ALLOWLISTED deep link.
  // The destination is DERIVED from the token (app.eltemplo.org, D-25); raw
  // query input is never used as the redirect target (anti open-redirect).
  fastify.get<{ Querystring: { t: string } }>(
    "/track/click",
    { schema: trackingQuerySchema },
    async (request, reply) => {
      const payload = validateCampaignToken(request.query.t);
      // The redirect host is fixed to the web app; we re-sign nothing and never
      // echo a caller-supplied URL.
      const destination = CampaignService.trialDeepLink(request.query.t);
      // Defense-in-depth: the derived destination MUST be on the allowlisted
      // host (D-25). This can only fail if trialDeepLink regresses — fail closed.
      if (new URL(destination).host !== CLICK_REDIRECT_ALLOWLIST_HOST) {
        request.log.error(
          { destination },
          "click redirect host not on allowlist — refusing",
        );
        return reply.status(400).send({ error: "Destino inválido" });
      }
      if (payload) {
        try {
          await tracking.recordClick(payload.sendId, destination);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          request.log.warn({ err: message }, "recordClick failed");
        }
      }
      return reply.redirect(destination, 302);
    },
  );

  // GET /unsubscribe?t= — suppress the send's email + generic confirmation page.
  fastify.get<{ Querystring: { t: string } }>(
    "/unsubscribe",
    { schema: trackingQuerySchema },
    async (request, reply) => {
      const payload = validateCampaignToken(request.query.t);
      if (payload) {
        try {
          // T-175-02: recordUnsubscribe resuelve tenant+email por su cuenta
          // desde campaign_sends (via sendId) — ya no hace falta el
          // getSendEmail previo que hacía esta ruta.
          await tracking.recordUnsubscribe(payload.sendId);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          request.log.warn({ err: message }, "recordUnsubscribe failed");
        }
      }
      // Always show the same generic page (no email echoed — anti-enumeration).
      return reply
        .header("Content-Type", "text/html; charset=utf-8")
        .send(UNSUBSCRIBE_CONFIRMATION_HTML);
    },
  );

  // POST /exchange — magic-link canje: purpose:'login' token -> sesion real
  // (Phase 180, D-01/D-02). NO preHandler (publica, como las 3 de arriba).
  //
  // POST y no GET a proposito (T-180-24): los escaneres de correo
  // (Defender/Safe Links, Proofpoint) y el prefetch del cliente disparan
  // GET/HEAD sobre TODOS los links de un email antes de que el humano
  // llegue a clickear — un GET que canjeara se dispararia solo y quemaria
  // el link (o, peor, generaria una sesion en la maquina del escaner).
  //
  // 401 generico para TODO camino de fallo (T-180-25, anti-enumeracion): el
  // caller nunca sabe si el token era de tracking, estaba vencido, tenia la
  // firma alterada, el sendId no resolvia, el usuario estaba borrado o el
  // userId no coincidia con el dueno real del send — MagicLinkService.exchange
  // ya colapsa los 6+ motivos en un solo `null`.
  //
  // Referrer-Policy: no-referrer (T-180-27): el token viaja en el BODY de este
  // POST (nunca en la URL de esta ruta), pero la respuesta lo deja sentado
  // para que ningun link saliente que la app renderice después del canje
  // pueda filtrar nada por el header Referer.
  fastify.post<{ Body: { token: string } }>(
    "/exchange",
    { schema: exchangeSchema },
    async (request, reply) => {
      const result = await magicLink.exchange(request.body.token);
      reply.header("Referrer-Policy", "no-referrer");
      if (!result) {
        return reply
          .status(401)
          .send({ error: "Enlace inválido o vencido" });
      }
      return result;
    },
  );

  // ===========================================================================
  // Admin routes (owner/admin + country scope)
  // ===========================================================================

  /** Resolve the country scope for a non-owner admin; owner = global (null). */
  function scopeCountry(request: {
    scope: { isOwner: boolean; country: string | null };
  }): "AR" | "ES" | null {
    if (request.scope.isOwner) return null;
    const c = request.scope.country;
    return c === "AR" || c === "ES" ? c : null;
  }

  // POST /admin — create a draft campaign (D-12/D-19). Owner/admin only.
  fastify.post<{ Body: CreateCampaignInput }>(
    "/admin",
    { preHandler: [fastify.authenticate], schema: createCampaignSchema },
    async (request, reply) => {
      if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
        return reply.status(403).send({ error: "Acceso de admin requerido" });
      }
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "campaigns.create");
      // Non-owner admins are pinned to their own country scope.
      const country = request.scope.isOwner
        ? (request.body.country ?? null)
        : scopeCountry(request);
      const campaign = await service.create(
        ctx,
        { ...request.body, country },
        request.user.userId,
      );
      return reply.code(201).send(campaign);
    },
  );

  // GET /admin — list campaigns with recipient counts (D-19).
  fastify.get<{ Querystring: { country?: "AR" | "ES" } }>(
    "/admin",
    { preHandler: [fastify.authenticate], schema: listCampaignsSchema },
    async (request, reply) => {
      if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
        return reply.status(403).send({ error: "Acceso de admin requerido" });
      }
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "campaigns.list");
      const country = request.scope.isOwner
        ? (request.query.country ?? null)
        : scopeCountry(request);
      return service.listCampaigns(ctx, country);
    },
  );

  // POST /admin/:id/send — send a campaign (owner only; mass send is irreversible).
  fastify.post<{ Params: { id: number } }>(
    "/admin/:id/send",
    { preHandler: [fastify.authenticate], schema: campaignIdSchema },
    async (request, reply) => {
      if (!(OWNER_ROLES as readonly string[]).includes(request.user.role)) {
        return reply.status(403).send({ error: "Acceso de owner requerido" });
      }
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "campaigns.send");
      return service.send(ctx, request.params.id);
    },
  );

  // GET /admin/sender — the configured campaign sender address (preview dialog).
  fastify.get(
    "/admin/sender",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
        return reply.status(403).send({ error: "Acceso de admin requerido" });
      }
      return { from: service.senderAddress() };
    },
  );

  // POST /admin/:id/test — send ONE preview email to a single address.
  // Inert (no enrollment / no status change), so admins (not owner-only) can
  // preview before the irreversible mass send.
  fastify.post<{ Params: { id: number }; Body: { email: string } }>(
    "/admin/:id/test",
    { preHandler: [fastify.authenticate], schema: testCampaignSchema },
    async (request, reply) => {
      if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
        return reply.status(403).send({ error: "Acceso de admin requerido" });
      }
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "campaigns.test");
      return service.sendTest(ctx, request.params.id, request.body.email);
    },
  );

  // GET /admin/:id/funnel — per-campaign funnel (D-18/D-19).
  fastify.get<{ Params: { id: number } }>(
    "/admin/:id/funnel",
    { preHandler: [fastify.authenticate], schema: campaignIdSchema },
    async (request, reply) => {
      if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
        return reply.status(403).send({ error: "Acceso de admin requerido" });
      }
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "campaigns.funnel");
      return service.funnel(ctx, request.params.id);
    },
  );

  // GET /admin/eligible-count — current eligible audience size (D-08/09/10).
  fastify.get<{ Querystring: { country?: "AR" | "ES" } }>(
    "/admin/eligible-count",
    { preHandler: [fastify.authenticate], schema: eligibleCountSchema },
    async (request, reply) => {
      if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
        return reply.status(403).send({ error: "Acceso de admin requerido" });
      }
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "campaigns.eligibleCount");
      const country = request.scope.isOwner
        ? (request.query.country ?? null)
        : scopeCountry(request);
      const eligible = await service.listEligible(ctx, country);
      return { count: eligible.length };
    },
  );
};
