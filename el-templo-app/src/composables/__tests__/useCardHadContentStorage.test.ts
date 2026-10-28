import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mismo patrón que useTipsSeenStorage.test.ts: Capacitor reporta web (localStorage) y se
// instala un shim en memoria.
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}))
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}))
vi.mock('src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn,
    error: vi.fn(),
  }),
}))

import { useCardHadContentStorage } from '../useCardHadContentStorage'

function installLocalStorage() {
  const store = new Map<string, string>()
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
  }
  ;(globalThis as unknown as { localStorage: typeof ls }).localStorage = ls
  return store
}

describe('useCardHadContentStorage (D-02/D-03)', () => {
  let store: Map<string, string>

  beforeEach(() => {
    warn.mockClear()
    store = installLocalStorage()
  })

  it('read devuelve {} si no hay nada guardado', async () => {
    const { read } = useCardHadContentStorage()
    expect(await read(1)).toEqual({})
    expect(warn).not.toHaveBeenCalled()
  })

  it('write + read: devuelve el mapa guardado', async () => {
    const { read, write } = useCardHadContentStorage()
    await write(1, { novedades: true, sponsors: false })
    expect(await read(1)).toEqual({ novedades: true, sponsors: false })
  })

  it('la clave exacta es eltemplo.cardHadContent:<userId> con un JSON por socio', async () => {
    const { write } = useCardHadContentStorage()
    await write(7, { checkIn: true })
    expect(JSON.parse(store.get('eltemplo.cardHadContent:7') ?? 'null')).toEqual({
      checkIn: true,
    })
    expect(store.size).toBe(1)
  })

  it('está aislado por socio: lo del 1 no aparece en el 2', async () => {
    const { read, write } = useCardHadContentStorage()
    await write(1, { novedades: true })
    expect(await read(2)).toEqual({})
  })

  it('JSON corrupto → {} y log.warn, sin romper', async () => {
    store.set('eltemplo.cardHadContent:1', '{no es json')
    const { read } = useCardHadContentStorage()
    expect(await read(1)).toEqual({})
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('descarta valores no booleanos y claves desconocidas al leer (D-03)', async () => {
    store.set(
      'eltemplo.cardHadContent:1',
      JSON.stringify({
        novedades: 'true',
        sponsors: 1,
        checkIn: true,
        weekStrip: null,
        evaluation: false,
        otraCard: true,
      }),
    )
    const { read } = useCardHadContentStorage()
    expect(await read(1)).toEqual({ checkIn: true, evaluation: false })
  })

  it('un JSON que no es un objeto (array, número, null) → {}', async () => {
    const { read } = useCardHadContentStorage()
    for (const raw of ['[true,false]', '42', 'null', '"hola"']) {
      store.set('eltemplo.cardHadContent:1', raw)
      expect(await read(1)).toEqual({})
    }
  })

  it('write nunca guarda algo que no sea booleano de una CardKey conocida', async () => {
    const { write } = useCardHadContentStorage()
    const dirty = {
      novedades: true,
      sponsors: 'contenido secreto',
      otraCard: true,
    } as unknown as Parameters<typeof write>[1]
    await write(1, dirty)
    expect(JSON.parse(store.get('eltemplo.cardHadContent:1') ?? 'null')).toEqual({
      novedades: true,
    })
  })

  it('un storage que tira excepción no rompe: read → {} y write solo loguea', async () => {
    const throwing = {
      getItem: () => {
        throw new Error('quota')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    }
    ;(globalThis as unknown as { localStorage: typeof throwing }).localStorage = throwing

    const { read, write } = useCardHadContentStorage()
    await expect(write(1, { novedades: true })).resolves.toBeUndefined()
    await expect(read(1)).resolves.toEqual({})
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
