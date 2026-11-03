import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

import { api } from 'src/boot/axios'
import { useUserStore } from '../useUserStore'
import { NETWORK_WAIT_MS } from 'src/utils/with-timeout'

const PROFILE = {
  id: 7,
  email: 'socio@test.com',
  firstName: 'Socio',
  lastName: 'Test',
  role: 'member',
  level: 'alfa',
  branchId: 1,
  branchName: 'El Templo Sede',
}

/** `/auth/me` según `meHandler`; el resto de la carga del socio responde vacío. */
let meHandler: () => Promise<unknown>

function meCalls(): number {
  return vi.mocked(api.get).mock.calls.filter(([u]) => u === '/auth/me').length
}

describe('useUserStore · retryProfileLoad (reporte 2026-11-03: Entrenar cargando en iPhone)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.mocked(api.get).mockReset()
    meHandler = () => Promise.resolve({ data: PROFILE })
    vi.mocked(api.get).mockImplementation(((url: string) => {
      if (url === '/auth/me') return meHandler()
      return Promise.resolve({ status: 200, data: null })
    }) as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('un /auth/me colgado se deja de esperar en NETWORK_WAIT_MS y libera el próximo reintento', async () => {
    const store = useUserStore()
    store.markProfileStale()
    meHandler = () => new Promise(() => {}) // CapacitorHttp en iOS: no responde nunca

    void store.retryProfileLoad()
    expect(store.profileRetrying).toBe(true)

    // Mientras está en vuelo, otro reintento no dispara un segundo pedido
    void store.retryProfileLoad()
    expect(meCalls()).toBe(1)

    await vi.advanceTimersByTimeAsync(NETWORK_WAIT_MS)
    expect(store.profileRetrying).toBe(false)
    expect(store.profile).toBeNull()
    expect(store.profileStale).toBe(true)

    // Con la red de vuelta, el siguiente reintento sí sale y carga el perfil
    meHandler = () => Promise.resolve({ data: PROFILE })
    await store.retryProfileLoad()
    expect(meCalls()).toBe(2)
    expect(store.profile?.id).toBe(7)
    expect(store.profileStale).toBe(false)
    expect(store.profileRetrying).toBe(false)
  })

  it('un /auth/me que falla rápido apaga profileRetrying y deja profileStale para reintentar', async () => {
    const store = useUserStore()
    store.markProfileStale()
    meHandler = () => Promise.reject(new Error('Network Error'))

    await store.retryProfileLoad()
    expect(store.profileRetrying).toBe(false)
    expect(store.profileStale).toBe(true)
    expect(store.profile).toBeNull()
  })

  it('sin perfil reintenta aunque profileStale no esté marcado ("Reintentar" de Entrenar)', async () => {
    const store = useUserStore()
    expect(store.profileStale).toBe(false)

    await store.retryProfileLoad()
    expect(meCalls()).toBe(1)
    expect(store.profile?.id).toBe(7)
  })

  it('con perfil y sin profileStale no pide nada', async () => {
    const store = useUserStore()
    await store.retryProfileLoad()
    vi.mocked(api.get).mockClear()

    await store.retryProfileLoad()
    expect(meCalls()).toBe(0)
  })
})
