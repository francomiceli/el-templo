export type Currency = 'ARS' | 'EUR';

/**
 * Format a monetary amount with currency-aware locale.
 *
 * Amount is in minor currency units (cents). The function divides by 100
 * before formatting, so `formatPrice(7000, 'EUR')` renders as `€70` and
 * `formatPrice(150000, 'ARS')` renders as `$1.500`.
 *
 * ARS uses es-AR locale; EUR uses es-ES locale; both render with zero
 * fraction digits (whole currency units after the division).
 *
 * Unknown currency strings fall back to a plain `es-AR` number — deployed
 * mobile apps may pass a currency we don't recognize, and throwing would
 * crash a legit price screen.
 *
 * Duplicated in el-templo-app/src/utils/format-price.ts per D-07 (no
 * pnpm workspace). Keep the two files in sync.
 */
export function formatPrice(amount: number, currency: Currency | string): string {
  const value = amount / 100;

  if (currency === 'ARS') {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (currency === 'EUR') {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  // Unknown currency — sensible fallback, do not throw.
  return value.toLocaleString('es-AR');
}
