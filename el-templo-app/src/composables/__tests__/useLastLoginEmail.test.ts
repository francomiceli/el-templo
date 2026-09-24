import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mismo patrón que useTokenStorage.test.ts: Capacitor reporta web
// (localStorage) y se instala un shim en memoria para jsdom-free.
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
vi.mock('src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { useLastLoginEmail } from '../useLastLoginEmail'

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

describe('useLastLoginEmail (App 1.7.9, recordar email)', () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = installLocalStorage()
  })

  it('get devuelve null si nunca se guardó nada', async () => {
    const { get } = useLastLoginEmail()
    expect(await get()).toBeNull()
  })

  it('set guarda el email y get lo devuelve', async () => {
    const { get, set } = useLastLoginEmail()
    await set('socio@test.com')
    expect(await get()).toBe('socio@test.com')
    expect(store.get('lastLoginEmail')).toBe('socio@test.com')
  })

  it('set sobrescribe el valor anterior (último login gana)', async () => {
    const { get, set } = useLastLoginEmail()
    await set('primero@test.com')
    await set('segundo@test.com')
    expect(await get()).toBe('segundo@test.com')
  })

  it('un storage que tira excepción no rompe get/set (best-effort)', async () => {
    const throwing = {
      getItem: () => {
        throw new Error('quota')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    }
    ;(globalThis as unknown as { localStorage: typeof throwing }).localStorage = throwing

    const { get, set } = useLastLoginEmail()
    await expect(set('x@test.com')).resolves.toBeUndefined()
    await expect(get()).resolves.toBeNull()
  })
})
