export const getSessionsSchema = {
  querystring: {
    type: 'object',
    properties: {
      week: { type: 'integer' },
      day: { type: 'string' },
      levelGroup: { type: 'string' },
      status: { type: 'string', enum: ['pending_review', 'approved', 'discarded'] },
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

export const discardSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'integer' },
    },
  },
  body: {
    type: 'object',
    properties: {
      reason: { type: 'string', maxLength: 1000 },
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
