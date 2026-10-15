import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))
vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}))

vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

import { api } from 'src/boot/axios'
import { useNovedadesStore } from '../useNovedadesStore'

const FEED = {
  novedades: [
    {
      id: 7,
      text: 'Incorporamos clases de yoga',
      branchLabel: null,
      publishedAt: '2026-10-13T12:00:00.000Z',
      destination: {
        type: 'app_section',
        section: 'reservas',
        route: '/reservas',
        whatsappText: null,
      },
      seen: false,
    },
    {
      id: 5,
      text: 'Open gym este sábado',
      branchLabel: 'Constitución',
      publishedAt: '2026-10-10T12:00:00.000Z',
      destination: null,
      seen: true,
    },
  ],
}

describe('useNovedadesStore (D-10/D-12)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    warn.mockClear()
  })

  describe('load', () => {
    it('desenvuelve { novedades } y guarda la lista', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      const store = useNovedadesStore()

      await store.load()

      expect(api.get).toHaveBeenCalledWith('/communications/me/novedades')
      expect(store.novedades.map((n) => n.id)).toEqual([7, 5])
      expect(store.loading).toBe(false)
    })

    it('fail-open: si el endpoint falla deja la lista vacía, loguea y NO lanza', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      const store = useNovedadesStore()
      await store.load()

      vi.mocked(api.get).mockRejectedValue(new Error('Network Error'))
      await expect(store.load()).resolves.toBeUndefined()

      expect(store.novedades).toEqual([])
      expect(store.loading).toBe(false)
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('respuesta sin el campo novedades: lista vacía', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()

      await store.load()

      expect(store.novedades).toEqual([])
    })
  })

  describe('markSeen', () => {
    it('es optimista: marca seen=true local y postea el evento', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()

      const pending = store.markSeen(7)
      // Antes de que responda el POST ya está marcada.
      expect(store.novedades.find((n) => n.id === 7)?.seen).toBe(true)
      await pending

      expect(api.post).toHaveBeenCalledWith('/communications/me/novedades/7/event', {
        type: 'seen',
      })
    })

    it('deduplica por sesión: la segunda llamada no vuelve a postear', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()

      await store.markSeen(7)
      await store.markSeen(7)
      await Promise.all([store.markSeen(7), store.markSeen(7)])

      expect(api.post).toHaveBeenCalledTimes(1)
    })

    it('si el POST falla no lanza y permite reintentar', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()

      await expect(store.markSeen(7)).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(1)

      await store.markSeen(7)
      expect(api.post).toHaveBeenCalledTimes(2)
    })
  })

  describe('markClicked', () => {
    it('postea clicked, marca seen local y no lanza si falla', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()

      await store.markClicked(7)

      expect(api.post).toHaveBeenCalledWith('/communications/me/novedades/7/event', {
        type: 'clicked',
      })
      expect(store.novedades.find((n) => n.id === 7)?.seen).toBe(true)

      vi.mocked(api.post).mockRejectedValue(new Error('offline'))
      await expect(store.markClicked(5)).resolves.toBeUndefined()
    })

    it('un clic cuenta como vista de la sesión: markSeen posterior no repite el POST de seen', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()

      await store.markClicked(7)
      await store.markSeen(7)

      expect(api.post).toHaveBeenCalledTimes(1)
    })
  })

  describe('reset', () => {
    it('limpia la lista y el dedupe: la próxima sesión vuelve a reportar', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()
      await store.markSeen(7)

      store.reset()
      expect(store.novedades).toEqual([])

      await store.markSeen(7)
      expect(api.post).toHaveBeenCalledTimes(2)
    })
  })
})
