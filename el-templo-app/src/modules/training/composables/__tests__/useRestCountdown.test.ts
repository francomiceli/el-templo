import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useRestCountdown } from '../useRestCountdown'

// Los saltos de reloj van RELATIVOS a Date.now(): setSystemTime con una fecha fija no sirve cuando
// otra parte del test ya movió el reloj falso.
describe('useRestCountdown (aro del descanso activo)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('antes de arrancar muestra el total y no está terminado', () => {
    const c = useRestCountdown(60)
    expect(c.remaining.value).toBe(60)
    expect(c.isDone.value).toBe(false)
    expect(c.fractionLeft.value).toBe(1)
    expect(c.total).toBe(60)
    c.cleanup()
  })

  it('cuenta hacia atrás de a segundo', () => {
    const c = useRestCountdown(60)
    c.start()
    expect(c.remaining.value).toBe(60)
    vi.advanceTimersByTime(1000)
    expect(c.remaining.value).toBe(59)
    vi.advanceTimersByTime(22_000)
    expect(c.remaining.value).toBe(37)
    expect(c.fractionLeft.value).toBeCloseTo(37 / 60)
    c.cleanup()
  })

  it('no llega a 0 antes de que pase el tiempo completo', () => {
    const c = useRestCountdown(60)
    c.start()
    vi.advanceTimersByTime(59_900)
    expect(c.remaining.value).toBe(1)
    expect(c.isDone.value).toBe(false)
    c.cleanup()
  })

  it('al llegar a 0 queda terminado y el timer se frena', () => {
    const c = useRestCountdown(5)
    c.start()
    vi.advanceTimersByTime(5000)
    expect(c.remaining.value).toBe(0)
    expect(c.isDone.value).toBe(true)
    expect(c.fractionLeft.value).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    // seguir pasando el tiempo no lo mueve
    vi.advanceTimersByTime(10_000)
    expect(c.remaining.value).toBe(0)
  })

  it('si la app estuvo en segundo plano muestra el tiempo real que falta', () => {
    const c = useRestCountdown(60)
    c.start()
    // el sistema suspendió los timers 40 s: el reloj avanza relativo a ahora
    vi.setSystemTime(Date.now() + 40_000)
    vi.advanceTimersByTime(250)
    expect(c.remaining.value).toBe(20)
    c.cleanup()
  })

  it('si pasó más del total mientras estaba dormida queda en 0, no negativo', () => {
    const c = useRestCountdown(10)
    c.start()
    vi.setSystemTime(Date.now() + 60_000)
    vi.advanceTimersByTime(250)
    expect(c.remaining.value).toBe(0)
    expect(c.isDone.value).toBe(true)
  })

  it('cleanup frena el timer sin tocar lo que faltaba', () => {
    const c = useRestCountdown(60)
    c.start()
    vi.advanceTimersByTime(3000)
    c.cleanup()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(10_000)
    expect(c.remaining.value).toBe(57)
  })

  it('start de nuevo reinicia desde el total sin duplicar timers', () => {
    const c = useRestCountdown(30)
    c.start()
    vi.advanceTimersByTime(10_000)
    c.start()
    expect(c.remaining.value).toBe(30)
    expect(vi.getTimerCount()).toBe(1)
    c.cleanup()
  })

  it('duración 0 (o inválida): ya terminado y sin timer', () => {
    for (const bad of [0, -3, Number.NaN]) {
      const c = useRestCountdown(bad)
      c.start()
      expect(c.isDone.value).toBe(true)
      expect(c.remaining.value).toBe(0)
      expect(c.fractionLeft.value).toBe(0)
      expect(vi.getTimerCount()).toBe(0)
    }
  })

  it('duraciones con decimales se truncan a segundos enteros', () => {
    const c = useRestCountdown(59.9)
    expect(c.total).toBe(59)
    expect(c.remaining.value).toBe(59)
  })
})
