// Module: settings — service
//
// Read/upsert of the pricing card-surcharge rule in the existing system_settings
// key-value store (NO new table). Phase 154 (ALUM-03 / D-03): default OFF (no
// surcharge) when the key is absent; the El Templo installation is flipped ON by
// the idempotent seed migration 0166. This is the single server-side point of
// truth consumed by the routes here and (plan 02) by the price gate.

import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import { systemSettings } from "../../db/schema";
import { PRICING_SETTINGS_KEYS } from "./keys";

type DbInstance = MySql2Database<typeof schema>;

/** Serialized on/off values persisted in system_settings.setting_value. */
const ON = "on";
const OFF = "off";

export class SettingsService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Whether the credit-card surcharge rule is enabled. Reads the single
   * `pricing.card_surcharge_enabled` row and returns `settingValue === 'on'`.
   * Falls back to `false` (default OFF, D-03) when the key does not exist.
   */
  async getCardSurchargeEnabled(): Promise<boolean> {
    const [row] = await this.db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, PRICING_SETTINGS_KEYS.cardSurcharge))
      .limit(1);

    return row?.settingValue === ON;
  }

  /**
   * Upsert the card-surcharge rule. Inserts the row on first write and updates
   * `setting_value` on subsequent writes (setting_key is UNIQUE) — no duplicate
   * rows. Serializes as `'on'` / `'off'`.
   */
  async setCardSurchargeEnabled(enabled: boolean): Promise<void> {
    const value = enabled ? ON : OFF;
    await this.db
      .insert(systemSettings)
      .values({
        settingKey: PRICING_SETTINGS_KEYS.cardSurcharge,
        settingValue: value,
      })
      .onDuplicateKeyUpdate({ set: { settingValue: value } });

    this.log.info(
      { settingKey: PRICING_SETTINGS_KEYS.cardSurcharge, value },
      "card-surcharge rule updated",
    );
  }
}
