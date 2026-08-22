// Module: aura — handler del event `streak.milestone` (Fase 176 Plan 07, MOD-02)
//
// POR QUÉ EXISTE ESTE ARCHIVO
// ----------------------------
// La recompensa AURA por racha vivía en el core (`streaks/service.ts`), que
// importaba `AuraService` directo — violación de la regla de dirección de
// imports del doc 04 §1 (`core → módulo` PROHIBIDO salvo vía hooks). Este
// archivo es el handler del event `streak.milestone` (doc 04 §4.3): el core
// solo anuncia que se alcanzó un milestone (`StreakService.updateStreak`,
// `emit("streak.milestone", ...)`); este módulo decide si y cuánto premiar.
//
// QUÉ SE MOVIÓ ACÁ DESDE `streaks/types.ts` Y POR QUÉ
// -------------------------------------------------------
// `STREAK_SETTINGS_KEYS`, `STREAK_DEFAULTS`, `StreakMilestoneConfig` y
// `MILESTONE_TO_CONFIG_KEY` — verificado (176-07) que sus ÚNICOS consumidores
// eran el bloque de recompensa de `streaks/service.ts`. `STREAK_MILESTONES`
// (qué números de racha SON milestone) se queda en el core: es el núcleo de
// racha, no la recompensa.
//
// SEMÁNTICA DE ERRORES
// ----------------------
// Este handler NO lleva `try/catch` propio. El aislamiento best-effort (un
// handler que explota no rompe el registro de la sesión) vive dentro de
// `HookRegistry.emit` (`shared/hooks.ts`, plan 176-06) — envolver acá
// duplicaría la semántica y podría enmascarar el error real del logueo de
// `emit`.
import { inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { systemSettings } from "../../db/schema";
import type { EventMap } from "../shared/hooks";
import { AuraService } from "./service";

type DbInstance = MySql2Database<typeof schema>;

export const STREAK_SETTINGS_KEYS = {
  MILESTONE_7_AURA: "streak.milestone_7_aura",
  MILESTONE_14_AURA: "streak.milestone_14_aura",
  MILESTONE_30_AURA: "streak.milestone_30_aura",
  MILESTONE_60_AURA: "streak.milestone_60_aura",
  MILESTONE_100_AURA: "streak.milestone_100_aura",
} as const;

export const STREAK_DEFAULTS = {
  MILESTONE_7_AURA: 20,
  MILESTONE_14_AURA: 35,
  MILESTONE_30_AURA: 50,
  MILESTONE_60_AURA: 100,
  MILESTONE_100_AURA: 200,
} as const;

export interface StreakMilestoneConfig {
  milestone7Aura: number;
  milestone14Aura: number;
  milestone30Aura: number;
  milestone60Aura: number;
  milestone100Aura: number;
}

/** Maps a milestone day count to its config key for AURA lookup */
export const MILESTONE_TO_CONFIG_KEY: Record<
  number,
  keyof StreakMilestoneConfig
> = {
  7: "milestone7Aura",
  14: "milestone14Aura",
  30: "milestone30Aura",
  60: "milestone60Aura",
  100: "milestone100Aura",
};

/**
 * Read streak milestone AURA configuration from system_settings.
 * Falls back to STREAK_DEFAULTS if settings are not configured.
 */
async function getStreakMilestoneConfig(
  db: DbInstance,
): Promise<StreakMilestoneConfig> {
  const keys = Object.values(STREAK_SETTINGS_KEYS);

  const rows = await db
    .select({
      settingKey: systemSettings.settingKey,
      settingValue: systemSettings.settingValue,
    })
    .from(systemSettings)
    .where(inArray(systemSettings.settingKey, [...keys]));

  const settingsMap = new Map(rows.map((r) => [r.settingKey, r.settingValue]));

  const parseOrDefault = (key: string, defaultVal: number): number => {
    const val = settingsMap.get(key);
    if (val === undefined) return defaultVal;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? defaultVal : parsed;
  };

  return {
    milestone7Aura: parseOrDefault(
      STREAK_SETTINGS_KEYS.MILESTONE_7_AURA,
      STREAK_DEFAULTS.MILESTONE_7_AURA,
    ),
    milestone14Aura: parseOrDefault(
      STREAK_SETTINGS_KEYS.MILESTONE_14_AURA,
      STREAK_DEFAULTS.MILESTONE_14_AURA,
    ),
    milestone30Aura: parseOrDefault(
      STREAK_SETTINGS_KEYS.MILESTONE_30_AURA,
      STREAK_DEFAULTS.MILESTONE_30_AURA,
    ),
    milestone60Aura: parseOrDefault(
      STREAK_SETTINGS_KEYS.MILESTONE_60_AURA,
      STREAK_DEFAULTS.MILESTONE_60_AURA,
    ),
    milestone100Aura: parseOrDefault(
      STREAK_SETTINGS_KEYS.MILESTONE_100_AURA,
      STREAK_DEFAULTS.MILESTONE_100_AURA,
    ),
  };
}

/**
 * Handler del event `streak.milestone`. Otorga la recompensa AURA
 * configurada para el milestone alcanzado, si es > 0.
 * `sourceType`/`referenceType`/`description` son idénticos byte a byte al
 * código previo en `streaks/service.ts` — tests y datos de prod dependen de
 * estos literales.
 */
export const streakMilestoneRewardHandler: EventMap["streak.milestone"] =
  async (evt, hook) => {
    const config = await getStreakMilestoneConfig(hook.db);
    const configKey = MILESTONE_TO_CONFIG_KEY[evt.milestone];
    const bonusAmount = configKey ? config[configKey] : 0;

    if (bonusAmount > 0) {
      await new AuraService(hook.db).award({
        userId: evt.userId,
        sourceType: "streak_bonus",
        referenceType: "streak_milestone",
        referenceId: evt.milestone,
        amount: bonusAmount,
        description: `Racha de ${evt.milestone} dias`,
      });
      hook.log.info(
        { userId: evt.userId, milestone: evt.milestone, bonusAmount },
        "Streak milestone AURA bonus awarded",
      );
    }
  };
