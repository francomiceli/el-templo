import { ref, computed, watch } from 'vue';
import { useSessionPlayerStore } from '../stores/sessionPlayerStore';
import type { Session, Block, BlockRole } from '../types/session';

/**
 * Playable block flow after Deuteros choice
 *
 * The session has 5 blocks total, but the user only completes 4:
 * - INITIUM (warmup)
 * - NUCLEUS (main work)
 * - One of DEUTEROS_1 or DEUTEROS_2 (user's choice)
 * - ATHLOS_EPIKOS (challenge)
 */
export interface SessionPlayerState {
  /** Current block index in the playable blocks array (0-3) */
  currentBlockIndex: number;
  /** Currently selected exercise index within the current block */
  selectedExerciseIndex: number;
  /** Total elapsed time in seconds */
  elapsedSeconds: number;
  /** Whether the timer is currently running */
  isTimerRunning: boolean;
  /** Whether the Deuteros choice has been made */
  hasDeuterosChoice: boolean;
  /** The chosen Deuteros block role */
  deuterosChoice: 'DEUTEROS_1' | 'DEUTEROS_2' | null;
  /** Array of completed block roles */
  completedBlocks: BlockRole[];
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
  const store = useSessionPlayerStore();

  // Core state
  const currentBlockIndex = ref(0);
  const selectedExerciseIndex = ref(0);
  const elapsedSeconds = ref(0);
  const isTimerRunning = ref(false);
  const deuterosChoice = ref<'DEUTEROS_1' | 'DEUTEROS_2' | null>(null);
  const completedBlocks = ref<BlockRole[]>([]);
  const isInitialized = ref(false);

  // Timer interval reference
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Get the 4 playable blocks based on Deuteros choice
   *
   * Before choice: Returns INITIUM, NUCLEUS only (user must choose Deuteros)
   * After choice: Returns INITIUM, NUCLEUS, chosen DEUTEROS, ATHLOS_EPIKOS
   */
  const playableBlocks = computed<Block[]>(() => {
    const blocks = session.blocks;

    // Find blocks by role
    const initium = blocks.find(b => b.role === 'INITIUM');
    const nucleus = blocks.find(b => b.role === 'NUCLEUS');
    const deuteros1 = blocks.find(b => b.role === 'DEUTEROS_1');
    const deuteros2 = blocks.find(b => b.role === 'DEUTEROS_2');
    const athlos = blocks.find(b => b.role === 'ATHLOS_EPIKOS');

    // Build playable sequence
    const result: Block[] = [];

    if (initium) result.push(initium);
    if (nucleus) result.push(nucleus);

    // Add chosen Deuteros (or none if not yet chosen)
    if (deuterosChoice.value === 'DEUTEROS_1' && deuteros1) {
      result.push(deuteros1);
    } else if (deuterosChoice.value === 'DEUTEROS_2' && deuteros2) {
      result.push(deuteros2);
    }

    // Add Athlos only if Deuteros is chosen
    if (deuterosChoice.value && athlos) {
      result.push(athlos);
    }

    return result;
  });

  /**
   * The current block being played
   */
  const currentBlock = computed<Block | null>(() => {
    return playableBlocks.value[currentBlockIndex.value] ?? null;
  });

  /**
   * Format string of the current block (for protocol timer creation)
   */
  const currentBlockFormat = computed<string | null>(() => {
    return currentBlock.value?.format ?? null;
  });

  /**
   * Progress as fraction (0-1)
   */
  const progress = computed(() => {
    if (!deuterosChoice.value) {
      // Before Deuteros choice, show progress based on 2 blocks
      return currentBlockIndex.value / 2;
    }
    // After choice, show progress based on 4 blocks
    return completedBlocks.value.length / 4;
  });

  /**
   * Whether we're at the Deuteros choice point
   */
  const needsDeuterosChoice = computed(() => {
    return !deuterosChoice.value && currentBlockIndex.value >= 2;
  });

  /**
   * Whether the session is complete
   */
  const isSessionComplete = computed(() => {
    return completedBlocks.value.length >= 4;
  });

  /**
   * Get DEUTEROS_1 block for choice display
   */
  const deuteros1Block = computed(() => {
    return session.blocks.find(b => b.role === 'DEUTEROS_1') ?? null;
  });

  /**
   * Get DEUTEROS_2 block for choice display
   */
  const deuteros2Block = computed(() => {
    return session.blocks.find(b => b.role === 'DEUTEROS_2') ?? null;
  });

  // Timer management

  /**
   * Start the session timer
   */
  function startTimer(): void {
    if (timerInterval) return; // Already running

    isTimerRunning.value = true;
    timerInterval = setInterval(() => {
      elapsedSeconds.value++;
    }, 1000);
  }

  /**
   * Pause the session timer
   */
  function pauseTimer(): void {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isTimerRunning.value = false;
  }

  // State persistence

  /**
   * Save current timer state to persistent storage
   */
  async function persistTimerState(): Promise<void> {
    await store.saveElapsedSeconds(session.dayId, elapsedSeconds.value);
  }

  // Watch elapsed seconds and persist periodically (every 10 seconds)
  watch(elapsedSeconds, async (newValue) => {
    if (newValue % 10 === 0) {
      await persistTimerState();
    }
  });

  // Block completion

  /**
   * Complete the current block and advance to next
   */
  async function completeBlock(): Promise<void> {
    const block = currentBlock.value;
    if (!block) return;

    // Mark block as completed
    if (!completedBlocks.value.includes(block.role)) {
      completedBlocks.value.push(block.role);
      await store.saveCompletedBlock(session.dayId, block.role);
    }

    // Special case: After NUCLEUS, advance to index 2 to trigger Deuteros choice
    // (even though playableBlocks doesn't have a block at index 2 yet)
    if (block.role === 'NUCLEUS' && !deuterosChoice.value) {
      currentBlockIndex.value = 2;
      selectedExerciseIndex.value = 0;
      await store.saveCurrentBlockIndex(session.dayId, currentBlockIndex.value);
      return; // Wait for Deuteros choice
    }

    // Advance to next block
    if (currentBlockIndex.value < playableBlocks.value.length - 1) {
      currentBlockIndex.value++;
      selectedExerciseIndex.value = 0;
      await store.saveCurrentBlockIndex(session.dayId, currentBlockIndex.value);
    }

    // Check if session is complete
    if (isSessionComplete.value) {
      pauseTimer();
      await persistTimerState();
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
    return completeBlock();
  }

  // Deuteros selection

  /**
   * Select which Deuteros block to complete
   *
   * @param choice - The Deuteros block to use
   */
  async function selectDeuteros(
    choice: 'DEUTEROS_1' | 'DEUTEROS_2'
  ): Promise<void> {
    deuterosChoice.value = choice;
    await store.saveDeuterosChoice(session.dayId, choice);
    // currentBlockIndex stays at 2, which now points to the chosen Deuteros
  }

  // Exercise navigation

  /**
   * Select an exercise within the current block
   *
   * @param index - Exercise index to select
   */
  function selectExercise(index: number): void {
    const block = currentBlock.value;
    if (block && index >= 0 && index < block.exercises.length) {
      selectedExerciseIndex.value = index;
    }
  }

  // Initialization

  /**
   * Initialize state from persistent storage
   */
  async function initialize(): Promise<void> {
    if (isInitialized.value) return;

    const progress = await store.loadProgress(session.dayId);

    currentBlockIndex.value = progress.currentBlockIndex;
    completedBlocks.value = [...progress.completedBlocks];
    deuterosChoice.value = progress.deuterosChoice;
    elapsedSeconds.value = progress.elapsedSeconds;

    isInitialized.value = true;
  }

  /**
   * Clear all progress for this session
   */
  async function clearProgress(): Promise<void> {
    pauseTimer();
    await store.clearProgress(session.dayId);
    currentBlockIndex.value = 0;
    selectedExerciseIndex.value = 0;
    elapsedSeconds.value = 0;
    deuterosChoice.value = null;
    completedBlocks.value = [];
  }

  /**
   * Cleanup function - call when component unmounts
   * Note: Not using onUnmounted internally because composable may be
   * called from computed() which is outside setup context
   */
  function cleanup(): void {
    pauseTimer();
    // Persist final state
    void persistTimerState();
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

    // Computed
    playableBlocks,
    currentBlock,
    currentBlockFormat,
    progress,
    needsDeuterosChoice,
    isSessionComplete,
    deuteros1Block,
    deuteros2Block,

    // Timer control
    startTimer,
    pauseTimer,

    // Block/exercise navigation
    completeBlock,
    completeBlockAuto,
    selectDeuteros,
    selectExercise,

    // Lifecycle
    initialize,
    clearProgress,
    cleanup,
  };
}
