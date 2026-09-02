// Módulo: communications — número de WhatsApp de ventas por país (Fase 193,
// D-20/D-21)
//
// QUÉ ES
// ------
// El número de WhatsApp de ventas HOY está hardcodeado en
// `el-templo-app/src/utils/whatsapp.ts` (`WHATSAPP_NUMBERS`). D-20 lo mueve
// a `tenant_settings`, UNO por país del tenant, editable desde Comunicaciones.
// La app sigue prefiriendo el número del servidor y cayendo al hardcode si
// no lo recibe (D-21, planes siguientes de la fase) — este archivo es SOLO
// la lectura/escritura server-side, sin ruta HTTP todavía.
//
// FORMATO DEL NÚMERO (T-193-01)
// -------------------------------
// `SALES_NUMBER_PATTERN` exige SOLO dígitos (8 a 15). Es el número tal cual
// entra en `https://wa.me/<n>`: cualquier otro carácter (`+`, espacios,
// guiones, `?`, `/`) permitiría inyectar path o query en esa URL. La
// validación corre en escritura (`setSalesNumber` lanza) Y en lectura
// (`getSalesNumber` descarta un valor corrupto) — fail-closed en los dos
// sentidos: mejor que la app caiga a su hardcode que emitir una URL rota.
//
// AISLAMIENTO (T-193-03)
// ------------------------
// Toda query pasa por `tenantWhere`/`tenantValues` (`modules/shared/tenant.ts`).
// `test/communications/sales-number.test.ts` caso (d) prueba explícitamente
// que el número de un tenant no es visible con el `ctx` de otro.
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { tenantSettings } from "../../db/schema";
import {
  tenantWhere,
  tenantValues,
  type TenantContext,
} from "../shared/tenant";
import { resolveBranchCountry, type CountryCode } from "../shared/country-scope";
import { BadRequestError } from "../shared/errors";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Prefijo de la key en `tenant_settings`. NO re-declarar este literal en
 * ningún otro archivo — usar {@link salesNumberKey}.
 */
export const SALES_NUMBER_KEY_PREFIX = "whatsapp.sales_number.";

/** `whatsapp.sales_number.AR` / `whatsapp.sales_number.ES`. */
export function salesNumberKey(country: CountryCode): string {
  return `${SALES_NUMBER_KEY_PREFIX}${country}`;
}

/**
 * SOLO dígitos, 8 a 15 caracteres. Sin `+`, sin espacios, sin guiones — el
 * número tal cual entra en `https://wa.me/<n>` (T-193-01).
 */
export const SALES_NUMBER_PATTERN = /^[0-9]{8,15}$/;

export function isValidSalesNumber(value: string): boolean {
  return SALES_NUMBER_PATTERN.test(value);
}

/**
 * Lee el número de ventas de `country` para el tenant de `ctx`. `null` si no
 * hay fila O si el valor guardado no pasa {@link isValidSalesNumber}
 * (fail-closed: un valor corrupto en base no debe emitir una URL rota — la
 * app cae a su hardcode, D-21).
 */
export async function getSalesNumber(
  db: DbInstance,
  ctx: TenantContext,
  country: CountryCode,
): Promise<string | null> {
  const [row] = await db
    .select({ settingValue: tenantSettings.settingValue })
    .from(tenantSettings)
    .where(
      and(
        tenantWhere(tenantSettings, ctx),
        eq(tenantSettings.settingKey, salesNumberKey(country)),
      ),
    )
    .limit(1);

  if (!row || !isValidSalesNumber(row.settingValue)) {
    return null;
  }
  return row.settingValue;
}

/**
 * Escribe (upsert) el número de ventas de `country` para el tenant de `ctx`.
 * Lanza {@link BadRequestError} sin escribir fila si `value` no pasa
 * {@link isValidSalesNumber}.
 */
export async function setSalesNumber(
  db: DbInstance,
  ctx: TenantContext,
  country: CountryCode,
  value: string,
): Promise<void> {
  if (!isValidSalesNumber(value)) {
    throw new BadRequestError(
      "El número de WhatsApp debe tener entre 8 y 15 dígitos, sin '+', espacios ni guiones",
    );
  }

  await db
    .insert(tenantSettings)
    .values(
      tenantValues(ctx, {
        settingKey: salesNumberKey(country),
        settingValue: value,
      }),
    )
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

/**
 * Resuelve el país por la SEDE del socio (`resolveBranchCountry`, default
 * `'AR'` si no resuelve) y devuelve el número de ventas de ese país para el
 * tenant de `ctx`.
 */
export async function resolveSalesNumberForUser(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<{ country: CountryCode; number: string | null }> {
  const branchCountry = await resolveBranchCountry(db, ctx, userId);
  const country: CountryCode = branchCountry ?? "AR";
  const number = await getSalesNumber(db, ctx, country);
  return { country, number };
}
