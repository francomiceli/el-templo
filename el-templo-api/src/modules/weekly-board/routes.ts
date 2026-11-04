/**
 * Rutas del Tablero semanal de gerencia (prefijo `/api/admin/weekly-board`),
 * fase 206-06.
 *
 *   - `GET /`        la matriz de una semana (default: la en curso) con su
 *                    semana anterior, columnas por sede y Total por país.
 *   - `PUT /leads`   carga (o borra, con `null`) los leads de una sede física
 *                    para la semana en curso o la anterior (D-04, D-24).
 *
 * Guard de rol: `ADMIN_ROLES` (owner/admin). Decisión 2026-11-04: por ahora
 * el Tablero es solo de owner y admin; gestion y admin_sede (D-01/D-02) se
 * suman más adelante. El servicio ya resuelve el alcance de admin_sede (su
 * sede sola), así que abrirlo es cambiar `WEEKLY_BOARD_ROLES`. El resto de los
 * roles recibe 403.
 *
 * El GET NO usa `enforceBranchScope`: ese helper inyecta un único `branchId`
 * y está pensado para pantallas de una sola sede. El alcance del Tablero lo
 * resuelve el servicio a partir de la lista de sedes del rol: admin_sede ve su
 * sede sola (sin Total ni Online), admin/gestion su país y el owner todos los
 * países (D-27). Por eso tampoco se le pasa `?country` al servicio.
 *
 * El PUT sí pasa por `requireBranchAccess({ from: "body.branchId" })`: una
 * sede de otro país, de otra sede (admin_sede) o de otro gimnasio es 403.
 * El gimnasio sale SIEMPRE de `assertTenant(request.scope, …)`, nunca del
 * body ni del query.
 */
import type { FastifyPluginAsync } from "fastify";
import { handleServiceError } from "../shared/error-handler";
import { requireBranchAccess } from "../shared/branch-access";
import { attachCountryScope } from "../shared/country-scope";
import { ADMIN_ROLES, ADMIN_SEDE_ROLE } from "../shared/permissions";
import { assertTenant } from "../shared/tenant";
import {
  weeklyBoardGetSchema,
  weeklyBoardLeadsPutSchema,
  type WeeklyBoardLeadsBody,
  type WeeklyBoardQuery,
} from "./schemas";
import { WeeklyBoardService } from "./service";

/**
 * Audiencia del Tablero: owner y admin (2026-11-04). Para abrirlo a gestion y
 * admin_sede, usar `CAJA_ROLES` (y lo mismo en `TABLERO_ROLES` del admin). Se
 * define acá y no en `permissions.ts` para no chocar con la rama
 * `feat/oficina`, que también toca ese archivo.
 */
const WEEKLY_BOARD_ROLES = ADMIN_ROLES;

export const weeklyBoardRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new WeeklyBoardService(fastify.db, fastify.log);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (
      !(WEEKLY_BOARD_ROLES as readonly string[]).includes(request.user.role)
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // GET / — matriz de la semana pedida.
  fastify.get<{ Querystring: WeeklyBoardQuery }>(
    "/",
    { schema: weeklyBoardGetSchema },
    async (request, reply) => {
      try {
        // WR-05: fail-closed. Un admin/gestion con `users.country` corrupto
        // queda con `scope.country = null`; sin este corte, listar las sedes
        // del rol dejaría de filtrar por país. admin_sede no depende del país
        // (su alcance son sus sedes asignadas).
        if (
          !request.scope.isOwner &&
          request.scope.role !== ADMIN_SEDE_ROLE &&
          request.scope.country === null
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "Scope de país no resuelto",
          });
        }

        const ctx = assertTenant(request.scope, "weekly-board.get");
        const board = await service.getBoard(ctx, request.scope, {
          weekStart: request.query.weekStart,
        });
        return reply.send(board);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get weekly board");
      }
    },
  );

  // PUT /leads — alta, cambio o baja (leads: null) de los leads de una sede.
  fastify.put<{ Body: WeeklyBoardLeadsBody }>(
    "/leads",
    {
      schema: weeklyBoardLeadsPutSchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "weekly-board.leads");
        const result = await service.upsertLeads(
          ctx,
          request.body,
          request.user.userId,
        );
        return reply.send(result);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "upsert weekly board leads",
        );
      }
    },
  );
};
