import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mismo patrón que useTipsSeenStorage.test.ts: Capacitor reporta web (localStorage) y se
// instala un shim en memoria.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))
vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}))
vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { useAddressPromptStorage } from '../useAddressPromptStorage'
import { ADDRESS_PROMPT_MAX_SHOWS } from 'src/utils/member-address'

function installLocalStorage(overrides: Partial<Storage> = {}) {
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
    ...overrides,
  }
  ;(globalThis as unknown as { localStorage: typeof ls }).localStorage = ls
  return store
}

describe('useAddressPromptStorage', () => {
  let store: Map<string, string>

  beforeEach(() => {
    store = installLocalStorage()
  })

  it('sin nada guardado → null (nunca se mostró)', async () => {
    const { read } = useAddressPromptStorage()
    expect(await read(1)).toBeNull()
  })

  it('write + read: ida y vuelta', async () => {
    const { read, write } = useAddressPromptStorage()
    const state = { shows: 1, lastShownAt: '2026-11-05T12:00:00.000Z' }
    await write(1, state)
    expect(await read(1)).toEqual(state)
  })

  it('la clave es por usuario: lo del socio 1 no afecta al socio 2', async () => {
    const { read, write } = useAddressPromptStorage()
    await write(1, { shows: 2, lastShownAt: '2026-11-05T12:00:00.000Z' })
    expect(await read(2)).toBeNull()
    expect([...store.keys()]).toEqual(['eltemplo.addressPrompt:1'])
  })

  it('si leer tira error → "ya se mostró todas las veces" (no insistir)', async () => {
    installLocalStorage({
      getItem: () => {
        throw new Error('SecurityError')
      },
    })
    const { read } = useAddressPromptStorage()
    expect((await read(1))?.shows).toBe(ADDRESS_PROMPT_MAX_SHOWS)
  })

  it('si guardar tira error, no rompe (best-effort)', async () => {
    installLocalStorage({
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    const { write } = useAddressPromptStorage()
    await expect(
      write(1, { shows: 1, lastShownAt: '2026-11-05T12:00:00.000Z' }),
    ).resolves.toBeUndefined()
  })
})
