/**
 * Notification API Routes
 *
 * Member endpoints: token registration, preference management, opened tracking.
 * Admin endpoints: template list/update, segment send, seed templates.
 *
 * Member: authenticated members
 * Admin CRUD: ADMIN_ROLES (admin, owner) per D-15
 * Template seeding: OWNER_ROLES (owner only)
 */

import { FastifyPluginAsync } from "fastify";
import { eq, sql, inArray } from "drizzle-orm";
import { NotificationService } from "./service";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from "./types";
import { ADMIN_ROLES, OWNER_ROLES } from "../shared/permissions";
import * as schema from "../../db/schema";

// ---- Fastify JSON Schemas for request validation ----

const registerTokenSchema = {
  body: {
    type: "object",
    required: ["token", "platform"],
    properties: {
      token: { type: "string", minLength: 10, maxLength: 500 },
      platform: { type: "string", enum: ["android", "ios"] },
    },
    additionalProperties: false,
  },
};

const getPreferencesResponseSchema = {
  200: {
    type: "object",
    properties: {
      preferences: {
        type: "object",
        properties: {
          entrenamiento: { type: "boolean" },
          programas: { type: "boolean" },
          motivacion: { type: "boolean" },
          anuncios: { type: "boolean" },
        },
      },
    },
  },
};

const updatePreferenceSchema = {
  body: {
    type: "object",
    required: ["category", "enabled"],
    properties: {
      category: {
        type: "string",
        enum: ["entrenamiento", "programas", "motivacion", "anuncios"],
      },
      enabled: { type: "boolean" },
    },
    additionalProperties: false,
  },
};

const openedParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

const successResponseSchema = {
  200: {
    type: "object",
    properties: {
      success: { type: "boolean" },
    },
  },
};

const errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
};

const templateResponseSchema = {
  type: "object",
  properties: {
    id: { type: "integer" },
    templateKey: { type: "string" },
    category: { type: "string" },
    title: { type: "string" },
    body: { type: "string" },
    route: { type: ["string", "null"] },
    isEnabled: { type: "boolean" },
    sentCount: { type: "integer" },
    openedCount: { type: "integer" },
    openRate: { type: "number" },
  },
};

const updateTemplateSchema = {
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      body: { type: "string", minLength: 1 },
      route: { type: "string", maxLength: 200 },
      isEnabled: { type: "boolean" },
    },
    additionalProperties: false,
  },
};

const templateIdParamsSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

const sendSegmentSchema = {
  body: {
    type: "object",
    required: ["title", "body", "segmentIds"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      body: { type: "string", minLength: 1 },
      segmentIds: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "nuevo_guerrero",
            "espartano",
            "intermitente",
            "en_riesgo",
            "digital_warrior",
            "ghost",
          ],
        },
        minItems: 1,
      },
      route: { type: "string", maxLength: 200 },
    },
    additionalProperties: false,
  },
};

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new NotificationService(fastify.db, fastify.log);

  // =========================================================================
  // Member Routes — Token, Preferences, Opened
  // =========================================================================

  /**
   * POST /api/notifications/token — Register or update FCM device token (per D-26).
   * Called on every app launch; backend upserts.
   */
  fastify.post<{
    Body: { token: string; platform: "android" | "ios" };
  }>(
    "/token",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...registerTokenSchema,
        response: successResponseSchema,
      },
    },
    async (request) => {
      const { userId } = request.user;
      const { token, platform } = request.body;

      await service.registerToken(userId, token, platform);
      return { success: true };
    },
  );

  /**
   * GET /api/notifications/preferences — Get member notification preferences (per D-18).
   * Returns all 4 category toggles (defaults to true for missing rows per D-19).
   */
  fastify.get(
    "/preferences",
    {
      onRequest: [fastify.authenticate],
      schema: {
        response: getPreferencesResponseSchema,
      },
    },
    async (request) => {
      const { userId } = request.user;
      const preferences = await service.getUserPreferences(userId);
      return { preferences };
    },
  );

  /**
   * PUT /api/notifications/preferences — Update a single category preference (per D-20).
   */
  fastify.put<{
    Body: { category: NotificationCategory; enabled: boolean };
  }>(
    "/preferences",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...updatePreferenceSchema,
        response: successResponseSchema,
      },
    },
    async (request) => {
      const { userId } = request.user;
      const { category, enabled } = request.body;

      await service.updatePreference(userId, category, enabled);
      return { success: true };
    },
  );

  /**
   * POST /api/notifications/:id/opened — Report notification opened (per D-32).
   * Graceful: if notification ID not found, still returns 200.
   */
  fastify.post<{ Params: { id: number } }>(
    "/:id/opened",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...openedParamsSchema,
        response: successResponseSchema,
      },
    },
    async (request) => {
      await service.recordOpened(request.params.id);
      return { success: true };
    },
  );

  // =========================================================================
  // Admin Routes — Templates, Segment Send, Seed (ADMIN_ROLES per D-15)
  // =========================================================================

  /**
   * GET /api/notifications/admin/templates — List all notification templates (per D-14).
   * Returns template data with computed openRate.
   */
  fastify.get("/admin/templates", async (request, reply) => {
    await fastify.authenticate(request, reply);
    const { role } = request.user;
    if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const rows = await fastify.db
      .select()
      .from(schema.notificationTemplates)
      .orderBy(schema.notificationTemplates.category);

    const templates = rows.map((row) => ({
      id: row.id,
      templateKey: row.templateKey,
      category: row.category,
      title: row.title,
      body: row.body,
      route: row.route,
      isEnabled: row.isEnabled,
      sentCount: row.sentCount,
      openedCount: row.openedCount,
      openRate:
        row.sentCount > 0
          ? Math.round((row.openedCount / row.sentCount) * 10000) / 100
          : 0,
    }));

    return { templates };
  });

  /**
   * PUT /api/notifications/admin/templates/:id — Update template (per D-13).
   * Admin can edit title, body, route, and enable/disable.
   */
  fastify.put<{
    Params: { id: number };
    Body: {
      title?: string;
      body?: string;
      route?: string;
      isEnabled?: boolean;
    };
  }>(
    "/admin/templates/:id",
    {
      schema: {
        ...templateIdParamsSchema,
        ...updateTemplateSchema,
      },
    },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Forbidden" });
      }

      const { id } = request.params;
      const updates: Record<string, unknown> = {};

      if (request.body.title !== undefined) updates.title = request.body.title;
      if (request.body.body !== undefined) updates.body = request.body.body;
      if (request.body.route !== undefined) updates.route = request.body.route;
      if (request.body.isEnabled !== undefined)
        updates.isEnabled = request.body.isEnabled;

      if (Object.keys(updates).length === 0) {
        return reply
          .code(400)
          .send({ error: "Bad Request", message: "No fields to update" });
      }

      const [existing] = await fastify.db
        .select({ id: schema.notificationTemplates.id })
        .from(schema.notificationTemplates)
        .where(eq(schema.notificationTemplates.id, id))
        .limit(1);

      if (!existing) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Template no encontrado" });
      }

      await fastify.db
        .update(schema.notificationTemplates)
        .set(updates)
        .where(eq(schema.notificationTemplates.id, id));

      // Return updated template
      const [updated] = await fastify.db
        .select()
        .from(schema.notificationTemplates)
        .where(eq(schema.notificationTemplates.id, id))
        .limit(1);

      return {
        id: updated.id,
        templateKey: updated.templateKey,
        category: updated.category,
        title: updated.title,
        body: updated.body,
        route: updated.route,
        isEnabled: updated.isEnabled,
        sentCount: updated.sentCount,
        openedCount: updated.openedCount,
        openRate:
          updated.sentCount > 0
            ? Math.round(
                (updated.openedCount / updated.sentCount) * 10000,
              ) / 100
            : 0,
      };
    },
  );

  /**
   * POST /api/notifications/admin/send-segment — Send notification to segment(s) (per D-14).
   * Queues ad-hoc 'anuncios' notifications for all members in selected segments.
   */
  fastify.post<{
    Body: {
      title: string;
      body: string;
      segmentIds: string[];
      route?: string;
    };
  }>(
    "/admin/send-segment",
    {
      schema: sendSegmentSchema,
    },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Forbidden" });
      }

      const { title, body, segmentIds, route } = request.body;

      // Query members in the selected segments
      const members = await fastify.db
        .select({ userId: schema.memberProfiles.userId })
        .from(schema.memberProfiles)
        .where(
          inArray(schema.memberProfiles.segment, segmentIds),
        );

      let queued = 0;

      for (const member of members) {
        const result = await service.queueAdHocNotification({
          userId: member.userId,
          title,
          body,
          category: "anuncios",
          route: route ?? "/mi-templo",
        });

        if (result !== -1) {
          queued++;
        }
      }

      request.log.info(
        { segmentIds, totalMembers: members.length, queued },
        "Segment notification send completed",
      );

      return { queued };
    },
  );

  /**
   * POST /api/notifications/admin/seed-templates — Seed initial templates.
   * Owner-only for safety. Uses INSERT IGNORE to skip existing keys.
   */
  fastify.post("/admin/seed-templates", async (request, reply) => {
    await fastify.authenticate(request, reply);
    const { role } = request.user;
    if (!(OWNER_ROLES as readonly string[]).includes(role)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    await service.seedTemplates();
    return { success: true };
  });
};
