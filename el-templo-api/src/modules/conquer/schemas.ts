// Módulo: conquer — JSON-schemas de rutas (Fase 201)
//
// Fastify con `additionalProperties: false` DESCARTA las claves que falten en
// el schema de respuesta: cada campo nuevo de una respuesta necesita su
// entrada acá o el serializador lo borra en silencio.
import { CONQUER_LEVELS } from "../../db/schema/conquer";

const memberStateSchema = {
  type: ["object", "null"],
  properties: {
    level: { type: ["string", "null"], enum: [...CONQUER_LEVELS, null] },
    daysCount: { type: ["integer", "null"] },
    incReps: { type: "integer" },
    incS: { type: "integer" },
    activationDate: { type: ["string", "null"] },
    blockWeek: { type: "integer" },
    cutStage: { type: "integer" },
    publishEnabled: { type: "boolean" },
    publishNoFace: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

/** Respuesta de `GET /state` y `POST /unlock-request` (alumno). */
export const conquerStateResponseSchema = {
  200: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["bloqueado", "pedido", "activo"] },
      requestedAt: { type: ["string", "null"] },
      member: memberStateSchema,
    },
    required: ["status", "requestedAt", "member"],
    additionalProperties: false,
  },
} as const;

/** `POST /unlock-request`: sin body (se tolera `{}`). */
export const unlockRequestSchema = {
  body: {
    type: ["object", "null"],
    properties: {},
    additionalProperties: false,
  },
  response: conquerStateResponseSchema,
} as const;

/** `GET /requests` (admin). */
export const unlockRequestsResponseSchema = {
  200: {
    type: "object",
    properties: {
      requests: {
        type: "array",
        items: {
          type: "object",
          properties: {
            userId: { type: "integer" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string" },
            branchName: { type: ["string", "null"] },
            requestedAt: { type: "string" },
          },
          required: [
            "userId",
            "firstName",
            "lastName",
            "email",
            "branchName",
            "requestedAt",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["requests"],
    additionalProperties: false,
  },
} as const;

/** `GET /requests/count` (admin). */
export const unlockRequestsCountResponseSchema = {
  200: {
    type: "object",
    properties: { count: { type: "integer" } },
    required: ["count"],
    additionalProperties: false,
  },
} as const;
