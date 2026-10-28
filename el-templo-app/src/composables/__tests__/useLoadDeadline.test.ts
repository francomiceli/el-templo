import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useLoadDeadline } from '../useLoadDeadline'
import { LOAD_DEADLINE_MS } from 'src/utils/load-deadline'

describe('useLoadDeadline (D-07)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('el tope por defecto es de 6 s', () => {
    expect(LOAD_DEADLINE_MS).toBe(6000)
  })

  it('passed arranca en false y sigue false sin start()', () => {
    const d = useLoadDeadline()
    expect(d.passed.value).toBe(false)
    vi.advanceTimersByTime(LOAD_DEADLINE_MS * 2)
    expect(d.passed.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('tras start(): a LOAD_DEADLINE_MS - 1 sigue false y a LOAD_DEADLINE_MS es true', () => {
    const d = useLoadDeadline()
    d.start()
    vi.advanceTimersByTime(LOAD_DEADLINE_MS - 1)
    expect(d.passed.value).toBe(false)
    vi.advanceTimersByTime(1)
    expect(d.passed.value).toBe(true)
    d.cleanup()
  })

  it('start() repetido deja un solo timer y reinicia passed a false', () => {
    const d = useLoadDeadline()
    d.start()
    vi.advanceTimersByTime(LOAD_DEADLINE_MS)
    expect(d.passed.value).toBe(true)

    d.start()
    expect(d.passed.value).toBe(false)
    expect(vi.getTimerCount()).toBe(1)

    // El reinicio cuenta desde el segundo start(), no desde el primero.
    vi.advanceTimersByTime(LOAD_DEADLINE_MS - 1)
    expect(d.passed.value).toBe(false)
    vi.advanceTimersByTime(1)
    expect(d.passed.value).toBe(true)
    d.cleanup()
  })

  it('cleanup() deja 0 timers y passed no cambia más', () => {
    const d = useLoadDeadline()
    d.start()
    d.cleanup()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(LOAD_DEADLINE_MS * 2)
    expect(d.passed.value).toBe(false)
  })

  it('cleanup() sin start() no rompe', () => {
    const d = useLoadDeadline()
    expect(() => d.cleanup()).not.toThrow()
  })

  it('al vencer no queda ningún timer vivo', () => {
    const d = useLoadDeadline()
    d.start()
    vi.advanceTimersByTime(LOAD_DEADLINE_MS)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('acepta un tope propio', () => {
    const d = useLoadDeadline(1500)
    d.start()
    vi.advanceTimersByTime(1499)
    expect(d.passed.value).toBe(false)
    vi.advanceTimersByTime(1)
    expect(d.passed.value).toBe(true)
    d.cleanup()
  })
})
