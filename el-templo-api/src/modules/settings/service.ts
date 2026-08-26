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
import { BadRequestError } from "../shared/errors";
import {
  PRICING_SETTINGS_KEYS,
  LEADS_SETTINGS_KEYS,
  APP_STORE_SETTINGS_KEYS,
} from "./keys";

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

  /**
   * Phase 163 (AUTO-02 / D-05, D-06): read the "En seguimiento → Perdido"
   * window in days from the single `leads.perdido_window_days` row. Coerces the
   * stored value to an integer and falls back to 14 when the key is absent or
   * the value is non-numeric / non-positive. No persistent cache (D-05): the
   * daily cron reads it each run so an operator PUT takes effect next corrida.
   */
  async getPerdidoWindowDays(): Promise<number> {
    const [row] = await this.db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(
        eq(systemSettings.settingKey, LEADS_SETTINGS_KEYS.perdidoWindowDays),
      )
      .limit(1);

    const n = Number(row?.settingValue);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 14;
  }

  /**
   * Read a raw string value from system_settings. Same shape as `getFlag` but
   * without the `on`/`off` serialization — used for free-form values like the
   * store URLs (phase 179-12, D-20). Returns `null` when the key is absent:
   * silently deriving a value (e.g. the Play Store URL from the known
   * `com.eltemplo.app` appId) would hide the fact that nobody configured it.
   */
  private async getStringValue(key: string): Promise<string | null> {
    const [row] = await this.db
      .select({ settingValue: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, key))
      .limit(1);

    return row?.settingValue ?? null;
  }

  /** Upsert a raw string value. Same insert/onDuplicateKeyUpdate shape as `setFlag`. */
  private async setStringValue(key: string, value: string): Promise<void> {
    await this.db
      .insert(systemSettings)
      .values({ settingKey: key, settingValue: value })
      .onDuplicateKeyUpdate({ set: { settingValue: value } });

    this.log.info({ settingKey: key }, "store url setting updated");
  }

  /**
   * Phase 179-12 (D-01/D-04/D-20): las dos URLs de tienda que codifican los
   * QRs de la tarjeta física de partners. `null` cuando la fila falta —
   * ninguna se deriva en silencio.
   */
  async getStoreUrls(): Promise<{
    android: string | null;
    ios: string | null;
  }> {
    const [android, ios] = await Promise.all([
      this.getStringValue(APP_STORE_SETTINGS_KEYS.android),
      this.getStringValue(APP_STORE_SETTINGS_KEYS.ios),
    ]);
    return { android, ios };
  }

  /**
   * Upsert de una o ambas URLs de tienda. Valida `https://` (T-179-49: una URL
   * mal cargada se convierte en cientos de tarjetas inútiles) — el resto del
   * contenido no se valida más allá de eso, la verificación humana del
   * escaneo real es el checkpoint 179-17.
   */
  async setStoreUrls(input: { android?: string; ios?: string }): Promise<void> {
    if (input.android !== undefined && !input.android.startsWith("https://")) {
      throw new BadRequestError(
        "La URL de Play Store debe empezar con https://",
      );
    }
    if (input.ios !== undefined && !input.ios.startsWith("https://")) {
      throw new BadRequestError(
        "La URL de App Store debe empezar con https://",
      );
    }

    if (input.android !== undefined) {
      await this.setStringValue(APP_STORE_SETTINGS_KEYS.android, input.android);
    }
    if (input.ios !== undefined) {
      await this.setStringValue(APP_STORE_SETTINGS_KEYS.ios, input.ios);
    }
  }
}
