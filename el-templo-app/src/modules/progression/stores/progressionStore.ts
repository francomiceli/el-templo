import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  ProgressionLevel,
  ProgressionStats,
  RpeTrend,
  EvaluationStatus,
  TodaySession,
  ProgressionResponse,
  WeeklySummary,
  TodayCheckInState,
  CheckInQuestionType,
  CheckInAnswerValue,
} from '../types'

/**
 * Pinia store for progression tracking state management
 *
 * Manages member level, training stats, RPE trends, and evaluation status.
 * Uses Composition API pattern for consistency with existing stores.
 */
export const useProgressionStore = defineStore('progression', () => {
  // State
  /** Member's current progression level */
  const level = ref<ProgressionLevel | null>(null)

  /** Training statistics (sessions, days trained, streak) */
  const stats = ref<ProgressionStats | null>(null)

  /** RPE trend data for chart display */
  const rpeTrend = ref<RpeTrend | null>(null)

  /** Evaluation eligibility and request status */
  const evaluation = ref<EvaluationStatus | null>(null)

  /** Today's completed session (if any) */
  const todaySession = ref<TodaySession | null>(null)

  /** Weekly summary data for Tu Dia */
  const weeklySummary = ref<WeeklySummary | null>(null)

  /** Loading state for weekly summary fetch */
  const weeklySummaryLoading = ref(false)

  /** Error state for weekly summary fetch */
  const weeklySummaryError = ref<string | null>(null)

  /** Check-in state (Phase 82) */
  const checkInState = ref<TodayCheckInState | null>(null)
  const checkInLoading = ref(false)
  const checkInError = ref<string | null>(null)

  /** Loading state for async operations */
  const loading = ref(false)

  /** Last error message from operations */
  const error = ref<string | null>(null)

  // Computed
  /**
   * Check if member is eligible to request evaluation and has no pending request
   */
  const evaluationEligible = computed(() => {
    if (!evaluation.value) return false
    return evaluation.value.eligible && !evaluation.value.pendingRequest
  })

  // Actions
  /**
   * Set all progression data from API response
   *
   * @param response - Complete progression data from API
   */
  function setProgressionData(response: ProgressionResponse) {
    level.value = response.level
    stats.value = response.stats
    rpeTrend.value = response.rpeTrend
    evaluation.value = response.evaluation
    todaySession.value = response.todaySession
    error.value = null
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
      }
    }
  }

  /**
   * Set loading state
   *
   * @param state - Loading state value
   */
  function setLoading(state: boolean) {
    loading.value = state
  }

  /**
   * Set error state
   *
   * @param message - Error message or null to clear
   */
  function setError(message: string | null) {
    error.value = message
  }

  /**
   * Set weekly summary data from API response
   */
  function setWeeklySummary(data: WeeklySummary) {
    weeklySummary.value = data
  }

  /**
   * Set weekly summary loading state
   */
  function setWeeklySummaryLoading(state: boolean) {
    weeklySummaryLoading.value = state
  }

  /**
   * Set weekly summary error state
   */
  function setWeeklySummaryError(msg: string | null) {
    weeklySummaryError.value = msg
  }

  /**
   * Reset all state to initial values
   */
  function setCheckInState(data: TodayCheckInState) {
    checkInState.value = data
    checkInError.value = null
  }

  function setCheckInLoading(state: boolean) {
    checkInLoading.value = state
  }

  function setCheckInError(msg: string | null) {
    checkInError.value = msg
  }

  function setCheckInAnswer(questionType: CheckInQuestionType, answer: CheckInAnswerValue) {
    if (checkInState.value) {
      checkInState.value = {
        ...checkInState.value,
        answers: { ...checkInState.value.answers, [questionType]: answer },
      }
    }
  }

  function reset() {
    level.value = null
    stats.value = null
    rpeTrend.value = null
    evaluation.value = null
    todaySession.value = null
    weeklySummary.value = null
    weeklySummaryLoading.value = false
    weeklySummaryError.value = null
    checkInState.value = null
    checkInLoading.value = false
    checkInError.value = null
    loading.value = false
    error.value = null
  }

  return {
    // State
    level,
    stats,
    rpeTrend,
    evaluation,
    todaySession,
    weeklySummary,
    weeklySummaryLoading,
    weeklySummaryError,
    loading,
    error,
    // Computed
    evaluationEligible,
    // Actions
    setProgressionData,
    setEvaluationPending,
    setWeeklySummary,
    setWeeklySummaryLoading,
    setWeeklySummaryError,
    checkInState,
    checkInLoading,
    checkInError,
    setLoading,
    setError,
    setCheckInState,
    setCheckInLoading,
    setCheckInError,
    setCheckInAnswer,
    reset,
  }
})
