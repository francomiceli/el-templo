import { describe, it, expect } from 'vitest'
import { formatPrice } from 'src/utils/format-price'

// La plata va en unidades enteras (D-23): 0 decimales en todas las monedas.
const wholeArs = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
const wholeEur = (n: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

describe('formatPrice', () => {
  it('ARS y EUR: sin decimales', () => {
    expect(formatPrice(1500, 'ARS')).toBe(wholeArs(1500))
    expect(formatPrice(0, 'ARS')).toBe(wholeArs(0))
    expect(formatPrice(1500000, 'ARS')).toBe(wholeArs(1500000))
    expect(formatPrice(70, 'EUR')).toBe(wholeEur(70))
  })

  it('USD: símbolo US$ y miles, sin decimales', () => {
    const out = formatPrice(1500, 'USD')
    expect(out).toContain('US$')
    expect(out).toContain('1.500')
    expect(out).not.toContain(',')
  })

  it('USD no se confunde con ARS', () => {
    expect(formatPrice(100, 'USD')).not.toBe(formatPrice(100, 'ARS'))
  })

  it('moneda desconocida: número es-AR', () => {
    expect(formatPrice(1500, 'USD?')).toBe('1.500')
  })
})
