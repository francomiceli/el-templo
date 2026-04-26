/**
 * Auto-resume Cron Job
 *
 * Runs daily at 00:05 (Argentina timezone) to auto-resume paused
 * subscriptions whose pauseEndDate has arrived. The existing
 * resumeSubscription logic extends the subscription's endDate by
 * the actual pause duration, so admins don't have to manually
 * unpause members who asked for a fixed-duration break.
 */

import cron from "node-cron";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../db/schema";
import { SubscriptionService } from "../modules/subscriptions/service";
import { AuraService } from "../modules/aura";
import { PaymentService } from "../modules/payments/service";

const log = pino({ name: "auto-resume-pauses" });

export function startAutoResumePausesJob(db: MySql2Database<typeof schema>) {
  const auraService = new AuraService(db);
  const paymentService = new PaymentService(db, log);
  const subscriptionService = new SubscriptionService(
    db,
    log,
    auraService,
    paymentService,
  );

  // Daily at 00:05 Argentina time (just after midnight)
  cron.schedule(
    "5 0 * * *",
    async () => {
      log.info("Running auto-resume job");
      try {
        const resumed = await subscriptionService.autoResumeDuePauses();
        if (resumed === 0) {
          log.info("No paused subscriptions due for resume");
        }
      } catch (err: unknown) {
        log.error({ err }, "Auto-resume job failed");
      }

      try {
        const activated = await subscriptionService.activateDueScheduledSubs();
        if (activated === 0) {
          log.info("No scheduled subscriptions due for activation");
        } else {
          log.info({ activated }, "Activated scheduled subscriptions");
        }
      } catch (err: unknown) {
        log.error({ err }, "Activate-scheduled job failed");
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" },
  );

  log.info(
    "Auto-resume + activate-scheduled cron job scheduled for 00:05 daily (Argentina timezone)",
  );
}
