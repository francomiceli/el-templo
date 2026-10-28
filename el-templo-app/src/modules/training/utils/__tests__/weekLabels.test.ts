import { describe, it, expect } from 'vitest'
import {
  addDays,
  availableLabel,
  canGoNextWeek,
  canGoPrevWeek,
  dayChip,
  dayKicker,
  mondayOfDate,
  weekDatesFrom,
  weekRangeLabel,
  weekdayLong,
} from '../weekLabels'

// Funciones puras de fecha: las fechas literales son válidas acá (no dependen del reloj).
describe('weekRangeLabel (D-03)', () => {
  it('semana dentro de un mes', () => {
    expect(weekRangeLabel('2026-10-12')).toBe('12 al 18 de octubre')
  })

  it('cruce de mes', () => {
    expect(weekRangeLabel('2026-09-28')).toBe('28 de septiembre al 4 de octubre')
  })

  it('cruce de año', () => {
    expect(weekRangeLabel('2026-12-28')).toBe('28 de diciembre al 3 de enero')
  })
})

describe('dayKicker', () => {
  it('hoy lleva el prefijo', () => {
    expect(dayKicker('2026-10-16', '2026-10-16')).toBe('Hoy · viernes 16')
  })

  it('otro día va sin prefijo', () => {
    expect(dayKicker('2026-10-14', '2026-10-16')).toBe('miércoles 14')
  })
})

describe('dayChip y availableLabel', () => {
  it('chip de tres letras, mayúsculas, sin punto y con tilde', () => {
    expect(dayChip('2026-10-14')).toEqual({ short: 'MIÉ', n: 14 })
    expect(dayChip('2026-10-17')).toEqual({ short: 'SÁB', n: 17 })
    expect(dayChip('2026-10-16')).toEqual({ short: 'VIE', n: 16 })
  })

  it('"Disponible el {día}"', () => {
    expect(availableLabel('2026-10-17')).toBe('Disponible el sábado')
  })

  it('weekdayLong en minúscula', () => {
    expect(weekdayLong('2026-10-18')).toBe('domingo')
  })
})

describe('aritmética de fechas', () => {
  it('addDays cruza mes y año', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('mondayOfDate: el domingo pertenece a la semana que termina en él', () => {
    expect(mondayOfDate('2026-10-18')).toBe('2026-10-12')
    expect(mondayOfDate('2026-10-12')).toBe('2026-10-12')
    expect(mondayOfDate('2026-10-16')).toBe('2026-10-12')
  })

  it('weekDatesFrom devuelve 7 fechas de lunes a domingo', () => {
    const dates = weekDatesFrom('2026-10-12')
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe('2026-10-12')
    expect(dates[6]).toBe('2026-10-18')
  })

  it('weekDatesFrom cruza el fin de mes', () => {
    expect(weekDatesFrom('2026-09-28')[6]).toBe('2026-10-04')
  })
})

describe('navegación de semanas', () => {
  it('no se retrocede antes del lunes de la semana 1', () => {
    expect(canGoPrevWeek('2026-02-23')).toBe(false)
    expect(canGoPrevWeek('2026-03-02')).toBe(true)
  })

  it('se avanza hasta 1 semana después de la actual', () => {
    const actual = '2026-10-12'
    expect(canGoNextWeek(actual, actual)).toBe(true)
    expect(canGoNextWeek(addDays(actual, 7), actual)).toBe(false)
    expect(canGoNextWeek(addDays(actual, -7), actual)).toBe(true)
  })
})
