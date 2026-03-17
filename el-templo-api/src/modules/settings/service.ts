/**
 * Settings Service
 *
 * Business logic for system-wide settings stored in the system_settings table.
 * Currently supports grace period configuration; extensible for future settings.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";

const GRACE_PERIOD_KEY = "grace_period_days";
const GRACE_PERIOD_MIN = 0;
const GRACE_PERIOD_MAX = 30;
const GRACE_PERIOD_DEFAULT = 5;

export class SettingsService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Get the current grace period in days.
   * Returns the default (5) if the setting doesn't exist.
   */
  async getGracePeriodDays(): Promise<number> {
    const [row] = await this.db
      .select({ settingValue: schema.systemSettings.settingValue })
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.settingKey, GRACE_PERIOD_KEY));

    if (!row) {
      return GRACE_PERIOD_DEFAULT;
    }

    const parsed = parseInt(row.settingValue, 10);
    return isNaN(parsed) ? GRACE_PERIOD_DEFAULT : parsed;
  }

  /**
   * Update the grace period setting.
   * Validates that days is between 0 and 30 inclusive.
   */
  async setGracePeriodDays(days: number): Promise<number> {
    if (days < GRACE_PERIOD_MIN || days > GRACE_PERIOD_MAX) {
      throw new BadRequestError(
        `El periodo de gracia debe ser entre ${GRACE_PERIOD_MIN} y ${GRACE_PERIOD_MAX} dias`,
      );
    }

    const value = String(days);

    // Upsert: update if exists, insert if not
    const [existing] = await this.db
      .select({ id: schema.systemSettings.id })
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.settingKey, GRACE_PERIOD_KEY));

    if (existing) {
      await this.db
        .update(schema.systemSettings)
        .set({ settingValue: value })
        .where(eq(schema.systemSettings.settingKey, GRACE_PERIOD_KEY));
    } else {
      await this.db.insert(schema.systemSettings).values({
        settingKey: GRACE_PERIOD_KEY,
        settingValue: value,
      });
    }

    this.log.info(
      { setting: GRACE_PERIOD_KEY, value: days },
      "Grace period updated",
    );

    return days;
  }
}
