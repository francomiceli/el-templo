export const getSessionsSchema = {
  querystring: {
    type: 'object',
    properties: {
      week: { type: 'integer' },
      day: { type: 'string' },
      levelGroup: { type: 'string' },
      status: { type: 'string', enum: ['pending_review', 'approved'] },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      sortBy: { type: 'string', enum: ['day', 'week', 'status'] },
      descending: { type: 'boolean' },
    },
  },
};

export const sessionIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer' },
    },
  },
};

export const bulkApproveSchema = {
  body: {
    type: 'object',
    required: ['ids'],
    properties: {
      ids: { type: 'array', items: { type: 'integer' }, minItems: 1 },
    },
  },
};

export const getWeekSummarySchema = {
  params: {
    type: 'object',
    required: ['week'],
    properties: {
      week: { type: 'integer' },
    },
  },
};

export const generateWeekSchema = {
  body: {
    type: 'object',
    required: ['week'],
    properties: {
      week: { type: 'integer', minimum: 1, maximum: 52 },
      days: {
        type: 'array',
        items: { type: 'string', enum: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'] },
      },
      levelGroups: {
        type: 'array',
        items: { type: 'string', enum: ['alfa_delta', 'sigma', 'omega'] },
      },
      regenerate: { type: 'boolean', default: false },
    },
  },
};

export const getBlockPoolSchema = {
  querystring: {
    type: 'object',
    required: ['route', 'memberLevel'],
    properties: {
      route: { type: 'string' },
      memberLevel: { type: 'string' },
      excludeSessionId: { type: 'integer' },
      excludeBlockId: { type: 'integer' },
    },
  },
};

export const swapBlockSchema = {
  params: {
    type: 'object',
    required: ['sessionId', 'blockId'],
    properties: {
      sessionId: { type: 'integer' },
      blockId: { type: 'integer' },
    },
  },
  body: {
    type: 'object',
    required: ['sourceBlockId'],
    properties: {
      sourceBlockId: { type: 'integer' },
    },
  },
};
