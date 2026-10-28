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

/** Respuesta controlable a mano para observar el estado "en vuelo". */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useUserStore · pelotita de Planes (hasUnseenPlanUpdate)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('loadPlanStatus conserva hasUnseenPlanUpdate del server', async () => {
    vi.mocked(api.get).mockResolvedValue({
      status: 200,
      data: { hasActivePlan: true, hasUnseenPlanUpdate: true },
    })
    const store = useUserStore()
    await store.loadPlanStatus()
    expect(store.planStatus?.hasUnseenPlanUpdate).toBe(true)
  })

  it('clearPlanUpdateUnseen apaga solo el flag', async () => {
    vi.mocked(api.get).mockResolvedValue({
      status: 200,
      data: { hasActivePlan: true, hadPlan: true, hasUnseenPlanUpdate: true },
    })
    const store = useUserStore()
    await store.loadPlanStatus()
    store.clearPlanUpdateUnseen()
    expect(store.planStatus?.hasUnseenPlanUpdate).toBe(false)
    expect(store.planStatus?.hasActivePlan).toBe(true)
    expect(store.planStatus?.hadPlan).toBe(true)
  })

  it('clearPlanUpdateUnseen sin planStatus cargado no hace nada ni lanza', () => {
    const store = useUserStore()
    expect(() => store.clearPlanUpdateUnseen()).not.toThrow()
    expect(store.planStatus).toBeNull()
  })

  describe('carrera del "visto" (respuesta de plan-status en vuelo)', () => {
    it('una respuesta que salió ANTES de clearPlanUpdateUnseen no reabre la pelotita pero sí actualiza el resto', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: { hasActivePlan: false, hasUnseenPlanUpdate: true },
      })
      const store = useUserStore()
      await store.loadPlanStatus()
      expect(store.planStatus?.hasUnseenPlanUpdate).toBe(true)

      const late = deferred<unknown>()
      vi.mocked(api.get).mockImplementation(() => late.promise as Promise<never>)
      const pending = store.loadPlanStatus()
      store.clearPlanUpdateUnseen()

      late.resolve({ status: 200, data: { hasActivePlan: true, hasUnseenPlanUpdate: true } })
      await pending
      expect(store.planStatus?.hasUnseenPlanUpdate).toBe(false)
      expect(store.planStatus?.hasActivePlan).toBe(true)
    })

    it('un loadPlanStatus arrancado DESPUÉS del clear sí refleja al server (membresía nueva prende la pelotita)', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: { hasActivePlan: true, hasUnseenPlanUpdate: false },
      })
      const store = useUserStore()
      await store.loadPlanStatus()
      store.clearPlanUpdateUnseen()

      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: { hasActivePlan: true, hasUnseenPlanUpdate: true },
      })
      await store.loadPlanStatus()
      expect(store.planStatus?.hasUnseenPlanUpdate).toBe(true)
    })

    it('el mismo flujo vía ensureMemberState: la respuesta de plan-status de una carga arrancada antes del clear no reabre la pelotita', async () => {
      const late = deferred<unknown>()
      vi.mocked(api.get).mockImplementation(async (url: string) => {
        if (url.endsWith('/me/plan-status')) return (await late.promise) as never
        return { status: 204, data: null } as never
      })
      const store = useUserStore()
      const load = store.ensureMemberState()
      store.clearPlanUpdateUnseen()

      late.resolve({ status: 200, data: { hasActivePlan: false, hasUnseenPlanUpdate: true } })
      await load
      expect(store.planStatus).not.toBeNull()
      expect(store.planStatus?.hasUnseenPlanUpdate).toBe(false)
    })

    it('clearProfile reinicia la secuencia: un socio nuevo no hereda el "visto" del anterior', async () => {
      vi.mocked(api.get).mockResolvedValue({
        status: 200,
        data: { hasActivePlan: true, hasUnseenPlanUpdate: true },
      })
      const store = useUserStore()
      store.clearPlanUpdateUnseen()
      store.clearProfile()

      await store.loadPlanStatus()
      expect(store.planStatus?.hasUnseenPlanUpdate).toBe(true)
    })
  })
})
