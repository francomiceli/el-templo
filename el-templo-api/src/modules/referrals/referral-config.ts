// Módulo: referrals — configuración global del programa (% por vínculo + tope %)
//
// Función pura `(db) => ReferralConfig`, SIN dependencias hacia `referrals/service`
// ni `subscriptions/service`: es la hoja que rompe el ciclo de importaciones que
// atravesaba el árbitro de descuentos (ME-02). `ReferralService.getReferralConfig`
// delega acá y `invitation-settings` la usa directo para exponer los dos números
// de solo lectura.
import { eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { auraConfig, systemSettings } from "../../db/schema";
import type { ReferralConfig } from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** % por vínculo cuando la fila aura_config['referral'] falta (D-12). */
const DEFAULT_PERCENT_PER_LINK = 10;
/** Tope cuando system_settings['referral.max_percent_cap'] falta (D-12). */
const DEFAULT_MAX_PERCENT_CAP = 40;
/** Clave del tope en system_settings (precedente finance.pending_overdue_days). */
const MAX_PERCENT_CAP_KEY = "referral.max_percent_cap";

/**
 * % por vínculo desde aura_config['referral'].default_amount (fallback 10) y
 * tope desde system_settings['referral.max_percent_cap'] (fallback 40). Ambos
 * ajustables sin deploy.
 */
export async function getReferralConfig(
  db: DbInstance,
): Promise<ReferralConfig> {
  /* tenant-safe: aura_config.sourceType es UNIQUE a nivel de columna (src/db/schema/aura-config.ts) — una sola fila 'referral' existe en TODA la tabla, config global del sistema Aura, no per-gimnasio pese a tener tenant_id; no expone datos de miembro */
  const [cfg] = await db
    .select({ amount: auraConfig.defaultAmount })
    .from(auraConfig)
    .where(
      sql`/* tenant-safe: aura_config.sourceType es UNIQUE a nivel de columna — una sola fila 'referral' existe en TODA la tabla, config global del sistema Aura, no per-gimnasio pese a tener tenant_id; no expone datos de miembro */ ${eq(auraConfig.sourceType, "referral")}`,
    )
    .limit(1);

  const [cap] = await db
    .select({ value: systemSettings.settingValue })
    .from(systemSettings)
    .where(eq(systemSettings.settingKey, MAX_PERCENT_CAP_KEY))
    .limit(1);

  const parsedCap = cap ? Number.parseInt(cap.value, 10) : Number.NaN;

  return {
    percentPerLink: cfg?.amount ?? DEFAULT_PERCENT_PER_LINK,
    maxPercentCap: Number.isFinite(parsedCap)
      ? parsedCap
      : DEFAULT_MAX_PERCENT_CAP,
  };
}
