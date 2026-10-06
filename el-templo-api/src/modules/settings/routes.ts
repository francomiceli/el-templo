/**
 * Settings Routes — pricing rules (Phase 154, ALUM-03) + store URLs (Phase
 * 179-12, D-20)
 *
 * Registered at /api/admin/settings.
 *
 * Access model (D-04): the GET is readable by ANY authenticated staff — the
 * card-surcharge value is needed by the coach PoS / admin pricing UI to compute
 * the price at the point of sale, so it is NOT owner-gated at the plugin level.
 * The WRITE (PUT) is owner-only via a per-route preHandler (OWNER_ROLES → 403):
 * only the propietario can change a pricing rule. The store-urls pair below
 * follows the exact same access model (T-179-49: a bad URL becomes hundreds
 * of useless printed cards).
 *
 * Fase 194 (D-10c): `/invitations` — parámetros del programa de Invitaciones en
 * `tenant_settings`. GET para cualquier staff; PUT para gestion/admin/owner
 * (INVITATION_SETTINGS_WRITE_ROLES), porque gestión carga el tope en dinero.
 */

import { FastifyPluginAsync } from "fastify";
import { SettingsService } from "./service";
import {
  ALL_STAFF_ROLES,
  INVITATION_SETTINGS_WRITE_ROLES,
  OWNER_ROLES,
} from "../shared/permissions";
import { handleServiceError } from "../shared/error-handler";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import {
  getInvitationSettings,
  setInvitationSettings,
  type InvitationSettingsPatch,
} from "../referrals/invitation-settings";

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  const settingsService = new SettingsService(fastify.db, fastify.log);

  /**
   * Guard: authenticate every request in this plugin and require a staff role
   * (any staff can read; member tokens are rejected with 403). The white-label
   * core keeps `/api/admin/*` plugins staff-gated at the hook level (mirrors
   * users/routes.ts) — the card-surcharge value is a staff-facing pricing input,
   * never member-readable. Owner-only enforcement for writes is applied
   * per-route below.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(ALL_STAFF_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Solo staff puede consultar la configuración",
      });
    }
  });

  // GET /pricing/card-surcharge — readable by any authenticated staff.
  fastify.get(
    "/pricing/card-surcharge",
    {
      schema: {
        response: {
          200: {
            type: "object",
            required: ["enabled"],
            properties: { enabled: { type: "boolean" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const enabled = await settingsService.getCardSurchargeEnabled();
        return { enabled };
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "get card-surcharge setting",
        );
      }
    },
  );

  // PUT /pricing/card-surcharge — owner-only write (T-154-01 mitigation).
  fastify.put<{ Body: { enabled: boolean } }>(
    "/pricing/card-surcharge",
    {
      preHandler: async (request, reply) => {
        if (!(OWNER_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "Solo el propietario puede cambiar reglas de precio",
          });
        }
      },
      schema: {
        body: {
          type: "object",
          required: ["enabled"],
          properties: { enabled: { type: "boolean" } },
        },
        response: {
          200: {
            type: "object",
            required: ["enabled"],
            properties: { enabled: { type: "boolean" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { enabled } = request.body;
        await settingsService.setCardSurchargeEnabled(enabled);
        return { enabled };
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "set card-surcharge setting",
        );
      }
    },
  );

  // GET /pricing/zero-price — readable by any authenticated staff (156 D-03).
  fastify.get(
    "/pricing/zero-price",
    {
      schema: {
        response: {
          200: {
            type: "object",
            required: ["enabled"],
            properties: { enabled: { type: "boolean" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const enabled = await settingsService.getZeroPriceEnabled();
        return { enabled };
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "get zero-price setting",
        );
      }
    },
  );

  // PUT /pricing/zero-price — owner-only write (T-156-01 mitigation).
  fastify.put<{ Body: { enabled: boolean } }>(
    "/pricing/zero-price",
    {
      preHandler: async (request, reply) => {
        if (!(OWNER_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "Solo el propietario puede cambiar reglas de precio",
          });
        }
      },
      schema: {
        body: {
          type: "object",
          required: ["enabled"],
          properties: { enabled: { type: "boolean" } },
        },
        response: {
          200: {
            type: "object",
            required: ["enabled"],
            properties: { enabled: { type: "boolean" } },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { enabled } = request.body;
        await settingsService.setZeroPriceEnabled(enabled);
        return { enabled };
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "set zero-price setting",
        );
      }
    },
  );

  // GET /store-urls — readable by any authenticated staff (needed to generate
  // the partner QR PNGs from the admin, phase 179-12 / D-20).
  fastify.get(
    "/store-urls",
    {
      schema: {
        response: {
          200: {
            type: "object",
            required: ["android", "ios"],
            properties: {
              android: { type: ["string", "null"] },
              ios: { type: ["string", "null"] },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        return await settingsService.getStoreUrls();
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "get store urls setting",
        );
      }
    },
  );

  // PUT /store-urls — owner-only write, same guard as the other write routes
  // of this plugin (T-179-49 mitigation: a bad URL becomes hundreds of
  // useless printed cards, so only the propietario changes it).
  fastify.put<{ Body: { android?: string; ios?: string } }>(
    "/store-urls",
    {
      preHandler: async (request, reply) => {
        if (!(OWNER_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "Solo el propietario puede cambiar las URLs de tienda",
          });
        }
      },
      schema: {
        body: {
          type: "object",
          properties: {
            android: { type: "string", minLength: 1 },
            ios: { type: "string", minLength: 1 },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            required: ["android", "ios"],
            properties: {
              android: { type: ["string", "null"] },
              ios: { type: ["string", "null"] },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        await settingsService.setStoreUrls(request.body);
        return await settingsService.getStoreUrls();
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "set store urls setting",
        );
      }
    },
  );

  // GET /invitations — parámetros del programa de Invitaciones (Fase 194).
  // Cualquier staff lo lee (el admin muestra cupo/vigencia/tope). Incluye, de
  // solo lectura, el % por invitado activo y el tope % (D-09), que siguen en
  // `aura_config` / `system_settings` (globales).
  fastify.get("/invitations", async (request, reply) => {
    try {
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "settings.getInvitations");
      return await getInvitationSettings(fastify.db, ctx, request.log);
    } catch (err: unknown) {
      return handleServiceError(
        err,
        reply,
        request.log,
        "get invitation settings",
      );
    }
  });

  // PUT /invitations — gestion/admin/owner (D-10c, T-194-21). JSON-schema con
  // additionalProperties:false y rangos (T-194-22); el servicio vuelve a validar
  // el patch completo antes de escribir. `discountCapAmount.<PAIS> = null` borra
  // el tope de ese país. El tenant sale SIEMPRE del scope, nunca del body.
  fastify.put<{ Body: InvitationSettingsPatch }>(
    "/invitations",
    {
      preHandler: async (request, reply) => {
        if (
          !(INVITATION_SETTINGS_WRITE_ROLES as readonly string[]).includes(
            request.user.role,
          )
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message:
              "Solo gestión o el propietario pueden cambiar los parámetros de invitaciones",
          });
        }
      },
      schema: {
        body: {
          type: "object",
          properties: {
            monthlyQuota: { type: "integer", minimum: 1, maximum: 10 },
            accessBusinessDays: { type: "integer", minimum: 1, maximum: 30 },
            reinviteWindowDays: { type: "integer", minimum: 0, maximum: 365 },
            exMemberInactivityMonths: {
              type: "integer",
              minimum: 0,
              maximum: 36,
            },
            latePurchaseWindowDays: {
              type: "integer",
              minimum: 0,
              maximum: 180,
            },
            inviteePercent: { type: "integer", minimum: 0, maximum: 50 },
            discountCapAmount: {
              type: "object",
              properties: {
                AR: { type: ["integer", "null"], minimum: 1 },
                ES: { type: ["integer", "null"], minimum: 1 },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "settings.setInvitations");
        await setInvitationSettings(fastify.db, ctx, request.body);
        return await getInvitationSettings(fastify.db, ctx, request.log);
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "set invitation settings",
        );
      }
    },
  );
};
