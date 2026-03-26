/**
 * Class Reminder Scheduler
 *
 * Sends WhatsApp reminders N hours before a member's booked class.
 *
 * Schedule: Every 30 minutes, Argentina timezone.
 *
 * Flow:
 * 1. Acquire Redis distributed lock (prevent duplicate work)
 * 2. Query bookings table for today's classes starting within N hours
 * 3. Filter: only confirmed bookings with phone, not already reminded
 * 4. Send WhatsApp template message to each member
 * 5. Mark as reminded (Redis key with 24h TTL)
 * 6. Release lock
 */

import cron from "node-cron";
import pino from "pino";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../../el-templo-api/src/db/schema/index.js";
import { acquireLock, releaseLock } from "./distributed-lock.js";
import { sendTemplateMessage } from "../whatsapp/client.js";
import { redis, isRedisAvailable } from "../redis.js";

const log = pino({ name: "scheduler:class-reminder" });

const LOCK_KEY = "wa:lock:class-reminder";
const LOCK_TTL_SECONDS = 120; // 2 minutes
const REMINDER_REDIS_TTL_SECONDS = 86400; // 24 hours

/**
 * Hours before class start to send reminder.
 * Configurable via CLASS_REMINDER_HOURS env var, defaults to 2.
 */
function getReminderHours(): number {
  const envValue = process.env.CLASS_REMINDER_HOURS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 2;
}

/** Row shape returned by the upcoming bookings query */
interface UpcomingBookingRow {
  booking_id: number;
  first_name: string;
  start_time: string;
  activity_name: string;
  phone: string;
}

/**
 * Core reminder logic -- exported separately for testability.
 *
 * Acquires lock, queries upcoming bookings, sends template messages,
 * tracks sent reminders in Redis, and releases lock.
 */
export async function runClassReminder(
  db: MySql2Database<typeof schema>,
): Promise<void> {
  const lockAcquired = await acquireLock(LOCK_KEY, LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    log.info("Could not acquire lock, skipping class reminder run");
    return;
  }

  let total = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const reminderHours = getReminderHours();

    // Query bookings for today's classes starting within the next N hours
    // that have not yet started, with confirmed status and a WhatsApp phone
    const rows = await db.execute<UpcomingBookingRow>(sql`
      SELECT
        b.id AS booking_id,
        u.first_name,
        s.start_time,
        a.name AS activity_name,
        wc.phone
      FROM bookings b
      JOIN schedules s ON b.schedule_id = s.id
      JOIN users u ON b.member_id = u.id
      JOIN activities a ON s.activity_id = a.id
      JOIN whatsapp_conversations wc ON wc.linked_member_id = u.id
      WHERE b.booking_status = 'reservado'
        AND b.booking_date = CURDATE()
        AND s.start_time <= DATE_FORMAT(
          DATE_ADD(CONVERT_TZ(NOW(), 'UTC', 'America/Argentina/Buenos_Aires'), INTERVAL ${reminderHours} HOUR),
          '%H:%i'
        )
        AND s.start_time > DATE_FORMAT(
          CONVERT_TZ(NOW(), 'UTC', 'America/Argentina/Buenos_Aires'),
          '%H:%i'
        )
        AND wc.phone IS NOT NULL
    `);

    // db.execute returns [rows, fields] for mysql2
    const bookings = Array.isArray(rows)
      ? (rows as unknown as UpcomingBookingRow[][])
      : [];
    const bookingList: UpcomingBookingRow[] = Array.isArray(bookings[0])
      ? bookings[0]
      : (bookings as unknown as UpcomingBookingRow[]);

    total = bookingList.length;

    if (total === 0) {
      log.info("No upcoming bookings to remind");
      return;
    }

    for (const booking of bookingList) {
      const reminderKey = `wa:reminder:class:${booking.booking_id}`;

      try {
        // Check if already reminded
        if (isRedisAvailable()) {
          const alreadyReminded = await redis.get(reminderKey);
          if (alreadyReminded) {
            skipped++;
            continue;
          }
        }

        // Send template message
        await sendTemplateMessage(booking.phone, "class_reminder", "es_AR", [
          {
            type: "body",
            parameters: [
              { type: "text", text: booking.first_name },
              { type: "text", text: booking.activity_name },
              { type: "text", text: booking.start_time },
            ],
          },
        ]);

        // Mark as reminded with 24h TTL
        if (isRedisAvailable()) {
          await redis.set(reminderKey, "1", "EX", REMINDER_REDIS_TTL_SECONDS);
        }

        sent++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(
          { bookingId: booking.booking_id, phone: booking.phone, err: message },
          "Failed to send reminder for booking",
        );
        failed++;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, "Class reminder run failed");
  } finally {
    await releaseLock(LOCK_KEY);
    log.info({ total, sent, skipped, failed }, "Class reminder run complete");
  }
}

/**
 * Start the class reminder scheduler.
 *
 * Runs every 30 minutes in Argentina timezone.
 */
export function startClassReminderScheduler(
  db: MySql2Database<typeof schema>,
): void {
  cron.schedule(
    "*/30 * * * *",
    () => {
      void runClassReminder(db);
    },
    {
      timezone: "America/Argentina/Buenos_Aires",
    },
  );

  log.info(
    "Class reminder scheduler started (every 30 min, Argentina timezone)",
  );
}
