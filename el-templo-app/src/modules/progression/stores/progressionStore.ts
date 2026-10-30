import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  ProgressionLevel,
  ProgressionStats,
  RpeTrend,
  EvaluationStatus,
  TodaySession,
  TodayPresencial,
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

  /** Today's in-person class (QR check-in), if any — only the session summary uses it */
  const todayPresencial = ref<TodayPresencial | null>(null)

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

  /**
   * Loading state for async operations. Se vuelve a prender en CADA visita
   * (`fetchStats` lo sube siempre): sirve para el spinner de la página, NO para
   * decidir el esqueleto de una card. Para eso está `statsLoaded`.
   */
  const loading = ref(false)

  /**
   * Fase 203 (D-02/D-07): `/progression/stats` respondió al menos una vez
   * (2xx o error). No vuelve a false en un refresco (patrón `planStateLoading`:
   * "cargó una vez"), así la card no vuelve al esqueleto al re-entrar.
   */
  const statsLoaded = ref(false)

  /** Resultado de la última respuesta de stats: true = 2xx, false = falló, null = nunca respondió. */
  const statsOk = ref<boolean | null>(null)

  /** Check-in de hoy respondió al menos una vez (2xx o error). Mismo criterio que `statsLoaded`. */
  const checkInSettled = ref(false)

  /** Resultado de la última respuesta de check-ins: true = 2xx, false = falló, null = nunca respondió. */
  const checkInOk = ref<boolean | null>(null)

  /** Last error message from operations */
  const error = ref<string | null>(null)

  /**
   * Generación de la sesión (fase 203, cierre): sube en `reset()` (logout). Los composables de
   * `/progression/stats` y `/check-ins/today` la capturan al empezar y no escriben nada si cambió:
   * una respuesta tardía del socio anterior nunca marca "respondió" para el nuevo. No es reactiva.
   */
  let generation = 0

  // Computed
  /**
   * Check if member is eligible to request evaluation and has no pending request
   */
  const evaluationEligible = computed(() => {
    if (!evaluation.value) return false
    return evaluation.value.eligible && !evaluation.value.pendingRequest
  })

  /**
   * Stats falló y no hay stats previas: no se sabe si hoy está completada ni
   * el total. Es "no sé", nunca "no" (fase 203 D-07/D-16). Un refresco fallido
   * con stats previas NO es `statsFailed`: se conservan los datos buenos.
   */
  const statsFailed = computed(() => statsOk.value === false && stats.value === null)

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
    todayPresencial.value = response.todayPresencial ?? null
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
   * Marca que `/progression/stats` respondió (fase 203). Llamar SIEMPRE:
   * `true` tras un 2xx, `false` tras un error (fail-open). No toca `stats`.
   */
  function markStatsSettled(ok: boolean) {
    statsLoaded.value = true
    statsOk.value = ok
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
    checkInSettled.value = true
    checkInOk.value = true
  }

  function setCheckInLoading(state: boolean) {
    checkInLoading.value = state
  }

  function setCheckInError(msg: string | null) {
    checkInError.value = msg
    // Solo un error real cuenta como "respondió mal"; limpiar el mensaje (null) no es una respuesta.
    if (msg !== null) {
      checkInSettled.value = true
      checkInOk.value = false
    }
  }

  function setCheckInAnswer(questionType: CheckInQuestionType, answer: CheckInAnswerValue) {
    if (checkInState.value) {
      checkInState.value = {
        ...checkInState.value,
        answers: { ...checkInState.value.answers, [questionType]: answer },
      }
    }
  }

  /** Generación vigente; `isCurrentGeneration(g)` compara contra la capturada al empezar. */
  function currentGeneration(): number {
    return generation
  }

  function reset() {
    generation++
    level.value = null
    stats.value = null
    rpeTrend.value = null
    evaluation.value = null
    todaySession.value = null
    todayPresencial.value = null
    weeklySummary.value = null
    weeklySummaryLoading.value = false
    weeklySummaryError.value = null
    checkInState.value = null
    checkInLoading.value = false
    checkInError.value = null
    loading.value = false
    error.value = null
    statsLoaded.value = false
    statsOk.value = null
    checkInSettled.value = false
    checkInOk.value = null
  }

  return {
    // State
    level,
    stats,
    rpeTrend,
    evaluation,
    todaySession,
    todayPresencial,
    weeklySummary,
    weeklySummaryLoading,
    weeklySummaryError,
    loading,
    error,
    statsLoaded,
    statsOk,
    checkInSettled,
    checkInOk,
    // Computed
    evaluationEligible,
    statsFailed,
    // Actions
    currentGeneration,
    markStatsSettled,
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
