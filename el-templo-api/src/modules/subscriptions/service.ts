/**
 * Subscription Service
 *
 * Business logic for subscription plans CRUD, subscription lifecycle
 * management (assign, pause, resume, cancel, auto-expire), and
 * pricing engine with AURA discount integration.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, or, desc, sql, inArray } from "drizzle-orm";
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
  BookingMode,
  PriceType,
  SubscriptionStatus,
  ProrationResult,
  ChangePlanPreview,
} from "./types";
import { AURA_DISCOUNT_TIERS } from "./types";
import type { PaymentService } from "../payments/service";

// Lazy import type to avoid circular dependency at module load time
type BookingServiceType =
  import("../scheduling/booking-service").BookingService;

export class SubscriptionService {
  private bookingService?: BookingServiceType;

  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private auraService: AuraService,
    private paymentService?: PaymentService,
  ) {}

  /**
   * Set the BookingService reference (avoids circular constructor dependency).
   */
  setBookingService(bookingService: BookingServiceType): void {
    this.bookingService = bookingService;
  }

  // ─── Plans CRUD ──────────────────────────────────────────────────────────

  /**
   * List subscription plans, optionally filtered by isActive.
   * By default excludes archived plans unless includeArchived is true.
   */
  async listPlans(
    isActive?: boolean,
    includeArchived?: boolean,
  ): Promise<PlanListItem[]> {
    const conditions = [];
    if (isActive !== undefined) {
      conditions.push(eq(schema.subscriptionPlans.isActive, isActive));
    }
    if (!includeArchived) {
      conditions.push(eq(schema.subscriptionPlans.isArchived, false));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(schema.subscriptionPlans)
      .where(whereClause)
      .orderBy(schema.subscriptionPlans.name);

    return rows.map((r) => this.mapPlanRow(r));
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
      groupMaxMembers: input.groupMaxMembers ?? null,
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
    if (input.groupMaxMembers !== undefined)
      updateData.groupMaxMembers = input.groupMaxMembers;

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
        resumedAt: schema.subscriptions.resumedAt,
        cancelledAt: schema.subscriptions.cancelledAt,
        classesRemaining: schema.subscriptions.classesRemaining,
        classesBudget: schema.subscriptions.classesBudget,
        replacementCredits: schema.subscriptions.replacementCredits,
        notes: schema.subscriptions.notes,
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
          ),
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;

    return this.enrichWithScheduleIds(this.mapSubscriptionRow(rows[0]));
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
        resumedAt: schema.subscriptions.resumedAt,
        cancelledAt: schema.subscriptions.cancelledAt,
        classesRemaining: schema.subscriptions.classesRemaining,
        classesBudget: schema.subscriptions.classesBudget,
        replacementCredits: schema.subscriptions.replacementCredits,
        notes: schema.subscriptions.notes,
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
    return Promise.all(mapped.map((m) => this.enrichWithScheduleIds(m)));
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
        resumedAt: schema.subscriptions.resumedAt,
        cancelledAt: schema.subscriptions.cancelledAt,
        classesRemaining: schema.subscriptions.classesRemaining,
        classesBudget: schema.subscriptions.classesBudget,
        replacementCredits: schema.subscriptions.replacementCredits,
        notes: schema.subscriptions.notes,
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
    // Validate member exists
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

    // Check no existing active/paused subscription
    const existingSub = await this.getMemberSubscription(userId);
    if (existingSub) {
      throw new ConflictError(
        "El miembro ya tiene una suscripcion activa o pausada",
      );
    }

    // Calculate end date
    const startDate = new Date(input.startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.durationDays);
    const endDateStr = endDate.toISOString().split("T")[0];

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

    // ── Fixed-plan schedule slot validation ──
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
      // Validate each scheduleId exists, is active, and belongs to branchId
      const scheduleRows = await this.db
        .select({
          id: schema.schedules.id,
          branchId: schema.schedules.branchId,
          isActive: schema.schedules.isActive,
        })
        .from(schema.schedules)
        .where(inArray(schema.schedules.id, input.scheduleIds));

      if (scheduleRows.length !== input.scheduleIds.length) {
        const foundIds = new Set(scheduleRows.map((s) => s.id));
        const missing = input.scheduleIds.filter((id) => !foundIds.has(id));
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
        if (row.branchId !== input.branchId) {
          throw new BadRequestError(
            `El horario ${row.id} no pertenece a la sucursal seleccionada`,
          );
        }
      }
    }

    // Calculate monthly class budget from plan configuration
    const classesRemaining =
      plan.classesPerWeek !== null
        ? Math.ceil(plan.durationDays / 7) * plan.classesPerWeek
        : null;

    // Insert subscription
    const result = await this.db.insert(schema.subscriptions).values({
      userId,
      planId: input.planId,
      branchId: input.branchId,
      status: "active",
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
    });

    const subscriptionId = Number(result[0].insertId);

    // ── Fixed-plan: store schedule slot references and generate bookings ──
    let replacementCredits = 0;
    if (
      plan.bookingMode === "fixed" &&
      input.scheduleIds &&
      input.scheduleIds.length > 0
    ) {
      // Insert subscription_schedules junction rows
      await this.db.insert(schema.subscriptionSchedules).values(
        input.scheduleIds.map((scheduleId) => ({
          subscriptionId,
          scheduleId,
        })),
      );

      // Generate bulk bookings for the subscription period
      if (this.bookingService) {
        const bookingResult = await this.bookingService.generateFixedBookings(
          subscriptionId,
          userId,
          input.scheduleIds,
          input.startDate,
          endDateStr,
          input.branchId,
        );
        replacementCredits = bookingResult.holidaysSkipped;
      }

      // Store replacement credits on the subscription
      if (replacementCredits > 0) {
        await this.db
          .update(schema.subscriptions)
          .set({ replacementCredits })
          .where(eq(schema.subscriptions.id, subscriptionId));
      }
    }

    const subscription = await this.getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error("Failed to retrieve newly created subscription");
    }

    // Auto-record payment for the subscription
    if (this.paymentService && pricePaid > 0) {
      await this.paymentService.recordPayment(
        {
          memberId: userId,
          subscriptionId,
          amount: pricePaid,
          paymentMethod: input.paymentMethod,
          paymentDate: input.startDate,
          notes: input.notes ?? null,
        },
        adminId,
      );
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
   * Pause an active subscription.
   */
  async pauseSubscription(userId: number): Promise<SubscriptionDetail> {
    const sub = await this.getMemberSubscription(userId);
    if (!sub) {
      throw new NotFoundError("No se encontro suscripcion activa");
    }
    if (sub.status !== "active") {
      throw new BadRequestError("Solo se pueden pausar suscripciones activas");
    }

    await this.db
      .update(schema.subscriptions)
      .set({
        status: "paused",
        pausedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, sub.id));

    const updated = await this.getSubscriptionById(sub.id);
    if (!updated) throw new Error("Failed to retrieve updated subscription");

    this.log.info({ userId, subscriptionId: sub.id }, "Subscription paused");
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
    };
    if (newEndDate) {
      updateData.endDate = newEndDate;
    }

    await this.db
      .update(schema.subscriptions)
      .set(updateData)
      .where(eq(schema.subscriptions.id, sub.id));

    const updated = await this.getSubscriptionById(sub.id);
    if (!updated) throw new Error("Failed to retrieve updated subscription");

    this.log.info(
      { userId, subscriptionId: sub.id, pausedDays, newEndDate },
      "Subscription resumed",
    );
    return updated;
  }

  /**
   * Cancel an active or paused subscription.
   */
  async cancelSubscription(
    userId: number,
    notes?: string,
  ): Promise<SubscriptionDetail> {
    const sub = await this.getMemberSubscription(userId);
    if (!sub) {
      throw new NotFoundError("No se encontro suscripcion activa o pausada");
    }
    if (sub.status !== "active" && sub.status !== "paused") {
      throw new BadRequestError(
        "Solo se pueden cancelar suscripciones activas o pausadas",
      );
    }

    const updateData: Partial<typeof schema.subscriptions.$inferInsert> = {
      status: "cancelled",
      cancelledAt: new Date(),
    };
    if (notes) {
      updateData.notes = notes;
    }

    await this.db
      .update(schema.subscriptions)
      .set(updateData)
      .where(eq(schema.subscriptions.id, sub.id));

    // Cancel all future bookings for fixed-plan subscriptions
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
      // Class-based plan — use stored budget (accounts for renewals)
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
    };
  }

  /**
   * Change a member's current plan to a new one.
   * Validates upgrade/downgrade, applies proration credit, cancels the
   * existing subscription, and creates a new one atomically.
   */
  async changePlan(
    userId: number,
    input: AssignPlanInput,
    adminId: number,
  ): Promise<SubscriptionDetail> {
    const existingSub = await this.getMemberSubscription(userId);
    if (!existingSub) {
      throw new NotFoundError("No se encontro suscripcion activa o pausada");
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

    // Block downgrade (target cheaper than current)
    if (targetPlan.priceRegular < currentPlan.priceRegular) {
      throw new BadRequestError(
        "No se puede cambiar a un plan de menor precio durante el periodo activo",
      );
    }

    // Calculate proration and apply as price override
    const proration = this.calculateProration(existingSub, currentPlan);
    const netAmount = Math.max(
      0,
      targetPlan.priceRegular - proration.remainingValue,
    );

    // Override the input so assignPlan records the correct (prorated) amount
    input.priceOverrideAmount = netAmount;
    input.priceOverrideReason = `Cambio de plan: credito $${proration.remainingValue} (${proration.remainingDetail})`;

    // Cancel existing subscription, then assign new plan.
    // If assignPlan fails, restore the old subscription so the member isn't left without one.
    await this.db
      .update(schema.subscriptions)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        notes: existingSub.notes
          ? `${existingSub.notes} | Cambiado a otro plan`
          : "Cambiado a otro plan",
      })
      .where(eq(schema.subscriptions.id, existingSub.id));

    let newSub: SubscriptionDetail;
    try {
      newSub = await this.assignPlan(userId, input, adminId);
    } catch (err) {
      // Restore old subscription on failure
      await this.db
        .update(schema.subscriptions)
        .set({
          status: existingSub.status as "active" | "paused",
          cancelledAt: null,
          notes: existingSub.notes,
        })
        .where(eq(schema.subscriptions.id, existingSub.id));
      throw err;
    }

    // Cancel future bookings for the old subscription (after new one is confirmed)
    if (this.bookingService) {
      await this.bookingService.cancelFutureBookings(existingSub.id);
    }

    this.log.info(
      {
        userId,
        oldSubscriptionId: existingSub.id,
        adminId,
        prorationCredit: proration.remainingValue,
        netAmount,
      },
      "Subscription cancelled for plan change",
    );

    this.log.info(
      {
        userId,
        oldPlan: existingSub.planName,
        newPlan: newSub.planName,
        adminId,
        netAmount,
      },
      "Plan changed successfully",
    );

    return newSub;
  }

  /**
   * Renew an existing subscription (active or expired).
   * Extends endDate by plan's durationDays, resets budget, records payment.
   * For fixed plans, regenerates bookings for the extended period.
   */
  async renewSubscription(
    userId: number,
    input: RenewSubscriptionInput,
    adminId: number,
  ): Promise<SubscriptionDetail> {
    // Find current subscription (active or expired)
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
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1);

    if (!currentSub) {
      throw new NotFoundError("No se encontro suscripcion para renovar");
    }

    // Get the plan to know durationDays
    const plan = await this.getPlanById(currentSub.planId);
    if (!plan) {
      throw new NotFoundError("Plan no encontrado");
    }

    // Calculate new endDate: extend from current endDate (or today if expired)
    const today = new Date().toISOString().split("T")[0];
    const baseDate =
      currentSub.endDate && currentSub.endDate >= today
        ? currentSub.endDate
        : today;
    const newEnd = new Date(baseDate);
    newEnd.setDate(newEnd.getDate() + plan.durationDays);
    const newEndDate = newEnd.toISOString().split("T")[0];

    // Add one period's worth of classes to existing budget and remaining
    const periodBudget =
      plan.classesPerWeek !== null
        ? Math.ceil(plan.durationDays / 7) * plan.classesPerWeek
        : null;

    // Derive renewal price from the plan using the same price type as original assignment
    const renewalPrice =
      currentSub.priceTypeApplied === "zero"
        ? plan.priceZero
        : currentSub.priceTypeApplied === "credit_card" && plan.priceCreditCard
          ? plan.priceCreditCard
          : plan.priceRegular;

    // Update subscription: extend endDate, accumulate budget and pricePaid
    await this.db
      .update(schema.subscriptions)
      .set({
        endDate: newEndDate,
        status: "active",
        ...(periodBudget !== null
          ? {
              classesRemaining: sql`${schema.subscriptions.classesRemaining} + ${periodBudget}`,
              classesBudget: sql`${schema.subscriptions.classesBudget} + ${periodBudget}`,
            }
          : {}),
        pricePaid: sql`${schema.subscriptions.pricePaid} + ${renewalPrice}`,
        pausedAt: null,
        resumedAt: null,
        cancelledAt: null,
      })
      .where(eq(schema.subscriptions.id, currentSub.id));

    // For fixed plans, regenerate bookings for the extended period
    if (plan.bookingMode === "fixed" && this.bookingService) {
      // Get existing schedule slot assignments
      const scheduleRows = await this.db
        .select({ scheduleId: schema.subscriptionSchedules.scheduleId })
        .from(schema.subscriptionSchedules)
        .where(eq(schema.subscriptionSchedules.subscriptionId, currentSub.id));

      const scheduleIds = scheduleRows.map((r) => r.scheduleId);
      if (scheduleIds.length > 0) {
        const bookingResult = await this.bookingService.generateFixedBookings(
          currentSub.id,
          userId,
          scheduleIds,
          baseDate,
          newEndDate,
          currentSub.branchId,
        );
        if (bookingResult.holidaysSkipped > 0) {
          // Add replacement credits
          await this.db
            .update(schema.subscriptions)
            .set({
              replacementCredits: sql`${schema.subscriptions.replacementCredits} + ${bookingResult.holidaysSkipped}`,
            })
            .where(eq(schema.subscriptions.id, currentSub.id));
        }
      }
    }

    // Record payment for the renewal period
    if (this.paymentService && renewalPrice > 0) {
      await this.paymentService.recordPayment(
        {
          memberId: userId,
          subscriptionId: currentSub.id,
          amount: renewalPrice,
          paymentMethod: input.paymentMethod,
          paymentDate: today,
        },
        adminId,
      );
    }

    const updated = await this.getSubscriptionById(currentSub.id);
    if (!updated) {
      throw new Error("Failed to retrieve renewed subscription");
    }

    this.log.info(
      { userId, subscriptionId: currentSub.id, newEndDate, adminId },
      "Subscription renewed",
    );

    return updated;
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

        // Cancel current subscription
        await this.db
          .update(schema.subscriptions)
          .set({
            status: "cancelled",
            cancelledAt: new Date(),
            notes: `Migrado a ${targetPlan.name}`,
          })
          .where(eq(schema.subscriptions.id, activeSub.id));

        // Create new subscription
        await this.db.insert(schema.subscriptions).values({
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
   * Expired subscription = immediate hard block (no grace period).
   */
  private async autoExpireSubscriptions(userId: number): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    await this.db
      .update(schema.subscriptions)
      .set({ status: "expired" })
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          eq(schema.subscriptions.status, "active"),
          sql`${schema.subscriptions.endDate} < ${today}`,
        ),
      );
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
   * Map a raw plan row to PlanListItem.
   */
  private mapPlanRow(
    row: typeof schema.subscriptionPlans.$inferSelect,
  ): PlanListItem {
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
      groupMaxMembers: row.groupMaxMembers,
      isActive: row.isActive,
      isArchived: row.isArchived,
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
      scheduleIds,
      scheduleSlots,
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
   * Map a raw subscription join row to SubscriptionDetail.
   */
  private mapSubscriptionRow(row: {
    id: number;
    userId: number;
    planId: number;
    planName: string;
    planTier: string;
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
    resumedAt: Date | null;
    cancelledAt: Date | null;
    classesRemaining: number | null;
    classesBudget: number | null;
    replacementCredits: number | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SubscriptionDetail {
    return {
      id: row.id,
      userId: row.userId,
      planId: row.planId,
      planName: row.planName,
      planTier: row.planTier as PlanTier,
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
      resumedAt: row.resumedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      classesRemaining: row.classesRemaining,
      classesBudget: row.classesBudget,
      replacementCredits: row.replacementCredits ?? 0,
      scheduleIds: [], // populated by enrichWithScheduleIds
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
