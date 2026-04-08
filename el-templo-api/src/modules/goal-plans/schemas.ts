/**
 * Fastify JSON schemas for Goal Plans API request/response validation.
 */

import type { GoalPlanType } from "./types";

// =============================================================================
// Member Endpoints
// =============================================================================

export const getGoalPlanMetadataSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        goalPlans: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              name: { type: "string" },
              tier: { type: "string" },
              description: { type: "string" },
              zones: { type: "array", items: { type: "string" } },
              idealFor: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export const getActiveGoalPlanSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        goalPlan: {
          oneOf: [
            { type: "null" },
            {
              type: "object",
              properties: {
                goalPlanType: { type: "string" },
                isActive: { type: "boolean" },
                startedAt: { type: "string" },
              },
            },
          ],
        },
      },
    },
  },
};

export const getArchivedGoalPlansSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        goalPlans: {
          type: "array",
          items: {
            type: "object",
            properties: {
              goalPlanType: { type: "string" },
              startedAt: { type: "string" },
              archivedAt: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export const getGoalPlanStatsSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        stats: {
          oneOf: [
            { type: "null" },
            {
              type: "object",
              properties: {
                cycleWeeks: { type: "integer" },
                currentWeek: { type: "integer" },
                cycleEndDate: { type: "string" },
                totalCompletions: { type: "integer" },
                cycleComplete: { type: "boolean" },
              },
            },
          ],
        },
      },
    },
  },
};

export const getGoalPlanSessionSchema = {
  querystring: {
    type: "object",
    required: ["week", "day"],
    properties: {
      week: { type: "integer", minimum: 1, maximum: 52 },
      day: {
        type: "string",
        enum: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado"],
      },
    },
  },
  response: {
    200: {
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
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    404: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export interface GetGoalPlanSessionInput {
  week: number;
  day: string;
}

export const completeGoalPlanSchema = {
  body: {
    type: "object",
    required: ["dayId", "date", "startedAt", "blocksCompleted"],
    properties: {
      dayId: { type: "string" },
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      startedAt: { type: "string" },
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
      rpe: { type: ["integer", "null"], minimum: 1, maximum: 10 },
      notes: { type: ["string", "null"] },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        progress: {
          type: "object",
          properties: {
            goalPlanType: { type: "string" },
            isActive: { type: "boolean" },
            startedAt: { type: "string" },
          },
        },
      },
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export interface CompleteGoalPlanInput {
  dayId: string;
  date: string;
  startedAt: string;
  blocksCompleted: string[];
  exercisesCompleted?: Record<string, number[]>;
  rpe?: number | null;
  notes?: string | null;
}

// =============================================================================
// Admin Endpoints
// =============================================================================

export const generateGoalPlanSessionsSchema = {
  body: {
    type: "object",
    required: ["week", "goalPlanType"],
    properties: {
      week: { type: "integer", minimum: 1, maximum: 52 },
      goalPlanType: {
        type: "string",
        enum: [
          "tren_superior",
          "tren_inferior",
          "gluteos",
          "cuadriceps",
          "empuje",
          "traccion",
          "planche",
          "front_lever",
          "full_body",
        ],
      },
      days: {
        type: "array",
        items: {
          type: "string",
          enum: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado"],
        },
      },
      regenerate: { type: "boolean" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        generated: { type: "integer" },
        skipped: { type: "integer" },
      },
    },
    403: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export interface GenerateGoalPlanSessionsInput {
  week: number;
  goalPlanType: GoalPlanType;
  days?: string[];
  regenerate?: boolean;
}

export const getAdminGoalPlanMembersSchema = {
  querystring: {
    type: "object",
    properties: {
      search: { type: "string" },
      goalPlanType: { type: "string" },
      page: { type: "integer", minimum: 1, default: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        members: {
          type: "array",
          items: {
            type: "object",
            properties: {
              userId: { type: "integer" },
              email: { type: "string" },
              firstName: { type: ["string", "null"] },
              lastName: { type: ["string", "null"] },
              level: { type: "string" },
              branchName: { type: "string" },
              goalPlanType: { type: ["string", "null"] },
              goalPlanName: { type: ["string", "null"] },
              startedAt: { type: ["string", "null"] },
            },
          },
        },
        total: { type: "integer" },
      },
    },
  },
};

export interface GetAdminGoalPlanMembersInput {
  search?: string;
  goalPlanType?: string;
  page?: number;
  limit?: number;
}

export const getAdminGoalPlanMemberDetailSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: {
            firstName: { type: ["string", "null"] },
            lastName: { type: ["string", "null"] },
            level: { type: "string" },
            branchName: { type: "string" },
          },
        },
        active: {
          oneOf: [
            { type: "null" },
            {
              type: "object",
              properties: {
                goalPlanType: { type: "string" },
                isActive: { type: "boolean" },
                startedAt: { type: "string" },
              },
            },
          ],
        },
        archived: {
          type: "array",
          items: {
            type: "object",
            properties: {
              goalPlanType: { type: "string" },
              startedAt: { type: "string" },
              archivedAt: { type: "string" },
            },
          },
        },
        entrenamientoStats: {
          type: "object",
          properties: {
            totalSessions: { type: "integer" },
            totalDays: { type: "integer" },
            currentStreak: { type: "integer" },
          },
        },
        goalPlanStats: {
          type: "object",
          properties: {
            totalSessions: { type: "integer" },
          },
        },
        completions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dayId: { type: "string" },
              date: { type: "string" },
              goalPlanType: { type: ["string", "null"] },
              duration: { type: ["integer", "null"] },
              rpe: { type: ["integer", "null"] },
              blocksCompleted: { type: "array" },
              completedAt: { type: "string" },
            },
          },
        },
      },
    },
    404: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};
