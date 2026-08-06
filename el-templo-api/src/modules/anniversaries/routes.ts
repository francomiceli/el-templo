/**
 * Anniversary API Routes (registradas en /api/admin/anniversaries)
 *
 * Cartelera de aniversarios de permanencia de una sede para admin/recepción.
 */
import { FastifyPluginAsync } from "fastify";
import { AnniversaryService } from "./service";
import { branchAnniversariesSchema } from "./schemas";
import { handleServiceError } from "../shared/error-handler";
import { ATTENDANCE_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { requireBranchAccess } from "../shared/branch-access";
import { assertTenant } from "../shared/tenant";
import { todayInTz } from "../shared/date-utils";

const AR_TZ = "America/Argentina/Buenos_Aires";

export const anniversaryAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new AnniversaryService(fastify.db, fastify.log);

  // Mismo guard que la lista de asistencia: staff operativo (coach, admin,
  // owner, gestión, recepción) + country scope para requireBranchAccess.
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(ATTENDANCE_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso de administrador requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // GET / — Aniversarios de hoy (y opcionalmente mañana) de una sede.
  fastify.get<{
    Querystring: { branchId: number; date?: string; includeTomorrow?: boolean };
  }>(
    "/",
    {
      schema: branchAnniversariesSchema,
      preHandler: [requireBranchAccess({ from: "query.branchId" })],
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "anniversaries.list");
        const today = request.query.date ?? todayInTz(AR_TZ);
        const anniversaries = await service.getBranchAnniversaries(
          ctx,
          request.query.branchId,
          {
            today,
            includeTomorrow: request.query.includeTomorrow ?? false,
          },
        );
        return { anniversaries };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "branch anniversaries");
      }
    },
  );
};
