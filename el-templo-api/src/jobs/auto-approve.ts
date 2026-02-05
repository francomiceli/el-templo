/**
 * Auto-approve Cron Job
 *
 * Runs at 23:59 daily (Argentina timezone) to auto-approve pending sessions
 * for the next day. This ensures members always have sessions available even
 * if admins haven't reviewed them yet.
 *
 * Auto-approved sessions are marked with approvedBySystem=true to distinguish
 * them from manually reviewed sessions.
 */

import cron from 'node-cron';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import type * as schema from '../db/schema';
import { AdminSessionService } from '../modules/admin/service';

export function startAutoApproveJob(db: MySql2Database<typeof schema>) {
  const adminService = new AdminSessionService(db);

  // Run at 23:59 every day (just before midnight)
  // This auto-approves sessions for the next day if not reviewed
  cron.schedule('59 23 * * *', async () => {
    console.log('[auto-approve] Running auto-approve job...');
    try {
      const result = await adminService.autoApprovePendingSessions();
      if (result.approved > 0) {
        console.log(`[auto-approve] Auto-approved ${result.approved} sessions for tomorrow`);
      } else {
        console.log('[auto-approve] No pending sessions to auto-approve');
      }
    } catch (error) {
      console.error('[auto-approve] Error:', error);
    }
  }, {
    timezone: 'America/Argentina/Buenos_Aires', // Branch timezone
  });

  console.log('[auto-approve] Cron job scheduled for 23:59 daily (Argentina timezone)');
}
