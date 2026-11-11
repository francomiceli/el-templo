import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import type { Block, Session } from '../../types/session'
import type { useSessionPlayer } from '../useSessionPlayer'

/**
 * Fase 213-08: `useSingleBlockPlayer` codifica el comportamiento que hasta ahora vivía en
 * `FreeBlockPlayer.vue` (fase 197 D-15). Player falso (refs + vi.fn) y wake lock falso.
 */

// El composable importa useSessionPlayer para el default; se reemplaza para no cargar
// el store (Capacitor/Pinia) en el entorno node.
vi.mock('../useSessionPlayer', () => ({ useSessionPlayer: vi.fn() }))

import { useSingleBlockPlayer, type SingleBlockStage } from '../useSingleBlockPlayer'

type Player = ReturnType<typeof useSessionPlayer>

interface FakePlayer {
  player: Player
  calls: string[]
  elapsedSeconds: ReturnType<typeof ref<number>>
  completedExercises: ReturnType<typeof ref<Record<string, number[]>>>
  startTimer: ReturnType<typeof vi.fn>
  pauseTimer: ReturnType<typeof vi.fn>
  completeBlock: ReturnType<typeof vi.fn>
  startAnotherRound: ReturnType<typeof vi.fn>
  toggleExerciseComplete: ReturnType<typeof vi.fn>
  clearProgress: ReturnType<typeof vi.fn>
  initialize: ReturnType<typeof vi.fn>
  cleanup: ReturnType<typeof vi.fn>
}

const ROLE = 'DEUTEROS_1'

function makeBlock(): Block {
  return {
    blockId: 'b1',
    role: ROLE,
    route: 'push',
    pattern: 'horizontal',
    intensity: 5,
    repsBudget: 30,
    format: 'straight-3x10',
    formatParams: null,
    formatDescription: null,
    mobilityExercise: null,
    sortOrder: 0,
    exercises: [],
  }
}

function makeSession(): Session {
  return {
    dayId: 'XB-b1',
    week: 0,
    day: '',
    levelGroup: 'alfa_delta',
    blockCount: 1,
    blocks: [makeBlock()],
    sessionMode: 'regular',
  }
}

function makeFakePlayer(calls: string[]): FakePlayer {
  const elapsedSeconds = ref(0)
  const completedExercises = ref<Record<string, number[]>>({})
  const startTimer = vi.fn(() => void calls.push('startTimer'))
  const pauseTimer = vi.fn(() => void calls.push('pauseTimer'))
  const completeBlock = vi.fn(async () => void calls.push('completeBlock'))
  const startAnotherRound = vi.fn(async () => void calls.push('startAnotherRound'))
  const toggleExerciseComplete = vi.fn(async () => undefined)
  const clearProgress = vi.fn(async () => void calls.push('clearProgress'))
  const initialize = vi.fn(async () => void calls.push('initialize'))
  const cleanup = vi.fn(() => void calls.push('cleanup'))
  const player = {
    playableBlocks: ref([makeBlock()]),
    currentBlockIndex: ref(0),
    completedBlocks: ref([]),
    elapsedSeconds,
    completedExercises,
    startTimer,
    pauseTimer,
    completeBlock,
    startAnotherRound,
    toggleExerciseComplete,
    clearProgress,
    initialize,
    cleanup,
  } as unknown as Player
  return {
    player,
    calls,
    elapsedSeconds,
    completedExercises,
    startTimer,
    pauseTimer,
    completeBlock,
    startAnotherRound,
    toggleExerciseComplete,
    clearProgress,
    initialize,
    cleanup,
  }
}

interface Harness {
  single: ReturnType<typeof useSingleBlockPlayer<string>>
  fakes: FakePlayer[]
  calls: string[]
  save: ReturnType<typeof vi.fn>
  wakeLock: { requestWakeLock: ReturnType<typeof vi.fn>; releaseWakeLock: ReturnType<typeof vi.fn> }
  saved: ReturnType<typeof ref<boolean>>
}

function harness(saveImpl?: () => Promise<string | null>): Harness {
  const calls: string[] = []
  const fakes: FakePlayer[] = []
  // ref: en la página `hasSavedRun` lee un ref, y needsExitConfirm es un computed
  const saved = ref(false)
  const save = vi.fn(saveImpl ?? (async () => 'guardado'))
  const wakeLock = {
    requestWakeLock: vi.fn(async () => {
      calls.push('requestWakeLock')
      return true
    }),
    releaseWakeLock: vi.fn(async () => void calls.push('releaseWakeLock')),
  }
  const single = useSingleBlockPlayer<string>({
    wakeLock,
    save,
    hasSavedRun: () => saved.value,
    createPlayer: () => {
      const fake = makeFakePlayer(calls)
      fakes.push(fake)
      return fake.player
    },
  })
  return { single, fakes, calls, save, wakeLock, saved }
}

/** Deja resolver las promesas encadenadas sin avanzar los timers falsos */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('useSingleBlockPlayer (fase 213-08, D-07)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('load: limpia el progreso antes de initialize, arranca el 3-2-1 con reloj y wake lock, y autoarranca una sola vez', async () => {
    const h = harness()
    expect(h.single.stage.value).toBe('loading')

    await h.single.load(makeSession())

    const first = h.fakes[0]!
    expect(first.calls.indexOf('clearProgress')).toBeLessThan(first.calls.indexOf('initialize'))
    expect(h.single.stage.value).toBe('countdown')
    expect(first.startTimer).toHaveBeenCalledTimes(1)
    expect(h.wakeLock.requestWakeLock).toHaveBeenCalledTimes(1)

    // un segundo load no vuelve a autoarrancar (la etapa y el reloj quedan como están)
    h.single.onCountdownDone()
    await h.single.load(makeSession())
    expect(h.single.stage.value).toBe('playing')
    expect(h.fakes[1]!.startTimer).not.toHaveBeenCalled()
    expect(h.wakeLock.requestWakeLock).toHaveBeenCalledTimes(1)
    // el player anterior se limpió al reemplazarlo
    expect(first.cleanup).toHaveBeenCalledTimes(1)
  })

  it('markMissing y setStage cambian la etapa', () => {
    const h = harness()
    h.single.markMissing()
    expect(h.single.stage.value).toBe('missing')
    h.single.setStage('summary')
    expect(h.single.stage.value).toBe<SingleBlockStage>('summary')
  })

  it('onCountdownDone pasa de countdown a playing', async () => {
    const h = harness()
    await h.single.load(makeSession())
    h.single.onCountdownDone()
    expect(h.single.stage.value).toBe('playing')
  })

  it('needsExitConfirm: true en countdown y playing sin guardado; false con guardado, tras confirmExit o fuera de juego', async () => {
    const h = harness()
    expect(h.single.needsExitConfirm.value).toBe(false) // loading

    await h.single.load(makeSession())
    expect(h.single.needsExitConfirm.value).toBe(true) // countdown
    h.single.onCountdownDone()
    expect(h.single.needsExitConfirm.value).toBe(true) // playing

    h.saved.value = true
    expect(h.single.needsExitConfirm.value).toBe(false)
    h.saved.value = false

    h.single.setStage('saving')
    expect(h.single.needsExitConfirm.value).toBe(false)
    h.single.setStage('playing')

    h.single.confirmExit()
    expect(h.single.exitConfirmed.value).toBe(true)
    expect(h.single.needsExitConfirm.value).toBe(false)
  })

  it('completeBlock ok: guarda ids del rol y startedAt coherente con el reloj, libera el wake lock y celebra', async () => {
    const h = harness()
    await h.single.load(makeSession())
    h.single.onCountdownDone()
    const fake = h.fakes[0]!
    fake.completedExercises.value = { [ROLE]: [11, 13] }
    fake.elapsedSeconds.value = 90

    const res = await h.single.completeBlock()

    expect(res).toBe('guardado')
    expect(fake.completeBlock).toHaveBeenCalledTimes(1)
    expect(h.save).toHaveBeenCalledTimes(1)
    expect(h.save).toHaveBeenCalledWith({
      exercisesCompleted: [11, 13],
      startedAt: new Date('2026-11-11T11:58:30.000Z').toISOString(),
      elapsedSeconds: 90,
    })
    expect(h.wakeLock.releaseWakeLock).toHaveBeenCalledTimes(1)
    expect(h.single.stage.value).toBe('celebration')
  })

  it('completeBlock: save recibe una copia de los ids (no la referencia del player)', async () => {
    const h = harness()
    await h.single.load(makeSession())
    const fake = h.fakes[0]!
    fake.completedExercises.value = { [ROLE]: [11] }

    await h.single.completeBlock()

    const input = h.save.mock.calls[0]![0] as { exercisesCompleted: number[] }
    expect(input.exercisesCompleted).not.toBe(fake.completedExercises.value[ROLE])
  })

  it('completeBlock con save en null: vuelve a playing, relanza el reloj y devuelve null', async () => {
    const h = harness(async () => null)
    await h.single.load(makeSession())
    h.single.onCountdownDone()
    const fake = h.fakes[0]!
    fake.startTimer.mockClear()

    const res = await h.single.completeBlock()

    expect(res).toBeNull()
    expect(h.single.stage.value).toBe('playing')
    expect(fake.startTimer).toHaveBeenCalledTimes(1)
    expect(h.wakeLock.releaseWakeLock).not.toHaveBeenCalled()
  })

  it('doble completeBlock mientras guarda: un solo save', async () => {
    let resolveSave: (v: string | null) => void = () => undefined
    const h = harness(
      () =>
        new Promise<string | null>((resolve) => {
          resolveSave = resolve
        }),
    )
    await h.single.load(makeSession())
    h.single.onCountdownDone()

    const first = h.single.completeBlock()
    await flush()
    expect(h.single.stage.value).toBe('saving')
    const second = await h.single.completeBlock()
    expect(second).toBeNull()
    expect(h.save).toHaveBeenCalledTimes(1)

    resolveSave('ok')
    expect(await first).toBe('ok')
    expect(h.single.stage.value).toBe('celebration')
  })

  it('restart sin guardado: limpia, crea un player NUEVO, suelta el wake lock y vuelve al 3-2-1', async () => {
    const h = harness()
    await h.single.load(makeSession())
    h.single.onCountdownDone()
    const old = h.fakes[0]!
    h.wakeLock.requestWakeLock.mockClear()

    await h.single.restart()

    expect(h.fakes).toHaveLength(2)
    expect(old.clearProgress).toHaveBeenCalledTimes(2) // load + restart
    expect(old.cleanup).toHaveBeenCalledTimes(1)
    expect(old.startAnotherRound).not.toHaveBeenCalled()
    const fresh = h.fakes[1]!
    expect(fresh.initialize).toHaveBeenCalledTimes(1)
    expect(fresh.startTimer).toHaveBeenCalledTimes(1)
    expect(h.single.player.value).toBe(fresh.player)
    expect(h.wakeLock.releaseWakeLock).toHaveBeenCalledTimes(1)
    expect(h.wakeLock.requestWakeLock).toHaveBeenCalledTimes(1)
    expect(h.single.stage.value).toBe('countdown')
  })

  it('restart con guardado: es otra vuelta del mismo player (startAnotherRound), sin player nuevo', async () => {
    const h = harness()
    await h.single.load(makeSession())
    h.single.onCountdownDone()
    h.saved.value = true

    await h.single.restart()

    expect(h.fakes).toHaveLength(1)
    expect(h.fakes[0]!.startAnotherRound).toHaveBeenCalledTimes(1)
    expect(h.single.stage.value).toBe('playing')
  })

  it('keepTraining: otra vuelta, pide el wake lock y vuelve a playing', async () => {
    const h = harness()
    await h.single.load(makeSession())
    h.single.setStage('summary')
    h.wakeLock.requestWakeLock.mockClear()

    await h.single.keepTraining()

    expect(h.fakes[0]!.startAnotherRound).toHaveBeenCalledTimes(1)
    expect(h.wakeLock.requestWakeLock).toHaveBeenCalledTimes(1)
    expect(h.single.stage.value).toBe('playing')
  })

  it('leaveWithoutSaving: pausa, limpia el progreso y libera la pantalla (en ese orden)', async () => {
    const h = harness()
    await h.single.load(makeSession())
    h.calls.length = 0

    await h.single.leaveWithoutSaving()

    expect(h.calls).toEqual(['pauseTimer', 'clearProgress', 'releaseWakeLock'])
  })

  it('toggleExercise delega en el player con el id', async () => {
    const h = harness()
    await h.single.load(makeSession())
    await h.single.toggleExercise(12)
    expect(h.fakes[0]!.toggleExerciseComplete).toHaveBeenCalledWith(12)
  })

  it('puente player -> vista: expone el estado del player y valores vacíos sin player', async () => {
    const h = harness()
    expect(h.single.playableBlocks.value).toEqual([])
    expect(h.single.activeBlockIndex.value).toBe(0)
    expect(h.single.elapsedSeconds.value).toBe(0)
    expect(h.single.allCompletedExercises.value).toEqual({})

    await h.single.load(makeSession())
    const fake = h.fakes[0]!
    fake.elapsedSeconds.value = 12
    fake.completedExercises.value = { [ROLE]: [1] }

    expect(h.single.playableBlocks.value).toHaveLength(1)
    expect(h.single.elapsedSeconds.value).toBe(12)
    expect(h.single.allCompletedExercises.value).toEqual({ [ROLE]: [1] })
  })

  it('cleanup durante un save pendiente: al resolver no cambia la etapa ni libera el wake lock', async () => {
    let resolveSave: (v: string | null) => void = () => undefined
    const h = harness(
      () =>
        new Promise<string | null>((resolve) => {
          resolveSave = resolve
        }),
    )
    await h.single.load(makeSession())
    h.single.onCountdownDone()

    const pending = h.single.completeBlock()
    await flush()
    expect(h.single.stage.value).toBe('saving')

    h.single.cleanup()
    expect(h.single.isDisposed()).toBe(true)
    expect(h.fakes[0]!.cleanup).toHaveBeenCalledTimes(1)

    resolveSave('ok')
    expect(await pending).toBeNull()
    expect(h.single.stage.value).toBe('saving')
    expect(h.wakeLock.releaseWakeLock).not.toHaveBeenCalled()
  })

  it('cleanup durante la carga: no autoarranca el bloque', async () => {
    const h = harness()
    const loading = h.single.load(makeSession())
    h.single.cleanup()
    await loading

    expect(h.single.stage.value).toBe('loading')
    expect(h.fakes[0]!.startTimer).not.toHaveBeenCalled()
  })
})
