/**
 * Client State Machine
 *
 * Determines a WhatsApp contact's lifecycle state by looking up
 * their phone number in the users + subscriptions + attendance tables.
 *
 * States:
 * - LEAD: Unknown phone, no matching user.
 * - TRIAL: User exists but only has a trial subscription (no active plan).
 * - ACTIVE_MEMBER: User with an active subscription and recent attendance.
 * - INACTIVE_MEMBER: User with an active subscription but no attendance in 30+ days.
 * - EXPIRED_MEMBER: User whose subscription has expired or been cancelled.
 *
 * Uses raw SQL via `sql` template literals to avoid cross-package type conflicts.
 */

import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import pino from "pino";
import type * as schema from "../../../el-templo-api/src/db/schema/index.js";

const log = pino({ name: "el-templo-bot:state-machine" });

type DB = MySql2Database<typeof schema>;

export type ClientState =
  | "lead"
  | "trial"
  | "active_member"
  | "inactive_member"
  | "expired_member";

interface UserRow {
  id: number;
  first_name: string | null;
  is_active: number; // MySQL boolean
}

interface SubscriptionRow {
  subscription_status: string;
  end_date: string | null;
  is_trial: number; // MySQL boolean from joined plan
}

interface AttendanceCountRow {
  cnt: number;
}

/**
 * Determine the client state for a WhatsApp contact by phone number.
 *
 * Returns the detected state and optionally the matched user ID.
 */
export async function determineClientState(
  phone: string,
  db: DB,
): Promise<{ state: ClientState; userId: number | null }> {
  try {
    // 1. Look up user by phone
    const userResult = await db.execute(
      sql`SELECT u.id, u.first_name, u.is_active
          FROM users u
          WHERE u.phone = ${phone}
          LIMIT 1`,
    );
    const userRows = userResult[0] as unknown as UserRow[];

    if (userRows.length === 0) {
      return { state: "lead", userId: null };
    }

    const user = userRows[0];
    const userId = user.id;

    // 2. Look up subscriptions (most recent first) with plan info for is_trial
    const subResult = await db.execute(
      sql`SELECT s.subscription_status, s.end_date, sp.is_trial
          FROM subscriptions s
          JOIN subscription_plans sp ON s.plan_id = sp.id
          WHERE s.user_id = ${userId}
          ORDER BY s.created_at DESC`,
    );
    const subRows = subResult[0] as unknown as SubscriptionRow[];

    if (subRows.length === 0) {
      return { state: "lead", userId };
    }

    // 3. Check for active subscription
    const activeSub = subRows.find((s) => s.subscription_status === "active");

    if (activeSub) {
      // Check if end_date is in the past
      if (activeSub.end_date && new Date(activeSub.end_date) < new Date()) {
        return { state: "expired_member", userId };
      }

      // Active subscription with valid date -- check attendance for inactive detection
      const attendResult = await db.execute(
        sql`SELECT COUNT(*) AS cnt
            FROM attendance
            WHERE member_id = ${userId}
              AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      );
      const attendRows = attendResult[0] as unknown as AttendanceCountRow[];
      const recentAttendance = attendRows[0]?.cnt ?? 0;

      if (recentAttendance === 0) {
        return { state: "inactive_member", userId };
      }

      return { state: "active_member", userId };
    }

    // 4. Check for paused subscription (treat similarly to active for state purposes)
    const pausedSub = subRows.find((s) => s.subscription_status === "paused");

    if (pausedSub) {
      return { state: "inactive_member", userId };
    }

    // 5. Check if only trial subscriptions exist
    const allTrial = subRows.every((s) => s.is_trial === 1);
    if (allTrial) {
      return { state: "trial", userId };
    }

    // 6. Has non-trial subscriptions but none active/paused -> expired
    return { state: "expired_member", userId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, phone }, "Failed to determine client state");
    // Default to lead on error -- safest assumption
    return { state: "lead", userId: null };
  }
}

/**
 * Update the client_state column on a whatsapp_conversations row.
 */
export async function updateConversationState(
  conversationId: number,
  state: ClientState,
  db: DB,
): Promise<void> {
  try {
    await db.execute(
      sql`UPDATE whatsapp_conversations
          SET client_state = ${state}, updated_at = NOW()
          WHERE id = ${conversationId}`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      { err: message, conversationId, state },
      "Failed to update conversation state",
    );
  }
}
