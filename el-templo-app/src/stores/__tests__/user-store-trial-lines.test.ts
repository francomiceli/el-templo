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

describe('useUserStore.loadEspecialPass — trialLines (clase de prueba gratis)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
  })

  it('sin pase: guarda trialLines aunque hasPass sea false', async () => {
    vi.mocked(api.get).mockResolvedValue({
      status: 200,
      data: { hasPass: false, trialLines: ['Yoga'] },
    })
    const store = useUserStore()
    await store.loadEspecialPass()
    expect(store.especialPass).toBeNull()
    expect(store.trialLines).toEqual(['Yoga'])
  })

  it('con pase: guarda trialLines junto al pase', async () => {
    vi.mocked(api.get).mockResolvedValue({
      status: 200,
      data: {
        hasPass: true,
        classesRemaining: 1,
        classesBudget: 2,
        endDate: '2026-10-30',
        isSocio: false,
        trialLines: ['Yoga'],
      },
    })
    const store = useUserStore()
    await store.loadEspecialPass()
    expect(store.hasEspecialPass).toBe(true)
    expect(store.trialLines).toEqual(['Yoga'])
  })

  it('payload viejo sin trialLines: queda []', async () => {
    vi.mocked(api.get).mockResolvedValue({ status: 200, data: { hasPass: false } })
    const store = useUserStore()
    await store.loadEspecialPass()
    expect(store.trialLines).toEqual([])
  })

  it('error de red: resetea trialLines a []', async () => {
    const store = useUserStore()
    vi.mocked(api.get).mockResolvedValueOnce({
      status: 200,
      data: { hasPass: false, trialLines: ['Yoga'] },
    })
    await store.loadEspecialPass()
    expect(store.trialLines).toEqual(['Yoga'])
    vi.mocked(api.get).mockRejectedValueOnce(new Error('network'))
    await store.loadEspecialPass()
    expect(store.trialLines).toEqual([])
  })
})
