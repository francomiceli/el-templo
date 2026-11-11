import { describe, it, expect, beforeEach, vi } from 'vitest'
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
import { useStretchCompletion } from '../useStretchCompletion'

const RESPONSE: StretchCompleteResponse = {
  completedAt: '2026-11-11T19:00:00.000Z',
  durationSeconds: 400,
  allDone: true,
  auraAwarded: true,
  alreadyCompleted: false,
  minutes: 7,
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
    it('éxito: manda offerId + ejercicios, devuelve la respuesta y la aplica al store', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: RESPONSE })
      const { complete, isSubmitting, error } = useStretchCompletion()

      const res = await complete({ offerId: 5, exercisesCompleted: [1, 2] })

      expect(res).toEqual(RESPONSE)
      expect(api.post).toHaveBeenCalledWith('/sessions/stretch/complete', {
        offerId: 5,
        exercisesCompleted: [1, 2],
      })
      expect(stretchStoreMock.applyCompletion).toHaveBeenCalledWith(RESPONSE)
      expect(isSubmitting.value).toBe(false)
      expect(error.value).toBeNull()
    })

    it('410: devuelve null, error con el mensaje del servidor y log.warn', async () => {
      vi.mocked(api.post).mockRejectedValue(httpError(410, { error: 'Este estiramiento ya venció' }))
      const { complete, error } = useStretchCompletion()

      const res = await complete({ offerId: 5, exercisesCompleted: [] })

      expect(res).toBeNull()
      expect(error.value).toBe('Este estiramiento ya venció')
      expect(logMock.warn).toHaveBeenCalled()
      expect(logMock.error).not.toHaveBeenCalled()
      expect(stretchStoreMock.applyCompletion).not.toHaveBeenCalled()
    })

    it('410 sin mensaje del servidor: usa "Este estiramiento ya venció"', async () => {
      vi.mocked(api.post).mockRejectedValue(httpError(410, {}))
      const { complete, error } = useStretchCompletion()

      await complete({ offerId: 5, exercisesCompleted: [] })

      expect(error.value).toBe('Este estiramiento ya venció')
    })

    it('404 (oferta ajena): null y log.warn, sin Sentry', async () => {
      vi.mocked(api.post).mockRejectedValue(
        httpError(404, { error: 'No encontramos ese estiramiento' }),
      )
      const { complete, error } = useStretchCompletion()

      expect(await complete({ offerId: 5, exercisesCompleted: [] })).toBeNull()
      expect(error.value).toBe('No encontramos ese estiramiento')
      expect(logMock.warn).toHaveBeenCalled()
      expect(logMock.error).not.toHaveBeenCalled()
    })

    it('5xx: null, mensaje y log.error', async () => {
      vi.mocked(api.post).mockRejectedValue(httpError(500, { error: 'boom' }))
      const { complete, error } = useStretchCompletion()

      const res = await complete({ offerId: 5, exercisesCompleted: [] })

      expect(res).toBeNull()
      expect(error.value).toBe('boom')
      expect(logMock.error).toHaveBeenCalled()
    })

    it('error de red sin respuesta: null, mensaje legible y log.error', async () => {
      vi.mocked(api.post).mockRejectedValue('timeout')
      const { complete, error } = useStretchCompletion()

      expect(await complete({ offerId: 5, exercisesCompleted: [] })).toBeNull()
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

      const first = complete({ offerId: 5, exercisesCompleted: [1] })
      expect(isSubmitting.value).toBe(true)
      expect(await complete({ offerId: 5, exercisesCompleted: [1] })).toBeNull()
      resolve({ data: RESPONSE })
      expect(await first).toEqual(RESPONSE)
      expect(api.post).toHaveBeenCalledTimes(1)
      expect(isSubmitting.value).toBe(false)
    })

    it('un éxito posterior limpia el error de un intento fallido', async () => {
      vi.mocked(api.post).mockRejectedValueOnce(httpError(500, { error: 'boom' }))
      vi.mocked(api.post).mockResolvedValueOnce({ data: RESPONSE })
      const { complete, error } = useStretchCompletion()

      await complete({ offerId: 5, exercisesCompleted: [] })
      expect(error.value).toBe('boom')
      await complete({ offerId: 5, exercisesCompleted: [] })
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

  describe('cleanup', () => {
    it('resetea isSubmitting y error', async () => {
      vi.mocked(api.post).mockRejectedValue(httpError(500, { error: 'boom' }))
      const { complete, error, isSubmitting, cleanup } = useStretchCompletion()
      await complete({ offerId: 5, exercisesCompleted: [] })
      expect(error.value).toBe('boom')

      cleanup()

      expect(error.value).toBeNull()
      expect(isSubmitting.value).toBe(false)
    })
  })
})
