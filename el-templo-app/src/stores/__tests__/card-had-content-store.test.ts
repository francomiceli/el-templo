import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick, watch } from 'vue'
import type { CardHadContentMap } from 'src/composables/useCardHadContentStorage'

// Storage mockeado: cuenta lecturas/escrituras y deja controlar cuándo responde la lectura.
const { read, write } = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}))

vi.mock('src/composables/useCardHadContentStorage', () => ({
  useCardHadContentStorage: () => ({ read, write }),
}))

import { useCardHadContentStore } from '../useCardHadContentStore'

/** Promesa que se resuelve a mano, para simular una lectura lenta de Preferences. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useCardHadContentStore (D-02/D-03)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    read.mockReset()
    write.mockReset()
    read.mockResolvedValue({})
    write.mockResolvedValue(undefined)
  })

  it('antes de hydrate: map es {}, hydratedFor es null y hadContent es false', () => {
    const store = useCardHadContentStore()
    expect(store.map).toEqual({})
    expect(store.hydratedFor).toBeNull()
    expect(store.hadContent('novedades')).toBe(false)
    expect(read).not.toHaveBeenCalled()
  })

  it('después de hydrate: hadContent lee el mapa guardado en forma síncrona', async () => {
    read.mockResolvedValueOnce({ novedades: true, sponsors: false })
    const store = useCardHadContentStore()
    await store.hydrate(7)
    expect(read).toHaveBeenCalledWith(7)
    expect(store.hydratedFor).toBe(7)
    expect(store.map).toEqual({ novedades: true, sponsors: false })
    expect(store.hadContent('novedades')).toBe(true)
    expect(store.hadContent('sponsors')).toBe(false)
    expect(store.hadContent('checkIn')).toBe(false)
  })

  it('hydrate del mismo socio dos veces lee el storage una sola vez', async () => {
    const store = useCardHadContentStore()
    await store.hydrate(7)
    await store.hydrate(7)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('dos hydrate del mismo socio en vuelo comparten la misma lectura', async () => {
    const slow = deferred<CardHadContentMap>()
    read.mockReturnValueOnce(slow.promise)
    const store = useCardHadContentStore()
    const a = store.hydrate(7)
    const b = store.hydrate(7)
    slow.resolve({ checkIn: true })
    await Promise.all([a, b])
    expect(read).toHaveBeenCalledTimes(1)
    expect(store.hadContent('checkIn')).toBe(true)
  })

  it('hydrate de otro socio reemplaza el mapa y no deja ver el anterior mientras lee', async () => {
    read.mockResolvedValueOnce({ novedades: true })
    const store = useCardHadContentStore()
    await store.hydrate(1)
    expect(store.hadContent('novedades')).toBe(true)

    const slow = deferred<CardHadContentMap>()
    read.mockReturnValueOnce(slow.promise)
    const pending = store.hydrate(2)
    expect(store.hadContent('novedades')).toBe(false)
    expect(store.hydratedFor).toBeNull()

    slow.resolve({ sponsors: true })
    await pending
    expect(store.hydratedFor).toBe(2)
    expect(store.map).toEqual({ sponsors: true })
  })

  it('una lectura lenta del socio anterior no pisa al socio nuevo', async () => {
    const slowOld = deferred<CardHadContentMap>()
    read.mockReturnValueOnce(slowOld.promise)
    read.mockResolvedValueOnce({ sponsors: true })
    const store = useCardHadContentStore()
    const first = store.hydrate(1)
    await store.hydrate(2)
    slowOld.resolve({ novedades: true })
    await first
    expect(store.hydratedFor).toBe(2)
    expect(store.map).toEqual({ sponsors: true })
  })

  it('record(card, true) actualiza el mapa y persiste bajo el socio hidratado', async () => {
    const store = useCardHadContentStore()
    await store.hydrate(7)
    store.record('novedades', true)
    expect(store.hadContent('novedades')).toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(7, { novedades: true })
  })

  it('record acumula cards y persiste el mapa completo', async () => {
    read.mockResolvedValueOnce({ sponsors: true })
    const store = useCardHadContentStore()
    await store.hydrate(7)
    store.record('novedades', true)
    expect(write).toHaveBeenLastCalledWith(7, { sponsors: true, novedades: true })
  })

  it('record con el mismo valor no vuelve a escribir', async () => {
    const store = useCardHadContentStore()
    await store.hydrate(7)
    store.record('novedades', true)
    store.record('novedades', true)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('record(card, false) pasa un hadContent true a false y persiste', async () => {
    read.mockResolvedValueOnce({ novedades: true })
    const store = useCardHadContentStore()
    await store.hydrate(7)
    store.record('novedades', false)
    expect(store.hadContent('novedades')).toBe(false)
    expect(write).toHaveBeenCalledWith(7, { novedades: false })
  })

  it('record sin socio hidratado actualiza el ref pero no persiste', () => {
    const store = useCardHadContentStore()
    store.record('novedades', true)
    expect(store.hadContent('novedades')).toBe(true)
    expect(write).not.toHaveBeenCalled()
  })

  it('el mapa expuesto es reactivo: un watcher ve el cambio de record', async () => {
    const store = useCardHadContentStore()
    await store.hydrate(7)
    const seen: boolean[] = []
    watch(
      () => store.map.checkIn === true,
      (value) => {
        seen.push(value)
      },
    )
    store.record('checkIn', true)
    await nextTick()
    expect(seen).toEqual([true])
  })

  it('reset() vuelve a {} y hydratedFor a null; un hydrate posterior vuelve a leer', async () => {
    read.mockResolvedValueOnce({ novedades: true })
    const store = useCardHadContentStore()
    await store.hydrate(7)
    store.reset()
    expect(store.map).toEqual({})
    expect(store.hydratedFor).toBeNull()
    expect(store.hadContent('novedades')).toBe(false)

    await store.hydrate(7)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('reset() durante una lectura en vuelo descarta ese resultado (logout)', async () => {
    const slow = deferred<CardHadContentMap>()
    read.mockReturnValueOnce(slow.promise)
    const store = useCardHadContentStore()
    const pending = store.hydrate(7)
    store.reset()
    slow.resolve({ novedades: true })
    await pending
    expect(store.hydratedFor).toBeNull()
    expect(store.map).toEqual({})
  })
})
