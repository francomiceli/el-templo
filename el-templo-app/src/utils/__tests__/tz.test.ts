import { afterEach, describe, expect, it, vi } from 'vitest'
import { dowInTz, todayInTz } from '../tz'

const BA = 'America/Argentina/Buenos_Aires'

describe('todayInTz', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('devuelve YYYY-MM-DD en la zona de la sede', () => {
    // 2026-10-23 01:30 UTC = 22/10 22:30 en Buenos Aires (UTC-3).
    expect(todayInTz(BA, new Date('2026-10-23T01:30:00Z'))).toBe('2026-10-22')
    expect(todayInTz('Europe/Madrid', new Date('2026-10-23T01:30:00Z'))).toBe('2026-10-23')
  })

  it('rellena mes y día con cero', () => {
    expect(todayInTz(BA, new Date('2026-01-05T15:00:00Z'))).toBe('2026-01-05')
  })

  it('no depende del formato de toLocaleDateString (iOS 17 no siempre da YYYY-MM-DD)', () => {
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('23/10/2026')

    expect(todayInTz(BA, new Date('2026-10-23T15:00:00Z'))).toBe('2026-10-23')
    // 2026-10-23 es viernes.
    expect(dowInTz(BA, new Date('2026-10-23T15:00:00Z'))).toBe(5)
  })
})
