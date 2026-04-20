/**
 * Mark No-Shows Cron Job
 *
 * Fires at 22:00 in each distinct active-branch timezone to mark unattended
 * bookings as no_show and decrement members' classesRemaining. A branch in
 * Argentina fires at 22:00 AR; BCN fires at 22:00 Madrid. A booking is a
 * no-show if its bookingDate is before "today" in the branch's timezone.
 */

import cron from "node-cron";
import pino from "pino";
import { sql, eq, and, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../db/schema";
import { bookings } from "../db/schema/bookings";
import { todayInTz } from "../modules/shared/date-utils";

const log = pino({ name: "mark-no-shows" });

/**
 * Return the distinct timezones of active, non-virtual branches.
 */
async function getDistinctBranchTimezones(
  db: MySql2Database<typeof schema>,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ tz: schema.branches.timezone })
    .from(schema.branches)
    .where(
      and(
        eq(schema.branches.isActive, true),
        eq(schema.branches.isVirtual, false),
      ),
    );
  return rows.map((r) => r.tz);
}

/**
 * Mark no-shows for bookings belonging to branches in the given timezone.
 * "Today" is computed in that timezone so BCN and AR each honour their own
 * day boundary — a BCN booking from Monday Madrid isn't prematurely marked
 * no-show at 22:00 AR on Monday (which is already Tuesday in Madrid).
 */
async function runMarkNoShowsForTz(
  db: MySql2Database<typeof schema>,
  tz: string,
): Promise<{ updated: number; decremented: number }> {
  const today = todayInTz(tz);

  const toMark = await db
    .select({ id: bookings.id, memberId: bookings.memberId })
    .from(bookings)
    .innerJoin(schema.schedules, eq(schema.schedules.id, bookings.scheduleId))
    .innerJoin(
      schema.branches,
      eq(schema.branches.id, schema.schedules.branchId),
    )
    .where(
      and(
        eq(bookings.status, "reservado"),
        sql`${bookings.bookingDate} < ${today}`,
        eq(schema.branches.timezone, tz),
      ),
    );

  if (toMark.length === 0) {
    return { updated: 0, decremented: 0 };
  }

  const ids = toMark.map((b) => b.id);
  await db
    .update(bookings)
    .set({ status: "no_show" })
    .where(inArray(bookings.id, ids));

  const memberCounts = new Map<number, number>();
  for (const b of toMark) {
    memberCounts.set(b.memberId, (memberCounts.get(b.memberId) ?? 0) + 1);
  }

  let decremented = 0;
  for (const [memberId, count] of memberCounts) {
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

/**
 * Run mark-no-shows for every active branch timezone. Exposed so tests can
 * invoke the full sweep without waiting for the cron schedule.
 */
export async function runMarkNoShows(
  db: MySql2Database<typeof schema>,
): Promise<{ updated: number; decremented: number }> {
  const tzs = await getDistinctBranchTimezones(db);
  let updated = 0;
  let decremented = 0;
  for (const tz of tzs) {
    const r = await runMarkNoShowsForTz(db, tz);
    updated += r.updated;
    decremented += r.decremented;
  }
  return { updated, decremented };
}

export async function startMarkNoShowsJob(
  db: MySql2Database<typeof schema>,
): Promise<void> {
  const tzs = await getDistinctBranchTimezones(db);
  // Fallback if no active branches are configured yet (e.g. fresh install).
  const scheduled = tzs.length > 0 ? tzs : ["America/Argentina/Buenos_Aires"];

  for (const tz of scheduled) {
    cron.schedule(
      "0 22 * * *",
      async () => {
        log.info({ tz }, "Running mark-no-shows job");
        try {
          const { updated, decremented } = await runMarkNoShowsForTz(db, tz);
          if (updated > 0) {
            log.info(
              { tz, updated, decremented },
              "Marked bookings as no_show and decremented class budgets",
            );
          }
        } catch (error) {
          log.error({ err: error, tz }, "Mark no-shows job failed");
        }
      },
      { timezone: tz },
    );
  }

  log.info(
    { timezones: scheduled },
    "No-show cron jobs scheduled for 22:00 daily (per branch timezone)",
  );
}
