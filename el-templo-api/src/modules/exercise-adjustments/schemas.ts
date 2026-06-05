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
    // The neighbor's clip URL so the player renders the swapped exercise
    // in-session without a re-fetch (WR-03). Null when the catalog row has none.
    videoUrl: { type: ["string", "null"] },
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

/**
 * Coach read of a member's dominado/bajado log (Plan 02, ADJUST-04). Newest
 * first. `toExerciseName` is null only when the served-neighbor join misses
 * (defensive — a row is written only when a neighbor was resolved).
 */
const memberAdjustmentRowSchema = {
  type: "object",
  properties: {
    id: { type: "number" },
    exerciseId: { type: "number" },
    exerciseName: { type: "string" },
    toExerciseId: { type: ["number", "null"] },
    toExerciseName: { type: ["string", "null"] },
    status: { type: "string", enum: ["dominado", "bajado"] },
    dayId: { type: "string" },
    date: { type: "string" },
    createdAt: { type: "string" },
  },
} as const;

export const memberAdjustmentsResponseSchema = {
  type: "array",
  items: memberAdjustmentRowSchema,
} as const;
