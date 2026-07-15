import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock Capacitor (web path).
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))
vi.mock('@capacitor/preferences', () => ({
  Preferences: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
}))

// Mock axios boot so importing useUserStore does not explode.
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

import { api } from 'src/boot/axios'

type RouteMap = Record<string, { status: number; data: unknown }>

// Route api.get by URL. Unknown URLs resolve to a safe 204 so the collateral
// calls inside loadSubscription (my-progress / current-program / enrollments)
// never throw. Only the endpoints under test are asserted.
function routeApi(routes: RouteMap) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    const hit = routes[url]
    if (hit) return Promise.resolve(hit)
    return Promise.resolve({ status: 204, data: null })
  })
}

const ESPECIAL_PASS_URL = '/members/subscription/me/especial-pass'
const SUBSCRIPTION_URL = '/members/subscription/me/subscription'

// A presencial subscription in the singular ref → hasPresencialReservationAccess=true.
const presencialSub = {
  id: 1,
  planName: 'Presencial Full',
  planTier: 'full',
  status: 'active',
  startDate: '2026-07-01',
  endDate: null,
  daysRemaining: 20,
  pricePaid: 30000,
  planCategory: 'presencial',
  multiBranch: false,
}

// An ESPECIAL subscription in the singular ref → hasPresencialReservationAccess=false.
const especialSub = {
  ...presencialSub,
  id: 2,
  planName: 'Actividades con Aura',
  planCategory: 'especial',
}

beforeEach(() => {
  installLocalStorage()
  setActivePinia(createPinia())
  vi.mocked(api.get).mockReset()
})

describe('useUserStore — pase especial (APP-02)', () => {
  it('pase socio → hasEspecialPass=true, especialClassesRemaining refleja classesRemaining', async () => {
    routeApi({
      [ESPECIAL_PASS_URL]: {
        status: 200,
        data: {
          hasPass: true,
          classesRemaining: 1,
          classesBudget: 2,
          endDate: null,
          isSocio: true,
        },
      },
    })
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    await store.loadEspecialPass()

    expect(store.hasEspecialPass).toBe(true)
    expect(store.especialClassesRemaining).toBe(1)
    expect(store.especialClassesBudget).toBe(2)
  })

  it('sin pase ({ hasPass:false }) → hasEspecialPass=false, especialClassesRemaining=0, hasOnlyEspecialPass=false', async () => {
    routeApi({
      [ESPECIAL_PASS_URL]: { status: 200, data: { hasPass: false } },
    })
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    await store.loadEspecialPass()

    expect(store.hasEspecialPass).toBe(false)
    expect(store.especialClassesRemaining).toBe(0)
    expect(store.hasOnlyEspecialPass).toBe(false)
  })

  it('204 / error → especialPass queda null (mismo try/catch que loadSubscription)', async () => {
    routeApi({
      [ESPECIAL_PASS_URL]: { status: 204, data: null },
    })
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    await store.loadEspecialPass()

    expect(store.hasEspecialPass).toBe(false)
    expect(store.especialPass).toBeNull()
  })

  it('INDEPENDENCIA: aunque el singular tenga la sub ESPECIAL, las capabilities del pase derivan SOLO de especialPass', async () => {
    // El singular queda con la sub ESPECIAL (no presencial): hasPresencialReservationAccess=false.
    // Aun así, sin pase cargado, las capabilities del pase NO derivan del singular.
    routeApi({
      [SUBSCRIPTION_URL]: { status: 200, data: especialSub },
      [ESPECIAL_PASS_URL]: { status: 200, data: { hasPass: false } },
    })
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()

    await store.loadSubscription()
    // El singular quedó poblado con la especial, pero el pase todavía no.
    expect(store.subscription?.planCategory).toBe('especial')
    expect(store.hasEspecialPass).toBe(false)
    expect(store.especialClassesRemaining).toBe(0)

    // Ahora cargamos el pase: sus capabilities aparecen SIN tocar el singular.
    vi.mocked(api.get).mockResolvedValueOnce({
      status: 200,
      data: { hasPass: true, classesRemaining: 2, classesBudget: 2, endDate: null, isSocio: false },
    })
    await store.loadEspecialPass()
    expect(store.hasEspecialPass).toBe(true)
    expect(store.especialClassesRemaining).toBe(2)
    // El singular no fue alterado por cargar el pase.
    expect(store.subscription?.planCategory).toBe('especial')
  })

  it('socio con presencial + pase: hasPresencialReservationAccess NO cambia y hasOnlyEspecialPass=false', async () => {
    routeApi({
      [SUBSCRIPTION_URL]: { status: 200, data: presencialSub },
      [ESPECIAL_PASS_URL]: {
        status: 200,
        data: {
          hasPass: true,
          classesRemaining: 2,
          classesBudget: 2,
          endDate: null,
          isSocio: true,
        },
      },
    })
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()

    await store.loadSubscription()
    expect(store.hasPresencialReservationAccess).toBe(true)

    await store.loadEspecialPass()
    // El pase agrega capability, pero el acceso presencial del socio se conserva.
    expect(store.hasEspecialPass).toBe(true)
    expect(store.hasPresencialReservationAccess).toBe(true)
    // Tiene acceso presencial → NO es externo-solo-pase.
    expect(store.hasOnlyEspecialPass).toBe(false)
  })

  it('externo-solo-pase: pase presente sin acceso presencial → hasOnlyEspecialPass=true', async () => {
    routeApi({
      // Sin sub presencial (204 → subscription null): hasPresencialReservationAccess=false.
      [ESPECIAL_PASS_URL]: {
        status: 200,
        data: {
          hasPass: true,
          classesRemaining: 2,
          classesBudget: 2,
          endDate: null,
          isSocio: false,
        },
      },
    })
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()

    await store.loadSubscription() // subscription → null (204)
    await store.loadEspecialPass()

    expect(store.hasPresencialReservationAccess).toBe(false)
    expect(store.hasEspecialPass).toBe(true)
    expect(store.hasOnlyEspecialPass).toBe(true)
  })

  it('clearProfile limpia el pase', async () => {
    routeApi({
      [ESPECIAL_PASS_URL]: {
        status: 200,
        data: {
          hasPass: true,
          classesRemaining: 1,
          classesBudget: 2,
          endDate: null,
          isSocio: true,
        },
      },
    })
    const { useUserStore } = await import('src/stores/useUserStore')
    const store = useUserStore()
    await store.loadEspecialPass()
    expect(store.hasEspecialPass).toBe(true)

    store.clearProfile()
    expect(store.especialPass).toBeNull()
    expect(store.hasEspecialPass).toBe(false)
  })
})
