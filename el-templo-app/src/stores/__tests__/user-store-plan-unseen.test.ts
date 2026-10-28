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
})
