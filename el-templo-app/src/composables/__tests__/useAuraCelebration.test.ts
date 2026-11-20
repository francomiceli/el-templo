import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import axios, { AxiosError, type AxiosResponse } from 'axios'
import type { CelebrationResponse } from 'src/types/aura-celebration'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import {
  CELEBRATION_COUNT_DELAY_MS,
  CELEBRATION_IN_MS,
  CELEBRATION_OUT_MS,
  CELEBRATION_REDUCED_STAY_MS,
  CELEBRATION_STAY_MS,
  useAuraCelebration,
  type AuraCelebrationDeps,
} from '../useAuraCelebration'

const PHOTO: CelebrationResponse = {
  movements: [{ id: 41, amount: 5, source: 'profile_photo', label: 'Foto de perfil', gift: null }],
  count: 1,
  sum: 5,
  total: 105,
  maxId: 41,
}

const EMPTY: CelebrationResponse = { movements: [], count: 0, sum: 0, total: 100, maxId: 40 }

type MockedDeps = {
  [K in keyof Required<AuraCelebrationDeps>]: Mock<Required<AuraCelebrationDeps>[K]>
}

function setup(overrides: Partial<MockedDeps> = {}) {
  const deps: MockedDeps = {
    canShow: vi.fn<AuraCelebrationDeps['canShow']>(() => true),
    fetchCelebration: vi.fn<AuraCelebrationDeps['fetchCelebration']>(() => Promise.resolve(PHOTO)),
    ack: vi.fn<AuraCelebrationDeps['ack']>(() => Promise.resolve()),
    onTotal: vi.fn<AuraCelebrationDeps['onTotal']>(),
    reducedMotion: vi.fn<Required<AuraCelebrationDeps>['reducedMotion']>(() => false),
    ...overrides,
  }
  return { deps, celebration: useAuraCelebration(deps) }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAuraCelebration: cuándo se muestra', () => {
  it('sin nada para celebrar no muestra la tarjeta ni manda el ack', async () => {
    const { deps, celebration } = setup({ fetchCelebration: vi.fn(() => Promise.resolve(EMPTY)) })

    await celebration.check()

    expect(celebration.card.value).toBeNull()
    expect(deps.ack).not.toHaveBeenCalled()
    expect(deps.onTotal).not.toHaveBeenCalled()
  })

  it('con el encabezado no visible no consulta siquiera', async () => {
    const { deps, celebration } = setup({ canShow: vi.fn(() => false) })

    await celebration.check()

    expect(deps.fetchCelebration).not.toHaveBeenCalled()
    expect(celebration.card.value).toBeNull()
  })

  it('si el encabezado deja de estar visible mientras se espera, no muestra y NO manda el ack', async () => {
    let visible = true
    const { deps, celebration } = setup({ canShow: vi.fn(() => visible) })
    deps.fetchCelebration.mockImplementation(() => {
      visible = false
      return Promise.resolve(PHOTO)
    })

    await celebration.check()

    expect(celebration.card.value).toBeNull()
    expect(deps.ack).not.toHaveBeenCalled()
  })

  it('al mostrar manda el ack con el maxId del servidor', async () => {
    const { deps, celebration } = setup()

    await celebration.check()

    expect(celebration.card.value).not.toBeNull()
    expect(deps.ack).toHaveBeenCalledTimes(1)
    expect(deps.ack).toHaveBeenCalledWith(41)
  })

  it('dos consultas a la vez hacen un solo pedido', async () => {
    const { deps, celebration } = setup()

    await Promise.all([celebration.check(), celebration.check()])

    expect(deps.fetchCelebration).toHaveBeenCalledTimes(1)
  })

  it('con una tarjeta en pantalla no vuelve a consultar', async () => {
    const { deps, celebration } = setup()
    await celebration.check()

    await celebration.check()

    expect(deps.fetchCelebration).toHaveBeenCalledTimes(1)
  })

  it('un 404 (módulo apagado) es silencioso y no deja la consulta trabada', async () => {
    const notFound = new AxiosError('no', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 404,
    } as AxiosResponse)
    const { deps, celebration } = setup({ fetchCelebration: vi.fn(() => Promise.reject(notFound)) })
    expect(axios.isAxiosError(notFound)).toBe(true)

    await celebration.check()
    deps.fetchCelebration.mockImplementation(() => Promise.resolve(PHOTO))
    await celebration.check()

    expect(celebration.card.value).not.toBeNull()
  })

  it('un error de red no rompe y el ack que falla no esconde la tarjeta', async () => {
    const { deps, celebration } = setup()
    deps.fetchCelebration.mockImplementationOnce(() => Promise.reject(new Error('red')))
    await expect(celebration.check()).resolves.toBeUndefined()
    expect(celebration.card.value).toBeNull()

    deps.ack.mockImplementation(() => Promise.reject(new Error('ack')))
    await celebration.check()
    await vi.advanceTimersByTimeAsync(0)

    expect(celebration.card.value).not.toBeNull()
  })
})

describe('useAuraCelebration: animación', () => {
  it('la ficha arranca en total menos lo sumado, cuenta hasta el total y deja el total en el perfil', async () => {
    const { deps, celebration } = setup()
    await celebration.check()

    // Recién mostrada: la tarjeta existe pero todavía no entró y la ficha muestra el número viejo.
    expect(celebration.shown.value).toBe(false)
    expect(celebration.chipValue.value).toBe(100)

    await vi.advanceTimersByTimeAsync(CELEBRATION_IN_MS)
    expect(celebration.shown.value).toBe(true)

    await vi.advanceTimersByTimeAsync(CELEBRATION_COUNT_DELAY_MS)
    expect(celebration.chipPulse.value).toBe(true)
    expect(celebration.plusAmount.value).toBe(5)

    await vi.advanceTimersByTimeAsync(1500)
    expect(deps.onTotal).toHaveBeenCalledTimes(1)
    expect(deps.onTotal).toHaveBeenCalledWith(105)
    expect(celebration.chipValue.value).toBeNull()
    expect(celebration.chipPulse.value).toBe(false)
    expect(celebration.plusAmount.value).toBeNull()
  })

  it('el número solo sube y termina exactamente en el total', async () => {
    const seen: number[] = []
    const { celebration } = setup({
      fetchCelebration: vi.fn(() =>
        Promise.resolve({ ...PHOTO, sum: 12, total: 112, count: 2, movements: PHOTO.movements }),
      ),
    })
    await celebration.check()
    await vi.advanceTimersByTimeAsync(CELEBRATION_IN_MS + CELEBRATION_COUNT_DELAY_MS)
    for (let i = 0; i < 40; i++) {
      await vi.advanceTimersByTimeAsync(50)
      if (celebration.chipValue.value !== null) seen.push(celebration.chipValue.value)
    }

    expect(seen.length).toBeGreaterThan(0)
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
    expect(Math.max(...seen)).toBeLessThanOrEqual(112)
  })

  it('se va sola a los 5 segundos y la tarjeta se retira tras la salida', async () => {
    const { celebration } = setup()
    await celebration.check()

    await vi.advanceTimersByTimeAsync(CELEBRATION_STAY_MS - 1)
    expect(celebration.shown.value).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(celebration.shown.value).toBe(false)
    expect(celebration.card.value).not.toBeNull()
    await vi.advanceTimersByTimeAsync(CELEBRATION_OUT_MS)
    expect(celebration.card.value).toBeNull()
  })

  it('tocarla la cierra, corta lo que falte del conteo y deja el total una sola vez', async () => {
    const { deps, celebration } = setup()
    await celebration.check()
    await vi.advanceTimersByTimeAsync(CELEBRATION_IN_MS + CELEBRATION_COUNT_DELAY_MS + 100)

    celebration.dismiss()
    celebration.dismiss()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(deps.onTotal).toHaveBeenCalledTimes(1)
    expect(deps.onTotal).toHaveBeenCalledWith(105)
    expect(celebration.chipValue.value).toBeNull()
    expect(celebration.card.value).toBeNull()
    expect(celebration.shown.value).toBe(false)
    expect(celebration.chipPulse.value).toBe(false)
  })

  it('cerrarla antes de que entre no reabre nada después', async () => {
    const { deps, celebration } = setup()
    await celebration.check()

    celebration.dismiss()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(celebration.shown.value).toBe(false)
    expect(celebration.chipValue.value).toBeNull()
    expect(deps.onTotal).toHaveBeenCalledTimes(1)
  })

  it('con movimiento reducido aparece de una, sin conteo ni latido, y el total queda al instante', async () => {
    const { deps, celebration } = setup({ reducedMotion: vi.fn(() => true) })

    await celebration.check()

    expect(celebration.card.value).not.toBeNull()
    expect(celebration.shown.value).toBe(true)
    expect(celebration.chipValue.value).toBeNull()
    expect(celebration.chipPulse.value).toBe(false)
    expect(celebration.plusAmount.value).toBeNull()
    expect(deps.onTotal).toHaveBeenCalledWith(105)

    await vi.advanceTimersByTimeAsync(CELEBRATION_REDUCED_STAY_MS)
    expect(celebration.shown.value).toBe(false)
    await vi.advanceTimersByTimeAsync(CELEBRATION_OUT_MS)
    expect(celebration.card.value).toBeNull()
  })

  it('cleanup a mitad del conteo deja el total real, apaga todo y no deja timers', async () => {
    const { deps, celebration } = setup()
    await celebration.check()
    await vi.advanceTimersByTimeAsync(CELEBRATION_IN_MS + CELEBRATION_COUNT_DELAY_MS + 100)

    celebration.cleanup()

    expect(deps.onTotal).toHaveBeenCalledWith(105)
    expect(celebration.card.value).toBeNull()
    expect(celebration.chipValue.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleanup mientras se espera la respuesta: no muestra y no manda el ack', async () => {
    let resolve: (value: CelebrationResponse) => void = () => undefined
    const { deps, celebration } = setup({
      fetchCelebration: vi.fn(
        () =>
          new Promise<CelebrationResponse>((r) => {
            resolve = r
          }),
      ),
    })
    const pending = celebration.check()

    celebration.cleanup()
    resolve(PHOTO)
    await pending

    expect(celebration.card.value).toBeNull()
    expect(deps.ack).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('después de cleanup, check no hace nada', async () => {
    const { deps, celebration } = setup()
    celebration.cleanup()

    await celebration.check()

    expect(deps.fetchCelebration).not.toHaveBeenCalled()
  })
})
