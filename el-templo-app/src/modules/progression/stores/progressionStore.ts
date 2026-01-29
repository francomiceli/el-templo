import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  ProgressionLevel,
  ProgressionStats,
  RpeTrend,
  EvaluationStatus,
  ProgressionResponse,
} from '../types';

/**
 * Pinia store for progression tracking state management
 *
 * Manages member level, training stats, RPE trends, and evaluation status.
 * Uses Composition API pattern for consistency with existing stores.
 */
export const useProgressionStore = defineStore('progression', () => {
  // State
  /** Member's current progression level */
  const level = ref<ProgressionLevel | null>(null);

  /** Training statistics (sessions, days trained, streak) */
  const stats = ref<ProgressionStats | null>(null);

  /** RPE trend data for chart display */
  const rpeTrend = ref<RpeTrend | null>(null);

  /** Evaluation eligibility and request status */
  const evaluation = ref<EvaluationStatus | null>(null);

  /** Loading state for async operations */
  const loading = ref(false);

  /** Last error message from operations */
  const error = ref<string | null>(null);

  // Computed
  /**
   * Check if member is eligible to request evaluation and has no pending request
   */
  const evaluationEligible = computed(() => {
    if (!evaluation.value) return false;
    return evaluation.value.eligible && !evaluation.value.pendingRequest;
  });

  // Actions
  /**
   * Set all progression data from API response
   *
   * @param response - Complete progression data from API
   */
  function setProgressionData(response: ProgressionResponse) {
    level.value = response.level;
    stats.value = response.stats;
    rpeTrend.value = response.rpeTrend;
    evaluation.value = response.evaluation;
    error.value = null;
  }

  /**
   * Mark evaluation as pending after submission
   *
   * Updates local state optimistically while waiting for API confirmation.
   */
  function setEvaluationPending() {
    if (evaluation.value) {
      evaluation.value = {
        ...evaluation.value,
        pendingRequest: true,
        requestedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Set loading state
   *
   * @param state - Loading state value
   */
  function setLoading(state: boolean) {
    loading.value = state;
  }

  /**
   * Set error state
   *
   * @param message - Error message or null to clear
   */
  function setError(message: string | null) {
    error.value = message;
  }

  /**
   * Reset all state to initial values
   */
  function reset() {
    level.value = null;
    stats.value = null;
    rpeTrend.value = null;
    evaluation.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    // State
    level,
    stats,
    rpeTrend,
    evaluation,
    loading,
    error,
    // Computed
    evaluationEligible,
    // Actions
    setProgressionData,
    setEvaluationPending,
    setLoading,
    setError,
    reset,
  };
});
