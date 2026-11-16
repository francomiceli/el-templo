import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import type { FreeBlockCompleteResponse } from '../../types/free-blocks'

/**
 * Fase 213-08: caracterización de `useFreeBlockCompletion` (cierre del bloque libre).
 * Escrito contra el código actual, antes de extraer `useSingleBlockPlayer`.
 */

const logMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('src/utils/logger', () => ({
  createLogger: () => logMock,
}))

vi.mock('src/boot/axios', () => ({
  api: { post: vi.fn() },
}))

const userStoreMock = vi.hoisted(() => ({ selectedLevel: null as string | null }))
vi.mock('src/stores/useUserStore', () => ({
  useUserStore: () => userStoreMock,
}))

const freeBlocksStoreMock = vi.hoisted(() => ({ applyCompletion: vi.fn() }))
vi.mock('../../stores/freeBlocksStore', () => ({
  useFreeBlocksStore: () => freeBlocksStoreMock,
}))

import { api } from 'src/boot/axios'
import { useFreeBlockCompletion } from '../useFreeBlockCompletion'

const RESPONSE: FreeBlockCompleteResponse = {
  completionId: 77,
  durationSeconds: 300,
  auraAwarded: true,
  auraAvailableToday: false,
}

function httpError(status: number, message: string): AxiosError {
  const response: AxiosResponse = {
    status,
    statusText: String(status),
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { message },
  }
  return new AxiosError(message, 'ERR_BAD_RESPONSE', undefined, undefined, response)
}

describe('useFreeBlockCompletion (caracterización, fase 213-08)', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset()
    freeBlocksStoreMock.applyCompletion.mockReset()
    for (const fn of Object.values(logMock)) fn.mockReset()
    userStoreMock.selectedLevel = null
  })

  it('éxito: devuelve la respuesta, aplica el cupo de AURA y apaga isSubmitting', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: RESPONSE })
    const { complete, isSubmitting, error } = useFreeBlockCompletion()

    const res = await complete({
      blockId: 'b1',
      startedAt: '2026-11-11T12:00:00.000Z',
      exercisesCompleted: [1, 2],
    })

    expect(res).toEqual(RESPONSE)
    expect(api.post).toHaveBeenCalledWith('/sessions/free-blocks/complete', {
      blockId: 'b1',
      startedAt: '2026-11-11T12:00:00.000Z',
      exercisesCompleted: [1, 2],
    })
    expect(freeBlocksStoreMock.applyCompletion).toHaveBeenCalledWith(RESPONSE)
    expect(isSubmitting.value).toBe(false)
    expect(error.value).toBeNull()
  })

  it('suma el nivel elegido del store si el pedido no trae uno, y respeta el del pedido', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: RESPONSE })
    const { complete } = useFreeBlockCompletion()
    const base = { blockId: 'b1', startedAt: 'x', exercisesCompleted: [] }

    userStoreMock.selectedLevel = 'sigma'
    await complete(base)
    expect(vi.mocked(api.post).mock.calls[0]?.[1]).toEqual({ ...base, level: 'sigma' })

    await complete({ ...base, level: 'omega' })
    expect(vi.mocked(api.post).mock.calls[1]?.[1]).toEqual({ ...base, level: 'omega' })
  })

  it('4xx esperado: devuelve null, deja el mensaje del servidor y loguea warn (no error)', async () => {
    vi.mocked(api.post).mockRejectedValue(httpError(409, 'Bloque ya cerrado'))
    const { complete, error, isSubmitting } = useFreeBlockCompletion()

    const res = await complete({ blockId: 'b1', startedAt: 'x', exercisesCompleted: [] })

    expect(res).toBeNull()
    expect(error.value).toBe('Bloque ya cerrado')
    expect(logMock.warn).toHaveBeenCalledTimes(1)
    expect(logMock.error).not.toHaveBeenCalled()
    expect(freeBlocksStoreMock.applyCompletion).not.toHaveBeenCalled()
    expect(isSubmitting.value).toBe(false)
  })

  it('5xx: devuelve null y loguea error', async () => {
    vi.mocked(api.post).mockRejectedValue(httpError(500, 'Boom'))
    const { complete, error } = useFreeBlockCompletion()

    const res = await complete({ blockId: 'b1', startedAt: 'x', exercisesCompleted: [] })

    expect(res).toBeNull()
    expect(error.value).toBe('Boom')
    expect(logMock.error).toHaveBeenCalledTimes(1)
    expect(logMock.warn).not.toHaveBeenCalled()
  })

  it('error de red (sin respuesta): devuelve null y loguea error', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Network Error'))
    const { complete, error } = useFreeBlockCompletion()

    const res = await complete({ blockId: 'b1', startedAt: 'x', exercisesCompleted: [] })

    expect(res).toBeNull()
    expect(error.value).toBe('Network Error')
    expect(logMock.error).toHaveBeenCalledTimes(1)
  })

  it('un segundo complete mientras hay uno en vuelo devuelve null sin pegarle de nuevo a la API', async () => {
    let resolvePost: (v: { data: FreeBlockCompleteResponse }) => void = () => undefined
    vi.mocked(api.post).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve
      }),
    )
    const { complete, isSubmitting } = useFreeBlockCompletion()
    const req = { blockId: 'b1', startedAt: 'x', exercisesCompleted: [] }

    const first = complete(req)
    expect(isSubmitting.value).toBe(true)
    const second = await complete(req)
    expect(second).toBeNull()
    expect(api.post).toHaveBeenCalledTimes(1)

    resolvePost({ data: RESPONSE })
    expect(await first).toEqual(RESPONSE)
  })

  it('cleanup resetea error e isSubmitting', async () => {
    vi.mocked(api.post).mockRejectedValue(httpError(400, 'Mal pedido'))
    const { complete, cleanup, error, isSubmitting } = useFreeBlockCompletion()
    await complete({ blockId: 'b1', startedAt: 'x', exercisesCompleted: [] })
    expect(error.value).toBe('Mal pedido')

    isSubmitting.value = true
    cleanup()

    expect(error.value).toBeNull()
    expect(isSubmitting.value).toBe(false)
  })
})
