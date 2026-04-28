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
import { TransactionService, BalanceService } from ".";
import { handleServiceError } from "../shared/error-handler";
import { createTransactionSchema, voidTransactionSchema } from "./schemas";
import {
  FINANCE_READ_ROLES,
  FINANCE_WRITE_ROLES,
  FINANCE_VOID_ROLES,
  FINANCE_ADJUSTMENT_ROLES,
} from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import * as schema from "../../db/schema";
import type {
  CreateTransactionInput,
  CreateTransactionResponse,
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
    { schema: createTransactionSchema },
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
            return reply.code(403).send({
              error: "Acceso denegado",
              message: "No tienes permiso sobre esta sucursal",
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
};
