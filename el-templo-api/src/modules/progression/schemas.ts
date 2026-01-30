export const progressionStatsResponseSchema = {
  type: 'object',
  properties: {
    level: {
      type: 'object',
      properties: {
        current: { type: 'string' },
        displayName: { type: 'string' },
        greekLetter: { type: 'string' },
      },
    },
    stats: {
      type: 'object',
      properties: {
        totalSessions: { type: 'number' },
        totalDaysTrained: { type: 'number' },
        sessionsThisWeek: { type: 'number' },
        currentStreak: { type: 'number' },
      },
    },
    rpeTrend: {
      type: 'object',
      properties: {
        labels: { type: 'array', items: { type: 'string' } },
        data: { type: 'array', items: { type: ['number', 'null'] } },
        averageRpe: { type: 'number' },
      },
    },
    evaluation: {
      type: 'object',
      properties: {
        eligible: { type: 'boolean' },
        averageRpeLast2Weeks: { type: ['number', 'null'] },
        pendingRequest: { type: 'boolean' },
        requestedAt: { type: ['string', 'null'] },
      },
    },
    todaySession: {
      type: ['object', 'null'],
      properties: {
        completed: { type: 'boolean' },
        rpe: { type: ['number', 'null'] },
        notes: { type: ['string', 'null'] },
        durationMinutes: { type: ['number', 'null'] },
      },
    },
  },
};

export const evaluationRequestResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    requestId: { type: 'number' },
  },
};

export const errorResponseSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
  },
};
