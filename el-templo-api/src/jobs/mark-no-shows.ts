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
import { SubscriptionService } from "../modules/subscriptions/service";
import { AuraService } from "../modules/aura";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../modules/finance";
import { EnrollmentService } from "../modules/programs/enrollment-service";

const log = pino({ name: "mark-no-shows" });

/**
 * Fase 161 (GATE-02): construye un `SubscriptionService` completo (mismo patrón
 * que `auto-resume-pauses.ts`) para poder rutear el decremento del no-show a la
 * sub correcta por actividad vía `pickSubscriptionForActivity`, en lugar de
 * elegir la primera sub activa con una query cruda (que cruzaría pase↔presencial).
 */
function buildSubscriptionService(
  db: MySql2Database<typeof schema>,
): SubscriptionService {
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
  return new SubscriptionService(
    db,
    log,
    auraService,
    transactionService,
    enrollmentService,
  );
}

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

  // Resolve `is_special` per booking (schedules → activities) so the decrement
  // below (Fase 161, GATE-02) routes to the right sub — pase for a special
  // activity, presencial/online for a regular one.
  const toMark = await db
    .select({
      id: bookings.id,
      memberId: bookings.memberId,
      isSpecial: schema.activities.isSpecial,
    })
    .from(bookings)
    .innerJoin(schema.schedules, eq(schema.schedules.id, bookings.scheduleId))
    .innerJoin(
      schema.activities,
      eq(schema.activities.id, schema.schedules.activityId),
    )
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

  // Group no-shows by (member, is-special) so each bucket decrements the right
  // subscription. A member with a regular AND a special no-show on the same
  // sweep gets both subs decremented independently.
  const memberCounts = new Map<
    string,
    { memberId: number; isSpecial: boolean; count: number }
  >();
  for (const b of toMark) {
    const isSpecial = !!b.isSpecial;
    const key = `${b.memberId}:${isSpecial ? 1 : 0}`;
    const entry = memberCounts.get(key) ?? {
      memberId: b.memberId,
      isSpecial,
      count: 0,
    };
    entry.count += 1;
    memberCounts.set(key, entry);
  }

  const subscriptionService = buildSubscriptionService(db);

  let decremented = 0;
  for (const { memberId, isSpecial, count } of memberCounts.values()) {
    const sub = await subscriptionService.pickSubscriptionForActivity(
      memberId,
      isSpecial,
    );

    if (!sub || sub.classesRemaining === null || sub.classesRemaining <= 0) {
      continue;
    }

    const deduct = Math.min(sub.classesRemaining, count);
    await db
      .update(schema.subscriptions)
      .set({
        classesRemaining: sql`${schema.subscriptions.classesRemaining} - ${deduct}`,
      })
      .where(
        and(
          eq(schema.subscriptions.id, sub.id),
          sql`${schema.subscriptions.classesRemaining} > 0`,
        ),
      );
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
