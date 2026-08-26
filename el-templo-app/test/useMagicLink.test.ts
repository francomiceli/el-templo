import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { AxiosError } from 'axios'

// --- Mocks instalados ANTES de importar el módulo bajo prueba -------------
// (mismo andamiaje que test/user-store-especial-pass.test.ts)

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))
vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}))

// api.post mockeado y compartido entre los DOS especificadores: useMagicLink
// y useUserStore importan `src/boot/axios`; useAuthStore importa `boot/axios`
// (sin el prefijo `src`) — solo `src` está aliaseado en vitest.config.ts.
const { apiMocks } = vi.hoisted(() => ({
  apiMocks: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('src/boot/axios', () => ({ api: apiMocks }))
vi.mock('boot/axios', () => ({ api: apiMocks }))

// useTokenStorage mockeado con vi.fn()s que empujan su nombre a un array
// compartido — es lo que hace verificable el ORDEN de D-04 (T-180-49).
const { tokenCalls, setTokensMock, clearTokensMock } = vi.hoisted(() => ({
  tokenCalls: [] as string[],
  setTokensMock: vi.fn(async (_access: string, _refresh: string) => {}),
  clearTokensMock: vi.fn(async () => {}),
}))
vi.mock('src/composables/useTokenStorage', () => ({
  useTokenStorage: () => ({
    setTokens: setTokensMock,
    clearTokens: clearTokensMock,
    getAccessToken: vi.fn(async () => null),
    getRefreshToken: vi.fn(async () => null),
    hasLegacyOnly: vi.fn(async () => false),
    getToken: vi.fn(async () => null),
    removeToken: vi.fn(async () => {}),
  }),
}))

// Logger mockeado — permite afirmar niveles y ausencia del token en los args.
const { logMocks } = vi.hoisted(() => ({
  logMocks: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))
vi.mock('src/utils/logger', () => ({
  createLogger: () => logMocks,
}))

import { useAuthStore } from 'src/stores/useAuthStore'
import {
  useMagicLink,
  MAGIC_LINK_ROUTE_BY_DESTINATION,
  resolveMagicLinkRoute,
  isMagicLinkOnboardingBypass,
  __resetMagicLinkBypass,
} from 'src/composables/useMagicLink'

const EXCHANGE_URL = '/campaigns/exchange'
const REAL_TOKEN = 'the-real-signed-token-nobody-should-log'

interface ExchangeUserFixture {
  id: number
  email: string | null
  firstName: string | null
  lastName: string | null
  role: 'member' | 'coach' | 'admin' | 'superadmin'
  level: string
  branchId: number
  branchName: string | null
  branchIsVirtual: boolean
  branchCountry: string
  gender: string | null
  dateOfBirth: string | null
  onboardingCompleted: boolean
}

function exchangeResponse(
  userOverrides: Partial<ExchangeUserFixture> = {},
  destination = 'reservas-prueba',
) {
  const user: ExchangeUserFixture = {
    id: 42,
    email: 'lead@example.com',
    firstName: 'Lu',
    lastName: 'Perez',
    role: 'member',
    level: 'kairos',
    branchId: 1,
    branchName: 'El Templo Centro',
    branchIsVirtual: false,
    branchCountry: 'AR',
    gender: null,
    dateOfBirth: null,
    onboardingCompleted: false,
    ...userOverrides,
  }
  return {
    data: {
      accessToken: 'access-abc',
      refreshToken: 'refresh-abc',
      user,
      destination,
    },
  }
}

function make401(): AxiosError {
  const err = new AxiosError('Unauthorized')
  err.response = {
    status: 401,
    data: {},
    statusText: 'Unauthorized',
    headers: {},
    config: err.config as never,
  } as never
  return err
}

function make500(): AxiosError {
  const err = new AxiosError('Internal Server Error')
  err.response = {
    status: 500,
    data: {},
    statusText: 'Internal Server Error',
    headers: {},
    config: err.config as never,
  } as never
  return err
}

beforeEach(() => {
  setActivePinia(createPinia())
  apiMocks.get.mockReset()
  apiMocks.post.mockReset()
  tokenCalls.length = 0
  setTokensMock.mockReset()
  setTokensMock.mockImplementation(async () => {
    tokenCalls.push('setTokens')
  })
  clearTokensMock.mockReset()
  clearTokensMock.mockImplementation(async () => {
    tokenCalls.push('clearTokens')
  })
  logMocks.debug.mockReset()
  logMocks.info.mockReset()
  logMocks.warn.mockReset()
  logMocks.error.mockReset()
  __resetMagicLinkBypass()
})

describe('useMagicLink — exchange()', () => {
  it('token valido sin sesion previa: llama setTokens una vez y devuelve el destino', async () => {
    apiMocks.post.mockResolvedValueOnce(exchangeResponse({ id: 42 }, 'reservas-prueba'))

    const { exchange } = useMagicLink()
    const result = await exchange(REAL_TOKEN)

    expect(result).toEqual({ ok: true, destination: 'reservas-prueba' })
    expect(setTokensMock).toHaveBeenCalledTimes(1)
    expect(setTokensMock).toHaveBeenCalledWith('access-abc', 'refresh-abc')
    expect(apiMocks.post).toHaveBeenCalledWith(
      EXCHANGE_URL,
      { token: REAL_TOKEN },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('token valido con sesion del MISMO usuario: NO llama setTokens, igual devuelve el destino', async () => {
    const authStore = useAuthStore()
    authStore.setAuth('old-access', { id: 42, email: 'old@example.com', role: 'member' })
    apiMocks.post.mockResolvedValueOnce(exchangeResponse({ id: 42 }, 'volver'))

    const { exchange } = useMagicLink()
    const result = await exchange(REAL_TOKEN)

    expect(result).toEqual({ ok: true, destination: 'volver' })
    expect(setTokensMock).not.toHaveBeenCalled()
  })

  it('token valido con sesion de OTRO usuario: clearTokens ocurre ANTES de setTokens (D-04, T-180-49)', async () => {
    const authStore = useAuthStore()
    authStore.setAuth('old-access', { id: 7, email: 'otro@example.com', role: 'member' })
    apiMocks.post.mockResolvedValueOnce(exchangeResponse({ id: 42 }, 'reservas'))

    const { exchange } = useMagicLink()
    const result = await exchange(REAL_TOKEN)

    expect(result).toEqual({ ok: true, destination: 'reservas' })
    // No solo "se llamó a logout" — el ORDEN relativo es lo que mitiga T-180-49.
    expect(tokenCalls).toEqual(['clearTokens', 'setTokens'])
  })

  it('401 del exchange: no lanza, devuelve {ok:false}, loguea warn (no error) — D-05', async () => {
    apiMocks.post.mockRejectedValueOnce(make401())

    const { exchange } = useMagicLink()
    const result = await exchange('un-token-vencido')

    expect(result).toEqual({ ok: false })
    expect(logMocks.warn).toHaveBeenCalledTimes(1)
    expect(logMocks.error).not.toHaveBeenCalled()
    expect(setTokensMock).not.toHaveBeenCalled()
  })

  it('error de red / 5xx: devuelve {ok:false} y loguea error', async () => {
    apiMocks.post.mockRejectedValueOnce(make500())

    const { exchange } = useMagicLink()
    const result = await exchange(REAL_TOKEN)

    expect(result).toEqual({ ok: false })
    expect(logMocks.error).toHaveBeenCalledTimes(1)
  })

  it('error de red sin response (fetch/timeout): devuelve {ok:false} y loguea error', async () => {
    apiMocks.post.mockRejectedValueOnce(new Error('Network Error'))

    const { exchange } = useMagicLink()
    const result = await exchange(REAL_TOKEN)

    expect(result).toEqual({ ok: false })
    expect(logMocks.error).toHaveBeenCalledTimes(1)
  })

  it('ningun mensaje logueado contiene el token, en ningun camino (exito, 401, error)', async () => {
    apiMocks.post.mockResolvedValueOnce(exchangeResponse({ id: 42 }, 'reservas-prueba'))
    await useMagicLink().exchange(REAL_TOKEN)

    apiMocks.post.mockRejectedValueOnce(make401())
    await useMagicLink().exchange(REAL_TOKEN)

    apiMocks.post.mockRejectedValueOnce(make500())
    await useMagicLink().exchange(REAL_TOKEN)

    const allCalls = [
      ...logMocks.debug.mock.calls,
      ...logMocks.info.mock.calls,
      ...logMocks.warn.mock.calls,
      ...logMocks.error.mock.calls,
    ]
    for (const args of allCalls) {
      const serialized = JSON.stringify(args)
      expect(serialized).not.toContain(REAL_TOKEN)
    }
  })

  it('D-21: un canje exitoso activa el bypass de onboarding SOLO para ese userId', async () => {
    apiMocks.post.mockResolvedValueOnce(exchangeResponse({ id: 42 }, 'reservas-prueba'))
    await useMagicLink().exchange(REAL_TOKEN)

    expect(isMagicLinkOnboardingBypass(42)).toBe(true)
    expect(isMagicLinkOnboardingBypass(7)).toBe(false)
    expect(isMagicLinkOnboardingBypass(undefined)).toBe(false)
  })

  it('D-21: un canje fallido NO activa el bypass', async () => {
    apiMocks.post.mockRejectedValueOnce(make401())
    await useMagicLink().exchange('un-token-vencido')

    expect(isMagicLinkOnboardingBypass(42)).toBe(false)
  })
})

describe('MAGIC_LINK_ROUTE_BY_DESTINATION / resolveMagicLinkRoute', () => {
  it('traduce las 3 claves conocidas a su ruta interna', () => {
    expect(MAGIC_LINK_ROUTE_BY_DESTINATION['reservas-prueba']).toBe('/reservas?trial=1')
    expect(MAGIC_LINK_ROUTE_BY_DESTINATION.volver).toBe('/volver')
    expect(MAGIC_LINK_ROUTE_BY_DESTINATION.reservas).toBe('/reservas')
  })

  it('clave conocida ⇒ su ruta', () => {
    expect(resolveMagicLinkRoute('volver')).toBe('/volver')
    expect(resolveMagicLinkRoute('reservas')).toBe('/reservas')
  })

  it('clave desconocida (T-180-51, anti open-redirect) ⇒ fallback fijo', () => {
    expect(resolveMagicLinkRoute('https://evil.example.com')).toBe('/reservas?trial=1')
    expect(resolveMagicLinkRoute('no-existe')).toBe('/reservas?trial=1')
    expect(resolveMagicLinkRoute('')).toBe('/reservas?trial=1')
  })
})
