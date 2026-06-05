/**
 * JSON Schemas for Exercise Management & Video Upload Routes
 */

export const listExercisesSchema = {
  querystring: {
    type: "object" as const,
    properties: {
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 2000, default: 50 },
      search: { type: "string" },
      category: { type: "string" },
      level: {
        type: "string",
        enum: ["kairos", "alfa", "delta", "sigma", "omega", "spartan"],
      },
      route: { type: "string" },
      effort: { type: "string", enum: ["CON", "EXC", "ISO", "empty"] },
      hasVideo: { type: "boolean" },
      equipment: {
        type: "string",
        enum: ["barras", "anillas", "paralelas", "cajon", "ninguno", "empty"],
      },
    },
    additionalProperties: false,
  },
};

export const exerciseIdParamsSchema = {
  params: {
    type: "object" as const,
    required: ["exerciseId"] as const,
    properties: {
      exerciseId: { type: "integer" },
    },
  },
};

export const uploadCompleteBodySchema = {
  params: {
    type: "object" as const,
    required: ["exerciseId"] as const,
    properties: {
      exerciseId: { type: "integer" },
    },
  },
  body: {
    type: "object" as const,
    required: ["key"] as const,
    properties: {
      key: { type: "string" },
    },
    additionalProperties: false,
  },
};

export const bulkUploadUrlsBodySchema = {
  body: {
    type: "object" as const,
    required: ["exercises"] as const,
    properties: {
      exercises: {
        type: "array" as const,
        items: {
          type: "object" as const,
          required: ["exerciseId"] as const,
          properties: {
            exerciseId: { type: "integer" },
          },
          additionalProperties: false,
        },
        minItems: 1,
        maxItems: 50,
      },
    },
    additionalProperties: false,
  },
};
