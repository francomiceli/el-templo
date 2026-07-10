/**
 * Shared lookup for per-date schedule cancellations (schedule_exceptions).
 *
 * Both SchedulingService (grid/detail rendering) and BookingService
 * (reserve/trial/admin-add guards) need the same single-row query, so it
 * lives here as a standalone helper — same pattern as ./capacity.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import * as schema from "../../db/schema";

export interface ScheduleExceptionRow {
  id: number;
  scheduleId: number;
  exceptionDate: string;
  reason: string | null;
  createdAt: Date;
}

/**
 * Return the exception cancelling `scheduleId` on `date` (YYYY-MM-DD),
 * or null when the class runs normally that day.
 */
export async function getScheduleException(
  db: MySql2Database<typeof schema>,
  scheduleId: number,
  date: string,
): Promise<ScheduleExceptionRow | null> {
  const [row] = await db
    .select({
      id: schema.scheduleExceptions.id,
      scheduleId: schema.scheduleExceptions.scheduleId,
      exceptionDate: schema.scheduleExceptions.exceptionDate,
      reason: schema.scheduleExceptions.reason,
      createdAt: schema.scheduleExceptions.createdAt,
    })
    .from(schema.scheduleExceptions)
    .where(
      and(
        eq(schema.scheduleExceptions.scheduleId, scheduleId),
        eq(schema.scheduleExceptions.exceptionDate, date),
      ),
    )
    .limit(1);

  return row ?? null;
}
