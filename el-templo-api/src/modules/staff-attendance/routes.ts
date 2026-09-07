/**
 * Rutas de staff-attendance (prefijo `/api/admin/staff-attendance`) —
 * check-in/check-out de la jornada laboral (2026-09-07).
 *
 * Dos capas de autorización, mismo patrón que `tv/control-routes.ts`:
 *   1. QUÉ rol — `STAFF_ATTENDANCE_ROLES` en el hook del plugin (excluye a
 *      propósito `tv` y `member`). `GET /shifts` exige además el rol MÁS
 *      angosto `STAFF_ATTENDANCE_REPORT_ROLES` (preHandler por-ruta).
 *   2. QUÉ sede — `canAccessBranch`/`requireBranchAccess`. En check-in/
 *      check-out la sede sale del QR (no de una ubicación fija del
 *      request), así que el chequeo vive DENTRO del service (ver
 *      `service.ts`); en `GET /shifts` la sede es un query param normal, así
 *      que usa el preHandler estándar `requireBranchAccess`.
 */

import { FastifyPluginAsync } from "fastify";
import { StaffAttendanceService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import { AppError } from "../shared/errors";
import {
  STAFF_ATTENDANCE_ROLES,
  STAFF_ATTENDANCE_REPORT_ROLES,
} from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import {
  requireBranchAccess,
  BRANCH_OUT_OF_SCOPE,
} from "../shared/branch-access";
import {
  staffAttendanceMeSchema,
  staffAttendanceCheckInSchema,
  staffAttendanceCheckOutSchema,
  staffAttendanceShiftsSchema,
  type StaffCheckInBody,
  type StaffCheckOutBody,
  type StaffShiftsQuery,
} from "./schemas";

export const staffAttendanceRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new StaffAttendanceService(fastify.db, fastify.log);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (
      !(STAFF_ATTENDANCE_ROLES as readonly string[]).includes(request.user.role)
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  /**
   * GET /me — jornada abierta del usuario (o null) + checklist de cierre.
   */
  fastify.get(
    "/me",
    { schema: staffAttendanceMeSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "staff-attendance.me");
        const result = await service.getMe(ctx, request.user.userId);
        return reply.send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "staff attendance me");
      }
    },
  );

  /**
   * POST /check-in — abre la jornada en la sede del QR escaneado.
   */
  fastify.post<{ Body: StaffCheckInBody }>(
    "/check-in",
    { schema: staffAttendanceCheckInSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "staff-attendance.checkIn");
        const shift = await service.checkIn(
          ctx,
          request.scope,
          request.user.userId,
          request.body.qrToken,
        );
        return reply.code(201).send({ shift });
      } catch (err: unknown) {
        // El default handleServiceError solo emite { error, message } — el
        // code BRANCH_OUT_OF_SCOPE se agrega acá explícitamente, mismo
        // patrón que CoverageExpiredError en scheduling/routes.ts.
        if (err instanceof AppError && err.code === BRANCH_OUT_OF_SCOPE) {
          return reply.code(403).send({
            error: "Forbidden",
            message: err.message,
            code: BRANCH_OUT_OF_SCOPE,
          });
        }
        handleServiceError(
          err,
          reply,
          request.log,
          "staff attendance check-in",
        );
      }
    },
  );

  /**
   * POST /check-out — cierra la jornada abierta; exige el QR de la MISMA
   * sede del check-in y el checklist completo.
   */
  fastify.post<{ Body: StaffCheckOutBody }>(
    "/check-out",
    { schema: staffAttendanceCheckOutSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "staff-attendance.checkOut");
        const shift = await service.checkOut(
          ctx,
          request.scope,
          request.user.userId,
          request.body.qrToken,
          request.body.checklist,
        );
        return reply.send({ shift });
      } catch (err: unknown) {
        if (err instanceof AppError && err.code === BRANCH_OUT_OF_SCOPE) {
          return reply.code(403).send({
            error: "Forbidden",
            message: err.message,
            code: BRANCH_OUT_OF_SCOPE,
          });
        }
        handleServiceError(
          err,
          reply,
          request.log,
          "staff attendance check-out",
        );
      }
    },
  );

  /**
   * GET /shifts?branchId=NN&from=YYYY-MM-DD&to=YYYY-MM-DD — registro de
   * jornadas de una sede. Rol MÁS angosto que el resto del plugin
   * (`STAFF_ATTENDANCE_REPORT_ROLES`): coach/recepcion fichan su propia
   * jornada pero no ven el registro ajeno.
   */
  fastify.get<{ Querystring: StaffShiftsQuery }>(
    "/shifts",
    {
      schema: staffAttendanceShiftsSchema,
      preHandler: [
        async (request, reply) => {
          if (
            !(STAFF_ATTENDANCE_REPORT_ROLES as readonly string[]).includes(
              request.user.role,
            )
          ) {
            return reply.code(403).send({
              error: "Acceso denegado",
              message: "Acceso requerido",
            });
          }
        },
        requireBranchAccess({ from: "query.branchId" }),
      ],
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "staff-attendance.shifts");
        const shifts = await service.listShifts(
          ctx,
          request.query.branchId,
          request.query.from,
          request.query.to,
        );
        return reply.send({ shifts });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "staff attendance shifts");
      }
    },
  );
};
