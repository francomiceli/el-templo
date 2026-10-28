import { describe, it, expect, beforeEach, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getPlatform: vi.fn(),
  prefsGet: vi.fn(),
  prefsSet: vi.fn(),
  requestReview: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: mocks.getPlatform } }))
vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: mocks.prefsGet, set: mocks.prefsSet },
}))
vi.mock('@capacitor-community/in-app-review', () => ({
  InAppReview: { requestReview: mocks.requestReview },
}))
vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: mocks.warn, error: vi.fn() }),
}))

import {
  MIN_DAYS_BETWEEN_REQUESTS,
  MIN_DAYS_SINCE_FIRST_SEEN,
  REVIEW_FIRST_SEEN_KEY,
  REVIEW_LAST_REQUEST_KEY,
  maybeRequestReview,
  shouldRequestReview,
} from '../in-app-review'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1760000000000
const daysAgo = (d: number) => NOW - d * DAY

describe('constantes', () => {
  it('claves versionadas y umbrales acordados', () => {
    expect(REVIEW_FIRST_SEEN_KEY).toBe('in_app_review_first_seen_v1')
    expect(REVIEW_LAST_REQUEST_KEY).toBe('in_app_review_last_request_v1')
    expect(MIN_DAYS_SINCE_FIRST_SEEN).toBe(14)
    expect(MIN_DAYS_BETWEEN_REQUESTS).toBe(120)
  })
})

describe('shouldRequestReview', () => {
  it('primer uso (sin firstSeenAt) -> false', () => {
    expect(shouldRequestReview({ firstSeenAt: null, lastRequestedAt: null, now: NOW })).toBe(false)
  })

  it('13 días desde el primer uso -> false', () => {
    expect(shouldRequestReview({ firstSeenAt: daysAgo(13), lastRequestedAt: null, now: NOW })).toBe(
      false,
    )
  })

  it('14 días exactos desde el primer uso y nunca pedido -> true', () => {
    expect(shouldRequestReview({ firstSeenAt: daysAgo(14), lastRequestedAt: null, now: NOW })).toBe(
      true,
    )
  })

  it('un milisegundo antes de los 14 días -> false', () => {
    expect(
      shouldRequestReview({ firstSeenAt: daysAgo(14) + 1, lastRequestedAt: null, now: NOW }),
    ).toBe(false)
  })

  it('pedido hace 119 días -> false', () => {
    expect(
      shouldRequestReview({ firstSeenAt: daysAgo(400), lastRequestedAt: daysAgo(119), now: NOW }),
    ).toBe(false)
  })

  it('pedido hace 120 días exactos -> true', () => {
    expect(
      shouldRequestReview({ firstSeenAt: daysAgo(400), lastRequestedAt: daysAgo(120), now: NOW }),
    ).toBe(true)
  })

  it('pedido ayer aunque lleve mucho tiempo usando la app -> false', () => {
    expect(
      shouldRequestReview({ firstSeenAt: daysAgo(400), lastRequestedAt: daysAgo(1), now: NOW }),
    ).toBe(false)
  })

  it('firstSeenAt en el futuro (reloj corrido) -> false', () => {
    expect(
      shouldRequestReview({ firstSeenAt: NOW + 5 * DAY, lastRequestedAt: null, now: NOW }),
    ).toBe(false)
  })
})

describe('maybeRequestReview', () => {
  let store: Map<string, string>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    store = new Map()
    mocks.getPlatform.mockReturnValue('ios')
    mocks.prefsGet.mockImplementation(async ({ key }: { key: string }) => ({
      value: store.get(key) ?? null,
    }))
    mocks.prefsSet.mockImplementation(async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value)
    })
    mocks.requestReview.mockResolvedValue(undefined)
  })

  it('en web no toca ni Preferences ni el plugin', async () => {
    mocks.getPlatform.mockReturnValue('web')
    await maybeRequestReview()
    expect(mocks.prefsGet).not.toHaveBeenCalled()
    expect(mocks.prefsSet).not.toHaveBeenCalled()
    expect(mocks.requestReview).not.toHaveBeenCalled()
  })

  it('primer uso: registra firstSeenAt y NO pide la reseña', async () => {
    await maybeRequestReview()
    expect(store.get(REVIEW_FIRST_SEEN_KEY)).toBe(String(NOW))
    expect(store.has(REVIEW_LAST_REQUEST_KEY)).toBe(false)
    expect(mocks.requestReview).not.toHaveBeenCalled()
  })

  it('con 13 días de uso no pide', async () => {
    store.set(REVIEW_FIRST_SEEN_KEY, String(daysAgo(13)))
    await maybeRequestReview()
    expect(mocks.requestReview).not.toHaveBeenCalled()
  })

  it('con 14 días de uso pide en iOS y guarda lastRequestedAt', async () => {
    store.set(REVIEW_FIRST_SEEN_KEY, String(daysAgo(14)))
    await maybeRequestReview()
    expect(mocks.requestReview).toHaveBeenCalledTimes(1)
    expect(store.get(REVIEW_LAST_REQUEST_KEY)).toBe(String(NOW))
    expect(store.get(REVIEW_FIRST_SEEN_KEY)).toBe(String(daysAgo(14)))
  })

  it('también pide en Android', async () => {
    mocks.getPlatform.mockReturnValue('android')
    store.set(REVIEW_FIRST_SEEN_KEY, String(daysAgo(30)))
    await maybeRequestReview()
    expect(mocks.requestReview).toHaveBeenCalledTimes(1)
  })

  it('no repite dentro de los 120 días: la segunda llamada no pide', async () => {
    store.set(REVIEW_FIRST_SEEN_KEY, String(daysAgo(30)))
    await maybeRequestReview()
    await maybeRequestReview()
    expect(mocks.requestReview).toHaveBeenCalledTimes(1)
  })

  it('con el último pedido hace 119 días no pide, a los 120 sí', async () => {
    store.set(REVIEW_FIRST_SEEN_KEY, String(daysAgo(500)))
    store.set(REVIEW_LAST_REQUEST_KEY, String(daysAgo(119)))
    await maybeRequestReview()
    expect(mocks.requestReview).not.toHaveBeenCalled()
    store.set(REVIEW_LAST_REQUEST_KEY, String(daysAgo(120)))
    await maybeRequestReview()
    expect(mocks.requestReview).toHaveBeenCalledTimes(1)
  })

  it('llamadas simultáneas piden una sola vez', async () => {
    store.set(REVIEW_FIRST_SEEN_KEY, String(daysAgo(30)))
    await Promise.all([maybeRequestReview(), maybeRequestReview()])
    expect(mocks.requestReview).toHaveBeenCalledTimes(1)
  })

  it('si el plugin falla no rompe, no guarda lastRequestedAt y loguea', async () => {
    store.set(REVIEW_FIRST_SEEN_KEY, String(daysAgo(30)))
    mocks.requestReview.mockRejectedValue(new Error('boom'))
    await expect(maybeRequestReview()).resolves.toBeUndefined()
    expect(store.has(REVIEW_LAST_REQUEST_KEY)).toBe(false)
    expect(mocks.warn).toHaveBeenCalledWith('Review request skipped', { error: 'boom' })
  })

  it('si Preferences falla no rompe', async () => {
    mocks.prefsGet.mockRejectedValue(new Error('storage down'))
    await expect(maybeRequestReview()).resolves.toBeUndefined()
    expect(mocks.requestReview).not.toHaveBeenCalled()
  })

  it('un firstSeenAt corrupto se trata como primer uso (se re-registra, no pide)', async () => {
    store.set(REVIEW_FIRST_SEEN_KEY, 'basura')
    await maybeRequestReview()
    expect(mocks.requestReview).not.toHaveBeenCalled()
    expect(store.get(REVIEW_FIRST_SEEN_KEY)).toBe(String(NOW))
  })

  it.each(['0', '-5', 'Infinity', 'NaN', ''])(
    'un firstSeenAt no válido (%j) se trata como primer uso y no pide',
    async (raw) => {
      store.set(REVIEW_FIRST_SEEN_KEY, raw)
      await maybeRequestReview()
      expect(mocks.requestReview).not.toHaveBeenCalled()
      expect(store.get(REVIEW_FIRST_SEEN_KEY)).toBe(String(NOW))
    },
  )

  it.each(['0', '-5', 'Infinity', 'NaN'])(
    'un lastRequestedAt no válido (%j) se ignora y no bloquea el pedido',
    async (raw) => {
      store.set(REVIEW_FIRST_SEEN_KEY, String(daysAgo(30)))
      store.set(REVIEW_LAST_REQUEST_KEY, raw)
      await maybeRequestReview()
      expect(mocks.requestReview).toHaveBeenCalledTimes(1)
    },
  )

  it('un lastRequestedAt corrupto se ignora y no bloquea el pedido', async () => {
    store.set(REVIEW_FIRST_SEEN_KEY, String(daysAgo(30)))
    store.set(REVIEW_LAST_REQUEST_KEY, 'basura')
    await maybeRequestReview()
    expect(mocks.requestReview).toHaveBeenCalledTimes(1)
  })
})
