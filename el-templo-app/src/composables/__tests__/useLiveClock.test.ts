import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useLiveClock } from '../useLiveClock'

// 2026-10-15T23:30:05Z: jueves 15 en Buenos Aires (20:30:05), viernes 16 en Madrid (01:30:05).
const INSTANT = new Date('2026-10-15T23:30:05Z')

describe('useLiveClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(INSTANT)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pinta hora y fecha en la zona de la sede, no en la del teléfono', () => {
    const ba = useLiveClock(() => 'America/Argentina/Buenos_Aires')
    ba.start()
    expect(ba.time.value).toBe('20:30:05')
    expect(ba.dateLabel.value).toBe('Jueves 15 de octubre')
    ba.cleanup()

    const madrid = useLiveClock(() => 'Europe/Madrid')
    madrid.start()
    expect(madrid.time.value).toBe('01:30:05')
    expect(madrid.dateLabel.value).toBe('Viernes 16 de octubre')
    madrid.cleanup()
  })

  it('avanza cada segundo', () => {
    const clock = useLiveClock(() => 'America/Argentina/Buenos_Aires')
    clock.start()
    vi.advanceTimersByTime(3000)
    expect(clock.time.value).toBe('20:30:08')
    clock.cleanup()
  })

  it('start() repetido no deja dos relojes', () => {
    const clock = useLiveClock(() => 'America/Argentina/Buenos_Aires')
    clock.start()
    clock.start()
    expect(vi.getTimerCount()).toBe(1)
    clock.cleanup()
  })

  it('cleanup() frena el reloj y el valor deja de cambiar', () => {
    const clock = useLiveClock(() => 'America/Argentina/Buenos_Aires')
    clock.start()
    clock.cleanup()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(5000)
    expect(clock.time.value).toBe('20:30:05')
  })

  it('cleanup() sin start() no rompe', () => {
    const clock = useLiveClock(() => 'Europe/Madrid')
    expect(() => clock.cleanup()).not.toThrow()
  })

  it('relee la zona en cada tick (cambio de sede)', () => {
    let tz = 'America/Argentina/Buenos_Aires'
    const clock = useLiveClock(() => tz)
    clock.start()
    tz = 'Europe/Madrid'
    vi.advanceTimersByTime(1000)
    expect(clock.time.value).toBe('01:30:06')
    clock.cleanup()
  })
})
