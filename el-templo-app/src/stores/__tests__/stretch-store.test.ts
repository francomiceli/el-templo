import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { StretchCompleteResponse, StretchTodayResponse } from 'src/modules/training/types/stretch'

/**
 * Fase 213-09: store de la oferta de estiramiento de hoy (fuente de la card y del player).
 * Fail-open (fase 203, regla 1): una falla es "no sé", nunca "no".
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
  api: { get: vi.fn(), post: vi.fn() },
}))

const userStoreMock = vi.hoisted(() => ({
  profile: { branchTimezone: 'America/Argentina/Buenos_Aires' } as {
    branchTimezone: string
  } | null,
}))
vi.mock('src/stores/useUserStore', () => ({
  useUserStore: () => userStoreMock,
}))

import { api } from 'src/boot/axios'
import { useStretchStore } from '../useStretchStore'

// 2026-11-11 15:00 en Buenos Aires.
const NOW_DAY_1 = new Date('2026-11-11T18:00:00.000Z')
const NOW_DAY_2 = new Date('2026-11-12T18:00:00.000Z')

function today(overrides: Partial<StretchTodayResponse> = {}): StretchTodayResponse {
  return {
    status: 'available',
    localDate: '2026-11-11',
    offerId: 5,
    exercises: [
      {
        exerciseId: 1,
        name: 'Isquios',
        family: 'LS',
        dose: { unit: 'seconds', value: 30, max: null },
        videoUrl: null,
      },
    ],
    completedAt: null,
    auraAwarded: false,
    ...overrides,
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useStretchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW_DAY_1)
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.post).mockResolvedValue({ data: { ok: true } })
    for (const fn of Object.values(logMock)) fn.mockReset()
    userStoreMock.profile = { branchTimezone: 'America/Argentina/Buenos_Aires' }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('load', () => {
    it('antes de cargar: sin dato, loaded false y la card queda como hoy (none)', () => {
      const s = useStretchStore()
      expect(s.today).toBeNull()
      expect(s.loaded).toBe(false)
      expect(s.cardInput).toEqual({ status: 'none' })
    })

    it('OK: guarda la respuesta, loaded true, loadFailed false', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: today() })
      const s = useStretchStore()
      await s.load()
      expect(api.get).toHaveBeenCalledWith('/sessions/stretch/today')
      expect(s.today?.offerId).toBe(5)
      expect(s.loaded).toBe(true)
      expect(s.loadFailed).toBe(false)
      expect(s.cardInput).toEqual({ status: 'available' })
    })

    it('error en la primera carga: loadFailed true, sin dato y la card queda none (no ofrece ni oculta)', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('network'))
      const s = useStretchStore()
      await s.load()
      expect(s.loadFailed).toBe(true)
      expect(s.loaded).toBe(true)
      expect(s.today).toBeNull()
      expect(s.cardInput).toEqual({ status: 'none' })
      expect(logMock.warn).toHaveBeenCalled()
    })

    it('error en un refresco del MISMO día: conserva el dato previo (no parpadea)', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: today() })
      const s = useStretchStore()
      await s.load()
      vi.mocked(api.get).mockRejectedValueOnce(new Error('network'))
      await s.load()
      expect(s.loadFailed).toBe(true)
      expect(s.today?.localDate).toBe('2026-11-11')
      expect(s.cardInput).toEqual({ status: 'available' })
    })

    it('error en un refresco al día siguiente: NO muestra el dato viejo de otro día', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: today() })
      const s = useStretchStore()
      await s.load()
      vi.setSystemTime(NOW_DAY_2)
      vi.mocked(api.get).mockRejectedValueOnce(new Error('network'))
      await s.load()
      expect(s.loadFailed).toBe(true)
      expect(s.today).toBeNull()
      expect(s.cardInput).toEqual({ status: 'none' })
    })

    it('mientras recarga al día siguiente no muestra el dato de ayer', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: today() })
      const s = useStretchStore()
      await s.load()
      vi.setSystemTime(NOW_DAY_2)
      const d = deferred<{ data: StretchTodayResponse }>()
      vi.mocked(api.get).mockReturnValueOnce(d.promise)
      const pending = s.load()
      expect(s.cardInput).toEqual({ status: 'none' })
      d.resolve({ data: today({ localDate: '2026-11-12', offerId: 9 }) })
      await pending
      expect(s.cardInput).toEqual({ status: 'available' })
    })

    it('mientras recarga el mismo día conserva el dato (no vuelve a none)', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: today() })
      const s = useStretchStore()
      await s.load()
      const d = deferred<{ data: StretchTodayResponse }>()
      vi.mocked(api.get).mockReturnValueOnce(d.promise)
      const pending = s.load()
      expect(s.cardInput.status).toBe('available')
      d.resolve({ data: today({ status: 'done' }) })
      await pending
      expect(s.cardInput.status).toBe('done')
    })

    it('dos load() superpuestos: gana el último aunque el primero responda tarde', async () => {
      const first = deferred<{ data: StretchTodayResponse }>()
      const second = deferred<{ data: StretchTodayResponse }>()
      vi.mocked(api.get).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const s = useStretchStore()
      const p1 = s.load()
      const p2 = s.load()
      second.resolve({ data: today({ offerId: 9 }) })
      await p2
      first.resolve({ data: today({ offerId: 3 }) })
      await p1
      expect(s.today?.offerId).toBe(9)
    })

    it('un error de un load() viejo no pisa el dato del último', async () => {
      const first = deferred<{ data: StretchTodayResponse }>()
      vi.mocked(api.get)
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce({ data: today({ offerId: 9 }) })
      const s = useStretchStore()
      const p1 = s.load()
      await s.load()
      first.reject(new Error('late'))
      await p1
      expect(s.today?.offerId).toBe(9)
      expect(s.loadFailed).toBe(false)
    })

    it('un status none del servidor (sin oferta) queda como none', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: today({ status: 'none', offerId: null, exercises: [] }),
      })
      const s = useStretchStore()
      await s.load()
      expect(s.cardInput).toEqual({ status: 'none' })
    })
  })

  describe('markCardSeen', () => {
    it('manda card_seen una sola vez por día con la oferta available', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: today() })
      const s = useStretchStore()
      await s.load()
      await s.markCardSeen()
      await s.markCardSeen()
      expect(api.post).toHaveBeenCalledTimes(1)
      expect(api.post).toHaveBeenCalledWith('/sessions/stretch/events', { type: 'card_seen' })
    })

    it('no manda nada si no hay dato, si no está available o si ya está hecho', async () => {
      const s = useStretchStore()
      await s.markCardSeen()
      vi.mocked(api.get).mockResolvedValueOnce({ data: today({ status: 'none', offerId: null }) })
      await s.load()
      await s.markCardSeen()
      vi.mocked(api.get).mockResolvedValueOnce({ data: today({ status: 'done' }) })
      await s.load()
      await s.markCardSeen()
      expect(api.post).not.toHaveBeenCalled()
    })

    it('al día siguiente (otro localDate) vuelve a mandar', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: today() })
      const s = useStretchStore()
      await s.load()
      await s.markCardSeen()
      vi.setSystemTime(NOW_DAY_2)
      vi.mocked(api.get).mockResolvedValueOnce({ data: today({ localDate: '2026-11-12', offerId: 6 }) })
      await s.load()
      await s.markCardSeen()
      expect(api.post).toHaveBeenCalledTimes(2)
    })

    it('un error de red se loguea y no lanza', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: today() })
      vi.mocked(api.post).mockRejectedValue(new Error('network'))
      const s = useStretchStore()
      await s.load()
      await expect(s.markCardSeen()).resolves.toBeUndefined()
      expect(logMock.warn).toHaveBeenCalled()
    })

    it('llamadas simultáneas mandan un solo evento', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: today() })
      const s = useStretchStore()
      await s.load()
      await Promise.all([s.markCardSeen(), s.markCardSeen(), s.markCardSeen()])
      expect(api.post).toHaveBeenCalledTimes(1)
    })
  })

  describe('applyCompletion', () => {
    const RES: StretchCompleteResponse = {
      completedAt: '2026-11-11T19:00:00.000Z',
      durationSeconds: 400,
      auraAwarded: true,
      alreadyCompleted: false,
      minutes: 7,
    }

    it('pasa a done con completedAt y auraAwarded sin otra consulta', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: today() })
      const s = useStretchStore()
      await s.load()
      s.applyCompletion(RES)
      expect(s.today?.status).toBe('done')
      expect(s.today?.completedAt).toBe(RES.completedAt)
      expect(s.today?.auraAwarded).toBe(true)
      expect(s.today).not.toHaveProperty('minutes')
      expect(s.cardInput).toEqual({ status: 'done' })
      expect(api.get).toHaveBeenCalledTimes(1)
    })

    it('sin dato cargado no inventa estado', () => {
      const s = useStretchStore()
      s.applyCompletion(RES)
      expect(s.today).toBeNull()
    })
  })

  describe('reset', () => {
    it('limpia todo y un load en vuelo no repuebla el store (logout)', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: today() })
      const s = useStretchStore()
      await s.load()
      await s.markCardSeen()
      const d = deferred<{ data: StretchTodayResponse }>()
      vi.mocked(api.get).mockReturnValueOnce(d.promise)
      const pending = s.load()
      s.reset()
      d.resolve({ data: today({ offerId: 99 }) })
      await pending
      expect(s.today).toBeNull()
      expect(s.loaded).toBe(false)
      expect(s.loadFailed).toBe(false)
      expect(s.cardInput).toEqual({ status: 'none' })
    })

    it('después de reset vuelve a mandar card_seen', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: today() })
      const s = useStretchStore()
      await s.load()
      await s.markCardSeen()
      s.reset()
      await s.load()
      await s.markCardSeen()
      expect(api.post).toHaveBeenCalledTimes(2)
    })
  })
})
