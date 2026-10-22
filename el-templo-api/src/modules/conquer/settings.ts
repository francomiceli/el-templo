// Módulo: conquer — parámetros en `tenant_settings` (Fase 201 D-14)
//
// Los parámetros que Nacho valida en la prueba viven en `tenant_settings`
// (clave `conquer.*`) con DEFAULT EN CÓDIGO cuando no hay fila. La lectura
// valida: un valor corrupto o fuera de rango cae al default (fail-safe). La
// escritura (`saveConquerSettings`) la agrega el plan 201-14.
//
//   conquer.start_offset.ternero  peldaños más fáciles que Toro al arrancar (2, 0-4)
//   conquer.start_offset.novillo  idem para Novillo (1, 0-4)
//   conquer.combo_weeks_n         semanas seguidas para ofrecer Subir en un combo (2, 1-8)
import { and, like } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { tenantSettings } from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";

type DbInstance = MySql2Database<typeof schema>;

/** Prefijo de las claves en `tenant_settings`. No re-declarar este literal. */
export const CONQUER_SETTINGS_PREFIX = "conquer.";

export const CONQUER_SETTING_KEYS = {
  startOffsetTernero: `${CONQUER_SETTINGS_PREFIX}start_offset.ternero`,
  startOffsetNovillo: `${CONQUER_SETTINGS_PREFIX}start_offset.novillo`,
  comboWeeksN: `${CONQUER_SETTINGS_PREFIX}combo_weeks_n`,
} as const;

export interface ConquerSettings {
  startOffset: { ternero: number; novillo: number; toro: 0 };
  comboWeeksN: number;
}

/** Defaults en código (D-14: propuestas de Nacho §8.2 y §14.3). */
export const CONQUER_SETTING_DEFAULTS: Readonly<ConquerSettings> = {
  startOffset: { ternero: 2, novillo: 1, toro: 0 },
  comboWeeksN: 2,
};

/** Rangos inclusivos de cada parámetro numérico. */
export const CONQUER_SETTING_RANGES = {
  startOffsetTernero: { min: 0, max: 4 },
  startOffsetNovillo: { min: 0, max: 4 },
  comboWeeksN: { min: 1, max: 8 },
} as const;

const INT_PATTERN = /^[0-9]{1,3}$/;

/** Entero limpio dentro del rango, o el default. */
function readInt(
  raw: string | undefined,
  range: { min: number; max: number },
  def: number,
): number {
  if (raw === undefined || !INT_PATTERN.test(raw.trim())) return def;
  const value = Number.parseInt(raw.trim(), 10);
  return value >= range.min && value <= range.max ? value : def;
}

/**
 * Parseo puro de las filas `conquer.*` (sin DB). Valor inválido, fuera de
 * rango o ausente = default.
 */
export function parseConquerSettings(
  rows: { settingKey: string; settingValue: string }[],
): ConquerSettings {
  const byKey = new Map(rows.map((r) => [r.settingKey, r.settingValue]));
  const defaults = CONQUER_SETTING_DEFAULTS;
  return {
    startOffset: {
      ternero: readInt(
        byKey.get(CONQUER_SETTING_KEYS.startOffsetTernero),
        CONQUER_SETTING_RANGES.startOffsetTernero,
        defaults.startOffset.ternero,
      ),
      novillo: readInt(
        byKey.get(CONQUER_SETTING_KEYS.startOffsetNovillo),
        CONQUER_SETTING_RANGES.startOffsetNovillo,
        defaults.startOffset.novillo,
      ),
      toro: 0,
    },
    comboWeeksN: readInt(
      byKey.get(CONQUER_SETTING_KEYS.comboWeeksN),
      CONQUER_SETTING_RANGES.comboWeeksN,
      defaults.comboWeeksN,
    ),
  };
}

/** Lee los parámetros del gimnasio de `ctx`: una sola query por prefijo. */
export async function getConquerSettings(
  db: DbInstance,
  ctx: TenantContext,
): Promise<ConquerSettings> {
  const rows = await db
    .select({
      settingKey: tenantSettings.settingKey,
      settingValue: tenantSettings.settingValue,
    })
    .from(tenantSettings)
    .where(
      and(
        tenantWhere(tenantSettings, ctx),
        like(tenantSettings.settingKey, `${CONQUER_SETTINGS_PREFIX}%`),
      ),
    );
  return parseConquerSettings(rows);
}
