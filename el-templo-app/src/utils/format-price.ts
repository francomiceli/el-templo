export type Currency = 'ARS' | 'EUR'

/**
 * Format a monetary amount with currency-aware locale.
 *
 * Amount is in whole currency units (no minor units / cents). The project
 * convention is that every stored price is already in whole pesos or euros:
 * `formatPrice(70, 'EUR')` renders as `€70` and `formatPrice(1500, 'ARS')`
 * renders as `$1.500`.
 *
 * ARS uses es-AR locale; EUR uses es-ES locale; both render with zero
 * fraction digits.
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

  // Unknown currency — sensible fallback, do not throw.
  return amount.toLocaleString('es-AR')
}
