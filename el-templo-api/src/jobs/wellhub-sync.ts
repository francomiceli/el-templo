/**
 * Wellhub Sync Cron Job
 *
 * Cada 30 minutos publica/actualiza las clases y slots del horizonte en
 * Wellhub para todas las sedes con wellhub_gym_id, reconcilia la ocupación
 * (pushes perdidos, operaciones masivas que no emiten al bus) y expira
 * solicitudes 'pending' muertas. No-op si la integración no está
 * configurada.
 *
 * Patrón: lógica pura exportada (runWellhubSync) para tests + scheduler
 * (startWellhubSyncJob), como mark-no-shows.ts.
 */

import cron from "node-cron";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import { AuraService } from "../modules/aura";
import { EnrollmentService } from "../modules/programs/enrollment-service";
import { NotificationService } from "../modules/notifications/service";
import { SubscriptionService } from "../modules/subscriptions/service";
import { BookingService } from "../modules/scheduling/booking-service";
import { getWellhubConfig } from "../modules/wellhub/config";
import { WellhubClient } from "../modules/wellhub/client";
import {
  WellhubSyncService,
  type WellhubSyncSummary,
} from "../modules/wellhub/sync-service";

const log = pino({ name: "wellhub-sync" });

export async function runWellhubSync(
  db: MySql2Database<typeof schema>,
): Promise<WellhubSyncSummary | null> {
  const config = getWellhubConfig();
  if (!config) return null;

  const auraService = new AuraService(db);
  const enrollmentService = new EnrollmentService(db, log);
  const subscriptionService = new SubscriptionService(
    db,
    log,
    auraService,
    undefined,
    enrollmentService,
  );
  const notificationService = new NotificationService(db, log);
  const bookingService = new BookingService(
    db,
    log,
    subscriptionService,
    notificationService,
  );
  const client = new WellhubClient(config, log);
  const syncService = new WellhubSyncService(db, log, client, bookingService);

  return await syncService.syncAllBranches();
}

export function startWellhubSyncJob(db: MySql2Database<typeof schema>): void {
  if (!getWellhubConfig()) {
    log.info("Wellhub sin configurar — cron de sincronización apagado");
    return;
  }

  cron.schedule("*/30 * * * *", async () => {
    try {
      const summary = await runWellhubSync(db);
      if (summary) {
        log.info(summary, "Sincronización Wellhub completada");
      }
    } catch (error) {
      log.error({ err: error }, "Sincronización Wellhub falló");
    }
  });

  log.info("Wellhub sync job scheduled (cada 30 minutos)");
}
