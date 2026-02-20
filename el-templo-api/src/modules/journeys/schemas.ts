/**
 * Fastify JSON schemas for Journey API request/response validation.
 */

import type { JourneyDuration, JourneyType } from "./types";

// =============================================================================
// Member Endpoints
// =============================================================================

export const getMetadataSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        journeys: {
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

export const getActiveJourneySchema = {
  response: {
    200: {
      type: "object",
      properties: {
        journey: {
          oneOf: [
            { type: "null" },
            {
              type: "object",
              properties: {
                journeyType: { type: "string" },
                semana20: { type: "integer" },
                semana40: { type: "integer" },
                semana60: { type: "integer" },
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

export const selectJourneySchema = {
  body: {
    type: "object",
    required: ["journeyType"],
    properties: {
      journeyType: {
        type: "string",
        enum: [
          "tren_superior",
          "tren_inferior",
          "empuje",
          "traccion",
          "planche",
          "front_lever",
        ],
      },
    },
  },
  response: {
    200: {
      type: "object",
      properties: {
        journey: {
          type: "object",
          properties: {
            journeyType: { type: "string" },
            semana20: { type: "integer" },
            semana40: { type: "integer" },
            semana60: { type: "integer" },
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

export interface SelectJourneyInput {
  journeyType: JourneyType;
}

export const getArchivedJourneysSchema = {
  response: {
    200: {
      type: "object",
      properties: {
        journeys: {
          type: "array",
          items: {
            type: "object",
            properties: {
              journeyType: { type: "string" },
              semana20: { type: "integer" },
              semana40: { type: "integer" },
              semana60: { type: "integer" },
              startedAt: { type: "string" },
              archivedAt: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export const getJourneySessionSchema = {
  querystring: {
    type: "object",
    required: ["week", "day", "duration"],
    properties: {
      week: { type: "integer", minimum: 1, maximum: 52 },
      day: {
        type: "string",
        enum: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado"],
      },
      duration: { type: "integer", enum: [20, 40, 60] },
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

export interface GetJourneySessionInput {
  week: number;
  day: string;
  duration: JourneyDuration;
}

export const completeJourneySchema = {
  body: {
    type: "object",
    required: ["dayId", "duration", "date", "startedAt", "blocksCompleted"],
    properties: {
      dayId: { type: "string" },
      duration: { type: "integer", enum: [20, 40, 60] },
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
            journeyType: { type: "string" },
            semana20: { type: "integer" },
            semana40: { type: "integer" },
            semana60: { type: "integer" },
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

export interface CompleteJourneyInput {
  dayId: string;
  duration: JourneyDuration;
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

export const generateJourneySessionsSchema = {
  body: {
    type: "object",
    required: ["week", "journeyType"],
    properties: {
      week: { type: "integer", minimum: 1, maximum: 52 },
      journeyType: {
        type: "string",
        enum: [
          "tren_superior",
          "tren_inferior",
          "empuje",
          "traccion",
          "planche",
          "front_lever",
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

export interface GenerateJourneySessionsInput {
  week: number;
  journeyType: JourneyType;
  days?: string[];
  regenerate?: boolean;
}

export const getAdminJourneyMembersSchema = {
  querystring: {
    type: "object",
    properties: {
      search: { type: "string" },
      journeyType: { type: "string" },
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
              journeyType: { type: ["string", "null"] },
              journeyName: { type: ["string", "null"] },
              semana20: { type: ["integer", "null"] },
              semana40: { type: ["integer", "null"] },
              semana60: { type: ["integer", "null"] },
              startedAt: { type: ["string", "null"] },
            },
          },
        },
        total: { type: "integer" },
      },
    },
  },
};

export interface GetAdminJourneyMembersInput {
  search?: string;
  journeyType?: string;
  page?: number;
  limit?: number;
}

export const getAdminJourneyMemberDetailSchema = {
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
                journeyType: { type: "string" },
                semana20: { type: "integer" },
                semana40: { type: "integer" },
                semana60: { type: "integer" },
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
              journeyType: { type: "string" },
              semana20: { type: "integer" },
              semana40: { type: "integer" },
              semana60: { type: "integer" },
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
        journeyStats: {
          type: "object",
          properties: {
            totalSessions: { type: "integer" },
            byDuration: {
              type: "object",
              properties: {
                d20: { type: "integer" },
                d40: { type: "integer" },
                d60: { type: "integer" },
              },
            },
          },
        },
        completions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dayId: { type: "string" },
              date: { type: "string" },
              journeyType: { type: ["string", "null"] },
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
