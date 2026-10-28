// Módulo: conquer — parámetros en `tenant_settings` (Fase 201 D-14)
//
// Los parámetros que Nacho valida en la prueba viven en `tenant_settings`
// (clave `conquer.*`) con DEFAULT EN CÓDIGO cuando no hay fila. La lectura
// valida: un valor corrupto o fuera de rango cae al default (fail-safe). La
// escritura (`saveConquerSettings`, plan 201-14) valida el patch ENTERO contra
// los rangos antes de tocar la base (D-14).
//
//   conquer.combo_weeks_n         semanas seguidas para ofrecer Subir en un combo (2, 1-8)
//
// Fase 201 DA-5 (plan 201-25): las claves `conquer.start_offset.ternero|novillo`
// se BORRARON del código. El arranque de Novillo y Ternero son las tablas
// explícitas del anexo guardadas por ejercicio (`start_steps_novillo|ternero`).
// Las filas viejas de esas claves en `tenant_settings`, si existen, se ignoran.
import { and, like } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { tenantSettings } from "../../db/schema";
import { AppError } from "../shared/errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";

type DbInstance = MySql2Database<typeof schema>;

/** Prefijo de las claves en `tenant_settings`. No re-declarar este literal. */
export const CONQUER_SETTINGS_PREFIX = "conquer.";

export const CONQUER_SETTING_KEYS = {
  comboWeeksN: `${CONQUER_SETTINGS_PREFIX}combo_weeks_n`,
} as const;

export interface ConquerSettings {
  comboWeeksN: number;
}

/** Defaults en código (D-14: propuesta de Nacho §14.3). */
export const CONQUER_SETTING_DEFAULTS: Readonly<ConquerSettings> = {
  comboWeeksN: 2,
};

/** Rangos inclusivos de cada parámetro numérico. */
export const CONQUER_SETTING_RANGES = {
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

/** Parámetros numéricos editables desde el admin (D-14). */
export type ConquerSettingName = keyof typeof CONQUER_SETTING_RANGES;

export type ConquerSettingsPatch = Partial<Record<ConquerSettingName, number>>;

const SETTING_NAMES = Object.keys(
  CONQUER_SETTING_RANGES,
) as ConquerSettingName[];

function invalidSettingError(message: string): AppError {
  return new AppError(message, 400, "CONQUER_PARAMETRO_INVALIDO");
}

/**
 * Valida el patch COMPLETO sin tocar la base: o se escribe todo o nada. Devuelve
 * los pares (nombre, valor) presentes, ya validados.
 */
function validateSettingsPatch(
  patch: ConquerSettingsPatch,
): [ConquerSettingName, number][] {
  for (const key of Object.keys(patch)) {
    if (!(SETTING_NAMES as string[]).includes(key)) {
      throw invalidSettingError(`Parámetro desconocido: ${key}`);
    }
  }
  const entries: [ConquerSettingName, number][] = [];
  for (const name of SETTING_NAMES) {
    const value = patch[name];
    if (value === undefined) continue;
    const { min, max } = CONQUER_SETTING_RANGES[name];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw invalidSettingError(`${name} debe ser un número entero`);
    }
    if (value < min || value > max) {
      throw invalidSettingError(`${name} debe estar entre ${min} y ${max}`);
    }
    entries.push([name, value]);
  }
  if (entries.length === 0) {
    throw invalidSettingError("No hay ningún parámetro para guardar");
  }
  return entries;
}

/**
 * Escribe los parámetros presentes en `patch` para el gimnasio de `ctx` (D-14):
 * valida contra {@link CONQUER_SETTING_RANGES} y hace upsert por clave dentro de
 * una transacción. Los alumnos ya activos no se tocan: el parámetro se usa al
 * evaluar Subir de los combos.
 */
export async function saveConquerSettings(
  db: DbInstance,
  ctx: TenantContext,
  patch: ConquerSettingsPatch,
): Promise<void> {
  const entries = validateSettingsPatch(patch);
  await db.transaction(async (tx) => {
    for (const [name, value] of entries) {
      await tx
        .insert(tenantSettings)
        .values(
          tenantValues(ctx, {
            settingKey: CONQUER_SETTING_KEYS[name],
            settingValue: String(value),
          }),
        )
        .onDuplicateKeyUpdate({ set: { settingValue: String(value) } });
    }
  });
}
