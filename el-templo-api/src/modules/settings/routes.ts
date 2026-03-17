/**
 * Settings API Routes
 *
 * Admin endpoints for system-wide settings management.
 * Currently supports grace period configuration.
 *
 * All routes require authentication and admin/superadmin role.
 */

import { FastifyPluginAsync } from "fastify";
import { SettingsService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import { getGracePeriodSchema, updateGracePeriodSchema } from "./schemas";

const ADMIN_ROLES = ["admin", "superadmin"];

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Guard: require admin role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!ADMIN_ROLES.includes(request.user.role)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Acceso de administrador requerido",
      });
    }
  });

  // GET /grace-period — Get current grace period setting
  fastify.get(
    "/grace-period",
    { schema: getGracePeriodSchema },
    async (request) => {
      const service = new SettingsService(fastify.db, request.log);
      const gracePeriodDays = await service.getGracePeriodDays();
      return { gracePeriodDays };
    },
  );

  // PUT /grace-period — Update grace period setting
  fastify.put<{ Body: { gracePeriodDays: number } }>(
    "/grace-period",
    { schema: updateGracePeriodSchema },
    async (request, reply) => {
      try {
        const service = new SettingsService(fastify.db, request.log);
        const gracePeriodDays = await service.setGracePeriodDays(
          request.body.gracePeriodDays,
        );
        return { gracePeriodDays };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "update grace period");
      }
    },
  );
};
