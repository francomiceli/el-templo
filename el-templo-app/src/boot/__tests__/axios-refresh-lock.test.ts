import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AxiosError, AxiosInstance } from 'axios'

// --- Mocks installed BEFORE importing the module under test --------------

// In-memory token store driving the mocked useTokenStorage.
const tokenState = {
  access: 'old-access' as string | null,
  refresh: 'refresh-1' as string | null,
  legacyOnly: false,
}
let refreshCallCount = 0

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))

vi.mock('src/composables/useTokenStorage', () => ({
  useTokenStorage: () => ({
    getAccessToken: vi.fn(async () => tokenState.access),
    getRefreshToken: vi.fn(async () => tokenState.refresh),
    setTokens: vi.fn(async (a: string, r: string) => {
      tokenState.access = a
      tokenState.refresh = r
      tokenState.legacyOnly = false
    }),
    clearTokens: vi.fn(async () => {
      tokenState.access = null
      tokenState.refresh = null
      tokenState.legacyOnly = false
    }),
    hasLegacyOnly: vi.fn(async () => tokenState.legacyOnly),
  }),
}))

// Mock the logger so no console noise / Sentry in tests.
vi.mock('src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock axios.create so both `api` and the internal `refreshClient` are
// controllable. We track how many times POST /auth/refresh is called.
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios')

  function makeInstance() {
    const instance = (async (config: Record<string, unknown>) => {
      const url = String(config.url)
      if (url.includes('/auth/refresh')) {
        refreshCallCount += 1
        // small async delay so concurrent callers share the in-flight promise
        await new Promise((r) => setTimeout(r, 10))
        return {
          data: { accessToken: 'new-access', refreshToken: 'refresh-2' },
        }
      }
      // protected endpoints succeed once the access token has rotated
      if ((config.headers as Record<string, string>)?.Authorization?.includes('new-access')) {
        return { data: { ok: true }, config }
      }
      const err = new actual.AxiosError('Unauthorized')
      err.response = {
        status: 401,
        data: {},
        statusText: '',
        headers: {},
        config: config as never,
      }
      err.config = config as never
      throw err
    }) as unknown as AxiosInstance & {
      post: (url: string, body?: unknown) => Promise<unknown>
      interceptors: {
        request: { use: () => void }
        response: { use: () => void }
      }
    }
    instance.post = async (url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCallCount += 1
        await new Promise((r) => setTimeout(r, 10))
        return {
          data: { accessToken: 'new-access', refreshToken: 'refresh-2' },
        }
      }
      return { data: {} }
    }
    instance.interceptors = {
      request: { use: () => {} },
      response: { use: () => {} },
    }
    return instance
  }

  return {
    ...actual,
    default: { ...actual.default, create: () => makeInstance() },
    AxiosError: actual.AxiosError,
  }
})

import { createAuthErrorHandler, runRefresh, __resetRefreshLock } from '../axios'

function make401(url: string): AxiosError {
  const err = new Error('Unauthorized') as AxiosError
  err.isAxiosError = true
  err.config = {
    url,
    headers: {},
  } as never
  err.response = {
    status: 401,
    data: {},
    statusText: '',
    headers: {},
    config: err.config as never,
  }
  return err
}

describe('axios refresh lock (D-02, Req 9)', () => {
  beforeEach(() => {
    refreshCallCount = 0
    tokenState.access = 'old-access'
    tokenState.refresh = 'refresh-1'
    tokenState.legacyOnly = false
    __resetRefreshLock()
  })

  it('5 requests 401 concurrentes disparan exactamente UN /auth/refresh y los 5 se reintentan', async () => {
    // Build a retry instance that succeeds when the new access token is set.
    const retried: string[] = []
    const retryInstance = (async (config: Record<string, unknown>) => {
      retried.push((config.headers as Record<string, string>).Authorization ?? '')
      return { data: { ok: true } }
    }) as unknown as AxiosInstance

    const onRedirect = vi.fn(async () => {})
    const handler = createAuthErrorHandler(retryInstance, onRedirect)

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => handler(make401(`/protected/${i}`))),
    )

    // Exactly one /auth/refresh fired for the whole storm.
    expect(refreshCallCount).toBe(1)
    // All 5 requests were retried with the rotated access token.
    expect(retried).toHaveLength(5)
    expect(retried.every((h) => h === 'Bearer new-access')).toBe(true)
    // No redirect to login happened (refresh succeeded).
    expect(onRedirect).not.toHaveBeenCalled()
    expect(results).toHaveLength(5)
  })

  it('un 401 de /auth/refresh hace clear+redirect sin re-disparar refresh (loop prevention)', async () => {
    const onRedirect = vi.fn(async () => {})
    const retryInstance = (async () => ({ data: {} })) as unknown as AxiosInstance
    const handler = createAuthErrorHandler(retryInstance, onRedirect)

    await expect(handler(make401('/auth/refresh'))).rejects.toBeDefined()

    expect(refreshCallCount).toBe(0)
    expect(onRedirect).toHaveBeenCalledTimes(1)
  })

  it('runRefresh resetea el lock para permitir un refresh en la siguiente oleada', async () => {
    const a = await runRefresh()
    expect(a).toBe('new-access')
    expect(refreshCallCount).toBe(1)
    // lock reset -> a fresh refresh is allowed
    tokenState.refresh = 'refresh-2'
    const b = await runRefresh()
    expect(b).toBe('new-access')
    expect(refreshCallCount).toBe(2)
  })

  it('sin refreshToken disponible, el handler hace clear+redirect', async () => {
    tokenState.refresh = null
    const onRedirect = vi.fn(async () => {})
    const retryInstance = (async () => ({ data: {} })) as unknown as AxiosInstance
    const handler = createAuthErrorHandler(retryInstance, onRedirect)

    await expect(handler(make401('/protected/x'))).rejects.toBeDefined()
    expect(refreshCallCount).toBe(0)
    expect(onRedirect).toHaveBeenCalledTimes(1)
  })
})
