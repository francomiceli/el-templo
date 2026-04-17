/**
 * Mark No-Shows Cron Job
 *
 * Runs at 22:00 daily (Argentina timezone) to mark unattended bookings
 * as no_show. Any booking with status "reservado" and a bookingDate in
 * the past is considered a no-show.
 */

import cron from "node-cron";
import pino from "pino";
import { sql, eq, and, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import { bookings } from "../db/schema/bookings";

const log = pino({ name: "mark-no-shows" });

/**
 * Mark unattended past bookings as no_show and decrement classesRemaining for
 * each affected member's active/paused subscription. Extracted so tests can
 * invoke it directly without waiting for the cron schedule.
 */
export async function runMarkNoShows(
  db: MySql2Database<typeof schema>,
): Promise<{ updated: number; decremented: number }> {
  // 1. Find the bookings that will become no-shows (need member ids first so
  //    we can decrement their class budgets after the status update).
  const toMark = await db
    .select({ id: bookings.id, memberId: bookings.memberId })
    .from(bookings)
    .where(
      sql`${bookings.status} = 'reservado' AND ${bookings.bookingDate} < CURDATE()`,
    );

  if (toMark.length === 0) {
    return { updated: 0, decremented: 0 };
  }

  const ids = toMark.map((b) => b.id);
  await db
    .update(bookings)
    .set({ status: "no_show" })
    .where(inArray(bookings.id, ids));

  // 2. Decrement classesRemaining once per member for each no-show. Guarded
  //    so we never go below zero.
  const memberCounts = new Map<number, number>();
  for (const b of toMark) {
    memberCounts.set(b.memberId, (memberCounts.get(b.memberId) ?? 0) + 1);
  }

  let decremented = 0;
  for (const [memberId, count] of memberCounts) {
    // Find the member's active/paused subscription with class tracking.
    const [sub] = await db
      .select({
        id: schema.subscriptions.id,
        classesRemaining: schema.subscriptions.classesRemaining,
      })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, memberId),
          sql`${schema.subscriptions.status} IN ('active', 'paused')`,
        ),
      )
      .limit(1);

    if (!sub || sub.classesRemaining === null || sub.classesRemaining <= 0) {
      continue;
    }

    const deduct = Math.min(sub.classesRemaining, count);
    await db
      .update(schema.subscriptions)
      .set({
        classesRemaining: sql`${schema.subscriptions.classesRemaining} - ${deduct}`,
      })
      .where(eq(schema.subscriptions.id, sub.id));
    decremented += deduct;
  }

  return { updated: toMark.length, decremented };
}

export function startMarkNoShowsJob(db: MySql2Database<typeof schema>) {
  // Run at 22:00 every day (Argentina time)
  cron.schedule(
    "0 22 * * *",
    async () => {
      log.info("Running mark-no-shows job");
      try {
        const { updated, decremented } = await runMarkNoShows(db);
        if (updated > 0) {
          log.info(
            { updated, decremented },
            "Marked bookings as no_show and decremented class budgets",
          );
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
