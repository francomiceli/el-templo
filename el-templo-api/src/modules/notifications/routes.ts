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
import { eq, and, sql, inArray } from "drizzle-orm";
import { NotificationService } from "./service";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "./types";
import { ADMIN_ROLES, OWNER_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant, tenantWhere } from "../shared/tenant";
import * as schema from "../../db/schema";
// Attendance label values (4 bands) — single source of truth (D-01).
import type { MemberSegment } from "../segmentation/types";

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
      titleFemale: { type: "string", minLength: 1, maxLength: 200 },
      bodyFemale: { type: "string", minLength: 1 },
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
      titleFemale: { type: "string", minLength: 1, maxLength: 200 },
      bodyFemale: { type: "string", minLength: 1 },
      segmentIds: {
        type: "array",
        items: {
          type: "string",
          enum: ["optima", "regular", "alerta", "ausente"],
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
  fastify.get(
    "/admin/templates",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
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
        titleFemale: row.titleFemale,
        bodyFemale: row.bodyFemale,
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
    },
  );

  /**
   * PUT /api/notifications/admin/templates/:id — Update template (per D-13).
   * Admin can edit title, body, route, and enable/disable.
   */
  fastify.put<{
    Params: { id: number };
    Body: {
      title?: string;
      body?: string;
      titleFemale?: string;
      bodyFemale?: string;
      route?: string;
      isEnabled?: boolean;
    };
  }>(
    "/admin/templates/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...templateIdParamsSchema,
        ...updateTemplateSchema,
      },
    },
    async (request, reply) => {
      const { role } = request.user;
      if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      const { id } = request.params;
      const updates: Record<string, unknown> = {};

      if (request.body.title !== undefined) updates.title = request.body.title;
      if (request.body.body !== undefined) updates.body = request.body.body;
      if (request.body.titleFemale !== undefined)
        updates.titleFemale = request.body.titleFemale;
      if (request.body.bodyFemale !== undefined)
        updates.bodyFemale = request.body.bodyFemale;
      if (request.body.route !== undefined) updates.route = request.body.route;
      if (request.body.isEnabled !== undefined)
        updates.isEnabled = request.body.isEnabled;

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({
          error: "Solicitud invalida",
          message: "No hay campos para actualizar",
        });
      }

      const [existing] = await fastify.db
        .select({ id: schema.notificationTemplates.id })
        .from(schema.notificationTemplates)
        .where(eq(schema.notificationTemplates.id, id))
        .limit(1);

      if (!existing) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Template no encontrado" });
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
        titleFemale: updated.titleFemale,
        bodyFemale: updated.bodyFemale,
        route: updated.route,
        isEnabled: updated.isEnabled,
        sentCount: updated.sentCount,
        openedCount: updated.openedCount,
        openRate:
          updated.sentCount > 0
            ? Math.round((updated.openedCount / updated.sentCount) * 10000) /
              100
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
      titleFemale?: string;
      bodyFemale?: string;
      segmentIds: MemberSegment[];
      route?: string;
    };
  }>(
    "/admin/send-segment",
    {
      onRequest: [fastify.authenticate],
      schema: sendSegmentSchema,
    },
    async (request, reply) => {
      const { role } = request.user;
      if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      // T-173-08: `member_profiles` y `users` son tablas strict — el
      // gimnasio del staff que envía el segmento acota la audiencia (una
      // campaña de push nunca puede alcanzar a un socio de otro gimnasio).
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "notifications.sendSegment");

      const { title, body, segmentIds, route, titleFemale, bodyFemale } =
        request.body;

      // Query members in the selected segments with their gender (per D-12)
      const members = await fastify.db
        .select({
          userId: schema.memberProfiles.userId,
          gender: schema.users.gender,
        })
        .from(schema.memberProfiles)
        .innerJoin(
          schema.users,
          and(
            tenantWhere(schema.users, ctx),
            eq(schema.memberProfiles.userId, schema.users.id),
          ),
        )
        .where(
          and(
            tenantWhere(schema.memberProfiles, ctx),
            inArray(schema.memberProfiles.segment, segmentIds),
          ),
        );

      let queued = 0;

      for (const member of members) {
        // Per D-12: female gets female copy, all others get default
        const useFemale =
          member.gender === "female" && !!titleFemale && !!bodyFemale;
        const result = await service.queueAdHocNotification({
          userId: member.userId,
          title: useFemale ? titleFemale : title,
          body: useFemale ? bodyFemale : body,
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
  fastify.post(
    "/admin/seed-templates",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      if (!(OWNER_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await service.seedTemplates();
      return { success: true };
    },
  );
};
