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
      // Phase 104 R8: optional client-chosen view. Absent → server derives
      // default from users.current_program_enrollment_id.
      view: { type: "string", enum: ["templo", "program"] },
    },
  },
};

export interface GetDailySessionInput {
  date: string;
  level?: "alfa" | "delta" | "sigma" | "omega" | "spartan";
  view?: "templo" | "program";
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
      // WR-03 / IN-03: declare the optional memberLevel (incl. kairos) so the
      // kairos generation entry point is a typed contract instead of an
      // undeclared body property read via cast. When omitted, the handler
      // derives the level from levelGroup (back-compat preserved).
      memberLevel: {
        type: "string",
        enum: ["kairos", "alfa", "delta", "sigma", "omega", "spartan"],
      },
    },
  },
};

export interface GenerateSessionInput {
  week: number;
  day: "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado";
  levelGroup: "alfa_delta" | "sigma" | "omega";
  memberLevel?: "kairos" | "alfa" | "delta" | "sigma" | "omega" | "spartan";
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
      // Phase 104 R8: optional client-chosen view. Absent → server derives
      // default from users.current_program_enrollment_id.
      view: { type: "string", enum: ["templo", "program"] },
    },
  },
};

export interface GetWeeklySessionsInput {
  weekStart: string; // Monday date in YYYY-MM-DD format
  level?: "alfa" | "delta" | "sigma" | "omega" | "spartan";
  view?: "templo" | "program";
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
// Phase 104 R8: include `view` field alongside session payload. Sibling
// (flat) shape chosen over nesting to minimize consumer breakage — existing
// clients destructuring `dayId`, `blocks`, etc. continue to work unchanged.
export const dailySessionResponse = {
  200: {
    type: "object",
    properties: {
      ...sessionResponseSchema.properties,
      view: { type: "string", enum: ["templo", "program"] },
    },
  },
  400: errorResponseSchema,
  403: errorResponseSchema,
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
      // Phase 104 R8: tells the client which view was served.
      view: { type: "string", enum: ["templo", "program"] },
    },
  },
  403: errorResponseSchema,
  404: errorResponseSchema,
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
