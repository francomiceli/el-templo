import { describe, it, expect } from 'vitest'
import { relativeDaysLabel } from '../relative-days'

// Todas las fechas se construyen en hora LOCAL (sin 'Z'): la regla cuenta días
// de calendario locales, así el test no depende de la zona horaria de la máquina.
const NOW = new Date(2026, 9, 14, 15, 30) // 14 oct 2026, 15:30

function daysAgo(n: number, hour = 12, minute = 0): string {
  return new Date(2026, 9, 14 - n, hour, minute).toISOString()
}

describe('relativeDaysLabel (D-7)', () => {
  it('mismo día: "hoy"', () => {
    expect(relativeDaysLabel(daysAgo(0, 0, 1), NOW)).toBe('hoy')
    expect(relativeDaysLabel(daysAgo(0, 9), NOW)).toBe('hoy')
  })

  it('día anterior: "ayer"', () => {
    expect(relativeDaysLabel(daysAgo(1), NOW)).toBe('ayer')
  })

  it.each([2, 3, 4, 5, 6])('%i días: "hace %i días"', (n) => {
    expect(relativeDaysLabel(daysAgo(n), NOW)).toBe(`hace ${n} días`)
  })

  it('7 a 13 días: "hace 1 semana" (singular)', () => {
    expect(relativeDaysLabel(daysAgo(7), NOW)).toBe('hace 1 semana')
    expect(relativeDaysLabel(daysAgo(13), NOW)).toBe('hace 1 semana')
  })

  it('14, 21 y 56 días: semanas en plural', () => {
    expect(relativeDaysLabel(daysAgo(14), NOW)).toBe('hace 2 semanas')
    expect(relativeDaysLabel(daysAgo(21), NOW)).toBe('hace 3 semanas')
    expect(relativeDaysLabel(daysAgo(56), NOW)).toBe('hace 8 semanas')
  })

  it('59 días todavía son semanas; desde 60 pasa a meses', () => {
    expect(relativeDaysLabel(daysAgo(59), NOW)).toBe('hace 8 semanas')
    expect(relativeDaysLabel(daysAgo(60), NOW)).toBe('hace 2 meses')
    expect(relativeDaysLabel(daysAgo(95), NOW)).toBe('hace 3 meses')
    expect(relativeDaysLabel(daysAgo(365), NOW)).toBe('hace 12 meses')
  })

  describe('cruce de medianoche (días de calendario, no 24h corridas)', () => {
    it('ayer a las 23:59 con "ahora" a las 00:01 sigue siendo "ayer" (2 minutos)', () => {
      const now = new Date(2026, 9, 14, 0, 1)
      const published = new Date(2026, 9, 13, 23, 59).toISOString()
      expect(relativeDaysLabel(published, now)).toBe('ayer')
    })

    it('ayer a las 00:01 con "ahora" a las 23:59 es "ayer" (casi 48h), no "hace 2 días"', () => {
      const now = new Date(2026, 9, 14, 23, 59)
      const published = new Date(2026, 9, 13, 0, 1).toISOString()
      expect(relativeDaysLabel(published, now)).toBe('ayer')
    })

    it('hoy a las 00:01 con "ahora" a las 23:59 sigue siendo "hoy" (casi 24h)', () => {
      const now = new Date(2026, 9, 14, 23, 59)
      const published = new Date(2026, 9, 14, 0, 1).toISOString()
      expect(relativeDaysLabel(published, now)).toBe('hoy')
    })
  })

  it('cruza fin de mes y de año', () => {
    const now = new Date(2027, 0, 2, 10, 0)
    expect(relativeDaysLabel(new Date(2026, 11, 31, 22, 0).toISOString(), now)).toBe('hace 2 días')
    expect(relativeDaysLabel(new Date(2026, 11, 26, 8, 0).toISOString(), now)).toBe('hace 1 semana')
  })

  it('fecha futura (reloj del celular atrasado): "hoy"', () => {
    expect(relativeDaysLabel(daysAgo(-1), NOW)).toBe('hoy')
    expect(relativeDaysLabel(daysAgo(-30), NOW)).toBe('hoy')
  })

  it('fecha inválida: "hoy" (no rompe la card)', () => {
    expect(relativeDaysLabel('no-es-una-fecha', NOW)).toBe('hoy')
  })
})
