/**
 * Settings API Routes
 *
 * Admin endpoints for system-wide settings management.
 * Grace period endpoints removed in Phase 61.
 * Segment threshold endpoints added in Phase 79.
 *
 * All routes require authentication and admin/owner role.
 */

import { FastifyPluginAsync } from "fastify";
import { ADMIN_ROLES } from "../shared/permissions";
import { SettingsService } from "./service";
import type { SegmentThresholds } from "../segmentation/types";

const segmentThresholdsResponseSchema = {
  type: "object",
  properties: {
    espartanoPct: { type: "integer" },
    intermitentePct: { type: "integer" },
    enRiesgoWeeks: { type: "integer" },
    ghostWeeks: { type: "integer" },
    nuevoDays: { type: "integer" },
    windowDays: { type: "integer" },
  },
} as const;

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  const settingsService = new SettingsService(fastify.db, fastify.log);

  /**
   * Guard: require admin role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso de administrador requerido",
      });
    }
  });

  // GET /api/admin/settings/segments — Get segment thresholds
  fastify.get(
    "/segments",
    {
      schema: {
        response: {
          200: segmentThresholdsResponseSchema,
        },
      },
    },
    async () => {
      return settingsService.getSegmentThresholds();
    },
  );

  // PUT /api/admin/settings/segments — Update segment thresholds
  fastify.put<{ Body: Partial<SegmentThresholds> }>(
    "/segments",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            espartanoPct: { type: "integer", minimum: 1, maximum: 100 },
            intermitentePct: { type: "integer", minimum: 1, maximum: 100 },
            enRiesgoWeeks: { type: "integer", minimum: 1 },
            ghostWeeks: { type: "integer", minimum: 1 },
            nuevoDays: { type: "integer", minimum: 1 },
            windowDays: { type: "integer", minimum: 1 },
          },
          additionalProperties: false,
        },
        response: {
          200: segmentThresholdsResponseSchema,
        },
      },
    },
    async (request) => {
      await settingsService.updateSegmentThresholds(request.body);
      return settingsService.getSegmentThresholds();
    },
  );
};
