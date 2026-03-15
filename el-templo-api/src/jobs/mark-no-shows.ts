/**
 * Mark No-Shows Cron Job
 *
 * Runs at 22:00 daily (Argentina timezone) to mark unattended bookings
 * as no_show. Any booking with status "reservado" and a bookingDate in
 * the past is considered a no-show.
 */

import cron from "node-cron";
import pino from "pino";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../db/schema";
import { bookings } from "../db/schema/bookings";

const log = pino({ name: "mark-no-shows" });

export function startMarkNoShowsJob(db: MySql2Database<typeof schema>) {
  // Run at 22:00 every day (Argentina time)
  cron.schedule(
    "0 22 * * *",
    async () => {
      log.info("Running mark-no-shows job");
      try {
        const result = await db
          .update(bookings)
          .set({ status: "no_show" })
          .where(
            sql`${bookings.status} = 'reservado' AND ${bookings.bookingDate} < CURDATE()`,
          );

        const updated = result[0].affectedRows;
        if (updated > 0) {
          log.info({ updated }, "Marked bookings as no_show");
        } else {
          log.info("No unattended bookings to mark");
        }
      } catch (error) {
        log.error({ err: error }, "Mark no-shows job failed");
      }
    },
    {
      timezone: "America/Argentina/Buenos_Aires",
    },
  );

  log.info("No-show cron job scheduled for 22:00 daily (Argentina timezone)");
}
