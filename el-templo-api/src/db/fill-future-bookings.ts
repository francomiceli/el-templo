/**
 * Fill Future Bookings Script (Part A of turnos rollout).
 *
 * For every active/paused subscription that has subscription_schedules rows,
 * generates booking entries for each matching weekday between a start date
 * (default = today, exclusive) and the subscription's endDate, skipping
 * holidays. Uses INSERT IGNORE so re-runs are safe.
 *
 * Scope:
 *   - Only subscriptions with status IN ('active','paused')
 *   - endDate must be in the future (NULL endDate subs are skipped — they
 *     have no defined horizon)
 *   - Only fixed slots already written to subscription_schedules — this
 *     script does NOT infer schedules, only expands them into bookings
 *
 * Usage:
 *   pnpm tsx src/db/fill-future-bookings.ts [--execute] [--start-date YYYY-MM-DD] [--country AR]
 *
 * Default start-date is tomorrow; today is already covered by existing
 * reservations and shouldn't be retroactively populated.
 */

import fs from "node:fs";
import path from "node:path";
import { eq, and, inArray, sql, gte } from "drizzle-orm";
import { subscriptions } from "./schema/subscriptions.js";
import { subscriptionPlans } from "./schema/subscription-plans.js";
import { subscriptionSchedules } from "./schema/subscription-schedules.js";
import { schedules } from "./schema/schedules.js";
import { bookings } from "./schema/bookings.js";
import { holidays } from "./schema/holidays.js";
import { branches } from "./schema/branches.js";

interface SubSchedule {
  userId: number;
  subId: number;
  scheduleId: number;
  dayOfWeek: number;
  endDate: string | null;
  branchCountry: string;
}

interface FillReport {
  timestamp: string;
  mode: "dry-run" | "execute";
  startDate: string;
  totalSubSchedules: number;
  eligibleSubSchedules: number;
  projectedBookings: number;
  createdBookings: number;
  skippedHolidays: number;
  perSubSummary: Array<{
    subscriptionId: number;
    userId: number;
    dayOfWeek: number;
    scheduleId: number;
    bookingsProjected: number;
    holidaysSkipped: number;
  }>;
}

/** Add `days` calendar days to a YYYY-MM-DD string. */
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
 * Generate every date in [startDate, endDate] (inclusive) whose weekday
 * matches `targetWeekday` and which is not in `holidayDates`.
 */
export function expandDates(
  startDate: string,
  endDate: string,
  targetWeekday: number,
  holidayDates: Set<string>,
): { dates: string[]; holidaysSkipped: number } {
  const out: string[] = [];
  let holidaysSkipped = 0;
  if (startDate > endDate) return { dates: out, holidaysSkipped };

  // Advance cursor to the first matching weekday on or after startDate
  let cursor = startDate;
  const startWeekday = isoWeekday(cursor);
  const offset = (targetWeekday - startWeekday + 7) % 7;
  cursor = addDays(cursor, offset);

  while (cursor <= endDate) {
    if (holidayDates.has(cursor)) {
      holidaysSkipped++;
    } else {
      out.push(cursor);
    }
    cursor = addDays(cursor, 7);
  }
  return { dates: out, holidaysSkipped };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const executeMode = args.includes("--execute");
  const startDateIdx = args.indexOf("--start-date");
  const countryIdx = args.indexOf("--country");

  // Default startDate = tomorrow (today's slots already handled)
  const today = new Date().toISOString().slice(0, 10);
  const startDate =
    startDateIdx !== -1 && args[startDateIdx + 1]
      ? args[startDateIdx + 1]
      : addDays(today, 1);
  const country =
    countryIdx !== -1 && args[countryIdx + 1] ? args[countryIdx + 1] : "AR";

  if (executeMode && process.env.NODE_ENV === "production") {
    if (process.env.CONFIRM_IMPORT !== "yes") {
      throw new Error(
        "SAFETY: Set CONFIRM_IMPORT=yes to run --execute in production.",
      );
    }
  }

  const dotenv = await import("dotenv");
  const envFile =
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development";
  dotenv.config({ path: path.resolve(process.cwd(), envFile) });
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });

  const { createSingleConnection } = await import("./index.js");
  const { db, connection } = await createSingleConnection();

  try {
    console.log(`\nFill Future Bookings`);
    console.log(`Mode: ${executeMode ? "EXECUTE" : "DRY-RUN"}`);
    console.log(`Start date: ${startDate} (inclusive)`);
    console.log(`Country (holidays): ${country}\n`);

    // Load holidays ≥ startDate
    const hols = await db
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(eq(holidays.country, country), gte(holidays.date, startDate)));
    const holidayDates = new Set(hols.map((h) => h.date));
    console.log(`Holidays in range: ${holidayDates.size}`);

    // Pull every active/paused sub + its schedule rows
    const rows = await db
      .select({
        userId: subscriptions.userId,
        subId: subscriptions.id,
        scheduleId: subscriptionSchedules.scheduleId,
        dayOfWeek: schedules.dayOfWeek,
        endDate: subscriptions.endDate,
        branchCountry: branches.country,
      })
      .from(subscriptionSchedules)
      .innerJoin(
        subscriptions,
        eq(subscriptions.id, subscriptionSchedules.subscriptionId),
      )
      .innerJoin(
        subscriptionPlans,
        eq(subscriptionPlans.id, subscriptions.planId),
      )
      .innerJoin(schedules, eq(schedules.id, subscriptionSchedules.scheduleId))
      .innerJoin(branches, eq(branches.id, subscriptions.branchId))
      .where(
        and(
          inArray(subscriptions.status, ["active", "paused"]),
          eq(schedules.isActive, true),
        ),
      );

    console.log(`Total subscription_schedules rows: ${rows.length}`);

    // Filter: sub must have endDate (NULL means no horizon to fill toward)
    const eligible: SubSchedule[] = [];
    for (const r of rows) {
      if (!r.endDate) continue;
      if (r.endDate < startDate) continue;
      eligible.push({
        userId: r.userId,
        subId: r.subId,
        scheduleId: r.scheduleId,
        dayOfWeek: r.dayOfWeek,
        endDate: r.endDate,
        branchCountry: r.branchCountry,
      });
    }
    console.log(`Eligible (endDate in future): ${eligible.length}\n`);

    // Expand per row
    type BookingInsert = {
      memberId: number;
      scheduleId: number;
      bookingDate: string;
    };
    const toInsert: BookingInsert[] = [];
    const perSub: FillReport["perSubSummary"] = [];
    let totalHolidaysSkipped = 0;

    for (const e of eligible) {
      const { dates, holidaysSkipped } = expandDates(
        startDate,
        e.endDate!,
        e.dayOfWeek,
        holidayDates,
      );
      totalHolidaysSkipped += holidaysSkipped;
      for (const d of dates) {
        toInsert.push({
          memberId: e.userId,
          scheduleId: e.scheduleId,
          bookingDate: d,
        });
      }
      perSub.push({
        subscriptionId: e.subId,
        userId: e.userId,
        dayOfWeek: e.dayOfWeek,
        scheduleId: e.scheduleId,
        bookingsProjected: dates.length,
        holidaysSkipped,
      });
    }

    console.log(`Projected bookings: ${toInsert.length}`);
    console.log(`Holidays skipped:   ${totalHolidaysSkipped}`);

    let createdBookings = 0;
    if (executeMode) {
      console.log(`\n=== EXECUTING ===\n`);
      // Batch inserts — MySQL placeholder limit (~65k) / 3 cols = ~20k rows per stmt.
      const BATCH = 1000;
      // Use the underlying mysql2 connection directly — INSERT IGNORE with
      // many rows + placeholders is trivial there, and avoids Drizzle's
      // recursive sql-template construction that overflows the stack on
      // large batches.
      const rawConn = connection as unknown as {
        query: (
          sql: string,
          values: unknown[],
        ) => Promise<[{ affectedRows: number }, unknown]>;
      };
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const slice = toInsert.slice(i, i + BATCH);
        const placeholders = slice
          .map(() => "(?, ?, ?, 'reservado')")
          .join(", ");
        const params: Array<number | string> = [];
        for (const v of slice) {
          params.push(v.memberId, v.scheduleId, v.bookingDate);
        }
        const [result] = await rawConn.query(
          `INSERT IGNORE INTO bookings (member_id, schedule_id, booking_date, booking_status) VALUES ${placeholders}`,
          params,
        );
        const inserted = result?.affectedRows ?? 0;
        createdBookings += inserted;
        console.log(
          `  Batch ${i / BATCH + 1}: ${slice.length} attempted, ${inserted} inserted`,
        );
      }
      console.log(`\nTotal bookings created: ${createdBookings}`);
    }

    const report: FillReport = {
      timestamp: new Date().toISOString(),
      mode: executeMode ? "execute" : "dry-run",
      startDate,
      totalSubSchedules: rows.length,
      eligibleSubSchedules: eligible.length,
      projectedBookings: toInsert.length,
      createdBookings,
      skippedHolidays: totalHolidaysSkipped,
      perSubSummary: perSub,
    };

    const tmpDir = fs.existsSync("/tmp") ? "/tmp" : process.cwd();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportPath = path.join(tmpDir, `fill-future-bookings-${stamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${reportPath}`);

    console.log("=".repeat(50));
    console.log(executeMode ? "FILL COMPLETE" : "DRY-RUN COMPLETE");
    console.log("=".repeat(50));
  } finally {
    await connection.end();
  }
}

if (typeof require !== "undefined" && require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Fill failed:", msg);
      process.exit(1);
    });
}

export { main };
