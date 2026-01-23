// Request/Response schemas for SPOM endpoints

export const updateSpomWeekSchema = {
  body: {
    type: 'object',
    required: ['week'],
    properties: {
      week: { type: 'integer', minimum: 1, maximum: 52 }
    }
  }
};

export interface UpdateSpomWeekInput {
  week: number;
}

export const exerciseQuerySchema = {
  querystring: {
    type: 'object',
    required: ['route'],
    properties: {
      route: { type: 'string' },
      effort: { type: 'string', enum: ['CON.', 'EXC.', 'ISO.'] },
      level: { type: 'string', enum: ['alfa', 'delta', 'sigma', 'omega', 'spartan'] },
      difficulty: { type: 'integer', minimum: 1, maximum: 10 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
    }
  }
};

export interface ExerciseQueryInput {
  route: string;
  effort?: 'CON.' | 'EXC.' | 'ISO.';
  level?: 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan';
  difficulty?: number;
  limit?: number;
}

export const spomLookupSchema = {
  querystring: {
    type: 'object',
    required: ['week', 'route'],
    properties: {
      week: { type: 'integer', minimum: 1, maximum: 52 },
      route: { type: 'string' }
    }
  }
};

export interface SpomLookupInput {
  week: number;
  route: string;
}
