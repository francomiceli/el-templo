// Module: aura — valor del regalo del profe por gimnasio (fase 215, D-11)
//
// DÓNDE VIVE
// ----------
// En `tenant_settings` (regla v6.1 "todo parámetro por gimnasio", mismo modelo
// que `referrals/invitation-settings.ts` y `communications/sales-number.ts`), y
// NO en `system_settings`: esa tabla es global, así que cambiar el valor desde
// un gimnasio cambiaría el de todos los demás. Reemplaza la recomendación del
// research.
//
// VALIDACIÓN
// ----------
// Corre en escritura (`setCoachGiftAmount` lanza `BadRequestError` sin tocar la
// base) y en lectura (`getCoachGiftAmount` descarta un valor roto y devuelve el
// default: fail-closed, un dato corrupto nunca infla ni anula el regalo).
// La regla del rango (enteros de 1 a 10) vive en `gift-rules.ts`.
//
// AISLAMIENTO
// -----------
// Toda lectura y escritura lleva `tenantWhere` / `tenantValues` (T-194-23).

import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import { tenantSettings } from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { COACH_GIFT_AMOUNT, isValidCoachGiftAmount } from "./gift-rules";

type DbInstance = MySql2Database<typeof schema>;

/** Clave en `tenant_settings`. No re-declarar este literal en otro archivo. */
export const COACH_GIFT_SETTING_KEY = "aura.gift_coach_amount";

/** Solo dígitos: `"2.5"`, `"abc"`, `"-1"` o `""` no son un entero válido. */
const INTEGER_TEXT = /^[0-9]{1,4}$/;

/**
 * Valor vigente del regalo del profe en el gimnasio de `ctx`. Sin fila o con un
 * valor que no pasa la validación devuelve el default (`COACH_GIFT_AMOUNT`).
 */
export async function getCoachGiftAmount(
  db: DbInstance,
  ctx: TenantContext,
  log?: FastifyBaseLogger,
): Promise<number> {
  const [row] = await db
    .select({ settingValue: tenantSettings.settingValue })
    .from(tenantSettings)
    .where(
      and(
        tenantWhere(tenantSettings, ctx),
        eq(tenantSettings.settingKey, COACH_GIFT_SETTING_KEY),
      ),
    )
    .limit(1);

  if (!row) return COACH_GIFT_AMOUNT.default;

  const text = row.settingValue.trim();
  const parsed = INTEGER_TEXT.test(text) ? Number(text) : Number.NaN;
  if (!isValidCoachGiftAmount(parsed)) {
    log?.warn(
      { settingKey: COACH_GIFT_SETTING_KEY },
      "Valor del regalo del profe inválido en la base: se usa el default",
    );
    return COACH_GIFT_AMOUNT.default;
  }
  return parsed;
}

/**
 * Guarda (upsert por gimnasio y clave) el valor del regalo del profe. Lanza
 * `BadRequestError` sin escribir si no es un entero de 1 a 10. Devuelve el
 * valor guardado.
 */
export async function setCoachGiftAmount(
  db: DbInstance,
  ctx: TenantContext,
  amount: number,
): Promise<number> {
  if (!isValidCoachGiftAmount(amount)) {
    throw new BadRequestError("Tiene que ser un número entero entre 1 y 10.");
  }

  const value = String(amount);
  await db
    .insert(tenantSettings)
    .values(
      tenantValues(ctx, {
        settingKey: COACH_GIFT_SETTING_KEY,
        settingValue: value,
      }),
    )
    .onDuplicateKeyUpdate({ set: { settingValue: value } });

  return amount;
}
