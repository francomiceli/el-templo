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
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
  MovementService,
} from ".";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import { EnrollmentService } from "../programs/enrollment-service";
import { handleServiceError } from "../shared/error-handler";
import {
  createTransactionSchema,
  exportTransactionsSchema,
  listTransactionsSchema,
  observeTransactionSchema,
  correctTransactionSchema,
  validateTransactionSchema,
  pendingMiscForMemberSchema,
  transactionsSummarySchema,
  voidTransactionSchema,
  registerMovementSchema,
  registerExpenseSchema,
  voidMovementSchema,
  pendingTraySchema,
  pendingTrayExportSchema,
  cashBalancesSchema,
  costCentersSchema,
  cashBalancesExportSchema,
  movementsHistorySchema,
  movementsHistoryExportSchema,
  createBankAccountSchema,
  updateBankAccountSchema,
  closeBankAccountSchema,
  reactivateBankAccountSchema,
  createCostCenterSchema,
  renameCostCenterSchema,
  toggleCostCenterSchema,
  costCentersAllSchema,
} from "./schemas";
import {
  FINANCE_READ_ROLES,
  FINANCE_WRITE_ROLES,
  FINANCE_VOID_ROLES,
  FINANCE_ADJUSTMENT_ROLES,
  ADMIN_ROLES,
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
  RegisterMovementInput,
  RegisterExpenseInput,
  PendingTrayFilters,
  MovEgresoFilters,
  CreateBankAccountInput,
  UpdateBankAccountInput,
} from "./types";

export const financeRoutes: FastifyPluginAsync = async (fastify) => {
  const balanceService = new BalanceService(fastify.db, fastify.log);
  const cashRegisterService = new CashRegisterService(fastify.db, fastify.log);
  const transactionService = new TransactionService(
    fastify.db,
    fastify.log,
    balanceService,
    cashRegisterService,
  );
  // Phase 137 (VAL-06): wire the SubscriptionService back-edge so the void
  // endpoint's keepMembershipActive=false branch can cancel the linked sub
  // atomically via _cancelSubscription(tx, ...). Mirrors the DI assembled in
  // subscriptions/routes.ts; the back-edge is set post-construction to break
  // the circular dependency (SubscriptionService → TransactionService).
  const auraService = new AuraService(fastify.db);
  const enrollmentService = new EnrollmentService(fastify.db, fastify.log);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
    transactionService,
    enrollmentService,
  );
  transactionService.setSubscriptionCanceller(subscriptionService);

  // Phase 139: MovementService composes the 137/138 primitives (reuses the
  // already-built transactionService + cashRegisterService instances).
  const movementService = new MovementService(
    fastify.db,
    fastify.log,
    transactionService,
    cashRegisterService,
  );

  // Phase 139: resolve the country a caja belongs to via its branch. Returns
  // null for a branch-less caja (central efectivo / banco ARS/EUR), which is
  // country-agnostic → owner-only access. Used by the movement/expense route
  // country-scope guards (T-139-07). Returns undefined when the caja does not
  // exist so the caller can 404 without leaking existence.
  const resolveCajaCountry = async (
    cajaId: number,
  ): Promise<{ country: string | null } | undefined> => {
    const [row] = await fastify.db
      .select({
        branchId: schema.cashRegisters.branchId,
        branchCountry: schema.branches.country,
      })
      .from(schema.cashRegisters)
      .leftJoin(
        schema.branches,
        eq(schema.branches.id, schema.cashRegisters.branchId),
      )
      .where(eq(schema.cashRegisters.id, cajaId))
      .limit(1);
    if (!row) return undefined;
    // branch-less caja → country-agnostic (null). Otherwise the branch country.
    return { country: row.branchId === null ? null : row.branchCountry };
  };

  // Phase 139: enforce non-owner country scope on a caja. Returns an error
  // tuple { code, message } to send (404 for unknown/cross-country to avoid
  // existence leak — mirror of routes.ts:253-268), or null when access is OK.
  // A branch-less caja is owner-only (non-owner gets 404).
  const enforceCajaScope = async (
    cajaId: number,
    isOwner: boolean,
    scopeCountry: string | null,
  ): Promise<{ code: number; message: string } | null> => {
    if (isOwner) return null;
    const resolved = await resolveCajaCountry(cajaId);
    if (!resolved) {
      return { code: 404, message: "Caja no encontrada" };
    }
    // branch-less caja or country mismatch → 404 (no existence leak).
    if (resolved.country === null || resolved.country !== scopeCountry) {
      return { code: 404, message: "Caja no encontrada" };
    }
    return null;
  };

  // Phase 139: enforce non-owner country scope on a ledger ROW (a movement leg
  // or an expense), resolved via that row's cash_register_id → caja → branch.
  // Used by the void routes. 404 for unknown row / branch-less caja /
  // cross-country (no existence leak — mirror of routes.ts void precedent).
  const enforceRowScope = async (
    rowId: number,
    isOwner: boolean,
    scopeCountry: string | null,
  ): Promise<{ code: number; message: string } | null> => {
    if (isOwner) return null;
    const [row] = await fastify.db
      .select({
        cashRegisterId: schema.financialTransactions.cashRegisterId,
      })
      .from(schema.financialTransactions)
      .where(eq(schema.financialTransactions.id, rowId))
      .limit(1);
    if (!row || row.cashRegisterId === null) {
      return { code: 404, message: "Transaccion no encontrada" };
    }
    const scopeErr = await enforceCajaScope(
      row.cashRegisterId,
      isOwner,
      scopeCountry,
    );
    // Re-map the caja "not found" message to the transaction wording.
    if (scopeErr) {
      return { code: 404, message: "Transaccion no encontrada" };
    }
    return null;
  };

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

        // Phase 139: the REST create path is for member charges (branchId
        // required). Movimientos/egresos (branchId null) go through their own
        // Plan 03 routes, never here — reject a null branch on this endpoint.
        if (request.body.branchId === null) {
          return reply.code(400).send({
            error: "Solicitud invalida",
            message: "branchId es requerido",
          });
        }
        const bodyBranchId = request.body.branchId;

        // T-106-03: non-owner cannot post against a branch in another country.
        if (!request.scope.isOwner) {
          const [branchRow] = await fastify.db
            .select({
              id: schema.branches.id,
              country: schema.branches.country,
              isVirtual: schema.branches.isVirtual,
            })
            .from(schema.branches)
            .where(eq(schema.branches.id, bodyBranchId))
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

        // VAL-02 (T-137-04): derive validation_status SERVER-SIDE from the
        // authenticated role — NEVER from the request body. coach → 'pendiente',
        // everyone else → 'validado'. In phase 137 the create guard above is
        // still FINANCE_WRITE_ROLES (coach NOT included → in practice always
        // 'validado' via REST today); the derivation exists and is tested by
        // simulating the role. Opening create to coach is phase 140 — do NOT
        // add coach to FINANCE_WRITE_ROLES here.
        const initialStatus = (["coach"] as readonly string[]).includes(
          request.user.role,
        )
          ? "pendiente"
          : "validado";

        const detail = await transactionService.create(
          { ...request.body, validationStatus: initialStatus },
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
    Body: { reason: string; keepMembershipActive?: boolean };
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

        // VAL-06 / D-10: keepMembershipActive default true (sub untouched).
        // When false, void() cancels the linked subscription atomically.
        const detail = await transactionService.void(
          request.params.id,
          request.user.userId,
          {
            reason: request.body.reason,
            keepMembershipActive: request.body.keepMembershipActive ?? true,
          },
        );
        return { transaction: detail };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "void finance transaction");
      }
    },
  );

  // ===================================================================
  // POST /transactions/:id/validate — VAL-03 (pendiente → validado)
  // RBAC: FINANCE_VOID_ROLES (owner/admin/gestion — coach/recepcion excluded).
  // ===================================================================
  fastify.post<{
    Params: { id: number };
    Body: { cashRegisterId?: number };
  }>(
    "/transactions/:id/validate",
    { schema: validateTransactionSchema },
    async (request, reply) => {
      try {
        if (
          !(FINANCE_VOID_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para validar transacciones",
          });
        }
        // CAJA-02/CAJA-03: gestion confirma/cambia la caja imputada (opcional).
        // El guard de coherencia (existe/activa/moneda) vive en validate().
        const detail = await transactionService.validate(
          request.params.id,
          request.user.userId,
          request.body?.cashRegisterId,
        );
        return { transaction: detail };
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "validate finance transaction",
        );
      }
    },
  );

  // ===================================================================
  // Phase 146 (plan 03 primitive): GET /transactions/pending-misc/:memberId
  // Cobros sueltos (advance_payment) pendientes no anulados del socio. RBAC:
  // FINANCE_VOID_ROLES per-handler (LOW 2 — datos financieros del socio: NO
  // abierto a recepcion/coach; recepcion pasa el guard de modulo pero el gate
  // estricto la 403'a aca; coach ya queda 403 por el guard de modulo).
  // ===================================================================
  fastify.get<{ Params: { memberId: number } }>(
    "/transactions/pending-misc/:memberId",
    { schema: pendingMiscForMemberSchema },
    async (request, reply) => {
      try {
        if (
          !(FINANCE_VOID_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para ver los cobros sueltos del socio",
          });
        }
        const items = await transactionService.listPendingMiscForMember(
          request.params.memberId,
        );
        return { items };
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "list pending misc for member",
        );
        return reply;
      }
    },
  );

  // ===================================================================
  // POST /transactions/:id/observe — VAL-04 / D-04 (pendiente → observado)
  // RBAC: FINANCE_VOID_ROLES. Body: { reason } (mandatory for the trail).
  // ===================================================================
  fastify.post<{
    Params: { id: number };
    Body: { reason: string };
  }>(
    "/transactions/:id/observe",
    { schema: observeTransactionSchema },
    async (request, reply) => {
      try {
        if (
          !(FINANCE_VOID_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para observar transacciones",
          });
        }
        const detail = await transactionService.observe(
          request.params.id,
          request.user.userId,
          { reason: request.body.reason },
        );
        return { transaction: detail };
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "observe finance transaction",
        );
      }
    },
  );

  // ===================================================================
  // POST /transactions/:id/correct — VAL-04 / D-05 (void+recreate atomic)
  // RBAC: FINANCE_VOID_ROLES. Body: { correctedFields } — subset of
  // amount/memberId/paymentMethod. Returns 201 with the NEW (validado) tx.
  // ===================================================================
  fastify.post<{
    Params: { id: number };
    Body: {
      correctedFields: {
        amount?: number;
        memberId?: number;
        paymentMethod?: PaymentMethod;
      };
    };
  }>(
    "/transactions/:id/correct",
    { schema: correctTransactionSchema },
    async (request, reply) => {
      try {
        if (
          !(FINANCE_VOID_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para corregir transacciones",
          });
        }
        const detail = await transactionService.correct(
          request.params.id,
          request.body.correctedFields,
          request.user.userId,
        );
        return reply.code(201).send({ transaction: detail });
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "correct finance transaction",
        );
      }
    },
  );

  // ===================================================================
  // Phase 139: POST /movements — registrar movimiento inter-caja (MOV-01/02)
  // RBAC: FINANCE_VOID_ROLES server-side (admin-only, T-139-06). Country scope
  // via origen + destino cajas (T-139-07). The same-currency guard + 2-row
  // asiento + reconciliation live in MovementService.registerMovement.
  // ===================================================================
  fastify.post<{ Body: RegisterMovementInput }>(
    "/movements",
    { schema: registerMovementSchema },
    async (request, reply) => {
      try {
        if (
          !(FINANCE_VOID_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para registrar movimientos",
          });
        }

        // T-139-07: non-owner country scope on BOTH cajas (branch-less = 404).
        for (const cajaId of [
          request.body.origenCajaId,
          request.body.destinoCajaId,
        ]) {
          const scopeErr = await enforceCajaScope(
            cajaId,
            request.scope.isOwner,
            request.scope.country ?? null,
          );
          if (scopeErr) {
            return reply
              .code(scopeErr.code)
              .send({ error: "No encontrado", message: scopeErr.message });
          }
        }

        const detail = await movementService.registerMovement(
          {
            origenCajaId: request.body.origenCajaId,
            destinoCajaId: request.body.destinoCajaId,
            amount: request.body.amount,
            countedAmount: request.body.countedAmount,
            notes: request.body.notes ?? null,
          },
          request.user.userId,
        );
        return reply.code(201).send({ movement: detail });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "register movement");
      }
    },
  );

  // ===================================================================
  // Phase 139: POST /expenses — registrar egreso (MOV-03 / D-05)
  // RBAC: FINANCE_VOID_ROLES server-side. Country scope via the caja.
  // ===================================================================
  fastify.post<{ Body: RegisterExpenseInput }>(
    "/expenses",
    { schema: registerExpenseSchema },
    async (request, reply) => {
      try {
        if (
          !(FINANCE_VOID_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para registrar egresos",
          });
        }

        const scopeErr = await enforceCajaScope(
          request.body.cajaId,
          request.scope.isOwner,
          request.scope.country ?? null,
        );
        if (scopeErr) {
          return reply
            .code(scopeErr.code)
            .send({ error: "No encontrado", message: scopeErr.message });
        }

        const detail = await movementService.registerExpense(
          {
            cajaId: request.body.cajaId,
            amount: request.body.amount,
            costCenterId: request.body.costCenterId,
            notes: request.body.notes ?? null,
          },
          request.user.userId,
        );
        return reply.code(201).send({ expense: detail });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "register expense");
      }
    },
  );

  // ===================================================================
  // Phase 139: POST /movements/:id/void — anular movimiento (MOV-04 / D-08)
  // Voids BOTH legs + the reconciliation adjustment atomically via voidPair.
  // RBAC: FINANCE_VOID_ROLES. Country scope via the target row's caja.
  // ===================================================================
  fastify.post<{ Params: { id: number }; Body: { reason: string } }>(
    "/movements/:id/void",
    { schema: voidMovementSchema },
    async (request, reply) => {
      try {
        if (
          !(FINANCE_VOID_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para anular movimientos",
          });
        }

        const scopeErr = await enforceRowScope(
          request.params.id,
          request.scope.isOwner,
          request.scope.country ?? null,
        );
        if (scopeErr) {
          return reply
            .code(scopeErr.code)
            .send({ error: "No encontrado", message: scopeErr.message });
        }

        await movementService.voidMovement(
          request.params.id,
          request.user.userId,
          request.body.reason,
        );
        return { voided: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "void movement");
      }
    },
  );

  // ===================================================================
  // Phase 139: POST /expenses/:id/void — anular egreso (MOV-04 / D-08)
  // Single-row void via voidPair([id]). RBAC + country scope as above.
  // ===================================================================
  fastify.post<{ Params: { id: number }; Body: { reason: string } }>(
    "/expenses/:id/void",
    { schema: voidMovementSchema },
    async (request, reply) => {
      try {
        if (
          !(FINANCE_VOID_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para anular egresos",
          });
        }

        const scopeErr = await enforceRowScope(
          request.params.id,
          request.scope.isOwner,
          request.scope.country ?? null,
        );
        if (scopeErr) {
          return reply
            .code(scopeErr.code)
            .send({ error: "No encontrado", message: scopeErr.message });
        }

        await movementService.voidExpense(
          request.params.id,
          request.user.userId,
          request.body.reason,
        );
        return { voided: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "void expense");
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
      validationStatus?: "validado" | "pendiente";
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
          validationStatus: request.query.validationStatus,
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

  // ===================================================================
  // Phase 141 (REP-01): GET /pending-tray — bandeja de pendientes
  // pendiente+observado oldest-first, TS aging + isOverdue (OVERDUE_DAYS),
  // recorder + caja name, paginated. Coach 403 via the module guard.
  // ===================================================================
  fastify.get<{
    Querystring: {
      status?: "pendientes" | "observados" | "todos";
      country?: string;
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    };
  }>("/pending-tray", { schema: pendingTraySchema }, async (request, reply) => {
    try {
      // Owner-aware country resolution — mirror of GET /transactions.
      let country: string | undefined;
      if (request.scope.isOwner) {
        country = request.query.country
          ? request.query.country.toUpperCase()
          : undefined;
      } else {
        country = request.scope.country ?? undefined;
      }

      const filters: PendingTrayFilters = {
        status: request.query.status,
        country: country as PendingTrayFilters["country"],
        branchId: request.query.branchId,
        dateFrom: request.query.dateFrom,
        dateTo: request.query.dateTo,
        page: request.query.page,
        limit: request.query.limit,
      };
      return await transactionService.listPendingTray(filters);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "finance pending tray");
      return reply;
    }
  });

  // ===================================================================
  // Phase 141 (REP-04): GET /pending-tray/export — bandeja .xlsx
  // Same filters minus page/limit (all rows). Reuses the exceljs pattern.
  // ===================================================================
  fastify.get<{
    Querystring: {
      status?: "pendientes" | "observados" | "todos";
      country?: string;
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
    };
  }>(
    "/pending-tray/export",
    { schema: pendingTrayExportSchema },
    async (request, reply) => {
      try {
        let country: string | undefined;
        if (request.scope.isOwner) {
          country = request.query.country
            ? request.query.country.toUpperCase()
            : undefined;
        } else {
          country = request.scope.country ?? undefined;
        }

        const filters: PendingTrayFilters = {
          status: request.query.status,
          country: country as PendingTrayFilters["country"],
          branchId: request.query.branchId,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
          // All rows: defense-in-depth max=200 in the service; bump the limit.
          limit: 200,
          page: 1,
        };
        const result = await transactionService.listPendingTray(filters);

        const workbook = new Workbook();
        workbook.creator = "El Templo";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Bandeja");
        sheet.columns = [
          { header: "Fecha", key: "fecha", width: 12 },
          { header: "Socio", key: "socio", width: 28 },
          { header: "Monto", key: "monto", width: 14 },
          { header: "Moneda", key: "moneda", width: 10 },
          { header: "Medio", key: "medio", width: 16 },
          { header: "Caja", key: "caja", width: 22 },
          { header: "Cargado por", key: "cargadoPor", width: 24 },
          { header: "Antigüedad (días)", key: "antiguedad", width: 16 },
          { header: "Estado", key: "estado", width: 14 },
          { header: "Vencido", key: "vencido", width: 10 },
        ];
        styleHeaderRow(sheet.getRow(1));

        for (const row of result.rows) {
          sheet.addRow({
            fecha: row.transactionDate,
            socio: row.memberName,
            monto: row.amount,
            moneda: row.currency,
            medio:
              PAYMENT_METHOD_LABELS_ES[row.paymentMethod] ?? row.paymentMethod,
            caja: row.cashRegisterName,
            cargadoPor: row.recorderName,
            antiguedad: row.ageInDays,
            estado:
              VALIDATION_STATUS_LABELS_ES[row.validationStatus] ??
              row.validationStatus,
            vencido: row.isOverdue ? "Sí" : "No",
          });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const today = new Date().toISOString().split("T")[0];
        reply
          .header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          )
          .header(
            "Content-Disposition",
            `attachment; filename="bandeja-${today}.xlsx"`,
          )
          .send(Buffer.from(buffer as ArrayBuffer));
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "export pending tray");
      }
    },
  );

  // ===================================================================
  // Phase 141 (REP-02): GET /cash-registers/balances — saldos por caja
  // firme+pendiente per active caja (getBalance reuse) + type + currency.
  // Non-owner sees only their country's sucursal cajas; central/banco
  // (branch-less) owner-only. Coach 403 via the module guard.
  // ===================================================================
  fastify.get<{
    Querystring: { country?: string; dateFrom?: string; dateTo?: string };
  }>(
    "/cash-registers/balances",
    { schema: cashBalancesSchema },
    async (request, reply) => {
      try {
        let country: string | undefined;
        if (request.scope.isOwner) {
          country = request.query.country
            ? request.query.country.toUpperCase()
            : undefined;
        } else {
          country = request.scope.country ?? undefined;
        }
        // El rango va completo o no va: con uno solo el neto sería engañoso
        // (mitad del período), así que se rechaza en vez de asumir un borde.
        const { dateFrom, dateTo } = request.query;
        if ((dateFrom === undefined) !== (dateTo === undefined)) {
          return reply.code(400).send({
            error: "Solicitud invalida",
            message: "Enviá dateFrom y dateTo juntos, o ninguno de los dos.",
          });
        }
        if (
          dateFrom !== undefined &&
          dateTo !== undefined &&
          dateFrom > dateTo
        ) {
          return reply.code(400).send({
            error: "Solicitud invalida",
            message: "dateFrom no puede ser posterior a dateTo.",
          });
        }
        return await cashRegisterService.listActiveCajasWithBalance(
          {
            isOwner: request.scope.isOwner,
            country: country ?? null,
          },
          dateFrom !== undefined && dateTo !== undefined
            ? { dateFrom, dateTo }
            : undefined,
        );
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "finance cash balances");
        return reply;
      }
    },
  );

  // ===================================================================
  // Phase 147 (EGR-01): GET /cost-centers — centros de costo activos por país
  // (consumido por el selector del dialog de egreso). RBAC: FINANCE_VOID_ROLES
  // en-handler (mismo conjunto que registrar egresos, decisión 3 del CONTEXT;
  // el module hook ya gatea FINANCE_READ_ROLES). Country scope owner-aware
  // (copia EXACTA de GET /cash-registers/balances).
  // ===================================================================
  fastify.get<{ Querystring: { country?: string } }>(
    "/cost-centers",
    { schema: costCentersSchema },
    async (request, reply) => {
      try {
        if (
          !(FINANCE_VOID_ROLES as readonly string[]).includes(request.user.role)
        ) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para ver los centros de costo",
          });
        }

        let country: string | undefined;
        if (request.scope.isOwner) {
          country = request.query.country
            ? request.query.country.toUpperCase()
            : undefined;
        } else {
          country = request.scope.country ?? undefined;
        }
        return await cashRegisterService.listActiveCostCenters(country ?? null);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "finance cost centers");
        return reply;
      }
    },
  );

  // ===================================================================
  // Phase 152 (CAJA-05): ABM de centros de costo (levanta EGR-F2 de v5.3).
  //
  // Escrituras admin/owner-only (149 D-04 / 150 D-12): guard en-handler con
  // ADMIN_ROLES (NO FINANCE_VOID_ROLES, que incluye gestion). La seguridad vive
  // en la API; la UI (152-06) solo esconde. Sin borrado físico (D-08): la baja
  // es lógica (deactivate). El `GET /cost-centers` de arriba sigue active-only
  // para el selector de egresos; el `GET /cost-centers/all` de acá incluye las
  // dadas de baja, para el ABM. Country scope owner-aware (copia de GET
  // /cost-centers). handleServiceError en cada handler (ConflictError → 409).
  // ===================================================================

  // POST /cost-centers — crear centro de costo (CAJA-05)
  fastify.post<{ Body: { name: string; country: string } }>(
    "/cost-centers",
    { schema: createCostCenterSchema },
    async (request, reply) => {
      try {
        if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para administrar los centros de costo",
          });
        }
        const center = await cashRegisterService.createCostCenter(
          request.body.name,
          request.body.country,
        );
        return reply.code(201).send({ center });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "create cost center");
      }
    },
  );

  // PATCH /cost-centers/:id — renombrar centro de costo (CAJA-05)
  fastify.patch<{ Params: { id: number }; Body: { name: string } }>(
    "/cost-centers/:id",
    { schema: renameCostCenterSchema },
    async (request, reply) => {
      try {
        if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para administrar los centros de costo",
          });
        }
        const center = await cashRegisterService.renameCostCenter(
          request.params.id,
          request.body.name,
        );
        return reply.code(200).send({ center });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "rename cost center");
      }
    },
  );

  // POST /cost-centers/:id/deactivate — baja lógica (CAJA-05 / D-08)
  fastify.post<{ Params: { id: number } }>(
    "/cost-centers/:id/deactivate",
    { schema: toggleCostCenterSchema },
    async (request, reply) => {
      try {
        if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para administrar los centros de costo",
          });
        }
        const center = await cashRegisterService.deactivateCostCenter(
          request.params.id,
        );
        return reply.code(200).send({ center });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "deactivate cost center");
      }
    },
  );

  // POST /cost-centers/:id/reactivate — alta lógica (CAJA-05)
  fastify.post<{ Params: { id: number } }>(
    "/cost-centers/:id/reactivate",
    { schema: toggleCostCenterSchema },
    async (request, reply) => {
      try {
        if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para administrar los centros de costo",
          });
        }
        const center = await cashRegisterService.reactivateCostCenter(
          request.params.id,
        );
        return reply.code(200).send({ center });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "reactivate cost center");
      }
    },
  );

  // GET /cost-centers/all — lista del ABM (incluye inactivos), country owner-aware
  fastify.get<{ Querystring: { country?: string } }>(
    "/cost-centers/all",
    { schema: costCentersAllSchema },
    async (request, reply) => {
      try {
        if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para administrar los centros de costo",
          });
        }
        let country: string | undefined;
        if (request.scope.isOwner) {
          country = request.query.country
            ? request.query.country.toUpperCase()
            : undefined;
        } else {
          country = request.scope.country ?? undefined;
        }
        const centers = await cashRegisterService.listAllCostCenters(
          country ?? null,
        );
        return reply.code(200).send({ centers });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "list all cost centers");
        return reply;
      }
    },
  );

  // ===================================================================
  // Phase 150 (CTA-01 / CTA-02): ABM de cuentas bancarias.
  //
  // Cuentas banco = cajas type='banco', branchId=null (country-agnostic): NO se
  // aplica el filtro de country scope (a diferencia de egresos / cost-centers).
  // La autorización es admin/owner-only (D-12): guard en-handler stricter con
  // ADMIN_ROLES en cada escritura (create/update/close/reactivate), NO
  // FINANCE_VOID_ROLES (que incluye gestion). El module hook ya autenticó y gateó
  // FINANCE_READ_ROLES (líneas ~190). Moneda fija post-creación (D-04): el
  // updateBankAccountSchema no acepta `currency` y el service nunca la muta.
  // ===================================================================

  // POST /cash-registers — crear cuenta banco (CTA-01)
  fastify.post<{ Body: CreateBankAccountInput }>(
    "/cash-registers",
    { schema: createBankAccountSchema },
    async (request, reply) => {
      try {
        if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para administrar cuentas bancarias",
          });
        }
        const account = await cashRegisterService.createBankAccount(
          request.body,
        );
        return reply.code(201).send({ account });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "create bank account");
      }
    },
  );

  // PATCH /cash-registers/:id — editar cuenta banco (CTA-01, D-04 moneda fija)
  fastify.patch<{ Params: { id: number }; Body: UpdateBankAccountInput }>(
    "/cash-registers/:id",
    { schema: updateBankAccountSchema },
    async (request, reply) => {
      try {
        if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para administrar cuentas bancarias",
          });
        }
        const account = await cashRegisterService.updateBankAccount(
          request.params.id,
          request.body,
        );
        return reply.code(200).send({ account });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "update bank account");
      }
    },
  );

  // POST /cash-registers/:id/close — baja lógica (CTA-02, D-06)
  fastify.post<{ Params: { id: number } }>(
    "/cash-registers/:id/close",
    { schema: closeBankAccountSchema },
    async (request, reply) => {
      try {
        if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para administrar cuentas bancarias",
          });
        }
        const { balance } = await cashRegisterService.closeBankAccount(
          request.params.id,
        );
        const accounts = await cashRegisterService.listBankAccounts();
        const account = accounts.find((a) => a.id === request.params.id);
        return reply.code(200).send({ account, balance });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "close bank account");
      }
    },
  );

  // POST /cash-registers/:id/reactivate — reactivar cuenta cerrada (CTA-02, D-07)
  fastify.post<{ Params: { id: number } }>(
    "/cash-registers/:id/reactivate",
    { schema: reactivateBankAccountSchema },
    async (request, reply) => {
      try {
        if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "No tienes permiso para administrar cuentas bancarias",
          });
        }
        const account = await cashRegisterService.reactivateBankAccount(
          request.params.id,
        );
        return reply.code(200).send({ account });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "reactivate bank account");
      }
    },
  );

  // GET /cash-registers — listar cuentas banco activas Y cerradas (CTA-01, D-07)
  fastify.get("/cash-registers", async (request, reply) => {
    try {
      if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "No tienes permiso para administrar cuentas bancarias",
        });
      }
      const accounts = await cashRegisterService.listBankAccounts();
      return reply.code(200).send({ accounts });
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "list bank accounts");
      return reply;
    }
  });

  // ===================================================================
  // Phase 141 (REP-04): GET /cash-registers/balances/export — saldos .xlsx
  // Same scope as the read. Reuses the exceljs pattern.
  // ===================================================================
  fastify.get<{ Querystring: { country?: string } }>(
    "/cash-registers/balances/export",
    { schema: cashBalancesExportSchema },
    async (request, reply) => {
      try {
        let country: string | undefined;
        if (request.scope.isOwner) {
          country = request.query.country
            ? request.query.country.toUpperCase()
            : undefined;
        } else {
          country = request.scope.country ?? undefined;
        }
        const rows = await cashRegisterService.listActiveCajasWithBalance({
          isOwner: request.scope.isOwner,
          country: country ?? null,
        });

        const workbook = new Workbook();
        workbook.creator = "El Templo";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Saldos");
        sheet.columns = [
          { header: "Caja", key: "caja", width: 24 },
          { header: "Tipo", key: "tipo", width: 14 },
          { header: "Moneda", key: "moneda", width: 10 },
          { header: "Saldo firme", key: "firme", width: 16 },
          { header: "Pendiente", key: "pendiente", width: 16 },
        ];
        styleHeaderRow(sheet.getRow(1));

        for (const row of rows) {
          sheet.addRow({
            caja: row.name,
            tipo: CAJA_TYPE_LABELS_ES[row.type] ?? row.type,
            moneda: row.currency,
            firme: row.firmeBalance,
            pendiente: row.pendienteAmount,
          });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const today = new Date().toISOString().split("T")[0];
        reply
          .header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          )
          .header(
            "Content-Disposition",
            `attachment; filename="saldos-${today}.xlsx"`,
          )
          .send(Buffer.from(buffer as ArrayBuffer));
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "export cash balances");
      }
    },
  );

  // ===================================================================
  // Phase 141 (REP-03) → Phase 146 (ARQUEO-01/02): GET /movements-history —
  // arqueo por caja. Ya NO filtra por kind: dada una caja devuelve TODO lo
  // imputado a ella (cobros de socio plan_charge/debt_settlement/advance_payment/
  // refund + egresos expense + traspasos cash_transfer + ajustes adjustment),
  // INCLUDING member_id NULL rows (the 139 LEFT JOIN fix). Cada fila trae su
  // validationStatus (pendientes y validadas, sin filtrar por estado) — la
  // respuesta es passthrough, así que el campo del service fluye sin tipar.
  // Filterable por caja/período. Non-owner is scoped by the caja's country (no
  // eq(branches.country) NULL-branch trap); branch-less central/banco rows are
  // owner-only. Coach 403 via module guard.
  // ===================================================================
  fastify.get<{
    Querystring: {
      cashRegisterId?: number;
      country?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    };
  }>(
    "/movements-history",
    { schema: movementsHistorySchema },
    async (request, reply) => {
      try {
        // Owner-aware country resolution — mirror of GET /transactions.
        let country: string | undefined;
        if (request.scope.isOwner) {
          country = request.query.country
            ? request.query.country.toUpperCase()
            : undefined;
        } else {
          country = request.scope.country ?? undefined;
        }

        const filters: MovEgresoFilters = {
          cashRegisterId: request.query.cashRegisterId,
          country: country as MovEgresoFilters["country"],
          isOwner: request.scope.isOwner,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
          page: request.query.page,
          limit: request.query.limit,
        };
        return await transactionService.listMovEgresos(filters);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "finance movements history",
        );
        return reply;
      }
    },
  );

  // ===================================================================
  // Phase 141 (REP-04): GET /movements-history/export — historial .xlsx
  // Same filters minus page/limit (all rows). Reuses the exceljs pattern.
  // ===================================================================
  fastify.get<{
    Querystring: {
      cashRegisterId?: number;
      country?: string;
      dateFrom?: string;
      dateTo?: string;
    };
  }>(
    "/movements-history/export",
    { schema: movementsHistoryExportSchema },
    async (request, reply) => {
      try {
        let country: string | undefined;
        if (request.scope.isOwner) {
          country = request.query.country
            ? request.query.country.toUpperCase()
            : undefined;
        } else {
          country = request.scope.country ?? undefined;
        }

        const filters: MovEgresoFilters = {
          cashRegisterId: request.query.cashRegisterId,
          country: country as MovEgresoFilters["country"],
          isOwner: request.scope.isOwner,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
          // All rows: defense-in-depth max=200 in the service; bump the limit.
          limit: 200,
          page: 1,
        };
        const result = await transactionService.listMovEgresos(filters);

        const workbook = new Workbook();
        workbook.creator = "El Templo";
        workbook.created = new Date();
        const sheet = workbook.addWorksheet("Mov-Egresos");
        sheet.columns = [
          { header: "Fecha", key: "fecha", width: 12 },
          { header: "Tipo", key: "tipo", width: 22 },
          { header: "Dirección", key: "direccion", width: 12 },
          { header: "Concepto/Notas", key: "concepto", width: 32 },
          { header: "Monto", key: "monto", width: 14 },
          { header: "Moneda", key: "moneda", width: 10 },
          { header: "Caja", key: "caja", width: 22 },
          { header: "Registrado por", key: "registradoPor", width: 24 },
          { header: "Anulado", key: "anulado", width: 10 },
          { header: "Razón", key: "razon", width: 24 },
        ];
        styleHeaderRow(sheet.getRow(1));

        for (const row of result.rows) {
          sheet.addRow({
            fecha: row.transactionDate,
            tipo: KIND_LABELS_ES[row.kind] ?? row.kind,
            direccion: DIRECTION_LABELS_ES[row.direction] ?? row.direction,
            concepto: row.notes ?? "",
            monto: row.amount,
            moneda: row.currency,
            caja: row.cashRegisterName,
            registradoPor: row.recorderName,
            anulado: row.voidedAt ? "Sí" : "No",
            razon: row.voidReason ?? "",
          });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const today = new Date().toISOString().split("T")[0];
        reply
          .header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          )
          .header(
            "Content-Disposition",
            `attachment; filename="mov-egresos-${today}.xlsx"`,
          )
          .send(Buffer.from(buffer as ArrayBuffer));
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "export movements history");
      }
    },
  );
};

// =============================================================================
// Helpers (Phase 109 D-15)
// =============================================================================

/** Spanish labels for the 7 transaction kinds. Mirror of admin frontend. */
const KIND_LABELS_ES: Record<TransactionKind, string> = {
  plan_charge: "Cobro de plan",
  debt_settlement: "Pago de saldo",
  refund: "Reembolso",
  adjustment: "Ajuste",
  advance_payment: "Pago anticipado",
  // Phase 139: movimiento inter-caja + egreso.
  cash_transfer: "Movimiento entre cajas",
  expense: "Egreso",
};

/** Phase 141: Spanish labels for the bandeja "Estado" column. */
const VALIDATION_STATUS_LABELS_ES: Record<string, string> = {
  pendiente: "Pendiente",
  observado: "Observado",
  corregido: "Corregido",
  validado: "Validado",
};

/** Phase 141: Spanish labels for the saldos "Tipo" column. */
const CAJA_TYPE_LABELS_ES: Record<string, string> = {
  efectivo: "Efectivo",
  banco: "Banco",
};

/** Phase 141: Spanish labels for the historial "Dirección" column. */
const DIRECTION_LABELS_ES: Record<string, string> = {
  inflow: "Entrada",
  outflow: "Salida",
};

/**
 * Phase 141: style an exceljs header row (bold + light grey fill). Mirror of
 * the inline styling used by /transactions/export.
 */
function styleHeaderRow(headerRow: import("exceljs").Row): void {
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };
}

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
