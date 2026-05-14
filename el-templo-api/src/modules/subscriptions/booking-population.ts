/**
 * Booking-population helpers.
 *
 * Exposed to the subscription service so that every lifecycle event that
 * starts, extends, resumes, cancels, pauses or reshapes a sub can keep
 * `bookings` in sync with `subscription_schedules`:
 *
 *   - populateBookings: expand a sub's fixed schedules into concrete
 *     booking rows covering [fromDate, endDate], skipping holidays.
 *     Idempotent (INSERT IGNORE).
 *
 *   - clearFutureBookings: delete active (non-cancelled) bookings for a
 *     sub's member from fromDate onward.
 *
 * These are not exposed to external callers — consumed only by the
 * subscription service to keep invariants right.
 */
import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";

/** Add `days` calendar days to a YYYY-MM-DD string. Returns YYYY-MM-DD. */
function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday for YYYY-MM-DD: Mon=1..Sun=7. */
function isoWeekday(yyyymmdd: string): number {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Every date in [startDate, endDate] whose weekday matches and which is
 * not a holiday. Exposed for unit tests.
 */
export function expandDates(
  startDate: string,
  endDate: string,
  targetWeekday: number,
  holidayDates: Set<string>,
): string[] {
  const out: string[] = [];
  if (startDate > endDate) return out;
  let cursor = startDate;
  const startWeekday = isoWeekday(cursor);
  const offset = (targetWeekday - startWeekday + 7) % 7;
  cursor = addDays(cursor, offset);
  while (cursor <= endDate) {
    if (!holidayDates.has(cursor)) out.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return out;
}

/** Today as YYYY-MM-DD (UTC). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface PopulateOptions {
  /** Earliest date to populate (inclusive). Defaults to today. */
  fromDate?: string;
  /** Override endDate (e.g. when renewing past current endDate). */
  throughDate?: string;
  /**
   * Per-schedule fromDate overrides. When the admin assigns a fixed slot
   * that is full this week, the picker can defer that slot's first booking
   * to a future date. The map's value wins over `fromDate` for matching
   * scheduleIds; everything else uses `fromDate` (or today).
   */
  perScheduleFromDate?: Record<number, string>;
}

/**
 * Populate booking rows for every subscription_schedule attached to `subId`
 * covering [fromDate, endDate]. Skips holidays for the sub's branch country.
 *
 * Uses INSERT IGNORE to avoid duplicate-key errors; safe to re-run.
 * Returns the number of bookings actually inserted.
 */
export async function populateBookings(
  db: MySql2Database<typeof schema>,
  log: FastifyBaseLogger,
  subId: number,
  opts: PopulateOptions = {},
): Promise<number> {
  // Fetch sub + branch country + attached schedules in one query.
  const rows = await db
    .select({
      userId: schema.subscriptions.userId,
      subEndDate: schema.subscriptions.endDate,
      subStatus: schema.subscriptions.status,
      scheduleId: schema.subscriptionSchedules.scheduleId,
      dayOfWeek: schema.schedules.dayOfWeek,
      scheduleActive: schema.schedules.isActive,
      branchCountry: schema.branches.country,
    })
    .from(schema.subscriptionSchedules)
    .innerJoin(
      schema.subscriptions,
      eq(schema.subscriptions.id, schema.subscriptionSchedules.subscriptionId),
    )
    .innerJoin(
      schema.schedules,
      eq(schema.schedules.id, schema.subscriptionSchedules.scheduleId),
    )
    .innerJoin(
      schema.branches,
      eq(schema.branches.id, schema.subscriptions.branchId),
    )
    .where(eq(schema.subscriptionSchedules.subscriptionId, subId));

  if (rows.length === 0) return 0;

  const firstRow = rows[0];
  const fromDate = opts.fromDate ?? today();
  const endDate = opts.throughDate ?? firstRow.subEndDate;

  if (!endDate || endDate < fromDate) {
    log.debug(
      { subId, fromDate, endDate },
      "populateBookings: nothing to populate (no end date or already past)",
    );
    return 0;
  }

  // Only populate when the sub is actually live.
  if (firstRow.subStatus !== "active" && firstRow.subStatus !== "scheduled") {
    log.debug(
      { subId, status: firstRow.subStatus },
      "populateBookings: sub not active/scheduled; skipping",
    );
    return 0;
  }

  // Load holidays for the branch's country in range.
  const hols = await db
    .select({ date: schema.holidays.date })
    .from(schema.holidays)
    .where(
      and(
        eq(schema.holidays.country, firstRow.branchCountry),
        gte(schema.holidays.date, fromDate),
      ),
    );
  const holidayDates = new Set(hols.map((h) => h.date));

  // Expand each schedule into its dates and flatten. Each schedule may
  // have its own fromDate override (set by the admin picker when a slot
  // is full this week so the first booking is deferred N weeks).
  const toInsert: Array<{
    memberId: number;
    scheduleId: number;
    bookingDate: string;
  }> = [];
  for (const r of rows) {
    if (!r.scheduleActive) continue;
    const slotFromDate = opts.perScheduleFromDate?.[r.scheduleId] ?? fromDate;
    const dates = expandDates(slotFromDate, endDate, r.dayOfWeek, holidayDates);
    for (const d of dates) {
      toInsert.push({
        memberId: r.userId,
        scheduleId: r.scheduleId,
        bookingDate: d,
      });
    }
  }

  if (toInsert.length === 0) return 0;

  // Build INSERT IGNORE directly against the underlying mysql2 connection
  // to avoid building deeply-nested sql`` templates (stack overflow on
  // larger batches). 500 rows is well within MySQL placeholder limits.
  const client = (db as unknown as { session: { client: unknown } }).session
    .client;
  const rawConn = client as {
    query: (
      sql: string,
      values: unknown[],
    ) => Promise<[{ affectedRows: number }, unknown]>;
  };

  // ON DUPLICATE KEY UPDATE handles the case where a stale `cancelado` row
  // exists for the same (member_id, schedule_id, booking_date) tuple — the
  // unique index `idx_bookings_member_schedule_date` would otherwise block
  // re-population (silent INSERT IGNORE drop) and leave the member without
  // an active reservation. Common path: cancelFutureBookings() during a plan
  // change/renewal sets future rows to 'cancelado' (preserving history) and
  // the new sub re-uses the same scheduleIds.
  //
  // SET ordering matters: cancelled_at and waitlist_position read the OLD
  // booking_status value via IF(), so booking_status MUST be updated last.
  // Only `cancelado` rows are reactivated; `reservado`/`lista_espera` are
  // left untouched (idempotent).
  const BATCH = 500;
  let affected = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const slice = toInsert.slice(i, i + BATCH);
    const placeholders = slice.map(() => "(?, ?, ?, 'reservado')").join(", ");
    const params: Array<number | string> = [];
    for (const v of slice) {
      params.push(v.memberId, v.scheduleId, v.bookingDate);
    }
    const [result] = await rawConn.query(
      `INSERT INTO bookings (member_id, schedule_id, booking_date, booking_status) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         cancelled_at = IF(booking_status = 'cancelado', NULL, cancelled_at),
         waitlist_position = IF(booking_status = 'cancelado', NULL, waitlist_position),
         booking_status = IF(booking_status = 'cancelado', 'reservado', booking_status)`,
      params,
    );
    affected += result?.affectedRows ?? 0;
  }

  log.info(
    { subId, fromDate, endDate, affected, attempted: toInsert.length },
    "populateBookings complete",
  );
  return affected;
}

/**
 * Delete all non-cancelled bookings for the member owning `subId` whose
 * scheduleId belongs to this sub's schedules and whose bookingDate >=
 * fromDate. "Cancelled" bookings stay as historical record.
 *
 * Returns rows deleted.
 */
export async function clearFutureBookings(
  db: MySql2Database<typeof schema>,
  log: FastifyBaseLogger,
  subId: number,
  opts: { fromDate?: string; onlyScheduleIds?: number[] } = {},
): Promise<number> {
  const [sub] = await db
    .select({ userId: schema.subscriptions.userId })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, subId));
  if (!sub) return 0;

  const fromDate = opts.fromDate ?? today();

  // Which schedule_ids belong to this sub?
  let scheduleIds: number[];
  if (opts.onlyScheduleIds?.length) {
    scheduleIds = opts.onlyScheduleIds;
  } else {
    const rows = await db
      .select({ scheduleId: schema.subscriptionSchedules.scheduleId })
      .from(schema.subscriptionSchedules)
      .where(eq(schema.subscriptionSchedules.subscriptionId, subId));
    scheduleIds = rows.map((r) => r.scheduleId);
  }

  if (scheduleIds.length === 0) return 0;

  const result = await db
    .delete(schema.bookings)
    .where(
      and(
        eq(schema.bookings.memberId, sub.userId),
        inArray(schema.bookings.scheduleId, scheduleIds),
        gte(schema.bookings.bookingDate, fromDate),
        sql`${schema.bookings.status} <> 'cancelado'`,
      ),
    );

  const deleted =
    (result as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
  log.info(
    { subId, fromDate, deleted, scheduleIdsCount: scheduleIds.length },
    "clearFutureBookings complete",
  );
  return deleted;
}

/**
 * Count future non-cancelled bookings for a sub. Used by the admin UI
 * to warn before pause/cancel.
 */
export async function countFutureBookings(
  db: MySql2Database<typeof schema>,
  subId: number,
  fromDate?: string,
): Promise<number> {
  const [sub] = await db
    .select({ userId: schema.subscriptions.userId })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.id, subId));
  if (!sub) return 0;

  const scheduleRows = await db
    .select({ scheduleId: schema.subscriptionSchedules.scheduleId })
    .from(schema.subscriptionSchedules)
    .where(eq(schema.subscriptionSchedules.subscriptionId, subId));
  if (scheduleRows.length === 0) return 0;

  const cutoff = fromDate ?? today();

  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.memberId, sub.userId),
        inArray(
          schema.bookings.scheduleId,
          scheduleRows.map((r) => r.scheduleId),
        ),
        gte(schema.bookings.bookingDate, cutoff),
        sql`${schema.bookings.status} <> 'cancelado'`,
      ),
    );
  return Number(row?.n ?? 0);
}
