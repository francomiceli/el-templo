/**
 * Reports API Routes
 *
 * Admin endpoints for access log, charge history, expiring memberships,
 * and inactive members reports. Each report has a data endpoint and
 * an Excel export endpoint.
 *
 * All endpoints require gestion/admin/owner role.
 */

import { FastifyPluginAsync } from "fastify";
import { Workbook } from "exceljs";
import { ReportsService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import type {
  AccessReportFilters,
  ChargeReportFilters,
  ExpiringReportFilters,
  InactiveReportFilters,
  OutstandingBalancesFilters,
  TrialConversionFilters,
} from "./types";
import {
  accessReportSchema,
  chargeReportSchema,
  expiringReportSchema,
  inactiveReportSchema,
  outstandingBalancesSchema,
  trialConversionReportSchema,
  accessExportSchema,
  chargeExportSchema,
  expiringExportSchema,
  inactiveExportSchema,
} from "./schemas";

import { CAJA_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  const reportsService = new ReportsService(fastify.db, fastify.log);

  /**
   * Guard: require gestion/admin/owner role on all routes.
   */
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

  // =========================================================================
  // Data Endpoints
  // =========================================================================

  // GET /access — Paginated access log
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      source?: "qr" | "manual";
      page?: number;
      limit?: number;
    };
  }>("/access", { schema: accessReportSchema }, async (request, reply) => {
    try {
      const filters: AccessReportFilters = {
        branchId: request.query.branchId,
        country: request.scope.country,
        dateFrom: request.query.dateFrom,
        dateTo: request.query.dateTo,
        search: request.query.search,
        source: request.query.source,
        page: request.query.page,
        limit: request.query.limit,
      };
      return await reportsService.getAccessLog(filters);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get access report");
    }
  });

  // GET /charges — Paginated charge history
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      paymentMethod?: "cash" | "transfer" | "card";
      page?: number;
      limit?: number;
    };
  }>("/charges", { schema: chargeReportSchema }, async (request, reply) => {
    try {
      const filters: ChargeReportFilters = {
        branchId: request.query.branchId,
        country: request.scope.country,
        dateFrom: request.query.dateFrom,
        dateTo: request.query.dateTo,
        search: request.query.search,
        paymentMethod: request.query.paymentMethod,
        page: request.query.page,
        limit: request.query.limit,
      };
      return await reportsService.getChargeHistory(filters);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get charges report");
    }
  });

  // GET /expiring — Expiring memberships list
  fastify.get<{
    Querystring: {
      branchId?: number;
      daysWindow?: number;
      includeExpired?: boolean;
    };
  }>("/expiring", { schema: expiringReportSchema }, async (request, reply) => {
    try {
      const filters: ExpiringReportFilters = {
        branchId: request.query.branchId,
        country: request.scope.country,
        daysWindow: request.query.daysWindow,
        includeExpired: request.query.includeExpired,
      };
      return await reportsService.getExpiringMemberships(filters);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get expiring report");
    }
  });

  // GET /inactive — Inactive members list
  fastify.get<{
    Querystring: {
      branchId?: number;
      daysThreshold?: number;
    };
  }>("/inactive", { schema: inactiveReportSchema }, async (request, reply) => {
    try {
      const filters: InactiveReportFilters = {
        branchId: request.query.branchId,
        country: request.scope.country,
        daysThreshold: request.query.daysThreshold,
      };
      return await reportsService.getInactiveMembers(filters);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get inactive report");
    }
  });

  // GET /trial-conversion — Trial→alumno conversion funnel (Phase 102-07)
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
    };
  }>(
    "/trial-conversion",
    { schema: trialConversionReportSchema },
    async (request, reply) => {
      try {
        const filters: TrialConversionFilters = {
          branchId: request.query.branchId,
          country: request.scope.country,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
        };
        return await reportsService.getTrialConversionReport(filters);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get trial conversion");
      }
    },
  );

  // GET /outstanding-balances — CAJA-03 Deudas report (Phase 109-02)
  //
  // Owner-aware country resolution mirrors GET /api/admin/finance/transactions
  // (Phase 106): non-owner is locked to request.scope.country; owner sees ALL
  // countries when ?country is absent and filters when ?country=AR|ES is set.
  // This differs from the simpler scope.country pattern used by /access etc.,
  // which always filters — owner-without-?country must see all countries here
  // because the Deudas report is the one place where multi-currency totals
  // surface (D-06).
  fastify.get<{
    Querystring: {
      branchId?: number;
      country?: "AR" | "ES";
      currency?: string;
      search?: string;
      page?: number;
      limit?: number;
    };
  }>(
    "/outstanding-balances",
    { schema: outstandingBalancesSchema },
    async (request, reply) => {
      try {
        let country: "AR" | "ES" | undefined;
        if (request.scope.isOwner) {
          country = request.query.country;
        } else {
          country = request.scope.country;
        }

        const filters: OutstandingBalancesFilters = {
          branchId: request.query.branchId,
          country,
          currency: request.query.currency,
          search: request.query.search,
          page: request.query.page,
          limit: request.query.limit,
        };
        return await reportsService.getOutstandingBalances(filters, {
          isOwner: request.scope.isOwner,
        });
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "get outstanding balances report",
        );
      }
    },
  );

  // =========================================================================
  // Export Endpoints
  // =========================================================================

  // GET /access/export — Excel export (access log)
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      source?: "qr" | "manual";
    };
  }>(
    "/access/export",
    { schema: accessExportSchema },
    async (request, reply) => {
      try {
        const filters: AccessReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
          search: request.query.search,
          source: request.query.source,
        };
        const rows = await reportsService.exportAccessLog(filters);

        const workbook = new Workbook();
        workbook.creator = "El Templo";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Accesos");

        sheet.columns = [
          { header: "Fecha/Hora", key: "checkedInAt", width: 22 },
          { header: "Miembro", key: "memberName", width: 30 },
          { header: "Sede", key: "branchName", width: 20 },
          { header: "Fuente", key: "source", width: 12 },
          { header: "Turno", key: "scheduleSlot", width: 30 },
        ];

        styleHeaderRow(sheet);

        for (const row of rows) {
          sheet.addRow({
            checkedInAt: row.checkedInAt,
            memberName: row.memberName,
            branchName: row.branchName,
            source: row.source,
            scheduleSlot: row.scheduleSlot ?? "",
          });
        }

        return sendExcelReply(workbook, reply, "reportes-accesos");
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "export access report");
      }
    },
  );

  // GET /charges/export — Excel export (charge history)
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      paymentMethod?: "cash" | "transfer" | "card";
    };
  }>(
    "/charges/export",
    { schema: chargeExportSchema },
    async (request, reply) => {
      try {
        const filters: ChargeReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
          search: request.query.search,
          paymentMethod: request.query.paymentMethod,
        };
        const rows = await reportsService.exportChargeHistory(filters);

        const workbook = new Workbook();
        workbook.creator = "El Templo";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Cobros");

        sheet.columns = [
          { header: "Fecha", key: "paymentDate", width: 15 },
          { header: "Miembro", key: "memberName", width: 30 },
          { header: "Plan", key: "planName", width: 25 },
          { header: "Monto", key: "amount", width: 12 },
          { header: "Moneda", key: "currency", width: 10 },
          { header: "Metodo", key: "paymentMethod", width: 15 },
          { header: "Registro", key: "recorderName", width: 25 },
          { header: "Estado", key: "estado", width: 12 },
        ];

        styleHeaderRow(sheet);

        for (const row of rows) {
          sheet.addRow({
            paymentDate: row.paymentDate,
            memberName: row.memberName,
            planName: row.planName,
            amount: row.amount,
            currency: row.currency,
            paymentMethod: row.paymentMethod,
            recorderName: row.recorderName,
            estado: row.voidedAt ? "ANULADO" : "Normal",
          });
        }

        return sendExcelReply(workbook, reply, "reportes-cobros");
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "export charges report");
      }
    },
  );

  // GET /expiring/export — Excel export (expiring memberships)
  fastify.get<{
    Querystring: {
      branchId?: number;
      daysWindow?: number;
      includeExpired?: boolean;
    };
  }>(
    "/expiring/export",
    { schema: expiringExportSchema },
    async (request, reply) => {
      try {
        const filters: ExpiringReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country,
          daysWindow: request.query.daysWindow,
          includeExpired: request.query.includeExpired,
        };
        const rows = await reportsService.exportExpiringMemberships(filters);

        const workbook = new Workbook();
        workbook.creator = "El Templo";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Vencimientos");

        sheet.columns = [
          { header: "Miembro", key: "memberName", width: 30 },
          { header: "Plan", key: "planName", width: 25 },
          { header: "Vence", key: "endDate", width: 15 },
          { header: "Dias restantes", key: "daysRemaining", width: 18 },
          { header: "Moneda", key: "currency", width: 10 },
          { header: "Telefono", key: "phone", width: 18 },
        ];

        styleHeaderRow(sheet);

        for (const row of rows) {
          sheet.addRow({
            memberName: row.memberName,
            planName: row.planName,
            endDate: row.endDate,
            daysRemaining: row.daysRemaining,
            currency: row.currency,
            phone: row.phone ?? "",
          });
        }

        return sendExcelReply(workbook, reply, "reportes-vencimientos");
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "export expiring report");
      }
    },
  );

  // GET /inactive/export — Excel export (inactive members)
  fastify.get<{
    Querystring: {
      branchId?: number;
      daysThreshold?: number;
    };
  }>(
    "/inactive/export",
    { schema: inactiveExportSchema },
    async (request, reply) => {
      try {
        const filters: InactiveReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country,
          daysThreshold: request.query.daysThreshold,
        };
        const rows = await reportsService.exportInactiveMembers(filters);

        const workbook = new Workbook();
        workbook.creator = "El Templo";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Inactivos");

        sheet.columns = [
          { header: "Miembro", key: "memberName", width: 30 },
          { header: "Plan", key: "planName", width: 25 },
          { header: "Ultima asistencia", key: "lastCheckIn", width: 22 },
          { header: "Dias sin ir", key: "daysSinceCheckIn", width: 15 },
          { header: "Telefono", key: "phone", width: 18 },
        ];

        styleHeaderRow(sheet);

        for (const row of rows) {
          sheet.addRow({
            memberName: row.memberName,
            planName: row.planName,
            lastCheckIn: row.lastCheckIn ?? "Sin registro",
            daysSinceCheckIn: row.daysSinceCheckIn,
            phone: row.phone ?? "",
          });
        }

        return sendExcelReply(workbook, reply, "reportes-inactivos");
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "export inactive report");
      }
    },
  );
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Style the header row with bold font and gray fill.
 */
function styleHeaderRow(sheet: ReturnType<Workbook["addWorksheet"]>): void {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };
}

/**
 * Send an Excel workbook as a binary download response.
 */
async function sendExcelReply(
  workbook: Workbook,
  reply: import("fastify").FastifyReply,
  filenamePrefix: string,
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  const today = new Date().toISOString().split("T")[0];
  const filename = `${filenamePrefix}-${today}.xlsx`;

  reply
    .header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(Buffer.from(buffer as ArrayBuffer));
}
