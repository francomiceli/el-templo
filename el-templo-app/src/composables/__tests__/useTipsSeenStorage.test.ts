import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mismo patrón que useLastLoginEmail.test.ts / useTokenStorage.test.ts:
// Capacitor reporta web (localStorage) y se instala un shim en memoria.
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

import { useTipsSeenStorage } from '../useTipsSeenStorage'

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

describe('useTipsSeenStorage (SPEC "Empezá acá" C)', () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = installLocalStorage()
  })

  it('hasSeen devuelve false si nunca se marcó', async () => {
    const { hasSeen } = useTipsSeenStorage()
    expect(await hasSeen(1, 'qr-checkin')).toBe(false)
  })

  it('markSeen + hasSeen: un tip marcado visto queda visto', async () => {
    const { hasSeen, markSeen } = useTipsSeenStorage()
    await markSeen(1, 'qr-checkin')
    expect(await hasSeen(1, 'qr-checkin')).toBe(true)
  })

  it('la clave es por usuario: el usuario 2 no ve el tip marcado por el usuario 1', async () => {
    const { hasSeen, markSeen } = useTipsSeenStorage()
    await markSeen(1, 'qr-checkin')
    expect(await hasSeen(2, 'qr-checkin')).toBe(false)
  })

  it('la clave es por tip: marcar un tip no afecta a otro del mismo usuario', async () => {
    const { hasSeen, markSeen } = useTipsSeenStorage()
    await markSeen(1, 'qr-checkin')
    expect(await hasSeen(1, 'entrenar-bloques')).toBe(false)
  })

  it('un storage que tira excepción no rompe hasSeen/markSeen (best-effort)', async () => {
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

    const { hasSeen, markSeen } = useTipsSeenStorage()
    await expect(markSeen(1, 'qr-checkin')).resolves.toBeUndefined()
    await expect(hasSeen(1, 'qr-checkin')).resolves.toBe(false)
  })

  it('store subyacente: la clave incluye prefijo, userId y tipId', async () => {
    const { markSeen } = useTipsSeenStorage()
    await markSeen(7, 'reservas-anticipacion')
    expect(store.get('eltemplo.tipSeen:7:reservas-anticipacion')).toBe('1')
  })
})
