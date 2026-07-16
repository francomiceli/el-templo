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
import { styleHeaderRow, sendExcelReply } from "../shared/excel";
import type {
  AccessReportFilters,
  AttendedFilter,
  ChargeReportFilters,
  DebtManagementStatus,
  DebtManagementUpdateInput,
  DebtPromiseFilter,
  DebtSortBy,
  ExpiredMembersFilters,
  ExpiringReportFilters,
  InactiveReportFilters,
  LeadStatusValue,
  OutstandingBalancesFilters,
  ShiftFilter,
  TrialConversionFilters,
  TrialSessionsFilters,
} from "./types";
import {
  accessReportSchema,
  chargeReportSchema,
  debtManagementPatchSchema,
  expiringReportSchema,
  expiredMembersSchema,
  inactiveReportSchema,
  outstandingBalancesSchema,
  outstandingBalancesExportSchema,
  trialConversionReportSchema,
  trialSessionsReportSchema,
  trialSessionsExportSchema,
  accessExportSchema,
  chargeExportSchema,
  expiringExportSchema,
  inactiveExportSchema,
} from "./schemas";

import { CAJA_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { requireBranchAccess } from "../shared/branch-access";

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
  }>(
    "/access",
    {
      schema: accessReportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: AccessReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
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
    },
  );

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
  }>(
    "/charges",
    {
      schema: chargeReportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: ChargeReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
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
    },
  );

  // GET /expiring — Expiring memberships list
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      daysWindow?: number;
      includeExpired?: boolean;
      includeRenewed?: boolean;
    };
  }>(
    "/expiring",
    {
      schema: expiringReportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: ExpiringReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
          daysWindow: request.query.daysWindow,
          includeExpired: request.query.includeExpired,
          includeRenewed: request.query.includeRenewed,
        };
        return await reportsService.getExpiringMemberships(filters);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get expiring report");
      }
    },
  );

  // GET /inactive — Inactive members list
  fastify.get<{
    Querystring: {
      branchId?: number;
      daysThreshold?: number;
    };
  }>(
    "/inactive",
    {
      schema: inactiveReportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: InactiveReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
          daysThreshold: request.query.daysThreshold,
        };
        return await reportsService.getInactiveMembers(filters);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get inactive report");
      }
    },
  );

  // GET /trial-conversion — Trial→alumno conversion funnel (Phase 102-07)
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
    };
  }>(
    "/trial-conversion",
    {
      schema: trialConversionReportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: TrialConversionFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
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
      status?: DebtManagementStatus;
      promise?: DebtPromiseFilter;
      registeredFrom?: string;
      registeredTo?: string;
      accruedFrom?: string;
      accruedTo?: string;
      minDaysSinceAttendance?: number;
      sortBy?: DebtSortBy;
      sortDir?: "asc" | "desc";
      page?: number;
      limit?: number;
    };
  }>(
    "/outstanding-balances",
    {
      schema: outstandingBalancesSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        // WR-05: fail-closed. attachCountryScope sets country=null for admin/
        // gestion when users.country is corrupt, relying on canAccessBranch to
        // deny afterwards. But these listings don't always go through
        // canAccessBranch (no branchId), so the `?? undefined` below would turn
        // the null into "no country filter" = see every country's debts/PII.
        // Deny explicitly for a non-owner with an unresolved scope.
        if (!request.scope.isOwner && request.scope.country === null) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "Scope de país no resuelto",
          });
        }

        let country: "AR" | "ES" | undefined;
        if (request.scope.isOwner) {
          country = request.query.country;
        } else {
          country = request.scope.country ?? undefined;
        }

        const filters: OutstandingBalancesFilters = {
          branchId: request.query.branchId,
          country,
          currency: request.query.currency,
          search: request.query.search,
          status: request.query.status,
          promise: request.query.promise,
          registeredFrom: request.query.registeredFrom,
          registeredTo: request.query.registeredTo,
          accruedFrom: request.query.accruedFrom,
          accruedTo: request.query.accruedTo,
          minDaysSinceAttendance: request.query.minDaysSinceAttendance,
          sortBy: request.query.sortBy,
          sortDir: request.query.sortDir,
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

  // GET /expired-members — "Vencidos" cohort (DEUDA-04). Renewal leads whose
  // plan expired in the last 60 days without renewing. NO role guard here: the
  // plugin-level onRequest hook already enforces CAJA_ROLES (coach → 403, D-12).
  fastify.get<{
    Querystring: {
      branchId?: number;
      country?: "AR" | "ES";
      search?: string;
      page?: number;
      limit?: number;
    };
  }>(
    "/expired-members",
    {
      schema: expiredMembersSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        // Owner-aware country resolution (mirrors GET /outstanding-balances).
        // WR-05: fail-closed. attachCountryScope sets country=null for admin/
        // gestion when users.country is corrupt, relying on canAccessBranch to
        // deny afterwards. But these listings don't always go through
        // canAccessBranch (no branchId), so the `?? undefined` below would turn
        // the null into "no country filter" = see every country's debts/PII.
        // Deny explicitly for a non-owner with an unresolved scope.
        if (!request.scope.isOwner && request.scope.country === null) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "Scope de país no resuelto",
          });
        }

        let country: "AR" | "ES" | undefined;
        if (request.scope.isOwner) {
          country = request.query.country;
        } else {
          country = request.scope.country ?? undefined;
        }

        const filters: ExpiredMembersFilters = {
          branchId: request.query.branchId,
          country,
          search: request.query.search,
          page: request.query.page,
          limit: request.query.limit,
        };
        return await reportsService.getExpiredMembers(filters, {
          isOwner: request.scope.isOwner,
        });
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "get expired members report",
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
    {
      schema: accessExportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: AccessReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
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
    {
      schema: chargeExportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: ChargeReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
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
      dateFrom?: string;
      dateTo?: string;
      daysWindow?: number;
      includeExpired?: boolean;
      includeRenewed?: boolean;
    };
  }>(
    "/expiring/export",
    {
      schema: expiringExportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: ExpiringReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
          daysWindow: request.query.daysWindow,
          includeExpired: request.query.includeExpired,
          includeRenewed: request.query.includeRenewed,
        };
        const rows = await reportsService.exportExpiringMemberships(filters);

        const workbook = new Workbook();
        workbook.creator = "El Templo";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Vencimientos");

        sheet.columns = [
          { header: "Sede", key: "branchName", width: 22 },
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
            branchName: row.branchName,
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
    {
      schema: inactiveExportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: InactiveReportFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
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

  // GET /outstanding-balances/export — CAJA-04 Deudas Excel export
  // (Phase 109-04). One row per concepto pendiente, 9 columns (D-16).
  // Owner-aware country resolution mirrors the listing endpoint above.
  // Filename: deudas-<YYYY-MM-DD>.xlsx.
  fastify.get<{
    Querystring: {
      branchId?: number;
      country?: "AR" | "ES";
      currency?: string;
      search?: string;
      status?: DebtManagementStatus;
      promise?: DebtPromiseFilter;
      registeredFrom?: string;
      registeredTo?: string;
      accruedFrom?: string;
      accruedTo?: string;
      minDaysSinceAttendance?: number;
      sortBy?: DebtSortBy;
      sortDir?: "asc" | "desc";
    };
  }>(
    "/outstanding-balances/export",
    {
      schema: outstandingBalancesExportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        // WR-05: fail-closed. attachCountryScope sets country=null for admin/
        // gestion when users.country is corrupt, relying on canAccessBranch to
        // deny afterwards. But these listings don't always go through
        // canAccessBranch (no branchId), so the `?? undefined` below would turn
        // the null into "no country filter" = see every country's debts/PII.
        // Deny explicitly for a non-owner with an unresolved scope.
        if (!request.scope.isOwner && request.scope.country === null) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "Scope de país no resuelto",
          });
        }

        let country: "AR" | "ES" | undefined;
        if (request.scope.isOwner) {
          country = request.query.country;
        } else {
          country = request.scope.country ?? undefined;
        }

        const filters: OutstandingBalancesFilters = {
          branchId: request.query.branchId,
          country,
          currency: request.query.currency,
          search: request.query.search,
          status: request.query.status,
          promise: request.query.promise,
          registeredFrom: request.query.registeredFrom,
          registeredTo: request.query.registeredTo,
          accruedFrom: request.query.accruedFrom,
          accruedTo: request.query.accruedTo,
          minDaysSinceAttendance: request.query.minDaysSinceAttendance,
          sortBy: request.query.sortBy,
          sortDir: request.query.sortDir,
        };

        const rows = await reportsService.exportOutstandingBalances(filters);

        const workbook = new Workbook();
        workbook.creator = "El Templo";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Deudas");

        // Phase 153 (DEUDA-01/02/03) adds Motivo / Período / Fecha de registro.
        // Gestión de deudas (brief §2) adds Última asistencia / Promesa /
        // Observaciones / Estado.
        sheet.columns = [
          { header: "Miembro", key: "miembro", width: 28 },
          { header: "Teléfono", key: "telefono", width: 18 },
          { header: "Plan/Concepto", key: "concepto", width: 32 },
          { header: "Motivo", key: "motivo", width: 22 },
          { header: "Período", key: "periodo", width: 20 },
          { header: "Sucursal", key: "sucursal", width: 22 },
          { header: "Monto", key: "monto", width: 14 },
          { header: "Moneda", key: "moneda", width: 10 },
          { header: "Antigüedad (días)", key: "antiguedad", width: 18 },
          { header: "Bucket", key: "bucket", width: 16 },
          { header: "Fecha devengo", key: "fechaDevengo", width: 16 },
          { header: "Fecha de registro", key: "fechaRegistro", width: 18 },
          { header: "Última asistencia", key: "ultimaAsistencia", width: 18 },
          { header: "Promesa de pago", key: "promesa", width: 16 },
          { header: "Estado", key: "estado", width: 14 },
          { header: "Observaciones", key: "observaciones", width: 40 },
          { header: "Tipo", key: "tipo", width: 18 },
        ];

        styleHeaderRow(sheet);

        for (const row of rows) {
          sheet.addRow({
            miembro: row.memberName,
            telefono: row.memberPhone ?? "",
            concepto: row.conceptLabel,
            motivo: row.reasonLabel,
            periodo: formatPeriodDDMM(row.periodStart, row.periodEnd),
            sucursal: row.branchName ?? "",
            monto: row.amount,
            moneda: row.currency,
            antiguedad: row.ageInDays,
            bucket: BUCKET_LABEL_ES[row.bucket],
            fechaDevengo: row.effectiveDate,
            fechaRegistro: row.registeredAt,
            ultimaAsistencia: row.lastAttendanceAt ?? "Nunca",
            promesa: row.promisedPaymentDate ?? "",
            estado: DEBT_STATUS_LABEL_ES[row.status],
            observaciones: row.managementNotes ?? "",
            tipo: TARGET_KIND_LABEL_ES[row.targetKind] ?? row.targetKind,
          });
        }

        return sendExcelReply(workbook, reply, "deudas");
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "export outstanding balances report",
        );
      }
    },
  );

  // PATCH /outstanding-balances/:balanceId/management — gestión de una deuda
  // (brief §2/§3): promesa de pago, observaciones y estado. Upsert parcial
  // sobre debt_management. El guard del plugin (CAJA_ROLES) deja afuera al
  // coach; el service espeja la visibilidad del listado para el non-owner
  // (solo deudas de sucursales de su país, fail-closed sin scope).
  fastify.patch<{
    Params: { balanceId: number };
    Body: DebtManagementUpdateInput;
  }>(
    "/outstanding-balances/:balanceId/management",
    { schema: debtManagementPatchSchema },
    async (request, reply) => {
      try {
        return await reportsService.updateDebtManagement(
          request.params.balanceId,
          request.body,
          {
            userId: request.user.userId,
            isOwner: request.scope.isOwner,
            country: request.scope.country,
          },
        );
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "update debt management");
      }
    },
  );

  // ============================================================================
  // Trial Sessions Report (Phase 114-05)
  // ============================================================================
  //
  // GET /trial-sessions          — paginated JSON.
  // GET /trial-sessions/export   — CSV (BOM + UTF-8 body, 10000-row hard cap).
  //
  // Both routes:
  //   - Inherit CAJA_ROLES gate + attachCountryScope from the parent plugin's
  //     onRequest hook (D-25).
  //   - Apply requireBranchAccess({ from: "query.branchId", optional: true }).
  //   - Run buildTrialSessionsFilters which:
  //     (a) builds a TrialSessionsFilters from the query,
  //     (b) silently strips `gestionaUserId` when caller is NOT owner (D-44).

  type TrialSessionsQuery = {
    branchId?: number;
    country?: "AR" | "ES";
    dateFrom?: string;
    dateTo?: string;
    leadStatus?: LeadStatusValue | LeadStatusValue[];
    leadStatusSource?: "auto" | "manual";
    attended?: AttendedFilter;
    shift?: ShiftFilter;
    gestionaUserId?: number;
    daysWithoutConvertingMin?: number;
    search?: string;
    page?: number;
    limit?: number;
  };

  fastify.get<{ Querystring: TrialSessionsQuery }>(
    "/trial-sessions",
    {
      schema: trialSessionsReportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters = buildTrialSessionsFilters(request);
        return await reportsService.getTrialSessionsReport(filters);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "get trial sessions report",
        );
      }
    },
  );

  fastify.get<{ Querystring: TrialSessionsQuery }>(
    "/trial-sessions/export",
    {
      schema: trialSessionsExportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters = buildTrialSessionsFilters(request);
        const csv = await reportsService.exportTrialSessions(filters);

        const today = new Date().toISOString().split("T")[0];
        // The leading "\uFEFF" is the UTF-8 BOM (U+FEFF). Excel requires it to
        // auto-detect UTF-8 in CSVs. We type the SIX-character JS escape — the
        // literal invisible byte is forbidden in source per the plan policy.
        reply
          .header("Content-Type", "text/csv; charset=utf-8")
          .header(
            "Content-Disposition",
            `attachment; filename="sesiones-de-prueba-${today}.csv"`,
          )
          .send("\uFEFF" + csv);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "export trial sessions report",
        );
      }
    },
  );
};

// =============================================================================
// Phase 109-04 D-16 — Spanish label maps for Deudas Excel export
// =============================================================================
//
// Mirror of admin frontend labels (DeudasReport.vue). Duplicated inline here
// per Phase 109-03 precedent — promote to shared module if a 4th consumer
// surfaces. Bucket label keeps "días" lowercased to match D-01 UI strings.
const BUCKET_LABEL_ES: Record<"0-5" | "6-10" | "11-15" | "15+", string> = {
  "0-5": "Hasta 5 días",
  "6-10": "6-10 días",
  "11-15": "11-15 días",
  "15+": "15+ días",
};

const TARGET_KIND_LABEL_ES: Record<string, string> = {
  subscription: "Plan",
  debt_balance: "Saldo a regularizar",
};

const DEBT_STATUS_LABEL_ES: Record<DebtManagementStatus, string> = {
  activa: "Activa",
  cobrada: "Cobrada",
  incobrable: "Incobrable",
};

/**
 * Phase 153 (DEUDA-03) — format a plan cycle period as "dd/mm–dd/mm" for the
 * Excel export. Returns "—" when there is no period (debt_balance rows). When
 * only a start date is present (subscription with null end_date) it renders
 * just the start "dd/mm".
 */
function formatPeriodDDMM(
  periodStart: string | null,
  periodEnd: string | null,
): string {
  if (periodStart === null) return "—";
  const ddmm = (iso: string): string => {
    const [, m, d] = iso.split("-");
    return `${d}/${m}`;
  };
  if (periodEnd === null) return ddmm(periodStart);
  return `${ddmm(periodStart)}–${ddmm(periodEnd)}`;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Phase 114-05 — build TrialSessionsFilters from the request, applying the
 * D-44 silent strip on `gestionaUserId` for non-owners.
 *
 * D-44: the "Gestiona" filter is owner-only. When a non-owner sends
 * `?gestionaUserId=...`, the server SILENTLY ignores the parameter (with a
 * `request.log.warn` for observability). We deliberately do NOT 403 — that
 * would leak the existence of an owner-only filter to non-owners. The UI
 * also hides the filter for non-owners (Plan 06), so reaching the server
 * with this param signals a tampered client.
 *
 * `leadStatus` arrives as either a single string OR an array (AJV `anyOf`
 * in the schema; see schemas.ts). Normalize to a non-empty array here so
 * the service sees a uniform shape.
 *
 * `country` is sourced from `request.scope.country` (set by attachCountryScope
 * on the parent plugin), NOT from `request.query.country` — the country-scope
 * hook is the single source of truth and already honors the owner toggle.
 */
function buildTrialSessionsFilters(
  request: import("fastify").FastifyRequest<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      leadStatus?:
        | "en_seguimiento"
        | "ganado"
        | "perdido"
        | Array<"en_seguimiento" | "ganado" | "perdido">;
      attended?: "true" | "false" | "pending";
      shift?: "TM" | "TT";
      gestionaUserId?: number;
      daysWithoutConvertingMin?: number;
      search?: string;
      leadStatusSource?: "auto" | "manual";
      page?: number;
      limit?: number;
    };
  }>,
): TrialSessionsFilters {
  const q = request.query;

  // D-44 silent strip: defense-in-depth at the server. The route trusts only
  // the JWT-derived role (request.user.role), never the client-asserted role.
  let gestionaUserId: number | undefined = q.gestionaUserId;
  if (gestionaUserId !== undefined && request.user.role !== "owner") {
    request.log.warn(
      {
        userId: request.user.userId,
        role: request.user.role,
        attemptedFilter: gestionaUserId,
      },
      "gestionaUserId filter ignored: owner-only",
    );
    gestionaUserId = undefined;
  }

  // Normalize leadStatus: AJV `anyOf` allows either a single string or an
  // array. The service expects an array (or undefined).
  let leadStatus: Array<"en_seguimiento" | "ganado" | "perdido"> | undefined;
  if (q.leadStatus !== undefined) {
    leadStatus = Array.isArray(q.leadStatus) ? q.leadStatus : [q.leadStatus];
    if (leadStatus.length === 0) leadStatus = undefined;
  }

  return {
    branchId: q.branchId,
    country: request.scope.country ?? undefined,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    leadStatus,
    attended: q.attended,
    shift: q.shift,
    gestionaUserId,
    daysWithoutConvertingMin: q.daysWithoutConvertingMin,
    search: q.search,
    leadStatusSource: q.leadStatusSource,
    page: q.page,
    limit: q.limit,
  };
}
