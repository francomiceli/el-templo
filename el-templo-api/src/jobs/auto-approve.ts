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
import pino from 'pino';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import type * as schema from '../db/schema';
import { AdminSessionService } from '../modules/admin/service';

const log = pino({ name: 'auto-approve' });

export function startAutoApproveJob(db: MySql2Database<typeof schema>) {
  const adminService = new AdminSessionService(db);

  // Run at 23:59 every day (just before midnight)
  // This auto-approves sessions for the next day if not reviewed
  cron.schedule('59 23 * * *', async () => {
    log.info('Running auto-approve job');
    try {
      const result = await adminService.autoApprovePendingSessions();
      if (result.approved > 0) {
        log.info({ approved: result.approved }, 'Auto-approved sessions for tomorrow');
      } else {
        log.info('No pending sessions to auto-approve');
      }
    } catch (error) {
      log.error({ err: error }, 'Auto-approve job failed');
    }
  }, {
    timezone: 'America/Argentina/Buenos_Aires', // Branch timezone
  });

  log.info('Cron job scheduled for 23:59 daily (Argentina timezone)');
}
