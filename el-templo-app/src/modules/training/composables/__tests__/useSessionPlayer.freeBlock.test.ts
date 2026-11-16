import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Block, Prescription, Session } from '../../types/session'
import type { SessionProgress } from '../../stores/sessionPlayerStore'

/**
 * Fase 213-08: caracterización de `useSessionPlayer(session, { freeBlock: true })`.
 *
 * Fija lo que el composable hace HOY en modo bloque libre (fase 197 D-15), ANTES de extraer
 * `useSingleBlockPlayer` de `FreeBlockPlayer.vue`. Si algo cambia al refactorizar, estos
 * tests lo detectan. El store se reemplaza por un fake en memoria (sin Capacitor ni Pinia).
 */

const fakeStore = vi.hoisted(() => {
  const progress = new Map<string, Record<string, unknown>>()

  function blank(): Record<string, unknown> {
    return {
      currentBlockIndex: 0,
      completedBlocks: [],
      deuterosChoice: null,
      elapsedSeconds: 0,
      sessionTimerStartedAt: null,
      completedExercises: {},
    }
  }

  async function loadProgress(dayId: string): Promise<Record<string, unknown>> {
    let p = progress.get(dayId)
    if (!p) {
      p = blank()
      progress.set(dayId, p)
    }
    return p
  }

  async function saveProgress(dayId: string, data: Record<string, unknown>): Promise<void> {
    const current = progress.get(dayId) ?? blank()
    progress.set(dayId, { ...current, ...data })
  }

  const store = {
    loadProgress: vi.fn(loadProgress),
    saveProgress: vi.fn(saveProgress),
    clearProgress: vi.fn(async (dayId: string) => {
      progress.delete(dayId)
    }),
    saveCompletedBlock: vi.fn(async (dayId: string, role: string) => {
      const p = await loadProgress(dayId)
      const blocks = p.completedBlocks as string[]
      if (!blocks.includes(role)) await saveProgress(dayId, { completedBlocks: [...blocks, role] })
    }),
    saveCurrentBlockIndex: vi.fn(async (dayId: string, i: number) => {
      await saveProgress(dayId, { currentBlockIndex: i })
    }),
    saveDeuterosChoice: vi.fn(async (dayId: string, c: string) => {
      await saveProgress(dayId, { deuterosChoice: c })
    }),
    saveCompletedExercise: vi.fn(async (dayId: string, role: string, id: number) => {
      const p = await loadProgress(dayId)
      const all = p.completedExercises as Record<string, number[]>
      const current = all[role] ?? []
      if (!current.includes(id)) {
        await saveProgress(dayId, { completedExercises: { ...all, [role]: [...current, id] } })
      }
    }),
    removeCompletedExercise: vi.fn(async (dayId: string, role: string, id: number) => {
      const p = await loadProgress(dayId)
      const all = p.completedExercises as Record<string, number[]>
      const current = all[role] ?? []
      await saveProgress(dayId, {
        completedExercises: { ...all, [role]: current.filter((x) => x !== id) },
      })
    }),
  }
  return { progress, blank, store }
})

vi.mock('../../stores/sessionPlayerStore', () => ({
  useSessionPlayerStore: () => fakeStore.store,
}))

import { useSessionPlayer } from '../useSessionPlayer'

const DAY_ID = 'XB-test'

function prescription(exerciseId: number, sortOrder: number): Prescription {
  return {
    exerciseId,
    exerciseName: `Ejercicio ${exerciseId}`,
    contraction: 'CON',
    reps: 10,
    repsMax: null,
    seconds: null,
    secondsMax: null,
    increment: null,
    rest: 30,
    notes: null,
    sortOrder,
    videoUrl: null,
  }
}

function block(): Block {
  return {
    blockId: 'test',
    role: 'DEUTEROS_1',
    route: 'push',
    pattern: 'horizontal',
    intensity: 5,
    repsBudget: 30,
    format: 'straight-3x10',
    formatParams: null,
    formatDescription: null,
    mobilityExercise: null,
    sortOrder: 0,
    exercises: [prescription(11, 0), prescription(12, 1), prescription(13, 2)],
  }
}

/** Igual que `buildSyntheticSession` de FreeBlockPlayer.vue */
function syntheticSession(): Session {
  return {
    dayId: DAY_ID,
    week: 0,
    day: '',
    levelGroup: 'alfa_delta',
    blockCount: 1,
    blocks: [{ ...block(), sortOrder: 0 }],
    sessionMode: 'regular',
  }
}

function seedProgress(patch: Partial<SessionProgress>): void {
  fakeStore.progress.set(DAY_ID, { ...fakeStore.blank(), ...patch })
}

describe('useSessionPlayer en modo bloque libre (caracterización, fase 213-08)', () => {
  beforeEach(() => {
    fakeStore.progress.clear()
    for (const fn of Object.values(fakeStore.store)) fn.mockClear()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-11-11T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('con freeBlock hay 1 bloque jugable y no pide elegir DEUTEROS, aunque el progreso diga índice 2', async () => {
    seedProgress({ currentBlockIndex: 2 })
    const player = useSessionPlayer(syntheticSession(), { freeBlock: true })
    await player.initialize()

    expect(player.hasDeuterosBlocks.value).toBe(false)
    expect(player.playableBlocks.value).toHaveLength(1)
    expect(player.playableBlocks.value[0]?.role).toBe('DEUTEROS_1')
    expect(player.needsDeuterosChoice.value).toBe(false)
    player.cleanup()
  })

  it('contraste: sin la opción la misma sesión se trata como regular y pide elección', async () => {
    seedProgress({ currentBlockIndex: 2 })
    const player = useSessionPlayer(syntheticSession())
    await player.initialize()

    expect(player.hasDeuterosBlocks.value).toBe(true)
    expect(player.needsDeuterosChoice.value).toBe(true)
    // sin INITIUM/NUCLEUS ni elección no hay nada jugable
    expect(player.playableBlocks.value).toHaveLength(0)
    player.cleanup()
  })

  it('toggleExerciseComplete agrega y quita el id bajo la key del rol y lo persiste', async () => {
    const player = useSessionPlayer(syntheticSession(), { freeBlock: true })
    await player.initialize()

    await player.toggleExerciseComplete(11)
    await player.toggleExerciseComplete(13)
    expect(player.completedExercises.value).toEqual({ DEUTEROS_1: [11, 13] })
    expect(fakeStore.store.saveCompletedExercise).toHaveBeenCalledWith(DAY_ID, 'DEUTEROS_1', 11)

    await player.toggleExerciseComplete(11)
    expect(player.completedExercises.value).toEqual({ DEUTEROS_1: [13] })
    expect(fakeStore.store.removeCompletedExercise).toHaveBeenCalledWith(DAY_ID, 'DEUTEROS_1', 11)
    player.cleanup()
  })

  it('startTimer corre el reloj en segundos y pauseTimer lo congela', async () => {
    const player = useSessionPlayer(syntheticSession(), { freeBlock: true })
    await player.initialize()

    player.startTimer()
    expect(player.isTimerRunning.value).toBe(true)
    vi.advanceTimersByTime(5000)
    expect(player.elapsedSeconds.value).toBe(5)

    player.pauseTimer()
    expect(player.isTimerRunning.value).toBe(false)
    vi.advanceTimersByTime(10_000)
    expect(player.elapsedSeconds.value).toBe(5)
    player.cleanup()
  })

  it('completeBlock pausa el reloj, agrega el rol a completedBlocks y no avanza (1 solo bloque)', async () => {
    const player = useSessionPlayer(syntheticSession(), { freeBlock: true })
    await player.initialize()
    player.startTimer()
    vi.advanceTimersByTime(3000)

    await player.completeBlock()

    expect(player.completedBlocks.value).toEqual(['DEUTEROS_1'])
    expect(player.currentBlockIndex.value).toBe(0)
    expect(player.isSessionComplete.value).toBe(true)
    expect(player.isTimerRunning.value).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(player.elapsedSeconds.value).toBe(3)
    player.cleanup()
  })

  it('startAnotherRound reinicia ejercicios y bloques completados pero conserva el reloj y lo deja corriendo', async () => {
    const player = useSessionPlayer(syntheticSession(), { freeBlock: true })
    await player.initialize()
    player.startTimer()
    await player.toggleExerciseComplete(11)
    vi.advanceTimersByTime(7000)
    await player.completeBlock()
    expect(player.elapsedSeconds.value).toBe(7)

    await player.startAnotherRound()

    expect(player.completedBlocks.value).toEqual([])
    expect(player.completedExercises.value).toEqual({})
    expect(player.currentBlockIndex.value).toBe(0)
    expect(player.elapsedSeconds.value).toBe(7) // no se resetea
    expect(player.isTimerRunning.value).toBe(true)
    expect(fakeStore.store.saveProgress).toHaveBeenCalledWith(DAY_ID, {
      currentBlockIndex: 0,
      completedBlocks: [],
      completedExercises: {},
    })

    // el reloj sigue desde donde estaba
    vi.advanceTimersByTime(4000)
    expect(player.elapsedSeconds.value).toBe(11)
    player.cleanup()
  })

  it('clearProgress deja el estado en cero, pausa el reloj y borra el progreso XB del store', async () => {
    const player = useSessionPlayer(syntheticSession(), { freeBlock: true })
    await player.initialize()
    player.startTimer()
    await player.toggleExerciseComplete(12)
    vi.advanceTimersByTime(2000)

    await player.clearProgress()

    expect(fakeStore.store.clearProgress).toHaveBeenCalledWith(DAY_ID)
    expect(player.completedExercises.value).toEqual({})
    expect(player.completedBlocks.value).toEqual([])
    expect(player.elapsedSeconds.value).toBe(0)
    expect(player.isTimerRunning.value).toBe(false)
    player.cleanup()
  })

  it('initialize sobre progreso guardado lo recupera (por eso la página llama clearProgress antes)', async () => {
    seedProgress({
      currentBlockIndex: 0,
      completedBlocks: ['DEUTEROS_1'],
      elapsedSeconds: 42,
      completedExercises: { DEUTEROS_1: [11] },
    })
    const player = useSessionPlayer(syntheticSession(), { freeBlock: true })
    await player.initialize()

    expect(player.completedBlocks.value).toEqual(['DEUTEROS_1'])
    expect(player.completedExercises.value).toEqual({ DEUTEROS_1: [11] })
    expect(player.elapsedSeconds.value).toBe(42)
    player.cleanup()
  })

  it('el orden de la página (clearProgress y después initialize) arranca de cero aunque hubiera progreso', async () => {
    seedProgress({ completedBlocks: ['DEUTEROS_1'], elapsedSeconds: 99 })
    const player = useSessionPlayer(syntheticSession(), { freeBlock: true })
    await player.clearProgress()
    await player.initialize()

    expect(player.completedBlocks.value).toEqual([])
    expect(player.elapsedSeconds.value).toBe(0)
    player.cleanup()
  })

  it('initialize es idempotente: una segunda llamada no vuelve a leer el progreso', async () => {
    const player = useSessionPlayer(syntheticSession(), { freeBlock: true })
    await player.initialize()
    seedProgress({ elapsedSeconds: 500 })
    await player.initialize()

    expect(player.elapsedSeconds.value).toBe(0)
    player.cleanup()
  })

  it('cleanup frena el intervalo: el reloj deja de avanzar y se persiste el acumulado', async () => {
    const player = useSessionPlayer(syntheticSession(), { freeBlock: true })
    await player.initialize()
    player.startTimer()
    vi.advanceTimersByTime(4000)

    player.cleanup()

    expect(player.isTimerRunning.value).toBe(false)
    vi.advanceTimersByTime(10_000)
    expect(player.elapsedSeconds.value).toBe(4)
    expect(fakeStore.store.saveProgress).toHaveBeenCalledWith(DAY_ID, {
      elapsedSeconds: 4,
      sessionTimerStartedAt: null,
    })
  })
})
