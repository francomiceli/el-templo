import { describe, expect, it } from 'vitest'
import { daysBetween, formatShortDateEs } from '../short-date'

// Fechas relativas al año en curso: el test no vence con el calendario.
const Y = new Date().getFullYear()
const TODAY = `${Y}-10-28`

describe('formatShortDateEs', () => {
  it('sin año si es el año en curso', () => {
    expect(formatShortDateEs(`${Y}-11-16`, TODAY)).toBe('16 nov')
    expect(formatShortDateEs(`${Y}-01-05`, TODAY)).toBe('5 ene')
    expect(formatShortDateEs(`${Y}-12-31`, TODAY)).toBe('31 dic')
  })

  it('con año si es otro año (siguiente o anterior)', () => {
    expect(formatShortDateEs(`${Y + 1}-01-15`, TODAY)).toBe(`15 ene ${Y + 1}`)
    expect(formatShortDateEs(`${Y - 1}-12-02`, TODAY)).toBe(`2 dic ${Y - 1}`)
  })

  it('el año en curso es el de `today`, no el del reloj', () => {
    expect(formatShortDateEs('2027-01-15', '2027-01-02')).toBe('15 ene')
    expect(formatShortDateEs('2026-12-30', '2027-01-02')).toBe('30 dic 2026')
  })

  it('cubre los doce meses', () => {
    const expected = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
      'nov',
      'dic',
    ]
    expected.forEach((mes, i) => {
      const mm = String(i + 1).padStart(2, '0')
      expect(formatShortDateEs(`${Y}-${mm}-10`, TODAY)).toBe(`10 ${mes}`)
    })
  })
})

describe('daysBetween', () => {
  it('mismo día: 0', () => {
    expect(daysBetween(`${Y}-10-28`, `${Y}-10-28`)).toBe(0)
  })

  it('hacia adelante y hacia atrás', () => {
    expect(daysBetween(`${Y}-10-28`, `${Y}-10-31`)).toBe(3)
    expect(daysBetween(`${Y}-10-28`, `${Y}-10-25`)).toBe(-3)
  })

  it('cruza fin de mes y de año', () => {
    expect(daysBetween(`${Y}-10-28`, `${Y}-11-02`)).toBe(5)
    expect(daysBetween(`${Y}-12-30`, `${Y + 1}-01-02`)).toBe(3)
  })

  it('no se corre por el cambio de hora (DST): cuenta días calendario', () => {
    expect(daysBetween(`${Y}-03-01`, `${Y}-04-01`)).toBe(31)
    expect(daysBetween(`${Y}-10-01`, `${Y}-11-01`)).toBe(31)
  })

  it('año bisiesto', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1)
  })
})
