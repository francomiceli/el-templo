// Request/Response schemas for Session endpoints

export const getDailySessionSchema = {
  querystring: {
    type: 'object',
    required: ['date'],
    properties: {
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
    }
  }
};

export interface GetDailySessionInput {
  date: string;
}

export const generateSessionSchema = {
  body: {
    type: 'object',
    required: ['week', 'day', 'levelGroup'],
    properties: {
      week: { type: 'integer', minimum: 1, maximum: 52 },
      day: { type: 'string', enum: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] },
      levelGroup: { type: 'string', enum: ['alfa_delta', 'sigma', 'omega'] }
    }
  }
};

export interface GenerateSessionInput {
  week: number;
  day: 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado';
  levelGroup: 'alfa_delta' | 'sigma' | 'omega';
}

export const getSessionByIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer' }
    }
  }
};

export interface GetSessionByIdParams {
  id: number;
}

export const getWeeklySessionsSchema = {
  querystring: {
    type: 'object',
    required: ['weekStart'],
    properties: {
      weekStart: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
    }
  }
};

export interface GetWeeklySessionsInput {
  weekStart: string; // Monday date in YYYY-MM-DD format
}

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
    type: 'object',
    required: ['dayId', 'date', 'startedAt', 'blocksCompleted'],
    properties: {
      dayId: { type: 'string' },
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      startedAt: { type: 'string' },
      rpe: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
      notes: { type: ['string', 'null'] },
      blocksCompleted: {
        type: 'array',
        items: { type: 'string' },
      },
      exercisesCompleted: {
        type: ['object', 'null'],
        additionalProperties: {
          type: 'array',
          items: { type: 'integer' },
        },
      },
    },
  },
};
