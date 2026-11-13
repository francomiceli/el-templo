export type Currency = 'ARS' | 'EUR'

/**
 * Format a monetary amount with currency-aware locale.
 *
 * Amount is in whole currency units (no minor units / cents). The project
 * convention is that every stored price is already in whole pesos, euros or
 * dollars: `formatPrice(70, 'EUR')` renders as `€70` and
 * `formatPrice(1500, 'ARS')` renders as `$1.500`.
 *
 * ARS uses es-AR locale; EUR uses es-ES locale; USD uses es-AR locale, which
 * renders the symbol as `US$` (`US$1.500`) so it is not confused with ARS `$`.
 * All render with zero fraction digits. USD applies to accounts (phase 208);
 * charges stay in ARS/EUR.
 *
 * Unknown currency strings fall back to a plain `es-AR` number — deployed
 * mobile apps may pass a currency we don't recognize, and throwing would
 * crash a legit price screen.
 *
 * Duplicated in el-templo-admin/src/utils/format-price.ts per D-07 (no
 * pnpm workspace). Keep the two files in sync.
 */
export function formatPrice(amount: number, currency: Currency | string): string {
  if (currency === 'ARS') {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (currency === 'EUR') {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (currency === 'USD') {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Unknown currency — sensible fallback, do not throw.
  return amount.toLocaleString('es-AR')
}
