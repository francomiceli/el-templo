/**
 * Promesa compartida mientras un pedido está en vuelo.
 *
 * Generaliza `runRefresh` de `boot/axios.ts`: si `run()` se llama de nuevo antes
 * de que la primera llamada termine, todos reciben LA MISMA promesa y `fn` se
 * ejecuta una sola vez (los argumentos de la primera llamada ganan mientras está
 * en vuelo). Cuando termina (bien o mal) la siguiente `run()` vuelve a llamar a `fn`.
 *
 * `reset()` suelta la promesa en vuelo SIN cancelarla (el pedido sigue su curso):
 * sirve para el logout y los tests. Si la vieja termina después, su `finally` no
 * toca a una corrida más nueva (se compara con la promesa actual).
 *
 * `maxInFlightMs` (opcional) existe porque en nativo CapacitorHttp ignora el
 * timeout de axios: un pedido colgado dejaría la promesa compartida para siempre y
 * todas las cargas siguientes se quedarían esperándola. Pasado ese tiempo, la
 * en vuelo deja de contar (`isInFlight()` false) y la próxima `run()` arranca una
 * nueva; la vieja, si resuelve tarde, no pisa a la nueva.
 */
export interface SharedInFlight<A extends unknown[], T> {
  /** Devuelve la promesa en vuelo (vigente) o arranca `fn(...args)`. */
  run: (...args: A) => Promise<T>
  /** Suelta la promesa en vuelo sin cancelarla. Para logout y tests. */
  reset: () => void
  /** Hay una corrida en vuelo y su vigencia no venció. */
  isInFlight: () => boolean
  /**
   * Resuelve cuando la corrida en vuelo termina (bien o mal) o cuando vence su
   * vigencia, lo que pase primero. Sin corrida en vuelo resuelve enseguida. Nunca rechaza.
   */
  waitInFlight: () => Promise<void>
}

const noop = (): void => {}

export function shareInFlight<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>,
  opts: { maxInFlightMs?: number } = {},
): SharedInFlight<A, T> {
  let inFlight: Promise<T> | null = null
  let startedAt = 0

  function expired(): boolean {
    return opts.maxInFlightMs !== undefined && Date.now() - startedAt >= opts.maxInFlightMs
  }

  function isInFlight(): boolean {
    return inFlight !== null && !expired()
  }

  function run(...args: A): Promise<T> {
    if (inFlight !== null && !expired()) return inFlight
    startedAt = Date.now()
    const current: Promise<T> = fn(...args).finally(() => {
      if (inFlight === current) inFlight = null
    })
    inFlight = current
    return current
  }

  function reset(): void {
    inFlight = null
  }

  function waitInFlight(): Promise<void> {
    const pending = inFlight
    if (pending === null || expired()) return Promise.resolve()
    const finished = pending.then(noop, noop)
    if (opts.maxInFlightMs === undefined) return finished
    const remaining = Math.max(0, startedAt + opts.maxInFlightMs - Date.now())
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, remaining)
      void finished.then(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  return { run, reset, isInFlight, waitInFlight }
}
