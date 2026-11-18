import { describe, expect, it } from 'vitest'
import { formatTenure } from '../tenure'

// Reloj fijo: nunca el real. 2026-11-17 al mediodía UTC.
const NOW = new Date('2026-11-17T12:00:00Z')

/** `memberSince` ISO a N meses completos antes de NOW (mismo día del mes). */
function since(months: number): string {
  const total = 2026 * 12 + 10 - months // mes 0-based de NOW = 10
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return `${y}-${String(m).padStart(2, '0')}-17T12:00:00Z`
}

describe('formatTenure', () => {
  it('0 meses completos: primer mes', () => {
    expect(formatTenure(since(0), NOW)).toBe('Tu primer mes en El Templo')
    expect(formatTenure('2026-10-18T12:00:00Z', NOW)).toBe('Tu primer mes en El Templo')
  })

  it('1 mes en singular', () => {
    expect(formatTenure(since(1), NOW)).toBe('1 mes en El Templo')
  })

  it('2 a 11 meses en plural', () => {
    expect(formatTenure(since(2), NOW)).toBe('2 meses en El Templo')
    expect(formatTenure(since(5), NOW)).toBe('5 meses en El Templo')
    expect(formatTenure(since(11), NOW)).toBe('11 meses en El Templo')
  })

  it('12 meses: 1 año', () => {
    expect(formatTenure(since(12), NOW)).toBe('1 año en El Templo')
  })

  it('13 a 23 meses: año y meses', () => {
    expect(formatTenure(since(13), NOW)).toBe('1 año y 1 mes en El Templo')
    expect(formatTenure(since(14), NOW)).toBe('1 año y 2 meses en El Templo')
    expect(formatTenure(since(23), NOW)).toBe('1 año y 11 meses en El Templo')
  })

  it('24 meses o más: años y meses solo si sobran', () => {
    expect(formatTenure(since(24), NOW)).toBe('2 años en El Templo')
    expect(formatTenure(since(27), NOW)).toBe('2 años y 3 meses en El Templo')
    expect(formatTenure(since(36), NOW)).toBe('3 años en El Templo')
    expect(formatTenure(since(37), NOW)).toBe('3 años y 1 mes en El Templo')
  })

  it('cuenta meses completos: el día del mes se incluye', () => {
    // De 2025-11-17 a 2026-11-16 son 11 meses, a 2026-11-17 son 12.
    expect(formatTenure('2025-11-17T12:00:00Z', new Date('2026-11-16T12:00:00Z'))).toBe(
      '11 meses en El Templo',
    )
    expect(formatTenure('2025-11-17T12:00:00Z', new Date('2026-11-17T12:00:00Z'))).toBe(
      '1 año en El Templo',
    )
  })

  it('sin memberSince no hay línea', () => {
    expect(formatTenure(undefined, NOW)).toBeNull()
  })

  it('una fecha ilegible o futura no rompe: no hay línea o primer mes', () => {
    expect(formatTenure('no-es-una-fecha', NOW)).toBeNull()
    expect(formatTenure('2027-03-01T12:00:00Z', NOW)).toBe('Tu primer mes en El Templo')
  })
})
