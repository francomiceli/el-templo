/**
 * Settings Service
 *
 * Business logic for system-wide settings stored in the system_settings table.
 * Extensible for future settings. Grace period removed in Phase 61.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";

export class SettingsService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}
}
