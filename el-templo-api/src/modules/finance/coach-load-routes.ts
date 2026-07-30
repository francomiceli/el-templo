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
 *   GET  /mis-cargas         — for coach: OWN loads only (recordedBy FORCED to
 *                              self server-side, never from the query). Other
 *                              roles (owner/admin/gestion/recepcion): ALL loads.
 *
 * Server-derived, NEVER from the body: validation_status (role→status),
 * cash_register_id (resolveCashRegister), branchId (member's branch + Templo
 * Online fallback), recordedBy. The route schemas reject validationStatus /
 * cashRegisterId outright.
 */

import { FastifyPluginAsync } from "fastify";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { TransactionService, BalanceService, CashRegisterService } from ".";
import { SubscriptionService } from "../subscriptions/service";
import type { PriceType } from "../subscriptions/types";
import { MemberService } from "../members/service";
import { AuraService } from "../aura/service";
import { EnrollmentService } from "../programs/enrollment-service";
import { BookingService } from "../scheduling/booking-service";
import { NotificationService } from "../notifications/service";
import { handleServiceError } from "../shared/error-handler";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { FINANCE_LOAD_ROLES, type AdminRole } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import {
  assertTenant,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { requireBranchAccess } from "../shared/branch-access";
import { isDuplicateKeyError } from "../shared/sql-errors";
import * as schema from "../../db/schema";
import type { PaymentMethod, TransactionDetail } from "./types";

// ── Body shapes ────────────────────────────────────────────────────────────

interface CoachPayPlanBody {
  userId: number;
  amountReceived?: number;
  paymentMethod: "cash" | "transfer" | "card" | "aura_credit" | "internal";
  idempotencyKey: string;
  // Phase 151 (COBRO-04): cuenta banco elegida en la PoS. Obligatoria para
  // transfer/card, prohibida para cash — validada server-side en el handler.
  bankAccountId?: number;
  // CR-CAJA (2026-07-24): sede del cobro elegida en el select. OPCIONAL — default
  // = sede del socio. Gated por requireBranchAccess (optional). Es el branch_id
  // del ledger/charge Y la sede desde la que se resuelve la caja de efectivo.
  branchId?: number;
}

interface CoachMiscLoadBody {
  memberId: number;
  amount: number;
  concepto: string;
  paymentMethod: "cash" | "transfer" | "card" | "aura_credit" | "internal";
  currency?: string;
  idempotencyKey: string;
  // Phase 145 (COBRO-01): structured motivo del cobro suelto. REQUIRED (the PoS
  // dropdown is obligatorio); persisted to misc_reason, NOT to notes.
  miscReason: "sin_plan" | "otro";
  // Phase 151 (COBRO-04): cuenta banco elegida en la PoS. Obligatoria para
  // transfer/card, prohibida para cash — validada server-side en el handler.
  bankAccountId?: number;
  // CR-CAJA (2026-07-24): sede del cobro elegida en el select. OPCIONAL — default
  // = sede del socio. Gated por requireBranchAccess (optional). Es el branch_id
  // del ledger/charge Y la sede desde la que se resuelve la caja de efectivo.
  branchId?: number;
}

// Phase 148 (ALTA-01..07): alta de alumno + plan en el cobro. El profe resuelve
// un alumno existente (`userId`) O crea uno nuevo (`firstName`+`lastName`+`dni`,
// dedup por DNI antes de crear) y le asigna un plan + turnos + cobro 'pendiente'.
// `branchId` (sede elegida) es NUEVO en este plugin → gated por requireBranchAccess.
interface CoachAltaBody {
  // Rama "alumno existente" (XOR con la rama "alumno nuevo" — validado en el handler).
  userId?: number;
  // Rama "alumno nuevo" (los 3 juntos; dedup por DNI antes de crear).
  firstName?: string;
  lastName?: string;
  dni?: string;
  // Sede elegida del socio (catálogo real). Gated por requireBranchAccess.
  branchId: number;
  planId: number;
  // Toggle "Precio Zero". paymentMethod 'card' override a priceCreditCard en el handler.
  zero?: boolean;
  paymentMethod: "cash" | "transfer" | "card" | "aura_credit" | "internal";
  // Monto recibido (cents). < precio → deja deuda (assignPlan lo soporta).
  amountReceived?: number;
  // Solo planes fixed: assignPlan valida length === plan.classesPerWeek.
  scheduleIds?: number[];
  notes?: string;
  idempotencyKey: string;
  // Phase 151 (COBRO-04): cuenta banco elegida en la PoS. Obligatoria para
  // transfer/card, prohibida para cash — validada server-side en el handler.
  bankAccountId?: number;
}

// ── JSON schemas (reject validationStatus / cashRegisterId) ──────────────────
// CAJA-04 (T-146-01): `additionalProperties:false` + properties SIN cashRegisterId
// mantiene el invariante v5.3: el body NUNCA elige una caja cruda. CR-CAJA
// (2026-07-24) SÍ acepta un `branchId` (sede del cobro) opcional, gateado por
// requireBranchAccess — la caja efectivo se resuelve server-side desde esa sede
// (default = sede del socio), nunca por id de caja directo.

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
      // Phase 151 (COBRO-04): opcional en el schema; el requisito transfer/card
      // (payment-method-dependent) se enforce en el handler, no en JSON-Schema.
      bankAccountId: { type: "integer", minimum: 1 },
      // CR-CAJA (2026-07-24): sede del cobro (opcional, default sede del socio).
      // Gated por requireBranchAccess en el preHandler.
      branchId: { type: "integer", minimum: 1 },
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
      "miscReason",
    ],
    additionalProperties: false,
    properties: {
      memberId: { type: "integer", minimum: 1 },
      amount: { type: "integer", minimum: 0 },
      concepto: { type: "string", minLength: 1, maxLength: 500 },
      paymentMethod: { type: "string", enum: PAYMENT_METHOD_ENUM },
      currency: { type: "string", minLength: 1, maxLength: 8 },
      idempotencyKey: { type: "string", minLength: 1, maxLength: 64 },
      // Phase 145 (COBRO-01 / T-145-01): closed enum, additionalProperties:false
      // rejects anything outside ["sin_plan","otro"] with a 400.
      miscReason: { type: "string", enum: ["sin_plan", "otro"] },
      // Phase 151 (COBRO-04): opcional en el schema; el requisito transfer/card
      // (payment-method-dependent) se enforce en el handler, no en JSON-Schema.
      bankAccountId: { type: "integer", minimum: 1 },
      // CR-CAJA (2026-07-24): sede del cobro (opcional, default sede del socio).
      // Gated por requireBranchAccess en el preHandler.
      branchId: { type: "integer", minimum: 1 },
    },
  },
} as const;

// Phase 148 (ALTA-01..07 / T-148-10): mismo contrato server-derived que pay-plan/misc
// — additionalProperties:false + SIN cashRegisterId/validationStatus (CR-CAJA: la caja
// sigue el branchId del alta — la sede del cobro; el status nace del rol, nunca del
// body). La XOR
// userId ↔ {firstName,lastName,dni} se valida en el handler (JSON-Schema no la expresa
// de forma limpia con additionalProperties:false).
const coachAltaSchema = {
  body: {
    type: "object",
    required: ["branchId", "planId", "paymentMethod", "idempotencyKey"],
    additionalProperties: false,
    properties: {
      // Rama "alumno existente".
      userId: { type: "integer", minimum: 1 },
      // Rama "alumno nuevo" (dedup por DNI antes de crear).
      firstName: { type: "string", minLength: 1, maxLength: 100 },
      lastName: { type: "string", minLength: 1, maxLength: 100 },
      dni: { type: "string", minLength: 1, maxLength: 32 },
      // Sede elegida (NUEVO en este plugin — gated por requireBranchAccess).
      branchId: { type: "integer", minimum: 1 },
      planId: { type: "integer", minimum: 1 },
      zero: { type: "boolean" },
      paymentMethod: { type: "string", enum: PAYMENT_METHOD_ENUM },
      amountReceived: { type: "integer", minimum: 0 },
      scheduleIds: {
        type: "array",
        items: { type: "integer", minimum: 1 },
      },
      notes: { type: "string", maxLength: 500 },
      idempotencyKey: { type: "string", minLength: 1, maxLength: 64 },
      // Phase 151 (COBRO-04): opcional en el schema; el requisito transfer/card
      // (payment-method-dependent) se enforce en el handler, no en JSON-Schema.
      bankAccountId: { type: "integer", minimum: 1 },
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
  // Phase 148: assignPlan genera los bookings recurrentes de un plan fixed SOLO si
  // el SubscriptionService tiene un BookingService inyectado (subscriptions/routes
  // y members/routes lo wirean igual). Sin esto, los subscription_schedules se
  // insertan pero NO se generan bookings → el alta de un plan fixed quedaría sin
  // turnos materializados.
  const notificationService = new NotificationService(fastify.db, fastify.log);
  const bookingService = new BookingService(
    fastify.db,
    fastify.log,
    subscriptionService,
    notificationService,
  );
  subscriptionService.setBookingService(bookingService);
  // Phase 148: el orquestador /alta resuelve/crea el alumno (dedup por DNI) antes
  // de assignPlan. memberService NO estaba wireado en este plugin (solo en
  // members/routes.ts) — se instancia igual que ahí (fastify.db, fastify.log).
  const memberService = new MemberService(fastify.db, fastify.log);

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

  // ── Resolve the member's default branchId server-side (Pitfall 4):
  // users.branchId with the virtual "Templo Online" fallback (mirror of
  // renewSubscription's renewBranchId resolution). Es el DEFAULT de la sede del
  // cobro cuando el body no trae `branchId` (select de Sede sin tocar).
  const resolveUserBranchId = async (userId: number): Promise<number> => {
    const [branchRow] = await fastify.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (branchRow?.branchId) return branchRow.branchId;
    const [virtualBranch] = await fastify.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.name, "Templo Online"))
      .limit(1);
    if (!virtualBranch) {
      throw new Error(
        "Branch 'Templo Online' no encontrada al resolver branchId del cobro",
      );
    }
    return virtualBranch.id;
  };

  // CR-CAJA (2026-07-24): sede DEFAULT del cobro = la del SOCIO (users.branchId).
  // Es el branch_id del ledger/charge Y la sede desde la que create() resuelve la
  // caja de efectivo cuando el body no manda un `branchId` explícito (el select de
  // Sede de la PoS). El operador puede overridear con `body.branchId`.
  const resolveMemberBranchId = (memberId: number): Promise<number> =>
    resolveUserBranchId(memberId);

  // ── Phase 151 (COBRO-04 / T-151-01): guard compartido de cuenta banco ──
  // Mueve la imputación al punto de venta sin romper el invariante v5.3: el body
  // NO puede elegir `cashRegisterId` (additionalProperties:false), solo un
  // `bankAccountId` que se valida server-side. Reglas dependientes del medio de
  // pago (no expresables en JSON-Schema):
  //   - transfer/card SIN bankAccountId → 400 (obligatorio).
  //   - transfer/card CON bankAccountId → assertChosenBankAccount (banco + activa
  //     + moneda-match); id inválido → BadRequestError → handleServiceError → 400.
  //   - cash CON bankAccountId → 400 (no corresponde).
  // `getCurrency` es un thunk: la moneda del cobro solo se resuelve cuando de
  // verdad hace falta (transfer/card con id), evitando queries/errores en el
  // camino cash. Devuelve el id validado (o undefined) para imputarlo al charge.
  // Fase 172: el `ctx` va PRIMERO también en este closure. No tiene `request` a
  // mano (es del plugin, no del handler), así que cada uno de sus 4 call sites lo
  // resuelve con `assertTenant(request.scope, …)` — el compilador obliga a
  // mirarlos todos.
  const validateBankAccountForCharge = async (
    ctx: TenantContext,
    paymentMethod: PaymentMethod,
    bankAccountId: number | undefined,
    getCurrency: () => Promise<string>,
  ): Promise<number | undefined> => {
    const isBankMethod =
      paymentMethod === "transfer" || paymentMethod === "card";
    if (!isBankMethod) {
      if (bankAccountId !== undefined) {
        throw new BadRequestError(
          "No corresponde cuenta bancaria para pagos en efectivo.",
        );
      }
      return undefined;
    }
    if (bankAccountId === undefined) {
      throw new BadRequestError(
        "Elegí una cuenta bancaria para cobrar por transferencia o tarjeta.",
      );
    }
    const currency = await getCurrency();
    await cashRegisterService.assertChosenBankAccount(
      ctx,
      bankAccountId,
      currency,
    );
    return bankAccountId;
  };

  // COBRO-04: moneda del cobro de renovación = la de la sub renovable (active gana
  // sobre expired, igual que renewSubscription's currentSub). Se resuelve en la
  // ruta para validar la cuenta banco elegida ANTES de delegar en renewSubscription.
  const resolveRenewCurrency = async (userId: number): Promise<string> => {
    const [row] = await fastify.db
      .select({ currency: schema.subscriptions.currency })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          or(
            eq(schema.subscriptions.status, "active"),
            eq(schema.subscriptions.status, "expired"),
          ),
        ),
      )
      .orderBy(
        sql`CASE ${schema.subscriptions.status} WHEN 'active' THEN 0 ELSE 1 END`,
        desc(schema.subscriptions.createdAt),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundError("No se encontro suscripcion para renovar");
    }
    return row.currency;
  };

  // COBRO-04: moneda del cobro del alta = la del plan elegido (assignPlan usa
  // plan.currency). Se resuelve en la ruta para validar la cuenta banco antes de
  // delegar en assignPlan.
  const resolvePlanCurrency = async (planId: number): Promise<string> => {
    const [row] = await fastify.db
      .select({ currency: schema.subscriptionPlans.currency })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId))
      .limit(1);
    if (!row) {
      throw new NotFoundError("Plan no encontrado");
    }
    return row.currency;
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
    {
      schema: coachPayPlanSchema,
      // CR-CAJA: gatea la sede del cobro cuando el operador la eligió (optional →
      // sin branchId, default a la sede del socio, sin check).
      preHandler: requireBranchAccess({
        from: "body.branchId",
        optional: true,
      }),
    },
    async (request, reply) => {
      const {
        userId,
        amountReceived,
        paymentMethod,
        idempotencyKey,
        bankAccountId,
        branchId: chosenBranchId,
      } = request.body;
      try {
        // Fase 172 (ADO-01): el gimnasio se resuelve UNA vez por handler y se
        // reusa — este handler llama a varios metodos del service y a
        // validateBankAccountForCharge, y un solo assertTenant deja un unico
        // 403 TENANT_UNRESOLVED que nombra la ruta.
        const ctx = assertTenant(request.scope, "coach-load.pay-plan");
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
              ctx,
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
          // CR-CAJA: sede del cobro = la elegida en el select (gated) o, por
          // default, la del socio. Es el branch_id del ledger Y la sede desde la
          // que create() resuelve la caja de efectivo.
          const branchId =
            chosenBranchId ?? (await resolveMemberBranchId(userId));
          // COBRO-04: cuenta banco elegida en la PoS (transfer/card) → imputación
          // directa del charge. Para cash queda undefined → create resuelve la
          // caja EFECTIVO desde `branchId` (la sede del cobro).
          const chosenBankAccountId = await validateBankAccountForCharge(
            ctx,
            paymentMethod,
            bankAccountId,
            async () => sub.currency,
          );
          // Server-derived role → status (coach → pendiente).
          const initialStatus = (["coach"] as readonly string[]).includes(
            request.user.role,
          )
            ? "pendiente"
            : "validado";

          const detail = await transactionService.create(
            ctx,
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
              cashRegisterId: chosenBankAccountId,
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
          request.log.info(
            {
              memberId: userId,
              branchId,
              chosenBranchId: chosenBranchId ?? null,
              paymentMethod,
            },
            "coach pay-plan settle: caja por sede del cobro",
          );
          return reply
            .code(201)
            .send({ subscription: sub, transaction: detail });
        }

        // ── RENEW — no debt, so create a new period (existing behaviour). ──
        // COBRO-04: cuenta banco elegida en la PoS (transfer/card) → override de
        // caja del charge de renovación. La moneda del cobro = la de la sub
        // renovable. Para cash queda undefined → la caja se resuelve desde la sede
        // del cobro (renewBranchId).
        const chosenBankAccountId = await validateBankAccountForCharge(
          ctx,
          paymentMethod,
          bankAccountId,
          () => resolveRenewCurrency(userId),
        );
        const subscription = await subscriptionService.renewSubscription(
          ctx,
          userId,
          {
            paymentMethod,
            amountReceived,
            // Server-derived role → status (coach → pendiente). Not a literal so
            // a future admin-callable variant stays correct.
            recorderRole: request.user.role as AdminRole,
            idempotencyKey,
            // CR-CAJA: sede del cobro elegida en el select (gated). undefined →
            // renew la deriva de users.branchId del socio. Es el branch_id del
            // ledger/charge Y la sede desde la que se resuelve la caja efectivo.
            branchId: chosenBranchId,
            // COBRO-04: cuenta banco pre-validada → bypassa la resolución por
            // sede en el service. undefined (cash) → sin cambio.
            cashRegisterIdOverride: chosenBankAccountId,
          },
          request.user.userId,
        );
        // The charge carries the idempotencyKey (renewalPrice>0 → a charge was
        // created); a free renewal (price 0) produces no charge → transaction null.
        const transaction = await transactionService.findByIdempotencyKey(
          ctx,
          idempotencyKey,
        );
        return reply.code(201).send({ subscription, transaction });
      } catch (err: unknown) {
        // D-09 / Pitfall 3: a duplicate idempotency key means this exact load
        // already happened — the settle/renewal tx rolled back wholesale. Re-read
        // the existing charge (fresh connection) and return it as a 200 no-op.
        if (isDuplicateKeyError(err).isDuplicate) {
          const existing = await transactionService.findByIdempotencyKey(
            assertTenant(request.scope, "coach-load.pay-plan.replay"),
            idempotencyKey,
          );
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
    {
      schema: coachMiscLoadSchema,
      // CR-CAJA: gatea la sede del cobro si el operador la eligió (optional).
      preHandler: requireBranchAccess({
        from: "body.branchId",
        optional: true,
      }),
    },
    async (request, reply) => {
      const today = new Date().toISOString().split("T")[0];
      try {
        // Fase 172 (ADO-01): el gimnasio se resuelve UNA vez por handler y se
        // reusa — este handler llama a varios metodos del service y a
        // validateBankAccountForCharge, y un solo assertTenant deja un unico
        // 403 TENANT_UNRESOLVED que nombra la ruta.
        const ctx = assertTenant(request.scope, "coach-load.misc");
        // CR-CAJA: sede del cobro = la elegida en el select (gated) o, por
        // default, la del socio. Es el branch_id del ledger Y la sede desde la que
        // create() resuelve la caja de efectivo.
        const branchId =
          request.body.branchId ??
          (await resolveMemberBranchId(request.body.memberId));
        const currency = request.body.currency ?? "ARS";
        // COBRO-04: cuenta banco elegida en la PoS (transfer/card) → imputación
        // directa del charge. Para cash queda undefined → create resuelve la caja
        // EFECTIVO desde `branchId` (la sede del cobro).
        const chosenBankAccountId = await validateBankAccountForCharge(
          ctx,
          request.body.paymentMethod,
          request.body.bankAccountId,
          async () => currency,
        );
        // Server-derived role → status (coach → pendiente).
        const initialStatus = (["coach"] as readonly string[]).includes(
          request.user.role,
        )
          ? "pendiente"
          : "validado";

        const detail = await transactionService.create(
          ctx,
          {
            memberId: request.body.memberId,
            kind: "advance_payment",
            direction: "inflow",
            amount: request.body.amount,
            currency,
            paymentMethod: request.body.paymentMethod,
            transactionDate: today,
            effectiveDate: today,
            branchId,
            cashRegisterId: chosenBankAccountId,
            notes: request.body.concepto,
            // Phase 145 (COBRO-01): structured motivo → own column, not notes.
            miscReason: request.body.miscReason,
            validationStatus: initialStatus,
            idempotencyKey: request.body.idempotencyKey,
            links: [],
          },
          request.user.userId,
        );
        request.log.info(
          {
            memberId: request.body.memberId,
            branchId,
            chosenBranchId: request.body.branchId ?? null,
            paymentMethod: request.body.paymentMethod,
          },
          "coach misc load: caja por sede del cobro",
        );
        return reply.code(201).send({ transaction: detail });
      } catch (err: unknown) {
        // D-09: idempotent no-op on a duplicate key — re-read + return existing.
        if (isDuplicateKeyError(err).isDuplicate) {
          const existing = await transactionService.findByIdempotencyKey(
            assertTenant(request.scope, "coach-load.misc.replay"),
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
  // POST /alta — alta de alumno + plan en el cobro (ALTA-01..07). El CORAZÓN de
  // la Fase 148: reemplaza el Google Form→Excel→admin. Orquesta de forma
  // idempotente, en DOS transacciones encadenadas (W-1):
  //   (a) Resolver alumno: `userId` directo → usarlo (createdMemberId=null); si
  //       no, dedup por DNI (checkDuplicates) → match no-borrado ⇒ usar el
  //       existente (createdMemberId=null); si no ⇒ createMinimalMember en SU
  //       PROPIA tx (createdMemberId = id del nuevo alumno).
  //   (b) assignPlan(memberId, ...) crea sub + charge 'pendiente' (recorderRole=
  //       'coach', server-derived) + bookings fixed DENTRO de su tx, y —gracias a
  //       148-01— graba `createdMemberId` en el MISMO insert del charge (sin
  //       UPDATE suelto ni 3ª tx → sin ventana de crash que deje el id huérfano).
  //
  // branchId (sede elegida) gated por requireBranchAccess (preHandler). CR-CAJA:
  // esa sede es el branch_id del ledger/charge Y la sede desde la que se resuelve
  // la caja de efectivo (default del select = sede del socio), NO la del profe.
  //
  // Idempotencia: la orquestación completa es un replay seguro. Un doble-submit
  // con el mismo idempotencyKey captura isDuplicateKeyError → findByIdempotencyKey
  // → 200 con el charge existente; createMinimalMember es idempotente por el
  // UNIQUE de dni (148-01), así que un replay NO crea 2º alumno ni 2º charge.
  // ===================================================================
  fastify.post<{ Body: CoachAltaBody }>(
    "/alta",
    {
      schema: coachAltaSchema,
      preHandler: requireBranchAccess({ from: "body.branchId" }),
    },
    async (request, reply) => {
      const body = request.body;
      try {
        // Fase 172 (ADO-01): el gimnasio se resuelve UNA vez por handler y se
        // reusa — este handler llama a varios metodos del service y a
        // validateBankAccountForCharge, y un solo assertTenant deja un unico
        // 403 TENANT_UNRESOLVED que nombra la ruta.
        const ctx = assertTenant(request.scope, "coach-load.alta");
        // ── Idempotencia (D-09 / W-1): replay-short-circuit ANTES de assignPlan ──
        // Un doble-submit con el MISMO idempotencyKey NO puede caer al catch de
        // abajo: en el replay el alumno ya tiene la sub activa del 1er POST, así
        // que assignPlan tira ConflictError (NO un duplicate-key) ANTES de intentar
        // re-insertar el charge. Por eso re-leemos acá el charge ya persistido (el
        // alumno + charge nacieron atómicos en el 1er POST) y devolvemos 200 no-op.
        const replay = await transactionService.findByIdempotencyKey(
          ctx,
          body.idempotencyKey,
        );
        if (replay) {
          return reply.code(200).send({ transaction: replay });
        }

        // ── COBRO-04: validar la cuenta banco ANTES de crear el alumno/plan ──
        // Un id inválido (o transfer/card sin cuenta, o cash con cuenta) rechaza
        // acá con 400 sin efectos colaterales (no se crea alumno ni sub). La
        // moneda del cobro es la del plan elegido.
        const chosenBankAccountId = await validateBankAccountForCharge(
          ctx,
          body.paymentMethod,
          body.bankAccountId,
          () => resolvePlanCurrency(body.planId),
        );

        // ── (a) Resolver/crear alumno ───────────────────────────────────────
        // createdMemberId = id SOLO cuando ESTA carga creó el alumno (para el
        // cascade de void 148-03 y el ticket "Nuevo" del frontend). null si se
        // usó un alumno preexistente (userId directo o match por DNI).
        let memberId: number;
        let createdMemberId: number | null = null;

        if (body.userId != null) {
          memberId = body.userId;
        } else {
          // Rama "alumno nuevo": los 3 campos son obligatorios (la XOR no la
          // expresa el JSON-Schema con additionalProperties:false).
          if (!body.firstName || !body.lastName || !body.dni) {
            return reply.code(400).send({
              error: "Solicitud invalida",
              message:
                "Falta el alumno: enviá userId, o firstName + lastName + dni",
            });
          }
          // Dedup por DNI ANTES de crear (checkDuplicates ya filtra borrados).
          const { matches } = await memberService.checkDuplicates({
            dni: body.dni,
          });
          const dniMatch = matches.find((m) => m.matchedField === "dni");
          if (dniMatch) {
            // Match no-borrado ⇒ cargar contra el existente, NO duplicar.
            memberId = dniMatch.id;
          } else {
            // Sin match ⇒ crear alumno mínimo en su propia tx. createdBy SIEMPRE
            // del JWT (request.user.userId), nunca del body (anti-spoof D-31).
            createdMemberId = await memberService.createMinimalMember({
              firstName: body.firstName,
              lastName: body.lastName,
              dni: body.dni,
              branchId: body.branchId,
              createdBy: request.user.userId,
            });
            memberId = createdMemberId;
          }
        }

        // ── (b) Mapear precio + caja sugerida + assignPlan ──────────────────
        // Tarjeta → priceCreditCard (recargo); si no, toggle Zero ↔ regular.
        const priceTypeApplied: PriceType =
          body.paymentMethod === "card"
            ? "credit_card"
            : body.zero
              ? "zero"
              : "regular";

        const today = new Date().toISOString().split("T")[0];

        const subscription = await subscriptionService.assignPlan(
          ctx,
          memberId,
          {
            planId: body.planId,
            // CR-CAJA: la sede elegida (gated) es el branch_id del ledger/charge Y
            // la sede desde la que create() resuelve la caja de efectivo.
            branchId: body.branchId,
            startDate: today,
            priceTypeApplied,
            paymentMethod: body.paymentMethod,
            scheduleIds: body.scheduleIds,
            amountReceived: body.amountReceived,
            notes: body.notes,
            // Server-derived: charge nace 'pendiente' porque el rol es coach.
            recorderRole: request.user.role as AdminRole,
            idempotencyKey: body.idempotencyKey,
            // COBRO-04: cuenta banco pre-validada → bypassa la resolución por
            // sede en el service. undefined (cash) → caja efectivo de body.branchId.
            cashRegisterIdOverride: chosenBankAccountId,
            // W-1 (148-01): el id viaja por el input → se graba en el MISMO
            // insert del charge (sin UPDATE suelto ni 3ª tx).
            createdMemberId,
          },
          request.user.userId,
        );

        // El plan_charge lleva el idempotencyKey (precio>0 → hubo charge). Un
        // alta gratis (precio 0) no produce charge → transaction null.
        const transaction = await transactionService.findByIdempotencyKey(
          ctx,
          body.idempotencyKey,
        );
        request.log.info(
          {
            memberId,
            createdMemberId,
            branchId: body.branchId,
            paymentMethod: body.paymentMethod,
            priceTypeApplied,
          },
          "coach alta-con-plan: alumno resuelto/creado + plan asignado (pendiente)",
        );
        return reply.code(201).send({
          subscription,
          transaction,
          // El frontend muestra el ticket "Nuevo" cuando creó alumno.
          createdMemberId,
          createdNew: createdMemberId !== null,
        });
      } catch (err: unknown) {
        // D-09 / Pitfall 3: un idempotencyKey duplicado = esta alta exacta ya
        // ocurrió. La tx del charge rolleó; createMinimalMember es idempotente
        // por dni UNIQUE → ni 2º alumno ni 2º charge. Re-leer el charge existente
        // y devolverlo como 200 no-op.
        if (isDuplicateKeyError(err).isDuplicate) {
          const existing = await transactionService.findByIdempotencyKey(
            assertTenant(request.scope, "coach-load.alta.replay"),
            body.idempotencyKey,
          );
          if (existing) {
            return reply.code(200).send({ transaction: existing });
          }
        }
        handleServiceError(err, reply, request.log, "coach alta-con-plan");
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
  //
  // `currentEndDate` = vencimiento de la sub vigente (null si no tiene). La PoS
  // lo muestra para que el operador vea que la renovación anticipada arranca ahí.
  // ===================================================================
  fastify.get<{ Params: { userId: number } }>(
    "/autocompletar/:userId",
    { schema: autocompletarSchema },
    async (request, reply) => {
      try {
        // CR-CAJA: sede DEFAULT del cobro = la del socio (users.branchId con
        // fallback Templo Online), para pre-seleccionar el select de Sede en la PoS.
        const memberBranchId = await resolveMemberBranchId(
          request.params.userId,
        );
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
            currentEndDate: null,
            memberBranchId,
          });
        }
        const balanceRow = await balanceService.getRow(
          assertTenant(request.scope, "finance.balances.autocompletar"),
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
          // Vencimiento de la sub vigente (UAT caja/cobros 2026-07-21). La PoS lo
          // usa para explicitar que renovar ANTES del vencimiento no pisa el
          // período en curso: la renovación nace 'scheduled' y arranca este día.
          currentEndDate: sub.endDate ?? null,
          memberBranchId,
        });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "coach autocompletar");
      }
    },
  );

  // ===================================================================
  // GET /bank-accounts — cuentas banco seleccionables en la PoS de Cobros
  // (COBRO-04 / T-151-02). Coach-reachable: hereda el onRequest del plugin
  // (FINANCE_LOAD_ROLES, coach ∈) porque la ruta admin /cash-registers NO lo es.
  // Devuelve solo lean `{id,name,currency}` (sin saldos). `currency` opcional
  // acota a las cuentas de esa moneda (la del cobro en curso).
  // ===================================================================
  fastify.get<{ Querystring: { currency?: string } }>(
    "/bank-accounts",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            currency: { type: "string", minLength: 1, maxLength: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const accounts = await cashRegisterService.listActiveBankAccounts(
          assertTenant(request.scope, "coach-load.bank-accounts"),
          request.query.currency,
        );
        return reply.send({ accounts });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "coach bank-accounts");
      }
    },
  );

  // ===================================================================
  // GET /caja-efectivo — caja destino de un cobro en EFECTIVO (UAT caja/cobros
  // 2026-07-21). CR-CAJA (2026-07-24): la caja de efectivo sigue la SEDE DEL
  // COBRO (default = sede del socio, overrideable con el select de Sede de la
  // PoS), ya no la sede del profe. La PoS manda el `branchId` seleccionado y
  // esta ruta informa, read-only, la misma caja que create() va a resolver al
  // confirmar.
  //
  // Devuelve `{ caja: null }` (200, no error) cuando esa sede no tiene caja
  // efectivo resolvible — la PoS muestra el aviso y el 400 real lo da create()
  // al confirmar ("No existe caja efectivo para la sucursal N").
  // ===================================================================
  fastify.get<{ Querystring: { currency: string; branchId: number } }>(
    "/caja-efectivo",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["currency", "branchId"],
          additionalProperties: false,
          properties: {
            currency: { type: "string", minLength: 1, maxLength: 8 },
            branchId: { type: "integer", minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        // Fase 172 (analog B): el ctx se resuelve UNA vez al tope del try y lo
        // usan el resolver y el SELECT de abajo. Queda DENTRO del try para que
        // un TENANT_UNRESOLVED salga por `handleServiceError` con el formato de
        // error del modulo y no con el default de Fastify.
        const ctx = assertTenant(request.scope, "coach caja-efectivo");
        let override: number | null | undefined;
        try {
          override = await cashRegisterService.resolveCashRegister(
            ctx,
            "cash",
            request.query.branchId,
            request.query.currency,
          );
        } catch (err: unknown) {
          request.log.warn(
            {
              branchId: request.query.branchId,
              currency: request.query.currency,
              err: err instanceof Error ? err.message : String(err),
            },
            "Caja efectivo de la sede del cobro no resolvible",
          );
          override = undefined;
        }
        if (override == null) {
          return reply.send({ caja: null });
        }
        const [caja] = await fastify.db
          .select({
            id: schema.cashRegisters.id,
            name: schema.cashRegisters.name,
          })
          .from(schema.cashRegisters)
          .where(
            and(
              tenantWhere(schema.cashRegisters, ctx),
              eq(schema.cashRegisters.id, override),
            ),
          )
          .limit(1);
        return reply.send({ caja: caja ?? null });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "coach caja-efectivo");
      }
    },
  );

  // ===================================================================
  // GET /mis-cargas — for role=coach, OWN loads only (D-07): recordedBy is
  // FORCED to request.user.userId server-side (never from the query) so a
  // coach never sees other coaches' loads, the full ledger, or caja saldos.
  // Every other FINANCE_LOAD_ROLES role (owner/admin/gestion/recepcion) is
  // already in FINANCE_READ_ROLES, so they see ALL loads — the shared view
  // recepción/gestión need to know what the other person cargó.
  // ===================================================================
  fastify.get("/mis-cargas", async (request, reply) => {
    try {
      const result = await transactionService.list(
        assertTenant(request.scope, "coach-load.mis-cargas"),
        {
          ...(request.user.role === "coach"
            ? { recordedBy: request.user.userId }
            : {}),
          limit: 50,
        },
      );
      return reply.send(result);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "coach mis-cargas");
    }
  });
};

// Re-export the detail type so route consumers (tests) can import it from here.
export type { TransactionDetail };
