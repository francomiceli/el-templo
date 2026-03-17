/**
 * Fastify JSON schemas for Settings API request/response validation.
 */

const errorSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
} as const;

const gracePeriodResponseSchema = {
  type: "object",
  properties: {
    gracePeriodDays: { type: "integer" },
  },
} as const;

export const getGracePeriodSchema = {
  response: {
    200: gracePeriodResponseSchema,
  },
};

export const updateGracePeriodSchema = {
  body: {
    type: "object",
    required: ["gracePeriodDays"],
    properties: {
      gracePeriodDays: { type: "integer", minimum: 0, maximum: 30 },
    },
  },
  response: {
    200: gracePeriodResponseSchema,
    400: errorSchema,
  },
};
