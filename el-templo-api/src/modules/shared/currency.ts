/**
 * Moneda de una sede a partir de su país (`branches.country`).
 *
 * Regla del repo: `"ES"` → EUR; cualquier otro país (hoy solo "AR", y por
 * defecto histórico el resto) → ARS. Se resuelve por país, nunca por nombre de
 * sede (Tablero semanal, D-16).
 *
 * Deuda técnica: esta misma regla ya existe copiada en
 * `referral-partners/service.ts` (~1382), `subscriptions/service.ts` (~1122) y
 * `finance/coach-load-routes.ts` (~1242). No se migraron en la fase 206 para no
 * tocar módulos ajenos; unificarlas apuntando a esta función es trabajo futuro.
 */
export type CountryCurrency = "ARS" | "EUR";

export function currencyForCountry(country: string): CountryCurrency {
  return country === "ES" ? "EUR" : "ARS";
}

/**
 * Monedas en que puede existir una caja o cuenta (fase 208, DI-02): ARS, EUR y
 * USD. Los cobros siguen en la moneda del plan (ARS/EUR) y la moneda de una
 * SEDE sigue saliendo del país (`currencyForCountry`). Lista única: la usan los
 * schemas Ajv de las altas de cuentas y el espejo del admin.
 */
export const SUPPORTED_ACCOUNT_CURRENCIES = ["ARS", "EUR", "USD"] as const;

export type AccountCurrency = (typeof SUPPORTED_ACCOUNT_CURRENCIES)[number];

export function isSupportedAccountCurrency(
  value: string,
): value is AccountCurrency {
  return (SUPPORTED_ACCOUNT_CURRENCIES as readonly string[]).includes(value);
}

/** Schema Ajv de la moneda de una cuenta (enum cerrado, mayúsculas). */
export const ACCOUNT_CURRENCY_SCHEMA = {
  type: "string",
  enum: SUPPORTED_ACCOUNT_CURRENCIES,
} as const;
