/**
 * Notification API Routes
 *
 * Member endpoints: token registration, preference management, opened tracking.
 * Admin endpoints: template list/update, segment send, seed templates.
 *
 * Member: authenticated members
 * Admin CRUD: ADMIN_ROLES (admin, owner) per D-15
 * Template seeding/restore: ADMIN_ROLES (homogéneo con avisos/restore-system, 2026-09-03)
 */

import { FastifyPluginAsync } from "fastify";
import { randomBytes } from "node:crypto";
import { eq, and, sql, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { NotificationService } from "./service";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "./types";
import {
  RULE_TRIGGERS,
  findRuleTrigger,
  countAudienceForRule,
  type RuleTriggerType,
} from "./rules";
import { ADMIN_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import {
  assertTenant,
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { todayInTz } from "../shared/date-utils";
import * as schema from "../../db/schema";
// Attendance label values (4 bands) — single source of truth (D-01).
import type { MemberSegment } from "../segmentation/types";
// Fase 193 (D-01/D-04/D-05): destino curado compartido — el input de texto
// libre "route" desaparece de estas dos rutas admin; el destino se valida
// server-side contra la lista curada, nunca se acepta una ruta arbitraria.
import {
  validateDestination,
  fallbackRouteFor,
  type Destination,
} from "../communications";

const AR_TZ = "America/Argentina/Buenos_Aires";

/**
 * Pedido de Franco (2026-09-03): mismo criterio que `validateWhatsAppText`
 * (`communications/destinations.ts`) para el texto de WhatsApp — un título o
 * cuerpo de push propio tampoco puede llevar un link arbitrario.
 */
const FORBIDDEN_LINK_PATTERN = /https?:\/\//i;

function containsForbiddenLink(text: string | undefined): boolean {
  return typeof text === "string" && FORBIDDEN_LINK_PATTERN.test(text);
}

interface RuleConditionCandidate {
  triggerType: RuleTriggerType | null;
  triggerValue: number | null | undefined;
  triggerSegment: MemberSegment | null | undefined;
  scopeBranchIds: number[] | null | undefined;
  scopeCountries: string[] | null | undefined;
}

type RuleConditionValidation = { ok: true } | { ok: false; reason: string };

/**
 * Valida CONTENIDO (no solo forma) de la condición recetada de un template
 * `kind: 'custom'`: el `triggerType` existe en el catálogo (`RULE_TRIGGERS`),
 * trae `triggerValue`/`triggerSegment` según lo que ese trigger exige (y
 * NADA MÁS — un `triggerValue` en un trigger `segment_is` es tan inválido
 * como uno faltante en `plan_expires_in_days`), el valor cae dentro del
 * rango del catálogo, y las `scopeBranchIds` pertenecen al tenant (T-193-11:
 * el JSON Schema valida forma, esto valida contenido).
 */
async function validateRuleCondition(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  input: RuleConditionCandidate,
): Promise<RuleConditionValidation> {
  if (!input.triggerType) {
    return { ok: false, reason: "triggerType es requerido" };
  }
  const trigger = findRuleTrigger(input.triggerType);
  if (!trigger) {
    return { ok: false, reason: "triggerType no está en el catálogo" };
  }

  if (trigger.requiresValue) {
    if (input.triggerSegment != null) {
      return {
        ok: false,
        reason: `El trigger '${trigger.type}' no lleva triggerSegment`,
      };
    }
    if (
      input.triggerValue === null ||
      input.triggerValue === undefined ||
      !Number.isInteger(input.triggerValue)
    ) {
      return {
        ok: false,
        reason: `El trigger '${trigger.type}' requiere triggerValue (entero)`,
      };
    }
    if (
      (trigger.minValue !== undefined && input.triggerValue < trigger.minValue) ||
      (trigger.maxValue !== undefined && input.triggerValue > trigger.maxValue)
    ) {
      return {
        ok: false,
        reason: `triggerValue debe estar entre ${trigger.minValue} y ${trigger.maxValue}`,
      };
    }
  } else if (trigger.requiresSegment) {
    if (input.triggerValue != null) {
      return {
        ok: false,
        reason: `El trigger '${trigger.type}' no lleva triggerValue`,
      };
    }
    if (!input.triggerSegment) {
      return {
        ok: false,
        reason: `El trigger '${trigger.type}' requiere triggerSegment`,
      };
    }
  }

  if (input.scopeBranchIds && input.scopeBranchIds.length > 0) {
    const rows = await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          tenantWhere(schema.branches, ctx),
          inArray(schema.branches.id, input.scopeBranchIds),
        ),
      );
    const foundIds = new Set(rows.map((r) => r.id));
    const missing = input.scopeBranchIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return {
        ok: false,
        reason: `scopeBranchIds incluye sedes fuera del tenant: ${missing.join(", ")}`,
      };
    }
  }

  return { ok: true };
}

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

// Fase 193 (D-01/D-05): objeto de destino curado — reemplaza el input de
// texto libre "route". `section`/`whatsappText` no son requeridos acá porque
// su validez depende del `type` (a cargo de `validateDestination`, no del
// JSON Schema); un body viejo con `route` cae en `additionalProperties:
// false` → 400 del propio schema, nunca se ignora en silencio (T-193-21).
const destinationSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["app_section", "whatsapp_sales"] },
    section: { type: ["string", "null"] },
    whatsappText: { type: ["string", "null"] },
  },
  required: ["type"],
  additionalProperties: false,
};

// Pedido de Franco (2026-09-03): catálogo cerrado de triggers + segmentos,
// derivado en runtime de `RULE_TRIGGERS` (rules.ts) para que el JSON Schema
// nunca diverja del catálogo real — un trigger nuevo solo se agrega ahí.
const RULE_TRIGGER_TYPE_VALUES = RULE_TRIGGERS.map((t) => t.type);
const MEMBER_SEGMENT_VALUES = ["optima", "regular", "alerta", "ausente"];

/** Campos de la condición recetada, compartidos por create/update/preview. */
const ruleConditionProperties = {
  triggerType: { type: "string", enum: RULE_TRIGGER_TYPE_VALUES },
  triggerValue: { type: "integer", minimum: 0, maximum: 365 },
  triggerSegment: { type: "string", enum: MEMBER_SEGMENT_VALUES },
  // `null` explícito = "todas" (permite VACIAR un alcance ya guardado al
  // editar; omitir el campo = sin cambios). Mismo contrato que los avisos.
  scopeBranchIds: {
    type: ["array", "null"],
    items: { type: "integer" },
    minItems: 1,
  },
  scopeCountries: {
    type: ["array", "null"],
    items: { type: "string", minLength: 2, maxLength: 2 },
    minItems: 1,
  },
  cooldownDays: { type: "integer", minimum: 1, maximum: 365 },
};

const updateTemplateSchema = {
  body: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      body: { type: "string", minLength: 1 },
      titleFemale: { type: "string", minLength: 1, maxLength: 200 },
      bodyFemale: { type: "string", minLength: 1 },
      destination: destinationSchema,
      isEnabled: { type: "boolean" },
      // Solo aplican a `kind: 'custom'` — el handler rechaza con 400 si
      // vienen para un template de sistema (D-homogeneidad).
      name: { type: "string", minLength: 1, maxLength: 120 },
      ...ruleConditionProperties,
    },
    additionalProperties: false,
  },
};

const createTemplateSchema = {
  body: {
    type: "object",
    required: [
      "name",
      "category",
      "title",
      "body",
      "destination",
      "triggerType",
    ],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 120 },
      category: {
        type: "string",
        enum: [...NOTIFICATION_CATEGORIES],
      },
      title: { type: "string", minLength: 1, maxLength: 200 },
      body: { type: "string", minLength: 1 },
      titleFemale: { type: "string", minLength: 1, maxLength: 200 },
      bodyFemale: { type: "string", minLength: 1 },
      destination: destinationSchema,
      isEnabled: { type: "boolean" },
      ...ruleConditionProperties,
    },
    additionalProperties: false,
  },
};

const previewAudienceSchema = {
  body: {
    type: "object",
    required: ["triggerType"],
    properties: ruleConditionProperties,
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
    // `destination` NO es required a nivel de JSON Schema (compat con
    // callers que todavía no lo mandan, ver DEFAULT_SEND_SEGMENT_DESTINATION
    // más abajo) — pero sí se valida con `validateDestination` cuando llega,
    // y `route` desapareció de `properties` (additionalProperties:false).
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
      destination: destinationSchema,
    },
    additionalProperties: false,
  },
};

/**
 * Fase 193 (D-02): un `whatsappText` vacío/solo-espacios en el body se
 * normaliza a `null` ANTES de `validateDestination` — `validateWhatsAppText`
 * rechaza el string vacío como texto inválido, pero acá el vacío significa
 * "no elegí texto propio, usá el default global" (D-02), no un error 400.
 */
function normalizeDestinationInput(input: unknown): unknown {
  if (
    typeof input !== "object" ||
    input === null ||
    !("whatsappText" in input)
  ) {
    return input;
  }
  const candidate = input as Record<string, unknown>;
  if (
    typeof candidate.whatsappText === "string" &&
    candidate.whatsappText.trim().length === 0
  ) {
    return { ...candidate, whatsappText: null };
  }
  return input;
}

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
   *
   * T-175-03: scopeado por tenant — antes listaba los templates de TODOS los
   * gimnasios (leak cross-tenant, T-175-03-I).
   */
  fastify.get(
    "/admin/templates",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "notifications.listTemplates");

      const rows = await fastify.db
        .select()
        .from(schema.notificationTemplates)
        .where(tenantWhere(schema.notificationTemplates, ctx))
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
        // Fase 193 (D-01/D-02/D-05, deviation plan 08): el admin necesita el
        // destino curado ACTUAL para pre-cargar el selector al editar — antes
        // solo viajaba `route` (el fallback), que no alcanza para reconstruir
        // `whatsappText` ni distinguir 'programas' de 'mi_plan' (misma ruta).
        destinationType: row.destinationType,
        destinationSection: row.destinationSection,
        whatsappText: row.whatsappText,
        isEnabled: row.isEnabled,
        sentCount: row.sentCount,
        openedCount: row.openedCount,
        openRate:
          row.sentCount > 0
            ? Math.round((row.openedCount / row.sentCount) * 10000) / 100
            : 0,
        // Pedido de Franco (2026-09-03): homogeneidad sistema/propias +
        // reglas recetadas — el admin arma el label del trigger client-side
        // con su propio catálogo, así que acá viajan los valores crudos.
        kind: row.kind,
        name: row.name,
        triggerType: row.triggerType,
        triggerValue: row.triggerValue,
        triggerSegment: row.triggerSegment,
        scopeBranchIds: row.scopeBranchIds,
        scopeCountries: row.scopeCountries,
        cooldownDays: row.cooldownDays,
      }));

      return { templates };
    },
  );

  /**
   * PUT /api/notifications/admin/templates/:id — Update template (per D-13).
   *
   * Pedido de Franco (2026-09-03): homogeneidad sistema/propias — un
   * template de sistema ahora se edita COMPLETO (title/body/destino/
   * isEnabled), salvo `templateKey`/`kind` (inmutables, ni siquiera están
   * en el JSON Schema) y la condición recetada (`name`/`trigger*`/`scope*`/
   * `cooldownDays`, que no aplica: su disparador es implícito por
   * `templateKey`) — esos campos dan 400 si vienen para un `kind: 'system'`.
   * Para `kind: 'custom'` esos mismos campos SÍ son editables, con la misma
   * validación server-side que `POST /admin/templates`.
   *
   * T-175-03: scopeado por tenant — antes leía/actualizaba por PK cruda, así
   * que un admin de un gimnasio podía editar el template de OTRO (tampering
   * cross-tenant, T-175-03-E). Ahora un `id` ajeno da 404, nunca "acceso
   * denegado" (D-06).
   */
  fastify.put<{
    Params: { id: number };
    Body: {
      title?: string;
      body?: string;
      titleFemale?: string;
      bodyFemale?: string;
      destination?: unknown;
      isEnabled?: boolean;
      name?: string;
      triggerType?: string;
      triggerValue?: number;
      triggerSegment?: string;
      scopeBranchIds?: number[];
      scopeCountries?: string[];
      cooldownDays?: number;
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

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "notifications.updateTemplate");

      const { id } = request.params;

      const [existing] = await fastify.db
        .select()
        .from(schema.notificationTemplates)
        .where(
          and(
            tenantWhere(schema.notificationTemplates, ctx),
            eq(schema.notificationTemplates.id, id),
          ),
        )
        .limit(1);

      if (!existing) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Template no encontrado" });
      }

      const ruleFieldsPresent =
        request.body.name !== undefined ||
        request.body.triggerType !== undefined ||
        request.body.triggerValue !== undefined ||
        request.body.triggerSegment !== undefined ||
        request.body.scopeBranchIds !== undefined ||
        request.body.scopeCountries !== undefined ||
        request.body.cooldownDays !== undefined;

      if (existing.kind === "system" && ruleFieldsPresent) {
        return reply.code(400).send({
          error: "Solicitud invalida",
          message:
            "Un aviso de sistema no lleva condición recetada (name/trigger*/scope*/cooldownDays)",
        });
      }

      if (containsForbiddenLink(request.body.title) ||
        containsForbiddenLink(request.body.body) ||
        containsForbiddenLink(request.body.titleFemale) ||
        containsForbiddenLink(request.body.bodyFemale)) {
        return reply.code(400).send({
          error: "Solicitud invalida",
          message: "El título y el cuerpo no pueden contener links",
        });
      }

      const updates: Record<string, unknown> = {};

      if (request.body.title !== undefined) updates.title = request.body.title;
      if (request.body.body !== undefined) updates.body = request.body.body;
      if (request.body.titleFemale !== undefined)
        updates.titleFemale = request.body.titleFemale;
      if (request.body.bodyFemale !== undefined)
        updates.bodyFemale = request.body.bodyFemale;
      if (request.body.isEnabled !== undefined)
        updates.isEnabled = request.body.isEnabled;

      // Fase 193 (D-01/D-04/D-05): destino validado contra la lista curada
      // — nunca una ruta de texto libre. `route` se deriva del destino
      // (fallback para la app vieja), nunca se acepta directo del body.
      if (request.body.destination !== undefined) {
        const destinationResult = validateDestination(
          normalizeDestinationInput(request.body.destination),
        );
        if (!destinationResult.ok) {
          return reply
            .code(400)
            .send({ error: "Destino inválido", message: destinationResult.reason });
        }
        const destination: Destination = destinationResult.value;
        updates.route = fallbackRouteFor(destination);
        updates.destinationType = destination.type;
        updates.destinationSection = destination.section;
        updates.whatsappText = destination.whatsappText;
      }

      if (ruleFieldsPresent) {
        // kind === 'custom' acá (se rechazó arriba si fuera 'system').
        // El trigger resultante (nuevo o el existente si no vino en el
        // body) determina qué combinación de value/segment es válida.
        const resolvedTriggerType = (request.body.triggerType ??
          existing.triggerType) as RuleTriggerType | null;
        const validated = await validateRuleCondition(fastify.db, ctx, {
          triggerType: resolvedTriggerType,
          triggerValue:
            request.body.triggerValue !== undefined
              ? request.body.triggerValue
              : existing.triggerValue,
          triggerSegment:
            request.body.triggerSegment !== undefined
              ? (request.body.triggerSegment as MemberSegment)
              : (existing.triggerSegment as MemberSegment | null),
          scopeBranchIds:
            request.body.scopeBranchIds !== undefined
              ? request.body.scopeBranchIds
              : (existing.scopeBranchIds as number[] | null),
          scopeCountries:
            request.body.scopeCountries !== undefined
              ? request.body.scopeCountries
              : (existing.scopeCountries as string[] | null),
        });
        if (!validated.ok) {
          return reply
            .code(400)
            .send({ error: "Solicitud invalida", message: validated.reason });
        }

        if (request.body.name !== undefined) updates.name = request.body.name;
        if (request.body.triggerType !== undefined)
          updates.triggerType = request.body.triggerType;
        if (request.body.triggerValue !== undefined)
          updates.triggerValue = request.body.triggerValue;
        if (request.body.triggerSegment !== undefined)
          updates.triggerSegment = request.body.triggerSegment;
        if (request.body.scopeBranchIds !== undefined)
          updates.scopeBranchIds = request.body.scopeBranchIds;
        if (request.body.scopeCountries !== undefined)
          updates.scopeCountries = request.body.scopeCountries;
        if (request.body.cooldownDays !== undefined)
          updates.cooldownDays = request.body.cooldownDays;
      }

      if (Object.keys(updates).length === 0) {
        return reply.code(400).send({
          error: "Solicitud invalida",
          message: "No hay campos para actualizar",
        });
      }

      await fastify.db
        .update(schema.notificationTemplates)
        .set(updates)
        .where(
          and(
            tenantWhere(schema.notificationTemplates, ctx),
            eq(schema.notificationTemplates.id, id),
          ),
        );

      // Return updated template
      const [updated] = await fastify.db
        .select()
        .from(schema.notificationTemplates)
        .where(
          and(
            tenantWhere(schema.notificationTemplates, ctx),
            eq(schema.notificationTemplates.id, id),
          ),
        )
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
        // Fase 193 (deviation plan 08, ver GET /admin/templates arriba).
        destinationType: updated.destinationType,
        destinationSection: updated.destinationSection,
        whatsappText: updated.whatsappText,
        isEnabled: updated.isEnabled,
        sentCount: updated.sentCount,
        openedCount: updated.openedCount,
        openRate:
          updated.sentCount > 0
            ? Math.round((updated.openedCount / updated.sentCount) * 10000) /
              100
            : 0,
        kind: updated.kind,
        name: updated.name,
        triggerType: updated.triggerType,
        triggerValue: updated.triggerValue,
        triggerSegment: updated.triggerSegment,
        scopeBranchIds: updated.scopeBranchIds,
        scopeCountries: updated.scopeCountries,
        cooldownDays: updated.cooldownDays,
      };
    },
  );

  /**
   * POST /api/notifications/admin/templates — Crea un template propio con
   * una condición recetada (pedido de Franco, 2026-09-03). Siempre
   * `kind: 'custom'`; `templateKey` se genera server-side
   * (`custom_<16 hex>`), nunca lo elige el cliente.
   */
  fastify.post<{
    Body: {
      name: string;
      category: NotificationCategory;
      title: string;
      body: string;
      titleFemale?: string;
      bodyFemale?: string;
      destination: unknown;
      triggerType: string;
      triggerValue?: number;
      triggerSegment?: string;
      scopeBranchIds?: number[];
      scopeCountries?: string[];
      cooldownDays?: number;
      isEnabled?: boolean;
    };
  }>(
    "/admin/templates",
    {
      onRequest: [fastify.authenticate],
      schema: createTemplateSchema,
    },
    async (request, reply) => {
      const { role } = request.user;
      if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      if (
        containsForbiddenLink(request.body.title) ||
        containsForbiddenLink(request.body.body) ||
        containsForbiddenLink(request.body.titleFemale) ||
        containsForbiddenLink(request.body.bodyFemale)
      ) {
        return reply.code(400).send({
          error: "Solicitud invalida",
          message: "El título y el cuerpo no pueden contener links",
        });
      }

      const destinationResult = validateDestination(
        normalizeDestinationInput(request.body.destination),
      );
      if (!destinationResult.ok) {
        return reply
          .code(400)
          .send({ error: "Destino inválido", message: destinationResult.reason });
      }
      const destination: Destination = destinationResult.value;

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "notifications.createTemplate");

      const validated = await validateRuleCondition(fastify.db, ctx, {
        triggerType: request.body.triggerType as RuleTriggerType,
        triggerValue: request.body.triggerValue ?? null,
        triggerSegment: (request.body.triggerSegment as MemberSegment) ?? null,
        scopeBranchIds: request.body.scopeBranchIds ?? null,
        scopeCountries: request.body.scopeCountries ?? null,
      });
      if (!validated.ok) {
        return reply
          .code(400)
          .send({ error: "Solicitud invalida", message: validated.reason });
      }

      const templateKey = `custom_${randomBytes(8).toString("hex")}`;

      const [result] = await fastify.db.insert(schema.notificationTemplates).values(
        tenantValues(ctx, {
          templateKey,
          kind: "custom",
          name: request.body.name,
          category: request.body.category,
          title: request.body.title,
          body: request.body.body,
          titleFemale: request.body.titleFemale ?? null,
          bodyFemale: request.body.bodyFemale ?? null,
          route: fallbackRouteFor(destination),
          destinationType: destination.type,
          destinationSection: destination.section,
          whatsappText: destination.whatsappText,
          isEnabled: request.body.isEnabled ?? true,
          triggerType: request.body.triggerType as RuleTriggerType,
          triggerValue: request.body.triggerValue ?? null,
          triggerSegment: (request.body.triggerSegment as MemberSegment) ?? null,
          scopeBranchIds: request.body.scopeBranchIds ?? null,
          scopeCountries: request.body.scopeCountries ?? null,
          cooldownDays: request.body.cooldownDays ?? 30,
          createdBy: request.user.userId,
        }),
      );

      const insertId = Number(result.insertId);
      const [created] = await fastify.db
        .select()
        .from(schema.notificationTemplates)
        .where(
          and(
            tenantWhere(schema.notificationTemplates, ctx),
            eq(schema.notificationTemplates.id, insertId),
          ),
        )
        .limit(1);

      reply.code(201);
      return {
        id: created.id,
        templateKey: created.templateKey,
        kind: created.kind,
        name: created.name,
        category: created.category,
        title: created.title,
        body: created.body,
        titleFemale: created.titleFemale,
        bodyFemale: created.bodyFemale,
        route: created.route,
        destinationType: created.destinationType,
        destinationSection: created.destinationSection,
        whatsappText: created.whatsappText,
        isEnabled: created.isEnabled,
        triggerType: created.triggerType,
        triggerValue: created.triggerValue,
        triggerSegment: created.triggerSegment,
        scopeBranchIds: created.scopeBranchIds,
        scopeCountries: created.scopeCountries,
        cooldownDays: created.cooldownDays,
        sentCount: created.sentCount,
        openedCount: created.openedCount,
        openRate: 0,
      };
    },
  );

  /**
   * DELETE /api/notifications/admin/templates/:id — Borra CUALQUIER
   * template (homogéneo: también los de sistema, pedido de Franco
   * 2026-09-03). `pending_notifications.template_id` cae a NULL por la FK
   * `ON DELETE SET NULL` de la migración 0219 — el histórico de envíos
   * queda intacto. `NotificationService.queueNotification` ya tolera un
   * `templateKey` sin fila (log.warn + skip, nunca rompe).
   */
  fastify.delete<{ Params: { id: number } }>(
    "/admin/templates/:id",
    {
      onRequest: [fastify.authenticate],
      schema: templateIdParamsSchema,
    },
    async (request, reply) => {
      const { role } = request.user;
      if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "notifications.deleteTemplate");

      const { id } = request.params;
      const [existing] = await fastify.db
        .select({ id: schema.notificationTemplates.id })
        .from(schema.notificationTemplates)
        .where(
          and(
            tenantWhere(schema.notificationTemplates, ctx),
            eq(schema.notificationTemplates.id, id),
          ),
        )
        .limit(1);

      if (!existing) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "Template no encontrado" });
      }

      await fastify.db
        .delete(schema.notificationTemplates)
        .where(
          and(
            tenantWhere(schema.notificationTemplates, ctx),
            eq(schema.notificationTemplates.id, id),
          ),
        );

      return { success: true };
    },
  );

  /**
   * POST /api/notifications/admin/templates/preview-audience — "hoy
   * alcanzaría N socios" (pedido de Franco, 2026-09-03). Mismo shape de
   * condición que la creación, sin textos obligatorios — el editor lo llama
   * en vivo mientras arma la regla, antes de guardarla.
   */
  fastify.post<{
    Body: {
      triggerType: string;
      triggerValue?: number;
      triggerSegment?: string;
      scopeBranchIds?: number[];
      scopeCountries?: string[];
    };
  }>(
    "/admin/templates/preview-audience",
    {
      onRequest: [fastify.authenticate],
      schema: previewAudienceSchema,
    },
    async (request, reply) => {
      const { role } = request.user;
      if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(
        request.scope,
        "notifications.previewAudience",
      );

      const condition = {
        triggerType: request.body.triggerType as RuleTriggerType,
        triggerValue: request.body.triggerValue ?? null,
        triggerSegment: (request.body.triggerSegment as MemberSegment) ?? null,
        scopeBranchIds: request.body.scopeBranchIds ?? null,
        scopeCountries: request.body.scopeCountries ?? null,
      };

      const validated = await validateRuleCondition(fastify.db, ctx, condition);
      if (!validated.ok) {
        return reply
          .code(400)
          .send({ error: "Solicitud invalida", message: validated.reason });
      }

      const today = todayInTz(AR_TZ);
      const count = await countAudienceForRule(
        fastify.db,
        ctx,
        condition,
        today,
      );

      return { count };
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
      destination?: unknown;
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

      const { title, body, segmentIds, titleFemale, bodyFemale } =
        request.body;

      // Fase 193 (D-01/D-05): destino validado contra la lista curada —
      // nunca una ruta de texto libre (T-193-21). `destination` es opcional
      // a nivel de schema (compat con callers viejos que todavía no lo
      // mandan) — sin él, cae al mismo default que tenía `route` antes de
      // esta fase (mi_templo == "/mi-templo").
      const destinationResult = validateDestination(
        normalizeDestinationInput(
          request.body.destination ?? {
            type: "app_section",
            section: "mi_templo",
            whatsappText: null,
          },
        ),
      );
      if (!destinationResult.ok) {
        return reply
          .code(400)
          .send({ error: "Destino inválido", message: destinationResult.reason });
      }
      const destination: Destination = destinationResult.value;

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
        const result = await service.queueAdHocNotification(
          {
            userId: member.userId,
            title: useFemale ? titleFemale : title,
            body: useFemale ? bodyFemale : body,
            category: "anuncios",
            destination,
          },
          ctx,
        );

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
   * POST /api/notifications/admin/seed-templates — "Restaurar las del
   * sistema" (pedido de Franco, 2026-09-03): re-siembra SOLO las 16
   * plantillas de TEMPLATE_SEEDS que faltan (por ejemplo, tras un DELETE)
   * — `INSERT IGNORE` nunca pisa una fila existente, así que un título
   * editado por el admin sobrevive intacto. Owner-only for safety.
   *
   * T-175-03: siembra el catálogo del gimnasio del owner que dispara la
   * acción (antes insertaba GLOBAL con el DEFAULT 1).
   */
  fastify.post(
    "/admin/seed-templates",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "notifications.seedTemplates");

      const { inserted, keys } = await service.seedTemplates(ctx);
      return { restored: inserted, keys };
    },
  );
};
