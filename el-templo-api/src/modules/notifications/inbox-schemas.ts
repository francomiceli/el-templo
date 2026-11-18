// Module: notifications (fase 215, plan 14)
//
// JSON Schemas de las rutas de la bandeja de la app (`/api/members/notifications`).
// fast-json-stringify descarta lo que no está declarado: cada respuesta lista TODOS
// sus campos y nada más, así que nunca salen `userId`, `tenantId` ni `refId`.
import { INBOX_PAGE_MAX } from "./inbox-rules";

export interface InboxListQuery {
  before?: string;
  limit?: number;
}

export interface InboxReadParams {
  id: number;
}

const notFoundResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["error", "message"],
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

/**
 * Regalo que acompaña a un aviso `aura_gift`: solo nombre de pila, inicial y foto.
 * Con `anonymous` (quien dio hoy está oculto o no tiene nombre) el nombre viene
 * vacío y no hay inicial ni foto.
 */
const inboxGiftSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  required: [
    "amount",
    "giverKind",
    "giverFirstName",
    "giverLastInitial",
    "giverPhotoUrl",
    "status",
    "anonymous",
  ],
  properties: {
    amount: { type: "integer" },
    anonymous: { type: "boolean" },
    giverKind: { type: "string", enum: ["alumno", "profe"] },
    giverFirstName: { type: "string" },
    giverLastInitial: { type: ["string", "null"] },
    giverPhotoUrl: { type: ["string", "null"] },
    status: { type: "string", enum: ["vigente", "anulado"] },
  },
} as const;

/** `GET /` — lista paginada. */
export const inboxListSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      before: { type: "string", pattern: "^\\d+\\.\\d+$", maxLength: 40 },
      limit: { type: "integer", minimum: 1, maximum: INBOX_PAGE_MAX },
    },
  },
  response: {
    200: {
      type: "object",
      additionalProperties: false,
      required: ["items", "nextBefore"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "kind",
              "title",
              "body",
              "route",
              "destination",
              "destinationSection",
              "whatsappText",
              "createdAt",
              "readAt",
              "gift",
            ],
            properties: {
              id: { type: "integer" },
              kind: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
              route: { type: ["string", "null"] },
              destination: { type: "string" },
              destinationSection: { type: ["string", "null"] },
              whatsappText: { type: ["string", "null"] },
              createdAt: { type: "string" },
              readAt: { type: ["string", "null"] },
              gift: inboxGiftSchema,
            },
          },
        },
        nextBefore: { type: ["string", "null"] },
      },
    },
  },
} as const;

/** `GET /unread-count`. */
export const inboxUnreadSchema = {
  response: {
    200: {
      type: "object",
      additionalProperties: false,
      required: ["count"],
      properties: {
        count: { type: "integer" },
      },
    },
  },
} as const;

/** `POST /:id/read`. */
export const inboxReadSchema = {
  params: {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: {
      id: { type: "integer", minimum: 1 },
    },
  },
  response: {
    204: { type: "null" },
    404: notFoundResponseSchema,
  },
} as const;

/** `POST /read-all`. */
export const inboxReadAllSchema = {
  response: {
    204: { type: "null" },
  },
} as const;
