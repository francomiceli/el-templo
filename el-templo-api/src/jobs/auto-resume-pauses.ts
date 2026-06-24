/**
 * Daily subscription-lifecycle Cron Job (00:05 Argentina timezone)
 *
 * Three sweeps, all idempotent:
 *  1. Auto-resume paused subs whose pauseEndDate has arrived. resumeSubscription
 *     extends endDate by the actual pause duration, so admins don't have to
 *     manually unpause fixed-duration breaks.
 *  2. Activate scheduled subs whose startDate has arrived.
 *  3. Auto-expire active subs past their endDate. This keeps users.status fresh
 *     for consumers that read the column directly, rather than relying on the
 *     per-member "expire on read" path firing when someone opens each detail.
 */

import cron from "node-cron";
import pino from "pino";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../db/schema";
import { SubscriptionService } from "../modules/subscriptions/service";
import { AuraService } from "../modules/aura";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../modules/finance";
import { EnrollmentService } from "../modules/programs/enrollment-service";

const log = pino({ name: "auto-resume-pauses" });

export function startAutoResumePausesJob(db: MySql2Database<typeof schema>) {
  const auraService = new AuraService(db);
  const balanceService = new BalanceService(db, log);
  const cashRegisterService = new CashRegisterService(db, log);
  const transactionService = new TransactionService(
    db,
    log,
    balanceService,
    cashRegisterService,
  );
  const enrollmentService = new EnrollmentService(db, log);
  const subscriptionService = new SubscriptionService(
    db,
    log,
    auraService,
    transactionService,
    enrollmentService,
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

      try {
        const expired = await subscriptionService.autoExpireDueSubscriptions();
        if (expired === 0) {
          log.info("No subscriptions due for expiration");
        } else {
          log.info({ users: expired }, "Auto-expired due subscriptions");
        }
      } catch (err: unknown) {
        log.error({ err }, "Auto-expire job failed");
      }
    },
    { timezone: "America/Argentina/Buenos_Aires" },
  );

  log.info(
    "Auto-resume + activate-scheduled + auto-expire cron job scheduled for 00:05 daily (Argentina timezone)",
  );
}
