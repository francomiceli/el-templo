import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

import { api } from 'src/boot/axios'
import { useUserStore } from '../useUserStore'

const EXPIRED_SUB = { status: 'expired', planName: 'Mensual', startDate: '2026-09-01' }

/** Respuesta controlable a mano para observar el estado "en vuelo". */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** Todas las rutas de datos responden vacío salvo la suscripción y el plan-status que se pasen. */
function mockApi(routes: { subscription?: Promise<unknown> | unknown; planStatus?: unknown }) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.endsWith('/me/subscription')) {
      return (await routes.subscription) ?? { status: 204, data: null }
    }
    if (url.endsWith('/me/plan-status')) {
      return { status: 200, data: routes.planStatus ?? { hasActivePlan: false } }
    }
    return { status: 204, data: null }
  })
}

describe('useUserStore.planStateLoading (REVIEW-app WR-03)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
  })

  it('es true hasta que la suscripción y el plan-status respondieron por primera vez', async () => {
    mockApi({ subscription: { status: 200, data: EXPIRED_SUB } })
    const store = useUserStore()
    expect(store.planStateLoading).toBe(true)

    await store.loadSubscription()
    // La suscripción ya vino sin plan activo, pero falta plan-status: no se decide "sin plan".
    expect(store.planStateLoading).toBe(true)

    await store.loadPlanStatus()
    expect(store.planStateLoading).toBe(false)
  })

  it('un refresco de la suscripción NO devuelve la card al estado de carga', async () => {
    mockApi({ subscription: { status: 200, data: EXPIRED_SUB } })
    const store = useUserStore()
    await store.loadSubscription()
    await store.loadPlanStatus()
    expect(store.planStateLoading).toBe(false)

    const slow = deferred<unknown>()
    mockApi({ subscription: slow.promise })
    const refresh = store.loadSubscription()
    expect(store.subscriptionLoading).toBe(true)
    expect(store.planStateLoading).toBe(false)

    slow.resolve({ status: 200, data: EXPIRED_SUB })
    await refresh
    expect(store.planStateLoading).toBe(false)
  })

  it('un refresco del plan-status NO devuelve la card al estado de carga', async () => {
    mockApi({ subscription: { status: 200, data: EXPIRED_SUB } })
    const store = useUserStore()
    await store.loadSubscription()
    await store.loadPlanStatus()

    const refresh = store.loadPlanStatus()
    expect(store.planStateLoading).toBe(false)
    await refresh
  })

  it('con plan activo nunca está cargando', async () => {
    mockApi({ subscription: { status: 200, data: { ...EXPIRED_SUB, status: 'active' } } })
    const store = useUserStore()
    await store.loadSubscription()
    expect(store.planStateLoading).toBe(false)
  })

  it('el logout (clearProfile) vuelve a pedir la carga inicial', async () => {
    mockApi({ subscription: { status: 200, data: EXPIRED_SUB } })
    const store = useUserStore()
    await store.loadSubscription()
    await store.loadPlanStatus()
    expect(store.planStateLoading).toBe(false)

    store.clearProfile()
    expect(store.planStateLoading).toBe(true)
  })
})
