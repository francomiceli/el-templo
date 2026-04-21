/**
 * Payments API Routes
 *
 * Admin endpoints for payment recording, voiding, member payment
 * history, global payment list, and financial summary.
 *
 * All routes require authentication and coach/admin/owner/gestion role.
 */

import { FastifyPluginAsync } from "fastify";
import { PaymentService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import type {
  PaymentMethod,
  VoidPaymentInput,
  PaymentListParams,
} from "./types";
import {
  recordPaymentSchema,
  voidPaymentSchema,
  memberPaymentsSchema,
  globalPaymentsSchema,
  financialSummarySchema,
} from "./schemas";

import { PAYMENT_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";

export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  const paymentService = new PaymentService(fastify.db, fastify.log);

  /**
   * Guard: require admin role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(PAYMENT_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso de administrador requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // =========================================================================
  // Member-scoped payment routes
  // =========================================================================

  // POST /members/:userId/payments - Record a payment
  fastify.post<{
    Params: { userId: number };
    Body: {
      amount: number;
      paymentMethod: PaymentMethod;
      paymentDate: string;
      subscriptionId: number;
      reference?: string;
      notes?: string;
    };
  }>(
    "/members/:userId/payments",
    { schema: recordPaymentSchema },
    async (request, reply) => {
      try {
        const payment = await paymentService.recordPayment(
          {
            memberId: request.params.userId,
            subscriptionId: request.body.subscriptionId,
            amount: request.body.amount,
            paymentMethod: request.body.paymentMethod,
            paymentDate: request.body.paymentDate,
            reference: request.body.reference,
            notes: request.body.notes,
          },
          request.user.userId,
        );
        return reply.code(201).send(payment);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "record payment");
      }
    },
  );

  // GET /members/:userId/payments - Member payment history
  fastify.get<{ Params: { userId: number } }>(
    "/members/:userId/payments",
    { schema: memberPaymentsSchema },
    async (request) => {
      const payments = await paymentService.getMemberPayments(
        request.params.userId,
      );
      return { payments };
    },
  );

  // =========================================================================
  // Payment-scoped routes
  // =========================================================================

  // POST /payments/:paymentId/void - Void a payment
  fastify.post<{
    Params: { paymentId: number };
    Body: VoidPaymentInput;
  }>(
    "/payments/:paymentId/void",
    { schema: voidPaymentSchema },
    async (request, reply) => {
      try {
        const payment = await paymentService.voidPayment(
          request.params.paymentId,
          request.body.reason,
          request.user.userId,
        );
        return payment;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "void payment");
      }
    },
  );

  // =========================================================================
  // Global payment routes
  // =========================================================================

  // GET /payments - Global paginated list
  fastify.get<{
    Querystring: {
      branchId?: number;
      paymentMethod?: PaymentMethod;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      page?: number;
      limit?: number;
    };
  }>("/payments", { schema: globalPaymentsSchema }, async (request) => {
    const {
      branchId,
      paymentMethod,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 20,
    } = request.query;

    const params: PaymentListParams = {
      branchId,
      paymentMethod,
      dateFrom,
      dateTo,
      search,
      page,
      limit,
    };

    const result = await paymentService.listPayments(params);
    return { ...result, page, limit };
  });

  // GET /payments/summary - Financial summary
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
    };
  }>(
    "/payments/summary",
    { schema: financialSummarySchema },
    async (request) => {
      const { branchId, dateFrom, dateTo } = request.query;
      return paymentService.getFinancialSummary(branchId, dateFrom, dateTo);
    },
  );
};
