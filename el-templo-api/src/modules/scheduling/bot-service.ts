/**
 * Bot Scheduling Service
 *
 * Handles trial user registration for the WhatsApp bot.
 * Called via bot-internal API routes (not directly by members/admins).
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BookingService } from "./booking-service";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";
import type { BookingRecord } from "./types";

export interface RegisterTrialResult {
  userId: number;
  bookingId?: number;
  message: string;
}

export class BotSchedulingService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private bookingService: BookingService,
  ) {}

  /**
   * Register a trial user and optionally book them into a class.
   *
   * Flow:
   * 1. Check if user exists by phone
   * 2. If exists with trial subscription -> error (already had trial)
   * 3. If not exists -> create user with placeholder email/password
   * 4. Find active trial plan
   * 5. Create trial subscription
   * 6. Optionally book a class
   */
  async registerTrial(
    phone: string,
    name: string,
    scheduleId?: number,
    date?: string,
  ): Promise<RegisterTrialResult> {
    // 1. Check if user already exists by phone
    const [existingUser] = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
      })
      .from(schema.users)
      .where(eq(schema.users.phone, phone))
      .limit(1);

    if (existingUser) {
      // Check if they already had a trial subscription
      const [trialSub] = await this.db
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .innerJoin(
          schema.subscriptionPlans,
          eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
        )
        .where(
          and(
            eq(schema.subscriptions.userId, existingUser.id),
            eq(schema.subscriptionPlans.isTrial, true),
          ),
        )
        .limit(1);

      if (trialSub) {
        throw new ConflictError("Ya tuviste una clase de prueba");
      }

      // User exists but never had a trial — create trial subscription for them
      return this.createTrialSubscription(existingUser.id, scheduleId, date);
    }

    // 2. User doesn't exist — create new user
    // Generate placeholder email and password for required DB fields
    const sanitizedPhone = phone.replace(/\D/g, "");
    const placeholderEmail = `bot_trial_${sanitizedPhone}@placeholder.eltemplo.org`;
    const placeholderPasswordHash = "BOT_TRIAL_NO_LOGIN";

    const insertResult = await this.db.insert(schema.users).values({
      firstName: name,
      phone,
      role: "member",
      branchId: 1,
      isActive: true,
      email: placeholderEmail,
      passwordHash: placeholderPasswordHash,
    });

    const newUserId = Number(insertResult[0].insertId);

    this.log.info({ userId: newUserId, phone, name }, "Bot created trial user");

    // 3. Create trial subscription and optionally book
    return this.createTrialSubscription(newUserId, scheduleId, date);
  }

  /**
   * Create a trial subscription for a user and optionally book a class.
   */
  private async createTrialSubscription(
    userId: number,
    scheduleId?: number,
    date?: string,
  ): Promise<RegisterTrialResult> {
    // Find the active trial plan
    const [trialPlan] = await this.db
      .select({
        id: schema.subscriptionPlans.id,
        durationDays: schema.subscriptionPlans.durationDays,
      })
      .from(schema.subscriptionPlans)
      .where(
        and(
          eq(schema.subscriptionPlans.isTrial, true),
          eq(schema.subscriptionPlans.isActive, true),
        ),
      )
      .limit(1);

    if (!trialPlan) {
      throw new NotFoundError("No hay un plan de prueba activo configurado");
    }

    // Calculate dates
    const today = new Date();
    const startDate = today.toISOString().split("T")[0];
    const endDateObj = new Date(today);
    endDateObj.setDate(endDateObj.getDate() + trialPlan.durationDays);
    const endDate = endDateObj.toISOString().split("T")[0];

    // Get user's branchId for subscription
    const [user] = await this.db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user) {
      throw new NotFoundError("Usuario no encontrado");
    }

    // Create trial subscription
    await this.db.insert(schema.subscriptions).values({
      userId,
      planId: trialPlan.id,
      branchId: user.branchId,
      status: "active",
      startDate,
      endDate,
      pricePaid: 0,
      priceTypeApplied: "zero",
    });

    this.log.info(
      { userId, planId: trialPlan.id, startDate, endDate },
      "Bot created trial subscription",
    );

    // Optionally book a class
    let booking: BookingRecord | undefined;
    if (scheduleId !== undefined && date !== undefined) {
      booking = await this.bookingService.reserve(userId, scheduleId, date);
    }

    return {
      userId,
      bookingId: booking?.id,
      message: booking
        ? "Prueba registrada y clase reservada"
        : "Prueba registrada exitosamente",
    };
  }
}
