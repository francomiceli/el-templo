import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TimeoutError, withTimeout } from '../with-timeout'

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resuelve con el valor si la promesa llega antes del tope y no deja timers', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('propaga el rechazo original si llega antes del tope y no deja timers', async () => {
    const original = new Error('Network Error')
    await expect(withTimeout(Promise.reject(original), 1000)).rejects.toBe(original)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rechaza con TimeoutError cuando la promesa nunca llega', async () => {
    const result = withTimeout(new Promise<never>(() => {}), 1000)
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })

  it('no rechaza un instante antes del tope', async () => {
    let settled = false
    void withTimeout(new Promise<never>(() => {}), 1000).catch(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toBe(true)
  })

  it('usa el error de makeError cuando se pasa', async () => {
    class MiError extends Error {}
    const result = withTimeout(new Promise<never>(() => {}), 50, () => new MiError('tarde'))
    const assertion = expect(result).rejects.toBeInstanceOf(MiError)
    await vi.advanceTimersByTimeAsync(50)
    await assertion
  })

  it('una respuesta tardía después del tope no cambia el rechazo', async () => {
    let resolveLate!: (v: string) => void
    const late = new Promise<string>((res) => {
      resolveLate = res
    })
    const result = withTimeout(late, 100)
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError)
    await vi.advanceTimersByTimeAsync(100)
    resolveLate('tarde')
    await assertion
  })
})
