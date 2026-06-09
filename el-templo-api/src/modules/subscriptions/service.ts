/**
 * Subscription Service
 *
 * Business logic for subscription plans CRUD, subscription lifecycle
 * management (assign, pause, resume, cancel, auto-expire), and
 * pricing engine with AURA discount integration.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import {
  eq,
  and,
  or,
  ne,
  desc,
  sql,
  inArray,
  isNotNull,
  isNull,
} from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { AuraService, InsufficientBalanceError } from "../aura";
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
} from "../shared/errors";
import type {
  PlanListItem,
  PlanDetail,
  CreatePlanInput,
  UpdatePlanInput,
  SubscriptionDetail,
  AssignPlanInput,
  RenewSubscriptionInput,
  PricingPreview,
  BulkMigrateInput,
  BulkMigrateResult,
  ClassUsageInfo,
  PlanTier,
  PlanCategory,
  BookingMode,
  PriceType,
  SubscriptionStatus,
  ProrationResult,
  ChangePlanPreview,
  PromoListItem,
  CreatePromoInput,
  UpdatePromoInput,
} from "./types";
import { AURA_DISCOUNT_TIERS, isOnlinePlan } from "./types";
import type { TransactionService } from "../finance";
import type { TxHandle } from "../finance/balance-service";
import type { PaymentMethod } from "../finance/types";
import type { GoalPlanType } from "../goal-plans/types";
import { populateBookings } from "./booking-population";
import { auditLog } from "../shared/audit-log";
import { EnrollmentService } from "../programs/enrollment-service";

// ─── Charge flow taxonomy (Phase 107) ─────────────────────────────────────────

/**
 * Discriminator for the 4 flows that record an inflow `plan_charge` transaction:
 * assignPlan, changePlanNow (proration), changePlanAfterCurrent (scheduled), renew.
 *
 * Drives the human-readable `notes` written to financial_transactions, visible
 * in CajaPage (Barcelona / Chapadmalal) under the "Concepto" column.
 */
type ChargeFlow = "assign" | "change-now" | "change-after-current" | "renew";

/**
 * Operative Spanish labels — assembled into the transaction `notes` template
 * `Cobro al ${flowLabel} plan ${planName}`. Operations reads these daily.
 *
 * - assign                   → "Cobro al asignar plan X"
 * - change-now               → "Cobro al cambiar a plan X" (proration / inmediato)
 * - change-after-current     → "Cobro al cambio programado a plan X" (post-período actual)
 * - renew                    → "Cobro al renovar plan X"
 */
const flowLabelMap: Record<ChargeFlow, string> = {
  assign: "asignar",
  "change-now": "cambiar a",
  "change-after-current": "cambio programado a",
  renew: "renovar",
};

// Lazy import type to avoid circular dependency at module load time
type BookingServiceType =
  import("../scheduling/booking-service").BookingService;

/**
 * Bounds for any admin-supplied subscription startDate (assign or edit).
 * Past bound covers retroactive loads ("the member started last week and we
 * forgot to register it"); future bound covers pre-sold memberships that
 * begin in the coming weeks. Tighter than "no bound" — typo guardrail.
 */
export const START_DATE_PAST_LIMIT_DAYS = 90;
export const START_DATE_FUTURE_LIMIT_DAYS = 60;

function todayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

function daysBetween(fromIso: string, toIso: string): number {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

/**
 * Throws BadRequestError if startDate is outside the allowed window
 * relative to today. Used by assignPlan and editSubscriptionStartDate.
 */
function assertStartDateWithinLimits(startDate: string): void {
  const today = todayDateString();
  const delta = daysBetween(today, startDate);
  if (delta < -START_DATE_PAST_LIMIT_DAYS) {
    throw new BadRequestError(
      `La fecha de inicio no puede ser más de ${START_DATE_PAST_LIMIT_DAYS} días en el pasado`,
    );
  }
  if (delta > START_DATE_FUTURE_LIMIT_DAYS) {
    throw new BadRequestError(
      `La fecha de inicio no puede ser más de ${START_DATE_FUTURE_LIMIT_DAYS} días en el futuro`,
    );
  }
}

/**
 * Filter options for listPlans. Accepts optional country scope and a
 * branchId that is resolved to a country server-side (branchId wins over
 * an explicit country if both are provided).
 */
export interface ListPlansFilters {
  isActive?: boolean;
  includeArchived?: boolean;
  country?: "AR" | "ES";
  branchId?: number;
}

/**
 * Filter options for listPromoPlans.
 */
export interface ListPromoPlansFilters {
  country?: "AR" | "ES";
}

export class SubscriptionService {
  private bookingService?: BookingServiceType;

  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private auraService: AuraService,
    private transactionService?: TransactionService,
    private enrollmentService?: EnrollmentService,
  ) {}

  /**
   * Set the BookingService reference (avoids circular constructor dependency).
   */
  setBookingService(bookingService: BookingServiceType): void {
    this.bookingService = bookingService;
  }

  /**
   * Phase 112-02: every program_enrollments mutation now flows through
   * EnrollmentService. The DI param stays optional during the rollout (Plan
   * 03 wires the remaining 11 instantiation sites in this same plan, Task 3),
   * but every call MUST go through this guard so a missing wiring surfaces
   * as a loud runtime error rather than a silent no-op (T-112-02-02).
   */
  private requireEnrollmentService(): EnrollmentService {
    if (!this.enrollmentService) {
      throw new Error(
        "EnrollmentService not injected — DI site missing (phase 112-02)",
      );
    }
    return this.enrollmentService;
  }

  // ─── Plans CRUD ──────────────────────────────────────────────────────────

  /**
   * Domain invariant for subscription plans. A plan in any online category
   * (online_regular | online_goal | online_coach) MUST grant access to either
   * a single program (linkedProgramId) OR the bundle of every active program
   * (grantsAllPrograms). Presencial plans have no such requirement — their
   * value is the in-person facility itself.
   *
   * Called by both createPlan and updatePlan against the post-mutation state
   * so the rule cannot be bypassed by partial updates.
   */
  private assertPlanInvariants(plan: {
    planCategory: PlanCategory;
    linkedProgramId: number | null;
    grantsAllPrograms: boolean;
  }): void {
    if (
      isOnlinePlan(plan.planCategory) &&
      !plan.linkedProgramId &&
      !plan.grantsAllPrograms
    ) {
      throw new BadRequestError(
        "Planes online deben vincular un programa (linkedProgramId) o dar acceso a todos los programas (grantsAllPrograms)",
      );
    }
  }

  /**
   * Phase 107 (D-08, D-09, D-10, D-13, D-14, D-16): centraliza el registro
   * del cobro al asignar / cambiar / renovar plan.
   *
   * Validación cap (lanzada antes de cualquier write):
   *   - amountReceived < 0 → BadRequestError
   *   - amountReceived > chargeBase → BadRequestError ("no puede exceder…")
   *
   * Default backward-compat: si params.amountReceived es undefined, se usa
   * chargeBase (D-13 — clientes pre-Phase-107 siguen funcionando idénticos).
   *
   * Cuando el cobro efectivo es > 0 invoca transactionService.create con el
   * outer `tx` (D-10 atomicidad — si applyDelta tira, la subscription
   * rollbackea junto con el financial_transaction y el balance row).
   *
   * Cuando amountReceived === 0 y chargeBase === 0 (boarding pass / plan
   * gratuito), no se crea transaction ni balance row — no hay deuda.
   *
   * Cuando amountReceived === 0 y chargeBase > 0 (asignación con deuda
   * total), se siembra directamente la row de `balances` con amount =
   * chargeBase. Sin esto, la sub queda invisible al Reporte Deudas hasta
   * el primer cobro real (gap del modelo pre-fix).
   *
   * Cuando el cobro es parcial (0 < amountReceived < chargeBase), emite log
   * estructurado info con los campos del D-16 — observabilidad operativa
   * sin queries adhoc a balances.
   *
   * El `notes` de la financial_transaction se genera con `flowLabelMap[flow]`
   * para que ops vea en CajaPage textos como "Cobro al asignar plan
   * Performance Mensual", "Cobro al cambiar a plan X", "Cobro al cambio
   * programado a plan X", "Cobro al renovar plan Y".
   *
   * INVARIANTE: el método NO abre db.transaction propia. Recibe `tx` del
   * caller; el caller debe estar dentro de un
   * `this.db.transaction(async (tx) => { ... })` para que la atomicidad
   * subscription + transaction + balance funcione como CHARGE-03 exige.
   */
  private async recordAssignmentCharge(
    tx: TxHandle,
    params: {
      userId: number;
      subscriptionId: number;
      planId: number;
      planName: string;
      planCurrency: "ARS" | "EUR";
      chargeBase: number;
      amountReceived: number | undefined;
      paymentMethod: PaymentMethod;
      branchId: number;
      effectiveDate: string;
      adminId: number;
      flow: ChargeFlow;
    },
  ): Promise<void> {
    if (!this.transactionService) return;

    const amountReceived = params.amountReceived ?? params.chargeBase;

    if (amountReceived < 0) {
      throw new BadRequestError("amountReceived no puede ser negativo");
    }
    if (amountReceived > params.chargeBase) {
      throw new BadRequestError(
        `amountReceived no puede exceder el monto a cobrar ($${params.chargeBase})`,
      );
    }

    if (amountReceived > 0) {
      const flowLabel = flowLabelMap[params.flow];
      await this.transactionService.create(
        {
          memberId: params.userId,
          kind: "plan_charge" as const,
          direction: "inflow" as const,
          amount: amountReceived,
          currency: params.planCurrency,
          paymentMethod: params.paymentMethod,
          transactionDate: params.effectiveDate,
          effectiveDate: params.effectiveDate,
          branchId: params.branchId,
          notes: `Cobro al ${flowLabel} plan ${params.planName}`,
          links: [
            {
              targetKind: "subscription" as const,
              targetId: params.subscriptionId,
              allocatedAmount: amountReceived,
            },
          ],
        },
        params.adminId,
        tx,
      );
    } else if (params.chargeBase > 0) {
      // amountReceived === 0 con chargeBase > 0: siembra el balance row
      // explícitamente para que la sub aparezca en Reporte Deudas. Sin
      // este insert, la lazy-seed de BalanceService no dispara hasta el
      // primer cobro y la deuda queda invisible.
      await tx.insert(schema.balances).values({
        memberId: params.userId,
        targetKind: "subscription",
        targetId: params.subscriptionId,
        currency: params.planCurrency,
        amount: params.chargeBase,
      });
    }

    if (amountReceived < params.chargeBase) {
      this.log.info(
        {
          userId: params.userId,
          subscriptionId: params.subscriptionId,
          planId: params.planId,
          pricePaid: params.chargeBase,
          amountReceived,
          pendingBalance: params.chargeBase - amountReceived,
          paymentMethod: params.paymentMethod,
          branchId: params.branchId,
          recordedBy: params.adminId,
          flow: params.flow,
        },
        "Plan asignado con cobro parcial",
      );
    }
  }

  /**
   * List subscription plans, optionally filtered by isActive, archival, and
   * country scope. When `branchId` is provided the service resolves the
   * branch's country server-side and uses that as the country filter
   * (branchId takes precedence over an explicitly supplied country).
   * By default excludes archived plans unless includeArchived is true.
   *
   * This method accepts an options object; legacy positional callers (e.g. the
   * member plan catalog in member-routes.ts) still pass booleans — the
   * overload below preserves that call shape.
   */
  async listPlans(
    isActiveOrFilters?: boolean | ListPlansFilters,
    includeArchived?: boolean,
  ): Promise<PlanListItem[]> {
    // Normalize to options object
    const filters: ListPlansFilters =
      typeof isActiveOrFilters === "object" && isActiveOrFilters !== null
        ? isActiveOrFilters
        : {
            isActive: isActiveOrFilters,
            includeArchived,
          };

    // Resolve effective country: branchId (if provided) wins over explicit country.
    let effectiveCountry: "AR" | "ES" | undefined = filters.country;
    if (filters.branchId !== undefined) {
      const [branch] = await this.db
        .select({ country: schema.branches.country })
        .from(schema.branches)
        .where(eq(schema.branches.id, filters.branchId));
      if (branch?.country === "AR" || branch?.country === "ES") {
        effectiveCountry = branch.country;
      }
    }

    const conditions = [];
    if (filters.isActive !== undefined) {
      conditions.push(eq(schema.subscriptionPlans.isActive, filters.isActive));
    }
    if (!filters.includeArchived) {
      conditions.push(eq(schema.subscriptionPlans.isArchived, false));
    }
    if (effectiveCountry !== undefined) {
      conditions.push(eq(schema.subscriptionPlans.country, effectiveCountry));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(schema.subscriptionPlans)
      .where(whereClause)
      .orderBy(schema.subscriptionPlans.name);

    return Promise.all(rows.map((r) => this.mapPlanRow(r)));
  }

  /**
   * Get a single plan by ID. Returns null if not found.
   */
  async getPlanById(planId: number): Promise<PlanDetail | null> {
    const [row] = await this.db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, planId));

    if (!row) return null;
    return this.mapPlanRow(row);
  }

  /**
   * Create a new subscription plan.
   */
  async createPlan(input: CreatePlanInput): Promise<PlanDetail> {
    const planCategory = input.planCategory ?? "presencial";
    const linkedProgramId = input.linkedProgramId ?? null;
    const grantsAllPrograms = input.grantsAllPrograms ?? false;

    this.assertPlanInvariants({
      planCategory,
      linkedProgramId,
      grantsAllPrograms,
    });

    const country = input.country ?? "AR";
    const currency = country === "ES" ? "EUR" : "ARS";

    const result = await this.db.insert(schema.subscriptionPlans).values({
      name: input.name,
      description: input.description ?? null,
      planTier: input.planTier,
      bookingMode: input.bookingMode,
      priceRegular: input.priceRegular,
      priceZero: input.priceZero,
      priceCreditCard: input.priceCreditCard ?? null,
      durationDays: input.durationDays,
      classesPerWeek: input.classesPerWeek ?? null,
      multiBranch: input.multiBranch ?? false,
      isTrial: input.isTrial ?? false,
      isGroup: input.isGroup ?? false,
      planCategory,
      linkedProgramId,
      groupMaxMembers: input.groupMaxMembers ?? null,
      grantsAllPrograms,
      country,
      currency,
    });

    const planId = Number(result[0].insertId);
    const plan = await this.getPlanById(planId);
    if (!plan) throw new Error("Failed to retrieve newly created plan");
    return plan;
  }

  /**
   * Update an existing subscription plan.
   */
  async updatePlan(
    planId: number,
    input: UpdatePlanInput,
  ): Promise<PlanDetail | null> {
    const existing = await this.getPlanById(planId);
    if (!existing) return null;

    const updateData: Partial<typeof schema.subscriptionPlans.$inferInsert> =
      {};

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined)
      updateData.description = input.description;
    if (input.planTier !== undefined) updateData.planTier = input.planTier;
    if (input.bookingMode !== undefined)
      updateData.bookingMode = input.bookingMode;
    if (input.priceRegular !== undefined)
      updateData.priceRegular = input.priceRegular;
    if (input.priceZero !== undefined) updateData.priceZero = input.priceZero;
    if (input.priceCreditCard !== undefined)
      updateData.priceCreditCard = input.priceCreditCard;
    if (input.durationDays !== undefined)
      updateData.durationDays = input.durationDays;
    if (input.classesPerWeek !== undefined)
      updateData.classesPerWeek = input.classesPerWeek;
    if (input.multiBranch !== undefined)
      updateData.multiBranch = input.multiBranch;
    if (input.isTrial !== undefined) updateData.isTrial = input.isTrial;
    if (input.isGroup !== undefined) updateData.isGroup = input.isGroup;
    if (input.planCategory !== undefined)
      updateData.planCategory = input.planCategory;
    if (input.linkedProgramId !== undefined)
      updateData.linkedProgramId = input.linkedProgramId;
    if (input.groupMaxMembers !== undefined)
      updateData.groupMaxMembers = input.groupMaxMembers;
    if (input.grantsAllPrograms !== undefined)
      updateData.grantsAllPrograms = input.grantsAllPrograms;

    this.assertPlanInvariants({
      planCategory:
        input.planCategory !== undefined
          ? input.planCategory
          : existing.planCategory,
      linkedProgramId:
        input.linkedProgramId !== undefined
          ? input.linkedProgramId
          : existing.linkedProgramId,
      grantsAllPrograms:
        input.grantsAllPrograms !== undefined
          ? input.grantsAllPrograms
          : existing.grantsAllPrograms,
    });

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(schema.subscriptionPlans)
        .set(updateData)
        .where(eq(schema.subscriptionPlans.id, planId));
    }

    return this.getPlanById(planId);
  }

  /**
   * Deactivate a subscription plan (soft delete).
   */
  async deactivatePlan(planId: number): Promise<PlanDetail | null> {
    const existing = await this.getPlanById(planId);
    if (!existing) return null;

    await this.db
      .update(schema.subscriptionPlans)
      .set({ isActive: false })
      .where(eq(schema.subscriptionPlans.id, planId));

    return this.getPlanById(planId);
  }

  // ─── Subscription Queries ────────────────────────────────────────────────

  /**
   * Get the current active/paused subscription for a member.
   * Auto-expires subscriptions where endDate < today.
   * Returns null if no active/paused subscription.
   */
  async getMemberSubscription(
    userId: number,
  ): Promise<SubscriptionDetail | null> {
    // First, auto-expire any active subscriptions past their end date
    await this.autoExpireSubscriptions(userId);

    const rows = await this.db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        planId: schema.subscriptions.planId,
        planName: schema.subscriptionPlans.name,
        planTier: schema.subscriptionPlans.planTier,
        planCategory: schema.subscriptionPlans.planCategory,
        branchId: schema.subscriptions.branchId,
        branchName: schema.branches.name,
        status: schema.subscriptions.status,
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
        pricePaid: schema.subscriptions.pricePaid,
        priceTypeApplied: schema.subscriptions.priceTypeApplied,
        auraDiscount: schema.subscriptions.auraDiscount,
        auraDiscountPercent: schema.subscriptions.auraDiscountPercent,
        boardingPassUsed: schema.subscriptions.boardingPassUsed,
        priceOverrideAmount: schema.subscriptions.priceOverrideAmount,
        priceOverrideReason: schema.subscriptions.priceOverrideReason,
        pausedAt: schema.subscriptions.pausedAt,
        pauseEndDate: schema.subscriptions.pauseEndDate,
        resumedAt: schema.subscriptions.resumedAt,
        cancelledAt: schema.subscriptions.cancelledAt,
        classesRemaining: schema.subscriptions.classesRemaining,
        classesBudget: schema.subscriptions.classesBudget,
        previousSubscriptionId: schema.subscriptions.previousSubscriptionId,
        replacementCredits: schema.subscriptions.replacementCredits,
        notes: schema.subscriptions.notes,
        currency: schema.subscriptions.currency,
        createdAt: schema.subscriptions.createdAt,
        updatedAt: schema.subscriptions.updatedAt,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          or(
            eq(schema.subscriptions.status, "active"),
            eq(schema.subscriptions.status, "paused"),
            eq(schema.subscriptions.status, "scheduled"),
          ),
        ),
      )
      // Prefer subs covering today (startDate <= today) over future ones,
      // and within those prefer active/paused over scheduled. Renewal/early-
      // change-plan flows can produce an active sub + a scheduled successor;
      // this ordering keeps the active one as "current".
      .orderBy(
        sql`CASE WHEN ${schema.subscriptions.startDate} <= CURDATE() THEN 0 ELSE 1 END`,
        sql`CASE ${schema.subscriptions.status} WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END`,
        schema.subscriptions.startDate,
      )
      .limit(1);

    if (rows.length === 0) return null;

    return this.enrichWithScheduleIds(this.mapSubscriptionRow(rows[0]));
  }

  /**
   * Get ALL active/paused subscriptions for a member (supports dual presencial + online).
   * Returns an array (empty if none).
   */
  async getMemberSubscriptions(userId: number): Promise<SubscriptionDetail[]> {
    await this.autoExpireSubscriptions(userId);

    const rows = await this.db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        planId: schema.subscriptions.planId,
        planName: schema.subscriptionPlans.name,
        planTier: schema.subscriptionPlans.planTier,
        planCategory: schema.subscriptionPlans.planCategory,
        branchId: schema.subscriptions.branchId,
        branchName: schema.branches.name,
        status: schema.subscriptions.status,
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
        pricePaid: schema.subscriptions.pricePaid,
        priceTypeApplied: schema.subscriptions.priceTypeApplied,
        auraDiscount: schema.subscriptions.auraDiscount,
        auraDiscountPercent: schema.subscriptions.auraDiscountPercent,
        boardingPassUsed: schema.subscriptions.boardingPassUsed,
        priceOverrideAmount: schema.subscriptions.priceOverrideAmount,
        priceOverrideReason: schema.subscriptions.priceOverrideReason,
        pausedAt: schema.subscriptions.pausedAt,
        pauseEndDate: schema.subscriptions.pauseEndDate,
        resumedAt: schema.subscriptions.resumedAt,
        cancelledAt: schema.subscriptions.cancelledAt,
        classesRemaining: schema.subscriptions.classesRemaining,
        classesBudget: schema.subscriptions.classesBudget,
        previousSubscriptionId: schema.subscriptions.previousSubscriptionId,
        replacementCredits: schema.subscriptions.replacementCredits,
        notes: schema.subscriptions.notes,
        currency: schema.subscriptions.currency,
        createdAt: schema.subscriptions.createdAt,
        updatedAt: schema.subscriptions.updatedAt,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          or(
            eq(schema.subscriptions.status, "active"),
            eq(schema.subscriptions.status, "paused"),
            eq(schema.subscriptions.status, "scheduled"),
          ),
        ),
      )
      // active first, then paused, then scheduled — keeps the "current" sub
      // at the top of the list for the admin tab, while still surfacing
      // standalone scheduled subs created with a future startDate.
      .orderBy(
        sql`CASE ${schema.subscriptions.status} WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END`,
        schema.subscriptions.createdAt,
      );

    const mapped = rows.map((r) => this.mapSubscriptionRow(r));
    return this.enrichManyWithScheduleIds(mapped);
  }

  /**
   * Get full subscription history for a member, most recent first.
   */
  async getMemberSubscriptionHistory(
    userId: number,
  ): Promise<SubscriptionDetail[]> {
    // Auto-expire first
    await this.autoExpireSubscriptions(userId);

    const rows = await this.db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        planId: schema.subscriptions.planId,
        planName: schema.subscriptionPlans.name,
        planTier: schema.subscriptionPlans.planTier,
        planCategory: schema.subscriptionPlans.planCategory,
        branchId: schema.subscriptions.branchId,
        branchName: schema.branches.name,
        status: schema.subscriptions.status,
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
        pricePaid: schema.subscriptions.pricePaid,
        priceTypeApplied: schema.subscriptions.priceTypeApplied,
        auraDiscount: schema.subscriptions.auraDiscount,
        auraDiscountPercent: schema.subscriptions.auraDiscountPercent,
        boardingPassUsed: schema.subscriptions.boardingPassUsed,
        priceOverrideAmount: schema.subscriptions.priceOverrideAmount,
        priceOverrideReason: schema.subscriptions.priceOverrideReason,
        pausedAt: schema.subscriptions.pausedAt,
        pauseEndDate: schema.subscriptions.pauseEndDate,
        resumedAt: schema.subscriptions.resumedAt,
        cancelledAt: schema.subscriptions.cancelledAt,
        classesRemaining: schema.subscriptions.classesRemaining,
        classesBudget: schema.subscriptions.classesBudget,
        previousSubscriptionId: schema.subscriptions.previousSubscriptionId,
        replacementCredits: schema.subscriptions.replacementCredits,
        notes: schema.subscriptions.notes,
        currency: schema.subscriptions.currency,
        createdAt: schema.subscriptions.createdAt,
        updatedAt: schema.subscriptions.updatedAt,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .where(eq(schema.subscriptions.userId, userId))
      .orderBy(desc(schema.subscriptions.createdAt));

    const mapped = rows.map((r) => this.mapSubscriptionRow(r));
    return this.enrichManyWithScheduleIds(mapped);
  }

  /**
   * Get a subscription by ID. Returns null if not found.
   */
  async getSubscriptionById(
    subscriptionId: number,
  ): Promise<SubscriptionDetail | null> {
    const rows = await this.db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        planId: schema.subscriptions.planId,
        planName: schema.subscriptionPlans.name,
        planTier: schema.subscriptionPlans.planTier,
        planCategory: schema.subscriptionPlans.planCategory,
        branchId: schema.subscriptions.branchId,
        branchName: schema.branches.name,
        status: schema.subscriptions.status,
        startDate: schema.subscriptions.startDate,
        endDate: schema.subscriptions.endDate,
        pricePaid: schema.subscriptions.pricePaid,
        priceTypeApplied: schema.subscriptions.priceTypeApplied,
        auraDiscount: schema.subscriptions.auraDiscount,
        auraDiscountPercent: schema.subscriptions.auraDiscountPercent,
        boardingPassUsed: schema.subscriptions.boardingPassUsed,
        priceOverrideAmount: schema.subscriptions.priceOverrideAmount,
        priceOverrideReason: schema.subscriptions.priceOverrideReason,
        pausedAt: schema.subscriptions.pausedAt,
        pauseEndDate: schema.subscriptions.pauseEndDate,
        resumedAt: schema.subscriptions.resumedAt,
        cancelledAt: schema.subscriptions.cancelledAt,
        classesRemaining: schema.subscriptions.classesRemaining,
        classesBudget: schema.subscriptions.classesBudget,
        previousSubscriptionId: schema.subscriptions.previousSubscriptionId,
        replacementCredits: schema.subscriptions.replacementCredits,
        notes: schema.subscriptions.notes,
        currency: schema.subscriptions.currency,
        createdAt: schema.subscriptions.createdAt,
        updatedAt: schema.subscriptions.updatedAt,
      })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .where(eq(schema.subscriptions.id, subscriptionId));

    if (rows.length === 0) return null;
    return this.enrichWithScheduleIds(this.mapSubscriptionRow(rows[0]));
  }

  // ─── Subscription Lifecycle ──────────────────────────────────────────────

  /**
   * Assign a subscription plan to a member.
   *
   * Validates: member exists, plan exists and is active, no existing active/paused
   * subscription, boarding pass eligibility, AURA balance for discount.
   */
  async assignPlan(
    userId: number,
    input: AssignPlanInput,
    adminId: number,
  ): Promise<SubscriptionDetail> {
    // Validate member exists. Inner-join branches to also pull the member's
    // branch country for the cross-country plan guard below.
    const [member] = await this.db
      .select({
        id: schema.users.id,
        branchId: schema.users.branchId,
        branchCountry: schema.branches.country,
        boardingPassUsed: schema.users.boardingPassUsed,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(eq(schema.users.id, userId));

    if (!member) {
      throw new NotFoundError("Miembro no encontrado");
    }

    // Validate plan exists and is active
    const plan = await this.getPlanById(input.planId);
    if (!plan) {
      throw new NotFoundError("Plan no encontrado");
    }
    if (!plan.isActive) {
      throw new BadRequestError("El plan seleccionado no esta activo");
    }
    if (plan.isArchived) {
      throw new BadRequestError("No se puede asignar un plan archivado");
    }
    if (plan.country !== member.branchCountry) {
      throw new BadRequestError(
        "El plan no corresponde al pais de la sucursal",
      );
    }

    // REQ-1 (Phase 111): Reject presencial plan on a virtual branch.
    // Admin must convert the member to a physical branch first (edit alumno
    // → cambiar sede). The check is `=== "presencial"` exactly — only this
    // category requires a physical sede; online_* categories live on the
    // virtual branch by design (T-111-10 in the threat register).
    const [memberBranch] = await this.db
      .select({ isVirtual: schema.branches.isVirtual })
      .from(schema.branches)
      .where(eq(schema.branches.id, member.branchId));
    if (
      plan.planCategory === "presencial" &&
      memberBranch?.isVirtual === true
    ) {
      throw new BadRequestError(
        "Plan presencial requiere sede física. Convertí al alumno primero.",
      );
    }

    // Phase 104 R3 (checker WARNING): without a UNIQUE constraint on
    // grants_all_programs=true at the schema level, an admin could author
    // multiple bundle SKUs (e.g. monthly vs yearly) and accidentally assign
    // two simultaneously to the same user. Reject with a clear 409 if the
    // user already has an active or paused bundle subscription. The general
    // online+online conflict check below would also catch most cases (bundle
    // is online_regular), but this guard fires earlier with an explicit
    // bundle-specific message for staff.
    if (plan.grantsAllPrograms) {
      const existingBundle = await this.db
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .innerJoin(
          schema.subscriptionPlans,
          eq(schema.subscriptions.planId, schema.subscriptionPlans.id),
        )
        .where(
          and(
            eq(schema.subscriptions.userId, userId),
            or(
              eq(schema.subscriptions.status, "active"),
              eq(schema.subscriptions.status, "paused"),
            ),
            eq(schema.subscriptionPlans.grantsAllPrograms, true),
          ),
        )
        .limit(1);
      if (existingBundle.length > 0) {
        throw new ConflictError(
          "El usuario ya tiene un bundle activo. Cancelalo antes de asignar otro.",
        );
      }
    }

    // Bound startDate to a sane window (typo guardrail).
    assertStartDateWithinLimits(input.startDate);

    // Check no existing active/paused/scheduled subscription in the same category group (D-35)
    // A member CAN have one presencial + one online simultaneously
    // A member CANNOT have two presencial or two online simultaneously
    // Scheduled subs (future startDate) count too — otherwise an admin could
    // queue a duplicate for next week without the system noticing.
    const planIsOnline = isOnlinePlan(plan.planCategory);
    const existingInSameGroup = await this.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptions.planId, schema.subscriptionPlans.id),
      )
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          or(
            eq(schema.subscriptions.status, "active"),
            eq(schema.subscriptions.status, "paused"),
            eq(schema.subscriptions.status, "scheduled"),
          ),
          planIsOnline
            ? ne(schema.subscriptionPlans.planCategory, "presencial")
            : eq(schema.subscriptionPlans.planCategory, "presencial"),
        ),
      );

    if (existingInSameGroup.length > 0) {
      throw new ConflictError(
        planIsOnline
          ? "El miembro ya tiene una suscripcion online activa"
          : "El miembro ya tiene una suscripcion presencial activa",
      );
    }

    // Calculate end date
    const startDate = new Date(input.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.durationDays);
    const endDateStr = endDate.toISOString().split("T")[0];

    // Status: scheduled when startDate is in the future, active otherwise.
    // The status drives recomputeUserStatus (only active/paused count for
    // user.status='activo') and getMemberSubscription's "current" pick.
    const today = todayDateString();
    const initialStatus: "active" | "scheduled" =
      input.startDate > today ? "scheduled" : "active";

    // Determine price
    let pricePaid: number;
    let priceTypeApplied = input.priceTypeApplied;
    let auraDiscount: number | null = null;
    let auraDiscountPercent: number | null = null;
    let boardingPassUsed = false;
    let priceOverrideAmount: number | null = null;
    let priceOverrideReason: string | null = null;

    // Price override takes highest priority
    if (
      input.priceOverrideAmount !== undefined &&
      input.priceOverrideAmount >= 0
    ) {
      if (!input.priceOverrideReason) {
        throw new BadRequestError(
          "Se requiere una razon para el precio personalizado",
        );
      }
      pricePaid = input.priceOverrideAmount;
      priceOverrideAmount = input.priceOverrideAmount;
      priceOverrideReason = input.priceOverrideReason;
    }
    // Boarding pass
    else if (input.boardingPass) {
      if (member.boardingPassUsed) {
        throw new ConflictError("El boarding pass ya fue utilizado");
      }
      pricePaid = plan.priceZero;
      priceTypeApplied = "zero";
      boardingPassUsed = true;

      // Mark boarding pass as used on the user
      await this.db
        .update(schema.users)
        .set({ boardingPassUsed: true })
        .where(eq(schema.users.id, userId));
    }
    // Normal price calculation
    else {
      const basePrice = this.getBasePrice(plan, priceTypeApplied);
      pricePaid = basePrice;

      // Apply AURA discount if requested
      if (input.auraSpend && input.auraSpend > 0) {
        const tier = AURA_DISCOUNT_TIERS.find(
          (t) => t.spend === input.auraSpend,
        );
        if (!tier) {
          throw new BadRequestError(
            `Monto de AURA invalido. Opciones: ${AURA_DISCOUNT_TIERS.map((t) => t.spend).join(", ")}`,
          );
        }

        // Spend AURA (throws InsufficientBalanceError if not enough)
        await this.auraService.spend({
          userId,
          amount: tier.spend,
          description: `Descuento de suscripcion: ${tier.percent}% off`,
          referenceType: "subscription",
        });

        auraDiscount = tier.spend;
        auraDiscountPercent = tier.percent;
        const discountAmount = Math.floor(basePrice * (tier.percent / 100));
        pricePaid = basePrice - discountAmount;
      }
    }

    // ── Schedule slot validation ──
    // Fixed plans require an exact set. Flexible presencial plans may opt in
    // to partial fixed anchors (0..classesPerWeek). Online plans never use
    // schedules.
    if (plan.bookingMode === "fixed") {
      if (!input.scheduleIds || input.scheduleIds.length === 0) {
        throw new BadRequestError(
          "Para planes fijos se requiere scheduleIds con los horarios seleccionados",
        );
      }
      if (
        plan.classesPerWeek !== null &&
        input.scheduleIds.length !== plan.classesPerWeek
      ) {
        throw new BadRequestError(
          `Debes seleccionar exactamente ${plan.classesPerWeek} horarios (classesPerWeek). Seleccionaste ${input.scheduleIds.length}.`,
        );
      }
    } else if (
      input.scheduleIds &&
      input.scheduleIds.length > 0 &&
      plan.planCategory !== "presencial"
    ) {
      throw new BadRequestError(
        "Los planes online no pueden tener turnos fijos",
      );
    } else if (
      input.scheduleIds &&
      input.scheduleIds.length > 0 &&
      plan.classesPerWeek !== null &&
      input.scheduleIds.length > plan.classesPerWeek
    ) {
      throw new BadRequestError(
        `Podes elegir hasta ${plan.classesPerWeek} turnos fijos. Seleccionaste ${input.scheduleIds.length}.`,
      );
    }

    if (input.scheduleIds && input.scheduleIds.length > 0) {
      await this.validateAnchorSet(input.scheduleIds, input.branchId, plan);
    }

    // Calculate monthly class budget from plan configuration
    const classesRemaining =
      plan.classesPerWeek !== null
        ? Math.ceil(plan.durationDays / 7) * plan.classesPerWeek
        : null;

    // ── Atomic subscription mutation (Phase 103 D-16) ──
    // Wrap the core writes (subscriptions INSERT, subscription_schedules,
    // virtual-branch user migration, programEnrollments, status recompute)
    // in a single transaction so recomputeUserStatus rolls back alongside
    // the sub INSERT on failure. External side effects (bookingService,
    // transactionService, auraService) continue to use this.db — refactoring
    // them is out of scope per the plan's WARNING-9 (separate plan / Rule 4
    // architectural change).
    const { subscriptionId, replacementCredits } = await this.db.transaction(
      async (tx) => {
        // Insert subscription. `currency` is inherited from the plan so EUR
        // plans produce EUR subscriptions (defense in depth — the country
        // guard above already prevents cross-country assignments).
        const insResult = await tx.insert(schema.subscriptions).values({
          userId,
          planId: input.planId,
          branchId: input.branchId,
          status: initialStatus,
          startDate: input.startDate,
          endDate: endDateStr,
          pricePaid,
          priceTypeApplied,
          auraDiscount,
          auraDiscountPercent,
          boardingPassUsed,
          priceOverrideAmount,
          priceOverrideReason,
          classesRemaining,
          classesBudget: classesRemaining,
          notes: input.notes ?? null,
          currency: plan.currency,
          priceRegularSnapshot: plan.priceRegular,
        });

        const newSubscriptionId = Number(insResult[0].insertId);

        // ── Persist schedule slot references and generate bookings ──
        // Fixed plans always have scheduleIds; flexible presencial plans may
        // have 0..N partial fixed anchors. Replacement credits (holiday
        // makeups) apply only to fixed plans where the member pre-paid for
        // the whole schedule.
        let credits = 0;
        if (input.scheduleIds && input.scheduleIds.length > 0) {
          await tx.insert(schema.subscriptionSchedules).values(
            input.scheduleIds.map((scheduleId) => ({
              subscriptionId: newSubscriptionId,
              scheduleId,
            })),
          );

          if (this.bookingService) {
            const bookingResult =
              await this.bookingService.generateFixedBookings(
                newSubscriptionId,
                userId,
                input.scheduleIds,
                input.startDate,
                endDateStr,
                input.branchId,
                input.scheduleStartDates,
              );
            if (plan.bookingMode === "fixed") {
              credits = bookingResult.holidaysSkipped;
            }
          }

          if (credits > 0) {
            await tx
              .update(schema.subscriptions)
              .set({ replacementCredits: credits })
              .where(eq(schema.subscriptions.id, newSubscriptionId));
          }
        }

        // Auto-migrate member from virtual branch to subscription's physical branch
        if (member.branchId !== input.branchId) {
          const [currentBranch] = await tx
            .select({ isVirtual: schema.branches.isVirtual })
            .from(schema.branches)
            .where(eq(schema.branches.id, member.branchId));

          if (currentBranch?.isVirtual) {
            await tx
              .update(schema.users)
              .set({ branchId: input.branchId })
              .where(eq(schema.users.id, userId));

            this.log.info(
              {
                userId,
                fromBranchId: member.branchId,
                toBranchId: input.branchId,
              },
              "Auto-migrated member from virtual branch to subscription branch",
            );
          }
        }

        // Phase 112-02: program enrollment (linked + bundle) flows through
        // EnrollmentService. The single call covers both the
        // plan.linkedProgramId branch and the plan.grantsAllPrograms
        // (Foundation-excluded) bundle branch — driven internally by plan
        // flags. All writes share `tx` so rollback semantics are preserved.
        // Guarded by the plan flags so plans with neither binding (e.g.
        // pure-presencial plans without a linked program) skip the
        // enrollment chokepoint entirely — keeps test instantiations that
        // omit EnrollmentService working, and avoids spurious DI errors on
        // flows that have nothing to enroll.
        if (plan.linkedProgramId || plan.grantsAllPrograms) {
          await this.requireEnrollmentService().enrollFromPlan(
            userId,
            {
              id: plan.id,
              linkedProgramId: plan.linkedProgramId,
              grantsAllPrograms: plan.grantsAllPrograms,
            },
            newSubscriptionId,
            tx,
          );
        }

        // ── Recompute user.status (R5/D-01) ──
        // Final write inside the tx. Flips status to 'activo' (single source
        // of truth) and absorbs the Phase 102-07 trial-conversion logic.
        await this.recomputeUserStatus(userId, tx);

        // ── Atomic charge recording (Phase 107 D-10 / CHARGE-03) ──
        // Move the financial_transaction + balance write INSIDE the same tx
        // that persists the subscription. If applyDelta fails the entire
        // assignment rollbacks — no orphan subscription without a charge.
        await this.recordAssignmentCharge(tx, {
          userId,
          subscriptionId: newSubscriptionId,
          planId: plan.id,
          planName: plan.name,
          planCurrency: plan.currency,
          chargeBase: pricePaid,
          amountReceived: input.amountReceived,
          paymentMethod: input.paymentMethod,
          branchId: input.branchId,
          effectiveDate: input.startDate,
          adminId,
          flow: "assign",
        });

        // REQ-7 (Phase 111): forensic trail for plan_assigned (D-13 payload).
        // Atomic with the subscription insert + charge — if either fails, the
        // audit row vanishes with the rest of the transaction.
        const effectiveAmountReceived = input.amountReceived ?? pricePaid;
        await auditLog.write(tx, {
          actorId: adminId,
          action: "plan_assigned",
          targetKind: "subscription",
          targetId: newSubscriptionId,
          payload: {
            subId: newSubscriptionId,
            planId: plan.id,
            branchId: input.branchId,
            pricePaid,
            paymentMethod: input.paymentMethod,
            hasChargeTx: effectiveAmountReceived > 0,
            startDate: input.startDate,
            endDate: endDateStr,
          },
        });

        return {
          subscriptionId: newSubscriptionId,
          replacementCredits: credits,
        };
      },
    );

    const subscription = await this.getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error("Failed to retrieve newly created subscription");
    }

    this.log.info(
      {
        userId,
        planId: input.planId,
        subscriptionId,
        pricePaid,
        replacementCredits,
        adminId,
      },
      "Subscription assigned to member",
    );

    return subscription;
  }

  /**
   * Replace a fixed-plan subscription's schedule slots.
   *
   * Cancels future bookings on the old slots, swaps the subscription_schedules
   * rows, regenerates bookings on the new slots from tomorrow to endDate, and
   * records an audit row. Today's booking on the old slot is preserved.
   */
  async changeFixedSchedules(
    subscriptionId: number,
    actorId: number,
    input: {
      scheduleIds: number[];
      reason?: string;
      /**
       * Optional per-slot start date overrides. When the admin picks a slot
       * that is full this week, the picker offers a deferred start (e.g.
       * "Disponible desde 2026-05-22"). If the admin accepts, the scheduleId
       * lands here and bookings for that slot are generated only from that
       * date onward — earlier weeks are skipped to avoid pushing the member
       * into a full slot.
       */
      scheduleStartDates?: Record<number, string>;
    },
  ): Promise<SubscriptionDetail> {
    const sub = await this.getSubscriptionById(subscriptionId);
    if (!sub) {
      throw new NotFoundError("Suscripcion no encontrada");
    }
    // Allow on the three "live" states: active (running today), scheduled
    // (paid in advance, hasn't started yet), and paused. Cancelled/expired
    // subs are historical — there are no future bookings to regenerate, so
    // editing their schedules has no operational effect and is rejected.
    if (
      sub.status !== "active" &&
      sub.status !== "scheduled" &&
      sub.status !== "paused"
    ) {
      throw new BadRequestError(
        "Solo se pueden cambiar turnos de suscripciones activas, programadas o pausadas",
      );
    }

    const [plan] = await this.db
      .select({
        bookingMode: schema.subscriptionPlans.bookingMode,
        planCategory: schema.subscriptionPlans.planCategory,
        classesPerWeek: schema.subscriptionPlans.classesPerWeek,
        multiBranch: schema.subscriptionPlans.multiBranch,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, sub.planId));

    if (!plan) {
      throw new BadRequestError("Plan no encontrado");
    }
    if (plan.planCategory !== "presencial") {
      throw new BadRequestError(
        "Solo los planes presenciales usan turnos fijos",
      );
    }
    // Fixed plans require an exact count; flexible plans allow 0..classesPerWeek
    // as partial fixed anchors.
    if (plan.bookingMode === "fixed") {
      if (
        plan.classesPerWeek !== null &&
        input.scheduleIds.length !== plan.classesPerWeek
      ) {
        throw new BadRequestError(
          `Debes seleccionar exactamente ${plan.classesPerWeek} horarios. Seleccionaste ${input.scheduleIds.length}.`,
        );
      }
    } else {
      if (
        plan.classesPerWeek !== null &&
        input.scheduleIds.length > plan.classesPerWeek
      ) {
        throw new BadRequestError(
          `Podes elegir hasta ${plan.classesPerWeek} turnos fijos. Seleccionaste ${input.scheduleIds.length}.`,
        );
      }
    }

    // Validate the new schedule IDs: exist, active, branch policy, distinct days
    if (input.scheduleIds.length > 0) {
      await this.validateAnchorSet(input.scheduleIds, sub.branchId, plan);
    }

    const oldScheduleIds = sub.scheduleIds;
    const newSet = new Set(input.scheduleIds);
    const sameSet =
      oldScheduleIds.length === input.scheduleIds.length &&
      oldScheduleIds.every((id) => newSet.has(id));
    if (sameSet) {
      throw new BadRequestError(
        "Los turnos seleccionados son iguales a los actuales",
      );
    }

    // 1. Cancel future bookings on old slots (reads current subscription_schedules)
    if (this.bookingService) {
      await this.bookingService.cancelFutureBookings(subscriptionId);
    }

    // 2. Swap subscription_schedules rows (insert is skipped when the new set is empty)
    await this.db
      .delete(schema.subscriptionSchedules)
      .where(eq(schema.subscriptionSchedules.subscriptionId, subscriptionId));
    if (input.scheduleIds.length > 0) {
      await this.db.insert(schema.subscriptionSchedules).values(
        input.scheduleIds.map((scheduleId) => ({
          subscriptionId,
          scheduleId,
        })),
      );
    }

    // 3. Record audit trail
    await this.db.insert(schema.subscriptionScheduleChanges).values({
      subscriptionId,
      actorId,
      oldScheduleIds,
      newScheduleIds: input.scheduleIds,
      reason: input.reason ?? null,
    });

    // 4. Regenerate future bookings on new slots starting today. Class
    //    hasn't happened yet — today is part of the "future" window when
    //    a member is changing slots. (Cancel step above already dropped
    //    today's old-slot booking.)
    if (this.bookingService && sub.endDate && input.scheduleIds.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      if (today <= sub.endDate) {
        await this.bookingService.generateFixedBookings(
          subscriptionId,
          sub.userId,
          input.scheduleIds,
          today,
          sub.endDate,
          sub.branchId,
          input.scheduleStartDates,
        );
      }
    }

    this.log.info(
      {
        subscriptionId,
        actorId,
        oldScheduleIds,
        newScheduleIds: input.scheduleIds,
      },
      "Fixed subscription schedules changed",
    );

    const updated = await this.getSubscriptionById(subscriptionId);
    return updated!;
  }

  /**
   * Edit a subscription's startDate. Recalculates endDate from the plan's
   * durationDays, transitions status (scheduled ↔ active) when the new
   * startDate crosses today, regenerates bookings for fixed/anchored
   * presencial subs, and recomputes the member's user.status.
   *
   * Guards:
   * - Sub must be in active / paused / scheduled (not editable once
   *   cancelled / expired / completed / changed).
   * - newStartDate must fall within the same window as assignPlan.
   * - Cannot move startDate past an existing attendance — would orphan
   *   the attended class outside the new sub range.
   */
  async editSubscriptionStartDate(
    subscriptionId: number,
    newStartDate: string,
    actorId: number,
  ): Promise<SubscriptionDetail> {
    const sub = await this.getSubscriptionById(subscriptionId);
    if (!sub) {
      throw new NotFoundError("Suscripcion no encontrada");
    }

    const editableStatuses: SubscriptionStatus[] = [
      "active",
      "paused",
      "scheduled",
    ];
    if (!editableStatuses.includes(sub.status as SubscriptionStatus)) {
      throw new BadRequestError(
        "Solo se pueden editar fechas de suscripciones activas, pausadas o programadas",
      );
    }

    assertStartDateWithinLimits(newStartDate);

    if (newStartDate === sub.startDate) {
      throw new BadRequestError(
        "La nueva fecha de inicio es igual a la actual",
      );
    }

    // Block when an attendance would fall before the new startDate. We
    // only consider attendances that already lived inside this sub's
    // original range — older sessions belonged to a previous sub.
    const attendanceConflict = await this.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, sub.userId),
          sql`${schema.attendance.sessionDate} >= ${sub.startDate}`,
          sql`${schema.attendance.sessionDate} < ${newStartDate}`,
        ),
      )
      .limit(1);

    if (attendanceConflict.length > 0) {
      throw new BadRequestError(
        "El alumno ya tiene asistencias registradas dentro del rango actual; no se puede mover la fecha de inicio más adelante",
      );
    }

    // Plan-derived duration drives the new endDate (single source of truth
    // — same formula as assignPlan / renew).
    const [plan] = await this.db
      .select({ durationDays: schema.subscriptionPlans.durationDays })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, sub.planId));

    if (!plan) {
      throw new BadRequestError("Plan no encontrado");
    }

    const newEndDateObj = new Date(newStartDate);
    newEndDateObj.setDate(newEndDateObj.getDate() + plan.durationDays);
    const newEndDate = newEndDateObj.toISOString().split("T")[0];

    const today = todayDateString();
    // Paused subs stay paused — only the date window shifts. For active /
    // scheduled subs, the status follows the new startDate vs today.
    const newStatus: SubscriptionStatus =
      sub.status === "paused"
        ? "paused"
        : newStartDate > today
          ? "scheduled"
          : "active";

    const previousStartDate = sub.startDate;
    const previousStatus = sub.status;

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.subscriptions)
        .set({
          startDate: newStartDate,
          endDate: newEndDate,
          status: newStatus,
        })
        .where(eq(schema.subscriptions.id, subscriptionId));

      await this.recomputeUserStatus(sub.userId, tx);
    });

    // Regenerate bookings for presencial subs with anchors. Cancel covers
    // the whole future range (today onwards); regen seeds bookings from
    // max(today, newStartDate) to newEndDate so a moved-to-future sub
    // doesn't materialize bookings before it actually starts.
    if (
      this.bookingService &&
      sub.scheduleIds.length > 0 &&
      newStatus !== "paused"
    ) {
      await this.bookingService.cancelFutureBookings(subscriptionId);
      const regenStart = newStartDate > today ? newStartDate : today;
      if (regenStart <= newEndDate) {
        await this.bookingService.generateFixedBookings(
          subscriptionId,
          sub.userId,
          sub.scheduleIds,
          regenStart,
          newEndDate,
          sub.branchId,
        );
      }
    }

    this.log.info(
      {
        subscriptionId,
        userId: sub.userId,
        actorId,
        previousStartDate,
        newStartDate,
        previousStatus,
        newStatus,
      },
      "Subscription start date edited",
    );

    const updated = await this.getSubscriptionById(subscriptionId);
    return updated!;
  }

  /**
   * Cron entrypoint — flips every scheduled sub whose startDate has arrived
   * to 'active' and recomputes the owning member's user.status. Handles
   * standalone scheduled subs (created via assignPlan with future startDate)
   * as well as scheduled successors created by change-plan / renewal.
   */
  async activateDueScheduledSubs(): Promise<number> {
    const today = todayDateString();
    const due = await this.db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
      })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.status, "scheduled"),
          sql`${schema.subscriptions.startDate} <= ${today}`,
        ),
      );

    for (const row of due) {
      await this.activateScheduledSub(row.id);
      await this.recomputeUserStatus(row.userId, this.db);
    }

    return due.length;
  }

  /**
   * Bulk auto-expire: find every user with an active subscription past its
   * end date and run the per-user expire path for each. The per-user
   * autoExpireSubscriptions already handles scheduled-successor activation,
   * enrollment teardown and recomputeUserStatus, so this just fans it out.
   *
   * Complements the "expire on read" pattern: without a daily sweep,
   * users.status stays stale (e.g. 'activo' for a lapsed member) for every
   * consumer that reads the column directly — the admin members-list status
   * filter, analytics, the member app — until someone opens that member's
   * detail. Returns the number of users processed. Invoked by the daily cron.
   */
  async autoExpireDueSubscriptions(): Promise<number> {
    const today = todayDateString();
    const due = await this.db
      .select({ userId: schema.subscriptions.userId })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.status, "active"),
          sql`${schema.subscriptions.endDate} < ${today}`,
        ),
      )
      .groupBy(schema.subscriptions.userId);

    for (const row of due) {
      await this.autoExpireSubscriptions(row.userId);
    }

    return due.length;
  }

  /**
   * List schedule-change audit entries for a subscription (newest first).
   */
  async listScheduleChanges(
    subscriptionId: number,
  ): Promise<import("./types").SubscriptionScheduleChangeEntry[]> {
    const rows = await this.db
      .select({
        id: schema.subscriptionScheduleChanges.id,
        subscriptionId: schema.subscriptionScheduleChanges.subscriptionId,
        actorId: schema.subscriptionScheduleChanges.actorId,
        actorFirstName: schema.users.firstName,
        actorLastName: schema.users.lastName,
        oldScheduleIds: schema.subscriptionScheduleChanges.oldScheduleIds,
        newScheduleIds: schema.subscriptionScheduleChanges.newScheduleIds,
        reason: schema.subscriptionScheduleChanges.reason,
        createdAt: schema.subscriptionScheduleChanges.createdAt,
      })
      .from(schema.subscriptionScheduleChanges)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.subscriptionScheduleChanges.actorId),
      )
      .where(
        eq(schema.subscriptionScheduleChanges.subscriptionId, subscriptionId),
      )
      .orderBy(desc(schema.subscriptionScheduleChanges.createdAt));

    return rows.map((r) => ({
      id: r.id,
      subscriptionId: r.subscriptionId,
      actorId: r.actorId,
      actorName:
        [r.actorFirstName, r.actorLastName].filter(Boolean).join(" ") || null,
      oldScheduleIds: r.oldScheduleIds ?? [],
      newScheduleIds: r.newScheduleIds ?? [],
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Pause an active subscription. Optionally schedule auto-resume on pauseEndDate.
   * If pauseEndDate is omitted, pause is open-ended (manual resume only).
   */
  async pauseSubscription(
    userId: number,
    pauseEndDate?: string,
  ): Promise<SubscriptionDetail> {
    const sub = await this.getMemberSubscription(userId);
    if (!sub) {
      throw new NotFoundError("No se encontro suscripcion activa");
    }
    if (sub.status !== "active") {
      throw new BadRequestError("Solo se pueden pausar suscripciones activas");
    }

    if (pauseEndDate !== undefined) {
      const today = new Date().toISOString().split("T")[0];
      if (pauseEndDate <= today) {
        throw new BadRequestError(
          "La fecha de reanudacion debe ser posterior a hoy",
        );
      }
    }

    // ── Atomic pause (Phase 103 D-16, defensive) ──
    // paused counts as active for status purposes (R5: "active/paused"), so
    // recomputeUserStatus is a no-op transition here, but consistency
    // matters: the tx ensures any future status-affecting change in this
    // path stays atomic.
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.subscriptions)
        .set({
          status: "paused",
          pausedAt: new Date(),
          pauseEndDate: pauseEndDate ?? null,
        })
        .where(eq(schema.subscriptions.id, sub.id));

      // Phase 112 D-16: cascade pause to all active enrollments tied to this
      // sub (every source: plan_linked, plan_bundle, admin_addon). Closes
      // the pre-Phase-112 gap where pauseSubscription left enrollments
      // in 'active' state. Runs inside the existing tx so a failure rolls
      // back the sub status update. Soft DI: when EnrollmentService is not
      // injected (legacy direct-instantiation tests), skip the cascade —
      // pre-Phase-112 behavior is preserved (Rule 3, mirrors Plan 02
      // optional-DI policy).
      if (this.enrollmentService) {
        await this.enrollmentService.pauseForSubscription(sub.id, tx);
      }

      await this.recomputeUserStatus(userId, tx);
    });

    // Cancel all future reservations for this sub's fixed slots. Schedules
    // (subscription_schedules) stay intact so resume can auto-regenerate.
    if (this.bookingService) {
      await this.bookingService.cancelFutureBookings(sub.id);
    }

    const updated = await this.getSubscriptionById(sub.id);
    if (!updated) throw new Error("Failed to retrieve updated subscription");

    this.log.info(
      { userId, subscriptionId: sub.id, pauseEndDate: pauseEndDate ?? null },
      "Subscription paused",
    );
    return updated;
  }

  /**
   * Resume a paused subscription. Extends endDate by the paused duration.
   */
  async resumeSubscription(userId: number): Promise<SubscriptionDetail> {
    const sub = await this.getActivePausedSubscriptionRaw(userId);
    if (!sub) {
      throw new NotFoundError("No se encontro suscripcion pausada");
    }
    if (sub.status !== "paused") {
      throw new BadRequestError(
        "Solo se pueden reanudar suscripciones pausadas",
      );
    }
    if (!sub.pausedAt) {
      throw new BadRequestError("La suscripcion no tiene fecha de pausa");
    }

    // Calculate paused duration and extend end date
    const pausedAt = new Date(sub.pausedAt);
    const now = new Date();
    const pausedMs = now.getTime() - pausedAt.getTime();
    const pausedDays = Math.ceil(pausedMs / (1000 * 60 * 60 * 24));

    let newEndDate: string | null = null;
    if (sub.endDate) {
      const endDate = new Date(sub.endDate);
      endDate.setDate(endDate.getDate() + pausedDays);
      newEndDate = endDate.toISOString().split("T")[0];
    }

    const updateData: Partial<typeof schema.subscriptions.$inferInsert> = {
      status: "active",
      resumedAt: new Date(),
      pausedAt: null,
      pauseEndDate: null,
    };
    if (newEndDate) {
      updateData.endDate = newEndDate;
    }

    // ── Atomic resume (Phase 103 D-16, defensive) ──
    // paused→active doesn't change user.status (already 'activo'), but the
    // recomputeUserStatus call inside the tx keeps the invariant explicit.
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.subscriptions)
        .set(updateData)
        .where(eq(schema.subscriptions.id, sub.id));

      // Phase 112 D-17: un-pause enrollments that were paused by this sub.
      // Cancelled / completed / expired rows are NOT resurrected — only the
      // last-paused state is reverted to active. Soft DI: when
      // EnrollmentService is not injected (legacy direct-instantiation
      // tests), skip the cascade (mirrors pauseSubscription + Plan 02
      // optional-DI policy).
      if (this.enrollmentService) {
        await this.enrollmentService.resumeForSubscription(sub.id, tx);
      }

      await this.recomputeUserStatus(userId, tx);
    });

    // Regenerate bookings for the resume window (today → endDate).
    // Pause cleared out future bookings; subscription_schedules stayed,
    // so we can auto-populate without asking the admin to re-set slots.
    // (External helper, not transaction-aware — kept on this.db.)
    await populateBookings(this.db, this.log, sub.id);

    const updated = await this.getSubscriptionById(sub.id);
    if (!updated) throw new Error("Failed to retrieve updated subscription");

    this.log.info(
      { userId, subscriptionId: sub.id, pausedDays, newEndDate },
      "Subscription resumed",
    );
    return updated;
  }

  /**
   * Auto-resume paused subscriptions whose pauseEndDate has arrived.
   * Intended to be called by a daily cron job. Returns the number of
   * subscriptions resumed.
   */
  async autoResumeDuePauses(): Promise<number> {
    const today = new Date().toISOString().split("T")[0];

    const due = await this.db
      .select({ userId: schema.subscriptions.userId })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.status, "paused"),
          sql`${schema.subscriptions.pauseEndDate} IS NOT NULL`,
          sql`${schema.subscriptions.pauseEndDate} <= ${today}`,
        ),
      );

    let resumed = 0;
    for (const row of due) {
      try {
        await this.resumeSubscription(row.userId);
        resumed += 1;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Error desconocido";
        this.log.error(
          { userId: row.userId, error: message },
          "Auto-resume failed for user",
        );
      }
    }

    if (resumed > 0) {
      this.log.info({ resumed, total: due.length }, "Auto-resume completed");
    }
    return resumed;
  }

  /**
   * Cancel an active or paused subscription.
   * Also cancels any scheduled (early-renewed) subscription for this member.
   *
   * Phase 111 (REQ-3): refuses to cancel when there are non-voided charge
   * transactions linked to the sub. Admin must use TransactionService.void
   * (Detalle Financiero → Anular) on each tx first, then retry the cancel.
   * The structured error body (code: 'SUB_HAS_ACTIVE_TRANSACTIONS' + details
   * with transactionIds, totalAmount, currency) is JSON-encoded into
   * BadRequestError.message and unwrapped at the route layer.
   *
   * Phase 111 (REQ-7 / D-13): writes one audit_log row with
   * action='subscription_cancelled' inside the same db.transaction. Atomic
   * with the status mutation — if the tx rolls back, the audit row vanishes.
   *
   * `actorId` (Phase 111): JWT-authenticated principal sourced at the route
   * layer (request.user.userId). All callers MUST pass it explicitly so the
   * audit row records the real actor (T-111-14 mitigation).
   */
  async cancelSubscription(
    userId: number,
    actorId: number,
    notes?: string | null,
    subscriptionId?: number,
  ): Promise<SubscriptionDetail> {
    // If subscriptionId is provided the admin is targeting a specific sub
    // (e.g., the scheduled renewal of caso Pomilio, where the active membership
    // must NOT be touched). Otherwise fall back to the "current" sub
    // (active/paused preferred) — the legacy behaviour for callers that
    // don't yet pass the id.
    let sub: SubscriptionDetail | null;
    if (subscriptionId !== undefined) {
      const all = await this.getMemberSubscriptions(userId);
      sub = all.find((s) => s.id === subscriptionId) ?? null;
      if (!sub) {
        throw new NotFoundError(
          "No se encontro la suscripcion indicada para este alumno",
        );
      }
    } else {
      sub = await this.getMemberSubscription(userId);
      if (!sub) {
        throw new NotFoundError(
          "No se encontro suscripcion activa, pausada o programada",
        );
      }
    }
    if (
      sub.status !== "active" &&
      sub.status !== "paused" &&
      sub.status !== "scheduled"
    ) {
      throw new BadRequestError(
        "Solo se pueden cancelar suscripciones activas, pausadas o programadas",
      );
    }

    const updateData: Partial<typeof schema.subscriptions.$inferInsert> = {
      status: "cancelled",
      cancelledAt: new Date(),
    };
    if (notes) {
      updateData.notes = notes;
    }

    // ── Atomic cancel (Phase 103 D-16, R6) ──
    // Cancel the active sub + any scheduled successor + recompute user
    // status in a single transaction. recomputeUserStatus flips user to
    // 'inactivo' if no other active/paused sub remains (D-04: never back to
    // freemium/prueba — paying history is preserved).
    const prevStatus = sub.status;
    await this.db.transaction(async (tx) => {
      // REQ-3 (Phase 111 D-09): block cancellation if there are active
      // (non-voided) charge transactions linked to this sub. Forces the
      // admin to anular each charge first via Detalle Financiero (which
      // calls TransactionService.void → soft-void + balance rollback).
      const activeLinks = await tx
        .select({
          txId: schema.financialTransactions.id,
          amount: schema.financialTransactions.amount,
          currency: schema.financialTransactions.currency,
        })
        .from(schema.transactionLinks)
        .innerJoin(
          schema.financialTransactions,
          eq(
            schema.transactionLinks.transactionId,
            schema.financialTransactions.id,
          ),
        )
        .where(
          and(
            eq(schema.transactionLinks.targetKind, "subscription"),
            eq(schema.transactionLinks.targetId, sub.id),
            isNull(schema.financialTransactions.voidedAt),
          ),
        );
      if (activeLinks.length > 0) {
        const totalAmount = activeLinks.reduce((s, l) => s + l.amount, 0);
        const currency = activeLinks[0].currency;
        // Phase 110 D-05 structured 4xx body. Encoded as JSON inside the
        // BadRequestError message and unwrapped by the route handler so the
        // existing global error pipeline isn't affected for other 400s.
        throw new BadRequestError(
          JSON.stringify({
            message:
              "Hay transacciones de cobro activas en esta suscripción. Anulalas primero (Detalle Financiero → Anular) y volvé a intentar.",
            code: "SUB_HAS_ACTIVE_TRANSACTIONS",
            details: {
              transactionIds: activeLinks.map((l) => l.txId),
              totalAmount,
              currency,
            },
          }),
        );
      }

      await tx
        .update(schema.subscriptions)
        .set(updateData)
        .where(eq(schema.subscriptions.id, sub.id));

      // Cascade-cancel scheduled successors ONLY when killing the current
      // membership (active/paused). When the admin cancels a scheduled sub
      // directly (e.g., reverting a wrong renewal — caso Pomilio), the
      // current membership must stay intact, so we skip the cascade.
      let scheduledSuccessors: { id: number }[] = [];
      if (sub.status !== "scheduled") {
        scheduledSuccessors = await tx
          .select({ id: schema.subscriptions.id })
          .from(schema.subscriptions)
          .where(
            and(
              eq(schema.subscriptions.userId, userId),
              eq(schema.subscriptions.status, "scheduled"),
            ),
          );
        await tx
          .update(schema.subscriptions)
          .set({
            status: "cancelled",
            cancelledAt: new Date(),
            notes: "Cancelado por cancelacion de suscripcion activa",
          })
          .where(
            and(
              eq(schema.subscriptions.userId, userId),
              eq(schema.subscriptions.status, "scheduled"),
            ),
          );
      }

      // Forgive phantom debt: when a sub was assigned without a paid charge,
      // recordAssignmentCharge seeds a positive balance row so the unpaid
      // amount surfaces in Reporte Deudas. On cancel that obligation is gone,
      // so any positive balance for this sub (and its scheduled successors)
      // must collapse to 0 — otherwise Finanzas keeps trying to settle it
      // forever (caso Jacqueline/Adriana/Lucas/Vita: 1.13M ARS de deuda
      // fantasma post-cancel). Only positives are zeroed: a negative balance
      // (saldo a favor) survives so the member can still apply it elsewhere.
      // Voided-tx deltas already rolled back via BalanceService.applyDelta,
      // so the balance row reflects the residual ledger state — anything
      // still > 0 here is the phantom seed.
      const targetSubIds = [sub.id, ...scheduledSuccessors.map((s) => s.id)];
      await tx
        .update(schema.balances)
        .set({ amount: 0, lastRecomputedAt: new Date() })
        .where(
          and(
            eq(schema.balances.memberId, userId),
            eq(schema.balances.targetKind, "subscription"),
            inArray(schema.balances.targetId, targetSubIds),
            sql`${schema.balances.amount} > 0`,
          ),
        );

      // Phase 112-02: enrollment teardown is now driven by subscription_id
      // via EnrollmentService.tearDownForSubscription, generalized across
      // all sources (plan_linked, plan_bundle, admin_addon). Replaces the
      // legacy tearDownBundleEnrollments + tearDownLinkedProgramEnrollment
      // pair with a single call. Runs inside the same tx so cancellation +
      // enrollment teardown + pointer cleanup are atomic.
      await this.requireEnrollmentService().tearDownForSubscription(sub.id, tx);

      await this.recomputeUserStatus(userId, tx);

      // REQ-7 (Phase 111 D-13): subscription_cancelled forensic audit row.
      // Atomic with the cancel — if any of the writes above rolls back,
      // this row vanishes too (helper requires tx handle, never opens its
      // own transaction).
      await auditLog.write(tx, {
        actorId,
        action: "subscription_cancelled",
        targetKind: "subscription",
        targetId: sub.id,
        payload: {
          subId: sub.id,
          prevStatus,
          newStatus: "cancelled",
          cancelledAt: new Date().toISOString(),
          notes: notes ?? null,
          // REQ-3 already blocked when active tx exist, so by definition the
          // successful cancel path has no live charges against this sub.
          hasActiveTx: false,
        },
        reason: notes ?? null,
      });
    });

    // Cancel all future bookings for fixed-plan subscriptions (external
    // helper, not transaction-aware — Rule 4 / WARNING 9 keeps it on this.db).
    if (this.bookingService) {
      await this.bookingService.cancelFutureBookings(sub.id);
    }

    const updated = await this.getSubscriptionById(sub.id);
    if (!updated) throw new Error("Failed to retrieve updated subscription");

    this.log.info({ userId, subscriptionId: sub.id }, "Subscription cancelled");
    return updated;
  }

  /**
   * Calculate prorated credit for an active subscription.
   * Class-based plans: ratio of remaining classes to total budget.
   * Unlimited plans: ratio of remaining days to total duration.
   */
  calculateProration(
    subscription: SubscriptionDetail,
    plan: PlanDetail,
  ): ProrationResult {
    if (plan.classesPerWeek !== null) {
      // Class-based plan — use stored budget (single period, no accumulation)
      const totalBudget =
        subscription.classesBudget ??
        Math.ceil(plan.durationDays / 7) * plan.classesPerWeek;
      const remaining = subscription.classesRemaining ?? 0;
      const ratio = totalBudget > 0 ? remaining / totalBudget : 0;
      const remainingValue = Math.round(ratio * subscription.pricePaid);
      return {
        remainingValue,
        remainingRatio: ratio,
        remainingDetail: `${remaining}/${totalBudget} clases`,
      };
    }

    // Unlimited plan — prorate by remaining days using actual subscription duration
    const today = new Date().toISOString().split("T")[0];
    const endDate = subscription.endDate;
    if (!endDate) {
      return {
        remainingValue: 0,
        remainingRatio: 0,
        remainingDetail: "0/0 dias",
      };
    }
    const startMs = new Date(subscription.startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const todayMs = new Date(today).getTime();
    const totalDays = Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(
      0,
      Math.ceil((endMs - todayMs) / (1000 * 60 * 60 * 24)),
    );
    const ratio = totalDays > 0 ? daysRemaining / totalDays : 0;
    const remainingValue = Math.round(ratio * subscription.pricePaid);
    return {
      remainingValue,
      remainingRatio: ratio,
      remainingDetail: `${daysRemaining}/${totalDays} dias`,
    };
  }

  /**
   * Preview a plan change for a member: checks upgrade/downgrade,
   * calculates proration, and returns net amount.
   */
  async getChangePlanPreview(
    userId: number,
    targetPlanId: number,
  ): Promise<ChangePlanPreview> {
    const sub = await this.getMemberSubscription(userId);
    if (!sub) {
      throw new NotFoundError("No se encontro suscripcion activa o pausada");
    }

    const currentPlan = await this.getPlanById(sub.planId);
    if (!currentPlan) {
      throw new NotFoundError("Plan actual no encontrado");
    }

    const targetPlan = await this.getPlanById(targetPlanId);
    if (!targetPlan) {
      throw new NotFoundError("Plan destino no encontrado");
    }

    const currentPlanInfo = {
      id: currentPlan.id,
      name: currentPlan.name,
      priceRegular: currentPlan.priceRegular,
      pricePaid: sub.pricePaid,
    };
    const targetPlanInfo = {
      id: targetPlan.id,
      name: targetPlan.name,
      priceRegular: targetPlan.priceRegular,
    };

    // Downgrade check: block if target is cheaper
    if (targetPlan.priceRegular < currentPlan.priceRegular) {
      return {
        allowed: false,
        reason: `No se puede cambiar a un plan de menor precio durante el periodo activo. La suscripcion vence el ${sub.endDate}.`,
        currentPlan: currentPlanInfo,
        targetPlan: targetPlanInfo,
        proration: null,
        netAmount: null,
        expiryDate: sub.endDate ?? undefined,
      };
    }

    // Upgrade or same price: calculate proration
    const proration = this.calculateProration(sub, currentPlan);
    const netAmount = Math.max(
      0,
      targetPlan.priceRegular - proration.remainingValue,
    );

    return {
      allowed: true,
      currentPlan: currentPlanInfo,
      targetPlan: targetPlanInfo,
      proration,
      netAmount,
      // Surfaced so the admin UI can pre-fill the "mantener vencimiento" option
      // (new plan inherits this expiry) without a second round-trip.
      expiryDate: sub.endDate ?? undefined,
    };
  }

  /**
   * Change a member's current plan. Dispatches based on input.startMode:
   *   - "now" (default): close current, apply proration, create new active sub
   *   - "after_current": keep current running, queue scheduled sub that
   *     activates on current.endDate (no proration, full price charged now)
   *
   * A startDate in the future is silently routed to the after_current path
   * even when startMode='now'. Why: changePlanNow closes the current sub
   * immediately as 'changed' and cancels its bookings — if the new sub does
   * not start until later, the member loses already-paid days of coverage
   * and ends up users.status='inactivo' indefinitely (no cron flips an
   * 'active'-but-future-dated sub). Routing to after_current preserves the
   * current sub until its natural endDate and creates the new sub as
   * 'scheduled', which the daily 00:05 ART cron activates on its startDate.
   */
  async changePlan(
    userId: number,
    input: AssignPlanInput,
    adminId: number,
  ): Promise<SubscriptionDetail> {
    if (
      input.startMode === "after_current" ||
      input.startDate > todayDateString()
    ) {
      return this.changePlanAfterCurrent(userId, input, adminId);
    }
    return this.changePlanNow(userId, input, adminId);
  }

  /**
   * Immediate plan change: close current, apply proration, create new active sub.
   * Cancels any scheduled (early-renewed) subscription first.
   */
  private async changePlanNow(
    userId: number,
    input: AssignPlanInput,
    adminId: number,
  ): Promise<SubscriptionDetail> {
    // Cancel any scheduled successor before proceeding
    await this.db
      .update(schema.subscriptions)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        notes: "Cancelado por cambio de plan",
      })
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          eq(schema.subscriptions.status, "scheduled"),
        ),
      );

    const existingSub = await this.getMemberSubscription(userId);
    if (!existingSub) {
      throw new NotFoundError("No se encontro suscripcion activa o pausada");
    }

    // Look up the member's branch country for the cross-country plan guard.
    const [memberForCountry] = await this.db
      .select({
        branchCountry: schema.branches.country,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(eq(schema.users.id, userId));

    if (!memberForCountry) {
      throw new NotFoundError("Miembro no encontrado");
    }

    // Get current and target plans for upgrade/downgrade validation
    const currentPlan = await this.getPlanById(existingSub.planId);
    if (!currentPlan) {
      throw new NotFoundError("Plan actual no encontrado");
    }

    const targetPlan = await this.getPlanById(input.planId);
    if (!targetPlan) {
      throw new NotFoundError("Plan destino no encontrado");
    }

    // Reject cross-country plan changes before any state mutation.
    const newPlan = targetPlan;
    if (newPlan.country !== memberForCountry.branchCountry) {
      throw new BadRequestError(
        "El plan no corresponde al pais de la sucursal",
      );
    }

    // Block downgrade (target cheaper than current)
    if (targetPlan.priceRegular < currentPlan.priceRegular) {
      throw new BadRequestError(
        "No se puede cambiar a un plan de menor precio durante el periodo activo",
      );
    }

    // Calculate proration from CURRENT subscription only (single record, no accumulation)
    const proration = this.calculateProration(existingSub, currentPlan);

    // Resolve pricing the same way changePlanAfterCurrent does: respect
    // priceOverrideAmount (admin-typed custom amount, no proration applied)
    // and priceTypeApplied (regular/zero/credit_card) before falling back
    // to priceRegular. Without this, the UI's price-type and override
    // selectors silently no-op for "Cambiar ahora".
    let netAmount: number;
    let resolvedPriceType: PriceType = input.priceTypeApplied;
    let resolvedOverrideAmount: number | null = null;
    let resolvedOverrideReason: string | null = null;

    if (
      input.priceOverrideAmount !== undefined &&
      input.priceOverrideAmount >= 0
    ) {
      if (!input.priceOverrideReason) {
        throw new BadRequestError(
          "Se requiere una razon para el precio personalizado",
        );
      }
      netAmount = input.priceOverrideAmount;
      resolvedOverrideAmount = input.priceOverrideAmount;
      resolvedOverrideReason = input.priceOverrideReason;
    } else {
      const basePrice = this.getBasePrice(targetPlan, resolvedPriceType);
      netAmount = Math.max(0, basePrice - proration.remainingValue);
      resolvedOverrideAmount = netAmount;
      resolvedOverrideReason = `Cambio de plan: credito $${proration.remainingValue} (${proration.remainingDetail})`;
    }

    // Phase 112-02 + 03: tear down the outgoing sub's plan-bound enrollments
    // BEFORE closing it. Runs on this.db (not in the new-sub tx) by design
    // — we want the teardown committed so the auto-enroll inside the
    // new-sub tx sees a clean slate, and so tearDown's protection logic
    // (which scans for OTHER active|paused subs of the user) doesn't see
    // the new sub as a "protector" of the old plan's rows.
    //
    // Phase 112-03 (Rule 1 fix vs Plan-as-written): pass
    // excludeSources=['admin_addon'] so admin add-on rows attached to the
    // closing sub survive this teardown — they will be relocated to the
    // new sub by `transferAddons` inside the new-sub tx below (D-19).
    // Without this exclusion, admin_addons would be cancelled here and
    // transferAddons would find nothing to move (silent D-19 violation).
    await this.requireEnrollmentService().tearDownForSubscription(
      existingSub.id,
      undefined,
      { excludeSources: ["admin_addon"] },
    );

    // Close old subscription with status='changed'.
    // We do this BEFORE creating the new one. If new creation fails,
    // we restore the old sub back to its original status.
    const oldStatus = existingSub.status as "active" | "paused";
    await this.db
      .update(schema.subscriptions)
      .set({
        status: "changed",
        notes: existingSub.notes
          ? `${existingSub.notes} | Cambiado a ${targetPlan.name}`
          : `Cambiado a ${targetPlan.name}`,
      })
      .where(eq(schema.subscriptions.id, existingSub.id));

    // Cancel future bookings for the old subscription
    if (this.bookingService) {
      await this.bookingService.cancelFutureBookings(existingSub.id);
    }

    // Create new subscription directly (not via assignPlan, to avoid conflict check issues)
    try {
      // Validate fixed plan schedules
      if (targetPlan.bookingMode === "fixed") {
        if (!input.scheduleIds || input.scheduleIds.length === 0) {
          throw new BadRequestError(
            "Para planes fijos se requiere scheduleIds con los horarios seleccionados",
          );
        }
        if (
          targetPlan.classesPerWeek !== null &&
          input.scheduleIds.length !== targetPlan.classesPerWeek
        ) {
          throw new BadRequestError(
            `Debes seleccionar exactamente ${targetPlan.classesPerWeek} horarios. Seleccionaste ${input.scheduleIds.length}.`,
          );
        }
        await this.validateAnchorSet(
          input.scheduleIds,
          input.branchId,
          targetPlan,
        );
      }

      // Calculate new period. Default: fresh full period from startDate.
      // "Mantener vencimiento" (endDateOverride): inherit the current sub's
      // expiry instead, and prorate the class budget to the inherited window
      // (whole weeks at the new plan's weekly rate) so a 15-day carryover
      // doesn't grant a full 30-day cupo.
      let endDateStr: string;
      let classesRemaining: number | null;
      if (input.endDateOverride) {
        if (input.endDateOverride <= input.startDate) {
          throw new BadRequestError(
            "El vencimiento debe ser posterior a la fecha de inicio",
          );
        }
        endDateStr = input.endDateOverride;
        const inheritedDays = daysBetween(input.startDate, endDateStr);
        classesRemaining =
          targetPlan.classesPerWeek !== null
            ? Math.ceil(inheritedDays / 7) * targetPlan.classesPerWeek
            : null;
      } else {
        const startDate = new Date(input.startDate);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + targetPlan.durationDays);
        endDateStr = endDate.toISOString().split("T")[0];
        classesRemaining =
          targetPlan.classesPerWeek !== null
            ? Math.ceil(targetPlan.durationDays / 7) * targetPlan.classesPerWeek
            : null;
      }

      // ── Atomic new-sub creation (Phase 103 D-16) ──
      // Wrap the new subscription INSERT + dependent writes in a single
      // transaction so Task 1b's recomputeUserStatus rolls back atomically
      // with the new sub on failure. External helpers (bookingService,
      // transactionService) stay on this.db (out of scope per WARNING 9).
      const { newSubscriptionId } = await this.db.transaction(async (tx) => {
        const insResult = await tx.insert(schema.subscriptions).values({
          userId,
          planId: input.planId,
          branchId: input.branchId,
          status: "active",
          startDate: input.startDate,
          endDate: endDateStr,
          pricePaid: netAmount,
          priceTypeApplied: resolvedPriceType,
          priceOverrideAmount: resolvedOverrideAmount,
          priceOverrideReason: resolvedOverrideReason,
          classesRemaining,
          classesBudget: classesRemaining,
          previousSubscriptionId: existingSub.id,
          notes: input.notes ?? null,
          // Propagate the new plan's currency onto the subscription. Cross-
          // country transitions are rejected above, but this is an explicit
          // grep-visible marker that currency follows the plan.
          currency: newPlan.currency,
          priceRegularSnapshot: newPlan.priceRegular,
        });

        const subId = Number(insResult[0].insertId);

        // Fixed plan: store schedules and generate bookings
        let credits = 0;
        if (
          targetPlan.bookingMode === "fixed" &&
          input.scheduleIds &&
          input.scheduleIds.length > 0
        ) {
          await tx.insert(schema.subscriptionSchedules).values(
            input.scheduleIds.map((scheduleId) => ({
              subscriptionId: subId,
              scheduleId,
            })),
          );

          if (this.bookingService) {
            const bookingResult =
              await this.bookingService.generateFixedBookings(
                subId,
                userId,
                input.scheduleIds,
                input.startDate,
                endDateStr,
                input.branchId,
              );
            credits = bookingResult.holidaysSkipped;
          }

          if (credits > 0) {
            await tx
              .update(schema.subscriptions)
              .set({ replacementCredits: credits })
              .where(eq(schema.subscriptions.id, subId));
          }
        }

        // Phase 112-02: program enrollment for the new plan flows through
        // EnrollmentService — single call covers both linkedProgramId and
        // grantsAllPrograms branches. The OLD plan's plan-bound rows were
        // already torn down above by tearDownForSubscription(existingSub.id,
        // {excludeSources:['admin_addon']}), so no inline cancel block is
        // needed here. Guarded by plan flags so plans with neither binding
        // skip the chokepoint cleanly (matches assignPlan precedent).
        if (targetPlan.linkedProgramId || targetPlan.grantsAllPrograms) {
          await this.requireEnrollmentService().enrollFromPlan(
            userId,
            {
              id: targetPlan.id,
              linkedProgramId: targetPlan.linkedProgramId,
              grantsAllPrograms: targetPlan.grantsAllPrograms,
            },
            subId,
            tx,
          );
        }

        // Phase 112 D-19: transfer admin add-ons from the closing sub to
        // the new sub. Re-charging is NOT done (decision A). plan_linked /
        // plan_bundle enrollments are not transferred — they were torn
        // down above (tearDown excluded admin_addon so those rows are
        // still tied to existingSub.id and ready to move). enrollFromPlan
        // ran first so any new plan-bound rows are wired to subId; this
        // step now relocates the surviving admin_addon rows.
        await this.requireEnrollmentService().transferAddons(
          existingSub.id,
          subId,
          tx,
        );

        // ── Recompute user.status (R5/D-01) ──
        await this.recomputeUserStatus(userId, tx);

        // ── Atomic charge recording (Phase 107 D-10 / CHARGE-03) ──
        // Net (post-proration) charge persisted inside the same tx as the
        // new subscription. amountReceived defaults to netAmount when the
        // client doesn't supply it (D-13 backward-compat).
        await this.recordAssignmentCharge(tx, {
          userId,
          subscriptionId: subId,
          planId: targetPlan.id,
          planName: targetPlan.name,
          planCurrency: newPlan.currency,
          chargeBase: netAmount,
          amountReceived: input.amountReceived,
          paymentMethod: input.paymentMethod,
          branchId: input.branchId,
          effectiveDate: input.startDate,
          adminId,
          flow: "change-now",
        });

        return { newSubscriptionId: subId };
      });

      // Auto-migrate member from virtual branch to subscription's physical branch
      const [memberForMigration] = await this.db
        .select({ branchId: schema.users.branchId })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      if (
        memberForMigration &&
        memberForMigration.branchId !== input.branchId
      ) {
        const [currentBranch] = await this.db
          .select({ isVirtual: schema.branches.isVirtual })
          .from(schema.branches)
          .where(eq(schema.branches.id, memberForMigration.branchId));

        if (currentBranch?.isVirtual) {
          await this.db
            .update(schema.users)
            .set({ branchId: input.branchId })
            .where(eq(schema.users.id, userId));

          this.log.info(
            {
              userId,
              fromBranchId: memberForMigration.branchId,
              toBranchId: input.branchId,
            },
            "Auto-migrated member from virtual branch to subscription branch on plan change",
          );
        }
      }

      const newSub = await this.getSubscriptionById(newSubscriptionId);
      if (!newSub) {
        throw new Error(
          "Failed to retrieve new subscription after plan change",
        );
      }

      this.log.info(
        {
          userId,
          oldSubscriptionId: existingSub.id,
          newSubscriptionId,
          oldPlan: existingSub.planName,
          newPlan: targetPlan.name,
          prorationCredit: proration.remainingValue,
          netAmount,
          adminId,
        },
        "Plan changed successfully",
      );

      return newSub;
    } catch (err) {
      // Restore old subscription on failure
      await this.db
        .update(schema.subscriptions)
        .set({
          status: oldStatus,
          notes: existingSub.notes,
        })
        .where(eq(schema.subscriptions.id, existingSub.id));
      throw err;
    }
  }

  /**
   * Schedule a plan change to start when the current plan ends.
   * Current sub keeps running; new sub is created as "scheduled" starting on
   * current.endDate, full price charged now, no proration. Fixed-plan bookings
   * are generated at scheduling time for the future period.
   */
  private async changePlanAfterCurrent(
    userId: number,
    input: AssignPlanInput,
    adminId: number,
  ): Promise<SubscriptionDetail> {
    // Block if a scheduled sub already exists
    const [existingScheduled] = await this.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          eq(schema.subscriptions.status, "scheduled"),
        ),
      )
      .limit(1);

    if (existingScheduled) {
      throw new ConflictError(
        "Ya existe una suscripcion programada. Cancele la existente antes de programar otra.",
      );
    }

    // Find current active subscription (must be active, not paused, with endDate)
    const currentSub = await this.getMemberSubscription(userId);
    if (!currentSub) {
      throw new NotFoundError("No se encontro suscripcion activa");
    }
    if (currentSub.status !== "active") {
      throw new BadRequestError(
        "Solo se puede programar un cambio de plan desde una suscripcion activa",
      );
    }
    if (!currentSub.endDate) {
      throw new BadRequestError(
        "No se puede programar un cambio desde un plan sin fecha de fin",
      );
    }

    const today = new Date().toISOString().split("T")[0];
    if (currentSub.endDate < today) {
      throw new BadRequestError(
        "El plan actual ya termino. Use cambio de plan inmediato.",
      );
    }

    // Validate target plan
    const targetPlan = await this.getPlanById(input.planId);
    if (!targetPlan) {
      throw new NotFoundError("Plan destino no encontrado");
    }
    if (!targetPlan.isActive) {
      throw new BadRequestError("El plan seleccionado no esta activo");
    }
    if (targetPlan.isArchived) {
      throw new BadRequestError("No se puede asignar un plan archivado");
    }

    // Reject cross-country scheduled plan changes. Look up the member's
    // branch country before any scheduled-sub mutation happens.
    const [memberBranchForCountry] = await this.db
      .select({ branchCountry: schema.branches.country })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(eq(schema.users.id, userId));

    if (!memberBranchForCountry) {
      throw new NotFoundError("Miembro no encontrado");
    }
    if (targetPlan.country !== memberBranchForCountry.branchCountry) {
      throw new BadRequestError(
        "El plan no corresponde al pais de la sucursal",
      );
    }

    // Validate fixed-plan schedules
    if (targetPlan.bookingMode === "fixed") {
      if (!input.scheduleIds || input.scheduleIds.length === 0) {
        throw new BadRequestError(
          "Para planes fijos se requiere scheduleIds con los horarios seleccionados",
        );
      }
      if (
        targetPlan.classesPerWeek !== null &&
        input.scheduleIds.length !== targetPlan.classesPerWeek
      ) {
        throw new BadRequestError(
          `Debes seleccionar exactamente ${targetPlan.classesPerWeek} horarios. Seleccionaste ${input.scheduleIds.length}.`,
        );
      }
      await this.validateAnchorSet(
        input.scheduleIds,
        input.branchId,
        targetPlan,
      );
    }

    // Load member for boarding pass eligibility
    const [member] = await this.db
      .select({
        id: schema.users.id,
        boardingPassUsed: schema.users.boardingPassUsed,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    if (!member) {
      throw new NotFoundError("Miembro no encontrado");
    }

    // Pricing: override → boarding → AURA → plan price by type
    let pricePaid: number;
    let priceTypeApplied = input.priceTypeApplied;
    let auraDiscount: number | null = null;
    let auraDiscountPercent: number | null = null;
    let boardingPassUsed = false;
    let priceOverrideAmount: number | null = null;
    let priceOverrideReason: string | null = null;

    if (
      input.priceOverrideAmount !== undefined &&
      input.priceOverrideAmount >= 0
    ) {
      if (!input.priceOverrideReason) {
        throw new BadRequestError(
          "Se requiere una razon para el precio personalizado",
        );
      }
      pricePaid = input.priceOverrideAmount;
      priceOverrideAmount = input.priceOverrideAmount;
      priceOverrideReason = input.priceOverrideReason;
    } else if (input.boardingPass) {
      if (member.boardingPassUsed) {
        throw new ConflictError("El boarding pass ya fue utilizado");
      }
      pricePaid = targetPlan.priceZero;
      priceTypeApplied = "zero";
      boardingPassUsed = true;

      await this.db
        .update(schema.users)
        .set({ boardingPassUsed: true })
        .where(eq(schema.users.id, userId));
    } else {
      const basePrice = this.getBasePrice(targetPlan, priceTypeApplied);
      pricePaid = basePrice;

      if (input.auraSpend && input.auraSpend > 0) {
        const tier = AURA_DISCOUNT_TIERS.find(
          (t) => t.spend === input.auraSpend,
        );
        if (!tier) {
          throw new BadRequestError(
            `Monto de AURA invalido. Opciones: ${AURA_DISCOUNT_TIERS.map((t) => t.spend).join(", ")}`,
          );
        }
        await this.auraService.spend({
          userId,
          amount: tier.spend,
          description: `Descuento de suscripcion: ${tier.percent}% off`,
          referenceType: "subscription",
        });
        auraDiscount = tier.spend;
        auraDiscountPercent = tier.percent;
        const discountAmount = Math.floor(basePrice * (tier.percent / 100));
        pricePaid = basePrice - discountAmount;
      }
    }

    // New period: starts on current.endDate, runs plan.durationDays
    const newStartDate = currentSub.endDate;
    const newEnd = new Date(newStartDate);
    newEnd.setDate(newEnd.getDate() + targetPlan.durationDays);
    const newEndDate = newEnd.toISOString().split("T")[0];

    const classesRemaining =
      targetPlan.classesPerWeek !== null
        ? Math.ceil(targetPlan.durationDays / 7) * targetPlan.classesPerWeek
        : null;

    // ── Atomic queued-creation (Phase 103 D-16) ──
    // Wrap the scheduled-sub INSERT + dependent writes in a transaction so
    // Task 1b's recomputeUserStatus rolls back atomically on failure.
    // (recomputeUserStatus is defensive here — scheduled subs don't change
    // user.status, but consistency matters.)
    const { newSubscriptionId } = await this.db.transaction(async (tx) => {
      const insResult = await tx.insert(schema.subscriptions).values({
        userId,
        planId: input.planId,
        branchId: input.branchId,
        status: "scheduled",
        startDate: newStartDate,
        endDate: newEndDate,
        pricePaid,
        priceTypeApplied,
        auraDiscount,
        auraDiscountPercent,
        boardingPassUsed,
        priceOverrideAmount,
        priceOverrideReason,
        classesRemaining,
        classesBudget: classesRemaining,
        previousSubscriptionId: currentSub.id,
        notes: input.notes ?? null,
        currency: targetPlan.currency,
        priceRegularSnapshot: targetPlan.priceRegular,
      });

      const subId = Number(insResult[0].insertId);

      // Fixed plan: store schedules and generate bookings for the future period
      let credits = 0;
      if (
        targetPlan.bookingMode === "fixed" &&
        input.scheduleIds &&
        input.scheduleIds.length > 0
      ) {
        await tx.insert(schema.subscriptionSchedules).values(
          input.scheduleIds.map((scheduleId) => ({
            subscriptionId: subId,
            scheduleId,
          })),
        );

        if (this.bookingService) {
          const bookingResult = await this.bookingService.generateFixedBookings(
            subId,
            userId,
            input.scheduleIds,
            newStartDate,
            newEndDate,
            input.branchId,
          );
          credits = bookingResult.holidaysSkipped;
        }

        if (credits > 0) {
          await tx
            .update(schema.subscriptions)
            .set({ replacementCredits: credits })
            .where(eq(schema.subscriptions.id, subId));
        }
      }

      // ── Recompute user.status (defensive) ──
      // Scheduled subs don't change current status (user is already 'activo'
      // since changePlanAfterCurrent requires an active sub), but consistency
      // with the other mutating methods matters.
      await this.recomputeUserStatus(userId, tx);

      // ── Atomic charge recording (Phase 107 D-10 / CHARGE-03) ──
      // Scheduled changes charge the full new-plan price now (no proration).
      // Persisted inside the same tx as the scheduled subscription.
      await this.recordAssignmentCharge(tx, {
        userId,
        subscriptionId: subId,
        planId: targetPlan.id,
        planName: targetPlan.name,
        planCurrency: targetPlan.currency,
        chargeBase: pricePaid,
        amountReceived: input.amountReceived,
        paymentMethod: input.paymentMethod,
        branchId: input.branchId,
        effectiveDate: today,
        adminId,
        flow: "change-after-current",
      });

      return { newSubscriptionId: subId };
    });

    const newSub = await this.getSubscriptionById(newSubscriptionId);
    if (!newSub) {
      throw new Error(
        "Failed to retrieve scheduled subscription after plan change",
      );
    }

    this.log.info(
      {
        userId,
        currentSubscriptionId: currentSub.id,
        newSubscriptionId,
        currentPlan: currentSub.planName,
        newPlan: targetPlan.name,
        startDate: newStartDate,
        pricePaid,
        adminId,
      },
      "Plan change scheduled (queued for activation)",
    );

    return newSub;
  }

  /**
   * Renew an existing subscription (active or expired).
   * Creates a NEW subscription record for the new period. If the current sub
   * is still active, the new sub is created as "scheduled" (queued).
   * For fixed plans, copies schedule assignments and generates bookings.
   */
  async renewSubscription(
    userId: number,
    input: RenewSubscriptionInput,
    adminId: number,
  ): Promise<SubscriptionDetail> {
    // Block if there's already a scheduled renewal
    const [existingScheduled] = await this.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          eq(schema.subscriptions.status, "scheduled"),
        ),
      )
      .limit(1);

    if (existingScheduled) {
      throw new ConflictError(
        "Ya existe una renovacion programada. Cancele la existente antes de renovar nuevamente.",
      );
    }

    // Find current subscription (active or expired). An active sub ALWAYS
    // wins over an expired one regardless of createdAt: the legacy data
    // import (2026-04-01) wrote historical expired subs with createdAt newer
    // than the member's real active sub, and ordering by createdAt alone made
    // renew pick the imported expired row — creating a second active sub
    // starting today instead of a scheduled one (caso Lorenzino/Pandolfo).
    const [currentSub] = await this.db
      .select({
        id: schema.subscriptions.id,
        planId: schema.subscriptions.planId,
        branchId: schema.subscriptions.branchId,
        status: schema.subscriptions.status,
        endDate: schema.subscriptions.endDate,
        pricePaid: schema.subscriptions.pricePaid,
        priceTypeApplied: schema.subscriptions.priceTypeApplied,
      })
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

    if (!currentSub) {
      throw new NotFoundError("No se encontro suscripcion para renovar");
    }

    // Get the plan to know durationDays
    const plan = await this.getPlanById(currentSub.planId);
    if (!plan) {
      throw new NotFoundError("Plan no encontrado");
    }

    // Calculate new period dates: start from current endDate (or today if expired)
    const today = new Date().toISOString().split("T")[0];
    const newStartDate =
      currentSub.endDate && currentSub.endDate >= today
        ? currentSub.endDate
        : today;
    const newEnd = new Date(newStartDate);
    newEnd.setDate(newEnd.getDate() + plan.durationDays);
    const newEndDate = newEnd.toISOString().split("T")[0];

    // Fresh class budget for the new period
    const periodBudget =
      plan.classesPerWeek !== null
        ? Math.ceil(plan.durationDays / 7) * plan.classesPerWeek
        : null;

    // Precio de la renovación. Por defecto se hereda lo que el miembro venía
    // pagando, para que cualquier override negociado se arrastre. Caso Pomilio
    // (mayo 2026): venía pagando 75 EUR pero plan.priceRegular era 100, y la
    // renovación grababa 100 → deuda fantasma de 25. Tomar currentSub.pricePaid
    // preserva el override. priceTypeApplied se hereda más abajo y queda
    // consistente.
    //
    // Si el admin ingresa un precio personalizado para ESTA renovación, tiene
    // prioridad sobre el heredado (mismo patrón que assignPlan/changePlan).
    let renewalPrice = currentSub.pricePaid;
    let renewalOverrideAmount: number | null = null;
    let renewalOverrideReason: string | null = null;
    if (
      input.priceOverrideAmount !== undefined &&
      input.priceOverrideAmount >= 0
    ) {
      if (!input.priceOverrideReason) {
        throw new BadRequestError(
          "Se requiere una razon para el precio personalizado",
        );
      }
      renewalPrice = input.priceOverrideAmount;
      renewalOverrideAmount = input.priceOverrideAmount;
      renewalOverrideReason = input.priceOverrideReason;
    }

    // If old sub is already expired, close it now.
    // If still active (early renewal), leave it active — auto-expire will
    // transition it to "completed" and activate the scheduled sub.
    const oldSubExpired = !currentSub.endDate || currentSub.endDate < today;

    // Early renewal → new sub is "scheduled" (paid, queued, not yet usable).
    // Expired renewal → new sub is "active" immediately.
    const newStatus = oldSubExpired ? "active" : "scheduled";

    // ── Resolve renewBranchId BEFORE opening the tx (Phase 107 — PATTERNS) ──
    // RenewSubscriptionInput has no branchId — resolve via users.branchId
    // with fallback to the virtual "Templo Online" branch (D-Migration
    // Constraints; SPEC §1 requires NOT NULL on financial_transactions.branch_id).
    // Hoisted out of the tx (was previously executed AFTER tx close) so the
    // recordAssignmentCharge call inside the tx has the value available.
    let renewBranchId: number;
    if (renewalPrice > 0) {
      const [memberBranchRow] = await this.db
        .select({ branchId: schema.users.branchId })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
      if (memberBranchRow?.branchId) {
        renewBranchId = memberBranchRow.branchId;
      } else {
        const [virtualBranch] = await this.db
          .select({ id: schema.branches.id })
          .from(schema.branches)
          .where(eq(schema.branches.name, "Templo Online"))
          .limit(1);
        if (!virtualBranch) {
          throw new Error(
            "Branch 'Templo Online' no encontrada al resolver branchId para renew",
          );
        }
        renewBranchId = virtualBranch.id;
      }
    } else {
      // chargeBase is 0 (free renewal) — no transaction will be created so
      // branchId is unused. Use currentSub.branchId as a stable, validated
      // fallback rather than throwing for a no-op path.
      renewBranchId = currentSub.branchId;
    }

    // ── Atomic renewal (Phase 103 D-16) ──
    // Wrap close-old (if expired) + new-sub INSERT + dependent writes in a
    // single transaction so Task 1b's recomputeUserStatus rolls back
    // atomically with the new sub on failure.
    const { newSubscriptionId } = await this.db.transaction(async (tx) => {
      if (oldSubExpired) {
        await tx
          .update(schema.subscriptions)
          .set({ status: "completed" })
          .where(eq(schema.subscriptions.id, currentSub.id));
      }

      // Create new subscription record for the new period. Currency is
      // inherited from the existing plan — renewals never change plan/country.
      const insResult = await tx.insert(schema.subscriptions).values({
        userId,
        planId: currentSub.planId,
        branchId: currentSub.branchId,
        status: newStatus,
        startDate: newStartDate,
        endDate: newEndDate,
        pricePaid: renewalPrice,
        priceTypeApplied: currentSub.priceTypeApplied as
          | "regular"
          | "zero"
          | "credit_card",
        priceOverrideAmount: renewalOverrideAmount,
        priceOverrideReason: renewalOverrideReason,
        classesRemaining: periodBudget,
        classesBudget: periodBudget,
        previousSubscriptionId: currentSub.id,
        currency: plan.currency,
        priceRegularSnapshot: plan.priceRegular,
      });

      const subId = Number(insResult[0].insertId);

      // Copy schedule assignments (fixed plans always, flexible presencial
      // plans if the member had partial fixed anchors). Replacement credits
      // only accrue for fixed plans.
      let credits = 0;
      const scheduleRows = await tx
        .select({ scheduleId: schema.subscriptionSchedules.scheduleId })
        .from(schema.subscriptionSchedules)
        .where(eq(schema.subscriptionSchedules.subscriptionId, currentSub.id));

      const scheduleIds = scheduleRows.map((r) => r.scheduleId);
      if (scheduleIds.length > 0) {
        await tx.insert(schema.subscriptionSchedules).values(
          scheduleIds.map((scheduleId) => ({
            subscriptionId: subId,
            scheduleId,
          })),
        );

        if (this.bookingService) {
          const bookingResult = await this.bookingService.generateFixedBookings(
            subId,
            userId,
            scheduleIds,
            newStartDate,
            newEndDate,
            currentSub.branchId,
          );
          if (plan.bookingMode === "fixed") {
            credits = bookingResult.holidaysSkipped;
          }
        }
      }

      if (credits > 0) {
        await tx
          .update(schema.subscriptions)
          .set({ replacementCredits: credits })
          .where(eq(schema.subscriptions.id, subId));
      }

      // Phase 112-02: program enrollment on renewal flows through
      // EnrollmentService. Behavior preservation gate (D-08): the legacy
      // renewal path created the enrollment ONLY when no active enrollment
      // already existed (preserving in-flight currentWeek progress when the
      // user renewed mid-program). enrollFromPlan's linked-program branch
      // is cancel-then-insert by contract (assignPlan / changePlan need
      // that), so we keep the legacy guard at this callsite to avoid
      // resetting currentWeek=1 on a still-running enrollment.
      if (plan.linkedProgramId || plan.grantsAllPrograms) {
        let shouldEnroll = true;
        if (plan.linkedProgramId) {
          const existingEnrollment = await tx
            .select({ id: schema.programEnrollments.id })
            .from(schema.programEnrollments)
            .where(
              and(
                eq(schema.programEnrollments.userId, userId),
                eq(schema.programEnrollments.programId, plan.linkedProgramId),
                eq(schema.programEnrollments.status, "active"),
              ),
            );
          shouldEnroll = existingEnrollment.length === 0;
        }
        if (shouldEnroll) {
          await this.requireEnrollmentService().enrollFromPlan(
            userId,
            {
              id: plan.id,
              linkedProgramId: plan.linkedProgramId,
              grantsAllPrograms: plan.grantsAllPrograms,
            },
            subId,
            tx,
          );
        }
      }

      // ── Recompute user.status (R5/D-01) ──
      // Renewal of an active sub keeps user 'activo'. Renewal of an expired
      // sub flips user back to 'activo' (was 'inactivo' until now).
      await this.recomputeUserStatus(userId, tx);

      // ── Atomic charge recording (Phase 107 D-10 / CHARGE-03) ──
      // renewBranchId resolved above (out of tx). Charge persisted inside
      // the same tx as the new subscription — rollback on any failure.
      await this.recordAssignmentCharge(tx, {
        userId,
        subscriptionId: subId,
        planId: plan.id,
        planName: plan.name,
        planCurrency: plan.currency,
        chargeBase: renewalPrice,
        amountReceived: input.amountReceived,
        paymentMethod: input.paymentMethod,
        branchId: renewBranchId,
        effectiveDate: today,
        adminId,
        flow: "renew",
      });

      return { newSubscriptionId: subId };
    });

    const newSub = await this.getSubscriptionById(newSubscriptionId);
    if (!newSub) {
      throw new Error("Failed to retrieve renewed subscription");
    }

    this.log.info(
      {
        userId,
        oldSubscriptionId: currentSub.id,
        newSubscriptionId,
        newEndDate,
        adminId,
      },
      "Subscription renewed (new period created)",
    );

    return newSub;
  }

  // ─── Bulk Migration ──────────────────────────────────────────────────────

  /**
   * Bulk-migrate members from their current plan to a target plan.
   * Cancels existing active subscriptions and creates new ones.
   */
  async bulkMigratePlan(
    input: BulkMigrateInput,
    adminId: number,
  ): Promise<BulkMigrateResult> {
    // Validate target plan exists and is not archived
    const targetPlan = await this.getPlanById(input.targetPlanId);
    if (!targetPlan) {
      throw new NotFoundError("Plan destino no encontrado");
    }
    if (targetPlan.isArchived) {
      throw new BadRequestError("No se puede migrar a un plan archivado");
    }
    if (!targetPlan.isActive) {
      throw new BadRequestError("El plan destino no esta activo");
    }

    // Validate target branch exists
    const [branch] = await this.db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .where(eq(schema.branches.id, input.targetBranchId));

    if (!branch) {
      throw new NotFoundError("Sucursal destino no encontrada");
    }

    let migrated = 0;
    let skipped = 0;
    const errors: Array<{ userId: number; error: string }> = [];

    const today = new Date().toISOString().split("T")[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + targetPlan.durationDays);
    const endDateStr = endDate.toISOString().split("T")[0];

    for (const userId of input.userIds) {
      try {
        // Find active subscription
        const activeSub = await this.getMemberSubscription(userId);
        if (!activeSub) {
          skipped++;
          continue;
        }

        // ── Atomic per-user migration (Phase 103 D-16) ──
        // Wrap cancel-old + insert-new in a per-user transaction so Task 1b's
        // recomputeUserStatus rolls back atomically with both writes for this
        // user. Per-user (not bulk-loop) tx keeps lock scope small and
        // preserves the existing one-user-fail-doesnt-block-others pattern
        // (T-103-03 acceptance per threat model).
        await this.db.transaction(async (tx) => {
          // Cancel current subscription
          await tx
            .update(schema.subscriptions)
            .set({
              status: "cancelled",
              cancelledAt: new Date(),
              notes: `Migrado a ${targetPlan.name}`,
            })
            .where(eq(schema.subscriptions.id, activeSub.id));

          // Create new subscription
          await tx.insert(schema.subscriptions).values({
            userId,
            planId: input.targetPlanId,
            branchId: input.targetBranchId,
            status: "active",
            startDate: today,
            endDate: endDateStr,
            pricePaid: 0,
            priceTypeApplied: "regular",
            notes: "Migrado desde plan legacy",
          });

          // Recompute user.status (R5/D-01). User stays 'activo' (had a sub
          // before, has one after) — recompute keeps the invariant explicit.
          await this.recomputeUserStatus(userId, tx);
        });

        migrated++;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Error desconocido";
        errors.push({ userId, error: message });
      }
    }

    this.log.info(
      {
        adminId,
        targetPlanId: input.targetPlanId,
        targetBranchId: input.targetBranchId,
        migrated,
        skipped,
        errorCount: errors.length,
        totalRequested: input.userIds.length,
      },
      "Bulk plan migration completed",
    );

    return { migrated, skipped, errors };
  }

  // ─── Pricing Preview ─────────────────────────────────────────────────────

  /**
   * Get a pricing preview for assigning a plan to a member.
   * Does NOT modify any data.
   */
  async getPricingPreview(
    userId: number,
    planId: number,
    priceType: PriceType,
    auraSpend?: number,
  ): Promise<PricingPreview> {
    // Validate member
    const [member] = await this.db
      .select({
        id: schema.users.id,
        boardingPassUsed: schema.users.boardingPassUsed,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!member) throw new NotFoundError("Miembro no encontrado");

    // Validate plan
    const plan = await this.getPlanById(planId);
    if (!plan) throw new NotFoundError("Plan no encontrado");

    const basePrice = this.getBasePrice(plan, priceType);
    const auraBalance = await this.auraService.getBalance(userId);
    const boardingPassEligible = !member.boardingPassUsed;

    // Filter available tiers by user balance
    const availableTiers = AURA_DISCOUNT_TIERS.filter(
      (t) => t.spend <= auraBalance,
    );

    let discountType: PricingPreview["discountType"] = "none";
    let discountAmount = 0;
    let finalPrice = basePrice;
    let auraToSpend = 0;

    if (auraSpend && auraSpend > 0) {
      const tier = AURA_DISCOUNT_TIERS.find((t) => t.spend === auraSpend);
      if (tier && auraSpend <= auraBalance) {
        discountType = "aura";
        discountAmount = Math.floor(basePrice * (tier.percent / 100));
        finalPrice = basePrice - discountAmount;
        auraToSpend = tier.spend;
      }
    }

    return {
      basePrice,
      discountType,
      discountAmount,
      finalPrice,
      auraToSpend,
      auraBalance,
      boardingPassEligible,
      availableTiers,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Auto-expire active subscriptions past their end date for a given user.
   * "Expire on read" pattern — no cron job needed.
   * If the expiring sub has a scheduled successor (from early renewal),
   * mark old as "completed" and activate the scheduled sub.
   */
  private async autoExpireSubscriptions(userId: number): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    // Find active subs past their end date
    const expiredSubs = await this.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          eq(schema.subscriptions.status, "active"),
          sql`${schema.subscriptions.endDate} < ${today}`,
        ),
      );

    if (expiredSubs.length === 0) return;

    const expiredIds = expiredSubs.map((s) => s.id);

    // Find scheduled successors that should be activated
    const scheduledSuccessors = await this.db
      .select({
        id: schema.subscriptions.id,
        previousSubscriptionId: schema.subscriptions.previousSubscriptionId,
      })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          eq(schema.subscriptions.status, "scheduled"),
          inArray(schema.subscriptions.previousSubscriptionId, expiredIds),
        ),
      );

    const hasScheduledSuccessor = new Set(
      scheduledSuccessors.map((s) => s.previousSubscriptionId),
    );

    // Mark subs with scheduled successor as "completed", others as "expired"
    const completedIds = expiredIds.filter((id) =>
      hasScheduledSuccessor.has(id),
    );
    const expiredOnlyIds = expiredIds.filter(
      (id) => !hasScheduledSuccessor.has(id),
    );

    if (completedIds.length > 0) {
      await this.db
        .update(schema.subscriptions)
        .set({ status: "completed" })
        .where(inArray(schema.subscriptions.id, completedIds));
    }
    if (expiredOnlyIds.length > 0) {
      await this.db
        .update(schema.subscriptions)
        .set({ status: "expired" })
        .where(inArray(schema.subscriptions.id, expiredOnlyIds));
    }

    // Phase 112-02: for every just-expired sub, tear down owned enrollments
    // through EnrollmentService.tearDownForSubscription — driven by
    // subscription_id so it covers ALL sources (plan_linked, plan_bundle,
    // admin_addon) in one call instead of the legacy bundle+linked pair.
    // Best-effort: not wrapped in a tx with the status flip above (would
    // require touching the activateScheduledSub path too — out of scope per
    // Phase 103 D-16). Safe because the method only acts on active|paused
    // enrollments and is idempotent — if the process crashes between steps,
    // the next getMemberSubscription call repairs.
    if (expiredOnlyIds.length > 0) {
      for (const subId of expiredOnlyIds) {
        await this.requireEnrollmentService().tearDownForSubscription(subId);
      }
    }

    // Activate scheduled successors (handles program enrollment + branch migration
    // when the scheduled sub is for a different plan than the expiring one).
    for (const successor of scheduledSuccessors) {
      await this.activateScheduledSub(successor.id);
    }

    // Recompute users.status after the expiration. Without this, a user
    // whose only sub just expired keeps users.status='activo' indefinitely
    // (every other lifecycle path — assign/cancel/pause/renew/changePlan —
    // calls recomputeUserStatus, but the passive auto-expire was the
    // historical gap). recomputeUserStatus is idempotent and safe to run
    // even when scheduled successors were activated above.
    await this.recomputeUserStatus(userId, this.db);
  }

  /**
   * Activate a scheduled subscription. Flips status to "active", and if the
   * incoming plan differs from the outgoing plan (scheduled plan change),
   * handles program enrollment transitions and branch migration from virtual.
   */
  private async activateScheduledSub(scheduledId: number): Promise<void> {
    const [scheduled] = await this.db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        planId: schema.subscriptions.planId,
        branchId: schema.subscriptions.branchId,
        previousSubscriptionId: schema.subscriptions.previousSubscriptionId,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, scheduledId));

    if (!scheduled) return;

    await this.db
      .update(schema.subscriptions)
      .set({ status: "active" })
      .where(eq(schema.subscriptions.id, scheduledId));

    // If there's no predecessor (shouldn't happen for scheduled), we're done.
    if (!scheduled.previousSubscriptionId) return;

    // Phase 112 D-19: transfer admin add-ons from the predecessor sub to
    // the freshly-activated successor BEFORE any teardown below cancels
    // them. Runs on this.db (no tx — matches the existing best-effort
    // semantics of activateScheduledSub). Idempotent: re-running is safe
    // because the source sub no longer holds those rows after the first
    // pass. No-op when there are no add-ons (D-20).
    await this.requireEnrollmentService().transferAddons(
      scheduled.previousSubscriptionId,
      scheduled.id,
    );

    const [prevSub] = await this.db
      .select({
        planId: schema.subscriptions.planId,
        branchId: schema.subscriptions.branchId,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, scheduled.previousSubscriptionId));

    if (!prevSub) return;

    // Same plan: nothing else to do (pure renewal, no transitions needed)
    if (prevSub.planId === scheduled.planId) return;

    // Different plan: handle program enrollment + branch migration
    const prevPlan = await this.getPlanById(prevSub.planId);
    const newPlan = await this.getPlanById(scheduled.planId);
    if (!prevPlan || !newPlan) return;

    // Phase 112-02: program enrollment transitions on scheduled plan-change
    // activation. Behavior preservation: legacy code (a) cancelled the old
    // linked-program enrollment when the new plan's linked program differed,
    // and (b) created the new enrollment ONLY if no active one already
    // existed (preserving currentWeek progress when the user happened to
    // have an enrollment for that program from a parallel path).
    //
    // Cancel-old: emulated via a direct UPDATE because the previous sub's
    // own enrollment is what we cancel (NOT the freshly-activated sub's
    // — tearDownForSubscription would try to act on scheduled.id which has
    // no rows yet). Keeping the cancel here avoids regressing the symmetric
    // "old plan had linkedProgramId, new doesn't" case.
    if (
      prevPlan.linkedProgramId &&
      prevPlan.linkedProgramId !== newPlan.linkedProgramId
    ) {
      // Delegate to tearDownForSubscription on the predecessor sub so the
      // cancel goes through the EnrollmentService chokepoint. Runs on
      // this.db (no tx — preserves the legacy best-effort semantics).
      await this.requireEnrollmentService().tearDownForSubscription(
        scheduled.previousSubscriptionId,
      );
    }

    // Create-new: only when the new plan exposes a programs binding AND the
    // user does not already hold an active enrollment for that program
    // (idempotency / progress-preservation). enrollFromPlan covers both
    // linkedProgramId and grantsAllPrograms branches; we wrap it in the
    // legacy guard so currentWeek=1 doesn't replace an in-flight enrollment.
    if (
      (newPlan.linkedProgramId &&
        newPlan.linkedProgramId !== prevPlan.linkedProgramId) ||
      newPlan.grantsAllPrograms
    ) {
      let shouldEnroll = true;
      if (newPlan.linkedProgramId) {
        const existing = await this.db
          .select({ id: schema.programEnrollments.id })
          .from(schema.programEnrollments)
          .where(
            and(
              eq(schema.programEnrollments.userId, scheduled.userId),
              eq(schema.programEnrollments.programId, newPlan.linkedProgramId),
              eq(schema.programEnrollments.status, "active"),
            ),
          )
          .limit(1);
        shouldEnroll = existing.length === 0;
      }
      if (shouldEnroll) {
        await this.requireEnrollmentService().enrollFromPlan(
          scheduled.userId,
          {
            id: newPlan.id,
            linkedProgramId: newPlan.linkedProgramId,
            grantsAllPrograms: newPlan.grantsAllPrograms,
          },
          scheduled.id,
        );
      }
    }

    // Migrate member branch if currently on virtual branch
    const [member] = await this.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(eq(schema.users.id, scheduled.userId));

    if (member && member.branchId !== scheduled.branchId) {
      const [currentBranch] = await this.db
        .select({ isVirtual: schema.branches.isVirtual })
        .from(schema.branches)
        .where(eq(schema.branches.id, member.branchId));

      if (currentBranch?.isVirtual) {
        await this.db
          .update(schema.users)
          .set({ branchId: scheduled.branchId })
          .where(eq(schema.users.id, scheduled.userId));

        this.log.info(
          {
            userId: scheduled.userId,
            fromBranchId: member.branchId,
            toBranchId: scheduled.branchId,
          },
          "Migrated member from virtual branch on scheduled plan-change activation",
        );
      }
    }
  }

  /**
   * Get raw active/paused subscription (without auto-expire, for resume).
   */
  private async getActivePausedSubscriptionRaw(userId: number): Promise<{
    id: number;
    status: string;
    pausedAt: Date | null;
    endDate: string | null;
  } | null> {
    const [row] = await this.db
      .select({
        id: schema.subscriptions.id,
        status: schema.subscriptions.status,
        pausedAt: schema.subscriptions.pausedAt,
        endDate: schema.subscriptions.endDate,
      })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          or(
            eq(schema.subscriptions.status, "active"),
            eq(schema.subscriptions.status, "paused"),
          ),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  /**
   * Get the base price for a plan given the price type.
   */
  private getBasePrice(plan: PlanDetail, priceType: PriceType): number {
    switch (priceType) {
      case "regular":
        return plan.priceRegular;
      case "zero":
        return plan.priceZero;
      case "credit_card":
        return plan.priceCreditCard ?? plan.priceRegular;
    }
  }

  /**
   * Resolve goalPlanType from a plan's linked program.
   * Returns null if no linked program or program has no goalPlanType.
   */
  private async resolveGoalPlanType(
    linkedProgramId: number | null,
  ): Promise<string | null> {
    if (!linkedProgramId) return null;
    const [program] = await this.db
      .select({ goalPlanType: schema.programs.goalPlanType })
      .from(schema.programs)
      .where(eq(schema.programs.id, linkedProgramId))
      .limit(1);
    return program?.goalPlanType ?? null;
  }

  /**
   * Map a raw plan row to PlanListItem, resolving goalPlanType from linked program.
   */
  private async mapPlanRow(
    row: typeof schema.subscriptionPlans.$inferSelect,
  ): Promise<PlanListItem> {
    const goalPlanType = await this.resolveGoalPlanType(
      row.linkedProgramId ?? null,
    );
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      planTier: row.planTier as PlanTier,
      bookingMode: row.bookingMode as BookingMode,
      priceRegular: row.priceRegular,
      priceZero: row.priceZero,
      priceCreditCard: row.priceCreditCard,
      durationDays: row.durationDays,
      classesPerWeek: row.classesPerWeek,
      multiBranch: row.multiBranch,
      isTrial: row.isTrial,
      isGroup: row.isGroup,
      planCategory: row.planCategory as PlanCategory,
      goalPlanType,
      linkedProgramId: row.linkedProgramId ?? null,
      groupMaxMembers: row.groupMaxMembers,
      isActive: row.isActive,
      isArchived: row.isArchived,
      country: row.country as "AR" | "ES",
      currency: row.currency as "ARS" | "EUR",
      grantsAllPrograms: row.grantsAllPrograms ?? false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ─── Class Usage ─────────────────────────────────────────────────────────

  /**
   * Get class usage information for a member's current subscription.
   * Returns weekly attendance count, remaining classes, fixed days, and booking mode.
   */
  async getClassUsageThisWeek(userId: number): Promise<ClassUsageInfo> {
    const sub = await this.getMemberSubscription(userId);
    if (!sub) {
      throw new NotFoundError("No se encontro suscripcion activa");
    }

    // Get the plan to determine booking mode and weekly limit
    const plan = await this.getPlanById(sub.planId);
    if (!plan) {
      throw new NotFoundError("Plan no encontrado");
    }

    // Calculate current Mon-Sun week boundaries
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Count confirmed attendance this week
    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, userId),
          eq(schema.attendance.status, "confirmado"),
          sql`${schema.attendance.checkedInAt} >= ${monday.toISOString().slice(0, 19).replace("T", " ")}`,
          sql`${schema.attendance.checkedInAt} <= ${sunday.toISOString().slice(0, 19).replace("T", " ")}`,
        ),
      );

    const classesUsedThisWeek = Number(result?.count ?? 0);

    // Get scheduleIds and slot details from subscription_schedules
    const scheduleIds = await this.getSubscriptionScheduleIds(sub.id);
    const scheduleSlots =
      scheduleIds.length > 0
        ? await this.getScheduleSlotDetails(scheduleIds)
        : [];

    return {
      classesRemaining: sub.classesRemaining,
      classesBudget: sub.classesBudget,
      classesUsedThisWeek,
      weeklyLimit: plan.classesPerWeek,
      bookingMode: plan.bookingMode,
      multiBranch: plan.multiBranch,
      scheduleIds,
      scheduleSlots,
      bonusUsage: { applicable: false }, // filled in by route handler
    };
  }

  /**
   * Fetch scheduleIds from subscription_schedules for a given subscription.
   */
  private async getSubscriptionScheduleIds(
    subscriptionId: number,
  ): Promise<number[]> {
    const rows = await this.db
      .select({ scheduleId: schema.subscriptionSchedules.scheduleId })
      .from(schema.subscriptionSchedules)
      .where(eq(schema.subscriptionSchedules.subscriptionId, subscriptionId));
    return rows.map((r) => r.scheduleId);
  }

  /**
   * Fetch schedule slot details (day, time, activity) for given schedule IDs.
   */
  private async getScheduleSlotDetails(scheduleIds: number[]): Promise<
    Array<{
      id: number;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      activityName: string;
    }>
  > {
    if (scheduleIds.length === 0) return [];
    const rows = await this.db
      .select({
        id: schema.schedules.id,
        dayOfWeek: schema.schedules.dayOfWeek,
        startTime: schema.schedules.startTime,
        endTime: schema.schedules.endTime,
        activityName: schema.activities.name,
      })
      .from(schema.schedules)
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(inArray(schema.schedules.id, scheduleIds))
      .orderBy(schema.schedules.dayOfWeek, schema.schedules.startTime);
    return rows;
  }

  /**
   * Enrich a mapped SubscriptionDetail with scheduleIds from subscription_schedules.
   */
  private async enrichWithScheduleIds(
    detail: SubscriptionDetail,
  ): Promise<SubscriptionDetail> {
    const scheduleIds = await this.getSubscriptionScheduleIds(detail.id);
    return { ...detail, scheduleIds };
  }

  /**
   * Batch variant of enrichWithScheduleIds for list endpoints.
   *
   * The per-row enrich (`Promise.all(details.map(enrichWithScheduleIds))`) fired
   * one subscription_schedules query per subscription — an N+1 that, for a member
   * with a long history, holds a pool connection per row and starves the pool
   * under concurrent admin load (root cause of the simultaneous 10s timeouts on
   * the member detail tab). This collapses it to a single `IN (...)` query.
   */
  private async enrichManyWithScheduleIds(
    details: SubscriptionDetail[],
  ): Promise<SubscriptionDetail[]> {
    if (details.length === 0) return details;

    const rows = await this.db
      .select({
        subscriptionId: schema.subscriptionSchedules.subscriptionId,
        scheduleId: schema.subscriptionSchedules.scheduleId,
      })
      .from(schema.subscriptionSchedules)
      .where(
        inArray(
          schema.subscriptionSchedules.subscriptionId,
          details.map((d) => d.id),
        ),
      );

    const bySubscription = new Map<number, number[]>();
    for (const row of rows) {
      const existing = bySubscription.get(row.subscriptionId);
      if (existing) {
        existing.push(row.scheduleId);
      } else {
        bySubscription.set(row.subscriptionId, [row.scheduleId]);
      }
    }

    return details.map((detail) => ({
      ...detail,
      scheduleIds: bySubscription.get(detail.id) ?? [],
    }));
  }

  /**
   * Map a raw subscription join row to SubscriptionDetail.
   */
  private mapSubscriptionRow(row: {
    id: number;
    userId: number;
    planId: number;
    planName: string;
    planTier: string;
    planCategory: string;
    branchId: number;
    branchName: string;
    status: string;
    startDate: string;
    endDate: string | null;
    pricePaid: number;
    priceTypeApplied: string;
    auraDiscount: number | null;
    auraDiscountPercent: number | null;
    boardingPassUsed: boolean;
    priceOverrideAmount: number | null;
    priceOverrideReason: string | null;
    pausedAt: Date | null;
    pauseEndDate: string | null;
    resumedAt: Date | null;
    cancelledAt: Date | null;
    classesRemaining: number | null;
    classesBudget: number | null;
    previousSubscriptionId: number | null;
    replacementCredits: number | null;
    notes: string | null;
    currency: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SubscriptionDetail {
    return {
      id: row.id,
      userId: row.userId,
      planId: row.planId,
      planName: row.planName,
      planTier: row.planTier as PlanTier,
      planCategory: row.planCategory as PlanCategory,
      branchId: row.branchId,
      branchName: row.branchName,
      status: row.status as SubscriptionStatus,
      startDate: row.startDate,
      endDate: row.endDate,
      pricePaid: row.pricePaid,
      priceTypeApplied: row.priceTypeApplied as PriceType,
      auraDiscount: row.auraDiscount,
      auraDiscountPercent: row.auraDiscountPercent,
      boardingPassUsed: row.boardingPassUsed,
      priceOverrideAmount: row.priceOverrideAmount,
      priceOverrideReason: row.priceOverrideReason,
      pausedAt: row.pausedAt?.toISOString() ?? null,
      pauseEndDate: row.pauseEndDate,
      resumedAt: row.resumedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      classesRemaining: row.classesRemaining,
      classesBudget: row.classesBudget,
      previousSubscriptionId: row.previousSubscriptionId,
      replacementCredits: row.replacementCredits ?? 0,
      scheduleIds: [], // populated by enrichWithScheduleIds
      notes: row.notes,
      currency: (row.currency ?? "ARS") as "ARS" | "EUR",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ─── Promo Plans ──────────────────────────────────────────────────────────

  /**
   * List all promo plans ordered by most recent first, optionally filtered
   * by country scope (enforced by the route layer via request.scope.country).
   */
  async listPromoPlans(
    filters: ListPromoPlansFilters = {},
  ): Promise<PromoListItem[]> {
    const conditions = [];
    if (filters.country !== undefined) {
      conditions.push(eq(schema.promoPlans.country, filters.country));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(schema.promoPlans)
      .where(whereClause)
      .orderBy(desc(schema.promoPlans.createdAt));
    return rows.map((r) => ({
      ...r,
      startDate: r.startDate.toISOString(),
      expiryDate: r.expiryDate.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /**
   * Create a new promo plan. Validates the referenced subscription plan
   * exists and the promo code is unique. The promo inherits its country from
   * the referenced subscription plan so it can never drift cross-country.
   */
  async createPromo(input: CreatePromoInput): Promise<PromoListItem> {
    // Validate subscription plan exists
    const plan = await this.getPlanById(input.subscriptionPlanId);
    if (!plan) {
      throw new NotFoundError("Plan de suscripcion no encontrado");
    }

    // Check unique promo code
    const [existing] = await this.db
      .select({ id: schema.promoPlans.id })
      .from(schema.promoPlans)
      .where(eq(schema.promoPlans.promoCode, input.promoCode))
      .limit(1);
    if (existing) {
      throw new ConflictError("El codigo promo ya existe");
    }

    const result = await this.db.insert(schema.promoPlans).values({
      name: input.name,
      promoCode: input.promoCode,
      planDurationDays: input.planDurationDays,
      startDate: new Date(input.startDate),
      expiryDate: new Date(input.expiryDate),
      promoType: input.promoType,
      subscriptionPlanId: input.subscriptionPlanId,
      country: plan.country,
    });

    const promoId = Number(result[0].insertId);
    const [promo] = await this.db
      .select()
      .from(schema.promoPlans)
      .where(eq(schema.promoPlans.id, promoId));
    return {
      ...promo,
      startDate: promo.startDate.toISOString(),
      expiryDate: promo.expiryDate.toISOString(),
      createdAt: promo.createdAt.toISOString(),
      updatedAt: promo.updatedAt.toISOString(),
    };
  }

  /**
   * Update an existing promo plan (name, dates, duration, type, plan).
   */
  async updatePromo(
    promoId: number,
    input: UpdatePromoInput,
  ): Promise<PromoListItem> {
    const [existing] = await this.db
      .select({ id: schema.promoPlans.id })
      .from(schema.promoPlans)
      .where(eq(schema.promoPlans.id, promoId));
    if (!existing) {
      throw new NotFoundError("Promo no encontrada");
    }

    if (input.subscriptionPlanId) {
      const plan = await this.getPlanById(input.subscriptionPlanId);
      if (!plan) {
        throw new NotFoundError("Plan de suscripcion no encontrado");
      }
    }

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.planDurationDays !== undefined)
      updates.planDurationDays = input.planDurationDays;
    if (input.startDate !== undefined)
      updates.startDate = new Date(input.startDate);
    if (input.expiryDate !== undefined)
      updates.expiryDate = new Date(input.expiryDate);
    if (input.promoType !== undefined) updates.promoType = input.promoType;
    if (input.subscriptionPlanId !== undefined)
      updates.subscriptionPlanId = input.subscriptionPlanId;

    await this.db
      .update(schema.promoPlans)
      .set(updates)
      .where(eq(schema.promoPlans.id, promoId));

    const [promo] = await this.db
      .select()
      .from(schema.promoPlans)
      .where(eq(schema.promoPlans.id, promoId));
    return {
      ...promo,
      startDate: promo.startDate.toISOString(),
      expiryDate: promo.expiryDate.toISOString(),
      createdAt: promo.createdAt.toISOString(),
      updatedAt: promo.updatedAt.toISOString(),
    };
  }

  /**
   * Deactivate a promo plan by setting isActive to false.
   */
  async deactivatePromo(promoId: number): Promise<void> {
    const [promo] = await this.db
      .select({ id: schema.promoPlans.id })
      .from(schema.promoPlans)
      .where(eq(schema.promoPlans.id, promoId));
    if (!promo) {
      throw new NotFoundError("Promo no encontrada");
    }
    await this.db
      .update(schema.promoPlans)
      .set({ isActive: false })
      .where(eq(schema.promoPlans.id, promoId));
  }

  /**
   * Validate a candidate set of fixed-anchor scheduleIds.
   *
   * Enforces (in order):
   *  - schedules exist
   *  - schedules are active
   *  - branch scoping policy:
   *      plan.multiBranch=false → every slot must belong to anchorBranchId
   *      plan.multiBranch=true  → every slot must be in the same country as
   *        anchorBranchId. Cross-country anchors are always rejected (mirrors
   *        the booking-service.ts cross-country guard for ad-hoc bookings).
   *  - one slot per dayOfWeek (no two anchors stacked on the same day)
   *
   * Returns the loaded schedule rows so callers don't re-query.
   */
  private async validateAnchorSet(
    scheduleIds: number[],
    anchorBranchId: number,
    plan: { multiBranch: boolean },
  ): Promise<Array<{ id: number; branchId: number; dayOfWeek: number }>> {
    const scheduleRows = await this.db
      .select({
        id: schema.schedules.id,
        branchId: schema.schedules.branchId,
        isActive: schema.schedules.isActive,
        dayOfWeek: schema.schedules.dayOfWeek,
      })
      .from(schema.schedules)
      .where(inArray(schema.schedules.id, scheduleIds));

    if (scheduleRows.length !== scheduleIds.length) {
      const foundIds = new Set(scheduleRows.map((s) => s.id));
      const missing = scheduleIds.filter((id) => !foundIds.has(id));
      throw new BadRequestError(
        `Horarios no encontrados: ${missing.join(", ")}`,
      );
    }

    for (const row of scheduleRows) {
      if (!row.isActive) {
        throw new BadRequestError(
          `El horario ${row.id} esta inactivo. Solo se pueden seleccionar horarios activos.`,
        );
      }
    }

    const otherBranchAnchors = scheduleRows.filter(
      (r) => r.branchId !== anchorBranchId,
    );
    if (otherBranchAnchors.length > 0) {
      if (!plan.multiBranch) {
        throw new BadRequestError(
          `El horario ${otherBranchAnchors[0].id} no pertenece a la sucursal seleccionada`,
        );
      }
      const branchIds = Array.from(
        new Set([anchorBranchId, ...otherBranchAnchors.map((r) => r.branchId)]),
      );
      const branchRows = await this.db
        .select({
          id: schema.branches.id,
          country: schema.branches.country,
        })
        .from(schema.branches)
        .where(inArray(schema.branches.id, branchIds));

      const anchorCountry = branchRows.find(
        (b) => b.id === anchorBranchId,
      )?.country;
      if (!anchorCountry) {
        throw new BadRequestError(`Sucursal ${anchorBranchId} no encontrada`);
      }
      for (const row of otherBranchAnchors) {
        const branchCountry = branchRows.find(
          (b) => b.id === row.branchId,
        )?.country;
        if (branchCountry !== anchorCountry) {
          throw new BadRequestError(
            `El horario ${row.id} pertenece a una sucursal de otro país`,
          );
        }
      }
    }

    const dayCounts = new Map<number, number>();
    for (const row of scheduleRows) {
      dayCounts.set(row.dayOfWeek, (dayCounts.get(row.dayOfWeek) ?? 0) + 1);
    }
    const duplicates = [...dayCounts.entries()].filter(([, n]) => n > 1);
    if (duplicates.length > 0) {
      const dayNames: Record<number, string> = {
        1: "lunes",
        2: "martes",
        3: "miércoles",
        4: "jueves",
        5: "viernes",
        6: "sábado",
        7: "domingo",
      };
      const labels = duplicates.map(([dow]) => dayNames[dow] ?? `día ${dow}`);
      throw new BadRequestError(
        `No se puede elegir más de un turno fijo el mismo día: ${labels.join(", ")}`,
      );
    }

    return scheduleRows.map((r) => ({
      id: r.id,
      branchId: r.branchId,
      dayOfWeek: r.dayOfWeek,
    }));
  }

  /**
   * Phase 103 (R5/R6/D-01): single source of truth for users.status after
   * any subscription mutation. Replaces the deleted Phase 102-07 trial
   * conversion helper — the converted_at logic is folded into the same
   * UPDATE so a single round-trip fixes both columns atomically.
   *
   * MUST be called inside a db.transaction() — the caller passes its tx
   * handle so the status update rolls back atomically with the subscription
   * mutation that triggered it (D-16, SPEC Constraint "Atomic transitions").
   *
   * One-statement UPDATE (Option B per RESEARCH §3) — avoids a read-then-
   * write race in concurrent sub-assignment flows:
   *  - status='activo' if user has any sub with subscription_status IN
   *    ('active','paused') AND not expired
   *  - else if user.status was 'activo' or 'inactivo' (paying history) →
   *    status='inactivo' (D-04: never demote a paying-history user back to
   *    freemium/prueba)
   *  - else leave status unchanged (freemium/prueba without sub stays as-is)
   *  - converted_at: set to CURRENT_TIMESTAMP if NULL AND new status is
   *    'activo' AND user has any is_trial booking (Phase 102-07 absorbed)
   *
   * Phase 114 (D-32 / D-33): the SAME conversion predicate also gates two
   * additional lead-lifecycle writes folded into this UPDATE so they share
   * the parent subscription transaction (atomic rollback):
   *  - lead_status = 'cerrado' on first conversion of a trial user (override
   *    of the 'en_seguimiento' default seeded by POST /admin/members/trial).
   *  - lead_notes = '<plan.name>' on first conversion ONLY IF lead_notes IS
   *    NULL OR empty string. Pre-existing manual notes are NEVER overwritten.
   * D-34 keeps the hook scoped to subscription create — admin-initiated
   * lead_status flips go through PATCH /admin/leads/:userId (Plan 04) which
   * deliberately does NOT touch lead_notes.
   */
  private async recomputeUserStatus(
    userId: number,
    tx: MySql2Database<typeof schema>,
  ): Promise<void> {
    // 'activo' requires a sub that has actually started — a 'scheduled' sub
    // (or an 'active' sub whose startDate is still in the future) does NOT
    // make the member active today. Hence the s.start_date <= CURDATE() guard.
    //
    // Phase 117 (D-10): forward-only status history hook. Read the CURRENT
    // status BEFORE the UPDATE so we can compare it against the new value
    // afterwards and record a row in user_status_history only when the status
    // effectively changed (forward-only — never insert when from == to). The
    // INSERT runs inside the same tx so it rolls back atomically with the
    // subscription transition (T-117-04).
    const beforeRows = await tx
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    const statusBefore = beforeRows[0]?.status ?? null;

    // MySQL evaluates SET assignments LEFT-TO-RIGHT and later expressions
    // see already-assigned values for earlier columns in the same row
    // (https://dev.mysql.com/doc/refman/8.0/en/update.html). The Phase 114
    // lead_status / lead_notes branches all gate on `u.converted_at IS NULL`
    // (D-32: "first conversion"), so they MUST be assigned BEFORE the
    // converted_at column itself is written — otherwise they'd see the
    // freshly-set CURRENT_TIMESTAMP and the conversion gate would always
    // be false on the very write that should trigger them. Order matters.
    await tx.execute(sql`
      UPDATE users u
      SET
        u.status = CASE
          WHEN EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.user_id = u.id
              AND s.subscription_status IN ('active','paused')
              AND s.start_date <= CURDATE()
              AND (s.end_date IS NULL OR s.end_date >= CURDATE())
          ) THEN 'activo'
          WHEN u.status IN ('activo','inactivo') THEN 'inactivo'
          ELSE u.status
        END,
        u.lead_status = CASE
          WHEN u.converted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM subscriptions s
              WHERE s.user_id = u.id
                AND s.subscription_status IN ('active','paused')
                AND s.start_date <= CURDATE()
                AND (s.end_date IS NULL OR s.end_date >= CURDATE())
            )
            AND EXISTS (
              SELECT 1 FROM bookings b
              WHERE b.member_id = u.id AND b.is_trial = 1
            )
          THEN 'cerrado'
          ELSE u.lead_status
        END,
        u.lead_notes = CASE
          WHEN u.converted_at IS NULL
            AND (u.lead_notes IS NULL OR u.lead_notes = '')
            AND EXISTS (
              SELECT 1 FROM subscriptions s
              WHERE s.user_id = u.id
                AND s.subscription_status IN ('active','paused')
                AND s.start_date <= CURDATE()
                AND (s.end_date IS NULL OR s.end_date >= CURDATE())
            )
            AND EXISTS (
              SELECT 1 FROM bookings b
              WHERE b.member_id = u.id AND b.is_trial = 1
            )
          THEN (
            SELECT sp.name
            FROM subscriptions s2
            INNER JOIN subscription_plans sp ON sp.id = s2.plan_id
            WHERE s2.user_id = u.id
              AND s2.subscription_status IN ('active','paused')
              AND s2.start_date <= CURDATE()
              AND (s2.end_date IS NULL OR s2.end_date >= CURDATE())
            ORDER BY s2.created_at DESC
            LIMIT 1
          )
          ELSE u.lead_notes
        END,
        u.converted_at = CASE
          WHEN u.converted_at IS NULL
            AND EXISTS (
              SELECT 1 FROM subscriptions s
              WHERE s.user_id = u.id
                AND s.subscription_status IN ('active','paused')
                AND s.start_date <= CURDATE()
                AND (s.end_date IS NULL OR s.end_date >= CURDATE())
            )
            AND EXISTS (
              SELECT 1 FROM bookings b
              WHERE b.member_id = u.id AND b.is_trial = 1
            )
          THEN CURRENT_TIMESTAMP
          ELSE u.converted_at
        END
      WHERE u.id = ${userId}
    `);

    // Phase 117 (D-10): re-read the status AFTER the UPDATE. Forward-only —
    // insert a history row ONLY when the effective value changed. The new
    // status read goes here (after the execute), never before, because the
    // CASE above may flip it. Same tx → rolls back with the transition.
    const afterRows = await tx
      .select({ status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    const statusAfter = afterRows[0]?.status ?? null;

    if (statusAfter !== null && statusAfter !== statusBefore) {
      await tx.insert(schema.userStatusHistory).values({
        userId,
        fromStatus: statusBefore,
        toStatus: statusAfter,
        source: "recompute",
      });
      this.log.info(
        { userId, fromStatus: statusBefore, toStatus: statusAfter },
        "user status transition recorded",
      );
    }
  }
}
