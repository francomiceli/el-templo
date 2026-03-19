/**
 * Bot-Internal Scheduling API Routes
 *
 * Service-to-service endpoints called only by el-templo-bot via localhost.
 * Auth: API key check via x-bot-api-key header (shared secret, localhost-only).
 *
 * Routes:
 * - POST /book-class — Book a class for an identified member
 * - POST /register-trial — Create a trial user and optionally book a class
 */

import { FastifyPluginAsync } from "fastify";
import { BookingService } from "./booking-service";
import { BotSchedulingService } from "./bot-service";
import { PaymentService } from "../payments/service";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import { handleServiceError } from "../shared/error-handler";

export const schedulingBotRoutes: FastifyPluginAsync = async (fastify) => {
  // Service instantiation with dependency injection
  const paymentService = new PaymentService(fastify.db, fastify.log);
  const auraService = new AuraService(fastify.db);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
  );
  const bookingService = new BookingService(
    fastify.db,
    fastify.log,
    paymentService,
    subscriptionService,
  );
  const botService = new BotSchedulingService(
    fastify.db,
    fastify.log,
    bookingService,
  );

  /**
   * Guard: require valid bot API key on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    const apiKey = request.headers["x-bot-api-key"];
    const expectedKey = process.env.BOT_API_KEY;

    if (!expectedKey) {
      fastify.log.error("BOT_API_KEY environment variable is not set");
      return reply.code(500).send({
        error: "Server Error",
        message: "Bot API key not configured",
      });
    }

    if (apiKey !== expectedKey) {
      return reply.code(401).send({
        error: "Unauthorized",
        message: "Invalid or missing bot API key",
      });
    }
  });

  // ─── POST /book-class ─────────────────────────────────────────────────────

  fastify.post<{
    Body: { memberId: number; scheduleId: number; date: string };
  }>("/book-class", async (request, reply) => {
    try {
      const { memberId, scheduleId, date } = request.body;

      if (!memberId || !scheduleId || !date) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "memberId, scheduleId, and date are required",
        });
      }

      const booking = await bookingService.reserve(memberId, scheduleId, date);

      return reply.code(201).send(booking);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "bot book-class");
    }
  });

  // ─── POST /register-trial ─────────────────────────────────────────────────

  fastify.post<{
    Body: {
      phone: string;
      name: string;
      scheduleId?: number;
      date?: string;
    };
  }>("/register-trial", async (request, reply) => {
    try {
      const { phone, name, scheduleId, date } = request.body;

      if (!phone || !name) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "phone and name are required",
        });
      }

      const result = await botService.registerTrial(
        phone,
        name,
        scheduleId,
        date,
      );

      return reply.code(201).send(result);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "bot register-trial");
    }
  });
};
