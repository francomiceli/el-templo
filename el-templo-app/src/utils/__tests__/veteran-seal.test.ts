import { describe, expect, it } from 'vitest'
import { monthsSince, sealLabel, sealRings } from '../veteran-seal'

describe('sealRings', () => {
  it('no hay sello por debajo de los 3 meses', () => {
    expect(sealRings(0)).toBeNull()
    expect(sealRings(2)).toBeNull()
  })

  it('3 a 5 meses: sin anillos', () => {
    expect(sealRings(3)).toBe(0)
    expect(sealRings(5)).toBe(0)
  })

  it('6 a 11 meses: un anillo', () => {
    expect(sealRings(6)).toBe(1)
    expect(sealRings(11)).toBe(1)
  })

  it('12 meses o más: dos anillos', () => {
    expect(sealRings(12)).toBe(2)
    expect(sealRings(60)).toBe(2)
  })
})

describe('monthsSince', () => {
  const now = new Date('2026-11-18T12:00:00Z')

  it('cuenta meses completos y respeta el día del mes', () => {
    expect(monthsSince('2026-08-18T00:00:00Z', now)).toBe(3)
    expect(monthsSince('2026-08-19T00:00:00Z', now)).toBe(2)
  })

  it('sin fecha o con fecha inválida vale 0', () => {
    expect(monthsSince(null, now)).toBe(0)
    expect(monthsSince('no-es-fecha', now)).toBe(0)
  })

  it('una fecha futura no da meses negativos', () => {
    expect(monthsSince('2027-01-01T00:00:00Z', now)).toBe(0)
  })
})

describe('sealLabel', () => {
  it('conserva los textos de los tooltips', () => {
    expect(sealLabel('2026-08-01T00:00:00Z', 3)).toBe('3 meses en El Templo')
    expect(sealLabel('2026-05-01T00:00:00Z', 6)).toBe('6 meses en El Templo')
  })

  it('al año o más dice desde cuándo y cuántos años', () => {
    expect(sealLabel('2025-10-15T12:00:00Z', 13)).toMatch(/^Miembro del Templo desde .+ · 1 año$/)
    expect(sealLabel('2023-10-15T12:00:00Z', 37)).toMatch(/· 3 años$/)
  })

  it('sin fecha o sin nivel, vacío', () => {
    expect(sealLabel(null, 12)).toBe('')
    expect(sealLabel('2026-10-01T00:00:00Z', 1)).toBe('')
  })
})
