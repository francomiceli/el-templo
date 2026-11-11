import { fractionDigitsFor, roundMoney } from './money';

export type Currency = 'ARS' | 'EUR';

/**
 * Format a monetary amount with currency-aware locale.
 *
 * Amount is in currency units (pesos or euros) with up to 2 decimals since
 * phase 207 (the ledger stores DECIMAL(14,2)). Decimals are shown ONLY when the
 * amount is not a whole number, so existing screens do not change:
 * `formatPrice(70, 'EUR')` renders as `€70`, `formatPrice(1500, 'ARS')` as
 * `$1.500` and `formatPrice(77570.82, 'ARS')` as `$77.570,82` (always exactly
 * 2 decimals when there are cents: `$1.234,50`, never `$1.234,5`).
 *
 * The decision is made on the amount rounded to cents (`roundMoney`), so a
 * float residue like 1500.0000000001 still renders as a whole number.
 *
 * ARS uses es-AR locale; EUR uses es-ES locale.
 *
 * Unknown currency strings fall back to a plain `es-AR` number — deployed
 * mobile apps may pass a currency we don't recognize, and throwing would
 * crash a legit price screen.
 *
 * Duplicated in el-templo-app/src/utils/format-price.ts per D-07 (no
 * pnpm workspace). Keep the two files in sync.
 */
export function formatPrice(amount: number, currency: Currency | string): string {
  const rounded = roundMoney(amount);
  const digits = fractionDigitsFor(amount);
  const fractionOptions = { minimumFractionDigits: digits, maximumFractionDigits: digits };

  if (currency === 'ARS') {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      ...fractionOptions,
    }).format(rounded);
  }

  if (currency === 'EUR') {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      ...fractionOptions,
    }).format(rounded);
  }

  // Unknown currency — sensible fallback, do not throw.
  return rounded.toLocaleString('es-AR', fractionOptions);
}
