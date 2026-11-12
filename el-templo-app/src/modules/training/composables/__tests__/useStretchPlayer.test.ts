import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { StretchExercise } from '../../types/stretch'
import { useStretchPlayer } from '../useStretchPlayer'

/**
 * Fase 213-15: estado del player del estiramiento. Índice a mano (nada avanza solo) y un
 * minutero que solo cuenta hacia arriba, calculado contra `Date.now()`.
 */

function ex(exerciseId: number, name: string): StretchExercise {
  return {
    exerciseId,
    name,
    family: 'LS',
    dose: { unit: 'seconds', value: 30, max: null },
    videoUrl: null,
  }
}

const LISTA: StretchExercise[] = [ex(11, 'Isquios'), ex(12, 'Cuello'), ex(13, 'Cuádriceps')]

describe('useStretchPlayer: ejercicios', () => {
  it('setExercises deja el índice en 0 y expone el actual', () => {
    const p = useStretchPlayer()
    p.setExercises(LISTA)
    expect(p.index.value).toBe(0)
    expect(p.current.value?.name).toBe('Isquios')
    expect(p.exercises.value).toHaveLength(3)
    expect(p.isFirst.value).toBe(true)
    expect(p.isLast.value).toBe(false)
  })

  it('setExercises vuelve al 0 aunque ya se hubiera avanzado', () => {
    const p = useStretchPlayer()
    p.setExercises(LISTA)
    p.goTo(2)
    p.setExercises(LISTA)
    expect(p.index.value).toBe(0)
  })

  it('next y prev se mueven de a uno y nunca salen de rango', () => {
    const p = useStretchPlayer()
    p.setExercises(LISTA)
    p.prev()
    expect(p.index.value).toBe(0)
    p.next()
    p.next()
    expect(p.index.value).toBe(2)
    expect(p.isLast.value).toBe(true)
    expect(p.isFirst.value).toBe(false)
    p.next()
    expect(p.index.value).toBe(2)
    p.prev()
    expect(p.current.value?.name).toBe('Cuello')
  })

  it('goTo salta a un ejercicio y descarta índices fuera de rango o no enteros', () => {
    const p = useStretchPlayer()
    p.setExercises(LISTA)
    p.goTo(2)
    expect(p.index.value).toBe(2)
    p.goTo(-1)
    expect(p.index.value).toBe(2)
    p.goTo(3)
    expect(p.index.value).toBe(2)
    p.goTo(Number.NaN)
    expect(p.index.value).toBe(2)
    p.goTo(1.5)
    expect(p.index.value).toBe(2)
    p.goTo(0)
    expect(p.index.value).toBe(0)
  })

  it('sin ejercicios no hay actual y la navegación no rompe', () => {
    const p = useStretchPlayer()
    expect(p.current.value).toBeNull()
    p.next()
    p.prev()
    p.goTo(0)
    expect(p.index.value).toBe(0)
    expect(p.isFirst.value).toBe(true)
    expect(p.isLast.value).toBe(true)
  })

  it('un solo ejercicio es primero y último a la vez', () => {
    const p = useStretchPlayer()
    p.setExercises([ex(1, 'Único')])
    expect(p.isFirst.value).toBe(true)
    expect(p.isLast.value).toBe(true)
  })

  it('cambiar de ejercicio no toca el minutero', async () => {
    vi.useFakeTimers()
    try {
      const p = useStretchPlayer()
      p.setExercises(LISTA)
      p.start()
      await vi.advanceTimersByTimeAsync(5_000)
      p.next()
      p.goTo(0)
      await vi.advanceTimersByTimeAsync(2_000)
      expect(p.elapsedSeconds.value).toBe(7)
      p.cleanup()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('useStretchPlayer: minutero', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('empieza en 0 y no cuenta hasta start()', async () => {
    const p = useStretchPlayer()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(p.elapsedSeconds.value).toBe(0)
    expect(p.isRunning.value).toBe(false)
  })

  it('start() cuenta hacia arriba segundo a segundo', async () => {
    const p = useStretchPlayer()
    p.start()
    expect(p.isRunning.value).toBe(true)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(p.elapsedSeconds.value).toBe(3)
    await vi.advanceTimersByTimeAsync(62_000)
    expect(p.elapsedSeconds.value).toBe(65)
    p.cleanup()
  })

  it('se calcula contra Date.now(): un salto del reloj (timers frenados en segundo plano) se recupera', async () => {
    const p = useStretchPlayer()
    p.start()
    await vi.advanceTimersByTimeAsync(2_000)
    // El sistema frenó los timers 90 s: el próximo tick ya ve el tiempo real.
    vi.setSystemTime(Date.now() + 90_000)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(p.elapsedSeconds.value).toBe(93)
    p.cleanup()
  })

  it('un segundo start() no duplica el intervalo ni reinicia la cuenta', async () => {
    const p = useStretchPlayer()
    p.start()
    await vi.advanceTimersByTimeAsync(4_000)
    p.start()
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(p.elapsedSeconds.value).toBe(5)
    p.cleanup()
  })

  it('stop() congela el minutero y corta el intervalo', async () => {
    const p = useStretchPlayer()
    p.start()
    await vi.advanceTimersByTimeAsync(7_000)
    p.stop()
    expect(p.isRunning.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(p.elapsedSeconds.value).toBe(7)
  })

  it('stop() sin start() no rompe', () => {
    const p = useStretchPlayer()
    expect(() => p.stop()).not.toThrow()
    expect(p.elapsedSeconds.value).toBe(0)
  })

  it('cleanup() corta el intervalo y resetea todo', async () => {
    const p = useStretchPlayer()
    p.setExercises(LISTA)
    p.start()
    p.goTo(2)
    await vi.advanceTimersByTimeAsync(5_000)

    p.cleanup()

    expect(vi.getTimerCount()).toBe(0)
    expect(p.elapsedSeconds.value).toBe(0)
    expect(p.isRunning.value).toBe(false)
    expect(p.index.value).toBe(0)
    expect(p.exercises.value).toEqual([])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(p.elapsedSeconds.value).toBe(0)
  })

  it('después de cleanup() se puede volver a arrancar desde cero', async () => {
    const p = useStretchPlayer()
    p.start()
    await vi.advanceTimersByTimeAsync(5_000)
    p.cleanup()
    p.start()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(p.elapsedSeconds.value).toBe(2)
    p.cleanup()
  })
})
