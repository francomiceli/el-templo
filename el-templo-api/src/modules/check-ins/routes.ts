import { FastifyPluginAsync } from "fastify";
import { CheckInService } from "./service";
import { CheckInAdminService } from "./admin-service";
import { handleServiceError } from "../shared/error-handler";
import { ADMIN_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import type { CheckInAnswer, AdminCheckInsFilters } from "./types";
import {
  submitCheckInBodySchema,
  checkInResponseSchema,
  todayCheckInResponseSchema,
  errorResponseSchema,
  adminCheckInsQuerySchema,
} from "./schemas";

export const checkInRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new CheckInService(fastify.db);

  /**
   * POST /api/check-ins
   *
   * Submit a daily check-in answer (energy, soreness, or sleep).
   * Returns 201 on success, 400 for validation errors.
   */
  fastify.post<{ Body: CheckInAnswer }>(
    "/",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: submitCheckInBodySchema,
        response: {
          201: checkInResponseSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user;
      const { questionType, value, bodyArea } = request.body;

      try {
        await service.submitAnswer(userId, { questionType, value, bodyArea });
        return reply.status(201).send({ success: true });
      } catch (err: unknown) {
        if (err instanceof Error) {
          if (err.message === "Ya respondiste esta pregunta hoy") {
            return reply.status(409).send({ error: err.message });
          }
          if (err.message === "Pregunta no disponible todavia") {
            return reply.status(403).send({ error: err.message });
          }
          return reply.status(400).send({ error: err.message });
        }
        return reply
          .status(400)
          .send({ error: "Error al registrar respuesta" });
      }
    },
  );

  /**
   * GET /api/check-ins/today
   *
   * Returns today's check-in state with any answers already submitted today.
   */
  fastify.get(
    "/today",
    {
      onRequest: [fastify.authenticate],
      schema: {
        response: {
          200: todayCheckInResponseSchema,
        },
      },
    },
    async (request) => {
      const { userId } = request.user;
      return service.getTodayState(userId);
    },
  );
};

/**
 * Vista admin del Registro del día (tab de Feedback), registrada en
 * /api/admin/check-ins. ADMIN_ROLES (admin/owner) espeja el DUENO_ROLES del
 * front: la página Feedback entera es Dueño-only, y acá se leen datos de salud
 * autorreportados (dolor, sueño) con nombre y apellido — no se abre a
 * coach/recepción.
 */
export const checkInAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new CheckInAdminService(fastify.db);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "No tenés permisos para ver el registro del día",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  fastify.get<{ Querystring: AdminCheckInsFilters }>(
    "/",
    { schema: adminCheckInsQuerySchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "check-ins.adminOverview");
        return await service.getAdminCheckIns(
          ctx,
          {
            isOwner: request.scope.isOwner,
            country: request.scope.country,
          },
          request.query,
        );
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get admin check-ins");
      }
    },
  );
};
