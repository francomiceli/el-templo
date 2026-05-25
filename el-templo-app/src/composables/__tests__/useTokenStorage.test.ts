import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Capacitor to always report web (localStorage branch) so we can drive
// the storage with a jsdom-free in-memory localStorage shim.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}))

import { useTokenStorage } from '../useTokenStorage'

function installLocalStorage() {
  const store = new Map<string, string>()
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
  }
  ;(globalThis as unknown as { localStorage: typeof ls }).localStorage = ls
  return store
}

describe('useTokenStorage (dual-key + legacy + deferred cleanup)', () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = installLocalStorage()
  })

  it('getAccessToken devuelve el accessToken nuevo si existe', async () => {
    store.set('accessToken', 'new-access')
    store.set('authToken', 'legacy')
    const { getAccessToken } = useTokenStorage()
    expect(await getAccessToken()).toBe('new-access')
  })

  it('getAccessToken cae al authToken legacy si no hay accessToken', async () => {
    store.set('authToken', 'legacy-access')
    const { getAccessToken } = useTokenStorage()
    expect(await getAccessToken()).toBe('legacy-access')
  })

  it('getAccessToken devuelve null sin ninguna key', async () => {
    const { getAccessToken } = useTokenStorage()
    expect(await getAccessToken()).toBeNull()
  })

  it('getRefreshToken devuelve refreshToken o null', async () => {
    const { getRefreshToken } = useTokenStorage()
    expect(await getRefreshToken()).toBeNull()
    store.set('refreshToken', 'r1')
    expect(await getRefreshToken()).toBe('r1')
  })

  it('setTokens escribe ambas keys nuevas Y borra el authToken legacy (cleanup diferido)', async () => {
    store.set('authToken', 'legacy')
    const { setTokens } = useTokenStorage()
    await setTokens('acc', 'ref')
    expect(store.get('accessToken')).toBe('acc')
    expect(store.get('refreshToken')).toBe('ref')
    expect(store.has('authToken')).toBe(false)
  })

  it('clearTokens borra las 3 keys', async () => {
    store.set('accessToken', 'a')
    store.set('refreshToken', 'r')
    store.set('authToken', 'l')
    const { clearTokens } = useTokenStorage()
    await clearTokens()
    expect(store.has('accessToken')).toBe(false)
    expect(store.has('refreshToken')).toBe(false)
    expect(store.has('authToken')).toBe(false)
  })

  it('hasLegacyOnly distingue el caso legacy-sin-refresh', async () => {
    const { hasLegacyOnly } = useTokenStorage()
    store.set('authToken', 'l')
    expect(await hasLegacyOnly()).toBe(true)
    store.set('accessToken', 'a')
    expect(await hasLegacyOnly()).toBe(false)
    store.delete('authToken')
    store.delete('accessToken')
    expect(await hasLegacyOnly()).toBe(false)
  })

  it('aliases backwards-compat getToken/removeToken siguen funcionando', async () => {
    store.set('accessToken', 'a')
    store.set('refreshToken', 'r')
    const { getToken, removeToken } = useTokenStorage()
    expect(await getToken()).toBe('a')
    await removeToken()
    expect(store.has('accessToken')).toBe(false)
    expect(store.has('refreshToken')).toBe(false)
  })
})
