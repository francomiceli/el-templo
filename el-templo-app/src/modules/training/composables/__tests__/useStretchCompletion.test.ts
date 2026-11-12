import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import type { StretchCompleteResponse } from '../../types/stretch'

/**
 * Fase 213-09: completado del estiramiento y eventos del embudo (fire-and-forget).
 */

const logMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('src/utils/logger', () => ({
  createLogger: () => logMock,
}))

vi.mock('src/boot/axios', () => ({
  api: { post: vi.fn() },
}))

const stretchStoreMock = vi.hoisted(() => ({ applyCompletion: vi.fn() }))
vi.mock('src/stores/useStretchStore', () => ({
  useStretchStore: () => stretchStoreMock,
}))

import { api } from 'src/boot/axios'
import {
  useStretchCompletion,
  STARTED_MAX_ATTEMPTS,
  STARTED_RETRY_DELAYS_MS,
} from '../useStretchCompletion'

const RESPONSE: StretchCompleteResponse = {
  completedAt: '2026-11-11T19:00:00.000Z',
  durationSeconds: 400,
  auraAwarded: true,
  alreadyCompleted: false,
  minutes: 7,
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function httpError(status: number, data: Record<string, unknown>): AxiosError {
  const response: AxiosResponse = {
    status,
    statusText: String(status),
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  }
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, response)
}

describe('useStretchCompletion', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset()
    stretchStoreMock.applyCompletion.mockReset()
    for (const fn of Object.values(logMock)) fn.mockReset()
  })

  describe('complete', () => {
    it('éxito: manda SOLO el offerId, devuelve la respuesta y la aplica al store', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: RESPONSE })
      const { complete, isSubmitting, error } = useStretchCompletion()

      const res = await complete({ offerId: 5 })

      expect(res).toEqual(RESPONSE)
      expect(api.post).toHaveBeenCalledWith('/sessions/stretch/complete', { offerId: 5 })
      expect(stretchStoreMock.applyCompletion).toHaveBeenCalledWith(RESPONSE)
      expect(isSubmitting.value).toBe(false)
      expect(error.value).toBeNull()
    })

    it('410: devuelve null, error con el mensaje del servidor y log.warn', async () => {
      vi.mocked(api.post).mockRejectedValue(
        httpError(410, { error: 'Este estiramiento ya venció' }),
      )
      const { complete, error } = useStretchCompletion()

      const res = await complete({ offerId: 5 })

      expect(res).toBeNull()
      expect(error.value).toBe('Este estiramiento ya venció')
      expect(logMock.warn).toHaveBeenCalled()
      expect(logMock.error).not.toHaveBeenCalled()
      expect(stretchStoreMock.applyCompletion).not.toHaveBeenCalled()
    })

    it('410 sin mensaje del servidor: usa "Este estiramiento ya venció"', async () => {
      vi.mocked(api.post).mockRejectedValue(httpError(410, {}))
      const { complete, error } = useStretchCompletion()

      await complete({ offerId: 5 })

      expect(error.value).toBe('Este estiramiento ya venció')
    })

    it('404 (oferta ajena): null y log.warn, sin Sentry', async () => {
      vi.mocked(api.post).mockRejectedValue(
        httpError(404, { error: 'No encontramos ese estiramiento' }),
      )
      const { complete, error } = useStretchCompletion()

      expect(await complete({ offerId: 5 })).toBeNull()
      expect(error.value).toBe('No encontramos ese estiramiento')
      expect(logMock.warn).toHaveBeenCalled()
      expect(logMock.error).not.toHaveBeenCalled()
    })

    it('5xx: null, mensaje y log.error', async () => {
      vi.mocked(api.post).mockRejectedValue(httpError(500, { error: 'boom' }))
      const { complete, error } = useStretchCompletion()

      const res = await complete({ offerId: 5 })

      expect(res).toBeNull()
      expect(error.value).toBe('boom')
      expect(logMock.error).toHaveBeenCalled()
    })

    it('error de red sin respuesta: null, mensaje legible y log.error', async () => {
      vi.mocked(api.post).mockRejectedValue('timeout')
      const { complete, error } = useStretchCompletion()

      expect(await complete({ offerId: 5 })).toBeNull()
      expect(error.value).toBe('No pudimos guardar el estiramiento')
      expect(logMock.error).toHaveBeenCalled()
    })

    it('doble toque mientras está en vuelo: la segunda llamada no hace un segundo POST', async () => {
      let resolve!: (v: { data: StretchCompleteResponse }) => void
      vi.mocked(api.post).mockReturnValue(
        new Promise((res) => {
          resolve = res
        }),
      )
      const { complete, isSubmitting } = useStretchCompletion()

      const first = complete({ offerId: 5 })
      expect(isSubmitting.value).toBe(true)
      expect(await complete({ offerId: 5 })).toBeNull()
      resolve({ data: RESPONSE })
      expect(await first).toEqual(RESPONSE)
      expect(api.post).toHaveBeenCalledTimes(1)
      expect(isSubmitting.value).toBe(false)
    })

    it('un éxito posterior limpia el error de un intento fallido', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(httpError(500, { error: 'boom' }))
      vi.mocked(api.post).mockResolvedValueOnce({ data: RESPONSE })
      const { complete, error } = useStretchCompletion()

      await complete({ offerId: 5 })
      expect(error.value).toBe('boom')
      await complete({ offerId: 5 })
      expect(error.value).toBeNull()
    })
  })

  describe('sendEvent', () => {
    it('manda el tipo y el origen a /sessions/stretch/events', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: { ok: true } })
      const { sendEvent } = useStretchCompletion()

      await sendEvent('started', 'push')

      expect(api.post).toHaveBeenCalledWith('/sessions/stretch/events', {
        type: 'started',
        from: 'push',
      })
    })

    it('sin origen no manda el campo from', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: { ok: true } })
      const { sendEvent } = useStretchCompletion()

      await sendEvent('push_opened')

      expect(api.post).toHaveBeenCalledWith('/sessions/stretch/events', { type: 'push_opened' })
    })

    it('nunca lanza: error de red -> log.error con { message }', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('network down'))
      const { sendEvent } = useStretchCompletion()

      await expect(sendEvent('started', 'card')).resolves.toBeUndefined()
      expect(logMock.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'network down' }),
      )
    })

    it('404 (no hay oferta de hoy): no lanza y queda en warn, sin Sentry', async () => {
      vi.mocked(api.post).mockRejectedValue(httpError(404, { error: 'no hay oferta' }))
      const { sendEvent } = useStretchCompletion()

      await expect(sendEvent('started', 'card')).resolves.toBeUndefined()
      expect(logMock.warn).toHaveBeenCalled()
      expect(logMock.error).not.toHaveBeenCalled()
    })
  })

  describe('sendStarted (ME-03: reintentos del aviso de inicio)', () => {
    const EVENTS = '/sessions/stretch/events'
    const FIRST = STARTED_RETRY_DELAYS_MS[0] ?? 0
    const LONGEST = Math.max(...STARTED_RETRY_DELAYS_MS)

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('entra al primer intento: un solo POST y no reintenta', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: { ok: true } })
      const { sendStarted } = useStretchCompletion()

      sendStarted('push')
      await vi.advanceTimersByTimeAsync(LONGEST * 3)

      expect(api.post).toHaveBeenCalledTimes(1)
      expect(api.post).toHaveBeenCalledWith(EVENTS, { type: 'started', from: 'push' })
      expect(logMock.error).not.toHaveBeenCalled()
    })

    it('falla la red y después entra: reintenta tras la primera espera y corta', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('network down'))
      vi.mocked(api.post).mockResolvedValue({ data: { ok: true } })
      const { sendStarted } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(FIRST - 1)
      expect(api.post).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(api.post).toHaveBeenCalledTimes(2)
      expect(api.post).toHaveBeenLastCalledWith(EVENTS, { type: 'started', from: 'card' })

      await vi.advanceTimersByTimeAsync(LONGEST * 3)
      expect(api.post).toHaveBeenCalledTimes(2)
      // La falla intermedia no va a Sentry
      expect(logMock.warn).toHaveBeenCalled()
      expect(logMock.error).not.toHaveBeenCalled()
    })

    it('respeta la escalera de esperas y repite la última', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('network down'))
      const { sendStarted } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(0)
      let calls = 1
      expect(api.post).toHaveBeenCalledTimes(calls)

      const waits = [...STARTED_RETRY_DELAYS_MS, LONGEST]
      for (const wait of waits) {
        await vi.advanceTimersByTimeAsync(wait - 1)
        expect(api.post).toHaveBeenCalledTimes(calls)
        await vi.advanceTimersByTimeAsync(1)
        calls += 1
        expect(api.post).toHaveBeenCalledTimes(calls)
      }
    })

    it('un 4xx no se reintenta', async () => {
      vi.mocked(api.post).mockRejectedValue(httpError(404, { error: 'no hay oferta' }))
      const { sendStarted } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(LONGEST * 3)

      expect(api.post).toHaveBeenCalledTimes(1)
      expect(logMock.error).not.toHaveBeenCalled()
    })

    it('un 5xx sí se reintenta', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(httpError(503, { error: 'caído' }))
      vi.mocked(api.post).mockResolvedValue({ data: { ok: true } })
      const { sendStarted } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(FIRST)

      expect(api.post).toHaveBeenCalledTimes(2)
    })

    it('corta al llegar al tope de intentos', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('network down'))
      const { sendStarted } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(LONGEST * (STARTED_MAX_ATTEMPTS + 5))

      expect(api.post).toHaveBeenCalledTimes(STARTED_MAX_ATTEMPTS)
    })

    it('cleanup cancela el reintento agendado', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('network down'))
      const { sendStarted, cleanup } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(0)
      cleanup()
      await vi.advanceTimersByTimeAsync(LONGEST * 3)

      expect(api.post).toHaveBeenCalledTimes(1)
    })

    it('un intento en vuelo que falla después de cleanup no agenda otro', async () => {
      let reject!: (e: Error) => void
      vi.mocked(api.post).mockReturnValueOnce(
        new Promise((_res, rej) => {
          reject = rej
        }),
      )
      const { sendStarted, cleanup } = useStretchCompletion()

      sendStarted('card')
      cleanup()
      reject(new Error('network down'))
      await vi.advanceTimersByTimeAsync(LONGEST * 3)

      expect(api.post).toHaveBeenCalledTimes(1)
    })

    it('complete corta los reintentos y avisa que cerró sin inicio confirmado', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('network down'))
      vi.mocked(api.post).mockResolvedValue({ data: RESPONSE })
      const { sendStarted, complete } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(0)
      expect(await complete({ offerId: 5 })).toEqual(RESPONSE)
      await vi.advanceTimersByTimeAsync(LONGEST * 3)

      // 1 inicio fallido + 1 cierre: ningún inicio tardío
      expect(api.post).toHaveBeenCalledTimes(2)
      expect(api.post).toHaveBeenLastCalledWith('/sessions/stretch/complete', { offerId: 5 })
      expect(logMock.error).toHaveBeenCalledTimes(1)
      expect(logMock.error).toHaveBeenCalledWith(
        expect.stringContaining('sin aviso de inicio'),
        expect.objectContaining({ offerId: 5 }),
      )
    })

    it('con el inicio confirmado, complete no avisa nada', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ data: { ok: true } })
      vi.mocked(api.post).mockResolvedValue({ data: RESPONSE })
      const { sendStarted, complete } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(0)
      await complete({ offerId: 5 })

      expect(logMock.error).not.toHaveBeenCalled()
    })

    it('un segundo sendStarted reemplaza a la corrida anterior', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('network down'))
      vi.mocked(api.post).mockResolvedValue({ data: { ok: true } })
      const { sendStarted } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(0)
      sendStarted('card')
      await vi.advanceTimersByTimeAsync(LONGEST * 3)

      // 1 fallido de la primera corrida + 1 de la segunda: el reintento viejo no sale
      expect(api.post).toHaveBeenCalledTimes(2)
    })
  })

  describe('startedConfirmedAt (el AURA cuenta desde que el servidor aceptó el started)', () => {
    const FIRST = STARTED_RETRY_DELAYS_MS[0] ?? 0
    const T0 = new Date('2026-11-12T18:00:00.000Z')

    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(T0)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('arranca en null', () => {
      expect(useStretchCompletion().startedConfirmedAt.value).toBeNull()
    })

    it('queda en null hasta que el servidor responde y después guarda el Date.now() de ese momento', async () => {
      const d = deferred<{ data: { ok: boolean } }>()
      vi.mocked(api.post).mockReturnValueOnce(d.promise)
      const { sendStarted, startedConfirmedAt } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(5_000)
      expect(startedConfirmedAt.value).toBeNull()

      d.resolve({ data: { ok: true } })
      await vi.advanceTimersByTimeAsync(0)
      expect(startedConfirmedAt.value).toBe(T0.getTime() + 5_000)
    })

    it('una falla de red lo deja en null y el reintento exitoso lo fija con la hora del reintento', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('network down'))
      vi.mocked(api.post).mockResolvedValue({ data: { ok: true } })
      const { sendStarted, startedConfirmedAt } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(FIRST - 1)
      expect(startedConfirmedAt.value).toBeNull()

      await vi.advanceTimersByTimeAsync(1)
      expect(startedConfirmedAt.value).toBe(T0.getTime() + FIRST)
    })

    it('un 4xx lo deja en null (el servidor no aceptó el started)', async () => {
      vi.mocked(api.post).mockRejectedValue(httpError(404, { error: 'sin oferta' }))
      const { sendStarted, startedConfirmedAt } = useStretchCompletion()

      sendStarted('card')
      await vi.advanceTimersByTimeAsync(0)

      expect(startedConfirmedAt.value).toBeNull()
    })

    it('un sendStarted nuevo lo vuelve a null hasta que el servidor confirme de nuevo', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ data: { ok: true } })
      const { sendStarted, startedConfirmedAt } = useStretchCompletion()
      sendStarted('card')
      await vi.advanceTimersByTimeAsync(0)
      expect(startedConfirmedAt.value).toBe(T0.getTime())

      const d = deferred<{ data: { ok: boolean } }>()
      vi.mocked(api.post).mockReturnValueOnce(d.promise)
      await vi.advanceTimersByTimeAsync(10_000)
      sendStarted('card')
      expect(startedConfirmedAt.value).toBeNull()

      d.resolve({ data: { ok: true } })
      await vi.advanceTimersByTimeAsync(0)
      expect(startedConfirmedAt.value).toBe(T0.getTime() + 10_000)
    })

    it('una confirmación tardía de una corrida vieja no pisa a la nueva', async () => {
      const old = deferred<{ data: { ok: boolean } }>()
      vi.mocked(api.post).mockReturnValueOnce(old.promise)
      vi.mocked(api.post).mockRejectedValueOnce(new Error('network down'))
      const { sendStarted, startedConfirmedAt } = useStretchCompletion()

      sendStarted('card')
      sendStarted('card')
      await vi.advanceTimersByTimeAsync(0)
      old.resolve({ data: { ok: true } })
      await vi.advanceTimersByTimeAsync(0)

      expect(startedConfirmedAt.value).toBeNull()
    })

    it('cleanup lo vuelve a null', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: { ok: true } })
      const { sendStarted, startedConfirmedAt, cleanup } = useStretchCompletion()
      sendStarted('card')
      await vi.advanceTimersByTimeAsync(0)
      expect(startedConfirmedAt.value).not.toBeNull()

      cleanup()

      expect(startedConfirmedAt.value).toBeNull()
    })

    it('cerrar con complete() conserva el instante ya confirmado', async () => {
      vi.mocked(api.post).mockResolvedValueOnce({ data: { ok: true } })
      vi.mocked(api.post).mockResolvedValue({ data: RESPONSE })
      const { sendStarted, complete, startedConfirmedAt } = useStretchCompletion()
      sendStarted('card')
      await vi.advanceTimersByTimeAsync(0)

      await complete({ offerId: 5 })

      expect(startedConfirmedAt.value).toBe(T0.getTime())
    })
  })

  describe('cleanup', () => {
    it('resetea isSubmitting y error', async () => {
      vi.mocked(api.post).mockRejectedValue(httpError(500, { error: 'boom' }))
      const { complete, error, isSubmitting, cleanup } = useStretchCompletion()
      await complete({ offerId: 5 })
      expect(error.value).toBe('boom')

      cleanup()

      expect(error.value).toBeNull()
      expect(isSubmitting.value).toBe(false)
    })
  })
})
