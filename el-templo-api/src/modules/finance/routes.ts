/**
 * Finance API Routes (Phase 106).
 *
 * Endpoints:
 *   POST /api/admin/finance/transactions           — create (D-10)
 *   POST /api/admin/finance/transactions/:id/void  — void   (D-11)
 *
 * GET endpoints (list + summary) are added in Plan 03 to this same plugin.
 * GET /api/admin/members/:id/financial-history is mounted in members/routes.ts (Plan 04).
 *
 * Module-level guard: FINANCE_READ_ROLES (most permissive). Per-handler
 * checks layer stricter roles (write / adjustment / void) from D-01..D-03.
 */

import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { Workbook } from "exceljs";
import { TransactionService, BalanceService } from ".";
import { handleServiceError } from "../shared/error-handler";
import {
  createTransactionSchema,
  exportTransactionsSchema,
  listTransactionsSchema,
  transactionsSummarySchema,
  voidTransactionSchema,
} from "./schemas";
import {
  FINANCE_READ_ROLES,
  FINANCE_WRITE_ROLES,
  FINANCE_VOID_ROLES,
  FINANCE_ADJUSTMENT_ROLES,
} from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import {
  requireBranchAccess,
  BRANCH_OUT_OF_SCOPE,
} from "../shared/branch-access";
import * as schema from "../../db/schema";
import type {
  CreateTransactionInput,
  CreateTransactionResponse,
  FinanceSummaryFilters,
  PaymentMethod,
  TransactionKind,
  TransactionListFilters,
} from "./types";

export const financeRoutes: FastifyPluginAsync = async (fastify) => {
  const balanceService = new BalanceService(fastify.db, fastify.log);
  const transactionService = new TransactionService(
    fastify.db,
    fastify.log,
    balanceService,
  );

  // -----------------------------------------------------------------
  // Module-level guard: authenticate + most-permissive role + country scope
  // (T-106-01 first line of defense; T-106-02 country scope attached)
  // -----------------------------------------------------------------
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (
      !(FINANCE_READ_ROLES as readonly string[]).includes(request.user.role)
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // ===================================================================
  // POST /transactions — create (API-01, API-05)
  // ===================================================================
  fastify.post<{ Body: CreateTransactionInput }>(
    "/transactions",
    {
      schema: createTransactionSchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
      try {
        // T-106-06: kind=adjustment requires FINANCE_ADJUSTMENT_ROLES.
        // Other kinds require FINANCE_WRITE_ROLES.
        const requiredRoles =
          request.body.kind === "adjustment"
            ? FINANCE_ADJUSTMENT_ROLES
            : FINANCE_WRITE_ROLES;
        if (!(requiredRoles as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message:
              request.body.kind === "adjustment"
                ? "Solo owner/admin/gestion puede crear ajustes"
                : "No tienes permiso para crear esta transaccion",
          });
        }

        // T-106-03: non-owner cannot post against a branch in another country.
        if (!request.scope.isOwner) {
          const [branchRow] = await fastify.db
            .select({
              id: schema.branches.id,
              country: schema.branches.country,
              isVirtual: schema.branches.isVirtual,
            })
            .from(schema.branches)
            .where(eq(schema.branches.id, request.body.branchId))
            .limit(1);
          if (!branchRow) {
            return reply.code(404).send({
              error: "No encontrado",
              message: "Sucursal no encontrada",
            });
          }
          if (
            !branchRow.isVirtual &&
            branchRow.country !== request.scope.country
          ) {
            // Phase 110 Warning 2: harmonize inline 403 body to the same shape
            // as requireBranchAccess so the frontend matches by `code` exactly.
            // Phase 98 D-03 belt-and-suspenders: this service-layer guard
            // remains for direct callers (tests, internal cross-module calls)
            // even though the new requireBranchAccess preHandler covers the
            // HTTP path.
            request.log.warn(
              {
                userId: request.user?.userId,
                role: request.user?.role,
                branchId: request.body.branchId,
                scope: request.scope,
              },
              BRANCH_OUT_OF_SCOPE,
            );
            return reply.code(403).send({
              error: "Forbidden",
              message: "No tenés acceso a esta sede",
              code: BRANCH_OUT_OF_SCOPE,
            });
          }
        }

        const detail = await transactionService.create(
          request.body,
          request.user.userId,
        );
        const affectedBalances = await balanceService.getRowsForTransaction(
          detail.id,
        );

        const response: CreateTransactionResponse = {
          transaction: detail,
          links: detail.links,
          affectedBalances,
        };
        return reply.code(201).send(response);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "create finance transaction",
        );
      }
    },
  );

  // ===================================================================
  // POST /transactions/:id/void — void (API-02, API-06)
  // ===================================================================
  fastify.post<{
    Params: { id: number };
    Body: { reason: string };
  }>(
    "/transactions/:id/void",
    { schema: voidTransactionSchema },
    async (request, reply) => {
      try {
        // FINANCE_VOID_ROLES (D-03) — recepcion excluded.
        if (
          !(FINANCE_VOID_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para anular transacciones",
          });
        }

        // T-106-04: non-owner cannot void a transaction in another country.
        if (!request.scope.isOwner) {
          const [target] = await fastify.db
            .select({
              id: schema.financialTransactions.id,
              branchCountry: schema.branches.country,
              branchIsVirtual: schema.branches.isVirtual,
            })
            .from(schema.financialTransactions)
            .innerJoin(
              schema.branches,
              eq(schema.branches.id, schema.financialTransactions.branchId),
            )
            .where(eq(schema.financialTransactions.id, request.params.id))
            .limit(1);
          if (!target) {
            return reply.code(404).send({
              error: "No encontrado",
              message: "Transaccion no encontrada",
            });
          }
          if (
            !target.branchIsVirtual &&
            target.branchCountry !== request.scope.country
          ) {
            // 404 (not 403) to avoid leaking existence cross-country
            return reply.code(404).send({
              error: "No encontrado",
              message: "Transaccion no encontrada",
            });
          }
        }

        const detail = await transactionService.void(
          request.params.id,
          request.user.userId,
          { reason: request.body.reason },
        );
        return { transaction: detail };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "void finance transaction");
      }
    },
  );

  // ===================================================================
  // GET /transactions — paginated list (API-04, API-07, D-12)
  // Owner can override scope via ?country=XX. Non-owners are LOCKED to
  // request.scope.country (set by attachCountryScope). Schema accepts
  // country for everyone, handler enforces the owner-only semantics.
  // ===================================================================
  fastify.get<{
    Querystring: {
      branchId?: number;
      country?: string;
      kind?: TransactionKind;
      dateFrom?: string;
      dateTo?: string;
      memberId?: number;
      paymentMethod?: PaymentMethod;
      search?: string;
      page?: number;
      limit?: number;
    };
  }>(
    "/transactions",
    {
      schema: listTransactionsSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        // Owner-aware country resolution (per CajaPage.vue:521-530 contract).
        //   - Owner with ?country=XX  → filter by that country.
        //   - Owner without ?country  → no country filter (sees all countries).
        //   - Non-owner               → LOCKED to request.scope.country
        //                                (query.country silently ignored —
        //                                T-106-02 mitigation).
        let country: string | undefined;
        if (request.scope.isOwner) {
          country = request.query.country
            ? request.query.country.toUpperCase()
            : undefined;
        } else {
          country = request.scope.country ?? undefined;
        }

        const filters: TransactionListFilters = {
          branchId: request.query.branchId,
          country: country as TransactionListFilters["country"],
          kind: request.query.kind,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
          memberId: request.query.memberId,
          paymentMethod: request.query.paymentMethod,
          search: request.query.search,
          page: request.query.page,
          limit: request.query.limit,
        };
        return await transactionService.list(filters);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "list finance transactions",
        );
        return reply;
      }
    },
  );

  // ===================================================================
  // GET /transactions/summary — CajaPage legacy summary (D-16)
  // Same owner-aware country resolution as GET /transactions (above).
  // ===================================================================
  fastify.get<{
    Querystring: {
      branchId?: number;
      country?: string;
      dateFrom?: string;
      dateTo?: string;
    };
  }>(
    "/transactions/summary",
    {
      schema: transactionsSummarySchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        // Owner-aware country resolution — mirrors GET /transactions.
        let country: string | undefined;
        if (request.scope.isOwner) {
          country = request.query.country
            ? request.query.country.toUpperCase()
            : undefined;
        } else {
          country = request.scope.country ?? undefined;
        }

        const filters: FinanceSummaryFilters = {
          branchId: request.query.branchId,
          country: country as FinanceSummaryFilters["country"],
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
        };
        return await transactionService.getSummary(filters);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "finance transactions summary",
        );
        return reply;
      }
    },
  );

  // ===================================================================
  // GET /transactions/export — Phase 109 D-15 (CajaPage Excel export)
  //
  // RBAC: same module-level FINANCE_READ_ROLES guard as the listing
  // endpoint. Country scope: same owner-aware resolution (owner can
  // override via ?country=XX, non-owners locked to scope.country).
  //
  // Returns a single .xlsx workbook with one row per transaction,
  // 11 columns per D-15. NO pagination — server returns all matching
  // rows in one shot (admin frontend never loops). Mirrors the
  // server-side export pattern from reports/routes.ts (Phase 64 P03).
  // ===================================================================
  fastify.get<{
    Querystring: {
      branchId?: number;
      country?: string;
      kind?: TransactionKind;
      dateFrom?: string;
      dateTo?: string;
      memberId?: number;
      paymentMethod?: PaymentMethod;
      search?: string;
    };
  }>(
    "/transactions/export",
    {
      schema: exportTransactionsSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        // Owner-aware country resolution — mirrors GET /transactions.
        let country: string | undefined;
        if (request.scope.isOwner) {
          country = request.query.country
            ? request.query.country.toUpperCase()
            : undefined;
        } else {
          country = request.scope.country ?? undefined;
        }

        const filters: TransactionListFilters = {
          branchId: request.query.branchId,
          country: country as TransactionListFilters["country"],
          kind: request.query.kind,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
          memberId: request.query.memberId,
          paymentMethod: request.query.paymentMethod,
          search: request.query.search,
        };

        const rows = await transactionService.exportRowsForExcel(filters);

        const workbook = new Workbook();
        workbook.creator = "El Templo";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Caja");

        // 11 columns per D-15 — order is load-bearing.
        sheet.columns = [
          { header: "Fecha", key: "fecha", width: 12 },
          { header: "Tipo", key: "tipo", width: 18 },
          { header: "Monto total", key: "monto", width: 14 },
          { header: "Moneda", key: "moneda", width: 10 },
          { header: "Método de pago", key: "metodo", width: 16 },
          { header: "Sucursal", key: "sucursal", width: 22 },
          { header: "Miembro", key: "miembro", width: 28 },
          { header: "Conceptos", key: "conceptos", width: 32 },
          { header: "Notas", key: "notas", width: 28 },
          { header: "Anulado", key: "anulado", width: 10 },
          { header: "Razón anulación", key: "razon", width: 24 },
        ];

        // Header style — bold + light grey fill (mirrors reports/routes.ts
        // styleHeaderRow helper).
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE0E0E0" },
        };

        for (const row of rows) {
          sheet.addRow({
            fecha: row.transactionDate,
            tipo: KIND_LABELS_ES[row.kind] ?? row.kind,
            monto: row.amount,
            moneda: row.currency,
            metodo:
              PAYMENT_METHOD_LABELS_ES[row.paymentMethod] ?? row.paymentMethod,
            sucursal: row.branchName,
            miembro: row.memberName,
            conceptos: buildConceptosCell(row.linkSummary),
            notas: row.notes ?? "",
            anulado: row.voidedAt ? "Sí" : "No",
            razon: row.voidReason ?? "",
          });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const today = new Date().toISOString().split("T")[0];
        const filename = `caja-${today}.xlsx`;

        reply
          .header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          )
          .header("Content-Disposition", `attachment; filename="${filename}"`)
          .send(Buffer.from(buffer as ArrayBuffer));
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "export finance transactions",
        );
      }
    },
  );
};

// =============================================================================
// Helpers (Phase 109 D-15)
// =============================================================================

/** Spanish labels for the 5 transaction kinds. Mirror of admin frontend. */
const KIND_LABELS_ES: Record<TransactionKind, string> = {
  plan_charge: "Cobro de plan",
  debt_settlement: "Pago de saldo",
  refund: "Reembolso",
  adjustment: "Ajuste",
  advance_payment: "Pago anticipado",
};

/** Spanish labels for payment methods. Mirror of admin frontend. */
const PAYMENT_METHOD_LABELS_ES: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  aura_credit: "AURA",
  internal: "Interno",
};

/**
 * Spanish labels for transaction-link target kinds. Used to build the
 * "Conceptos" column (W5 stub — operations gets `<label> #<id>` until a
 * future endpoint extension exposes resolved human-readable labels).
 */
const TARGET_KIND_LABEL_ES: Record<string, string> = {
  subscription: "Plan",
  debt_balance: "Saldo",
  transaction: "Transacción",
};

/**
 * Build the "Conceptos" cell value: "Plan #123, Saldo #45" — empty string
 * when no links. Per Phase 109 D-15 / W5: granular labels deferred.
 */
function buildConceptosCell(
  linkSummary:
    | Array<{ targetKind: string; targetId: number }>
    | undefined
    | null,
): string {
  if (!linkSummary || linkSummary.length === 0) return "";
  return linkSummary
    .map(
      (l) =>
        `${TARGET_KIND_LABEL_ES[l.targetKind] ?? l.targetKind} #${l.targetId}`,
    )
    .join(", ");
}
