/**
 * exercise-adjustments / schemas — Phase 131 Plan 01 (ADJUST-01).
 *
 * Fastify JSON schemas for POST /api/exercise-adjustments, mirroring the
 * plain-const style of tree-progress/schemas.ts. The body carries the ORIGIN
 * exerciseId, the tap direction, and the session context (dayId/date). The
 * member is NEVER carried in the body — the handler derives member_id from
 * request.user.userId only (member-scope, D-04).
 *
 * This is the authoritative request/response DTO consumed by the player UI
 * (Plan 03) and shared with the coach view (Plan 02).
 */

export const adjustmentRequestSchema = {
  type: "object",
  required: ["exerciseId", "direction", "dayId", "date"],
  additionalProperties: false,
  properties: {
    exerciseId: { type: "number" },
    direction: { type: "string", enum: ["up", "down"] },
    dayId: { type: "string", minLength: 1, maxLength: 50 },
    date: { type: "string", minLength: 10, maxLength: 10 }, // YYYY-MM-DD
  },
} as const;

const neighborSchema = {
  type: "object",
  properties: {
    id: { type: "number" },
    name: { type: "string" },
    dificultadLineal: { type: "number" },
    contraction: { type: "string" },
    position: { type: ["string", "null"] },
  },
} as const;

export const adjustmentResponseSchema = {
  type: "object",
  properties: {
    neighbor: {
      anyOf: [neighborSchema, { type: "null" }],
    },
    message: { type: ["string", "null"] },
  },
} as const;

export const errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
  },
} as const;
