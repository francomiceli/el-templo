/**
 * Settings Routes — pricing rules (Phase 154, ALUM-03)
 *
 * Registered at /api/admin/settings.
 *
 * Access model (D-04): the GET is readable by ANY authenticated staff — the
 * card-surcharge value is needed by the coach PoS / admin pricing UI to compute
 * the price at the point of sale, so it is NOT owner-gated at the plugin level.
 * The WRITE (PUT) is owner-only via a per-route preHandler (OWNER_ROLES → 403):
 * only the propietario can change a pricing rule.
 */

import { FastifyPluginAsync } from "fastify";
import { SettingsService } from "./service";
import { ALL_STAFF_ROLES, OWNER_ROLES } from "../shared/permissions";
import { handleServiceError } from "../shared/error-handler";

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
};
