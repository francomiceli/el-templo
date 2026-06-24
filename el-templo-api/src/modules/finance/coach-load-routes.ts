/**
 * Phase 140 — Coach PoS load routes (CARGA-01..04).
 *
 * A DEDICATED Fastify plugin mounted at /api/admin/finance/coach-load, SEPARATE
 * from finance/routes.ts. The finance module carries a module-level onRequest
 * guard using FINANCE_READ_ROLES (coach excluded for privacy, Phase 106 D-04);
 * mounting coach endpoints there would be blocked by that hook before any
 * per-handler check runs (Open Question Q1). This plugin therefore declares its
 * OWN onRequest hook: authenticate → FINANCE_LOAD_ROLES gate (coach ∈) →
 * attachCountryScope. coach stays ABSENT from FINANCE_VOID/ADJUSTMENT/READ.
 *
 * Endpoints (all thin handlers reusing the 137/138 primitives):
 *   POST /renew              — renovar plan (reuses renewSubscription; coach →
 *                              charge born PENDIENTE; idempotent).
 *   POST /misc               — cobro suelto (advance_payment, empty links,
 *                              concepto→notes; member balance untouched; idempotent).
 *   GET  /autocompletar/:id  — member's current plan + amount + currency.
 *   GET  /mis-cargas         — the calling coach's OWN loads only (recordedBy
 *                              FORCED to self server-side, never from the query).
 *
 * Server-derived, NEVER from the body: validation_status (role→status),
 * cash_register_id (resolveCashRegister), branchId (member's branch + Templo
 * Online fallback), recordedBy. The route schemas reject validationStatus /
 * cashRegisterId outright.
 */

import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { TransactionService, BalanceService, CashRegisterService } from ".";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import { EnrollmentService } from "../programs/enrollment-service";
import { handleServiceError } from "../shared/error-handler";
import { FINANCE_LOAD_ROLES, type AdminRole } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { isDuplicateKeyError } from "../shared/sql-errors";
import * as schema from "../../db/schema";
import type { TransactionDetail } from "./types";

// ── Body shapes ────────────────────────────────────────────────────────────

interface CoachRenewLoadBody {
  userId: number;
  amountReceived?: number;
  paymentMethod: "cash" | "transfer" | "card" | "aura_credit" | "internal";
  idempotencyKey: string;
}

interface CoachMiscLoadBody {
  memberId: number;
  amount: number;
  concepto: string;
  paymentMethod: "cash" | "transfer" | "card" | "aura_credit" | "internal";
  currency?: string;
  idempotencyKey: string;
}

// ── JSON schemas (reject validationStatus / cashRegisterId) ──────────────────

const PAYMENT_METHOD_ENUM = [
  "cash",
  "transfer",
  "card",
  "aura_credit",
  "internal",
] as const;

const coachRenewLoadSchema = {
  body: {
    type: "object",
    required: ["userId", "paymentMethod", "idempotencyKey"],
    additionalProperties: false,
    properties: {
      userId: { type: "integer", minimum: 1 },
      amountReceived: { type: "integer", minimum: 0 },
      paymentMethod: { type: "string", enum: PAYMENT_METHOD_ENUM },
      idempotencyKey: { type: "string", minLength: 1, maxLength: 64 },
    },
  },
} as const;

const coachMiscLoadSchema = {
  body: {
    type: "object",
    required: [
      "memberId",
      "amount",
      "concepto",
      "paymentMethod",
      "idempotencyKey",
    ],
    additionalProperties: false,
    properties: {
      memberId: { type: "integer", minimum: 1 },
      amount: { type: "integer", minimum: 0 },
      concepto: { type: "string", minLength: 1, maxLength: 500 },
      paymentMethod: { type: "string", enum: PAYMENT_METHOD_ENUM },
      currency: { type: "string", minLength: 1, maxLength: 8 },
      idempotencyKey: { type: "string", minLength: 1, maxLength: 64 },
    },
  },
} as const;

const autocompletarSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: { userId: { type: "integer", minimum: 1 } },
  },
} as const;

export const coachLoadRoutes: FastifyPluginAsync = async (fastify) => {
  const balanceService = new BalanceService(fastify.db, fastify.log);
  const cashRegisterService = new CashRegisterService(fastify.db, fastify.log);
  const transactionService = new TransactionService(
    fastify.db,
    fastify.log,
    balanceService,
    cashRegisterService,
  );
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

  // ── Module guard: authenticate + FINANCE_LOAD_ROLES (coach ∈) + scope ──
  // SEPARATE from finance/routes.ts so the FINANCE_READ_ROLES module hook there
  // (coach excluded) never blocks these. T-140-04: coach can ONLY reach these
  // load endpoints — never validate/void/adjustment/full-read.
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (
      !(FINANCE_LOAD_ROLES as readonly string[]).includes(request.user.role)
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Sin permiso de carga",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // ── Resolve a member's branchId server-side (Pitfall 4): mirror of
  // renewSubscription's renewBranchId resolution incl. the virtual "Templo
  // Online" fallback. For cash the caja is by-branch, so the member's branch is
  // the correct one; for transfer/card the caja is by-currency (branch moot).
  const resolveMemberBranchId = async (memberId: number): Promise<number> => {
    const [memberBranchRow] = await fastify.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(eq(schema.users.id, memberId))
      .limit(1);
    if (memberBranchRow?.branchId) return memberBranchRow.branchId;
    const [virtualBranch] = await fastify.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.name, "Templo Online"))
      .limit(1);
    if (!virtualBranch) {
      throw new Error(
        "Branch 'Templo Online' no encontrada al resolver branchId del cobro suelto",
      );
    }
    return virtualBranch.id;
  };

  // ===================================================================
  // POST /renew — renovar plan (CARGA-01/02). Reuses renewSubscription with
  // recorderRole derived SERVER-SIDE from the authenticated role (coach →
  // pendiente) + the client idempotencyKey. Idempotent: a duplicate key catches
  // ER_DUP_ENTRY (the whole renewal tx rolls back) and returns the existing
  // charge + its already-active subscription as a 200 no-op (Pitfall 3).
  // ===================================================================
  fastify.post<{ Body: CoachRenewLoadBody }>(
    "/renew",
    { schema: coachRenewLoadSchema },
    async (request, reply) => {
      try {
        const subscription = await subscriptionService.renewSubscription(
          request.body.userId,
          {
            paymentMethod: request.body.paymentMethod,
            amountReceived: request.body.amountReceived,
            // Server-derived role → status (coach → pendiente). Not a literal so
            // a future admin-callable variant stays correct.
            recorderRole: request.user.role as AdminRole,
            idempotencyKey: request.body.idempotencyKey,
          },
          request.user.userId,
        );
        // Return the charge alongside the subscription so the PoS ticket has it
        // AND the 201/200 (no-op) response shapes match. The charge carries the
        // idempotencyKey (renewalPrice>0 → a charge was created); a free renewal
        // (price 0) produces no charge → transaction null.
        const transaction = await transactionService.findByIdempotencyKey(
          request.body.idempotencyKey,
        );
        return reply.code(201).send({ subscription, transaction });
      } catch (err: unknown) {
        // Pitfall 3 / D-09: a duplicate idempotency key means this exact load
        // already happened — the renewal tx rolled back wholesale. Re-read the
        // existing charge (fresh connection) and return it as a 200 no-op.
        if (isDuplicateKeyError(err).isDuplicate) {
          const existing = await transactionService.findByIdempotencyKey(
            request.body.idempotencyKey,
          );
          if (existing) {
            const subscription =
              await subscriptionService.getMemberSubscription(
                request.body.userId,
              );
            return reply
              .code(200)
              .send({ subscription, transaction: existing });
          }
        }
        handleServiceError(err, reply, request.log, "coach renew load");
      }
    },
  );

  // ===================================================================
  // POST /misc — cobro suelto (CARGA-03). advance_payment, empty links (∈
  // KINDS_ALLOWED_WITHOUT_LINKS → applyDelta no-ops, member balance untouched),
  // concepto→notes, branchId server-derived. Born PENDIENTE (coach). Idempotent.
  // ===================================================================
  fastify.post<{ Body: CoachMiscLoadBody }>(
    "/misc",
    { schema: coachMiscLoadSchema },
    async (request, reply) => {
      const today = new Date().toISOString().split("T")[0];
      try {
        const branchId = await resolveMemberBranchId(request.body.memberId);
        // Server-derived role → status (coach → pendiente).
        const initialStatus = (["coach"] as readonly string[]).includes(
          request.user.role,
        )
          ? "pendiente"
          : "validado";

        const detail = await transactionService.create(
          {
            memberId: request.body.memberId,
            kind: "advance_payment",
            direction: "inflow",
            amount: request.body.amount,
            currency: request.body.currency ?? "ARS",
            paymentMethod: request.body.paymentMethod,
            transactionDate: today,
            effectiveDate: today,
            branchId,
            notes: request.body.concepto,
            validationStatus: initialStatus,
            idempotencyKey: request.body.idempotencyKey,
            links: [],
          },
          request.user.userId,
        );
        return reply.code(201).send({ transaction: detail });
      } catch (err: unknown) {
        // D-09: idempotent no-op on a duplicate key — re-read + return existing.
        if (isDuplicateKeyError(err).isDuplicate) {
          const existing = await transactionService.findByIdempotencyKey(
            request.body.idempotencyKey,
          );
          if (existing) {
            return reply.code(200).send({ transaction: existing });
          }
        }
        handleServiceError(err, reply, request.log, "coach misc load");
      }
    },
  );

  // ===================================================================
  // GET /autocompletar/:userId — the member's current plan + amount + currency
  // for the typeahead pre-fill (CARGA-01). Reuses getMemberSubscription (no new
  // service method). hasRenewable=false when there is no active/paused sub.
  // ===================================================================
  fastify.get<{ Params: { userId: number } }>(
    "/autocompletar/:userId",
    { schema: autocompletarSchema },
    async (request, reply) => {
      try {
        const sub = await subscriptionService.getMemberSubscription(
          request.params.userId,
        );
        if (!sub) {
          return reply.send({
            hasRenewable: false,
            planName: null,
            amount: null,
            currency: null,
          });
        }
        return reply.send({
          hasRenewable: true,
          planName: sub.planName,
          amount: sub.pricePaid,
          currency: sub.currency,
        });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "coach autocompletar");
      }
    },
  );

  // ===================================================================
  // GET /mis-cargas — the calling coach's OWN loads only (D-07). recordedBy is
  // FORCED to request.user.userId server-side (never from the query) so a coach
  // never sees other coaches' loads, the full ledger, or caja saldos.
  // ===================================================================
  fastify.get("/mis-cargas", async (request, reply) => {
    try {
      const result = await transactionService.list({
        recordedBy: request.user.userId,
        limit: 50,
      });
      return reply.send(result);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "coach mis-cargas");
    }
  });
};

// Re-export the detail type so route consumers (tests) can import it from here.
export type { TransactionDetail };
