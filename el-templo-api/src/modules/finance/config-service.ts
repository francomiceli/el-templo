// Module: finance — phase 142 (MIG-01 / D-04)
//
// FinanceConfigService is the tiny config "house" for the finance module. It
// reuses the existing `system_settings` key-value table (the 136-07 deletion
// removed the `src/modules/settings/` MODULE, not the table) — NO new
// `finance_settings` table. Today it holds a single knob: the pending-overdue
// threshold (`finance.pending_overdue_days`), the seam of 141 that 142 makes
// admin-configurable.
//
// The read path mirrors `streaks/service.ts::getStreakMilestoneConfig`'s
// `parseOrDefault` EXACTLY (absent row → default; NaN → default), falling back
// to OVERDUE_DAYS (the canonical constant) so a missing/garbage row never
// breaks the bandeja. The write path is a race-safe upsert on the unique
// `setting_key` (last-write-wins, no SELECT-then-write, no duplicate rows).

import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import { systemSettings } from "../../db/schema";
import { OVERDUE_DAYS } from "./constants";

type DbInstance = MySql2Database<typeof schema>;

/** Finance config keys stored in `system_settings` (D-04). */
export const FINANCE_SETTINGS_KEYS = {
  /** Días de antigüedad para marcar un pendiente como vencido (default 3). */
  PENDING_OVERDUE_DAYS: "finance.pending_overdue_days",
} as const;

export class FinanceConfigService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Read the pending-overdue threshold from `system_settings`, falling back to
   * OVERDUE_DAYS (3) when the row is absent OR the stored value is non-numeric.
   * Mirrors `getStreakMilestoneConfig`'s `parseOrDefault` (both guards).
   */
  async getOverdueThreshold(): Promise<number> {
    const [row] = await this.db
      .select({ value: systemSettings.settingValue })
      .from(systemSettings)
      .where(
        eq(
          systemSettings.settingKey,
          FINANCE_SETTINGS_KEYS.PENDING_OVERDUE_DAYS,
        ),
      )
      .limit(1);

    if (row === undefined) return OVERDUE_DAYS;
    const parsed = parseInt(row.value, 10);
    return isNaN(parsed) ? OVERDUE_DAYS : parsed;
  }

  /**
   * Upsert the pending-overdue threshold. Race-safe last-write-wins on the
   * unique `setting_key` via ON DUPLICATE KEY UPDATE — no SELECT-then-write.
   * Bounds validation (1..365) lives in the route schema/handler.
   */
  async setOverdueThreshold(days: number): Promise<void> {
    await this.db
      .insert(systemSettings)
      .values({
        settingKey: FINANCE_SETTINGS_KEYS.PENDING_OVERDUE_DAYS,
        settingValue: String(days),
      })
      .onDuplicateKeyUpdate({ set: { settingValue: String(days) } });
    this.log.info(
      { thresholdDays: days },
      "finance pending-overdue threshold updated",
    );
  }
}
