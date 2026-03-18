import { FastifyPluginAsync } from "fastify";
import { SpomService } from "./service";
import { ADMIN_ROLES } from "../shared/permissions";
import {
  updateSpomWeekSchema,
  exerciseQuerySchema,
  spomLookupSchema,
  type UpdateSpomWeekInput,
  type ExerciseQueryInput,
  type SpomLookupInput,
} from "./schemas";

export const spomRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new SpomService(fastify.db);

  // GET /spom/week - Get current SPOM week
  fastify.get(
    "/spom/week",
    {
      onRequest: [fastify.authenticate],
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              currentWeek: { type: "integer" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const currentWeek = await service.getCurrentWeek();
      return { currentWeek };
    },
  );

  // PUT /spom/week - Update SPOM week (admin only)
  fastify.put<{ Body: UpdateSpomWeekInput }>(
    "/spom/week",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...updateSpomWeekSchema,
        response: {
          200: {
            type: "object",
            properties: {
              currentWeek: { type: "integer" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // Check admin role
      if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const result = await service.updateCurrentWeek(request.body.week);
      return result;
    },
  );

  // GET /spom/lookup - SPOM rule lookup by week+route
  fastify.get<{ Querystring: SpomLookupInput }>(
    "/spom/lookup",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...spomLookupSchema,
        response: {
          200: {
            type: "object",
            properties: {
              intensity: { type: "integer" },
              wave: { type: "string" },
              pattern: { type: "string" },
              pattern2: { type: ["string", "null"] },
              category: { type: "string" },
            },
          },
          404: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const rule = await service.getSpomRule(request.query);
      if (!rule) {
        return reply
          .status(404)
          .send({ error: "SPOM rule not found for week/route combination" });
      }
      return {
        intensity: rule.intensity,
        wave: rule.wave,
        pattern: rule.pattern,
        pattern2: rule.pattern2,
        category: rule.category,
      };
    },
  );

  // GET /spom/exercises - Query exercises with filters
  fastify.get<{ Querystring: ExerciseQueryInput }>(
    "/spom/exercises",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...exerciseQuerySchema,
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer" },
                pattern: { type: "string" },
                category: { type: "string" },
                exercise: { type: "string" },
                effort: { type: "string" },
                level: { type: "string" },
                difficulty: { type: "integer" },
                route: { type: "string" },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const exercises = await service.queryExercises(request.query);
      return exercises;
    },
  );

  // GET /spom/tables - Get table row counts for version info
  fastify.get(
    "/spom/tables",
    {
      onRequest: [fastify.authenticate],
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const counts = await service.getTableCounts();
      return counts;
    },
  );
};
