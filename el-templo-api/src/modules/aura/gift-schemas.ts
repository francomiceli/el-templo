// Module: aura
//
// JSON Schemas de las rutas del regalo del alumno (fase 215, plan 06):
//   GET  /api/members/aura/gifts/pending     la card de hoy
//   GET  /api/members/aura/gifts/candidates  las caras de una clase
//   POST /api/members/aura/gifts             dar el regalo
//
// fast-json-stringify descarta lo que no está declarado: cada respuesta lista
// TODOS sus campos y nada más. Eso también garantiza que nunca salgan apellido,
// teléfono, email ni ids de usuario (D-08). En el body, `additionalProperties:
// false` descarta el campo de más (no da 400); un `enum` violado sí da 400.
import { COACH_GIFT_AMOUNT, GIFT_REASONS, type GiftReason } from "./gift-rules";

/** Motivos permitidos, armados desde la única lista (`GIFT_REASONS`). */
const giftReasonSchema = {
  type: "string",
  enum: GIFT_REASONS.map((reason) => reason.code),
} as const;

/** Cuerpo de un rechazo del regalo (`giftErrorBody`). */
const giftErrorResponseSchema = {
  type: "object",
  required: ["error", "message", "code"],
  additionalProperties: false,
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    code: { type: "string" },
  },
} as const;

/** Quien recibió: solo nombre de pila, inicial y foto firmada. */
const receiverViewSchema = {
  type: "object",
  required: ["firstName", "lastInitial", "photoUrl"],
  additionalProperties: false,
  properties: {
    firstName: { type: "string" },
    lastInitial: { type: ["string", "null"] },
    photoUrl: { type: ["string", "null"] },
  },
} as const;

export interface GiftCandidatesQuery {
  attendanceId: number;
}

export interface GiveGiftBody {
  attendanceId: number;
  receiverAttendanceId: number;
  reason: GiftReason;
}

/** `GET /gifts/pending`. */
export const pendingGiftsSchema = {
  response: {
    200: {
      type: "object",
      required: ["pending", "givenToday"],
      additionalProperties: false,
      properties: {
        pending: {
          type: "array",
          items: {
            type: "object",
            required: [
              "attendanceId",
              "sessionDate",
              "startTime",
              "activityName",
              "expiresOn",
            ],
            additionalProperties: false,
            properties: {
              attendanceId: { type: "integer" },
              sessionDate: { type: "string" },
              startTime: { type: "string" },
              activityName: { type: "string" },
              expiresOn: { type: "string" },
            },
          },
        },
        givenToday: {
          type: "array",
          items: {
            type: "object",
            required: ["attendanceId", "receiver", "reason"],
            additionalProperties: false,
            properties: {
              attendanceId: { type: "integer" },
              receiver: receiverViewSchema,
              reason: giftReasonSchema,
            },
          },
        },
      },
    },
  },
} as const;

/** `GET /gifts/candidates?attendanceId=`. */
export const giftCandidatesSchema = {
  querystring: {
    type: "object",
    required: ["attendanceId"],
    additionalProperties: false,
    properties: {
      attendanceId: { type: "integer", minimum: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["class", "candidates"],
      additionalProperties: false,
      properties: {
        class: {
          type: "object",
          required: ["sessionDate", "startTime", "activityName"],
          additionalProperties: false,
          properties: {
            sessionDate: { type: "string" },
            startTime: { type: "string" },
            activityName: { type: "string" },
          },
        },
        candidates: {
          type: "array",
          items: {
            type: "object",
            required: [
              "receiverAttendanceId",
              "firstName",
              "lastInitial",
              "photoUrl",
              "blockedReason",
            ],
            additionalProperties: false,
            properties: {
              receiverAttendanceId: { type: "integer" },
              firstName: { type: "string" },
              lastInitial: { type: ["string", "null"] },
              photoUrl: { type: ["string", "null"] },
              blockedReason: {
                type: ["string", "null"],
                enum: ["tope_semanal", null],
              },
            },
          },
        },
      },
    },
    403: giftErrorResponseSchema,
    404: giftErrorResponseSchema,
    409: giftErrorResponseSchema,
  },
} as const;

/** `POST /gifts`. */
export const giveGiftSchema = {
  body: {
    type: "object",
    required: ["attendanceId", "receiverAttendanceId", "reason"],
    additionalProperties: false,
    properties: {
      attendanceId: { type: "integer", minimum: 1 },
      receiverAttendanceId: { type: "integer", minimum: 1 },
      reason: giftReasonSchema,
    },
  },
  response: {
    201: {
      type: "object",
      required: ["receiverFirstName", "reason"],
      additionalProperties: false,
      properties: {
        receiverFirstName: { type: "string" },
        reason: giftReasonSchema,
      },
    },
    403: giftErrorResponseSchema,
    404: giftErrorResponseSchema,
    409: giftErrorResponseSchema,
  },
} as const;

// -----------------------------------------------------------------------------
// Rutas de admin del regalo del profe (fase 215, plan 08)
//   POST /api/admin/aura/gifts          el profe da Aura a un alumno de su clase
//   GET  /api/admin/aura/gift-settings  valor vigente del regalo del profe
//   PUT  /api/admin/aura/gift-settings  cambia el valor (solo dueño y admin)
// -----------------------------------------------------------------------------

export interface CoachGiveGiftBody {
  attendanceId: number;
  reason: GiftReason;
}

export interface GiftSettingsBody {
  coachGiftAmount: number;
}

/** `POST /gifts` (admin). El 201 solo expone el monto acreditado. */
export const coachGiveGiftSchema = {
  body: {
    type: "object",
    required: ["attendanceId", "reason"],
    additionalProperties: false,
    properties: {
      attendanceId: { type: "integer", minimum: 1 },
      reason: giftReasonSchema,
    },
  },
  response: {
    201: {
      type: "object",
      required: ["amount"],
      additionalProperties: false,
      properties: {
        amount: { type: "integer" },
      },
    },
    403: giftErrorResponseSchema,
    404: giftErrorResponseSchema,
    409: giftErrorResponseSchema,
  },
} as const;

const coachGiftAmountResponseSchema = {
  type: "object",
  required: ["coachGiftAmount"],
  additionalProperties: false,
  properties: {
    coachGiftAmount: { type: "integer" },
  },
} as const;

/** `GET /gift-settings` (admin). */
export const getGiftSettingsSchema = {
  response: {
    200: coachGiftAmountResponseSchema,
    403: giftErrorResponseSchema,
  },
} as const;

/** `PUT /gift-settings` (admin): entero de 1 a 10. */
export const putGiftSettingsSchema = {
  body: {
    type: "object",
    required: ["coachGiftAmount"],
    additionalProperties: false,
    properties: {
      coachGiftAmount: {
        type: "integer",
        minimum: COACH_GIFT_AMOUNT.min,
        maximum: COACH_GIFT_AMOUNT.max,
      },
    },
  },
  response: {
    200: coachGiftAmountResponseSchema,
    403: giftErrorResponseSchema,
  },
} as const;

/** `POST /gifts/:id/void` (admin): anula un regalo vigente. Responde 204. */
export const voidGiftSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer", minimum: 1 },
    },
  },
  response: {
    204: { type: "null" },
    403: giftErrorResponseSchema,
    404: giftErrorResponseSchema,
    409: giftErrorResponseSchema,
  },
} as const;
