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
import { useSponsorsStore, type Sponsor } from '../useSponsorsStore'

const SPONSOR_A: Sponsor = {
  id: 11,
  name: 'Verde Vivo',
  category: 'Nutrición',
  logoUrl: null,
  icon: 'eco',
  bgColor: '#2f5d3a',
  textColor: '#ffffff',
  benefit: '20% OFF',
  detail: 'en tu primera compra',
  conditions: null,
  redeemType: 'code',
  redeemCode: 'TEMPLO20',
}

const SPONSOR_B: Sponsor = {
  ...SPONSOR_A,
  id: 12,
  name: 'Kinesio Sur',
  redeemType: 'carnet',
  redeemCode: null,
}

const FEED = { sponsors: [SPONSOR_A, SPONSOR_B], canRedeem: true }

describe('useSponsorsStore (D-20/D-21/D-25)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    warn.mockClear()
  })

  describe('load', () => {
    it('guarda las marcas y canRedeem del feed', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      const store = useSponsorsStore()

      await store.load()

      expect(api.get).toHaveBeenCalledWith('/members/sponsors')
      expect(store.sponsors.map((s) => s.id)).toEqual([11, 12])
      expect(store.canRedeem).toBe(true)
      expect(store.loading).toBe(false)
    })

    it('un socio sin plan: ve las marcas, canRedeem false y el código nulo', async () => {
      vi.mocked(api.get).mockResolvedValue({
        data: { sponsors: [{ ...SPONSOR_A, redeemCode: null }], canRedeem: false },
      })
      const store = useSponsorsStore()

      await store.load()

      expect(store.sponsors).toHaveLength(1)
      expect(store.canRedeem).toBe(false)
      expect(store.sponsors[0]!.redeemCode).toBeNull()
    })

    it('fail-open: si el endpoint falla deja todo vacío, loguea y NO lanza', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      const store = useSponsorsStore()
      await store.load()

      vi.mocked(api.get).mockRejectedValue(new Error('Network Error'))
      await expect(store.load()).resolves.toBeUndefined()

      expect(store.sponsors).toEqual([])
      expect(store.canRedeem).toBe(false)
      expect(store.loading).toBe(false)
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('respuesta sin el campo sponsors: lista vacía', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: {} })
      const store = useSponsorsStore()

      await store.load()

      expect(store.sponsors).toEqual([])
      expect(store.canRedeem).toBe(false)
    })
  })

  describe('markSeen', () => {
    it('postea seen una sola vez por marca aunque se llame varias veces', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useSponsorsStore()

      await store.markSeen(11)
      await store.markSeen(11)
      await Promise.all([store.markSeen(11), store.markSeen(11)])

      expect(api.post).toHaveBeenCalledTimes(1)
      expect(api.post).toHaveBeenCalledWith('/members/sponsors/11/event', { type: 'seen' })
    })

    it('el dedupe es por marca: ver la 11 no impide reportar la 12', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useSponsorsStore()

      await store.markSeen(11)
      await store.markSeen(12)

      expect(api.post).toHaveBeenCalledTimes(2)
    })

    it('si el POST falla no lanza, loguea y permite reintentar', async () => {
      vi.mocked(api.post)
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue({ data: {} })
      const store = useSponsorsStore()

      await expect(store.markSeen(11)).resolves.toBeUndefined()
      expect(warn).toHaveBeenCalledTimes(1)

      await store.markSeen(11)
      expect(api.post).toHaveBeenCalledTimes(2)
    })
  })

  describe('markTapped / markRedeem', () => {
    it('markTapped postea el tipo tapped', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useSponsorsStore()

      await store.markTapped(11)

      expect(api.post).toHaveBeenCalledWith('/members/sponsors/11/event', { type: 'tapped' })
    })

    it('markRedeem postea el tipo redeem', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useSponsorsStore()

      await store.markRedeem(12)

      expect(api.post).toHaveBeenCalledWith('/members/sponsors/12/event', { type: 'redeem' })
    })

    it('son fail-open: un error (404/400/red) no lanza y solo loguea', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('400'))
      const store = useSponsorsStore()

      await expect(store.markTapped(11)).resolves.toBeUndefined()
      await expect(store.markRedeem(11)).resolves.toBeUndefined()

      expect(warn).toHaveBeenCalledTimes(2)
      // Sin reintentos automáticos: un POST por llamada.
      expect(api.post).toHaveBeenCalledTimes(2)
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
      const store = useSponsorsStore()

      const pending = store.load()
      store.reset()
      resolveGet({ data: FEED })
      await pending

      expect(store.sponsors).toEqual([])
      expect(store.canRedeem).toBe(false)
      expect(store.loading).toBe(false)
    })

    it('limpia el feed y el dedupe: la próxima sesión vuelve a reportar', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: FEED })
      vi.mocked(api.post).mockResolvedValue({ data: {} })
      const store = useSponsorsStore()
      await store.load()
      await store.markSeen(11)

      store.reset()
      expect(store.sponsors).toEqual([])

      await store.load()
      await store.markSeen(11)
      expect(api.post).toHaveBeenCalledTimes(2)
    })
  })
})
