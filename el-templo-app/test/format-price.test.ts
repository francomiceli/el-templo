import { describe, it, expect } from 'vitest'
import { formatPrice } from 'src/utils/format-price'

// Referencia: el formato de antes de la fase 207 (0 decimales).
const legacyArs = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
const legacyEur = (n: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

describe('formatPrice', () => {
  it('importes enteros: idéntico al formato anterior', () => {
    expect(formatPrice(1500, 'ARS')).toBe(legacyArs(1500))
    expect(formatPrice(0, 'ARS')).toBe(legacyArs(0))
    expect(formatPrice(1500000, 'ARS')).toBe(legacyArs(1500000))
    expect(formatPrice(70, 'EUR')).toBe(legacyEur(70))
  })

  it('ARS con centavos: siempre 2 decimales', () => {
    expect(formatPrice(77570.82, 'ARS')).toContain('77.570,82')
    expect(formatPrice(1234.5, 'ARS')).toContain('1.234,50')
    expect(formatPrice(0.07, 'ARS')).toContain('0,07')
  })

  it('EUR con centavos', () => {
    expect(formatPrice(70.5, 'EUR')).toContain('70,50')
  })

  it('residuo de coma flotante cuenta como entero', () => {
    expect(formatPrice(1500.0000000001, 'ARS')).toBe(formatPrice(1500, 'ARS'))
    expect(formatPrice(0.1 + 0.2, 'ARS')).toContain('0,30')
  })

  it('moneda desconocida: número es-AR con la misma regla', () => {
    expect(formatPrice(10.5, 'USD?')).toBe('10,50')
    expect(formatPrice(1500, 'USD?')).toBe('1.500')
  })

  it('importe negativo con centavos', () => {
    expect(formatPrice(-70.25, 'ARS')).toContain('70,25')
  })
})
