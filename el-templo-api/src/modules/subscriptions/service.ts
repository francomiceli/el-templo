/**
 * Subscription Service
 *
 * Business logic for subscription plans CRUD, subscription lifecycle
 * management (assign, pause, resume, cancel, auto-expire), and
 * pricing engine with AURA discount integration.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, or, ne, desc, sql, inArray } from "drizzle-orm";
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
import type { PaymentService } from "../payments/service";
import type { GoalPlanType } from "../goal-plans/types";

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
      planCategory: input.planCategory ?? "presencial",
      linkedProgramId: input.linkedProgramId ?? null,
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
    if (input.planCategory !== undefined)
      updateData.planCategory = input.planCategory;
    if (input.linkedProgramId !== undefined)
      updateData.linkedProgramId = input.linkedProgramId;
    if (input.groupMaxMembers !== undefined)
      updateData.groupMaxMembers = input.groupMaxMembers;

    // Validate: if resulting plan would be online but without linkedProgramId, reject
    const resultPlanCategory =
      input.planCategory !== undefined
        ? input.planCategory
        : existing.planCategory;
    const resultLinkedProgramId =
      input.linkedProgramId !== undefined
        ? input.linkedProgramId
        : existing.linkedProgramId;
    if (resultPlanCategory !== "presencial" && !resultLinkedProgramId) {
      throw new BadRequestError(
        "Planes online requieren un programa vinculado (linkedProgramId)",
      );
    }

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
      // When multiple active subs exist (early renewal), prefer the one
      // covering today (startDate <= today). Fall back to earliest future sub.
      .orderBy(
        sql`CASE WHEN ${schema.subscriptions.startDate} <= CURDATE() THEN 0 ELSE 1 END`,
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
      .orderBy(schema.subscriptions.createdAt);

    const mapped = rows.map((r) => this.mapSubscriptionRow(r));
    return Promise.all(mapped.map((m) => this.enrichWithScheduleIds(m)));
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
        branchId: schema.users.branchId,
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

    // Check no existing active/paused subscription in the same category group (D-35)
    // A member CAN have one presencial + one online simultaneously
    // A member CANNOT have two presencial or two online simultaneously
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

    // Auto-migrate member from virtual branch to subscription's physical branch
    if (member.branchId !== input.branchId) {
      const [currentBranch] = await this.db
        .select({ isVirtual: schema.branches.isVirtual })
        .from(schema.branches)
        .where(eq(schema.branches.id, member.branchId));

      if (currentBranch?.isVirtual) {
        await this.db
          .update(schema.users)
          .set({ branchId: input.branchId })
          .where(eq(schema.users.id, userId));

        this.log.info(
          { userId, fromBranchId: member.branchId, toBranchId: input.branchId },
          "Auto-migrated member from virtual branch to subscription branch",
        );
      }
    }

    const subscription = await this.getSubscriptionById(subscriptionId);
    if (!subscription) {
      throw new Error("Failed to retrieve newly created subscription");
    }

    // Auto-create program enrollment if plan has linked program (D-34/D-39)
    if (plan.linkedProgramId) {
      // Cancel any existing active enrollment for this user in this program
      await this.db
        .update(schema.programEnrollments)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(
          and(
            eq(schema.programEnrollments.userId, userId),
            eq(schema.programEnrollments.programId, plan.linkedProgramId),
            eq(schema.programEnrollments.status, "active"),
          ),
        );

      // Create new enrollment
      await this.db.insert(schema.programEnrollments).values({
        userId,
        programId: plan.linkedProgramId,
        status: "active",
        currentWeek: 1,
        sessionsCompletedThisWeek: 0,
        weekUnlockedAt: new Date(),
      });

      this.log.info(
        { userId, programId: plan.linkedProgramId },
        "Auto-created program enrollment from plan assignment",
      );
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
   * Replace a fixed-plan subscription's schedule slots.
   *
   * Cancels future bookings on the old slots, swaps the subscription_schedules
   * rows, regenerates bookings on the new slots from tomorrow to endDate, and
   * records an audit row. Today's booking on the old slot is preserved.
   */
  async changeFixedSchedules(
    subscriptionId: number,
    actorId: number,
    input: { scheduleIds: number[]; reason?: string },
  ): Promise<SubscriptionDetail> {
    const sub = await this.getSubscriptionById(subscriptionId);
    if (!sub) {
      throw new NotFoundError("Suscripcion no encontrada");
    }
    if (sub.status !== "active") {
      throw new BadRequestError(
        "Solo se pueden cambiar turnos de suscripciones activas",
      );
    }

    const [plan] = await this.db
      .select({
        bookingMode: schema.subscriptionPlans.bookingMode,
        planCategory: schema.subscriptionPlans.planCategory,
        classesPerWeek: schema.subscriptionPlans.classesPerWeek,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, sub.planId));

    if (!plan || plan.bookingMode !== "fixed") {
      throw new BadRequestError(
        "Solo los planes fijos tienen turnos que cambiar",
      );
    }
    if (plan.planCategory !== "presencial") {
      throw new BadRequestError(
        "Solo los planes presenciales usan turnos fijos",
      );
    }
    if (
      plan.classesPerWeek !== null &&
      input.scheduleIds.length !== plan.classesPerWeek
    ) {
      throw new BadRequestError(
        `Debes seleccionar exactamente ${plan.classesPerWeek} horarios. Seleccionaste ${input.scheduleIds.length}.`,
      );
    }

    // Validate the new schedule IDs: exist, active, same branch
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
      if (row.branchId !== sub.branchId) {
        throw new BadRequestError(
          `El horario ${row.id} no pertenece a la sucursal de la suscripcion`,
        );
      }
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

    // 2. Swap subscription_schedules rows
    await this.db
      .delete(schema.subscriptionSchedules)
      .where(eq(schema.subscriptionSchedules.subscriptionId, subscriptionId));
    await this.db.insert(schema.subscriptionSchedules).values(
      input.scheduleIds.map((scheduleId) => ({
        subscriptionId,
        scheduleId,
      })),
    );

    // 3. Record audit trail
    await this.db.insert(schema.subscriptionScheduleChanges).values({
      subscriptionId,
      actorId,
      oldScheduleIds,
      newScheduleIds: input.scheduleIds,
      reason: input.reason ?? null,
    });

    // 4. Regenerate future bookings on new slots starting tomorrow
    if (this.bookingService && sub.endDate) {
      const now = new Date();
      now.setUTCDate(now.getUTCDate() + 1);
      const tomorrow = now.toISOString().split("T")[0];
      if (tomorrow <= sub.endDate) {
        await this.bookingService.generateFixedBookings(
          subscriptionId,
          sub.userId,
          input.scheduleIds,
          tomorrow,
          sub.endDate,
          sub.branchId,
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

    await this.db
      .update(schema.subscriptions)
      .set({
        status: "paused",
        pausedAt: new Date(),
        pauseEndDate: pauseEndDate ?? null,
      })
      .where(eq(schema.subscriptions.id, sub.id));

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

    // Also cancel any scheduled successor
    await this.db
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
    };
  }

  /**
   * Change a member's current plan. Dispatches based on input.startMode:
   *   - "now" (default): close current, apply proration, create new active sub
   *   - "after_current": keep current running, queue scheduled sub that
   *     activates on current.endDate (no proration, full price charged now)
   */
  async changePlan(
    userId: number,
    input: AssignPlanInput,
    adminId: number,
  ): Promise<SubscriptionDetail> {
    if (input.startMode === "after_current") {
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

    // Calculate proration from CURRENT subscription only (single record, no accumulation)
    const proration = this.calculateProration(existingSub, currentPlan);
    const netAmount = Math.max(
      0,
      targetPlan.priceRegular - proration.remainingValue,
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
        // Validate schedule IDs exist and belong to branch
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
            throw new BadRequestError(`El horario ${row.id} esta inactivo.`);
          }
          if (row.branchId !== input.branchId) {
            throw new BadRequestError(
              `El horario ${row.id} no pertenece a la sucursal seleccionada`,
            );
          }
        }
      }

      // Calculate new period
      const startDate = new Date(input.startDate);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + targetPlan.durationDays);
      const endDateStr = endDate.toISOString().split("T")[0];

      const classesRemaining =
        targetPlan.classesPerWeek !== null
          ? Math.ceil(targetPlan.durationDays / 7) * targetPlan.classesPerWeek
          : null;

      const result = await this.db.insert(schema.subscriptions).values({
        userId,
        planId: input.planId,
        branchId: input.branchId,
        status: "active",
        startDate: input.startDate,
        endDate: endDateStr,
        pricePaid: netAmount,
        priceTypeApplied: input.priceTypeApplied,
        priceOverrideAmount: netAmount,
        priceOverrideReason: `Cambio de plan: credito $${proration.remainingValue} (${proration.remainingDetail})`,
        classesRemaining,
        classesBudget: classesRemaining,
        previousSubscriptionId: existingSub.id,
        notes: input.notes ?? null,
      });

      const newSubscriptionId = Number(result[0].insertId);

      // Fixed plan: store schedules and generate bookings
      let replacementCredits = 0;
      if (
        targetPlan.bookingMode === "fixed" &&
        input.scheduleIds &&
        input.scheduleIds.length > 0
      ) {
        await this.db.insert(schema.subscriptionSchedules).values(
          input.scheduleIds.map((scheduleId) => ({
            subscriptionId: newSubscriptionId,
            scheduleId,
          })),
        );

        if (this.bookingService) {
          const bookingResult = await this.bookingService.generateFixedBookings(
            newSubscriptionId,
            userId,
            input.scheduleIds,
            input.startDate,
            endDateStr,
            input.branchId,
          );
          replacementCredits = bookingResult.holidaysSkipped;
        }

        if (replacementCredits > 0) {
          await this.db
            .update(schema.subscriptions)
            .set({ replacementCredits })
            .where(eq(schema.subscriptions.id, newSubscriptionId));
        }
      }

      // Cancel old program enrollment if old plan had a linked program
      if (currentPlan.linkedProgramId) {
        await this.db
          .update(schema.programEnrollments)
          .set({ status: "cancelled", cancelledAt: new Date() })
          .where(
            and(
              eq(schema.programEnrollments.userId, userId),
              eq(
                schema.programEnrollments.programId,
                currentPlan.linkedProgramId,
              ),
              eq(schema.programEnrollments.status, "active"),
            ),
          );

        this.log.info(
          { userId, programId: currentPlan.linkedProgramId },
          "Cancelled program enrollment from old plan on plan change",
        );
      }

      // Create new program enrollment if new plan has a linked program
      if (targetPlan.linkedProgramId) {
        await this.db.insert(schema.programEnrollments).values({
          userId,
          programId: targetPlan.linkedProgramId,
          status: "active",
          currentWeek: 1,
          sessionsCompletedThisWeek: 0,
          weekUnlockedAt: new Date(),
        });

        this.log.info(
          { userId, programId: targetPlan.linkedProgramId },
          "Auto-created program enrollment from plan change",
        );
      }

      // Record payment for the net amount
      if (this.paymentService && netAmount > 0) {
        await this.paymentService.recordPayment(
          {
            memberId: userId,
            subscriptionId: newSubscriptionId,
            amount: netAmount,
            paymentMethod: input.paymentMethod,
            paymentDate: input.startDate,
            notes: `Cambio de plan: ${existingSub.planName} → ${targetPlan.name}`,
          },
          adminId,
        );
      }

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
          throw new BadRequestError(`El horario ${row.id} esta inactivo.`);
        }
        if (row.branchId !== input.branchId) {
          throw new BadRequestError(
            `El horario ${row.id} no pertenece a la sucursal seleccionada`,
          );
        }
      }
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

    const result = await this.db.insert(schema.subscriptions).values({
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
    });

    const newSubscriptionId = Number(result[0].insertId);

    // Fixed plan: store schedules and generate bookings for the future period
    let replacementCredits = 0;
    if (
      targetPlan.bookingMode === "fixed" &&
      input.scheduleIds &&
      input.scheduleIds.length > 0
    ) {
      await this.db.insert(schema.subscriptionSchedules).values(
        input.scheduleIds.map((scheduleId) => ({
          subscriptionId: newSubscriptionId,
          scheduleId,
        })),
      );

      if (this.bookingService) {
        const bookingResult = await this.bookingService.generateFixedBookings(
          newSubscriptionId,
          userId,
          input.scheduleIds,
          newStartDate,
          newEndDate,
          input.branchId,
        );
        replacementCredits = bookingResult.holidaysSkipped;
      }

      if (replacementCredits > 0) {
        await this.db
          .update(schema.subscriptions)
          .set({ replacementCredits })
          .where(eq(schema.subscriptions.id, newSubscriptionId));
      }
    }

    // Record payment now (charged at scheduling time)
    if (this.paymentService && pricePaid > 0) {
      await this.paymentService.recordPayment(
        {
          memberId: userId,
          subscriptionId: newSubscriptionId,
          amount: pricePaid,
          paymentMethod: input.paymentMethod,
          paymentDate: today,
          notes: `Cambio de plan programado: ${currentSub.planName} → ${targetPlan.name} (inicia ${newStartDate})`,
        },
        adminId,
      );
    }

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

    // Derive renewal price from the plan using the same price type as original assignment
    const renewalPrice =
      currentSub.priceTypeApplied === "zero"
        ? plan.priceZero
        : currentSub.priceTypeApplied === "credit_card" && plan.priceCreditCard
          ? plan.priceCreditCard
          : plan.priceRegular;

    // If old sub is already expired, close it now.
    // If still active (early renewal), leave it active — auto-expire will
    // transition it to "completed" and activate the scheduled sub.
    const oldSubExpired = !currentSub.endDate || currentSub.endDate < today;
    if (oldSubExpired) {
      await this.db
        .update(schema.subscriptions)
        .set({ status: "completed" })
        .where(eq(schema.subscriptions.id, currentSub.id));
    }

    // Early renewal → new sub is "scheduled" (paid, queued, not yet usable).
    // Expired renewal → new sub is "active" immediately.
    const newStatus = oldSubExpired ? "active" : "scheduled";

    // Create new subscription record for the new period
    const result = await this.db.insert(schema.subscriptions).values({
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
      classesRemaining: periodBudget,
      classesBudget: periodBudget,
      previousSubscriptionId: currentSub.id,
    });

    const newSubscriptionId = Number(result[0].insertId);

    // For fixed plans, copy schedule assignments and generate bookings
    let replacementCredits = 0;
    if (plan.bookingMode === "fixed") {
      // Copy subscription_schedules from old sub to new sub
      const scheduleRows = await this.db
        .select({ scheduleId: schema.subscriptionSchedules.scheduleId })
        .from(schema.subscriptionSchedules)
        .where(eq(schema.subscriptionSchedules.subscriptionId, currentSub.id));

      const scheduleIds = scheduleRows.map((r) => r.scheduleId);
      if (scheduleIds.length > 0) {
        await this.db.insert(schema.subscriptionSchedules).values(
          scheduleIds.map((scheduleId) => ({
            subscriptionId: newSubscriptionId,
            scheduleId,
          })),
        );

        if (this.bookingService) {
          const bookingResult = await this.bookingService.generateFixedBookings(
            newSubscriptionId,
            userId,
            scheduleIds,
            newStartDate,
            newEndDate,
            currentSub.branchId,
          );
          replacementCredits = bookingResult.holidaysSkipped;
        }
      }

      if (replacementCredits > 0) {
        await this.db
          .update(schema.subscriptions)
          .set({ replacementCredits })
          .where(eq(schema.subscriptions.id, newSubscriptionId));
      }
    }

    // Handle program enrollment on renewal
    if (plan.linkedProgramId) {
      const existingEnrollment = await this.db
        .select({ id: schema.programEnrollments.id })
        .from(schema.programEnrollments)
        .where(
          and(
            eq(schema.programEnrollments.userId, userId),
            eq(schema.programEnrollments.programId, plan.linkedProgramId),
            eq(schema.programEnrollments.status, "active"),
          ),
        );

      // Only create new enrollment if no active one exists
      if (existingEnrollment.length === 0) {
        await this.db.insert(schema.programEnrollments).values({
          userId,
          programId: plan.linkedProgramId,
          status: "active",
          currentWeek: 1,
          sessionsCompletedThisWeek: 0,
          weekUnlockedAt: new Date(),
        });

        this.log.info(
          { userId, programId: plan.linkedProgramId },
          "Auto-created program enrollment on renewal",
        );
      }
    }

    // Record payment linked to the NEW subscription
    if (this.paymentService && renewalPrice > 0) {
      await this.paymentService.recordPayment(
        {
          memberId: userId,
          subscriptionId: newSubscriptionId,
          amount: renewalPrice,
          paymentMethod: input.paymentMethod,
          paymentDate: today,
        },
        adminId,
      );
    }

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

    // Activate scheduled successors (handles program enrollment + branch migration
    // when the scheduled sub is for a different plan than the expiring one).
    for (const successor of scheduledSuccessors) {
      await this.activateScheduledSub(successor.id);
    }
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

    // Cancel old program enrollment if old plan had a linked program and it
    // differs from the new plan's linked program
    if (
      prevPlan.linkedProgramId &&
      prevPlan.linkedProgramId !== newPlan.linkedProgramId
    ) {
      await this.db
        .update(schema.programEnrollments)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(
          and(
            eq(schema.programEnrollments.userId, scheduled.userId),
            eq(schema.programEnrollments.programId, prevPlan.linkedProgramId),
            eq(schema.programEnrollments.status, "active"),
          ),
        );

      this.log.info(
        {
          userId: scheduled.userId,
          programId: prevPlan.linkedProgramId,
        },
        "Cancelled program enrollment on scheduled plan-change activation",
      );
    }

    // Create new program enrollment if new plan has a linked program and the
    // user doesn't already have an active enrollment for it
    if (
      newPlan.linkedProgramId &&
      newPlan.linkedProgramId !== prevPlan.linkedProgramId
    ) {
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

      if (existing.length === 0) {
        await this.db.insert(schema.programEnrollments).values({
          userId: scheduled.userId,
          programId: newPlan.linkedProgramId,
          status: "active",
          currentWeek: 1,
          sessionsCompletedThisWeek: 0,
          weekUnlockedAt: new Date(),
        });

        this.log.info(
          {
            userId: scheduled.userId,
            programId: newPlan.linkedProgramId,
          },
          "Created program enrollment on scheduled plan-change activation",
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ─── Promo Plans ──────────────────────────────────────────────────────────

  /**
   * List all promo plans ordered by most recent first.
   */
  async listPromoPlans(): Promise<PromoListItem[]> {
    const rows = await this.db
      .select()
      .from(schema.promoPlans)
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
   * exists and the promo code is unique.
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
}
