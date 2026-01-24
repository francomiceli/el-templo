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
