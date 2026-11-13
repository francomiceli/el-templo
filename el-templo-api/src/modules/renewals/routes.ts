/**
 * Rutas del módulo de Renovaciones (prefijo `/api/admin/renewals`), 2026-09-24.
 *
 * Guard de rol: `CAJA_ROLES` (gestion/admin_sede/admin/owner) — el mismo que
 * `reports`, que hoy genera el Excel (SPEC). Escrituras de motivos son
 * `ADMIN_ROLES`-only (owner/admin) — preHandler por-ruta más angosto, mismo
 * patrón que `staff-attendance` (`STAFF_ATTENDANCE_REPORT_ROLES` sobre
 * `GET /shifts`).
 *
 * Cambio de alcance (2026-09-24, mismo día): sin `/templates` — el negocio no
 * manda WhatsApp desde el admin, usa su CRM (Kommo). El listado expone
 * `phoneE164` para ese copy/paste (ver `service.ts`).
 */
import { FastifyPluginAsync } from "fastify";
import { RenewalsService, REASON_REQUIRED } from "./service";
import { buildRenewalsWorkbook } from "./excel";
import { sendExcelReply } from "../shared/excel";
import { handleServiceError } from "../shared/error-handler";
import { AppError } from "../shared/errors";
import { CAJA_ROLES, ADMIN_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import {
  enforceBranchScope,
  enforcedBranchIds,
  requireBranchAccess,
} from "../shared/branch-access";
import {
  renewalListSchema,
  renewalExportSchema,
  renewalFollowupUpdateSchema,
  renewalNoteCreateSchema,
  renewalReasonListSchema,
  renewalReasonCreateSchema,
  renewalReasonUpdateSchema,
  type RenewalListQuery,
  type RenewalFollowupParams,
  type RenewalFollowupBody,
  type RenewalNoteBody,
  type RenewalReasonQuery,
  type RenewalReasonCreateBody,
  type RenewalReasonParams,
  type RenewalReasonUpdateBody,
} from "./schemas";
import type { RenewalListFilters } from "./types";
import type { FastifyRequest, FastifyReply } from "fastify";

/** Preferido a un preHandler inline repetido — 403 con el mismo formato del resto del repo. */
async function requireAdminRole(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
    await reply.code(403).send({
      error: "Acceso denegado",
      message: "Acceso requerido",
    });
  }
}

/**
 * Filtros del listado desde la request — los comparten `GET /` y
 * `GET /export` para que el Excel traiga EXACTAMENTE las filas de la
 * pantalla. El país sale siempre del scope server-side, nunca de la query.
 */
function listFiltersFrom(
  request: FastifyRequest<{ Querystring: RenewalListQuery }>,
): RenewalListFilters {
  return {
    dateFrom: request.query.dateFrom,
    dateTo: request.query.dateTo,
    branchId: request.query.branchId,
    country: request.scope.country ?? undefined,
    activityType: request.query.activityType,
  };
}

/** Recorte por sede de las lecturas con `branchId` opcional en la query (listado y export). */
const listBranchScope = [
  requireBranchAccess({ from: "query.branchId", optional: true }),
  enforceBranchScope({ from: "query.branchId" }),
];

export const renewalsRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new RenewalsService(fastify.db, fastify.log);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(CAJA_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // GET / — listado + KPIs.
  fastify.get<{ Querystring: RenewalListQuery }>(
    "/",
    { schema: renewalListSchema, preHandler: listBranchScope },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "renewals.list");
        const result = await service.listRenewals(
          ctx,
          listFiltersFrom(request),
        );
        return reply.send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "list renewals");
      }
    },
  );

  // GET /export — el mismo listado + KPIs como XLSX (pedido de gestión,
  // 2026-11-12). Mismos filtros, mismo guard de rol (CAJA_ROLES) y mismo
  // recorte por sede que `GET /`: reusa `listRenewals`, así el archivo no
  // puede divergir de la pantalla. Filename: renovaciones-<YYYY-MM-DD>.xlsx.
  fastify.get<{ Querystring: RenewalListQuery }>(
    "/export",
    { schema: renewalExportSchema, preHandler: listBranchScope },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "renewals.export");
        const filters = listFiltersFrom(request);
        const result = await service.listRenewals(ctx, filters);
        const workbook = buildRenewalsWorkbook(result, filters);
        return sendExcelReply(workbook, reply, "renovaciones");
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "export renewals");
      }
    },
  );

  // PATCH /:subscriptionId — upsert del followup manual.
  fastify.patch<{ Params: RenewalFollowupParams; Body: RenewalFollowupBody }>(
    "/:subscriptionId",
    { schema: renewalFollowupUpdateSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "renewals.updateFollowup");
        const row = await service.updateFollowup(
          ctx,
          request.params.subscriptionId,
          request.body,
          {
            userId: request.user.userId,
            isOwner: request.scope.isOwner,
            country: request.scope.country,
            branchIds: enforcedBranchIds(request.scope),
          },
        );
        return reply.send(row);
      } catch (err: unknown) {
        // El default handleServiceError solo emite { error, message } — el
        // code REASON_REQUIRED se agrega acá explícitamente, mismo patrón
        // que BRANCH_OUT_OF_SCOPE en staff-attendance/routes.ts.
        if (err instanceof AppError && err.code === REASON_REQUIRED) {
          return reply.code(400).send({
            error: "Solicitud invalida",
            message: err.message,
            code: err.code,
          });
        }
        handleServiceError(err, reply, request.log, "update renewal followup");
      }
    },
  );

  // POST /:subscriptionId/notes — reusa el servicio de notas de members.
  fastify.post<{ Params: RenewalFollowupParams; Body: RenewalNoteBody }>(
    "/:subscriptionId/notes",
    { schema: renewalNoteCreateSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "renewals.addNote");
        const note = await service.addNote(
          ctx,
          request.params.subscriptionId,
          request.body.content,
          {
            userId: request.user.userId,
            isOwner: request.scope.isOwner,
            country: request.scope.country,
            branchIds: enforcedBranchIds(request.scope),
          },
        );
        return reply.code(201).send(note);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "add renewal note");
      }
    },
  );

  // GET /reasons — lectura, CAJA_ROLES.
  fastify.get<{ Querystring: RenewalReasonQuery }>(
    "/reasons",
    { schema: renewalReasonListSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "renewals.listReasons");
        const reasons = await service.listReasons(
          ctx,
          request.query.includeInactive ?? false,
        );
        return reply.send(reasons);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "list renewal reasons");
      }
    },
  );

  // POST /reasons — escritura, ADMIN_ROLES only.
  fastify.post<{ Body: RenewalReasonCreateBody }>(
    "/reasons",
    { schema: renewalReasonCreateSchema, preHandler: [requireAdminRole] },
    async (request, reply) => {
      if (reply.sent) return;
      try {
        const ctx = assertTenant(request.scope, "renewals.createReason");
        const reason = await service.createReason(ctx, request.body);
        return reply.code(201).send(reason);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "create renewal reason");
      }
    },
  );

  // PATCH /reasons/:id — escritura, ADMIN_ROLES only.
  fastify.patch<{ Params: RenewalReasonParams; Body: RenewalReasonUpdateBody }>(
    "/reasons/:id",
    { schema: renewalReasonUpdateSchema, preHandler: [requireAdminRole] },
    async (request, reply) => {
      if (reply.sent) return;
      try {
        const ctx = assertTenant(request.scope, "renewals.updateReason");
        const reason = await service.updateReason(
          ctx,
          request.params.id,
          request.body,
        );
        return reply.send(reason);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "update renewal reason");
      }
    },
  );
};
