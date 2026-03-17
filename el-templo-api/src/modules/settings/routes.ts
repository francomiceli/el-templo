/**
 * Settings API Routes
 *
 * Admin endpoints for system-wide settings management.
 * Grace period endpoints removed in Phase 61.
 *
 * All routes require authentication and admin/superadmin role.
 */

import { FastifyPluginAsync } from "fastify";

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

  // Future settings endpoints will be added here
};
