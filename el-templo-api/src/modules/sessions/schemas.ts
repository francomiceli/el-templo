// Request/Response schemas for Session endpoints

export const getDailySessionSchema = {
  querystring: {
    type: "object",
    required: ["date"],
    properties: {
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      level: {
        type: "string",
        enum: ["alfa", "delta", "sigma", "omega", "spartan"],
      },
    },
  },
};

export interface GetDailySessionInput {
  date: string;
  level?: "alfa" | "delta" | "sigma" | "omega" | "spartan";
}

export const generateSessionSchema = {
  body: {
    type: "object",
    required: ["week", "day", "levelGroup"],
    properties: {
      week: { type: "integer", minimum: 1, maximum: 52 },
      day: {
        type: "string",
        enum: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado"],
      },
      levelGroup: { type: "string", enum: ["alfa_delta", "sigma", "omega"] },
    },
  },
};

export interface GenerateSessionInput {
  week: number;
  day: "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado";
  levelGroup: "alfa_delta" | "sigma" | "omega";
}

export const getSessionByIdSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  },
};

export interface GetSessionByIdParams {
  id: number;
}

export const getWeeklySessionsSchema = {
  querystring: {
    type: "object",
    required: ["weekStart"],
    properties: {
      weekStart: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      level: {
        type: "string",
        enum: ["alfa", "delta", "sigma", "omega", "spartan"],
      },
    },
  },
};

export interface GetWeeklySessionsInput {
  weekStart: string; // Monday date in YYYY-MM-DD format
  level?: "alfa" | "delta" | "sigma" | "omega" | "spartan";
}

// =============================================================================
// Shared Response Schemas
// =============================================================================

const sessionResponseSchema = {
  type: "object",
  properties: {
    dayId: { type: "string" },
    week: { type: "integer" },
    day: { type: "string" },
    levelGroup: { type: "string" },
    memberLevel: { type: "string" },
    blockCount: { type: "integer" },
    blocks: { type: "array" },
  },
};

const errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
  },
};

const notFoundResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
  },
};

export const sessionResponse = { 200: sessionResponseSchema };
export const sessionWithNotFound = {
  200: sessionResponseSchema,
  404: errorResponseSchema,
};
export const dailySessionResponse = {
  200: sessionResponseSchema,
  400: errorResponseSchema,
  404: notFoundResponseSchema,
};
export const generateSessionResponse = {
  200: sessionResponseSchema,
  403: errorResponseSchema,
};
export const completeSessionResponse = {
  200: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      completedSessionId: { type: "integer" },
      totalDaysTrained: { type: "integer" },
    },
  },
  400: errorResponseSchema,
  404: errorResponseSchema,
};
export const weeklySessionsResponse = {
  200: {
    type: "object",
    properties: {
      sessions: {
        type: "object",
        additionalProperties: {
          oneOf: [{ type: "null" }, sessionResponseSchema],
        },
      },
      completedDates: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
};

// =============================================================================
// Session completion types
// =============================================================================

// Session completion types

export interface CompleteSessionInput {
  dayId: string;
  date: string; // YYYY-MM-DD
  startedAt: string; // ISO 8601
  rpe: number | null; // 1-10 or null
  notes: string | null;
  blocksCompleted: string[]; // Array of block roles like ["INITIUM", "NUCLEUS", "DEUTEROS_1", "ATHLOS"]
  exercisesCompleted?: Record<string, number[]>; // Optional: { "NUCLEUS": [123, 456], ... }
}

export const completeSessionSchema = {
  body: {
    type: "object",
    required: ["dayId", "date", "startedAt", "blocksCompleted"],
    properties: {
      dayId: { type: "string" },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      startedAt: { type: "string" },
      rpe: { type: ["integer", "null"], minimum: 1, maximum: 10 },
      notes: { type: ["string", "null"] },
      blocksCompleted: {
        type: "array",
        items: { type: "string" },
      },
      exercisesCompleted: {
        type: ["object", "null"],
        additionalProperties: {
          type: "array",
          items: { type: "integer" },
        },
      },
    },
  },
};
