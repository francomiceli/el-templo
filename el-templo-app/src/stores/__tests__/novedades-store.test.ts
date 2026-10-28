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

  describe('load — clave', () => {
    it('con API vieja (sin key) cae a novedad:<id>', async () => {
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

      expect(store.novedades.map((n) => n.key)).toEqual(['novedad:7', 'novedad:5'])
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

/** Respuesta controlable a mano para observar el estado "en vuelo". */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useNovedadesStore — loaded / lastLoadOk (fase 203, D-02/D-07)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    warn.mockClear()
  })

  it('al inicio: loaded false y lastLoadOk null', () => {
    const store = useNovedadesStore()

    expect(store.loaded).toBe(false)
    expect(store.lastLoadOk).toBeNull()
  })

  it('durante el pedido: loading true pero loaded sigue en false', async () => {
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockReturnValue(gate.promise as never)
    const store = useNovedadesStore()

    const pending = store.load()

    expect(store.loading).toBe(true)
    expect(store.loaded).toBe(false)
    gate.resolve({ data: FEED })
    await pending
    expect(store.loaded).toBe(true)
  })

  it('2xx con datos: loaded true y lastLoadOk true', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: FEED })
    const store = useNovedadesStore()

    await store.load()

    expect(store.loaded).toBe(true)
    expect(store.lastLoadOk).toBe(true)
  })

  it('2xx vacío: lastLoadOk true (vacío no es error)', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { novedades: [] } })
    const store = useNovedadesStore()

    await store.load()

    expect(store.novedades).toEqual([])
    expect(store.loaded).toBe(true)
    expect(store.lastLoadOk).toBe(true)
  })

  it('error: loaded true (fail-open) pero lastLoadOk false', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network Error'))
    const store = useNovedadesStore()

    await store.load()

    expect(store.loaded).toBe(true)
    expect(store.lastLoadOk).toBe(false)
    expect(store.loading).toBe(false)
  })

  it('un segundo load() no vuelve loaded a false (el refresco no vuelve al esqueleto)', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: FEED })
    const store = useNovedadesStore()
    await store.load()

    const gate = deferred<unknown>()
    vi.mocked(api.get).mockReturnValue(gate.promise as never)
    const refresh = store.load()

    expect(store.loaded).toBe(true)
    gate.resolve({ data: FEED })
    await refresh
    expect(store.loaded).toBe(true)
  })

  it('un refresco fallido tras un éxito: lastLoadOk pasa a false', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: FEED })
    const store = useNovedadesStore()
    await store.load()

    vi.mocked(api.get).mockRejectedValue(new Error('Network Error'))
    await store.load()

    expect(store.loaded).toBe(true)
    expect(store.lastLoadOk).toBe(false)
  })

  it('una respuesta de antes del reset() (logout a mitad) no toca loaded ni lastLoadOk', async () => {
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockReturnValue(gate.promise as never)
    const store = useNovedadesStore()
    const pending = store.load()

    store.reset()
    gate.resolve({ data: FEED })
    await pending

    expect(store.loaded).toBe(false)
    expect(store.lastLoadOk).toBeNull()
  })

  it('un error de antes del reset() tampoco toca loaded ni lastLoadOk', async () => {
    const gate = deferred<unknown>()
    vi.mocked(api.get).mockReturnValue(gate.promise as never)
    const store = useNovedadesStore()
    const pending = store.load()

    store.reset()
    gate.reject(new Error('Network Error'))
    await pending

    expect(store.loaded).toBe(false)
    expect(store.lastLoadOk).toBeNull()
  })

  it('la respuesta vieja de un load() superado no pisa a la del más nuevo', async () => {
    const slow = deferred<unknown>()
    vi.mocked(api.get).mockReturnValueOnce(slow.promise as never)
    const store = useNovedadesStore()
    const first = store.load()

    vi.mocked(api.get).mockResolvedValueOnce({ data: FEED })
    await store.load()
    expect(store.lastLoadOk).toBe(true)

    slow.reject(new Error('Network Error'))
    await first

    expect(store.loaded).toBe(true)
    expect(store.lastLoadOk).toBe(true)
  })

  it('reset() baja loaded y lastLoadOk', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: FEED })
    const store = useNovedadesStore()
    await store.load()

    store.reset()

    expect(store.loaded).toBe(false)
    expect(store.lastLoadOk).toBeNull()
  })
})
