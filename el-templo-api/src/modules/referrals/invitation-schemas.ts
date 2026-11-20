// Módulo: referrals — JSON-schemas de las rutas de Invitaciones del socio (Fase 194-10).
//
// T-194-34: el body NO tiene `invitedUserId` ni `inviterId`: quien se activa es
// SIEMPRE el usuario del token, y `additionalProperties:false` rechaza (400)
// cualquier campo extra en vez de ignorarlo.

import type { FastifyReply, FastifyRequest } from "fastify";
import {
  renewalFollowupUpdateSchema,
  renewalNoteCreateSchema,
  type RenewalFollowupBody,
  type RenewalNoteBody,
} from "../renewals/schemas";

/** Código de invitación: alfanumérico y guion (formato `PREFIJO-XXXX`). */
const codeProperty = {
  type: "string",
  minLength: 1,
  maxLength: 24,
  pattern: "^[A-Za-z0-9-]+$",
} as const;

/** GET /invitations/eligibility?code=X[&branchId=N] */
export const invitationEligibilityQuerySchema = {
  type: "object",
  required: ["code"],
  properties: {
    code: codeProperty,
    // Sede destino elegida en el selector (socio en la sede virtual).
    branchId: { type: "integer", minimum: 1 },
  },
  additionalProperties: false,
} as const;

/** POST /invitations/activate */
export const invitationActivateBodySchema = {
  type: "object",
  required: ["code", "branchId", "phone"],
  properties: {
    code: codeProperty,
    branchId: { type: "integer", minimum: 1 },
    phone: { type: "string", minLength: 6, maxLength: 30 },
    dni: { type: ["string", "null"], maxLength: 20 },
  },
  additionalProperties: false,
} as const;

// ─── Canal asistido (Fase 194-12, D-16) ──────────────────────────────────────
//
// T-194-43: ni `createdBy` ni `voidedBy` ni `tenantId` están en el body: salen
// del JWT y del scope. Las rutas usan `rejectUnknownBodyKeys` para devolver 400
// explícito en vez de ignorarlos.

/** POST /api/admin/members/:userId/invitations — `phone` opcional (usa el guardado). */
export const assistedInvitationBodySchema = {
  type: "object",
  required: ["inviterId", "branchId"],
  properties: {
    inviterId: { type: "integer", minimum: 1 },
    branchId: { type: "integer", minimum: 1 },
    phone: { type: "string", minLength: 6, maxLength: 30 },
    dni: { type: ["string", "null"], maxLength: 20 },
  },
  additionalProperties: false,
} as const;

export const ASSISTED_INVITATION_BODY_KEYS = Object.keys(
  assistedInvitationBodySchema.properties,
);

/** POST /api/admin/members/:userId/invitations/:invitationId/void */
export const assistedVoidBodySchema = {
  type: "object",
  required: ["reason"],
  properties: {
    // 64 = columna `invitations.void_reason`.
    reason: { type: "string", minLength: 3, maxLength: 64 },
  },
  additionalProperties: false,
} as const;

export const ASSISTED_VOID_BODY_KEYS = Object.keys(
  assistedVoidBodySchema.properties,
);

/** Error con `reason` estable (lo serializa `sendInvitationError`). */
const invitationErrorResponse = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    reason: { type: "string" },
  },
} as const;

/** `invitation` de la respuesta del alta de prueba y del 201 de la ficha. */
export const activatedInvitationProperties = {
  invitationId: { type: "integer" },
  subscriptionId: { type: "integer" },
  accessExpiresOn: { type: "string" },
  classesBudget: { type: ["integer", "null"] },
  branchId: { type: "integer" },
} as const;

/** `invitationError` del alta de prueba cuando el lead se creó pero la activación falló. */
export const invitationErrorProperties = {
  reason: { type: "string" },
  message: { type: "string" },
} as const;

export const assistedActivateRouteSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: { userId: { type: "integer", minimum: 1 } },
  },
  body: assistedInvitationBodySchema,
  response: {
    201: { type: "object", properties: activatedInvitationProperties },
    400: invitationErrorResponse,
    404: invitationErrorResponse,
    409: invitationErrorResponse,
  },
} as const;

export const assistedVoidRouteSchema = {
  params: {
    type: "object",
    required: ["userId", "invitationId"],
    properties: {
      userId: { type: "integer", minimum: 1 },
      invitationId: { type: "integer", minimum: 1 },
    },
  },
  body: assistedVoidBodySchema,
  response: {
    200: {
      type: "object",
      properties: {
        invitationId: { type: "integer" },
        status: { type: "string" },
      },
    },
    400: invitationErrorResponse,
    404: invitationErrorResponse,
    409: invitationErrorResponse,
  },
} as const;

export interface AssistedInvitationBody {
  inviterId: number;
  branchId: number;
  phone?: string;
  dni?: string | null;
}

/**
 * `preValidation` que rechaza con 400 un body con claves fuera del schema.
 *
 * Fastify (ajv `removeAdditional`) DESCARTA en silencio las claves extra cuando
 * hay `additionalProperties:false`, así que sin esto un `invitedUserId` ajeno
 * terminaría ignorado con un 201 (T-194-34). Acá se rechaza explícito, ANTES
 * de que ajv las borre. Deja pasar lo que no sea un objeto: lo resuelve el schema.
 */
export function rejectUnknownBodyKeys(
  allowed: readonly string[],
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const body = request.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return;
    }
    const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
    if (unknown.length > 0) {
      await reply.code(400).send({
        error: "Solicitud invalida",
        message: `Campos no permitidos: ${unknown.join(", ")}`,
      });
    }
  };
}

export const INVITATION_ACTIVATE_BODY_KEYS = Object.keys(
  invitationActivateBodySchema.properties,
);

export interface InvitationEligibilityQuery {
  code: string;
  branchId?: number;
}

export interface InvitationActivateBody {
  code: string;
  branchId: number;
  phone: string;
  dni?: string | null;
}

// ─── Reporte y bandeja de leads del admin (Fase 194-20, D-19 / D-18) ─────────
//
// T-194-69: patrones de mes/fecha, enteros acotados y `additionalProperties:false`.
// `tenantId` no existe en el querystring: el gimnasio sale del scope del request.

const monthProperty = {
  type: "string",
  pattern: "^\\d{4}-(0[1-9]|1[0-2])$",
} as const;

const dateProperty = {
  type: "string",
  pattern: "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$",
} as const;

/** GET /api/admin/referrals/invitations/report?from=YYYY-MM&to=YYYY-MM */
export const invitationReportQuerySchema = {
  type: "object",
  properties: { from: monthProperty, to: monthProperty },
  additionalProperties: false,
} as const;

/** Etapas filtrables de la bandeja (las mismas que `LeadStage`). */
export const INVITATION_LEAD_STAGE_VALUES = [
  "invitado",
  "entrenando",
  "vencido",
  "convertido",
] as const;

/** Estados de seguimiento filtrables de la bandeja (los mismos que `InvitationFollowStatus`). */
export const INVITATION_FOLLOW_STATUS_VALUES = [
  "con_accesos",
  "para_contactar",
  "compro",
  "compro_tarde",
  "no_sigue",
] as const;

/** GET /api/admin/referrals/invitations?stage&followStatus&branchId&from&to&page&pageSize */
export const invitationLeadsQuerySchema = {
  type: "object",
  properties: {
    stage: { type: "string", enum: [...INVITATION_LEAD_STAGE_VALUES] },
    followStatus: {
      type: "string",
      enum: [...INVITATION_FOLLOW_STATUS_VALUES],
    },
    branchId: { type: "integer", minimum: 1 },
    from: dateProperty,
    to: dateProperty,
    page: { type: "integer", minimum: 1, default: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100, default: 25 },
  },
  additionalProperties: false,
} as const;

/**
 * Fila de la bandeja en la respuesta. fast-json-stringify SOLO serializa lo declarado:
 * todo campo nuevo de `InvitationLeadRow` tiene que estar acá o viaja descartado.
 */
const invitationLeadRowSchema = {
  type: "object",
  properties: {
    invitationId: { type: "integer" },
    invitee: {
      type: "object",
      properties: {
        userId: { type: "integer" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        phone: { type: ["string", "null"] },
      },
    },
    inviter: {
      type: "object",
      properties: {
        userId: { type: "integer" },
        name: { type: "string" },
      },
    },
    activatedAt: { type: "string" },
    accessesUsed: { type: ["integer", "null"] },
    accessesBudget: { type: ["integer", "null"] },
    accessExpiresOn: { type: "string" },
    branchId: { type: "integer" },
    branchName: { type: "string" },
    branchesTrained: { type: "array", items: { type: "string" } },
    stage: { type: "string", enum: [...INVITATION_LEAD_STAGE_VALUES] },
    followStatus: {
      type: "string",
      enum: [...INVITATION_FOLLOW_STATUS_VALUES],
    },
    endReason: { type: ["string", "null"], enum: ["agotados", "plazo", null] },
    endedOn: { type: ["string", "null"] },
    followup: {
      type: "object",
      properties: {
        subscriptionId: { type: ["integer", "null"] },
        manualStatus: { type: "string", enum: ["en_proceso", "no_renovo"] },
        messageCount: { type: "integer" },
        lastMessageAt: { type: ["string", "null"] },
        reasonId: { type: ["integer", "null"] },
        reasonLabel: { type: ["string", "null"] },
        reasonNote: { type: ["string", "null"] },
      },
    },
    lastNote: {
      type: ["object", "null"],
      properties: {
        content: { type: "string" },
        createdAt: { type: "string" },
        authorName: { type: ["string", "null"] },
      },
    },
    leadStatus: {
      type: ["string", "null"],
      enum: ["en_seguimiento", "ganado", "perdido", null],
    },
    channel: { type: "string", enum: ["self_service", "assisted"] },
  },
} as const;

/** Ruta GET /invitations: query validado + página tipada. */
export const invitationLeadsRouteSchema = {
  querystring: invitationLeadsQuerySchema,
  response: {
    200: {
      type: "object",
      properties: {
        rows: { type: "array", items: invitationLeadRowSchema },
        total: { type: "integer" },
        page: { type: "integer" },
        pageSize: { type: "integer" },
      },
    },
  },
} as const;

/** Ruta GET /invitations/pending-count. */
export const invitationPendingCountRouteSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        uncontacted: { type: "integer" },
        open: { type: "integer" },
        selfActivatedWithoutBooking: { type: "integer" },
      },
    },
  },
} as const;

const invitationIdParams = {
  type: "object",
  required: ["invitationId"],
  properties: { invitationId: { type: "integer", minimum: 1 } },
} as const;

/**
 * PATCH /invitations/:invitationId/followup — el MISMO cuerpo que
 * `PATCH /api/admin/renewals/:subscriptionId` (se reusa su schema: una sola definición
 * de las reglas 0-4 mensajes / manualStatus / reasonId / reasonNote). Responde la fila
 * actualizada de la bandeja. Sin schema de error: el 400 `REASON_REQUIRED` lleva `code`.
 */
export const invitationFollowupRouteSchema = {
  params: invitationIdParams,
  body: renewalFollowupUpdateSchema.body,
  response: { 200: invitationLeadRowSchema },
} as const;

/** POST /invitations/:invitationId/notes — la misma nota que `POST /api/admin/renewals/:subscriptionId/notes`. */
export const invitationNoteRouteSchema = {
  params: invitationIdParams,
  body: renewalNoteCreateSchema.body,
  response: { 201: renewalNoteCreateSchema.response[201] },
} as const;

export interface InvitationReportQuery {
  from?: string;
  to?: string;
}

export interface InvitationLeadsQuery {
  stage?: (typeof INVITATION_LEAD_STAGE_VALUES)[number];
  followStatus?: (typeof INVITATION_FOLLOW_STATUS_VALUES)[number];
  branchId?: number;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface InvitationFollowupParams {
  invitationId: number;
}

/** Mismo cuerpo que el PATCH de Renovaciones. */
export type InvitationFollowupBody = RenewalFollowupBody;

export type InvitationNoteBody = RenewalNoteBody;
