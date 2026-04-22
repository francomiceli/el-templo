import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock Capacitor (web path).
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))
vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}))

// Mock axios boot so importing useUserStore / useAuthStore does not explode.
vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

// Fake localStorage for node env.
const memStore: Record<string, string> = {}
function installLocalStorage() {
  for (const k of Object.keys(memStore)) delete memStore[k]
  // @ts-expect-error — minimal shim
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
}

beforeEach(() => {
  installLocalStorage()
  setActivePinia(createPinia())
})

import type { UserProfile } from 'src/stores/useUserStore'

function baseProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 42,
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'member',
    level: 'sigma',
    branchId: 1,
    branchName: 'El Templo',
    branchIsVirtual: false,
    segment: null,
    onboardingCompleted: true,
    gender: 'male',
    dateOfBirth: null,
    ...over,
  }
}

describe('useUserStore — selection state', () => {
  it('selectedLevel is null by default; activeLevel falls back to profile.level', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ level: 'sigma' }))
    expect(store.selectedLevel).toBeNull()
    expect(store.activeLevel).toBe('sigma')
  })

  it('activeLevel uses isTrainingLevel narrowing (not a raw cast)', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    // Profile null -> activeLevel null.
    expect(store.activeLevel).toBeNull()
    // Profile with invalid level value -> activeLevel null.
    store.setProfile(
      baseProfile({
        // @ts-expect-error — simulate drift (shouldn't type-check in real code, intentional for test)
        level: 'nonsense',
      }),
    )
    expect(store.activeLevel).toBeNull()
  })

  it('setLevel(other) persists to storage and updates selectedLevel', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    await store.setLevel('omega')
    expect(store.selectedLevel).toBe('omega')
    expect(store.activeLevel).toBe('omega')
    expect(memStore['eltemplo.selectedLevel:42']).toBe('omega')
  })

  it('setLevel(profile.level) internally routes through clearLevel (D-08)', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    await store.setLevel('omega')
    expect(memStore['eltemplo.selectedLevel:42']).toBe('omega')
    // Picking own level -> clears.
    await store.setLevel('sigma')
    expect(store.selectedLevel).toBeNull()
    expect(memStore['eltemplo.selectedLevel:42']).toBeUndefined()
  })

  it('clearLevel() clears selectedLevel and removes storage key', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 7, level: 'alfa' }))
    await store.setLevel('delta')
    expect(memStore['eltemplo.selectedLevel:7']).toBe('delta')
    await store.clearLevel()
    expect(store.selectedLevel).toBeNull()
    expect(memStore['eltemplo.selectedLevel:7']).toBeUndefined()
  })

  it('registerMidSessionGuard — when guard returns false, setLevel is blocked', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    const guard = vi.fn().mockResolvedValue(false)
    store.registerMidSessionGuard(guard)
    await store.setLevel('omega')
    expect(guard).toHaveBeenCalledOnce()
    expect(store.selectedLevel).toBeNull()
    expect(memStore['eltemplo.selectedLevel:42']).toBeUndefined()
  })

  it('registerMidSessionGuard — when guard returns true, setLevel proceeds', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    store.registerMidSessionGuard(vi.fn().mockResolvedValue(true))
    await store.setLevel('omega')
    expect(store.selectedLevel).toBe('omega')
    expect(memStore['eltemplo.selectedLevel:42']).toBe('omega')
  })

  it('registerMidSessionGuard — guard also blocks clearLevel', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    store.registerMidSessionGuard(null)
    await store.setLevel('omega')
    expect(memStore['eltemplo.selectedLevel:42']).toBe('omega')
    store.registerMidSessionGuard(vi.fn().mockResolvedValue(false))
    await store.clearLevel()
    expect(store.selectedLevel).toBe('omega')
    expect(memStore['eltemplo.selectedLevel:42']).toBe('omega')
  })

  it('registerMidSessionGuard(null) clears the guard', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    store.registerMidSessionGuard(vi.fn().mockResolvedValue(false))
    store.registerMidSessionGuard(null)
    await store.setLevel('omega') // should proceed now
    expect(store.selectedLevel).toBe('omega')
  })
})

describe('useUserStore.hydrateSelection', () => {
  it('no-ops when profile has no id', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    memStore['eltemplo.selectedLevel:42'] = 'omega'
    await store.hydrateSelection()
    expect(store.selectedLevel).toBeNull()
  })

  it('loads a valid stored level', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    memStore['eltemplo.selectedLevel:42'] = 'omega'
    await store.hydrateSelection()
    expect(store.selectedLevel).toBe('omega')
  })

  it('bypasses the guard (boot path — must not prompt user)', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    const guard = vi.fn().mockResolvedValue(false)
    store.registerMidSessionGuard(guard)
    memStore['eltemplo.selectedLevel:42'] = 'omega'
    await store.hydrateSelection()
    expect(guard).not.toHaveBeenCalled()
    expect(store.selectedLevel).toBe('omega')
  })

  it('rejects an invalid stored value and removes it from storage', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    memStore['eltemplo.selectedLevel:42'] = 'BOGUS'
    await store.hydrateSelection()
    expect(store.selectedLevel).toBeNull()
    expect(memStore['eltemplo.selectedLevel:42']).toBeUndefined()
  })

  it('is a no-op when no stored value exists', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    await store.hydrateSelection()
    expect(store.selectedLevel).toBeNull()
  })
})

describe('useUserStore.clearSelection (logout path)', () => {
  it('bypasses the guard and removes the storage key', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    store.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    await store.setLevel('omega')
    expect(memStore['eltemplo.selectedLevel:42']).toBe('omega')
    store.registerMidSessionGuard(vi.fn().mockResolvedValue(false))
    await store.clearSelection()
    expect(store.selectedLevel).toBeNull()
    expect(memStore['eltemplo.selectedLevel:42']).toBeUndefined()
  })

  it('resolves the userId from authStore.user when profile is already cleared', async () => {
    const { useUserStore } = await import('src/stores/useUserStore')
    const { useAuthStore } = await import('src/stores/useAuthStore')
    const userStore = useUserStore()
    const authStore = useAuthStore()

    // Set up both stores as a logged-in user.
    userStore.setProfile(baseProfile({ id: 42, level: 'sigma' }))
    authStore.setAuth('tok', { id: 42, email: 'u@e', role: 'member' })
    await userStore.setLevel('omega')
    expect(memStore['eltemplo.selectedLevel:42']).toBe('omega')

    // Simulate profile already nulled (out-of-order logout).
    userStore.clearProfile()
    expect(userStore.profile).toBeNull()

    await userStore.clearSelection()
    expect(memStore['eltemplo.selectedLevel:42']).toBeUndefined()
  })
})
