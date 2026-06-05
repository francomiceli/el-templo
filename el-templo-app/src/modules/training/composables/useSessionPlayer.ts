import { ref, computed, watch } from 'vue'
import { useSessionPlayerStore } from '../stores/sessionPlayerStore'
import type { Session, Block, BlockRole } from '../types/session'

/**
 * Playable block flow after Deuteros choice
 *
 * The session has 5 blocks total, but the user only completes 4:
 * - INITIUM (warmup)
 * - NUCLEUS (main work)
 * - One of DEUTEROS_1 or DEUTEROS_2 (user's choice)
 * - ATHLOS or EPIKOS (challenge - alternates by week)
 */
export interface SessionPlayerState {
  /** Current block index in the playable blocks array (0-3) */
  currentBlockIndex: number
  /** Currently selected exercise index within the current block */
  selectedExerciseIndex: number
  /** Total elapsed time in seconds */
  elapsedSeconds: number
  /** Whether the timer is currently running */
  isTimerRunning: boolean
  /** Whether the Deuteros choice has been made */
  hasDeuterosChoice: boolean
  /** The chosen Deuteros block role */
  deuterosChoice: 'DEUTEROS_1' | 'DEUTEROS_2' | null
  /** Array of completed block roles */
  completedBlocks: BlockRole[]
}

/**
 * Session player composable for managing guided workout execution
 *
 * Manages session playback state including:
 * - Block flow (4 playable blocks after Deuteros choice)
 * - Timer management with pause/resume
 * - Progress persistence via sessionPlayerStore
 * - Block completion tracking
 *
 * @param session - The training session to play
 * @returns Reactive state and control methods for session playback
 */
export function useSessionPlayer(session: Session) {
  const store = useSessionPlayerStore()

  // Core state
  const currentBlockIndex = ref(0)
  const selectedExerciseIndex = ref(0)
  const elapsedSeconds = ref(0)
  const isTimerRunning = ref(false)
  const deuterosChoice = ref<'DEUTEROS_1' | 'DEUTEROS_2' | null>(null)
  const completedBlocks = ref<BlockRole[]>([])
  const isInitialized = ref(false)
  const completedExercises = ref<Record<string, number[]>>({})

  // Timer state: timestamp-based for accuracy across reloads
  let timerInterval: ReturnType<typeof setInterval> | null = null
  let accumulatedSeconds = 0 // seconds from previous start/pause cycles
  let anchorTime = 0 // Date.now() when timer was last started

  /**
   * Whether the session contains Deuteros blocks (regular SPOM sessions)
   * ROM and other non-Deuteros sessions skip the choice screen entirely.
   */
  const hasDeuterosBlocks = computed(() => {
    return session.blocks.some((b) => b.role === 'DEUTEROS_1' || b.role === 'DEUTEROS_2')
  })

  /**
   * Get playable blocks based on session type
   *
   * Regular sessions (with Deuteros):
   *   Before choice: Returns INITIUM, NUCLEUS only (user must choose Deuteros)
   *   After choice: Returns INITIUM, NUCLEUS, chosen DEUTEROS, ATHLOS/EPIKOS
   *
   * ROM / non-Deuteros sessions:
   *   All blocks in sortOrder, no choice needed
   */
  const playableBlocks = computed<Block[]>(() => {
    const blocks = session.blocks

    // ROM or any session without Deuteros: play all blocks in sortOrder, no choice
    if (!hasDeuterosBlocks.value) {
      return [...blocks].sort((a, b) => a.sortOrder - b.sortOrder)
    }

    // Find blocks by role
    const initium = blocks.find((b) => b.role === 'INITIUM')
    const nucleus = blocks.find((b) => b.role === 'NUCLEUS')
    const deuteros1 = blocks.find((b) => b.role === 'DEUTEROS_1')
    const deuteros2 = blocks.find((b) => b.role === 'DEUTEROS_2')
    // ATHLOS or EPIKOS (alternates by week)
    const athlosOrEpikos = blocks.find((b) => b.role === 'ATHLOS' || b.role === 'EPIKOS')

    // Build playable sequence
    const result: Block[] = []

    if (initium) result.push(initium)
    if (nucleus) result.push(nucleus)

    // Add chosen Deuteros (or none if not yet chosen)
    if (deuterosChoice.value === 'DEUTEROS_1' && deuteros1) {
      result.push(deuteros1)
    } else if (deuterosChoice.value === 'DEUTEROS_2' && deuteros2) {
      result.push(deuteros2)
    }

    // Add Athlos/Epikos only if Deuteros is chosen
    if (deuterosChoice.value && athlosOrEpikos) {
      result.push(athlosOrEpikos)
    }

    return result
  })

  /**
   * The current block being played
   */
  const currentBlock = computed<Block | null>(() => {
    return playableBlocks.value[currentBlockIndex.value] ?? null
  })

  /**
   * Format string of the current block (for protocol timer creation)
   */
  const currentBlockFormat = computed<string | null>(() => {
    return currentBlock.value?.format ?? null
  })

  /**
   * Progress as fraction (0-1)
   */
  const progress = computed(() => {
    if (!hasDeuterosBlocks.value) {
      // ROM or non-Deuteros session: progress based on total blocks
      const totalBlocks = playableBlocks.value.length
      return totalBlocks > 0 ? completedBlocks.value.length / totalBlocks : 0
    }
    if (!deuterosChoice.value) {
      // Before Deuteros choice, show progress based on 2 blocks
      return currentBlockIndex.value / 2
    }
    // After choice, show progress based on 4 blocks
    return completedBlocks.value.length / 4
  })

  /**
   * Whether we're at the Deuteros choice point
   */
  const needsDeuterosChoice = computed(() => {
    if (!hasDeuterosBlocks.value) return false
    return !deuterosChoice.value && currentBlockIndex.value >= 2
  })

  /**
   * Whether the session is complete
   */
  const isSessionComplete = computed(() => {
    if (!hasDeuterosBlocks.value) {
      // ROM or non-Deuteros: complete when all playable blocks are done
      return (
        completedBlocks.value.length >= playableBlocks.value.length &&
        playableBlocks.value.length > 0
      )
    }
    return completedBlocks.value.length >= 4
  })

  /**
   * Get DEUTEROS_1 block for choice display
   */
  const deuteros1Block = computed(() => {
    return session.blocks.find((b) => b.role === 'DEUTEROS_1') ?? null
  })

  /**
   * Get DEUTEROS_2 block for choice display
   */
  const deuteros2Block = computed(() => {
    return session.blocks.find((b) => b.role === 'DEUTEROS_2') ?? null
  })

  // Timer management

  /**
   * Start the session timer using Date.now() anchor for accuracy across reloads
   */
  function startTimer(): void {
    if (timerInterval) return // Already running

    isTimerRunning.value = true
    anchorTime = Date.now()
    timerInterval = setInterval(() => {
      elapsedSeconds.value = accumulatedSeconds + Math.floor((Date.now() - anchorTime) / 1000)
    }, 1000)

    // Persist the start timestamp
    void store.saveProgress(session.dayId, {
      sessionTimerStartedAt: anchorTime,
    })
  }

  /**
   * Pause the session timer
   */
  function pauseTimer(): void {
    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    if (isTimerRunning.value) {
      // Capture accumulated seconds before stopping
      accumulatedSeconds = elapsedSeconds.value
      isTimerRunning.value = false

      // Persist final elapsed + clear start timestamp
      void store.saveProgress(session.dayId, {
        elapsedSeconds: accumulatedSeconds,
        sessionTimerStartedAt: null,
      })
    }
  }

  // Block completion

  /**
   * Complete the current block and advance to next
   */
  async function completeBlock(): Promise<void> {
    const block = currentBlock.value
    if (!block) return

    // Mark block as completed
    if (!completedBlocks.value.includes(block.role)) {
      completedBlocks.value.push(block.role)
      await store.saveCompletedBlock(session.dayId, block.role)
    }

    // Special case: After NUCLEUS, advance to index 2 to trigger Deuteros choice
    // (even though playableBlocks doesn't have a block at index 2 yet)
    if (block.role === 'NUCLEUS' && !deuterosChoice.value) {
      currentBlockIndex.value = 2
      selectedExerciseIndex.value = 0
      await store.saveCurrentBlockIndex(session.dayId, currentBlockIndex.value)
      return // Wait for Deuteros choice
    }

    // Advance to next block
    if (currentBlockIndex.value < playableBlocks.value.length - 1) {
      currentBlockIndex.value++
      selectedExerciseIndex.value = 0
      await store.saveCurrentBlockIndex(session.dayId, currentBlockIndex.value)
    }

    // Check if session is complete
    if (isSessionComplete.value) {
      pauseTimer() // pauseTimer now persists elapsed + clears startedAt
      // Note: clearProgress is called by the page after showing completion UI
    }
  }

  /**
   * Auto-complete the current block (triggered by protocol timer completion)
   *
   * Same behavior as completeBlock() but exists as a separate method
   * for clarity — protocol timers call this, manual "Complete Block"
   * buttons call completeBlock().
   */
  async function completeBlockAuto(): Promise<void> {
    return completeBlock()
  }

  // Deuteros selection

  /**
   * Select which Deuteros block to complete
   *
   * @param choice - The Deuteros block to use
   */
  async function selectDeuteros(choice: 'DEUTEROS_1' | 'DEUTEROS_2'): Promise<void> {
    deuterosChoice.value = choice
    await store.saveDeuterosChoice(session.dayId, choice)
    // currentBlockIndex stays at 2, which now points to the chosen Deuteros
  }

  // Exercise navigation

  /**
   * Select an exercise within the current block
   *
   * @param index - Exercise index to select
   */
  function selectExercise(index: number): void {
    const block = currentBlock.value
    if (block && index >= 0 && index < block.exercises.length) {
      selectedExerciseIndex.value = index
    }
  }

  // Exercise completion

  /**
   * Toggle exercise completion state.
   * If all exercises in the block become complete, auto-complete the block.
   *
   * @param prescriptionId - Exercise ID to toggle
   */
  async function toggleExerciseComplete(prescriptionId: number): Promise<void> {
    const block = currentBlock.value
    if (!block) return

    const blockRole = block.role
    const current = completedExercises.value[blockRole] ?? []

    if (current.includes(prescriptionId)) {
      // Uncomplete: remove from list
      completedExercises.value = {
        ...completedExercises.value,
        [blockRole]: current.filter((id) => id !== prescriptionId),
      }
      await store.removeCompletedExercise(session.dayId, blockRole, prescriptionId)
    } else {
      // Complete: add to list
      const updated = [...current, prescriptionId]
      completedExercises.value = {
        ...completedExercises.value,
        [blockRole]: updated,
      }
      await store.saveCompletedExercise(session.dayId, blockRole, prescriptionId)
    }
  }

  /**
   * Clear a specific exercise's completion entry from a specific block role
   * (WR-02). Used by the in-session difficulty swap: when an exercise identity
   * is swapped, its old (now-absent) exerciseId must NOT linger in
   * `completedExercises` — otherwise an exercise the member never performed under
   * this block would ship in `exercisesCompleted` at session end and drift into
   * the tree-% "completed" set. We CLEAR rather than re-key: the swapped-in
   * exercise is a different movement and must be completed afresh, keeping
   * `exercisesCompleted` honest. No-op if the id was not marked complete.
   *
   * Unlike `toggleExerciseComplete` (which is scoped to `currentBlock`), this
   * targets a block by `role` so the swap can address the exact tapped block.
   *
   * @param role - Block role whose completion set holds the entry.
   * @param exerciseId - The (old) exerciseId to remove.
   */
  async function clearExerciseCompletion(role: BlockRole, exerciseId: number): Promise<void> {
    const current = completedExercises.value[role] ?? []
    if (!current.includes(exerciseId)) return
    completedExercises.value = {
      ...completedExercises.value,
      [role]: current.filter((id) => id !== exerciseId),
    }
    await store.removeCompletedExercise(session.dayId, role, exerciseId)
  }

  /**
   * Check if a specific exercise is completed
   *
   * @param prescriptionId - Exercise ID to check
   * @returns True if exercise is complete
   */
  function isExerciseComplete(prescriptionId: number): boolean {
    const block = currentBlock.value
    if (!block) return false
    const current = completedExercises.value[block.role] ?? []
    return current.includes(prescriptionId)
  }

  /**
   * Get count of completed exercises in current block
   */
  const completedExerciseCount = computed(() => {
    const block = currentBlock.value
    if (!block) return 0
    return (completedExercises.value[block.role] ?? []).length
  })

  /**
   * Get total exercises in current block
   */
  const totalExerciseCount = computed(() => {
    return currentBlock.value?.exercises.length ?? 0
  })

  // Initialization

  /**
   * Initialize state from persistent storage
   */
  async function initialize(): Promise<void> {
    if (isInitialized.value) return

    const progress = await store.loadProgress(session.dayId)

    currentBlockIndex.value = progress.currentBlockIndex
    completedBlocks.value = [...progress.completedBlocks]
    deuterosChoice.value = progress.deuterosChoice
    completedExercises.value = progress.completedExercises ?? {}

    // Restore elapsed time: if timer was running (startedAt set),
    // compute real elapsed from timestamp instead of stale snapshot
    if (progress.sessionTimerStartedAt) {
      const sinceStart = Math.floor((Date.now() - progress.sessionTimerStartedAt) / 1000)
      accumulatedSeconds = progress.elapsedSeconds + sinceStart
    } else {
      accumulatedSeconds = progress.elapsedSeconds
    }
    elapsedSeconds.value = accumulatedSeconds

    isInitialized.value = true
  }

  /**
   * Clear all progress for this session
   */
  async function clearProgress(): Promise<void> {
    pauseTimer()
    await store.clearProgress(session.dayId)
    currentBlockIndex.value = 0
    selectedExerciseIndex.value = 0
    elapsedSeconds.value = 0
    deuterosChoice.value = null
    completedBlocks.value = []
    completedExercises.value = {}
  }

  /**
   * Cleanup function - call when component unmounts
   * Note: Not using onUnmounted internally because composable may be
   * called from computed() which is outside setup context
   */
  function cleanup(): void {
    pauseTimer() // pauseTimer now persists elapsed + clears startedAt
  }

  return {
    // State
    currentBlockIndex,
    selectedExerciseIndex,
    elapsedSeconds,
    isTimerRunning,
    deuterosChoice,
    completedBlocks,
    isInitialized,
    completedExercises,

    // Computed
    playableBlocks,
    currentBlock,
    currentBlockFormat,
    progress,
    needsDeuterosChoice,
    hasDeuterosBlocks,
    isSessionComplete,
    deuteros1Block,
    deuteros2Block,
    completedExerciseCount,
    totalExerciseCount,

    // Timer control
    startTimer,
    pauseTimer,

    // Block/exercise navigation
    completeBlock,
    completeBlockAuto,
    selectDeuteros,
    selectExercise,

    // Exercise completion
    toggleExerciseComplete,
    clearExerciseCompletion,
    isExerciseComplete,

    // Lifecycle
    initialize,
    clearProgress,
    cleanup,
  }
}
