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
import { useNovedadesStore, type Novedad } from '../useNovedadesStore'

function byKey(store: ReturnType<typeof useNovedadesStore>, key: string): Novedad {
  const item = store.novedades.find((n) => n.key === key)
  if (!item) throw new Error(`falta ${key} en el store`)
  return item
}

const FEED = {
  novedades: [
    {
      source: 'novedad',
      key: 'novedad:7',
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
      source: 'novedad',
      key: 'novedad:5',
      id: 5,
      text: 'Open gym este sábado',
      branchLabel: 'Constitución',
      publishedAt: '2026-10-10T12:00:00.000Z',
      destination: null,
      seen: true,
    },
  ],
}

/** Espejo de un aviso pop-up (D-13): su `id` es el de `avisos`, puede coincidir con una novedad. */
const AVISO_MIRROR = {
  source: 'aviso',
  key: 'aviso:7',
  id: 7,
  text: 'Promo de octubre',
  branchLabel: null,
  publishedAt: '2026-10-14T00:00:00.000Z',
  destination: {
    type: 'app_section',
    section: 'mi_templo',
    route: '/',
    whatsappText: null,
  },
  seen: false,
}

describe('useNovedadesStore (D-10/D-12/D-13)', () => {
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
      expect(store.novedades.map((n) => n.key)).toEqual(['novedad:7', 'novedad:5'])
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

  describe('load — fuente y clave (D-13)', () => {
    it('con API vieja (sin source/key) cae a source novedad y key novedad:<id>', async () => {
      const legacy = FEED.novedades.map(
        ({ id, text, branchLabel, publishedAt, destination, seen }) => ({
          id,
          text,
          branchLabel,
          publishedAt,
          destination,
          seen,
        }),
      )
      vi.mocked(api.get).mockResolvedValue({ data: { novedades: legacy } })
      const store = useNovedadesStore()

      await store.load()

      expect(store.novedades.map((n) => [n.source, n.key])).toEqual([
        ['novedad', 'novedad:7'],
        ['novedad', 'novedad:5'],
      ])
    })

    it('conserva el source y la key que manda el server para un espejo de aviso', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { novedades: [AVISO_MIRROR, FEED.novedades[0]] },
      })
      const store = useNovedadesStore()

      await store.load()

      expect(store.novedades.map((n) => n.key)).toEqual(['aviso:7', 'novedad:7'])
      expect(store.novedades[0]!.source).toBe('aviso')
    })

    it('un source desconocido se trata como novedad', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { novedades: [{ ...FEED.novedades[0], source: 'otra', key: undefined }] },
      })
      const store = useNovedadesStore()

      await store.load()

      expect(store.novedades[0]).toMatchObject({ source: 'novedad', key: 'novedad:7' })
    })
  })

  describe('markSeen', () => {
    it('es optimista: marca seen=true local y postea el evento', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()

      const pending = store.markSeen(byKey(store, 'novedad:7'))
      // Antes de que responda el POST ya está marcada.
      expect(store.novedades.find((n) => n.key === 'novedad:7')?.seen).toBe(true)
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

      await store.markSeen(byKey(store, 'novedad:7'))
      await store.markSeen(byKey(store, 'novedad:7'))
      await Promise.all([
        store.markSeen(byKey(store, 'novedad:7')),
        store.markSeen(byKey(store, 'novedad:7')),
      ])

      expect(api.post).toHaveBeenCalledTimes(1)
    })

    it('si el POST falla no lanza y permite reintentar', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post)
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()

      await expect(store.markSeen(byKey(store, 'novedad:7'))).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(1)

      await store.markSeen(byKey(store, 'novedad:7'))
      expect(api.post).toHaveBeenCalledTimes(2)
    })
  })

  describe('markClicked', () => {
    it('postea clicked, marca seen local y no lanza si falla', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()

      await store.markClicked(byKey(store, 'novedad:7'))

      expect(api.post).toHaveBeenCalledWith('/communications/me/novedades/7/event', {
        type: 'clicked',
      })
      expect(store.novedades.find((n) => n.key === 'novedad:7')?.seen).toBe(true)

      vi.mocked(api.post).mockRejectedValue(new Error('offline'))
      await expect(store.markClicked(byKey(store, 'novedad:5'))).resolves.toBeUndefined()
    })

    it('un clic cuenta como vista de la sesión: markSeen posterior no repite el POST de seen', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()

      await store.markClicked(byKey(store, 'novedad:7'))
      await store.markSeen(byKey(store, 'novedad:7'))

      expect(api.post).toHaveBeenCalledTimes(1)
    })
  })

  describe('espejo de aviso (D-13)', () => {
    async function loadMixed() {
      vi.mocked(api.get).mockResolvedValue({
        data: { novedades: [AVISO_MIRROR, FEED.novedades[0]] },
      })
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()
      return store
    }

    it('markSeen de un aviso es solo local: marca seen y NO postea', async () => {
      const store = await loadMixed()

      await store.markSeen(byKey(store, 'aviso:7'))

      expect(api.post).not.toHaveBeenCalled()
      expect(byKey(store, 'aviso:7').seen).toBe(true)
    })

    it('markClicked de un aviso postea clicked a /communications/me/avisos/<id>/event', async () => {
      const store = await loadMixed()

      await store.markClicked(byKey(store, 'aviso:7'))

      expect(api.post).toHaveBeenCalledTimes(1)
      expect(api.post).toHaveBeenCalledWith('/communications/me/avisos/7/event', {
        type: 'clicked',
      })
      expect(byKey(store, 'aviso:7').seen).toBe(true)
    })

    it('markClicked de un aviso es fail-open: no lanza y loguea', async () => {
      const store = await loadMixed()
      vi.mocked(api.post).mockRejectedValue(new Error('offline'))

      await expect(store.markClicked(byKey(store, 'aviso:7'))).resolves.toBeUndefined()

      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('dos ítems con el mismo id y distinta fuente no se pisan el seen', async () => {
      const store = await loadMixed()

      await store.markSeen(byKey(store, 'aviso:7'))

      expect(byKey(store, 'aviso:7').seen).toBe(true)
      expect(byKey(store, 'novedad:7').seen).toBe(false)
      expect(api.post).not.toHaveBeenCalled()
    })

    it('el dedupe es por key: ver el aviso 7 no impide reportar la novedad 7', async () => {
      const store = await loadMixed()

      await store.markSeen(byKey(store, 'aviso:7'))
      await store.markSeen(byKey(store, 'novedad:7'))

      expect(api.post).toHaveBeenCalledTimes(1)
      expect(api.post).toHaveBeenCalledWith('/communications/me/novedades/7/event', {
        type: 'seen',
      })
    })

    it('markClicked de una novedad (no aviso) sigue yendo a novedades, no a avisos', async () => {
      const store = await loadMixed()

      await store.markClicked(byKey(store, 'novedad:7'))

      expect(api.post).toHaveBeenCalledWith('/communications/me/novedades/7/event', {
        type: 'clicked',
      })
    })
  })

  describe('reset', () => {
    it('una respuesta que llega después del logout se descarta', async () => {
      let resolveGet: (value: { data: typeof FEED }) => void = () => {}
      vi.mocked(api.get).mockReturnValue(
        new Promise((resolve) => {
          resolveGet = resolve
        }),
      )
      const store = useNovedadesStore()

      const pending = store.load()
      store.reset()
      resolveGet({ data: FEED })
      await pending

      expect(store.novedades).toEqual([])
      expect(store.loading).toBe(false)
    })

    it('si se superponen dos load(), gana el más nuevo', async () => {
      let resolveFirst: (value: { data: typeof FEED }) => void = () => {}
      vi.mocked(api.get)
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
        )
        .mockResolvedValueOnce({ data: { novedades: [FEED.novedades[1]!] } })
      const store = useNovedadesStore()

      const first = store.load()
      await store.load()
      resolveFirst({ data: FEED })
      await first

      expect(store.novedades.map((n) => n.key)).toEqual(['novedad:5'])
    })

    it('limpia la lista y el dedupe: la próxima sesión vuelve a reportar', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useNovedadesStore()
      await store.load()
      await store.markSeen(byKey(store, 'novedad:7'))

      store.reset()
      expect(store.novedades).toEqual([])

      // Nueva sesión: se recarga el feed y la misma novedad se reporta de nuevo.
      await store.load()
      await store.markSeen(byKey(store, 'novedad:7'))
      expect(api.post).toHaveBeenCalledTimes(2)
    })
  })
})
