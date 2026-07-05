// Module: settings — service
//
// Read/upsert of the pricing rules in the existing system_settings key-value
// store (NO new table). Phase 154 (ALUM-03 / D-03): the card-surcharge rule
// defaults OFF (no surcharge) when its key is absent; the El Templo installation
// is flipped ON by the idempotent seed migration 0166. Phase 156 (PLAN-02 /
// D-03): the "Zero" price rule follows the SAME pattern — default OFF (white-
// label without Zero), El Templo seeded ON by migration 0168. Both pairs are
// expressed via the private getFlag/setFlag helpers (DRY: identical logic, only
// the key differs). This is the single server-side point of truth consumed by
// the routes here and by the price gate (subscriptions resolvePriceType).

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
   * Read a boolean pricing flag from system_settings. Returns
   * `settingValue === 'on'`, falling back to `false` (default OFF) when the key
   * does not exist. Single reader used by all pricing rules.
   */
  private async getFlag(key: string): Promise<boolean> {
    const [row] = await this.db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, key))
      .limit(1);

    return row?.settingValue === ON;
  }

  /**
   * Upsert a boolean pricing flag. Inserts the row on first write and updates
   * `setting_value` on subsequent writes (setting_key is UNIQUE) — no duplicate
   * rows. Serializes as `'on'` / `'off'`.
   */
  private async setFlag(key: string, enabled: boolean): Promise<void> {
    const value = enabled ? ON : OFF;
    await this.db
      .insert(systemSettings)
      .values({ settingKey: key, settingValue: value })
      .onDuplicateKeyUpdate({ set: { settingValue: value } });

    this.log.info({ settingKey: key, value }, "pricing rule updated");
  }

  /**
   * Whether the credit-card surcharge rule is enabled. Reads the single
   * `pricing.card_surcharge_enabled` row. Default OFF (D-03) when absent.
   */
  async getCardSurchargeEnabled(): Promise<boolean> {
    return this.getFlag(PRICING_SETTINGS_KEYS.cardSurcharge);
  }

  /** Upsert the card-surcharge rule. */
  async setCardSurchargeEnabled(enabled: boolean): Promise<void> {
    await this.setFlag(PRICING_SETTINGS_KEYS.cardSurcharge, enabled);
  }

  /**
   * Whether the "Zero" price rule is enabled. Reads the single
   * `pricing.zero_price_enabled` row. Default OFF (156 PLAN-02 / D-03) when
   * absent — a white-label install offers no Zero price; the El Templo
   * installation is seeded ON by migration 0168.
   */
  async getZeroPriceEnabled(): Promise<boolean> {
    return this.getFlag(PRICING_SETTINGS_KEYS.zeroPrice);
  }

  /** Upsert the "Zero" price rule. */
  async setZeroPriceEnabled(enabled: boolean): Promise<void> {
    await this.setFlag(PRICING_SETTINGS_KEYS.zeroPrice, enabled);
  }
}
