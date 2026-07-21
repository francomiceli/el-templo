/**
 * Wellhub — listener del bus de ocupación.
 *
 * Suscribe pushSlotOccupancy a los cambios de ocupación que emite
 * BookingService (reservas/cancelaciones de socios y de admin). El push es
 * fire-and-forget: un fallo contra la API de Wellhub se loguea y NUNCA
 * afecta la operación que lo disparó — el cron de sincronización reconcilia
 * cualquier push perdido.
 *
 * No-op si la integración no está configurada (sin credenciales).
 */

import { FastifyPluginAsync } from "fastify";
import { AuraService } from "../aura/service";
import { EnrollmentService } from "../programs/enrollment-service";
import { NotificationService } from "../notifications/service";
import { SubscriptionService } from "../subscriptions/service";
import { BookingService } from "../scheduling/booking-service";
import { onOccupancyChange } from "../shared/occupancy-events";
import { getWellhubConfig } from "./config";
import { WellhubClient } from "./client";
import { WellhubSyncService } from "./sync-service";

export const wellhubOccupancyListener: FastifyPluginAsync = async (fastify) => {
  const config = getWellhubConfig();
  if (!config) return;

  const auraService = new AuraService(fastify.db);
  const enrollmentService = new EnrollmentService(fastify.db, fastify.log);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
    undefined,
    enrollmentService,
  );
  const notificationService = new NotificationService(fastify.db, fastify.log);
  const bookingService = new BookingService(
    fastify.db,
    fastify.log,
    subscriptionService,
    notificationService,
  );
  const client = new WellhubClient(config, fastify.log);
  const syncService = new WellhubSyncService(
    fastify.db,
    fastify.log,
    client,
    bookingService,
  );

  const unsubscribe = onOccupancyChange(({ scheduleId, date }) => {
    void syncService.pushSlotOccupancy(scheduleId, date).catch((err) => {
      fastify.log.error(
        { err, scheduleId, date },
        "Push de ocupación a Wellhub falló (lo reconcilia el cron)",
      );
    });
  });

  fastify.addHook("onClose", async () => {
    unsubscribe();
  });
};
