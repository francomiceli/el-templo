/**
 * Settings Service
 *
 * Business logic for system-wide settings stored in the system_settings table.
 * Extensible for future settings. Grace period removed in Phase 61.
 * Segment thresholds added in Phase 79.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, inArray } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import type { SegmentThresholds } from "../segmentation/types";
import { SEGMENT_SETTINGS_KEYS, SEGMENT_DEFAULTS } from "../segmentation/types";

export class SettingsService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Get all segment thresholds from system_settings.
   * Falls back to defaults for any missing key.
   */
  async getSegmentThresholds(): Promise<SegmentThresholds> {
    const keys = Object.values(SEGMENT_SETTINGS_KEYS);

    const rows = await this.db
      .select({
        key: schema.systemSettings.settingKey,
        value: schema.systemSettings.settingValue,
      })
      .from(schema.systemSettings)
      .where(inArray(schema.systemSettings.settingKey, [...keys]));

    const settingsMap = new Map<string, string>();
    for (const row of rows) {
      settingsMap.set(row.key, row.value);
    }

    const parseOrDefault = (key: string, defaultVal: number): number => {
      const raw = settingsMap.get(key);
      if (raw === undefined) return defaultVal;
      const parsed = parseInt(raw, 10);
      return Number.isNaN(parsed) ? defaultVal : parsed;
    };

    return {
      espartanoPct: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.ESPARTANO_PCT,
        SEGMENT_DEFAULTS.ESPARTANO_PCT,
      ),
      intermitentePct: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.INTERMITENTE_PCT,
        SEGMENT_DEFAULTS.INTERMITENTE_PCT,
      ),
      enRiesgoWeeks: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.EN_RIESGO_WEEKS,
        SEGMENT_DEFAULTS.EN_RIESGO_WEEKS,
      ),
      ghostWeeks: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.GHOST_WEEKS,
        SEGMENT_DEFAULTS.GHOST_WEEKS,
      ),
      nuevoDays: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.NUEVO_DAYS,
        SEGMENT_DEFAULTS.NUEVO_DAYS,
      ),
      windowDays: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.WINDOW_DAYS,
        SEGMENT_DEFAULTS.WINDOW_DAYS,
      ),
      frequencyZeroVisitWindowDays: parseOrDefault(
        SEGMENT_SETTINGS_KEYS.FREQUENCY_ZERO_VISIT_WINDOW_DAYS,
        SEGMENT_DEFAULTS.FREQUENCY_ZERO_VISIT_WINDOW_DAYS,
      ),
    };
  }

  /**
   * Update segment thresholds. Only updates provided keys.
   * Uses INSERT ... ON DUPLICATE KEY UPDATE pattern for upsert.
   */
  async updateSegmentThresholds(
    thresholds: Partial<SegmentThresholds>,
  ): Promise<void> {
    const keyMap: Record<string, string> = {
      espartanoPct: SEGMENT_SETTINGS_KEYS.ESPARTANO_PCT,
      intermitentePct: SEGMENT_SETTINGS_KEYS.INTERMITENTE_PCT,
      enRiesgoWeeks: SEGMENT_SETTINGS_KEYS.EN_RIESGO_WEEKS,
      ghostWeeks: SEGMENT_SETTINGS_KEYS.GHOST_WEEKS,
      nuevoDays: SEGMENT_SETTINGS_KEYS.NUEVO_DAYS,
      windowDays: SEGMENT_SETTINGS_KEYS.WINDOW_DAYS,
      frequencyZeroVisitWindowDays:
        SEGMENT_SETTINGS_KEYS.FREQUENCY_ZERO_VISIT_WINDOW_DAYS,
    };

    for (const [prop, settingKey] of Object.entries(keyMap)) {
      const value = thresholds[prop as keyof SegmentThresholds];
      if (value === undefined) continue;

      // Check if key exists
      const [existing] = await this.db
        .select({ id: schema.systemSettings.id })
        .from(schema.systemSettings)
        .where(eq(schema.systemSettings.settingKey, settingKey))
        .limit(1);

      if (existing) {
        await this.db
          .update(schema.systemSettings)
          .set({ settingValue: String(value) })
          .where(eq(schema.systemSettings.settingKey, settingKey));
      } else {
        await this.db.insert(schema.systemSettings).values({
          settingKey,
          settingValue: String(value),
        });
      }
    }

    this.log.info({ thresholds }, "Segment thresholds updated");
  }
}
