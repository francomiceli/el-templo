import { describe, it, expect } from 'vitest'
import { dowInTz, todayInTz } from 'src/utils/tz'

describe('dowInTz', () => {
  it('returns 1 for Monday in Buenos Aires', () => {
    // 2026-04-20 is a Monday. 15:00 UTC = 12:00 in AR — well inside the day.
    const mon = new Date('2026-04-20T15:00:00Z')
    expect(dowInTz('America/Argentina/Buenos_Aires', mon)).toBe(1)
  })

  it('returns 7 for Sunday in Buenos Aires', () => {
    // 2026-04-26 is a Sunday.
    const sun = new Date('2026-04-26T15:00:00Z')
    expect(dowInTz('America/Argentina/Buenos_Aires', sun)).toBe(7)
  })

  it('flips day when the zoned date differs from UTC date', () => {
    // 2026-04-21 02:00 UTC is still 2026-04-20 (Monday) 23:00 in AR.
    const tuesdayInUtc = new Date('2026-04-21T02:00:00Z')
    expect(dowInTz('America/Argentina/Buenos_Aires', tuesdayInUtc)).toBe(1)
  })

  it('returns valid 1..7 for every weekday across a full week', () => {
    const start = new Date('2026-04-20T15:00:00Z') // Monday
    const results: number[] = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(start.getTime() + i * 86_400_000)
      results.push(dowInTz('America/Argentina/Buenos_Aires', day))
    }
    expect(results).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe('todayInTz', () => {
  it('returns YYYY-MM-DD in the branch timezone', () => {
    const t = new Date('2026-04-23T15:00:00Z')
    expect(todayInTz('America/Argentina/Buenos_Aires', t)).toBe('2026-04-23')
  })
})
