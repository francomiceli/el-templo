import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AxiosError } from 'axios'

/**
 * App 1.7.9 (causa raíz de deslogueos): `runAuthBoot` (el core de boot/auth.ts,
 * ver export ahí) solo debe desloguear cuando el SERVIDOR rechaza la sesión
 * (401/403 de /auth/refresh o /auth/me) — nunca ante un error de red, timeout
 * o 5xx, que hoy borraban los tokens de un socio con sesión válida.
 *
 * Mismo patrón que axios-refresh-lock.test.ts: mockear los módulos ANTES de
 * importar el módulo bajo prueba, y usar mocks de store planos (no Pinia real)
 * para poder aserir exactamente qué se llamó.
 */

// --- Token storage (mismo patrón que axios-refresh-lock.test.ts) ----------

const tokenState = {
  access: null as string | null,
  refresh: 'refresh-1' as string | null,
  legacyOnly: false,
}

const clearTokens = vi.fn(async () => {
  tokenState.access = null
  tokenState.refresh = null
})

vi.mock('src/composables/useTokenStorage', () => ({
  useTokenStorage: () => ({
    getAccessToken: vi.fn(async () => tokenState.access),
    getRefreshToken: vi.fn(async () => tokenState.refresh),
    setTokens: vi.fn(async () => {}),
    clearTokens,
    hasLegacyOnly: vi.fn(async () => tokenState.legacyOnly),
  }),
}))

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// --- Stores (mocks planos, no Pinia real — alcanza para aserir llamadas) --

const authStoreMock = {
  token: null as string | null,
  user: null as unknown,
  clearAuth: vi.fn(() => {
    authStoreMock.token = null
    authStoreMock.user = null
  }),
  setAuth: vi.fn((token: string, user: unknown) => {
    authStoreMock.token = token
    authStoreMock.user = user
  }),
}

vi.mock('stores/useAuthStore', () => ({
  useAuthStore: () => authStoreMock,
}))

const userStoreMock = {
  setProfile: vi.fn(),
  markProfileStale: vi.fn(),
  hydrateSelection: vi.fn(async () => {}),
  loadSubscription: vi.fn(async () => {}),
  ensureMemberState: vi.fn(async () => {}),
}

vi.mock('stores/useUserStore', () => ({
  useUserStore: () => userStoreMock,
}))

// --- axios.ts (runRefresh discriminado + api.get + isSessionRejectedStatus) -

const apiGet = vi.fn()
const runRefresh = vi.fn()

vi.mock('../axios', () => ({
  api: { get: (...args: unknown[]) => apiGet(...args) },
  runRefresh: (...args: unknown[]) => runRefresh(...args),
  isSessionRejectedStatus: (status: number | undefined) => status === 401 || status === 403,
}))

import { runAuthBoot, BOOT_NETWORK_TIMEOUT_MS } from '../auth'

/** Fabrica un JWT sin firmar con el payload dado (alcanza para el decode del boot). */
function makeJwt(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `header.${payload}.sig`
}

const FUTURE_EXP = Math.floor(Date.now() / 1000) + 3600
const PAST_EXP = Math.floor(Date.now() / 1000) - 3600

const VALID_CLAIMS = { userId: 7, email: 'socio@test.com', role: 'member' as const }

function expiredToken(): string {
  return makeJwt({ ...VALID_CLAIMS, exp: PAST_EXP })
}

function freshToken(): string {
  return makeJwt({ ...VALID_CLAIMS, exp: FUTURE_EXP })
}

function networkError(): AxiosError {
  const err = new AxiosError('Network Error')
  err.code = 'ERR_NETWORK'
  return err // sin `.response`
}

function rejectedError(status: 401 | 403): AxiosError {
  const err = new AxiosError('Unauthorized')
  err.response = {
    status,
    data: {},
    statusText: '',
    headers: {},
    config: {} as never,
  }
  return err
}

describe('boot/auth.ts — runAuthBoot (App 1.7.9, causa raíz de deslogueos)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tokenState.access = null
    tokenState.refresh = 'refresh-1'
    tokenState.legacyOnly = false
    authStoreMock.token = null
    authStoreMock.user = null
  })

  it('sin access token guardado, no hace nada', async () => {
    await runAuthBoot()
    expect(runRefresh).not.toHaveBeenCalled()
    expect(apiGet).not.toHaveBeenCalled()
    expect(authStoreMock.clearAuth).not.toHaveBeenCalled()
  })

  describe('token expirado + refreshToken (dispara runRefresh)', () => {
    beforeEach(() => {
      tokenState.access = expiredToken()
    })

    it('refresh rechazado (401/403) → desloguea (clear + sin sesión)', async () => {
      runRefresh.mockResolvedValueOnce({ kind: 'rejected' })

      await runAuthBoot()

      expect(clearTokens).toHaveBeenCalledTimes(1)
      expect(authStoreMock.clearAuth).toHaveBeenCalledTimes(1)
      expect(apiGet).not.toHaveBeenCalled() // ni se intenta /auth/me: ya no hay sesión
    })

    it('refresh con error de red → NO desloguea, arranca logueado de forma optimista', async () => {
      runRefresh.mockResolvedValueOnce({ kind: 'network' })

      await runAuthBoot()

      expect(clearTokens).not.toHaveBeenCalled()
      expect(authStoreMock.clearAuth).not.toHaveBeenCalled()
      // Boot optimista: sesión poblada desde los claims del token, sin red.
      expect(authStoreMock.setAuth).toHaveBeenCalledWith(
        tokenState.access,
        expect.objectContaining({ id: 7, email: 'socio@test.com', role: 'member' }),
      )
      expect(userStoreMock.markProfileStale).toHaveBeenCalledTimes(1)
      // No se llega a intentar /auth/me con un token que sabemos expirado.
      expect(apiGet).not.toHaveBeenCalled()
    })

    it('refresh OK → sigue a /auth/me con el token rotado', async () => {
      runRefresh.mockResolvedValueOnce({ kind: 'ok', token: freshToken() })
      apiGet.mockResolvedValueOnce({
        data: { id: 7, email: 'socio@test.com', role: 'member' },
      })

      await runAuthBoot()

      expect(clearTokens).not.toHaveBeenCalled()
      expect(authStoreMock.clearAuth).not.toHaveBeenCalled()
      expect(apiGet).toHaveBeenCalledWith('/auth/me')
      expect(userStoreMock.setProfile).toHaveBeenCalledTimes(1)
    })
  })

  describe('token vigente → va directo a /auth/me', () => {
    beforeEach(() => {
      tokenState.access = freshToken()
    })

    it('/auth/me 401 → desloguea', async () => {
      apiGet.mockRejectedValueOnce(rejectedError(401))

      await runAuthBoot()

      expect(clearTokens).toHaveBeenCalledTimes(1)
      expect(authStoreMock.clearAuth).toHaveBeenCalledTimes(1)
    })

    it('/auth/me con error de red → NO desloguea, se mantiene logueado optimistamente', async () => {
      apiGet.mockRejectedValueOnce(networkError())

      await runAuthBoot()

      expect(clearTokens).not.toHaveBeenCalled()
      expect(authStoreMock.clearAuth).not.toHaveBeenCalled()
      expect(authStoreMock.setAuth).toHaveBeenCalledWith(
        tokenState.access,
        expect.objectContaining({ id: 7, email: 'socio@test.com', role: 'member' }),
      )
      expect(userStoreMock.markProfileStale).toHaveBeenCalledTimes(1)
    })

    it('/auth/me OK → setProfile + hydrateSelection + ensureMemberState', async () => {
      apiGet.mockResolvedValueOnce({
        data: { id: 7, email: 'socio@test.com', role: 'member' },
      })

      await runAuthBoot()

      expect(authStoreMock.clearAuth).not.toHaveBeenCalled()
      expect(userStoreMock.setProfile).toHaveBeenCalledTimes(1)
      expect(userStoreMock.hydrateSelection).toHaveBeenCalledTimes(1)
      expect(userStoreMock.ensureMemberState).toHaveBeenCalledTimes(1)
      expect(userStoreMock.loadSubscription).not.toHaveBeenCalled()
      expect(userStoreMock.markProfileStale).not.toHaveBeenCalled()
    })
  })

  // Reporte 2026-10-21 ("abren la app y queda en blanco"): en nativo CapacitorHttp
  // ignora el timeout de axios, así que una request colgada dejaba el boot — y la
  // pantalla vacía — esperando minutos. El boot deja de esperar al tope y arranca
  // optimista, sin cancelar ni desloguear.
  describe('red colgada → el boot deja de esperar al tope', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    /** Promesa que nunca se resuelve sola: simula la request nativa colgada. */
    function hanging<T>(): { promise: Promise<T>; reject: (err: unknown) => void } {
      let reject: (err: unknown) => void = () => {}
      const promise = new Promise<T>((_, rej) => {
        reject = rej
      })
      return { promise, reject }
    }

    it('refresh colgado → al tope arranca optimista, sin desloguear ni llamar /auth/me', async () => {
      tokenState.access = expiredToken()
      runRefresh.mockReturnValueOnce(hanging().promise)

      let done = false
      const boot = runAuthBoot().then(() => {
        done = true
      })

      await vi.advanceTimersByTimeAsync(BOOT_NETWORK_TIMEOUT_MS - 1)
      expect(done).toBe(false) // antes del tope sigue esperando

      await vi.advanceTimersByTimeAsync(1)
      await boot

      expect(clearTokens).not.toHaveBeenCalled()
      expect(authStoreMock.clearAuth).not.toHaveBeenCalled()
      expect(authStoreMock.setAuth).toHaveBeenCalledWith(
        tokenState.access,
        expect.objectContaining({ id: 7, email: 'socio@test.com', role: 'member' }),
      )
      expect(userStoreMock.markProfileStale).toHaveBeenCalledTimes(1)
      expect(apiGet).not.toHaveBeenCalled()
    })

    it('/auth/me colgado → al tope se mantiene logueado optimista con el perfil a reintentar', async () => {
      tokenState.access = freshToken()
      apiGet.mockReturnValueOnce(hanging().promise)

      const boot = runAuthBoot()
      await vi.advanceTimersByTimeAsync(BOOT_NETWORK_TIMEOUT_MS)
      await boot

      expect(clearTokens).not.toHaveBeenCalled()
      expect(authStoreMock.clearAuth).not.toHaveBeenCalled()
      expect(authStoreMock.setAuth).toHaveBeenCalledWith(
        tokenState.access,
        expect.objectContaining({ id: 7, email: 'socio@test.com', role: 'member' }),
      )
      expect(userStoreMock.markProfileStale).toHaveBeenCalledTimes(1)
      expect(userStoreMock.setProfile).not.toHaveBeenCalled()
    })

    it('un 401 de /auth/me que llega DESPUÉS del tope no desloguea (el boot ya terminó)', async () => {
      tokenState.access = freshToken()
      const me = hanging()
      apiGet.mockReturnValueOnce(me.promise)

      const boot = runAuthBoot()
      await vi.advanceTimersByTimeAsync(BOOT_NETWORK_TIMEOUT_MS)
      await boot

      me.reject(rejectedError(401))
      await vi.advanceTimersByTimeAsync(0)

      expect(clearTokens).not.toHaveBeenCalled()
      expect(authStoreMock.clearAuth).not.toHaveBeenCalled()
    })

    it('si la red responde antes del tope, no queda ningún timer vivo', async () => {
      tokenState.access = expiredToken()
      runRefresh.mockResolvedValueOnce({ kind: 'ok', token: freshToken() })
      apiGet.mockResolvedValueOnce({
        data: { id: 7, email: 'socio@test.com', role: 'member' },
      })

      await runAuthBoot()

      expect(userStoreMock.setProfile).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
