import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

import { api } from 'src/boot/axios'
import { useAvisosStore } from '../useAvisosStore'

const RATING_PROMPT = {
  prompt: {
    kind: 'rating',
    aviso: {
      id: 42,
      title: 'Puntuá tu clase',
      body: 'Contanos cómo estuvo',
      buttonText: 'Puntuar',
      destination: {
        type: 'app_section',
        section: 'mi_templo',
        route: '/mi-templo',
        whatsappText: null,
      },
    },
    pending: {
      sessionDate: '2026-09-01',
      branchId: 1,
      scheduleId: 10,
      activityName: 'Funcional',
      dayOfWeek: 2,
    },
  },
}

describe('useAvisosStore (D-06/D-07/D-11 — un pop-up por apertura + eventos server-side)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
  })

  it('evaluate() llama al endpoint UNA sola vez aunque se invoque tres veces', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { prompt: null } })
    const store = useAvisosStore()

    await Promise.all([store.evaluate(), store.evaluate(), store.evaluate()])

    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/communications/me/prompt')
  })

  it('con kind "rating", isRating queda true y los otros tres en false', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: RATING_PROMPT })
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
    const store = useAvisosStore()

    await store.evaluate()

    expect(store.isRating).toBe(true)
    expect(store.isPlanExpiry).toBe(false)
    expect(store.isAviso).toBe(false)
    expect(store.isImprovement).toBe(false)
  })

  it('evaluate() reporta el evento "shown" una sola vez cuando vino un aviso', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: RATING_PROMPT })
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
    const store = useAvisosStore()

    await store.evaluate()

    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/communications/me/avisos/42/event', {
      type: 'shown',
    })
  })

  it('un 500 del endpoint deja prompt en null sin lanzar', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('500'))
    const store = useAvisosStore()

    await expect(store.evaluate()).resolves.toBeUndefined()
    expect(store.prompt).toBeNull()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('reportDismissed y reportClicked postean el tipo correspondiente', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
    const store = useAvisosStore()

    await store.reportDismissed(7)
    await store.reportClicked(8)

    expect(api.post).toHaveBeenNthCalledWith(1, '/communications/me/avisos/7/event', {
      type: 'dismissed',
    })
    expect(api.post).toHaveBeenNthCalledWith(2, '/communications/me/avisos/8/event', {
      type: 'clicked',
    })
  })

  it('reset() limpia prompt/evaluated y permite volver a evaluar', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { prompt: null } })
    const store = useAvisosStore()

    await store.evaluate()
    expect(api.get).toHaveBeenCalledTimes(1)

    store.reset()
    expect(store.prompt).toBeNull()
    expect(store.evaluated).toBe(false)

    await store.evaluate()
    expect(api.get).toHaveBeenCalledTimes(2)
  })
})
