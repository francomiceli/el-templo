/**
 * Improvement Proposals API Routes
 *
 * Dos route plugins:
 *  - improvementProposalsMemberRoutes (/api/members/improvement-proposals):
 *    prompt-status + submit para el socio.
 *  - improvementProposalsAdminRoutes (/api/admin/improvement-proposals):
 *    listado con filtros + export xlsx, solo MEMBER_LIFECYCLE_ROLES
 *    (owner/admin/gestion — mismo criterio que referidos: gestión lee,
 *    coach/recepción no).
 */

import { FastifyPluginAsync } from "fastify";
import { Workbook } from "exceljs";
import { ImprovementProposalsService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import {
  submitProposalBodySchema,
  promptStatusSchema,
  adminProposalsQuerySchema,
  adminProposalsExportQuerySchema,
} from "./schemas";
import { MEMBER_LIFECYCLE_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { styleHeaderRow, sendExcelReply } from "../shared/excel";
import type { SubmitProposalInput, AdminProposalsFilters } from "./types";

// =============================================================================
// Admin Routes (registered at /api/admin/improvement-proposals)
// =============================================================================

export const improvementProposalsAdminRoutes: FastifyPluginAsync = async (
  fastify,
) => {
  const service = new ImprovementProposalsService(fastify.db);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (
      !(MEMBER_LIFECYCLE_ROLES as readonly string[]).includes(
        request.user.role,
      )
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "No tenés permisos para ver las propuestas de mejora",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // GET / — listado paginado con filtros fecha/sucursal/keyword.
  fastify.get<{ Querystring: AdminProposalsFilters }>(
    "/",
    { schema: adminProposalsQuerySchema },
    async (request, reply) => {
      try {
        return await service.getAdminProposals(
          {
            isOwner: request.scope.isOwner,
            country: request.scope.country,
          },
          request.query,
        );
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get admin proposals");
      }
    },
  );

  // GET /export — xlsx con los mismos filtros del listado, sin paginar.
  fastify.get<{ Querystring: AdminProposalsFilters }>(
    "/export",
    { schema: adminProposalsExportQuerySchema },
    async (request, reply) => {
      try {
        const rows = await service.getExportRows(
          {
            isOwner: request.scope.isOwner,
            country: request.scope.country,
          },
          request.query,
        );

        const workbook = new Workbook();
        const sheet = workbook.addWorksheet("Propuestas");
        sheet.columns = [
          { header: "Sucursal", key: "branchName", width: 20 },
          { header: "Fecha", key: "createdAt", width: 20 },
          { header: "Propuesta", key: "proposal", width: 100 },
        ];
        for (const row of rows) {
          sheet.addRow({
            branchName: row.branchName,
            createdAt: row.createdAt.replace("T", " ").slice(0, 16),
            proposal: row.proposal,
          });
        }
        styleHeaderRow(sheet);

        await sendExcelReply(workbook, reply, "propuestas-mejora");
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "export admin proposals");
      }
    },
  );
};

// =============================================================================
// Member Routes (registered at /api/members/improvement-proposals)
// =============================================================================

export const improvementProposalsMemberRoutes: FastifyPluginAsync = async (
  fastify,
) => {
  const service = new ImprovementProposalsService(fastify.db);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
  });

  // GET /prompt-status — ¿mostrar el popup a este socio?
  fastify.get(
    "/prompt-status",
    { schema: promptStatusSchema },
    async (request, reply) => {
      try {
        const result = await service.getPromptStatus(request.user.userId);
        return reply.send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get proposal prompt");
      }
    },
  );

  // POST / — enviar una propuesta (sucursal y anti-spam server-side).
  fastify.post<{ Body: SubmitProposalInput }>(
    "/",
    { schema: submitProposalBodySchema },
    async (request, reply) => {
      try {
        await service.submitProposal(request.user.userId, request.body);
        return reply.code(201).send({ ok: true });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "submit proposal");
      }
    },
  );
};
