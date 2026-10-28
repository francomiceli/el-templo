import { describe, it, expect } from 'vitest'
import {
  CHECK_IN_WINDOW_MS,
  DEFAULT_BRANCH_TZ,
  REGULAR_KIND,
  activityKindKey,
  addDaysStr,
  checkInWindowState,
  classStartUtc,
  formatHHMM,
  formatTimeInTz,
  minutesUntil,
  weekStartsFor,
} from '../check-in-window'

const BA = 'America/Argentina/Buenos_Aires'

describe('classStartUtc', () => {
  it('Buenos Aires (UTC-3): 19:00 local = 22:00Z', () => {
    expect(classStartUtc('2026-10-15', '19:00:00', BA).toISOString()).toBe(
      '2026-10-15T22:00:00.000Z',
    )
  })

  it('acepta "HH:MM" sin segundos', () => {
    expect(classStartUtc('2026-10-15', '19:00', BA).toISOString()).toBe('2026-10-15T22:00:00.000Z')
  })

  it('Europe/Madrid en horario de verano (UTC+2)', () => {
    expect(classStartUtc('2026-07-15', '19:00:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-07-15T17:00:00.000Z',
    )
  })

  it('Europe/Madrid en horario de invierno (UTC+1)', () => {
    expect(classStartUtc('2026-01-15', '19:00:00', 'Europe/Madrid').toISOString()).toBe(
      '2026-01-15T18:00:00.000Z',
    )
  })
})

describe('checkInWindowState', () => {
  const start = new Date('2026-10-15T22:00:00.000Z')
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000)

  it('20 min es el espejo del server', () => {
    expect(CHECK_IN_WINDOW_MS).toBe(20 * 60 * 1000)
  })

  it('-21 min: before', () => {
    expect(checkInWindowState(start, at(-21))).toBe('before')
  })

  it('-20 min: open (borde inclusivo)', () => {
    expect(checkInWindowState(start, at(-20))).toBe('open')
  })

  it('0 min: open', () => {
    expect(checkInWindowState(start, at(0))).toBe('open')
  })

  it('+20 min: open (borde inclusivo)', () => {
    expect(checkInWindowState(start, at(20))).toBe('open')
  })

  it('+21 min: after', () => {
    expect(checkInWindowState(start, at(21))).toBe('after')
  })
})

describe('minutesUntil', () => {
  const start = new Date('2026-10-15T22:00:00.000Z')

  it('faltan 12 min', () => {
    expect(minutesUntil(start, new Date(start.getTime() - 12 * 60_000))).toBe(12)
  })

  it('redondea hacia arriba', () => {
    expect(minutesUntil(start, new Date(start.getTime() - 11 * 60_000 - 1_000))).toBe(12)
  })

  it('empezó hace 5 min: -5', () => {
    expect(minutesUntil(start, new Date(start.getTime() + 5 * 60_000))).toBe(-5)
  })
})

describe('weekStartsFor', () => {
  it('jueves 2026-10-15 -> lunes 12 y lunes 19', () => {
    expect(weekStartsFor('2026-10-15')).toEqual(['2026-10-12', '2026-10-19'])
  })

  it('domingo 2026-10-18 pertenece a la semana del lunes 12', () => {
    expect(weekStartsFor('2026-10-18')).toEqual(['2026-10-12', '2026-10-19'])
  })

  it('lunes 2026-10-12 es su propio lunes', () => {
    expect(weekStartsFor('2026-10-12')).toEqual(['2026-10-12', '2026-10-19'])
  })

  it('cruza fin de mes', () => {
    expect(weekStartsFor('2026-10-29')).toEqual(['2026-10-26', '2026-11-02'])
  })
})

describe('addDaysStr', () => {
  it('cruza fin de mes', () => {
    expect(addDaysStr('2026-10-30', 3)).toBe('2026-11-02')
  })

  it('cruza fin de año', () => {
    expect(addDaysStr('2026-12-30', 3)).toBe('2027-01-02')
  })

  it('resta días', () => {
    expect(addDaysStr('2026-11-02', -3)).toBe('2026-10-30')
  })
})

describe('formatHHMM / formatTimeInTz', () => {
  it('formatHHMM recorta los segundos', () => {
    expect(formatHHMM('19:00:00')).toBe('19:00')
    expect(formatHHMM('07:30')).toBe('07:30')
  })

  it('formatTimeInTz usa la zona de la sede', () => {
    expect(formatTimeInTz('2026-10-15T22:05:00.000Z', BA)).toBe('19:05')
    expect(formatTimeInTz('2026-07-15T17:05:00.000Z', 'Europe/Madrid')).toBe('19:05')
  })
})

describe('DEFAULT_BRANCH_TZ', () => {
  it('se re-exporta desde tz.ts', () => {
    expect(DEFAULT_BRANCH_TZ).toBe(BA)
  })
})

describe('activityKindKey', () => {
  it('regular', () => {
    expect(activityKindKey({ isSpecial: false, specialLine: null })).toBe('regular')
    expect(REGULAR_KIND).toBe('regular')
  })

  it('especial Aura (sin línea) y yoga son categorías distintas y distintas de regular', () => {
    const aura = activityKindKey({ isSpecial: true, specialLine: null })
    const yoga = activityKindKey({ isSpecial: true, specialLine: 'yoga' })
    expect(aura).not.toBe(yoga)
    expect(aura).not.toBe('regular')
    expect(yoga).not.toBe('regular')
  })

  it('una actividad no especial ignora la línea', () => {
    expect(activityKindKey({ isSpecial: false, specialLine: 'yoga' })).toBe('regular')
  })
})
