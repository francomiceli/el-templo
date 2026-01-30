import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Preferences } from '@capacitor/preferences';
import type { BlockRole } from '../types/session';

/**
 * Session progress state persisted per dayId
 */
export interface SessionProgress {
  /** Current block index in the playable blocks array (0-3 for 4 blocks) */
  currentBlockIndex: number;
  /** Array of block roles that have been completed */
  completedBlocks: BlockRole[];
  /** User's choice between DEUTEROS_1 and DEUTEROS_2 (null until chosen) */
  deuterosChoice: 'DEUTEROS_1' | 'DEUTEROS_2' | null;
  /** Accumulated elapsed seconds (from previous start/pause cycles) */
  elapsedSeconds: number;
  /** Timestamp (Date.now()) when the session timer was last started, null if paused */
  sessionTimerStartedAt: number | null;
}

/** Storage key prefix for session progress */
const STORAGE_PREFIX = 'session_progress_';

/**
 * Pinia store for Session Player state management
 *
 * Manages session playback progress with persistence using @capacitor/preferences.
 * Progress is keyed by dayId (e.g., "W5-lunes-alfa_delta") to support resume
 * functionality across app restarts.
 *
 * Uses Composition API pattern for consistency with weekStore.
 */
export const useSessionPlayerStore = defineStore('sessionPlayer', () => {
  // In-memory cache for quick access to loaded progress
  const progressCache = ref<Map<string, SessionProgress>>(new Map());

  /**
   * Create a fresh progress state with defaults
   */
  function createDefaultProgress(): SessionProgress {
    return {
      currentBlockIndex: 0,
      completedBlocks: [],
      deuterosChoice: null,
      elapsedSeconds: 0,
      sessionTimerStartedAt: null,
    };
  }

  /**
   * Load progress from persistent storage for a given dayId
   *
   * @param dayId - Session identifier (e.g., "W5-lunes-alfa_delta")
   * @returns SessionProgress object (defaults if not found)
   */
  async function loadProgress(dayId: string): Promise<SessionProgress> {
    // Check cache first
    const cached = progressCache.value.get(dayId);
    if (cached) {
      return cached;
    }

    // Load from persistent storage
    const { value } = await Preferences.get({ key: `${STORAGE_PREFIX}${dayId}` });

    if (value) {
      try {
        const progress = JSON.parse(value) as SessionProgress;
        progressCache.value.set(dayId, progress);
        return progress;
      } catch {
        // Invalid JSON, return defaults
        console.warn(`Invalid session progress data for ${dayId}, using defaults`);
      }
    }

    // Return defaults for new sessions
    const defaultProgress = createDefaultProgress();
    progressCache.value.set(dayId, defaultProgress);
    return defaultProgress;
  }

  /**
   * Save progress to persistent storage
   *
   * @param dayId - Session identifier
   * @param data - Partial progress data to merge with existing
   */
  async function saveProgress(
    dayId: string,
    data: Partial<SessionProgress>
  ): Promise<void> {
    // Get current progress (from cache or storage)
    const current = await loadProgress(dayId);

    // Merge with new data
    const updated: SessionProgress = {
      ...current,
      ...data,
    };

    // Update cache
    progressCache.value.set(dayId, updated);

    // Persist to storage
    await Preferences.set({
      key: `${STORAGE_PREFIX}${dayId}`,
      value: JSON.stringify(updated),
    });
  }

  /**
   * Clear progress from storage after session completion
   *
   * @param dayId - Session identifier to clear
   */
  async function clearProgress(dayId: string): Promise<void> {
    // Remove from cache
    progressCache.value.delete(dayId);

    // Remove from persistent storage
    await Preferences.remove({ key: `${STORAGE_PREFIX}${dayId}` });
  }

  // Convenience getters

  /**
   * Get current block index for a session
   *
   * @param dayId - Session identifier
   * @returns Current block index (0-3)
   */
  async function getCurrentBlockIndex(dayId: string): Promise<number> {
    const progress = await loadProgress(dayId);
    return progress.currentBlockIndex;
  }

  /**
   * Get completed blocks for a session
   *
   * @param dayId - Session identifier
   * @returns Array of completed block roles
   */
  async function getCompletedBlocks(dayId: string): Promise<BlockRole[]> {
    const progress = await loadProgress(dayId);
    return progress.completedBlocks;
  }

  /**
   * Get Deuteros choice for a session
   *
   * @param dayId - Session identifier
   * @returns The chosen Deuteros block or null if not yet chosen
   */
  async function getDeuterosChoice(
    dayId: string
  ): Promise<'DEUTEROS_1' | 'DEUTEROS_2' | null> {
    const progress = await loadProgress(dayId);
    return progress.deuterosChoice;
  }

  /**
   * Get elapsed seconds for a session
   *
   * @param dayId - Session identifier
   * @returns Total elapsed seconds
   */
  async function getElapsedSeconds(dayId: string): Promise<number> {
    const progress = await loadProgress(dayId);
    return progress.elapsedSeconds;
  }

  // Convenience setters

  /**
   * Save current block index
   *
   * @param dayId - Session identifier
   * @param index - Block index to save
   */
  async function saveCurrentBlockIndex(dayId: string, index: number): Promise<void> {
    await saveProgress(dayId, { currentBlockIndex: index });
  }

  /**
   * Save a completed block
   *
   * @param dayId - Session identifier
   * @param block - Block role that was completed
   */
  async function saveCompletedBlock(dayId: string, block: BlockRole): Promise<void> {
    const progress = await loadProgress(dayId);
    if (!progress.completedBlocks.includes(block)) {
      await saveProgress(dayId, {
        completedBlocks: [...progress.completedBlocks, block],
      });
    }
  }

  /**
   * Save Deuteros choice
   *
   * @param dayId - Session identifier
   * @param choice - The Deuteros block chosen by the user
   */
  async function saveDeuterosChoice(
    dayId: string,
    choice: 'DEUTEROS_1' | 'DEUTEROS_2'
  ): Promise<void> {
    await saveProgress(dayId, { deuterosChoice: choice });
  }

  /**
   * Save elapsed seconds
   *
   * @param dayId - Session identifier
   * @param seconds - Total elapsed seconds
   */
  async function saveElapsedSeconds(dayId: string, seconds: number): Promise<void> {
    await saveProgress(dayId, { elapsedSeconds: seconds });
  }

  /**
   * Reset store state (for testing or logout)
   */
  function reset(): void {
    progressCache.value.clear();
  }

  return {
    // State (exposed for debugging, not typically used directly)
    progressCache,

    // Core operations
    loadProgress,
    saveProgress,
    clearProgress,

    // Convenience getters
    getCurrentBlockIndex,
    getCompletedBlocks,
    getDeuterosChoice,
    getElapsedSeconds,

    // Convenience setters
    saveCurrentBlockIndex,
    saveCompletedBlock,
    saveDeuterosChoice,
    saveElapsedSeconds,

    // Utilities
    reset,
  };
});
