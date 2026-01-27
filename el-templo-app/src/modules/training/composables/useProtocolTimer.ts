/**
 * Protocol timer composable for workout timer modes
 *
 * Provides unified timer interface for all protocol types:
 * - EMOM: Countdown from 60s per round, auto-advance rounds
 * - AMRAP: Countdown from duration, user logs rounds
 * - FOR_TIME: Count up from 0, user stops when done
 * - STRAIGHT_SETS: No-op timer (rest between sets only)
 *
 * Uses drift-correcting Date.now() pattern for accuracy.
 * Integrates with useTimerAudio for audio/haptic cues.
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { ProtocolParams, ProtocolType } from '../utils/timerFormats';
import type { useTimerAudio } from './useTimerAudio';

export interface ProtocolTimerReturn {
  // Display state
  displayText: ComputedRef<string>;
  secondsRemaining: Ref<number>;
  secondsElapsed: Ref<number>;
  currentRound: Ref<number>;
  totalRounds: Ref<number>;
  progress: ComputedRef<number>;

  // State
  isRunning: Ref<boolean>;
  isStopped: Ref<boolean>;
  isComplete: ComputedRef<boolean>;
  timerColorClass: ComputedRef<string>;

  // Controls
  start: () => void;
  stop: () => void;
  resume: () => void;

  // Lifecycle
  cleanup: () => void;

  // Events
  onComplete: (callback: () => void) => void;
}

/**
 * Create protocol timer for workout blocks
 *
 * @param params - Protocol parameters from getProtocolParams()
 * @param audio - Optional audio composable for cues
 * @returns Reactive timer state and controls
 *
 * @example
 * const audio = useTimerAudio();
 * const params = getProtocolParams(block);
 * const timer = useProtocolTimer(params, audio);
 *
 * // Start timer on user interaction
 * audio.unlockAudio();
 * timer.start();
 */
export function useProtocolTimer(
  params: ProtocolParams,
  audio?: ReturnType<typeof useTimerAudio>
): ProtocolTimerReturn {
  // Core state
  const secondsRemaining = ref(0);
  const secondsElapsed = ref(0);
  const currentRound = ref(1);
  const totalRounds = ref(params.rounds ?? 0);
  const isRunning = ref(false);
  const isStopped = ref(false);

  // Timer internals
  let anchorTime = 0;
  let accumulatedMs = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let completeCallback: (() => void) | null = null;
  let lastWarningSeconds = -1; // Track last warning to avoid duplicates

  // Initialize based on protocol type
  function initializeTimerState(): void {
    switch (params.type) {
      case 'EMOM':
        secondsRemaining.value = params.intervalSeconds;
        totalRounds.value = params.rounds ?? 10;
        currentRound.value = 1;
        break;

      case 'AMRAP':
        secondsRemaining.value = (params.durationMinutes ?? 10) * 60;
        break;

      case 'FOR_TIME':
        secondsElapsed.value = 0;
        break;

      case 'STRAIGHT_SETS':
        // No-op timer
        break;
    }
  }

  // Initialize on creation
  initializeTimerState();

  // Computed: Display text
  const displayText = computed(() => {
    if (params.type === 'STRAIGHT_SETS') {
      return '';
    }

    if (params.type === 'EMOM') {
      const mins = Math.floor(secondsRemaining.value / 60);
      const secs = secondsRemaining.value % 60;
      return `${currentRound.value}/${totalRounds.value} — ${mins}:${secs.toString().padStart(2, '0')}`;
    }

    if (params.type === 'FOR_TIME') {
      const mins = Math.floor(secondsElapsed.value / 60);
      const secs = secondsElapsed.value % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    // AMRAP
    const mins = Math.floor(secondsRemaining.value / 60);
    const secs = secondsRemaining.value % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  });

  // Computed: Progress (0-1)
  const progress = computed(() => {
    if (params.type === 'EMOM') {
      return currentRound.value / totalRounds.value;
    }

    if (params.type === 'AMRAP') {
      const totalSeconds = (params.durationMinutes ?? 10) * 60;
      return (totalSeconds - secondsRemaining.value) / totalSeconds;
    }

    if (params.type === 'FOR_TIME') {
      // Count-up has no predetermined end, return 0
      return 0;
    }

    // STRAIGHT_SETS
    return 0;
  });

  // Computed: Timer color class
  const timerColorClass = computed(() => {
    if (params.type === 'FOR_TIME' || params.type === 'STRAIGHT_SETS') {
      return 'text-grey-8';
    }

    // EMOM and AMRAP use countdown warnings
    if (secondsRemaining.value <= 5) {
      return 'text-red';
    }
    if (secondsRemaining.value <= 10) {
      return 'text-amber';
    }
    return 'text-grey-8';
  });

  // Computed: Is complete
  const isComplete = computed(() => {
    if (params.type === 'EMOM') {
      return currentRound.value > totalRounds.value;
    }

    if (params.type === 'AMRAP') {
      return secondsRemaining.value <= 0;
    }

    // FOR_TIME and STRAIGHT_SETS never auto-complete
    return false;
  });

  // Timer tick function (drift-correcting)
  function tick(): void {
    if (!isRunning.value) return;

    const totalElapsed = accumulatedMs + (Date.now() - anchorTime);
    const elapsedSeconds = Math.floor(totalElapsed / 1000);

    if (params.type === 'EMOM') {
      // Calculate which round we're in
      const roundNumber = Math.floor(elapsedSeconds / params.intervalSeconds) + 1;
      const elapsedInRound = elapsedSeconds % params.intervalSeconds;

      // Update display
      secondsRemaining.value = params.intervalSeconds - elapsedInRound;

      // Check for round transition
      if (roundNumber > currentRound.value) {
        currentRound.value = roundNumber;
        audio?.playBeep();
        lastWarningSeconds = -1; // Reset warning tracker for new round

        // Check if we've completed all rounds
        if (currentRound.value > totalRounds.value) {
          handleCompletion();
          return;
        }
      }

      // Check for warning at 5s remaining
      if (secondsRemaining.value === 5 && lastWarningSeconds !== 5) {
        audio?.playWarning();
        lastWarningSeconds = 5;
      }
    } else if (params.type === 'AMRAP') {
      const totalSeconds = (params.durationMinutes ?? 10) * 60;
      secondsRemaining.value = Math.max(0, totalSeconds - elapsedSeconds);

      // Check for warning at 10s and 5s remaining
      if (secondsRemaining.value === 10 && lastWarningSeconds !== 10) {
        audio?.playWarning();
        lastWarningSeconds = 10;
      } else if (secondsRemaining.value === 5 && lastWarningSeconds !== 5) {
        audio?.playWarning();
        lastWarningSeconds = 5;
      }

      // Check for completion
      if (secondsRemaining.value <= 0) {
        handleCompletion();
        return;
      }
    } else if (params.type === 'FOR_TIME') {
      secondsElapsed.value = elapsedSeconds;
    }

    // Schedule next tick (100ms for smooth display)
    timeoutId = setTimeout(tick, 100);
  }

  // Handle timer completion
  function handleCompletion(): void {
    stop();
    audio?.playComplete();
    if (completeCallback) {
      completeCallback();
    }
  }

  // Start timer
  function start(): void {
    if (params.type === 'STRAIGHT_SETS') return; // No-op
    if (isRunning.value) return; // Already running

    isRunning.value = true;
    isStopped.value = false;
    anchorTime = Date.now();
    lastWarningSeconds = -1; // Reset warning tracker
    tick();
  }

  // Stop timer
  function stop(): void {
    if (params.type === 'STRAIGHT_SETS') return; // No-op
    if (!isRunning.value) return; // Not running

    isRunning.value = false;
    isStopped.value = true;
    accumulatedMs += Date.now() - anchorTime;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  // Resume timer
  function resume(): void {
    if (params.type === 'STRAIGHT_SETS') return; // No-op
    if (isRunning.value) return; // Already running
    if (!isStopped.value) return; // Was never stopped

    isRunning.value = true;
    isStopped.value = false;
    anchorTime = Date.now();
    tick();
  }

  // Cleanup
  function cleanup(): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    isRunning.value = false;
  }

  // Register completion callback
  function onComplete(callback: () => void): void {
    completeCallback = callback;
  }

  return {
    // Display state
    displayText,
    secondsRemaining,
    secondsElapsed,
    currentRound,
    totalRounds,
    progress,

    // State
    isRunning,
    isStopped,
    isComplete,
    timerColorClass,

    // Controls
    start,
    stop,
    resume,

    // Lifecycle
    cleanup,

    // Events
    onComplete,
  };
}
