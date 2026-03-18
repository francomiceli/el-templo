import { ref, computed } from 'vue'
import { useSessionPlayerStore } from '../../training/stores/sessionPlayerStore'
import { createLogger } from 'src/utils/logger'
import type { Block, BlockRole } from '../../training/types/session'
import type { PersonalizadaDuration, PersonalizadaSessionResponse } from '../types'

const log = createLogger('PersonalizadaSession')

/**
 * Duration-based block filtering for personalizada sessions.
 *
 * - 20 min: INITIUM + NUCLEUS only
 * - 40 min: INITIUM + NUCLEUS + DEUTEROS_1 (single, no choice)
 * - 60 min: All blocks (INITIUM + NUCLEUS + DEUTEROS_1 + ATHLOS/EPIKOS)
 *
 * Note: Personalizada sessions do NOT have DEUTEROS_2 choice like regular sessions.
 * The 40-min shows only DEUTEROS_1. For 60-min, the coach determines
 * which final block (Athlos or Epikos) is present in the generated session.
 */
export function getBlocksForDuration(blocks: Block[], duration: PersonalizadaDuration): Block[] {
  switch (duration) {
    case 20:
      return blocks.filter((b) => b.role === 'INITIUM' || b.role === 'NUCLEUS')
    case 40:
      return blocks.filter(
        (b) => b.role === 'INITIUM' || b.role === 'NUCLEUS' || b.role === 'DEUTEROS_1',
      )
    case 60:
      // All blocks except DEUTEROS_2 (personalizada sessions use DEUTEROS_1 only)
      return blocks.filter((b) => b.role !== 'DEUTEROS_2')
    default:
      return blocks
  }
}

/**
 * Personalizada session player composable.
 *
 * Manages the lifecycle of a personalizada session: block filtering by duration,
 * block-by-block progression, exercise completion tracking, timer, and
 * session completion.
 *
 * Follows the useSessionPlayer pattern but simplified for personalizadas:
 * - No Deuteros choice (duration determines which blocks are visible)
 * - Block count varies by duration (2 for 20min, 3 for 40min, 4+ for 60min)
 * - Reuses sessionPlayerStore for progress persistence
 *
 * Returns cleanup() per composable convention.
 */
export function usePersonalizadaSession(
  session: PersonalizadaSessionResponse,
  duration: PersonalizadaDuration,
) {
  const store = useSessionPlayerStore()

  // Core state
  const currentBlockIndex = ref(0)
  const selectedExerciseIndex = ref(0)
  const elapsedSeconds = ref(0)
  const isTimerRunning = ref(false)
  const completedBlocks = ref<BlockRole[]>([])
  const isInitialized = ref(false)
  const completedExercises = ref<Record<string, number[]>>({})

  // Timer state: timestamp-based for accuracy across reloads
  let timerInterval: ReturnType<typeof setInterval> | null = null
  let accumulatedSeconds = 0
  let anchorTime = 0

  /**
   * Visible blocks filtered by selected duration.
   * Unlike regular sessions, personalizada sessions have no Deuteros choice.
   */
  const visibleBlocks = computed<Block[]>(() => {
    return getBlocksForDuration(session.blocks, duration)
  })

  /**
   * Total number of blocks to complete for this duration.
   */
  const totalBlocks = computed(() => visibleBlocks.value.length)

  /**
   * The current block being played.
   */
  const currentBlock = computed<Block | null>(() => {
    return visibleBlocks.value[currentBlockIndex.value] ?? null
  })

  /**
   * Format string of the current block.
   */
  const currentBlockFormat = computed<string | null>(() => {
    return currentBlock.value?.format ?? null
  })

  /**
   * Progress as fraction (0-1).
   */
  const progress = computed(() => {
    if (totalBlocks.value === 0) return 0
    return completedBlocks.value.length / totalBlocks.value
  })

  /**
   * Whether the session is complete (all visible blocks completed).
   */
  const isSessionComplete = computed(() => {
    return completedBlocks.value.length >= totalBlocks.value
  })

  /**
   * Block labels for progress bar, derived from visible blocks.
   */
  const blockLabels = computed(() => {
    const BLOCK_NAMES: Record<string, string> = {
      INITIUM: 'Initium',
      NUCLEUS: 'Nucleus',
      DEUTEROS_1: 'Deuteros',
      DEUTEROS_2: 'Deuteros',
      ATHLOS: 'Athlos',
      EPIKOS: 'Epikos',
    }
    return visibleBlocks.value.map((b) => BLOCK_NAMES[b.role] ?? b.role)
  })

  // --- Timer management ---

  function startTimer(): void {
    if (timerInterval) return
    isTimerRunning.value = true
    anchorTime = Date.now()
    timerInterval = setInterval(() => {
      elapsedSeconds.value = accumulatedSeconds + Math.floor((Date.now() - anchorTime) / 1000)
    }, 1000)

    void store.saveProgress(session.dayId, {
      sessionTimerStartedAt: anchorTime,
    })
  }

  function pauseTimer(): void {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    if (isTimerRunning.value) {
      accumulatedSeconds = elapsedSeconds.value
      isTimerRunning.value = false
      void store.saveProgress(session.dayId, {
        elapsedSeconds: accumulatedSeconds,
        sessionTimerStartedAt: null,
      })
    }
  }

  // --- Block completion ---

  async function completeBlock(): Promise<void> {
    const block = currentBlock.value
    if (!block) return

    if (!completedBlocks.value.includes(block.role)) {
      completedBlocks.value.push(block.role)
      await store.saveCompletedBlock(session.dayId, block.role)
    }

    // Advance to next block
    if (currentBlockIndex.value < visibleBlocks.value.length - 1) {
      currentBlockIndex.value++
      selectedExerciseIndex.value = 0
      await store.saveCurrentBlockIndex(session.dayId, currentBlockIndex.value)
    }

    // Check if session is complete
    if (isSessionComplete.value) {
      pauseTimer()
    }
  }

  // --- Exercise navigation ---

  function selectExercise(index: number): void {
    const block = currentBlock.value
    if (block && index >= 0 && index < block.exercises.length) {
      selectedExerciseIndex.value = index
    }
  }

  // --- Exercise completion ---

  async function toggleExerciseComplete(prescriptionId: number): Promise<void> {
    const block = currentBlock.value
    if (!block) return

    const blockRole = block.role
    const current = completedExercises.value[blockRole] ?? []

    if (current.includes(prescriptionId)) {
      completedExercises.value = {
        ...completedExercises.value,
        [blockRole]: current.filter((id) => id !== prescriptionId),
      }
      await store.removeCompletedExercise(session.dayId, blockRole, prescriptionId)
    } else {
      const updated = [...current, prescriptionId]
      completedExercises.value = {
        ...completedExercises.value,
        [blockRole]: updated,
      }
      await store.saveCompletedExercise(session.dayId, blockRole, prescriptionId)
    }
  }

  function isExerciseComplete(prescriptionId: number): boolean {
    const block = currentBlock.value
    if (!block) return false
    const current = completedExercises.value[block.role] ?? []
    return current.includes(prescriptionId)
  }

  const completedExerciseCount = computed(() => {
    const block = currentBlock.value
    if (!block) return 0
    return (completedExercises.value[block.role] ?? []).length
  })

  const totalExerciseCount = computed(() => {
    return currentBlock.value?.exercises.length ?? 0
  })

  // --- Initialization ---

  async function initialize(): Promise<void> {
    if (isInitialized.value) return

    const savedProgress = await store.loadProgress(session.dayId)

    currentBlockIndex.value = savedProgress.currentBlockIndex
    completedBlocks.value = [...savedProgress.completedBlocks]
    completedExercises.value = savedProgress.completedExercises ?? {}

    // Restore elapsed time
    if (savedProgress.sessionTimerStartedAt) {
      const sinceStart = Math.floor((Date.now() - savedProgress.sessionTimerStartedAt) / 1000)
      accumulatedSeconds = savedProgress.elapsedSeconds + sinceStart
    } else {
      accumulatedSeconds = savedProgress.elapsedSeconds
    }
    elapsedSeconds.value = accumulatedSeconds

    isInitialized.value = true
    log.debug('Personalizada session initialized', {
      dayId: session.dayId,
      duration,
      visibleBlockCount: visibleBlocks.value.length,
      resumedFromProgress: savedProgress.elapsedSeconds > 0,
    })
  }

  async function clearProgress(): Promise<void> {
    pauseTimer()
    await store.clearProgress(session.dayId)
    currentBlockIndex.value = 0
    selectedExerciseIndex.value = 0
    elapsedSeconds.value = 0
    completedBlocks.value = []
    completedExercises.value = {}
  }

  function cleanup(): void {
    pauseTimer()
  }

  return {
    // State
    currentBlockIndex,
    selectedExerciseIndex,
    elapsedSeconds,
    isTimerRunning,
    completedBlocks,
    isInitialized,
    completedExercises,

    // Computed
    visibleBlocks,
    totalBlocks,
    currentBlock,
    currentBlockFormat,
    progress,
    isSessionComplete,
    blockLabels,
    completedExerciseCount,
    totalExerciseCount,

    // Timer control
    startTimer,
    pauseTimer,

    // Block/exercise navigation
    completeBlock,
    selectExercise,

    // Exercise completion
    toggleExerciseComplete,
    isExerciseComplete,

    // Lifecycle
    initialize,
    clearProgress,
    cleanup,
  }
}
