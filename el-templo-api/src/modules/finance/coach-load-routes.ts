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
 *   POST /pay-plan           — cobro del plan: server decides settle-debt (when
 *                              the current sub has outstanding balance) vs renovar
 *                              (new period). coach → charge born PENDIENTE; idempotent.
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

interface CoachPayPlanBody {
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

const coachPayPlanSchema = {
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
  // POST /pay-plan — cobro del plan (CARGA-01/02). The coach sees ONE "Pago de
  // plan" action; the server decides what it actually is so the profe never has
  // to know "renovación" vs "primer plan impago":
  //   - If the member's current sub carries OUTSTANDING debt (e.g. an admin gave
  //     the plan de alta con deuda for the profe to collect on-site) → settle it
  //     with a debt_settlement linked to that sub. NO new period is created.
  //   - Otherwise → renovación (reuses renewSubscription, creates a new period).
  // Either way the charge is born PENDIENTE (recorderRole=coach, server-side)
  // and is idempotent: a duplicate idempotencyKey catches ER_DUP_ENTRY and
  // returns the existing charge as a 200 no-op (D-09 / Pitfall 3).
  // ===================================================================
  fastify.post<{ Body: CoachPayPlanBody }>(
    "/pay-plan",
    { schema: coachPayPlanSchema },
    async (request, reply) => {
      const { userId, amountReceived, paymentMethod, idempotencyKey } =
        request.body;
      try {
        // Outstanding debt on the member's CURRENT sub (active/paused/scheduled)
        // decides settle vs renew. getMemberSubscription excludes expired subs
        // (those are the renewal case), so a null sub here just means "nothing
        // to settle" — fall through to renew, which finds the active/expired sub
        // and 404s itself if there's truly no plan. The balance row already
        // exists when an admin assigned the plan con deuda (recordAssignmentCharge
        // seeds it); amount>0 means there is debt. NOTE: debt on an ALREADY-expired
        // sub is not surfaced here and falls to renovación (rare; in our flow the
        // alta con deuda is always an active sub).
        const sub = await subscriptionService.getMemberSubscription(userId);
        const balanceRow = sub
          ? await balanceService.getRow(
              userId,
              "subscription",
              sub.id,
              sub.currency,
            )
          : null;
        const outstanding =
          balanceRow && balanceRow.amount > 0 ? balanceRow.amount : 0;

        if (sub && outstanding > 0) {
          // ── SETTLE the existing debt — no new period (the plan is already
          // assigned/active; the profe is just collecting what's owed). ──
          const amount = amountReceived ?? outstanding;
          if (amount <= 0) {
            return reply.code(400).send({
              error: "Solicitud invalida",
              message: "El monto debe ser mayor a cero",
            });
          }
          if (amount > outstanding) {
            return reply.code(400).send({
              error: "Solicitud invalida",
              message: `El monto no puede exceder la deuda ($${outstanding})`,
            });
          }
          const today = new Date().toISOString().split("T")[0];
          const branchId = await resolveMemberBranchId(userId);
          // Server-derived role → status (coach → pendiente).
          const initialStatus = (["coach"] as readonly string[]).includes(
            request.user.role,
          )
            ? "pendiente"
            : "validado";

          const detail = await transactionService.create(
            {
              memberId: userId,
              kind: "debt_settlement",
              direction: "inflow",
              amount,
              currency: sub.currency,
              paymentMethod,
              transactionDate: today,
              effectiveDate: today,
              branchId,
              notes: `Pago de saldo plan ${sub.planName}`,
              validationStatus: initialStatus,
              idempotencyKey,
              links: [
                {
                  targetKind: "subscription",
                  targetId: sub.id,
                  allocatedAmount: amount,
                },
              ],
            },
            request.user.userId,
          );
          return reply
            .code(201)
            .send({ subscription: sub, transaction: detail });
        }

        // ── RENEW — no debt, so create a new period (existing behaviour). ──
        const subscription = await subscriptionService.renewSubscription(
          userId,
          {
            paymentMethod,
            amountReceived,
            // Server-derived role → status (coach → pendiente). Not a literal so
            // a future admin-callable variant stays correct.
            recorderRole: request.user.role as AdminRole,
            idempotencyKey,
          },
          request.user.userId,
        );
        // The charge carries the idempotencyKey (renewalPrice>0 → a charge was
        // created); a free renewal (price 0) produces no charge → transaction null.
        const transaction =
          await transactionService.findByIdempotencyKey(idempotencyKey);
        return reply.code(201).send({ subscription, transaction });
      } catch (err: unknown) {
        // D-09 / Pitfall 3: a duplicate idempotency key means this exact load
        // already happened — the settle/renewal tx rolled back wholesale. Re-read
        // the existing charge (fresh connection) and return it as a 200 no-op.
        if (isDuplicateKeyError(err).isDuplicate) {
          const existing =
            await transactionService.findByIdempotencyKey(idempotencyKey);
          if (existing) {
            const subscription =
              await subscriptionService.getMemberSubscription(userId);
            return reply
              .code(200)
              .send({ subscription, transaction: existing });
          }
        }
        handleServiceError(err, reply, request.log, "coach pay-plan load");
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
  //
  // `intent` mirrors POST /pay-plan's server-side decision so the form pre-fills
  // the right amount WITHOUT the profe choosing renovación vs primer plan:
  //   - 'settle' → the current sub has outstanding debt; amount = that debt.
  //   - 'renew'  → no debt; amount = the plan price (a new period would be created).
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
            intent: null,
            outstanding: 0,
          });
        }
        const balanceRow = await balanceService.getRow(
          request.params.userId,
          "subscription",
          sub.id,
          sub.currency,
        );
        const outstanding =
          balanceRow && balanceRow.amount > 0 ? balanceRow.amount : 0;
        return reply.send({
          hasRenewable: true,
          planName: sub.planName,
          // Pre-fill the debt when there is one, else the plan price.
          amount: outstanding > 0 ? outstanding : sub.pricePaid,
          currency: sub.currency,
          intent: outstanding > 0 ? "settle" : "renew",
          outstanding,
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
