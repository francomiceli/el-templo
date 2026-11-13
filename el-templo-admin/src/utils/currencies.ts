/**
 * Monedas de cuenta (cajas y cuentas banco) — fase 208 (DI-02).
 *
 * Espejo de `SUPPORTED_ACCOUNT_CURRENCIES` de la API: una cuenta puede estar en
 * ARS, EUR o USD. Los COBROS siguen en ARS/EUR (la moneda la define el plan):
 * por eso el tipo `Currency` de `format-price.ts` NO se ensancha; las cuentas
 * usan `AccountCurrency`.
 */
export const ACCOUNT_CURRENCIES = ['ARS', 'EUR', 'USD'] as const;

export type AccountCurrency = (typeof ACCOUNT_CURRENCIES)[number];

/** Opciones para los selects de moneda de una cuenta. */
export const ACCOUNT_CURRENCY_OPTIONS: Array<{ label: string; value: AccountCurrency }> = [
  { label: 'Pesos (ARS)', value: 'ARS' },
  { label: 'Euros (EUR)', value: 'EUR' },
  { label: 'Dólares (USD)', value: 'USD' },
];

const CURRENCY_SYMBOLS: Record<AccountCurrency, string> = {
  ARS: '$',
  EUR: '€',
  USD: 'US$',
};

/**
 * Símbolo para prefijar un importe en un input. Moneda desconocida: devuelve el
 * mismo código (no tira, para no romper una pantalla por un dato raro).
 */
export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency as AccountCurrency] ?? currency;
}
