/**
 * Subscription Service
 *
 * Business logic for subscription plans CRUD, subscription lifecycle
 * management (assign, pause, resume, cancel, auto-expire), and
 * pricing engine with AURA discount integration.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, or, desc, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { AuraService, InsufficientBalanceError } from "../aura";
import type {
  PlanListItem,
  PlanDetail,
  CreatePlanInput,
  UpdatePlanInput,
  SubscriptionDetail,
  AssignPlanInput,
  PricingPreview,
  PlanTier,
  BookingMode,
  PriceType,
  SubscriptionStatus,
} from "./types";
import { AURA_DISCOUNT_TIERS } from "./types";

/**
 * Error thrown when attempting to assign a subscription while the member
 * already has an active or paused subscription.
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Error thrown when a requested resource is not found.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Error thrown for invalid operations (e.g., wrong subscription status).
 */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class SubscriptionService {
  private auraService: AuraService;

  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {
    this.auraService = new AuraService(db);
  }

  // ─── Plans CRUD ──────────────────────────────────────────────────────────

  /**
   * List subscription plans, optionally filtered by isActive.
   */
  async listPlans(isActive?: boolean): Promise<PlanListItem[]> {
    const conditions = [];
    if (isActive !== undefined) {
      conditions.push(eq(schema.subscriptionPlans.isActive, isActive));
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

    const updateData: Record<string, unknown> = {};

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

    return this.mapSubscriptionRow(rows[0]);
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

    return rows.map((r) => this.mapSubscriptionRow(r));
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
    return this.mapSubscriptionRow(rows[0]);
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
      notes: input.notes ?? null,
    });

    const subscriptionId = Number(result[0].insertId);
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

    const updateData: Record<string, unknown> = {
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

    const updateData: Record<string, unknown> = {
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

    const updated = await this.getSubscriptionById(sub.id);
    if (!updated) throw new Error("Failed to retrieve updated subscription");

    this.log.info({ userId, subscriptionId: sub.id }, "Subscription cancelled");
    return updated;
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
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
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
