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

// Controls what POST /auth/refresh does in the mocked axios below:
//  - 'ok': succeeds with a rotated token pair (default).
//  - 'network': throws an AxiosError with NO `.response` (no internet/timeout).
//  - 'rejected': throws an AxiosError with `.response.status = 401`.
let refreshBehavior: 'ok' | 'network' | 'rejected' = 'ok'

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

  // Shared by both the callable-instance form and `.post` — one place
  // decides what a POST /auth/refresh does for the current test.
  async function respondToRefresh(): Promise<{ data: unknown }> {
    refreshCallCount += 1
    // small async delay so concurrent callers share the in-flight promise
    await new Promise((r) => setTimeout(r, 10))
    if (refreshBehavior === 'network') {
      const err = new actual.AxiosError('Network Error')
      err.code = 'ERR_NETWORK'
      // No `.response` — this is the defining trait of a network failure.
      throw err
    }
    if (refreshBehavior === 'rejected') {
      const err = new actual.AxiosError('Unauthorized')
      err.response = {
        status: 401,
        data: {},
        statusText: '',
        headers: {},
        config: {} as never,
      }
      throw err
    }
    return { data: { accessToken: 'new-access', refreshToken: 'refresh-2' } }
  }

  function makeInstance() {
    const instance = (async (config: Record<string, unknown>) => {
      const url = String(config.url)
      if (url.includes('/auth/refresh')) {
        return respondToRefresh()
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
        return respondToRefresh()
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

import { ref } from 'vue'
import type { Router } from 'vue-router'
import {
  createAuthErrorHandler,
  createSessionRejectedRedirect,
  onSessionRejected,
  runRefresh,
  __resetRefreshLock,
} from '../axios'
import { resolveGuardRedirect } from 'src/router/guards'

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
    refreshBehavior = 'ok'
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
    expect(a).toEqual({ kind: 'ok', token: 'new-access' })
    expect(refreshCallCount).toBe(1)
    // lock reset -> a fresh refresh is allowed
    tokenState.refresh = 'refresh-2'
    const b = await runRefresh()
    expect(b).toEqual({ kind: 'ok', token: 'new-access' })
    expect(refreshCallCount).toBe(2)
  })

  // ── App 1.7.9: causa raíz de deslogueos — network vs. rejected ───────────

  it('runRefresh: un error de red en /auth/refresh devuelve {kind: "network"} y NO borra tokens', async () => {
    refreshBehavior = 'network'
    const result = await runRefresh()
    expect(result).toEqual({ kind: 'network' })
    expect(tokenState.access).toBe('old-access')
    expect(tokenState.refresh).toBe('refresh-1')
  })

  it('runRefresh: un 401 en /auth/refresh devuelve {kind: "rejected"} y SÍ borra tokens', async () => {
    refreshBehavior = 'rejected'
    const result = await runRefresh()
    expect(result).toEqual({ kind: 'rejected' })
    expect(tokenState.access).toBeNull()
    expect(tokenState.refresh).toBeNull()
  })

  it('el handler: red en el refresh NO redirige ni borra tokens, rechaza la request original como error de red', async () => {
    refreshBehavior = 'network'
    const onRedirect = vi.fn(async () => {})
    const retryInstance = (async () => ({ data: { ok: true } })) as unknown as AxiosInstance
    const handler = createAuthErrorHandler(retryInstance, onRedirect)

    const originalError = make401('/protected/x')
    await expect(handler(originalError)).rejects.toBe(originalError)

    expect(originalError.message).toBe('Error de red. Revisá tu conexión a internet.')
    expect(onRedirect).not.toHaveBeenCalled()
    // La sesión sigue viva: los tokens NO se tocaron.
    expect(tokenState.access).toBe('old-access')
    expect(tokenState.refresh).toBe('refresh-1')
  })

  it('el handler: 401 en el refresh SÍ redirige y borra tokens', async () => {
    refreshBehavior = 'rejected'
    const onRedirect = vi.fn(async () => {})
    const retryInstance = (async () => ({ data: { ok: true } })) as unknown as AxiosInstance
    const handler = createAuthErrorHandler(retryInstance, onRedirect)

    const originalError = make401('/protected/x')
    await expect(handler(originalError)).rejects.toBe(originalError)

    expect(onRedirect).toHaveBeenCalledTimes(1)
    expect(tokenState.access).toBeNull()
    expect(tokenState.refresh).toBeNull()
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

  it('un error de red (sin response) se traduce a castellano en el mensaje', async () => {
    const onRedirect = vi.fn(async () => {})
    const retryInstance = (async () => ({ data: {} })) as unknown as AxiosInstance
    const handler = createAuthErrorHandler(retryInstance, onRedirect)

    // Sin internet: axios deja message "Network Error", code ERR_NETWORK y SIN response.
    const netErr = new Error('Network Error') as AxiosError
    netErr.isAxiosError = true
    netErr.code = 'ERR_NETWORK'

    await expect(handler(netErr)).rejects.toBe(netErr)
    expect(netErr.message).toBe('Error de red. Revisá tu conexión a internet.')
    // No dispara refresh ni redirect: no es un 401.
    expect(refreshCallCount).toBe(0)
    expect(onRedirect).not.toHaveBeenCalled()
  })

  it('una request cancelada (ERR_CANCELED) NO se reescribe como error de red', async () => {
    const onRedirect = vi.fn(async () => {})
    const retryInstance = (async () => ({ data: {} })) as unknown as AxiosInstance
    const handler = createAuthErrorHandler(retryInstance, onRedirect)

    const canceled = new Error('canceled') as AxiosError
    canceled.isAxiosError = true
    canceled.code = 'ERR_CANCELED'

    await expect(handler(canceled)).rejects.toBe(canceled)
    expect(canceled.message).toBe('canceled')
  })
})

// App 1.9.9: el servidor rechaza la sesión → además de los tokens hay que vaciar la sesión en
// memoria (useAuthStore) ANTES de navegar. Si no, el guard ve "logueado yendo a /login", lo
// manda a home y el socio queda adentro con todo en 401 (Sentry AuraDetailSheet/WeekData).
describe('createSessionRejectedRedirect (sesión rechazada → login de verdad)', () => {
  // Sesión en memoria como la tiene useAuthStore: isAuthenticated = token && user.
  const session = { token: 'old-access' as string | null, user: { id: 7 } as unknown }
  const isAuthenticated = (): boolean => !!session.token && !!session.user
  const clearSession = vi.fn(() => {
    session.token = null
    session.user = null
  })

  /** Router falso cuyo push corre la misma decisión que el guard real, con la sesión de ese momento. */
  function makeRouter(path: string) {
    const guardDecisions: Array<ReturnType<typeof resolveGuardRedirect>> = []
    const push = vi.fn(async (to: string) => {
      guardDecisions.push(
        resolveGuardRedirect({
          toName: to === '/login' ? 'login' : undefined,
          toPath: to,
          fromName: 'home',
          isAuthenticated: isAuthenticated(),
          role: 'member',
          onboardingCompleted: true,
          isFreemium: false,
          hasActiveBarAttempt: false,
        }),
      )
    })
    const router = { currentRoute: ref({ path }), push } as unknown as Pick<
      Router,
      'currentRoute' | 'push'
    >
    return { router, push, guardDecisions }
  }

  const clearTokens = vi.fn(async () => {
    tokenState.access = null
    tokenState.refresh = null
  })

  beforeEach(() => {
    vi.clearAllMocks()
    session.token = 'old-access'
    session.user = { id: 7 }
    tokenState.access = 'old-access'
    tokenState.refresh = 'refresh-1'
    tokenState.legacyOnly = false
    refreshBehavior = 'ok'
    onSessionRejected(clearSession)
  })

  it('borra tokens y sesión en memoria, y el guard deja entrar a /login (no rebota a home)', async () => {
    const { router, push, guardDecisions } = makeRouter('/mi-templo')

    await createSessionRejectedRedirect(router, clearTokens)()

    expect(clearTokens).toHaveBeenCalledTimes(1)
    expect(clearSession).toHaveBeenCalledTimes(1)
    expect(isAuthenticated()).toBe(false)
    expect(push).toHaveBeenCalledWith('/login')
    expect(guardDecisions).toEqual([true])
  })

  it('ya en /login no vuelve a navegar, pero igual vacía la sesión', async () => {
    const { router, push } = makeRouter('/login')

    await createSessionRejectedRedirect(router, clearTokens)()

    expect(clearSession).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('de punta a punta: 401 en el refresh desde Mi Templo termina en /login sin sesión', async () => {
    refreshBehavior = 'rejected'
    __resetRefreshLock()
    const { router, guardDecisions } = makeRouter('/mi-templo')
    const handler = createAuthErrorHandler(
      vi.fn() as unknown as AxiosInstance,
      createSessionRejectedRedirect(router, clearTokens),
    )

    await expect(handler(make401('/aura/me'))).rejects.toBeDefined()

    expect(isAuthenticated()).toBe(false)
    expect(guardDecisions).toEqual([true])
  })
})
