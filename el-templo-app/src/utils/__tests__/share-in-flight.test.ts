import { describe, it, expect, afterEach, vi } from 'vitest'
import { shareInFlight } from '../share-in-flight'

/** Respuesta controlable a mano para observar el estado "en vuelo". */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('shareInFlight', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('dos run() antes de que resuelva la primera devuelven la misma promesa y fn se llama una vez', async () => {
    const d = deferred<number>()
    const fn = vi.fn(() => d.promise)
    const shared = shareInFlight(fn)

    const a = shared.run()
    const b = shared.run()
    expect(b).toBe(a)
    expect(fn).toHaveBeenCalledTimes(1)

    d.resolve(7)
    await expect(a).resolves.toBe(7)
  })

  it('los argumentos de la primera llamada ganan mientras está en vuelo', async () => {
    const d = deferred<string>()
    const fn = vi.fn((_mode: string) => d.promise)
    const shared = shareInFlight(fn)

    const a = shared.run('initial')
    const b = shared.run('refresh')
    expect(b).toBe(a)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('initial')

    d.resolve('ok')
    await a
  })

  it('después de resolver, la siguiente run() vuelve a llamar a fn', async () => {
    const fn = vi.fn(async () => 1)
    const shared = shareInFlight(fn)

    await shared.run()
    expect(shared.isInFlight()).toBe(false)
    await shared.run()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('si fn rechaza, todos los que esperaban reciben el rechazo y isInFlight vuelve a false', async () => {
    const d = deferred<number>()
    const shared = shareInFlight(() => d.promise)

    const a = shared.run()
    const b = shared.run()
    const results = Promise.allSettled([a, b])
    d.reject(new Error('boom'))
    const [ra, rb] = await results
    expect(ra.status).toBe('rejected')
    expect(rb.status).toBe('rejected')
    expect(shared.isInFlight()).toBe(false)
  })

  it('después de un rechazo la siguiente run() vuelve a llamar a fn', async () => {
    const fn = vi.fn<() => Promise<number>>()
    fn.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(2)
    const shared = shareInFlight(fn)

    await expect(shared.run()).rejects.toThrow('boom')
    await expect(shared.run()).resolves.toBe(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('reset() suelta la promesa en vuelo sin cancelarla: la próxima run() llama a fn de nuevo', async () => {
    const first = deferred<number>()
    const second = deferred<number>()
    const fn = vi.fn<() => Promise<number>>()
    fn.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const shared = shareInFlight(fn)

    const a = shared.run()
    expect(shared.isInFlight()).toBe(true)
    shared.reset()
    expect(shared.isInFlight()).toBe(false)

    const b = shared.run()
    expect(b).not.toBe(a)
    expect(fn).toHaveBeenCalledTimes(2)

    // La vieja termina después del reset: no suelta a la nueva.
    first.resolve(1)
    await a
    expect(shared.isInFlight()).toBe(true)

    second.resolve(2)
    await expect(b).resolves.toBe(2)
    expect(shared.isInFlight()).toBe(false)
  })

  it('con maxInFlightMs: antes de la vigencia comparte, pasada la vigencia arranca una nueva', async () => {
    vi.useFakeTimers()
    const never = new Promise<number>(() => {})
    const fn = vi.fn<() => Promise<number>>()
    fn.mockReturnValueOnce(never).mockResolvedValueOnce(5)
    const shared = shareInFlight(fn, { maxInFlightMs: 15_000 })

    const a = shared.run()
    vi.advanceTimersByTime(14_000)
    expect(shared.isInFlight()).toBe(true)
    expect(shared.run()).toBe(a)
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2_000)
    expect(shared.isInFlight()).toBe(false)
    const b = shared.run()
    expect(b).not.toBe(a)
    expect(fn).toHaveBeenCalledTimes(2)
    await expect(b).resolves.toBe(5)
  })

  it('vigencia vencida: si la vieja resuelve tarde, su finally no suelta a la nueva', async () => {
    vi.useFakeTimers()
    const old = deferred<number>()
    const fresh = deferred<number>()
    const fn = vi.fn<() => Promise<number>>()
    fn.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    const shared = shareInFlight(fn, { maxInFlightMs: 15_000 })

    const a = shared.run()
    vi.advanceTimersByTime(16_000)
    const b = shared.run()
    expect(shared.isInFlight()).toBe(true)

    old.resolve(1)
    await a
    expect(shared.isInFlight()).toBe(true)
    expect(shared.run()).toBe(b)

    fresh.resolve(2)
    await b
    expect(shared.isInFlight()).toBe(false)
  })

  it('waitInFlight() sin carga en vuelo resuelve enseguida', async () => {
    const shared = shareInFlight(async () => 1, { maxInFlightMs: 15_000 })
    await expect(shared.waitInFlight()).resolves.toBeUndefined()
  })

  it('waitInFlight() resuelve cuando la en vuelo termina, bien o mal, y nunca rechaza', async () => {
    const ok = deferred<number>()
    const sharedOk = shareInFlight(() => ok.promise, { maxInFlightMs: 15_000 })
    void sharedOk.run()
    let okDone = false
    const waitOk = sharedOk.waitInFlight().then(() => {
      okDone = true
    })
    await Promise.resolve()
    expect(okDone).toBe(false)
    ok.resolve(1)
    await waitOk
    expect(okDone).toBe(true)

    const bad = deferred<number>()
    const sharedBad = shareInFlight(() => bad.promise)
    const run = sharedBad.run()
    const runAssertion = expect(run).rejects.toThrow('boom')
    const waitBad = sharedBad.waitInFlight()
    bad.reject(new Error('boom'))
    await expect(waitBad).resolves.toBeUndefined()
    await runAssertion
  })

  it('waitInFlight() resuelve al vencer la vigencia aunque la en vuelo esté colgada', async () => {
    vi.useFakeTimers()
    const shared = shareInFlight(() => new Promise<number>(() => {}), { maxInFlightMs: 15_000 })
    void shared.run()
    vi.advanceTimersByTime(5_000)

    let done = false
    const waiting = shared.waitInFlight().then(() => {
      done = true
    })
    vi.advanceTimersByTime(9_000)
    await Promise.resolve()
    expect(done).toBe(false)

    // Saltos relativos: faltaba 1 s de vigencia, se pasa de largo.
    vi.advanceTimersByTime(2_000)
    await waiting
    expect(done).toBe(true)
    expect(shared.isInFlight()).toBe(false)
  })

  it('sin maxInFlightMs no hay vigencia: una en vuelo sigue compartiéndose por mucho que pase el tiempo', () => {
    vi.useFakeTimers()
    const fn = vi.fn(() => new Promise<number>(() => {}))
    const shared = shareInFlight(fn)

    const a = shared.run()
    vi.advanceTimersByTime(10 * 60_000)
    expect(shared.isInFlight()).toBe(true)
    expect(shared.run()).toBe(a)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
