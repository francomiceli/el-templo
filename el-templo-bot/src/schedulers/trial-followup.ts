/**
 * Trial Follow-up Scheduler
 *
 * Sends WhatsApp follow-up messages 24-48h after a trial class attendance,
 * asking how the experience was and offering membership info.
 *
 * Schedule: Every 60 minutes, Argentina timezone, business hours only (10-20).
 *
 * Flow:
 * 1. Acquire Redis distributed lock (prevent duplicate work)
 * 2. Check business hours (10:00-20:00 Argentina time)
 * 3. Query trial attendees who checked in 24-48h ago
 * 4. Filter: not already followed up (Redis), not already converted to paid
 * 5. Send WhatsApp template message to each eligible attendee
 * 6. Mark as followed up (Redis key with 7d TTL)
 * 7. Release lock
 */

import cron from "node-cron";
import pino from "pino";
import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../../el-templo-api/src/db/schema/index.js";
import { acquireLock, releaseLock } from "./distributed-lock.js";
import { sendTemplateMessage } from "../whatsapp/client.js";
import { redis, isRedisAvailable } from "../redis.js";

const log = pino({ name: "scheduler:trial-followup" });

const LOCK_KEY = "wa:lock:trial-followup";
const LOCK_TTL_SECONDS = 120; // 2 minutes
const FOLLOWUP_REDIS_TTL_SECONDS = 604800; // 7 days

/** Row shape returned by the trial attendees query */
interface TrialAttendeeRow {
  user_id: number;
  first_name: string;
  phone: string;
  checked_in_at: string;
}

/**
 * Check if the current hour in Argentina timezone is within business hours.
 * Returns true if between 10:00 and 19:59 (inclusive).
 */
export function isBusinessHours(): boolean {
  const now = new Date();
  // Get current hour in Argentina timezone
  const argentinaHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(now),
    10,
  );

  return argentinaHour >= 10 && argentinaHour < 20;
}

/**
 * Core follow-up logic -- exported separately for testability.
 *
 * Acquires lock, checks business hours, queries eligible trial attendees,
 * sends template messages, tracks sent follow-ups in Redis, and releases lock.
 */
export async function runTrialFollowup(
  db: MySql2Database<typeof schema>,
): Promise<void> {
  // Check business hours before acquiring lock (no need to lock if outside hours)
  if (!isBusinessHours()) {
    log.info(
      "Outside business hours (10-20 Argentina), skipping trial follow-up",
    );
    return;
  }

  const lockAcquired = await acquireLock(LOCK_KEY, LOCK_TTL_SECONDS);
  if (!lockAcquired) {
    log.info("Could not acquire lock, skipping trial follow-up run");
    return;
  }

  let total = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    // Query eligible trial attendees:
    // - Have a trial subscription (pricePaid = 0 AND priceTypeApplied = 'zero')
    // - Checked in 24-48h ago
    // - Have a WhatsApp conversation with phone
    // - Do NOT have a paid subscription (pricePaid > 0) -- not yet converted
    const rows = await db.execute<TrialAttendeeRow>(sql`
      SELECT DISTINCT
        u.id AS user_id,
        u.first_name,
        wc.phone,
        att.checked_in_at
      FROM attendance att
      JOIN users u ON att.member_id = u.id
      JOIN subscriptions s ON s.user_id = u.id
      JOIN whatsapp_conversations wc ON wc.linked_member_id = u.id
      WHERE u.role = 'member'
        AND s.subscription_status = 'active'
        AND s.price_paid = 0
        AND s.price_type_applied = 'zero'
        AND att.checked_in_at BETWEEN DATE_SUB(NOW(), INTERVAL 48 HOUR)
                                    AND DATE_SUB(NOW(), INTERVAL 24 HOUR)
        AND wc.phone IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM subscriptions s2
          WHERE s2.user_id = u.id
            AND s2.price_paid > 0
            AND s2.subscription_status IN ('active', 'paused')
        )
    `);

    // db.execute returns [rows, fields] for mysql2
    const resultRows = Array.isArray(rows)
      ? (rows as unknown as TrialAttendeeRow[][])
      : [];
    const attendeeList: TrialAttendeeRow[] = Array.isArray(resultRows[0])
      ? resultRows[0]
      : (resultRows as unknown as TrialAttendeeRow[]);

    total = attendeeList.length;

    if (total === 0) {
      log.info("No eligible trial attendees to follow up");
      return;
    }

    for (const attendee of attendeeList) {
      const followupKey = `wa:followup:trial:${attendee.user_id}`;

      try {
        // Check if already followed up
        if (isRedisAvailable()) {
          const alreadyFollowedUp = await redis.get(followupKey);
          if (alreadyFollowedUp) {
            skipped++;
            continue;
          }
        }

        // Send template message
        await sendTemplateMessage(attendee.phone, "trial_followup", "es_AR", [
          {
            type: "body",
            parameters: [{ type: "text", text: attendee.first_name }],
          },
        ]);

        // Mark as followed up with 7 day TTL
        if (isRedisAvailable()) {
          await redis.set(followupKey, "1", "EX", FOLLOWUP_REDIS_TTL_SECONDS);
        }

        sent++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(
          { userId: attendee.user_id, phone: attendee.phone, err: message },
          "Failed to send trial follow-up",
        );
        failed++;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, "Trial follow-up run failed");
  } finally {
    await releaseLock(LOCK_KEY);
    log.info({ total, sent, skipped, failed }, "Trial follow-up run complete");
  }
}

/**
 * Start the trial follow-up scheduler.
 *
 * Runs every 60 minutes in Argentina timezone.
 */
export function startTrialFollowupScheduler(
  db: MySql2Database<typeof schema>,
): void {
  cron.schedule(
    "0 * * * *",
    () => {
      void runTrialFollowup(db);
    },
    {
      timezone: "America/Argentina/Buenos_Aires",
    },
  );

  log.info(
    "Trial follow-up scheduler started (every 60 min, Argentina timezone)",
  );
}
