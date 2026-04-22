import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Capacitor — default to non-native so localStorage path is used.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))

// Mock Preferences to track calls (only exercised if we flip isNativePlatform).
const prefGet = vi.fn()
const prefSet = vi.fn()
const prefRemove = vi.fn()
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: (...args: unknown[]) => prefGet(...args),
    set: (...args: unknown[]) => prefSet(...args),
    remove: (...args: unknown[]) => prefRemove(...args),
  },
}))

// Fake localStorage for node env.
const memStore: Record<string, string> = {}
beforeEach(() => {
  for (const k of Object.keys(memStore)) delete memStore[k]
  prefGet.mockReset()
  prefSet.mockReset()
  prefRemove.mockReset()
  // @ts-expect-error - inject minimal localStorage into global
  globalThis.localStorage = {
    getItem: (k: string) => (k in memStore ? memStore[k]! : null),
    setItem: (k: string, v: string) => {
      memStore[k] = v
    },
    removeItem: (k: string) => {
      delete memStore[k]
    },
    clear: () => {
      for (const k of Object.keys(memStore)) delete memStore[k]
    },
    key: () => null,
    length: 0,
  }
})

async function loadStorage() {
  const mod = await import('src/composables/useLevelSelectionStorage')
  return mod.useLevelSelectionStorage()
}

describe('useLevelSelectionStorage — web path (localStorage)', () => {
  it('get() returns null when no key exists', async () => {
    const storage = await loadStorage()
    expect(await storage.get(42)).toBeNull()
  })

  it('set() stores under the scoped key and get() reads it back', async () => {
    const storage = await loadStorage()
    await storage.set(42, 'omega')
    expect(memStore['eltemplo.selectedLevel:42']).toBe('omega')
    expect(await storage.get(42)).toBe('omega')
  })

  it('remove() deletes the scoped key', async () => {
    const storage = await loadStorage()
    memStore['eltemplo.selectedLevel:7'] = 'sigma'
    await storage.remove(7)
    expect(memStore['eltemplo.selectedLevel:7']).toBeUndefined()
    expect(await storage.get(7)).toBeNull()
  })

  it('different userIds do not leak across each other', async () => {
    const storage = await loadStorage()
    await storage.set(1, 'alfa')
    await storage.set(2, 'omega')
    expect(await storage.get(1)).toBe('alfa')
    expect(await storage.get(2)).toBe('omega')
  })

  it('get() swallows throwing storage and returns null', async () => {
    const storage = await loadStorage()
    // @ts-expect-error — replace getItem with thrower
    globalThis.localStorage.getItem = () => {
      throw new Error('quota')
    }
    expect(await storage.get(99)).toBeNull()
  })

  it('set() swallows throwing storage (no re-throw)', async () => {
    const storage = await loadStorage()
    // @ts-expect-error — replace setItem with thrower
    globalThis.localStorage.setItem = () => {
      throw new Error('quota')
    }
    await expect(storage.set(99, 'omega')).resolves.toBeUndefined()
  })

  it('remove() swallows throwing storage (no re-throw)', async () => {
    const storage = await loadStorage()
    // @ts-expect-error — replace removeItem with thrower
    globalThis.localStorage.removeItem = () => {
      throw new Error('quota')
    }
    await expect(storage.remove(99)).resolves.toBeUndefined()
  })
})
